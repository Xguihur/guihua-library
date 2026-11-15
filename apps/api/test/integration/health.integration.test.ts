import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestContext, type TestContext } from './helpers/test-app';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

describe('health endpoints', () => {
  it('reports liveness', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/health/live').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('reports readiness when MongoDB responds', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/health/ready').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('does not echo connection details', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/health/ready').expect(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('27018');
    expect(serialized).not.toContain('mongodb');
    expect(serialized).not.toContain('guihua_library_test');
  });
});
