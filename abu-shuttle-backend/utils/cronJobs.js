import cron from 'node-cron';
import Reservation from '../models/Reservation.js';
import { getShuttleNsp } from '../socket/index.js';
import { promoteNextWaitlisted } from '../services/reservationQueue.js';
import { createNotification } from '../services/notificationService.js';

const initCronJobs = () => {
  // Sweep expired reservations every 60 seconds
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const expired = await Reservation.find({ status: 'pending', expiresAt: { $lte: now } });
      if (expired.length === 0) return;

      const ids = expired.map((r) => r._id);
      const userIds = [...new Set(expired.map((r) => String(r.userId)))];

      // Only non-waitlisted expired reservations free up a slot for promotion
      const activeExpiredTripIds = [
        ...new Set(expired.filter((r) => !r.waitlistPosition).map((r) => String(r.tripId)))
      ];

      await Reservation.updateMany(
        { _id: { $in: ids } },
        { $set: { status: 'expired' } }
      );

      const nsp = getShuttleNsp();
      for (const userId of userIds) {
        nsp.emit('reservation:expired', { userId });
      }

      // Let each affected student know their pass lapsed and why
      const expiriesByUser = new Map(); // userId -> [{stopName, waitlisted}]
      for (const r of expired) {
        if (!expiriesByUser.has(String(r.userId))) expiriesByUser.set(String(r.userId), []);
        expiriesByUser.get(String(r.userId)).push({ stopName: r.stopName, waitlisted: r.waitlistPosition !== null });
      }
      for (const [userId, items] of expiriesByUser) {
        const [{ stopName, waitlisted }] = items;
        await createNotification({
          userId,
          type: waitlisted ? 'waitlist' : 'reservation',
          title: waitlisted ? 'Waitlist spot expired' : 'Boarding pass expired',
          body: waitlisted
            ? `Your waitlist spot at ${stopName} lapsed before a seat opened. You can join the queue again.`
            : `Your boarding pass for ${stopName} expired before boarding. Rebook a new pass.`,
          data: { stopName }
        });
      }

      // Promote next waitlisted on each trip that had a non-waitlisted expired slot
      for (const tripId of activeExpiredTripIds) {
        await promoteNextWaitlisted(tripId);
      }

      console.log(`[Cron] Expired ${ids.length} reservation(s) for ${userIds.length} user(s)`);
    } catch (err) {
      console.error('[Cron] Reservation expiry sweep error:', err.message);
    }
  });

  console.log('[Cron] Reservation expiry sweeper registered (60s interval)');
};

export default initCronJobs;