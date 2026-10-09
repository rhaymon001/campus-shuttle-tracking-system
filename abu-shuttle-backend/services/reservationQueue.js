// services/reservationQueue.js — shared waitlist-promotion logic.
//
// Both the REST cancel path and the expiry cron need "next student up gets a
// boarding code" — previously duplicated verbatim in two files. Centralized here
// with the promotion notification so the two paths can never drift apart.
import Reservation from '../models/Reservation.js';
import { getShuttleNsp } from '../socket/index.js';
import { createNotification } from './notificationService.js';

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
    .sort({ waitlistPosition: 1 });
  if (!next) return null;

  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const expiryWindow = new Date(Date.now() + 15 * 60 * 1000);

  next.confirmationCode = code;
  next.expiresAt = expiryWindow;
  next.waitlistPosition = null;
  await next.save();

  const nsp = getShuttleNsp();
  nsp.emit('waitlist:promoted', { userId: next.userId, reservationId: next._id, code, expiresAt: expiryWindow });

  await createNotification({
    userId: next.userId,
    type: 'waitlist',
    title: 'Seat unlocked — boarding code ready',
    body: `A seat opened up on your ride from ${next.stopName}. Board with your 6-char code before it expires.`,
    data: { reservationId: String(next._id), tripId: String(tripId), code, expiresAt: expiryWindow }
  });

  console.log(`[Waitlist] Promoted reservation ${next._id} on trip ${tripId}`);

  // Return the student's user id so callers can also emit targeted events if needed
  return { userId: next.userId, reservation: next };
};