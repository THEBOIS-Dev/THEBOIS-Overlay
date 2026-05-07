import { createRouter, createWebHashHistory } from 'vue-router';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'Home', component: () => import('@renderer/views/Home.vue') },
    {
      path: '/setup',
      name: 'Setup',
      component: () => import('@renderer/views/Setup.vue'),
    },
    {
      path: '/nicks',
      name: 'Nicks',
      component: () => import('@renderer/views/Nicks.vue'),
    },
    {
      path: '/settings',
      name: 'Settings',
      component: () => import('@renderer/views/Settings.vue'),
    },
    {
      path: '/theme',
      name: 'Theme',
      component: () => import('@renderer/views/Theme.vue'),
    },
  ],
});

export default router;
