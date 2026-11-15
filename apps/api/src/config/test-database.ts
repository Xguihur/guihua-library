/**
 * Safety rails for destructive database operations.
 *
 * The test database is a dedicated, locally bound Compose service. Reset, seed and
 * integration helpers only ever accept an explicit, allow-listed target, so a typo in
 * an environment variable cannot drop a development or production database.
 */

export const TEST_DATABASE_NAME = 'guihua_library_test';
export const DEVELOPMENT_DATABASE_NAME = 'guihua_library';

const TEST_ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', 'mongo-test', 'mongo']);
const TEST_ALLOWED_PORTS = new Set([27018]);

const DEV_ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', 'mongo-dev', 'mongo']);
const DEV_ALLOWED_PORTS = new Set([27017]);

export interface MongoTarget {
  host: string;
  port: number;
  database: string;
}

export function parseMongoUri(uri: string): MongoTarget {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new Error('The MongoDB URI is not a valid URL.');
  }
  if (url.protocol !== 'mongodb:') {
    throw new Error('The MongoDB URI must use the mongodb:// scheme with an explicit port.');
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 27017,
    database,
  };
}

function assertTarget(target: MongoTarget, expected: string, hosts: Set<string>, ports: Set<number>, label: string): MongoTarget {
  if (target.database !== expected) {
    throw new Error(`${label} must target the "${expected}" database, refusing to continue.`);
  }
  if (!hosts.has(target.host)) {
    throw new Error(`${label} must use a local allow-listed host, refusing to continue.`);
  }
  if (!ports.has(target.port)) {
    throw new Error(`${label} must use the dedicated local port, refusing to continue.`);
  }
  return target;
}

/** Throws unless the URI targets the dedicated local test database and port. */
export function validateTestDatabaseUri(uri: string): MongoTarget {
  return assertTarget(parseMongoUri(uri), TEST_DATABASE_NAME, TEST_ALLOWED_HOSTS, TEST_ALLOWED_PORTS, 'TEST_MONGODB_URI');
}

/** Throws unless the URI targets the local development database and port. */
export function validateDevelopmentDatabaseUri(uri: string): MongoTarget {
  return assertTarget(parseMongoUri(uri), DEVELOPMENT_DATABASE_NAME, DEV_ALLOWED_HOSTS, DEV_ALLOWED_PORTS, 'MONGODB_URI');
}
