import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

describe('environment validation', () => {
  it('fills documented defaults', () => {
    expect(validateEnv({ MONGODB_URI: 'mongodb://127.0.0.1:27017/guihua_library' })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      MONGODB_URI: 'mongodb://127.0.0.1:27017/guihua_library',
    });
  });

  it('fails when the database URI is missing, naming the field only', () => {
    expect(() => validateEnv({})).toThrow(/MONGODB_URI/);
  });

  it('never echoes a rejected URI value', () => {
    const secret = 'mongodb://user:supersecret@db.example.com:27017/production';
    let message = '';
    try {
      validateEnv({ NODE_ENV: 'test', MONGODB_URI: secret });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toBe('');
    expect(message).not.toContain('supersecret');
    expect(message).not.toContain('db.example.com');
  });

  it('rejects a test run against the development database', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017/guihua_library' }),
    ).toThrow(/guihua_library_test/);
  });

  it('rejects a non-decimal port', () => {
    expect(() => validateEnv({ MONGODB_URI: 'mongodb://127.0.0.1:27017/guihua_library', PORT: 'abc' })).toThrow(
      /PORT/,
    );
  });

  it('accepts the documented port boundaries', () => {
    expect(
      validateEnv({ MONGODB_URI: 'mongodb://127.0.0.1:27017/guihua_library', PORT: '1' }).PORT,
    ).toBe(1);
    expect(
      validateEnv({ MONGODB_URI: 'mongodb://127.0.0.1:27017/guihua_library', PORT: '65535' }).PORT,
    ).toBe(65535);
  });

  it('rejects ports outside 1-65535 without echoing the value', () => {
    for (const port of ['0', '65536', '70000', '1.5', '-1', '']) {
      let message = '';
      try {
        validateEnv({ MONGODB_URI: 'mongodb://127.0.0.1:27017/guihua_library', PORT: port });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain('PORT');
      expect(message).not.toContain(port === '' ? 'at index' : port);
    }
  });

  it('rejects malformed, non-mongodb and database-less URIs without echoing values', () => {
    const rejected = [
      'not-a-uri',
      'http://127.0.0.1:27017/guihua_library',
      'mongodb://127.0.0.1:27017',
      'mongodb://127.0.0.1:27017/',
      'mongodb+srv://cluster.example.com/guihua_library',
    ];
    for (const uri of rejected) {
      let message = '';
      try {
        validateEnv({ MONGODB_URI: uri });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain('MONGODB_URI');
      expect(message).not.toContain(uri);
      expect(message).not.toContain('cluster.example.com');
    }
  });

  it('accepts a URI with credentials without exposing them in errors', () => {
    const uri = 'mongodb://user:supersecret@127.0.0.1:27017/guihua_library';
    expect(validateEnv({ MONGODB_URI: uri }).MONGODB_URI).toBe(uri);

    let message = '';
    try {
      validateEnv({ PORT: '0', MONGODB_URI: uri });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('PORT');
    expect(message).not.toContain('supersecret');
    expect(message).not.toContain(uri);
  });
});
