<template>
  <div class="page">
    <header class="page-head rise">
      <p class="eyebrow">Timetable</p>
      <h1>Schedules</h1>
      <p class="lede">Daily running windows for every route. Pre-book a seat on a departure you know you’ll need.</p>
    </header>

    <section v-if="prebookings.length" class="prebooking-panel rise" style="--i:1">
      <p class="eyebrow">Your pre-bookings</p>
      <div class="pb-list">
        <div v-for="b in prebookings" :key="b._id" class="prebooking-row">
          <div class="pb-main">
            <span class="pb-time">{{ formatDateTime(b.scheduledFor) }}</span>
            <span class="pb-route">{{ b.routeName }}</span>
            <span class="pb-path">{{ b.stopName }} <ArrowRight :size="13" /> {{ b.destStopName }}</span>
          </div>
          <span class="pb-status" :class="b.status">
            {{ b.status === 'confirmed' ? `CODE ${b.confirmationCode}` : 'Awaiting bus' }}
          </span>
        </div>
      </div>
    </section>

    <div v-if="loading" class="schedules-grid"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>

    <div v-else class="schedules-grid">
      <article v-for="(sched, i) in schedules" :key="sched._id" class="schedule-card rise" :style="{ '--i': i + 2 }">
        <header class="schedule-header">
          <span class="route-tag">{{ sched.routeId?.name || 'Unknown route' }}</span>
          <span class="chip" :class="sched.isActive ? 'chip-ok' : 'chip-muted'"><i></i>{{ sched.isActive ? 'Operational' : 'Suspended' }}</span>
        </header>

        <div class="time-block">
          <span class="eyebrow">Operational window</span>
          <p class="time-value tnum">{{ sched.startTime }}<span class="to">to</span>{{ sched.endTime }}</p>
        </div>

        <div class="frequency-row">
          <span class="muted">Dispatch frequency</span>
          <span class="freq-value">Every {{ sched.estimatedFrequencyMinutes }} min</span>
        </div>

        <div class="days-pills">
          <span
            v-for="day in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']"
            :key="day"
            class="day-dot"
            :class="{ 'day-active': sched.recurringDays.includes(day.toLowerCase()) }"
          >{{ day }}</span>
        </div>

        <button class="btn reserve-btn" :disabled="!sched.isActive" @click="openReserve(sched)">
          <CalendarPlus :size="16" /> Pre-book a seat
        </button>
      </article>
    </div>

    <Transition name="modal">
      <div v-if="modal.open" class="modal-backdrop" @click.self="closeReserve">
        <div class="modal" role="dialog" aria-modal="true" :aria-label="`Pre-book ${modal.routeName}`">
          <header class="modal-head">
            <div>
              <p class="eyebrow">Pre-book a seat</p>
              <h2 class="modal-title">{{ modal.routeName }}</h2>
            </div>
            <button class="icon-btn" aria-label="Close" @click="closeReserve"><X :size="18" /></button>
          </header>

          <label class="field"><span>Travel date</span><input class="input" type="date" v-model="form.date" :min="todayStr" /></label>

          <label class="field">
            <span>Departure time</span>
            <select class="select" v-model="form.time">
              <option disabled value="">Select a time</option>
              <option v-for="t in modal.times" :key="t" :value="t">{{ t }}</option>
            </select>
          </label>

          <label class="field">
            <span>Boarding stop</span>
            <select class="select" v-model="form.stopName">
              <option disabled value="">Select a stop</option>
              <option v-for="s in modal.stops" :key="s.name" :value="s.name">{{ s.name }}</option>
            </select>
          </label>

          <label class="field">
            <span>Destination</span>
            <select class="select" v-model="form.destStopName">
              <option disabled value="">Select a destination</option>
              <option v-for="s in destinations" :key="s.name" :value="s.name">{{ s.name }}</option>
            </select>
          </label>

          <div class="modal-actions">
            <button class="btn btn-ghost" @click="closeReserve" :disabled="modal.submitting">Cancel</button>
            <button class="btn" @click="submitReserve" :disabled="modal.submitting || !canSubmit">
              {{ modal.submitting ? 'Reserving…' : 'Reserve seat' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useToast } from '../composables/useToast';
import { ArrowRight, CalendarPlus, X } from 'lucide-vue-next';
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

// Pre-booking errors surface as a toast at the top of the page (above the open modal)
const toast = useToast();
watch(() => modal.value.error, (message) => {
  if (message) { toast.error(message); modal.value.error = ''; }
});
</script>

<style scoped>
.page { max-width: 1200px; margin: 0 auto; padding: 28px 16px 24px; }
.page-head { margin-bottom: 24px; }
.page-head h1 { font-size: clamp(36px, 6vw, 56px); font-weight: 700; letter-spacing: -.04em; margin: 10px 0 8px; }
.lede { color: var(--muted); max-width: 52ch; }

.prebooking-panel { margin-bottom: 28px; }
.pb-list { display: grid; gap: 10px; margin-top: 12px; grid-template-columns: minmax(0, 1fr); }
.prebooking-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; background: var(--surface); border: 1px solid var(--line); border-left: 4px solid var(--signal); border-radius: var(--r-md); padding: 12px 14px; }
.pb-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.pb-time { font: 500 13px var(--font-mono); }
.pb-route { font-weight: 700; font-size: 14px; }
.pb-path { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); flex-wrap: wrap; }
.pb-status { font: 500 11px var(--font-mono); letter-spacing: .04em; padding: 6px 10px; border-radius: 99px; background: var(--surface-2); color: var(--muted); white-space: nowrap; }
.pb-status.confirmed { background: var(--brand); color: var(--on-brand); }

.schedules-grid { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); }
.skeleton { height: 250px; border-radius: var(--r-lg); background: linear-gradient(100deg, var(--surface) 30%, var(--surface-2) 50%, var(--surface) 70%) 0 0 / 200% 100%; animation: shimmer 1.4s linear infinite; }
@keyframes shimmer { to { background-position: -200% 0; } }

.schedule-card { min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); padding: 20px; display: flex; flex-direction: column; gap: 16px; transition: border-color var(--t-fast), transform var(--t-med) var(--ease); }
.schedule-card:hover { border-color: var(--brand); transform: translateY(-2px); }
.schedule-header { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.route-tag { font: 700 17px var(--font-display); letter-spacing: -.02em; }
.time-block { background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-md); padding: 14px 16px; }
.time-value { margin: 8px 0 0; font: 500 28px/1 var(--font-mono); letter-spacing: -.01em; }
.time-value .to { font: 500 12px var(--font-body); color: var(--muted); margin: 0 12px; text-transform: uppercase; letter-spacing: .08em; }
.frequency-row { display: flex; justify-content: space-between; font-size: 14px; }
.muted { color: var(--muted); }
.freq-value { font-weight: 700; }
.days-pills { display: flex; gap: 6px; }
.day-dot { flex: 1; text-align: center; font: 500 11px var(--font-mono); padding: 7px 0; border-radius: 8px; background: var(--surface-2); color: var(--stale); transition: background var(--t-fast), color var(--t-fast); }
.day-dot.day-active { background: var(--brand); color: var(--on-brand); }
.reserve-btn { margin-top: auto; width: 100%; }

.modal-backdrop { position: fixed; inset: 0; z-index: 500; background: rgb(8 16 11 / .5); display: flex; align-items: flex-end; justify-content: center; }
.modal { width: 100%; max-width: 440px; max-height: 92dvh; overflow-y: auto; background: var(--bg); border-radius: 22px 22px 0 0; padding: 22px 20px calc(24px + var(--safe-b)); display: flex; flex-direction: column; gap: 14px; box-shadow: var(--shadow-2); }
.modal-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.modal-title { font-size: 26px; margin-top: 8px; letter-spacing: -.03em; }
.icon-btn { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 10px; border: 0; background: var(--surface); }
.icon-btn:hover { background: var(--surface-2); }
.modal-error { font-size: 13px; color: var(--live); background: var(--danger-bg); padding: 10px 12px; border-radius: 10px; margin: 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
.modal-enter-active, .modal-leave-active { transition: opacity .2s ease; }
.modal-enter-active .modal, .modal-leave-active .modal { transition: transform .32s var(--ease); }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal, .modal-leave-to .modal { transform: translateY(40px); }

@media (min-width: 720px) {
  .page { padding: 40px 32px 48px; }
  .pb-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .schedules-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .modal-backdrop { align-items: center; padding: 16px; }
  .modal { border-radius: var(--r-lg); padding: 24px; }
  .modal-enter-from .modal, .modal-leave-to .modal { transform: translateY(16px) scale(.97); }
}
@media (min-width: 1100px) { .schedules-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
