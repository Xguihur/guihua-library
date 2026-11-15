import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * M1 only needs the owner projection used by public book/comment DTOs.
 * Account flows arrive in M2; no credentials are ever returned by public endpoints.
 */
@Schema({ timestamps: true, collection: 'users', versionKey: false })
export class User {
  @Prop({ type: String, required: true, trim: true, maxlength: 32 })
  username!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true, maxlength: 254 })
  email!: string;

  @Prop({ type: String, required: true, select: false })
  passwordHash!: string;

  @Prop({ type: String, default: null, maxlength: 2048 })
  avatarUrl!: string | null;

  @Prop({ type: String, required: true, default: 'user' })
  role!: string;
}

export type UserDocument = HydratedDocument<User>;

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ username: 1 }, { unique: true, name: 'users_username_unique' });
UserSchema.index({ email: 1 }, { unique: true, name: 'users_email_unique' });
