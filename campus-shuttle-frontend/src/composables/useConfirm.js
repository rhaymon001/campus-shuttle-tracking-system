// In-app replacement for window.confirm(): `const ok = await ask({ title, message, confirmLabel, danger })`.
import { reactive } from 'vue';

const defaults = { title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', danger: false };
const state = reactive({ open: false, ...defaults });
let resolver = null;

const answer = (value) => {
  state.open = false;
  if (resolver) { resolver(value); resolver = null; }
};

const ask = (options = {}) =>
  new Promise((resolve) => {
    if (resolver) resolver(false); // a newer question replaces an unanswered one
    resolver = resolve;
    Object.assign(state, defaults, options, { open: true });
  });

export const useConfirm = () => ({ state, ask, answer });
