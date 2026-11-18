import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { GENDERS, type Gender } from '@guihua/contracts';

/**
 * One immutable internal userId owns every profile and content item. Email/password
 * and GitHub subject are optional login methods pointing at the same user.
 * Public DTOs are mapped explicitly; no Mongoose document is ever serialized.
 */
@Schema({ timestamps: true, collection: 'users', versionKey: false })
export class User {
  @Prop({ type: String, required: true, trim: true, maxlength: 32 })
  username!: string;

  /** ASCII lowercase of username; sparse so pre-M1 rows can be backfilled by the migration. */
  @Prop({ type: String, trim: true, lowercase: true, maxlength: 32 })
  usernameNormalized?: string;

  @Prop({ type: String, trim: true, lowercase: true, maxlength: 254, default: null })
  email!: string | null;

  @Prop({ type: String, select: false, default: null })
  passwordHash!: string | null;

  @Prop({ type: Date, default: null })
  emailVerifiedAt!: Date | null;

  @Prop({ type: String, enum: GENDERS, default: 'unspecified' })
  gender!: Gender;

  @Prop({ type: String, default: '' })
  signature!: string;

  @Prop({ type: String, default: null, maxlength: 2048 })
  avatarUrl!: string | null;

  @Prop({ type: Boolean, default: true })
  enabled!: boolean;

  /** Serializes concurrent identity/credential changes inside a transaction. */
  @Prop({ type: Number, default: 0 })
  accountVersion!: number;

  @Prop({ type: String, required: true, default: 'user' })
  role!: string;
}

export type UserDocument = HydratedDocument<User>;

export const UserSchema = SchemaFactory.createForClass(User);

// Kept for M1 compatibility and the existing index regression test.
UserSchema.index({ username: 1 }, { unique: true, name: 'users_username_unique' });
UserSchema.index({ email: 1 }, { unique: true, name: 'users_email_unique' });
// Null-safe replacement for the email index above; the old one is only removed by
// the explicit migration after a maintainer reviews the conflict report.
UserSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } }, name: 'users_email_nullable_unique' },
);
UserSchema.index({ usernameNormalized: 1 }, { unique: true, sparse: true, name: 'users_username_normalized_unique' });
