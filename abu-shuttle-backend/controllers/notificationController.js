// controllers/notificationController.js — per-user notification feed endpoints
import Notification from '../models/Notification.js';
import PushSubscription from '../models/PushSubscription.js';
import { serializeNotification } from '../services/notificationService.js';

// @desc    Fetch the current user's notification feed (newest first)
// @route   GET /api/v1/notifications
export const getNotifications = async (req, res) => {
  try {
    const { limit = 50, unread } = req.query;
    const filter = { userId: req.user.id };
    if (unread === 'true') filter.read = false;

    const docs = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit, 10) || 50, 100))
      .lean();

    res.json({ items: docs.map(serializeNotification) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load notifications', error: err.message });
  }
};

// @desc    Count unread notifications (drives the bell badge)
// @route   GET /api/v1/notifications/unread-count
export const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ userId: req.user.id, read: false });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: 'Failed to count notifications', error: err.message });
  }
};

// @desc    Mark every notification read for the current user
// @route   PATCH /api/v1/notifications/read-all
export const markAllRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user.id, read: false },
      { $set: { read: true, readAt: new Date() } }
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update notifications', error: err.message });
  }
};

// @desc    Mark a single notification read (ownership enforced)
// @route   PATCH /api/v1/notifications/:id/read
export const markOneRead = async (req, res) => {
  try {
    const doc = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id, read: false },
      { $set: { read: true, readAt: new Date() } },
      { new: true }
    ).lean();
    if (!doc) {
      return res.status(404).json({ message: 'Notification not found or already read' });
    }
    res.json(serializeNotification(doc));
  } catch (err) {
    res.status(500).json({ message: 'Failed to update notification', error: err.message });
  }
};

// @desc    Delete a single notification (ownership enforced)
// @route   DELETE /api/v1/notifications/:id
export const deleteNotification = async (req, res) => {
  try {
    const doc = await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!doc) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    res.json({ message: 'Notification removed' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete notification', error: err.message });
  }
};

// @desc    Save the user's browser Push subscription (upsert on endpoint)
// @route   POST /api/v1/notifications/push/subscribe
export const subscribePush = async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: 'A full subscription (endpoint, p256dh, auth) is required' });
    }
    const sub = await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        userId: req.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: req.headers['user-agent'] || ''
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ message: 'Push subscription saved', _id: sub._id });
  } catch (err) {
    res.status(500).json({ message: 'Failed to save push subscription', error: err.message });
  }
};

// @desc    Remove the user's browser Push subscription
// @route   DELETE /api/v1/notifications/push/subscribe
export const unsubscribePush = async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ message: 'endpoint is required' });
    await PushSubscription.deleteOne({ endpoint, userId: req.user.id });
    res.json({ message: 'Push subscription removed' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to remove push subscription', error: err.message });
  }
};