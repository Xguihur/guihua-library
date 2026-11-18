import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import type { SessionCurrentDto, UserPublicDto } from '@guihua/contracts';
import ProfileView from './ProfileView.vue';
import { createAppRouter } from '../router';
import { AUTH_API_KEY } from '../api/injection';
import { SESSION_STORE_KEY, type SessionState } from '../auth/session';
import { ApiClientError } from '../api/client';

const user: UserPublicDto = {
  id: '64b000000000000000000001',
  username: 'Reader_01',
  gender: 'unspecified' as const,
  avatarUrl: null as string | null,
  signature: '',
  createdAt: '2026-11-18T00:00:00.000Z',
};
const session: SessionCurrentDto = { user, roles: ['user'], permissions: [], expiresAt: '2026-11-25T00:00:00.000Z' };

function fakeApi() {
  return { login: vi.fn(), register: vi.fn(), current: vi.fn(), logout: vi.fn(), updateProfile: vi.fn() };
}

const otherUser: UserPublicDto = { ...user, id: '64b000000000000000000002', username: 'Second_User' };
const otherSession: SessionCurrentDto = { ...session, user: otherUser };

function fakeStore(status: 'authenticated' | 'anonymous' = 'authenticated') {
  const state: { value: SessionState } = { value: status === 'authenticated' ? { status: 'authenticated', session } : { status: 'anonymous' } };
  let epoch = 1;
  const store = {
    state,
    restore: vi.fn(async () => undefined),
    authenticated: vi.fn((next: SessionCurrentDto) => {
      epoch += 1;
      state.value = { status: 'authenticated', session: next };
    }),
    anonymous: vi.fn(() => { epoch += 1; state.value = { status: 'anonymous' }; }),
    fail: vi.fn(),
    updateUser: vi.fn((next: UserPublicDto) => {
      const current = state.value;
      if (current.status === 'authenticated') {
        state.value = { status: 'authenticated', session: { ...current.session, user: next } };
      }
    }),
    logout: vi.fn(async () => undefined),
    identity: () => ({ epoch, userId: state.value.status === 'authenticated' ? state.value.session.user.id : null }),
    isCurrent: (ref: { epoch: number }) => ref.epoch === epoch,
  };
  return store;
}

async function mountProfile(api: ReturnType<typeof fakeApi>, store: ReturnType<typeof fakeStore>) {
  const router = createAppRouter(createMemoryHistory());
  await router.push('/me');
  await router.isReady();
  const wrapper = mount(ProfileView, {
    global: { plugins: [router], provide: { [AUTH_API_KEY]: api, [SESSION_STORE_KEY]: store } },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('profile view', () => {
  it('asks an anonymous visitor to log in first', async () => {
    const api = fakeApi();
    const { wrapper } = await mountProfile(api, fakeStore('anonymous'));
    expect(wrapper.find('[data-testid="profile-login-prompt"]').exists()).toBe(true);
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it('renders the signature as plain text and the avatar with no-referrer and a failure placeholder', async () => {
    const api = fakeApi();
    const store = fakeStore();
    store.state.value = { status: 'authenticated', session: {
      ...session,
      user: { ...user, signature: '<b>hi</b><script>x</script>', avatarUrl: 'https://cdn.example.com/a.png' },
    } };
    const { wrapper } = await mountProfile(api, store);

    const preview = wrapper.get('[data-testid="signature-preview"]');
    expect(preview.text()).toContain('<b>hi</b>');
    expect(wrapper.html()).not.toContain('<script>x</script>');
    const avatar = wrapper.get('[data-testid="profile-avatar"]');
    expect(avatar.attributes('src')).toBe('https://cdn.example.com/a.png');
    expect(avatar.attributes('referrerpolicy')).toBe('no-referrer');

    expect(wrapper.find('[data-testid="avatar-placeholder"]').exists()).toBe(false);
    await avatar.trigger('error');
    expect(wrapper.find('[data-testid="avatar-placeholder"]').exists()).toBe(true);
  });

  it('sends only edited fields and updates the public user after a successful save', async () => {
    const api = fakeApi();
    api.updateProfile.mockResolvedValue({ ...user, signature: '新签名' });
    const store = fakeStore();
    const { wrapper } = await mountProfile(api, store);

    await wrapper.get('[data-testid="profile-signature"]').setValue('新签名');
    await wrapper.get('[data-testid="profile-save"]').trigger('submit');
    await flushPromises();

    expect(api.updateProfile).toHaveBeenCalledWith({ signature: '新签名' });
    expect(store.updateUser).toHaveBeenCalledWith({ ...user, signature: '新签名' }, expect.anything());
    expect(wrapper.find('[data-testid="profile-saved"]').exists()).toBe(true);
  });

  it('does not write a slow profile response back after logout', async () => {
    const api = fakeApi();
    let resolveSave!: (value: typeof user) => void;
    api.updateProfile.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    const store = fakeStore();
    const { wrapper } = await mountProfile(api, store);

    await wrapper.get('[data-testid="profile-signature"]').setValue('stale');
    await wrapper.get('[data-testid="profile-save"]').trigger('submit');
    await flushPromises();

    store.anonymous();
    resolveSave({ ...user, signature: 'stale' });
    await flushPromises();

    expect(store.updateUser).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="profile-saved"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="profile-login-prompt"]').exists()).toBe(true);
  });

  it('clears identity on a 401 response and shows a conflict error otherwise', async () => {
    const api = fakeApi();
    api.updateProfile
      .mockRejectedValueOnce(new ApiClientError(401, 'UNAUTHORIZED', 'Authentication is required.'))
      .mockRejectedValueOnce(new ApiClientError(409, 'IDENTITY_CONFLICT', 'Identity is already in use.'));
    const store = fakeStore();
    const { wrapper } = await mountProfile(api, store);
    const form = wrapper.get('[data-testid="profile-save"]');

    await wrapper.get('[data-testid="profile-signature"]').setValue('x');
    await form.trigger('submit');
    await flushPromises();
    expect(store.anonymous).toHaveBeenCalled();

    const second = fakeStore();
    second.state.value = { status: 'authenticated', session };
    const api2 = fakeApi();
    api2.updateProfile.mockRejectedValueOnce(new ApiClientError(409, 'IDENTITY_CONFLICT', 'Identity is already in use.'));
    const { wrapper: w2 } = await mountProfile(api2, second);
    await w2.get('[data-testid="profile-username"]').setValue('Taken_Name');
    await w2.get('[data-testid="profile-save"]').trigger('submit');
    await flushPromises();
    expect(w2.get('[data-testid="auth-error"]').text()).toContain('Identity is already in use.');
  });

  it('does not write a slow A response over a same-account re-login', async () => {
    const api = fakeApi();
    let finish!: (value: UserPublicDto) => void;
    api.updateProfile.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const store = fakeStore();
    const { wrapper } = await mountProfile(api, store);

    await wrapper.get('[data-testid="profile-signature"]').setValue('stale-A');
    await wrapper.get('[data-testid="profile-save"]').trigger('submit');
    await flushPromises();

    // Same user id, but a brand-new session (logout + login again).
    store.anonymous();
    store.authenticated(session);
    finish({ ...user, signature: 'stale-A' });
    await flushPromises();

    expect(store.updateUser).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="profile-saved"]').exists()).toBe(false);
  });

  it('does not write a slow A response over a different logged-in account', async () => {
    const api = fakeApi();
    let finish!: (value: UserPublicDto) => void;
    api.updateProfile.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const store = fakeStore();
    const { wrapper } = await mountProfile(api, store);

    await wrapper.get('[data-testid="profile-signature"]').setValue('stale-A');
    await wrapper.get('[data-testid="profile-save"]').trigger('submit');
    await flushPromises();

    store.anonymous();
    store.authenticated(otherSession);
    finish({ ...user, signature: 'stale-A' });
    await flushPromises();

    expect(store.updateUser).not.toHaveBeenCalled();
    if (store.state.value.status === 'authenticated') {
      expect(store.state.value.session.user.username).toBe('Second_User');
    }
  });

  it('a stale 401 does not clear a newer login', async () => {
    const api = fakeApi();
    let fail!: (error: unknown) => void;
    api.updateProfile.mockImplementation(() => new Promise((_resolve, reject) => { fail = reject; }));
    const store = fakeStore();
    const { wrapper } = await mountProfile(api, store);

    await wrapper.get('[data-testid="profile-signature"]').setValue('x');
    await wrapper.get('[data-testid="profile-save"]').trigger('submit');
    await flushPromises();

    store.anonymous();
    store.authenticated(otherSession);
    fail(new ApiClientError(401, 'UNAUTHORIZED', 'Authentication is required.'));
    await flushPromises();

    expect(store.anonymous).toHaveBeenCalledTimes(1); // only the deliberate logout
    expect(store.state.value.status).toBe('authenticated');
  });

});
