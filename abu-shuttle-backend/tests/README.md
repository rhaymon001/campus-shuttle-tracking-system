# System Checks

These checks target a running development backend and a disposable MongoDB replica-set database. Do not run them against production: the regression suite creates bookings and boards one scheduled passenger, and load mode sends 50 live location clients.

## Setup

1. Start the backend with the development database connected, then log in as the test students and drivers to obtain JWTs.
2. Create an active trip using a capacity-one shuttle. It must have zero occupancy and no existing reservations. The API runner discovers its trip, route, stops, and schedule slot.
3. Copy `local-test-config.example.json` to `local-test-config.json`; this local file is ignored by Git. Add two distinct student JWTs and the owning driver's JWT. Regression mode additionally needs a different driver's JWT; load mode does not.
4. The runner discovers the trip, route, stops, and active schedule via API. It chooses a departure within the next 30 minutes that matches the schedule and derives five GPS fixes from the route's first two stops. If the backend uses a campus timezone offset other than UTC+1, optionally provide `scheduledFor` as an ISO timestamp within the slot window. Never commit the local config or paste its tokens into a report.

## Regression Checks

Run from `abu-shuttle-backend`:

```powershell
npm run test:regression
```

The runner discovers an active empty capacity-one trip, route, stops, and matching active schedule through the API. It verifies that two simultaneous bookings produce one admitted seat and one waiter; cancelling the seat sends the promotion code only to the intended student's socket; a scheduled pass is confirmed and included in the manifest; a different driver receives HTTP 403; and the owning driver can board the pass.

The scheduled-boarding check changes trip occupancy and cannot be cancelled after boarding. End or discard the test trip after capturing results.

## Load Checks

Run from `abu-shuttle-backend`:

```powershell
npm run test:load
```

The runner connects 50 authenticated sockets using the two student identities, subscribes them to one route, sends five driver GPS fixes, and reports delivery count plus mean, median, and p95 delivery latency. It then performs 25 two-student last-seat races (50 booking requests total), cancelling both reservations after each round, and reports the response-time distribution and allocation outcomes. This is 50 socket connections, not 50 unique students. The measured latency includes the test environment and network path; record the hardware, Node version, database location, and client/server placement with the results.

## Manual Checks Still Required

Use two separate authenticated browsers to observe that a proximity alert appears only for the reserved student. The automated regression checks recipient isolation through the same user-room pattern using a waitlist-promotion event; proximity itself depends on a real active reservation, route ETA, and the server refresh cycle. Also manually verify the student map and ETA while a driver moves, the admin route/schedule/fleet workflows and broadcast, and the driver start/manifest/boarding/end flow.

A physical campus drive and volunteer usability pilot cannot be established by this script. Record actual route, GPS conditions, participants, tasks, questionnaire responses, and consent before describing those results in Chapter Four.
