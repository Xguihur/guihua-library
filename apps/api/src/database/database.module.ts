import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  BOOK_MODEL,
  COMMENT_MODEL,
  EMAIL_CHALLENGE_MODEL,
  IDENTITY_MODEL,
  OAUTH_STATE_MODEL,
  REAUTH_MODEL,
  SESSION_MODEL,
  USER_MODEL,
} from './model-names';
import { BookSchema } from './schemas/book.schema';
import { CommentSchema } from './schemas/comment.schema';
import { EmailChallengeSchema } from './schemas/email-challenge.schema';
import { IdentitySchema } from './schemas/identity.schema';
import { OAuthStateSchema } from './schemas/oauth-state.schema';
import { ReauthSchema } from './schemas/reauth.schema';
import { SessionSchema } from './schemas/session.schema';
import { UserSchema } from './schemas/user.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BOOK_MODEL, schema: BookSchema },
      { name: COMMENT_MODEL, schema: CommentSchema },
      { name: USER_MODEL, schema: UserSchema },
      { name: IDENTITY_MODEL, schema: IdentitySchema },
      { name: SESSION_MODEL, schema: SessionSchema },
      { name: OAUTH_STATE_MODEL, schema: OAuthStateSchema },
      { name: REAUTH_MODEL, schema: ReauthSchema },
      { name: EMAIL_CHALLENGE_MODEL, schema: EmailChallengeSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
