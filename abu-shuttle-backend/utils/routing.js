// utils/routing.js — road-network lookups via OSRM, with a straight-line fallback.
//
// The demo OSRM server is fine for development. Before production, self-host
// OSRM (or swap in Valhalla/Google Directions) via OSRM_BASE_URL.
import { haversineMeters } from './geo.js';

const OSRM_BASE = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
const OSRM_TIMEOUT_MS = 4000;

// Road distance + duration between two points. Falls back to crow-flies when
// the router is unreachable, so route creation never hard-fails on a timeout.
export const roadSegment = async (a, b) => {
  const straight = Math.round(haversineMeters(a.lat, a.lng, b.lat, b.lng));
  const url =
    `${OSRM_BASE}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false&alternatives=false`;

  // The OSRM demo server is flaky under load, so retry the leg once before
  // falling back to a straight line — keeps the profile internally consistent.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(OSRM_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`OSRM ${res.status}`);
      const data = await res.json();
      const route = data?.routes?.[0];
      if (!route) throw new Error('OSRM returned no route');
      return {
        distanceMeters: Math.round(route.distance),
        durationSeconds: Math.round(route.duration),
        source: 'road'
      };
    } catch (err) {
      if (attempt === 1) await new Promise((r) => setTimeout(r, 800));
      if (attempt === 2) {
        console.warn(`  OSRM leg ${a.index}->${b.index} unavailable (${err.message}); using straight-line`);
      }
    }
  }
  return { distanceMeters: straight, durationSeconds: null, source: 'straight' };
};

// Measures every consecutive stop-to-stop leg. Stored on the Route document so
// live ETAs need zero external calls per GPS ping.
export const computeRoadProfile = async (stops = []) => {
  const ordered = [...stops].sort((a, b) => a.index - b.index);
  const segments = [];

  for (let i = 0; i < ordered.length - 1; i++) {
    segments.push({
      fromIndex: ordered[i].index,
      toIndex: ordered[i + 1].index,
      ...(await roadSegment(ordered[i], ordered[i + 1]))
    });
  }
  return segments;
};
