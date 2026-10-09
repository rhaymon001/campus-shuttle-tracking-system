// routes/adminRoutes.js
import express from 'express';
import { onboardNewDriver, getAllDrivers } from '../controllers/adminController.js';
import verifyJWT from '../middleware/verifyJWT.js';
import verifyRole from '../middleware/verifyRoles.js';

const router = express.Router();

// Only system admins can create legal driver entities
router.post('/drivers', verifyJWT, verifyRole(['admin']), onboardNewDriver);
router.get('/drivers', verifyJWT, verifyRole(['admin']), getAllDrivers);

export default router;