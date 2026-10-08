<template>
  <div id="app">
    <header class="app-header">
      <span class="header-side"></span>
      <h1>ABU Shuttle Tracking System</h1>
      <span class="header-side header-bell-side">
        <NotificationBell class="header-bell" />
      </span>
    </header>

    <main >
      <router-view />
    </main>
  </div>
</template>

<script setup>
import NotificationBell from './components/NotificationBell.vue';
</script>

<style>
body {
  background-color: #F4F3EF;
  margin: 0;
  padding: 0;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  color: #1A1A18;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden; /* Prevents any rogue horizontal scrollbars */
}

/* Base style applied ONLY when on Login or Register screens */
.auth-layout {
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
  justify-content: space-between;
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.1);
  padding: 0 16px;
}

.app-header h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 500;
  flex: 1;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Symmetric side rails keep the title dead-centered while reserving room for the bell */
.header-side {
  flex: 0 0 36px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
}

.main-content {
  flex: 1;
  padding: 24px 16px;
  box-sizing: border-box;
}

/* Dashboard Override: Strip everything down when the dashboard is active */
main {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
</style>