import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { SessionService, readSessionCookie } from '../auth/session.service';
import { RateLimiterService, RATE_RULES } from '../auth/rate-limiter.service';
import { serviceUnavailableError } from '../common/api-exception';
import { digest } from './digest';
import { buildWebRedirect, OAUTH_RESULT_PATH } from './web-redirect';
import { githubConfigured } from './http-github-client';
import {
  OAuthFailure,
  OAuthService,
  mapOAuthFailure,
  readOAuthCookie,
} from './oauth.service';

function clientIp(request: Request): string {
  return request.ip ?? request.socket.remoteAddress ?? 'unknown';
}

@Controller('oauth/github')
export class OAuthController {
  constructor(
    @Inject(OAuthService) private readonly oauth: OAuthService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(RateLimiterService) private readonly limiter: RateLimiterService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  @Get('authorization')
  async authorization(@Req() request: Request, @Res() response: Response): Promise<void> {
    this.limiter.check(`oauth:authorize:${clientIp(request)}`, RATE_RULES.oauth);
    if (!githubConfigured(this.config)) throw serviceUnavailableError();

    const sessionToken = readSessionCookie(request);
    const existing = await this.sessions.resolve(sessionToken);
    if (existing) {
      // Direct login must never silently switch accounts or bind GitHub; send
      // the user to the fixed guidance page instead.
      response.redirect(302, buildWebRedirect(this.config, OAUTH_RESULT_PATH, 'already-logged-in'));
      return;
    }

    const url = await this.oauth.createAuthorization(
      'login',
      null,
      sessionToken ? digest(sessionToken) : null,
      response,
    );
    response.redirect(302, url);
  }

  @Get('callback')
  async callback(@Req() request: Request, @Res() response: Response): Promise<void> {
    this.limiter.check(`oauth:callback:${clientIp(request)}`, RATE_RULES.oauth);
    const wantsJson = String(request.headers.accept ?? '').includes('application/json');
    try {
      if ('error' in request.query) throw new OAuthFailure('cancelled');
      const result = await this.oauth.handleCallback(
        request.query,
        readOAuthCookie(request),
        readSessionCookie(request),
      );
      this.oauth.clearBrowserCookie(response);
      if (result.token) this.sessions.setCookie(response, result.token);
      response.redirect(302, result.redirect);
    } catch (error) {
      this.oauth.clearBrowserCookie(response);
      const mapped = mapOAuthFailure(error);
      // JSON clients get the true status (e.g. 409 on a binding conflict);
      // browser navigations get a fixed, query-scrubbed result page.
      if (wantsJson) throw mapped.error;
      response.redirect(302, buildWebRedirect(this.config, OAUTH_RESULT_PATH, mapped.status));
    }
  }
}
