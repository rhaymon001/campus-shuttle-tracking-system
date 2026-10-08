<template>
  <div class="workspace-grid">
    <div v-if="broadcastAlert" class="broadcast-banner">
      ⚠️ {{ broadcastAlert }}
      <button class="banner-dismiss" @click="broadcastAlert = ''">✕</button>
    </div>

    <div class="map-viewport-panel">
      <div class="panel-header-label">LIVE CAMPUS GEOSPATIAL MAP</div>
      <div class="map-canvas">
        <LiveMap
          @select-bus="handleSelectBus"
          :routes="routes"
          :shuttles="shuttleMarkers"
          :active-route-ids="liveRouteIds"
          :presence="presencePins"
          :nearby-report="nearbyReport"
        />
      </div>
      <div class="map-legend">
        <span class="legend-item"><span class="dot dot-teal"></span> Moving</span>
        <span class="legend-item"><span class="dot dot-amber"></span> Stale Signal</span>
        <span class="legend-item"><span class="dot dot-blue"></span> Student Sharing</span>
      </div>

      <div class="presence-controls">
        <button
          class="presence-toggle"
          :class="{ 'presence-on': sharingMyLocation }"
          @click="toggleLocationSharing"
        >
          {{ sharingMyLocation ? '📍 Sharing my location — tap to stop' : '📍 Share my location' }}
        </button>
        <p class="presence-hint">
          Opt-in only. While sharing, other students viewing this map see your pin and,
          when they tap a bus, how far you are from it.
        </p>
      </div>
    </div>

    <div class="shuttle-feed-panel">
      <div class="panel-header-label">ACTIVE VEHICLE STATUS FLOW</div>
      
      <div v-if="loading" class="loading-state">
        Scanning campus telemetry loops...
      </div>

      <div v-else-if="activeTrips.length === 0" class="empty-state-card">
        <p>⚠️ No active shuttle instances are currently dispatched on any transit loops.</p>
      </div>

      <div v-else class="cards-stack">
        <div v-for="trip in activeTrips" :key="trip._id" class="shuttle-card">
          <div class="shuttle-header">
            <div class="shuttle-identity">
              <span class="shuttle-code">{{ trip.shuttleId?.plateNumber || 'SHUTTLE' }}</span>
              <span class="badge" :class="statusBadgeClass(trip.status)">
                {{ trip.status }}
              </span>
            </div>
            <span class="route-tag">{{ trip.routeId?.name || 'Unassigned Route' }}</span>
          </div>
          
          <div class="shuttle-body">
            <div class="info-row">
              <span class="muted">Model Configuration:</span>
              <span>{{ trip.shuttleId?.model || 'N/A' }}</span>
            </div>
            
            <div class="info-row">
              <span class="muted"><User :size="12" class="inline-icon"/> Driver:</span>
              <span>{{ trip.driverId?.name || 'Unassigned' }}</span>
            </div>

            <div class="info-row">
              <span class="muted"><MapPin :size="12" class="inline-icon"/> Next Stop:</span>
              <span class="highlight-stop">{{ nextStopLabel(trip) }}</span>
            </div>
            
            <div class="occupancy-section">
              <div class="occupancy-labels">
                <span class="muted">Occupancy Loading ({{ trip.seatsCurrentOccupancy }}/{{ trip.seatsTotal }} seats)</span>
                <span class="occupancy-pct">{{ calculateOccupancyPercentage(trip) }}%</span>
              </div>
              <div class="occupancy-bar-track">
                <div 
                  class="occupancy-fill" 
                  :class="occupancyFillClass(calculateOccupancyPercentage(trip))"
                  :style="{ width: calculateOccupancyPercentage(trip) + '%' }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { User, MapPin } from 'lucide-vue-next';
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
const toggleLocationSharing = () => {
  if (sharingMyLocation.value) {
    sharingMyLocation.value = false;
    if (presenceWatchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(presenceWatchId);
      presenceWatchId = null;
    }
    if (presenceHeartbeat) { clearInterval(presenceHeartbeat); presenceHeartbeat = null; }
    socket.emit('user:location', { lat: 0, lng: 0, sharing: false });
    presencePins.value = presencePins.value.filter((p) => String(p.userId) !== String(authStore.user?.id));
    return;
  }

  if (!navigator.geolocation) {
    alert('Your browser does not support geolocation.');
    return;
  }

  sharingMyLocation.value = true;
  presenceWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      socket.emit('user:location', { lat: latitude, lng: longitude, sharing: true });
    },
    (err) => {
      sharingMyLocation.value = false;
      alert(`Could not share location: ${err.message}`);
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
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
</script>

<style scoped>
.workspace-grid { display: flex; flex-direction: column; gap: 16px; }
.panel-header-label { font-size: 11px; font-weight: 500; text-transform: uppercase; color: #5F5E5A; padding-bottom: 6px; border-bottom: 0.5px solid rgba(0, 0, 0, 0.1); margin-bottom: 12px; }
.cards-stack { display: flex; flex-direction: column; gap: 12px; }
.shuttle-card { background: #FFFFFF; border: 0.5px solid rgba(0, 0, 0, 0.10); border-radius: 12px; padding: 16px; }
.shuttle-header { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.shuttle-code { font-family: monospace; font-weight: 600; font-size: 14px; letter-spacing: 0.15em; color: #1D9E75; }
.badge { font-size: 11px; font-weight: 500; padding: 2px 10px; border-radius: 999px; text-transform: capitalize; width: max-content; }
.badge-active { background: #E1F5EE; color: #0F6E56; }
.badge-delayed { background: #FFF9E6; color: #BA7517; }
.route-tag { font-size: 12px; color: #5F5E5A; margin-top: 2px; font-weight: 500; }
.shuttle-body { display: flex; flex-direction: column; gap: 6px; }
.info-row { display: flex; justify-content: space-between; font-size: 13px; align-items: center; }
.muted { color: #5F5E5A; }
.highlight-stop { color: #0D2137; font-weight: 600; }
.inline-icon { display: inline; margin-right: 4px; vertical-align: middle; }
.occupancy-section { margin-top: 10px; }
.occupancy-labels { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; }
.occupancy-bar-track { height: 5px; background: #F4F3EF; border-radius: 999px; overflow: hidden; }
.occupancy-fill { height: 100%; border-radius: 999px; transition: width 0.4s ease, background-color 0.3s ease; }

/* Dynamic Occupancy Color Palettes */
.teal-fill { background: #1D9E75; }
.warning-fill { background: #BA7517; }
.danger-fill { background: #D9383A; }

.loading-state { font-size: 13px; color: #5F5E5A; text-align: center; padding: 40px 0; font-style: italic; }
.empty-state-card { background: #FFFFFF; border: 0.5px solid rgba(0, 0, 0, 0.10); border-radius: 12px; padding: 32px 16px; text-align: center; font-size: 13px; color: #5F5E5A; }

.map-canvas { background: #FFFFFF; border: 0.5px solid rgba(0, 0, 0, 0.10); border-radius: 12px; height: 300px; overflow: hidden; box-sizing: border-box; }
.map-legend { display: flex; justify-content: center; gap: 12px; margin-top: 8px; }
.legend-item { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #5F5E5A; }
.dot { width: 6px; height: 6px; border-radius: 999px; display: inline-block; }
.dot-teal { background: #1D9E75; }
.dot-amber { background: #BA7517; }
.dot-blue { background: #378ADD; }

.presence-controls { margin-top: 10px; }
.presence-toggle {
  width: 100%; background: #FFFFFF; border: 1px solid #378ADD; color: #1E5FA8;
  font-size: 12px; font-weight: 500; padding: 8px 14px; border-radius: 8px;
  cursor: pointer; transition: all 0.2s ease;
}
.presence-toggle:hover { background: #F2F7FC; }
.presence-on { background: #378ADD; color: #FFFFFF; border-color: #378ADD; }
.presence-hint { font-size: 11px; color: #5F5E5A; margin: 6px 0 0; line-height: 1.5; }

.broadcast-banner { display: flex; align-items: center; gap: 8px; background: #FFF9E6; color: #BA7517; font-size: 13px; padding: 10px 14px; border-radius: 10px; border: 0.5px solid rgba(186, 117, 23, 0.3); }
.banner-dismiss { margin-left: auto; background: transparent; border: none; color: #BA7517; cursor: pointer; font-size: 13px; }

@media (min-width: 768px) {
  .workspace-grid { display: grid; grid-template-columns: 400px 1fr; gap: 12px; }
  .broadcast-banner { grid-column: 1 / -1; }
  .shuttle-feed-panel { order: 1; }
  .map-viewport-panel { order: 2; }
  .shuttle-header { flex-direction: row; justify-content: space-between; align-items: flex-start; }
  .route-tag { text-align: right; margin-top: 0; max-width: 50%; }
  .map-canvas { height: 494px; }
}
</style>