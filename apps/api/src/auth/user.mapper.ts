import type { SessionCurrentDto, UserPublicDto } from '@guihua/contracts';
import type { AuthUser } from './session.service';

/** Explicit public projection: no email, hash, role, token or internal field escapes. */
export function toUserPublic(user: AuthUser): UserPublicDto {
  return {
    id: user._id.toString(),
    username: user.username,
    gender: user.gender,
    avatarUrl: user.avatarUrl,
    signature: user.signature,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toSessionCurrent(user: AuthUser, expiresAt: Date): SessionCurrentDto {
  return {
    user: toUserPublic(user),
    roles: ['user'],
    permissions: [],
    expiresAt: expiresAt.toISOString(),
  };
}
