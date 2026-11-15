import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorBody, ApiErrorCode, FieldIssue } from '@guihua/contracts';
import { ContractValidationError } from '@guihua/contracts';
import { ApiException } from './api-exception';
import type { RequestWithId } from './request-id.middleware';

interface ResolvedError {
  status: number;
  code: ApiErrorCode;
  message: string;
  details: FieldIssue[];
}

const UNAVAILABLE_ERROR_NAMES = new Set([
  'MongoServerSelectionError',
  'MongooseServerSelectionError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoTimeoutError',
  'PoolClearedError',
]);

function httpStatusToCode(status: number): ApiErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'VALIDATION_ERROR';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'IDENTITY_CONFLICT';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'UNPROCESSABLE_ENTITY';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    case HttpStatus.SERVICE_UNAVAILABLE:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR';
  }
}

function stableMessage(status: number, code: ApiErrorCode): string {
  if (code === 'VALIDATION_ERROR') return 'Request could not be processed.';
  if (code === 'NOT_FOUND') return 'Resource not found.';
  if (code === 'UNAUTHORIZED') return 'Authentication is required.';
  if (code === 'FORBIDDEN') return 'Access is denied.';
  if (code === 'SERVICE_UNAVAILABLE') return 'Service dependencies are unavailable.';
  if (status >= 500) return 'An unexpected error occurred.';
  return 'Request could not be processed.';
}

/** Only stable, contract-defined text and details leave the process. */
export function resolveError(exception: unknown): ResolvedError {
  if (exception instanceof ApiException) {
    return {
      status: exception.getStatus(),
      code: exception.code,
      message: exception.code === 'INTERNAL_ERROR' ? 'An unexpected error occurred.' : messageOf(exception.getResponse(), stableMessage(exception.getStatus(), exception.code)),
      details: exception.details,
    };
  }

  if (exception instanceof ContractValidationError) {
    // Shared query parsing rejects unknown or malformed parameters before any I/O.
    return {
      status: HttpStatus.BAD_REQUEST,
      code: 'VALIDATION_ERROR',
      message: 'Request could not be processed.',
      details: exception.details,
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code = httpStatusToCode(status);
    return { status, code, message: stableMessage(status, code), details: [] };
  }

  if (exception instanceof Error && UNAVAILABLE_ERROR_NAMES.has(exception.name)) {
    return {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Service dependencies are unavailable.',
      details: [],
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred.',
    details: [],
  };
}

function messageOf(body: string | object, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
    return body.message;
  }
  return fallback;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const requestId = request.requestId ?? 'unknown';
    const resolved = resolveError(exception);

    if (resolved.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Log the error class only: messages may contain connection details or credentials.
      const name = exception instanceof Error ? exception.name : 'UnknownError';
      this.logger.error(`requestId=${requestId} code=${resolved.code} error=${name}`);
    }

    const body: ApiErrorBody = {
      error: {
        code: resolved.code,
        message: resolved.message,
        details: resolved.details,
        requestId,
      },
    };
    response.status(resolved.status).json(body);
  }
}
