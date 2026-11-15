import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { COMMENT_VISIBILITIES, type CommentVisibility } from '@guihua/contracts';
import { BOOK_MODEL, USER_MODEL } from '../model-names';

/** Native plain-text comment attached to exactly one reading record. */
@Schema({ timestamps: true, collection: 'comments', versionKey: false })
export class Comment {
  @Prop({ type: Types.ObjectId, ref: BOOK_MODEL, required: true })
  bookId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: USER_MODEL, required: true })
  authorId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 2000 })
  content!: string;

  @Prop({ type: String, enum: [...COMMENT_VISIBILITIES], required: true, default: 'published' })
  visibility!: CommentVisibility;
}

export type CommentDocument = HydratedDocument<Comment>;

export const CommentSchema = SchemaFactory.createForClass(Comment);

CommentSchema.index({ bookId: 1, visibility: 1, createdAt: -1, _id: -1 }, { name: 'comments_public_list' });
