import mongoose from 'mongoose';
import { cliFailureMessage } from '../config/cli-failure';
import { loadRootEnv } from '../config/runtime';
import { validateDevelopmentDatabaseUri } from '../config/test-database';
import { seedFixtures } from './fixtures';

/**
 * Writes only the documented demo fixtures into the local development database.
 * Never drops data, never targets the test database and refuses production.
 */
async function main(): Promise<void> {
  // Resolve the repository-root .env even when pnpm runs this from apps/api.
  loadRootEnv();

  if (process.env.NODE_ENV === 'production') {
    throw new Error('db:seed refuses to run with NODE_ENV=production.');
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required for db:seed.');
  }

  const target = validateDevelopmentDatabaseUri(uri);
  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  try {
    if (!connection.db) throw new Error('Database handle is unavailable.');
    const result = await seedFixtures(connection.db);
    console.log(
      `[db:seed] ${target.database}@${target.host}:${target.port} users=${result.users} books=${result.books} comments=${result.comments}`,
    );
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(cliFailureMessage('db:seed', error));
  process.exitCode = 1;
});
