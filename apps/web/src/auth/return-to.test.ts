import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './return-to';

describe('safeReturnTo', () => {
  it('keeps an in-site absolute path with query and fragment', () => {
    expect(safeReturnTo('/books/64b000000000000000000001?page=2#top', '/me')).toBe('/books/64b000000000000000000001?page=2#top');
  });

  it('rejects external, scheme-relative and non-string targets', () => {
    for (const bad of [undefined, null, 42, 'https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/ok\u0000bad']) {
      expect(safeReturnTo(bad, '/me')).toBe('/me');
    }
  });
});
