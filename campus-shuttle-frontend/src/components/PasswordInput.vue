<template>
  <div class="pw">
    <div class="pw-box">
      <Lock :size="16" class="pw-lock" />
      <input
        :id="id"
        class="input"
        :class="{ 'has-error': hasError }"
        :type="shown ? 'text' : 'password'"
        :value="modelValue"
        :autocomplete="autocomplete"
        :placeholder="placeholder"
        @input="$emit('update:modelValue', $event.target.value)"
        @keydown="checkCaps"
        @keyup="checkCaps"
        @blur="capsOn = false"
      />
      <button type="button" class="pw-eye" :aria-label="shown ? 'Hide password' : 'Show password'" :aria-pressed="shown" @click="shown = !shown">
        <component :is="shown ? EyeOff : Eye" :size="17" />
      </button>
    </div>
    <Transition name="hint">
      <p v-if="capsOn" class="caps"><ArrowBigUp :size="14" /> Caps Lock is on</p>
    </Transition>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { Lock, Eye, EyeOff, ArrowBigUp } from 'lucide-vue-next';

defineProps({
  modelValue: { type: String, default: '' },
  id: { type: String, default: undefined },
  autocomplete: { type: String, default: 'off' },
  placeholder: { type: String, default: '' },
  hasError: { type: Boolean, default: false }
});
defineEmits(['update:modelValue']);

const shown = ref(false);
const capsOn = ref(false);
const checkCaps = (e) => { if (e.getModifierState) capsOn.value = e.getModifierState('CapsLock'); };
</script>

<style scoped>
.pw-box { position: relative; display: flex; align-items: center; }
.pw-lock { position: absolute; left: 14px; color: var(--stale); pointer-events: none; transition: color var(--t-fast); }
.pw-box:focus-within .pw-lock { color: var(--brand); }
.input { padding-left: 42px; padding-right: 46px; }
.pw-eye { position: absolute; right: 6px; width: 34px; height: 34px; display: grid; place-items: center; border: 0; border-radius: 8px; background: none; color: var(--muted); transition: background var(--t-fast), color var(--t-fast); }
.pw-eye:hover { background: var(--surface-2); color: var(--ink); }
.caps { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 12px; color: var(--warn); font-weight: 600; }
.hint-enter-active, .hint-leave-active { transition: opacity .2s ease, transform .25s var(--ease); }
.hint-enter-from, .hint-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
