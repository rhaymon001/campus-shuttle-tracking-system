# Coordinate Provenance Audit — ABU Zaria Routes

**Audit date:** 2026-10-05
**Route:** `North Gate → Shehu Idris Link`

## Source of truth

Coordinates were supplied directly by the **project owner**, extracted from
Google Maps. These are authoritative for this project and supersede the earlier
attempt (which relied on OpenStreetMachine coverage and interpolation — see
"Superseded attempt" below).

Note: coordinates were transcribed from Google Maps, not from a GPS survey.

## Stop table

| # | Stop | Latitude | Longitude | Source |
| --- | --- | --- | --- | --- |
| 0 | North Gate | 11.1574538 | 7.6527229 | Google Maps (owner-supplied) |
| 1 | Faculty of Engineering | 11.1523590 | 7.6501426 | Google Maps (owner-supplied) |
| 2 | Faculty of Environmental Design (garden) | 11.1513796 | 7.6506793 | Google Maps (owner-supplied) |
| 3 | ICSA Hall (common room) | 11.1495190 | 7.6487773 | Google Maps (owner-supplied) |
| 4 | Aliko Dangote Hall | 11.1369371 | 7.6389611 | Google Maps (owner-supplied) |
| 5 | Shehu Idris Hostel | 11.1385892 | 7.6378825 | Google Maps (owner-supplied) |

## Caveats carried over from the coordinate source

These were flagged when the coordinates were provided and remain open:

- **Faculty of Environmental Design** — Google has no pin for the faculty building
  itself. This coordinate is for the **garden**, inside the faculty area. If the
  boarding stop should be at the faculty entrance, re-pin it.
- **ICSA Hall** — the pin is for the **common room inside the hostel complex**, not
  the hostel gate or main building. Passengers would gather at the gate.
- **Aliko Dangote Hall** — two Google listings exist. This uses **Aliko Dangote Hall
  in Phase II** (male hostel). A separate listing named only "Dangote" sits at
  `11.1600735, 7.6407297`. Confirm which one the circuit should serve.
- **Shehu Idris Hostel** — this is the **Samaru** hostel, adjacent to Dangote Hall in
  Phase II. A different listing at `11.0855366, 7.7199579` is on **Kongo campus** and
  was deliberately not used.
- **Pin precision** — Google pins are usually a building centroid or an approximate
  point, not the literal kerbside bus stop. For dispatch-grade accuracy, verify each
  on satellite imagery and reposition the pin to the exact stopping point.

## Suggested verification pass

1. Load the route in the app map and compare each stop against satellite imagery.
2. Move any stop that sits inside a building footprint out to the adjacent road.
3. Re-confirm stop **ordering** against the real circuit — currently assumed to run
   westbound from North Gate through Phase I into Phase II.
4. Update `ABU_ZARIA_CENTER` in `campus-shuttle-frontend/src/components/LiveMap.vue`
   if the centroid shifts noticeably. Current value: `11.14540, 7.64260`.

## Superseded attempt

An earlier pass tried to derive coordinates from OpenStreetMap. Nominatim, Overpass,
and several other geocoders were blocked from the development network, and OSM has no
features for most ABU campus interiors — only one stop (a "Dangote Hostel" feature at
`11.13673, 7.63879`) was verifiable, which sits ~25 m from the owner-supplied
Aliko Dangote Hall pin and is a useful independent cross-check.

## Road routing (replaces the old straight-line limitation)

Live ETAs now measure along the road network instead of crow-flies. How it works:

1. When a route is created (admin `POST /transit/routes`, or `npm run seed`), every
   consecutive stop-to-stop leg is routed through **OSRM** (`router.project-osrm.org`).
   The resulting `{distanceMeters, durationSeconds, source}` records are stored on the
   route as `roadSegments` (`utils/routing.js` → `computeRoadProfile`).
2. On each GPS ping the live fix is projected onto the stop polyline
   (`utils/geo.js` → `projectAlongRoute`), giving the bus's position *along* the route.
3. `computeEtaPerStop` subtracts that from each stop's cumulative road distance, so
   `distanceMeters` is true along-road remaining distance. Stops already driven past
   come back with `passed: true` and `etaMinutes: null`, and are excluded from every
   "nearest stop" pick (`nearestUpcomingStop`) instead of showing a bogus 0 min.
4. If OSRM is unreachable during route creation, legs fall back to crow-flies and are
   tagged `source: 'straight'`. Routes created before this feature have no
   `roadSegments` at all and degrade to the original crow-flies estimate — ETAs never
   hard-fail.

**Measured profile for the seeded North Gate → Shehu Idris Link route (2026-10-06):**

| Leg | Road distance | OSRM duration |
| --- | --- | --- |
| North Gate → Faculty of Engineering | 2056 m | 223 s |
| Engineering → Environmental Design (garden) | 526 m | 103 s |
| Environmental Design → ICSA Hall | 1001 m | 148 s |
| ICSA Hall → Aliko Dangote Hall | 3616 m | 406 s |
| Dangote Hall → Shehu Idris Hostel | 241 m | 40 s |
| **Total** | **7.44 km** | **15.3 min (29.2 km/h)** |

Crow-flies total over the same legs is **3.03 km** — a 2.46× ratio. The high ratios on
individual legs (3.25×, 4.25×) are worth a field verification pass: they are either real
campus detours or an artefact of OSM missing the internal service roads a shuttle uses.
Either way the road figure is the better of the two available to us.

**Speed.** Time = distance ÷ speed, so a speed is unavoidable. Rather than a fixed
average, each trip now derives its own smoothed km/h from its consecutive GPS fixes
(`utils/speed.js`, EMA 0.6/0.4, samples outside 5–45 km/h discarded as GPS jitter or
simulator teleports). `20 km/h` remains only as the seed value before a trip has two
fixes. The current figure ships on the `server:eta_update` payload as `speedKmh` and
renders in the bus popup.

### Production note

The OSRM demo server is rate-limited and explicitly not for production. Before launch,
self-host OSRM (`docker run osrm/osrm-backend`) or swap in Valhalla / Google Directions /
Mapbox, and point `OSRM_BASE_URL` at it. See `abu-shuttle-backend/utils/routing.js`.

