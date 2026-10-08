// src/composables/useShuttleSocket.js — component-scoped socket access with auto-cleanup
import { ref, onUnmounted } from 'vue';
import { connectSocket } from '../api/socket';
import { useAuthStore } from '../stores/auth';

export function useShuttleSocket() {
  const authStore = useAuthStore();
  const socket = connectSocket(authStore.token);
  const connected = ref(socket.connected);

  // Track everything this component registers so unmount leaves no dangling listeners/rooms
  const registeredHandlers = [];
  const joinedRoutes = new Set();

  const onConnect = () => {
    connected.value = true;
    // Re-join rooms after a reconnect so live feeds survive network blips
    joinedRoutes.forEach((routeId) => socket.emit('route:subscribe', { routeId }));
  };
  const onDisconnect = () => { connected.value = false; };

  socket.on('connect', onConnect);
  socket.on('disconnect', onDisconnect);

  const on = (event, handler) => {
    socket.on(event, handler);
    registeredHandlers.push({ event, handler });
  };

  const joinRoute = (routeId) => {
    if (!routeId || joinedRoutes.has(routeId)) return;
    joinedRoutes.add(routeId);
    if (socket.connected) socket.emit('route:subscribe', { routeId });
  };

  const leaveRoute = (routeId) => {
    joinedRoutes.delete(routeId);
    if (socket.connected) socket.emit('route:unsubscribe', { routeId });
  };

  onUnmounted(() => {
    registeredHandlers.forEach(({ event, handler }) => socket.off(event, handler));
    socket.off('connect', onConnect);
    socket.off('disconnect', onDisconnect);
    joinedRoutes.forEach((routeId) => {
      if (socket.connected) socket.emit('route:unsubscribe', { routeId });
    });
    joinedRoutes.clear();
  });

  return { socket, connected, on, joinRoute, leaveRoute };
}
