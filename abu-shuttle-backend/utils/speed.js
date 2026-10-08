// utils/speed.js — derives a smoothed observed speed (km/h) from a trip's own
// consecutive GPS fixes, so ETAs stop relying on a hardcoded average.
//
// A shuttle stopped at a gate or jumping across campus in the manual simulator
// would otherwise swing the ETA wildly, so samples outside a plausible campus
// band are dropped and the last good speed is retained.
import { haversineMeters } from './geo.js';

export const DEFAULT_SPEED_KMH = 20; // used until a trip has produced a valid sample
const MIN_PLAUSIBLE_KMH = 5;
const MAX_PLAUSIBLE_KMH = 45;
const MIN_SAMPLE_GAP_SEC = 0.5;

const history = new Map(); // tripId -> { lat, lng, ts, kmh }

// Records a fix and returns the trip's current smoothed speed (km/h), or null
// when no usable sample exists yet.
export const observeSpeed = (tripId, lat, lng, ts = Date.now()) => {
  const key = String(tripId);
  const prev = history.get(key);

  if (!prev) {
    history.set(key, { lat, lng, ts, kmh: null });
    return null;
  }

  const dtSec = (ts - prev.ts) / 1000;
  if (dtSec < MIN_SAMPLE_GAP_SEC) return prev.kmh;

  const instant = (haversineMeters(prev.lat, prev.lng, lat, lng) / dtSec) * 3.6;
  let kmh = prev.kmh;
  if (instant >= MIN_PLAUSIBLE_KMH && instant <= MAX_PLAUSIBLE_KMH) {
    kmh = kmh == null ? instant : kmh * 0.6 + instant * 0.4; // EMA, dampens GPS jitter
  }

  history.set(key, { lat, lng, ts, kmh });
  return kmh;
};

export const getSpeed = (tripId) => history.get(String(tripId))?.kmh ?? null;

export const clearSpeed = (tripId) => history.delete(String(tripId));
