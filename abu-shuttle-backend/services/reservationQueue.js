// services/reservationQueue.js — shared waitlist-promotion logic.
//
// Both the REST cancel path and the expiry cron need "next student up gets a
// boarding code" — previously duplicated verbatim in two files. Centralized here
// with the promotion notification so the two paths can never drift apart.
import Reservation from '../models/Reservation.js';
import Trip from '../models/Trip.js';
import { getShuttleNsp } from '../socket/index.js';
import { createNotification } from './notificationService.js';
import { assignTripSeatSlot } from './seatAllocation.js';

// Promotes the next waitlisted passenger to an active boarding code.
//
// `afterStopIndex` (the last stop the bus has passed) narrows the pool to
// students whose boarding stop is still ahead of the bus — after an auto-alight
// sweep a passenger whose stop is already behind could never catch the vehicle.
// When omitted (cancel/expiry paths) the pool is unfiltered.
export const promoteNextWaitlisted = async (tripId, opts = {}) => {
  const { afterStopIndex } = opts;
  const filter = { tripId, status: 'pending', waitlistPosition: { $ne: null } };
  if (afterStopIndex != null) filter.stopIndex = { $gt: afterStopIndex };

  const next = await Reservation.findOne(filter)
    .sort({ waitlistPosition: 1, createdAt: 1, _id: 1 });
  if (!next) return null;

  const trip = await Trip.findOne({ _id: tripId, status: 'active' }).select('seatsTotal').lean();
  if (!trip) return null;

  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const expiryWindow = new Date(Date.now() + 15 * 60 * 1000);
  const promoted = await assignTripSeatSlot(
    next._id,
    tripId,
    trip.seatsTotal,
    { confirmationCode: code, expiresAt: expiryWindow, waitlistPosition: null },
    { waitlistPosition: { $ne: null } }
  );
  if (!promoted) return null;

  const nsp = getShuttleNsp();
  nsp.to(`user-${String(promoted.userId)}`).emit('waitlist:promoted', {
    userId: String(promoted.userId), reservationId: promoted._id, code, expiresAt: expiryWindow
  });

  await createNotification({
    userId: promoted.userId,
    type: 'waitlist',
    title: 'Seat unlocked — boarding code ready',
    body: `A seat opened up on your ride from ${promoted.stopName}. Board with your 6-char code before it expires.`,
    data: { reservationId: String(promoted._id), tripId: String(tripId), code, expiresAt: expiryWindow }
  });

  console.log(`[Waitlist] Promoted reservation ${promoted._id} on trip ${tripId}`);

  // Return the student's user id so callers can also emit targeted events if needed
  return { userId: promoted.userId, reservation: promoted };
};