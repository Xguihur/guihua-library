import mongoose from 'mongoose';
import { cliFailureMessage } from '../config/cli-failure';
import { loadRootEnv } from '../config/runtime';
import { validateTestDatabaseUri } from '../config/test-database';

/**
 * Drops only the dedicated local test database.
 *
 * Guards before the destructive call: the URI must be TEST_MONGODB_URI (never MONGODB_URI),
 * use the allow-listed local host and port, and name the guihua_library_test database.
 */
async function main(): Promise<void> {
  loadRootEnv();

  const uri = process.env.TEST_MONGODB_URI;
  if (!uri) {
    throw new Error('TEST_MONGODB_URI is required for db:test:reset; there is no fallback to MONGODB_URI.');
  }

  const target = validateTestDatabaseUri(uri);
  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  try {
    await connection.dropDatabase();
    console.log(`[db:test:reset] dropped ${target.database}@${target.host}:${target.port}`);
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(cliFailureMessage('db:test:reset', error));
  process.exitCode = 1;
});
