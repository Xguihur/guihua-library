import { z } from 'zod';
import { BOOK_STATUSES, COVER_URL_PATTERN, MAX_PAGE_SIZE, type BookStatus } from './status';

/** Public DTOs. Every response is built from these shapes explicitly; no Mongoose document is serialized. */

export interface PublicAuthor {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface BookListItemDto {
  id: string;
  slug: string;
  title: string;
  author: string;
  coverUrl: string | null;
  status: BookStatus;
  summary: string;
  owner: PublicAuthor;
  createdAt: string;
  updatedAt: string;
}

export interface BookDetailDto extends BookListItemDto {
  review: string;
}

export interface CommentDto {
  id: string;
  bookId: string;
  content: string;
  author: PublicAuthor;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export type BookListResponse = Paginated<BookListItemDto>;
export type CommentListResponse = Paginated<CommentDto>;

const httpUrl = z.string().regex(COVER_URL_PATTERN, 'must_be_http_url');

export const publicAuthorSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  avatarUrl: httpUrl.nullable(),
});

export const bookListItemSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1),
  coverUrl: httpUrl.nullable(),
  status: z.enum(BOOK_STATUSES),
  summary: z.string(),
  owner: publicAuthorSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const bookDetailSchema = bookListItemSchema.extend({
  review: z.string(),
});

export const commentSchema = z.object({
  id: z.string().min(1),
  bookId: z.string().min(1),
  content: z.string().min(1),
  author: publicAuthorSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
    total: z.number().int().min(0),
  });
}

export const bookListResponseSchema = paginatedSchema(bookListItemSchema);
export const bookDetailResponseSchema = bookDetailSchema;
export const commentListResponseSchema = paginatedSchema(commentSchema);
