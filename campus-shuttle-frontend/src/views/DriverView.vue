<template>
  <div class="driver-wrapper">
    <header class="terminal-header">
      <div class="brand">
        <Bus :size="20" class="brand-teal" />
        <span class="brand-text">DRIVER TERMINAL</span>
      </div>
      <div class="header-meta">
        <span class="driver-name">{{ authStore.user?.name || 'Driver' }}</span>
        <button @click="handleLogout" class="logout-link"><LogOut :size="16" /></button>
      </div>
    </header>

    <div v-if="broadcastAlert" class="broadcast-banner">
      <AlertTriangle :size="14" class="icon-spacing" />
      <span>{{ broadcastAlert }}</span>
      <button class="banner-dismiss" @click="broadcastAlert = ''"><X :size="14" /></button>
    </div>

    <main class="terminal-content">
      <div v-if="loading" class="loading-state">Checking for an active shift loop...</div>

      <!-- ================= SETUP MODE ================= -->
      <section v-else-if="!activeTrip && !layoverData" class="setup-card">
        <h2>Begin Shift Loop</h2>
        <p class="subtitle">Select the physical vehicle you are driving today and your assigned route.</p>

        <div v-if="setupError" class="alert-banner danger-alert">
          <AlertTriangle :size="16" class="icon-spacing" />
          <span>{{ setupError }}</span>
        </div>

        <div class="form-group">
          <label>Shuttle Vehicle</label>
          <select v-model="selectedShuttleId">
            <option disabled value="">— Select an available vehicle —</option>
            <option v-for="s in availableShuttles" :key="s._id" :value="s._id">
              {{ s.plateNumber }} ({{ s.model || 'N/A' }} · {{ s.capacity }} seats)
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>Campus Route</label>
          <select v-model="selectedRouteId">
            <option disabled value="">— Select your route loop —</option>
            <option v-for="r in routes" :key="r._id" :value="r._id">
              {{ r.name }} — {{ r.direction }}
            </option>
          </select>
        </div>

        <button class="btn btn-primary" :disabled="!selectedShuttleId || !selectedRouteId || starting" @click="handleStartTrip">
          <Loader2 v-if="starting" :size="16" class="animate-spin icon-spacing" />
          <Play v-else :size="16" class="icon-spacing" />
          <span>{{ starting ? 'Initializing...' : 'Start Trip' }}</span>
        </button>
      </section>

      <!-- ================= LAYOVER (AUTO-TURNAROUND) ================= -->
      <section v-else-if="layoverData" class="layover-card">
        <div class="layover-icon">⏸</div>
        <h2>Layover at Terminus</h2>
        <p class="subtitle">
          Forward trip completed. The return leg on
          <strong class="layover-route-name">{{ layoverData.reverseRoute?.name || 'return route' }}</strong>
          is armed — it starts automatically the moment the bus pulls away.
        </p>
        <div class="layover-bus-info">
          <span class="shuttle-code">{{ layoverData.shuttle?.plateNumber || 'SHUTTLE' }}</span>
          <span class="van-muted">{{ layoverData.shuttle?.model || '' }}</span>
        </div>

        <!-- Keep streaming during the layover so the departure is detected -->
        <section class="panel-card manual-sim-card">
          <div class="panel-header-label">VEHICLE POSITION SOURCE</div>
          <div class="manual-sim-row">
            <button class="manual-toggle" :class="{ 'manual-on': manualMode }" @click="toggleManualMode">
              {{ manualMode ? 'Manual Position: ON' : 'Manual Position: OFF' }}
            </button>
            <span class="manual-sim-note">Keep piping fixes — departure is auto-detected.</span>
          </div>

          <div v-if="manualMode" class="manual-sim-body">
            <div v-if="simStops.length" class="manual-stop-block">
              <label class="manual-label">Return-leg simulated stop</label>
              <select v-model.number="manualStopIndex" class="manual-select">
                <option v-for="(stop, i) in simStops" :key="stop.index" :value="i">
                  {{ i }}. {{ stop.name }}
                </option>
              </select>
              <button class="advance-btn" @click="advanceManualStop">▶ Advance to next stop</button>
              <p class="manual-hint">
                {{ simStops[manualStopIndex]?.name }}
                ({{ simStops[manualStopIndex]?.lat }}, {{ simStops[manualStopIndex]?.lng }})
              </p>
            </div>
          </div>
        </section>

        <div class="layover-actions">
          <button class="btn btn-danger" :disabled="endingLayover" @click="handleEndLayover">
            <Loader2 v-if="endingLayover" :size="16" class="animate-spin icon-spacing" />
            <Square v-else :size="16" class="icon-spacing" />
            <span>{{ endingLayover ? 'Ending shift...' : 'End Shift Now' }}</span>
          </button>
          <p class="subtitle">Ending now cancels the auto-return and releases the shuttle.</p>
        </div>
      </section>

      <!-- ================= ACTIVE MODE ================= -->
      <template v-else>
        <section class="trip-banner-card">
          <div class="trip-identity">
            <span class="shuttle-code">{{ activeTrip.shuttleId?.plateNumber || 'SHUTTLE' }}</span>
            <span class="route-name">{{ activeTrip.routeId?.name }} — {{ activeTrip.routeId?.direction }}</span>
          </div>
          <div class="status-pills">
            <span class="pill" :class="gpsPillClass">
              <Satellite :size="12" class="icon-spacing" /> {{ gpsStatusLabel }}
            </span>
            <span class="pill" :class="connected ? 'pill-teal' : 'pill-amber'">
              <Wifi :size="12" class="icon-spacing" /> {{ connected ? 'Link Live' : 'REST Fallback' }}
            </span>
          </div>
        </section>

        <!-- Manual position simulator: laptops have no GPS fix, so the bus would
             never render on the student map without this -->
        <section class="panel-card manual-sim-card">
          <div class="panel-header-label">VEHICLE POSITION SOURCE</div>
          <div class="manual-sim-row">
            <button class="manual-toggle" :class="{ 'manual-on': manualMode }" @click="toggleManualMode">
              {{ manualMode ? 'Manual Position: ON' : 'Manual Position: OFF' }}
            </button>
            <span class="manual-sim-note">
              {{ manualMode ? 'Streaming a simulated fix every 3s' : 'Using device GPS' }}
            </span>
          </div>

          <div v-if="manualMode" class="manual-sim-body">
            <div v-if="simStops.length" class="manual-stop-block">
              <label class="manual-label">Current simulated stop</label>
              <select v-model.number="manualStopIndex" class="manual-select">
                <option v-for="(stop, i) in simStops" :key="stop.index" :value="i">
                  {{ i }}. {{ stop.name }}
                </option>
              </select>
              <button class="advance-btn" @click="advanceManualStop">
                ▶ Advance to next stop
              </button>
              <p class="manual-hint">
                {{ simStops[manualStopIndex]?.name }}
                ({{ simStops[manualStopIndex]?.lat }}, {{ simStops[manualStopIndex]?.lng }})
              </p>
            </div>

            <div v-else class="manual-stop-block">
              <label class="manual-label">Manual coordinates</label>
              <div class="manual-coord-row">
                <input v-model="manualLat" class="manual-input" placeholder="Latitude (11.15745)" />
                <input v-model="manualLng" class="manual-input" placeholder="Longitude (7.65272)" />
              </div>
            </div>
          </div>
        </section>

        <section class="panel-grid">
          <!-- Load-ahead manifest — read-only, derived from the seat registry.
             No manual +/− here: occupancy moves only via confirmed boarding and
             the automatic alight sweep as destinations slip behind the bus. -->
          <div class="panel-card">
            <div class="panel-header-label">LOAD AHEAD — {{ manifest?.onboard ?? occupancy }} on board</div>
            <div class="occupancy-bar-track">
              <div class="occupancy-fill" :class="occupancyFillClass" :style="{ width: occupancyPct + '%' }"></div>
            </div>
            <div v-if="manifest" class="manifest-stops">
              <div
                v-for="stop in manifest.perStop"
                :key="stop.index"
                class="manifest-row"
                :class="{ 'manifest-passed': stop.index <= manifest.lastPassedIndex }"
              >
                <span class="manifest-name">{{ stop.name }}</span>
                <span class="manifest-counts">
                  <span v-if="stop.pendingBoarding" class="count-chip chip-board">{{ stop.pendingBoarding }} board</span>
                  <span v-if="stop.waitlisted" class="count-chip chip-wait">{{ stop.waitlisted }} wait</span>
                  <span v-if="stop.dropoffs" class="count-chip chip-off">{{ stop.dropoffs }} off</span>
                  <span v-if="!stop.pendingBoarding && !stop.waitlisted && !stop.dropoffs" class="count-none">—</span>
                </span>
              </div>
            </div>
            <p v-else class="feedback-msg">Loading load-ahead manifest...</p>
          </div>

          <!-- Boarding pass confirmation -->
          <div class="panel-card">
            <div class="panel-header-label">CONFIRM BOARDING PASS</div>
            <div class="code-entry-row">
              <input
                v-model="boardingCode"
                maxlength="6"
                placeholder="6-CHAR CODE"
                class="code-input"
                @keyup.enter="confirmBoarding"
              />
              <button class="btn btn-primary btn-compact" :disabled="boardingCode.length !== 6 || confirming" @click="confirmBoarding">
                <Loader2 v-if="confirming" :size="14" class="animate-spin" />
                <span v-else>Confirm</span>
              </button>
            </div>
            <p v-if="boardingMessage" class="feedback-msg" :class="boardingSuccess ? 'msg-good' : 'msg-bad'">
              {{ boardingMessage }}
            </p>
          </div>
        </section>

        <!-- End trip -->
        <section class="panel-card end-trip-card">
          <div>
            <div class="panel-header-label">SHIFT TERMINATION</div>
            <p class="subtitle">Ends the loop, clears GPS streaming, and releases the vehicle back to the fleet pool.</p>
          </div>
          <button class="btn btn-danger" :disabled="ending" @click="handleEndTrip">
            <Loader2 v-if="ending" :size="16" class="animate-spin icon-spacing" />
            <Square v-else :size="16" class="icon-spacing" />
            <span>{{ ending ? 'Terminating...' : 'End Trip' }}</span>
          </button>
        </section>
      </template>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Bus, LogOut, Play, Square, Satellite, Wifi, AlertTriangle, Loader2, X
} from 'lucide-vue-next';
import apiClient from '../api/axios';
import { useAuthStore } from '../stores/auth';
import { useShuttleSocket } from '../composables/useShuttleSocket';

const authStore = useAuthStore();
const router = useRouter();
const { socket, connected, on } = useShuttleSocket();

const loading = ref(true);
const activeTrip = ref(null);
const layoverData = ref(null); // auto-turnaround waiting at a terminus
const manifest = ref(null);    // load-ahead counts for the current trip
let manifestInterval = null;

// The trip id the GPS/manual stream targets. Survives the layover flip: while
// parked at a terminus the socket ignores it (layover context is authoritative),
// and it swaps to the fresh return trip when driver:return_started lands.
const currentTripId = ref(null);

// Setup mode state
const availableShuttles = ref([]);
const routes = ref([]);
const selectedShuttleId = ref('');
const selectedRouteId = ref('');
const setupError = ref('');
const starting = ref(false);

// Active mode state
const occupancy = ref(0);
const boardingCode = ref('');
const boardingMessage = ref('');
const boardingSuccess = ref(false);
const confirming = ref(false);
const ending = ref(false);
const endingLayover = ref(false);
const broadcastAlert = ref('');

// GPS streaming state
const gpsStatus = ref('idle'); // idle | live | error
const gpsError = ref('');
let watchId = null;
let lastEmitAt = 0;
const EMIT_INTERVAL_MS = 2000;

// Manual position mode — laptops/desktops have no GPS fix, so the bus would
// never appear on the student map. Driver picks a stop or types coordinates.
const manualMode = ref(false);
const manualStopIndex = ref(0);
const manualTimer = null;
let manualInterval = null;
const manualLat = ref('');
const manualLng = ref('');

// Stops the position simulator addresses: the active trip's route when running,
// or the armed return leg's route during a layover.
const simStops = computed(() =>
  activeTrip.value?.routeId?.stops || layoverData.value?.reverseRoute?.stops || []
);

const gpsStatusLabel = computed(() => {
  if (manualMode.value) return 'Manual Sim';
  if (gpsStatus.value === 'live') return 'GPS Live';
  if (gpsStatus.value === 'error') return `GPS Error: ${gpsError.value}`;
  return 'GPS Standby';
});
const gpsPillClass = computed(() => {
  if (gpsStatus.value === 'live') return 'pill-teal';
  if (gpsStatus.value === 'error') return 'pill-red';
  return 'pill-amber';
});

const occupancyPct = computed(() => {
  const total = activeTrip.value?.seatsTotal || 1;
  return Math.min(100, Math.round((occupancy.value / total) * 100));
});
const occupancyFillClass = computed(() => {
  if (occupancyPct.value >= 85) return 'danger-fill';
  if (occupancyPct.value >= 60) return 'warning-fill';
  return 'teal-fill';
});

// ---------- Trip lifecycle ----------

const fetchSetupOptions = async () => {
  try {
    const [shuttleRes, routeRes] = await Promise.all([
      apiClient.get('/shuttles'),
      apiClient.get('/transit/routes')
    ]);
    availableShuttles.value = shuttleRes.data.filter((s) => s.status === 'active');
    routes.value = routeRes.data;
  } catch (err) {
    setupError.value = 'Failed to load fleet and route options.';
  }
};

const resumeOrSetup = async () => {
  loading.value = true;
  try {
    const res = await apiClient.get('/trips/driver/active');

    // Another stale tab or a page reload landed while a terminus layover was armed
    if (res.data.layover) {
      layoverData.value = res.data;
      activeTrip.value = null;
      currentTripId.value = null;
      startGpsStream(); // keep feeding fixes so departure auto-starts the return
      return;
    }

    activeTrip.value = res.data;
    currentTripId.value = res.data._id;
    occupancy.value = res.data.seatsCurrentOccupancy;
    startGpsStream();
    startManifestPoll();
  } catch (err) {
    // 404 = no live loop — drop into setup mode
    layoverData.value = null;
    activeTrip.value = null;
    currentTripId.value = null;
    await fetchSetupOptions();
  } finally {
    loading.value = false;
  }
};

const handleStartTrip = async () => {
  setupError.value = '';
  starting.value = true;
  try {
    await apiClient.post('/trips/start', {
      shuttleId: selectedShuttleId.value,
      routeId: selectedRouteId.value
    });
    // Re-fetch through the populated resume endpoint for consistent shape
    const res = await apiClient.get('/trips/driver/active');
    activeTrip.value = res.data;
    currentTripId.value = res.data._id;
    occupancy.value = res.data.seatsCurrentOccupancy;
    startGpsStream();
    startManifestPoll();
  } catch (err) {
    setupError.value = err.response?.data?.message || 'Failed to start trip.';
  } finally {
    starting.value = false;
  }
};

const handleEndTrip = async () => {
  if (!confirm('End this trip? The shuttle will disappear from all live maps.')) return;
  ending.value = true;
  try {
    await apiClient.patch(`/trips/end/${activeTrip.value._id}`);
    stopGpsStream();
    stopManualStream();
    stopManifestPoll();
    activeTrip.value = null;
    currentTripId.value = null;
    occupancy.value = 0;
    manifest.value = null;
    boardingCode.value = '';
    boardingMessage.value = '';
    selectedShuttleId.value = '';
    selectedRouteId.value = '';
    await fetchSetupOptions();
  } catch (err) {
    alert(err.response?.data?.message || 'Failed to end trip.');
  } finally {
    ending.value = false;
  }
};

// Auto-turnaround: the driver chose to conclude the shift while parked at a
// terminus, cancelling the queued return leg instead of letting it auto-start.
const handleEndLayover = async () => {
  if (!confirm('End the shift now? The auto-turnaround return leg will be cancelled.')) return;
  endingLayover.value = true;
  try {
    await apiClient.post('/trips/layover/end');
    stopGpsStream();
    stopManualStream();
    layoverData.value = null;
    currentTripId.value = null;
    await fetchSetupOptions();
  } catch (err) {
    alert(err.response?.data?.message || 'Failed to end layover.');
  } finally {
    endingLayover.value = false;
  }
};

// ---------- GPS streaming ----------

const startGpsStream = () => {
  if (!('geolocation' in navigator)) {
    gpsStatus.value = 'error';
    gpsError.value = 'Geolocation unsupported';
    return;
  }
  if (watchId !== null) return;

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      gpsStatus.value = 'live';
      const now = Date.now();
      if (now - lastEmitAt < EMIT_INTERVAL_MS) return; // client-side throttle
      lastEmitAt = now;

      const payload = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (currentTripId.value) payload.tripId = currentTripId.value;
      // During a layover the socket routes fixes against the armed return context
      // regardless of tripId, so a missing tripId must not block GPS streaming.
      if (connected.value) {
        socket.emit('driver:location', payload);
      } else if (currentTripId.value) {
        // Socket link down — REST fallback keeps the map alive (active-trip only)
        apiClient.patch(`/trips/${currentTripId.value}/location`, { lat: payload.lat, lng: payload.lng }).catch(() => {});
      }
    },
    (err) => {
      gpsStatus.value = 'error';
      gpsError.value = err.message;
    },
    { enableHighAccuracy: true, maximumAge: 0 }
  );
};

const stopGpsStream = () => {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  gpsStatus.value = 'idle';
};

// ---------- Manual position simulation ----------

// Push a single coordinate through socket, falling back to REST when actively on a trip
const pushManualFix = (lat, lng) => {
  const payload = { lat, lng };
  if (currentTripId.value) payload.tripId = currentTripId.value;
  if (connected.value) socket.emit('driver:location', payload);
  else if (currentTripId.value) apiClient.patch(`/trips/${currentTripId.value}/location`, { lat, lng }).catch(() => {});
};

// Keep re-sending the chosen fix so the marker never goes stale (>10s window)
const startManualStream = () => {
  stopManualStream();
  manualInterval = setInterval(() => {
    if (simStops.value.length) {
      const stop = simStops.value[manualStopIndex.value];
      if (stop) pushManualFix(stop.lat, stop.lng);
    } else if (manualLat.value && manualLng.value) {
      const lat = Number(manualLat.value);
      const lng = Number(manualLng.value);
      if (Number.isFinite(lat) && Number.isFinite(lng)) pushManualFix(lat, lng);
    }
  }, 3000);
};

const stopManualStream = () => {
  if (manualInterval) {
    clearInterval(manualInterval);
    manualInterval = null;
  }
};

// Walk the bus forward through the stop sequence to simulate movement. Clamps at
// the terminal so a test can park there and let the dwell counter trigger the
// auto-turnaround, instead of wrapping straight back to the first stop.
const advanceManualStop = () => {
  const total = simStops.value.length;
  if (!total) return;
  manualStopIndex.value = Math.min(manualStopIndex.value + 1, total - 1);
  const stop = simStops.value[manualStopIndex.value];
  if (stop) pushManualFix(stop.lat, stop.lng);
};

const toggleManualMode = () => {
  manualMode.value = !manualMode.value;
  if (manualMode.value) {
    stopGpsStream();
    startManualStream();
  } else {
    stopManualStream();
  }
};

// ---------- Occupancy + boarding ----------

// Load-ahead manifest: per-stop board/wait/dropoff counts straight from the seat
// registry. The driver reads where passengers are going — the server derives the
// numbers, so no manual counter can drift.
const loadManifest = async () => {
  if (!activeTrip.value?._id) return;
  try {
    const { data } = await apiClient.get(`/trips/${activeTrip.value._id}/manifest`);
    manifest.value = data;
    if (typeof data.onboard === 'number') occupancy.value = data.onboard;
  } catch (err) {
    // transient — next poll retries
  }
};

const startManifestPoll = () => {
  stopManifestPoll();
  loadManifest();
  manifestInterval = setInterval(loadManifest, 10000);
};

const stopManifestPoll = () => {
  if (manifestInterval) {
    clearInterval(manifestInterval);
    manifestInterval = null;
  }
};

const confirmBoarding = async () => {
  if (boardingCode.value.length !== 6) return;
  confirming.value = true;
  boardingMessage.value = '';
  try {
    const res = await apiClient.post('/reservations/confirm', {
      confirmationCode: boardingCode.value.toUpperCase()
    });
    boardingSuccess.value = true;
    boardingMessage.value = res.data.message || 'Passenger boarded successfully.';
    if (typeof res.data.occupancy === 'number') {
      occupancy.value = res.data.occupancy;
    } else {
      occupancy.value = Math.min(occupancy.value + 1, activeTrip.value.seatsTotal);
    }
    boardingCode.value = '';
  } catch (err) {
    boardingSuccess.value = false;
    boardingMessage.value = err.response?.data?.message || 'Invalid or expired boarding code.';
  } finally {
    confirming.value = false;
  }
};

const handleLogout = () => {
  stopGpsStream();
  stopManualStream();
  stopManifestPoll();
  authStore.logout();
  router.push('/login');
};

onMounted(() => {
  resumeOrSetup();
  on('admin:broadcast', ({ message }) => { broadcastAlert.value = message; });

  // Forward leg ended at a terminus — switch to the layover panel. The reverse
  // leg arms itself server-side; this view just reflects the state.
  on('driver:layover', async () => {
    stopManifestPoll();
    try {
      const res = await apiClient.get('/trips/driver/active');
      if (res.data.layover) {
        layoverData.value = res.data;
        activeTrip.value = null;
        currentTripId.value = null;
      }
    } catch (err) {
      // race: already ended — fall through to setup
      layoverData.value = null;
      activeTrip.value = null;
      currentTripId.value = null;
      await fetchSetupOptions();
    }
  });

  // Return leg went live — resume the active-trip view against the new trip.
  on('driver:return_started', async () => {
    await resumeOrSetup();
  });
});

onUnmounted(() => {
  stopGpsStream();
  stopManualStream();
  stopManifestPoll();
});
</script>

<style scoped>
.driver-wrapper { display: flex; flex-direction: column; min-height: 100vh; width: 100vw; box-sizing: border-box; background: #F4F3EF; }
.terminal-header { display: flex; align-items: center; justify-content: space-between; height: 56px; background: #0D2137; color: #FFFFFF; padding: 0 16px; box-sizing: border-box; border-bottom: 0.5px solid rgba(255, 255, 255, 0.1); position: sticky; top: 0; z-index: 100; }
.brand { display: flex; align-items: center; gap: 8px; }
.brand-teal { color: #1D9E75; }
.brand-text { font-size: 15px; font-weight: 500; letter-spacing: 0.05em; }
.header-meta { display: flex; align-items: center; gap: 12px; }
.driver-name { font-size: 13px; color: rgba(255,255,255,0.8); }
.logout-link { background: transparent; border: none; color: #E24B4A; cursor: pointer; display: flex; padding: 4px; }

.broadcast-banner { display: flex; align-items: center; gap: 8px; background: #FFF9E6; color: #BA7517; font-size: 13px; padding: 10px 16px; border-bottom: 0.5px solid rgba(186, 117, 23, 0.3); }
.banner-dismiss { margin-left: auto; background: transparent; border: none; color: #BA7517; cursor: pointer; display: flex; padding: 2px; }

.terminal-content { flex: 1; padding: 16px; box-sizing: border-box; display: flex; flex-direction: column; gap: 16px; max-width: 860px; width: 100%; margin: 0 auto; }
.loading-state { font-size: 13px; color: #5F5E5A; text-align: center; padding: 40px 0; font-style: italic; }

.setup-card { background: #FFFFFF; border: 0.5px solid rgba(0, 0, 0, 0.10); border-radius: 12px; padding: 24px; display: flex; flex-direction: column; gap: 14px; max-width: 480px; margin: 24px auto 0; width: 100%; box-sizing: border-box; }
.setup-card h2 { font-size: 18px; font-weight: 500; margin: 0; }
.subtitle { font-size: 13px; color: #5F5E5A; margin: 0; line-height: 1.5; }

.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 12px; font-weight: 500; text-transform: uppercase; color: #5F5E5A; }
.form-group select { height: 40px; border: 0.5px solid rgba(0, 0, 0, 0.2); border-radius: 8px; padding: 0 10px; font-size: 14px; background: #F4F3EF; color: #1A1A18; }

.alert-banner { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 10px 12px; border-radius: 8px; }
.danger-alert { background: #FDECEC; color: #D9383A; }

.btn { display: flex; align-items: center; justify-content: center; gap: 6px; height: 42px; border-radius: 8px; border: none; font-size: 14px; font-weight: 500; cursor: pointer; padding: 0 18px; }
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.btn-primary { background: #1D9E75; color: #FFFFFF; }
.btn-danger { background: #D9383A; color: #FFFFFF; }
.btn-compact { height: 38px; padding: 0 14px; font-size: 13px; }
.icon-spacing { margin-right: 4px; }
.animate-spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.trip-banner-card { background: #0D2137; color: #FFFFFF; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.trip-identity { display: flex; flex-direction: column; gap: 2px; }
.shuttle-code { font-family: monospace; font-weight: 600; font-size: 16px; letter-spacing: 0.15em; color: #1D9E75; }
.route-name { font-size: 13px; color: rgba(255, 255, 255, 0.75); }
.status-pills { display: flex; gap: 8px; flex-wrap: wrap; }
.pill { display: flex; align-items: center; font-size: 11px; font-weight: 500; padding: 3px 10px; border-radius: 999px; }
.pill-teal { background: #E1F5EE; color: #0F6E56; }
.pill-amber { background: #FFF9E6; color: #BA7517; }
.pill-red { background: #FDECEC; color: #D9383A; }

.panel-grid { display: flex; flex-direction: column; gap: 16px; }
.panel-card { background: #FFFFFF; border: 0.5px solid rgba(0, 0, 0, 0.10); border-radius: 12px; padding: 16px; box-sizing: border-box; }
.panel-header-label { font-size: 11px; font-weight: 500; text-transform: uppercase; color: #5F5E5A; padding-bottom: 6px; border-bottom: 0.5px solid rgba(0, 0, 0, 0.1); margin-bottom: 12px; }

.occupancy-readout { text-align: center; }
.occupancy-value { font-size: 34px; font-weight: 600; color: #1A1A18; }
.occupancy-max { font-size: 13px; color: #5F5E5A; margin-left: 4px; }
.occupancy-bar-track { height: 6px; background: #F4F3EF; border-radius: 999px; overflow: hidden; }
.occupancy-fill { height: 100%; border-radius: 999px; transition: width 0.4s ease, background-color 0.3s ease; }
.teal-fill { background: #1D9E75; }
.warning-fill { background: #BA7517; }
.danger-fill { background: #D9383A; }

.code-entry-row { display: flex; gap: 8px; }
.code-input { flex: 1; height: 38px; border: 0.5px solid rgba(0, 0, 0, 0.2); border-radius: 8px; padding: 0 12px; font-family: monospace; font-size: 15px; letter-spacing: 0.25em; text-transform: uppercase; background: #F4F3EF; color: #1A1A18; box-sizing: border-box; min-width: 0; }
.feedback-msg { font-size: 12px; margin: 8px 0 0 0; }
.msg-good { color: #0F6E56; }
.msg-bad { color: #D9383A; }

.end-trip-card { display: flex; flex-direction: column; gap: 12px; }

/* Layover (auto-turnaround) */
.layover-card { background: #FFFFFF; border: 0.5px solid rgba(0, 0, 0, 0.10); border-radius: 12px; padding: 24px; display: flex; flex-direction: column; gap: 14px; max-width: 480px; margin: 24px auto 0; width: 100%; box-sizing: border-box; }
.layover-card h2 { font-size: 18px; font-weight: 500; margin: 0; }
.layover-icon { width: 44px; height: 44px; border-radius: 999px; background: #FFF9E6; color: #BA7517; display: flex; align-items: center; justify-content: center; font-size: 22px; }
.layover-route-name { color: #1D9E75; }
.layover-bus-info { display: flex; align-items: center; gap: 12px; background: #F4F3EF; border-radius: 8px; padding: 10px 12px; }
.van-muted { font-size: 13px; color: #5F5E5A; }
.layover-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.layover-actions .btn { align-self: flex-start; }

/* Load-ahead manifest */
.manifest-stops { margin-top: 12px; display: flex; flex-direction: column; gap: 3px; max-height: 220px; overflow-y: auto; }
.manifest-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 12px; padding: 5px 8px; border-radius: 6px; background: #F4F3EF; }
.manifest-row.manifest-passed { opacity: 0.45; }
.manifest-name { color: #0D2137; font-weight: 500; }
.manifest-counts { display: flex; gap: 4px; flex-wrap: wrap; }
.count-chip { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.chip-board { background: #E1F5EE; color: #0F6E56; }
.chip-wait { background: #FFF9E6; color: #BA7517; }
.chip-off { background: #E7ECF2; color: #33475B; }
.count-none { color: #B9B7B0; }

@media (min-width: 768px) {
  .terminal-content { padding: 24px; gap: 20px; }
  .trip-banner-card { flex-direction: row; align-items: center; justify-content: space-between; }
  .panel-grid { display: grid; grid-template-columns: 1fr 1fr; }
  .end-trip-card { flex-direction: row; align-items: center; justify-content: space-between; }
}

/* Manual vehicle position simulator */
.manual-sim-card { margin-bottom: 16px; }
.manual-sim-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.manual-toggle {
  background: #FFFFFF; border: 1px solid #5F5E5A; color: #5F5E5A;
  font-size: 12px; font-weight: 500; padding: 6px 12px; border-radius: 6px;
  cursor: pointer; transition: all 0.2s ease;
}
.manual-toggle:hover { background: #F4F3EF; }
.manual-on { background: #BA7517; border-color: #BA7517; color: #FFFFFF; }
.manual-sim-note { font-size: 11px; color: #5F5E5A; font-style: italic; }
.manual-sim-body { margin-top: 12px; }
.manual-stop-block { display: flex; flex-direction: column; gap: 6px; }
.manual-label { font-size: 11px; text-transform: uppercase; color: #5F5E5A; letter-spacing: 0.04em; }
.manual-select {
  border: 0.5px solid rgba(0, 0, 0, 0.2); border-radius: 6px;
  padding: 7px 9px; font-size: 13px; background: #FFFFFF; color: #0D2137;
}
.advance-btn {
  align-self: flex-start; margin-top: 4px;
  background: #0D2137; color: #FFFFFF; border: none;
  font-size: 12px; font-weight: 500; padding: 7px 14px; border-radius: 6px; cursor: pointer;
}
.advance-btn:hover { background: #1B3A5C; }
.manual-hint { font-size: 11px; color: #5F5E5A; font-family: monospace; margin: 2px 0 0; }
.manual-coord-row { display: flex; gap: 8px; }
.manual-input {
  flex: 1; border: 0.5px solid rgba(0, 0, 0, 0.2); border-radius: 6px;
  padding: 7px 9px; font-size: 13px; font-family: monospace; color: #0D2137;
}
</style>
