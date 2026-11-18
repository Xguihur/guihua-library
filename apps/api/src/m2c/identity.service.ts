import { Inject, Injectable } from '@nestjs/common';
import type { ClientSession, Types } from 'mongoose';
import { SessionService } from '../auth/session.service';
import { ReauthService } from './reauth.service';

/**
 * Every credential change (bind, add password, unlink) rotates the current
 * token, revokes all other sessions and clears reauth evidence in one tx.
 */
@Injectable()
export class IdentityService {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(ReauthService) private readonly reauths: ReauthService,
  ) {}

  async rotateAfterCredentialChange(
    userId: Types.ObjectId,
    tx: ClientSession,
  ): Promise<{ token: string; expiresAt: Date }> {
    await this.sessions.revokeAllForUser(userId, tx);
    await this.reauths.clearForUser(userId, tx);
    return this.sessions.create(userId, tx);
  }
}
