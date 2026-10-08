// routes/index.js
import express from 'express';
import authRoutes from './auth/auth.routes.js';
import transitRoutes from './transitRoutes.js';
import tripRoutes from './tripRoutes.js';
import reservationRoutes from './reservationRoutes.js';
import shuttleRoutes from './shuttleRoutes.js';
import adminRoutes from './adminRoutes.js';
import notificationRoutes from './notificationRoutes.js';

const apiRouter = express.Router();

// Mount all feature routes neatly
apiRouter.use('/auth', authRoutes);               // results in /api/v1/auth
apiRouter.use('/admin', adminRoutes);             // results in /api/v1/admin
apiRouter.use('/transit', transitRoutes);         // results in /api/v1/transit
apiRouter.use('/trips', tripRoutes);              // results in /api/v1/trips
apiRouter.use('/reservations', reservationRoutes); // results in /api/v1/reservations
apiRouter.use('/shuttles', shuttleRoutes);         // results in /api/v1/shuttles
apiRouter.use('/notifications', notificationRoutes); // results in /api/v1/notifications

export default apiRouter;