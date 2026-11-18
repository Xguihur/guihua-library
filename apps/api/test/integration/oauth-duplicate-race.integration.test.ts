import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { OAUTH_COOKIE_NAME, SESSION_COOKIE_NAME } from '@guihua/contracts';
import { GITHUB_CLIENT, type GitHubProfile } from '../../src/m2c/github-client';
import { GITHUB_USERNAME } from '../../src/m2c/oauth.service';
import { createTestContext, type TestContext } from './helpers/test-app';
import { GatedGitHubClient } from './helpers/controllable-dependencies';

/**
 * M2 independent-review F / issue 3: `withTxRetry` deliberately does NOT
 * retry duplicate-key (11000) errors, so the OAuth layer must handle them
 * itself, bounded, without leaving orphan users. First concurrent logins of
 * the same subject and random `gh_` username collisions must converge; a
 * binding (link) duplicate is a REAL conflict and must stay a 409.
 */
const ORIGIN = 'http://127.0.0.1:5173';
const JSON_HEADERS = { Origin: ORIGIN, 'Content-Type': 'application/json' };
const profileA: GitHubProfile = { subject: 'gh-dup-subject-A', login: 'dupA', avatarUrl: null };
const profileB: GitHubProfile = { subject: 'gh-dup-subject-B', login: 'dupB', avatarUrl: null };

let ctx: TestContext;
let github: GatedGitHubClient;
let clock: { advance(ms: number): void; now(): number };
/** Staged usernames for the injectable generator; falls back to random ones. */
let usernames: string[];

beforeAll(async () => {
  github = new GatedGitHubClient();
  usernames = [];
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
      {
        token: GITHUB_USERNAME,
        value: (): string => usernames.shift() ?? `gh_fallback_${randomBytes(8).toString('hex')}`,
      },
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
  github.exchangeStarted = 0;
  github.failExchange = false;
  usernames = [];
});

function agent() {
  return request.agent(ctx.app.getHttpServer());
}

async function waitForExchangeCount(count: number): Promise<void> {
  await vi.waitFor(() => expect(github.exchangeStarted).toBe(count), { timeout: 15_000, interval: 25 });
}

function namedCookie(response: request.Response, name: string): string {
  const all = (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  return (all.find((value) => value.startsWith(`${name}=`)) ?? '').split(';')[0] ?? '';
}

async function beginLogin(who: ReturnType<typeof agent>, code: string, profile: GitHubProfile) {
  github.setProfile(code, profile);
  const response = await who.get('/api/oauth/github/authorization');
  expect(response.status).toBe(302);
  const location = response.headers.location as string;
  return {
    state: new URL(location).searchParams.get('state') ?? '',
    oauthCookie: namedCookie(response, OAUTH_COOKIE_NAME),
  };
}

function callback(who: ReturnType<typeof agent>, code: string, state: string, oauthCookie: string) {
  return who
    .get(`/api/oauth/github/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`)
    .set('Accept', 'application/json')
    .set('Cookie', oauthCookie);
}

async function registerWithReauth(who: ReturnType<typeof agent>, email: string, username: string) {
  const registered = await who.post('/api/users').set(JSON_HEADERS).send({
    email,
    username,
    password: 'correct-horse-battery',
  });
  expect(registered.status).toBe(201);
  const reauth = await who.post('/api/sessions/current/reauthentications').set(JSON_HEADERS).send({
    password: 'correct-horse-battery',
  });
  expect(reauth.status).toBe(204);
  const sessionCookie = namedCookie(registered, SESSION_COOKIE_NAME);
  return { sessionCookie, userId: String(registered.body.id) };
}

async function beginLink(who: ReturnType<typeof agent>, sessionCookie: string, code: string, profile: GitHubProfile) {
  github.setProfile(code, profile);
  const start = await who
    .post('/api/me/identities/github/authorizations')
    .set(JSON_HEADERS)
    .set('Cookie', sessionCookie)
    .send({});
  expect(start.status).toBe(201);
  const state = new URL(start.body.authorizationUrl as string).searchParams.get('state') ?? '';
  return { state, oauthCookie: namedCookie(start, OAUTH_COOKIE_NAME) };
}

describe('issue F3 - bounded duplicate-key recovery in OAuth first login', () => {
  it('lets concurrent first logins of the same subject succeed into the same userId with no orphan user', async () => {
    const first = agent();
    const second = agent();
    const a = await beginLogin(first, 'code-dup-1', profileA);
    const b = await beginLogin(second, 'code-dup-2', profileA);

    github.exchangeGate.arm();
    const pending1 = callback(first, 'code-dup-1', a.state, a.oauthCookie).then((res) => res);
    const pending2 = callback(second, 'code-dup-2', b.state, b.oauthCookie).then((res) => res);
    await waitForExchangeCount(2);
    github.exchangeGate.open();

    const [r1, r2] = await Promise.all([pending1, pending2]);
    expect(r1.status).toBe(302);
    expect(r2.status).toBe(302);
    expect(r1.headers.location).toContain('login-success');
    expect(r2.headers.location).toContain('login-success');

    const identity = await ctx.identities.findOne({ subject: profileA.subject }).lean();
    expect(identity).toBeTruthy();
    const userId = String(identity!.userId);
    // Both sessions belong to the SAME account, and exactly one gh_ user exists.
    const sessions = await ctx.sessions.countDocuments({ userId: identity!.userId });
    expect(sessions).toBe(2);
    expect(await ctx.users.countDocuments({ usernameNormalized: { $regex: /^gh_/ } })).toBe(1);
    expect(await ctx.identities.countDocuments({})).toBe(1);
    expect(userId).toBeTruthy();
  });

  it('retries a controlled username collision with a fresh suffix and still creates the account', async () => {
    // Pre-occupy the username the generator will draw first.
    const occupied = await request(ctx.app.getHttpServer())
      .post('/api/users')
      .set(JSON_HEADERS)
      .send({ email: 'occupied@example.com', username: 'gh_collide', password: 'correct-horse-battery' });
    expect(occupied.status).toBe(201);

    usernames.push('gh_collide', 'gh_fresh_1');
    const browser = agent();
    const begin = await beginLogin(browser, 'code-collide', profileB);
    const result = await callback(browser, 'code-collide', begin.state, begin.oauthCookie);
    expect(result.status).toBe(302);
    expect(result.headers.location).toContain('login-success');

    const identity = await ctx.identities.findOne({ subject: profileB.subject }).lean();
    expect(identity).toBeTruthy();
    const created = await ctx.users.findById(identity!.userId).lean();
    expect(created?.usernameNormalized).toBe('gh_fresh_1');
    // The losing attempt must not have left an orphan user behind: exactly
    // the occupied account plus the freshly created one exist.
    expect(await ctx.users.countDocuments({ usernameNormalized: { $in: ['gh_collide', 'gh_fresh_1'] } })).toBe(2);
  });

  it('maps a concurrent binding duplicate to 409 IDENTITY_CONFLICT, never a retry or a masked 500', async () => {
    const first = agent();
    const second = agent();
    const userA = await registerWithReauth(first, 'link-race-a@example.com', 'Link_Race_A');
    const userB = await registerWithReauth(second, 'link-race-b@example.com', 'Link_Race_B');

    const a = await beginLink(first, userA.sessionCookie, 'code-link-race-1', profileA);
    const b = await beginLink(second, userB.sessionCookie, 'code-link-race-2', profileA);

    github.exchangeGate.arm();
    const pending1 = callback(first, 'code-link-race-1', a.state, `${userA.sessionCookie}; ${a.oauthCookie}`).then((res) => res);
    const pending2 = callback(second, 'code-link-race-2', b.state, `${userB.sessionCookie}; ${b.oauthCookie}`).then((res) => res);
    await waitForExchangeCount(2);
    github.exchangeGate.open();

    const [r1, r2] = await Promise.all([pending1, pending2]);
    const statuses = [r1.status, r2.status].sort((x, y) => x - y);
    expect(statuses).toEqual([302, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect(loser.body.error.code).toBe('IDENTITY_CONFLICT');
    // The winner's binding is intact; exactly one identity exists.
    expect(await ctx.identities.countDocuments({})).toBe(1);
  });

  it('rejects a password recheck for an OAuth-only account with equivalent dummy work and no evidence', async () => {
    const browser = agent();
    const begin = await beginLogin(browser, 'code-nohash', profileB);
    const login = await callback(browser, 'code-nohash', begin.state, begin.oauthCookie);
    expect(login.status).toBe(302);
    const cookie = namedCookie(login, SESSION_COOKIE_NAME);

    // No usable password hash: the verifier must do the same canonical dummy
    // KDF work (unit-tested) and the endpoint must answer a uniform 401.
    const reauth = await request(ctx.app.getHttpServer())
      .post('/api/sessions/current/reauthentications')
      .set(JSON_HEADERS)
      .set('Cookie', cookie)
      .send({ password: 'a-long-enough-password' });
    expect(reauth.status).toBe(401);
    expect(reauth.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(await ctx.reauths.countDocuments({})).toBe(0);
  });
});
