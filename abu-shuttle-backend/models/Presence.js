// models/Presence.js — opt-in student location sharing for map proximity features
import mongoose from 'mongoose';

const PresenceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    // Denormalized for cheap client rendering without a User populate
    name: {
        type: String,
        required: true,
        trim: true
    },
    currentLocation: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true }
    },
    locationUpdatedAt: {
        type: Date,
        default: Date.now
    },
    // Set false when a student switches sharing off, so we stop surfacing them
    sharing: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// TTL index: purge stale presence rows 15 minutes after their last heartbeat
PresenceSchema.index({ locationUpdatedAt: 1 }, { expireAfterSeconds: 900 });

export default mongoose.model('Presence', PresenceSchema);
