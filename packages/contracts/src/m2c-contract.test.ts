import { describe, expect, it } from 'vitest';
import {
  authorizationUrlSchema,
  emailVerificationRequestSchema,
  emptyJsonBodySchema,
  loginMethodsSchema,
  oauthCallbackQuerySchema,
  passwordCredentialSchema,
  passwordReauthSchema,
  GITHUB_LOGIN_USERNAME_PREFIX,
  OAUTH_STATE_TTL_MS,
  OAUTH_COOKIE_NAME,
  REAUTH_WINDOW_MS,
  EMAIL_CHALLENGE_TTL_MS,
  USERNAME_PATTERN,
} from './index';

describe('M2c shared contracts (§6 strict shapes)', () => {
  it('accepts only the empty JSON body for OAuth authorization starters', () => {
    expect(emptyJsonBodySchema.parse({})).toEqual({});
    expect(() => emptyJsonBodySchema.parse({ purpose: 'link', userId: 'x' })).toThrow();
  });

  it('requires code and state on the OAuth callback and rejects extra query keys', () => {
    expect(oauthCallbackQuerySchema.parse({ code: 'c', state: 's' })).toEqual({ code: 'c', state: 's' });
    expect(() => oauthCallbackQuerySchema.parse({ code: 'c' })).toThrow();
    expect(() => oauthCallbackQuerySchema.parse({ code: 'c', state: 's', returnTo: 'https://evil' })).toThrow();
  });

  it('accepts only a password for password reauthentication', () => {
    expect(passwordReauthSchema.parse({ password: 'a-long-enough-password' })).toBeDefined();
    expect(() => passwordReauthSchema.parse({ password: 'x', userId: 'victim' })).toThrow();
  });

  it('accepts only an email for the verification request', () => {
    expect(emailVerificationRequestSchema.parse({ email: 'me@example.com' })).toBeDefined();
    expect(() => emailVerificationRequestSchema.parse({ email: 'me@example.com', password: 'x' })).toThrow();
  });

  it('accepts {token,password} or {token} only, never server-controlled fields', () => {
    expect(passwordCredentialSchema.parse({ token: 't', password: 'a-long-enough-password' })).toBeDefined();
    expect(passwordCredentialSchema.parse({ token: 't' })).toEqual({ token: 't' });
    expect(() => passwordCredentialSchema.parse({ token: 't', enabled: true })).toThrow();
    expect(() => passwordCredentialSchema.parse({ token: 't', password: 'x', email: 'a@b.example' })).toThrow();
  });

  it('describes login methods without leaking a password hash or subject', () => {
    const methods = { github: { linked: true }, password: { enabled: false, email: null } };
    expect(loginMethodsSchema.parse(methods)).toEqual(methods);
    expect(() => loginMethodsSchema.parse({ ...methods, subject: 'gh-1' })).toThrow();
    expect(() =>
      loginMethodsSchema.parse({ github: { linked: true }, password: { enabled: true, email: 'a@b.example', passwordHash: 'x' } }),
    ).toThrow();
  });

  it('describes the authorization URL response and rejects extra fields', () => {
    const value = { authorizationUrl: 'https://github.com/login/oauth/authorize?client_id=x' };
    expect(authorizationUrlSchema.parse(value)).toEqual(value);
    expect(() => authorizationUrlSchema.parse({ ...value, state: 's', verifier: 'v' })).toThrow();
  });

  it('freezes OAuth/reauth/challenge constants used by the protocol', () => {
    expect(USERNAME_PATTERN.test(`${GITHUB_LOGIN_USERNAME_PREFIX}Ab12`)).toBe(true);
    expect(OAUTH_COOKIE_NAME).toBe('guihua_oauth');
    // One-time state is 10 minutes; reauth evidence 5 minutes; email challenge 10 minutes.
    expect(OAUTH_STATE_TTL_MS).toBe(10 * 60 * 1000);
    expect(REAUTH_WINDOW_MS).toBe(5 * 60 * 1000);
    expect(EMAIL_CHALLENGE_TTL_MS).toBe(10 * 60 * 1000);
  });
});
