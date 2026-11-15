import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import type { CommentListResponse, PaginationQuery } from '@guihua/contracts';
import { notFoundError, validationError } from '../common/api-exception';
import { isObjectIdString } from '../common/object-id';
import { BOOK_MODEL, COMMENT_MODEL } from '../database/model-names';
import type { Book } from '../database/schemas/book.schema';
import type { Comment } from '../database/schemas/comment.schema';
import { toCommentDto, type CommentLean } from './comments.mapper';

const AUTHOR_POPULATE = { path: 'authorId', select: 'username avatarUrl' } as const;

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(COMMENT_MODEL) private readonly comments: Model<Comment>,
    @InjectModel(BOOK_MODEL) private readonly books: Model<Book>,
  ) {}

  async listForBook(bookId: string, query: PaginationQuery): Promise<CommentListResponse> {
    if (!isObjectIdString(bookId)) {
      throw validationError('The book id is not valid.', [{ field: 'bookId', reason: 'invalid_object_id' }]);
    }

    // The parent resource is checked first: hidden and missing books both return 404.
    const objectId = new Types.ObjectId(bookId);
    const parent = await this.books.exists({ _id: objectId, visibility: 'published' }).exec();
    if (!parent) throw notFoundError();

    const filter = { bookId: objectId, visibility: 'published' as const };
    const [docs, total] = await Promise.all([
      this.comments
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .populate(AUTHOR_POPULATE)
        .lean<CommentLean[]>()
        .exec(),
      this.comments.countDocuments(filter).exec(),
    ]);

    return {
      items: docs.map(toCommentDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }
}
