import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** An external subject is mapped to one immutable internal userId, never to an email. */
@Schema({ timestamps: true, collection: 'identities', versionKey: false })
export class Identity {
  @Prop({ type: String, required: true, enum: ['github'] })
  provider!: 'github';

  @Prop({ type: String, required: true })
  subject!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;
}

export type IdentityDocument = HydratedDocument<Identity>;
export const IdentitySchema = SchemaFactory.createForClass(Identity);

IdentitySchema.index({ provider: 1, subject: 1 }, { unique: true, name: 'identities_provider_subject_unique' });
IdentitySchema.index({ userId: 1, provider: 1 }, { unique: true, name: 'identities_user_provider_unique' });
