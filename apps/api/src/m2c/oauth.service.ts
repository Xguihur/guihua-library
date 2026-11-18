import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import {
  ContractValidationError,
  fieldIssuesFromZodError,
  OAUTH_COOKIE_NAME,
  OAUTH_STATE_TTL_MS,
  oauthCallbackQuerySchema,
} from '@guihua/contracts';
import type { Request, Response } from 'express';
import type { ClientSession, Connection, Model, Types } from 'mongoose';
import { SessionService } from '../auth/session.service';
import { RATE_CLOCK_TOKEN, type RateClock } from '../auth/rate-limiter.service';
import { forbiddenError, identityConflictError, serviceUnavailableError, validationError } from '../common/api-exception';
import { IDENTITY_MODEL, OAUTH_STATE_MODEL, USER_MODEL } from '../database/model-names';
import type { Identity } from '../database/schemas/identity.schema';
import type { OAuthState, OAuthPurpose } from '../database/schemas/oauth-state.schema';
import type { User } from '../database/schemas/user.schema';
import { digest, opaqueToken } from './digest';
import { GITHUB_CLIENT, GitHubUpstreamError, type GitHubClient, type GitHubProfile } from './github-client';
import { ReauthService } from './reauth.service';
import { withTxRetry } from './tx';
import { buildWebRedirect, OAUTH_RESULT_PATH } from './web-redirect';

/** Reads only the server-issued browser-binding cookie, never a query value. */
export function readOAuthCookie(request: Request): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === OAUTH_COOKIE_NAME) {
      const raw = rest.join('=');
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

export type OAuthFailureReason =
  | 'invalid'
  | 'cancelled'
  | 'expired'
  | 'replayed'
  | 'session-mismatch'
  | 'already-logged-in'
  | 'conflict'
  | 'upstream';

export class OAuthFailure extends Error {
  constructor(readonly reason: OAuthFailureReason) {
    super(`oauth_failure:${reason}`);
    this.name = 'OAuthFailure';
  }
}

export interface OAuthResult {
  purpose: OAuthPurpose;
  /** Set only for login/link, where the browser session is (re)issued. */
  token: string | null;
  redirect: string;
}

/**
 * Injectable seam for the auto `gh_` username. Production draws 8 random
 * bytes; tests stage a controlled collision and then a free name. This only
 * changes WHERE the random suffix comes from, never the username rules.
 */
export const GITHUB_USERNAME = 'GITHUB_USERNAME';
export type GithubUsernameGenerator = () => string;

/**
 * Bounded re-open count for duplicate-key losers in FIRST login. The losing
 * transaction aborts cleanly (no orphan user), and each re-open re-reads the
 * identity or draws a fresh username suffix.
 */
const DUPLICATE_KEY_ATTEMPTS = 4;

function isDuplicateKeyError(error: unknown): boolean {
  return (
    Boolean(error && typeof error === 'object' && 'code' in error) &&
    (error as { code?: unknown }).code === 11000
  );
}

@Injectable()
export class OAuthService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @InjectModel(OAUTH_STATE_MODEL) private readonly states: Model<OAuthState>,
    @InjectModel(IDENTITY_MODEL) private readonly identities: Model<Identity>,
    @InjectModel(USER_MODEL) private readonly users: Model<User>,
    @InjectConnection() private readonly connection: Connection,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(ReauthService) private readonly reauths: ReauthService,
    @Inject(GITHUB_CLIENT) private readonly github: GitHubClient,
    @Inject(RATE_CLOCK_TOKEN) private readonly clock: RateClock,
    @Inject(GITHUB_USERNAME) private readonly nextUsername: GithubUsernameGenerator,
  ) {}

  setBrowserCookie(response: Response, value: string): void {
    response.cookie(OAUTH_COOKIE_NAME, value, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: this.config.get<string>('NODE_ENV') === 'production',
      maxAge: OAUTH_STATE_TTL_MS,
    });
  }

  clearBrowserCookie(response: Response): void {
    response.clearCookie(OAUTH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: this.config.get<string>('NODE_ENV') === 'production',
    });
  }

  /** purpose/userId/sessionHash are server-only arguments, never callback input. */
  async createAuthorization(
    purpose: OAuthPurpose,
    userId: Types.ObjectId | null,
    sessionHash: string | null,
    response: Response,
  ): Promise<string> {
    const state = opaqueToken();
    const verifier = opaqueToken();
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const browserBinding = opaqueToken();

    await this.states.create([
      {
        stateHash: digest(state),
        verifier,
        purpose,
        userId,
        sessionHash,
        oauthCookieHash: digest(browserBinding),
        returnTo: OAUTH_RESULT_PATH,
        expiresAt: new Date(this.clock.now() + OAUTH_STATE_TTL_MS),
        consumedAt: null,
      },
    ]);
    this.setBrowserCookie(response, browserBinding);

    const url = new URL(this.config.getOrThrow<string>('GITHUB_AUTHORIZE_URL'));
    url.searchParams.set('client_id', this.config.getOrThrow<string>('GITHUB_CLIENT_ID'));
    url.searchParams.set('redirect_uri', this.config.getOrThrow<string>('GITHUB_CALLBACK_URL'));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    // No scope: the default grant exposes only public profile data, never email.
    return url.toString();
  }

  async handleCallback(
    query: unknown,
    browserBinding: string | null,
    sessionToken: string | null,
  ): Promise<OAuthResult> {
    const parsed = oauthCallbackQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new ContractValidationError(fieldIssuesFromZodError(parsed.error, 'invalid_oauth_callback'));
    }
    const { code, state } = parsed.data;

    const record = await this.states.findOne({ stateHash: digest(state) }).lean();
    if (!record) throw new OAuthFailure('invalid');
    if (record.consumedAt) throw new OAuthFailure('replayed');
    if (record.expiresAt.getTime() <= this.clock.now()) throw new OAuthFailure('expired');
    if (!browserBinding || digest(browserBinding) !== record.oauthCookieHash) {
      throw new OAuthFailure('session-mismatch');
    }

    const session = await this.sessions.resolve(sessionToken);
    if (record.purpose === 'login') {
      // Issue 2: a login flow started anonymously must not silently switch to
      // (or clear) an account the browser logged into while the flow was open.
      // A flow that started with a specific token must finish with that token.
      if (session && (!record.sessionHash || digest(sessionToken as string) !== record.sessionHash)) {
        throw new OAuthFailure('already-logged-in');
      }
    } else {
      // Binding/reauth must continue in the exact session that started the flow.
      if (
        !session ||
        !sessionToken ||
        String(session.user._id) !== String(record.userId) ||
        digest(sessionToken) !== record.sessionHash
      ) {
        throw new OAuthFailure('session-mismatch');
      }
    }

    // External token exchange and profile lookup happen BEFORE the transaction.
    let profile: GitHubProfile;
    try {
      const accessToken = await this.github.exchangeCode(code, record.verifier);
      profile = await this.github.fetchProfile(accessToken);
    } catch (error) {
      if (error instanceof GitHubUpstreamError) throw new OAuthFailure('upstream');
      throw new OAuthFailure('upstream');
    }

    return this.applyWithBoundedDuplicateRecovery(record, profile, sessionToken);
  }

  /**
   * Issue F3: `withTxRetry` deliberately passes duplicate-key (11000) errors
   * through as caller-facing conflicts, so a FIRST concurrent login of the
   * same subject — or a random `gh_` username collision — would otherwise
   * fail the whole callback. The losing transaction aborts cleanly (no orphan
   * user: user + identity are created in one transaction), so re-opening the
   * transaction and re-reading the identity converges on the winner's userId,
   * and a username collision draws a fresh suffix. Bounded. A binding (link)
   * duplicate is a REAL conflict and maps to 409, never to a retry.
   */
  private async applyWithBoundedDuplicateRecovery(
    record: { _id: Types.ObjectId; purpose: OAuthPurpose },
    profile: GitHubProfile,
    sessionToken: string | null,
  ): Promise<OAuthResult> {
    for (let attempt = 0; attempt < DUPLICATE_KEY_ATTEMPTS; attempt += 1) {
      try {
        return await withTxRetry(this.connection, (tx) =>
          this.apply(record._id, record.purpose, profile, sessionToken, tx),
        );
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        if (record.purpose !== 'login') throw identityConflictError('github');
        // Login purpose: re-open the transaction and re-read the identity.
      }
    }
    throw serviceUnavailableError();
  }

  private async apply(
    recordId: Types.ObjectId,
    purpose: OAuthPurpose,
    profile: GitHubProfile,
    sessionToken: string | null,
    tx: ClientSession,
  ): Promise<OAuthResult> {
    const stateDoc = await this.states.findById(recordId).session(tx);
    if (!stateDoc || stateDoc.consumedAt || stateDoc.expiresAt.getTime() <= this.clock.now()) {
      throw new OAuthFailure('replayed');
    }

    // Issue 1: the GitHub exchange happened BEFORE this transaction. Re-read
    // the ORIGINAL session inside the transaction before any credential write,
    // so a logout / rotation / disable / expiry during the external call wins.
    if (purpose !== 'login') {
      const bound = await this.sessions.resolveBound(
        sessionToken,
        stateDoc.sessionHash,
        stateDoc.userId,
        tx,
      );
      if (!bound) throw new OAuthFailure('session-mismatch');
      // A link callback must re-satisfy the recent recheck at apply time; the
      // evidence may have expired while GitHub was slow.
      if (purpose === 'link') {
        await this.reauths.assertRecent(
          stateDoc.sessionHash as string,
          stateDoc.userId as Types.ObjectId,
          'sensitive',
          tx,
        );
      }
    }

    const status: Record<OAuthPurpose, string> = {
      login: 'login-success',
      link: 'link-success',
      reauth: 'reauth-success',
    };

    if (purpose === 'login') {
      const identity = await this.identities.findOne({ provider: 'github', subject: profile.subject }).session(tx).lean();
      let userId: Types.ObjectId;
      if (identity) {
        const existingUser = await this.users.findById(identity.userId).session(tx).lean();
        if (!existingUser || !existingUser.enabled) throw new OAuthFailure('invalid');
        userId = identity.userId;
      } else {
        // Username collisions are handled by the bounded duplicate-key
        // recovery around this transaction: each re-open draws a fresh suffix.
        const username = this.nextUsername();
        const [created] = await this.users.create(
          [
            {
              username,
              usernameNormalized: username.toLowerCase(),
              email: null,
              passwordHash: null,
              emailVerifiedAt: null,
              gender: 'unspecified',
              signature: '',
              avatarUrl: this.safeAvatar(profile.avatarUrl),
              enabled: true,
              accountVersion: 0,
              role: 'user',
            },
          ],
          { session: tx },
        );
        userId = created._id;
        await this.identities.create([{ provider: 'github', subject: profile.subject, userId }], { session: tx });
      }
      stateDoc.consumedAt = new Date(this.clock.now());
      await stateDoc.save({ session: tx });
      const created = await this.sessions.create(userId, tx);
      // Revoke only the token that STARTED this flow. A different session that
      // appeared meanwhile must never be cleared (issue 2).
      await this.sessions.revokeHash(stateDoc.sessionHash, tx);
      return { purpose, token: created.token, redirect: buildWebRedirect(this.config, OAUTH_RESULT_PATH, status[purpose]) };
    }

    const user = await this.users.findById(stateDoc.userId).session(tx);
    if (!user || !user.enabled) throw new OAuthFailure('session-mismatch');

    if (purpose === 'reauth') {
      const own = await this.identities
        .findOne({ userId: stateDoc.userId, provider: 'github', subject: profile.subject })
        .session(tx)
        .lean();
      if (!own) throw new OAuthFailure('session-mismatch');
      stateDoc.consumedAt = new Date(this.clock.now());
      await stateDoc.save({ session: tx });
      await this.reauths.record(
        stateDoc.sessionHash as string,
        stateDoc.userId as Types.ObjectId,
        'sensitive',
        tx,
      );
      return { purpose, token: null, redirect: buildWebRedirect(this.config, OAUTH_RESULT_PATH, status[purpose]) };
    }

    // purpose === 'link'
    const subjectOwner = await this.identities
      .findOne({ provider: 'github', subject: profile.subject })
      .session(tx)
      .lean();
    if (subjectOwner && String(subjectOwner.userId) !== String(stateDoc.userId)) throw identityConflictError('github');
    const currentBinding = await this.identities
      .findOne({ userId: stateDoc.userId, provider: 'github' })
      .session(tx)
      .lean();
    if (currentBinding && currentBinding.subject !== profile.subject) throw identityConflictError('github');
    if (!subjectOwner && !currentBinding) {
      await this.identities.create(
        [{ provider: 'github', subject: profile.subject, userId: stateDoc.userId }],
        { session: tx },
      );
    }

    // Re-check accountVersion inside the transaction before any credential change.
    const advanced = await this.users.findOneAndUpdate(
      { _id: stateDoc.userId, accountVersion: user.accountVersion, enabled: true },
      { $inc: { accountVersion: 1 } },
      { new: true, session: tx },
    );
    if (!advanced) throw identityConflictError('accountVersion');
    stateDoc.consumedAt = new Date(this.clock.now());
    await stateDoc.save({ session: tx });
    await this.sessions.revokeAllForUser(stateDoc.userId as Types.ObjectId, tx);
    await this.reauths.clearForUser(stateDoc.userId as Types.ObjectId, tx);
    const rotated = await this.sessions.create(stateDoc.userId as Types.ObjectId, tx);
    return { purpose, token: rotated.token, redirect: buildWebRedirect(this.config, OAUTH_RESULT_PATH, status[purpose]) };
  }

  /** Only import an absolute HTTPS avatar; anything else is stored as null. */
  private safeAvatar(value: string | null): string | null {
    if (!value || value.length > 2048 || !/^https:\/\//i.test(value)) return null;
    // A control character (including NUL) must never be imported from an
    // upstream avatar. Legacy M1 values already in the database are not
    // rewritten by this; public display remains read-only.
    for (const character of value) {
      const code = character.codePointAt(0) ?? 0;
      if (code <= 31 || code === 127) return null;
    }
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? value : null;
    } catch {
      return null;
    }
  }
}

/** Maps a protocol failure to a fixed result-page status and a stable error. */
function oauthFailure(reason: OAuthFailureReason): { status: string; error: unknown } {
  switch (reason) {
    case 'session-mismatch':
      return { status: 'session-mismatch', error: forbiddenError('The OAuth flow must finish in the original session.') };
    case 'already-logged-in':
      return {
        status: 'already-logged-in',
        error: forbiddenError('You are already signed in. Use account settings to link GitHub.'),
      };
    case 'conflict':
      return { status: 'conflict', error: identityConflictError('github') };
    case 'upstream':
      return { status: 'upstream', error: validationError('GitHub authorization is temporarily unavailable.', []) };
    case 'expired':
      return { status: 'expired', error: validationError('The authorization request expired.', []) };
    case 'replayed':
      return { status: 'replayed', error: validationError('The authorization was already used.', []) };
    case 'cancelled':
      return { status: 'cancelled', error: validationError('GitHub authorization was cancelled.', []) };
    default:
      return { status: 'invalid', error: validationError('The authorization callback is invalid.', []) };
  }
}

/**
 * Converts a thrown error into a fixed page status plus the error a JSON client
 * should receive. Browser navigations redirect; Accept: application/json gets
 * the true HTTP status (e.g. 409 on a binding conflict).
 */
export function mapOAuthFailure(error: unknown): { status: string; error: unknown } {
  if (error instanceof OAuthFailure) return oauthFailure(error.reason);
  if (error instanceof ContractValidationError) return { status: 'invalid', error };
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'IDENTITY_CONFLICT'
  ) {
    return { status: 'conflict', error };
  }
  return { status: 'upstream', error };
}
