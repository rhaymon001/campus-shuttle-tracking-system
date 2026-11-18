<template>
  <div class="admin-page">
    <header class="page-head rise">
      <div>
        <p class="eyebrow">Network</p>
        <h1>Routes</h1>
      </div>
      <span class="chip chip-muted"><i></i><RollNumber :value="routes.length" />&nbsp;defined</span>
    </header>

    <section class="panel rise" style="--i:1">
      <div class="panel-title"><Plus :size="18" /><h2>Define a transit route</h2></div>
      <div class="form-grid">
        <label class="field"><span>Route name</span><input v-model="form.name" class="input" placeholder="e.g. Main Gate ⇄ Faculty of Engineering" /></label>
        <label class="field"><span>Direction</span><input v-model="form.direction" class="input" placeholder="e.g. circular / return" /></label>
        <label class="field"><span>Distance</span><input v-model="form.distance" class="input" placeholder="e.g. 12.5 km" /></label>
      </div>

      <div class="stops">
        <div class="stops-head">
          <p class="eyebrow">Ordered stops ({{ form.stops.length }})</p>
          <button class="btn btn-ghost btn-sm" @click="addStop"><Plus :size="14" /> Add stop</button>
        </div>

        <TransitionGroup name="stop" tag="div" class="stop-list">
          <div v-for="(stop, i) in form.stops" :key="stop._k" class="stop-row">
            <span class="stop-index">{{ i + 1 }}</span>
            <input v-model="stop.name" class="input stop-name" placeholder="Stop name" aria-label="Stop name" />
            <input v-model.number="stop.lat" class="input stop-coord" type="number" step="any" placeholder="Latitude" aria-label="Latitude" />
            <input v-model.number="stop.lng" class="input stop-coord" type="number" step="any" placeholder="Longitude" aria-label="Longitude" />
            <button class="remove" :disabled="form.stops.length <= 2" aria-label="Remove stop" @click="form.stops.splice(i, 1)"><Trash2 :size="16" /></button>
          </div>
        </TransitionGroup>
      </div>

      <div class="form-actions">
        <button class="btn" :disabled="!canSubmit || saving" @click="createRoute">
          <Loader2 v-if="saving" :size="16" class="spin" />{{ saving ? 'Saving…' : 'Create route' }}
        </button>
      </div>
    </section>

    <section class="panel rise" style="--i:2">
      <div class="panel-title"><Route :size="18" /><h2>Campus route network</h2></div>

      <div v-if="loading" class="skeleton"></div>
      <div v-else-if="routes.length === 0" class="empty"><Route :size="22" /><p>No routes defined yet.</p></div>

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Direction</th><th>Distance</th><th>Stops</th><th>Active buses</th></tr></thead>
          <tbody>
            <tr v-for="r in routes" :key="r._id">
              <td data-label="Name" class="strong">{{ r.name }}</td>
              <td data-label="Direction">{{ r.direction }}</td>
              <td data-label="Distance" class="tnum">{{ r.distance || '—' }}</td>
              <td data-label="Stops" class="tnum">{{ r.stops?.length || 0 }}</td>
              <td data-label="Active buses"><span v-if="r.activeBuses" class="chip chip-live"><i></i>{{ r.activeBuses }}</span><span v-else class="muted">0</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { Plus, Trash2, Route, Loader2 } from 'lucide-vue-next';
import RollNumber from '../../components/RollNumber.vue';
import { useToast } from '../../composables/useToast';
import apiClient from '../../api/axios';

const routes = ref([]);
const loading = ref(true);
const saving = ref(false);
const formError = ref('');
const formSuccess = ref('');

let stopKey = 0; // stable key per stop row so rows animate correctly when added/removed
const blankStop = () => ({ name: '', lat: null, lng: null, _k: ++stopKey });

const form = reactive({
  name: '',
  direction: '',
  distance: '',
  stops: [blankStop(), blankStop()]
});

const canSubmit = computed(() =>
  form.name.trim() &&
  form.direction.trim() &&
  form.distance.trim() &&
  form.stops.length >= 2 &&
  form.stops.every((s) => s.name.trim() && typeof s.lat === 'number' && typeof s.lng === 'number')
);

const addStop = () => form.stops.push(blankStop());

const fetchRoutes = async (isFirstLoad = false) => {
  if (isFirstLoad) loading.value = true;
  try {
    const res = await apiClient.get('/transit/routes');
    routes.value = res.data;
  } catch (err) {
    console.error('Failed to fetch routes:', err);
  } finally {
    if (isFirstLoad) loading.value = false;
  }
};

const createRoute = async () => {
  formError.value = '';
  formSuccess.value = '';
  saving.value = true;
  try {
    await apiClient.post('/transit/routes', {
      name: form.name.trim(),
      direction: form.direction.trim(),
      distance: form.distance.trim(),
      // Index assigned from array position — backend re-sorts defensively
      stops: form.stops.map((s, idx) => ({ index: idx, name: s.name.trim(), lat: s.lat, lng: s.lng }))
    });
    formSuccess.value = `Route "${form.name.trim()}" created successfully.`;
    form.name = '';
    form.direction = '';
    form.distance = '';
    form.stops = [blankStop(), blankStop()];
    await fetchRoutes();
  } catch (err) {
    formError.value = err.response?.data?.message || 'Failed to create route.';
  } finally {
    saving.value = false;
  }
};

onMounted(() => fetchRoutes(true));

// Form errors and confirmations appear at the top of the page as toasts, not inside the card
const toast = useToast();
watch(formError, (message) => { if (message) toast.error(message); });
watch(formSuccess, (message) => { if (message) toast.success(message); });
</script>

<style scoped>
.stops { display: flex; flex-direction: column; gap: 12px; }
.stops-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.stop-list { display: flex; flex-direction: column; gap: 10px; position: relative; }
.stop-row { display: grid; grid-template-columns: 30px minmax(0, 1fr) 36px; gap: 8px; align-items: center; }
.stop-index { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: var(--brand); color: var(--on-brand); font: 500 12px var(--font-mono); }
.stop-name { grid-column: 2 / 3; }
.stop-coord { grid-column: 2 / 3; }
.remove { grid-column: 3; grid-row: 1; width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: 10px; background: none; color: var(--muted); transition: background var(--t-fast), color var(--t-fast); }
.remove:hover:not(:disabled) { background: var(--danger-bg); color: var(--live); }
.remove:disabled { opacity: .3; cursor: not-allowed; }
@media (min-width: 720px) {
  .stop-row { grid-template-columns: 30px minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) 36px; }
  .stop-name, .stop-coord { grid-column: auto; }
  .remove { grid-column: auto; grid-row: auto; }
}
.stop-enter-active { transition: opacity .3s var(--ease), transform .3s var(--ease); }
.stop-leave-active { transition: opacity .2s ease, transform .2s ease; position: absolute; left: 0; right: 0; }
.stop-enter-from { opacity: 0; transform: translateY(-8px); }
.stop-leave-to { opacity: 0; transform: translateX(16px); }
.stop-move { transition: transform .3s var(--ease); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
