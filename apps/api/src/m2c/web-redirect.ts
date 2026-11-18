import type { ConfigService } from '@nestjs/config';

/**
 * The only browser destinations the API may redirect to. Keeping an explicit
 * allowlist means a request-supplied `returnTo` can never steer a navigation:
 * the destination is always a fixed in-site path on the validated WEB_BASE_URL.
 */
export const WEB_FIXED_PATHS = [
  '/oauth-result',
  '/books',
  '/settings',
  '/login',
  '/me',
] as const;

export const OAUTH_RESULT_PATH = '/oauth-result';

export function buildWebRedirect(
  config: ConfigService,
  path: (typeof WEB_FIXED_PATHS)[number],
  status?: string,
): string {
  // Defined by the server; a malformed entry is a programming error, not user input.
  if (!WEB_FIXED_PATHS.includes(path)) throw new Error('invalid_web_fixed_path');
  const base = config.getOrThrow<string>('WEB_BASE_URL');
  const target = `${base}${path}`;
  return status ? `${target}?status=${encodeURIComponent(status)}` : target;
}
