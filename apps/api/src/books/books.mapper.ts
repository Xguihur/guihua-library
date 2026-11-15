import { Types } from 'mongoose';
import {
  COVER_URL_PATTERN,
  type BookDetailDto,
  type BookListItemDto,
  type BookStatus,
  type PublicAuthor,
} from '@guihua/contracts';

export interface OwnerProjection {
  _id?: Types.ObjectId | string;
  username?: string | null;
  avatarUrl?: string | null;
}

export interface BookLean {
  _id: Types.ObjectId;
  slug: string;
  title: string;
  author: string;
  coverUrl?: string | null;
  status: BookStatus;
  summary?: string | null;
  review?: string | null;
  createdAt: Date;
  updatedAt: Date;
  ownerId: OwnerProjection | Types.ObjectId | string | null;
}

function idOf(value: unknown): string {
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && '_id' in value) {
    const id = (value as { _id?: unknown })._id;
    if (id instanceof Types.ObjectId) return id.toHexString();
    if (typeof id === 'string') return id;
  }
  return '';
}

function safeCoverUrl(value: unknown): string | null {
  return typeof value === 'string' && COVER_URL_PATTERN.test(value) ? value : null;
}

function isOwnerProjection(value: unknown): value is OwnerProjection {
  return typeof value === 'object' && value !== null && 'username' in value;
}

export function toPublicAuthor(owner: unknown): PublicAuthor {
  if (isOwnerProjection(owner) && typeof owner.username === 'string') {
    return {
      id: idOf(owner) || 'unknown',
      username: owner.username,
      avatarUrl: safeCoverUrl(owner.avatarUrl),
    };
  }
  // Owner documents can be missing in the database; never surface internal fields.
  return { id: idOf(owner) || 'unknown', username: 'unknown', avatarUrl: null };
}

function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

export function toBookListItem(doc: BookLean): BookListItemDto {
  return {
    id: doc._id.toHexString(),
    slug: doc.slug,
    title: doc.title,
    author: doc.author,
    coverUrl: safeCoverUrl(doc.coverUrl),
    status: doc.status,
    summary: doc.summary ?? '',
    owner: toPublicAuthor(doc.ownerId),
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
  };
}

export function toBookDetail(doc: BookLean): BookDetailDto {
  return {
    ...toBookListItem(doc),
    review: doc.review ?? '',
  };
}
