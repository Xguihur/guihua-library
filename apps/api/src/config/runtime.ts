import { existsSync } from 'node:fs';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

/**
 * Resolves the repository root from any directory inside the checkout.
 *
 * pnpm runs package scripts with the package as cwd (`apps/api`), while a
 * developer may also run entry points from the repository root. Never assume
 * `process.cwd()` itself is the root.
 */
export function findRepoRoot(startDir: string = process.cwd()): string {
  let current = path.resolve(startDir);
  for (;;) {
    if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error('Unable to locate the repository root (pnpm-workspace.yaml not found).');
    }
    current = parent;
  }
}

/**
 * Loads the repository-root `.env` without overriding variables already set by
 * the caller (shell or CI). Missing `.env` is allowed; required values are
 * still validated by the entry point that needs them.
 */
export function loadRootEnv(startDir?: string): void {
  const envFile = path.join(findRepoRoot(startDir), '.env');
  if (existsSync(envFile)) {
    loadDotenv({ path: envFile });
  }
}
