import Reservation from '../models/Reservation.js';
import Trip from '../models/Trip.js';

// Returns an unclaimed trip seat index. The unique Reservation index is the
// concurrency guard; callers retry after duplicate-key conflicts.
export const findAvailableTripSeatSlot = async (tripId, seatsTotal) => {
  const trip = await Trip.findOne({ _id: tripId, status: 'active' })
    .select('seatsCurrentOccupancy')
    .lean();
  if (!trip) return null;

  const reservations = await Reservation.find({
    tripId,
    status: { $in: ['pending', 'confirmed', 'boarded'] },
    alighted: false
  }).select('seatSlot status waitlistPosition').lean();

  const active = reservations.filter(({ waitlistPosition }) => waitlistPosition == null);
  const allocations = active.filter(({ seatSlot }) => Number.isInteger(seatSlot));
  const usedSlots = new Set(allocations.map(({ seatSlot }) => seatSlot));
  const allocatedBoarded = allocations.filter(({ status }) => status === 'boarded').length;
  const legacyPending = active.filter(({ seatSlot, status }) =>
    !Number.isInteger(seatSlot) && status !== 'boarded'
  ).length;
  const legacyOccupancy = Math.max(
    legacyPending,
    trip.seatsCurrentOccupancy - allocatedBoarded
  );

  if (usedSlots.size + legacyOccupancy >= seatsTotal) return null;
  let unallocatedLegacySeats = legacyOccupancy;
  for (let seatSlot = 0; seatSlot < seatsTotal; seatSlot += 1) {
    if (usedSlots.has(seatSlot)) continue;
    if (unallocatedLegacySeats > 0) {
      unallocatedLegacySeats -= 1;
      continue;
    }
    return seatSlot;
  }
  return null;
};

export const createTripSeatReservation = async (fields, seatsTotal) => {
  for (let attempt = 0; attempt < seatsTotal; attempt += 1) {
    const seatSlot = await findAvailableTripSeatSlot(fields.tripId, seatsTotal);
    if (seatSlot == null) return null;
    try {
      return await Reservation.create({ ...fields, seatSlot });
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  return null;
};

export const assignTripSeatSlot = async (reservationId, tripId, seatsTotal, fields, filter = {}) => {
  for (let attempt = 0; attempt < seatsTotal; attempt += 1) {
    const seatSlot = await findAvailableTripSeatSlot(tripId, seatsTotal);
    if (seatSlot == null) return null;
    try {
      return await Reservation.findOneAndUpdate(
        {
          _id: reservationId,
          status: 'pending',
          tripId: Object.hasOwn(filter, 'tripId') ? filter.tripId : tripId,
          ...filter
        },
        { $set: { ...fields, tripId, seatSlot } },
        { new: true }
      );
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  return null;
};