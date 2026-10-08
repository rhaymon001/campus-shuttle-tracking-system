// models/Notification.js — persistent, per-user notification feed.
//
// Covers both the reservation/proximity alerts a student should see later and
// the system/broadcast messages an admin pushes. Rows auto-expire 7 days after
// creation via the TTL index, so the collection never needs a manual purge.
import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    type: {
      type: String,
      enum: ['reservation', 'waitlist', 'proximity', 'system', 'broadcast'],
      default: 'system'
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    // Free-form context the UI can use to deep-link (reservationId, tripId, stopName…)
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// Auto-delete notifications 7 days after they were created
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });
// Feed + unread badge queries
NotificationSchema.index({ userId: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', NotificationSchema);
export default Notification;