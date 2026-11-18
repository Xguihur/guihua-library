import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Node's native asynchronous scrypt. Parameters follow the frozen ADR 0002 §2:
 * OWASP minimum N=2^17, r=8, p=1 with a 256 MiB maxmem headroom.
 * Nothing here is a custom KDF and no sync call blocks the request thread.
 */
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Injectable seam for the KDF. Production uses the real functions below; tests
 * override this token to pause scrypt and prove that a session revoked mid-hash
 * cannot still write credentials. This is a learning-oriented, explicit seam —
 * it does not change the algorithm or weaken any check.
 */
export const PASSWORD_HASHER = 'PASSWORD_HASHER';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, encoded: string | null | undefined): Promise<boolean>;
  verifyDummy(password: string): Promise<void>;
}

export const scryptPasswordHasher: PasswordHasher = {
  hash: hashPassword,
  verify: verifyPassword,
  verifyDummy: verifyDummyPassword,
};

export const SCRYPT_N = 131_072;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_KEYLEN = 64;
export const SCRYPT_SALT_BYTES = 16;
const MAXMEM = 256 * 1024 * 1024;

const OPTIONS: ScryptOptions = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: MAXMEM };

/** Encodes algorithm, parameters, salt and derived key in one self-describing string. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const key = await scrypt(password, salt, SCRYPT_KEYLEN, OPTIONS);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

interface ParsedHash {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  expected: Buffer;
}

/** Structurally and safely parse a self-describing hash; unusable records return null. */
function parseHash(encoded: string | null | undefined): ParsedHash | null {
  if (!encoded) return null;
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  // Keep cost sane: at least the frozen baseline, a power of two, and bounded
  // so a corrupt legacy record cannot allocate unbounded memory or finish
  // noticeably faster than the dummy work.
  if (
    ![n, r, p].every((value) => Number.isSafeInteger(value) && value > 0) ||
    n < SCRYPT_N || n > SCRYPT_N * 4 || (n & (n - 1)) !== 0 ||
    r > 64 || p > 16
  ) {
    return null;
  }

  const salt = Buffer.from(parts[4] ?? '', 'base64');
  const expected = Buffer.from(parts[5] ?? '', 'base64');
  if (salt.length !== SCRYPT_SALT_BYTES || expected.length !== SCRYPT_KEYLEN) return null;
  return { n, r, p, salt, expected };
}

/** One canonical-cost scrypt computation used whenever no usable hash exists. */
const DUMMY_SALT = Buffer.alloc(SCRYPT_SALT_BYTES, 0xa5);
function dummyWork(password: string): Promise<Buffer> {
  return scrypt(password, DUMMY_SALT, SCRYPT_KEYLEN, OPTIONS);
}

/**
 * Constant-time comparison with one scrypt computation on every path. OAuth-only
 * accounts (null hash), malformed legacy hashes and unknown accounts all do the
 * same dummy work so login timing does not reveal which case occurred.
 */
export async function verifyPassword(password: string, encoded: string | null | undefined): Promise<boolean> {
  const parsed = parseHash(encoded);
  if (!parsed) {
    await dummyWork(password);
    return false;
  }

  const maxmem = Math.max(MAXMEM, 128 * parsed.n * parsed.r * 2);
  const derived = await scrypt(password, parsed.salt, parsed.expected.length, {
    N: parsed.n, r: parsed.r, p: parsed.p, maxmem,
  });
  return derived.length === parsed.expected.length && timingSafeEqual(derived, parsed.expected);
}

/** Unknown accounts do the same KDF work so login timing does not reveal existence. */
export async function verifyDummyPassword(password: string): Promise<void> {
  await dummyWork(password);
}

/** Whether a stored hash is structurally usable as a real login credential. */
export function hasUsablePasswordHash(encoded: string | null | undefined): boolean {
  return parseHash(encoded) !== null;
}
