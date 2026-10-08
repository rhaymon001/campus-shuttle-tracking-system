<template>
  <div class="dashboard-wrapper">
    <header class="mobile-header">
      <div class="brand">
        <Bus :size="20" class="brand-teal" />
        <span class="brand-text">ABU SHUTTLE</span>
      </div>
      <button @click="isMobileMenuOpen = !isMobileMenuOpen" class="menu-toggle-btn" aria-label="Toggle Menu">
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
        <a href="#" class="nav-item active" @click="closeMobileMenu">
          <LayoutDashboard :size="16" />
          <span>Live Tracking</span>
        </a>
        <a href="#" class="nav-item" @click="closeMobileMenu">
          <Route :size="16" />
          <span>Shuttle Routes</span>
        </a>
        <a href="#" class="nav-item" @click="closeMobileMenu">
          <Calendar :size="16" />
          <span>Schedules</span>
        </a>

        <div class="section-label" style="margin-top: 24px;">Account</div>
        <button @click="handleLogout" class="nav-item logout-btn">
          <LogOut :size="16" />
          <span>Sign Out</span>
        </button>
      </nav>

      <div class="user-profile-badge">
        <div class="avatar">
          <User :size="14" />
        </div>
        <div class="user-meta">
          <p class="user-name">{{ authStore.user?.name || 'Student Portal' }}</p>
          <p class="user-role-text">{{ authStore.user?.role || 'student' }}</p>
        </div>
      </div>
    </aside>

    <div v-if="isMobileMenuOpen" @click="isMobileMenuOpen = false" class="sidebar-overlay"></div>

    <main class="dashboard-content">
      
      <section class="metrics-row">
        <div class="stat-card">
          <span class="stat-label">ACTIVE SHUTTLES</span>
          <p class="stat-value">14</p>
        </div>
        <div class="stat-card">
          <span class="stat-label">OPERATIONAL ROUTES</span>
          <p class="stat-value">4</p>
        </div>
        <div class="stat-card">
          <span class="stat-label">AVG WAITING TIME</span>
          <p class="stat-value">8m</p>
        </div>
        <div class="stat-card">
          <span class="stat-label">SYSTEM STATUS</span>
          <p class="stat-value status-good">NOMINAL</p>
        </div>
      </section>

      <div class="workspace-grid">
        
        <div class="map-viewport-panel">
          <div class="panel-header-label">LIVE CAMPUS GEOSPATIAL MAP</div>
          <div class="map-canvas">
            <div class="map-placeholder-graphics">
              <Compass :size="28" class="map-compass" />
              <h3>Zaria Campus Grid</h3>
              <p>Geospatial telemetry mapping real-time driver coordinates will mount inside this anchor card.</p>
              
              <div class="map-legend">
                <span class="legend-item"><span class="dot dot-teal"></span> Moving</span>
                <span class="legend-item"><span class="dot dot-amber"></span> Delayed</span>
                <span class="legend-item"><span class="dot dot-blue"></span> Terminal</span>
              </div>
            </div>
          </div>
        </div>

        <div class="shuttle-feed-panel">
          <div class="panel-header-label">ACTIVE VEHICLE STATUS FLOW</div>
          
          <div class="cards-stack">
            <div class="shuttle-card">
              <div class="shuttle-header">
                <div class="shuttle-identity">
                  <span class="shuttle-code">ABU-SHL-04</span>
                  <span class="badge badge-active">Active</span>
                </div>
                <span class="route-tag">Main Campus ⇄ Samaru</span>
              </div>
              <div class="shuttle-body">
                <div class="info-row">
                  <span class="muted"><User :size="12" class="inline-icon"/> Driver:</span>
                  <span>Malam Ibrahim</span>
                </div>
                <div class="info-row">
                  <span class="muted"><MapPin :size="12" class="inline-icon"/> Next Stop:</span>
                  <span>Assembly Quarters</span>
                </div>
                <div class="occupancy-section">
                  <div class="occupancy-labels">
                    <span class="muted">Occupancy Loading</span>
                    <span class="occupancy-pct">45%</span>
                  </div>
                  <div class="occupancy-bar-track">
                    <div class="occupancy-fill teal-fill" style="width: 45%;"></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="shuttle-card">
              <div class="shuttle-header">
                <div class="shuttle-identity">
                  <span class="shuttle-code">ABU-SHL-09</span>
                  <span class="badge badge-full">Full</span>
                </div>
                <span class="route-tag">Site II ⇄ Kongo Campus</span>
              </div>
              <div class="shuttle-body">
                <div class="info-row">
                  <span class="muted"><User :size="12" class="inline-icon"/> Driver:</span>
                  <span>Bello Yusuf</span>
                </div>
                <div class="info-row">
                  <span class="muted"><MapPin :size="12" class="inline-icon"/> Next Stop:</span>
                  <span>Faculty of Arts</span>
                </div>
                <div class="occupancy-section">
                  <div class="occupancy-labels">
                    <span class="muted">Occupancy Loading</span>
                    <span class="occupancy-pct warning-text">85%</span>
                  </div>
                  <div class="occupancy-bar-track">
                    <div class="occupancy-fill amber-fill" style="width: 85%;"></div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Bus, LayoutDashboard, Route, Calendar, LogOut, User, MapPin, Compass, Menu, X } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const router = useRouter();

const isMobileMenuOpen = ref(false);

const closeMobileMenu = () => {
  isMobileMenuOpen.value = false;
};

const handleLogout = () => {
  authStore.logout();
  router.push('/login');
};
</script>

<style scoped>
/* --- MOBILE-FIRST BASE STYLES (< 768px Viewports Default) --- */
.dashboard-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  width: 100vw;
  box-sizing: border-box;
}

/* Mobile App Bar Header: Height 56px, Deep Navy (#0D2137) */
.mobile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  background: #0D2137;
  color: #FFFFFF;
  padding: 0 16px;
  box-sizing: border-box;
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.1);
  position: sticky;
  top: 0;
  z-index: 100;
}

.brand { display: flex; align-items: center; gap: 8px; }
.brand-teal { color: #1D9E75; }
.brand-text { font-size: 15px; font-weight: 500; letter-spacing: 0.05em; }

.menu-toggle-btn {
  background: transparent;
  border: none;
  color: #FFFFFF;
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 4px;
}

/* Sidebar Box transformed into hidden off-canvas slider drawer */
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 240px;
  background: #0D2137;
  color: #FFFFFF;
  display: flex;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
  border-right: 0.5px solid rgba(255, 255, 255, 0.1);
  transform: translateX(-100%);
  transition: transform 0.2s ease-in-out;
  z-index: 200;
}

.sidebar-open { transform: translateX(0); }
.sidebar-brand-desktop { display: none; }

.sidebar-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 150;
}

.nav-menu { display: flex; flex-direction: column; gap: 4px; flex: 1; }

.section-label {
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 500;
  color: #5F5E5A;
  padding: 4px 8px;
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.05);
  margin-bottom: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 36px;
  padding: 0 14px;
  color: #5F5E5A;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  width: 100%;
  box-sizing: border-box;
}

.nav-item.active { background: #E1F5EE; color: #0F6E56; }
.logout-btn { margin-top: auto; color: #E24B4A; }

.user-profile-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 16px;
  border-top: 0.5px solid rgba(255, 255, 255, 0.1);
  margin-top: 16px;
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1D9E75;
}

.user-meta { line-height: 1.2; }
.user-name { font-size: 13px; font-weight: 500; margin: 0; color: #FFFFFF; }
.user-role-text { font-size: 11px; text-transform: uppercase; color: #5F5E5A; margin: 2px 0 0 0; }

/* Main Content Workspace Layout Panel (#F4F3EF) */
.dashboard-content {
  flex: 1;
  background: #F4F3EF;
  padding: 16px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

/* Metrics Row: Stacks vertically or wraps on tight views */
.metrics-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr); /* 2x2 grid setup on mobile phones */
  gap: 8px;
}

.stat-card {
  background: #FFFFFF;
  border: 0.5px solid rgba(0, 0, 0, 0.10);
  border-radius: 12px;
  padding: 12px;
}

.stat-label { font-size: 11px; font-weight: 500; text-transform: uppercase; color: #5F5E5A; }
.stat-value { font-size: 18px; font-weight: 500; color: #1A1A18; margin: 2px 0 0 0; }
.status-good { color: #3B6D11; }

/* Workspace Grid: Mobile-First stacks everything vertically */
.workspace-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-header-label {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  color: #5F5E5A;
  padding-bottom: 6px;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.1);
  margin-bottom: 12px;
}

.cards-stack { display: flex; flex-direction: column; gap: 12px; }

.shuttle-card {
  background: #FFFFFF;
  border: 0.5px solid rgba(0, 0, 0, 0.10);
  border-radius: 12px;
  padding: 16px;
}

.shuttle-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.shuttle-code { font-family: monospace; font-weight: 600; font-size: 14px; letter-spacing: 0.15em; color: #1D9E75; }
.badge { font-size: 11px; font-weight: 500; padding: 2px 10px; border-radius: 999px; text-transform: capitalize; width: max-content; }
.badge-active { background: #E1F5EE; color: #0F6E56; }
.badge-full { background: #FCEBEB; color: #E24B4A; }
.route-tag { font-size: 12px; color: #5F5E5A; margin-top: 2px; }

.shuttle-body { display: flex; flex-direction: column; gap: 6px; }
.info-row { display: flex; justify-content: space-between; font-size: 13px; }
.muted { color: #5F5E5A; }
.inline-icon { display: inline; margin-right: 4px; vertical-align: middle; }
.warning-text { color: #BA7517; font-weight: 500; }

.occupancy-section { margin-top: 10px; }
.occupancy-labels { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; }
.occupancy-bar-track { height: 5px; background: #F4F3EF; border-radius: 999px; overflow: hidden; }
.occupancy-fill { height: 100%; border-radius: 999px; }
.teal-fill { background: #1D9E75; }
.amber-fill { background: #BA7517; }

/* Mobile Map Viewport Window: Compacted to 300px for neat scrolling */
.map-canvas {
  background: #FFFFFF;
  border: 0.5px solid rgba(0, 0, 0, 0.10);
  border-radius: 12px;
  height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
}

.map-placeholder-graphics { text-align: center; }
.map-compass { color: #1D9E75; margin-bottom: 8px; }
.map-placeholder-graphics h3 { font-size: 15px; font-weight: 500; margin: 0 0 4px 0; }
.map-placeholder-graphics p { font-size: 13px; line-height: 1.5; color: #5F5E5A; margin: 0 0 16px 0; }
.map-legend { display: flex; justify-content: center; gap: 12px; }
.legend-item { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #5F5E5A; }
.dot { width: 6px; height: 6px; border-radius: 999px; display: inline-block; }
.dot-teal { background: #1D9E75; }
.dot-amber { background: #BA7517; }
.dot-blue { background: #378ADD; }


/* --- DESKTOP ADAPTATION MEDIA QUERIES (≥ 768px viewports) --- */
@media (min-width: 768px) {
  .dashboard-wrapper { flex-direction: row; }
  .mobile-header { display: none; } /* Vaporize mobile top header bar */
  
  /* Reset Sidebar back into a permanent left anchoring block */
  .sidebar {
    position: relative;
    transform: translateX(0);
    width: 240px;
  }
  .sidebar-brand-desktop {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 16px;
    border-bottom: 0.5px solid rgba(255, 255, 255, 0.15);
    margin-bottom: 24px;
  }
  
  .dashboard-content { padding: 24px; gap: 24px; }
  
  /* Expand stats cards to fully wide columns */
  .metrics-row { grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .stat-card { padding: 16px; }
  .stat-value { font-size: 22px; }

  /* Pivot Workspace back into side-by-side grid */
  .workspace-grid {
    display: grid;
    grid-template-columns: 400px 1fr;
    gap: 12px;
  }
  
  /* Rearrange order back to default desktop visibility placement layout */
  .shuttle-feed-panel { order: 1; }
  .map-viewport-panel { order: 2; }
  
  .shuttle-header { flex-direction: row; justify-content: space-between; align-items: flex-start; }
  .route-tag { text-align: right; margin-top: 0; }
  
  /* Expand map window area vertically on desktops */
  .map-canvas { height: 494px; }
}
</style>