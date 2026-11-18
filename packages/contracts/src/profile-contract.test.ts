import { describe, expect, it } from 'vitest';
import { MAX_SIGNATURE_CODEPOINTS, profileUpdateSchema } from './index';

const HTTPS_AVATAR = 'https://cdn.example.com/avatar.png';

describe('M2b profile update contract', () => {
  it('accepts a non-empty subset of exactly the four editable fields', () => {
    expect(
      profileUpdateSchema.parse({ signature: 'hello', gender: 'female' }),
    ).toEqual({ signature: 'hello', gender: 'female' });
    expect(profileUpdateSchema.parse({ avatarUrl: null })).toEqual({ avatarUrl: null });
    expect(profileUpdateSchema.parse({ username: 'Reader_01' })).toEqual({ username: 'Reader_01' });
  });

  it('rejects an empty object and any unknown or server-controlled field', () => {
    expect(() => profileUpdateSchema.parse({})).toThrow();
    for (const extra of ['email', 'roles', 'role', 'enabled', 'id', 'ownerId', 'passwordHash', 'accountVersion']) {
      expect(() => profileUpdateSchema.parse({ signature: 'ok', [extra]: 'x' })).toThrow();
    }
  });

  it('only accepts the declared gender enum', () => {
    for (const gender of ['unspecified', 'male', 'female', 'other']) {
      expect(profileUpdateSchema.parse({ gender })).toEqual({ gender });
    }
    expect(() => profileUpdateSchema.parse({ gender: 'admin' })).toThrow();
  });

  it('counts signature length by code points and rejects C0 control characters', () => {
    expect(profileUpdateSchema.parse({ signature: '🙂'.repeat(MAX_SIGNATURE_CODEPOINTS) })).toBeDefined();
    expect(() => profileUpdateSchema.parse({ signature: '🙂'.repeat(MAX_SIGNATURE_CODEPOINTS + 1) })).toThrow();
    // Newline and tab are allowed; other C0 controls and DEL are not.
    expect(profileUpdateSchema.parse({ signature: 'line1\nline2\tend' })).toBeDefined();
    for (const control of ['\u0000', '\u0001', '\u001f', '\r', '\u007f']) {
      expect(() => profileUpdateSchema.parse({ signature: `bad${control}value` })).toThrow();
    }
  });

  it('only accepts null or a bounded HTTPS absolute URL without userinfo or controls', () => {
    expect(profileUpdateSchema.parse({ avatarUrl: HTTPS_AVATAR })).toEqual({ avatarUrl: HTTPS_AVATAR });
    expect(profileUpdateSchema.parse({ avatarUrl: null })).toEqual({ avatarUrl: null });
    for (const bad of [
      'http://cdn.example.com/a.png',
      '//cdn.example.com/a.png',
      'https://user:pass@cdn.example.com/a.png',
      'https://cdn.example.com/a\u0000.png',
      'javascript:alert(1)',
      `https://cdn.example.com/${'a'.repeat(2100)}`,
    ]) {
      expect(() => profileUpdateSchema.parse({ avatarUrl: bad })).toThrow();
    }
  });
});
