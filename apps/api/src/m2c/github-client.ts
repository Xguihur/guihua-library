/**
 * Injectable boundary for GitHub's HTTP API. The real implementation talks to
 * github.com; integration tests override this token with a clearly-labelled
 * simulated client. No access token, secret or profile is ever persisted.
 */
export const GITHUB_CLIENT = 'GITHUB_CLIENT';

export interface GitHubProfile {
  /** Stable, immutable GitHub user id — used as the subject. */
  subject: string;
  login: string;
  avatarUrl: string | null;
}

export interface GitHubClient {
  exchangeCode(code: string, verifier: string): Promise<string>;
  fetchProfile(token: string): Promise<GitHubProfile>;
}

/** Upstream GitHub failure; the controller maps it to a fixed, masked error. */
export class GitHubUpstreamError extends Error {
  constructor() {
    super('github_upstream_unavailable');
    this.name = 'GitHubUpstreamError';
  }
}
