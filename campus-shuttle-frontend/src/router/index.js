import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import RegisterView from '../views/RegisterView.vue';
import LoginView from '../views/LoginView.vue';
import DashboardView from '../views/DashboardView.vue';

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
    name: 'Dashboard',
    component: DashboardView,
    meta: { requiresAuth: true }
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
    return next('/dashboard');
  }
  
  // Fallthrough route confirmation
  next();
});

export default router;