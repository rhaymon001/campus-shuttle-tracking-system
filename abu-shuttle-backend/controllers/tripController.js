import Trip from "../models/Trip.js"
import Shuttle from "../models/Shuttle.js";
import DriverProfile from "../models/DriverProfile.js";
import Route from "../models/Route.js";
import Reservation from "../models/Reservation.js";
import { getShuttleNsp } from "../socket/index.js";
import { computeEtaPerStop, lastPassedStopIndexFromEta } from "../utils/geo.js";
import { observeSpeed, clearSpeed, DEFAULT_SPEED_KMH } from "../utils/speed.js";

// Safe wrapper so a socket layer failure never breaks the REST response cycle
const safeEmit = (room, event, payload) => {
  try {
    getShuttleNsp().to(room).emit(event, payload);
  } catch (err) {
    console.error(`Socket emit failed for ${event}:`, err.message);
  }
};

// @desc    Driver signals they are beginning their operational shift loop
export const startTrip = async (req, res) => {
  try {
    const { routeId, shuttleId } = req.body;
    const driverId = req.user.id; // Extracted from JWT middleware payload

    // 1. Fetch target bus profile capacity bounds
    const shuttle = await Shuttle.findById(shuttleId);
    if (!shuttle || shuttle.status !== 'active') {
      return res.status(400).json({ message: 'Selected vehicle is unavailable or undergoing maintenance' });
    }

    // 2. Build snapshot instance model for ongoing loops
    const activeTrip = await Trip.create({
      shuttleId,
      driverId,
      routeId,
      seatsTotal: shuttle.capacity,
      seatsCurrentOccupancy: 0
    });

    // 3. Flag the driver profile tracker as active on trip
    await DriverProfile.findOneAndUpdate(
      { userId: driverId },
      { status: 'on_trip', activeTripId: activeTrip._id, layoverRouteId: null, layoverShuttleId: null }
    );

    // 4. Increment the live bus counter on the route document
    await Route.findByIdAndUpdate(routeId, { $inc: { activeBuses: 1 } });

    // 5. Notify all subscribed passengers on this route that a bus went live
    const populatedTrip = await Trip.findById(activeTrip._id)
      .populate('shuttleId', 'plateNumber model')
      .populate('routeId', 'name direction');
    safeEmit(`route-${routeId}`, 'trip:started', { trip: populatedTrip });

    res.status(201).json({ message: 'Trip shift started successfully', trip: activeTrip });
  } catch (err) {
    // Partial unique index (driverId + status:'active') violation — driver already on a live loop
    if (err.code === 11000) {
      return res.status(409).json({ message: 'You already have an active trip. End it before starting a new one.' });
    }
    console.error(err);
    res.status(500).json({ message: 'Failed to initialize active route loop' });
  }
};

// @desc    Driver concludes their shift, taking the shuttle off the tracking maps
export const endTrip = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user.id;

    // Ownership + liveness guard: drivers can only terminate their own active loop
    const trip = await Trip.findOne({ _id: id, driverId, status: 'active' });
    if (!trip) {
      return res.status(404).json({ message: 'No matching active trip found for this driver' });
    }

    trip.status = 'completed';
    trip.endedAt = Date.now();
    await trip.save();
    clearSpeed(trip._id); // drop observed-speed history for the finished loop

    await DriverProfile.findOneAndUpdate(
      { userId: driverId },
      { status: 'available', activeTripId: null }
    );

    await Route.findByIdAndUpdate(trip.routeId, { $inc: { activeBuses: -1 } });

    safeEmit(`route-${trip.routeId}`, 'trip:ended', { tripId: trip._id, routeId: trip.routeId });

    res.json({ message: 'Trip loop completed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error terminating route loop context' });
  }
};

// @desc    Admin override — force-end a trip when the driver is unreachable
// @route   PATCH /api/v1/trips/:id/force-end
export const forceEndTrip = async (req, res) => {
  try {
    const { id } = req.params;

    const trip = await Trip.findOne({ _id: id, status: 'active' });
    if (!trip) {
      return res.status(404).json({ message: 'No active trip found with that id' });
    }

    trip.status = 'completed';
    trip.endedAt = Date.now();
    await trip.save();
    clearSpeed(trip._id);

    // Reset the profile of whichever driver owned the loop
    await DriverProfile.findOneAndUpdate(
      { userId: trip.driverId },
      { status: 'available', activeTripId: null }
    );

    await Route.findByIdAndUpdate(trip.routeId, { $inc: { activeBuses: -1 } });

    safeEmit(`route-${trip.routeId}`, 'trip:ended', { tripId: trip._id, routeId: trip.routeId });

    res.json({ message: 'Trip force-ended by admin override' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error force-ending trip' });
  }
};

// ⚡️ NEW: Fetch live active trips on a route for the student's dashboard dropdown
// @desc    Get all ongoing trips, optionally filtered by routeId query parameter
// @route   GET /api/v1/trips
export const getActiveTrips = async (req, res) => {
  try {
    const { routeId } = req.query;

    // Look for trips that are live ('active') and match the selected route if provided
    let filter = { status: 'active' };
    if (routeId) {
      filter.routeId = routeId;
    }

    // Populate vehicle, route, and driver details so the frontend can render full cards
    const trips = await Trip.find(filter)
      .populate('shuttleId', 'plateNumber model capacity')
      .populate('routeId', 'name direction stops')
      .populate('driverId', 'name')
      .lean();

    // Merge each driver's last-known GPS fix onto their trip payload
    const driverIds = trips.map((t) => t.driverId?._id).filter(Boolean);
    const profiles = await DriverProfile.find({ userId: { $in: driverIds } })
      .select('userId currentLocation locationUpdatedAt')
      .lean();
    const profileMap = new Map(profiles.map((p) => [String(p.userId), p]));

    for (const trip of trips) {
      const profile = profileMap.get(String(trip.driverId?._id));
      trip.driverLocation = profile?.currentLocation?.lat != null ? profile.currentLocation : null;
      trip.locationUpdatedAt = profile?.locationUpdatedAt || null;
    }

    res.status(200).json(trips);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error pulling active live trips data stream' });
  }
};

// @desc    Driver resumes their session — fetch their single active trip if any,
//          or the auto-turnaround layover waiting for departure at a terminus.
// @route   GET /api/v1/trips/driver/active
export const getDriverActiveTrip = async (req, res) => {
  try {
    const trip = await Trip.findOne({ driverId: req.user.id, status: 'active' })
      .populate('shuttleId', 'plateNumber model capacity')
      .populate('routeId', 'name direction stops');

    if (trip) {
      return res.status(200).json(trip);
    }

    // No live trip — but the driver may be parked at a terminus with the reverse
    // leg queued and waiting for the bus to move (see shuttleHandlers layover).
    const profile = await DriverProfile.findOne({ userId: req.user.id })
      .populate('layoverRouteId', 'name direction stops')
      .populate('layoverShuttleId', 'plateNumber model capacity')
      .select('status layoverRouteId layoverShuttleId currentLocation locationUpdatedAt');

    if (profile?.status === 'layover' && profile?.layoverRouteId) {
      return res.status(200).json({
        layover: true,
        reverseRoute: profile.layoverRouteId,
        shuttle: profile.layoverShuttleId,
        currentLocation: profile.currentLocation,
        locationUpdatedAt: profile.locationUpdatedAt
      });
    }

    return res.status(404).json({ message: 'No active trip for this driver' });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching driver active trip' });
  }
};

// @desc    Driver ends a layover without running the return leg (ends the shift
//          and cancels the auto-turnaround that was waiting for departure).
// @route   POST /api/v1/trips/layover/end
export const endLayover = async (req, res) => {
  try {
    const driverId = req.user.id;
    const profile = await DriverProfile.findOne({ userId: driverId });
    if (!profile || profile.status !== 'layover') {
      return res.status(404).json({ message: 'No active layover for this driver' });
    }

    await DriverProfile.findOneAndUpdate(
      { userId: driverId },
      { status: 'available', activeTripId: null, layoverRouteId: null, layoverShuttleId: null }
    );

    res.json({ message: 'Layover ended. Shift concluded and shuttle released.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error ending layover' });
  }
};

// @desc    Driver-only load-ahead manifest for the current directional trip.
//          Counts per stop (never names — privacy), so the driver knows which
//          shelter expects boards, who is waitlisted, and where onboard seats
//          will next be freed. Occupancy is now fully derived from boarding +
//          auto-alight, so no manual +/− math lives here.
// @route   GET /api/v1/trips/:id/manifest
export const getTripManifest = async (req, res) => {
  try {
    const trip = await Trip.findOne({ _id: req.params.id, driverId: req.user.id, status: 'active' })
      .select('routeId seatsTotal seatsCurrentOccupancy')
      .populate('routeId', 'stops roadSegments');
    if (!trip) {
      return res.status(404).json({ message: 'No matching active trip found for this driver' });
    }

    const profile = await DriverProfile.findOne({ userId: req.user.id }).select('currentLocation');
    let lastPassedIndex = -1;
    if (profile?.currentLocation?.lat != null) {
      const { lat, lng } = profile.currentLocation;
      const speedKmh = observeSpeed(trip._id, lat, lng, Date.now()) ?? DEFAULT_SPEED_KMH;
      lastPassedIndex = lastPassedStopIndexFromEta(
        computeEtaPerStop(lat, lng, trip.routeId?.stops || [], speedKmh, trip.routeId?.roadSegments || [])
      );
    }

    const reservations = await Reservation.find({
      tripId: trip._id,
      status: { $in: ['pending', 'boarded'] }
    }).lean();

    const stops = [...(trip.routeId?.stops || [])].sort((a, b) => a.index - b.index);
    const perStop = stops.map((s) => {
      const entry = { index: s.index, name: s.name, pendingBoarding: 0, waitlisted: 0, dropoffs: 0 };
      for (const r of reservations) {
        if (r.waitlistPosition != null && r.stopName === s.name) entry.waitlisted += 1;
        else if (r.status === 'pending' && r.stopName === s.name) entry.pendingBoarding += 1;
        else if (r.status === 'boarded' && !r.alighted && r.destStopName === s.name) entry.dropoffs += 1;
      }
      return entry;
    });

    const onboard = reservations.filter((r) => r.status === 'boarded' && !r.alighted).length;

    res.json({
      tripId: trip._id,
      lastPassedIndex,
      perStop,
      onboard,
      seatsTotal: trip.seatsTotal
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching trip manifest' });
  }
};

// Shared helper: persist a GPS fix and rebroadcast telemetry to the route room.
// Used by both the REST fallback below and the socket driver:location handler.
export const applyLocationUpdate = async (trip, driverId, lat, lng) => {
  const now = new Date();
  await DriverProfile.findOneAndUpdate(
    { userId: driverId },
    { currentLocation: { lat, lng }, locationUpdatedAt: now }
  );

  const stops = trip.routeId?.stops || [];
  const roadSegments = trip.routeId?.roadSegments || [];
  const speedKmh = observeSpeed(trip._id, lat, lng, now.getTime()) ?? DEFAULT_SPEED_KMH;
  const etaPerStop = computeEtaPerStop(lat, lng, stops, speedKmh, roadSegments);

  safeEmit(`route-${trip.routeId?._id || trip.routeId}`, 'server:eta_update', {
    tripId: trip._id,
    routeId: trip.routeId?._id || trip.routeId,
    lat,
    lng,
    occupancy: trip.seatsCurrentOccupancy,
    seatsTotal: trip.seatsTotal,
    locationUpdatedAt: now,
    speedKmh: Math.round(speedKmh),
    etaPerStop
  });
};

// @desc    REST fallback for GPS pings when the driver's socket link drops
// @route   PATCH /api/v1/trips/:id/location
export const updateTripLocation = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ message: 'Numeric lat and lng are required' });
    }

    const trip = await Trip.findOne({ _id: req.params.id, driverId: req.user.id, status: 'active' })
      .populate('routeId', 'stops roadSegments');
    if (!trip) {
      return res.status(404).json({ message: 'No matching active trip found for this driver' });
    }

    await applyLocationUpdate(trip, req.user.id, lat, lng);

    res.json({ message: 'Location updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating trip location' });
  }
};

// @desc    Driver adjusts the onboard passenger counter (+1 / -1)
// @route   PATCH /api/v1/trips/:id/occupancy
// NOTE: intentionally removed. Occupancy is derived: +1 on confirmBoarding,
// −N on the auto-alight sweep. Drivers never hand-adjust the counter, so the
// value can't drift from the actual seat registry.
