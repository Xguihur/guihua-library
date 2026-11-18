import { inject, ref, type Ref } from 'vue';
import type { SessionCurrentDto, UserPublicDto } from '@guihua/contracts';
import { authApi, toApiClientError, type AuthApi } from '../api/client';

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; session: SessionCurrentDto }
  | { status: 'error'; message: string };

export const SESSION_STORE_KEY = 'guihua-session-store';

/**
 * Opaque reference to the identity that was current when a request started.
 * It carries both an epoch (so a same-account re-login is distinguishable) and
 * the user id (so a cross-account re-login is distinguishable).
 */
export interface SessionIdentityRef {
  readonly epoch: number;
  readonly userId: string | null;
}

export interface SessionStore {
  state: Ref<SessionState>;
  identity(): SessionIdentityRef;
  isCurrent(ref: SessionIdentityRef): boolean;
  restore(): Promise<void>;
  authenticated(session: SessionCurrentDto): void;
  anonymous(ref?: SessionIdentityRef): void;
  fail(message: string): void;
  updateUser(user: UserPublicDto, ref?: SessionIdentityRef): void;
  logout(ref?: SessionIdentityRef): Promise<void>;
}

/**
 * One shared identity state. A generation counter isolates slow responses: an
 * older current()/logout result can never overwrite a newer login or logout.
 */
export function createSessionStore(api: AuthApi): SessionStore {
  const state = ref<SessionState>({ status: 'loading' });
  // Bumped on every identity change. A request captures a ref at start and is
  // ignored if the epoch or the user id has changed by the time it resolves.
  let generation = 0;

  const identity = (): SessionIdentityRef => {
    const current = state.value;
    return {
      epoch: generation,
      userId: current.status === 'authenticated' ? current.session.user.id : null,
    };
  };
  const isCurrent = (ref: SessionIdentityRef): boolean => {
    if (ref.epoch !== generation) return false;
    const current = state.value;
    const userId = current.status === 'authenticated' ? current.session.user.id : null;
    return userId === ref.userId;
  };

  return {
    state,
    identity,
    isCurrent,
    async restore() {
      const mine = ++generation;
      state.value = { status: 'loading' };
      try {
        const session = await api.current();
        if (mine !== generation) return;
        state.value = { status: 'authenticated', session };
      } catch (error) {
        if (mine !== generation) return;
        const failure = toApiClientError(error);
        // 401 is a clear logout; network/503 is retryable and must not clear state.
        state.value = failure.status === 401
          ? { status: 'anonymous' }
          : { status: 'error', message: failure.message };
      }
    },
    authenticated(session) {
      generation += 1;
      state.value = { status: 'authenticated', session };
    },
    anonymous(ref) {
      if (ref && !isCurrent(ref)) return;
      generation += 1;
      state.value = { status: 'anonymous' };
    },
    fail(message) {
      generation += 1;
      state.value = { status: 'error', message };
    },
    updateUser(user, ref) {
      if (ref && !isCurrent(ref)) return;
      const current = state.value;
      if (current.status === 'authenticated') {
        state.value = { ...current, session: { ...current.session, user } };
      }
    },
    async logout(ref) {
      const mine = ref ?? identity();
      await api.logout();
      // A slow logout must never clear a login that happened during the call.
      if (!isCurrent(mine)) return;
      generation += 1;
      state.value = { status: 'anonymous' };
    },
  };
}

export const sessionStore: SessionStore = createSessionStore(authApi);

export function useSessionStore(): SessionStore {
  return inject<SessionStore>(SESSION_STORE_KEY) ?? sessionStore;
}
