// services/pushService.js — fan a notification out to a user's Web Push
// subscriptions. Silent best-effort: a dead endpoint (404/410) is pruned and
// logged; a missing VAPID config degrades cleanly to feed-only mode.
import PushSubscription from '../models/PushSubscription.js';
import { pushClient, vapidConfigured } from '../config/vapid.js';

export const sendPushToUser = async (userId, { title, body, data = {} }) => {
  if (!vapidConfigured) return;

  const subs = await PushSubscription.find({ userId }).select('endpoint p256dh auth').lean();
  if (!subs.length) return;

  const payload = JSON.stringify({ title, body, data });
  // Short TTL: shuttle alerts are time-sensitive; do not queue stale rides.
  const options = { TTL: 900 };

  await Promise.all(subs.map(async (sub) => {
    try {
      await pushClient.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        options
      );
    } catch (err) {
      const status = err?.statusCode;
      if (status === 404 || status === 410) {
        console.warn(`Pruning dead push subscription ${sub.endpoint}`);
        await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
      } else {
        console.warn('Web Push delivery failed:', status || err.message);
      }
    }
  }));
};