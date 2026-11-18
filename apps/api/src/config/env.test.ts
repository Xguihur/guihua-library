import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

describe('environment validation', () => {
  it('fills documented defaults', () => {
    expect(validateEnv({ MONGODB_URI: 'mongodb://127.0.0.1:27017/guihua_library' })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      MONGODB_URI: 'mongodb://127.0.0.1:27017/guihua_library',
      ALLOWED_ORIGINS: ['http://127.0.0.1:5173', 'http://localhost:5173'],
      GITHUB_CLIENT_ID: '',
      GITHUB_CLIENT_SECRET: '',
      GITHUB_CALLBACK_URL: 'http://127.0.0.1:3000/api/oauth/github/callback',
      GITHUB_AUTHORIZE_URL: 'https://github.com/login/oauth/authorize',
      GITHUB_TOKEN_URL: 'https://github.com/login/oauth/access_token',
      GITHUB_USER_URL: 'https://api.github.com/user',
      SMTP_HOST: '',
      SMTP_PORT: 1025,
      SMTP_USER: '',
      SMTP_PASS: '',
      SMTP_SECURE: false,
      SMTP_REQUIRE_TLS: false,
      SMTP_FROM: 'no-reply@guihua.local',
      MAIL_TIMEOUT_MS: 5000,
      MAILPIT_API_URL: 'http://127.0.0.1:8025',
      WEB_BASE_URL: 'http://127.0.0.1:5173',
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

  it('accepts only an absolute http(s) site origin for WEB_BASE_URL', () => {
    expect(validateEnv({ MONGODB_URI: 'mongodb://127.0.0.1:27017/guihua_library', WEB_BASE_URL: 'https://site.example' }).WEB_BASE_URL).toBe('https://site.example');
    expect(validateEnv({ MONGODB_URI: 'mongodb://127.0.0.1:27017/guihua_library', WEB_BASE_URL: 'http://localhost:5173/' }).WEB_BASE_URL).toBe('http://localhost:5173');
    for (const bad of [
      '/oauth-result',
      '//evil.example',
      'http://user:pass@site.example',
      'ftp://site.example',
      'https://site.example/path',
      'https://site.example?x=1',
      'https://site.example#frag',
      'https://*.example',
    ]) {
      expect(() => validateEnv({ MONGODB_URI: 'mongodb://127.0.0.1:27017/guihua_library', WEB_BASE_URL: bad })).toThrow(/WEB_BASE_URL/);
    }
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
