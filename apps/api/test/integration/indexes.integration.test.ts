import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { buildFixtures } from '../../src/seed/fixtures';
import { createTestContext, type TestContext } from './helpers/test-app';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

interface IndexInfo {
  name?: string;
  key: Record<string, number>;
  unique?: boolean;
}

function indexByName(indexes: IndexInfo[], name: string): IndexInfo | undefined {
  return indexes.find((index) => index.name === name);
}

describe('declared indexes', () => {
  it('has the public list index used by filtering and stable sorting', async () => {
    const indexes = (await ctx.books.collection.indexes()) as IndexInfo[];
    const index = indexByName(indexes, 'books_public_list');
    expect(index).toBeDefined();
    expect(index?.key).toEqual({ visibility: 1, status: 1, createdAt: -1, _id: -1 });
  });

  it('has the public comment list index', async () => {
    const indexes = (await ctx.comments.collection.indexes()) as IndexInfo[];
    const index = indexByName(indexes, 'comments_public_list');
    expect(index).toBeDefined();
    expect(index?.key).toEqual({ bookId: 1, visibility: 1, createdAt: -1, _id: -1 });
  });

  it('enforces unique slugs', async () => {
    const indexes = (await ctx.books.collection.indexes()) as IndexInfo[];
    expect(indexByName(indexes, 'books_slug_unique')?.unique).toBe(true);

    const first = buildFixtures().books[0];
    if (!first) throw new Error('fixtures missing books');
    await ctx.books.collection.deleteMany({ slug: first.slug });
    await ctx.books.collection.insertOne({ ...first });
    await expect(ctx.books.collection.insertOne({ ...first, _id: new Types.ObjectId() })).rejects.toThrow(
      /duplicate key|E11000/i,
    );
    await ctx.books.collection.deleteMany({ slug: first.slug });
  });

  it('keeps user identity fields unique for later account work', async () => {
    const indexes = (await ctx.users.collection.indexes()) as IndexInfo[];
    expect(indexByName(indexes, 'users_username_unique')?.unique).toBe(true);
    expect(indexByName(indexes, 'users_email_unique')?.unique).toBe(true);
  });
});
