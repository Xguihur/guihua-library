import type { INestApplication } from '@nestjs/common';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { requestIdMiddleware } from './common/request-id.middleware';

/** Shared by main.ts and the integration harness so tests exercise the real HTTP stack. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new AllExceptionsFilter());

  const instance = app.getHttpAdapter().getInstance() as { disable?: (name: string) => void };
  instance.disable?.('x-powered-by');
}
