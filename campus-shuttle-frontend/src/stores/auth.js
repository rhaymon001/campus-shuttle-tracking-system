import { defineStore } from 'pinia';
import apiClient from '../api/axios';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    // Initialize state directly from localStorage to survive browser reloads
    user: JSON.parse(localStorage.getItem('shuttle_user')) || null,
    token: localStorage.getItem('shuttle_token') || null,
    loading: false,
    error: null
  }),

  getters: {
    isAuthenticated: (state) => !!state.token,
    userRole: (state) => state.user?.role || null
  },

  actions: {
    // Action to handle student registration
    async registerStudent(userData) {
      this.loading = true;
      this.error = null;
      try {
        const response = await apiClient.post('/auth/register', userData);
        this.loading = false;
        return response.data; // Return raw data to component for handling success popups
      } catch (err) {
        this.loading = false;
        this.error = err.response?.data?.message || 'Registration failed';
        throw this.error;
      }
    },

    // Action to handle multi-role system logins
    async loginUser(credentials) {
      this.loading = true;
      this.error = null;
      try {
        const response = await apiClient.post('/auth/login', credentials);
        
        // Destructure response payload from backend
        const { token, user } = response.data;

        // Save to Pinia Store reactive state
        this.token = token;
        this.user = user;

        // Persist securely to localStorage
        localStorage.setItem('shuttle_token', token);
        localStorage.setItem('shuttle_user', JSON.stringify(user));

        this.loading = false;
        return user;
      } catch (err) {
        this.loading = false;
        this.error = err.response?.data?.message || 'Login failed';
        throw this.error;
      }
    },

    // Action to safely wipe credentials on system logout
    logout() {
      this.token = null;
      this.user = null;
      localStorage.removeItem('shuttle_token');
      localStorage.removeItem('shuttle_user');
    }
  }
});