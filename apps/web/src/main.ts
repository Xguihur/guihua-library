import { createApp } from 'vue';
import App from './App.vue';
import { authApi } from './api/client';
import { AUTH_API_KEY } from './api/injection';
import { createAppRouter } from './router';
import { SESSION_STORE_KEY, sessionStore } from './auth/session';
import './styles.css';

createApp(App)
  .use(createAppRouter())
  .provide(AUTH_API_KEY, authApi)
  .provide(SESSION_STORE_KEY, sessionStore)
  .mount('#app');
