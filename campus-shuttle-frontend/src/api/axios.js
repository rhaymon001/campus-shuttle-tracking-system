// src/api/api.js
import axios from 'axios'
import { useAuthStore } from '../stores/auth.js' // Pinia store

// Dev: use a same-origin path. Vite proxies /api to the backend (see vite.config.js), so this works from
// localhost, a phone, or a dev tunnel. A hard-coded http://localhost:5000 breaks on any other device.
const defaultLocalUrl = '/api/v1'
const defaultProductionUrl = 'https://campus-shuttle-tracking-system.onrender.com/api/v1'
let BASE_URL

if (import.meta.env.MODE === 'development') {
  BASE_URL = defaultLocalUrl
} else {
  BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || defaultProductionUrl
}

const apiClient = axios.create({
  baseURL: BASE_URL,
})

// Request Interceptor: Attach access token to every outgoing request if present
apiClient.interceptors.request.use(
  (config) => {
    try {
      const auth = useAuthStore() // Get the Pinia auth store at runtime
      
      // ⚡️ FIXED: Point directly to `auth.token` and fall back to a plain text string from localStorage
      const token = auth.token || localStorage.getItem('shuttle_token')

      if (token) {
        config.headers = config.headers || {}
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch (e) {
      // If Pinia isn't initialized yet on initial boot, continue gracefully without token
      console.warn('Could not attach token to request:', e)
    }
    return config
  },
  (error) => Promise.reject(error),
)

// Response Interceptor: If a 401 occurs (token expired), cleanly wipe session and redirect
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // If there's no response from the server (network down), bubble the error up
    if (!error.response) return Promise.reject(error)

    const status = error.response.status

    // Aligned with your verifyJWT middleware which sends 401 for expired or missing tokens
    // Bad credentials on login/register also return 401. That is not an expired session: let the form show the message.
    const isAuthAttempt = /\/auth\/(login|register)/.test(error.config?.url || '')
    if (status === 401 && !isAuthAttempt) {
      try {
        console.warn('Session or token has expired. Booting user to login.')
        
        // 1. Clear state out of Pinia and triggers clean localStorage removals internally
        const auth = useAuthStore()
        auth.logout()
      } catch (e) {
        console.warn('Failed to clear auth store:', e)
        
        // ⚡️ FALLBACK FIXED: In case Pinia is completely unreachable, manually clear the exact storage keys
        localStorage.removeItem('shuttle_token')
        localStorage.removeItem('shuttle_user')
      }

      // 2. Perform clean client-side redirect back to login view
      window.location.href = '/login'
    }

    return Promise.reject(error)
  },
)

export default apiClient;