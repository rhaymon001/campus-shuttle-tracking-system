// services/scheduleBooking.js — scheduled pre-booking lifecycle.
//
// A pre-booking reserves a seat against a ScheduleSlot's recurring window BEFORE
// any bus is live. It carries no tripId until a bus on that route actually goes
// live near the chosen departure, at which point it is auto-confirmed into a
// normal 6-char boarding pass. If no bus matches in time, the pre-booking lapses.
import Reservation from '../models/Reservation.js';
import Trip from '../models/Trip.js';
import ScheduleSlot from '../models/ScheduleSlot.js';
import { createNotification } from './notificationService.js';
import { assignTripSeatSlot } from './seatAllocation.js';

// Campus local time is WAT (UTC+1). Schedule windows ("06:00"–"21:00") are in
// that zone, so time-of-day validation converts the chosen instant accordingly
// instead of trusting the server's clock zone.
const TZ_OFFSET_MIN = Number(process.env.CAMPUS_TZ_OFFSET_MINUTES ?? 60);

// How far ahead of a departure we materialize the boarding code, and how long
// after it we still confirm a late-running bus before the booking lapses.
const LEAD_CONFIRM_MIN = 30;
const CONFIRM_GRACE_MIN = 15;

// Seat cap per route+departure while the bus stays unassigned. Mirrors the
// largest campus Hiace; configurable for larger fleets.
const CAPACITY = Number(process.env.SCHEDULE_BOOKING_CAPACITY ?? 14);
console.log(`[Schedule] Pre-booking capacity set to ${CAPACITY} seats per departure`);

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// Shift an instant into campus-local wall-clock for day/time comparisons.
const toCampusTime = (date) => new Date(date.getTime() + TZ_OFFSET_MIN * 60 * 1000);

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};

// Validates a pre-booking request against the slot window and route geometry.
// Throws { status, message } shape for the controller to relay.
export const validateScheduledBooking = async ({ scheduleSlotId, stopName, destStopName, scheduledFor }) => {
  if (!scheduleSlotId || !stopName || !destStopName || !scheduledFor) {
    throw { status: 400, message: 'Schedule, boarding stop, destination stop, and departure time are required.' };
  }

  const when = new Date(scheduledFor);
  if (Number.isNaN(when.getTime())) {
    throw { status: 400, message: 'Departure time is not a valid date.' };
  }
  if (when.getTime() <= Date.now()) {
    throw { status: 400, message: 'Departure time must be in the future.' };
  }

  const slot = await ScheduleSlot.findById(scheduleSlotId).populate('routeId', 'stops');
  if (!slot || !slot.isActive) {
    throw { status: 404, message: 'That schedule is not available for pre-booking.' };
  }
  if (!slot.routeId || !slot.routeId._id) {
    throw { status: 404, message: 'The route for this schedule no longer exists.' };
  }

  const campus = toCampusTime(when);
  const dayKey = DAY_KEYS[campus.getUTCDay()];
  if (!slot.recurringDays.includes(dayKey)) {
    throw { status: 400, message: `This service does not run on ${dayKey.toUpperCase()}.` };
  }

  const minutes = campus.getUTCHours() * 60 + campus.getUTCMinutes();
  if (minutes < toMinutes(slot.startTime) || minutes > toMinutes(slot.endTime)) {
    throw { status: 400, message: `Departure must fall within the service window ${slot.startTime}–${slot.endTime}.` };
  }

  const stops = [...(slot.routeId.stops || [])].sort((a, b) => a.index - b.index);
  const boarding = stops.find((s) => s.name === stopName);
  const dest = stops.find((s) => s.name === destStopName);
  if (!boarding) throw { status: 400, message: 'Boarding stop not found on this route.' };
  if (!dest) throw { status: 400, message: 'Destination stop not found on this route.' };
  if (dest.index <= boarding.index) {
    throw { status: 400, message: 'Destination must be ahead of the boarding stop on this route.' };
  }

  return { slot, routeId: slot.routeId._id, boarding, dest, when };
};

// Creates a pending scheduled pre-booking (no trip yet).
export const createScheduledBooking = async ({ userId, scheduleSlotId, stopName, destStopName, scheduledFor }) => {
  const { routeId, boarding, dest, when } = await validateScheduledBooking({
    scheduleSlotId, stopName, destStopName, scheduledFor
  });

  const dup = await Reservation.findOne({
    userId,
    routeId,
    scheduledFor: when,
    status: { $in: ['pending', 'confirmed'] }
  }).select('_id status confirmationCode').lean();
  if (dup) {
    throw { status: 409, message: 'You already have a pre-booking for this departure.', reservationId: dup._id };
  }

  for (let attempt = 0; attempt < CAPACITY; attempt += 1) {
    const existing = await Reservation.find({
      routeId,
      scheduledFor: when,
      isScheduled: true,
      status: { $in: ['pending', 'confirmed', 'boarded'] }
    }).select('scheduledSeatSlot').lean();
    const usedSlots = new Set(existing
      .map(({ scheduledSeatSlot }) => scheduledSeatSlot)
      .filter(Number.isInteger));
    let legacySeats = existing.filter(({ scheduledSeatSlot }) => !Number.isInteger(scheduledSeatSlot)).length;
    let candidate = null;
    for (let seatSlot = 0; seatSlot < CAPACITY; seatSlot += 1) {
      if (usedSlots.has(seatSlot)) continue;
      if (legacySeats > 0) {
        legacySeats -= 1;
        continue;
      }
      candidate = seatSlot;
      break;
    }
    if (candidate == null) {
      throw { status: 409, message: 'That departure is fully pre-booked. Try another time.' };
    }

    try {
      return await Reservation.create({
        userId,
        tripId: null,
        routeId,
        stopName,
        stopIndex: boarding.index,
        destStopName,
        destStopIndex: dest.index,
        isScheduled: true,
        scheduleSlotId,
        scheduledFor: when,
        scheduledSeatSlot: candidate,
        status: 'pending',
        expiresAt: new Date(when.getTime() + CONFIRM_GRACE_MIN * 60 * 1000)
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }

  throw { status: 409, message: 'That departure is fully pre-booked. Try another time.' };
};

// Materializes pending pre-bookings into real boarding passes once a bus goes
// live on their route near the chosen departure. Safe to call repeatedly.
export const confirmScheduledBookings = async () => {
  const now = Date.now();
  const window = {
    $gte: new Date(now - CONFIRM_GRACE_MIN * 60 * 1000),
    $lte: new Date(now + LEAD_CONFIRM_MIN * 60 * 1000)
  };

  const trips = await Trip.find({ status: 'active' }).select('_id routeId seatsTotal').lean();
  if (!trips.length) return 0;

  const tripByRoute = new Map();
  for (const t of trips) {
    if (t.routeId && !tripByRoute.has(String(t.routeId))) tripByRoute.set(String(t.routeId), t);
  }

  let confirmed = 0;
  for (const [routeId, trip] of tripByRoute) {
    const pending = await Reservation.find({
      isScheduled: true,
      status: 'pending',
      tripId: null,
      routeId,
      scheduledFor: window
    }).sort({ scheduledFor: 1, createdAt: 1, _id: 1 });

    for (const booking of pending) {
      const code = generateCode();
      const assigned = await assignTripSeatSlot(
        booking._id,
        trip._id,
        trip.seatsTotal || CAPACITY,
        {
          confirmationCode: code,
          status: 'confirmed',
          expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        },
        { tripId: null, isScheduled: true, scheduledFor: booking.scheduledFor }
      );
      if (!assigned) continue;
      confirmed += 1;

      await createNotification({
        userId: assigned.userId,
        type: 'reservation',
        title: 'Your pre-booked boarding pass is ready',
        body: `Your seat from ${assigned.stopName} to ${assigned.destStopName} is confirmed (${code}). Show it to the driver.`,
        data: {
          reservationId: String(assigned._id),
          tripId: String(trip._id),
          stopName: assigned.stopName,
          destStopName: assigned.destStopName,
          code
        }
      });
    }
  }

  if (confirmed) console.log(`[Schedule] Confirmed ${confirmed} pre-booking(s)`);
  return confirmed;
};

// Lapses pending pre-bookings whose departure passed with no matching bus.
export const expireScheduledBookings = async () => {
  const now = new Date();
  const cutoff = new Date(now.getTime() - CONFIRM_GRACE_MIN * 60 * 1000);
  const lapsed = await Reservation.find({
    isScheduled: true,
    status: { $in: ['pending', 'confirmed'] },
    $or: [
      { tripId: null, scheduledFor: { $lte: cutoff } },
      { tripId: { $ne: null }, expiresAt: { $lte: now } }
    ]
  });

  for (const booking of lapsed) {
    booking.status = 'expired';
    await booking.save();
    const hadLivePass = Boolean(booking.tripId);
    await createNotification({
      userId: booking.userId,
      type: 'reservation',
      title: hadLivePass ? 'Scheduled boarding pass expired' : 'Pre-booking lapsed',
      body: hadLivePass
        ? `Your boarding pass for ${booking.stopName} expired before boarding. You can book another departure.`
        : `No bus ran for your ${booking.stopName} pre-booking. You can book another departure.`,
      data: { reservationId: String(booking._id), stopName: booking.stopName }
    });
  }

  if (lapsed.length) console.log(`[Schedule] Expired ${lapsed.length} unfulfilled pre-booking(s)`);
  return lapsed.length;
};
