import { describe, expect, it } from 'vitest';
import {
  apiErrorBodySchema,
  registerRequestSchema,
  loginRequestSchema,
  sessionCurrentSchema,
  userPublicSchema,
  MAX_SIGNATURE_CODEPOINTS,
} from './index';

const user = {
  id: '64b000000000000000000001',
  username: 'Reader_01',
  gender: 'unspecified',
  avatarUrl: null,
  signature: '',
  createdAt: '2026-11-18T00:00:00.000Z',
};

describe('M2a shared contracts', () => {
  it('accepts only the three registration fields', () => {
    expect(
      registerRequestSchema.parse({ email: 'a@b.example', username: 'Reader_01', password: 'correct-horse' }),
    ).toEqual({ email: 'a@b.example', username: 'Reader_01', password: 'correct-horse' });
    for (const extra of ['roles', 'role', 'userId', 'passwordHash', 'id', 'enabled']) {
      expect(() =>
        registerRequestSchema.parse({ email: 'a@b.example', username: 'Reader_01', password: 'correct-horse', [extra]: 'x' }),
      ).toThrow();
    }
  });

  it('accepts only the two login fields', () => {
    expect(loginRequestSchema.parse({ identifier: 'Reader_01', password: 'correct-horse' })).toBeDefined();
    expect(() => loginRequestSchema.parse({ identifier: 'Reader_01', password: 'x', roles: ['admin'] })).toThrow();
  });

  it('keeps UserPublic and SessionCurrent free of internal fields', () => {
    expect(userPublicSchema.parse(user)).toEqual(user);
    expect(() => userPublicSchema.parse({ ...user, email: 'a@b.example' })).toThrow();
    expect(() => userPublicSchema.parse({ ...user, token: 'x' })).toThrow();
    const session = { user, roles: ['user'], permissions: [], expiresAt: '2026-11-25T00:00:00.000Z' };
    expect(sessionCurrentSchema.parse(session)).toEqual(session);
    expect(() => sessionCurrentSchema.parse({ ...session, passwordHash: 'x' })).toThrow();
  });

  it('counts signature length in Unicode code points, not UTF-16 units', () => {
    // 200 astral characters are 200 code points but 400 UTF-16 units; a Zod
    // string .max(200) would wrongly reject them.
    const exactly200 = '🙂'.repeat(MAX_SIGNATURE_CODEPOINTS);
    expect(() => userPublicSchema.parse({ ...user, signature: exactly200 })).not.toThrow();
    expect(() => userPublicSchema.parse({ ...user, signature: '🙂'.repeat(MAX_SIGNATURE_CODEPOINTS + 1) })).toThrow();
  });

  it('exposes the frozen LAST_LOGIN_METHOD code in the error envelope', () => {
    expect(() =>
      apiErrorBodySchema.parse({
        error: {
          code: 'LAST_LOGIN_METHOD',
          message: 'At least one login method must remain.',
          details: [],
          requestId: 'req-1',
        },
      }),
    ).not.toThrow();
  });
});
