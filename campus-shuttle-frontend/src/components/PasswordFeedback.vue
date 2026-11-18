<template>
  <div class="pf" aria-live="polite">
    <Transition name="pf" mode="out-in">
      <!-- Rules and strength for a new password -->
      <div v-if="mode === 'rules' && password" key="rules" class="pf-rules">
        <div class="meter" :data-level="level">
          <span v-for="n in 4" :key="n" class="seg" :class="{ on: n <= level }"></span>
          <span class="meter-label">{{ strengthLabel }}</span>
        </div>
        <ul class="checks">
          <li v-for="r in rules" :key="r.label" :class="{ ok: r.ok }">
            <span class="mark"><Check v-if="r.ok" :size="12" /><Minus v-else :size="12" /></span>{{ r.label }}
          </li>
        </ul>
        <p v-if="tip" class="tip">{{ tip }}</p>
      </div>

      <!-- Does the confirmation match? -->
      <p v-else-if="mode === 'match' && confirm" key="match" class="match" :class="matchState.kind">
        <component :is="matchState.icon" :size="14" />{{ matchState.text }}
      </p>
    </Transition>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Check, Minus, X, CheckCircle2 } from 'lucide-vue-next';

const props = defineProps({
  password: { type: String, default: '' },
  current: { type: String, default: undefined }, // pass to also require "different from current"
  confirm: { type: String, default: '' },
  mode: { type: String, default: 'rules' } // 'rules' | 'match'
});

const len = computed(() => props.password.length);
const hasCurrent = computed(() => props.current !== undefined && props.current !== '');

// Required rules mirror what the form and server already enforce
const rules = computed(() => {
  const list = [{ label: 'At least 6 characters', ok: len.value >= 6 }];
  if (hasCurrent.value) list.push({ label: 'Different from your current password', ok: props.password !== props.current });
  return list;
});

// Advice only: these never block submitting
const extras = computed(() => [
  { ok: /[a-z]/.test(props.password) && /[A-Z]/.test(props.password), tip: 'upper and lower case letters' },
  { ok: /\d/.test(props.password), tip: 'a number' },
  { ok: /[^A-Za-z0-9]/.test(props.password), tip: 'a symbol like ! or #' },
  { ok: len.value >= 10, tip: '10 or more characters' }
]);

const level = computed(() => {
  if (len.value < 6) return 0;
  return Math.min(4, 1 + extras.value.filter((e) => e.ok).length);
});
const strengthLabel = computed(() => {
  if (len.value < 6) return `${6 - len.value} more to go`;
  return ['', 'Weak', 'Fair', 'Good', 'Strong'][level.value];
});
const tip = computed(() => {
  if (len.value < 6 || level.value >= 4) return '';
  const missing = extras.value.filter((e) => !e.ok).slice(0, 2).map((e) => e.tip);
  return missing.length ? `Stronger with ${missing.join(' and ')}.` : '';
});

const matchState = computed(() => {
  if (props.confirm === props.password) return { kind: 'good', icon: CheckCircle2, text: 'Passwords match' };
  if (props.password.startsWith(props.confirm)) return { kind: 'pending', icon: Minus, text: 'Keep going, it matches so far' };
  return { kind: 'bad', icon: X, text: 'Doesn’t match the new password yet' };
});
</script>

<style scoped>
.pf { margin-top: 8px; }
.pf-rules { display: flex; flex-direction: column; gap: 8px; }
.meter { display: flex; align-items: center; gap: 4px; }
.seg { flex: 0 0 38px; height: 5px; border-radius: 99px; background: var(--surface-2); transition: background .3s var(--ease); }
.meter[data-level='1'] .seg.on { background: var(--live); }
.meter[data-level='2'] .seg.on, .meter[data-level='3'] .seg.on { background: var(--signal); }
.meter[data-level='4'] .seg.on { background: var(--brand); }
.meter-label { margin-left: 8px; font: 600 12px var(--font-body); color: var(--muted); }
.meter[data-level='1'] .meter-label { color: var(--live); }
.meter[data-level='4'] .meter-label { color: var(--brand); }
.checks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.checks li { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); transition: color .2s; }
.checks li.ok { color: var(--brand); }
.mark { width: 16px; height: 16px; border-radius: 50%; display: grid; place-items: center; background: var(--surface-2); color: var(--stale); transition: background .25s var(--ease), color .2s, transform .25s var(--ease); }
.ok .mark { background: var(--brand); color: var(--on-brand); transform: scale(1.1); }
.tip { font-size: 12px; color: var(--muted); }
.match { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; }
.match.good { color: var(--brand); }
.match.pending { color: var(--muted); font-weight: 500; }
.match.bad { color: var(--live); }
.pf-enter-active, .pf-leave-active { transition: opacity .18s ease, transform .22s var(--ease); }
.pf-enter-from, .pf-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
