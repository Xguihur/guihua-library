import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OAuthPurpose = 'login' | 'link' | 'reauth';

/**
 * Server-side transition for one GitHub OAuth authorization. Only a SHA-256
 * digest of `state` is stored; the raw state and the browser-binding cookie
 * value never hit the database. purpose/userId/returnTo are server-generated
 * and can never be overridden by callback query parameters.
 */
@Schema({ timestamps: true, collection: 'oauth_states', versionKey: false })
export class OAuthState {
  @Prop({ type: String, required: true })
  stateHash!: string;

  @Prop({ type: String, required: true })
  verifier!: string;

  @Prop({ type: String, required: true, enum: ['login', 'link', 'reauth'] })
  purpose!: OAuthPurpose;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  userId!: Types.ObjectId | null;

  /** Digest of the session cookie present when the flow started (original session). */
  @Prop({ type: String, default: null })
  sessionHash!: string | null;

  @Prop({ type: String, required: true })
  oauthCookieHash!: string;

  /** Fixed站内 destination chosen by the server, never from the callback. */
  @Prop({ type: String, required: true })
  returnTo!: string;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  consumedAt!: Date | null;
}

export type OAuthStateDocument = HydratedDocument<OAuthState>;
export const OAuthStateSchema = SchemaFactory.createForClass(OAuthState);

OAuthStateSchema.index({ stateHash: 1 }, { unique: true, name: 'oauth_states_state_hash_unique' });
OAuthStateSchema.index({ oauthCookieHash: 1 }, { name: 'oauth_states_cookie_hash' });
OAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'oauth_states_expires_ttl' });
