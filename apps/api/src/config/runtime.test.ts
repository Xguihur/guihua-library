import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findRepoRoot, loadRootEnv } from './runtime';

const ENV_KEY = 'GUIHUA_RUNTIME_TEST_VALUE';
const tempDirs: string[] = [];
const previousValue = process.env[ENV_KEY];

function makeCheckout(): { root: string; nested: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'guihua-runtime-'));
  tempDirs.push(root);
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n');
  const nested = path.join(root, 'apps', 'api');
  mkdirSync(nested, { recursive: true });
  return { root, nested };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  if (previousValue === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = previousValue;
  }
});

describe('repository runtime paths', () => {
  it('finds the repository root from any directory inside the checkout', () => {
    const { root, nested } = makeCheckout();
    expect(findRepoRoot(nested)).toBe(root);
    expect(findRepoRoot(path.join(nested, 'src', 'config'))).toBe(root);
    expect(existsSync(path.join(findRepoRoot(), 'pnpm-workspace.yaml'))).toBe(true);
  });

  it('loads .env from the repository root instead of the current directory', () => {
    const { root, nested } = makeCheckout();
    writeFileSync(path.join(root, '.env'), `${ENV_KEY}=from-root\n`);
    delete process.env[ENV_KEY];

    loadRootEnv(nested);

    expect(process.env[ENV_KEY]).toBe('from-root');
  });

  it('does not override variables already present in the environment', () => {
    const { root, nested } = makeCheckout();
    writeFileSync(path.join(root, '.env'), `${ENV_KEY}=from-file\n`);
    process.env[ENV_KEY] = 'from-shell';

    loadRootEnv(nested);

    expect(process.env[ENV_KEY]).toBe('from-shell');
  });
});
