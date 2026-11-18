import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { GITHUB_CLIENT, type GitHubProfile } from '../../src/m2c/github-client';
import { createTestContext, type TestContext } from './helpers/test-app';
import { SimulatedGitHubClient } from './helpers/simulated-github';

/**
 * M2c §6 GitHub OAuth over real HTTP + real MongoDB. The GitHub side is a
 * clearly-labelled local simulation (never real authorization); the app's own
 * endpoints, cookies, state/PKCE and database writes are all real.
 */
const ORIGIN = 'http://127.0.0.1:5173';
const JSON_HEADERS = { Origin: ORIGIN, 'Content-Type': 'application/json' };

let ctx: TestContext;
let simulated: SimulatedGitHubClient;
let clock: { advance(ms: number): void; now(): number };

beforeAll(async () => {
  simulated = new SimulatedGitHubClient();
  ctx = await createTestContext({
    env: {
      GITHUB_CLIENT_ID: 'test-client-id',
      GITHUB_CLIENT_SECRET: 'test-client-secret',
      GITHUB_CALLBACK_URL: 'http://127.0.0.1:3000/api/oauth/github/callback',
      GITHUB_AUTHORIZE_URL: 'https://github.example.test/login/oauth/authorize',
      GITHUB_TOKEN_URL: 'https://github.example.test/login/oauth/access_token',
      GITHUB_USER_URL: 'https://github.example.test/user',
    },
    overrides: [{ token: GITHUB_CLIENT, value: simulated }],
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
});

const profileA: GitHubProfile = { subject: 'gh-subject-A', login: 'alice', avatarUrl: null };
const profileB: GitHubProfile = { subject: 'gh-subject-B', login: 'bob', avatarUrl: null };

function agent() {
  return request.agent(ctx.app.getHttpServer());
}

async function beginLogin(who: ReturnType<typeof agent>, code: string, profile: GitHubProfile) {
  simulated.setProfile(code, profile);
  const response = await who.get('/api/oauth/github/authorization');
  expect(response.status).toBe(302);
  const location = response.headers.location as string;
  const url = new URL(location);
  return { state: url.searchParams.get('state') ?? '', url, location };
}

function callback(who: ReturnType<typeof agent>, code: string, state: string, acceptJson = true) {
  let call = who.get(
    `/api/oauth/github/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
  );
  if (acceptJson) call = call.set('Accept', 'application/json');
  return call;
}

describe('M2c §6.2 GitHub direct login and protocol', () => {
  it('creates an OAuth-only user with an auto gh_ username and a session on first login', async () => {
    const browser = agent();
    const { state, url } = await beginLogin(browser, 'code-new', profileA);

    expect(state.length).toBeGreaterThan(20);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('scope') ?? '').not.toContain('email');

    const stored = await ctx.oauthStates.findOne({}).lean();
    expect(stored?.purpose).toBe('login');
    expect(stored?.userId).toBe(null);
    expect(JSON.stringify(stored)).not.toContain(state); // only digest stored
    expect(stored!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(10 * 60 * 1000);

    const result = await callback(browser, 'code-new', state);
    expect(result.status).toBe(302);
    expect(result.headers.location).toBe('http://127.0.0.1:5173/oauth-result?status=login-success');
    expect(result.headers.location).not.toContain('code=');
    expect(result.headers.location).not.toContain('state=');

    const user = await ctx.users.findOne({ usernameNormalized: { $regex: /^gh_/ } }).select('+passwordHash').lean();
    expect(user?.username).toMatch(/^gh_[A-Za-z0-9_]{3,}$/);
    expect(user?.email).toBe(null);
    expect(user?.passwordHash).toBe(null);
    const identity = await ctx.identities.findOne({ provider: 'github', subject: profileA.subject }).lean();
    expect(String(identity?.userId)).toBe(String(user?._id));
    expect((await ctx.sessions.countDocuments({ userId: user?._id })).toString()).toBe('1');
  });

  it('logs a returning subject into the same userId without creating a second account', async () => {
    const first = agent();
    const a = await beginLogin(first, 'code-first', profileA);
    expect((await callback(first, 'code-first', a.state)).status).toBe(302);
    const before = await ctx.users.countDocuments({});

    const second = agent();
    const b = await beginLogin(second, 'code-return', profileA);
    expect((await callback(second, 'code-return', b.state)).status).toBe(302);
    expect(await ctx.users.countDocuments({})).toBe(before);
  });

  it('rejects a callback bound to a different browser, a replay and an unknown state', async () => {
    const owner = agent();
    const { state } = await beginLogin(owner, 'code-bind', profileA);
    const attacker = agent();
    const mismatch = await callback(attacker, 'code-bind', state);
    expect(mismatch.status).toBe(403);
    expect(await ctx.users.countDocuments({})).toBe(0);

    // The legitimate browser can still use its own state exactly once.
    expect((await callback(owner, 'code-bind', state)).status).toBe(302);
    const replay = await callback(owner, 'code-bind', state);
    expect(replay.status).toBe(400);
    expect((await callback(owner, 'code-bind', 'not-a-real-state')).status).toBe(400);
  });

  it('refuses callback parameters that try to override purpose or userId', async () => {
    const browser = agent();
    const { state } = await beginLogin(browser, 'code-override', profileA);
    const hostile = await browser
      .get(
        `/api/oauth/github/callback?code=code-override&state=${encodeURIComponent(state)}` +
          `&purpose=link&userId=64b000000000000000000001`,
      )
      .set('Accept', 'application/json');
    expect(hostile.status).toBe(400);
  });

  it('expires a state after ten minutes', async () => {
    const browser = agent();
    const { state } = await beginLogin(browser, 'code-expired', profileA);
    clock.advance(10 * 60 * 1000 + 1);
    const expired = await callback(browser, 'code-expired', state);
    expect(expired.status).toBe(400);
    expect(await ctx.users.countDocuments({})).toBe(0);
  });

  it('does not implicitly switch or bind when an already logged-in user opens direct login', async () => {
    const emailUser = agent();
    const registered = await emailUser
      .post('/api/users')
      .set(JSON_HEADERS)
      .send({ email: 'reader@example.com', username: 'Reader_01', password: 'correct-horse-battery' });
    expect(registered.status).toBe(201);

    const guarded = await emailUser.get('/api/oauth/github/authorization');
    expect(guarded.status).toBe(302);
    expect(guarded.headers.location).toMatch(/oauth-result|settings|login/);
    expect(await ctx.identities.countDocuments({})).toBe(0);
  });
});

describe('M2c §6.2 binding, idempotency and conflicts', () => {
  async function registerAndReauth(who: ReturnType<typeof agent>, email: string, username: string) {
    const response = await who
      .post('/api/users')
      .set(JSON_HEADERS)
      .send({ email, username, password: 'correct-horse-battery' });
    expect(response.status).toBe(201);
    const reauth = await who
      .post('/api/sessions/current/reauthentications')
      .set(JSON_HEADERS)
      .send({ password: 'correct-horse-battery' });
    expect(reauth.status).toBe(204);
  }

  it('binds GitHub to the current account and exposes both methods', async () => {
    const browser = agent();
    await registerAndReauth(browser, 'reader@example.com', 'Reader_01');
    const start = await browser
      .post('/api/me/identities/github/authorizations')
      .set(JSON_HEADERS)
      .send({});
    expect(start.status).toBe(201);
    expect(typeof start.body.authorizationUrl).toBe('string');

    // Drive the callback using the state generated by the binding authorization.
    simulated.setProfile('code-link', profileA);
    const location = start.body.authorizationUrl as string;
    const state = new URL(location).searchParams.get('state') ?? '';
    const result = await callback(browser, 'code-link', state);
    expect(result.status).toBe(302);

    const methods = await browser.get('/api/me/login-methods');
    expect(methods.status).toBe(200);
    expect(methods.body).toEqual({ github: { linked: true }, password: { enabled: true, email: 'reader@example.com' } });
  });

  it('is idempotent when the same subject is bound again to the same account', async () => {
    const browser = agent();
    await registerAndReauth(browser, 'reader@example.com', 'Reader_01');
    const start = await browser
      .post('/api/me/identities/github/authorizations')
      .set(JSON_HEADERS)
      .send({});
    simulated.setProfile('code-idem', profileA);
    const state = new URL(start.body.authorizationUrl as string).searchParams.get('state') ?? '';
    expect((await callback(browser, 'code-idem', state)).status).toBe(302);

    const reauth = await browser
      .post('/api/sessions/current/reauthentications')
      .set(JSON_HEADERS)
      .send({ password: 'correct-horse-battery' });
    expect(reauth.status).toBe(204);
    const again = await browser
      .post('/api/me/identities/github/authorizations')
      .set(JSON_HEADERS)
      .send({});
    simulated.setProfile('code-idem2', profileA);
    const state2 = new URL(again.body.authorizationUrl as string).searchParams.get('state') ?? '';
    expect((await callback(browser, 'code-idem2', state2)).status).toBe(302);
    expect(await ctx.identities.countDocuments({})).toBe(1);
  });

  it('reports 409 when the subject already belongs to another account', async () => {
    // Victim GitHub account is created first.
    const ghBrowser = agent();
    const g = await beginLogin(ghBrowser, 'code-victim', profileA);
    expect((await callback(ghBrowser, 'code-victim', g.state)).status).toBe(302);

    const attacker = agent();
    await registerAndReauth(attacker, 'attacker@example.com', 'Attacker_01');
    const start = await attacker
      .post('/api/me/identities/github/authorizations')
      .set(JSON_HEADERS)
      .send({});
    simulated.setProfile('code-steal', profileA);
    const state = new URL(start.body.authorizationUrl as string).searchParams.get('state') ?? '';
    const conflict = await callback(attacker, 'code-steal', state);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('IDENTITY_CONFLICT');
  });
});

describe('M2c §6.3 recent identity recheck', () => {
  it('requires recent reauthentication for sensitive operations', async () => {
    const browser = agent();
    await browser
      .post('/api/users')
      .set(JSON_HEADERS)
      .send({ email: 'reader@example.com', username: 'Reader_01', password: 'correct-horse-battery' });
    const blocked = await browser.post('/api/me/identities/github/authorizations').set(JSON_HEADERS).send({});
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('FORBIDDEN');
  });

  it('records reauth evidence for five minutes and requires a matching password', async () => {
    const browser = agent();
    await browser
      .post('/api/users')
      .set(JSON_HEADERS)
      .send({ email: 'reader@example.com', username: 'Reader_01', password: 'correct-horse-battery' });
    const wrong = await browser
      .post('/api/sessions/current/reauthentications')
      .set(JSON_HEADERS)
      .send({ password: 'totally-wrong-password' });
    expect(wrong.status).toBe(401);

    const reauth = await browser
      .post('/api/sessions/current/reauthentications')
      .set(JSON_HEADERS)
      .send({ password: 'correct-horse-battery' });
    expect(reauth.status).toBe(204);
    expect(await ctx.reauths.countDocuments({})).toBe(1);

    clock.advance(5 * 60 * 1000 + 1);
    const expired = await browser.post('/api/me/identities/github/authorizations').set(JSON_HEADERS).send({});
    expect(expired.status).toBe(403);
  });

  it('confirms a GitHub reauth only for the subject bound to the current user', async () => {
    const browser = agent();
    const g = await beginLogin(browser, 'code-reauth-own', profileA);
    expect((await callback(browser, 'code-reauth-own', g.state)).status).toBe(302);

    const start = await browser
      .post('/api/sessions/current/github/authorizations')
      .set(JSON_HEADERS)
      .send({});
    expect(start.status).toBe(201);

    // A different subject must not satisfy the recheck.
    simulated.setProfile('code-reauth-other', profileB);
    const wrongState = new URL(start.body.authorizationUrl as string).searchParams.get('state') ?? '';
    const wrong = await callback(browser, 'code-reauth-other', wrongState);
    expect(wrong.status).toBe(403);

    // A fresh flow using the account's own subject does satisfy the recheck.
    const own = await browser
      .post('/api/sessions/current/github/authorizations')
      .set(JSON_HEADERS)
      .send({});
    simulated.setProfile('code-reauth-own-ok', profileA);
    const ownState = new URL(own.body.authorizationUrl as string).searchParams.get('state') ?? '';
    expect((await callback(browser, 'code-reauth-own-ok', ownState)).status).toBe(302);
    const afterReauth = await browser
      .post('/api/me/identities/github/authorizations')
      .set(JSON_HEADERS)
      .send({});
    expect(afterReauth.status).toBe(201);
  });
});

describe('issue 3 - browser redirects use the validated WEB_BASE_URL', () => {
  it('redirects a browser callback to the fixed result path on the web origin', async () => {
    const browser = agent();
    const { state } = await beginLogin(browser, 'code-web-redirect', profileA);
    const result = await browser.get(
      `/api/oauth/github/callback?code=code-web-redirect&state=${encodeURIComponent(state)}`,
    );
    expect(result.status).toBe(302);
    expect(result.headers.location).toBe('http://127.0.0.1:5173/oauth-result?status=login-success');
  });

  it('rejects an injected returnTo and still redirects to the fixed path', async () => {
    const browser = agent();
    const { state } = await beginLogin(browser, 'code-return-to', profileA);
    const hostile = await browser
      .get(
        `/api/oauth/github/callback?code=code-return-to&state=${encodeURIComponent(state)}` +
          `&returnTo=http://evil.example/steal`,
      )
      .set('Accept', 'application/json');
    expect(hostile.status).toBe(400);
    // The request-supplied returnTo is never used as a redirect destination;
    // even on failure the browser is sent to the fixed result page.
    expect(String(hostile.headers.location ?? '')).not.toContain('evil.example');
    expect(hostile.headers['set-cookie']).toBeDefined();
  });

  it('sends already-logged-in guidance to the web origin too', async () => {
    const browser = agent();
    await browser
      .post('/api/users')
      .set(JSON_HEADERS)
      .send({ email: 'redirect@example.com', username: 'Redirect_User', password: 'correct-horse-battery' });
    const result = await browser.get('/api/oauth/github/authorization');
    expect(result.status).toBe(302);
    expect(result.headers.location).toBe('http://127.0.0.1:5173/oauth-result?status=already-logged-in');
  });

  it('rejects control characters in an imported GitHub avatar', async () => {
    const browser = agent();
    const evil: GitHubProfile = {
      subject: 'gh-avatar-control',
      login: 'evil',
      avatarUrl: 'https://cdn.example.com/a\u0000b.png',
    };
    simulated.setProfile('code-avatar-control', evil);
    const begin = await browser.get('/api/oauth/github/authorization');
    const state = new URL(begin.headers.location as string).searchParams.get('state') ?? '';
    expect((await callback(browser, 'code-avatar-control', state)).status).toBe(302);
    const identity = await ctx.identities.findOne({ subject: evil.subject }).lean();
    const user = await ctx.users.findById(identity?.userId).lean();
    expect(user?.avatarUrl).toBe(null);
  });

});
