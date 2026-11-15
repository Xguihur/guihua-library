import { inject } from 'vue';
import { booksApi, type BooksApi } from './client';

/** String key so tests can provide a fake client through mount options. */
export const BOOKS_API_KEY = 'guihua-books-api';

export function useBooksApi(): BooksApi {
  return inject<BooksApi>(BOOKS_API_KEY) ?? booksApi;
}
