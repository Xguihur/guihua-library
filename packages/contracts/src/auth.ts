import { z } from 'zod';

/**
 * Browser-safe account vocabulary shared by the API and its HTTP assertions.
 * Secrets, token digests and internal database fields never live here.
 */

export const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,31}$/;
export const GENDERS = ['unspecified', 'male', 'female', 'other'] as const;
export type Gender = (typeof GENDERS)[number];

export const SESSION_COOKIE_NAME = 'guihua_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// M2c OAuth / reauthentication / email challenge protocol constants (§6).
export const GITHUB_LOGIN_USERNAME_PREFIX = 'gh_';
export const OAUTH_COOKIE_NAME = 'guihua_oauth';
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const REAUTH_WINDOW_MS = 5 * 60 * 1000;
export const EMAIL_CHALLENGE_TTL_MS = 10 * 60 * 1000;

export const MAX_EMAIL_LENGTH = 254;
export const PASSWORD_MIN_CODEPOINTS = 12;
export const PASSWORD_MAX_CODEPOINTS = 128;
export const PASSWORD_MAX_BYTES = 512;
export const MAX_SIGNATURE_CODEPOINTS = 200;
export const MAX_AVATAR_URL_LENGTH = 2048;

/** Unicode code points, not UTF-16 units: astral characters count once. */
export function countCodePoints(value: string): number {
  return [...value].length;
}

export interface UserPublicDto {
  id: string;
  username: string;
  gender: Gender;
  avatarUrl: string | null;
  signature: string;
  createdAt: string;
}

export interface SessionCurrentDto {
  user: UserPublicDto;
  roles: string[];
  permissions: string[];
  expiresAt: string;
}

/** The only fields accepted by each M2a write endpoint; everything else is rejected. */
export const registerRequestSchema = z
  .object({
    email: z.string(),
    username: z.string(),
    password: z.string(),
  })
  .strict();

export const loginRequestSchema = z
  .object({
    identifier: z.string(),
    password: z.string(),
  })
  .strict();

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;

const httpsUrl = z
  .string()
  .max(MAX_AVATAR_URL_LENGTH)
  .refine((value) => {
    if (!/^https:\/\//i.test(value)) return false;
    if ([...value].some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)) return false;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.username === '' && url.password === '';
    } catch {
      return false;
    }
  }, 'invalid_avatar_url');

/** Rejects C0 controls (tab and newline are allowed) and DEL. */
function isSafeSignature(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 31 && code !== 9 && code !== 10) return false;
    if (code === 127) return false;
  }
  return true;
}

const signatureResponse = z
  .string()
  .refine((value) => countCodePoints(value) <= MAX_SIGNATURE_CODEPOINTS, 'invalid_signature_length');

const signatureInput = z
  .string()
  .refine((value) => countCodePoints(value) <= MAX_SIGNATURE_CODEPOINTS && isSafeSignature(value), 'invalid_signature');

/** The only fields a user may edit, and nothing else. */
export const profileUpdateSchema = z
  .object({
    username: z.string().optional(),
    gender: z.enum(GENDERS).optional(),
    avatarUrl: httpsUrl.nullable().optional(),
    signature: signatureInput.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'empty_profile_update');

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export const userPublicSchema = z.object({
  id: z.string().min(1),
  username: z.string().regex(USERNAME_PATTERN, 'invalid_username'),
  gender: z.enum(GENDERS),
  avatarUrl: httpsUrl.nullable(),
  signature: signatureResponse,
  createdAt: z.string().datetime(),
}).strict();

export const sessionCurrentSchema = z.object({
  user: userPublicSchema,
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  expiresAt: z.string().datetime(),
}).strict();

/** M2c §6 request/response shapes. Every write body is strict; no server field is accepted. */
export const emptyJsonBodySchema = z.object({}).strict();

/**
 * RFC 9207 §2 (https://www.rfc-editor.org/rfc/rfc9207.html): the authorization
 * response MAY include `iss` and clients MUST NOT ignore it. The real GitHub
 * callback sends `iss=https://github.com/login/oauth`; only that issuer is
 * accepted (github.com only, no extra configuration). An absent `iss` stays
 * valid so older official responses and the simulated test double keep working.
 * A duplicated query parameter arrives as an array and still fails validation,
 * and the object stays strict so unknown query fields are never stripped.
 */
export const GITHUB_AUTHORIZATION_ISSUER = 'https://github.com/login/oauth';

export const oauthCallbackQuerySchema = z
  .object({
    code: z.string().min(1),
    state: z.string().min(1),
    iss: z.literal(GITHUB_AUTHORIZATION_ISSUER).optional(),
  })
  .strict();

export const passwordReauthSchema = z.object({ password: z.string() }).strict();

export const emailVerificationRequestSchema = z.object({ email: z.string() }).strict();

/** `{token,password}` when adding a password, `{token}` when only confirming an existing email. */
export const passwordCredentialSchema = z
  .object({ token: z.string().min(1), password: z.string().optional() })
  .strict();

export const loginMethodsSchema = z
  .object({
    github: z.object({ linked: z.boolean() }).strict(),
    password: z.object({ enabled: z.boolean(), email: z.string().nullable() }).strict(),
  })
  .strict();

export const authorizationUrlSchema = z
  .object({ authorizationUrl: z.string().url() })
  .strict();

export type LoginMethodsDto = z.infer<typeof loginMethodsSchema>;
export type AuthorizationUrlDto = z.infer<typeof authorizationUrlSchema>;
