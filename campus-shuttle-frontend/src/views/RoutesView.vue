<template>
  <div class="page-container">
    <div class="panel-header-label">CAMPUS SHUTTLE ROUTES</div>

    <div v-if="nearbyAlert" class="proximity-banner">
      🚌 Your bus is approaching <strong>{{ nearbyAlert.stopName }}</strong> (approx. {{ nearbyAlert.etaMinutes }} min away) — Prepare to board!
      <button class="banner-dismiss" @click="nearbyAlert = null">✕</button>
    </div>
    
    <div v-if="loading" class="loading-state">Fetching campus routes...</div>
    
    <div v-else class="routes-stack">
      <div v-for="route in routes" :key="route._id" class="route-card">
        <div class="route-main">
          <div class="route-icon-track">
            <div class="station-dot teal-dot"></div>
            <div class="connecting-line"></div>
            <div class="station-dot navy-dot"></div>
          </div>
          
          <div class="route-details">
            <h3 class="route-title">{{ route.name }}</h3>
            <p class="route-direction" v-if="route.direction">{{ route.direction }}</p>
            <p class="route-stops">
              <span class="muted">Path:</span> {{ route.stops?.map(stop => stop.name).join(' → ') }}
            </p>
          </div>
        </div>
        
        <div class="route-meta">
          <div class="meta-left">
            <div class="meta-pill">
              <span class="muted">Distance:</span> <span>{{ route.distance }}</span>
            </div>
            <div class="meta-pill">
              <span class="muted">Active Buses:</span> <span class="highlight-teal">{{ route.activeBuses || 0 }}</span>
            </div>
          </div>
          
          <button 
            @click="toggleQueueDrawer(route)" 
            class="action-toggle-btn"
            :class="{ 'btn-active': expandedRouteId === route._id || (activePass && activePass.routeId === route._id) }"
          >
            {{ expandedRouteId === route._id ? 'Close Panel' : (activePass && activePass.routeId === route._id ? 'View Active Pass' : 'Join Queue') }}
          </button>
        </div>

        <div v-if="expandedRouteId === route._id" class="queue-drawer">
          <div v-if="activePass && activePass.routeId === route._id" class="ticket-pass-display">
            <div v-if="activePass.waitlisted" class="waitlist-badge">⏳ Waitlisted — Position #{{ activePass.waitlistPosition }}</div>
            <div v-else class="pass-success-badge">🎉 Boarding Pass Active</div>
            <p class="pass-msg">{{ activePass.message }}</p>
            <p v-if="activePass.destStopName" class="pass-route-dest">
              {{ activePass.stopName }} → <strong>{{ activePass.destStopName }}</strong>
            </p>
            
            <div v-if="!activePass.waitlisted" class="boarding-code-box">
              {{ activePass.code }}
            </div>
            
            <div class="pass-expiry">
              {{ activePass.waitlisted ? 'Pass auto-confirms when a seat opens' : `Expires in:` }}
              <span v-if="!activePass.waitlisted" class="time-countdown">{{ countdownText }}</span>
            </div>
            <div class="pass-actions">
              <button @click="clearActivePass" class="clear-pass-btn">Clear / Book Another</button>
              <button @click="cancelBoardingPass" class="cancel-pass-btn" :disabled="cancellingPass">
                {{ cancellingPass ? 'Cancelling...' : 'Cancel Pass' }}
              </button>
            </div>
          </div>

          <div v-else class="queue-form">
            <h4 class="drawer-title">Virtual Queue Boarding Panel</h4>

            <div v-if="queueError" class="queue-error-banner">
              ⚠️ {{ queueError }}
              <button class="banner-dismiss" @click="queueError = ''">✕</button>
            </div>

            <div class="form-group">
              <label class="form-label">1. Select Your Current Boarding Stop</label>
              <select v-model="queueForm.stopName" class="form-select" @change="queueForm.destStopName = ''">
                <option value="" disabled>-- Choose a bus shelter stop --</option>
                <option v-for="stop in route.stops" :key="stop.name" :value="stop.name">
                  {{ stop.name }}
                </option>
              </select>
            </div>

            <div class="form-group" v-if="queueForm.stopName">
              <label class="form-label">2. Select Your Destination Stop</label>
              <select v-model="queueForm.destStopName" class="form-select">
                <option value="" disabled>-- Choose where you'll alight --</option>
                <option v-for="stop in destStopOptions" :key="stop.name" :value="stop.name">
                  {{ stop.name }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">3. Select an Active Shuttle Bus</label>
              <div v-if="loadingTrips" class="form-subtext">Scanning campus telemetry...</div>
              <div v-else-if="activeTrips.length === 0" class="no-trips-warning">
                ⚠️ No active shuttle instances are running on this track right now.
              </div>
              <select v-else v-model="queueForm.tripId" class="form-select">
                <option value="" disabled>-- Choose an approaching vehicle --</option>
                <option v-for="trip in activeTrips" :key="trip._id" :value="trip._id">
                  {{ trip.shuttleId?.model || 'Shuttle' }} [{{ trip.shuttleId?.plateNumber || 'No Plate' }}] 
                  (Seats: {{ trip.seatsCurrentOccupancy }}/{{ trip.seatsTotal }})
                </option>
              </select>
            </div>

            <button 
              @click="requestBoardingPass(route._id)" 
              class="submit-queue-btn"
              :disabled="processingQueue || !queueForm.stopName || !queueForm.destStopName || !queueForm.tripId"
            >
              {{ processingQueue ? 'Allocating Queue Token...' : 'Generate Boarding Code Pass' }}
            </button>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, reactive, computed } from 'vue';
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
.loading-state { font-size: 13px; color: #5F5E5A; text-align: center; padding: 40px 0; }
.routes-stack { display: flex; flex-direction: column; gap: 12px; }
.route-card {
  background: #FFFFFF;
  border: 0.5px solid rgba(0, 0, 0, 0.10);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.route-main { display: flex; gap: 16px; }
.route-icon-track { display: flex; flex-direction: column; align-items: center; padding-top: 4px; }
.station-dot { width: 8px; height: 8px; border-radius: 999px; }
.teal-dot { background: #1D9E75; }
.navy-dot { background: #0D2137; }
.connecting-line { width: 1px; flex: 1; background: rgba(0, 0, 0, 0.1); margin: 4px 0; min-height: 24px; }
.route-details { flex: 1; }
.route-title { font-size: 15px; font-weight: 500; margin: 0 0 4px 0; color: #1A1A18; }
.route-direction { font-size: 11px; color: #5F5E5A; font-style: italic; margin: 0 0 3px 0; }
.route-stops { font-size: 13px; margin: 0; color: #1A1A18; line-height: 1.4; }
.muted { color: #5F5E5A; }
.route-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 0.5px solid rgba(0, 0, 0, 0.05);
  padding-top: 12px;
}
.meta-left { display: flex; gap: 8px; }
.meta-pill {
  background: #F4F3EF;
  font-size: 11px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 6px;
  display: flex;
  gap: 4px;
}
.highlight-teal { color: #1D9E75; font-weight: 600; }

.action-toggle-btn {
  background: #0D2137;
  color: #FFFFFF;
  border: none;
  font-size: 12px;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.action-toggle-btn.btn-active {
  background: #5F5E5A;
}
.queue-drawer {
  background: #F4F3EF;
  border-radius: 8px;
  padding: 14px;
  border-left: 4px solid #0D2137;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.drawer-title { margin: 0 0 4px 0; font-size: 13px; font-weight: 600; color: #0D2137; text-transform: uppercase; letter-spacing: 0.02em; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-label { font-size: 11px; font-weight: 500; color: #5F5E5A; }
.form-select {
  padding: 8px;
  font-size: 13px;
  border-radius: 6px;
  border: 0.5px solid rgba(0,0,0,0.15);
  background: #FFFFFF;
  color: #1A1A18;
  outline: none;
}
.form-subtext { font-size: 12px; color: #5F5E5A; font-style: italic; }
.no-trips-warning { font-size: 12px; color: #BA7517; background: #FFF9E6; padding: 6px 10px; border-radius: 4px; }
.queue-error-banner { display: flex; align-items: center; gap: 8px; background: #FDECEC; color: #D9383A; font-size: 12px; padding: 8px 10px; border-radius: 6px; }
.submit-queue-btn {
  width: 100%;
  background: #1D9E75;
  color: #FFFFFF;
  border: none;
  padding: 10px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease;
  margin-top: 6px;
}
.submit-queue-btn:disabled {
  background: rgba(0,0,0,0.08);
  color: rgba(0,0,0,0.3);
  cursor: not-allowed;
}

/* TICKET PASS STATE GRAPHICS */
.ticket-pass-display { text-align: center; padding: 8px 0; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.pass-success-badge { background: #E1F5EE; color: #0F6E56; font-size: 11px; font-weight: 600; padding: 2px 10px; border-radius: 999px; text-transform: uppercase; }
.waitlist-badge { background: #FFF9E6; color: #BA7517; font-size: 11px; font-weight: 600; padding: 2px 10px; border-radius: 999px; text-transform: uppercase; }
.pass-msg { font-size: 13px; color: #1A1A18; margin: 0; }
.pass-route-dest { font-size: 13px; color: #0D2137; margin: 0; }
.pass-route-dest strong { color: #1D9E75; }
.boarding-code-box {
  background: #FFFFFF;
  border: 1.5px dashed #1D9E75;
  color: #0D2137;
  font-family: monospace;
  font-weight: 700;
  font-size: 26px;
  letter-spacing: 0.2em;
  padding: 10px 24px;
  border-radius: 8px;
  margin: 6px 0;
  display: inline-block;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}
.pass-expiry { font-size: 12px; color: #5F5E5A; }
.time-countdown { font-family: monospace; font-weight: 600; color: #D9383A; }
.pass-actions { display: flex; gap: 12px; align-items: center; justify-content: center; margin-top: 4px; }
.clear-pass-btn { background: transparent; border: none; color: #5F5E5A; text-decoration: underline; font-size: 11px; cursor: pointer; }
.cancel-pass-btn { background: transparent; border: 1px solid #D9383A; color: #D9383A; font-size: 11px; font-weight: 500; padding: 4px 12px; border-radius: 6px; cursor: pointer; transition: all 0.2s ease; }
.cancel-pass-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.cancel-pass-btn:hover:not(:disabled) { background: #D9383A; color: #FFFFFF; }
.proximity-banner { display: flex; align-items: center; gap: 8px; background: #E1F5EE; color: #0F6E56; font-size: 13px; padding: 10px 14px; border-radius: 10px; border: 0.5px solid rgba(29, 158, 117, 0.3); margin-bottom: 12px; }
.banner-dismiss { margin-left: auto; background: transparent; border: none; color: #0F6E56; cursor: pointer; font-size: 13px; }
</style>