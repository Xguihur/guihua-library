import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Connection, Model } from 'mongoose';
import { loadRootEnv } from '../../../src/config/runtime';
import { validateTestDatabaseUri } from '../../../src/config/test-database';
import type { Book } from '../../../src/database/schemas/book.schema';
import type { Comment } from '../../../src/database/schemas/comment.schema';
import type { EmailChallenge } from '../../../src/database/schemas/email-challenge.schema';
import type { Identity } from '../../../src/database/schemas/identity.schema';
import type { OAuthState } from '../../../src/database/schemas/oauth-state.schema';
import type { Reauth } from '../../../src/database/schemas/reauth.schema';
import type { Session } from '../../../src/database/schemas/session.schema';
import type { User } from '../../../src/database/schemas/user.schema';
import {
  BOOK_MODEL,
  COMMENT_MODEL,
  EMAIL_CHALLENGE_MODEL,
  IDENTITY_MODEL,
  OAUTH_STATE_MODEL,
  REAUTH_MODEL,
  SESSION_MODEL,
  USER_MODEL,
} from '../../../src/database/model-names';

export interface TestContext {
  app: INestApplication;
  connection: Connection;
  books: Model<Book>;
  comments: Model<Comment>;
  users: Model<User>;
  identities: Model<Identity>;
  sessions: Model<Session>;
  oauthStates: Model<OAuthState>;
  reauths: Model<Reauth>;
  emailChallenges: Model<EmailChallenge>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export interface TestContextOptions {
  /** Extra process.env entries set before the app module is imported/cached. */
  env?: Record<string, string>;
  /** Nest DI overrides (e.g. a clearly-labelled simulated GitHub client). */
  overrides?: Array<{ token: string | symbol | Type<unknown>; value: unknown }>;
}

/**
 * Boots the real AppModule against the dedicated test database.
 *
 * TEST_MONGODB_URI is mandatory and validated; MONGODB_URI is assigned explicitly
 * from it, never from MONGODB_URI or another fallback.
 */
export async function createTestContext(options: TestContextOptions = {}): Promise<TestContext> {
  // pnpm runs vitest from apps/api; the documented .env is at the repository root.
  loadRootEnv();

  const uri = process.env.TEST_MONGODB_URI;
  if (!uri) {
    throw new Error('TEST_MONGODB_URI must be set for integration tests; there is no fallback to MONGODB_URI.');
  }
  validateTestDatabaseUri(uri);

  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = uri;
  for (const [name, value] of Object.entries(options.env ?? {})) process.env[name] = value;

  const { AppModule } = await import('../../../src/app.module');
  const { configureApp } = await import('../../../src/bootstrap');

  let builder = Test.createTestingModule({ imports: [AppModule] });
  for (const override of options.overrides ?? []) {
    builder = builder.overrideProvider(override.token).useValue(override.value);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();

  const connection = app.get<Connection>(getConnectionToken());
  const books = app.get<Model<Book>>(getModelToken(BOOK_MODEL));
  const comments = app.get<Model<Comment>>(getModelToken(COMMENT_MODEL));
  const users = app.get<Model<User>>(getModelToken(USER_MODEL));
  const identities = app.get<Model<Identity>>(getModelToken(IDENTITY_MODEL));
  const sessions = app.get<Model<Session>>(getModelToken(SESSION_MODEL));
  const oauthStates = app.get<Model<OAuthState>>(getModelToken(OAUTH_STATE_MODEL));
  const reauths = app.get<Model<Reauth>>(getModelToken(REAUTH_MODEL));
  const emailChallenges = app.get<Model<EmailChallenge>>(getModelToken(EMAIL_CHALLENGE_MODEL));

  // Build declared indexes before tests inspect them.
  await Promise.all([
    books.init(),
    comments.init(),
    users.init(),
    identities.init(),
    sessions.init(),
    oauthStates.init(),
    reauths.init(),
    emailChallenges.init(),
  ]);

  const reset = async (): Promise<void> => {
    await Promise.all([
      books.deleteMany({}),
      comments.deleteMany({}),
      users.deleteMany({}),
      identities.deleteMany({}),
      sessions.deleteMany({}),
      oauthStates.deleteMany({}),
      reauths.deleteMany({}),
      emailChallenges.deleteMany({}),
    ]);
  };

  return {
    app,
    connection,
    books,
    comments,
    users,
    identities,
    sessions,
    oauthStates,
    reauths,
    emailChallenges,
    reset,
    close: async () => {
      await app.close();
    },
  };
}
