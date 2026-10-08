import express from 'express';
import { issueBoardingPass, confirmPassBoarding, cancelReservation, getReservationStatus } from '../controllers/reservationController.js';
import verifyJWT from '../middleware/verifyJWT.js';
import verifyRole from '../middleware/verifyRoles.js';

const router = express.Router();

// Students check into the virtual queue to get a code pass
router.post('/issue', verifyJWT, verifyRole(['student', 'admin']), issueBoardingPass);

// Students pull the server-side truth of their reservation (used on page reload)
router.get('/:reservationId', verifyJWT, verifyRole(['student', 'admin']), getReservationStatus);

// Drivers verify the manual receipt and validate the code pass to board the student
router.post('/confirm', verifyJWT, verifyRole(['driver']), confirmPassBoarding);

// Students cancel their own pending boarding pass
router.post('/cancel', verifyJWT, verifyRole(['student', 'admin']), cancelReservation);

export default router;