<template>
  <div ref="mapEl" class="live-map"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const props = defineProps({
  routes: { type: Array, default: () => [] },
  // Set of routeIds that currently have at least one live bus on them
  activeRouteIds: { type: Object, default: () => new Set() },
  // Array of { tripId, lat, lng, plateNumber, model, occupancy, seatsTotal, locationUpdatedAt }
  shuttles: { type: Array, default: () => [] },
  // Opt-in student presence: { userId, name, lat, lng, locationUpdatedAt }
  presence: { type: Array, default: () => [] },
  // Bus-relative user report from the server: { tripId, busLocation, nearestStop, users[] }
  nearbyReport: { type: Object, default: null }
});

const emit = defineEmits(['select-bus']);

const mapEl = ref(null);
let map = null;
let routeLayerGroup = null;
let presenceLayerGroup = null;
const shuttleMarkers = new Map(); // tripId -> L.Marker
let staleTicker = null;

// Centroid of the North Gate → Shehu Idris Link corridor (Samaru campus)
const ABU_ZARIA_CENTER = [11.1477050, 7.6448618];
const STALE_MS = 10000;

// divIcon-based shuttle marker — deliberately avoids L.Icon.Default (broken asset URLs under Vite)
const shuttleIcon = (stale) =>
  L.divIcon({
    className: '', // suppress default leaflet-div-icon chrome
    html: `<div class="shuttle-glyph ${stale ? 'shuttle-stale' : ''}">🚌</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18]
  });

const isStale = (s) => !s.locationUpdatedAt || Date.now() - new Date(s.locationUpdatedAt).getTime() > STALE_MS;

const popupHtml = (s) => {
  const secondsAgo = s.locationUpdatedAt
    ? Math.max(0, Math.round((Date.now() - new Date(s.locationUpdatedAt).getTime()) / 1000))
    : null;
  const lat = typeof s.lat === 'number' ? s.lat.toFixed(5) : '?';
  const lng = typeof s.lng === 'number' ? s.lng.toFixed(5) : '?';
  const speedLine = s.speedKmh
    ? `<span>Speed: ${Math.round(s.speedKmh)} km/h</span><br/>`
    : '';
  const besideLine = s.currentStopName
    ? `<span>Beside: <strong>${s.currentStopName}</strong></span><br/>`
    : '';
  return `
    <div class="shuttle-popup">
      <strong>${s.plateNumber || 'SHUTTLE'}</strong><br/>
      <span>${s.model || ''}</span><br/>
      <span>Occupancy: ${s.occupancy ?? '?'} / ${s.seatsTotal ?? '?'}</span><br/>
      ${besideLine}${speedLine}<span>Location: ${lat}, ${lng}</span><br/>
      <span>${secondsAgo === null ? 'No fix yet' : `Updated ${secondsAgo}s ago`}</span>
    </div>`;
};

const drawRoutes = () => {
  if (!map) return;
  if (routeLayerGroup) routeLayerGroup.remove();
  routeLayerGroup = L.layerGroup().addTo(map);

  const allPoints = [];
  for (const route of props.routes) {
    const stops = [...(route.stops || [])].sort((a, b) => a.index - b.index);
    const latlngs = stops.map((s) => [s.lat, s.lng]);
    if (latlngs.length === 0) continue;
    allPoints.push(...latlngs);

    // Routes with a live bus render boldly; idle routes fade into context
    const isLive = props.activeRouteIds?.has?.(String(route._id));
    const line = isLive
      ? { color: '#0D2137', weight: 4, opacity: 0.85 }
      : { color: '#8A8880', weight: 2, opacity: 0.35, dashArray: '5 6' };

    const routeName = route.name || '';
    L.polyline(latlngs, line)
      .bindTooltip(isLive ? routeName : `${routeName} (no bus running)`, { sticky: true })
      .addTo(routeLayerGroup);

    for (const stop of stops) {
      L.circleMarker([stop.lat, stop.lng], {
        radius: isLive ? 5 : 3,
        color: isLive ? '#1D9E75' : '#8A8880',
        weight: 2,
        fillColor: '#FFFFFF',
        fillOpacity: isLive ? 1 : 0.6
      })
        .bindTooltip(stop.name)
        .addTo(routeLayerGroup);
    }
  }

  if (allPoints.length > 1) {
    map.fitBounds(L.latLngBounds(allPoints), { padding: [30, 30] });
  }
};

// Student presence markers — blue pins, dropped from any peer heartbeat
const presenceIcon = L.divIcon({
  className: '',
  html: `<div class="presence-glyph">👤</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
  popupAnchor: [0, -26]
});

const syncPresence = () => {
  if (!map) return;
  if (presenceLayerGroup) presenceLayerGroup.remove();
  presenceLayerGroup = L.layerGroup().addTo(map);

  for (const p of props.presence) {
    if (p.lat == null || p.lng == null) continue;
    const secs = p.locationUpdatedAt
      ? Math.round((Date.now() - new Date(p.locationUpdatedAt).getTime()) / 1000)
      : null;
    L.marker([p.lat, p.lng], { icon: presenceIcon })
      .bindPopup(
        `<div class="shuttle-popup"><strong>${p.name || 'Student'}</strong><br/>` +
        `<span>${secs === null ? 'No fix' : `Updated ${secs}s ago`}</span></div>`
      )
      .addTo(presenceLayerGroup);
  }
};

// Distance label for one peer, used inside the bus-relative report popup
const formatDistance = (m) => (m >= 1000 ? (m / 1000).toFixed(2) + ' km' : m + ' m');

// Crow-flies ETA for a student's own distance from the bus, at a conservative
// 20 km/h campus average (their distance is not on the route polyline, so it
// cannot be measured along the road the way bus-to-stop ETAs are).
const formatEta = (m) => {
  const minutes = Math.ceil((m / 1000 / 20) * 60);
  return minutes <= 1 ? '<1 min' : minutes + ' min';
};

const presenceRowHtml = (u) => `
  <div class="presence-row">
    <span class="presence-row-name">${u.name || 'Student'}</span>
    <span class="presence-row-dist">${formatDistance(u.distanceMeters)} · ${formatEta(u.distanceMeters)}</span>
  </div>`;

const nearbyReportHtml = (r) => {
  const head = `
    <div class="nearby-head">
      <strong>Students near this bus</strong><br/>
      <span>Bus at ${r.busLocation.lat.toFixed(5)}, ${r.busLocation.lng.toFixed(5)}</span><br/>
      ${r.nearestStop
        ? `<span>${formatDistance(r.nearestStop.distanceMeters)} · ${formatEta(r.nearestStop.distanceMeters)} from ${r.nearestStop.name}</span>`
        : '<span>Nearest stop unavailable</span>'}
    </div>`;
  const body = r.users.length
    ? r.users.map(presenceRowHtml).join('')
    : '<div class="presence-empty">No students sharing location nearby.</div>';
  return `<div class="nearby-report">${head}${body}</div>`;
};

// Diff-sync marker registry against the shuttles prop
const syncShuttles = () => {
  if (!map) return;
  const liveIds = new Set();

  for (const s of props.shuttles) {
    if (s.lat == null || s.lng == null) continue;
    const key = String(s.tripId);
    liveIds.add(key);

    let marker = shuttleMarkers.get(key);
    if (!marker) {
      marker = L.marker([s.lat, s.lng], { icon: shuttleIcon(isStale(s)) }).addTo(map);
      // Asking for the bus-relative student report whenever a bus is clicked
      marker.on('click', () => emit('select-bus', s.tripId));
      shuttleMarkers.set(key, marker);
    } else {
      marker.setLatLng([s.lat, s.lng]);
      marker.setIcon(shuttleIcon(isStale(s)));
    }
    marker.bindPopup(popupHtml(s));

    // Attach/refresh the bus-relative student list once the server has answered
    const report = props.nearbyReport;
    if (report && String(report.tripId) === key && report.busLocation) {
      marker.setPopupContent(popupHtml(s) + nearbyReportHtml(report));
    }
  }

  // Remove markers for trips no longer streaming
  for (const [key, marker] of shuttleMarkers) {
    if (!liveIds.has(key)) {
      marker.remove();
      shuttleMarkers.delete(key);
    }
  }
};

onMounted(() => {
  map = L.map(mapEl.value).setView(ABU_ZARIA_CENTER, 14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  drawRoutes();
  syncShuttles();
  syncPresence();

  // Periodically re-evaluate staleness so paused streams turn amber without new events
  staleTicker = setInterval(syncShuttles, 3000);
});

watch(() => props.routes, drawRoutes, { deep: true });
watch(() => props.shuttles, syncShuttles, { deep: true });
watch(() => props.presence, syncPresence, { deep: true });
// Re-apply popup content when the bus-relative report lands or refreshes
watch(() => props.nearbyReport, syncShuttles, { deep: true });
// Re-style routes when a bus arrives/leaves so live vs idle emphasis stays correct
watch(() => Array.from(props.activeRouteIds ?? []).join(','), drawRoutes);

onUnmounted(() => {
  if (staleTicker) clearInterval(staleTicker);
  if (map) {
    map.remove();
    map = null;
  }
  shuttleMarkers.clear();
});
</script>

<style>
/* Unscoped on purpose: divIcon/popup HTML is injected outside Vue's scope attribute reach */
.live-map { width: 100%; height: 100%; border-radius: 12px; z-index: 0; }
.shuttle-glyph {
  width: 34px; height: 34px; border-radius: 999px;
  background: #1D9E75; border: 2px solid #0D2137;
  display: flex; align-items: center; justify-content: center;
  font-size: 17px; box-sizing: border-box;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
.shuttle-stale { background: #BA7517; }
.shuttle-popup { font-size: 12px; line-height: 1.6; }

/* Opt-in student presence pins */
.presence-glyph {
  width: 26px; height: 26px; border-radius: 999px;
  background: #378ADD; border: 2px solid #FFFFFF;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; box-sizing: border-box;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

/* Bus-relative student list rendered inside the bus popup */
.nearby-report { margin-top: 8px; padding-top: 8px; border-top: 1px solid #E6E5E1; }
.nearby-head { line-height: 1.6; margin-bottom: 6px; }
.presence-row {
  display: flex; justify-content: space-between; gap: 12px;
  padding: 3px 0; font-size: 12px;
}
.presence-row-name { color: #0D2137; }
.presence-row-dist { color: #1D9E75; font-family: monospace; font-weight: 600; white-space: nowrap; }
.presence-empty { font-size: 11px; color: #5F5E5A; font-style: italic; }
</style>
