import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import mongoose from 'mongoose';
import { SESSION_COOKIE_NAME } from '@guihua/contracts';
import { chromium, type Browser, type Page } from 'playwright';
import { cliFailureMessage } from '../../src/config/cli-failure';
import { findRepoRoot, loadRootEnv } from '../../src/config/runtime';
import { FIXTURE_IDS, seedFixtures } from '../../src/seed/fixtures';
import { validateTestDatabaseUri } from '../../src/config/test-database';

/**
 * Browser smoke test: real web build -> Vite preview -> API -> MongoDB test database.
 * It starts only its own processes, uses its own ports, and cleans up afterwards.
 */

const API_PORT = 3100;
const WEB_PORT = 4173;
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const WEB_BASE = `http://127.0.0.1:${WEB_PORT}`;
const REPO_ROOT = findRepoRoot();
const ARTIFACTS = path.join(REPO_ROOT, 'smoke-artifacts');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Claims the port before any child process starts. Smoke must never talk to a
 * service it did not start, so an occupied port is a hard failure rather than
 * a reason to fall back to another port.
 */
function assertPortFree(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once('error', () => {
      reject(new Error(`Port ${port} is already in use; smoke only uses ports it owns.`));
    });
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      probe.close((error) => (error ? reject(error) : resolve()));
    });
  });
}

async function waitForHttp(url: string, child: ChildProcess, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // A child that exited cannot be the service answering on this port; stop
    // instead of waiting for whatever else may be listening.
    if (child.exitCode !== null) {
      throw new Error(`Process exited before ${url} became ready.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep waiting until the process is listening
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stop(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function spawnLogged(
  command: string,
  args: string[],
  logName: string,
  env: NodeJS.ProcessEnv,
  cwd = REPO_ROOT,
): ChildProcess {
  const log = createWriteStream(path.join(ARTIFACTS, logName), { flags: 'a' });
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  return child;
}

async function runBrowserFlow(page: Page): Promise<void> {
  await page.goto(`${WEB_BASE}/books`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('book-card').first().waitFor({ timeout: 20000 });

  const published = await page.getByTestId('book-card').count();
  assert(published === 5, `expected 5 published books, saw ${published}`);

  await page.getByTestId('filter-finished').click();
  await page.getByTestId('result-meta').filter({ hasText: '共 2 条记录' }).waitFor({ timeout: 10000 });
  const finished = await page.getByTestId('book-card').count();
  assert(finished === 2, `expected 2 finished books, saw ${finished}`);

  await page.getByTestId('filter-all').click();
  await page.getByTestId('result-meta').filter({ hasText: '共 5 条记录' }).waitFor({ timeout: 10000 });

  await page.getByTestId('book-card').first().getByRole('link').click();
  await page.getByTestId('detail-title').waitFor({ timeout: 10000 });
  await page.waitForURL(/\/books\/[a-f0-9]{24}$/, { timeout: 10000 });

  const cliffId = FIXTURE_IDS.books.cliff.toHexString();
  await page.goto(`${WEB_BASE}/books/${cliffId}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('detail-title').filter({ hasText: '悬崖' }).waitFor({ timeout: 10000 });
  await page.getByTestId('detail-review').filter({ hasText: '读得很慢' }).waitFor({ timeout: 10000 });
  await page.getByTestId('comment-item').first().waitFor({ timeout: 10000 });
  const comments = await page.getByTestId('comment-item').count();
  assert(comments === 2, `expected 2 public comments, saw ${comments}`);

  await page.getByTestId('back-link').click();
  await page.waitForURL(`${WEB_BASE}/books`, { timeout: 10000 });
  await page.getByTestId('book-card').first().waitFor({ timeout: 10000 });

  const hiddenId = FIXTURE_IDS.books.hidden.toHexString();
  await page.goto(`${WEB_BASE}/books/${hiddenId}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('not-found-state').waitFor({ timeout: 10000 });

  const anonymousWrite = await page.evaluate(async () => {
    const response = await fetch('/api/books', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'anonymous smoke attempt' }),
    });
    const body = (await response.json()) as { error?: { code?: string } };
    return { status: response.status, code: body.error?.code };
  });
  assert(anonymousWrite.status === 401, `expected anonymous POST to return 401, saw ${anonymousWrite.status}`);
  assert(anonymousWrite.code === 'UNAUTHORIZED', `expected UNAUTHORIZED, saw ${anonymousWrite.code}`);
}

/** Registration, reload restore, profile edit, logout and the old-cookie 401 check. */
async function runAuthFlow(page: Page): Promise<void> {
  await page.goto(`${WEB_BASE}/register`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('register-email').fill('smoke@example.com');
  await page.getByTestId('register-username').fill('Smoke_Reader');
  await page.getByTestId('register-password').fill('smoke-password-2026');
  await page.getByTestId('register-submit').click();
  await page.getByTestId('profile-save').waitFor({ timeout: 15000 });
  await page.waitForURL(/\/me$/, { timeout: 10000 });
  await page.getByTestId('nav-user').filter({ hasText: 'Smoke_Reader' }).waitFor({ timeout: 10000 });

  const sessionCookie = (await page.context().cookies())
    .filter((cookie) => cookie.name === SESSION_COOKIE_NAME)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
  assert(sessionCookie.length > 0, 'expected an opaque session cookie after registration');

  // Refresh restores identity from the server session, not from local storage.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('nav-user').filter({ hasText: 'Smoke_Reader' }).waitFor({ timeout: 10000 });

  // A valid session still gets a truthful 403 for unopened M3 writes.
  const authedWrite = await page.evaluate(async () => {
    const response = await fetch('/api/books', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'valid session smoke attempt' }),
    });
    const body = (await response.json()) as { error?: { code?: string } };
    return { status: response.status, code: body.error?.code };
  });
  assert(authedWrite.status === 403, `expected authenticated POST to return 403, saw ${authedWrite.status}`);
  assert(authedWrite.code === 'FORBIDDEN', `expected FORBIDDEN, saw ${authedWrite.code}`);

  // Account settings reads this user's own login methods; GitHub is unconfigured
  // in smoke, so only the status and guidance are asserted, never a real OAuth.
  await page.goto(`${WEB_BASE}/settings`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('github-status').filter({ hasText: '未绑定' }).waitFor({ timeout: 10000 });
  await page.getByTestId('password-status').filter({ hasText: 'smoke@example.com' }).waitFor({ timeout: 10000 });
  await page.goto(`${WEB_BASE}/me`, { waitUntil: 'domcontentloaded' });

  // Profile edit survives a reload and is rendered as plain text.
  await page.getByTestId('profile-signature').fill('smoke 签名更新');
  await page.getByTestId('profile-save').click();
  await page.getByTestId('profile-saved').waitFor({ timeout: 10000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('profile-signature').waitFor({ timeout: 10000 });
  const signature = await page.getByTestId('profile-signature').inputValue();
  assert(signature === 'smoke 签名更新', `expected saved signature, saw ${signature}`);

  // Logout clears the local identity; the previously issued cookie is now inert.
  await page.getByTestId('nav-logout').click();
  await page.getByTestId('nav-login').waitFor({ timeout: 10000 });
  const oldCookie = await fetch(`${API_BASE}/api/sessions/current`, { headers: { Cookie: sessionCookie } });
  assert(oldCookie.status === 401, `expected old cookie to return 401, saw ${oldCookie.status}`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('nav-login').waitFor({ timeout: 10000 });

  // The login page exposes a GitHub entry with explicit no-auto-merge guidance.
  await page.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('github-login').waitFor({ timeout: 10000 });
  const guidance = await page.getByTestId('github-login').locator('..').innerText();
  assert(guidance.includes('已有邮箱账号不会按邮箱合并'), 'expected GitHub entry to explain no auto-merge');
}

async function main(): Promise<void> {
  loadRootEnv();

  const uri = process.env.TEST_MONGODB_URI;
  if (!uri) {
    throw new Error('TEST_MONGODB_URI is required for smoke; there is no fallback to MONGODB_URI.');
  }
  const target = validateTestDatabaseUri(uri);

  mkdirSync(ARTIFACTS, { recursive: true });

  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  const db = connection.db;
  if (!db) throw new Error('Test database handle is unavailable.');

  let api: ChildProcess | null = null;
  let web: ChildProcess | null = null;
  let browser: Browser | null = null;

  try {
    await assertPortFree(API_PORT);
    await assertPortFree(WEB_PORT);

    await db.dropDatabase();
    const seeded = await seedFixtures(db);
    console.log(`[smoke] seeded ${target.database}: users=${seeded.users} books=${seeded.books} comments=${seeded.comments}`);

    api = spawnLogged(process.execPath, [path.join(REPO_ROOT, 'apps/api/dist/main.js')], 'api.log', {
      ...process.env,
      NODE_ENV: 'test',
      MONGODB_URI: uri,
      PORT: String(API_PORT),
      // The Vite preview origin is where the browser runs during smoke.
      ALLOWED_ORIGINS: `http://127.0.0.1:${WEB_PORT}`,
    });
    await waitForHttp(`${API_BASE}/api/health/ready`, api);
    console.log('[smoke] api ready');

    // Spawn Vite directly so shutdown kills the process that actually holds the port.
    const webDir = path.join(REPO_ROOT, 'apps/web');
    web = spawnLogged(
      path.join(webDir, 'node_modules/.bin/vite'),
      ['preview'],
      'web.log',
      { ...process.env, API_PROXY_TARGET: API_BASE },
      webDir,
    );
    await waitForHttp(`${WEB_BASE}/books`, web);
    console.log('[smoke] web preview ready');

    browser = await chromium.launch();
    const page = await browser.newPage();
    await runBrowserFlow(page);
    console.log('[smoke] browser M1 flow passed');
    await runAuthFlow(page);
    console.log('[smoke] browser auth/profile flow passed');
  } catch (error) {
    if (browser) {
      const page = await browser.newPage().catch(() => null);
      await page?.screenshot({ path: path.join(ARTIFACTS, 'failure.png') }).catch(() => undefined);
    }
    throw error;
  } finally {
    await browser?.close().catch(() => undefined);
    await stop(web);
    await stop(api);
    await Promise.all([
      db.collection('users').deleteMany({}),
      db.collection('books').deleteMany({}),
      db.collection('comments').deleteMany({}),
      db.collection('sessions').deleteMany({}),
      db.collection('identities').deleteMany({}),
    ]);
    await connection.close();
  }
}

main()
  .then(() => {
    console.log('[smoke] passed; test fixtures removed and own processes stopped');
  })
  .catch((error: unknown) => {
    console.error(cliFailureMessage('smoke', error));
    console.error(`[smoke] logs: ${ARTIFACTS}`);
    process.exitCode = 1;
  });
