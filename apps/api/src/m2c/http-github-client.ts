import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GitHubUpstreamError, type GitHubClient, type GitHubProfile } from './github-client';

const UPSTREAM_TIMEOUT_MS = 10_000;

/**
 * Real GitHub OAuth code exchange + profile lookup. Profiles are read only to
 * obtain the stable numeric id; the access token is used for this one request,
 * never logged, persisted or returned. No email scope is requested.
 */
@Injectable()
export class HttpGitHubClient implements GitHubClient {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async exchangeCode(code: string, verifier: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(this.config.getOrThrow<string>('GITHUB_TOKEN_URL'), {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: this.config.getOrThrow<string>('GITHUB_CLIENT_ID'),
          client_secret: this.config.getOrThrow<string>('GITHUB_CLIENT_SECRET'),
          redirect_uri: this.config.getOrThrow<string>('GITHUB_CALLBACK_URL'),
          code,
          code_verifier: verifier,
        }),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch {
      throw new GitHubUpstreamError();
    }
    if (!response.ok) throw new GitHubUpstreamError();
    try {
      const body = (await response.json()) as { access_token?: unknown };
      if (typeof body.access_token !== 'string' || body.access_token.length === 0) throw new GitHubUpstreamError();
      return body.access_token;
    } catch {
      throw new GitHubUpstreamError();
    }
  }

  async fetchProfile(token: string): Promise<GitHubProfile> {
    let response: Response;
    try {
      response = await fetch(this.config.getOrThrow<string>('GITHUB_USER_URL'), {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
          'user-agent': 'guihua-library',
        },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch {
      throw new GitHubUpstreamError();
    }
    if (!response.ok) throw new GitHubUpstreamError();
    try {
      const body = (await response.json()) as { id?: unknown; login?: unknown; avatar_url?: unknown };
      if (!body.id) throw new GitHubUpstreamError();
      return {
        subject: String(body.id),
        login: typeof body.login === 'string' ? body.login : '',
        avatarUrl: typeof body.avatar_url === 'string' ? body.avatar_url : null,
      };
    } catch {
      throw new GitHubUpstreamError();
    }
  }
}

/** Whether both GitHub credentials are present; empty values disable OAuth with a 503. */
export function githubConfigured(config: ConfigService): boolean {
  return Boolean(config.get<string>('GITHUB_CLIENT_ID') && config.get<string>('GITHUB_CLIENT_SECRET'));
}
