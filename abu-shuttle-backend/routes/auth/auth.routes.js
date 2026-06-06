import express from 'express';
import { registerStudent, loginUser } from '../../controllers/authController.js';

const router = express.Router();

// These paths combine with the base path in server.js to form /api/v1/auth/register and /api/v1/auth/login 
router.post('/register', registerStudent);
router.post('/login', loginUser);

export default router;