<template>
  <div class="admin-page">
    <!-- Create a new route -->
    <section class="panel-card">
      <div class="panel-header-label">DEFINE NEW TRANSIT ROUTE</div>

      <div v-if="formError" class="alert-banner danger-alert">{{ formError }}</div>
      <div v-if="formSuccess" class="alert-banner success-alert">{{ formSuccess }}</div>

      <div class="form-grid">
        <div class="form-group">
          <label>Route Name</label>
          <input v-model="form.name" placeholder="e.g. Main Gate ⇄ Faculty of Engineering" class="text-input" />
        </div>
        <div class="form-group">
          <label>Direction</label>
          <input v-model="form.direction" placeholder="e.g. circular / return" class="text-input" />
        </div>
        <div class="form-group">
          <label>Distance</label>
          <input v-model="form.distance" placeholder="e.g. 12.5 km" class="text-input" />
        </div>
      </div>

      <div class="stops-section">
        <div class="stops-header">
          <label class="stops-label">Ordered Stops ({{ form.stops.length }})</label>
          <button class="btn btn-outline btn-tiny" @click="addStop">
            <Plus :size="12" class="icon-spacing" /> Add Stop
          </button>
        </div>

        <div v-for="(stop, i) in form.stops" :key="i" class="stop-row">
          <span class="stop-index">{{ i + 1 }}</span>
          <input v-model="stop.name" placeholder="Stop name" class="text-input stop-name" />
          <input v-model.number="stop.lat" type="number" step="any" placeholder="Latitude" class="text-input stop-coord" />
          <input v-model.number="stop.lng" type="number" step="any" placeholder="Longitude" class="text-input stop-coord" />
          <button class="remove-stop-btn" :disabled="form.stops.length <= 2" @click="form.stops.splice(i, 1)">
            <Trash2 :size="14" />
          </button>
        </div>
      </div>

      <button class="btn btn-primary" :disabled="!canSubmit || saving" @click="createRoute">
        {{ saving ? 'Saving...' : 'Create Route' }}
      </button>
    </section>

    <!-- Existing routes -->
    <section class="panel-card">
      <div class="panel-header-label">CAMPUS ROUTE NETWORK</div>

      <div v-if="loading" class="loading-state">Loading route network...</div>
      <div v-else-if="routes.length === 0" class="empty-state">No routes defined yet.</div>

      <div v-else class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Direction</th>
              <th>Distance</th>
              <th>Stops</th>
              <th>Active Buses</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in routes" :key="r._id">
              <td>{{ r.name }}</td>
              <td>{{ r.direction }}</td>
              <td>{{ r.distance || '—' }}</td>
              <td>{{ r.stops?.length || 0 }}</td>
              <td>{{ r.activeBuses || 0 }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { Plus, Trash2 } from 'lucide-vue-next';
import apiClient from '../../api/axios';

const routes = ref([]);
const loading = ref(true);
const saving = ref(false);
const formError = ref('');
const formSuccess = ref('');

const blankStop = () => ({ name: '', lat: null, lng: null });

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
</script>

<style scoped>
.admin-page { display: flex; flex-direction: column; gap: 16px; }
.panel-card { background: #FFFFFF; border: 0.5px solid rgba(0, 0, 0, 0.10); border-radius: 12px; padding: 16px; box-sizing: border-box; }
.panel-header-label { font-size: 11px; font-weight: 500; text-transform: uppercase; color: #5F5E5A; padding-bottom: 6px; border-bottom: 0.5px solid rgba(0, 0, 0, 0.1); margin-bottom: 12px; }
.loading-state { font-size: 13px; color: #5F5E5A; text-align: center; padding: 24px 0; font-style: italic; }
.empty-state { font-size: 13px; color: #5F5E5A; text-align: center; padding: 24px 0; }

.form-grid { display: flex; flex-direction: column; gap: 12px; margin-bottom: 14px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 12px; font-weight: 500; text-transform: uppercase; color: #5F5E5A; }
.text-input { height: 38px; border: 0.5px solid rgba(0, 0, 0, 0.2); border-radius: 8px; padding: 0 12px; font-size: 13px; background: #F4F3EF; color: #1A1A18; box-sizing: border-box; min-width: 0; }

.stops-section { margin-bottom: 16px; }
.stops-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.stops-label { font-size: 12px; font-weight: 500; text-transform: uppercase; color: #5F5E5A; }
.stop-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.stop-index { width: 22px; height: 22px; border-radius: 999px; background: #E1F5EE; color: #0F6E56; font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.stop-name { flex: 2; }
.stop-coord { flex: 1; }
.remove-stop-btn { background: transparent; border: none; color: #D9383A; cursor: pointer; display: flex; padding: 4px; flex-shrink: 0; }
.remove-stop-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.alert-banner { font-size: 13px; padding: 10px 12px; border-radius: 8px; margin-bottom: 12px; }
.danger-alert { background: #FDECEC; color: #D9383A; }
.success-alert { background: #E1F5EE; color: #0F6E56; }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 40px; border-radius: 8px; border: none; font-size: 13px; font-weight: 500; cursor: pointer; padding: 0 16px; }
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.btn-primary { background: #1D9E75; color: #FFFFFF; }
.btn-outline { background: transparent; border: 0.5px solid rgba(0, 0, 0, 0.2); color: #0D2137; }
.btn-tiny { height: 28px; padding: 0 10px; font-size: 12px; }
.icon-spacing { margin-right: 2px; }

.table-scroll { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { text-align: left; font-size: 11px; text-transform: uppercase; color: #5F5E5A; font-weight: 500; padding: 8px 10px; border-bottom: 0.5px solid rgba(0, 0, 0, 0.1); white-space: nowrap; }
.data-table td { padding: 10px; border-bottom: 0.5px solid rgba(0, 0, 0, 0.06); color: #1A1A18; }

@media (min-width: 768px) {
  .form-grid { display: grid; grid-template-columns: 2fr 1fr 1fr; }
}
</style>
