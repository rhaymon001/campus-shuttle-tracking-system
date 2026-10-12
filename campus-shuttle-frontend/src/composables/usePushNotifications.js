// src/composables/usePushNotifications.js — subscribe the browser to Web Push
// and persist the subscription on the backend so OS-level toasts land even when
// no tab is open. Public VAPID key comes from VITE_VAPID_PUBLIC_KEY (build env).
import apiClient from '../api/axios';

const urlBase64ToUint8Array = (base64) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

const isSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  window.isSecureContext;

// Best-effort: enables push when possible, otherwise resolves false without noise.
export const enableWebPush = async () => {
  if (!isSupported()) return { ok: false, reason: 'unsupported' };

  let permission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return { ok: false, reason: 'permission-error' };
  }
  if (permission !== 'granted') return { ok: false, reason: permission };

  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey) return { ok: false, reason: 'no-vapid-key' };

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    }));

  await apiClient.post('/notifications/push/subscribe', {
    endpoint: subscription.endpoint,
    keys: subscription.toJSON().keys
  });
  return { ok: true, endpoint: subscription.endpoint };
};

export const disableWebPush = async () => {
  if (!isSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  try {
    await apiClient.delete('/notifications/push/subscribe', { data: { endpoint: subscription.endpoint } });
  } finally {
    await subscription.unsubscribe();
  }
};