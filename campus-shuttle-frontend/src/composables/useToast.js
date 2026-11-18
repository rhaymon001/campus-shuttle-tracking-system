// Page-level notices (errors, confirmations) shown at the top of the screen.
import { reactive } from 'vue';

const toasts = reactive([]);
let nextId = 0;

const dismiss = (id) => {
  const i = toasts.findIndex((t) => t.id === id);
  if (i > -1) { clearTimeout(toasts[i].timer); toasts.splice(i, 1); }
};

const push = (type, message, ms = 6500) => {
  if (!message) return null;
  const text = String(message);
  // Same message again: keep one toast and restart its timer instead of stacking duplicates
  const dupe = toasts.find((t) => t.type === type && t.message === text);
  if (dupe) { clearTimeout(dupe.timer); dupe.timer = setTimeout(() => dismiss(dupe.id), ms); return dupe.id; }
  const toast = { id: ++nextId, type, message: text, timer: null };
  toast.timer = setTimeout(() => dismiss(toast.id), ms);
  toasts.push(toast);
  return toast.id;
};

export const useToast = () => ({
  toasts,
  dismiss,
  error: (message, ms) => push('error', message, ms),
  success: (message, ms) => push('success', message, ms),
  info: (message, ms) => push('info', message, ms)
});
