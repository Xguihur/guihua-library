import { scrypt } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { hashPassword, verifyDummyPassword, verifyPassword } from './password';

// Wrap the real scrypt so we can count KDF invocations without replacing the
// cryptographic work. The implementation reads this mocked binding at import time.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, scrypt: vi.fn(actual.scrypt) };
});

function clearKdfCalls(): void {
  (scrypt as unknown as { mockClear(): void }).mockClear();
}

function kdfCalls(): number {
  return (scrypt as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
}

describe('scrypt password hashing', () => {
  it('stores a self-describing hash that verifies the original password', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(hash).toMatch(/^scrypt\$131072\$8\$1\$/);
    expect(hash).not.toContain('correct-horse-battery');
    expect(await verifyPassword('correct-horse-battery', hash)).toBe(true);
    expect(await verifyPassword('wrong-horse-battery', hash)).toBe(false);
  });

  it('uses an independent salt for every password', async () => {
    const first = await hashPassword('same-password-value');
    const second = await hashPassword('same-password-value');
    expect(first).not.toBe(second);
  });

  it('returns false for malformed or missing hashes without throwing', async () => {
    expect(await verifyPassword('correct-horse-battery', null)).toBe(false);
    expect(await verifyPassword('correct-horse-battery', 'not-a-scrypt-hash')).toBe(false);
    expect(await verifyPassword('correct-horse-battery', 'scrypt$x$y$z$bad$bad')).toBe(false);
  });

  it('does equivalent dummy KDF work for null, invalid and unknown-account hashes', async () => {
    const hash = await hashPassword('correct-horse-battery');
    clearKdfCalls();

    await verifyPassword('correct-horse-battery', hash);
    const realWork = kdfCalls();
    expect(realWork).toBe(1);

    clearKdfCalls();
    await verifyPassword('correct-horse-battery', null);
    expect(kdfCalls()).toBe(realWork);

    clearKdfCalls();
    await verifyPassword('correct-horse-battery', 'legacy-invalid-hash');
    expect(kdfCalls()).toBe(realWork);

    clearKdfCalls();
    await verifyDummyPassword('correct-horse-battery');
    expect(kdfCalls()).toBe(realWork);
  });
});
