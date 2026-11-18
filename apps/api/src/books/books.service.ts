import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type FilterQuery, type Model } from 'mongoose';
import type { BookListQuery, BookListResponse, BookDetailDto } from '@guihua/contracts';
import { notFoundError, validationError } from '../common/api-exception';
import { isObjectIdString } from '../common/object-id';
import { BOOK_MODEL } from '../database/model-names';
import type { Book } from '../database/schemas/book.schema';
import { toBookDetail, toBookListItem, type BookLean } from './books.mapper';

const OWNER_POPULATE = { path: 'ownerId', select: 'username avatarUrl' } as const;

@Injectable()
export class BooksService {
  constructor(@InjectModel(BOOK_MODEL) private readonly books: Model<Book>) {}

  async list(query: BookListQuery): Promise<BookListResponse> {
    // 桂花记录：通过 review 这段代码，我对 nest 组织后端业务服务和数据库查询关系有了更深的理解。也懂了 populate 就类似于联表查询，这里的作用是把这个外键字段替换为它对应表里的字段合集，在 schema 中有声明这个字段的 ref 对应的集合是哪个，mongoose 能自己找到集合并且把里面的字段拼接过来。
    const filter: FilterQuery<Book> = { visibility: 'published' };
    if (query.status) filter.status = query.status;

    const [docs, total] = await Promise.all([
      this.books
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .populate(OWNER_POPULATE)
        .lean<BookLean[]>()
        .exec(),
      this.books.countDocuments(filter).exec(),
    ]);

    return {
      items: docs.map(toBookListItem),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async findPublicById(bookId: string): Promise<BookDetailDto> {
    this.assertBookId(bookId);
    const doc = await this.books
      .findOne({ _id: new Types.ObjectId(bookId), visibility: 'published' })
      .populate(OWNER_POPULATE)
      .lean<BookLean | null>()
      .exec();
    if (!doc) throw notFoundError();
    return toBookDetail(doc);
  }

  assertBookId(bookId: string): void {
    if (!isObjectIdString(bookId)) {
      throw validationError('The book id is not valid.', [{ field: 'bookId', reason: 'invalid_object_id' }]);
    }
  }
}
