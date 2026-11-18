import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { forbiddenError, validationError } from './common/api-exception';
import { requestIdMiddleware } from './common/request-id.middleware';

const WRITE_PATH_PREFIXES = ['/api/users', '/api/sessions', '/api/me'];
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Same-origin JSON writes only. Books/comments keep their M1 401 placeholder and
 * are intentionally out of scope here; OAuth GET callbacks carry their own state.
 */
function m2WriteGuard(allowedOrigins: Set<string>) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const isWrite =
      WRITE_METHODS.has(request.method) &&
      WRITE_PATH_PREFIXES.some((prefix) => request.path === prefix || request.path.startsWith(`${prefix}/`));
    if (!isWrite) {
      next();
      return;
    }

    const contentType = request.headers['content-type'] ?? '';
    // Compare the exact media type, not a prefix: `application/json-evil` is a
    // different type and must not slip through a startsWith check. Parameters
    // such as `; charset=utf-8` are stripped before comparison.
    const mediaType = typeof contentType === 'string' ? contentType.split(';', 1)[0].trim().toLowerCase() : '';
    if (mediaType !== 'application/json') {
      next(validationError('JSON body is required.', [{ field: 'content-type', reason: 'must_be_application_json' }]));
      return;
    }

    const origin = request.headers.origin;
    if (typeof origin !== 'string' || !allowedOrigins.has(origin)) {
      next(forbiddenError());
      return;
    }
    next();
  };
}

/** Shared by main.ts and the integration harness so tests exercise the real HTTP stack. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.use(requestIdMiddleware);
  app.use(m2WriteGuard(new Set(app.get(ConfigService).get<string[]>('ALLOWED_ORIGINS') ?? [])));
  app.useGlobalFilters(new AllExceptionsFilter());

  const instance = app.getHttpAdapter().getInstance() as { disable?: (name: string) => void };
  instance.disable?.('x-powered-by');
}
