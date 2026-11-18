import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import type { SessionCurrentDto, UserPublicDto } from '@guihua/contracts';
import { ApiClientError } from '../api/client';
import { createSessionStore } from './session';

const user: UserPublicDto = {
  id: '64b000000000000000000001',
  username: 'Reader_01',
  gender: 'unspecified',
  avatarUrl: null,
  signature: '',
  createdAt: '2026-11-18T00:00:00.000Z',
};
const session: SessionCurrentDto = { user, roles: ['user'], permissions: [], expiresAt: '2026-11-25T00:00:00.000Z' };

function fakeApi(current: () => Promise<SessionCurrentDto> = async () => session) {
  return {
    register: vi.fn(),
    login: vi.fn(),
    current: vi.fn(current),
    logout: vi.fn(async (): Promise<void> => undefined),
    updateProfile: vi.fn(),
    loginMethods: vi.fn(),
    beginGithubLink: vi.fn(),
    unlinkGithub: vi.fn(async () => undefined),
    reauthenticatePassword: vi.fn(async () => undefined),
    beginGithubReauth: vi.fn(),
    requestEmailVerification: vi.fn(),
    completePasswordCredential: vi.fn(async () => undefined),
  };
}

describe('session store', () => {
  it('restores an authenticated session from current()', async () => {
    const store = createSessionStore(fakeApi());
    await store.restore();
    expect(store.state.value).toEqual({ status: 'authenticated', session });
  });

  it('clears local identity on 401 but treats network/503 as a retryable error', async () => {
    const api = fakeApi();
    api.current.mockRejectedValueOnce(new ApiClientError(401, 'UNAUTHORIZED', 'Authentication is required.'));
    const store = createSessionStore(api);
    await store.restore();
    expect(store.state.value).toEqual({ status: 'anonymous' });

    const flaky = fakeApi();
    flaky.current.mockRejectedValueOnce(new ApiClientError(503, 'SERVICE_UNAVAILABLE', 'Service dependencies are unavailable.'));
    const retryStore = createSessionStore(flaky);
    await retryStore.restore();
    expect(retryStore.state.value.status).toBe('error');
    expect(retryStore.state.value.status).not.toBe('anonymous');
  });

  it('does not let a slow current() response overwrite a newer login state', async () => {
    let resolveOld!: (value: SessionCurrentDto) => void;
    const api = fakeApi(() => new Promise<SessionCurrentDto>((resolve) => { resolveOld = resolve; }));
    const store = createSessionStore(api);

    const pending = store.restore();
    const newer: SessionCurrentDto = { ...session, user: { ...user, username: 'New_Name' } };
    store.authenticated(newer);
    resolveOld(session);
    await pending;
    await nextTick();

    expect(store.state.value).toEqual({ status: 'authenticated', session: newer });
  });

  it('clears identity only after a successful logout and keeps state on failure', async () => {
    const api = fakeApi();
    const store = createSessionStore(api);
    store.authenticated(session);
    await store.logout();
    expect(store.state.value).toEqual({ status: 'anonymous' });
    expect(api.logout).toHaveBeenCalledTimes(1);

    api.logout.mockRejectedValueOnce(new ApiClientError(503, 'SERVICE_UNAVAILABLE', 'Service dependencies are unavailable.'));
    store.authenticated(session);
    await expect(store.logout()).rejects.toBeDefined();
    expect(store.state.value.status).toBe('authenticated');
  });

  it('a slow logout from an old identity does not clear a newer login', async () => {
    let finishLogout!: () => void;
    const api = fakeApi();
    api.logout.mockImplementation(() => new Promise<void>((resolve) => { finishLogout = resolve; }));
    const store = createSessionStore(api);
    store.authenticated(session);

    const pending = store.logout();
    const other: SessionCurrentDto = {
      ...session,
      user: { ...user, id: '64b000000000000000000002', username: 'Second_User' },
    };
    store.authenticated(other);
    finishLogout();
    await pending;

    expect(store.state.value).toEqual({ status: 'authenticated', session: other });
  });

  it('updates only the public user while keeping roles and permissions', async () => {
    const store = createSessionStore(fakeApi());
    store.authenticated(session);
    store.updateUser({ ...user, username: 'Renamed_User' });
    const state = store.state.value;
    expect(state.status).toBe('authenticated');
    if (state.status === 'authenticated') {
      expect(state.session.user.username).toBe('Renamed_User');
      expect(state.session.roles).toEqual(['user']);
      expect(state.session.permissions).toEqual([]);
    }
  });
});
