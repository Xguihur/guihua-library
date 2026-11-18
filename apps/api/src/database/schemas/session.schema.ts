import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** Only the SHA-256 digest of the browser token is stored, never the token itself. */
@Schema({ collection: 'sessions', versionKey: false })
export class Session {
  @Prop({ type: String, required: true })
  tokenHash!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Date, required: true })
  createdAt!: Date;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;
}

export type SessionDocument = HydratedDocument<Session>;
export const SessionSchema = SchemaFactory.createForClass(Session);

SessionSchema.index({ tokenHash: 1 }, { unique: true, name: 'sessions_token_hash_unique' });
SessionSchema.index({ userId: 1 }, { name: 'sessions_user_id' });
// TTL only cleans up; authorization always checks expiresAt explicitly.
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'sessions_expires_ttl' });
