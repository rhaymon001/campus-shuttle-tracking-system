import express from 'express';
import { registerStudent, loginUser, changePassword } from '../../controllers/authController.js';
import verifyJWT from '../../middleware/verifyJWT.js';

const router = express.Router();

// These paths combine with the base path in server.js to form /api/v1/auth/register and /api/v1/auth/login 
router.post('/register', registerStudent);
router.post('/login', loginUser);
router.put('/change-password', verifyJWT, changePassword);

export default router;