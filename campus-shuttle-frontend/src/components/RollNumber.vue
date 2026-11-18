<template>
  <span class="roll tnum">
    <Transition name="roll" mode="out-in">
      <span :key="String(value)" class="roll-n">{{ value }}</span>
    </Transition>
  </span>
</template>

<script setup>
defineProps({ value: { type: [Number, String], default: 0 } });
</script>

<style scoped>
.roll { display: inline-flex; overflow: hidden; vertical-align: bottom; line-height: 1.15; }
.roll-n { display: inline-block; }
.roll-enter-active, .roll-leave-active { transition: transform .32s var(--ease), opacity .32s var(--ease); }
.roll-enter-from { transform: translateY(70%); opacity: 0; }
.roll-leave-to { transform: translateY(-70%); opacity: 0; }
</style>
