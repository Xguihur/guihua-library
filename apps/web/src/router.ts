import { createRouter, createWebHistory, type RouterHistory } from 'vue-router';
import BookListView from './views/BookListView.vue';
import BookDetailView from './views/BookDetailView.vue';
import LoginView from './views/LoginView.vue';
import RegisterView from './views/RegisterView.vue';
import ProfileView from './views/ProfileView.vue';
import SettingsView from './views/SettingsView.vue';
import OAuthResultView from './views/OAuthResultView.vue';
import VerifyEmailView from './views/VerifyEmailView.vue';

export function createAppRouter(history: RouterHistory = createWebHistory()): ReturnType<typeof createRouter> {
  return createRouter({
    history,
    routes: [
      { path: '/', redirect: { name: 'books' } },
      { path: '/books', name: 'books', component: BookListView },
      { path: '/books/:bookId', name: 'book-detail', component: BookDetailView },
      { path: '/login', name: 'login', component: LoginView },
      { path: '/register', name: 'register', component: RegisterView },
      { path: '/me', name: 'profile', component: ProfileView },
      { path: '/settings', name: 'settings', component: SettingsView },
      { path: '/oauth-result', name: 'oauth-result', component: OAuthResultView },
      { path: '/verify-email', name: 'verify-email', component: VerifyEmailView },
      { path: '/:pathMatch(.*)*', redirect: { name: 'books' } },
    ],
  });
}
