<template>
  <div class="admin-page">
    <header class="page-head rise">
      <div>
        <p class="eyebrow">Fleet</p>
        <h1>Vehicles</h1>
      </div>
      <span class="chip chip-muted"><i></i><RollNumber :value="shuttles.length" />&nbsp;registered</span>
    </header>

    <section class="panel rise" style="--i:1">
      <div class="panel-title"><Plus :size="18" /><h2>Register a vehicle</h2></div>
      <div class="form-grid">
        <label class="field"><span>Plate number</span><input v-model="form.plateNumber" class="input mono" placeholder="e.g. ABU-SHL-04" /></label>
        <label class="field"><span>Model</span><input v-model="form.model" class="input" placeholder="e.g. Toyota Coaster" /></label>
        <label class="field"><span>Capacity (seats)</span><input v-model.number="form.capacity" class="input" type="number" min="1" placeholder="32" /></label>
      </div>
      <div class="form-actions">
        <button class="btn" :disabled="!form.plateNumber.trim() || saving" @click="registerShuttle">
          <Loader2 v-if="saving" :size="16" class="spin" />{{ saving ? 'Registering…' : 'Register shuttle' }}
        </button>
      </div>
    </section>

    <section class="panel rise" style="--i:2">
      <div class="panel-title"><Bus :size="18" /><h2>Fleet catalog</h2></div>

      <div v-if="loading" class="skeleton"></div>
      <div v-else-if="shuttles.length === 0" class="empty"><Bus :size="22" /><p>No vehicles registered yet.</p></div>

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Plate</th><th>Model</th><th>Capacity</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr v-for="s in shuttles" :key="s._id">
              <td data-label="Plate" class="mono strong">{{ s.plateNumber || '—' }}</td>
              <td data-label="Model">{{ s.model || '—' }}</td>
              <td data-label="Capacity" class="tnum">{{ s.capacity }}</td>
              <td data-label="Status"><span class="chip" :class="s.status === 'active' ? 'chip-ok' : 'chip-warn'"><i></i>{{ s.status }}</span></td>
              <td class="actions">
                <button class="btn btn-ghost btn-sm" :disabled="togglingId === s._id" @click="toggleStatus(s)">
                  {{ s.status === 'active' ? 'Send to maintenance' : 'Return to service' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue';
import { Plus, Bus, Loader2 } from 'lucide-vue-next';
import RollNumber from '../../components/RollNumber.vue';
import { useToast } from '../../composables/useToast';
import apiClient from '../../api/axios';

const shuttles = ref([]);
const loading = ref(true);
const saving = ref(false);
const togglingId = ref(null);
const formError = ref('');
const formSuccess = ref('');

const form = reactive({ plateNumber: '', model: '', capacity: 32 });

const fetchShuttles = async (isFirstLoad = false) => {
  if (isFirstLoad) loading.value = true;
  try {
    const res = await apiClient.get('/shuttles');
    shuttles.value = res.data;
  } catch (err) {
    console.error('Failed to fetch fleet:', err);
  } finally {
    if (isFirstLoad) loading.value = false;
  }
};

const registerShuttle = async () => {
  formError.value = '';
  formSuccess.value = '';
  saving.value = true;
  try {
    await apiClient.post('/shuttles', {
      plateNumber: form.plateNumber.trim(),
      model: form.model.trim(),
      capacity: form.capacity || 32
    });
    formSuccess.value = `Shuttle ${form.plateNumber.trim()} registered successfully.`;
    form.plateNumber = '';
    form.model = '';
    form.capacity = 32;
    await fetchShuttles();
  } catch (err) {
    formError.value = err.response?.data?.message || 'Failed to register shuttle.';
  } finally {
    saving.value = false;
  }
};

const toggleStatus = async (shuttle) => {
  togglingId.value = shuttle._id;
  try {
    const nextStatus = shuttle.status === 'active' ? 'maintenance' : 'active';
    await apiClient.patch(`/shuttles/${shuttle._id}/status`, { status: nextStatus });
    await fetchShuttles();
  } catch (err) {
    toast.error(err.response?.data?.message || 'Failed to update shuttle status.');
  } finally {
    togglingId.value = null;
  }
};

onMounted(() => fetchShuttles(true));

// Form errors and confirmations appear at the top of the page as toasts, not inside the card
const toast = useToast();
watch(formError, (message) => { if (message) toast.error(message); });
watch(formSuccess, (message) => { if (message) toast.success(message); });
</script>

<style scoped>
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
