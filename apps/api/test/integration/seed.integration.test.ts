import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FIXTURE_SUMMARY, seedFixtures } from '../../src/seed/fixtures';
import { createTestContext, type TestContext } from './helpers/test-app';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

describe('development fixtures', () => {
  it('are idempotent when seeded repeatedly', async () => {
    await ctx.reset();
    const db = ctx.connection.db;
    if (!db) throw new Error('test connection lost its database handle');

    await seedFixtures(db);
    const firstCounts = {
      users: await ctx.users.countDocuments({}),
      books: await ctx.books.countDocuments({}),
      comments: await ctx.comments.countDocuments({}),
    };
    const firstBooks = await ctx.books.find({}).sort({ _id: 1 }).lean();

    await seedFixtures(db);

    expect({
      users: await ctx.users.countDocuments({}),
      books: await ctx.books.countDocuments({}),
      comments: await ctx.comments.countDocuments({}),
    }).toEqual(firstCounts);
    expect(await ctx.books.find({}).sort({ _id: 1 }).lean()).toEqual(firstBooks);
  });

  it('cover both statuses, hidden records and hidden comments', async () => {
    await ctx.reset();
    const db = ctx.connection.db;
    if (!db) throw new Error('test connection lost its database handle');
    await seedFixtures(db);

    expect(await ctx.books.countDocuments({ visibility: 'published', status: 'reading' })).toBe(
      FIXTURE_SUMMARY.readingBooks,
    );
    expect(await ctx.books.countDocuments({ visibility: 'published', status: 'finished' })).toBe(
      FIXTURE_SUMMARY.finishedBooks,
    );
    expect(await ctx.books.countDocuments({ visibility: 'hidden' })).toBe(FIXTURE_SUMMARY.hiddenBooks);
    expect(await ctx.comments.countDocuments({ visibility: 'hidden' })).toBe(1);
  });
});
