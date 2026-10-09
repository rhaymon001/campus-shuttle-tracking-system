// utils/geo.js — geospatial math helpers for the live tracking engine

const EARTH_RADIUS_M = 6371000;

// Straight-line (great-circle) distance between two coordinate pairs in meters.
export const haversineMeters = (lat1, lng1, lat2, lng2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
};

// Projects a GPS fix onto the route polyline using a local equirectangular
// frame (metres) — accurate at campus scale. Returns which stop-to-stop
// segment the fix is nearest, and how far along that segment it sits (0..1).
export const projectAlongRoute = (lat, lng, stops = []) => {
  const ordered = [...stops].sort((a, b) => a.index - b.index);
  if (ordered.length < 2) return { segmentIndex: 0, fraction: 0, minDistanceMeters: 0 };

  const lat0 = (ordered[0].lat * Math.PI) / 180;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(lat0);
  const toXY = (p) => ({ x: p.lng * mPerDegLng, y: p.lat * mPerDegLat });
  const pt = { x: lng * mPerDegLng, y: lat * mPerDegLat };

  let best = { segmentIndex: 0, fraction: 0, minDistanceMeters: Infinity };

  for (let i = 0; i < ordered.length - 1; i++) {
    const a = toXY(ordered[i]);
    const b = toXY(ordered[i + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const dist = Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy));
    if (dist < best.minDistanceMeters) best = { segmentIndex: i, fraction: t, minDistanceMeters: dist };
  }
  return best;
};

// Road distance for one stop-to-stop pair, preferring the precomputed OSRM
// profile and falling back to crow-flies when that leg was never measured.
const legDistance = (segments, fromStop, toStop) => {
  const hit = (segments || []).find(
    (s) => s.fromIndex === fromStop.index && s.toIndex === toStop.index
  );
  if (hit && typeof hit.distanceMeters === 'number') return hit.distanceMeters;
  return haversineMeters(fromStop.lat, fromStop.lng, toStop.lat, toStop.lng);
};

// Cumulative road distance from the first stop to each stop index.
export const cumulativeRoadMeters = (stops = [], segments = null) => {
  const ordered = [...stops].sort((a, b) => a.index - b.index);
  const cum = [0];
  for (let i = 1; i < ordered.length; i++) {
    cum.push(cum[i - 1] + legDistance(segments, ordered[i - 1], ordered[i]));
  }
  return cum;
};

// ETA for every stop from the bus's live fix.
//
// With a road profile the fix is projected onto the route and each stop gets
// its true along-road remaining distance; stops the bus has already passed are
// flagged so consumers can exclude them from "nearest stop" logic instead of
// showing a bogus 0-minute arrival.
//
// Without a road profile (routes created before this feature, or router outage)
// this degrades to the original crow-flies estimate — never a hard failure.
export const computeEtaPerStop = (lat, lng, stops = [], avgSpeedKmh = 20, roadSegments = null) => {
  const metersPerMinute = (avgSpeedKmh * 1000) / 60;
  const ordered = [...stops].sort((a, b) => a.index - b.index);
  const useRoad = Array.isArray(roadSegments) && roadSegments.length > 0 && ordered.length > 1;

  const cum = useRoad ? cumulativeRoadMeters(ordered, roadSegments) : null;
  let roadPosition = null;
  if (useRoad) {
    const proj = projectAlongRoute(lat, lng, ordered);
    const legLength = cum[proj.segmentIndex + 1] - cum[proj.segmentIndex];
    roadPosition = cum[proj.segmentIndex] + proj.fraction * legLength;
  }

  return ordered.map((stop, i) => {
    const crowMeters = Math.round(haversineMeters(lat, lng, stop.lat, stop.lng));

    if (roadPosition == null) {
      return {
        index: stop.index,
        name: stop.name,
        distanceMeters: crowMeters,
        etaMinutes: Math.ceil(crowMeters / metersPerMinute),
        passed: false
      };
    }

    const remaining = cum[i] - roadPosition;
    // A stop is "passed" the moment the bus REACHES it (remaining === 0), not
    // only after it drives past. This keeps lastPassedIndex monotonic so the
    // "next stop" readout excludes the stop the bus is beside instead of
    // oscillating between the current and the upcoming stop.
    if (remaining <= 0) {
      return {
        index: stop.index,
        name: stop.name,
        distanceMeters: Math.round(-remaining),
        etaMinutes: null,
        passed: true
      };
    }
    return {
      index: stop.index,
      name: stop.name,
      distanceMeters: Math.round(remaining),
      etaMinutes: Math.ceil(remaining / metersPerMinute),
      passed: false
    };
  });
};

// Safe "closest upcoming stop" over an etaPerStop list — ignores passed stops.
export const nearestUpcomingStop = (etaPerStop = []) =>
  etaPerStop
    .filter((s) => !s.passed && s.etaMinutes != null)
    .reduce((a, b) => (a == null || b.etaMinutes < a.etaMinutes ? b : a), null) || null;

// Highest stop index the bus has already passed (-1 = still at/before the first
// stop). Auto-alight sweeps use this to free a seat the moment a passenger's
// destination stop slips behind the bus.
export const lastPassedStopIndexFromEta = (etaPerStop = []) =>
  etaPerStop.reduce((acc, s) => (s.passed ? Math.max(acc, s.index) : acc), -1);

// True when a GPS fix shows the bus has pulled away from the start of a route's
// first leg by at least `departMeters`. The gate for launching the return leg of
// an auto-turnaround during a layover. Projection is deliberately against the
// FIRST segment only, so parking AT the terminus stop (or any fix within the
// depart radius of it) keeps the return leg dormant until the vehicle moves.
export const isDepartedFromTerminus = (lat, lng, stops = [], roadSegments = null, departMeters = 20) => {
  const ordered = [...stops].sort((a, b) => a.index - b.index);
  if (ordered.length < 2) return true;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;

  const cum = cumulativeRoadMeters(ordered, roadSegments);
  const legMeters = cum[1] - cum[0];

  const lat0 = (ordered[0].lat * Math.PI) / 180;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(lat0);
  const toXY = (p) => ({ x: p.lng * mPerDegLng, y: p.lat * mPerDegLat });
  const pt = { x: lng * mPerDegLng, y: lat * mPerDegLat };
  const a = toXY(ordered[0]);
  const b = toXY(ordered[1]);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return t * legMeters >= departMeters;
};
