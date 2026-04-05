import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import App from './App.vue'
import router from './router'
import './assets/global.css'

declare global {
  interface Window {
    __pinia: ReturnType<typeof createPinia>
  }
}

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

window.__pinia = pinia

createApp(App).use(pinia).use(router).mount('#app')
