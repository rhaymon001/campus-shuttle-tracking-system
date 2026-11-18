<template>
  <div id="app">
    <header v-if="!isGuestRoute" class="app-header">
      <router-link to="/" class="home-link" aria-label="motatrack home">
        <BrandMark :size="30" inverse />
      </router-link>
      <NotificationBell class="header-bell" />
    </header>

    <ToastHost :below-header="!isGuestRoute" />
    <ConfirmHost />

    <main>
      <router-view v-slot="{ Component, route }">
        <Transition name="page" mode="out-in">
          <component :is="Component" :key="route.matched[0]?.path ?? route.path" />
        </Transition>
      </router-view>
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import NotificationBell from './components/NotificationBell.vue';
import BrandMark from './components/BrandMark.vue';
import ToastHost from './components/ToastHost.vue';
import ConfirmHost from './components/ConfirmHost.vue';

// Login and register carry their own brand panel, so the top bar is for signed-in screens only
const route = useRoute();
const isGuestRoute = computed(() => !!route.meta?.guestOnly);
</script>

<style>
.app-header {
  position: sticky; top: 0; z-index: 400;
  height: calc(var(--header-h) + var(--safe-t)); padding: var(--safe-t) 16px 0;
  display: flex; align-items: center; justify-content: space-between;
  background: var(--header-bg); color: var(--header-ink);
  border-bottom: 1px solid color-mix(in srgb, var(--header-ink) 12%, transparent);
}
.home-link { color: inherit; text-decoration: none; display: inline-flex; }
main { margin: 0; padding: 0; }
</style>
