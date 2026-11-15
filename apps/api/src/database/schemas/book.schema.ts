import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BOOK_STATUSES, BOOK_VISIBILITIES, type BookStatus, type BookVisibility } from '@guihua/contracts';
import { USER_MODEL } from '../model-names';

/** One published reading record. The same title may appear in many records. */
@Schema({ timestamps: true, collection: 'books', versionKey: false })
export class Book {
  @Prop({ type: Types.ObjectId, ref: USER_MODEL, required: true })
  ownerId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 120 })
  slug!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  title!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 120 })
  author!: string;

  @Prop({ type: String, default: null, maxlength: 2048 })
  coverUrl!: string | null;

  @Prop({ type: String, enum: [...BOOK_STATUSES], required: true })
  status!: BookStatus;

  @Prop({ type: String, enum: [...BOOK_VISIBILITIES], required: true, default: 'published' })
  visibility!: BookVisibility;

  @Prop({ type: String, required: true, maxlength: 2000, default: '' })
  summary!: string;

  @Prop({ type: String, required: true, maxlength: 5000, default: '' })
  review!: string;
}

export type BookDocument = HydratedDocument<Book>;

export const BookSchema = SchemaFactory.createForClass(Book);

BookSchema.index({ slug: 1 }, { unique: true, name: 'books_slug_unique' });
BookSchema.index({ visibility: 1, status: 1, createdAt: -1, _id: -1 }, { name: 'books_public_list' });
BookSchema.index({ ownerId: 1, createdAt: -1 }, { name: 'books_owner_recent' });
