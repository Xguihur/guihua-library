import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EMAIL_CHALLENGE_TTL_MS } from '@guihua/contracts';
import { Types } from 'mongoose';
import type { ClientSession, Model } from 'mongoose';
import { RATE_CLOCK_TOKEN, type RateClock } from '../auth/rate-limiter.service';
import { validationError } from '../common/api-exception';
import { EMAIL_CHALLENGE_MODEL } from '../database/model-names';
import type { EmailChallenge } from '../database/schemas/email-challenge.schema';
import { digest, opaqueToken } from './digest';

/**
 * One-time, same-session, 10-minute email ownership challenges.
 *
 * Each user owns a single deterministic slot whose _id IS the user id, so all
 * requests replace one row atomically and two concurrent requests can never
 * leave two usable challenges. The row starts inactive and is activated only
 * after the mail was delivered; a failed or superseded send therefore cannot
 * leave a consumable link, and failure cleanup deletes only that exact token.
 */
@Injectable()
export class ChallengeService {
  constructor(
    @InjectModel(EMAIL_CHALLENGE_MODEL) private readonly model: Model<EmailChallenge>,
    @Inject(RATE_CLOCK_TOKEN) private readonly clock: RateClock,
  ) {}

  /** Atomically replaces the user's only challenge slot with an inactive row. */
  async create(
    userId: Types.ObjectId,
    email: string,
    sessionHash: string,
    mode: 'add' | 'verify',
  ): Promise<{ token: string }> {
    const token = opaqueToken();
    await this.model.findByIdAndUpdate(
      userId,
      {
        $set: {
          tokenHash: digest(token),
          userId,
          email,
          sessionHash,
          mode,
          expiresAt: new Date(this.clock.now() + EMAIL_CHALLENGE_TTL_MS),
          consumedAt: null,
          active: false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return { token };
  }

  /**
   * Makes a challenge consumable only after a successful send AND only if this
   * token still occupies the user's slot. Returns null if superseded.
   */
  async activate(token: string): Promise<EmailChallenge | null> {
    return this.model
      .findOneAndUpdate(
        { tokenHash: digest(token), active: false, consumedAt: null },
        { $set: { active: true } },
        { new: true },
      )
      .lean();
  }

  /** Revokes exactly this send's token, never a newer replacement. */
  async revoke(token: string): Promise<void> {
    await this.model.deleteOne({ tokenHash: digest(token) });
  }

  /** Early, read-only lookup; the authoritative check happens in the transaction. */
  async lookup(token: string): Promise<EmailChallenge | null> {
    return this.model.findOne({ tokenHash: digest(token) }).lean();
  }

  assertUsable(challenge: EmailChallenge | null, userId: Types.ObjectId, sessionHash: string): void {
    if (
      !challenge ||
      !challenge.active ||
      challenge.consumedAt ||
      challenge.expiresAt.getTime() <= this.clock.now() ||
      String(challenge.userId) !== String(userId) ||
      challenge.sessionHash !== sessionHash
    ) {
      throw validationError('The verification link is invalid or has expired.', [
        { field: 'token', reason: 'invalid_challenge' },
      ]);
    }
  }

  /**
   * Atomically marks the challenge consumed inside the credential transaction.
   *
   * The filter matches the immutable token digest plus the owning user and
   * session — never a slot _id. A slot replaced by a newer request while a
   * slow KDF was running therefore cannot be consumed by the older token, and
   * the returned row is the transaction's authoritative challenge content.
   */
  async consume(
    token: string,
    userId: Types.ObjectId,
    sessionHash: string,
    tx: ClientSession,
  ): Promise<EmailChallenge | null> {
    return this.model
      .findOneAndUpdate(
        {
          tokenHash: digest(token),
          userId,
          sessionHash,
          active: true,
          consumedAt: null,
          expiresAt: { $gt: new Date(this.clock.now()) },
        },
        { $set: { consumedAt: new Date(this.clock.now()) } },
        { new: true, session: tx },
      )
      .lean();
  }
}
