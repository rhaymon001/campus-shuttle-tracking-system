import mongoose from "mongoose";

const TripSchema = new mongoose.Schema({
  // Relational link to the physical vehicle asset
  shuttleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shuttle',
    required: [true, 'A trip must be bound to a physical vehicle asset']
  },

  // Relational link to the user account operating the bus (role: 'driver')
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'A trip must have an assigned driver profile']
  },

  // Relational link to the active loop path being driven
  routeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    required: [true, 'A trip must specify an active campus route']
  },

  // State machine constraint tracking the lifecycle of the driver's daily shift loop
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active'
  },

  // Total seat volume baseline (captured from shuttle details at trip initiation to handle asset changes)
  seatsTotal: {
    type: Number,
    required: [true, 'Maximum seating capacity must be snapshotted']
  },

  // Dynamic accumulator tracking real-time passenger counts on board the vehicle
  seatsCurrentOccupancy: {
    type: Number,
    default: 0,
    min: [0, 'Occupancy cannot drop below empty layout constraints'],
    validate: {
      validator: function(value) {
        // Enforces that drivers cannot overload passenger targets beyond structural seat limits
        return value <= this.seatsTotal;
      },
      message: 'Occupancy capacity overload violation detected'
    }
  },

  // Timestamp logging when the driver clocks in and starts running loops
  startedAt: {
    type: Date,
    default: Date.now
  },

  // Timestamp logging when the driver finishes their shift for the evening
  endedAt: {
    type: Date
  }
}, {
  // Automatically attaches standard createdAt and updatedAt telemetry blocks
  timestamps: true
});

// Compound index to guarantee that a driver cannot run two parallel active trips simultaneously
TripSchema.index({ driverId: 1, status: 1 }, { 
  unique: true, 
  partialFilterExpression: { status: 'active' } 
});

const Trip = mongoose.model('Trip', TripSchema);
export default Trip;