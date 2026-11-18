<template>
  <Transition name="confirm">
    <div v-if="state.open" class="scrim" @click.self="answer(false)">
      <div class="dialog" role="alertdialog" aria-modal="true" :aria-label="state.title" @keydown.esc="answer(false)">
        <h2>{{ state.title }}</h2>
        <p v-if="state.message">{{ state.message }}</p>
        <div class="actions">
          <button ref="cancelBtn" class="btn btn-ghost" @click="answer(false)">{{ state.cancelLabel }}</button>
          <button class="btn" :class="{ 'btn-danger-solid': state.danger }" @click="answer(true)">{{ state.confirmLabel }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useConfirm } from '../composables/useConfirm';

const { state, answer } = useConfirm();
const cancelBtn = ref(null);
// Focus the safe choice first; Escape cancels
watch(() => state.open, (open) => { if (open) nextTick(() => cancelBtn.value?.focus()); });
const onKey = (e) => { if (e.key === 'Escape' && state.open) answer(false); };
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 800; background: rgb(8 16 11 / .55); display: flex; align-items: center; justify-content: center; padding: 16px; }
.dialog { width: 100%; max-width: 420px; background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-lg); padding: 24px; box-shadow: var(--shadow-2); display: flex; flex-direction: column; gap: 10px; }
.dialog h2 { font-size: 24px; letter-spacing: -.03em; }
.dialog p { color: var(--muted); }
.actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }
.btn-danger-solid { background: var(--live); color: #fff; }
.confirm-enter-active, .confirm-leave-active { transition: opacity .18s ease; }
.confirm-enter-active .dialog, .confirm-leave-active .dialog { transition: transform .26s var(--ease); }
.confirm-enter-from, .confirm-leave-to { opacity: 0; }
.confirm-enter-from .dialog, .confirm-leave-to .dialog { transform: translateY(14px) scale(.97); }
</style>
