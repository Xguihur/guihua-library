import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { toBookDetail, toBookListItem, toPublicAuthor, type BookLean } from './books.mapper';

const ownerId = new Types.ObjectId('64b000000000000000000001');
const bookId = new Types.ObjectId('64b000000000000000000010');

const ownerDoc = {
  _id: ownerId,
  username: 'mei',
  avatarUrl: 'https://cdn.example.com/a.png',
  email: 'mei@example.com',
  passwordHash: '$2b$10$hash',
  role: 'admin',
};

const book: BookLean = {
  _id: bookId,
  slug: 'the-cliff',
  title: '悬崖',
  author: '某作者',
  coverUrl: 'https://cdn.example.com/cover.jpg',
  status: 'reading',
  summary: '简介',
  review: '书评',
  createdAt: new Date('2026-11-15T08:00:00.000Z'),
  updatedAt: new Date('2026-11-15T09:00:00.000Z'),
  ownerId: ownerDoc,
};

describe('public book mapping', () => {
  it('maps only whitelisted fields and ISO dates', () => {
    expect(toBookListItem(book)).toEqual({
      id: '64b000000000000000000010',
      slug: 'the-cliff',
      title: '悬崖',
      author: '某作者',
      coverUrl: 'https://cdn.example.com/cover.jpg',
      status: 'reading',
      summary: '简介',
      owner: { id: '64b000000000000000000001', username: 'mei', avatarUrl: 'https://cdn.example.com/a.png' },
      createdAt: '2026-11-15T08:00:00.000Z',
      updatedAt: '2026-11-15T09:00:00.000Z',
    });
  });

  it('never leaks owner email, password hash or role', () => {
    const serialized = JSON.stringify(toBookDetail(book));
    expect(serialized).not.toContain('mei@example.com');
    expect(serialized).not.toContain('$2b$10$hash');
    expect(serialized).not.toContain('admin');
    expect(serialized).not.toContain('ownerId');
  });

  it('adds review only to the detail DTO', () => {
    expect(toBookDetail(book).review).toBe('书评');
    expect('review' in toBookListItem(book)).toBe(false);
  });

  it('normalizes unsafe cover URLs to null', () => {
    expect(toBookListItem({ ...book, coverUrl: 'javascript:alert(1)' }).coverUrl).toBeNull();
    expect(toBookListItem({ ...book, coverUrl: '/relative.png' }).coverUrl).toBeNull();
    expect(toBookListItem({ ...book, coverUrl: null }).coverUrl).toBeNull();
  });

  it('falls back to a public placeholder when the owner document is missing', () => {
    expect(toPublicAuthor(ownerId)).toEqual({ id: '64b000000000000000000001', username: 'unknown', avatarUrl: null });
    expect(toPublicAuthor(null)).toEqual({ id: 'unknown', username: 'unknown', avatarUrl: null });
  });

  it('defaults missing summary and review to empty strings', () => {
    const partial = { ...book, summary: undefined, review: undefined };
    expect(toBookDetail(partial).summary).toBe('');
    expect(toBookDetail(partial).review).toBe('');
  });
});
