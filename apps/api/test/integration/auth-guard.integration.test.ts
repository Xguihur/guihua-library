import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildFixtures } from '../../src/seed/fixtures';
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

describe('M2a write guard transition', () => {
  it('keeps anonymous writes at 401 but returns 403 for a valid session without writing', async () => {
    const registered = await request(ctx.app.getHttpServer())
      .post('/api/users')
      .set(JSON_HEADERS)
      .send({ email: 'guard@example.com', username: 'Guard_User', password: PASSWORD });
    expect(registered.status).toBe(201);
    const cookie = (registered.headers['set-cookie'] as unknown as string[])[0]?.split(';')[0] ?? '';

    const anonymous = await request(ctx.app.getHttpServer()).post('/api/books').send({ title: 'nope' });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHORIZED');

    const before = await ctx.books.countDocuments({});
    const authenticated = await request(ctx.app.getHttpServer())
      .post('/api/books')
      .set(JSON_HEADERS)
      .set('Cookie', cookie)
      .send({ title: 'still-not-open' });
    expect(authenticated.status).toBe(403);
    expect(authenticated.body.error.code).toBe('FORBIDDEN');
    expect(await ctx.books.countDocuments({})).toBe(before);

    const book = buildFixtures().books[0];
    if (!book) throw new Error('fixture book missing');
    await ctx.books.insertOne({ ...book });
    const commentBefore = await ctx.comments.countDocuments({});
    const comment = await request(ctx.app.getHttpServer())
      .post(`/api/books/${book._id.toString()}/comments`)
      .set(JSON_HEADERS)
      .set('Cookie', cookie)
      .send({ content: 'still-not-open' });
    expect(comment.status).toBe(403);
    expect(comment.body.error.code).toBe('FORBIDDEN');
    expect(await ctx.comments.countDocuments({})).toBe(commentBefore);
  });
});
