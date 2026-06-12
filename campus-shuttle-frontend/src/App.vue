<template>
  <div id="app">
    <header v-if="$route.name !== 'Dashboard'" class="app-header">
      <h1>ABU Shuttle Tracking System</h1>
    </header>

    <main :class="{ 'main-content': $route.name !== 'Dashboard' }">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { useAuthStore } from './stores/auth';
const auth = useAuthStore();
</script>

<style>
body {
  background-color: #F4F3EF;
  margin: 0;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  color: #1A1A18;
  -webkit-font-smoothing: antialiased;
}

#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  background-color: #0D2137;
  color: #FFFFFF;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.1);
}

.app-header h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 500;
}

/* Base application styling window */
.main-content {
  flex: 1;
  padding: 24px 16px;
  box-sizing: border-box;
}
</style>