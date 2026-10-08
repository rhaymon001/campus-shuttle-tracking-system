// socket/shuttleHandlers.js — event handlers for the /shuttle namespace
import Trip from '../models/Trip.js';
import DriverProfile from '../models/DriverProfile.js';
import Reservation from '../models/Reservation.js';
import Route from '../models/Route.js';
import Shuttle from '../models/Shuttle.js';
import Presence from '../models/Presence.js';
import {
  computeEtaPerStop,
  haversineMeters,
  lastPassedStopIndexFromEta,
  isDepartedFromTerminus
} from '../utils/geo.js';
import { observeSpeed, clearSpeed, DEFAULT_SPEED_KMH } from '../utils/speed.js';
import { createNotification } from '../services/notificationService.js';
import { promoteNextWaitlisted } from '../services/reservationQueue.js';

// Server-side throttle registry: tripId -> last accepted broadcast timestamp (ms).
// Drops driver GPS pings arriving faster than the doc-specified 1.8s window.
const lastBroadcastAt = new Map();
const THROTTLE_MS = 1800;

// Refresh the cached trip snapshot every N accepted pings so occupancy stays honest
const TRIP_REFRESH_EVERY = 10;

// Proximity alerts are rate-limited per reservation so a student gets one clean
// "prepare to board" push (plus an occasional reminder), never one per sweep.
const PROXIMITY_DEDUP_MS = 2 * 60 * 1000; // re-alert at most every 2 minutes
const proximityNotifiedAt = new Map();    // reservationId -> last alert timestamp

// ── Auto-turnaround tuning knobs (environment-overridable for test drives) ──
// Dwell = how long the bus must sit at the terminus before arrival is declared
// and the reverse leg is queued. Return depart = how far past the terminus the
// bus must roll so GPS jitter while parked can never false-start the return.
const TERMINUS_DWELL_METERS = Number(process.env.TERMINUS_DWELL_METERS) || 60;
const TERMINUS_DWELL_FIXES = Number(process.env.TERMINUS_DWELL_FIXES) || 3;
const RETURN_DEPART_METERS = Number(process.env.RETURN_DEPART_METERS) || 20;

// tripId -> consecutive accepted fixes spent within the terminus dwell radius.
// userId-set guards keep concurrent pings from double-firing layover/return.
const dwellTracking = new Map();
const layoverInFlight = new Map();
const returnInFlight = new Set();

// Ends the forward trip at a terminus and arms the reverse leg. Runs exactly
// once per trip: the layover flag flips into socket.data + DriverProfile, so a
// second ping can never re-enter this path.
const beginLayover = async (socket, nsp, userId, trip) => {
  const tripId = trip._id;

  // Final sweep: everyone still onboard has reached a destination at (or before)
  // the terminus, so every seat frees before the bus flips for the return leg.
  await Reservation.updateMany(
    { tripId, status: 'boarded', alighted: false, destStopIndex: { $ne: null } },
    { $set: { alighted: true } }
  );

  trip.status = 'completed';
  trip.endedAt = new Date();
  trip.seatsCurrentOccupancy = 0;
  await trip.save();
  clearSpeed(tripId);

  const forwardRoute = await Route.findById(trip.routeId).lean();
  if (forwardRoute?.reverseId) {
    const reverseRoute = await Route.findById(forwardRoute.reverseId)
      .select('name stops roadSegments')
      .lean();

    if (reverseRoute && reverseRoute.stops?.length) {
      await DriverProfile.findOneAndUpdate(
        { userId },
        {
          status: 'layover',
          activeTripId: null,
          layoverRouteId: reverseRoute._id,
          layoverShuttleId: trip.shuttleId
        }
      );
      await Route.findByIdAndUpdate(trip.routeId, { $inc: { activeBuses: -1 } });

      socket.data.activeTrip = null;
      socket.data.finishedTripId = String(tripId);
      socket.data.layover = {
        shuttleId: String(trip.shuttleId),
        routeId: String(reverseRoute._id),
        routeName: reverseRoute.name,
        stops: reverseRoute.stops || [],
        roadSegments: reverseRoute.roadSegments || []
      };
      dwellTracking.delete(String(tripId));

      nsp.to(`route-${trip.routeId}`).emit('trip:ended', { tripId, routeId: trip.routeId });
      nsp.to(`user-${userId}`).emit('driver:layover', {
        tripId: String(tripId),
        reverseRouteId: reverseRoute._id,
        routeName: reverseRoute.name
      });
      return;
    }
  }

  // No reverse pair configured — plain shift-end at the terminus.
  await DriverProfile.findOneAndUpdate(
    { userId },
    { status: 'available', activeTripId: null, layoverRouteId: null, layoverShuttleId: null }
  );
  await Route.findByIdAndUpdate(trip.routeId, { $inc: { activeBuses: -1 } });
  socket.data.activeTrip = null;
  dwellTracking.delete(String(tripId));
  nsp.to(`route-${trip.routeId}`).emit('trip:ended', { tripId, routeId: trip.routeId });
};

// Layover phase: no Trip document exists (forward leg is ended), but the return
// leg is armed. Pings persist the driver's position so reconnects stay coherent;
// the moment the fix shows the bus rolling away from the terminus, the return
// trip is created and THIS fix becomes its first broadcast.
const handleLayoverPing = async (socket, nsp, userId, lat, lng, now) => {
  const layover = socket.data.layover;
  const updatedAt = new Date(now);

  await DriverProfile.findOneAndUpdate(
    { userId },
    { currentLocation: { lat, lng }, locationUpdatedAt: updatedAt }
  );

  if (!isDepartedFromTerminus(lat, lng, layover.stops, layover.roadSegments, RETURN_DEPART_METERS)) {
    return; // still parked/settling at the terminus
  }

  if (returnInFlight.has(userId) || !layover.shuttleId) return;
  returnInFlight.add(userId);
  try {
    const shuttle = await Shuttle.findById(layover.shuttleId).select('capacity').lean();
    if (!shuttle) {
      // Vehicle withdrawn mid-layover — drop the turnaround and end the shift.
      await DriverProfile.findOneAndUpdate(
        { userId },
        { status: 'available', activeTripId: null, layoverRouteId: null, layoverShuttleId: null }
      );
      socket.data.layover = null;
      return;
    }

    const returnTrip = await Trip.create({
      shuttleId: layover.shuttleId,
      driverId: userId,
      routeId: layover.routeId,
      seatsTotal: shuttle.capacity,
      seatsCurrentOccupancy: 0
    });

    await DriverProfile.findOneAndUpdate(
      { userId },
      { status: 'on_trip', activeTripId: returnTrip._id, layoverRouteId: null, layoverShuttleId: null }
    );
    await Route.findByIdAndUpdate(layover.routeId, { $inc: { activeBuses: 1 } });

    socket.data.layover = null;
    socket.data.activeTrip = {
      tripId: returnTrip._id,
      routeId: layover.routeId,
      stops: layover.stops,
      roadSegments: layover.roadSegments,
      occupancy: 0,
      seatsTotal: shuttle.capacity,
      pingCount: 0
    };

    nsp.to(`user-${userId}`).emit('driver:return_started', {
      tripId: returnTrip._id,
      routeId: layover.routeId
    });

    const populatedTrip = await Trip.findById(returnTrip._id)
      .populate('shuttleId', 'plateNumber model')
      .populate('routeId', 'name direction');
    nsp.to(`route-${layover.routeId}`).emit('trip:started', { trip: populatedTrip });

    // Apply THIS very fix to the fresh trip so its ETAs are live immediately.
    lastBroadcastAt.set(String(returnTrip._id), now);
    const speedKmh = observeSpeed(returnTrip._id, lat, lng, now) ?? DEFAULT_SPEED_KMH;
    const etaPerStop = computeEtaPerStop(lat, lng, layover.stops, speedKmh, layover.roadSegments);
    nsp.to(`route-${layover.routeId}`).emit('server:eta_update', {
      tripId: returnTrip._id,
      routeId: layover.routeId,
      lat,
      lng,
      occupancy: 0,
      seatsTotal: shuttle.capacity,
      locationUpdatedAt: updatedAt,
      speedKmh: Math.round(speedKmh),
      etaPerStop
    });
  } catch (err) {
    console.error('Auto return-leg start failed:', err.message);
  } finally {
    returnInFlight.delete(userId);
  }
};

const registerShuttleHandlers = async (nsp, socket) => {
  const { id: userId, role } = socket.data.user;

  // Every client is a member of their personal `user-{id}` room so persisted
  // notifications can be pushed in real time alongside the REST feed.
  socket.join(`user-${String(userId)}`);

  // Auto-turnaround resume: if this driver was waiting at a terminus when their
  // socket link dropped, re-hydrate the layover context from the persisted
  // profile so the return leg still auto-starts on departure.
  if (role === 'driver') {
    try {
      const profile = await DriverProfile.findOne({ userId, status: 'layover' })
        .select('layoverRouteId layoverShuttleId')
        .lean();
      if (profile?.layoverRouteId) {
        const reverseRoute = await Route.findById(profile.layoverRouteId)
          .select('name stops roadSegments')
          .lean();
        if (reverseRoute) {
          socket.data.layover = {
            shuttleId: profile.layoverShuttleId ? String(profile.layoverShuttleId) : null,
            routeId: String(reverseRoute._id),
            routeName: reverseRoute.name,
            stops: reverseRoute.stops || [],
            roadSegments: reverseRoute.roadSegments || []
          };
        }
      }
    } catch (err) {
      console.warn('Layover hydration failed:', err.message);
    }
  }

  // Any authenticated role may watch a route's live feed
  socket.on('route:subscribe', ({ routeId } = {}) => {
    if (routeId) socket.join(`route-${routeId}`);
  });

  socket.on('route:unsubscribe', ({ routeId } = {}) => {
    if (routeId) socket.leave(`route-${routeId}`);
  });

  // Driver GPS stream: validate ownership once, cache trip context, throttle,
  // persist, auto-alight, watch for a terminus dwell, rebroadcast.
  socket.on('driver:location', async ({ tripId, lat, lng } = {}) => {
    if (role !== 'driver') return;
    if (typeof lat !== 'number' || typeof lng !== 'number') return;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    const now = Date.now();

    // Armed layover wins over every tripId argument: during the turnaround the
    // forward leg's id is stale and there is no Trip document to load.
    if (socket.data.layover) {
      await handleLayoverPing(socket, nsp, userId, lat, lng, now);
      return;
    }
    if (!tripId) return;

    try {
      // (Re)validate + cache the active trip context on first ping or trip change.
      // `tripKey` maps stale pings — the frontend can lag one beat behind a
      // driver:return_started flip — onto the driver's current active trip.
      let cached = socket.data.activeTrip;
      let tripKey = String(tripId);
      if (!cached || String(cached.tripId) !== tripKey) {
        if (socket.data.finishedTripId && tripKey === String(socket.data.finishedTripId) && cached) {
          tripKey = String(cached.tripId);
        } else {
          const trip = await Trip.findOne({ _id: tripId, driverId: userId, status: 'active' })
            .populate('routeId', 'name stops roadSegments')
            .lean();
          if (!trip) return; // Not this driver's live trip — ignore silently per spec

          const routeStops = (trip.routeId?.stops || []).sort((a, b) => a.index - b.index);
          cached = {
            tripId: trip._id,
            routeId: trip.routeId?._id || trip.routeId,
            stops: routeStops,
            roadSegments: trip.routeId?.roadSegments || [],
            occupancy: trip.seatsCurrentOccupancy,
            seatsTotal: trip.seatsTotal,
            pingCount: 0
          };
          socket.data.activeTrip = cached;
        }
      }

      // Throttle before touching the database at all
      const last = lastBroadcastAt.get(tripKey) || 0;
      if (now - last < THROTTLE_MS) return;

      // Periodically re-pull occupancy so boarding events reflect in map popups
      cached.pingCount += 1;
      const refreshCycle = cached.pingCount % TRIP_REFRESH_EVERY === 0;
      if (refreshCycle) {
        const fresh = await Trip.findById(tripKey).select('seatsCurrentOccupancy status').lean();
        if (!fresh || fresh.status !== 'active') {
          socket.data.activeTrip = null;
          return;
        }
        cached.occupancy = fresh.seatsCurrentOccupancy;
      }

      lastBroadcastAt.set(tripKey, now);

      const updatedAt = new Date(now);
      await DriverProfile.findOneAndUpdate(
        { userId },
        { currentLocation: { lat, lng }, locationUpdatedAt: updatedAt }
      );

      // Speed comes from this trip's own consecutive fixes (smoothed), so the ETA
      // reacts to real traffic instead of a fixed campus average.
      const speedKmh = observeSpeed(tripKey, lat, lng, now) ?? DEFAULT_SPEED_KMH;
      const etaPerStop = computeEtaPerStop(lat, lng, cached.stops, speedKmh, cached.roadSegments);
      const lastPassedIndex = lastPassedStopIndexFromEta(etaPerStop);

      // ── Derived occupancy: auto-alight sweep ──
      // A passenger's seat is freed the moment their destination stop slips behind
      // the bus (road-projected position, not a stop-name match). On refresh cycles
      // only, to cap DB chatter at ~every 18-30s of accepted pings.
      if (refreshCycle) {
        const sweep = await Reservation.updateMany(
          {
            tripId: tripKey,
            status: 'boarded',
            alighted: false,
            destStopIndex: { $ne: null, $lte: lastPassedIndex }
          },
          { $set: { alighted: true } }
        );

        if (sweep.modifiedCount > 0) {
          // Clamp via save() so the schema's min:0 validator runs — occupancy can
          // never read negative even if a sweep and a boarding race each other.
          const tripDoc = await Trip.findById(tripKey);
          tripDoc.seatsCurrentOccupancy = Math.max(0, tripDoc.seatsCurrentOccupancy - sweep.modifiedCount);
          await tripDoc.save();
          cached.occupancy = tripDoc.seatsCurrentOccupancy;

          // Freed seats cascade to the waitlist, but only for students whose
          // boarding stop is still ahead of the bus — they can actually catch it.
          for (let i = 0; i < sweep.modifiedCount; i++) {
            await promoteNextWaitlisted(tripKey, { afterStopIndex: lastPassedIndex });
          }
        }
      }

      nsp.to(`route-${cached.routeId}`).emit('server:eta_update', {
        tripId: cached.tripId,
        routeId: cached.routeId,
        lat,
        lng,
        occupancy: cached.occupancy,
        seatsTotal: cached.seatsTotal,
        locationUpdatedAt: updatedAt,
        speedKmh: Math.round(speedKmh),
        etaPerStop
      });

      // Proximity check: on refresh cycles, alert students whose booked stop the
      // bus will reach soon. ETA is the sole trigger — it already encodes road
      // distance and observed speed, so the bus is "nearby" exactly when it is
      // about to arrive, regardless of how many stops lie between. Rate-limited
      // per reservation so students aren't spammed every ~18s sweep.
      if (refreshCycle && etaPerStop.length > 0) {
        // Prune stale dedupe entries (reservations that boarded/expired/cancelled)
        for (const [key, ts] of proximityNotifiedAt) {
          if (now - ts > PROXIMITY_DEDUP_MS * 3) proximityNotifiedAt.delete(key);
        }

        const activeReservations = await Reservation.find({
          tripId: tripKey, status: 'pending', waitlistPosition: null
        }).lean();

        for (const res of activeReservations) {
          const stopEta = etaPerStop.find((s) => s.name === res.stopName);
          if (!stopEta || stopEta.passed || stopEta.etaMinutes == null) continue;
          if (stopEta.etaMinutes > 10) continue;

          const resKey = String(res._id);
          const lastAlert = proximityNotifiedAt.get(resKey) || 0;
          if (now - lastAlert < PROXIMITY_DEDUP_MS) continue;
          proximityNotifiedAt.set(resKey, now);

          nsp.emit('server:shuttle_nearby', {
            userId: String(res.userId),
            reservationId: res._id,
            stopName: res.stopName,
            etaMinutes: stopEta.etaMinutes,
            tripId: tripKey
          });

          // Also persist a proximity notification so the alert survives reload
          await createNotification({
            userId: res.userId,
            type: 'proximity',
            title: 'Bus approaching your stop',
            body: `Your shuttle to ${res.stopName} is about ${stopEta.etaMinutes} min away. Head to the shelter now.`,
            data: { reservationId: String(res._id), tripId: String(tripKey), stopName: res.stopName, etaMinutes: stopEta.etaMinutes }
          });
        }
      }

      // ── Terminus dwell → layover (auto-turnaround) ──
      // Detect arrival ONLY at the terminal stop (never an intermediate shelter):
      // the bus must sit within the dwell radius for TERMINUS_DWELL_FIXES accepted
      // fixes AND have its last-passed index at the terminus. Moving away resets
      // the counter, so a bus that stops mid-loop never false-flips.
      const terminusIndex = cached.stops.reduce((maxV, s) => Math.max(maxV, s.index), -1);
      const terminusStop = cached.stops.find((s) => s.index === terminusIndex);
      if (terminusStop) {
        const atTerminus = haversineMeters(lat, lng, terminusStop.lat, terminusStop.lng) <= TERMINUS_DWELL_METERS;
        const dwell = atTerminus && lastPassedIndex === terminusIndex
          ? (dwellTracking.get(tripKey) || 0) + 1
          : 0;
        dwellTracking.set(tripKey, dwell);

        if (dwell >= TERMINUS_DWELL_FIXES && !layoverInFlight.has(tripKey)) {
          layoverInFlight.add(tripKey);
          try {
            const tripDoc = await Trip.findById(tripKey);
            if (tripDoc && tripDoc.status === 'active') {
              await beginLayover(socket, nsp, userId, tripDoc);
              return; // forward trip over — no more broadcasts for it
            }
          } finally {
            layoverInFlight.delete(tripKey);
          }
        }
      }
    } catch (err) {
      console.error('driver:location handler error:', err.message);
    }
  });

  // Student live-sharing: heartbeat keeps their Presence row fresh so maps can
  // show who is waiting near each active bus. Opt-in and privacy-scoped to peers
  // watching the same route, never exposed to the public.
  socket.on('user:location', async ({ lat, lng, sharing = true } = {}) => {
    if (role !== 'student' && role !== 'admin') return;
    if (typeof lat !== 'number' || typeof lng !== 'number') return;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

    const now = Date.now();
    if (now - (socket.data.lastPresenceAt || 0) < 5000) return; // 5s heartbeat floor
    socket.data.lastPresenceAt = now;

    try {
      const doc = await Presence.findOneAndUpdate(
        { userId },
        {
          $set: {
            currentLocation: { lat, lng },
            locationUpdatedAt: new Date(),
            sharing: sharing === true
          },
          $setOnInsert: { userId, name: socket.data.user.name || 'Student' }
        },
        { upsert: true, new: true }
      ).lean();

      // Revoking sharing is a local-only state change — don't broadcast a fake 0,0 fix
      if (sharing !== true) return;

      // Announce presence to every route feed so peers can render nearby markers
      nsp.emit('server:presence_update', {
        userId: String(userId),
        name: doc.name,
        lat,
        lng,
        locationUpdatedAt: doc.locationUpdatedAt,
        sharing: doc.sharing
      });
    } catch (err) {
      console.error('user:location handler error:', err.message);
    }
  });

  // Client requests: "who is near this bus right now?" — answered with sorted distances
  socket.on('presence:near_bus', async ({ tripId } = {}) => {
    if (!tripId) return;
    try {
      const trip = await Trip.findById(tripId).select('routeId').lean();
      if (!trip) return;

      const route = await import('../models/Route.js').then((m) => m.default.findById(trip.routeId).select('stops').lean());
      const busProfile = await DriverProfile.findOne({ activeTripId: tripId }).select('currentLocation locationUpdatedAt').lean();
      if (!busProfile?.currentLocation?.lat) return;

      const cutoff = new Date(Date.now() - 10 * 60 * 1000); // ignore stale heartbeats
      const peers = await Presence.find({ sharing: true, locationUpdatedAt: { $gte: cutoff } }).lean();

      const nearestStop = (route?.stops || [])
        .map((s) => ({
          stop: s,
          meters: haversineMeters(
            busProfile.currentLocation.lat,
            busProfile.currentLocation.lng,
            s.lat,
            s.lng
          )
        }))
        .sort((a, b) => a.meters - b.meters)[0];

      socket.emit('server:presence_near_bus', {
        tripId: String(tripId),
        busLocation: busProfile.currentLocation,
        busLocationUpdatedAt: busProfile.locationUpdatedAt,
        nearestStop: nearestStop
          ? { name: nearestStop.stop.name, distanceMeters: Math.round(nearestStop.meters) }
          : null,
        users: peers
          .map((p) => ({
            userId: String(p.userId),
            name: p.name,
            lat: p.currentLocation.lat,
            lng: p.currentLocation.lng,
            locationUpdatedAt: p.locationUpdatedAt,
            distanceMeters: Math.round(
              haversineMeters(
                busProfile.currentLocation.lat,
                busProfile.currentLocation.lng,
                p.currentLocation.lat,
                p.currentLocation.lng
              )
            )
          }))
          .sort((a, b) => a.distanceMeters - b.distanceMeters)
      });
    } catch (err) {
      console.error('presence:near_bus handler error:', err.message);
    }
  });

  // Admin emergency alert — fanned out to every connected client on the namespace
  // and persisted so offline users still see it when they next open the portal.
  socket.on('admin:broadcast', async ({ message } = {}) => {
    if (role !== 'admin' || !message) return;
    const at = new Date();
    nsp.emit('admin:broadcast', { message, at });

    try {
      const users = await import('../models/User.js').then((m) => m.default.find({}).select('_id').lean());
      for (const u of users) {
        await createNotification({
          userId: u._id,
          type: 'broadcast',
          title: 'Announcement',
          body: message,
          data: { at }
        });
      }
    } catch (err) {
      console.error('admin:broadcast persistence error:', err.message);
    }
  });

  socket.on('disconnect', () => {
    const cached = socket.data.activeTrip;
    if (cached) {
      lastBroadcastAt.delete(String(cached.tripId));
      clearSpeed(cached.tripId);
      dwellTracking.delete(String(cached.tripId));
    }
  });
};

export default registerShuttleHandlers;