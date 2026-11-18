<template>
  <div class="auth">
    <aside class="panel" aria-hidden="false">
      <BrandMark :size="38" inverse class="panel-brand rise" style="--i:0" />
      <div class="pitch">
        <h1 class="rise" style="--i:1">Know where the<br />shuttle is<span class="dot">.</span></h1>
        <p class="rise" style="--i:2">Live positions, arrival times and a seat held for you while you wait.</p>
      </div>
      <svg ref="routeSvg" class="route" viewBox="0 0 580 220" role="img" aria-label="A shuttle moving along a campus route">
        <path id="auth-route" class="road" d="M40 150C120 40 220 40 300 110S460 190 540 70" />
        <path class="trail" d="M40 150C120 40 220 40 300 110S460 190 540 70" />
        <circle class="stop" cx="40" cy="150" r="9" />
        <circle class="stop" cx="300" cy="110" r="9" />
        <circle class="stop" cx="540" cy="70" r="9" />
        <circle class="ring" cx="300" cy="110" r="9" />
        <g class="bus">
          <rect x="-17" y="-10" width="34" height="20" rx="6" />
          <circle cx="-7" cy="10" r="3" /><circle cx="7" cy="10" r="3" />
          <animateMotion dur="11s" repeatCount="indefinite"><mpath href="#auth-route" /></animateMotion>
        </g>
      </svg>
    </aside>

    <section class="form-col">
      <div class="form-inner">
        <BrandMark :size="30" class="form-brand rise" style="--i:0" />
        <slot />
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import BrandMark from './BrandMark.vue';

const routeSvg = ref(null);
// Respect reduced motion: park the shuttle instead of looping it
onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    try { routeSvg.value?.pauseAnimations(); } catch { /* SMIL unsupported */ }
  }
});
</script>

<style scoped>
.auth { min-height: 100dvh; display: grid; grid-template-columns: 1fr; background: var(--bg); }
.panel {
  display: none; position: relative; overflow: hidden;
  background: var(--hero-bg, var(--header-bg)); color: var(--header-ink);
  padding: 40px 48px; flex-direction: column; justify-content: space-between;
}
.panel-brand { font-size: 22px; }
.pitch h1 { font-size: clamp(44px, 5.2vw, 76px); line-height: .98; letter-spacing: -.04em; font-weight: 700; }
.pitch .dot { color: var(--signal); }
.pitch p { margin-top: 20px; max-width: 34ch; font-size: 18px; opacity: .85; }
.route { width: 100%; height: auto; overflow: visible; margin-bottom: -8px; }
.road { stroke: color-mix(in srgb, var(--header-ink) 16%, transparent); stroke-width: 14; fill: none; stroke-linecap: round; }
.trail { stroke: var(--header-ink); stroke-width: 3; fill: none; stroke-dasharray: 2 9; stroke-linecap: round; opacity: .7; }
.stop { fill: var(--header-bg); stroke: var(--header-ink); stroke-width: 3; }
.ring { fill: none; stroke: var(--signal); stroke-width: 2; transform-box: fill-box; transform-origin: center; animation: ring 2.4s ease-out infinite; }
@keyframes ring { from { transform: scale(.6); opacity: .9; } to { transform: scale(2.4); opacity: 0; } }
.bus rect { fill: var(--signal); stroke: #0F1A13; stroke-width: 2.5; }
.bus circle { fill: #0F1A13; }

.form-col { display: flex; align-items: center; justify-content: center; padding: 32px 20px calc(32px + var(--safe-b)); }
.form-inner { width: 100%; max-width: 400px; }
.form-brand { display: inline-flex; font-size: 20px; margin-bottom: 36px; }

@media (min-width: 960px) {
  .auth { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); }
  .panel { display: flex; }
  .form-brand { display: none; }
}
</style>
