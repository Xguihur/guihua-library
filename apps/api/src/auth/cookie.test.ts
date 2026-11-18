import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { SESSION_COOKIE_NAME } from '@guihua/contracts';
import { readSessionCookie } from './session.service';

function requestWithCookie(cookie?: string): Request {
  return { headers: cookie ? { cookie } : {} } as unknown as Request;
}

describe('session cookie parsing', () => {
  it('returns null when there is no cookie header', () => {
    expect(readSessionCookie(requestWithCookie())).toBeNull();
  });

  it('reads only the configured cookie and ignores lookalikes', () => {
    const token = 'opaque.token_value-123';
    expect(readSessionCookie(requestWithCookie(`other=x; ${SESSION_COOKIE_NAME}=${token}; last=y`))).toBe(token);
    expect(readSessionCookie(requestWithCookie('guihu_session_fake=abc'))).toBeNull();
  });

  it('treats a malformed percent-encoded cookie as a plain invalid token instead of throwing', () => {
    const malformed = '%E0%A4%A';
    expect(() => readSessionCookie(requestWithCookie(`${SESSION_COOKIE_NAME}=${malformed}`))).not.toThrow();
    expect(readSessionCookie(requestWithCookie(`${SESSION_COOKIE_NAME}=${malformed}`))).toBe(malformed);
  });
});
