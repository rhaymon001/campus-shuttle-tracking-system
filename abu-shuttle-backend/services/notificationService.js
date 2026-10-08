// services/notificationService.js — single entry point for creating feed
// notifications and fanning them out to the recipient's live socket room.
//
// Every notification is persisted (REST poll) AND pushed (events) so clients
// never miss an alert: offline users catch it on next load, online ones see it
// instantly via `notification:new`.
import Notification from '../models/Notification.js';
import { getShuttleNsp } from '../socket/index.js';

export const serializeNotification = (doc) => ({
  _id: doc._id,
  type: doc.type,
  title: doc.title,
  body: doc.body,
  data: doc.data || {},
  read: doc.read,
  readAt: doc.readAt,
  createdAt: doc.createdAt
});

export const createNotification = async ({ userId, type, title, body, data = {} }) => {
  if (!userId) return null;

  const doc = await Notification.create({ userId, type, title, body, data });
  const payload = serializeNotification(doc);

  // Push in real time to the recipient's user room (joined on socket connect).
  // Never throw into the caller — a feed failure must not break boarding flow.
  try {
    getShuttleNsp().to(`user-${String(userId)}`).emit('notification:new', { notification: payload });
  } catch (err) {
    console.warn('notification:new emit failed:', err.message);
  }

  return payload;
};