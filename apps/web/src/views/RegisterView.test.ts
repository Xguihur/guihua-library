import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import RegisterView from './RegisterView.vue';
import { createAppRouter } from '../router';
import { AUTH_API_KEY } from '../api/injection';
import { SESSION_STORE_KEY } from '../auth/session';
import { ApiClientError } from '../api/client';

const user = {
  id: '64b000000000000000000001',
  username: 'Reader_01',
  gender: 'unspecified' as const,
  avatarUrl: null,
  signature: '',
  createdAt: '2026-11-18T00:00:00.000Z',
};

function fakeApi() {
  return { login: vi.fn(), register: vi.fn(), current: vi.fn(), logout: vi.fn(), updateProfile: vi.fn() };
}

function fakeStore() {
  return {
    state: { value: { status: 'anonymous' } },
    restore: vi.fn(async () => undefined),
    authenticated: vi.fn(),
    anonymous: vi.fn(),
    fail: vi.fn(),
    updateUser: vi.fn(),
    logout: vi.fn(async () => undefined),
  };
}

async function mountRegister(api: ReturnType<typeof fakeApi>, store: ReturnType<typeof fakeStore>) {
  const router = createAppRouter(createMemoryHistory());
  await router.push('/register');
  await router.isReady();
  const wrapper = mount(RegisterView, {
    global: { plugins: [router], provide: { [AUTH_API_KEY]: api, [SESSION_STORE_KEY]: store } },
  });
  return { wrapper, router };
}

describe('register view', () => {
  it('registers, restores the session created by the cookie and opens the profile', async () => {
    const api = fakeApi();
    api.register.mockResolvedValue(user);
    const store = fakeStore();
    const { wrapper, router } = await mountRegister(api, store);

    expect(wrapper.get('[data-testid="register-password"]').attributes('autocomplete')).toBe('new-password');
    await wrapper.get('[data-testid="register-email"]').setValue('a@b.example');
    await wrapper.get('[data-testid="register-username"]').setValue('Reader_01');
    await wrapper.get('[data-testid="register-password"]').setValue('correct-horse');
    await wrapper.get('[data-testid="register-submit"]').trigger('submit');
    await flushPromises();

    expect(api.register).toHaveBeenCalledWith({ email: 'a@b.example', username: 'Reader_01', password: 'correct-horse' });
    expect(store.restore).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).toBe('/me');
  });

  it('shows validation and conflict errors without navigating away', async () => {
    const api = fakeApi();
    api.register
      .mockRejectedValueOnce(new ApiClientError(400, 'INVALID_USERNAME', 'Username is not valid.'))
      .mockRejectedValueOnce(new ApiClientError(409, 'IDENTITY_CONFLICT', 'Identity is already in use.'));
    const store = fakeStore();
    const { wrapper, router } = await mountRegister(api, store);
    const form = wrapper.get('[data-testid="register-submit"]');

    await form.trigger('submit');
    await flushPromises();
    expect(wrapper.get('[data-testid="auth-error"]').text()).toContain('Username is not valid.');
    expect(store.restore).not.toHaveBeenCalled();

    await form.trigger('submit');
    await flushPromises();
    expect(wrapper.get('[data-testid="auth-error"]').text()).toContain('Identity is already in use.');
    expect(router.currentRoute.value.path).toBe('/register');
  });
});
