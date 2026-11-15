import { Types } from 'mongoose';
import type { CommentDto } from '@guihua/contracts';
import { toPublicAuthor, type OwnerProjection } from '../books/books.mapper';

export interface CommentLean {
  _id: Types.ObjectId;
  bookId: Types.ObjectId | string;
  authorId: OwnerProjection | Types.ObjectId | string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toCommentDto(doc: CommentLean): CommentDto {
  return {
    id: doc._id.toHexString(),
    bookId: doc.bookId instanceof Types.ObjectId ? doc.bookId.toHexString() : String(doc.bookId),
    content: doc.content,
    author: toPublicAuthor(doc.authorId),
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
}
