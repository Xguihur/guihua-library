import { Body, Controller, Delete, Get, HttpCode, Inject, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Request, Response } from 'express';
import type { Connection, Model } from 'mongoose';
import type { SessionCurrentDto, UserPublicDto } from '@guihua/contracts';
import { assertEmail, assertPassword, assertUsername, normalizeIdentifier, parseEmptyJsonBody, parseLoginBody, parseProfileUpdateBody, parseRegisterBody } from '../common/identity-input';
import { PASSWORD_HASHER, type PasswordHasher } from '../common/password';
import { identityConflictError, invalidCredentialsError, unauthorizedError } from '../common/api-exception';
import { USER_MODEL } from '../database/model-names';
import { withTxRetry } from '../m2c/tx';
import type { User } from '../database/schemas/user.schema';
import { RateLimiterService, RATE_RULES } from './rate-limiter.service';
import { readSessionCookie, SessionService, type AuthUser } from './session.service';
import { SessionGuard, type AuthRequest } from './session.guard';
import { toSessionCurrent, toUserPublic } from './user.mapper';

function clientIp(request: Request): string {
  // No trust of arbitrary X-Forwarded-For: express uses the socket address here.
  return request.ip ?? request.socket.remoteAddress ?? 'unknown';
}

function duplicateField(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) return undefined;
  const pattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
  if ('usernameNormalized' in pattern || 'username' in pattern) return 'username';
  if ('email' in pattern) return 'email';
  return undefined;
}

@Controller()
export class AuthController {
  constructor(
    @InjectModel(USER_MODEL) private readonly users: Model<User>,
    @InjectConnection() private readonly connection: Connection,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(RateLimiterService) private readonly limiter: RateLimiterService,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
  ) {}

  @Post('users')
  @HttpCode(201)
  async register(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Body() body: unknown): Promise<UserPublicDto> {
    // Count before body parsing: malformed/unknown-field probes are attempts
    // and must not bypass the per-IP limit (same rule as login).
    this.limiter.check(`register:${clientIp(request)}`, RATE_RULES.register);
    const input = parseRegisterBody(body);
    const username = assertUsername(input.username);
    const email = assertEmail(input.email);
    const passwordHash = await this.hasher.hash(assertPassword(input.password));

    let created: AuthUser | undefined;
    let token = '';
    try {
      await withTxRetry(
        this.connection,
        async (session) => {
          const [doc] = await this.users.create(
            [
              {
                username,
                usernameNormalized: username.toLowerCase(),
                email,
                passwordHash,
                gender: 'unspecified',
                signature: '',
                avatarUrl: null,
                enabled: true,
                accountVersion: 0,
                role: 'user',
              },
            ],
            { session },
          );
          created = doc.toObject() as unknown as AuthUser;
          token = (await this.sessions.create(doc._id, session)).token;
          await this.sessions.revokeToken(readSessionCookie(request), session);
        },
      );
    } catch (error) {
      const field = duplicateField(error);
      if (field) throw identityConflictError(field);
      throw error;
    }

    this.sessions.setCookie(response, token);
    return toUserPublic(created as AuthUser);
  }

  @Post('sessions')
  @HttpCode(201)
  async login(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Body() body: unknown): Promise<SessionCurrentDto> {
    // Count every attempt against the IP before body validation, so rejected
    // logins (including unknown-field probes) cannot bypass the limit.
    const ip = clientIp(request);
    this.limiter.check(`login:ip:${ip}`, RATE_RULES.loginIp);
    const input = parseLoginBody(body);
    const identifier = normalizeIdentifier(input.identifier);
    this.limiter.check(`login:id:${identifier.value}`, RATE_RULES.loginIdentifier);

    const user = (identifier.kind === 'email'
      ? await this.users.findOne({ email: identifier.value }).select('+passwordHash').lean()
      : await this.users.findOne({ usernameNormalized: identifier.value }).select('+passwordHash').lean()) as
      | (AuthUser & { passwordHash: string | null })
      | null;

    let passwordMatches = false;
    if (user) {
      passwordMatches = await this.hasher.verify(input.password, user.passwordHash);
    } else {
      await this.hasher.verifyDummy(input.password);
    }
    if (!user || !passwordMatches || !user.enabled) throw invalidCredentialsError();

    const { token, expiresAt } = await withTxRetry(this.connection, async (session) => {
      const created = await this.sessions.create(user._id, session);
      await this.sessions.revokeToken(readSessionCookie(request), session);
      return created;
    });

    this.sessions.setCookie(response, token);
    return toSessionCurrent(user, expiresAt);
  }

  @Get('sessions/current')
  @UseGuards(SessionGuard)
  current(@Req() request: AuthRequest): SessionCurrentDto {
    return toSessionCurrent(request.authUser as AuthUser, request.authExpiresAt as Date);
  }

  @Delete('sessions/current')
  async logout(@Req() request: Request, @Res() response: Response, @Body() body: unknown): Promise<void> {
    // No business fields are accepted, even on this JSON write (CSRF parity).
    parseEmptyJsonBody(body);
    // Missing, invalid or expired cookies are still a successful idempotent logout.
    await this.sessions.revokeToken(readSessionCookie(request));
    this.sessions.clearCookie(response);
    response.status(204).end();
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() request: AuthRequest): UserPublicDto {
    return toUserPublic(request.authUser as AuthUser);
  }

  @Patch('me')
  @UseGuards(SessionGuard)
  async updateProfile(@Req() request: AuthRequest, @Body() body: unknown): Promise<UserPublicDto> {
    const input = parseProfileUpdateBody(body);
    const set: Record<string, unknown> = {};
    if (input.username !== undefined) {
      const username = assertUsername(input.username);
      set.username = username;
      set.usernameNormalized = username.toLowerCase();
    }
    if (input.gender !== undefined) set.gender = input.gender;
    if (input.avatarUrl !== undefined) set.avatarUrl = input.avatarUrl;
    if (input.signature !== undefined) set.signature = input.signature;

    let updated: AuthUser | undefined;
    try {
      updated = (await this.users
        .findOneAndUpdate(
          { _id: (request.authUser as AuthUser)._id },
          { $set: set },
          { new: true, runValidators: true },
        )
        .lean()) as unknown as AuthUser | undefined;
    } catch (error) {
      // The database unique index is the final guard against a concurrent
      // normalized-username collision, not a prior read-then-write check.
      if (duplicateField(error) === 'username') throw identityConflictError('username');
      throw error;
    }
    if (!updated) throw unauthorizedError();
    return toUserPublic(updated);
  }
}
