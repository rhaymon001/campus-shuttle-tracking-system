<template>
  <div class="admin-page">
    <!-- Emergency broadcast -->
    <section class="panel-card">
      <div class="panel-header-label">EMERGENCY BROADCAST</div>
      <div class="broadcast-row">
        <input
          v-model="broadcastMessage"
          placeholder="e.g. Route A suspended due to convocation traffic"
          class="text-input"
          @keyup.enter="sendBroadcast"
        />
        <button class="btn btn-primary btn-compact" :disabled="!broadcastMessage.trim()" @click="sendBroadcast">
          <Megaphone :size="14" class="icon-spacing" /> Send
        </button>
      </div>
      <p v-if="broadcastFeedback" class="feedback-msg msg-good">{{ broadcastFeedback }}</p>
    </section>

    <!-- Active trips monitor -->
    <section class="panel-card">
      <div class="panel-header-label">ACTIVE TRIPS MONITOR</div>

      <div v-if="loading" class="loading-state">Scanning active fleet loops...</div>
      <div v-else-if="trips.length === 0" class="empty-state">No active trips are currently running.</div>

      <div v-else class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Route</th>
              <th>Driver</th>
              <th>Occupancy</th>
              <th>Started</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="trip in trips" :key="trip._id">
              <td class="mono-cell">{{ trip.shuttleId?.plateNumber || '—' }}</td>
              <td>{{ trip.routeId?.name || '—' }}</td>
              <td>{{ trip.driverId?.name || '—' }}</td>
              <td>{{ trip.seatsCurrentOccupancy }}/{{ trip.seatsTotal }}</td>
              <td>{{ formatTime(trip.startedAt) }}</td>
              <td>
                <button class="btn btn-danger btn-tiny" :disabled="endingId === trip._id" @click="forceEnd(trip)">
                  {{ endingId === trip._id ? 'Ending...' : 'Force End' }}
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
import { ref, onMounted, onUnmounted } from 'vue';
import { Megaphone } from 'lucide-vue-next';
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
  if (!confirm(`Force-end the trip for ${trip.shuttleId?.plateNumber || 'this shuttle'}? The driver will be released.`)) return;
  endingId.value = trip._id;
  try {
    await apiClient.patch(`/trips/${trip._id}/force-end`);
    await fetchTrips();
  } catch (err) {
    alert(err.response?.data?.message || 'Failed to force-end trip.');
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
</script>

<style scoped>
.admin-page { display: flex; flex-direction: column; gap: 16px; }
.panel-card { background: #FFFFFF; border: 0.5px solid rgba(0, 0, 0, 0.10); border-radius: 12px; padding: 16px; box-sizing: border-box; }
.panel-header-label { font-size: 11px; font-weight: 500; text-transform: uppercase; color: #5F5E5A; padding-bottom: 6px; border-bottom: 0.5px solid rgba(0, 0, 0, 0.1); margin-bottom: 12px; }
.loading-state { font-size: 13px; color: #5F5E5A; text-align: center; padding: 24px 0; font-style: italic; }
.empty-state { font-size: 13px; color: #5F5E5A; text-align: center; padding: 24px 0; }

.broadcast-row { display: flex; gap: 8px; }
.text-input { flex: 1; height: 38px; border: 0.5px solid rgba(0, 0, 0, 0.2); border-radius: 8px; padding: 0 12px; font-size: 13px; background: #F4F3EF; color: #1A1A18; box-sizing: border-box; min-width: 0; }
.feedback-msg { font-size: 12px; margin: 8px 0 0 0; }
.msg-good { color: #0F6E56; }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 4px; border-radius: 8px; border: none; font-size: 13px; font-weight: 500; cursor: pointer; }
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.btn-primary { background: #1D9E75; color: #FFFFFF; }
.btn-danger { background: #D9383A; color: #FFFFFF; }
.btn-compact { height: 38px; padding: 0 14px; }
.btn-tiny { height: 28px; padding: 0 10px; font-size: 12px; }
.icon-spacing { margin-right: 2px; }

.table-scroll { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { text-align: left; font-size: 11px; text-transform: uppercase; color: #5F5E5A; font-weight: 500; padding: 8px 10px; border-bottom: 0.5px solid rgba(0, 0, 0, 0.1); white-space: nowrap; }
.data-table td { padding: 10px; border-bottom: 0.5px solid rgba(0, 0, 0, 0.06); color: #1A1A18; white-space: nowrap; }
.mono-cell { font-family: monospace; font-weight: 600; letter-spacing: 0.1em; color: #1D9E75; }
</style>
