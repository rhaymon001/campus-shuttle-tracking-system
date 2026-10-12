<template>
  <div class="page-container">
    <div class="panel-header-label">DAILY RUNNING SCHEDULES</div>

    <section v-if="prebookings.length" class="prebooking-panel">
      <div class="panel-sub-label">YOUR PRE-BOOKINGS</div>
      <div v-for="b in prebookings" :key="b._id" class="prebooking-row">
        <div class="pb-main">
          <span class="pb-route">{{ b.routeName }}</span>
          <span class="pb-path">{{ b.stopName }} → {{ b.destStopName }}</span>
          <span class="pb-time">{{ formatDateTime(b.scheduledFor) }}</span>
        </div>
        <span class="pb-status" :class="b.status">
          {{ b.status === 'confirmed' ? `CODE ${b.confirmationCode}` : 'Awaiting bus' }}
        </span>
      </div>
    </section>

    <div v-if="loading" class="loading-state">Loading timetables...</div>

    <div v-else class="schedules-grid">
      <div v-for="sched in schedules" :key="sched._id" class="schedule-card">
        <div class="schedule-header">
          <span class="route-tag">{{ sched.routeId?.name || 'Unknown route' }}</span>
          <span class="status-indicator" :class="{ 'active-run': sched.isActive }">
            {{ sched.isActive ? 'Operational' : 'Suspended' }}
          </span>
        </div>

        <div class="schedule-body">
          <div class="time-block">
            <span class="time-label">OPERATIONAL WINDOW</span>
            <p class="time-value">{{ sched.startTime }} — {{ sched.endTime }}</p>
          </div>

          <div class="frequency-row">
            <span class="muted">Dispatch Frequency:</span>
            <span class="freq-value">Every {{ sched.estimatedFrequencyMinutes }} mins</span>
          </div>

          <div class="days-pills">
            <span
              v-for="day in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']"
              :key="day"
              class="day-dot"
              :class="{ 'day-active': sched.recurringDays.includes(day) }"
            >
              {{ day }}
            </span>
          </div>

          <button class="reserve-btn" :disabled="!sched.isActive" @click="openReserve(sched)">
            Pre-book a seat
          </button>
        </div>
      </div>
    </div>

    <div v-if="modal.open" class="modal-backdrop" @click.self="closeReserve">
      <div class="modal">
        <div class="modal-title">{{ modal.routeName }}</div>

        <label class="field">
          <span>Travel date</span>
          <input type="date" v-model="form.date" :min="todayStr" />
        </label>

        <label class="field">
          <span>Departure time</span>
          <select v-model="form.time">
            <option disabled value="">Select a time</option>
            <option v-for="t in modal.times" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>

        <label class="field">
          <span>Boarding stop</span>
          <select v-model="form.stopName">
            <option disabled value="">Select a stop</option>
            <option v-for="s in modal.stops" :key="s.name" :value="s.name">{{ s.name }}</option>
          </select>
        </label>

        <label class="field">
          <span>Destination</span>
          <select v-model="form.destStopName">
            <option disabled value="">Select a destination</option>
            <option v-for="s in destinations" :key="s.name" :value="s.name">{{ s.name }}</option>
          </select>
        </label>

        <p v-if="modal.error" class="modal-error">{{ modal.error }}</p>

        <div class="modal-actions">
          <button class="btn-ghost" @click="closeReserve" :disabled="modal.submitting">Cancel</button>
          <button class="btn-primary" @click="submitReserve" :disabled="modal.submitting || !canSubmit">
            {{ modal.submitting ? 'Reserving…' : 'Reserve seat' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import apiClient from '../api/axios';

const schedules = ref([]);
const prebookings = ref([]);
const loading = ref(true);

const modal = ref({ open: false, routeName: '', times: [], stops: [], error: '', submitting: false });
const form = ref({ date: '', time: '', stopName: '', destStopName: '' });

const todayStr = new Date().toISOString().slice(0, 10);

const destinations = computed(() => {
  const stops = modal.value.stops;
  const boarding = stops.find((s) => s.name === form.value.stopName);
  if (!boarding) return [];
  return stops.filter((s) => s.index > boarding.index);
});

const canSubmit = computed(() =>
  form.value.date && form.value.time && form.value.stopName && form.value.destStopName
);

const loadSchedules = async () => {
  const res = await apiClient.get('/transit/schedules');
  schedules.value = res.data;
};

const loadPrebookings = async () => {
  try {
    const res = await apiClient.get('/reservations/scheduled');
    prebookings.value = res.data;
  } catch (err) {
    console.error('Error loading pre-bookings:', err);
  }
};

onMounted(async () => {
  try {
    await Promise.all([loadSchedules(), loadPrebookings()]);
  } catch (err) {
    console.error('Error loading schedules:', err);
  } finally {
    loading.value = false;
  }
});

const buildTimeGrid = (start, end, step) => {
  const grid = [];
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const pad = (n) => String(n).padStart(2, '0');
  const frequency = Number(step) > 0 ? Number(step) : 15;
  for (let m = toMin(start); m <= toMin(end); m += frequency) {
    grid.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  }
  return grid;
};

const openReserve = (sched) => {
  const stops = [...(sched.routeId?.stops || [])].sort((a, b) => a.index - b.index);
  modal.value = {
    open: true,
    routeName: sched.routeId?.name || 'Route',
    times: buildTimeGrid(sched.startTime, sched.endTime, sched.estimatedFrequencyMinutes),
    stops,
    error: '',
    submitting: false
  };
  form.value = { date: todayStr, time: '', stopName: '', destStopName: '' };
  modal.value.slotId = sched._id;
};

const closeReserve = () => {
  if (modal.value.submitting) return;
  modal.value.open = false;
};

const submitReserve = async () => {
  modal.value.error = '';
  modal.value.submitting = true;
  try {
    const scheduledFor = new Date(`${form.value.date}T${form.value.time}:00`).toISOString();
    await apiClient.post('/reservations/schedule', {
      scheduleSlotId: modal.value.slotId,
      stopName: form.value.stopName,
      destStopName: form.value.destStopName,
      scheduledFor
    });
    modal.value.open = false;
    await loadPrebookings();
  } catch (err) {
    modal.value.error = err.response?.data?.message || 'Could not reserve this seat.';
  } finally {
    modal.value.submitting = false;
  }
};

const formatDateTime = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
};
</script>

<style scoped>
.page-container { padding: 4px 0; }
.panel-header-label {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  color: #5F5E5A;
  padding-bottom: 6px;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.1);
  margin-bottom: 16px;
}
.panel-sub-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: #5F5E5A;
  margin-bottom: 8px;
}
.prebooking-panel { margin-bottom: 18px; }
.prebooking-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  background: #FFFFFF;
  border: 0.5px solid rgba(0, 0, 0, 0.10);
  border-left: 3px solid #1D9E75;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
}
.pb-main { display: flex; flex-direction: column; gap: 2px; }
.pb-route { font-size: 12px; font-weight: 600; color: #0D2137; }
.pb-path { font-size: 12px; color: #1A1A18; }
.pb-time { font-size: 11px; color: #5F5E5A; }
.pb-status { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 999px; background: #F4F3EF; color: #5F5E5A; white-space: nowrap; }
.pb-status.confirmed { background: #E1F5EE; color: #0F6E56; }
.loading-state { font-size: 13px; color: #5F5E5A; text-align: center; padding: 40px 0; }
.schedules-grid { display: flex; flex-direction: column; gap: 12px; }
.schedule-card {
  background: #FFFFFF;
  border: 0.5px solid rgba(0, 0, 0, 0.10);
  border-radius: 12px;
  padding: 16px;
}
.schedule-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.route-tag { font-size: 13px; font-weight: 500; color: #0D2137; }
.status-indicator { font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 999px; background: #F4F3EF; color: #5F5E5A; }
.status-indicator.active-run { background: #E1F5EE; color: #0F6E56; }
.schedule-body { display: flex; flex-direction: column; gap: 12px; }
.time-block { background: #F4F3EF; padding: 10px 12px; border-radius: 8px; border-left: 3px solid #1D9E75; }
.time-label { font-size: 10px; font-weight: 500; color: #5F5E5A; display: block; letter-spacing: 0.05em; }
.time-value { font-size: 15px; font-weight: 600; color: #1A1A18; margin: 4px 0 0 0; font-family: monospace; }
.frequency-row { display: flex; justify-content: space-between; font-size: 13px; }
.muted { color: #5F5E5A; }
.freq-value { font-weight: 500; color: #1A1A18; }
.days-pills { display: flex; gap: 4px; margin-top: 4px; }
.day-dot { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #F4F3EF; color: rgba(0,0,0,0.25); }
.day-dot.day-active { background: #0D2137; color: #FFFFFF; }
.reserve-btn {
  margin-top: 4px;
  padding: 9px;
  font-size: 13px;
  font-weight: 600;
  color: #FFFFFF;
  background: #0D2137;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}
.reserve-btn:disabled { background: #C9C8C2; cursor: not-allowed; }
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(13, 33, 55, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 50;
}
.modal {
  width: 100%;
  max-width: 360px;
  background: #FFFFFF;
  border-radius: 14px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.modal-title { font-size: 15px; font-weight: 600; color: #0D2137; }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #5F5E5A; }
.field select, .field input {
  padding: 9px 10px;
  font-size: 13px;
  color: #1A1A18;
  border: 1px solid rgba(0,0,0,0.15);
  border-radius: 8px;
  background: #FFFFFF;
}
.modal-error { font-size: 12px; color: #B42318; margin: 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.btn-ghost, .btn-primary {
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  border: none;
}
.btn-ghost { background: #F4F3EF; color: #1A1A18; }
.btn-primary { background: #1D9E75; color: #FFFFFF; }
.btn-primary:disabled { background: #9BD3C0; cursor: not-allowed; }
</style>
