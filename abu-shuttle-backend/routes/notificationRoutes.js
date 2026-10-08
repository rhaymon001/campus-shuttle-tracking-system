import express from 'express';
import {
  getNotifications,
  getUnreadCount,
  markAllRead,
  markOneRead,
  deleteNotification
} from '../controllers/notificationController.js';
import verifyJWT from '../middleware/verifyJWT.js';

const router = express.Router();

router.use(verifyJWT);

// Feed + badge
router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);

// Mutations
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markOneRead);
router.delete('/:id', deleteNotification);

export default router;