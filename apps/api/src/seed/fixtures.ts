import { createHash } from 'node:crypto';
import { Types, type Connection } from 'mongoose';
import type { BookStatus, BookVisibility, CommentVisibility } from '@guihua/contracts';

/**
 * Deterministic fixture ids keep `db:seed` idempotent and let browser smoke tests
 * address the same records that the API serves.
 */
export function fixtureObjectId(key: string): Types.ObjectId {
  const hex = createHash('sha256').update(`guihua-library-fixture:${key}`).digest('hex').slice(0, 24);
  return new Types.ObjectId(hex);
}

export interface FixtureUser {
  _id: Types.ObjectId;
  username: string;
  email: string;
  passwordHash: string;
  avatarUrl: string | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FixtureBook {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  slug: string;
  title: string;
  author: string;
  coverUrl: string | null;
  status: BookStatus;
  visibility: BookVisibility;
  summary: string;
  review: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FixtureComment {
  _id: Types.ObjectId;
  bookId: Types.ObjectId;
  authorId: Types.ObjectId;
  content: string;
  visibility: CommentVisibility;
  createdAt: Date;
  updatedAt: Date;
}

export const FIXTURE_IDS = {
  users: {
    mei: fixtureObjectId('user:mei'),
    lin: fixtureObjectId('user:lin'),
    qiu: fixtureObjectId('user:qiu'),
  },
  books: {
    cliff: fixtureObjectId('book:cliff'),
    river: fixtureObjectId('book:river'),
    garden: fixtureObjectId('book:garden'),
    silence: fixtureObjectId('book:silence'),
    map: fixtureObjectId('book:map'),
    hidden: fixtureObjectId('book:hidden'),
  },
  comments: {
    cliffLin: fixtureObjectId('comment:cliff-lin'),
    cliffQiu: fixtureObjectId('comment:cliff-qiu'),
    cliffHidden: fixtureObjectId('comment:cliff-hidden'),
    riverMei: fixtureObjectId('comment:river-mei'),
    hiddenBookLin: fixtureObjectId('comment:hidden-book-lin'),
  },
} as const;

function iso(value: string): Date {
  return new Date(value);
}

export interface Fixtures {
  users: FixtureUser[];
  books: FixtureBook[];
  comments: FixtureComment[];
}

export function buildFixtures(): Fixtures {
  const users: FixtureUser[] = [
    {
      _id: FIXTURE_IDS.users.mei,
      username: 'mei',
      email: 'mei@example.com',
      passwordHash: '$2b$12$fixture-only-not-a-real-hash',
      avatarUrl: 'https://cdn.example.com/avatars/mei.png',
      role: 'admin',
      createdAt: iso('2026-10-01T08:00:00.000Z'),
      updatedAt: iso('2026-10-01T08:00:00.000Z'),
    },
    {
      _id: FIXTURE_IDS.users.lin,
      username: 'lin',
      email: 'lin@example.com',
      passwordHash: '$2b$12$fixture-only-not-a-real-hash',
      avatarUrl: null,
      role: 'user',
      createdAt: iso('2026-10-02T08:00:00.000Z'),
      updatedAt: iso('2026-10-02T08:00:00.000Z'),
    },
    {
      _id: FIXTURE_IDS.users.qiu,
      username: 'qiu',
      email: 'qiu@example.com',
      passwordHash: '$2b$12$fixture-only-not-a-real-hash',
      avatarUrl: 'https://cdn.example.com/avatars/qiu.png',
      role: 'user',
      createdAt: iso('2026-10-03T08:00:00.000Z'),
      updatedAt: iso('2026-10-03T08:00:00.000Z'),
    },
  ];

  const books: FixtureBook[] = [
    {
      _id: FIXTURE_IDS.books.cliff,
      ownerId: FIXTURE_IDS.users.mei,
      slug: 'the-cliff',
      title: '悬崖',
      author: '李锐',
      coverUrl: null,
      status: 'reading',
      visibility: 'published',
      summary: '一个家族在时代变动中的迁徙与记忆。',
      review: '读得很慢，但每一章都值得停下来想一想。',
      createdAt: iso('2026-11-01T09:00:00.000Z'),
      updatedAt: iso('2026-11-01T09:00:00.000Z'),
    },
    {
      _id: FIXTURE_IDS.books.river,
      ownerId: FIXTURE_IDS.users.lin,
      slug: 'river-town',
      title: '河边的城镇',
      author: '王安忆',
      coverUrl: null,
      status: 'finished',
      visibility: 'published',
      summary: '沿着河流展开的日常生活与人物群像。',
      review: '结尾收得克制，合上书之后还在想里面的人。',
      createdAt: iso('2026-11-02T09:00:00.000Z'),
      updatedAt: iso('2026-11-02T09:00:00.000Z'),
    },
    {
      _id: FIXTURE_IDS.books.garden,
      ownerId: FIXTURE_IDS.users.qiu,
      slug: 'winter-garden',
      title: '冬天的花园',
      author: '迟子建',
      coverUrl: null,
      status: 'reading',
      visibility: 'published',
      summary: '在寒冷季节里缓慢生长的温柔故事。',
      review: '每天睡前读两页，节奏刚好。',
      createdAt: iso('2026-11-03T09:00:00.000Z'),
      updatedAt: iso('2026-11-03T09:00:00.000Z'),
    },
    {
      _id: FIXTURE_IDS.books.silence,
      ownerId: FIXTURE_IDS.users.mei,
      slug: 'long-silence',
      title: '漫长的沉默',
      author: '格非',
      coverUrl: null,
      status: 'finished',
      visibility: 'published',
      summary: '一次重逢牵出的旧事与未说出口的话。',
      review: '结构很精巧，重读时才发现前面的伏笔。',
      createdAt: iso('2026-11-04T09:00:00.000Z'),
      updatedAt: iso('2026-11-04T09:00:00.000Z'),
    },
    {
      _id: FIXTURE_IDS.books.map,
      ownerId: FIXTURE_IDS.users.lin,
      slug: 'paper-map',
      title: '纸上的地图',
      author: '张新颖',
      coverUrl: 'https://cdn.example.com/covers/paper-map.jpg',
      status: 'reading',
      visibility: 'published',
      summary: '关于阅读、旅行与写作的随笔集。',
      review: '适合随手翻开一页读，很多句子想抄下来。',
      createdAt: iso('2026-11-05T09:00:00.000Z'),
      updatedAt: iso('2026-11-05T09:00:00.000Z'),
    },
    {
      _id: FIXTURE_IDS.books.hidden,
      ownerId: FIXTURE_IDS.users.qiu,
      slug: 'hidden-draft',
      title: '尚未公开的记录',
      author: '隐藏作者',
      coverUrl: null,
      status: 'reading',
      visibility: 'hidden',
      summary: '这条记录不应出现在任何公开响应中。',
      review: '隐藏记录的书评也不应对访客可见。',
      createdAt: iso('2026-11-06T09:00:00.000Z'),
      updatedAt: iso('2026-11-06T09:00:00.000Z'),
    },
  ];

  const comments: FixtureComment[] = [
    {
      _id: FIXTURE_IDS.comments.cliffLin,
      bookId: FIXTURE_IDS.books.cliff,
      authorId: FIXTURE_IDS.users.lin,
      content: '这本我也在读，第三章的描写特别好。',
      visibility: 'published',
      createdAt: iso('2026-11-07T09:00:00.000Z'),
      updatedAt: iso('2026-11-07T09:00:00.000Z'),
    },
    {
      _id: FIXTURE_IDS.comments.cliffQiu,
      bookId: FIXTURE_IDS.books.cliff,
      authorId: FIXTURE_IDS.users.qiu,
      content: '已加入待读清单。',
      visibility: 'published',
      createdAt: iso('2026-11-08T09:00:00.000Z'),
      updatedAt: iso('2026-11-08T09:00:00.000Z'),
    },
    {
      _id: FIXTURE_IDS.comments.cliffHidden,
      bookId: FIXTURE_IDS.books.cliff,
      authorId: FIXTURE_IDS.users.mei,
      content: '这条评论被隐藏，不应出现在公开列表。',
      visibility: 'hidden',
      createdAt: iso('2026-11-09T09:00:00.000Z'),
      updatedAt: iso('2026-11-09T09:00:00.000Z'),
    },
    {
      _id: FIXTURE_IDS.comments.riverMei,
      bookId: FIXTURE_IDS.books.river,
      authorId: FIXTURE_IDS.users.mei,
      content: '结尾那段我也很喜欢。',
      visibility: 'published',
      createdAt: iso('2026-11-10T09:00:00.000Z'),
      updatedAt: iso('2026-11-10T09:00:00.000Z'),
    },
    {
      _id: FIXTURE_IDS.comments.hiddenBookLin,
      bookId: FIXTURE_IDS.books.hidden,
      authorId: FIXTURE_IDS.users.lin,
      content: '隐藏书籍下的评论，公开接口不应返回。',
      visibility: 'published',
      createdAt: iso('2026-11-11T09:00:00.000Z'),
      updatedAt: iso('2026-11-11T09:00:00.000Z'),
    },
  ];

  return { users, books, comments };
}

/** Public fixtures for docs and assertions: 5 published books, 3 reading, 2 finished. */
export const FIXTURE_SUMMARY = {
  publishedBooks: 5,
  readingBooks: 3,
  finishedBooks: 2,
  hiddenBooks: 1,
  publishedCommentsOnCliff: 2,
} as const;

interface UpsertableDoc {
  _id: Types.ObjectId;
}

function upserts<T extends UpsertableDoc>(docs: T[]) {
  return docs.map((doc) => {
    const { _id, ...rest } = doc;
    return { updateOne: { filter: { _id }, update: { $set: rest }, upsert: true } };
  });
}

type MongoDb = NonNullable<Connection['db']>;

/** Idempotent: every run upserts the same ids and leaves other documents untouched. */
export async function seedFixtures(db: MongoDb): Promise<{ users: number; books: number; comments: number }> {
  const { users, books, comments } = buildFixtures();
  await db.collection('users').bulkWrite(upserts(users), { ordered: false });
  await db.collection('books').bulkWrite(upserts(books), { ordered: false });
  await db.collection('comments').bulkWrite(upserts(comments), { ordered: false });
  return { users: users.length, books: books.length, comments: comments.length };
}
