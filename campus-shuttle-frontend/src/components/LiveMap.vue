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

const emit = defineEmits(['select-bus', 'map-click']);

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
    className: 'shuttle-marker', // suppress default leaflet-div-icon chrome; also drives the glide transition
    html: `<div class="shuttle-glyph ${stale ? 'shuttle-stale' : ''}"><svg viewBox="0 0 38 28" aria-hidden="true"><rect class="body" x="2" y="3" width="34" height="18" rx="6"/><rect class="win" x="7" y="8" width="24" height="6" rx="2"/><circle class="wheel" cx="11" cy="23" r="3"/><circle class="wheel" cx="27" cy="23" r="3"/></svg></div>`,
    iconSize: [38, 28],
    iconAnchor: [19, 14],
    popupAnchor: [0, -16]
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
      ? { color: '#0B7A3E', weight: 5, opacity: 0.9, className: 'route-live', lineCap: 'round', lineJoin: 'round' }
      : { color: '#8E9A92', weight: 2, opacity: 0.5, dashArray: '5 6', className: 'route-idle' };

    const routeName = route.name || '';
    L.polyline(latlngs, line)
      .bindTooltip(isLive ? routeName : `${routeName} (no bus running)`, { sticky: true })
      .addTo(routeLayerGroup);

    for (const stop of stops) {
      L.circleMarker([stop.lat, stop.lng], {
        radius: isLive ? 6 : 3,
        color: isLive ? '#0B7A3E' : '#8E9A92',
        weight: 3,
        fillColor: '#FFFFFF',
        fillOpacity: isLive ? 1 : 0.6,
        className: isLive ? 'stop-live' : 'stop-idle'
      })
        .bindTooltip(stop.name)
        .addTo(routeLayerGroup);
    }
  }

  if (allPoints.length > 1) {
    const wide = window.innerWidth >= 900; // the floating shuttle panel covers the left side on wide screens
    map.fitBounds(L.latLngBounds(allPoints), {
      paddingTopLeft: [wide ? 440 : 30, 30],
      paddingBottomRight: [30, wide ? 30 : 150] // phones: keep the route clear of the peeking sheet
    });
  }
};

// Student presence markers — blue pins, dropped from any peer heartbeat
const presenceIcon = L.divIcon({
  className: '',
  html: `<div class="presence-glyph"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/></svg></div>`,
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
      marker._stale = isStale(s);
      // Asking for the bus-relative student report whenever a bus is clicked
      marker.on('click', () => emit('select-bus', s.tripId));
      shuttleMarkers.set(key, marker);
    } else {
      marker.setLatLng([s.lat, s.lng]);
      const stale = isStale(s);
      if (marker._stale !== stale) {
        marker.setIcon(shuttleIcon(stale));
        marker._stale = stale;
      }
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
  map = L.map(mapEl.value, { zoomControl: false }).setView(ABU_ZARIA_CENTER, 14);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.on('click', () => emit('map-click')); // lets the page tuck the mobile shuttle sheet away
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
.live-map { width: 100%; height: 100%; z-index: 0; background: var(--surface); font-family: var(--font-body); }

/* Soften OSM's palette so the route and shuttles carry the colour */
.live-map .leaflet-tile-pane { filter: saturate(.55) contrast(.97) brightness(1.02); }
@media (prefers-color-scheme: dark) {
  .live-map .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) saturate(.45) brightness(.82) contrast(.92); }
}

/* Routes and stops (classes beat SVG presentation attributes; CSS variables follow the theme) */
.live-map path.route-live { stroke: var(--brand); }
.live-map path.route-idle { stroke: var(--stale); }
.live-map path.stop-live { stroke: var(--brand); fill: var(--bg); }
.live-map path.stop-idle { stroke: var(--stale); fill: var(--bg); }

/* Phones: keep zoom + attribution above the peeking shuttle sheet */
@media (max-width: 899px) { .live-map .leaflet-bottom { bottom: 122px; } }

/* Shuttle marker glides between GPS fixes; zoom keeps Leaflet's own timing */
.leaflet-marker-icon.shuttle-marker { transition: transform 1.4s linear; }
.leaflet-zoom-anim .leaflet-marker-icon.shuttle-marker { transition: transform .25s cubic-bezier(0, 0, .25, 1); }
.shuttle-glyph { width: 38px; height: 28px; filter: drop-shadow(0 2px 3px rgb(0 0 0 / .35)); }
.shuttle-glyph svg { width: 100%; height: 100%; display: block; overflow: visible; }
.shuttle-glyph .body { fill: var(--signal); stroke: #0F1A13; stroke-width: 2.5; transition: fill .3s; }
.shuttle-glyph .win { fill: #0F1A13; opacity: .8; }
.shuttle-glyph .wheel { fill: #0F1A13; }
.shuttle-stale .body { fill: var(--stale); }
@media (prefers-color-scheme: dark) {
  .shuttle-glyph .body { stroke: #F7F3E3; }
  .shuttle-glyph .wheel { fill: #F7F3E3; }
}
.shuttle-popup { font-size: 13px; line-height: 1.6; }
.shuttle-popup strong:first-child { font: 500 15px var(--font-mono); letter-spacing: .06em; }

/* Opt-in student presence pins */
.presence-glyph { width: 26px; height: 26px; border-radius: 50%; background: var(--info); border: 2px solid #fff; box-shadow: 0 1px 4px rgb(0 0 0 / .35); display: grid; place-items: center; }
.presence-glyph svg { width: 14px; height: 14px; fill: #fff; }

/* Leaflet chrome, retuned to the tokens */
.live-map .leaflet-popup-content-wrapper { background: var(--bg); color: var(--ink); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow-2); }
.live-map .leaflet-popup-tip { background: var(--bg); border: 1px solid var(--line); }
.live-map .leaflet-popup-content { margin: 14px 16px; }
.live-map a.leaflet-popup-close-button { color: var(--muted); }
.live-map .leaflet-tooltip { background: var(--ink); color: var(--bg); border: 0; border-radius: 8px; box-shadow: var(--shadow-1); font: 600 12px var(--font-body); padding: 5px 9px; }
.live-map .leaflet-tooltip::before { display: none; }
.live-map .leaflet-bar { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; box-shadow: var(--shadow-1); }
.live-map .leaflet-bar a { background: var(--bg); color: var(--ink); border-bottom-color: var(--line); width: 38px; height: 38px; line-height: 38px; }
.live-map .leaflet-bar a:hover { background: var(--surface-2); }
.live-map .leaflet-control-attribution { background: color-mix(in srgb, var(--bg) 82%, transparent); color: var(--muted); font-size: 10px; }
.live-map .leaflet-control-attribution a { color: var(--muted); }

/* Bus-relative student list rendered inside the bus popup */
.nearby-report { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
.nearby-head { line-height: 1.6; margin-bottom: 6px; }
.presence-row { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; font-size: 12px; }
.presence-row-name { color: var(--ink); }
.presence-row-dist { color: var(--brand); font-family: var(--font-mono); font-weight: 500; white-space: nowrap; }
.presence-empty { font-size: 12px; color: var(--muted); font-style: italic; }
</style>
