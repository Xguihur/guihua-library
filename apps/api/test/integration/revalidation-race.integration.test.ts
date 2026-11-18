import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { OAUTH_COOKIE_NAME, SESSION_COOKIE_NAME } from '@guihua/contracts';
import { PASSWORD_HASHER } from '../../src/common/password';
import { digest } from '../../src/m2c/digest';
import { GITHUB_CLIENT, type GitHubProfile } from '../../src/m2c/github-client';
import { createTestContext, type TestContext } from './helpers/test-app';
import { GatedGitHubClient, GatedHasher } from './helpers/controllable-dependencies';

/**
 * M2 independent-review F / issue 1: a session revoked or expired WHILE an
 * external call (GitHub token exchange / scrypt) is in flight must not be able
 * to bind, reauthenticate or write a credential. Every case drives the real
 * HTTP endpoint and real MongoDB; only the deliberately pausable GitHub/hasher
 * test doubles are injected. Nothing here merely asserts on source text.
 */
const ORIGIN = 'http://127.0.0.1:5173';
const JSON_HEADERS = { Origin: ORIGIN, 'Content-Type': 'application/json' };
const profileA: GitHubProfile = { subject: 'gh-race-A', login: 'alice', avatarUrl: null };

let ctx: TestContext;
let github: GatedGitHubClient;
let hasher: GatedHasher;
let clock: { advance(ms: number): void; now(): number };

beforeAll(async () => {
  github = new GatedGitHubClient();
  hasher = new GatedHasher();
  ctx = await createTestContext({
    env: {
      GITHUB_CLIENT_ID: 'test-client-id',
      GITHUB_CLIENT_SECRET: 'test-client-secret',
      GITHUB_CALLBACK_URL: 'http://127.0.0.1:3000/api/oauth/github/callback',
      GITHUB_AUTHORIZE_URL: 'https://github.example.test/login/oauth/authorize',
      GITHUB_TOKEN_URL: 'https://github.example.test/login/oauth/access_token',
      GITHUB_USER_URL: 'https://github.example.test/user',
      WEB_BASE_URL: 'http://127.0.0.1:5173',
    },
    overrides: [
      { token: GITHUB_CLIENT, value: github },
      { token: PASSWORD_HASHER, value: hasher },
    ],
  });
  clock = ctx.app.get('RATE_CLOCK') as typeof clock;
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
  (ctx.app.get('RATE_LIMITER') as { reset(): void }).reset();
  clock.advance(-clock.now() + 1_700_000_000_000);
  github.exchangeGate.open();
  hasher.hashGate.open();
  hasher.verifyGate.open();
  github.exchangeStarted = 0;
  hasher.hashStarted = 0;
  hasher.verifyStarted = 0;
  github.failExchange = false;
});

/** Waits until the in-flight request has actually entered the gated call. */
async function waitForEntry(read: () => number): Promise<void> {
  await vi.waitFor(() => expect(read()).toBeGreaterThanOrEqual(1), { timeout: 15_000, interval: 25 });
}

function namedCookie(response: request.Response, name: string): string {
  const all = (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  return (all.find((value) => value.startsWith(`${name}=`)) ?? '').split(';')[0] ?? '';
}

function cookies(...parts: string[]): string {
  return parts.filter(Boolean).join('; ');
}

function sessionHashOfCookie(cookie: string): string {
  return digest(decodeURIComponent(cookie.split('=').slice(1).join('=')));
}

async function registerVerified(email: string, username: string) {
  const response = await request(ctx.app.getHttpServer())
    .post('/api/users')
    .set(JSON_HEADERS)
    .send({ email, username, password: 'correct-horse-battery' });
  expect(response.status).toBe(201);
  await ctx.users.updateOne({ email }, { $set: { emailVerifiedAt: new Date() } });
  return { cookie: namedCookie(response, SESSION_COOKIE_NAME), userId: response.body.id as string };
}

async function reauth(cookie: string): Promise<void> {
  const response = await request(ctx.app.getHttpServer())
    .post('/api/sessions/current/reauthentications')
    .set(JSON_HEADERS)
    .set('Cookie', cookie)
    .send({ password: 'correct-horse-battery' });
  expect(response.status).toBe(204);
}

async function beginLink(cookie: string): Promise<{ state: string; oauthCookie: string }> {
  const response = await request(ctx.app.getHttpServer())
    .post('/api/me/identities/github/authorizations')
    .set(JSON_HEADERS)
    .set('Cookie', cookie)
    .send({});
  expect(response.status).toBe(201);
  return {
    state: new URL(response.body.authorizationUrl as string).searchParams.get('state') ?? '',
    oauthCookie: namedCookie(response, OAUTH_COOKIE_NAME),
  };
}

function callback(code: string, state: string, cookieHeader: string) {
  return request(ctx.app.getHttpServer())
    .get(`/api/oauth/github/callback?code=${code}&state=${encodeURIComponent(state)}`)
    .set('Accept', 'application/json')
    .set('Cookie', cookieHeader);
}

async function githubLogin(code: string): Promise<{ cookie: string; userId: string }> {
  github.setProfile(code, profileA);
  const begin = await request(ctx.app.getHttpServer()).get('/api/oauth/github/authorization');
  expect(begin.status).toBe(302);
  const state = new URL(begin.headers.location as string).searchParams.get('state') ?? '';
  const result = await callback(code, state, namedCookie(begin, OAUTH_COOKIE_NAME));
  expect(result.status).toBe(302);
  const identity = await ctx.identities.findOne({ subject: profileA.subject }).lean();
  return { cookie: namedCookie(result, SESSION_COOKIE_NAME), userId: String(identity?.userId) };
}

describe('issue 1 - revalidate the original session inside the credential transaction', () => {
  it('refuses a link callback when the session is revoked during the GitHub exchange', async () => {
    const { cookie, userId } = await registerVerified('link-revoke@example.com', 'Link_Revoke');
    await reauth(cookie);
    const { state, oauthCookie } = await beginLink(cookie);
    github.setProfile('code-link-revoke', profileA);

    github.exchangeGate.arm();
    const pending = callback('code-link-revoke', state, cookies(cookie, oauthCookie)).then((res) => res);
    await waitForEntry(() => github.exchangeStarted);

    // The browser logged out / the token was rotated while GitHub was slow.
    await ctx.sessions.deleteMany({ userId: new Types.ObjectId(userId) });
    expect(await ctx.sessions.countDocuments({ userId: new Types.ObjectId(userId) })).toBe(0);
    github.exchangeGate.open();

    const result = await pending;
    expect([401, 403]).toContain(result.status);
    expect(await ctx.identities.countDocuments({})).toBe(0);
    expect((await ctx.users.findById(userId).select('+passwordHash').lean())?.accountVersion).toBe(0);
  });

  it('refuses a link callback when the recent recheck expires during the GitHub exchange', async () => {
    const { cookie, userId } = await registerVerified('link-expire@example.com', 'Link_Expire');
    await reauth(cookie);
    const { state, oauthCookie } = await beginLink(cookie);
    github.setProfile('code-link-expire', profileA);

    github.exchangeGate.arm();
    const pending = callback('code-link-expire', state, cookies(cookie, oauthCookie)).then((res) => res);
    await waitForEntry(() => github.exchangeStarted);

    clock.advance(5 * 60 * 1000 + 1);
    github.exchangeGate.open();

    const result = await pending;
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('FORBIDDEN');
    expect(await ctx.identities.countDocuments({})).toBe(0);
    expect((await ctx.users.findById(userId).lean())?.accountVersion).toBe(0);
  });

  it('does not record a GitHub reauth after the session is revoked during the exchange', async () => {
    const { cookie, userId } = await githubLogin('code-reauth-revoke');
    const start = await request(ctx.app.getHttpServer())
      .post('/api/sessions/current/github/authorizations')
      .set(JSON_HEADERS)
      .set('Cookie', cookie)
      .send({});
    expect(start.status).toBe(201);
    const state = new URL(start.body.authorizationUrl as string).searchParams.get('state') ?? '';
    const oauthCookie = namedCookie(start, OAUTH_COOKIE_NAME);
    github.setProfile('code-reauth-revoke-ok', profileA);

    github.exchangeGate.arm();
    const pending = callback('code-reauth-revoke-ok', state, cookies(cookie, oauthCookie)).then((res) => res);
    await waitForEntry(() => github.exchangeStarted);

    await ctx.sessions.deleteMany({ userId: new Types.ObjectId(userId) });
    github.exchangeGate.open();

    const result = await pending;
    expect([401, 403]).toContain(result.status);
    expect(await ctx.reauths.countDocuments({})).toBe(0);
  });

  it('does not write a password when the session is revoked during scrypt', async () => {
    const { cookie, userId } = await githubLogin('code-add-revoke');
    const sessionHash = sessionHashOfCookie(cookie);
    await ctx.reauths.create({
      sessionHash,
      userId: new Types.ObjectId(userId),
      purpose: 'sensitive',
      expiresAt: new Date(clock.now() + 5 * 60 * 1000),
    });
    const token = randomBytes(24).toString('base64url');
    await ctx.emailChallenges.create({
      tokenHash: digest(token),
      userId: new Types.ObjectId(userId),
      email: 'added@example.com',
      sessionHash,
      mode: 'add',
      active: true,
      expiresAt: new Date(clock.now() + 10 * 60 * 1000),
      consumedAt: null,
    });

    hasher.hashGate.arm();
    const pending = request(ctx.app.getHttpServer())
      .post('/api/me/password-credentials')
      .set(JSON_HEADERS)
      .set('Accept', 'application/json')
      .set('Cookie', cookie)
      .send({ token, password: 'a-brand-new-password' })
      .then((res) => res);
    await waitForEntry(() => hasher.hashStarted);

    await ctx.sessions.deleteMany({ userId: new Types.ObjectId(userId) });
    clock.advance(5 * 60 * 1000 + 1);
    hasher.hashGate.open();

    const result = await pending;
    expect([401, 403]).toContain(result.status);
    const user = await ctx.users.findById(userId).select('+passwordHash').lean();
    expect(user?.passwordHash).toBe(null);
    expect(user?.email).toBe(null);
    expect(await ctx.sessions.countDocuments({ userId: new Types.ObjectId(userId) })).toBe(0);
  });

  it('does not record password-reauth evidence when the session is revoked during scrypt verify', async () => {
    const { cookie, userId } = await registerVerified('reauth-verify@example.com', 'Reauth_Verify');
    hasher.verifyGate.arm();
    const pending = request(ctx.app.getHttpServer())
      .post('/api/sessions/current/reauthentications')
      .set(JSON_HEADERS)
      .set('Cookie', cookie)
      .send({ password: 'correct-horse-battery' })
      .then((res) => res);
    await waitForEntry(() => hasher.verifyStarted);

    await ctx.sessions.deleteMany({ userId: new Types.ObjectId(userId) });
    hasher.verifyGate.open();

    const result = await pending;
    expect([401, 403]).toContain(result.status);
    expect(await ctx.reauths.countDocuments({})).toBe(0);
  });
});
