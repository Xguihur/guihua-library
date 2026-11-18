import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { forbiddenError, unauthorizedError } from '../common/api-exception';
import { readSessionCookie, SessionService, type AuthUser } from './session.service';

export interface AuthRequest extends Request {
  authUser?: AuthUser;
  authExpiresAt?: Date;
}

/** Real session check: state is re-read from the database on every request. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const identity = await this.sessions.resolve(readSessionCookie(request));
    if (!identity) throw unauthorizedError();
    request.authUser = identity.user;
    request.authExpiresAt = identity.expiresAt;
    return true;
  }
}

/**
 * Replaces the M1 always-401 placeholder. Anonymous writes stay 401; a valid
 * session gets a truthful 403 because book/comment writes are M3 capabilities.
 */
@Injectable()
export class AuthenticatedGuard implements CanActivate {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const identity = await this.sessions.resolve(readSessionCookie(request));
    if (!identity) throw unauthorizedError();
    throw forbiddenError('Writing books and comments is not available in M2.');
  }
}
