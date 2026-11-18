import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestContext, type TestContext } from './helpers/test-app';

const ORIGIN = 'http://127.0.0.1:5173';
const JSON_HEADERS = { Origin: ORIGIN, 'Content-Type': 'application/json' };

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
  // Test-only hook (string token) so each case gets a fresh limiter window.
  // Tolerated while the implementation is absent so RED still shows HTTP 404s.
  try {
    (ctx.app.get('RATE_LIMITER') as { reset(): void }).reset();
  } catch {
    /* not implemented yet */
  }
});

function register(body: Record<string, unknown>) {
  return request(ctx.app.getHttpServer()).post('/api/users').set(JSON_HEADERS).send(body);
}

describe('M2a registration contract', () => {
  it('creates a user, an opaque session and a leak-free UserPublic DTO', async () => {
    const response = await register({ email: 'Reader@Example.com ', username: ' Reader_01 ', password: 'correct-horse-battery' });
    expect(response.status).toBe(201);

    const keys = Object.keys(response.body).sort();
    expect(keys).toEqual(['avatarUrl', 'createdAt', 'gender', 'id', 'signature', 'username']);
    expect(response.body.username).toBe('Reader_01');
    expect(response.body.gender).toBe('unspecified');
    expect(response.body.avatarUrl).toBe(null);
    expect(response.body.signature).toBe('');
    expect(new Date(response.body.createdAt).toISOString()).toBe(response.body.createdAt);

    const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
    expect(cookies?.[0]).toMatch(/^guihua_session=/);
    expect(cookies?.[0]).toMatch(/HttpOnly/);
    expect(cookies?.[0]).toMatch(/SameSite=Lax/);
    expect(cookies?.[0]).toMatch(/Path=\//);
    expect(cookies?.[0]).toMatch(/Max-Age=604800/);
    expect(cookies?.[0]).not.toMatch(/Domain=/);

    const stored = await ctx.users.findOne({ usernameNormalized: 'reader_01' }).select('+passwordHash').lean();
    expect(stored?.email).toBe('reader@example.com');
    expect(stored?.passwordHash).toMatch(/^scrypt\$/);
    expect(stored?.passwordHash).not.toContain('correct-horse-battery');
    expect(stored?.enabled).toBe(true);

    const session = await ctx.sessions.findOne({ userId: stored?._id }).lean();
    const rawToken = decodeURIComponent((cookies?.[0] ?? '').split(';')[0].split('=').slice(1).join('='));
    expect(session?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(session?.tokenHash).not.toBe(rawToken);
    expect(rawToken.length).toBeGreaterThanOrEqual(43);
  });

  it('maps duplicate normalized email and username to 409 IDENTITY_CONFLICT', async () => {
    const first = await register({ email: 'one@example.com', username: 'Reader_One', password: 'correct-horse-battery' });
    expect(first.status).toBe(201);

    const sameEmail = await register({ email: ' ONE@example.com ', username: 'Reader_Two', password: 'correct-horse-battery' });
    expect(sameEmail.status).toBe(409);
    expect(sameEmail.body.error.code).toBe('IDENTITY_CONFLICT');

    const sameName = await register({ email: 'two@example.com', username: 'reader_ONE', password: 'correct-horse-battery' });
    expect(sameName.status).toBe(409);
    expect(sameName.body.error.code).toBe('IDENTITY_CONFLICT');
  });

  it('rejects invalid usernames with the dedicated 400 INVALID_USERNAME code', async () => {
    const response = await register({ email: 'three@example.com', username: '中文用户', password: 'correct-horse-battery' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_USERNAME');
    expect(response.body.error.details).toContainEqual({ field: 'username', reason: 'invalid_username' });
  });

  it('rejects unknown and sensitive fields instead of ignoring them', async () => {
    for (const extra of ['roles', 'role', 'userId', 'passwordHash', 'id', 'enabled']) {
      // Each probe is its own rate-limit window; only the field check is under test.
      (ctx.app.get('RATE_LIMITER') as { reset(): void }).reset();
      const response = await register({
        email: 'sensitive@example.com',
        username: 'Reader_OK',
        password: 'correct-horse-battery',
        [extra]: 'injected',
      });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('enforces the precise Origin whitelist and JSON Content-Type on writes', async () => {
    const body = { email: 'csrf@example.com', username: 'Reader_CSRF', password: 'correct-horse-battery' };
    for (const origin of [undefined, 'null', 'https://evil.example']) {
      const req = request(ctx.app.getHttpServer()).post('/api/users').set('Content-Type', 'application/json');
      if (origin) req.set('Origin', origin);
      const response = await req.send(body);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
    const wrongType = await request(ctx.app.getHttpServer())
      .post('/api/users')
      .set('Origin', ORIGIN)
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(body));
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('counts rejected registrations against the per-IP limit before body parsing', async () => {
    const send = () =>
      request(ctx.app.getHttpServer())
        .post('/api/users')
        .set(JSON_HEADERS)
        .send({ email: 'rl@example.com', username: 'RL_Bad', password: 'correct-horse-battery', roles: ['admin'] });
    for (let i = 0; i < 5; i += 1) {
      const response = await send();
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    const limited = await send();
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });

  it('rejects a lookalike media type such as application/json-evil', async () => {
    const wrongType = await request(ctx.app.getHttpServer())
      .post('/api/users')
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json-evil')
      .send(JSON.stringify({ email: 'media@example.com', username: 'Media_User', password: 'correct-horse-battery' }));
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.error.code).toBe('VALIDATION_ERROR');

    const accepted = await request(ctx.app.getHttpServer())
      .post('/api/users')
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json; charset=utf-8')
      .send(JSON.stringify({ email: 'media2@example.com', username: 'Media_Two', password: 'correct-horse-battery' }));
    expect(accepted.status).toBe(201);
  });

});
