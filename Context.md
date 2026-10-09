# CONTEXT.md

This document serves as the contextual handoff for the **Campus Shuttle Tracking & Virtual Queueing System**. It contains the system architecture, database paradigms, authentication patterns, state management, and frontend implementations built so far. Use this to ensure continuity when generating new features or debugging existing interfaces.

---

## 1. Project Overview & Domain Context
The project is a specialized campus transit tracking and virtual queuing platform (initially designed around the **Ahmadu Bello University (ABU) Zaria** shuttle routing ecosystem). 

### Key Problems Solved:
* **Overcrowded Bus Stops:** Students can virtually reserve a spot on an approaching shuttle instead of physically fighting for space.
* **Lack of Fleet Visibility:** Real-time shuttle tracking enables students and dispatchers to see exactly where shuttles are on their loops.

---

## 2. Architecture & Technical Stack
> ⚠️ **IMPORTANT TECH STACK RULE:** Do not use Django, Python, or relational databases. The legacy stack has been completely replaced.
* **Frontend:** Vue.js 3 (`<script setup>` Composition API), Pinia (State Management), Axios (HTTP Client), and custom micro-style architectures.
* **Backend:** Node.js, Express, MongoDB (Mongoose ODM), and JWT authentication.

---

## 3. Database & System Design Principles

### Core Entities & Relationships:
1. **Users (`User` Collection):** Core credentials. Split into roles: `student`, `driver`, `admin`.
2. **Driver Profiles (`DriverProfile` Collection):** Linked 1-to-1 with a `driver` User. Contains specific details (license, phone, status).
3. **Shuttles (`Shuttle` Collection):** The physical vehicles (model, plate number, total seats).
4. **Trips (`Trip` Collection):** Core tracking state. Connects a dynamic combination of `Driver`, `Shuttle`, and `Route`. 

### The Dynamic Trip Lifecycle:
* **No Permanent Assignments:** Shuttles are **not** permanently assigned to drivers in the database. 
* **The Shift Loop:** A driver logs in and begins their shift. They select which physical shuttle they are driving today and their assigned route. This fires `POST /api/v1/trips/start`, binding the `driverId`, `shuttleId`, and `routeId` into a single active **`Trip`** document.
* **Auto-Release:** When the shift/trip ends (`PATCH /api/v1/trips/end/:id`), the shuttle is marked available again, making fleet rotations dynamic.

---

## 4. API & Endpoint Reference
All endpoints belong to the `/api/v1` namespace running on port `3500` by default.

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | Public | Student self-registration |
| `POST` | `/auth/login` | Public | Multi-role user login (returns token + user object) |
| `POST` | `/admin/drivers` | Admin Only | Provisions driver account and initializes `DriverProfile` |
| `GET` | `/admin/drivers` | Admin Only | Full driver roster with live status flags |
| `GET` | `/transit/routes` | Public | Fetches all campus transit routes and stop paths |
| `GET` | `/transit/routes/:id` | Public | Single route details |
| `POST` | `/transit/routes` | Admin Only | Create route with ordered stops (name/lat/lng) |
| `GET` | `/trips` | User/Driver | Active trips, populated (shuttle, route+stops, driver name) and merged with each driver's `driverLocation` + `locationUpdatedAt` |
| `GET` | `/trips/driver/active` | Driver Only | Driver session resume — their single active trip, or the armed `layover` (return-leg) context when parked at a terminus |
| `POST` | `/trips/start` | Driver Only | Start shift loop (409 if driver already has an active trip) |
| `PATCH` | `/trips/end/:id` | Driver Only | End own trip (ownership enforced) |
| `POST` | `/trips/layover/end` | Driver Only | End a terminus layover — concludes the shift and cancels the queued auto-return (the only manual turnaround control) |
| `GET` | `/trips/:id/manifest` | Driver Only | Load-ahead manifest: per-stop `{index,name,pendingBoarding,waitlisted,dropoffs}` + `lastPassedIndex` + derived `onboard` count (no passenger names) |
| `PATCH` | `/trips/:id/location` | Driver Only | REST GPS fallback when socket link drops |
| `PATCH` | `/trips/:id/force-end` | Admin Only | Admin override when driver unreachable |
| `POST` | `/reservations/issue`| Student | Generates a virtual queue boarding pass for a target `tripId` — requires a `destStopName` strictly ahead of the boarding stop; 409 if an active pass already exists on that trip |
| `POST` | `/reservations/confirm`| Driver Only | Validates 6-char code, increments occupancy (occupancy is derived: +1 on boarding, −N on auto-alight) |
| `POST` | `/shuttles` | Admin Only | Register vehicle (`plateNumber`, `model`, `capacity`) |
| `GET` | `/shuttles` | User/Driver | Fleet catalog |
| `PATCH` | `/shuttles/:id/status` | Admin Only | Toggle `active` / `maintenance` |

### Socket.IO Realtime Layer (`/shuttle` namespace)
JWT handshake auth (`auth: { token }`). Room naming: `route-{routeId}`.
* `route:subscribe` / `route:unsubscribe` `{routeId}` — any role joins/leaves a route's live feed.
* `driver:location` `{tripId, lat, lng}` (driver → server) — validated against the driver's active trip, throttled server-side to 1.8s, persists `DriverProfile.currentLocation` + `locationUpdatedAt`, then rebroadcasts to the route room as:
* `server:eta_update` `{tripId, routeId, lat, lng, occupancy, seatsTotal, locationUpdatedAt, etaPerStop[]}` — ETA computed from road-segment projection plus observed smoothed speed (`utils/geo.js + utils/speed.js`).
* `server:shuttle_nearby` (during refresh cycles) — proxemy alerts: ETA ≤ 10 min to the passenger's booked stop, deduped ≥ 2 min per reservation.
* `driver:layover` `{tripId, reverseRouteId, routeName}` → driver's own room when the forward trip ends at a terminus (return leg armed).
* `driver:return_started` `{tripId, routeId}` → driver's own room when the bus departs the terminus and the reverse trip starts.
* `trip:started` / `trip:ended` — emitted by trip controllers to the route room.
* `admin:broadcast` `{message}` — admin-only, fanned out namespace-wide; rendered as dismissible amber banners on student and driver views.

### Auto-turnaround state machine (departure-triggered)
* Routes are directional **pairs** — `POST /transit/routes` auto-creates the reversed `Route` and links both via `reverseId` (seed creates both).
* One active `Trip` = one directional traversal. At a terminus the driver (~or manual simulator) parks: `TERMINUS_DWELL_METERS` (60 m) for `TERMINUS_DWELL_FIXES` (3 accepted fixes) ends the forward trip, auto-alights remaining passengers (`alighted:true`, occupancy → 0), then arms a **layover** (`DriverProfile.status='layover'` + `layoverRouteId`/`layoverShuttleId`, hydrated on socket reconnect).
* The return trip starts automatically only when a fix shows the bus departed (`isDepartedFromTerminus`, first-leg projection ≥ `RETURN_DEPART_METERS` 20 m). Constants are env-overridable (`TERMINUS_DWELL_METERS`, `TERMINUS_DWELL_FIXES`, `RETURN_DEPART_METERS`).

### Derived occupancy (no manual counter)
* `+1` on confirmBoarding; `−N` on the auto-alight sweep (`destStopIndex ≤ lastPassedIndex && destStopIndex ≠ null`), clamped ≥ 0 via schema validator; freed seats cascade to waitlisted students **whose boarding stop is still ahead** (`stopIndex > lastPassedIndex`). No `PATCH /trips/:id/occupancy`, no walk-ons — boarding is code-confirmed only.

Server bootstrap: `server.js` wraps Express in `http.createServer`; `socket/index.js` exports `initSocket`/`getShuttleNsp`; handlers live in `socket/shuttleHandlers.js`.

---

## 5. Frontend Architecture & Storage Layout

### Storage Footprint:
The frontend utilizes `localStorage` to survive browser reloads. The keys are:
* `shuttle_token` (String): Raw JWT access token.
* `shuttle_user` (JSON Object): Logged-in user parameters (name, role, etc.).
* `shuttle_active_pass` (JSON Object): Holds the active virtual boarding pass ticket payload.

### Pinia Auth Store (`src/stores/auth.js`):
Manages active sessions. Exposes:
* `user` and `token` states.
* `isAuthenticated` and `userRole` getters.
* `loginUser()`, `registerStudent()`, and `logout()` actions.

### Axios Client configuration (`src/api/api.js`):
Equipped with request and response interceptors:
* **Request:** Automatically checks Pinia state (`auth.token`) or falls back to `shuttle_token` in `localStorage` to append the `Authorization: Bearer <token>` header to all outgoing requests.
* **Response (401 Handler):** On token expiration, the client silently boots the session, purges the cache, and triggers a clean redirect to `/login`.

---

## 6. Frontend Components Completed

### A. `RoutesView.vue` (Virtual Queueing Interface)
* **Goal:** Lists active campus routes and allows students to choose a boarding shelter stop, find an approaching bus on that track, and generate a boarding pass.
* **Real-time Countdown Ticker:** Once a pass is generated (from `/reservations/issue`), a `setInterval` runs a relative live countdown (format `mm:ss`).
* **Auto-Expiry:** The moment the ticker reaches `00:00` or surpasses the `expiresAt` timestamp, it automatically clears the active pass, collapses the ticket graphic, and resets the queue booking form.
* **Session Persistence:** Active passes are cached to `shuttle_active_pass`. On page reload, the component validates the timestamp and restores the active pass automatically if it hasn't expired.

### B. `LiveTrackingView.vue` (Main Dashboard Telemetry)
* **Goal:** Serves as the passenger telemetry hub, mapping real-time bus locations and load structures.
* **Live Leaflet Map (`LiveMap.vue`):** OSM tiles centered on ABU Zaria; route polylines (navy) + stop circleMarkers (teal, tooltip names); shuttle `divIcon` markers (teal, amber when stale >10s per `locationUpdatedAt`) with occupancy popups. Deliberately avoids `L.Icon.Default` (Vite asset breakage).
* **Realtime + Reconciliation:** Subscribes to every route room via `useShuttleSocket`; `server:eta_update` moves markers and refreshes card occupancy + nearest-stop ETA; `trip:started/ended` add/remove entries. A 10-second `/trips` REST poll heals missed socket events.
* **Populated Sub-Documents:** Cleanly unwraps populated Mongoose schemas (reading `trip.shuttleId.plateNumber`, `trip.routeId.name`, `trip.driverId.name`) safely via Vue optional chaining.
* **Safety Threshold Visuals:** The occupancy bar shifts dynamically between **Teal** (normal), **Amber** ($>60\%$), and **Red** ($>85\%$) based on passenger load.

### C. `DriverView.vue` (Driver Terminal, `/driver`)
* **Setup mode:** selects for active shuttle + route → `POST /trips/start`; resumes an in-flight trip on refresh via `GET /trips/driver/active`.
* **Active mode:** `watchPosition` GPS streaming (2s client throttle) emitting `driver:location` over socket with REST `PATCH /trips/:id/location` fallback; status pills for GPS/link health; occupancy `+/-` counter; 6-char boarding-code confirmation (`POST /reservations/confirm`); End Trip flow.

### D. Admin Workspace (`/admin`, `src/views/admin/`)
* `AdminView.vue` shell + children: **Active Trips** (monitor table, force-end, emergency broadcast), **Fleet** (register shuttle, maintenance toggle), **Routes** (create with dynamic ordered stops lat/lng rows), **Drivers** (onboard + roster).

### E. Role Routing
* `ROLE_HOME` map exported from `src/router/index.js`: student→`/dashboard`, driver→`/driver`, admin→`/admin`. Login redirects by role; router guard bounces cross-role access to the user's own home. Socket client singleton in `src/api/socket.js` (`VITE_SOCKET_BASE_URL`, origin only — no `/api/v1`), component access via `src/composables/useShuttleSocket.js` (auto-cleanup, room rejoin on reconnect).

---

## 7. Next Steps for Implementation
If you are continuing this system, prioritize the following features:
1. **Reservation lifecycle hardening:** waitlist on full shuttle, cancellation flow, expiry cron job (doc Section D6/3f), proximity alerts (`server:shuttle_nearby`, 2-stop threshold).
2. **Notifications module:** persistent `Notification` collection with TTL index + REST endpoints (doc Section D8).
3. **Admin reports:** aggregation pipelines for trip completion, occupancy trends, peak stops (doc Section D9); `TripLog` GPS ping history with 7-day TTL.
4. **Schedules integration:** pre-booking against `ScheduleSlot`s, auto-confirmation before departure.

> Completed since original handoff: Driver Terminal (`/driver`), Socket.IO realtime GPS layer, Leaflet live map, Admin workspace (`/admin`), role-based routing/guards, and bug fixes (endTrip driver-id, `/admin` mount, `GET /trips` populate + driver location merge, shuttle `plateNumber` field + admin guard, `DashboardView.vue` casing, axios `/api/v1` fallback, removed mock-trip fallback). 

##  
Trips flip direction automatically at the termini (see DECISIONS.md). The
driver's only control is End Trip, which ends the shift and stops auto-flips.

## 8. Hosting readiness (Render)

The repo is prepared for a two-service Render deployment from `render.yaml`:

* **Backend web service** (`abu-shuttle-backend/`): `npm start` (`node server.js`);
  CORS origins are read from `ALLOWED_ORIGINS` (comma-separated) and drive both
  Express and Socket.IO. Secrets never live in the repo — see
  `abu-shuttle-backend/.env.example` for the full variable list (MongoDB Atlas
  URI, JWT secret, ALLOWED_ORIGINS, terminus-dwell tuning).
* **Frontend static site** (`campus-shuttle-frontend/`): Vite build → `dist`;
  the backend URLs are baked in at build time via `VITE_BACKEND_BASE_URL` /
  `VITE_SOCKET_BASE_URL` (see `campus-shuttle-frontend/.env.example`). Enable
  **SPA redirects `/* → /index.html`** in the Render dashboard for deep links.
* **PWA app shell:** `public/manifest.webmanifest` + `public/sw.js` (network-first
  with cache fallback; API/cross-origin requests never intercepted). The service
  worker registers in production builds only. Web Push is deferred to the final
  evaluation phase.
* **Order after first deploy:** the backend's Mongo URI and the frontend's
  `VITE_*` URLs need the deployed instance URLs; deploy the backend first, then
  the frontend, then put the frontend URL into the backend's `ALLOWED_ORIGINS`.

`seed.js` is destructive (it wipes trips/schedules and reseeds routes), so it is
**not** wired into any Render build or start step — run it only against a
development database.