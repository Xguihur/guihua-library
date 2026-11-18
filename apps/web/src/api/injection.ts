import { inject } from 'vue';
import { authApi, booksApi, type AuthApi, type BooksApi } from './client';

/** String keys so tests can provide fakes through mount options. */
export const BOOKS_API_KEY = 'guihua-books-api';
export const AUTH_API_KEY = 'guihua-auth-api';

export function useBooksApi(): BooksApi {
  return inject<BooksApi>(BOOKS_API_KEY) ?? booksApi;
}

export function useAuthApi(): AuthApi {
  return inject<AuthApi>(AUTH_API_KEY) ?? authApi;
}
