import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger, NotFoundException, type ArgumentsHost } from '@nestjs/common';
import type { Response } from 'express';
import { ContractValidationError, type ApiErrorBody } from '@guihua/contracts';
import { AllExceptionsFilter, resolveError } from './all-exceptions.filter';
import { serviceUnavailableError, unauthorizedError, validationError } from './api-exception';
import type { RequestWithId } from './request-id.middleware';

function createHost(requestId = 'req-1') {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const response = { status } as unknown as Response;
  const request = { requestId } as RequestWithId;
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('exception filter', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders contract validation details as 400', () => {
    const { host, status, json } = createHost();
    new AllExceptionsFilter().catch(new ContractValidationError([{ field: 'page', reason: 'out_of_range' }]), host);
    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0]?.[0] as ApiErrorBody;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual([{ field: 'page', reason: 'out_of_range' }]);
    expect(body.error.requestId).toBe('req-1');
  });

  it('keeps ApiException code and status paired', () => {
    const { host, status, json } = createHost();
    new AllExceptionsFilter().catch(
      validationError('The book id is not valid.', [{ field: 'bookId', reason: 'invalid_object_id' }]),
      host,
    );
    expect(status).toHaveBeenCalledWith(400);
    expect((json.mock.calls[0]?.[0] as ApiErrorBody).error.code).toBe('VALIDATION_ERROR');
  });

  it('maps anonymous writes to 401 UNAUTHORIZED', () => {
    const { host, status, json } = createHost();
    new AllExceptionsFilter().catch(unauthorizedError(), host);
    expect(status).toHaveBeenCalledWith(401);
    expect((json.mock.calls[0]?.[0] as ApiErrorBody).error.code).toBe('UNAUTHORIZED');
  });

  it('maps unknown routes to a stable 404 body', () => {
    const { host, status, json } = createHost();
    new AllExceptionsFilter().catch(new NotFoundException(), host);
    expect(status).toHaveBeenCalledWith(404);
    const body = json.mock.calls[0]?.[0] as ApiErrorBody;
    expect(body.error).toEqual({ code: 'NOT_FOUND', message: 'Resource not found.', details: [], requestId: 'req-1' });
  });

  it('masks unexpected errors and keeps connection details out of the response', () => {
    const { host, status, json } = createHost();
    const exception = new Error('connect ECONNREFUSED mongodb://user:pass@db.internal:27017');
    new AllExceptionsFilter().catch(exception, host);
    expect(status).toHaveBeenCalledWith(500);
    const serialized = JSON.stringify(json.mock.calls[0]?.[0]);
    expect(serialized).not.toContain('ECONNREFUSED');
    expect(serialized).not.toContain('db.internal');
    expect(serialized).not.toContain('pass');
    expect((json.mock.calls[0]?.[0] as ApiErrorBody).error.code).toBe('INTERNAL_ERROR');
  });

  it('maps database unavailability to a sanitized 503', () => {
    const { host, status, json } = createHost();
    const exception = new Error('connection <monitor> to 127.0.0.1:27018 closed');
    exception.name = 'MongoServerSelectionError';
    new AllExceptionsFilter().catch(exception, host);
    expect(status).toHaveBeenCalledWith(503);
    const body = json.mock.calls[0]?.[0] as ApiErrorBody;
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('27018');
  });

  it('resolves a 503 ApiException without exposing dependency names', () => {
    expect(resolveError(serviceUnavailableError())).toEqual({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Service dependencies are unavailable.',
      details: [],
    });
  });
});
