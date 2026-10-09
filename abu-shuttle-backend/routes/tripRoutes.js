import express from 'express';
import {
  startTrip,
  endTrip,
  forceEndTrip,
  getActiveTrips,
  getDriverActiveTrip,
  endLayover,
  getTripManifest,
  updateTripLocation
} from '../controllers/tripController.js';
import verifyJWT from '../middleware/verifyJWT.js';
import verifyRole from '../middleware/verifyRoles.js';

const router = express.Router();

// ⚡️ Students hit this to see approaching vehicles inside the queue drawer
router.get('/', verifyJWT, getActiveTrips);

// Driver session resume — fetch this driver's single live loop if one exists
router.get('/driver/active', verifyJWT, verifyRole(['driver']), getDriverActiveTrip);

// Only authenticated drivers can manipulate continuous-loop shift states
router.post('/start', verifyJWT, verifyRole(['driver']), startTrip);
router.patch('/end/:id', verifyJWT, verifyRole(['driver']), endTrip);

// Auto-turnaround control surface: ending a layover concludes the shift and
// cancels the queued return leg (the only driver control for the turnaround)
router.post('/layover/end', verifyJWT, verifyRole(['driver']), endLayover);

// Live trip mutations owned by the driver
router.patch('/:id/location', verifyJWT, verifyRole(['driver']), updateTripLocation);
router.get('/:id/manifest', verifyJWT, verifyRole(['driver']), getTripManifest);

// Admin override when a driver is unreachable mid-trip
router.patch('/:id/force-end', verifyJWT, verifyRole(['admin']), forceEndTrip);

export default router;
