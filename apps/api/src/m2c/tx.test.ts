import { describe, expect, it, vi } from 'vitest';
import type { Connection } from 'mongoose';
import { withTxRetry } from './tx';

function labelled(name: string): Error {
  return Object.assign(new Error(name), {
    name: 'MongoServerError',
    hasErrorLabel: (label: string) => label === name,
  });
}

function unknownCommit(): Error {
  return labelled('UnknownTransactionCommitResult');
}

function harness(commitError?: Error) {
  const session = {
    startTransaction: vi.fn(),
    commitTransaction: vi.fn(async () => {
      if (commitError) throw commitError;
    }),
    abortTransaction: vi.fn(async () => undefined),
    endSession: vi.fn(async () => undefined),
  };
  const connection = { startSession: () => session } as unknown as Connection;
  return { session, connection };
}

describe('withTxRetry', () => {
  it('retries transient conflicts up to the bound, then returns a stable 503', async () => {
    const { session, connection } = harness();
    const work = vi.fn().mockRejectedValue(labelled('TransientTransactionError'));
    await expect(withTxRetry(connection, work, 3)).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(work).toHaveBeenCalledTimes(3);
    expect(session.startTransaction).toHaveBeenCalledTimes(3);
    expect(session.abortTransaction).toHaveBeenCalledTimes(3);
    expect(session.commitTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(3);
  });

  it('succeeds on a later attempt and commits exactly once', async () => {
    const { session, connection } = harness();
    const work = vi
      .fn()
      .mockRejectedValueOnce(labelled('TransientTransactionError'))
      .mockResolvedValueOnce('done');
    await expect(withTxRetry(connection, work, 4)).resolves.toBe('done');
    expect(work).toHaveBeenCalledTimes(2);
    expect(session.commitTransaction).toHaveBeenCalledTimes(1);
    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
    expect(session.endSession).toHaveBeenCalledTimes(2);
  });

  it('preserves a duplicate-key error for the caller to map to 409', async () => {
    const { session, connection } = harness();
    const duplicate = Object.assign(new Error('duplicate'), { code: 11000, name: 'MongoServerError' });
    const work = vi.fn().mockRejectedValue(duplicate);
    await expect(withTxRetry(connection, work, 4)).rejects.toBe(duplicate);
    expect(work).toHaveBeenCalledTimes(1);
    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
  });

  it('retries an unknown commit result on the SAME session without re-running work', async () => {
    const { session, connection } = harness();
    session.commitTransaction
      .mockRejectedValueOnce(unknownCommit())
      .mockResolvedValueOnce(undefined);
    const work = vi.fn().mockResolvedValue('done');
    await expect(withTxRetry(connection, work, 4)).resolves.toBe('done');
    // The work ran exactly once — only the commit was uncertain.
    expect(work).toHaveBeenCalledTimes(1);
    expect(session.commitTransaction).toHaveBeenCalledTimes(2);
    expect(session.abortTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('gives up on a persistently unknown commit with a bounded number of commit attempts and a stable 503', async () => {
    const { session, connection } = harness();
    session.commitTransaction.mockRejectedValue(unknownCommit());
    const work = vi.fn().mockResolvedValue('maybe-committed');
    await expect(withTxRetry(connection, work, 4)).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
    // Bounded commit retries on one session; the write itself is never replayed.
    expect(work).toHaveBeenCalledTimes(1);
    expect(session.commitTransaction).toHaveBeenCalledTimes(3);
    expect(session.startTransaction).toHaveBeenCalledTimes(1);
    expect(session.abortTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('caps the commit with maxCommitTimeMS on startTransaction', async () => {
    const { session, connection } = harness();
    const work = vi.fn().mockResolvedValue('done');
    await withTxRetry(connection, work, 4);
    expect(session.startTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ maxCommitTimeMS: expect.any(Number) }),
    );
  });

  it('masks a startSession failure as 503 without running any work', async () => {
    const connection = {
      startSession: vi.fn(async () => {
        throw Object.assign(new Error('pool cleared for 127.0.0.1:27017'), { name: 'PoolClearedError' });
      }),
    } as unknown as Connection;
    const work = vi.fn();
    await expect(withTxRetry(connection, work, 4)).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(work).not.toHaveBeenCalled();
  });

  it('never lets a failing endSession override a caller-facing business error', async () => {
    const session = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(async () => undefined),
      abortTransaction: vi.fn(async () => undefined),
      endSession: vi.fn(async () => {
        throw new Error('endSession blew up after the real outcome');
      }),
    };
    const connection = { startSession: () => session } as unknown as Connection;
    const duplicate = Object.assign(new Error('duplicate'), { code: 11000, name: 'MongoServerError' });
    const work = vi.fn().mockRejectedValue(duplicate);
    await expect(withTxRetry(connection, work, 4)).rejects.toBe(duplicate);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('masks a raw driver failure instead of leaking Mongo details', async () => {
    const { connection } = harness();
    const driver = Object.assign(new Error('connection to db.example:27017 failed'), {
      name: 'MongoNetworkError',
    });
    const work = vi.fn().mockRejectedValue(driver);
    await expect(withTxRetry(connection, work, 4)).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
    const caught = (await withTxRetry(connection, work, 4).catch((error: unknown) => error)) as Error;
    expect(caught.message).not.toContain('db.example');
  });
});
