// models/Route.js
import mongoose from "mongoose";

const RouteSchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: true,
      trim: true 
    },
    direction: { 
      type: String, 
      required: true // e.g., "Samaru Main Gate to Kongo Campus"
    },
    stops: [
      {
        index: { type: Number, required: true },
        name: { type: String, required: true, trim: true },
        lat: { type: Number, required: true },
        lng: { type: Number, required: true }
      }
    ],
    distance: { 
      type: String, 
      required: true // e.g., "12.5 km"
    },
    // Precomputed OSRM legs between consecutive stops (see utils/routing.js).
    // Absent for routes created before this feature — ETAs then fall back to
    // crow-flies rather than failing.
    roadSegments: [
      {
        _id: false,
        fromIndex: { type: Number, required: true },
        toIndex: { type: Number, required: true },
        distanceMeters: { type: Number, required: true },
        durationSeconds: { type: Number, default: null },
        source: { type: String, enum: ['road', 'straight'], default: 'road' }
      }
    ],
    roadProfileComputedAt: { type: Date, default: null },

    activeBuses: { 
      type: Number, 
      default: 0 // Dynamically updated when drivers start/end trips
    },
    isActive: {
      type: Boolean,
      default: true
    },
    // The opposing-direction route of this pair (auto-generated). Lets the driver
    // turn around at a terminus by chaining trips without the student app going
    // blind mid-swing.
    reverseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route',
      default: null
    }
  },
  {
    timestamps: true
  }
);

const Route = mongoose.model('Route', RouteSchema);
export default Route;