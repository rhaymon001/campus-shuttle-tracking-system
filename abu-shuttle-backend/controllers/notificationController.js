// controllers/notificationController.js — per-user notification feed endpoints
import Notification from '../models/Notification.js';
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