import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { commentListResponseSchema } from '@guihua/contracts';
import { FIXTURE_IDS, FIXTURE_SUMMARY, seedFixtures } from '../../src/seed/fixtures';
import { createTestContext, type TestContext } from './helpers/test-app';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const db = ctx.connection.db;
  if (!db) throw new Error('test connection lost its database handle');
  await seedFixtures(db);
});

const cliffId = FIXTURE_IDS.books.cliff.toHexString();

describe('GET /api/books/:bookId/comments', () => {
  it('returns only published comments with sanitized authors', async () => {
    const res = await request(ctx.app.getHttpServer()).get(`/api/books/${cliffId}/comments`).expect(200);

    expect(commentListResponseSchema.parse(res.body)).toEqual(res.body);
    expect(res.body.total).toBe(FIXTURE_SUMMARY.publishedCommentsOnCliff);
    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([
      FIXTURE_IDS.comments.cliffQiu.toHexString(),
      FIXTURE_IDS.comments.cliffLin.toHexString(),
    ]);
    expect(res.body.items.map((item: { id: string }) => item.id)).not.toContain(
      FIXTURE_IDS.comments.cliffHidden.toHexString(),
    );

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('@example.com');
    expect(serialized).not.toContain('authorId');
    expect(serialized).not.toContain('visibility');
  });

  it('paginates comments with stable ordering', async () => {
    const first = await request(ctx.app.getHttpServer())
      .get(`/api/books/${cliffId}/comments?pageSize=1&page=1`)
      .expect(200);
    const second = await request(ctx.app.getHttpServer())
      .get(`/api/books/${cliffId}/comments?pageSize=1&page=2`)
      .expect(200);

    expect(first.body.items).toHaveLength(1);
    expect(first.body.total).toBe(2);
    expect(first.body.items[0].id).toBe(FIXTURE_IDS.comments.cliffQiu.toHexString());
    expect(second.body.items[0].id).toBe(FIXTURE_IDS.comments.cliffLin.toHexString());
  });

  it('rejects comments under hidden or missing books with the same 404', async () => {
    const hidden = await request(ctx.app.getHttpServer())
      .get(`/api/books/${FIXTURE_IDS.books.hidden.toHexString()}/comments`)
      .expect(404);
    const missing = await request(ctx.app.getHttpServer())
      .get('/api/books/aaaaaaaaaaaaaaaaaaaaaaaa/comments')
      .expect(404);

    expect(hidden.body.error.code).toBe('NOT_FOUND');
    expect(missing.body.error.code).toBe('NOT_FOUND');
    expect(hidden.body.error.message).toBe(missing.body.error.message);
  });

  it('validates the parent id and query parameters', async () => {
    const badId = await request(ctx.app.getHttpServer()).get('/api/books/nope/comments').expect(400);
    expect(badId.body.error.code).toBe('VALIDATION_ERROR');

    const badQuery = await request(ctx.app.getHttpServer())
      .get(`/api/books/${cliffId}/comments?status=reading`)
      .expect(400);
    expect(badQuery.body.error.details).toContainEqual({ field: 'status', reason: 'unknown_query_parameter' });

    const badSize = await request(ctx.app.getHttpServer())
      .get(`/api/books/${cliffId}/comments?pageSize=500`)
      .expect(400);
    expect(badSize.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns an empty page beyond the last comment', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/books/${cliffId}/comments?page=10`)
      .expect(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(2);
  });
});

describe('anonymous comment writes', () => {
  it('rejects comment creation with 401 and leaves the database unchanged', async () => {
    const before = await ctx.comments.countDocuments({});
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/books/${cliffId}/comments`)
      .send({ content: '匿名评论' })
      .expect(401);

    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(await ctx.comments.countDocuments({})).toBe(before);
  });

  it('rejects writes under hidden books without revealing their existence', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/books/${FIXTURE_IDS.books.hidden.toHexString()}/comments`)
      .send({ content: 'x' })
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
