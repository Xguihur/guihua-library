import { createHash, randomBytes } from 'node:crypto';

/** Every raw state/challenge/cookie token is stored only as this digest. */
export function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** 32 random bytes, URL-safe; used for state, PKCE verifier, tokens and cookies. */
export function opaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** A valid, collision-unlikely `gh_` username (starts with a letter, ASCII alnum). */
export function githubUsername(): string {
  return `gh_${randomBytes(8).toString('hex')}`;
}
