import { z } from 'zod';
import { validateTestDatabaseUri } from './test-database';

const portSchema = z
  .string()
  .regex(/^[0-9]+$/, 'not_a_decimal_integer')
  .refine((value) => {
    const port = Number(value);
    return Number.isSafeInteger(port) && port >= 1 && port <= 65_535;
  }, 'out_of_range')
  .default('3000');

/**
 * Accepts only a concrete `mongodb://` URI with a host and a database name.
 * Error text never includes the URI value.
 */
function isValidMongoUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'mongodb:') return false;
  if (!url.hostname) return false;
  return url.pathname.length > 1;
}

/** Exact origins only: no wildcards, no scheme-relative entries. */
const originsSchema = z
  .string()
  .default('http://127.0.0.1:5173,http://localhost:5173')
  .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
  .refine((origins) => origins.length > 0 && origins.every((origin) => /^https?:\/\//.test(origin) && !origin.includes('*')), 'invalid_origin');

const optionalText = z.string().optional().default('');

/**
 * Browser redirects are built from this value, so it must be a concrete
 * http(s) site origin: no path, query, fragment, userinfo, wildcard or control
 * character. A trailing slash is normalized away so fixed paths append cleanly.
 */
const webBaseUrlSchema = z
  .string()
  .default('http://127.0.0.1:5173')
  .transform((value) => value.replace(/\/+$/, ''))
  .refine((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (!url.hostname || url.username || url.password) return false;
    if (url.pathname !== '' && url.pathname !== '/') return false;
    if (url.search || url.hash) return false;
    if (value.includes('*')) return false;
    for (const character of value) {
      const code = character.codePointAt(0) ?? 0;
      if (code <= 31 || code === 127) return false;
    }
    return true;
  }, 'invalid_web_base_url');

const positiveInt = (fallback: string) =>
  z
    .string()
    .regex(/^[0-9]+$/, 'not_a_decimal_integer')
    .default(fallback)
    .refine((value) => {
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed > 0;
    }, 'out_of_range');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: portSchema,
  MONGODB_URI: z.string().min(1, 'required').refine(isValidMongoUri, 'invalid_uri'),
  ALLOWED_ORIGINS: originsSchema,
  // M2c GitHub OAuth: empty values disable the related entries with a masked 503.
  GITHUB_CLIENT_ID: optionalText,
  GITHUB_CLIENT_SECRET: optionalText,
  GITHUB_CALLBACK_URL: z.string().optional().default('http://127.0.0.1:3000/api/oauth/github/callback'),
  GITHUB_AUTHORIZE_URL: z.string().optional().default('https://github.com/login/oauth/authorize'),
  GITHUB_TOKEN_URL: z.string().optional().default('https://github.com/login/oauth/access_token'),
  GITHUB_USER_URL: z.string().optional().default('https://api.github.com/user'),
  // M2c SMTP / mail capture.
  SMTP_HOST: optionalText,
  SMTP_PORT: positiveInt('1025'),
  SMTP_USER: optionalText,
  SMTP_PASS: optionalText,
  // Local Mailpit is plain SMTP; production must opt into TLS explicitly.
  SMTP_SECURE: z.string().optional().default('false').transform((value) => value === 'true'),
  SMTP_REQUIRE_TLS: z.string().optional().default('false').transform((value) => value === 'true'),
  SMTP_FROM: z.string().optional().default('no-reply@guihua.local'),
  MAIL_TIMEOUT_MS: positiveInt('5000'),
  MAILPIT_API_URL: z.string().optional().default('http://127.0.0.1:8025'),
  WEB_BASE_URL: webBaseUrlSchema,
});

export interface AppEnv {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  MONGODB_URI: string;
  ALLOWED_ORIGINS: string[];
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_CALLBACK_URL: string;
  GITHUB_AUTHORIZE_URL: string;
  GITHUB_TOKEN_URL: string;
  GITHUB_USER_URL: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASS: string;
  SMTP_SECURE: boolean;
  SMTP_REQUIRE_TLS: boolean;
  SMTP_FROM: string;
  MAIL_TIMEOUT_MS: number;
  MAILPIT_API_URL: string;
  WEB_BASE_URL: string;
}

/**
 * Fails fast on missing or malformed configuration.
 * Error text lists field names only: it never echoes URI values, credentials or stacks.
 */
export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'environment')))];
    throw new Error(`Invalid environment configuration for: ${fields.sort().join(', ')}`);
  }

  const env = parsed.data;
  if (env.NODE_ENV === 'test') {
    // Test runs may never point at a shared or development database.
    validateTestDatabaseUri(env.MONGODB_URI);
  }

  return {
    NODE_ENV: env.NODE_ENV,
    PORT: Number(env.PORT),
    MONGODB_URI: env.MONGODB_URI,
    ALLOWED_ORIGINS: env.ALLOWED_ORIGINS,
    GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: env.GITHUB_CLIENT_SECRET,
    GITHUB_CALLBACK_URL: env.GITHUB_CALLBACK_URL,
    GITHUB_AUTHORIZE_URL: env.GITHUB_AUTHORIZE_URL,
    GITHUB_TOKEN_URL: env.GITHUB_TOKEN_URL,
    GITHUB_USER_URL: env.GITHUB_USER_URL,
    SMTP_HOST: env.SMTP_HOST,
    SMTP_PORT: Number(env.SMTP_PORT),
    SMTP_USER: env.SMTP_USER,
    SMTP_PASS: env.SMTP_PASS,
    SMTP_SECURE: env.SMTP_SECURE,
    SMTP_REQUIRE_TLS: env.SMTP_REQUIRE_TLS,
    SMTP_FROM: env.SMTP_FROM,
    MAIL_TIMEOUT_MS: Number(env.MAIL_TIMEOUT_MS),
    MAILPIT_API_URL: env.MAILPIT_API_URL,
    WEB_BASE_URL: env.WEB_BASE_URL,
  };
}
