import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
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

async function register(email = 'profile@example.com', username = 'Profile_User'): Promise<string> {
  const response = await request(ctx.app.getHttpServer())
    .post('/api/users')
    .set(JSON_HEADERS)
    .send({ email, username, password: PASSWORD });
  expect(response.status).toBe(201);
  return (response.headers['set-cookie'] as unknown as string[])[0]?.split(';')[0] ?? '';
}

function patch(cookie: string, body: Record<string, unknown>) {
  return request(ctx.app.getHttpServer()).patch('/api/me').set(JSON_HEADERS).set('Cookie', cookie).send(body);
}

describe('M2b PATCH /api/me', () => {
  it('updates only whitelisted fields and never touches email, role or ownership', async () => {
    const cookie = await register();
    const response = await patch(cookie, {
      username: 'New_Name',
      gender: 'female',
      avatarUrl: 'https://cdn.example.com/a.png',
      signature: '读书记',
    });
    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual([
      'avatarUrl', 'createdAt', 'gender', 'id', 'signature', 'username',
    ]);
    expect(response.body).toMatchObject({
      username: 'New_Name', gender: 'female', avatarUrl: 'https://cdn.example.com/a.png', signature: '读书记',
    });

    const stored = await ctx.users.findOne({ usernameNormalized: 'new_name' }).lean();
    expect(stored?.email).toBe('profile@example.com');
    expect(stored?.role).toBe('user');
    expect(stored?.usernameNormalized).toBe('new_name');
  });

  it('rejects an empty body and unknown or server-controlled fields without changing data', async () => {
    const cookie = await register();
    for (const body of [
      {},
      { email: 'stolen@example.com' },
      { roles: ['admin'] },
      { enabled: false },
      { id: '64b000000000000000000099' },
      { ownerId: '64b000000000000000000099' },
      { signature: 'ok', passwordHash: 'x' },
    ]) {
      const response = await patch(cookie, body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    const stored = await ctx.users.findOne({ usernameNormalized: 'profile_user' }).lean();
    expect(stored?.email).toBe('profile@example.com');
    expect(stored?.enabled).toBe(true);
    expect(stored?.signature).toBe('');
  });

  it('allows a case-only display rename but maps a normalized collision to 409', async () => {
    const cookie = await register('one@example.com', 'Reader_One');
    await register('two@example.com', 'Reader_Two');

    const caseOnly = await patch(cookie, { username: 'READER_ONE' });
    expect(caseOnly.status).toBe(200);
    expect(caseOnly.body.username).toBe('READER_ONE');

    const collision = await patch(cookie, { username: 'reader_TWO' });
    expect(collision.status).toBe(409);
    expect(collision.body.error.code).toBe('IDENTITY_CONFLICT');
  });

  it('accepts only null or a bounded HTTPS avatar URL without userinfo or control characters', async () => {
    const cookie = await register();
    expect((await patch(cookie, { avatarUrl: 'https://cdn.example.com/ok.png' })).status).toBe(200);
    expect((await patch(cookie, { avatarUrl: null })).body.avatarUrl).toBeNull();
    for (const avatarUrl of [
      'http://cdn.example.com/a.png',
      '//cdn.example.com/a.png',
      'https://user:pass@cdn.example.com/a.png',
      'https://cdn.example.com/a\u0000.png',
      `https://cdn.example.com/${'a'.repeat(2100)}`,
    ]) {
      const response = await patch(cookie, { avatarUrl });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('stores signature as plain text with a 200-code-point limit and no C0 controls', async () => {
    const cookie = await register();
    const exactly200 = '🙂'.repeat(200);
    const accepted = await patch(cookie, { signature: exactly200 });
    expect(accepted.status).toBe(200);
    expect(accepted.body.signature).toBe(exactly200);

    expect((await patch(cookie, { signature: '🙂'.repeat(201) })).status).toBe(400);
    for (const control of ['\u0000', '\u0001', '\u001f', '\r', '\u007f']) {
      const response = await patch(cookie, { signature: `bad${control}value` });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    // Newline and tab remain allowed.
    expect((await patch(cookie, { signature: 'line1\nline2\tend' })).status).toBe(200);

    const stored = await ctx.users.findOne({ usernameNormalized: 'profile_user' }).lean();
    expect(stored?.signature).toBe('line1\nline2\tend');
  });

  it('enforces the same Origin and Content-Type rules and requires a live session', async () => {
    const cookie = await register();
    const noOrigin = await request(ctx.app.getHttpServer())
      .patch('/api/me').set('Content-Type', 'application/json').set('Cookie', cookie).send({ signature: 'x' });
    expect(noOrigin.status).toBe(403);
    const wrongType = await request(ctx.app.getHttpServer())
      .patch('/api/me').set('Origin', ORIGIN).set('Content-Type', 'text/plain').set('Cookie', cookie).send('{"signature":"x"}');
    expect(wrongType.status).toBe(400);
    const anonymous = await request(ctx.app.getHttpServer())
      .patch('/api/me').set(JSON_HEADERS).send({ signature: 'x' });
    expect(anonymous.status).toBe(401);
  });

  it('reflects the new public author on a fresh read of owned books', async () => {
    const cookie = await register();
    const me = await request(ctx.app.getHttpServer()).get('/api/me').set('Cookie', cookie);
    await ctx.books.create({
      ownerId: me.body.id,
      slug: 'profile-book',
      title: '资料测试',
      author: '示例',
      status: 'reading',
      visibility: 'published',
      summary: '示例简介',
      review: '示例书评',
    });

    const before = await request(ctx.app.getHttpServer()).get('/api/books');
    expect(before.body.items.find((item: { slug: string }) => item.slug === 'profile-book').owner.username).toBe('Profile_User');

    await patch(cookie, { username: 'Renamed_User', avatarUrl: 'https://cdn.example.com/new.png' });
    const after = await request(ctx.app.getHttpServer()).get('/api/books');
    const owner = after.body.items.find((item: { slug: string }) => item.slug === 'profile-book').owner;
    expect(owner.username).toBe('Renamed_User');
    expect(owner.avatarUrl).toBe('https://cdn.example.com/new.png');
    expect(Object.keys(owner).sort()).toEqual(['avatarUrl', 'id', 'username']);
  });

  it('keeps a legacy M1 avatar with control characters read-only in public projections', async () => {
    const cookie = await register();
    const legacy = 'https://cdn.example.com/legacy\u0001.png';
    await ctx.users.updateOne({ usernameNormalized: 'profile_user' }, { $set: { avatarUrl: legacy } });

    const me = await request(ctx.app.getHttpServer()).get('/api/me').set('Cookie', cookie);
    expect(me.body.avatarUrl).toBe(legacy);

    await ctx.books.create({
      ownerId: me.body.id,
      slug: 'legacy-avatar-book',
      title: '旧头像',
      author: '示例',
      status: 'reading',
      visibility: 'published',
      summary: '旧简介',
      review: '旧书评',
    });
    const list = await request(ctx.app.getHttpServer()).get('/api/books');
    expect(list.body.items.find((item: { slug: string }) => item.slug === 'legacy-avatar-book').owner.avatarUrl).toBe(legacy);

    // Writing the same legacy value is still rejected and never rewrites data.
    expect((await patch(cookie, { avatarUrl: legacy })).status).toBe(400);
    expect((await ctx.users.findOne({ usernameNormalized: 'profile_user' }).lean())?.avatarUrl).toBe(legacy);
  });

});
