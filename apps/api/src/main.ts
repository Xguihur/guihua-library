import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { configureApp } from './bootstrap';
import { cliFailureMessage } from './config/cli-failure';
import { loadRootEnv } from './config/runtime';

async function bootstrap(): Promise<void> {
  // pnpm starts this package with apps/api as cwd; the real .env lives at the repo root.
  loadRootEnv();

  // Imported only after the root .env is loaded: @nestjs/config validates the
  // environment synchronously while ./app.module is being evaluated, so a static
  // import would run before loadRootEnv and fail on an existing .env setup.
  const { AppModule } = await import('./app.module');

  // Suppress Nest/Mongoose startup logs: connection errors can contain URIs and stacks.
  // abortOnError: false makes configuration/module failures reject this promise instead
  // of exiting the process, so every failure reaches the sanitized catch below.
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  configureApp(app);
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port, '127.0.0.1');

  // Only restore logging after startup (including the Mongoose connection) has succeeded,
  // so a failed connection cannot print its URI or stack through Nest/Mongoose loggers.
  app.useLogger(new Logger());
  Logger.log(`API listening on http://127.0.0.1:${port}/api`, 'Bootstrap');
}

bootstrap().catch(() => {
  // Fixed text only: no URI, credentials, stack or underlying error message.
  console.error(cliFailureMessage('api'));
  process.exitCode = 1;
});
