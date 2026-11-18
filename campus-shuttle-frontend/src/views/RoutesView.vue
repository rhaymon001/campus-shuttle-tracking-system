<template>
  <div class="page">
    <header class="page-head rise">
      <p class="eyebrow">Campus network</p>
      <h1>Routes</h1>
      <p class="lede">Pick a route, choose your stop, and hold a seat before the shuttle arrives.</p>
    </header>

    <Transition name="alert">
      <div v-if="nearbyAlert" class="banner banner-ok" role="status">
        <Bus :size="18" />
        <span>Your shuttle is approaching <strong>{{ nearbyAlert.stopName }}</strong>, about {{ nearbyAlert.etaMinutes }} min away. Get ready to board.</span>
        <button class="banner-dismiss" aria-label="Dismiss" @click="nearbyAlert = null"><X :size="16" /></button>
      </div>
    </Transition>

    <div v-if="loading" class="routes-stack"><div class="skeleton"></div><div class="skeleton"></div></div>

    <div v-else class="routes-stack">
      <article v-for="(route, i) in routes" :key="route._id" class="route-card rise" :class="{ open: expandedRouteId === route._id }" :style="{ '--i': i + 1 }">
        <div class="route-main">
          <div class="route-details">
            <div class="title-row">
              <h3 class="route-title">{{ route.name }}</h3>
              <span v-if="(route.activeBuses || 0) > 0" class="chip chip-live"><i></i>{{ route.activeBuses }} running</span>
              <span v-else class="chip chip-muted"><i></i>No bus now</span>
            </div>
            <p class="route-direction" v-if="route.direction">{{ route.direction }}</p>
          </div>
          <dl class="route-meta-list">
            <div><dt>Distance</dt><dd>{{ route.distance }}</dd></div>
            <div><dt>Stops</dt><dd>{{ route.stops?.length || 0 }}</dd></div>
          </dl>
        </div>

        <ol class="stop-line" aria-label="Stops on this route">
          <li v-for="(stop, si) in route.stops" :key="stop.name" :class="{ end: si === 0 || si === route.stops.length - 1 }">
            <span class="pin"></span><span class="nm">{{ stop.name }}</span>
          </li>
        </ol>

        <div class="route-actions">
          <button
            @click="toggleQueueDrawer(route)"
            class="btn action-toggle-btn"
            :class="{ 'btn-ghost': expandedRouteId === route._id && !(activePass && activePass.routeId === route._id) }"
          >
            <Ticket :size="16" />
            {{ expandedRouteId === route._id ? 'Close panel' : (activePass && activePass.routeId === route._id ? 'View active pass' : 'Join queue') }}
          </button>
        </div>

        <Transition name="drawer">
          <div v-if="expandedRouteId === route._id" class="queue-drawer">
            <div v-if="activePass && activePass.routeId === route._id" class="ticket-pass-display">
              <div v-if="activePass.waitlisted" class="chip chip-warn"><i></i>Waitlisted · position #{{ activePass.waitlistPosition }}</div>
              <div v-else class="chip chip-ok"><i></i>Boarding pass active</div>
              <p class="pass-msg">{{ activePass.message }}</p>

              <div class="ticket" :class="{ waiting: activePass.waitlisted }">
                <p v-if="activePass.destStopName" class="pass-route-dest">
                  <span>{{ activePass.stopName }}</span><ArrowRight :size="15" /><strong>{{ activePass.destStopName }}</strong>
                </p>
                <div v-if="!activePass.waitlisted" class="boarding-code-box">{{ activePass.code }}</div>
                <div class="pass-expiry">
                  {{ activePass.waitlisted ? 'Pass confirms automatically when a seat opens' : 'Expires in' }}
                  <span v-if="!activePass.waitlisted" class="time-countdown tnum" :class="{ urgent: countdownText.startsWith('00:') }">{{ countdownText }}</span>
                </div>
              </div>

              <div class="pass-actions">
                <button @click="clearActivePass" class="clear-pass-btn">Clear and book another</button>
                <button @click="cancelBoardingPass" class="btn btn-sm btn-danger" :disabled="cancellingPass">
                  {{ cancellingPass ? 'Cancelling…' : 'Cancel pass' }}
                </button>
              </div>
            </div>

            <div v-else class="queue-form">
              <h4 class="drawer-title">Hold a seat</h4>

              <label class="field">
                <span>1 · Boarding stop</span>
                <select v-model="queueForm.stopName" class="select" @change="queueForm.destStopName = ''">
                  <option value="" disabled>Choose where you’re waiting</option>
                  <option v-for="stop in route.stops" :key="stop.name" :value="stop.name">{{ stop.name }}</option>
                </select>
              </label>

              <label class="field" v-if="queueForm.stopName">
                <span>2 · Destination</span>
                <select v-model="queueForm.destStopName" class="select">
                  <option value="" disabled>Choose where you’ll get off</option>
                  <option v-for="stop in destStopOptions" :key="stop.name" :value="stop.name">{{ stop.name }}</option>
                </select>
              </label>

              <div class="field">
                <span>3 · Shuttle</span>
                <div v-if="loadingTrips" class="form-subtext">Looking for running shuttles…</div>
                <div v-else-if="activeTrips.length === 0" class="banner banner-warn"><AlertTriangle :size="16" /><span>No shuttle is running on this route right now.</span></div>
                <select v-else v-model="queueForm.tripId" class="select">
                  <option value="" disabled>Choose an approaching shuttle</option>
                  <option v-for="trip in activeTrips" :key="trip._id" :value="trip._id">
                    {{ trip.shuttleId?.model || 'Shuttle' }} · {{ trip.shuttleId?.plateNumber || 'No plate' }} · {{ trip.seatsCurrentOccupancy }}/{{ trip.seatsTotal }} seats
                  </option>
                </select>
              </div>

              <button
                @click="requestBoardingPass(route._id)"
                class="btn submit-queue-btn"
                :disabled="processingQueue || !queueForm.stopName || !queueForm.destStopName || !queueForm.tripId"
              >
                {{ processingQueue ? 'Getting your code…' : 'Get boarding code' }}
              </button>
            </div>
          </div>
        </Transition>
      </article>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, reactive, computed, watch } from 'vue';
import { useToast } from '../composables/useToast';
import { Bus, Ticket, ArrowRight, AlertTriangle, X } from 'lucide-vue-next';
import apiClient from '../api/axios';
import { useShuttleSocket } from '../composables/useShuttleSocket';
import { useAuthStore } from '../stores/auth';

const routes = ref([]);
const loading = ref(true);
const authStore = useAuthStore();
const { on } = useShuttleSocket();

// Queue Drawer management states
const expandedRouteId = ref(null);
const activeTrips = ref([]);
const loadingTrips = ref(false);
const processingQueue = ref(false);
const cancellingPass = ref(false);
const nearbyAlert = ref(null);

const queueForm = reactive({
  stopName: '',
  destStopName: '',
  tripId: ''
});

const queueError = ref('');

// Active token pass state object cache storage
const activePass = ref(null);

// ⚡️ NEW: Ticking clock state to drive the dynamic UI countdown relative loops
const now = ref(Date.now());
let countdownInterval = null;

// ⚡️ NEW: Centralized function to spin up the clock runner loop
const startCountdownTicker = () => {
  if (countdownInterval) clearInterval(countdownInterval);
  
  countdownInterval = setInterval(() => {
    now.value = Date.now();
    
    // Auto-wipe validation rule evaluation loop executed every second
    if (activePass.value) {
      const expirationTimestamp = new Date(activePass.value.expiresAt).getTime();
      if (expirationTimestamp <= now.value) {
        console.warn('Virtual boarding token has expired. Releasing queue lock.');
        clearActivePass();
      }
    }
  }, 1000);
};

// ⚡️ NEW: Reactive formatted countdown rendering block logic
// Stops strictly ahead of the chosen boarding stop become destination choices —
// the bus only moves forward along its directional route.
const destStopOptions = computed(() => {
  const route = routes.value.find((r) => r._id === expandedRouteId.value);
  if (!route || !queueForm.stopName) return [];
  const stops = [...(route.stops || [])].sort((a, b) => a.index - b.index);
  const boardingIndex = stops.find((s) => s.name === queueForm.stopName)?.index ?? Infinity;
  return stops.filter((s) => s.index > boardingIndex);
});

const countdownText = computed(() => {
  if (!activePass.value) return '00:00';
  
  const differenceMilliseconds = new Date(activePass.value.expiresAt).getTime() - now.value;
  if (differenceMilliseconds <= 0) return '00:00';
  
  const totalSeconds = Math.floor(differenceMilliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  // Pad left with zeros to guarantee high precision standard mm:ss output formats
  const formattedMinutes = minutes.toString().padStart(2, '0');
  const formattedSeconds = seconds.toString().padStart(2, '0');
  
  return `${formattedMinutes}:${formattedSeconds}`;
});

// ⚡️ NEW: Handles clean deletion across client reactive spaces and storage profiles simultaneously
const clearActivePass = () => {
  activePass.value = null;
  localStorage.removeItem('shuttle_active_pass');
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
};

onMounted(async () => {
  // ⚡️ Socket listener: backend sweeper expired our pass
  on('reservation:expired', ({ userId }) => {
    if (activePass.value && String(userId) === String(authStore.user?.id)) {
      clearActivePass();
    }
  });

  // ⚡️ Socket listener: cancelled from another tab or admin action
  on('reservation:cancelled', ({ userId, reservationId }) => {
    if (activePass.value && String(userId) === String(authStore.user?.id) && String(reservationId) === String(activePass.value.reservationId)) {
      clearActivePass();
    }
  });

  // ⚡️ Socket listener: waitlisted pass promoted to active boarding code
  on('waitlist:promoted', ({ userId, reservationId, code, expiresAt }) => {
    if (activePass.value && String(userId) === String(authStore.user?.id) && String(reservationId) === String(activePass.value.reservationId)) {
      activePass.value.waitlisted = false;
      activePass.value.code = code;
      activePass.value.expiresAt = expiresAt;
      activePass.value.message = 'A seat has opened! Boarding pass is now active.';
      localStorage.setItem('shuttle_active_pass', JSON.stringify(activePass.value));
      now.value = Date.now();
      startCountdownTicker();
    }
  });

  // ⚡️ Socket listener: bus proximity alert for active pass holders
  on('server:shuttle_nearby', ({ userId, stopName, etaMinutes }) => {
    if (activePass.value && String(userId) === String(authStore.user?.id)) {
      nearbyAlert.value = { stopName, etaMinutes };
    }
  });

  // ⚡️ NEW: Check and restore active reservation state out of storage upon layout initialization
  const cachedPassData = localStorage.getItem('shuttle_active_pass');
  if (cachedPassData) {
    try {
      const parsedPass = JSON.parse(cachedPassData);
      const isStillValid = new Date(parsedPass.expiresAt).getTime() > Date.now();
      
      if (isStillValid) {
        activePass.value = parsedPass;
        expandedRouteId.value = parsedPass.routeId; // Re-expand the panel for better visibility
        if (!parsedPass.waitlisted) startCountdownTicker();
      } else {
        localStorage.removeItem('shuttle_active_pass');
      }
    } catch (err) {
      console.error('Failed to parse cached telemetry pass:', err);
      localStorage.removeItem('shuttle_active_pass');
    }
  }

  // ⚡️ NEW: Reconcile the cached pass against server-side truth (promotions/cancellations
  // that happened before this page loaded aren't replayed by the socket, so REST re-sync)
  if (activePass.value?.reservationId) {
    try {
      const { data } = await apiClient.get(`/reservations/${activePass.value.reservationId}`);
      // Keep the cached destination fresh for passes issued before this field existed
      if (data.destStopName) activePass.value.destStopName = data.destStopName;
      if (data.status !== 'pending') {
        clearActivePass();
      } else if (data.waitlisted) {
        activePass.value.waitlisted = true;
        activePass.value.waitlistPosition = data.waitlistPosition;
        localStorage.setItem('shuttle_active_pass', JSON.stringify(activePass.value));
      } else if (!activePass.value.waitlisted) {
        activePass.value.code = data.confirmationCode;
        activePass.value.expiresAt = data.expiresAt;
        localStorage.setItem('shuttle_active_pass', JSON.stringify(activePass.value));
        now.value = Date.now();
        startCountdownTicker();
      } else {
        // Cached as waitlisted but server says it's now active → promote in place
        activePass.value.waitlisted = false;
        activePass.value.code = data.confirmationCode;
        activePass.value.expiresAt = data.expiresAt;
        activePass.value.message = 'A seat has opened! Boarding pass is now active.';
        localStorage.setItem('shuttle_active_pass', JSON.stringify(activePass.value));
        now.value = Date.now();
        startCountdownTicker();
      }
    } catch (err) {
      console.error('Failed to reconcile reservation state:', err);
    }
  }

  try {
    const res = await apiClient.get('/transit/routes');
    routes.value = res.data;
  } catch (err) {
    console.error('Error loading routes:', err);
  } finally {
    loading.value = false;
  }
});

// ⚡️ NEW: Clean up asynchronous background intervals during DOM updates to prevent memory leaks
onUnmounted(() => {
  if (countdownInterval) clearInterval(countdownInterval);
});

// Opens the drawer and pulls active loops/trips from the database instance matching the route
const toggleQueueDrawer = async (route) => {
  if (expandedRouteId.value === route._id) {
    expandedRouteId.value = null;
    return;
  }
  
  expandedRouteId.value = route._id;
  queueForm.stopName = '';
  queueForm.destStopName = '';
  queueForm.tripId = '';
  queueError.value = '';
  
  // Fetch matching live tracking trips running under this route layout context
  loadingTrips.value = true;
  activeTrips.value = [];
  try {
    const res = await apiClient.get(`/trips?routeId=${route._id}`);
    activeTrips.value = res.data;
  } catch (err) {
    console.error('Error fetching live telemetry trips context:', err);
    activeTrips.value = [];
  } finally {
    loadingTrips.value = false;
  }
};

// Submits configuration directly to the issue endpoint
const requestBoardingPass = async (routeId) => {
  processingQueue.value = true;
  queueError.value = '';
  try {
    const response = await apiClient.post('/reservations/issue', {
      tripId: queueForm.tripId,
      stopName: queueForm.stopName,
      destStopName: queueForm.destStopName
    });

    // Save token data payload to state
    const isWaitlisted = response.data.waitlisted === true;
    activePass.value = {
      routeId: routeId,
      reservationId: response.data._id,
      message: response.data.message,
      code: response.data.code || null,
      expiresAt: response.data.expiresAt,
      waitlisted: isWaitlisted,
      waitlistPosition: response.data.waitlistPosition || null,
      stopName: response.data.stopName || queueForm.stopName,
      destStopName: response.data.destStopName || queueForm.destStopName
    };

    // ⚡️ NEW: Save parameters to storage to maintain session through browser operations
    localStorage.setItem('shuttle_active_pass', JSON.stringify(activePass.value));
    
    // ⚡️ NEW: Activate clock counting procedures immediately
    now.value = Date.now();
    if (!isWaitlisted) startCountdownTicker();

  } catch (err) {
    console.error('Queue allocation request failed:', err);
    queueError.value = err.response?.data?.message || 'Queue tracking error occurred. Please try again.';
  } finally {
    processingQueue.value = false;
  }
};

// Cancels the current active boarding pass via the backend
const cancelBoardingPass = async () => {
  if (!activePass.value?.reservationId) return;
  cancellingPass.value = true;
  try {
    await apiClient.post('/reservations/cancel', { reservationId: activePass.value.reservationId });
    clearActivePass();
  } catch (err) {
    console.error('Cancel reservation failed:', err);
    alert(err.response?.data?.message || 'Failed to cancel pass. Please try again.');
  } finally {
    cancellingPass.value = false;
  }
};

// Queue/booking errors surface as a toast at the top of the page, not inside the route card
const toast = useToast();
watch(queueError, (message) => {
  if (message) { toast.error(message); queueError.value = ''; }
});
</script>

<style scoped>
.page { max-width: 1200px; margin: 0 auto; padding: 28px 16px 24px; }
.page-head { margin-bottom: 24px; }
.page-head h1 { font-size: clamp(36px, 6vw, 56px); font-weight: 700; letter-spacing: -.04em; margin: 10px 0 8px; }
.lede { color: var(--muted); max-width: 52ch; }

.banner { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 10px; font-size: 14px; line-height: 1.4; margin-bottom: 16px; }
.banner svg { flex: none; margin-top: 2px; }
.banner-ok { background: var(--ok-bg); color: var(--brand); box-shadow: inset 3px 0 0 var(--brand); }
.banner-danger { background: var(--danger-bg); color: var(--live); box-shadow: inset 3px 0 0 var(--live); margin: 0; }
.banner-warn { background: var(--warn-bg); color: var(--warn); box-shadow: inset 3px 0 0 var(--warn); margin: 0; }
.banner-dismiss { margin-left: auto; border: 0; background: none; color: inherit; padding: 0; display: grid; }
.alert-enter-active, .alert-leave-active { transition: opacity .25s ease, transform .3s var(--ease); }
.alert-enter-from, .alert-leave-to { opacity: 0; transform: translateY(-8px); }

.routes-stack { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); }
.skeleton { height: 190px; border-radius: var(--r-md); background: linear-gradient(100deg, var(--surface) 30%, var(--surface-2) 50%, var(--surface) 70%) 0 0 / 200% 100%; animation: shimmer 1.4s linear infinite; }
@keyframes shimmer { to { background-position: -200% 0; } }

.route-card { min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); padding: 20px; display: flex; flex-direction: column; gap: 18px; transition: border-color var(--t-fast), transform var(--t-med) var(--ease); }
.route-card:hover { border-color: var(--brand); }
.route-main { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.title-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.route-title { font-size: 24px; font-weight: 700; letter-spacing: -.03em; }
.route-direction { margin-top: 6px; color: var(--muted); font-size: 13px; }
.route-meta-list { display: flex; gap: 22px; margin: 0; }
.route-meta-list dt { font: 500 11px var(--font-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.route-meta-list dd { margin: 3px 0 0; font: 700 20px var(--font-display); letter-spacing: -.02em; }

/* Stops as a line diagram */
.stop-line { list-style: none; margin: 0; padding: 4px 0 0; display: flex; gap: 0; overflow-x: auto; scrollbar-width: thin; }
.stop-line li { position: relative; flex: 0 0 auto; min-width: 104px; padding-top: 22px; padding-right: 12px; font-size: 12px; color: var(--muted); }
.stop-line li::before { content: ''; position: absolute; top: 6px; left: 6px; right: 0; height: 3px; background: repeating-linear-gradient(90deg, var(--brand) 0 3px, transparent 3px 8px); opacity: .55; }
.stop-line li:last-child::before { display: none; }
.stop-line .pin { position: absolute; top: 0; left: 0; width: 14px; height: 14px; border-radius: 50%; background: var(--bg); border: 3px solid var(--brand); transition: transform var(--t-med) var(--ease); }
.stop-line li.end .pin { background: var(--brand); }
.stop-line li:hover .pin { transform: scale(1.35); }
.stop-line li.end .nm { color: var(--ink); font-weight: 600; }

.route-actions { display: flex; margin-top: auto; }
.title-row .chip { text-transform: none; }
.action-toggle-btn { width: 100%; }
@media (min-width: 640px) { .action-toggle-btn { width: auto; } }

/* Queue drawer */
.queue-drawer { background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-md); padding: 18px; display: flex; flex-direction: column; gap: 18px; transform-origin: top; }
.drawer-enter-active { animation: drawerIn .38s var(--ease); }
.drawer-leave-active { transition: opacity .15s ease; }
.drawer-leave-to { opacity: 0; }
@keyframes drawerIn { from { opacity: 0; transform: translateY(-8px); clip-path: inset(0 0 100% 0); } to { opacity: 1; transform: none; clip-path: inset(0); } }
.drawer-title { font-size: 18px; }
.form-subtext { font-size: 13px; color: var(--muted); }
.submit-queue-btn { width: 100%; min-height: 46px; margin-top: 4px; }

/* Boarding pass */
.ticket-pass-display { display: flex; flex-direction: column; align-items: stretch; gap: 14px; }
.ticket-pass-display > .chip { align-self: flex-start; }
.pass-msg { font-size: 14px; color: var(--muted); }
.ticket { position: relative; background: var(--brand); color: var(--on-brand); border-radius: var(--r-md); padding: 22px 20px 18px; text-align: center; animation: ticketIn .55s var(--ease); }
.ticket.waiting { background: var(--surface-2); color: var(--ink); }
.ticket::before, .ticket::after { content: ''; position: absolute; top: 58%; width: 18px; height: 18px; border-radius: 50%; background: var(--bg); }
.ticket::before { left: -9px; } .ticket::after { right: -9px; }
@keyframes ticketIn { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } }
.pass-route-dest { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 14px; opacity: .92; flex-wrap: wrap; }
.boarding-code-box { font: 500 clamp(34px, 9vw, 46px)/1 var(--font-mono); letter-spacing: .18em; margin: 16px 0 14px; padding-left: .18em; }
.pass-expiry { font-size: 12px; opacity: .85; padding-top: 14px; border-top: 1.5px dashed currentColor; border-top-color: color-mix(in srgb, currentColor 40%, transparent); }
.time-countdown { font: 500 15px var(--font-mono); margin-left: 6px; }
.time-countdown.urgent { color: var(--signal); animation: blink 1s steps(2) infinite; }
@keyframes blink { 50% { opacity: .45; } }
.pass-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.clear-pass-btn { background: none; border: 0; color: var(--muted); font-size: 13px; text-decoration: underline; padding: 0; }

@media (min-width: 720px) {
  .page { padding: 40px 32px 48px; }
}
@media (min-width: 1100px) {
  .routes-stack { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .route-card.open { grid-column: 1 / -1; }
}
</style>
