<template>
  <div class="driver">
    <div class="subbar">
      <div class="who">
        <span class="status-dot" :class="shiftState"></span>
        <div class="who-text">
          <strong>{{ authStore.user?.name || 'Driver' }}</strong>
          <span class="eyebrow">{{ shiftLabel }}</span>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" @click="isAccountOpen = true"><UserRound :size="15" /> Account</button>
    </div>

    <Transition name="alert">
      <div v-if="broadcastAlert" class="broadcast" role="alert">
        <AlertTriangle :size="16" />
        <span>{{ broadcastAlert }}</span>
        <button class="dismiss" aria-label="Dismiss" @click="broadcastAlert = ''"><X :size="16" /></button>
      </div>
    </Transition>

    <main class="stage">
      <div v-if="loading" class="skeletons"><div class="skeleton"></div><div class="skeleton short"></div></div>

      <!-- ================= SETUP MODE ================= -->
      <section v-else-if="!activeTrip && !layoverData" class="card narrow setup rise">
        <p class="eyebrow">Off shift</p>
        <h1>Start your shift</h1>
        <p class="lede">Choose the vehicle you’re driving today and your route loop.</p>

        <label class="field">
          <span>Vehicle</span>
          <select v-model="selectedShuttleId" class="select">
            <option disabled value="">Select an available vehicle</option>
            <option v-for="s in availableShuttles" :key="s._id" :value="s._id">{{ s.plateNumber }} ({{ s.model || 'N/A' }} · {{ s.capacity }} seats)</option>
          </select>
        </label>

        <label class="field">
          <span>Route</span>
          <select v-model="selectedRouteId" class="select">
            <option disabled value="">Select your route loop</option>
            <option v-for="r in routes" :key="r._id" :value="r._id">{{ r.name }} · {{ r.direction }}</option>
          </select>
        </label>

        <button class="btn start" :disabled="!selectedShuttleId || !selectedRouteId || starting" @click="handleStartTrip">
          <Loader2 v-if="starting" :size="18" class="spin" />
          <Play v-else :size="18" />
          <span>{{ starting ? 'Starting…' : 'Start trip' }}</span>
        </button>
      </section>

      <!-- ================= LAYOVER (AUTO-TURNAROUND) ================= -->
      <section v-else-if="layoverData" class="narrow layover">
        <div class="card rise">
          <span class="layover-ico"><Pause :size="22" /></span>
          <h1>Layover at terminus</h1>
          <p class="lede">
            Forward trip completed. The return leg on
            <strong>{{ layoverData.reverseRoute?.name || 'the return route' }}</strong>
            is armed. It starts automatically the moment the bus pulls away.
          </p>
          <div class="bus-info">
            <span class="plate small">{{ layoverData.shuttle?.plateNumber || 'SHUTTLE' }}</span>
            <span class="muted">{{ layoverData.shuttle?.model || '' }}</span>
          </div>
        </div>

        <section class="card position rise" style="--i:3">
          <div class="pos-head">
            <div>
              <p class="eyebrow">Position source</p>
              <p class="pos-note">{{ manualMode ? (layoverData ? 'Keep piping fixes. Departure is auto-detected.' : 'Streaming a simulated fix every 3s') : 'Using device GPS' }}</p>
            </div>
            <button class="switch" :class="{ on: manualMode }" role="switch" :aria-checked="manualMode" aria-label="Manual position" @click="toggleManualMode">
              <span class="knob"></span><span class="switch-label">{{ manualMode ? 'Manual' : 'GPS' }}</span>
            </button>
          </div>

          <Transition name="reveal">
            <div v-if="manualMode" class="manual">
              <div v-if="simStops.length" class="manual-block">
                <label class="field">
                  <span>{{ layoverData ? 'Return-leg simulated stop' : 'Current simulated stop' }}</span>
                  <select v-model.number="manualStopIndex" class="select" @change="selectSimStop">
                    <option v-for="(stop, i) in simStops" :key="stop.index" :value="i">{{ i }}. {{ stop.name }}</option>
                  </select>
                </label>
                <button class="btn btn-ghost advance" @click="advanceManualStop"><Play :size="14" /> Advance to next stop</button>
                <p class="coords tnum">{{ simStops[manualStopIndex]?.name }} · {{ simStops[manualStopIndex]?.lat }}, {{ simStops[manualStopIndex]?.lng }}</p>
              </div>
              <div v-else class="manual-block">
                <span class="field-label">Manual coordinates</span>
                <div class="coord-row">
                  <input v-model="manualLat" class="input" placeholder="Latitude (11.15745)" />
                  <input v-model="manualLng" class="input" placeholder="Longitude (7.65272)" />
                </div>
              </div>
            </div>
          </Transition>
        </section>

        <section class="card end rise" style="--i:4">
          <div>
            <p class="eyebrow">End shift</p>
            <p class="muted">Ending now cancels the auto-return and releases the shuttle.</p>
          </div>
          <button class="btn btn-danger" :disabled="endingLayover" @click="handleEndLayover">
            <Loader2 v-if="endingLayover" :size="16" class="spin" />
            <Square v-else :size="16" />
            <span>{{ endingLayover ? 'Ending…' : 'End shift now' }}</span>
          </button>
        </section>
      </section>

      <!-- ================= ACTIVE MODE ================= -->
      <template v-else>
        <section class="hero rise">
          <div class="hero-main">
            <span class="plate">{{ activeTrip.shuttleId?.plateNumber || 'SHUTTLE' }}</span>
            <span class="hero-route">{{ activeTrip.routeId?.name }} · {{ activeTrip.routeId?.direction }}</span>
          </div>
          <div class="pills">
            <span class="pill" :class="gpsPillClass"><Satellite :size="13" /> {{ gpsStatusLabel }}</span>
            <span class="pill" :class="connected ? 'pill-teal' : 'pill-amber'"><Wifi :size="13" /> {{ connected ? 'Link live' : 'REST fallback' }}</span>
          </div>
        </section>

        <div class="grid">
          <!-- Read-only manifest: occupancy only moves via confirmed boarding and the automatic alight sweep -->
          <section class="card load rise" style="--i:1">
            <div class="load-head">
              <div>
                <p class="eyebrow">Load ahead</p>
                <p class="onboard"><RollNumber :value="manifest?.onboard ?? occupancy" /><span class="of">on board<template v-if="activeTrip.seatsTotal"> of {{ activeTrip.seatsTotal }} seats</template></span></p>
              </div>
            </div>
            <div class="bar"><div class="fill" :class="occupancyFillClass" :style="{ width: occupancyPct + '%' }"></div></div>

            <ol v-if="manifest" class="stops">
              <li v-for="stop in manifest.perStop" :key="stop.index" :class="{ passed: stop.index <= manifest.lastPassedIndex }">
                <span class="node"><Check v-if="stop.index <= manifest.lastPassedIndex" :size="10" /></span>
                <span class="stop-name">{{ stop.name }}</span>
                <span class="counts">
                  <span v-if="stop.pendingBoarding" class="count board">{{ stop.pendingBoarding }} board</span>
                  <span v-if="stop.waitlisted" class="count wait">{{ stop.waitlisted }} wait</span>
                  <span v-if="stop.dropoffs" class="count off">{{ stop.dropoffs }} off</span>
                </span>
              </li>
            </ol>
            <p v-else class="muted">Loading load-ahead manifest…</p>
          </section>

          <div class="col">
            <section class="card board rise" style="--i:2">
              <p class="eyebrow">Confirm boarding pass</p>
              <input
                v-model="boardingCode"
                maxlength="6"
                placeholder="CODE"
                class="code-input"
                autocapitalize="characters"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
                aria-label="6-character boarding code"
                @keyup.enter="confirmBoarding"
              />
              <button class="btn confirm" :disabled="boardingCode.length !== 6 || confirming" @click="confirmBoarding">
                <Loader2 v-if="confirming" :size="16" class="spin" />
                <Check v-else :size="16" />
                <span>{{ confirming ? 'Checking…' : 'Confirm boarding' }}</span>
              </button>
            </section>

<section class="card position rise" style="--i:3">
              <div class="pos-head">
                <div>
                  <p class="eyebrow">Position source</p>
                  <p class="pos-note">{{ manualMode ? (layoverData ? 'Keep piping fixes. Departure is auto-detected.' : 'Streaming a simulated fix every 3s') : 'Using device GPS' }}</p>
                </div>
                <button class="switch" :class="{ on: manualMode }" role="switch" :aria-checked="manualMode" aria-label="Manual position" @click="toggleManualMode">
                  <span class="knob"></span><span class="switch-label">{{ manualMode ? 'Manual' : 'GPS' }}</span>
                </button>
              </div>

              <Transition name="reveal">
                <div v-if="manualMode" class="manual">
                  <div v-if="simStops.length" class="manual-block">
                    <label class="field">
                      <span>{{ layoverData ? 'Return-leg simulated stop' : 'Current simulated stop' }}</span>
                      <select v-model.number="manualStopIndex" class="select" @change="selectSimStop">
                        <option v-for="(stop, i) in simStops" :key="stop.index" :value="i">{{ i }}. {{ stop.name }}</option>
                      </select>
                    </label>
                    <button class="btn btn-ghost advance" @click="advanceManualStop"><Play :size="14" /> Advance to next stop</button>
                    <p class="coords tnum">{{ simStops[manualStopIndex]?.name }} · {{ simStops[manualStopIndex]?.lat }}, {{ simStops[manualStopIndex]?.lng }}</p>
                  </div>
                  <div v-else class="manual-block">
                    <span class="field-label">Manual coordinates</span>
                    <div class="coord-row">
                      <input v-model="manualLat" class="input" placeholder="Latitude (11.15745)" />
                      <input v-model="manualLng" class="input" placeholder="Longitude (7.65272)" />
                    </div>
                  </div>
                </div>
              </Transition>
            </section>

            <section class="card end rise" style="--i:4">
              <div>
                <p class="eyebrow">End shift</p>
                <p class="muted">Ends the loop, stops GPS streaming, and releases the vehicle.</p>
              </div>
              <button class="btn btn-danger" :disabled="ending" @click="handleEndTrip">
                <Loader2 v-if="ending" :size="16" class="spin" />
                <Square v-else :size="16" />
                <span>{{ ending ? 'Ending…' : 'End trip' }}</span>
              </button>
            </section>
          </div>
        </div>
      </template>
    </main>

    <AccountSheet
      :open="isAccountOpen"
      :name="authStore.user?.name || ''"
      :role="authStore.user?.role || 'driver'"
      :form="passwordForm"
      :feedback="passwordFeedback"
      :changing="changingPassword"
      :can-submit="!!canSubmitPasswordForm"
      @close="isAccountOpen = false"
      @submit="handlePasswordChange"
      @logout="handleLogout"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, reactive, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  Bus, LogOut, Play, Square, Satellite, Wifi, AlertTriangle, Loader2, X, Pause, UserRound, Check
} from 'lucide-vue-next';
import RollNumber from '../components/RollNumber.vue';
import AccountSheet from '../components/AccountSheet.vue';
import { useToast } from '../composables/useToast';
import { useConfirm } from '../composables/useConfirm';
import { locationUnavailableReason, explainLocationError } from '../utils/locationErrors';
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
const changingPassword = ref(false);
const passwordFeedback = ref(null);
const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
});

const canSubmitPasswordForm = computed(() => {
  return passwordForm.currentPassword &&
    passwordForm.newPassword &&
    passwordForm.confirmPassword &&
    passwordForm.newPassword.length >= 6 &&
    passwordForm.newPassword === passwordForm.confirmPassword &&
    passwordForm.newPassword !== passwordForm.currentPassword;
});

const handlePasswordChange = async () => {
  if (!canSubmitPasswordForm.value) {
    passwordFeedback.value = { type: 'error', message: 'Please complete all fields and make sure the new password matches.' };
    return;
  }

  changingPassword.value = true;
  passwordFeedback.value = null;

  try {
    const response = await authStore.changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword
    });

    passwordFeedback.value = { type: 'success', message: response.message };
    passwordForm.currentPassword = '';
    passwordForm.newPassword = '';
    passwordForm.confirmPassword = '';
  } catch (err) {
    passwordFeedback.value = { type: 'error', message: err || 'Failed to update your password.' };
  } finally {
    changingPassword.value = false;
  }
};

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
  if (gpsStatus.value === 'error') return 'GPS problem';
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
      // The forward leg ended at the terminus; the return route is re-indexed
      // 0..n-1 so the sim must settle back at its stop 0 (the terminus), or the
      // stale index would teleport the bus to the far end and skip the layover.
      manualStopIndex.value = 0;
      startGpsStream(); // keep feeding fixes so departure auto-starts the return
      return;
    }

    activeTrip.value = res.data;
    // The return leg just went live while the layover card was up — clear it or
    // the v-else-if="layoverData" branch keeps the verifier hidden.
    layoverData.value = null;
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
    layoverData.value = null;
    currentTripId.value = res.data._id;
    occupancy.value = res.data.seatsCurrentOccupancy;
    manualStopIndex.value = 0; // fresh trip begins at its first stop
    startGpsStream();
    startManifestPoll();
  } catch (err) {
    setupError.value = err.response?.data?.message || 'Failed to start trip.';
  } finally {
    starting.value = false;
  }
};

const handleEndTrip = async () => {
  const ok = await askConfirm({ title: 'End this trip?', message: 'The shuttle will disappear from all live maps.', confirmLabel: 'End trip', danger: true });
  if (!ok) return;
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
    toast.error(err.response?.data?.message || 'Failed to end trip.');
  } finally {
    ending.value = false;
  }
};

// Auto-turnaround: the driver chose to conclude the shift while parked at a
// terminus, cancelling the queued return leg instead of letting it auto-start.
const handleEndLayover = async () => {
  const ok = await askConfirm({ title: 'End the shift now?', message: 'The auto-turnaround return leg will be cancelled and the shuttle released.', confirmLabel: 'End shift', danger: true });
  if (!ok) return;
  endingLayover.value = true;
  try {
    await apiClient.post('/trips/layover/end');
    stopGpsStream();
    stopManualStream();
    layoverData.value = null;
    currentTripId.value = null;
    await fetchSetupOptions();
  } catch (err) {
    toast.error(err.response?.data?.message || 'Failed to end layover.');
  } finally {
    endingLayover.value = false;
  }
};

// ---------- GPS streaming ----------

const startGpsStream = () => {
  const unavailable = locationUnavailableReason(); // no GPS support, or not https/localhost
  if (unavailable) {
    gpsStatus.value = 'error';
    gpsError.value = unavailable;
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
      // A refusal is always a problem; a hiccup after a good fix is not
      if (err.code === 1 || gpsStatus.value !== 'live') {
        gpsStatus.value = 'error';
        gpsError.value = explainLocationError(err);
      }
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

// Selecting a stop in the simulator dropdown pushes that fix immediately so the
// bus visibly jumps, rather than waiting up to 3s for the next auto-ping.
const selectSimStop = () => {
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
    // New route context: park the sim back at the reverse leg's first stop so a
    // stale forward-leg index can't auto-trigger the departure for us.
    manualStopIndex.value = 0;
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

// ---- Redesign additions: toasts, in-app confirm, account sheet, shift status ----
const toast = useToast();
const { ask: askConfirm } = useConfirm();

// Page-level errors appear at the top of the screen instead of inside the cards
watch(setupError, (message) => { if (message) toast.error(message); });
watch(boardingMessage, (message) => {
  if (!message) return;
  if (boardingSuccess.value) toast.success(message); else toast.error(message);
});
watch(gpsError, (message) => { if (message && !manualMode.value) toast.error(message); });

const isAccountOpen = ref(false);
const shiftState = computed(() => (layoverData.value ? 'layover' : activeTrip.value ? 'live' : 'off'));
const shiftLabel = computed(() => ({ layover: 'Layover', live: 'On shift', off: 'Off shift' }[shiftState.value]));
</script>

<style scoped>
.driver { min-height: calc(100dvh - var(--header-h) - var(--safe-t)); padding-bottom: calc(24px + var(--safe-b)); }

/* sticky sub-bar under the app header */
.subbar { position: sticky; top: calc(var(--header-h) + var(--safe-t)); z-index: 300; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; background: var(--bg); border-bottom: 1px solid var(--line); }
.who { display: flex; align-items: center; gap: 12px; min-width: 0; }
.who-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.who-text strong { font: 700 16px/1 var(--font-display); letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status-dot { flex: none; width: 12px; height: 12px; border-radius: 50%; background: var(--stale); }
.status-dot.live { background: var(--brand); box-shadow: 0 0 0 0 color-mix(in srgb, var(--brand) 60%, transparent); animation: ping 1.8s ease-out infinite; }
.status-dot.layover { background: var(--signal); }
@keyframes ping { to { box-shadow: 0 0 0 10px transparent; } }

.broadcast { display: flex; align-items: flex-start; gap: 10px; margin: 12px 16px 0; padding: 12px 14px; border-radius: 10px; background: var(--warn-bg); color: var(--warn); box-shadow: inset 3px 0 0 var(--warn); font-size: 14px; line-height: 1.4; }
.broadcast svg { flex: none; margin-top: 2px; }
.dismiss { margin-left: auto; border: 0; background: none; color: inherit; padding: 0; display: grid; }
.alert-enter-active, .alert-leave-active { transition: opacity .25s ease, transform .3s var(--ease); }
.alert-enter-from, .alert-leave-to { opacity: 0; transform: translateY(-8px); }

.stage { max-width: 1040px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
.narrow { width: 100%; max-width: 520px; margin: 0 auto; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); padding: 20px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
h1 { font-size: clamp(32px, 7vw, 44px); font-weight: 700; letter-spacing: -.04em; }
.lede { color: var(--muted); }
.muted { color: var(--muted); font-size: 14px; }
.field-label { font: 600 12px var(--font-body); color: var(--muted); }

.skeletons { display: grid; gap: 14px; max-width: 520px; width: 100%; margin: 0 auto; }
.skeleton { height: 220px; border-radius: var(--r-lg); background: linear-gradient(100deg, var(--surface) 30%, var(--surface-2) 50%, var(--surface) 70%) 0 0 / 200% 100%; animation: shimmer 1.4s linear infinite; }
.skeleton.short { height: 120px; }
@keyframes shimmer { to { background-position: -200% 0; } }

.start { width: 100%; min-height: 54px; font-size: 16px; margin-top: 4px; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* active trip hero */
.hero { background: var(--header-bg); color: var(--header-ink); border-radius: var(--r-lg); padding: 20px; display: flex; flex-direction: column; gap: 16px; border: 1px solid color-mix(in srgb, var(--header-ink) 14%, transparent); }
.hero-main { display: flex; flex-direction: column; gap: 6px; }
.plate { font: 500 clamp(30px, 8vw, 44px)/1 var(--font-mono); letter-spacing: .06em; }
.plate.small { font-size: 22px; }
.hero-route { font-size: 15px; opacity: .85; }
.pills { display: flex; flex-wrap: wrap; gap: 8px; }
.pill { display: inline-flex; align-items: center; gap: 6px; font: 600 12px var(--font-body); padding: 7px 11px; border-radius: 99px; background: rgb(255 255 255 / .16); color: inherit; transition: background var(--t-med), color var(--t-med); }
.pill-teal { background: var(--header-ink); color: var(--header-bg); }
.pill-amber { background: var(--signal); color: var(--on-signal); }
.pill-red { background: var(--live); color: #fff; }

.grid { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); align-items: start; }
.col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }

/* load ahead */
.onboard { display: flex; align-items: baseline; gap: 10px; margin-top: 8px; font: 700 52px/1 var(--font-display); letter-spacing: -.04em; }
.onboard .of { font: 500 14px var(--font-body); letter-spacing: 0; color: var(--muted); }
.bar { height: 10px; border-radius: 99px; background: var(--surface-2); overflow: hidden; }
.fill { height: 100%; border-radius: 99px; transition: width .9s var(--ease), background var(--t-med); }
.teal-fill { background: var(--brand); }
.warning-fill { background: var(--signal); }
.danger-fill { background: var(--live); }
.stops { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; }
.stops li { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0 10px 28px; font-size: 14px; border-top: 1px solid var(--line); }
.stops li:first-child { border-top: 0; }
.node { position: absolute; left: 0; top: 50%; width: 16px; height: 16px; margin-top: -8px; border-radius: 50%; border: 3px solid var(--brand); background: var(--bg); display: grid; place-items: center; color: var(--on-brand); transition: background var(--t-med), border-color var(--t-med); }
.stops li.passed { color: var(--muted); }
.stops li.passed .node { background: var(--stale); border-color: var(--stale); }
.counts { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.count { font: 500 11px var(--font-mono); padding: 4px 8px; border-radius: 99px; }
.count.board { background: var(--ok-bg); color: var(--brand); }
.count.wait { background: var(--warn-bg); color: var(--warn); }
.count.off { background: var(--surface-2); color: var(--muted); }

/* boarding code */
.code-input { width: 100%; min-height: 68px; text-align: center; text-transform: uppercase; font: 500 34px var(--font-mono); letter-spacing: .3em; padding-left: .3em; color: var(--ink); background: var(--bg); border: 2px solid var(--line); border-radius: var(--r-md); transition: border-color var(--t-fast), box-shadow var(--t-fast); }
.code-input::placeholder { color: var(--stale); letter-spacing: .2em; }
.code-input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand) 20%, transparent); }
.confirm { width: 100%; min-height: 52px; font-size: 16px; }

/* position source */
.pos-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.pos-note { margin-top: 8px; font-size: 14px; color: var(--muted); }
.switch { flex: none; display: inline-flex; align-items: center; gap: 8px; padding: 4px 12px 4px 4px; border: 1.5px solid var(--line); border-radius: 99px; background: var(--bg); font: 600 12px var(--font-body); transition: border-color var(--t-fast), background var(--t-med); }
.knob { width: 22px; height: 22px; border-radius: 50%; background: var(--stale); transition: transform var(--t-med) var(--ease), background var(--t-med); }
.switch.on { border-color: var(--signal); background: var(--warn-bg); }
.switch.on .knob { background: var(--signal); transform: translateX(2px); }
.manual { display: flex; flex-direction: column; }
.manual-block { display: flex; flex-direction: column; gap: 10px; padding-top: 12px; border-top: 1px solid var(--line); }
.advance { align-self: flex-start; }
.coords { font: 500 12px var(--font-mono); color: var(--muted); }
.coord-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.reveal-enter-active, .reveal-leave-active { transition: opacity .2s ease, transform .25s var(--ease); }
.reveal-enter-from, .reveal-leave-to { opacity: 0; transform: translateY(-6px); }

/* end shift */
.end { flex-direction: row; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.end > div { flex: 1; min-width: 180px; }
.end .muted { margin-top: 8px; }

/* layover */
.layover { display: flex; flex-direction: column; gap: 16px; }
.layover-ico { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; background: var(--signal); color: var(--on-signal); }
.bus-info { display: flex; align-items: center; gap: 12px; padding-top: 4px; }

@media (min-width: 900px) {
  .stage { padding: 28px 32px 40px; gap: 20px; }
  .grid { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 20px; }
  .col { gap: 20px; }
  .hero { flex-direction: row; align-items: flex-end; justify-content: space-between; padding: 24px; }
  .subbar { padding: 12px 32px; }
  .broadcast { margin: 12px 32px 0; }
}
</style>
