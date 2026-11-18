import type { GitHubClient, GitHubProfile } from '../../../src/m2c/github-client';

/**
 * 模拟 GitHub（测试替身，非真实 GitHub 授权）。
 *
 * Integration tests use this to drive the full OAuth protocol over real HTTP
 * and a real database without contacting GitHub. It never accepts a real code,
 * token or credential, and it cannot be reached from production code.
 */
export class SimulatedGitHubClient implements GitHubClient {
  private readonly codes = new Map<string, GitHubProfile>();
  private readonly tokens = new Map<string, GitHubProfile>();

  setProfile(code: string, profile: GitHubProfile): void {
    this.codes.set(code, profile);
  }

  async exchangeCode(code: string, _verifier: string): Promise<string> {
    const profile = this.codes.get(code);
    if (!profile) throw new Error('simulated_github: unknown code');
    const token = `simulated-token-${code}`;
    this.tokens.set(token, profile);
    return token;
  }

  async fetchProfile(token: string): Promise<GitHubProfile> {
    const profile = this.tokens.get(token);
    if (!profile) throw new Error('simulated_github: unknown token');
    return profile;
  }
}
