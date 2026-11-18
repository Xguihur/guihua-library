import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { GITHUB_CLIENT, type GitHubProfile } from '../../src/m2c/github-client';
import { createTestContext, type TestContext } from './helpers/test-app';
import { SimulatedGitHubClient } from './helpers/simulated-github';

/**
 * Real SMTP delivery into a loopback-only Mailpit capture service. The link is
 * read back from the delivered message (not from the API or a mock), then the
 * token in its URL fragment is used to complete verification. GitHub remains a
 * clearly-labelled simulation.
 */
const ORIGIN = 'http://127.0.0.1:5173';
const JSON_HEADERS = { Origin: ORIGIN, 'Content-Type': 'application/json' };
const MAILPIT = 'http://127.0.0.1:8025';
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
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
      SMTP_FROM: 'no-reply@guihua.local',
      MAIL_TIMEOUT_MS: '5000',
      WEB_BASE_URL: 'http://127.0.0.1:5173',
    },
    overrides: [{ token: GITHUB_CLIENT, value: simulated }],
  });
  clock = ctx.app.get('RATE_CLOCK') as typeof clock;
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
  (ctx.app.get('RATE_LIMITER') as { reset(): void }).reset();
  clock.advance(-clock.now() + 1_700_000_000_000);
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
});

function agent() {
  return request.agent(ctx.app.getHttpServer());
}

async function waitForDeliveredToken(to: string): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const list = (await (await fetch(`${MAILPIT}/api/v1/messages`)).json()) as {
      messages?: Array<{ ID: string; To?: Array<{ Address: string }> | string }>;
    };
    const message = list.messages?.find((entry) => {
      const recipients = entry.To;
      if (Array.isArray(recipients)) return recipients.some((recipient) => recipient.Address === to);
      return recipients === to;
    });
    if (message) {
      const detail = (await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json()) as {
        HTML?: string;
        Text?: string;
      };
      const body = `${detail.HTML ?? ''}\n${detail.Text ?? ''}`;
      const match = body.match(/verify-email[^#\s]*#([A-Za-z0-9_-]{20,})/);
      if (match) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('No delivered verification link with a fragment token was captured.');
}

async function makeGithubOnlyUser(browser: ReturnType<typeof agent>, code: string) {
  simulated.setProfile(code, profileA);
  const begin = await browser.get('/api/oauth/github/authorization');
  const state = new URL(begin.headers.location as string).searchParams.get('state') ?? '';
  expect((await browser.get(`/api/oauth/github/callback?code=${code}&state=${encodeURIComponent(state)}`)).status).toBe(302);
  // GitHub users have no password, so recheck through their own GitHub identity.
  const authorize = await browser
    .post('/api/sessions/current/github/authorizations')
    .set(JSON_HEADERS)
    .send({});
  expect(authorize.status).toBe(201);
  simulated.setProfile(`${code}-reauth`, profileA);
  const reauthState = new URL(authorize.body.authorizationUrl as string).searchParams.get('state') ?? '';
  expect(
    (await browser.get(`/api/oauth/github/callback?code=${code}-reauth&state=${encodeURIComponent(reauthState)}`)).status,
  ).toBe(302);
}

describe('M2c §6.4 add password from a captured email', () => {
  it('delivers a real email, then adds a usable email+password login on the same userId', async () => {
    const browser = agent();
    await makeGithubOnlyUser(browser, 'code-add');
    const userId = String((await ctx.identities.findOne({ subject: profileA.subject }).lean())?.userId);

    const requestResult = await browser
      .post('/api/me/password-credentials/verifications')
      .set(JSON_HEADERS)
      .send({ email: ' NewUser@Example.com ' });
    expect(requestResult.status).toBe(202);
    expect(requestResult.body.message).toBe('验证邮件已发送，请到原浏览器完成操作。');

    const token = await waitForDeliveredToken('newuser@example.com');
    expect(token.length).toBeGreaterThan(40);
    const stored = await ctx.emailChallenges.findOne({}).lean();
    expect(stored?.email).toBe('newuser@example.com');
    expect(JSON.stringify(stored)).not.toContain(token); // digest only

    const complete = await browser
      .post('/api/me/password-credentials')
      .set(JSON_HEADERS)
      .send({ token, password: 'a-brand-new-password' });
    expect(complete.status).toBe(204);

    const user = await ctx.users.findById(userId).select('+passwordHash').lean();
    expect(user?.email).toBe('newuser@example.com');
    expect(user?.emailVerifiedAt).toBeTruthy();
    expect(user?.passwordHash).toMatch(/^scrypt\$/);

    const fresh = agent();
    const login = await fresh
      .post('/api/sessions')
      .set(JSON_HEADERS)
      .send({ identifier: 'newuser@example.com', password: 'a-brand-new-password' });
    expect(login.status).toBe(201);
    expect(login.body.user.id).toBe(userId);
  });

  it('confirms an existing email with {token} only and never overwrites the password', async () => {
    const browser = agent();
    const registered = await browser
      .post('/api/users')
      .set(JSON_HEADERS)
      .send({ email: 'reader@example.com', username: 'Reader_01', password: 'correct-horse-battery' });
    const userId = registered.body.id as string;
    const originalHash = String(
      (await ctx.users.findById(userId).select('+passwordHash').lean())?.passwordHash,
    );

    const reauth = await browser
      .post('/api/sessions/current/reauthentications')
      .set(JSON_HEADERS)
      .send({ password: 'correct-horse-battery' });
    expect(reauth.status).toBe(204);

    const requestResult = await browser
      .post('/api/me/password-credentials/verifications')
      .set(JSON_HEADERS)
      .send({ email: 'reader@example.com' });
    expect(requestResult.status).toBe(202);
    const token = await waitForDeliveredToken('reader@example.com');

    // A password supplied on this branch is rejected; this branch is verification only.
    const withPassword = await browser
      .post('/api/me/password-credentials')
      .set(JSON_HEADERS)
      .send({ token, password: 'attempted-overwrite' });
    expect(withPassword.status).toBe(400);

    const complete = await browser
      .post('/api/me/password-credentials')
      .set(JSON_HEADERS)
      .send({ token });
    expect(complete.status).toBe(204);
    const user = await ctx.users.findById(userId).select('+passwordHash').lean();
    expect(user?.passwordHash).toBe(originalHash);
    expect(user?.emailVerifiedAt).toBeTruthy();
  });

  it('rejects a replayed token and a different browser/session', async () => {
    const browser = agent();
    await makeGithubOnlyUser(browser, 'code-replay');
    await browser
      .post('/api/me/password-credentials/verifications')
      .set(JSON_HEADERS)
      .send({ email: 'replay@example.com' });
    const token = await waitForDeliveredToken('replay@example.com');

    // A different browser with its own valid session still cannot use the token.
    const otherBrowser = agent();
    await otherBrowser
      .post('/api/users')
      .set(JSON_HEADERS)
      .send({ email: 'other@example.com', username: 'Other_01', password: 'correct-horse-battery' });
    const otherReauth = await otherBrowser
      .post('/api/sessions/current/reauthentications')
      .set(JSON_HEADERS)
      .send({ password: 'correct-horse-battery' });
    expect(otherReauth.status).toBe(204);
    const cross = await otherBrowser
      .post('/api/me/password-credentials')
      .set(JSON_HEADERS)
      .send({ token, password: 'a-brand-new-password' });
    expect(cross.status).toBe(400);

    const complete = await browser
      .post('/api/me/password-credentials')
      .set(JSON_HEADERS)
      .send({ token, password: 'a-brand-new-password' });
    expect(complete.status).toBe(204);
    const replay = await browser
      .post('/api/me/password-credentials')
      .set(JSON_HEADERS)
      .send({ token, password: 'a-brand-new-password' });
    expect(replay.status).toBe(400);
  });

  it('returns 409 when the email belongs to another account and never binds it', async () => {
    const owner = agent();
    await owner
      .post('/api/users')
      .set(JSON_HEADERS)
      .send({ email: 'taken@example.com', username: 'Owner_01', password: 'correct-horse-battery' });

    const browser = agent();
    await makeGithubOnlyUser(browser, 'code-taken');
    const requestResult = await browser
      .post('/api/me/password-credentials/verifications')
      .set(JSON_HEADERS)
      .send({ email: 'taken@example.com' });
    expect(requestResult.status).toBe(202);

    const token = await waitForDeliveredToken('taken@example.com');
    const complete = await browser
      .post('/api/me/password-credentials')
      .set(JSON_HEADERS)
      .send({ token, password: 'a-brand-new-password' });
    expect(complete.status).toBe(409);
    expect(complete.body.error.code).toBe('IDENTITY_CONFLICT');
    expect((await ctx.users.findOne({ email: 'taken@example.com' }).select('+passwordHash').lean())?.passwordHash).toMatch(
      /^scrypt\$/,
    );
  });
});
