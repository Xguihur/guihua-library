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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: portSchema,
  MONGODB_URI: z.string().min(1, 'required').refine(isValidMongoUri, 'invalid_uri'),
});

export interface AppEnv {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  MONGODB_URI: string;
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

  return { NODE_ENV: env.NODE_ENV, PORT: Number(env.PORT), MONGODB_URI: env.MONGODB_URI };
}
