// socket/index.js — Socket.IO bootstrap and shared accessor
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import allowedOrigins from '../config/allowedOrigins.js';
import User from '../models/User.js';
import registerShuttleHandlers from './shuttleHandlers.js';

let io = null;

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    // socket.io takes the raw origins array (unlike the express cors callback object)
    cors: { origin: allowedOrigins, credentials: true }
  });

  const shuttleNsp = io.of('/shuttle');

  // JWT handshake guard — mirrors verifyJWT but reads from socket auth payload.
  // Like the REST middleware, the named user is re-validated so a token for a
  // since-deleted account cannot authenticate (prevents ghost-driver telemetry).
  shuttleNsp.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token provided'));

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) return next(new Error('Invalid or expired token'));
      try {
        const user = await User.findById(decoded.id).select('_id role name').lean();
        if (!user) return next(new Error('Account no longer exists'));
        socket.data.user = { id: String(user._id), role: user.role, name: user.name };
        next();
      } catch (dbErr) {
        next(new Error('Could not validate account'));
      }
    });
  });

  shuttleNsp.on('connection', (socket) => {
    registerShuttleHandlers(shuttleNsp, socket).catch((err) => {
      console.error('registerShuttleHandlers failed:', err.message);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error('Socket.io has not been initialized');
  return io;
};

export const getShuttleNsp = () => getIO().of('/shuttle');
