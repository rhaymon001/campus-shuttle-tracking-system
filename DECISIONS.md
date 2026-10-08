# Design Decisions Log

Every non-trivial architectural/behavioral decision is logged here (date, choice,
why, alternative rejected) so it can be reverted individually. See AGENTS.md.

## 2026-10-08 — Destination-aware boarding + auto-alight occupancy + bidirectional routes + departure-triggered auto-turnaround

Implementation batch that reshapes the queue into a destination-aware, occupancy-deriving
system with a fully bidirectional loop and an automatic, departure-triggered turnaround.

### 1. Destination is now mandatory at booking time
- **Choice:** `POST /reservations/issue` requires `destStopName`; stored as `destStopName`/`destStopIndex`; validated to be strictly ahead of the boarding stop on the same directional route. Duplicate active pass per `(userId, tripId)` → HTTP 409.
- **Why:** without a destination there is no way to auto-free seats, and the driver cannot know where to expect dropoffs.
- **Rejected:** making destination optional and deriving it later (there is no later — the reservation snapshot is the only record).

### 2. Occupancy is fully derived — no manual counter, no walk-ons
- **Choice:** occupancy `+1` on `confirmBoarding` only, `−N` on the auto-alight sweep. `PATCH /trips/:id/occupancy` removed; DriverView `+/−` buttons removed; boarding is code-confirmed only.
- **Why:** the number must equal the seat registry, or ETAs/pass allocations drift silently. Drivers hate doing arithmetic; machines don't.
- **Rejected:** keeping a manual driver counter as a fallback (two sources of truth).
- **Rejected:** freedom boarding / walk-ons (breaks the virtual queue and seat guarantees).

### 3. Auto-alight sweep on the last-passed stop
- **Choice:** on each refresh cycle, `updateMany({tripId, status:'boarded', alighted:false, destStopIndex:{$ne:null,$lte:lastPassedIndex}}, {$set:{alighted:true}})`; occupancy clamped via saved doc so the `min:0` validator runs; freed seats cascade to waitlisted students whose boarding stop is **still ahead** (`stopIndex > lastPassedIndex`).
- **Why:** `$ne:null` is mandatory — `$lte` would match `null` and wrongly alight legacy rows without a destination. Single `alighted` flip makes double-decrements impossible.
- **Rejected:** projecting the "nearest upcoming stop" raw name match (ambiguous at overlapping shelter names); per-person manual marking ("most-due") — anonymity and driver overhead.

### 4. Waitlist uncapped, FCFS, promotes on every freed seat
- **Choice:** waitlist is uncapped FCFS by `waitlistPosition`; promotion fires on cancel/expiry AND on every custom auto-alight sweep.
- **Why:** the client value is "the seat always gets filled", and the bus driver wants the shelter full.
- **Rejected:** a hard waitlist cap (artificial scarcity that punishes late students).

### 5. Bidirectional routes = directional pairs
- **Choice:** `POST /transit/routes` auto-creates the reversed `Route` (re-indexed stops 0..n-1, its own road profile, derived name) and links both via `Route.reverseId`. Seed creates both directions. One active `Trip` = one directional traversal.
- **Why:** a school loop is not a line; the turnaround has to be represented or students subscribe to a feed that goes dark.
- **Rejected:** a single "wrapped" circular route (wrapping breaks stop-ahead semantics and the ETA model).

### 6. Auto-turnaround is departure-triggered at the terminus
- **Choice:** arrival at a terminus (dwell ≤ 60 m for 3 accepted fixes, last stop only) ends the forward trip, auto-alights everyone, occupancy → 0, and arms a **layover** (`DriverProfile.status='layover'` with `layoverRouteId`/`layoverShuttleId`, re-hydrated into the socket on reconnect). The return trip auto-starts only when a fix shows the bus rolled ≥ 20 m past the terminus start (`isDepartedFromTerminus`, first-leg projection). Constants are env-overridable.
- **Why:** the bus's own movement is the only honest "ready to turn around" signal; no button means no driver action to forget.
- **Rejected:** a manual "Turn around" button (refinement #4 — End Trip remains the only driver control; during layover `POST /trips/layover/end` ends the shift and cancels the auto-return).
- **Rejected:** time-based or distance-to-go guessing of when a terminus dwell is "real".

### 7. Driver load-ahead manifest is counts-only
- **Choice:** new `GET /trips/:id/manifest` returns per-stop `pendingBoarding`/`waitlisted`/`dropoffs` counts + `lastPassedIndex` + derived `onboard`. No passenger names.
- **Why:** the driver needs "how many and where", not identity; names are unnecessary exposure.
- **Rejected:** showing passenger names; student self-tap alight (deferred as a possible future nicety).

### 8. Legacy dev data caveat
- **Choice:** duplicate guard is a controller-level find (`status ∈ [pending, boarded]`) rather than a partial unique index, so existing dev rows are never orphaned by a migration.
- **Why/expected:** old pending reservations without `stopIndex`/`destStopIndex` will block rebooking until cancelled — acceptable for dev data.
- **Rejected:** a DB migration to backfill indexes (this is pre-release dev data, not prod).

## 2026-10-08 — Seed lifecycle owns schedule slots (fix: empty Schedules view)

After routes became directional pairs, reseeding wiped the `Route` collection while
admin-created `ScheduleSlot` rows kept referencing the deleted ids. The API served them
until the orphan guard hid them, leaving the student Schedules dashboard empty — even
for the route an active trip runs on.

### 9. Orphan schedule slots are cleaned at seed time, and default windows are seeded
- **Choice:** `seed.js` now (a) deletes `ScheduleSlot` rows whose `routeId` points at any route it is about to reseed, and (b) creates continuous `06:00–21:00` slots (every 15 min, Mon–Sat) for both directions of the seeded route pair.
- **Why:** the seed is an explicit dev-reset utility that already deletes child rows (Reservations, Trips, Presence, Users, Shuttles) — schedule children leaking into the new world produced a permanently empty view. Seeding defaults gives the dashboard something real to render after every reset, including the active trip's route.
- **Rejected:** leaving schedule creation/cleanup admin-only (no schedule survived a reseed, so the student view stayed broken); only fixing the frontend/API (hides the symptom, the data still rots).

## 2026-10-08 — Terminus dwell gate fix (auto-turnaround unreachable)

### 10. Dwell arms when the bus is on the last route stretch, not only just past the terminus
- **Choice:** the layover dwell condition was `lastPassedIndex === terminusIndex`; it is now `lastPassedIndex >= terminusIndex - 1`.
- **Why:** `computeEtaPerStop` marks a stop `passed` only when the remaining distance is strictly `< 0`. A fix that lands *exactly on* the terminus stop projects to `remaining === 0` → the terminus itself is "not passed" → `lastPassedIndex` stays at `terminusIndex - 1` → the dwell could **never** arm. The manual simulator pins fixes to stop coordinates, so every parking test hit this: the forward trip never ended and the return leg never started. The relaxed gate also covers real GPS that stops right on the shelter.
- **Rejected:** weakening `atTerminus` (60 m radius is already tight — all other stops are ≥ 241 m away, so proximity alone is a sound "arrived" signal); changing ETA `passed` semantics to `<= 0` (would mark a mid-route stop passed at the same moment the bus arrives, breaking the alight/promote cascade).

## 2026-10-08 — Inclusive "passed" semantics + current-stop name in the map popup

### 11. A stop is passed the moment the bus reaches it (`remaining <= 0`), and the live feed carries the current stop name
- **Choice:** `computeEtaPerStop` now flags a stop `passed` when the remaining road distance is `<= 0` (was `< 0`). Every `server:eta_update` now also carries `lastPassedIndex` + `lastPassedStopName`; the student dashboard picker therefore never offers a 0-min "next stop" that is the stop the bus is *beside*, and the bus popup prints "Beside: {stop}".
- **Why:** with a fix parked exactly on a stop, the old strict-`<0` rule left that stop "upcoming" at 0 min, so the dashboard's min-ETA readout oscillated between the current stop and the real next stop as fixes walked a stop dead-on. Inclusive semantics keep `lastPassedIndex` monotonic → no backward flicker, and extra bonus: auto-alight now frees a seat when the bus is AT a passenger's destination, not after it passes.
- **Rejected:** patching only the frontend label to skip 0-min stops (would fix the readout but leave the alight sweep lagging one stop behind on the terminal fix and keep the semantics intentionally inconsistent).

## 2026-10-08 — Hosting preparation (Render)

### 12. CORS origins come from `ALLOWED_ORIGINS` (comma-separated) plus localhost defaults
- **Choice:** `config/allowedOrigins.js` now merges `process.env.ALLOWED_ORIGINS` (trimmed, non-empty entries) with the two localhost dev origins, and both Express (`corsOptions`) and Socket.IO (`socket/index.js`) keep consuming the same array.
- **Why:** one source of truth for both transports; localhost stays allowed out of the box, and the deployed frontend origin is injected per environment without a code change.
- **Rejected:** hardcoding the deployed URL into the array (brittle across environments/instances); a per-transport env var (two knobs for the same concept).

### 13. Deployment target is Render, driven by a committed `render.yaml` blueprint
- **Choice:** backend deploys as a Render node **web service** (`npm install` / `npm start`) and the frontend as a Render **static site** (Vite build, `publishPath: dist`). Added `"start": "node server.js"` and `engines.node >= 18` to the backend. API URLs are baked into the frontend at build time via `VITE_BACKEND_BASE_URL` / `VITE_SOCKET_BASE_URL`.
- **Why:** free tier, git-push deploys, blueprint keeps infrastructure in-repo and reviewable; `seed.js` stays out of every build/start step because it is destructive.
- **Rejected:** Railway (fixes backend but still needs a separate static host); Docker-on-VPS (more moving parts than a free-tier need); wiring `seed` or `dev` into the start command (would wipe a production DB).

### 14. Installable PWA app shell now, Web Push at the evaluation phase
- **Choice:** added `public/manifest.webmanifest` + a minimal `public/sw.js` (network-first, cache-fallback, API and cross-origin requests never intercepted) registered from `main.js` only in production builds.
- **Why:** instant-install/offline-shell is cheap and has no moving parts; letting the SW run in dev would break Vite HMR.
- **Rejected:** shipping Web Push now (needs a VAPID key, a push subscription endpoint, and a rendering decision — explicitly deferred); a cache-first strategy for `/api/` traffic (would serve stale live trip/ETA data).