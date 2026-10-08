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