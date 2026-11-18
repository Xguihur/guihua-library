import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestContext, type TestContext } from './helpers/test-app';

const ORIGIN = 'http://127.0.0.1:5173';
const JSON_HEADERS = { Origin: ORIGIN, 'Content-Type': 'application/json' };
const LOGIN_IP_LIMIT = 30;

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
  try {
    (ctx.app.get('RATE_LIMITER') as { reset(): void }).reset();
  } catch {
    /* not implemented yet */
  }
});

describe('M2a registration rate limit', () => {
  it('allows five attempts per IP per 15 minutes and then returns 429 with Retry-After', async () => {
    for (let i = 0; i < 5; i += 1) {
      const response = await request(ctx.app.getHttpServer())
        .post('/api/users')
        .set(JSON_HEADERS)
        .send({ email: `rl${i}@example.com`, username: `RL_User_${i}`, password: 'correct-horse-battery' });
      expect(response.status).toBe(201);
    }
    const sixth = await request(ctx.app.getHttpServer())
      .post('/api/users')
      .set(JSON_HEADERS)
      .send({ email: 'rl5@example.com', username: 'RL_User_5', password: 'correct-horse-battery' });
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe('RATE_LIMITED');
    expect(Number(sixth.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('counts rejected login attempts with unknown fields against the per-IP limit', async () => {
    const send = () =>
      request(ctx.app.getHttpServer())
        .post('/api/sessions')
        .set(JSON_HEADERS)
        .send({ identifier: 'nobody@example.com', password: 'a-long-enough-password', roles: ['admin'] });

    for (let i = 0; i < LOGIN_IP_LIMIT; i += 1) {
      const response = await send();
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }

    const limited = await send();
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });
});

function sessionCookieOf(response: request.Response): string {
  const all = (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  return (all.find((value) => value.startsWith('guihua_session=')) ?? '').split(';')[0] ?? '';
}

describe('M2c password recheck login limits', () => {
  it('counts password rechecks toward the per-normalized-identifier login limit', async () => {
    const registered = await request(ctx.app.getHttpServer())
      .post('/api/users')
      .set(JSON_HEADERS)
      .send({ email: 'recheck@example.com', username: 'Recheck_User', password: 'correct-horse-battery' });
    expect(registered.status).toBe(201);
    const cookie1 = sessionCookieOf(registered);

    // Two more sessions: one login by email, one by username. Both identifier
    // keys now hold one admitted hit each from password logins.
    const byEmail = await request(ctx.app.getHttpServer())
      .post('/api/sessions')
      .set(JSON_HEADERS)
      .send({ identifier: 'recheck@example.com', password: 'correct-horse-battery' });
    expect(byEmail.status).toBe(201);
    const cookie2 = sessionCookieOf(byEmail);
    const byName = await request(ctx.app.getHttpServer())
      .post('/api/sessions')
      .set(JSON_HEADERS)
      .send({ identifier: 'recheck_user', password: 'correct-horse-battery' });
    expect(byName.status).toBe(201);

    const recheck = (cookie: string, password: string) =>
      request(ctx.app.getHttpServer())
        .post('/api/sessions/current/reauthentications')
        .set(JSON_HEADERS)
        .set('Cookie', cookie)
        .send({ password });

    // Five wrong-password rechecks on session 1, four on session 2: nine
    // guesses total, so each identifier bucket reaches its limit of 10
    // (2 logins + 8 earlier rechecks) without tripping the per-session cap.
    for (let i = 0; i < 5; i += 1) {
      const response = await recheck(cookie1, 'a-wrong-guess-password');
      expect(response.status).toBe(401);
    }
    for (let i = 0; i < 4; i += 1) {
      const response = await recheck(cookie2, 'a-wrong-guess-password');
      expect(response.status).toBe(401);
    }

    // The tenth attempt — even with the CORRECT password — must be limited.
    const tenth = await recheck(cookie2, 'correct-horse-battery');
    expect(tenth.status).toBe(429);
    expect(tenth.body.error.code).toBe('RATE_LIMITED');
    expect(Number(tenth.headers['retry-after'])).toBeGreaterThan(0);
  });
});
