import { describe, expect, it, vi } from 'vitest';
import type { Connection } from 'mongoose';
import { HealthController } from './health.controller';

function controllerWith(connection: unknown): HealthController {
  return new HealthController(connection as Connection);
}

describe('health controller', () => {
  it('reports liveness without touching the database', () => {
    expect(controllerWith({}).live()).toEqual({ status: 'ok' });
  });

  it('reports readiness when the ping succeeds', async () => {
    const command = vi.fn().mockResolvedValue({ ok: 1 });
    const controller = controllerWith({ db: { admin: () => ({ command }) } });
    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
    expect(command).toHaveBeenCalledWith({ ping: 1 });
  });

  it('fails readiness with 503 when the ping rejects', async () => {
    const controller = controllerWith({
      db: { admin: () => ({ command: vi.fn().mockRejectedValue(new Error('mongodb://secret')) }) },
    });
    await expect(controller.ready()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('fails readiness when the connection has no database handle', async () => {
    const controller = controllerWith({ db: undefined });
    await expect(controller.ready()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});
