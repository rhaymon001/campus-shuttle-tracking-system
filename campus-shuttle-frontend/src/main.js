import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router' // <-- Import your new router instance

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router) // <-- Mount Vue Router
app.mount('#app')