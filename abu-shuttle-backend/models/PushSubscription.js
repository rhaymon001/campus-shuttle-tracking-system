// models/PushSubscription.js — per-browser Web Push subscription owned by a user.
// The unique endpoint lets a re-subscribing browser upsert in place instead of
// piling up dead rows; 404/410 delivery failures prune rows lazily in pushService.
import mongoose from 'mongoose';

const PushSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    endpoint: { type: String, required: true, unique: true },
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
    userAgent: { type: String, default: '' }
  },
  { timestamps: true }
);

const PushSubscription = mongoose.model('PushSubscription', PushSubscriptionSchema);
export default PushSubscription;