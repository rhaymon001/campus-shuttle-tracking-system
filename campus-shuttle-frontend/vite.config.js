import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Where your backend runs in development (its PORT in abu-shuttle-backend/.env)
const BACKEND = 'http://localhost:5000'

// The backend always allows this origin. The proxy presents it for every forwarded request, so you never have to
// add tunnel URLs or LAN IPs to ALLOWED_ORIGINS just to test in development.
const DEV_ORIGIN = 'http://localhost:3000'
const presentDevOrigin = (proxy) => {
  proxy.on('proxyReq', (req) => req.setHeader('origin', DEV_ORIGIN))
  proxy.on('proxyReqWs', (req) => req.setHeader('origin', DEV_ORIGIN))
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3000, // Forces the frontend development server to run on port 3000
    host: true, // also listen on your network address, so phones on the same Wi-Fi can reach it
    allowedHosts: ['.devtunnels.ms'], // VS Code / Visual Studio dev tunnels
    // The browser only ever talks to this server; it forwards API and websocket traffic to the backend.
    // That way only port 3000 needs to be reachable from a phone or tunnel.
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true, configure: presentDevOrigin },
      '/socket.io': { target: BACKEND, changeOrigin: true, ws: true, configure: presentDevOrigin }
    }
  }
})
