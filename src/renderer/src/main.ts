import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import App from './App.vue'
import router from './router'
import './assets/global.css'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

if (import.meta.env.DEV) {
  (window as any).__pinia = pinia
}

createApp(App).use(pinia).use(router).mount('#app')
