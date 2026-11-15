import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BOOK_MODEL, COMMENT_MODEL, USER_MODEL } from './model-names';
import { BookSchema } from './schemas/book.schema';
import { CommentSchema } from './schemas/comment.schema';
import { UserSchema } from './schemas/user.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BOOK_MODEL, schema: BookSchema },
      { name: COMMENT_MODEL, schema: CommentSchema },
      { name: USER_MODEL, schema: UserSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
