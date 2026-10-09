// src/api/socket.js — singleton Socket.IO client for the /shuttle namespace
import { io } from 'socket.io-client';

// Socket URL follows the REST backend origin (port must match — no /api/v1 here)
const REST_BASE = import.meta.env.VITE_BACKEND_BASE_URL || 'http://localhost:3500/api/v1';
const SOCKET_BASE_URL = import.meta.env.VITE_SOCKET_BASE_URL || REST_BASE.replace(/\/api\/v1\/?$/, '');

let socket = null;

// Idempotent connect: reuses the live instance if the token hasn't changed
export const connectSocket = (token) => {
  if (socket && socket.auth?.token === token) return socket;

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(`${SOCKET_BASE_URL}/shuttle`, {
    auth: { token },
    autoConnect: true
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
