import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { OAUTH_COOKIE_NAME, SESSION_COOKIE_NAME } from '@guihua/contracts';
import { Types } from 'mongoose';
import { PASSWORD_HASHER } from '../../src/common/password';
import { digest } from '../../src/m2c/digest';
import { GITHUB_CLIENT, type GitHubProfile } from '../../src/m2c/github-client';
import { MailService } from '../../src/m2c/mail.service';
import { createTestContext, type TestContext } from './helpers/test-app';
import { GatedGitHubClient, GatedHasher, GatedMailService } from './helpers/controllable-dependencies';

/**
 * M2 independent-review F / issue 4: exactly one challenge per user, created
 * atomically, activated only after a successful send, and revoked only for the
 * token whose send failed. All cases drive the real HTTP endpoints + MongoDB;
 * the mailer is a pausable/failable test double standing in for SMTP.
 */
const ORIGIN = 'http://127.0.0.1:5173';
const JSON_HEADERS = { Origin: ORIGIN, 'Content-Type': 'application/json' };
const profile: GitHubProfile = { subject: 'gh-challenge-race', login: 'challenger', avatarUrl: null };

let ctx: TestContext;
let mail: GatedMailService;
let github: GatedGitHubClient;
let hasher: GatedHasher;
let clock: { advance(ms: number): void; now(): number };

beforeAll(async () => {
  mail = new GatedMailService();
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
      { token: MailService, value: mail },
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
  mail.sendGate.open();
  github.exchangeGate.open();
  hasher.hashGate.open();
  hasher.verifyGate.open();
  mail.sendStarted = 0;
  github.exchangeStarted = 0;
  hasher.hashStarted = 0;
  hasher.verifyStarted = 0;
  mail.failNext = false;
  mail.sent.length = 0;
});

async function waitForEntry(read: () => number): Promise<void> {
  await vi.waitFor(() => expect(read()).toBeGreaterThanOrEqual(1), { timeout: 15_000, interval: 25 });
}

function sessionCookie(response: request.Response): string {
  const all = (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  return (all.find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`)) ?? '').split(';')[0] ?? '';
}

async function registerVerified(): Promise<string> {
  const response = await request(ctx.app.getHttpServer())
    .post('/api/users')
    .set(JSON_HEADERS)
    .send({ email: 'challenge@example.com', username: 'Challenge_User', password: 'correct-horse-battery' });
  expect(response.status).toBe(201);
  await ctx.users.updateOne({ email: 'challenge@example.com' }, { $set: { emailVerifiedAt: new Date() } });
  return sessionCookie(response);
}

async function reauth(cookie: string): Promise<void> {
  const response = await request(ctx.app.getHttpServer())
    .post('/api/sessions/current/reauthentications')
    .set(JSON_HEADERS)
    .set('Cookie', cookie)
    .send({ password: 'correct-horse-battery' });
  expect(response.status).toBe(204);
}

function ask(cookie: string, email = 'challenge@example.com') {
  return request(ctx.app.getHttpServer())
    .post('/api/me/password-credentials/verifications')
    .set(JSON_HEADERS)
    .set('Cookie', cookie)
    .send({ email });
}

function complete(cookie: string, token: string) {
  return request(ctx.app.getHttpServer())
    .post('/api/me/password-credentials')
    .set(JSON_HEADERS)
    .set('Cookie', cookie)
    .send({ token });
}

function completeAdd(cookie: string, token: string, password: string) {
  return request(ctx.app.getHttpServer())
    .post('/api/me/password-credentials')
    .set(JSON_HEADERS)
    .set('Cookie', cookie)
    .send({ token, password });
}

function namedCookie(response: request.Response, name: string): string {
  const all = (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  return (all.find((value) => value.startsWith(`${name}=`)) ?? '').split(';')[0] ?? '';
}

/** Real HTTP GitHub login (simulated upstream) producing an OAuth-only user. */
async function githubLogin(code: string): Promise<{ cookie: string; userId: string }> {
  github.setProfile(code, profile);
  const begin = await request(ctx.app.getHttpServer()).get('/api/oauth/github/authorization');
  expect(begin.status).toBe(302);
  const state = new URL(begin.headers.location as string).searchParams.get('state') ?? '';
  const oauthCookie = namedCookie(begin, OAUTH_COOKIE_NAME);
  const result = await request(ctx.app.getHttpServer())
    .get(`/api/oauth/github/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`)
    .set('Cookie', oauthCookie);
  expect(result.status).toBe(302);
  const identity = await ctx.identities.findOne({ subject: profile.subject }).lean();
  return { cookie: namedCookie(result, SESSION_COOKIE_NAME), userId: String(identity?.userId) };
}

describe('issue 4 - one atomic, activation-gated challenge per user', () => {
  it('leaves exactly one usable challenge under concurrent requests', async () => {
    const cookie = await registerVerified();
    await reauth(cookie);

    const [first, second] = await Promise.all([
      ask(cookie).then((res) => res),
      ask(cookie).then((res) => res),
    ]);
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(mail.sent).toHaveLength(2);

    // No deleteMany/create interleaving may leave more than one row.
    expect(await ctx.emailChallenges.countDocuments({})).toBe(1);
    const row = await ctx.emailChallenges.findOne({}).lean();
    const live = mail.sent.find((entry) => digest(entry.token) === row?.tokenHash)?.token ?? '';
    const dead = mail.sent.find((entry) => entry.token !== live)?.token ?? '';
    expect(live).toBeTruthy();
    expect(dead).toBeTruthy();

    expect((await complete(cookie, dead)).status).toBe(400);
    expect((await complete(cookie, live)).status).toBe(204);
  });

  it('leaves no usable challenge when the send fails', async () => {
    const cookie = await registerVerified();
    await reauth(cookie);
    mail.failNext = true;

    const result = await ask(cookie);
    expect(result.status).toBe(503);
    expect(await ctx.emailChallenges.countDocuments({})).toBe(0);
  });

  it('cannot consume the link while the email is still being sent', async () => {
    const cookie = await registerVerified();
    await reauth(cookie);
    mail.sendGate.arm();
    const pending = ask(cookie).then((res) => res);
    await waitForEntry(() => mail.sendStarted);

    const token = mail.sent[0]?.token ?? '';
    const early = await complete(cookie, token);
    expect(early.status).toBe(400);

    mail.sendGate.open();
    expect((await pending).status).toBe(202);
    expect((await complete(cookie, token)).status).toBe(204);
  });

  it('invalidates the previous link when a newer request replaces the slot', async () => {
    const cookie = await registerVerified();
    await reauth(cookie);
    expect((await ask(cookie)).status).toBe(202);
    const oldToken = mail.sent[0]?.token ?? '';
    expect((await ask(cookie)).status).toBe(202);
    const newToken = mail.sent[1]?.token ?? '';

    expect(await ctx.emailChallenges.countDocuments({})).toBe(1);
    expect((await complete(cookie, oldToken)).status).toBe(400);
    expect((await complete(cookie, newToken)).status).toBe(204);
  });
});

describe('issue F2 - consume must match the immutable token, never just the slot _id', () => {
  it('rejects an old token whose slot was replaced during scrypt and keeps the new challenge usable', async () => {
    // OAuth-only user: completion runs the slow scrypt hash (add mode), which
    // is exactly the window where a newer request may replace the slot.
    const { cookie, userId } = await githubLogin('code-challenge-race');
    const sessionHash = digest(decodeURIComponent(cookie.split('=').slice(1).join('=')));
    await ctx.reauths.create({
      sessionHash,
      userId: new Types.ObjectId(userId),
      purpose: 'sensitive',
      expiresAt: new Date(clock.now() + 5 * 60 * 1000),
    });

    expect((await ask(cookie, 'add-old@example.com')).status).toBe(202);
    const oldToken = mail.sent[0]?.token ?? '';

    hasher.hashGate.arm();
    const pending = completeAdd(cookie, oldToken, 'a-brand-new-password').then((res) => res);
    await waitForEntry(() => hasher.hashStarted);

    // While the old request is parked inside scrypt, a newer verification
    // request replaces the SAME slot (same _id) with a fresh challenge.
    expect((await ask(cookie, 'add-new@example.com')).status).toBe(202);
    const newToken = mail.sent[1]?.token ?? '';
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(oldToken);

    hasher.hashGate.open();
    const result = await pending;

    // The old token must NOT have consumed the new challenge: it is 400, and
    // nothing was written with the old challenge's email/mode.
    expect(result.status).toBe(400);
    const untouched = await ctx.users.findById(userId).select('+passwordHash').lean();
    expect(untouched?.email).toBe(null);
    expect(untouched?.passwordHash).toBe(null);
    expect((await ctx.emailChallenges.findOne({ tokenHash: digest(newToken) }).lean())?.consumedAt).toBe(null);

    // The newer challenge is still usable exactly once.
    expect((await completeAdd(cookie, newToken, 'a-brand-new-password')).status).toBe(204);
    const after = await ctx.users.findById(userId).select('+passwordHash').lean();
    expect(after?.email).toBe('add-new@example.com');
    expect(after?.passwordHash).toMatch(/^scrypt\$/);
    expect(after?.emailVerifiedAt).not.toBe(null);
    expect(await ctx.emailChallenges.countDocuments({ consumedAt: null })).toBe(0);
  });
});
