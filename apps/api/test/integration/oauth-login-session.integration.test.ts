import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { OAUTH_COOKIE_NAME, SESSION_COOKIE_NAME } from '@guihua/contracts';
import { GITHUB_CLIENT, type GitHubProfile } from '../../src/m2c/github-client';
import { createTestContext, type TestContext } from './helpers/test-app';
import { SimulatedGitHubClient } from './helpers/simulated-github';

/**
 * M2 independent-review F / issue 2: a login flow opened anonymously must be
 * rejected if a valid session appears before the callback. It must never
 * silently switch accounts, bind GitHub, or clear the newly created session.
 */
const ORIGIN = 'http://127.0.0.1:5173';
const JSON_HEADERS = { Origin: ORIGIN, 'Content-Type': 'application/json' };
const profileA: GitHubProfile = { subject: 'gh-switch-A', login: 'alice', avatarUrl: null };

let ctx: TestContext;
let simulated: SimulatedGitHubClient;

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
      WEB_BASE_URL: 'http://127.0.0.1:5173',
    },
    overrides: [{ token: GITHUB_CLIENT, value: simulated }],
  });
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
  (ctx.app.get('RATE_LIMITER') as { reset(): void }).reset();
});

function namedCookie(response: request.Response, name: string): string {
  const all = (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  return (all.find((value) => value.startsWith(`${name}=`)) ?? '').split(';')[0] ?? '';
}

function cookies(...parts: string[]): string {
  return parts.filter(Boolean).join('; ');
}

describe('issue 2 - OAuth login never switches an already logged-in account', () => {
  it('rejects the callback when the browser logged in as another user mid-flow', async () => {
    // B registers first and keeps a password session aside.
    const registration = await request(ctx.app.getHttpServer())
      .post('/api/users')
      .set(JSON_HEADERS)
      .send({ email: 'account-b@example.com', username: 'Account_B', password: 'correct-horse-battery' });
    expect(registration.status).toBe(201);

    // An anonymous tab opens the GitHub login flow.
    simulated.setProfile('code-switch', profileA);
    const begin = await request(ctx.app.getHttpServer()).get('/api/oauth/github/authorization');
    expect(begin.status).toBe(302);
    const state = new URL(begin.headers.location as string).searchParams.get('state') ?? '';
    const oauthCookie = namedCookie(begin, OAUTH_COOKIE_NAME);

    // While the flow is open, that browser logs in as B.
    const login = await request(ctx.app.getHttpServer())
      .post('/api/sessions')
      .set(JSON_HEADERS)
      .send({ identifier: 'account-b@example.com', password: 'correct-horse-battery' });
    expect(login.status).toBe(201);
    const sessionB = namedCookie(login, SESSION_COOKIE_NAME);

    const sessionsBefore = await ctx.sessions.countDocuments({});
    const callback = await request(ctx.app.getHttpServer())
      .get(`/api/oauth/github/callback?code=code-switch&state=${encodeURIComponent(state)}`)
      .set('Accept', 'application/json')
      .set('Cookie', cookies(oauthCookie, sessionB));
    expect(callback.status).toBe(403);
    expect(callback.body.error.code).toBe('FORBIDDEN');

    // B is still the logged-in identity; nothing was bound or created.
    const current = await request(ctx.app.getHttpServer())
      .get('/api/sessions/current')
      .set('Cookie', sessionB);
    expect(current.status).toBe(200);
    expect(current.body.user.username).toBe('Account_B');
    expect(await ctx.users.countDocuments({})).toBe(1);
    expect(await ctx.identities.countDocuments({})).toBe(0);
    // The rejected callback created no session and cleared nothing.
    expect(await ctx.sessions.countDocuments({})).toBe(sessionsBefore);
  });

  it('does not switch accounts when a stale flow-finishing cookie belongs to another user', async () => {
    const owner = await request(ctx.app.getHttpServer())
      .post('/api/users')
      .set(JSON_HEADERS)
      .send({ email: 'owner@example.com', username: 'Owner_One', password: 'correct-horse-battery' });
    expect(owner.status).toBe(201);
    const other = await request(ctx.app.getHttpServer())
      .post('/api/users')
      .set(JSON_HEADERS)
      .send({ email: 'other@example.com', username: 'Other_Two', password: 'correct-horse-battery' });
    expect(other.status).toBe(201);

    // Start a link flow as the owner, then try to finish it with another
    // account's valid session: the original-session binding must still reject.
    const reauth = await request(ctx.app.getHttpServer())
      .post('/api/sessions/current/reauthentications')
      .set(JSON_HEADERS)
      .set('Cookie', namedCookie(owner, SESSION_COOKIE_NAME))
      .send({ password: 'correct-horse-battery' });
    expect(reauth.status).toBe(204);
    const start = await request(ctx.app.getHttpServer())
      .post('/api/me/identities/github/authorizations')
      .set(JSON_HEADERS)
      .set('Cookie', namedCookie(owner, SESSION_COOKIE_NAME))
      .send({});
    expect(start.status).toBe(201);
    const state = new URL(start.body.authorizationUrl as string).searchParams.get('state') ?? '';
    const oauthCookie = namedCookie(start, OAUTH_COOKIE_NAME);

    simulated.setProfile('code-cross', profileA);
    const callback = await request(ctx.app.getHttpServer())
      .get(`/api/oauth/github/callback?code=cross&state=${encodeURIComponent(state)}`)
      .set('Accept', 'application/json')
      .set('Cookie', cookies(namedCookie(other, SESSION_COOKIE_NAME), oauthCookie));
    expect(callback.status).toBe(403);
    expect(await ctx.identities.countDocuments({})).toBe(0);
  });
});
