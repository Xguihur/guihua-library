import { describe, expect, it } from 'vitest';
import {
  bookDetailSchema,
  bookListItemSchema,
  bookListResponseSchema,
  commentListResponseSchema,
  commentSchema,
} from './dto';

const author = { id: 'u1', username: 'mei', avatarUrl: null };

const item = {
  id: 'b1',
  slug: 'the-cliff',
  title: '悬崖',
  author: '某作者',
  coverUrl: null,
  status: 'reading',
  summary: '一段简介',
  owner: author,
  createdAt: '2026-11-15T08:00:00.000Z',
  updatedAt: '2026-11-15T08:00:00.000Z',
};

describe('public book DTO', () => {
  it('accepts the documented list shape', () => {
    expect(bookListItemSchema.parse(item)).toEqual(item);
  });

  it('drops fields that are not part of the public contract', () => {
    const parsed = bookListItemSchema.parse({
      ...item,
      ownerId: 'internal',
      owner: { ...author, email: 'mei@example.com', passwordHash: 'secret' },
      visibility: 'published',
    });
    expect(parsed).not.toHaveProperty('ownerId');
    expect(parsed).not.toHaveProperty('visibility');
    expect(parsed.owner).not.toHaveProperty('email');
    expect(parsed.owner).not.toHaveProperty('passwordHash');
  });

  it('rejects unknown reading statuses', () => {
    expect(() => bookListItemSchema.parse({ ...item, status: 'paused' })).toThrow();
  });

  it('rejects non-http cover URLs', () => {
    expect(() => bookListItemSchema.parse({ ...item, coverUrl: 'javascript:alert(1)' })).toThrow();
  });

  it('requires review only on the detail shape', () => {
    expect(bookDetailSchema.parse({ ...item, review: '读后记' }).review).toBe('读后记');
    expect(() => bookDetailSchema.parse(item)).toThrow();
  });

  it('wraps items in the documented pagination envelope', () => {
    const response = bookListResponseSchema.parse({ items: [item], page: 1, pageSize: 20, total: 1 });
    expect(response.total).toBe(1);
    expect(() => bookListResponseSchema.parse({ items: [item], page: 0, pageSize: 20, total: 1 })).toThrow();
    expect(() => bookListResponseSchema.parse({ items: [item], page: 1, pageSize: 101, total: 1 })).toThrow();
  });
});

describe('public comment DTO', () => {
  const comment = {
    id: 'c1',
    bookId: 'b1',
    content: '写得真好',
    author,
    createdAt: '2026-11-15T08:00:00.000Z',
    updatedAt: '2026-11-15T08:00:00.000Z',
  };

  it('accepts plain-text comments', () => {
    expect(commentSchema.parse(comment)).toEqual(comment);
  });

  it('rejects empty content and stripped author fields', () => {
    expect(() => commentSchema.parse({ ...comment, content: '' })).toThrow();
    const parsed = commentSchema.parse({ ...comment, author: { ...author, email: 'x@example.com' } });
    expect(parsed.author).not.toHaveProperty('email');
  });

  it('validates the paginated comments envelope', () => {
    expect(commentListResponseSchema.parse({ items: [comment], page: 1, pageSize: 20, total: 1 }).items).toHaveLength(1);
  });
});
