import mongoose from 'mongoose';
import Reservation from '../models/Reservation.js';
import Trip from '../models/Trip.js';
import Route from '../models/Route.js';
import { getShuttleNsp } from '../socket/index.js';
import { promoteNextWaitlisted } from '../services/reservationQueue.js';
import { createNotification } from '../services/notificationService.js';
import { createScheduledBooking } from '../services/scheduleBooking.js';
import { assignTripSeatSlot, createTripSeatReservation } from '../services/seatAllocation.js';

// @desc    Student checks into queue to receive an active boarding code pass
export const issueBoardingPass = async (req, res) => {
  try {
    const { tripId, stopName, destStopName } = req.body;
    const userId = req.user.id;

    const trip = await Trip.findById(tripId);
    if (!trip || trip.status !== 'active') return res.status(404).json({ message: 'Active loop context not found' });

    // Duplicate guard — one active (pending or boarded) reservation per student
    // per trip, and only while the passenger is still onboard. An already-alighted
    // passenger (auto-alight set alighted:true) may book again on the same trip;
    // blocking on a finished ride produces false "active pass" errors.
    const dup = await Reservation.findOne({
      userId,
      tripId,
      status: { $in: ['pending', 'confirmed', 'boarded'] },
      alighted: false
    }).select('status stopName destStopName waitlistPosition').lean();
    if (dup) {
      return res.status(409).json({
        message: dup.status === 'boarded'
          ? 'You already have an active boarding pass on this trip.'
          : 'You already have a pending boarding pass on this trip. Cancel it before booking another.',
        reservationId: dup._id,
        status: dup.status
      });
    }

    // Resolve boarding + destination stop indexes from the trip's directional
    // route so auto-alight knows exactly which stop to free the seat at. The
    // destination must be a strictly later stop on the same traversal.
    const route = await Route.findById(trip.routeId).select('stops').lean();
    const routeStops = (route?.stops || []).sort((a, b) => a.index - b.index);
    const boardingStop = routeStops.find((s) => s.name === stopName);
    if (!boardingStop) return res.status(400).json({ message: 'Boarding stop not found on this route.' });

    if (!destStopName) {
      return res.status(400).json({ message: 'A destination stop is required to reserve a seat.' });
    }
    const destStop = routeStops.find((s) => s.name === destStopName);
    if (!destStop) return res.status(400).json({ message: 'Destination stop not found on this route.' });
    if (destStop.index <= boardingStop.index) {
      return res.status(400).json({ message: 'Destination must be ahead of the boarding stop on this route.' });
    }

    // Generate unique short 6-character alphanumeric code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Set short pass lifespan window expiration criteria (e.g., 15 minutes)
    const expiryWindow = new Date(Date.now() + 15 * 60 * 1000);
    // Waitlisted passes get a longer expiry so they don't expire while waiting
    const waitlistExpiry = new Date(Date.now() + 120 * 60 * 1000);

    // Count existing waitlisted positions for ordering
    const waitlistCount = await Reservation.countDocuments({ tripId, waitlistPosition: { $ne: null } });

    let reservation = await createTripSeatReservation({
      userId,
      tripId,
      stopName,
      stopIndex: boardingStop.index,
      destStopName,
      destStopIndex: destStop.index,
      confirmationCode: code,
      expiresAt: expiryWindow,
      waitlistPosition: null
    }, trip.seatsTotal);

    const isFull = !reservation;
    if (isFull) {
      reservation = await Reservation.create({
        userId,
        tripId,
        stopName,
        stopIndex: boardingStop.index,
        destStopName,
        destStopIndex: destStop.index,
        confirmationCode: null,
        expiresAt: waitlistExpiry,
        waitlistPosition: waitlistCount + 1
      });
    }

    if (isFull) {
      // Persist + push a waitlist confirmation so the student knows they're queued
      await createNotification({
        userId,
        type: 'waitlist',
        title: 'Added to the waitlist',
        body: `No seats left at ${stopName} right now. You are #${reservation.waitlistPosition} in line — we'll ping you the moment a seat opens.`,
        data: { reservationId: String(reservation._id), tripId: String(tripId), stopName, destStopName, waitlistPosition: reservation.waitlistPosition }
      });

      return res.status(201).json({
        message: 'Bus is currently at capacity. You have been added to the waitlist.',
        waitlisted: true,
        waitlistPosition: reservation.waitlistPosition,
        _id: reservation._id,
        expiresAt: reservation.expiresAt
      });
    }

    // Boarding pass issued — give the student their code in the feed too
    await createNotification({
      userId,
      type: 'reservation',
      title: 'Boarding pass issued',
      body: `Your virtual queue ticket from ${stopName} to ${destStopName} is ready (${code}). Show it to the driver to board.`,
      data: { reservationId: String(reservation._id), tripId: String(tripId), stopName, destStopName, code, expiresAt: reservation.expiresAt }
    });

    res.status(201).json({
      message: 'Boarding pass generated. Proceed to transfer fare to driver.',
      code: reservation.confirmationCode,
      expiresAt: reservation.expiresAt,
      stopName: reservation.stopName,
      destStopName: reservation.destStopName,
      _id: reservation._id
    });
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Queue allocation request failed' });
  }
};

// @desc    Driver matches receipt manually, enters 6-char code, and accepts passenger boarding
export const confirmPassBoarding = async (req, res) => {
  let session;
  try {
    const { confirmationCode } = req.body;
    if (!confirmationCode) return res.status(400).json({ message: 'A boarding code is required.' });

    let outcome = null;
    let boardedPass = null;
    let updatedTrip = null;
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const pass = await Reservation.findOne({
        confirmationCode,
        status: { $in: ['pending', 'confirmed'] }
      }).session(session);
      if (!pass) {
        outcome = 'invalid';
        return;
      }

      const now = new Date();
      if (pass.expiresAt <= now) {
        pass.status = 'expired';
        await pass.save({ session });
        outcome = 'expired';
        return;
      }

      const trip = await Trip.findOne({
        _id: pass.tripId,
        driverId: req.user.id,
        status: 'active'
      }).session(session);
      if (!trip) {
        outcome = 'wrong-trip';
        return;
      }

      boardedPass = await Reservation.findOneAndUpdate(
        { _id: pass._id, status: pass.status, expiresAt: { $gt: now } },
        { $set: { status: 'boarded' } },
        { new: true, session }
      );
      if (!boardedPass) {
        outcome = 'invalid';
        return;
      }

      updatedTrip = await Trip.findOneAndUpdate(
        {
          _id: trip._id,
          driverId: req.user.id,
          status: 'active',
          $expr: { $lt: ['$seatsCurrentOccupancy', '$seatsTotal'] }
        },
        { $inc: { seatsCurrentOccupancy: 1 } },
        { new: true, session }
      );
      if (!updatedTrip) {
        const error = new Error('Bus is structurally full. Shift student to next arriving vehicle.');
        error.code = 'SEAT_CAPACITY';
        throw error;
      }
    });
    await session.endSession();
    session = null;

    if (outcome === 'invalid') {
      return res.status(404).json({ message: 'Ticket pass code is invalid or already processed.' });
    }
    if (outcome === 'expired') {
      return res.status(400).json({ message: 'This boarding token lifespan window has expired.' });
    }
    if (outcome === 'wrong-trip') {
      return res.status(403).json({ message: 'This boarding pass is not for your active trip.' });
    }
    if (!boardedPass || !updatedTrip) {
      return res.status(409).json({ message: 'The boarding pass could not be confirmed.' });
    }

    // Tell the enrolled student their place on board is confirmed
    await createNotification({
      userId: boardedPass.userId,
      type: 'reservation',
      title: 'You are on board',
      body: `Boarding confirmed from ${boardedPass.stopName}. Enjoy the ride!`,
      data: { reservationId: String(boardedPass._id), tripId: String(boardedPass.tripId), stopName: boardedPass.stopName }
    });

    res.json({ message: 'Payment receipt verified. Passenger authorized to board vehicle.', occupancy: updatedTrip.seatsCurrentOccupancy });
  } catch (err) {
    if (session) await session.endSession();
    if (err.code === 'SEAT_CAPACITY') {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: 'Boarding confirmation pipeline failure' });
  }
};

// @desc    Student fetches the live state of their own reservation (refresh reconciliation)
export const getReservationStatus = async (req, res) => {
  try {
    const { reservationId } = req.params;
    const userId = req.user.id;

    const reservation = await Reservation.findOne({ _id: reservationId, userId }).lean();
    if (!reservation) {
      return res.status(404).json({ message: 'Reservation not found or does not belong to you' });
    }

    res.json({
      _id: reservation._id,
      tripId: reservation.tripId,
      stopName: reservation.stopName,
      destStopName: reservation.destStopName || null,
      status: reservation.status,
      confirmationCode: reservation.confirmationCode,
      waitlistPosition: reservation.waitlistPosition ?? null,
      waitlisted: reservation.waitlistPosition !== null,
      expiresAt: reservation.expiresAt
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch reservation status' });
  }
};

// @desc    Student cancels their own pending boarding pass
export const cancelReservation = async (req, res) => {
  try {
    const { reservationId } = req.body;
    const userId = req.user.id;

    const reservation = await Reservation.findOne({ _id: reservationId, userId });
    if (!reservation) {
      return res.status(404).json({ message: 'Reservation not found or does not belong to you' });
    }
    if (reservation.status !== 'pending') {
      return res.status(400).json({ message: `Cannot cancel a reservation with status '${reservation.status}'` });
    }

    reservation.status = 'cancelled';
    await reservation.save();

    const nsp = getShuttleNsp();
    nsp.emit('reservation:cancelled', { userId, reservationId });

    await createNotification({
      userId,
      type: 'reservation',
      title: 'Boarding pass cancelled',
      body: `Your reservation at ${reservation.stopName} was cancelled.`,
      data: { reservationId: String(reservation._id), tripId: String(reservation.tripId), stopName: reservation.stopName }
    });

    // Promote next waitlisted student only if a non-waitlisted slot was freed
    if (!reservation.waitlistPosition) {
      await promoteNextWaitlisted(reservation.tripId);
    }

    res.json({ message: 'Boarding pass cancelled successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to cancel reservation' });
  }
};

// @desc    Student pre-books a seat on a future scheduled departure (no bus live yet)
// @route   POST /api/v1/reservations/schedule
export const scheduleReservation = async (req, res) => {
  try {
    const { scheduleSlotId, stopName, destStopName, scheduledFor } = req.body;

    const booking = await createScheduledBooking({
      userId: req.user.id,
      scheduleSlotId,
      stopName,
      destStopName,
      scheduledFor
    });

    await createNotification({
      userId: req.user.id,
      type: 'reservation',
      title: 'Pre-booking confirmed',
      body: `Seat reserved from ${booking.stopName} to ${booking.destStopName}. We'll send your boarding code once the bus goes live.`,
      data: {
        reservationId: String(booking._id),
        stopName: booking.stopName,
        destStopName: booking.destStopName,
        scheduledFor: booking.scheduledFor
      }
    });

    res.status(201).json({
      message: 'Seat pre-booked. Your boarding code arrives once a bus goes live.',
      _id: booking._id,
      status: booking.status,
      stopName: booking.stopName,
      destStopName: booking.destStopName,
      scheduledFor: booking.scheduledFor
    });
  } catch (err) {
    if (err && err.status) {
      return res.status(err.status).json({ message: err.message, reservationId: err.reservationId });
    }
    console.error(err);
    res.status(500).json({ message: 'Failed to create scheduled pre-booking' });
  }
};

// @desc    Student fetches their own upcoming scheduled pre-bookings
// @route   GET /api/v1/reservations/scheduled
export const getScheduledReservations = async (req, res) => {
  try {
    const bookings = await Reservation.find({
      userId: req.user.id,
      isScheduled: true,
      status: { $in: ['pending', 'confirmed'] }
    })
      .populate('routeId', 'name direction')
      .sort({ scheduledFor: 1 })
      .lean();

    res.json(bookings.map((b) => ({
      _id: b._id,
      routeName: b.routeId?.name || 'Unknown route',
      stopName: b.stopName,
      destStopName: b.destStopName,
      scheduledFor: b.scheduledFor,
      status: b.status,
      confirmationCode: b.confirmationCode,
      expiresAt: b.expiresAt
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch scheduled pre-bookings' });
  }
};