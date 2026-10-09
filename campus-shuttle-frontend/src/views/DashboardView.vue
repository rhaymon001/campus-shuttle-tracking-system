<template>
  <div class="dashboard-wrapper">
    <header class="mobile-header">
      <div class="brand">
        <Bus :size="20" class="brand-teal" />
        <span class="brand-text">ABU SHUTTLE</span>
      </div>
      <button @click="isMobileMenuOpen = !isMobileMenuOpen" class="menu-toggle-btn">
        <Menu v-if="!isMobileMenuOpen" :size="24" />
        <X v-else :size="24" />
      </button>
    </header>

    <aside class="sidebar" :class="{ 'sidebar-open': isMobileMenuOpen }">
      <div class="sidebar-brand-desktop">
        <Bus :size="20" class="brand-teal" />
        <span class="brand-text">ABU SHUTTLE</span>
      </div>

      <nav class="nav-menu">
        <div class="section-label">Main Portal</div>
        
        <router-link to="/dashboard" class="nav-item" exact-active-class="active" @click="closeMobileMenu">
          <LayoutDashboard :size="16" />
          <span>Live Tracking</span>
        </router-link>
        
        <router-link to="/dashboard/routes" class="nav-item" active-class="active" @click="closeMobileMenu">
          <Route :size="16" />
          <span>Shuttle Routes</span>
        </router-link>
        
        <router-link to="/dashboard/schedules" class="nav-item" active-class="active" @click="closeMobileMenu">
          <Calendar :size="16" />
          <span>Schedules</span>
        </router-link>

        <div class="section-label" style="margin-top: 24px;">Account</div>
        <button @click="handleLogout" class="nav-item logout-btn">
          <LogOut :size="16" />
          <span>Sign Out</span>
        </button>
      </nav>

      <div class="user-profile-badge">
        <div class="avatar"><User :size="14" /></div>
        <div class="user-meta">
          <p class="user-name">{{ authStore.user?.name || 'Student Portal' }}</p>
          <p class="user-role-text">{{ authStore.user?.role || 'student' }}</p>
        </div>
      </div>
    </aside>

    <div v-if="isMobileMenuOpen" @click="isMobileMenuOpen = false" class="sidebar-overlay"></div>

    <main class="dashboard-content">
      <section class="metrics-row">
        <div class="stat-card"><span class="stat-label">ACTIVE SHUTTLES</span><p class="stat-value">14</p></div>
        <div class="stat-card"><span class="stat-label">OPERATIONAL ROUTES</span><p class="stat-value">4</p></div>
        <div class="stat-card"><span class="stat-label">AVG WAITING TIME</span><p class="stat-value">8m</p></div>
        <div class="stat-card"><span class="stat-label">SYSTEM STATUS</span><p class="stat-value status-good">NOMINAL</p></div>
      </section>

      <router-view />
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Bus, LayoutDashboard, Route, Calendar, LogOut, User, Menu, X } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const router = useRouter();
const isMobileMenuOpen = ref(false);

const closeMobileMenu = () => { isMobileMenuOpen.value = false; };
const handleLogout = () => { authStore.logout(); router.push('/login'); };
</script>

<style scoped>
/* Keep all your original dashboard-wrapper, sidebar, mobile-header, and metric-row styling from DashboardView here */
.dashboard-wrapper { display: flex; flex-direction: column; min-height: 100vh; width: 100vw; box-sizing: border-box; }
.mobile-header { display: flex; align-items: center; justify-content: space-between; height: 56px; background: #0D2137; color: #FFFFFF; padding: 0 16px; box-sizing: border-box; border-bottom: 0.5px solid rgba(255, 255, 255, 0.1); position: sticky; top: 0; z-index: 100; }
.brand { display: flex; align-items: center; gap: 8px; }
.brand-teal { color: #1D9E75; }
.brand-text { font-size: 15px; font-weight: 500; letter-spacing: 0.05em; }
.menu-toggle-btn { background: transparent; border: none; color: #FFFFFF; cursor: pointer; display: flex; align-items: center; padding: 4px; }
.sidebar { position: fixed; top: 0; left: 0; bottom: 0; width: 240px; background: #0D2137; color: #FFFFFF; display: flex; flex-direction: column; padding: 16px; box-sizing: border-box; border-right: 0.5px solid rgba(255, 255, 255, 0.1); transform: translateX(-100%); transition: transform 0.2s ease-in-out; z-index: 200; }
.sidebar-open { transform: translateX(0); }
.sidebar-brand-desktop { display: none; }
.sidebar-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.4); z-index: 150; }
.nav-menu { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.section-label { font-size: 11px; text-transform: uppercase; font-weight: 500; color: #5F5E5A; padding: 4px 8px; border-bottom: 0.5px solid rgba(255, 255, 255, 0.05); margin-bottom: 4px; }
.nav-item { display: flex; align-items: center; gap: 12px; height: 36px; padding: 0 14px; color: #5F5E5A; text-decoration: none; font-size: 14px; font-weight: 500; border-radius: 8px; box-sizing: border-box; }
.nav-item.active { background: #E1F5EE; color: #0F6E56; }
.logout-btn { margin-top: auto; color: #E24B4A; background: transparent; border: none; text-align: left; width: 100%; cursor: pointer; }
.user-profile-badge { display: flex; align-items: center; gap: 10px; padding-top: 16px; border-top: 0.5px solid rgba(255, 255, 255, 0.1); margin-top: 16px; }
.avatar { width: 28px; height: 28px; border-radius: 999px; background: rgba(255, 255, 255, 0.1); display: flex; align-items: center; justify-content: center; color: #1D9E75; }
.user-meta { line-height: 1.2; }
.user-name { font-size: 13px; font-weight: 500; margin: 0; color: #FFFFFF; }
.user-role-text { font-size: 11px; text-transform: uppercase; color: #5F5E5A; margin: 2px 0 0 0; }
.dashboard-content { flex: 1; background: #F4F3EF; padding: 16px; box-sizing: border-box; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
.metrics-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.stat-card { background: #FFFFFF; border: 0.5px solid rgba(0, 0, 0, 0.10); border-radius: 12px; padding: 12px; }
.stat-label { font-size: 11px; font-weight: 500; text-transform: uppercase; color: #5F5E5A; }
.stat-value { font-size: 18px; font-weight: 500; color: #1A1A18; margin: 2px 0 0 0; }
.status-good { color: #3B6D11; }

@media (min-width: 768px) {
  .dashboard-wrapper { flex-direction: row; }
  .mobile-header { display: none; }
  .sidebar { position: relative; transform: translateX(0); width: 240px; }
  .sidebar-brand-desktop { display: flex; align-items: center; gap: 8px; padding-bottom: 16px; border-bottom: 0.5px solid rgba(255, 255, 255, 0.15); margin-bottom: 24px; }
  .dashboard-content { padding: 24px; gap: 24px; }
  .metrics-row { grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .stat-card { padding: 16px; }
  .stat-value { font-size: 22px; }
}
</style>