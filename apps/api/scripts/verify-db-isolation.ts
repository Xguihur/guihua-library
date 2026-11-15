import mongoose from 'mongoose';
import { cliFailureMessage } from '../src/config/cli-failure';
import { loadRootEnv } from '../src/config/runtime';
import { validateDevelopmentDatabaseUri, validateTestDatabaseUri } from '../src/config/test-database';

/**
 * Proves that resetting the test database cannot touch development data.
 *
 * A unique sentinel is written to the development database, the dedicated test
 * database is dropped, and the sentinel must still be there. Only this run's
 * sentinel is removed afterwards.
 */
async function main(): Promise<void> {
  loadRootEnv();

  const devUri = process.env.MONGODB_URI;
  const testUri = process.env.TEST_MONGODB_URI;
  if (!devUri || !testUri) {
    throw new Error('Both MONGODB_URI and TEST_MONGODB_URI are required for the isolation check.');
  }

  const devTarget = validateDevelopmentDatabaseUri(devUri);
  const testTarget = validateTestDatabaseUri(testUri);

  const devConnection = await mongoose.createConnection(devUri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  const testConnection = await mongoose.createConnection(testUri, { serverSelectionTimeoutMS: 5000 }).asPromise();

  const sentinelId = new mongoose.Types.ObjectId();
  const devDb = devConnection.db;
  const testDb = testConnection.db;
  if (!devDb || !testDb) throw new Error('Database handles are unavailable.');

  try {
    await devDb.collection('dev_isolation_sentinels').insertOne({
      _id: sentinelId,
      note: 'created by pnpm verify:isolation',
      createdAt: new Date(),
    });
    await testDb.collection('test_isolation_sentinels').insertOne({
      _id: sentinelId,
      note: 'dropped together with the test database',
      createdAt: new Date(),
    });

    await testDb.dropDatabase();

    const survivor = await devDb.collection('dev_isolation_sentinels').findOne({ _id: sentinelId });
    if (!survivor) {
      throw new Error('Development sentinel disappeared: the reset touched the development database.');
    }

    console.log(
      `[verify:isolation] dropped ${testTarget.database}@${testTarget.host}:${testTarget.port}; ${devTarget.database} sentinel intact`,
    );
  } finally {
    await devDb.collection('dev_isolation_sentinels').deleteOne({ _id: sentinelId });
    await devConnection.close();
    await testConnection.close();
  }
}

main().catch((error: unknown) => {
  console.error(cliFailureMessage('verify:isolation', error));
  process.exitCode = 1;
});
