import {
  hashPassword,
  verifyDummyPassword,
  verifyPassword,
  type PasswordHasher,
} from '../../../src/common/password';
import { serviceUnavailableError } from '../../../src/common/api-exception';
import {
  GitHubUpstreamError,
  type GitHubClient,
  type GitHubProfile,
} from '../../../src/m2c/github-client';

/**
 * A one-shot gate used by race tests. The test arms it, fires a real HTTP
 * request, waits until the request is parked inside the slow external call,
 * mutates the world (revoke a session / advance the clock), then opens the gate.
 * This is a deterministic substitute for sleeping and races on wall-clock time.
 */
export class Gate {
  private pending: Promise<void> | null = null;
  private release: (() => void) | null = null;

  arm(): void {
    this.pending = new Promise<void>((resolve) => {
      this.release = resolve;
    });
  }

  async wait(): Promise<void> {
    if (this.pending) await this.pending;
  }

  open(): void {
    this.release?.();
    this.pending = null;
    this.release = null;
  }

  get armed(): boolean {
    return this.pending !== null;
  }
}

/** GitHub test double with a pausable, optionally failing token exchange. */
export class GatedGitHubClient implements GitHubClient {
  private readonly codes = new Map<string, GitHubProfile>();
  private readonly tokens = new Map<string, GitHubProfile>();
  readonly exchangeGate = new Gate();
  exchangeStarted = 0;
  failExchange = false;

  setProfile(code: string, profile: GitHubProfile): void {
    this.codes.set(code, profile);
  }

  async exchangeCode(code: string, _verifier: string): Promise<string> {
    this.exchangeStarted += 1;
    await this.exchangeGate.wait();
    if (this.failExchange) throw new GitHubUpstreamError();
    const profile = this.codes.get(code);
    if (!profile) throw new GitHubUpstreamError();
    const token = `gated-token-${code}`;
    this.tokens.set(token, profile);
    return token;
  }

  async fetchProfile(token: string): Promise<GitHubProfile> {
    const profile = this.tokens.get(token);
    if (!profile) throw new GitHubUpstreamError();
    return profile;
  }
}

/**
 * Production-equivalent hasher with pausable hash/verify. Tests override the
 * PASSWORD_HASHER token with this to prove that revoking a session during
 * scrypt cannot leave a usable credential write.
 */
export class GatedHasher implements PasswordHasher {
  readonly hashGate = new Gate();
  readonly verifyGate = new Gate();
  hashStarted = 0;
  verifyStarted = 0;

  async hash(password: string): Promise<string> {
    this.hashStarted += 1;
    await this.hashGate.wait();
    return hashPassword(password);
  }

  async verify(password: string, encoded: string | null | undefined): Promise<boolean> {
    this.verifyStarted += 1;
    await this.verifyGate.wait();
    return verifyPassword(password, encoded);
  }

  async verifyDummy(password: string): Promise<void> {
    await this.verifyGate.wait();
    return verifyDummyPassword(password);
  }
}

/** Mailer test double that records tokens and can pause/fail a delivery. */
export class GatedMailService {
  readonly sendGate = new Gate();
  sendStarted = 0;
  failNext = false;
  readonly sent: Array<{ email: string; token: string; mode: 'add' | 'verify' }> = [];

  async sendVerification(email: string, token: string, mode: 'add' | 'verify'): Promise<void> {
    this.sendStarted += 1;
    this.sent.push({ email, token, mode });
    await this.sendGate.wait();
    if (this.failNext) {
      this.failNext = false;
      throw serviceUnavailableError();
    }
  }

  isConfigured(): boolean {
    return true;
  }
}
