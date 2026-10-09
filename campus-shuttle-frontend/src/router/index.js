import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import RegisterView from '../views/RegisterView.vue';
import LoginView from '../views/LoginView.vue';
import DashboardView from '../views/DashboardView.vue';
import RoutesView from '../views/RoutesView.vue';
import SchedulesView from '../views/SchedulesView.vue';
import LiveTrackingView from '../views/LiveTrackingView.vue';
import DriverView from '../views/DriverView.vue';
import AdminView from '../views/admin/AdminView.vue';
import AdminTripsView from '../views/admin/AdminTripsView.vue';
import AdminShuttlesView from '../views/admin/AdminShuttlesView.vue';
import AdminRoutesView from '../views/admin/AdminRoutesView.vue';
import AdminDriversView from '../views/admin/AdminDriversView.vue';

// Landing pad per role — used by the guard and the login redirect
export const ROLE_HOME = {
  student: '/dashboard',
  driver: '/driver',
  admin: '/admin'
};

const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/register',
    name: 'Register',
    component: RegisterView,
    meta: { guestOnly: true }
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { guestOnly: true }
  },
  {
    path: '/dashboard',
    component: DashboardView,
    meta: { requiresAuth: true, roles: ['student'] },
    children: [
      {
        path: '', // Empty path means this renders by default at /dashboard
        name: 'LiveTracking',
        component: LiveTrackingView
      },
      {
        path: 'routes', // Accessible at /dashboard/routes
        name: 'ShuttleRoutes',
        component: RoutesView
      },
      {
        path: 'schedules', // Accessible at /dashboard/schedules
        name: 'Schedules',
        component: SchedulesView
      }
    ]
  },
  {
    path: '/driver',
    name: 'DriverTerminal',
    component: DriverView,
    meta: { requiresAuth: true, roles: ['driver'] }
  },
  {
    path: '/admin',
    component: AdminView,
    meta: { requiresAuth: true, roles: ['admin'] },
    children: [
      {
        path: '', // Default admin landing — live trip monitor
        name: 'AdminTrips',
        component: AdminTripsView
      },
      {
        path: 'shuttles',
        name: 'AdminShuttles',
        component: AdminShuttlesView
      },
      {
        path: 'routes',
        name: 'AdminRoutes',
        component: AdminRoutesView
      },
      {
        path: 'drivers',
        name: 'AdminDrivers',
        component: AdminDriversView
      }
    ]
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

// Navigation Guard Interceptor
router.beforeEach((to, from, next) => {
  // FIX: Instantiating the store hook HERE ensures Pinia is fully loaded
  // and attached to the root Vue app instance before any data checks occur.
  const authStore = useAuthStore();

  // Rule 1: Enforce security barriers on authenticated routes
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next('/login');
  }

  // Rule 2: Deter authenticated sessions from returning to guest auth panels
  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return next(ROLE_HOME[authStore.userRole] || '/dashboard');
  }

  // Rule 3: Bounce cross-role access back to the user's own home area
  if (to.meta.roles && !to.meta.roles.includes(authStore.userRole)) {
    return next(ROLE_HOME[authStore.userRole] || '/login');
  }

  // Fallthrough route confirmation
  next();
});

export default router;
