import type { ClientSession, Connection } from 'mongoose';
import { serviceUnavailableError } from '../common/api-exception';

/**
 * A commit with an unknown result is retried on the SAME session a bounded
 * number of times (the driver's own recommendation): the work already ran and
 * must never be replayed. Only after the bound is exhausted do we fail closed.
 */
const MAX_COMMIT_ATTEMPTS = 3;
/** Bounds how long any single commit may run before the server gives up. */
const MAX_COMMIT_TIME_MS = 5_000;

const DEFAULT_OPTIONS = {
  readConcern: { level: 'snapshot' as const },
  writeConcern: { w: 'majority' as const },
  maxCommitTimeMS: MAX_COMMIT_TIME_MS,
};

function hasLabel(error: unknown, label: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { hasErrorLabel?: (label: string) => boolean; errorLabels?: string[] };
  return value.hasErrorLabel?.(label) === true || value.errorLabels?.includes(label) === true;
}

function errorCode(error: unknown): unknown {
  return error && typeof error === 'object' && 'code' in error ? (error as { code: unknown }).code : undefined;
}

/** Safe to retry the whole transaction; MongoDB marks these explicitly. */
function isTransient(error: unknown): boolean {
  return (
    errorCode(error) === 112 ||
    Boolean(error && typeof error === 'object' && 'codeName' in error && (error as { codeName?: unknown }).codeName === 'WriteConflict') ||
    hasLabel(error, 'TransientTransactionError')
  );
}

/** Unknown commit outcome: never re-run the work, only retry the same session's commit. */
function isUnknownCommit(error: unknown): boolean {
  return hasLabel(error, 'UnknownTransactionCommitResult');
}

/**
 * Duplicate keys and our own contract/Api exceptions carry a string code and
 * must reach the caller unchanged so they can become 409/400/etc. Raw Mongo
 * driver failures are masked so no host, port or stack text is leaked.
 */
function isCallerFacing(error: unknown): boolean {
  if (errorCode(error) === 11000) return true;
  return typeof errorCode(error) === 'string';
}

function isDriverFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('name' in error)) return false;
  const name = String((error as { name: unknown }).name);
  return (
    name === 'MongoServerError' ||
    name === 'MongoServerSelectionError' ||
    name === 'MongooseServerSelectionError' ||
    name === 'MongoNetworkError' ||
    name === 'MongoNetworkTimeoutError' ||
    name === 'MongoTimeoutError' ||
    name === 'MongoWriteConcernError' ||
    name === 'PoolClearedError'
  );
}

async function abortQuietly(session: ClientSession): Promise<void> {
  try {
    await session.abortTransaction();
  } catch {
    // Abort is best effort after the work already failed; endSession still runs.
  }
}

/**
 * Commits with a bounded same-session retry for unknown outcomes only. The
 * work is already done at this point, so this never re-runs it; a transient
 * write conflict on the commit itself propagates to the caller, which retries
 * the whole transaction from scratch.
 */
async function commitBounded(session: ClientSession): Promise<void> {
  for (let attempt = 0; attempt < MAX_COMMIT_ATTEMPTS; attempt += 1) {
    try {
      await session.commitTransaction();
      return;
    } catch (error) {
      if (isUnknownCommit(error) && attempt < MAX_COMMIT_ATTEMPTS - 1) continue;
      throw error;
    }
  }
}

/**
 * Bounded transaction retry with explicit session lifecycle.
 *
 * `connection.transaction()` in the driver retries the callback internally,
 * which made an outer loop exceed its advertised cap. Here the loop owns the
 * session, the commit and the abort, so `attempts` is a real bound. A commit
 * with an unknown result is retried on the same session (never re-running the
 * work) a bounded number of times, then fails closed as a stable 503;
 * caller-facing conflicts (duplicate key) pass through; raw Mongo errors are
 * masked rather than leaked. Session lifecycle failures (startSession) are
 * masked too, and endSession can never override the real business outcome.
 */
export async function withTxRetry<T>(
  connection: Connection,
  work: (session: ClientSession) => Promise<T>,
  attempts = 4,
): Promise<T> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let session: ClientSession;
    try {
      session = await connection.startSession();
    } catch (error) {
      // Raw driver territory before any work exists: mask, never leak.
      if (isCallerFacing(error)) throw error;
      throw serviceUnavailableError();
    }
    try {
      session.startTransaction(DEFAULT_OPTIONS);
      const result = await work(session);
      await commitBounded(session);
      return result;
    } catch (error) {
      if (isTransient(error) && !isUnknownCommit(error) && attempt < attempts - 1) {
        await abortQuietly(session);
        continue;
      }
      if (isUnknownCommit(error)) throw serviceUnavailableError();
      await abortQuietly(session);
      if (isCallerFacing(error)) throw error;
      if (isDriverFailure(error)) throw serviceUnavailableError();
      throw error;
    } finally {
      try {
        await session.endSession();
      } catch {
        // Cleanup must never override the real outcome reported above.
      }
    }
  }
  // Exhausted bounded retries: a stable, masked dependency error.
  throw serviceUnavailableError();
}
