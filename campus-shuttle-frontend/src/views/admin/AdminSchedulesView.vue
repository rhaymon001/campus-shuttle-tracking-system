<template>
  <div class="admin-page">
    <section class="panel-card">
      <div class="panel-header-label">CREATE SCHEDULE SLOT</div>

      <div v-if="formError" class="alert-banner danger-alert">{{ formError }}</div>
      <div v-if="formSuccess" class="alert-banner success-alert">{{ formSuccess }}</div>

      <div class="form-grid">
        <div class="form-group">
          <label>Route</label>
          <select v-model="form.routeId" class="text-input">
            <option value="">Select a route</option>
            <option v-for="route in routes" :key="route._id" :value="route._id">
              {{ route.name }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>Scheduling Type</label>
          <select v-model="form.schedulingType" class="text-input">
            <option value="continuous">Continuous</option>
            <option value="fixed">Fixed</option>
          </select>
        </div>

        <div class="form-group">
          <label>Start Time</label>
          <input v-model="form.startTime" type="time" class="text-input" />
        </div>

        <div class="form-group">
          <label>End Time</label>
          <input v-model="form.endTime" type="time" class="text-input" />
        </div>

        <div v-if="form.schedulingType === 'fixed'" class="form-group">
          <label>Departure Time</label>
          <input v-model="form.departureTime" type="time" class="text-input" />
        </div>

        <div class="form-group">
          <label>Dispatch Frequency (minutes)</label>
          <input v-model.number="form.estimatedFrequencyMinutes" type="number" min="5" step="5" class="text-input" />
        </div>
      </div>

      <div class="days-wrap">
        <label class="days-label">Recurring Days</label>
        <div class="day-list">
          <label v-for="day in dayOptions" :key="day.value" class="day-chip">
            <input v-model="form.recurringDays" type="checkbox" :value="day.value" />
            <span>{{ day.label }}</span>
          </label>
        </div>
      </div>

      <button class="btn btn-primary" :disabled="!canSubmit || saving" @click="createSlot">
        {{ saving ? 'Saving...' : 'Create Schedule Slot' }}
      </button>
    </section>

    <section class="panel-card">
      <div class="panel-header-label">CURRENT SCHEDULES</div>

      <div v-if="loading" class="loading-state">Loading schedules...</div>
      <div v-else-if="slots.length === 0" class="empty-state">No schedule slots created yet.</div>

      <div v-else class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Route</th>
              <th>Days</th>
              <th>Window</th>
              <th>Type</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="slot in slots" :key="slot._id">
              <td>{{ slot.routeId?.name || 'Unknown route' }}</td>
              <td>{{ formatDays(slot.recurringDays) }}</td>
              <td>
                <div>{{ slot.startTime }} – {{ slot.endTime }}</div>
                <small v-if="slot.schedulingType === 'fixed'">{{ slot.departureTime }}</small>
              </td>
              <td>{{ slot.schedulingType }}</td>
              <td>
                <span class="badge" :class="slot.isActive ? 'badge-active' : 'badge-off'">
                  {{ slot.isActive ? 'active' : 'inactive' }}
                </span>
              </td>
              <td>
                <div class="table-actions">
                  <button class="btn btn-outline btn-tiny" :disabled="toggleingId === slot._id" @click="toggleSlot(slot)">
                    {{ slot.isActive ? 'Disable' : 'Enable' }}
                  </button>
                  <button class="btn btn-danger btn-tiny" :disabled="deletingId === slot._id" @click="deleteSlot(slot)">
                    {{ deletingId === slot._id ? 'Deleting...' : 'Delete' }}
                  </button>
                </div>
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

const routes = ref([]);
const slots = ref([]);
const loading = ref(true);
const saving = ref(false);
const toggleingId = ref(null);
const deletingId = ref(null);
const formError = ref('');
const formSuccess = ref('');

const dayOptions = [
  { label: 'Mon', value: 'mon' },
  { label: 'Tue', value: 'tue' },
  { label: 'Wed', value: 'wed' },
  { label: 'Thu', value: 'thu' },
  { label: 'Fri', value: 'fri' },
  { label: 'Sat', value: 'sat' },
  { label: 'Sun', value: 'sun' }
];

const form = reactive({
  routeId: '',
  schedulingType: 'continuous',
  recurringDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
  startTime: '06:00',
  endTime: '21:00',
  departureTime: '08:00',
  estimatedFrequencyMinutes: 15
});

const canSubmit = computed(() => {
  if (!form.routeId || !form.startTime || !form.endTime || form.recurringDays.length === 0) return false;
  if (form.schedulingType === 'fixed' && !form.departureTime) return false;
  return true;
});

const fetchRoutes = async () => {
  try {
    const res = await apiClient.get('/transit/routes');
    routes.value = res.data;
  } catch (err) {
    console.error('Failed to fetch routes:', err);
  }
};

const fetchSlots = async (isFirstLoad = false) => {
  if (isFirstLoad) loading.value = true;
  try {
    const res = await apiClient.get('/transit/schedules/admin?includeInactive=true');
    slots.value = res.data;
  } catch (err) {
    console.error('Failed to fetch schedules:', err);
  } finally {
    if (isFirstLoad) loading.value = false;
  }
};

const createSlot = async () => {
  formError.value = '';
  formSuccess.value = '';
  saving.value = true;

  try {
    await apiClient.post('/transit/schedules', {
      routeId: form.routeId,
      recurringDays: form.recurringDays,
      schedulingType: form.schedulingType,
      startTime: form.startTime,
      endTime: form.endTime,
      departureTime: form.schedulingType === 'fixed' ? form.departureTime : null,
      estimatedFrequencyMinutes: Number(form.estimatedFrequencyMinutes) || 15
    });

    formSuccess.value = 'Schedule slot created successfully.';
    form.routeId = '';
    form.schedulingType = 'continuous';
    form.recurringDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    form.startTime = '06:00';
    form.endTime = '21:00';
    form.departureTime = '08:00';
    form.estimatedFrequencyMinutes = 15;

    await fetchSlots();
  } catch (err) {
    formError.value = err.response?.data?.message || 'Failed to create schedule slot.';
  } finally {
    saving.value = false;
  }
};

const toggleSlot = async (slot) => {
  toggleingId.value = slot._id;
  try {
    await apiClient.patch(`/transit/schedules/${slot._id}`, {
      isActive: !slot.isActive
    });
    await fetchSlots();
  } catch (err) {
    alert(err.response?.data?.message || 'Failed to update schedule status.');
  } finally {
    toggleingId.value = null;
  }
};

const deleteSlot = async (slot) => {
  if (!confirm(`Delete the schedule slot for ${slot.routeId?.name || 'this route'}?`)) return;
  deletingId.value = slot._id;
  try {
    await apiClient.delete(`/transit/schedules/${slot._id}`);
    await fetchSlots();
  } catch (err) {
    alert(err.response?.data?.message || 'Failed to delete schedule slot.');
  } finally {
    deletingId.value = null;
  }
};

const formatDays = (days = []) => (days || []).map((d) => d.toUpperCase()).join(', ') || '—';

onMounted(async () => {
  await Promise.all([fetchRoutes(), fetchSlots(true)]);
});
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
.days-wrap { margin-bottom: 16px; }
.days-label { display: block; font-size: 12px; font-weight: 500; text-transform: uppercase; color: #5F5E5A; margin-bottom: 8px; }
.day-list { display: flex; flex-wrap: wrap; gap: 8px; }
.day-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 0.5px solid rgba(0,0,0,0.15); border-radius: 999px; background: #F4F3EF; font-size: 12px; }
.day-chip input { accent-color: #1D9E75; }
.alert-banner { font-size: 13px; padding: 10px 12px; border-radius: 8px; margin-bottom: 12px; }
.danger-alert { background: #FDECEC; color: #D9383A; }
.success-alert { background: #E1F5EE; color: #0F6E56; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 40px; border-radius: 8px; border: none; font-size: 13px; font-weight: 500; cursor: pointer; padding: 0 16px; }
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.btn-primary { background: #1D9E75; color: #FFFFFF; }
.btn-outline { background: transparent; border: 0.5px solid rgba(0, 0, 0, 0.2); color: #0D2137; }
.btn-danger { background: #D9383A; color: #FFFFFF; }
.btn-tiny { height: 28px; padding: 0 10px; font-size: 12px; }
.table-scroll { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { text-align: left; font-size: 11px; text-transform: uppercase; color: #5F5E5A; font-weight: 500; padding: 8px 10px; border-bottom: 0.5px solid rgba(0, 0, 0, 0.1); white-space: nowrap; }
.data-table td { padding: 10px; border-bottom: 0.5px solid rgba(0, 0, 0, 0.06); color: #1A1A18; white-space: nowrap; }
.table-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.badge { font-size: 11px; font-weight: 500; padding: 2px 10px; border-radius: 999px; text-transform: capitalize; }
.badge-active { background: #E1F5EE; color: #0F6E56; }
.badge-off { background: #F4F3EF; color: #5F5E5A; }
@media (min-width: 768px) {
  .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
