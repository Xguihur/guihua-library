import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { REAUTH_WINDOW_MS } from '@guihua/contracts';
import type { ClientSession, Model, Types } from 'mongoose';
import { RATE_CLOCK_TOKEN, type RateClock } from '../auth/rate-limiter.service';
import { forbiddenError } from '../common/api-exception';
import { REAUTH_MODEL } from '../database/model-names';
import type { Reauth } from '../database/schemas/reauth.schema';

/** Recent, explicit identity recheck bound to one session, user and purpose. */
@Injectable()
export class ReauthService {
  constructor(
    @InjectModel(REAUTH_MODEL) private readonly model: Model<Reauth>,
    @Inject(RATE_CLOCK_TOKEN) private readonly clock: RateClock,
  ) {}

  async record(sessionHash: string, userId: Types.ObjectId, purpose = 'sensitive', tx?: ClientSession): Promise<void> {
    const options = tx ? { session: tx } : {};
    await this.model.deleteMany({ sessionHash, userId, purpose }, options);
    await this.model.create(
      [{ sessionHash, userId, purpose, expiresAt: new Date(this.clock.now() + REAUTH_WINDOW_MS) }],
      options,
    );
  }

  async assertRecent(
    sessionHash: string,
    userId: Types.ObjectId,
    purpose = 'sensitive',
    tx?: ClientSession,
  ): Promise<void> {
    let query = this.model.findOne({
      sessionHash,
      userId,
      purpose,
      expiresAt: { $gt: new Date(this.clock.now()) },
    });
    if (tx) query = query.session(tx);
    const row = await query.lean();
    if (!row) throw forbiddenError('A recent identity recheck is required for this operation.');
  }

  async clearForUser(userId: Types.ObjectId, tx?: ClientSession): Promise<void> {
    await this.model.deleteMany({ userId }, tx ? { session: tx } : {});
  }
}
