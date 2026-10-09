import mongoose from 'mongoose';

const reservationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // References the student making the seat booking
      required: true,
    },
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip', // References the specific live or scheduled journey loop
      required: true,
    },
    stopName: {
      type: String,
      required: true, // The precise ABU stop where the student intends to board (e.g., 'Samaru Gate')
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'boarded', 'cancelled', 'expired'],
      default: 'pending', // Initial placement state prior to seat processing confirmation
    },
    confirmationCode: {
      type: String,
      maxLength: 6,
      minLength: 6,
      default: null, // Populated with a unique 6-character string once status shifts to confirmed
    },
    isScheduled: {
      type: Boolean,
      default: false, // Flagged true if generated via the calendar template pre-booking queue
    },
    scheduleSlotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ScheduleSlot',
      default: null, // Nullable unless isScheduled is checked true
    },
    // Index of the boarding stop within the trip's directional route (stop list).
    // Required for "still ahead of the bus" waitlist-promotion filtering.
    stopIndex: {
      type: Number,
      default: null,
    },
    // Where the student plans to alight. Auto-alight frees the seat the moment
    // the bus passes this stop, so occupancy stays truthful without driver math.
    destStopName: {
      type: String,
      trim: true,
      default: null,
    },
    destStopIndex: {
      type: Number,
      default: null,
    },
    // Single source of truth for "this passenger is off the bus". Both the auto
    // sweep and the terminus sweep mark it once; double decrements are impossible
    // because the flag is only ever flipped false → true.
    alighted: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true, // Evaluated to trip.startedAt + 5 minutes; parsed by the reservation cron layer
    },
    waitlistPosition: {
      type: Number,
      default: null, // Set only when the reservation is waitlisted (trip full at time of request)
    },
  },
  {
    timestamps: true, // Captures the required createdAt parameter natively
  }
);

// ⚡️ CRITICAL PERFORMANCE OPTIMIZATION
// Compound index optimization explicitly required for rapid, conflict-free seat availability tracking queries
reservationSchema.index({ tripId: 1, status: 1 });

// Alight-sweep + manifest lookups: "who is still onboard whose destination the bus has passed"
reservationSchema.index({ tripId: 1, status: 1, alighted: 1 });

const Reservation = mongoose.model('Reservation', reservationSchema);

export default Reservation;