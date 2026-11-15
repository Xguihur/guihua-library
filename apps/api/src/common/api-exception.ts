import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorCode, FieldIssue } from '@guihua/contracts';

/** A contract-shaped HTTP error. Only ApiException bodies reach the client verbatim. */
export class ApiException extends HttpException {
  readonly code: ApiErrorCode;
  readonly details: FieldIssue[];

  constructor(status: HttpStatus, code: ApiErrorCode, message: string, details: FieldIssue[] = []) {
    super({ code, message, details }, status);
    this.code = code;
    this.details = details;
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

export function serviceUnavailableError(): ApiException {
  return new ApiException(
    HttpStatus.SERVICE_UNAVAILABLE,
    'SERVICE_UNAVAILABLE',
    'Service dependencies are unavailable.',
  );
}
