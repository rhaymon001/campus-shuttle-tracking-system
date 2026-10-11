// config/vapid.js — Web Push (VAPID) configuration driven by environment.
//
// Both keys come from env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY). The public key
// is also exposed to the frontend at build time (VITE_VAPID_PUBLIC_KEY) so the
// browser can subscribe. Everything is no-op safe: with keys missing the push
// service degrades to feed-only and nothing explodes.
import dotenv from 'dotenv';
import webpush from 'web-push';

dotenv.config();

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:dev@abu-shuttle.local';

export const vapidConfigured = Boolean(publicKey && privateKey);

if (vapidConfigured) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export const getVapidPublicKey = () => publicKey || null;
export const pushClient = webpush;