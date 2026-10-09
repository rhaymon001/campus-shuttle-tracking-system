// routes/shuttleRoutes.js
import express from 'express';
import { registerShuttle, getAllShuttles, updateShuttleStatus } from '../controllers/shuttleController.js';
import verifyJWT from '../middleware/verifyJWT.js';
import verifyRole from '../middleware/verifyRoles.js';

const router = express.Router();

router.post('/', verifyJWT, verifyRole(['admin']), registerShuttle);
router.get('/', verifyJWT, getAllShuttles);
router.patch('/:id/status', verifyJWT, verifyRole(['admin']), updateShuttleStatus);

export default router;
