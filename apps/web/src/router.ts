import { createRouter, createWebHistory, type RouterHistory } from 'vue-router';
import BookListView from './views/BookListView.vue';
import BookDetailView from './views/BookDetailView.vue';

export function createAppRouter(history: RouterHistory = createWebHistory()): ReturnType<typeof createRouter> {
  return createRouter({
    history,
    routes: [
      { path: '/', redirect: { name: 'books' } },
      { path: '/books', name: 'books', component: BookListView },
      { path: '/books/:bookId', name: 'book-detail', component: BookDetailView },
      { path: '/:pathMatch(.*)*', redirect: { name: 'books' } },
    ],
  });
}
