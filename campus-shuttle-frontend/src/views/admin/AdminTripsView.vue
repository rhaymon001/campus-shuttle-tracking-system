<template>
  <div class="admin-page">
    <header class="page-head rise">
      <div>
        <p class="eyebrow">Operations</p>
        <h1>Active trips</h1>
      </div>
      <span class="chip chip-live"><i></i><RollNumber :value="trips.length" />&nbsp;running</span>
    </header>

    <section class="panel rise" style="--i:1">
      <div class="panel-title"><Megaphone :size="18" /><h2>Emergency broadcast</h2></div>
      <p class="muted">Shows an alert banner to every student and driver who is connected right now.</p>
      <div class="broadcast-row">
        <input v-model="broadcastMessage" class="input" placeholder="e.g. Route A suspended due to convocation traffic" aria-label="Broadcast message" @keyup.enter="sendBroadcast" />
        <button class="btn" :disabled="!broadcastMessage.trim()" @click="sendBroadcast"><Megaphone :size="15" /> Send</button>
      </div>
    </section>

    <section class="panel rise" style="--i:2">
      <div class="panel-title"><Activity :size="18" /><h2>Live monitor</h2></div>

      <div v-if="loading" class="skeleton"></div>
      <div v-else-if="trips.length === 0" class="empty"><Activity :size="22" /><p>No active trips are running right now.</p></div>

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Vehicle</th><th>Route</th><th>Driver</th><th>Occupancy</th><th>Started</th><th></th></tr>
          </thead>
          <TransitionGroup name="row" tag="tbody">
            <tr v-for="trip in trips" :key="trip._id">
              <td data-label="Vehicle" class="mono strong">{{ trip.shuttleId?.plateNumber || '—' }}</td>
              <td data-label="Route">{{ trip.routeId?.name || '—' }}</td>
              <td data-label="Driver">{{ trip.driverId?.name || '—' }}</td>
              <td data-label="Occupancy">
                <span class="occ">
                  <span class="tnum">{{ trip.seatsCurrentOccupancy }}/{{ trip.seatsTotal }}</span>
                  <span class="mini-bar" :class="occClass(trip)"><span :style="{ width: occPct(trip) + '%' }"></span></span>
                </span>
              </td>
              <td data-label="Started" class="tnum">{{ formatTime(trip.startedAt) }}</td>
              <td class="actions">
                <button class="btn btn-danger btn-sm" :disabled="endingId === trip._id" @click="forceEnd(trip)">
                  {{ endingId === trip._id ? 'Ending…' : 'Force end' }}
                </button>
              </td>
            </tr>
          </TransitionGroup>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { Megaphone, Activity } from 'lucide-vue-next';
import RollNumber from '../../components/RollNumber.vue';
import { useToast } from '../../composables/useToast';
import { useConfirm } from '../../composables/useConfirm';
import apiClient from '../../api/axios';
import { useShuttleSocket } from '../../composables/useShuttleSocket';

const { socket, on } = useShuttleSocket();

const trips = ref([]);
const loading = ref(true);
const endingId = ref(null);
const broadcastMessage = ref('');
const broadcastFeedback = ref('');
let refreshPoll = null;

const fetchTrips = async (isFirstLoad = false) => {
  if (isFirstLoad) loading.value = true;
  try {
    const res = await apiClient.get('/trips');
    trips.value = res.data;
  } catch (err) {
    console.error('Failed to fetch active trips:', err);
  } finally {
    if (isFirstLoad) loading.value = false;
  }
};

const forceEnd = async (trip) => {
  const ok = await askConfirm({
    title: `Force-end ${trip.shuttleId?.plateNumber || 'this trip'}?`,
    message: 'The driver will be released and the shuttle will disappear from every live map.',
    confirmLabel: 'Force end',
    danger: true
  });
  if (!ok) return;
  endingId.value = trip._id;
  try {
    await apiClient.patch(`/trips/${trip._id}/force-end`);
    await fetchTrips();
  } catch (err) {
    toast.error(err.response?.data?.message || 'Failed to force-end trip.');
  } finally {
    endingId.value = null;
  }
};

const sendBroadcast = () => {
  const message = broadcastMessage.value.trim();
  if (!message) return;
  socket.emit('admin:broadcast', { message });
  broadcastFeedback.value = 'Alert broadcast to all connected clients.';
  broadcastMessage.value = '';
  setTimeout(() => { broadcastFeedback.value = ''; }, 4000);
};

const formatTime = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

onMounted(() => {
  fetchTrips(true);
  on('trip:started', () => fetchTrips());
  on('trip:ended', () => fetchTrips());
  refreshPoll = setInterval(fetchTrips, 15000);
});

onUnmounted(() => {
  if (refreshPoll) clearInterval(refreshPoll);
});

const toast = useToast();
const { ask: askConfirm } = useConfirm();
watch(broadcastFeedback, (message) => { if (message) toast.success(message); });

const occPct = (trip) => Math.min(100, Math.round(((trip.seatsCurrentOccupancy || 0) / (trip.seatsTotal || 1)) * 100));
const occClass = (trip) => (occPct(trip) >= 85 ? 'full' : occPct(trip) >= 60 ? 'warn' : '');
</script>

<style scoped>
.broadcast-row { display: flex; gap: 10px; }
.broadcast-row .input { flex: 1; min-width: 0; }
@media (max-width: 519px) { .broadcast-row { flex-direction: column; } }
.row-enter-active { transition: opacity .35s var(--ease), transform .35s var(--ease); }
.row-leave-active { transition: opacity .2s ease; }
.row-enter-from { opacity: 0; transform: translateY(8px); }
.row-leave-to { opacity: 0; }
</style>
