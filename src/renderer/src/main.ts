import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import { createApp } from 'vue';
import App from './App.vue';
import './assets/global.css';
import router from './router';

declare global {
  interface Window {
    __pinia: ReturnType<typeof createPinia>;
  }
}

const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

window.__pinia = pinia;

createApp(App).use(pinia).use(router).mount('#app');
