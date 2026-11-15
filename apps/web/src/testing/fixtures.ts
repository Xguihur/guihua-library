import type {
  BookDetailDto,
  BookListItemDto,
  CommentDto,
  Paginated,
} from '@guihua/contracts';

let sequence = 0;

export function makeBook(overrides: Partial<BookListItemDto> = {}): BookListItemDto {
  sequence += 1;
  return {
    id: `64b00000000000000000${String(sequence).padStart(4, '0')}`,
    slug: `book-${sequence}`,
    title: `示例书 ${sequence}`,
    author: '示例作者',
    coverUrl: null,
    status: 'reading',
    summary: '示例简介',
    owner: { id: '64b000000000000000000001', username: 'mei', avatarUrl: null },
    createdAt: '2026-11-05T09:00:00.000Z',
    updatedAt: '2026-11-05T09:00:00.000Z',
    ...overrides,
  };
}

export function makeDetail(overrides: Partial<BookDetailDto> = {}): BookDetailDto {
  return { ...makeBook(overrides), review: '示例书评', ...overrides };
}

export function makeComment(overrides: Partial<CommentDto> = {}): CommentDto {
  sequence += 1;
  return {
    id: `64c00000000000000000${String(sequence).padStart(4, '0')}`,
    bookId: '64b000000000000000000010',
    content: '示例评论',
    author: { id: '64b000000000000000000002', username: 'lin', avatarUrl: null },
    createdAt: '2026-11-08T09:00:00.000Z',
    updatedAt: '2026-11-08T09:00:00.000Z',
    ...overrides,
  };
}

export function pageOf<T>(items: T[], total = items.length, page = 1, pageSize = 20): Paginated<T> {
  return { items, total, page, pageSize };
}
