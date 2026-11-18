<template>
  <span class="brand" :class="{ inverse }">
    <svg :width="size" :height="size" viewBox="0 0 32 32" aria-hidden="true">
      <rect class="mark-bg" width="32" height="32" rx="9" />
      <path class="mark-fg" d="M7 24V9l9 9 9-9v15" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="16" cy="18" r="2.6" fill="#F2B01E" />
    </svg>
    <span v-if="wordmark" class="word">motatrack</span>
  </span>
</template>

<script setup>
defineProps({
  size: { type: Number, default: 32 },
  wordmark: { type: Boolean, default: true },
  inverse: { type: Boolean, default: false } // for use on the green/dark header band
});
</script>

<style scoped>
.brand { display: inline-flex; align-items: center; gap: 10px; color: inherit; }
.mark-bg { fill: var(--brand); }
.mark-fg { stroke: var(--on-brand); }
.inverse .mark-bg { fill: var(--on-brand); }
.inverse .mark-fg { stroke: var(--brand); }
.word { font: 700 1.25em/1 var(--font-display); letter-spacing: -.03em; }
</style>
