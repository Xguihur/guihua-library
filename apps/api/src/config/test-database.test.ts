import { describe, expect, it } from 'vitest';
import {
  DEVELOPMENT_DATABASE_NAME,
  TEST_DATABASE_NAME,
  parseMongoUri,
  validateDevelopmentDatabaseUri,
  validateTestDatabaseUri,
} from './test-database';

describe('test database isolation', () => {
  it('accepts the dedicated local test target', () => {
    expect(validateTestDatabaseUri('mongodb://127.0.0.1:27018/guihua_library_test')).toEqual({
      host: '127.0.0.1',
      port: 27018,
      database: TEST_DATABASE_NAME,
    });
  });

  it('rejects the development database, port and shared hosts', () => {
    expect(() => validateTestDatabaseUri('mongodb://127.0.0.1:27018/guihua_library')).toThrow(/guihua_library_test/);
    expect(() => validateTestDatabaseUri('mongodb://127.0.0.1:27017/guihua_library_test')).toThrow(/port/);
    expect(() => validateTestDatabaseUri('mongodb://db.example.com:27018/guihua_library_test')).toThrow(/host/);
  });

  it('rejects non-mongodb schemes and malformed URIs', () => {
    expect(() => validateTestDatabaseUri('not-a-uri')).toThrow();
    expect(() => validateTestDatabaseUri('mongodb+srv://cluster.example.com/guihua_library_test')).toThrow(/scheme/);
  });

  it('defaults the port only when parsing, and never for validation', () => {
    expect(parseMongoUri('mongodb://localhost/guihua_library').port).toBe(27017);
    expect(() => validateTestDatabaseUri('mongodb://localhost/guihua_library_test')).toThrow(/port/);
  });
});

describe('development database guard', () => {
  it('accepts only the local development database', () => {
    expect(validateDevelopmentDatabaseUri('mongodb://127.0.0.1:27017/guihua_library').database).toBe(
      DEVELOPMENT_DATABASE_NAME,
    );
    expect(() => validateDevelopmentDatabaseUri('mongodb://127.0.0.1:27017/guihua_library_test')).toThrow();
    expect(() => validateDevelopmentDatabaseUri('mongodb://127.0.0.1:27018/guihua_library')).toThrow(/port/);
  });
});
