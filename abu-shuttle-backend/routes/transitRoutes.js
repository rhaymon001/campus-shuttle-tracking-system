import express from 'express';
import { getAllRoutes, createRoute, getRouteById } from '../controllers/transitController.js';
import { createScheduleSlot, getScheduleSlots } from '../controllers/scheduleslotController.js';
import verifyJWT from '../middleware/verifyJWT.js';
import verifyRole from '../middleware/verifyRoles.js';

const router = express.Router();

// Public/Student read-only routes
router.get('/routes', getAllRoutes);
router.get('/routes/:id', getRouteById);
router.get('/schedules', getScheduleSlots);

// Admin-only structural creation route
router.post('/routes', verifyJWT, verifyRole(['admin']), createRoute);
router.post('/schedules', verifyJWT, verifyRole(['admin']), createScheduleSlot)

export default router;