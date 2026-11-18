import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '@guihua/contracts';
import { createTestContext, type TestContext } from './helpers/test-app';

const ORIGIN = 'http://127.0.0.1:5173';
const JSON_HEADERS = { Origin: ORIGIN, 'Content-Type': 'application/json' };
const PASSWORD = 'correct-horse-battery';

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

function register(email: string, username: string) {
  return request(ctx.app.getHttpServer()).post('/api/users').set(JSON_HEADERS).send({ email, username, password: PASSWORD });
}

function cookieOf(response: request.Response): string {
  const cookie = (response.headers['set-cookie'] as unknown as string[] | undefined)?.[0] ?? '';
  const pair = cookie.split(';')[0];
  return pair ?? '';
}

describe('M2a login and sessions', () => {
  it('logs in by normalized email and by case-insensitive username', async () => {
    await register('Login@Example.com', 'Login_User');
    for (const identifier of [' LOGIN@example.COM ', 'login_user', 'LOGIN_USER']) {
      const response = await request(ctx.app.getHttpServer())
        .post('/api/sessions')
        .set(JSON_HEADERS)
        .send({ identifier, password: PASSWORD });
      expect(response.status).toBe(201);
      expect(Object.keys(response.body).sort()).toEqual(['expiresAt', 'permissions', 'roles', 'user']);
      expect(response.body.roles).toEqual(['user']);
      expect(response.body.permissions).toEqual([]);
      expect(Object.keys(response.body.user).sort()).toEqual([
        'avatarUrl', 'createdAt', 'gender', 'id', 'signature', 'username',
      ]);
      expect(cookieOf(response)).toMatch(/^guihua_session=/);
      expect(new Date(response.body.expiresAt).toISOString()).toBe(response.body.expiresAt);
    }
  });

  it('returns the same invalid-credential error for unknown identifiers and wrong passwords', async () => {
    await register('secret@example.com', 'Secret_User');
    const unknown = await request(ctx.app.getHttpServer())
      .post('/api/sessions')
      .set(JSON_HEADERS)
      .send({ identifier: 'nobody@example.com', password: PASSWORD });
    const wrongPassword = await request(ctx.app.getHttpServer())
      .post('/api/sessions')
      .set(JSON_HEADERS)
      .send({ identifier: 'secret@example.com', password: 'totally-wrong-password' });
    expect(unknown.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('restores current identity, rejects missing sessions and invalidates on logout', async () => {
    const registered = await register('current@example.com', 'Current_User');
    const cookie = cookieOf(registered);
    const current = await request(ctx.app.getHttpServer()).get('/api/sessions/current').set('Cookie', cookie);
    expect(current.status).toBe(200);
    expect(current.body.user.username).toBe('Current_User');

    const anonymous = await request(ctx.app.getHttpServer()).get('/api/sessions/current');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHORIZED');

    const logout = await request(ctx.app.getHttpServer())
      .delete('/api/sessions/current')
      .set(JSON_HEADERS)
      .set('Cookie', cookie);
    expect(logout.status).toBe(204);
    expect(logout.text).toBe('');
    const afterLogout = await request(ctx.app.getHttpServer()).get('/api/sessions/current').set('Cookie', cookie);
    expect(afterLogout.status).toBe(401);

    const repeat = await request(ctx.app.getHttpServer()).delete('/api/sessions/current').set(JSON_HEADERS);
    expect(repeat.status).toBe(204);
  });

  it('revokes the previous token on a new login (no session fixation)', async () => {
    const registered = await register('fix@example.com', 'Fix_User');
    const oldCookie = cookieOf(registered);
    const login = await request(ctx.app.getHttpServer())
      .post('/api/sessions')
      .set(JSON_HEADERS)
      .set('Cookie', oldCookie)
      .send({ identifier: 'fix@example.com', password: PASSWORD });
    const newCookie = cookieOf(login);
    expect(newCookie).not.toBe(oldCookie);

    expect((await request(ctx.app.getHttpServer()).get('/api/sessions/current').set('Cookie', oldCookie)).status).toBe(401);
    expect((await request(ctx.app.getHttpServer()).get('/api/sessions/current').set('Cookie', newCookie)).status).toBe(200);
  });

  it('rejects every request for a disabled user immediately', async () => {
    const registered = await register('disabled@example.com', 'Disabled_User');
    const cookie = cookieOf(registered);
    await ctx.users.updateOne({ usernameNormalized: 'disabled_user' }, { $set: { enabled: false } });
    const current = await request(ctx.app.getHttpServer()).get('/api/sessions/current').set('Cookie', cookie);
    expect(current.status).toBe(401);
    expect(current.body.error.code).toBe('UNAUTHORIZED');
  });

  it('treats a malformed percent-encoded cookie as invalid rather than a 500', async () => {
    await register('cookie@example.com', 'Cookie_User');
    const malformed = `${SESSION_COOKIE_NAME}=%E0%A4%A`;

    const current = await request(ctx.app.getHttpServer()).get('/api/sessions/current').set('Cookie', malformed);
    expect(current.status).toBe(401);
    expect(current.body.error.code).toBe('UNAUTHORIZED');

    const logout = await request(ctx.app.getHttpServer())
      .delete('/api/sessions/current').set(JSON_HEADERS).set('Cookie', malformed);
    expect(logout.status).toBe(204);
  });

  it('rejects login for an OAuth-only user with no usable local hash', async () => {
    await ctx.users.create({ username: 'Oauth_Only', usernameNormalized: 'oauth_only', email: null, passwordHash: null });
    const response = await request(ctx.app.getHttpServer())
      .post('/api/sessions')
      .set(JSON_HEADERS)
      .send({ identifier: 'oauth_only', password: PASSWORD });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('exposes the same UserPublic through GET /api/me', async () => {
    const registered = await register('me@example.com', 'Me_User');
    const me = await request(ctx.app.getHttpServer()).get('/api/me').set('Cookie', cookieOf(registered));
    expect(me.status).toBe(200);
    expect(Object.keys(me.body).sort()).toEqual([
      'avatarUrl', 'createdAt', 'gender', 'id', 'signature', 'username',
    ]);
    expect(me.body.email).toBeUndefined();
  });

  it('rejects extra business fields on logout', async () => {
    const registered = await register('logout-fields@example.com', 'Logout_Fields');
    const response = await request(ctx.app.getHttpServer())
      .delete('/api/sessions/current')
      .set(JSON_HEADERS)
      .set('Cookie', cookieOf(registered))
      .send({ userId: '64b000000000000000000099', all: true });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    // The session is still live: the rejected write did not log anyone out.
    expect((await request(ctx.app.getHttpServer()).get('/api/sessions/current').set('Cookie', cookieOf(registered))).status).toBe(200);
  });

});
