/**
 * Only same-origin absolute paths may be returned to after login. External URLs,
 * scheme-relative `//` paths and control characters are replaced by the fallback.
 */
export function safeReturnTo(value: unknown, fallback = '/me'): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.includes('\\')) return fallback;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 31 || code === 127) return fallback;
  }
  try {
    const origin = globalThis.location?.origin ?? 'http://localhost';
    const url = new URL(value, origin);
    if (url.origin !== origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
