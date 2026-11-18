import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** Recent identity-recheck evidence bound to one session, user and purpose. */
@Schema({ timestamps: true, collection: 'reauths', versionKey: false })
export class Reauth {
  @Prop({ type: String, required: true })
  sessionHash!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  purpose!: string;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;
}

export type ReauthDocument = HydratedDocument<Reauth>;
export const ReauthSchema = SchemaFactory.createForClass(Reauth);

ReauthSchema.index({ sessionHash: 1, userId: 1, purpose: 1 }, { name: 'reauths_session_user_purpose' });
ReauthSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'reauths_expires_ttl' });
