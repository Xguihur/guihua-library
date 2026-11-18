import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** One-time, 10-minute email-ownership challenge; only the token digest is stored. */
@Schema({ timestamps: true, collection: 'email_challenges', versionKey: false })
export class EmailChallenge {
  _id!: Types.ObjectId;

  @Prop({ type: String, required: true })
  tokenHash!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  email!: string;

  /** Digest of the session that requested the challenge; completion must match it. */
  @Prop({ type: String, required: true })
  sessionHash!: string;

  /** add: no local password yet; verify: confirm an existing email without changing password. */
  @Prop({ type: String, required: true, enum: ['add', 'verify'] })
  mode!: 'add' | 'verify';

  /**
   * False while the verification mail is in flight. A challenge only becomes
   * consumable after a successful send, and only if it is still the current
   * slot for the user (a newer request may have replaced it meanwhile).
   */
  @Prop({ type: Boolean, default: false })
  active!: boolean;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  consumedAt!: Date | null;
}

export type EmailChallengeDocument = HydratedDocument<EmailChallenge>;
export const EmailChallengeSchema = SchemaFactory.createForClass(EmailChallenge);

EmailChallengeSchema.index({ tokenHash: 1 }, { unique: true, name: 'email_challenges_token_hash_unique' });
EmailChallengeSchema.index({ userId: 1 }, { name: 'email_challenges_user_id' });
EmailChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'email_challenges_expires_ttl' });
