import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Connection, Model } from 'mongoose';
import { loadRootEnv } from '../../../src/config/runtime';
import { validateTestDatabaseUri } from '../../../src/config/test-database';
import type { Book } from '../../../src/database/schemas/book.schema';
import type { Comment } from '../../../src/database/schemas/comment.schema';
import type { User } from '../../../src/database/schemas/user.schema';
import { BOOK_MODEL, COMMENT_MODEL, USER_MODEL } from '../../../src/database/model-names';

export interface TestContext {
  app: INestApplication;
  connection: Connection;
  books: Model<Book>;
  comments: Model<Comment>;
  users: Model<User>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Boots the real AppModule against the dedicated test database.
 *
 * TEST_MONGODB_URI is mandatory and validated; MONGODB_URI is assigned explicitly
 * from it, never from MONGODB_URI or another fallback.
 */
export async function createTestContext(): Promise<TestContext> {
  // pnpm runs vitest from apps/api; the documented .env is at the repository root.
  loadRootEnv();

  const uri = process.env.TEST_MONGODB_URI;
  if (!uri) {
    throw new Error('TEST_MONGODB_URI must be set for integration tests; there is no fallback to MONGODB_URI.');
  }
  validateTestDatabaseUri(uri);

  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = uri;

  const { AppModule } = await import('../../../src/app.module');
  const { configureApp } = await import('../../../src/bootstrap');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();

  const connection = app.get<Connection>(getConnectionToken());
  const books = app.get<Model<Book>>(getModelToken(BOOK_MODEL));
  const comments = app.get<Model<Comment>>(getModelToken(COMMENT_MODEL));
  const users = app.get<Model<User>>(getModelToken(USER_MODEL));

  // Build declared indexes before tests inspect them.
  await Promise.all([books.init(), comments.init(), users.init()]);

  const reset = async (): Promise<void> => {
    await Promise.all([books.deleteMany({}), comments.deleteMany({}), users.deleteMany({})]);
  };

  return {
    app,
    connection,
    books,
    comments,
    users,
    reset,
    close: async () => {
      await app.close();
    },
  };
}
