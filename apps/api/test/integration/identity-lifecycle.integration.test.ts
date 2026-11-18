import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { GITHUB_CLIENT, type GitHubProfile } from '../../src/m2c/github-client';
import { createTestContext, type TestContext } from './helpers/test-app';
import { SimulatedGitHubClient } from './helpers/simulated-github';

const ORIGIN = 'http://127.0.0.1:5173';
const JSON_HEADERS = { Origin: ORIGIN, 'Content-Type': 'application/json' };
const profileA: GitHubProfile = { subject: 'gh-subject-A', login: 'alice', avatarUrl: null };

let ctx: TestContext;
let simulated: SimulatedGitHubClient;
let clock: { advance(ms: number): void; now(): number };

beforeAll(async () => {
  simulated = new SimulatedGitHubClient();
  ctx = await createTestContext({
    env: {
      GITHUB_CLIENT_ID: 'test-client-id',
      GITHUB_CLIENT_SECRET: 'test-client-secret',
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

function agent() {
  return request.agent(ctx.app.getHttpServer());
}

async function registerVerified(browser: ReturnType<typeof agent>, email = 'reader@example.com') {
  const response = await browser
    .post('/api/users')
    .set(JSON_HEADERS)
    .send({ email, username: 'Reader_01', password: 'correct-horse-battery' });
  expect(response.status).toBe(201);
  await ctx.users.updateOne({ email }, { $set: { emailVerifiedAt: new Date() } });
  return response;
}

async function reauth(browser: ReturnType<typeof agent>) {
  const result = await browser
    .post('/api/sessions/current/reauthentications')
    .set(JSON_HEADERS)
    .send({ password: 'correct-horse-battery' });
  expect(result.status).toBe(204);
}

async function linkGithub(browser: ReturnType<typeof agent>, code: string) {
  const start = await browser.post('/api/me/identities/github/authorizations').set(JSON_HEADERS).send({});
  expect(start.status).toBe(201);
  simulated.setProfile(code, profileA);
  const state = new URL(start.body.authorizationUrl as string).searchParams.get('state') ?? '';
  const callback = await browser
    .get(`/api/oauth/github/callback?code=${code}&state=${encodeURIComponent(state)}`)
    .set('Accept', 'application/json');
  expect(callback.status).toBe(302);
}

describe('M2c §6.3 login methods and safe unlink', () => {
  it('shows login methods only to the owner and never leaks a subject or hash', async () => {
    const browser = agent();
    await registerVerified(browser);

    const anonymous = await request(ctx.app.getHttpServer()).get('/api/me/login-methods');
    expect(anonymous.status).toBe(401);

    const methods = await browser.get('/api/me/login-methods');
    expect(methods.status).toBe(200);
    expect(Object.keys(methods.body).sort()).toEqual(['github', 'password']);
    expect(methods.body.github.linked).toBe(false);
    expect(methods.body.password).toEqual({ enabled: true, email: 'reader@example.com' });
  });

  it('unlinks GitHub after reauth with a verified email + password, and the old subject no longer logs in', async () => {
    const browser = agent();
    await registerVerified(browser);
    await reauth(browser);
    await linkGithub(browser, 'code-link-then-unlink');

    await reauth(browser);
    const unlink = await browser.delete('/api/me/identities/github').set(JSON_HEADERS);
    expect(unlink.status).toBe(204);
    expect(await ctx.identities.countDocuments({})).toBe(0);

    // Password still logs into the same immutable userId.
    const fresh = agent();
    const login = await fresh
      .post('/api/sessions')
      .set(JSON_HEADERS)
      .send({ identifier: 'reader@example.com', password: 'correct-horse-battery' });
    expect(login.status).toBe(201);

    // The unlinked subject now creates a brand-new account instead of reusing it.
    const gh = agent();
    simulated.setProfile('code-after-unlink', profileA);
    const begin = await gh.get('/api/oauth/github/authorization');
    const state = new URL(begin.headers.location as string).searchParams.get('state') ?? '';
    expect(
      (await gh.get(`/api/oauth/github/callback?code=code-after-unlink&state=${encodeURIComponent(state)}`)).status,
    ).toBe(302);
    expect(await ctx.users.countDocuments({})).toBe(2);
  });

  it('refuses to unlink when no verified email + password fallback exists (last method)', async () => {
    const browser = agent();
    const begin = await browser.get('/api/oauth/github/authorization');
    const state = new URL(begin.headers.location as string).searchParams.get('state') ?? '';
    simulated.setProfile('code-oauth-only', profileA);
    expect(
      (await browser.get(`/api/oauth/github/callback?code=code-oauth-only&state=${encodeURIComponent(state)}`)).status,
    ).toBe(302);

    // Reauth via GitHub itself, then attempt unlink: still no verified-email fallback.
    const reauthorize = await browser
      .post('/api/sessions/current/github/authorizations')
      .set(JSON_HEADERS)
      .send({});
    simulated.setProfile('code-reauth-unlink', profileA);
    const reauthState = new URL(reauthorize.body.authorizationUrl as string).searchParams.get('state') ?? '';
    expect(
      (await browser.get(`/api/oauth/github/callback?code=code-reauth-unlink&state=${encodeURIComponent(reauthState)}`)).status,
    ).toBe(302);

    const unlink = await browser.delete('/api/me/identities/github').set(JSON_HEADERS);
    expect(unlink.status).toBe(409);
    expect(unlink.body.error.code).toBe('LAST_LOGIN_METHOD');
    expect(await ctx.identities.countDocuments({})).toBe(1);
  });

  it('is idempotent when unlinking an account that has no GitHub binding', async () => {
    const browser = agent();
    await registerVerified(browser);
    await reauth(browser);
    const unlink = await browser.delete('/api/me/identities/github').set(JSON_HEADERS);
    expect(unlink.status).toBe(204);
  });
});

describe('M2c §6.3 session rotation on credential change', () => {
  it('revokes other sessions, rotates the current token and clears reauth evidence', async () => {
    const browser = agent();
    await registerVerified(browser);
    const other = agent();
    const otherLogin = await other
      .post('/api/sessions')
      .set(JSON_HEADERS)
      .send({ identifier: 'reader@example.com', password: 'correct-horse-battery' });
    expect(otherLogin.status).toBe(201);

    const before = await browser.get('/api/me/login-methods');
    expect(before.status).toBe(200);

    await reauth(browser);
    const start = await browser
      .post('/api/me/identities/github/authorizations')
      .set(JSON_HEADERS)
      .send({});
    simulated.setProfile('code-rotate', profileA);
    const state = new URL(start.body.authorizationUrl as string).searchParams.get('state') ?? '';
    expect(
      (await browser.get(`/api/oauth/github/callback?code=code-rotate&state=${encodeURIComponent(state)}`)).status,
    ).toBe(302);

    // The old second session is gone; the browser that performed the change stays logged in.
    expect((await other.get('/api/sessions/current')).status).toBe(401);
    expect((await browser.get('/api/me/login-methods')).status).toBe(200);
    // Reauth evidence was cleared by the credential change.
    expect(await ctx.reauths.countDocuments({})).toBe(0);
  });

  it('rejects extra business fields on unlink', async () => {
    const browser = agent();
    await registerVerified(browser, 'unlink-fields@example.com');
    await reauth(browser);
    const response = await browser
      .delete('/api/me/identities/github')
      .set(JSON_HEADERS)
      .send({ provider: 'github', force: true });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

});
