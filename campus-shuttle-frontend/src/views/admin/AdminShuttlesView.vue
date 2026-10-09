<template>
  <div class="admin-page">
    <!-- Register a new shuttle -->
    <section class="panel-card">
      <div class="panel-header-label">REGISTER FLEET VEHICLE</div>

      <div v-if="formError" class="alert-banner danger-alert">{{ formError }}</div>
      <div v-if="formSuccess" class="alert-banner success-alert">{{ formSuccess }}</div>

      <div class="form-grid">
        <div class="form-group">
          <label>Plate Number</label>
          <input v-model="form.plateNumber" placeholder="e.g. ABU-SHL-04" class="text-input" />
        </div>
        <div class="form-group">
          <label>Model</label>
          <input v-model="form.model" placeholder="e.g. Toyota Coaster" class="text-input" />
        </div>
        <div class="form-group">
          <label>Capacity (seats)</label>
          <input v-model.number="form.capacity" type="number" min="1" placeholder="32" class="text-input" />
        </div>
      </div>

      <button class="btn btn-primary" :disabled="!form.plateNumber.trim() || saving" @click="registerShuttle">
        {{ saving ? 'Registering...' : 'Register Shuttle' }}
      </button>
    </section>

    <!-- Fleet catalog -->
    <section class="panel-card">
      <div class="panel-header-label">FLEET CATALOG</div>

      <div v-if="loading" class="loading-state">Loading fleet catalog...</div>
      <div v-else-if="shuttles.length === 0" class="empty-state">No vehicles registered yet.</div>

      <div v-else class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Plate</th>
              <th>Model</th>
              <th>Capacity</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in shuttles" :key="s._id">
              <td class="mono-cell">{{ s.plateNumber || '—' }}</td>
              <td>{{ s.model || '—' }}</td>
              <td>{{ s.capacity }}</td>
              <td>
                <span class="badge" :class="s.status === 'active' ? 'badge-active' : 'badge-maintenance'">
                  {{ s.status }}
                </span>
              </td>
              <td>
                <button class="btn btn-outline btn-tiny" :disabled="togglingId === s._id" @click="toggleStatus(s)">
                  {{ s.status === 'active' ? 'Send to Maintenance' : 'Return to Service' }}
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
import { ref, reactive, onMounted } from 'vue';
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
    alert(err.response?.data?.message || 'Failed to update shuttle status.');
  } finally {
    togglingId.value = null;
  }
};

onMounted(() => fetchShuttles(true));
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
.text-input { height: 38px; border: 0.5px solid rgba(0, 0, 0, 0.2); border-radius: 8px; padding: 0 12px; font-size: 13px; background: #F4F3EF; color: #1A1A18; box-sizing: border-box; }

.alert-banner { font-size: 13px; padding: 10px 12px; border-radius: 8px; margin-bottom: 12px; }
.danger-alert { background: #FDECEC; color: #D9383A; }
.success-alert { background: #E1F5EE; color: #0F6E56; }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 40px; border-radius: 8px; border: none; font-size: 13px; font-weight: 500; cursor: pointer; padding: 0 16px; }
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.btn-primary { background: #1D9E75; color: #FFFFFF; }
.btn-outline { background: transparent; border: 0.5px solid rgba(0, 0, 0, 0.2); color: #0D2137; }
.btn-tiny { height: 28px; padding: 0 10px; font-size: 12px; }

.badge { font-size: 11px; font-weight: 500; padding: 2px 10px; border-radius: 999px; text-transform: capitalize; }
.badge-active { background: #E1F5EE; color: #0F6E56; }
.badge-maintenance { background: #FFF9E6; color: #BA7517; }

.table-scroll { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { text-align: left; font-size: 11px; text-transform: uppercase; color: #5F5E5A; font-weight: 500; padding: 8px 10px; border-bottom: 0.5px solid rgba(0, 0, 0, 0.1); white-space: nowrap; }
.data-table td { padding: 10px; border-bottom: 0.5px solid rgba(0, 0, 0, 0.06); color: #1A1A18; white-space: nowrap; }
.mono-cell { font-family: monospace; font-weight: 600; letter-spacing: 0.1em; color: #1D9E75; }

@media (min-width: 768px) {
  .form-grid { display: grid; grid-template-columns: repeat(3, 1fr); }
}
</style>
