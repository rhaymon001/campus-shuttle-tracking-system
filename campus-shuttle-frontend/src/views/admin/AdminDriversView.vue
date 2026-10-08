<template>
  <div class="admin-page">
    <!-- Onboard a new driver -->
    <section class="panel-card">
      <div class="panel-header-label">ONBOARD NEW DRIVER</div>

      <div v-if="formError" class="alert-banner danger-alert">{{ formError }}</div>
      <div v-if="formSuccess" class="alert-banner success-alert">{{ formSuccess }}</div>

      <div class="form-grid">
        <div class="form-group">
          <label>Full Name</label>
          <input v-model="form.name" placeholder="e.g. Malam Ibrahim Sani" class="text-input" />
        </div>
        <div class="form-group">
          <label>Email Address</label>
          <input v-model="form.email" type="email" placeholder="driver@abu.edu.ng" class="text-input" />
        </div>
        <div class="form-group">
          <label>Temporary Password</label>
          <input v-model="form.password" type="text" placeholder="Min 6 characters" class="text-input" />
        </div>
        <div class="form-group">
          <label>License Number</label>
          <input v-model="form.licenseNumber" placeholder="e.g. KD-DRV-88231" class="text-input" />
        </div>
        <div class="form-group">
          <label>Phone Number</label>
          <input v-model="form.phoneNumber" placeholder="e.g. 080X XXX XXXX" class="text-input" />
        </div>
      </div>

      <button class="btn btn-primary" :disabled="!canSubmit || saving" @click="onboardDriver">
        {{ saving ? 'Provisioning...' : 'Onboard Driver' }}
      </button>
    </section>

    <!-- Driver roster -->
    <section class="panel-card">
      <div class="panel-header-label">DRIVER ROSTER</div>

      <div v-if="loading" class="loading-state">Loading driver roster...</div>
      <div v-else-if="drivers.length === 0" class="empty-state">No drivers onboarded yet.</div>

      <div v-else class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>License</th>
              <th>Phone</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in drivers" :key="d._id">
              <td>{{ d.userId?.name || '—' }}</td>
              <td>{{ d.userId?.email || '—' }}</td>
              <td class="mono-cell">{{ d.licenseNumber }}</td>
              <td>{{ d.phoneNumber || '—' }}</td>
              <td>
                <span class="badge" :class="statusBadgeClass(d.status)">{{ formatStatus(d.status) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import apiClient from '../../api/axios';

const drivers = ref([]);
const loading = ref(true);
const saving = ref(false);
const formError = ref('');
const formSuccess = ref('');

const form = reactive({ name: '', email: '', password: '', licenseNumber: '', phoneNumber: '' });

const canSubmit = computed(() =>
  form.name.trim() && form.email.trim() && form.password.length >= 6 && form.licenseNumber.trim()
);

const fetchDrivers = async (isFirstLoad = false) => {
  if (isFirstLoad) loading.value = true;
  try {
    const res = await apiClient.get('/admin/drivers');
    drivers.value = res.data;
  } catch (err) {
    console.error('Failed to fetch drivers:', err);
  } finally {
    if (isFirstLoad) loading.value = false;
  }
};

const onboardDriver = async () => {
  formError.value = '';
  formSuccess.value = '';
  saving.value = true;
  try {
    const res = await apiClient.post('/admin/drivers', {
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      licenseNumber: form.licenseNumber.trim(),
      phoneNumber: form.phoneNumber.trim()
    });
    formSuccess.value = res.data.message || 'Driver onboarded successfully.';
    Object.assign(form, { name: '', email: '', password: '', licenseNumber: '', phoneNumber: '' });
    await fetchDrivers();
  } catch (err) {
    formError.value = err.response?.data?.message || 'Failed to onboard driver.';
  } finally {
    saving.value = false;
  }
};

const formatStatus = (status) => (status || 'off_duty').replace('_', ' ');
const statusBadgeClass = (status) => {
  if (status === 'on_trip') return 'badge-active';
  if (status === 'available') return 'badge-available';
  return 'badge-off';
};

onMounted(() => fetchDrivers(true));
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

.badge { font-size: 11px; font-weight: 500; padding: 2px 10px; border-radius: 999px; text-transform: capitalize; }
.badge-active { background: #E1F5EE; color: #0F6E56; }
.badge-available { background: #E8F1FB; color: #2563A8; }
.badge-off { background: #F4F3EF; color: #5F5E5A; }

.table-scroll { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { text-align: left; font-size: 11px; text-transform: uppercase; color: #5F5E5A; font-weight: 500; padding: 8px 10px; border-bottom: 0.5px solid rgba(0, 0, 0, 0.1); white-space: nowrap; }
.data-table td { padding: 10px; border-bottom: 0.5px solid rgba(0, 0, 0, 0.06); color: #1A1A18; white-space: nowrap; }
.mono-cell { font-family: monospace; letter-spacing: 0.05em; }

@media (min-width: 768px) {
  .form-grid { display: grid; grid-template-columns: repeat(2, 1fr); }
}
</style>
