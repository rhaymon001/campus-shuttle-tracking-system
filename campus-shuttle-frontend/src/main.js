import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router' // <-- Import your new router instance

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router) // <-- Mount Vue Router
app.mount('#app')

// Register the app-shell service worker in production builds only — the dev
// server must never serve from the cache or hot-reload breaks.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}