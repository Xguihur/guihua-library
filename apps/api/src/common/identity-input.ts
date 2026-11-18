import {
  ContractValidationError,
  emptyJsonBodySchema,
  fieldIssuesFromZodError,
  loginRequestSchema,
  registerRequestSchema,
  profileUpdateSchema,
  USERNAME_PATTERN,
  MAX_EMAIL_LENGTH,
  PASSWORD_MIN_CODEPOINTS,
  PASSWORD_MAX_CODEPOINTS,
  PASSWORD_MAX_BYTES,
  type LoginRequest,
  type ProfileUpdate,
  type RegisterRequest,
} from '@guihua/contracts';
import { invalidUsernameError, validationError } from './api-exception';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Zod strict schemas are the single source of truth for accepted fields. */
export function parseEmptyJsonBody(body: unknown): void {
  const result = emptyJsonBodySchema.safeParse(body ?? {});
  if (!result.success) {
    throw new ContractValidationError(fieldIssuesFromZodError(result.error, 'unknown_field'));
  }
}

export function parseRegisterBody(body: unknown): RegisterRequest {
  const result = registerRequestSchema.safeParse(body ?? {});
  if (!result.success) {
    throw new ContractValidationError(fieldIssuesFromZodError(result.error, 'unknown_field'));
  }
  return result.data;
}

export function parseLoginBody(body: unknown): LoginRequest {
  const result = loginRequestSchema.safeParse(body ?? {});
  if (!result.success) {
    throw new ContractValidationError(fieldIssuesFromZodError(result.error, 'unknown_field'));
  }
  return result.data;
}

export function parseProfileUpdateBody(body: unknown): ProfileUpdate {
  const result = profileUpdateSchema.safeParse(body ?? {});
  if (!result.success) {
    throw new ContractValidationError(fieldIssuesFromZodError(result.error, 'unknown_field'));
  }
  return result.data;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeIdentifier(value: string): { kind: 'email' | 'username'; value: string } {
  const trimmed = value.trim();
  return trimmed.includes('@')
    ? { kind: 'email', value: normalizeEmail(trimmed) }
    : { kind: 'username', value: normalizeUsername(trimmed) };
}

export function assertUsername(value: string): string {
  const trimmed = value.trim();
  if (!USERNAME_PATTERN.test(trimmed)) throw invalidUsernameError();
  return trimmed;
}

export function assertEmail(value: string): string {
  const normalized = normalizeEmail(value);
  if (normalized.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(normalized)) {
    throw validationError('Email is not valid.', [{ field: 'email', reason: 'invalid_email' }]);
  }
  return normalized;
}

/** Counts Unicode code points and UTF-8 bytes; never trims or normalizes the password. */
export function assertPassword(value: string): string {
  const codePoints = [...value].length;
  const bytes = Buffer.byteLength(value, 'utf8');
  if (
    codePoints < PASSWORD_MIN_CODEPOINTS ||
    codePoints > PASSWORD_MAX_CODEPOINTS ||
    bytes > PASSWORD_MAX_BYTES
  ) {
    throw validationError('Password does not meet the length rules.', [
      { field: 'password', reason: 'invalid_length' },
    ]);
  }
  return value;
}
