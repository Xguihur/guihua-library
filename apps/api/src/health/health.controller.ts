import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { serviceUnavailableError } from '../common/api-exception';

const PING_TIMEOUT_MS = 1500;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ok' }> {
    const db = this.connection.db;
    if (!db) throw serviceUnavailableError();
    try {
      await withTimeout(db.admin().command({ ping: 1 }), PING_TIMEOUT_MS);
    } catch {
      // The client only learns that a dependency is unavailable, never which one or why.
      throw serviceUnavailableError();
    }
    return { status: 'ok' };
  }
}
