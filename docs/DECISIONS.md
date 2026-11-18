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

## 2026-10-08 — Already-alighted passengers can book again on the same trip

### 15. The duplicate-pass guard ignores reservations whose passenger has alighted
- **Choice:** `issueBoardingPass` duplicate check is now `{ userId, tripId, status: { $in: ['pending', 'boarded'] }, alighted: false }`. Auto-alight already prefers `$set: { alighted: true }` and never mutates `status`, so an alighted row was still `boarded` and blocked the student from rebooking on the same live trip (false "You already have an active boarding pass" 409). Seats are `alighted: true` rows are freed by the sweep, so allowing a new booking after alighting is capacity-safe.
- **Why:** the alight sweep marks the ride finished via `alighted`; the guard's intent is "don't hold two live passes while onboard", not "never ride this trip again". The `{ tripId, status, alighted }` index already serves the widened query.
- **Rejected:** changing status off `'boarded'` in the sweep (alighting → `'expired'` would conflate "pass timed out unused" with "journey completed", breaking manifest/cron semantics; any new enum value would ripple through `getTripManifest`, occupancy derivation, and reservation lifecycle).

## 2026-10-08 — Blueprint deploys backend only; static site is manual

### 16. Render's blueprint spec cannot create static sites, so `render.yaml` declares only the web service
- **Choice:** removed the `type: static` frontend service from `render.yaml` (Render rejected it with `unknown type "static"`). The backend is created via Blueprint; the frontend static site is created manually in the dashboard (root dir `campus-shuttle-frontend`, `npm install && npm run build`, publish dir `dist`, SPA rewrite `/* → /index.html`).
- **Why:** blueprint service types are limited to `web`/`worker`/`cron`/`backgroundWorker`/`pyserver`; there is no static-site type. Keeping the blueprint backend-only with the frontend documented in Context.md §8 is the simplest supported shape.
- **Rejected:** generating the frontend service some other programmatic way (no API/branch coverage on free tier worth the complexity); replacing the static host with a Node static server just to fit the blueprint (extra runtime, worse caching/CDN than Render's static offering).

## 2026-10-08 — Web Push (PWA toasts) for every in-app notification

### 17. Push fans out from `createNotification`; subscriptions per browser; VAPID via env
- **Choice:** added a `PushSubscription` collection (unique `endpoint`, owned by `userId`), `POST/DELETE /notifications/push/subscribe` endpoints, `services/pushService.js` (TTL 900 s, prunes 404/410 dead endpoints), and a VAPID config that is fail-open (no keys → feed-only). `createNotification` now also sends an OS toast, so every alert type (boarding pass, waitlist, promotion, broadcast, trip start) pushes automatically. Frontend: `public/sw.js` gained `push`/`notificationclick` handlers (cache bumped to v2), a `usePushNotifications` composable does permission → subscribe → persist, and `App.vue` triggers it when the auth token appears (guests are never prompted).
- **Why:** one hook point (`createNotification`) covers all current + future alerts without per-type plumbing; the public VAPID key is non-secret and baked into the frontend at build time (`VITE_VAPID_PUBLIC_KEY`); `requestPermission` on login matches the "alert me about my ride" use case.
- **Rejected:** per-notification-type push opt-ins (more moving parts than a campus demo needs); pushing raw persisted docs (duplicate payloads); prompting for permission on mount regardless of auth state (spammy).

#### 17a. Addendum — push opt-in is user-gesture driven, not automatic on login
- **Choice:** removed the `App.vue` token watcher that called `Notification.requestPermission()` on login. Opt-in now lives behind an explicit **"Enable notifications"** control in the notification bell panel (`requestPush` → `enableWebPush`), shown only while `Notification.permission === 'default'`.
- **Why:** browsers (Firefox especially) suppress `requestPermission()` calls that don't originate from a user gesture, so the login-triggered call produced **no prompt at all**. A click handler restores the gesture context and reliably shows it.
- **Rejected:** keeping both (the automatic call can silently burn the one allowed prompt); prompting on a non-gesture route change (same suppression).

## 2026-10-12 — Schedule pre-booking (reserve a seat on a future departure)

### 18. Pre-bookings are trip-less Reservations that auto-confirm when a bus goes live
- **Choice:** made `Reservation.tripId` optional and added `routeId` + `scheduledFor`. A pre-booking is `isScheduled:true`, `status:'pending'`, bound to a `ScheduleSlot` (no trip). `POST /reservations/schedule` validates route geometry + that `scheduledFor` falls on a recurring day and inside the slot's `startTime`–`endTime` window; `GET /reservations/scheduled` lists a student's upcoming ones. `services/scheduleBooking.js` runs each cron tick: `confirmScheduledBookings()` turns pending pre-bookings into real 6-char passes (sets `tripId`, `status:'confirmed'`) when an **active trip exists on the route** and `scheduledFor` is within 30 min ahead / 15 min behind now; `expireScheduledBookings()` lapses the rest. `startTrip` also calls confirm immediately. The generic expiry cron skips `isScheduled` rows.
- **Why:** matches the industry pattern (timetable reservation → confirmed boarding pass) without inventing a trip before a driver clocks in; the 30/15-min window is the honest "your bus is about to run" signal and ties confirmation to a live bus rather than a fixed clock.
- **Assumption:** seat cap per route+departure is a constant `SCHEDULE_BOOKING_CAPACITY` (default 14, the largest Hiace) because `ScheduleSlot` has no shuttle link; campus-local wall-clock is fixed at UTC+1 via `CAMPUS_TZ_OFFSET_MINUTES` (default 60) so day/window checks don't inherit Render's UTC clock. Both env-overridable.
- **Rejected:** making `ScheduleSlot` a fixed discrete departure with its own capacity (a data-model migration and admin-UI rework for the same result); creating a placeholder `Trip` at book time (no driver/vehicle exists, and it would pollute live-trip queries and occupancy).
- **Frontend:** `SchedulesView.vue` gained a "Pre-book a seat" modal (date, time grid from the slot window, boarding + destination stops) and a "Your pre-bookings" list (shows the code once confirmed).

## 2026-10-13 - Enforce seat allocation and scope reservation events

- **Choice:** allocate numbered seat slots to live and scheduled reservations, enforce uniqueness with partial MongoDB indexes, and create those indexes before the API and reservation cron start. Boarding confirmation accepts pending or scheduled-confirmed passes only for the authenticated driver's active trip and updates pass/occupancy in a transaction. Scheduled passes expire and release their slots. Proximity and waitlist-code events go to the recipient's `user-{id}` room; opted-in presence coordinates go only to active route rooms.
- **Why:** count-then-create permits concurrent overbooking; scheduled passes must enter the ordinary boarding lifecycle; and personal boarding/proximity data must not be visible to unrelated connected clients.
- **Rejected:** process-local mutexes (they fail across multiple server instances); relying on Mongoose's production-disabled automatic index creation; broadcast payloads filtered only in the frontend (clients can inspect every socket event).
- **Trade-off:** boarding transactions require a MongoDB replica set or sharded cluster; the configured Atlas deployment supports transactions. Existing legacy reservations without seat slots are included in capacity calculations until they expire or complete.
## 2026-11-17 - Frontend rebrand to "motatrack" (student screens)

- **Choice:** visual-layer rebuild of the student experience (login, register, dashboard shell, live map, routes, schedules, notification bell) under the name **motatrack**. Design tokens live in `src/styles/tokens.css` (ABU-green and white in light mode, deep green-black with a lighter green in dark mode, one yellow for the shuttle), base/global components in `src/styles/base.css`. Fonts (Bricolage Grotesque, Instrument Sans, JetBrains Mono) are bundled through `@fontsource` packages, so nothing loads from a font CDN. Every view's `<script>` block was kept as it was; only templates and styles were replaced. No route, store, API call or socket handler changed.
- **Why:** the old UI mixed hard-coded navy/teal values per component with no shared system. Tokens give one place to change the green when the exact ABU hex is confirmed (`--brand`, `--header-bg`).
- **Assumption:** brand green is the stand-in `#0B7A3E` until the exact ABU/Kasuwan Campus value is supplied. Dark mode follows the device setting (no toggle).
- **Small behaviour-adjacent changes (revertible):**
  - `DashboardView`: the four hard-coded stat cards (14 shuttles, 4 routes, 8m wait, NOMINAL) were removed; the live panel now shows real shuttle and route counts from state it already holds. The change-password form moved from an always-visible panel into an Account sheet (opened from the sidebar user badge or the mobile Account tab), together with Sign out. Mobile navigation is now a bottom tab bar instead of a hamburger drawer.
  - `App.vue`: the top bar is hidden on login/register (`meta.guestOnly`), which carry their own brand panel.
  - `LiveMap.vue`: shuttle markers are only re-created when their stale/fresh state flips (previously on every fix), so the new CSS glide between GPS fixes works; zoom control moved to bottom-right; emoji icons replaced with inline SVG; route/stop colours set through CSS classes so they follow the theme.
  - `LiveTrackingView.vue`, `RoutesView.vue`, `SchedulesView.vue`, `DashboardView.vue`: only icon/component import lines and the Account-sheet/Escape-key handling in `DashboardView` were added to the scripts.
- **Rejected:** a public landing page at `/` (declined by the owner); a manual theme toggle (extra state for no requested benefit); loading fonts from Google Fonts (extra third-party request, blocked offline).
- **Not yet done:** driver terminal and admin views still use the old styling, and some of their classes may look out of place next to the new header until stage 2 and 3.

## 2026-11-17 - Student portal feedback, round 1

- **Bell alerts:** the "Enable notifications" control is now a visible row inside the bell panel (it was a small link in the header that also replaced "Mark all read"). The row explains each state: undecided (Turn on button), blocked in the browser, unsupported (needs HTTPS / push-capable browser), allowed but push not configured. The underlying opt-in logic (`enableWebPush`, permission check) is unchanged.
- **Mobile live view:** the map now fills the screen and the shuttle sheet peeks up from the bottom. Scrolling reveals it; scrolling back to the top, or tapping the map, tucks it away. Pure scroll position, no drag library. Desktop layout is unchanged.
- **Errors:** booking/queue errors (Routes) and pre-booking errors (Schedules modal) now appear as a toast at the top of the page via `useToast` / `ToastHost`, instead of inside the card or modal. Login/register server errors stay at the top of their form.
- **Passwords:** new `PasswordInput` (show/hide, Caps Lock warning) and `PasswordFeedback` (live rules, strength meter, "must differ from current", live confirm-match). Used on login, register and the Account sheet. Strength is advice only; the enforced rules are unchanged (min 6 characters, match). One new client-side rule: the new password may not equal the current one (Account sheet).
- **Touch:** button hover styles now apply only on devices that can hover, so taps on phones do not leave buttons stuck in their hover look.

## 2026-11-17 - Dev tunnel / phone testing: same-origin API via Vite proxy

- **Problem:** in development the API base URL was the absolute `http://localhost:5000/api/v1`. When the app is opened from a phone or a dev tunnel (`https://...devtunnels.ms`), "localhost" resolves to that device, so login failed with `ERR_CONNECTION_REFUSED` (and an https page calling an http API would be blocked as mixed content anyway).
- **Choice:** in development the frontend calls `/api/v1` and connects Socket.IO to its own origin; `vite.config.js` proxies `/api` and `/socket.io` (with websockets) to the backend. Only port 3000 has to be exposed or forwarded. Production behaviour is unchanged (`VITE_BACKEND_BASE_URL` / the Render URL).
- **Side effect:** removes the old dev quirk where REST used port 5000 but sockets defaulted to 3500; `VITE_SOCKET_BASE_URL` is no longer needed in dev.
- **Assumption:** the backend listens on port 5000 in development (`BACKEND` constant at the top of `vite.config.js`).

## 2026-11-17 - Phone testing, follow-ups

- **Origin rewrite:** the Vite dev proxy presents `Origin: http://localhost:3000` on every forwarded request (HTTP and websocket). The backend already always allows that origin, so tunnel URLs and LAN IPs no longer have to be added to `ALLOWED_ORIGINS` for development. Dev only; production is untouched.
- **Login errors:** the axios 401 handler no longer treats a failed login/register (also 401) as an expired session. It used to reload `/login` and wipe the "Invalid credentials" message.
- **Location errors:** `src/utils/locationErrors.js` gives plain-language reasons (insecure page, permission denied, no signal, timeout). The student live view now uses a toast instead of `alert()`. The driver terminal will adopt it when it is redesigned.
- **Docs/scripts:** `docs/MOBILE_TESTING.md`; `npm run adb` runs `adb reverse tcp:3000 tcp:3000`.

## 2026-11-17 - Phone test fixes + stage 2: driver terminal

- **Push opt-in hang:** the service worker is registered only in production builds (`main.js`), so on the dev server `navigator.serviceWorker.ready` never resolved and "Turn on" stayed on "Asking…" until reload. `usePushNotifications` now looks for a registration first and caps the wait; the bell shows an explanatory note (`no-service-worker`) instead of hanging. In a production build the flow is unchanged.
- **Location timeout:** sharing demanded a high-accuracy GPS fix within 15s and gave up on any error, which a budget phone indoors often cannot meet. It now takes a quick approximate fix first (pin appears straight away), then refines with GPS using a 30s timeout; only a permission refusal stops sharing, and the button shows "Finding you…" until the first fix.
- **Driver terminal redesigned** (script logic unchanged except as listed): mobile-first single column, sticky shift bar with status, hero card with plate/route/GPS/link pills, load-ahead timeline, large boarding-code entry, position-source switch (GPS / manual simulator), end-shift card; two-column layout from 900px. Shared pieces: `AccountSheet` (password change + sign out, same live feedback as students), `ConfirmHost`/`useConfirm` (in-app dialog).
- **Driver behaviour-adjacent changes (revertible):** `confirm()` and `alert()` replaced by the in-app dialog and toasts; setup errors, boarding results and GPS problems show as top-of-page toasts instead of inside cards; GPS errors use plain-language reasons (secure-connection hint on http); a transient GPS error after a good fix no longer flips the status to "error"; new password may not equal the current one.
- **Not yet done:** admin views (stage 3) and refactoring the student Account sheet to use the shared `AccountSheet`.

## 2026-11-17 - Stage 3: admin console + a day-pill bug

- **Admin rebuilt** (scripts kept; templates and styles replaced): sidebar on desktop, a scrollable tab strip plus Account button on phones; shared responsive table styles in `AdminView.vue` (real tables on wide screens, stacked labelled cards under 720px). Screens: Active trips (live count, broadcast, monitor with occupancy bars), Fleet, Drivers, Routes (animated stop editor), Schedules (toggle-chip day picker).
- **Behaviour-adjacent changes (revertible):** the always-visible "Account settings" panel is now the shared `AccountSheet` (live password feedback, sign out) opened from the sidebar badge / Account button; `confirm()` and `alert()` replaced by the in-app dialog and toasts; form errors and confirmations (register shuttle, onboard driver, create route/slot, broadcast sent) appear as top-of-page toasts instead of inline banners; the driver's temporary password shows live strength feedback (still plain text on purpose, so it can be read to the driver); new password may not equal the current one; schedule days shown as "Mon · Tue".
- **Pre-existing bug fixed:** the student Schedules page compared `'Mon'` against the backend's lowercase `'mon'` (see `ScheduleSlot.recurringDays` enum), so the day pills never lit up, and Sunday was never shown. It now compares lowercase and includes Sun.
- **Not changed:** routes, API calls, socket events (`admin:broadcast`, `trip:started/ended`), the 15s trips poll, request payloads.
- **Not yet done:** the student `DashboardView` still has its own copy of the account sheet markup instead of using the shared `AccountSheet` (works the same; refactor is optional).
