<template>
  <div class="toast-host" :class="{ 'below-header': belowHeader }" aria-live="assertive">
    <TransitionGroup name="toast" tag="div" class="toast-stack">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type" :role="t.type === 'error' ? 'alert' : 'status'">
        <component :is="icons[t.type]" :size="18" class="toast-ico" />
        <span class="toast-msg">{{ t.message }}</span>
        <button class="toast-x" aria-label="Dismiss" @click="dismiss(t.id)"><X :size="16" /></button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-vue-next';
import { useToast } from '../composables/useToast';

defineProps({ belowHeader: { type: Boolean, default: true } });
const { toasts, dismiss } = useToast();
const icons = { error: AlertTriangle, success: CheckCircle2, info: Info };
</script>

<style scoped>
.toast-host { position: fixed; left: 0; right: 0; top: calc(var(--safe-t) + 12px); z-index: 700; display: flex; justify-content: center; padding: 0 12px; pointer-events: none; }
.toast-host.below-header { top: calc(var(--header-h) + var(--safe-t) + 12px); }
.toast-stack { width: 100%; max-width: 560px; display: flex; flex-direction: column; gap: 8px; }
.toast { pointer-events: auto; display: flex; align-items: flex-start; gap: 10px; padding: 13px 14px; border-radius: 12px; background: var(--bg); color: var(--ink); border: 1px solid var(--line); box-shadow: var(--shadow-2); font-size: 14px; line-height: 1.4; }
.toast.error { box-shadow: inset 4px 0 0 var(--live), var(--shadow-2); }
.toast.success { box-shadow: inset 4px 0 0 var(--brand), var(--shadow-2); }
.toast.info { box-shadow: inset 4px 0 0 var(--info), var(--shadow-2); }
.toast-ico { flex: none; margin-top: 1px; }
.error .toast-ico { color: var(--live); }
.success .toast-ico { color: var(--brand); }
.info .toast-ico { color: var(--info); }
.toast-msg { flex: 1; min-width: 0; }
.toast-x { flex: none; border: 0; background: none; color: var(--muted); padding: 2px; display: grid; border-radius: 6px; }
.toast-x:hover { color: var(--ink); background: var(--surface-2); }
.toast-enter-active { transition: opacity .3s ease, transform .4s var(--ease); }
.toast-leave-active { transition: opacity .25s ease, transform .25s ease; position: absolute; left: 0; right: 0; }
.toast-enter-from { opacity: 0; transform: translateY(-18px) scale(.98); }
.toast-leave-to { opacity: 0; transform: translateY(-8px); }
.toast-move { transition: transform .3s var(--ease); }
</style>
