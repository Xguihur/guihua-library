/** Shared, browser-safe vocabulary for the public library. */

export const BOOK_STATUSES = ['reading', 'finished'] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export const BOOK_VISIBILITIES = ['published', 'hidden'] as const;
export type BookVisibility = (typeof BOOK_VISIBILITIES)[number];

export const COMMENT_VISIBILITIES = ['published', 'hidden'] as const;
export type CommentVisibility = (typeof COMMENT_VISIBILITIES)[number];

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Only http(s) covers are allowed; M1 has no upload or server-side fetching. */
export const COVER_URL_PATTERN = /^https?:\/\/[^\s]+$/;

export function isBookStatus(value: unknown): value is BookStatus {
  return typeof value === 'string' && (BOOK_STATUSES as readonly string[]).includes(value);
}
