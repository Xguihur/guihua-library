import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import {
  ContractValidationError,
  fieldIssuesFromZodError,
  type AuthorizationUrlDto,
  type LoginMethodsDto,
  emailVerificationRequestSchema,
  emptyJsonBodySchema,
  passwordCredentialSchema,
  passwordReauthSchema,
} from '@guihua/contracts';
import type { Request, Response } from 'express';
import type { Connection, Model } from 'mongoose';
import { SessionGuard, type AuthRequest } from '../auth/session.guard';
import { SessionService, readSessionCookie } from '../auth/session.service';
import { RATE_CLOCK_TOKEN, RateLimiterService, RATE_RULES, type RateClock } from '../auth/rate-limiter.service';
import { hasUsablePasswordHash, PASSWORD_HASHER, type PasswordHasher } from '../common/password';
import {
  identityConflictError,
  invalidCredentialsError,
  lastLoginMethodError,
  serviceUnavailableError,
  unauthorizedError,
  validationError,
} from '../common/api-exception';
import { assertEmail, assertPassword, parseEmptyJsonBody } from '../common/identity-input';
import { IDENTITY_MODEL, USER_MODEL } from '../database/model-names';
import type { Identity } from '../database/schemas/identity.schema';
import type { User } from '../database/schemas/user.schema';
import { ChallengeService } from './challenge.service';
import { digest } from './digest';
import { IdentityService } from './identity.service';
import { githubConfigured } from './http-github-client';
import { MailService } from './mail.service';
import { OAuthService } from './oauth.service';
import { ReauthService } from './reauth.service';
import { withTxRetry } from './tx';

function clientIp(request: Request): string {
  return request.ip ?? request.socket.remoteAddress ?? 'unknown';
}

function currentSessionHash(request: Request): string {
  return digest(readSessionCookie(request) ?? '');
}

function duplicateField(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) return undefined;
  const pattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
  if ('email' in pattern) return 'email';
  if ('usernameNormalized' in pattern || 'username' in pattern) return 'username';
  return undefined;
}

function strictBody<T>(schema: { safeParse(value: unknown): { success: boolean; data?: T; error?: unknown } }, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw new ContractValidationError(fieldIssuesFromZodError(result.error as never, 'unknown_field'));
  }
  return result.data as T;
}

@Controller()
export class AccountController {
  constructor(
    @InjectModel(USER_MODEL) private readonly users: Model<User>,
    @InjectModel(IDENTITY_MODEL) private readonly identities: Model<Identity>,
    @InjectConnection() private readonly connection: Connection,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(RateLimiterService) private readonly limiter: RateLimiterService,
    @Inject(ReauthService) private readonly reauths: ReauthService,
    @Inject(ChallengeService) private readonly challenges: ChallengeService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(OAuthService) private readonly oauth: OAuthService,
    @Inject(IdentityService) private readonly rotation: IdentityService,
    @Inject(RATE_CLOCK_TOKEN) private readonly clock: RateClock,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
  ) {}

  @Get('me/login-methods')
  @UseGuards(SessionGuard)
  async loginMethods(@Req() request: AuthRequest): Promise<LoginMethodsDto> {
    const userId = request.authUser!._id;
    const linked = Boolean(await this.identities.exists({ userId, provider: 'github' }));
    const user = await this.users.findById(userId).select('+passwordHash').lean();
    const enabled = hasUsablePasswordHash(user?.passwordHash);
    return {
      github: { linked },
      password: { enabled, email: enabled ? (user?.email ?? null) : null },
    };
  }

  @Post('me/identities/github/authorizations')
  @HttpCode(201)
  @UseGuards(SessionGuard)
  async beginLink(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<AuthorizationUrlDto> {
    strictBody(emptyJsonBodySchema, body);
    const hash = currentSessionHash(request);
    this.limiter.check(`oauth:authorize:${clientIp(request)}`, RATE_RULES.oauth);
    this.limiter.check(`sensitive:${hash}`, RATE_RULES.sensitiveSession);
    if (!githubConfigured(this.config)) throw serviceUnavailableError();
    const userId = request.authUser!._id;
    await this.reauths.assertRecent(hash, userId);
    return { authorizationUrl: await this.oauth.createAuthorization('link', userId, hash, response) };
  }

  @Delete('me/identities/github')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async unlink(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<void> {
    parseEmptyJsonBody(body);
    const hash = currentSessionHash(request);
    const userId = request.authUser!._id;
    this.limiter.check(`sensitive:${hash}`, RATE_RULES.sensitiveSession);
    await this.reauths.assertRecent(hash, userId);

    const existing = await this.identities.exists({ userId, provider: 'github' });
    if (!existing) return; // Idempotent when nothing is bound.

    const before = await this.users.findById(userId).select('+passwordHash').lean();
    if (!before || !before.enabled || !hasUsablePasswordHash(before.passwordHash) || !before.emailVerifiedAt) {
      throw lastLoginMethodError();
    }

    try {
      const rotated = await withTxRetry(this.connection, async (tx) => {
        // Issue 1: the session and recheck are re-read INSIDE the transaction.
        // The guard and the outer assertRecent only gate the request; they do
        // not survive a logout/expiry that happens before the write commits.
        const bound = await this.sessions.resolveBound(readSessionCookie(request), hash, userId, tx);
        if (!bound) throw unauthorizedError();
        await this.reauths.assertRecent(hash, userId, 'sensitive', tx);
        const fresh = await this.users.findById(userId).session(tx).select('+passwordHash');
        if (!fresh || !fresh.enabled) throw unauthorizedError();
        if (!hasUsablePasswordHash(fresh.passwordHash) || !fresh.emailVerifiedAt) throw lastLoginMethodError();
        const removed = await this.identities.findOneAndDelete({ userId, provider: 'github' }).session(tx);
        if (!removed) return null; // Concurrent unlink already removed it.
        const advanced = await this.users.findOneAndUpdate(
          { _id: userId, accountVersion: fresh.accountVersion, enabled: true },
          { $inc: { accountVersion: 1 } },
          { new: true, session: tx },
        );
        if (!advanced) throw identityConflictError('accountVersion');
        return this.rotation.rotateAfterCredentialChange(userId, tx);
      });
      if (rotated) this.sessions.setCookie(response, rotated.token);
    } catch (error) {
      const field = duplicateField(error);
      if (field) throw identityConflictError(field);
      throw error;
    }
  }

  @Post('sessions/current/reauthentications')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async reauthenticate(@Req() request: AuthRequest, @Body() body: unknown): Promise<void> {
    const input = strictBody(passwordReauthSchema, body);
    const hash = currentSessionHash(request);
    // Password recheck is a credential guess: also count toward the login IP limit.
    this.limiter.check(`login:ip:${clientIp(request)}`, RATE_RULES.loginIp);
    this.limiter.check(`sensitive:${hash}`, RATE_RULES.sensitiveSession);
    const userId = request.authUser!._id;
    const user = await this.users.findById(userId).select('+passwordHash').lean();
    // §6.4: a password recheck is a credential guess bound to this account, so
    // it also counts toward the per-normalized-identifier login limits (the
    // same keys password login uses) — not just IP and session. An account is
    // addressable by both its username and its email, so both keys count.
    if (user) {
      this.limiter.check(`login:id:${user.usernameNormalized}`, RATE_RULES.loginIdentifier);
      if (user.email) this.limiter.check(`login:id:${user.email}`, RATE_RULES.loginIdentifier);
    }
    const matches = user ? await this.hasher.verify(input.password, user.passwordHash) : false;
    if (!user || !user.enabled || !matches) throw invalidCredentialsError();
    // Issue 1: scrypt is slow. The session may have been revoked while it ran;
    // never record recheck evidence for a session that is no longer live.
    const bound = await this.sessions.resolveBound(readSessionCookie(request), hash, userId);
    if (!bound) throw unauthorizedError();
    await this.reauths.record(hash, userId);
  }

  @Post('sessions/current/github/authorizations')
  @HttpCode(201)
  @UseGuards(SessionGuard)
  async beginGithubReauth(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<AuthorizationUrlDto> {
    strictBody(emptyJsonBodySchema, body);
    const hash = currentSessionHash(request);
    this.limiter.check(`oauth:authorize:${clientIp(request)}`, RATE_RULES.oauth);
    this.limiter.check(`sensitive:${hash}`, RATE_RULES.sensitiveSession);
    if (!githubConfigured(this.config)) throw serviceUnavailableError();
    return {
      authorizationUrl: await this.oauth.createAuthorization('reauth', request.authUser!._id, hash, response),
    };
  }

  @Post('me/password-credentials/verifications')
  @HttpCode(202)
  @UseGuards(SessionGuard)
  async requestVerification(@Req() request: AuthRequest, @Body() body: unknown): Promise<{ message: string }> {
    const input = strictBody(emailVerificationRequestSchema, body);
    const email = assertEmail(input.email);
    const hash = currentSessionHash(request);
    const userId = request.authUser!._id;
    this.limiter.check(`mail:ip:${clientIp(request)}`, RATE_RULES.mailIpPerHour);
    this.limiter.check(`mail:user:${userId}`, RATE_RULES.mailUserPerHour);
    this.limiter.check(`mail:email:${email}`, RATE_RULES.mailEmailPerHour);
    this.limiter.check(`sensitive:${hash}`, RATE_RULES.sensitiveSession);
    await this.reauths.assertRecent(hash, userId);

    const user = await this.users.findById(userId).select('+passwordHash').lean();
    if (!user || !user.enabled) throw unauthorizedError();
    // An existing local password may only be confirmed for its original email;
    // the submitted value never replaces or changes it.
    const mode: 'add' | 'verify' = hasUsablePasswordHash(user.passwordHash) ? 'verify' : 'add';
    const target = mode === 'verify' ? (user.email ?? email) : email;
    const { token } = await this.challenges.create(userId, target, hash, mode);
    try {
      // The send is deliberately outside any database transaction. The slot is
      // inactive until delivery succeeds, so a link cannot be consumed while
      // mail is still in flight, and a failure revokes only this token — never
      // a newer request that replaced the slot in the meantime.
      await this.mail.sendVerification(target, token, mode);
      await this.challenges.activate(token);
    } catch (error) {
      await this.challenges.revoke(token);
      throw error;
    }
    return { message: '验证邮件已发送，请到原浏览器完成操作。' };
  }

  @Post('me/password-credentials')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async completeCredential(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<void> {
    const input = strictBody(passwordCredentialSchema, body);
    const hash = currentSessionHash(request);
    const userId = request.authUser!._id;
    this.limiter.check(`sensitive:${hash}`, RATE_RULES.sensitiveSession);
    // Challenge validity (including replay/expiry) is reported as 400 before the
    // recheck gate, so a reused link never masquerades as a reauth problem.
    const challenge = await this.challenges.lookup(input.token);
    this.challenges.assertUsable(challenge, userId, hash);
    await this.reauths.assertRecent(hash, userId);

    const user = await this.users.findById(userId).select('+passwordHash').lean();
    if (!user || !user.enabled) throw unauthorizedError();

    let newHash: string | undefined;
    if (challenge!.mode === 'verify') {
      // This branch only accepts {token}; never a password that could overwrite.
      if (input.password !== undefined || user.email !== challenge!.email) {
        throw validationError('Only the original email can be confirmed here.', [
          { field: 'token', reason: 'verify_only' },
        ]);
      }
      if (!hasUsablePasswordHash(user.passwordHash)) throw identityConflictError('password');
    } else {
      if (input.password === undefined) {
        throw validationError('A new password is required.', [{ field: 'password', reason: 'required' }]);
      }
      if (hasUsablePasswordHash(user.passwordHash)) throw identityConflictError('password');
      const taken = await this.users.findOne({ email: challenge!.email, _id: { $ne: userId } }).lean();
      if (taken) throw identityConflictError('email');
      newHash = await this.hasher.hash(assertPassword(input.password));
    }
    const expectedVersion = user.accountVersion;

    try {
      const rotated = await withTxRetry(this.connection, async (tx) => {
        // Issue 1: hashPassword (scrypt) ran before this transaction. Re-read
        // the original session and the recheck evidence inside the transaction
        // so a revocation/expiry during the KDF cannot still write a credential.
        const bound = await this.sessions.resolveBound(readSessionCookie(request), hash, userId, tx);
        if (!bound) throw unauthorizedError();
        await this.reauths.assertRecent(hash, userId, 'sensitive', tx);
        // Issue F2: consume matches the immutable token digest (plus user and
        // session), not the slot _id. If a newer request replaced the slot
        // while scrypt was running, the old token finds nothing here. The
        // returned row is the transaction's authoritative challenge; every
        // branch below uses consumed.mode/email, never the outer snapshot.
        const consumed = await this.challenges.consume(input.token, userId, hash, tx);
        if (!consumed) {
          throw validationError('The verification link is invalid or has expired.', [
            { field: 'token', reason: 'invalid_challenge' },
          ]);
        }
        const fresh = await this.users.findById(userId).session(tx).select('+passwordHash');
        if (!fresh || !fresh.enabled) throw unauthorizedError();
        if (fresh.accountVersion !== expectedVersion) throw identityConflictError('accountVersion');

        const set: Record<string, unknown> = { emailVerifiedAt: new Date(this.clock.now()) };
        if (consumed.mode === 'add') {
          if (newHash === undefined) {
            throw validationError('A new password is required.', [{ field: 'password', reason: 'required' }]);
          }
          if (hasUsablePasswordHash(fresh.passwordHash)) throw identityConflictError('password');
          const taken = await this.users.findOne({ email: consumed.email, _id: { $ne: userId } }).session(tx).lean();
          if (taken) throw identityConflictError('email');
          set.email = consumed.email;
          set.passwordHash = newHash;
        } else {
          if (input.password !== undefined) {
            throw validationError('Only the original email can be confirmed here.', [
              { field: 'token', reason: 'verify_only' },
            ]);
          }
          if (!hasUsablePasswordHash(fresh.passwordHash) || fresh.email !== consumed.email) {
            throw identityConflictError('email');
          }
        }
        const advanced = await this.users.findOneAndUpdate(
          { _id: userId, accountVersion: expectedVersion, enabled: true },
          { $set: set, $inc: { accountVersion: 1 } },
          { new: true, session: tx },
        );
        if (!advanced) throw identityConflictError('accountVersion');
        return this.rotation.rotateAfterCredentialChange(userId, tx);
      });
      this.sessions.setCookie(response, rotated.token);
    } catch (error) {
      const field = duplicateField(error);
      if (field) throw identityConflictError(field);
      throw error;
    }
  }
}
