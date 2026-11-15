import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cliFailureMessage } from './cli-failure';
import { findRepoRoot } from './runtime';

const LEAKY = 'connect ECONNREFUSED mongodb://user:supersecret@db.internal:27017/guihua_library';

describe('CLI failure reporting', () => {
  it('returns one stable message regardless of the underlying error', () => {
    expect(cliFailureMessage('db:seed', new Error(LEAKY))).toBe(
      '[db:seed] failed. Check environment configuration and database availability; details are not printed.',
    );
    expect(cliFailureMessage('db:test:reset', { message: LEAKY })).toBe(
      '[db:test:reset] failed. Check environment configuration and database availability; details are not printed.',
    );
  });

  it('never includes the underlying error text or connection details', () => {
    const message = cliFailureMessage('db:seed', new Error(LEAKY));
    expect(message).not.toContain('ECONNREFUSED');
    expect(message).not.toContain('mongodb://');
    expect(message).not.toContain('supersecret');
    expect(message).not.toContain('db.internal');
    expect(message).not.toContain('at ');
  });

  it('routes every entry point through the sanitized reporter', () => {
    const root = findRepoRoot();
    const entryPoints = [
      'apps/api/src/main.ts',
      'apps/api/src/seed/seed.ts',
      'apps/api/src/scripts/reset-test-db.ts',
      'apps/api/scripts/verify-db-isolation.ts',
      'apps/api/test/smoke/smoke.ts',
    ];
    for (const entryPoint of entryPoints) {
      const source = readFileSync(path.join(root, entryPoint), 'utf8');
      expect(source).toContain('cliFailureMessage(');
      expect(source).not.toContain('error.message');
    }
  });
});
