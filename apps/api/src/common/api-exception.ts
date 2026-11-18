import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorCode, FieldIssue } from '@guihua/contracts';

/** A contract-shaped HTTP error. Only ApiException bodies reach the client verbatim. */
export class ApiException extends HttpException {
  readonly code: ApiErrorCode;
  readonly details: FieldIssue[];
  readonly headers: Record<string, string>;

  constructor(
    status: HttpStatus,
    code: ApiErrorCode,
    message: string,
    details: FieldIssue[] = [],
    headers: Record<string, string> = {},
  ) {
    super({ code, message, details }, status);
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

export function validationError(message: string, details: FieldIssue[]): ApiException {
  return new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', message, details);
}

export function notFoundError(): ApiException {
  return new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Resource not found.');
}

export function unauthorizedError(): ApiException {
  return new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Authentication is required.');
}

export function invalidUsernameError(): ApiException {
  return new ApiException(HttpStatus.BAD_REQUEST, 'INVALID_USERNAME', 'Username is not valid.', [
    { field: 'username', reason: 'invalid_username' },
  ]);
}

export function invalidCredentialsError(): ApiException {
  return new ApiException(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Invalid credentials.');
}

export function identityConflictError(field?: string): ApiException {
  const details = field ? [{ field, reason: 'already_in_use' }] : [];
  return new ApiException(HttpStatus.CONFLICT, 'IDENTITY_CONFLICT', 'Identity is already in use.', details);
}

export function forbiddenError(message = 'Access is denied.'): ApiException {
  return new ApiException(HttpStatus.FORBIDDEN, 'FORBIDDEN', message);
}

export function lastLoginMethodError(): ApiException {
  return new ApiException(
    HttpStatus.CONFLICT,
    'LAST_LOGIN_METHOD',
    'At least one login method must remain.',
  );
}

export function rateLimitedError(retryAfterSeconds: number): ApiException {
  return new ApiException(
    HttpStatus.TOO_MANY_REQUESTS,
    'RATE_LIMITED',
    'Too many requests.',
    [],
    { 'Retry-After': String(Math.max(1, retryAfterSeconds)) },
  );
}

export function serviceUnavailableError(): ApiException {
  return new ApiException(
    HttpStatus.SERVICE_UNAVAILABLE,
    'SERVICE_UNAVAILABLE',
    'Service dependencies are unavailable.',
  );
}
