import mongoose from 'mongoose';

const driverProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Establishes the 1-to-1 mapping back to the main User model 
      required: true,
      unique: true, // Guarantees a strict 1-to-1 relationship limit 
    },
    licenseNumber: {
      type: String,
      required: true, // Mandatory driver credential asset [cite: 16, 32]
    },
    phoneNumber: {
      type: String,
      trim: true, // Contact line captured during admin onboarding
    },
    assignedShuttleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shuttle',
      default: null, // Nullable when the driver doesn't have a vehicle assigned 
    },
    status: {
      type: String,
      enum: ['available', 'on_trip', 'layover', 'off_duty'], // State tracking machine for the live maps
      default: 'off_duty',
    },
    // Auto-turnaround (departure-triggered): while the driver waits at a terminus
    // with their forward trip ended, these fields hold the return-leg context so
    // the socket layer can start the reverse trip the moment the vehicle moves.
    // Survives reconnect — the handshake re-hydrates socket.data.layover from here.
    layoverRouteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route',
      default: null,
    },
    layoverShuttleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shuttle',
      default: null,
    },
    currentLocation: {
      // Inline coordinates object structure overwritten on each real-time GPS update event 
      lat: {
        type: Number,
        default: null,
      },
      lng: {
        type: Number,
        default: null,
      },
    },
    locationUpdatedAt: {
      type: Date,
      default: null, // Used by the map parser to flag stale positions after 10 seconds [cite: 19, 32]
    },
    activeTripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      default: null, // Set during Start Trip operation, cleared entirely upon End Trip conclusion [cite: 19, 32]
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt fields for project documentation audits
  }
);

const DriverProfile = mongoose.model('DriverProfile', driverProfileSchema);

export default DriverProfile;