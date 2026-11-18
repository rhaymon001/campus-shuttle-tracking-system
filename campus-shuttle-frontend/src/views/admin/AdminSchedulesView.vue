<template>
  <div class="admin-page">
    <header class="page-head rise">
      <div>
        <p class="eyebrow">Timetable</p>
        <h1>Schedules</h1>
      </div>
      <span class="chip chip-muted"><i></i><RollNumber :value="slots.length" />&nbsp;slots</span>
    </header>

    <section class="panel rise" style="--i:1">
      <div class="panel-title"><Plus :size="18" /><h2>Create a schedule slot</h2></div>
      <div class="form-grid">
        <label class="field">
          <span>Route</span>
          <select v-model="form.routeId" class="select">
            <option value="">Select a route</option>
            <option v-for="route in routes" :key="route._id" :value="route._id">{{ route.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>Scheduling type</span>
          <select v-model="form.schedulingType" class="select">
            <option value="continuous">Continuous</option>
            <option value="fixed">Fixed</option>
          </select>
        </label>
        <label class="field"><span>Start time</span><input v-model="form.startTime" class="input mono" type="time" /></label>
        <label class="field"><span>End time</span><input v-model="form.endTime" class="input mono" type="time" /></label>
        <label v-if="form.schedulingType === 'fixed'" class="field"><span>Departure time</span><input v-model="form.departureTime" class="input mono" type="time" /></label>
        <label class="field"><span>Dispatch frequency (minutes)</span><input v-model.number="form.estimatedFrequencyMinutes" class="input" type="number" min="5" step="5" /></label>
      </div>

      <div class="days">
        <p class="eyebrow">Recurring days</p>
        <div class="day-list">
          <label v-for="day in dayOptions" :key="day.value" class="day-chip">
            <input v-model="form.recurringDays" type="checkbox" :value="day.value" />
            <span>{{ day.label }}</span>
          </label>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn" :disabled="!canSubmit || saving" @click="createSlot">
          <Loader2 v-if="saving" :size="16" class="spin" />{{ saving ? 'Saving…' : 'Create schedule slot' }}
        </button>
      </div>
    </section>

    <section class="panel rise" style="--i:2">
      <div class="panel-title"><CalendarClock :size="18" /><h2>Current schedules</h2></div>

      <div v-if="loading" class="skeleton"></div>
      <div v-else-if="slots.length === 0" class="empty"><CalendarClock :size="22" /><p>No schedule slots created yet.</p></div>

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Route</th><th>Days</th><th>Window</th><th>Type</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr v-for="slot in slots" :key="slot._id">
              <td data-label="Route" class="strong">{{ slot.routeId?.name || 'Unknown route' }}</td>
              <td data-label="Days" class="mono days-cell">{{ formatDays(slot.recurringDays) }}</td>
              <td data-label="Window" class="mono">{{ slot.startTime }} – {{ slot.endTime }}<small v-if="slot.schedulingType === 'fixed'" class="dep"> · dep {{ slot.departureTime }}</small></td>
              <td data-label="Type" style="text-transform: capitalize">{{ slot.schedulingType }}</td>
              <td data-label="Status"><span class="chip" :class="slot.isActive ? 'chip-ok' : 'chip-muted'"><i></i>{{ slot.isActive ? 'active' : 'inactive' }}</span></td>
              <td class="actions">
                <div class="row-actions">
                  <button class="btn btn-ghost btn-sm" :disabled="toggleingId === slot._id" @click="toggleSlot(slot)">{{ slot.isActive ? 'Disable' : 'Enable' }}</button>
                  <button class="btn btn-danger btn-sm" :disabled="deletingId === slot._id" @click="deleteSlot(slot)">{{ deletingId === slot._id ? 'Deleting…' : 'Delete' }}</button>
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
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { Plus, CalendarClock, Loader2 } from 'lucide-vue-next';
import RollNumber from '../../components/RollNumber.vue';
import { useToast } from '../../composables/useToast';
import { useConfirm } from '../../composables/useConfirm';
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
    toast.error(err.response?.data?.message || 'Failed to update schedule status.');
  } finally {
    toggleingId.value = null;
  }
};

const deleteSlot = async (slot) => {
  const ok = await askConfirm({
    title: 'Delete this schedule slot?',
    message: `${slot.routeId?.name || 'This route'}, ${slot.startTime} to ${slot.endTime}. Students will no longer see it.`,
    confirmLabel: 'Delete',
    danger: true
  });
  if (!ok) return;
  deletingId.value = slot._id;
  try {
    await apiClient.delete(`/transit/schedules/${slot._id}`);
    await fetchSlots();
  } catch (err) {
    toast.error(err.response?.data?.message || 'Failed to delete schedule slot.');
  } finally {
    deletingId.value = null;
  }
};

const formatDays = (days = []) => (days || []).map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(' · ') || '—';

onMounted(async () => {
  await Promise.all([fetchRoutes(), fetchSlots(true)]);
});

// Form errors and confirmations appear at the top of the page as toasts, not inside the card
const toast = useToast();
watch(formError, (message) => { if (message) toast.error(message); });
watch(formSuccess, (message) => { if (message) toast.success(message); });
const { ask: askConfirm } = useConfirm();
</script>

<style scoped>
.days { display: flex; flex-direction: column; gap: 10px; }
.day-list { display: flex; flex-wrap: wrap; gap: 8px; }
.day-chip { position: relative; cursor: pointer; }
.day-chip input { position: absolute; opacity: 0; inset: 0; cursor: pointer; }
.day-chip span { display: block; min-width: 52px; text-align: center; padding: 10px 14px; border-radius: 10px; border: 1.5px solid var(--line); background: var(--bg); font: 500 13px var(--font-mono); color: var(--muted); transition: background var(--t-fast), color var(--t-fast), border-color var(--t-fast), transform var(--t-fast) var(--ease); }
.day-chip:hover span { border-color: var(--brand); }
.day-chip input:checked + span { background: var(--brand); border-color: var(--brand); color: var(--on-brand); }
.day-chip input:active + span { transform: scale(.95); }
.day-chip input:focus-visible + span { outline: 3px solid var(--signal); outline-offset: 2px; }
.days-cell { font-size: 12px; }
.dep { color: var(--muted); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
