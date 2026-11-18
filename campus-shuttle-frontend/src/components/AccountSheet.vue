<template>
  <Transition name="drawer">
    <div v-if="open" class="scrim" @click.self="$emit('close')">
      <section class="sheet" role="dialog" aria-modal="true" aria-label="Account">
        <header class="sheet-head">
          <span class="avatar">{{ initials }}</span>
          <div class="sheet-who">
            <h2>{{ name || 'Account' }}</h2>
            <p class="eyebrow">{{ role }}</p>
          </div>
          <button class="icon-btn" aria-label="Close" @click="$emit('close')"><X :size="18" /></button>
        </header>

        <form class="pw-form" @submit.prevent="$emit('submit')">
          <h3><KeyRound :size="16" /> Change password</h3>
          <div v-if="feedback" class="feedback" :class="feedback.type" role="status">{{ feedback.message }}</div>
          <div class="field">
            <label for="acct-current">Current password</label>
            <PasswordInput id="acct-current" v-model="form.currentPassword" autocomplete="current-password" />
          </div>
          <div class="field">
            <label for="acct-new">New password</label>
            <PasswordInput id="acct-new" v-model="form.newPassword" autocomplete="new-password" placeholder="At least 6 characters" />
            <PasswordFeedback :password="form.newPassword" :current="form.currentPassword" />
          </div>
          <div class="field">
            <label for="acct-confirm">Confirm new password</label>
            <PasswordInput id="acct-confirm" v-model="form.confirmPassword" autocomplete="new-password" :has-error="!!form.confirmPassword && !form.newPassword.startsWith(form.confirmPassword)" />
            <PasswordFeedback mode="match" :password="form.newPassword" :confirm="form.confirmPassword" />
          </div>
          <button class="btn" type="submit" :disabled="changing || !canSubmit">{{ changing ? 'Updating…' : 'Update password' }}</button>
        </form>

        <button class="btn btn-danger" @click="$emit('logout')"><LogOut :size="16" /> Sign out</button>
      </section>
    </div>
  </Transition>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { X, KeyRound, LogOut } from 'lucide-vue-next';
import PasswordInput from './PasswordInput.vue';
import PasswordFeedback from './PasswordFeedback.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  name: { type: String, default: '' },
  role: { type: String, default: '' },
  form: { type: Object, required: true }, // { currentPassword, newPassword, confirmPassword }
  feedback: { type: Object, default: null }, // { type: 'success' | 'error', message }
  changing: { type: Boolean, default: false },
  canSubmit: { type: Boolean, default: false }
});
const emit = defineEmits(['close', 'submit', 'logout']);

const initials = computed(() => (props.name || 'U').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(''));
const onKey = (e) => { if (e.key === 'Escape' && props.open) emit('close'); };
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 500; background: rgb(8 16 11 / .5); display: flex; align-items: flex-end; justify-content: center; }
.sheet { width: 100%; max-height: 90dvh; overflow-y: auto; background: var(--bg); border-radius: 22px 22px 0 0; padding: 20px 20px calc(24px + var(--safe-b)); display: flex; flex-direction: column; gap: 22px; box-shadow: var(--shadow-2); }
.sheet-head { display: flex; align-items: center; gap: 14px; }
.sheet-who { flex: 1; min-width: 0; }
.sheet-who h2 { font-size: 22px; }
.avatar { flex: none; width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: var(--brand); color: var(--on-brand); font: 700 17px var(--font-display); }
.icon-btn { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 10px; border: 0; background: var(--surface); transition: background var(--t-fast); }
.icon-btn:hover { background: var(--surface-2); }
.pw-form { display: flex; flex-direction: column; gap: 12px; }
.pw-form h3 { display: flex; align-items: center; gap: 8px; font-size: 16px; }
.feedback { padding: 10px 12px; border-radius: 10px; font-size: 13px; }
.feedback.error { background: var(--danger-bg); color: var(--live); }
.feedback.success { background: var(--ok-bg); color: var(--brand); }
.drawer-enter-active, .drawer-leave-active { transition: opacity .22s ease; }
.drawer-enter-active .sheet, .drawer-leave-active .sheet { transition: transform .32s var(--ease); }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .sheet, .drawer-leave-to .sheet { transform: translateY(40px); }
@media (min-width: 900px) {
  .scrim { align-items: stretch; justify-content: flex-end; }
  .sheet { width: 400px; max-height: none; border-radius: 0; padding: 28px 24px; }
  .drawer-enter-from .sheet, .drawer-leave-to .sheet { transform: translateX(40px); }
}
</style>
