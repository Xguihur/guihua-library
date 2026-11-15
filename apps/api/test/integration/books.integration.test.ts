import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { bookDetailSchema, bookListItemSchema } from '@guihua/contracts';
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

function ids(body: { items: Array<{ id: string }> }): string[] {
  return body.items.map((item) => item.id);
}

describe('GET /api/books', () => {
  it('lists only published records, newest first', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/books').expect(200);

    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(20);
    expect(res.body.total).toBe(FIXTURE_SUMMARY.publishedBooks);
    expect(res.body.items).toHaveLength(FIXTURE_SUMMARY.publishedBooks);
    expect(ids(res.body)).toEqual([
      FIXTURE_IDS.books.map.toHexString(),
      FIXTURE_IDS.books.silence.toHexString(),
      FIXTURE_IDS.books.garden.toHexString(),
      FIXTURE_IDS.books.river.toHexString(),
      FIXTURE_IDS.books.cliff.toHexString(),
    ]);
    expect(ids(res.body)).not.toContain(FIXTURE_IDS.books.hidden.toHexString());
    for (const item of res.body.items) {
      expect(bookListItemSchema.parse(item)).toEqual(item);
    }
  });

  it('filters by reading status and returns matching totals', async () => {
    const finished = await request(ctx.app.getHttpServer()).get('/api/books?status=finished').expect(200);
    expect(finished.body.total).toBe(FIXTURE_SUMMARY.finishedBooks);
    expect(finished.body.items.every((item: { status: string }) => item.status === 'finished')).toBe(true);

    const reading = await request(ctx.app.getHttpServer()).get('/api/books?status=reading').expect(200);
    expect(reading.body.total).toBe(FIXTURE_SUMMARY.readingBooks);
    expect(reading.body.items.every((item: { status: string }) => item.status === 'reading')).toBe(true);
  });

  it('paginates without overlap and keeps a stable order', async () => {
    const first = await request(ctx.app.getHttpServer()).get('/api/books?pageSize=2&page=1').expect(200);
    const second = await request(ctx.app.getHttpServer()).get('/api/books?pageSize=2&page=2').expect(200);
    const repeat = await request(ctx.app.getHttpServer()).get('/api/books?pageSize=2&page=1').expect(200);

    expect(first.body.items).toHaveLength(2);
    expect(second.body.items).toHaveLength(2);
    expect(first.body.total).toBe(FIXTURE_SUMMARY.publishedBooks);
    expect(ids(first.body)).toEqual(ids(repeat.body));
    expect(ids(first.body).some((id) => ids(second.body).includes(id))).toBe(false);

    const timestamps = first.body.items.map((item: { createdAt: string }) => Date.parse(item.createdAt));
    expect(timestamps[0]).toBeGreaterThan(timestamps[1]);
  });

  it('returns an empty page with an accurate total past the end', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/books?page=99').expect(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(FIXTURE_SUMMARY.publishedBooks);
    expect(res.body.page).toBe(99);
  });

  it('rejects invalid status, paging and unknown parameters', async () => {
    const badStatus = await request(ctx.app.getHttpServer()).get('/api/books?status=paused').expect(400);
    expect(badStatus.body.error.code).toBe('VALIDATION_ERROR');
    expect(badStatus.body.error.details).toContainEqual({
      field: 'status',
      reason: 'must_be_reading_or_finished',
    });

    const badSize = await request(ctx.app.getHttpServer()).get('/api/books?pageSize=101').expect(400);
    expect(badSize.body.error.details).toContainEqual({ field: 'pageSize', reason: 'out_of_range' });

    const badPage = await request(ctx.app.getHttpServer()).get('/api/books?page=0').expect(400);
    expect(badPage.body.error.code).toBe('VALIDATION_ERROR');

    const unknown = await request(ctx.app.getHttpServer()).get('/api/books?sort=title').expect(400);
    expect(unknown.body.error.details).toContainEqual({ field: 'sort', reason: 'unknown_query_parameter' });
  });
});

describe('GET /api/books/:bookId', () => {
  it('returns the public detail with review and a sanitized owner', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/books/${FIXTURE_IDS.books.cliff.toHexString()}`)
      .expect(200);

    expect(bookDetailSchema.parse(res.body)).toEqual(res.body);
    expect(res.body.slug).toBe('the-cliff');
    expect(res.body.review).toContain('读得很慢');
    expect(res.body.owner.username).toBe('mei');

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('mei@example.com');
    expect(serialized).not.toContain('fixture-only-not-a-real-hash');
    expect(serialized).not.toContain('admin');
    expect(serialized).not.toContain('ownerId');
    expect(serialized).not.toContain('visibility');
  });

  it('rejects malformed object ids with 400', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/books/not-an-object-id').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContainEqual({ field: 'bookId', reason: 'invalid_object_id' });

    // 12-character strings are accepted by ObjectId.isValid but are not contract ids.
    const short = await request(ctx.app.getHttpServer()).get('/api/books/123456789012').expect(400);
    expect(short.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns identical 404 responses for hidden and missing books', async () => {
    const hidden = await request(ctx.app.getHttpServer())
      .get(`/api/books/${FIXTURE_IDS.books.hidden.toHexString()}`)
      .expect(404);
    const missing = await request(ctx.app.getHttpServer())
      .get('/api/books/aaaaaaaaaaaaaaaaaaaaaaaa')
      .expect(404);

    expect(hidden.body.error.code).toBe('NOT_FOUND');
    expect(missing.body.error.code).toBe('NOT_FOUND');
    expect(hidden.body.error.message).toBe(missing.body.error.message);
    expect(hidden.body.error.details).toEqual([]);
  });

  it('includes the request id in both header and body', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/books/nope').expect(400);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });
});

describe('anonymous writes', () => {
  it('rejects book creation with 401 and leaves the database unchanged', async () => {
    const before = await ctx.books.countDocuments({});
    const res = await request(ctx.app.getHttpServer())
      .post('/api/books')
      .send({ title: '匿名发布', status: 'reading' })
      .expect(401);

    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(await ctx.books.countDocuments({})).toBe(before);
  });
});
