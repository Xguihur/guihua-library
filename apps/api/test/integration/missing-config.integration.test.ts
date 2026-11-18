import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestContext, type TestContext } from './helpers/test-app';

const ORIGIN = 'http://127.0.0.1:5173';
const JSON_HEADERS = { Origin: ORIGIN, 'Content-Type': 'application/json' };

/** Missing optional external config must not disable the rest of the app. */
describe('M2c §6.5 missing external configuration', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    // Explicitly empty: the application must boot without GitHub/SMTP secrets.
    ctx = await createTestContext({ env: { GITHUB_CLIENT_ID: '', GITHUB_CLIENT_SECRET: '', SMTP_HOST: '' } });
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    (ctx.app.get('RATE_LIMITER') as { reset(): void }).reset();
  });

  it('keeps health, registration and login fully working', async () => {
    expect((await request(ctx.app.getHttpServer()).get('/api/health/live')).status).toBe(200);
    const registered = await request(ctx.app.getHttpServer())
      .post('/api/users')
      .set(JSON_HEADERS)
      .send({ email: 'reader@example.com', username: 'Reader_01', password: 'correct-horse-battery' });
    expect(registered.status).toBe(201);
    const login = await request(ctx.app.getHttpServer())
      .post('/api/sessions')
      .set(JSON_HEADERS)
      .send({ identifier: 'reader@example.com', password: 'correct-horse-battery' });
    expect(login.status).toBe(201);
  });

  it('returns a masked 503 for GitHub entry points without credentials', async () => {
    const anonymous = await request(ctx.app.getHttpServer()).get('/api/oauth/github/authorization');
    expect(anonymous.status).toBe(503);
    expect(anonymous.body.error.code).toBe('SERVICE_UNAVAILABLE');

    const loggedIn = request.agent(ctx.app.getHttpServer());
    await loggedIn
      .post('/api/users')
      .set(JSON_HEADERS)
      .send({ email: 'reader@example.com', username: 'Reader_01', password: 'correct-horse-battery' });
    const reauth = await loggedIn
      .post('/api/sessions/current/reauthentications')
      .set(JSON_HEADERS)
      .send({ password: 'correct-horse-battery' });
    expect(reauth.status).toBe(204);
    const bind = await loggedIn
      .post('/api/me/identities/github/authorizations')
      .set(JSON_HEADERS)
      .send({});
    expect(bind.status).toBe(503);
  });

  it('returns a masked 503 for mail entries without SMTP and leaves no usable challenge', async () => {
    const browser = request.agent(ctx.app.getHttpServer());
    await browser
      .post('/api/users')
      .set(JSON_HEADERS)
      .send({ email: 'reader@example.com', username: 'Reader_01', password: 'correct-horse-battery' });
    await browser
      .post('/api/sessions/current/reauthentications')
      .set(JSON_HEADERS)
      .send({ password: 'correct-horse-battery' });

    const send = await browser
      .post('/api/me/password-credentials/verifications')
      .set(JSON_HEADERS)
      .send({ email: 'reader@example.com' });
    expect(send.status).toBe(503);
    expect(send.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(await ctx.emailChallenges.countDocuments({})).toBe(0);
  });

  it('requires Origin and JSON for the new write endpoints', async () => {
    const browser = request.agent(ctx.app.getHttpServer());
    await browser
      .post('/api/users')
      .set(JSON_HEADERS)
      .send({ email: 'reader@example.com', username: 'Reader_01', password: 'correct-horse-battery' });
    const noOrigin = await browser
      .post('/api/sessions/current/reauthentications')
      .set('Content-Type', 'application/json')
      .send({ password: 'correct-horse-battery' });
    expect(noOrigin.status).toBe(403);
    const badContentType = await browser
      .post('/api/sessions/current/reauthentications')
      .set('Origin', ORIGIN)
      .set('Content-Type', 'text/plain')
      .send('password=correct-horse-battery');
    expect(badContentType.status).toBe(400);
  });
});
