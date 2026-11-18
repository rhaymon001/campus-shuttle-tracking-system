<template>
  <div class="stage">
    <div class="map-pane">
      <LiveMap
        @select-bus="handleSelectBus"
        @map-click="tuckPanel"
        :routes="routes"
        :shuttles="shuttleMarkers"
        :active-route-ids="liveRouteIds"
        :presence="presencePins"
        :nearby-report="nearbyReport"
      />
    </div>

    <aside ref="panelEl" class="panel">
      <button class="grab" type="button" aria-label="Show or hide the shuttle list" @click="togglePanel"><span></span></button>
      <header class="panel-head" @click="togglePanel">
        <div class="head-row">
          <span class="chip chip-live"><i></i>Live</span>
          <div class="counts">
            <span><strong><RollNumber :value="activeTrips.length" /></strong> shuttles</span>
            <span><strong><RollNumber :value="routes.length" /></strong> routes</span>
          </div>
        </div>
        <h1>Where’s my shuttle?</h1>
      </header>

      <Transition name="alert">
        <div v-if="broadcastAlert" class="banner banner-warn" role="alert">
          <AlertTriangle :size="16" />
          <span>{{ broadcastAlert }}</span>
          <button class="banner-dismiss" aria-label="Dismiss" @click="broadcastAlert = ''"><X :size="16" /></button>
        </div>
      </Transition>

      <div class="feed">
        <div v-if="loading" class="state">
          <div class="skeleton"></div><div class="skeleton"></div>
        </div>

        <div v-else-if="activeTrips.length === 0" class="state empty">
          <Radio :size="22" />
          <p><strong>No shuttles are running right now.</strong><br />Check the schedules for the next departure.</p>
        </div>

        <TransitionGroup v-else name="card" tag="div" class="cards-stack">
          <article v-for="(trip, i) in activeTrips" :key="trip._id" class="shuttle-card" :style="{ '--i': i }">
            <header class="shuttle-header">
              <div class="shuttle-identity">
                <span class="shuttle-code">{{ trip.shuttleId?.plateNumber || 'SHUTTLE' }}</span>
                <span class="chip" :class="trip.status === 'delayed' ? 'chip-warn' : 'chip-ok'"><i></i>{{ trip.status }}</span>
              </div>
              <span class="route-tag">{{ trip.routeId?.name || 'Unassigned route' }}</span>
            </header>

            <div class="next">
              <span class="eyebrow"><MapPin :size="11" class="inline-icon" /> Next stop</span>
              <p class="highlight-stop">{{ nextStopLabel(trip) }}</p>
            </div>

            <dl class="info">
              <div><dt>Model</dt><dd>{{ trip.shuttleId?.model || 'N/A' }}</dd></div>
              <div><dt><User :size="11" class="inline-icon" /> Driver</dt><dd>{{ trip.driverId?.name || 'Unassigned' }}</dd></div>
            </dl>

            <div class="occupancy-section">
              <div class="occupancy-labels">
                <span>{{ trip.seatsCurrentOccupancy }} of {{ trip.seatsTotal }} seats taken</span>
                <span class="occupancy-pct tnum">{{ calculateOccupancyPercentage(trip) }}%</span>
              </div>
              <div class="occupancy-bar-track">
                <div class="occupancy-fill" :class="occupancyFillClass(calculateOccupancyPercentage(trip))" :style="{ width: calculateOccupancyPercentage(trip) + '%' }"></div>
              </div>
            </div>
          </article>
        </TransitionGroup>
      </div>

      <footer class="panel-foot">
        <div class="map-legend">
          <span class="legend-item"><span class="dot dot-moving"></span>Moving</span>
          <span class="legend-item"><span class="dot dot-stale"></span>Stale signal</span>
          <span class="legend-item"><span class="dot dot-blue"></span>Student sharing</span>
        </div>
        <button class="btn btn-sm presence-toggle" :class="{ 'btn-ghost': !sharingMyLocation }" :aria-pressed="sharingMyLocation" @click="toggleLocationSharing">
          <component :is="sharingMyLocation ? LocateFixed : LocateOff" :size="15" />
          {{ !sharingMyLocation ? 'Share my location' : locationState === 'live' ? 'Sharing my location · tap to stop' : 'Finding you… · tap to cancel' }}
        </button>
        <p class="presence-hint">{{ sharingMyLocation && locationState !== 'live' ? 'Looking for your position. Indoors this can take a minute; near a window or outdoors is quicker.' : 'Opt-in only. While sharing, other students see your pin and how far you are from a bus they tap.' }}</p>
      </footer>
    </aside>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { User, MapPin, AlertTriangle, X, Radio, LocateFixed, LocateOff } from 'lucide-vue-next';
import RollNumber from '../components/RollNumber.vue';
import { useToast } from '../composables/useToast';
import { locationUnavailableReason, explainLocationError } from '../utils/locationErrors';
import apiClient from '../api/axios';
import LiveMap from '../components/LiveMap.vue';
import { useShuttleSocket } from '../composables/useShuttleSocket';
import { useAuthStore } from '../stores/auth';

const { socket, on, joinRoute } = useShuttleSocket();
const authStore = useAuthStore();

const activeTrips = ref([]);
const routes = ref([]);
const shuttleMarkers = ref([]); // [{tripId, lat, lng, plateNumber, model, occupancy, seatsTotal, locationUpdatedAt}]
const etaByTrip = ref({});      // tripId -> nearest-stop ETA payload
const broadcastAlert = ref('');
const loading = ref(true);
const presencePins = ref([]);       // opt-in student locations from peer heartbeats
const nearbyReport = ref(null);     // bus-relative student list for the clicked bus
const sharingMyLocation = ref(false);
let liveTelemetryPoll = null;
let presenceWatchId = null;
let presenceHeartbeat = null;

// Route ids that currently have at least one dispatched bus — drives live vs idle map styling
const liveRouteIds = computed(() =>
  new Set(activeTrips.value.map((t) => String(t.routeId?._id || t.routeId)))
);

// Build map marker entries from the REST trip payload (seeded by driverLocation merge)
const markersFromTrips = (trips) =>
  trips
    .filter((t) => t.driverLocation?.lat != null)
    .map((t) => {
      // REST polls rebuild markers from scratch; carry the live-broadcast "beside"
      // stop over from the existing marker so the popup doesn't blink it out.
      const existing = shuttleMarkers.value.find((m) => String(m.tripId) === String(t._id));
      return {
        tripId: t._id,
        lat: t.driverLocation.lat,
        lng: t.driverLocation.lng,
        plateNumber: t.shuttleId?.plateNumber,
        model: t.shuttleId?.model,
        occupancy: t.seatsCurrentOccupancy,
        seatsTotal: t.seatsTotal,
        locationUpdatedAt: t.locationUpdatedAt,
        currentStopName: existing?.currentStopName ?? null,
        currentStopIndex: existing?.currentStopIndex ?? -1
      };
    });

// Fetches live tracking trips from backend controller pipeline
const fetchLiveTelemetry = async (isFirstLoad = false) => {
  if (isFirstLoad) loading.value = true;
  try {
    // Aligns with backend trip pipeline. Excludes closed or historical trips
    const res = await apiClient.get('/trips');
    activeTrips.value = res.data.filter(t => t.status === 'active' || t.status === 'delayed');
    shuttleMarkers.value = markersFromTrips(activeTrips.value);
  } catch (err) {
    console.error('Error streaming live telemetry status flow:', err);
  } finally {
    if (isFirstLoad) loading.value = false;
  }
};

const fetchRoutes = async () => {
  try {
    const res = await apiClient.get('/transit/routes');
    routes.value = res.data;
    // Subscribe to every route's live telemetry room
    routes.value.forEach((r) => joinRoute(r._id));
  } catch (err) {
    console.error('Error fetching campus routes:', err);
  }
};

// Live socket telemetry: upsert the moving marker + refresh the matching feed card
const handleEtaUpdate = (payload) => {
  const key = String(payload.tripId);

  const idx = shuttleMarkers.value.findIndex((m) => String(m.tripId) === key);
  const trip = activeTrips.value.find((t) => String(t._id) === key);
  const entry = {
    tripId: payload.tripId,
    lat: payload.lat,
    lng: payload.lng,
    plateNumber: trip?.shuttleId?.plateNumber,
    model: trip?.shuttleId?.model,
    occupancy: payload.occupancy,
    seatsTotal: payload.seatsTotal,
    speedKmh: payload.speedKmh,
    locationUpdatedAt: payload.locationUpdatedAt,
    currentStopName: payload.lastPassedStopName ?? null,
    currentStopIndex: payload.lastPassedIndex ?? -1
  };
  if (idx === -1) shuttleMarkers.value.push(entry);
  else shuttleMarkers.value[idx] = { ...shuttleMarkers.value[idx], ...entry };

  if (trip) trip.seatsCurrentOccupancy = payload.occupancy;

  // Track the nearest upcoming stop for the card's "Next Stop" line.
  // Stops the bus has already driven past are excluded so they never show as 0 min.
  if (payload.etaPerStop?.length) {
    const upcoming = payload.etaPerStop.filter((s) => !s.passed && s.etaMinutes != null);
    if (upcoming.length) {
      etaByTrip.value[key] = upcoming.reduce((a, b) => (a.etaMinutes <= b.etaMinutes ? a : b));
    } else {
      delete etaByTrip.value[key];
    }
  }
};

const nextStopLabel = (trip) => {
  const eta = etaByTrip.value[String(trip._id)];
  if (eta) return `${eta.name} (~${eta.etaMinutes} min)`;
  return 'En Route / Terminus';
};

// Computes current live bus seating absorption percentage 
const calculateOccupancyPercentage = (trip) => {
  if (!trip.seatsTotal || trip.seatsTotal <= 0) return 0;
  const percentage = (trip.seatsCurrentOccupancy / trip.seatsTotal) * 100;
  return Math.min(100, Math.max(0, Math.round(percentage)));
};

// Generates reactive badge designs based on the operational status payload
const statusBadgeClass = (status) => {
  if (status === 'delayed') return 'badge-delayed';
  return 'badge-active'; // defaults to active/moving styles
};

// Shunts progress bar indicators to amber if safety margins trigger high load thresholds
const occupancyFillClass = (percentage) => {
  if (percentage >= 85) return 'danger-fill';
  if (percentage >= 60) return 'warning-fill';
  return 'teal-fill';
};

onMounted(() => {
  // Execute instantaneous stream catch on layout startup
  fetchLiveTelemetry(true);
  fetchRoutes();

  // Live telemetry channel handlers
  on('server:eta_update', handleEtaUpdate);
  on('trip:started', () => fetchLiveTelemetry(false));
  on('trip:ended', ({ tripId }) => {
    activeTrips.value = activeTrips.value.filter((t) => String(t._id) !== String(tripId));
    shuttleMarkers.value = shuttleMarkers.value.filter((m) => String(m.tripId) !== String(tripId));
    delete etaByTrip.value[String(tripId)];
  });
  on('admin:broadcast', ({ message }) => { broadcastAlert.value = message; });

  // Peer presence heartbeats from students who opted into location sharing
  on('server:presence_update', (payload) => {
    if (!payload?.sharing) {
      presencePins.value = presencePins.value.filter((p) => String(p.userId) !== String(payload.userId));
      return;
    }
    const idx = presencePins.value.findIndex((p) => String(p.userId) === String(payload.userId));
    if (idx === -1) presencePins.value.push(payload);
    else presencePins.value[idx] = { ...presencePins.value[idx], ...payload };
  });

  // Server-computed answer to "who is near this bus?"
  on('server:presence_near_bus', (report) => { nearbyReport.value = report; });

  // ⚡️ TELEMETRY HEARTBEAT: 10s REST reconciliation poll heals any missed socket events
  liveTelemetryPoll = setInterval(() => {
    fetchLiveTelemetry(false);
  }, 10000);
});

// Bus clicked on the map → ask the server which students are closest to it
const handleSelectBus = (tripId) => {
  if (!tripId) return;
  nearbyReport.value = null;
  socket.emit('presence:near_bus', { tripId });
};

// Opt-in location sharing: watchPosition feeds a 5s-throttled socket heartbeat
const locationState = ref('idle'); // idle | locating | live
const stopSharingLocation = () => {
  sharingMyLocation.value = false;
  locationState.value = 'idle';
  if (presenceWatchId != null && navigator.geolocation) navigator.geolocation.clearWatch(presenceWatchId);
  presenceWatchId = null;
};
const toggleLocationSharing = () => {
  if (sharingMyLocation.value) {
    sharingMyLocation.value = false;
    locationState.value = 'idle';
    if (presenceWatchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(presenceWatchId);
      presenceWatchId = null;
    }
    if (presenceHeartbeat) { clearInterval(presenceHeartbeat); presenceHeartbeat = null; }
    socket.emit('user:location', { lat: 0, lng: 0, sharing: false });
    presencePins.value = presencePins.value.filter((p) => String(p.userId) !== String(authStore.user?.id));
    return;
  }

  const unavailable = locationUnavailableReason();
  if (unavailable) {
    toast.error(unavailable);
    return;
  }

  sharingMyLocation.value = true;
  locationState.value = 'locating';
  let toldAboutSlowGps = false;

  const onFix = (pos) => {
    locationState.value = 'live';
    const { latitude, longitude } = pos.coords;
    socket.emit('user:location', { lat: latitude, lng: longitude, sharing: true });
  };

  // 1) A quick approximate fix (network/cell, or a recent cached one) so the pin appears straight away
  navigator.geolocation.getCurrentPosition(onFix, () => {}, { enableHighAccuracy: false, maximumAge: 120000, timeout: 10000 });

  // 2) Then refine with GPS. A slow or missing GPS signal is normal indoors, so only a refusal stops sharing.
  presenceWatchId = navigator.geolocation.watchPosition(
    onFix,
    (err) => {
      if (err.code === 1) {
        stopSharingLocation();
        toast.error(explainLocationError(err));
      } else if (!toldAboutSlowGps && locationState.value !== 'live') {
        toldAboutSlowGps = true;
        toast.info('Still looking for a GPS signal. Your pin appears as soon as we find you. A spot near a window or outdoors helps.');
      }
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
  );
};

onUnmounted(() => {
  // Clear asynchronous listeners to shield performance boundaries across component cycles
  if (liveTelemetryPoll) clearInterval(liveTelemetryPoll);
  if (presenceHeartbeat) clearInterval(presenceHeartbeat);
  if (presenceWatchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(presenceWatchId);
  }
});

const toast = useToast();

// Phone layout: shuttle sheet peeks over a full-screen map. Tapping the map (or scrolling back to the top) tucks it away.
const panelEl = ref(null);
const isPhoneLayout = () => window.matchMedia('(max-width: 899px)').matches;
const scrollBehavior = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

const tuckPanel = () => {
  if (isPhoneLayout() && window.scrollY > 4) window.scrollTo({ top: 0, behavior: scrollBehavior() });
};
const revealPanel = () => {
  if (!panelEl.value) return;
  const headerH = document.querySelector('.app-header')?.offsetHeight || 56;
  const y = panelEl.value.getBoundingClientRect().top + window.scrollY - headerH - 8;
  window.scrollTo({ top: y, behavior: scrollBehavior() });
};
const togglePanel = () => {
  if (!isPhoneLayout()) return;
  if (window.scrollY > 40) tuckPanel(); else revealPanel();
};
</script>

<style scoped>
/* Phones: the map fills the screen and stays put; the sheet peeks up from the bottom and slides over it as you scroll.
   Scrolling back to the top (or tapping the map) tucks it away. */
.stage { --peek: 118px; --map-h: calc(100dvh - var(--header-h) - var(--safe-t) - var(--nav-h) - var(--safe-b)); display: flex; flex-direction: column; }
.map-pane { position: sticky; top: calc(var(--header-h) + var(--safe-t)); height: var(--map-h); background: var(--surface); }
.panel { position: relative; z-index: 2; margin-top: calc(var(--peek) * -1); min-height: var(--map-h); background: var(--bg); border-radius: 22px 22px 0 0; padding: 8px 16px 8px; box-shadow: 0 -8px 28px rgb(15 26 19 / .16); display: flex; flex-direction: column; gap: 14px; }
.grab { display: grid; place-items: center; width: 100%; height: 22px; margin: 0; padding: 0; border: 0; background: none; }
.grab span { width: 44px; height: 5px; border-radius: 99px; background: var(--line); transition: background var(--t-fast), width var(--t-med) var(--ease); }
.grab:hover span { background: var(--stale); width: 56px; }
.panel-head { cursor: pointer; }
.head-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.counts { display: flex; gap: 14px; font-size: 13px; color: var(--muted); }
.counts strong { font: 700 20px var(--font-display); color: var(--ink); letter-spacing: -.02em; margin-right: 2px; }
h1 { font-size: 30px; font-weight: 700; letter-spacing: -.035em; }

.banner { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 10px; font-size: 14px; line-height: 1.4; }
.banner svg { flex: none; margin-top: 2px; }
.banner-warn { background: var(--warn-bg); color: var(--warn); box-shadow: inset 3px 0 0 var(--warn); }
.banner-dismiss { margin-left: auto; border: 0; background: none; color: inherit; padding: 0; display: grid; }
.alert-enter-active, .alert-leave-active { transition: opacity .25s ease, transform .3s var(--ease); }
.alert-enter-from, .alert-leave-to { opacity: 0; transform: translateY(-8px); }

.feed { min-height: 0; }
.cards-stack { display: flex; flex-direction: column; gap: 12px; position: relative; }
.shuttle-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); padding: 16px; display: flex; flex-direction: column; gap: 14px; transition: border-color var(--t-fast), transform var(--t-med) var(--ease); }
.shuttle-card:hover { border-color: var(--brand); transform: translateY(-2px); }
.shuttle-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.shuttle-identity { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.shuttle-code { font: 500 20px/1 var(--font-mono); letter-spacing: .06em; }
.route-tag { font: 600 12px var(--font-body); color: var(--brand); background: var(--ok-bg); padding: 5px 10px; border-radius: 8px; text-align: right; }
.next { display: flex; flex-direction: column; gap: 6px; }
.highlight-stop { font: 700 22px/1.15 var(--font-display); letter-spacing: -.02em; }
.inline-icon { vertical-align: -1px; }
.info { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 0; }
.info dt { font: 500 11px var(--font-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.info dd { margin: 3px 0 0; font-size: 14px; font-weight: 600; }
.occupancy-labels { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); margin-bottom: 7px; }
.occupancy-pct { font-weight: 700; color: var(--ink); }
.occupancy-bar-track { height: 8px; border-radius: 99px; background: var(--surface-2); overflow: hidden; }
.occupancy-fill { height: 100%; border-radius: 99px; transition: width .9s var(--ease), background var(--t-med); }
.teal-fill { background: var(--brand); }
.warning-fill { background: var(--signal); }
.danger-fill { background: var(--live); }

.card-enter-active { transition: opacity .45s var(--ease), transform .45s var(--ease); transition-delay: calc(var(--i, 0) * 70ms); }
.card-leave-active { transition: opacity .25s ease, transform .25s ease; position: absolute; left: 0; right: 0; }
.card-enter-from { opacity: 0; transform: translateY(14px); }
.card-leave-to { opacity: 0; transform: scale(.97); }
.card-move { transition: transform .4s var(--ease); }

.state { display: flex; flex-direction: column; gap: 12px; }
.state.empty { align-items: center; text-align: center; padding: 32px 16px; color: var(--muted); border: 1.5px dashed var(--line); border-radius: var(--r-md); gap: 10px; }
.state.empty strong { color: var(--ink); }
.skeleton { height: 150px; border-radius: var(--r-md); background: linear-gradient(100deg, var(--surface) 30%, var(--surface-2) 50%, var(--surface) 70%) 0 0 / 200% 100%; animation: shimmer 1.4s linear infinite; }
@keyframes shimmer { to { background-position: -200% 0; } }

.panel-foot { display: flex; flex-direction: column; gap: 10px; padding: 16px 0 12px; border-top: 1px solid var(--line); }
.map-legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: var(--muted); }
.legend-item { display: inline-flex; align-items: center; gap: 6px; }
.dot { width: 10px; height: 10px; border-radius: 50%; }
.dot-moving { background: var(--signal); box-shadow: 0 0 0 1.5px var(--ink); }
.dot-stale { background: var(--stale); }
.dot-blue { background: var(--info); }
.presence-toggle { align-self: flex-start; }
.presence-hint { font-size: 12px; color: var(--muted); max-width: 52ch; }

@media (min-width: 900px) {
  .stage { position: relative; display: block; height: calc(100dvh - var(--header-h) - var(--safe-t)); overflow: hidden; }
  .grab { display: none; }
  .panel-head { cursor: default; }
  .map-pane { position: absolute; inset: 0; height: auto; min-height: 0; }
  .panel { min-height: 0; position: absolute; left: 16px; top: 16px; bottom: 16px; width: 392px; margin: 0; border-radius: var(--r-lg); border: 1px solid var(--line); box-shadow: var(--shadow-2); padding: 20px 0 0; overflow: hidden; }
  .panel > .panel-head, .panel > .banner, .panel > .panel-foot { margin-left: 16px; margin-right: 16px; }
  .feed { flex: 1; overflow-y: auto; padding: 2px 16px 14px; overscroll-behavior: contain; }
  .panel-foot { padding: 14px 0 16px; }
}
</style>
