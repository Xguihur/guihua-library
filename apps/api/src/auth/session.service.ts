import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { Request, Response } from 'express';
import type { ClientSession, Model, Types } from 'mongoose';
import { SESSION_COOKIE_NAME, SESSION_TTL_MS, type Gender } from '@guihua/contracts';
import { RATE_CLOCK_TOKEN, type RateClock } from './rate-limiter.service';
import { SESSION_MODEL, USER_MODEL } from '../database/model-names';
import type { Session } from '../database/schemas/session.schema';
import type { User } from '../database/schemas/user.schema';

export interface AuthUser {
  _id: Types.ObjectId;
  username: string;
  gender: Gender;
  avatarUrl: string | null;
  signature: string;
  createdAt: Date;
  enabled: boolean;
}

export interface SessionIdentity {
  user: AuthUser;
  expiresAt: Date;
}

@Injectable()
export class SessionService {
  constructor(
    @InjectModel(SESSION_MODEL) private readonly sessions: Model<Session>,
    @InjectModel(USER_MODEL) private readonly users: Model<User>,
    @Inject(RATE_CLOCK_TOKEN) private readonly clock: RateClock,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  private digest(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** 32 random bytes, encoded opaque; the raw value is never persisted. */
  private newToken(): string {
    return randomBytes(32).toString('base64url');
  }

  async create(userId: Types.ObjectId | string, txSession?: ClientSession): Promise<{ token: string; expiresAt: Date }> {
    const token = this.newToken();
    const createdAt = new Date(this.clock.now());
    const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);
    const options = txSession ? { session: txSession } : undefined;
    await this.sessions.create(
      [{ tokenHash: this.digest(token), userId: userId as Types.ObjectId, createdAt, expiresAt }],
      options,
    );
    return { token, expiresAt };
  }

  async revokeToken(token: string | null | undefined, txSession?: ClientSession): Promise<void> {
    if (!token) return;
    const options = txSession ? { session: txSession } : {};
    await this.sessions.deleteOne({ tokenHash: this.digest(token) }, options);
  }

  /**
   * Revokes by the stored digest instead of a raw token. The OAuth login flow
   * records the browser token present when it STARTED; a callback that arrives
   * with a different (newly logged-in) cookie must never revoke that new login.
   */
  async revokeHash(tokenHash: string | null | undefined, txSession?: ClientSession): Promise<void> {
    if (!tokenHash) return;
    const options = txSession ? { session: txSession } : {};
    await this.sessions.deleteOne({ tokenHash }, options);
  }

  /** Used after a credential change: every prior session for the user is invalidated. */
  async revokeAllForUser(userId: Types.ObjectId | string, txSession?: ClientSession): Promise<void> {
    const options = txSession ? { session: txSession } : {};
    await this.sessions.deleteMany({ userId: userId as Types.ObjectId }, options);
  }

  /** Every protected request re-reads the database; expired TTL rows are still rejected here. */
  async resolve(token: string | null | undefined): Promise<SessionIdentity | null> {
    if (!token) return null;
    const row = await this.sessions.findOne({ tokenHash: this.digest(token) }).lean();
    if (!row || row.expiresAt.getTime() <= this.clock.now()) return null;
    const user = await this.users.findById(row.userId).lean();
    if (!user || !user.enabled) return null;
    return { user: user as unknown as AuthUser, expiresAt: row.expiresAt };
  }

  /**
   * Re-reads an ORIGINAL session inside the credential transaction and checks
   * the exact browser token digest, ownership, expiry and current enabled flag.
   * Returns null on any mismatch so callers can map it to their own protocol
   * error. Used after slow external calls (GitHub token exchange, scrypt, mail)
   * because a session revoked or expired during that window is no longer valid.
   */
  async resolveBound(
    token: string | null | undefined,
    expectedHash: string | null | undefined,
    expectedUserId: Types.ObjectId | string | null | undefined,
    txSession?: ClientSession,
  ): Promise<AuthUser | null> {
    if (!token || !expectedHash || this.digest(token) !== expectedHash) return null;
    const options = txSession ? { session: txSession } : {};
    const row = await this.sessions.findOne({ tokenHash: this.digest(token) }, null, options).lean();
    if (!row || row.expiresAt.getTime() <= this.clock.now()) return null;
    if (expectedUserId != null && String(row.userId) !== String(expectedUserId)) return null;
    const user = await this.users.findById(row.userId, null, options).lean();
    if (!user || !user.enabled) return null;
    return user as unknown as AuthUser;
  }

  setCookie(response: Response, token: string): void {
    response.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: this.config.get<string>('NODE_ENV') === 'production',
      maxAge: SESSION_TTL_MS,
    });
  }

  clearCookie(response: Response): void {
    response.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: this.config.get<string>('NODE_ENV') === 'production',
    });
  }
}

/** Reads only the configured session cookie; never accepts a token from the body or URL. */
export function readSessionCookie(request: Request): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE_NAME) {
      const raw = rest.join('=');
      try {
        return decodeURIComponent(raw);
      } catch {
        // A malformed percent sequence is just an invalid token, never a 500.
        // The raw value still fails the digest lookup, so it cannot authenticate.
        return raw;
      }
    }
  }
  return null;
}
