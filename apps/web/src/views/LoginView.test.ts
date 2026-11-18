import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import LoginView from './LoginView.vue';
import { createAppRouter } from '../router';
import { AUTH_API_KEY } from '../api/injection';
import { SESSION_STORE_KEY } from '../auth/session';
import { ApiClientError } from '../api/client';
import { startGithubLogin } from '../auth/github-login';

vi.mock('../auth/github-login', () => ({ startGithubLogin: vi.fn(async () => undefined) }));

const user = {
  id: '64b000000000000000000001',
  username: 'Reader_01',
  gender: 'unspecified' as const,
  avatarUrl: null,
  signature: '',
  createdAt: '2026-11-18T00:00:00.000Z',
};
const session = { user, roles: ['user'], permissions: [], expiresAt: '2026-11-25T00:00:00.000Z' };

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

async function mountLogin(api: ReturnType<typeof fakeApi>, store: ReturnType<typeof fakeStore>, query = '') {
  const router = createAppRouter(createMemoryHistory());
  await router.push(`/login${query}`);
  await router.isReady();
  const wrapper = mount(LoginView, {
    global: { plugins: [router], provide: { [AUTH_API_KEY]: api, [SESSION_STORE_KEY]: store } },
  });
  return { wrapper, router };
}

describe('login view', () => {
  it('submits credentials, stores the session and returns to a safe in-site path', async () => {
    const api = fakeApi();
    api.login.mockResolvedValue(session);
    const store = fakeStore();
    const { wrapper, router } = await mountLogin(api, store, '?returnTo=%2Fbooks%2Fabc');

    await wrapper.get('[data-testid="login-identifier"]').setValue('Reader_01');
    await wrapper.get('[data-testid="login-password"]').setValue('correct-horse');
    await wrapper.get('[data-testid="login-submit"]').trigger('submit');
    await flushPromises();

    expect(api.login).toHaveBeenCalledWith({ identifier: 'Reader_01', password: 'correct-horse' });
    expect(store.authenticated).toHaveBeenCalledWith(session);
    expect(router.currentRoute.value.path).toBe('/books/abc');
  });

  it('uses password autocomplete and disables the button while submitting', async () => {
    const api = fakeApi();
    const store = fakeStore();
    let resolveLogin!: (value: typeof session) => void;
    api.login.mockImplementation(() => new Promise((resolve) => { resolveLogin = resolve; }));
    const { wrapper } = await mountLogin(api, store);

    expect(wrapper.get('[data-testid="login-password"]').attributes('autocomplete')).toBe('current-password');
    await wrapper.get('[data-testid="login-submit"]').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[data-testid="login-submit"]').attributes('disabled')).toBeDefined();

    resolveLogin(session);
    await flushPromises();
    expect(wrapper.get('[data-testid="login-submit"]').attributes('disabled')).toBeUndefined();
  });

  it('shows the server error, stays on the page and allows a retry', async () => {
    const api = fakeApi();
    api.login
      .mockRejectedValueOnce(new ApiClientError(401, 'INVALID_CREDENTIALS', 'Invalid credentials.'))
      .mockResolvedValueOnce(session);
    const store = fakeStore();
    const { wrapper, router } = await mountLogin(api, store);

    const form = wrapper.get('[data-testid="login-submit"]');
    await form.trigger('submit');
    await flushPromises();
    expect(wrapper.get('[data-testid="auth-error"]').text()).toContain('Invalid credentials.');
    expect(router.currentRoute.value.path).toBe('/login');
    expect(store.authenticated).not.toHaveBeenCalled();

    await form.trigger('submit');
    await flushPromises();
    expect(store.authenticated).toHaveBeenCalledWith(session);
    expect(wrapper.find('[data-testid="auth-error"]').exists()).toBe(false);
  });

  it('ignores an external returnTo and lands on the in-site fallback', async () => {
    const api = fakeApi();
    api.login.mockResolvedValue(session);
    const store = fakeStore();
    const { wrapper, router } = await mountLogin(api, store, '?returnTo=https%3A%2F%2Fevil.example');

    await wrapper.get('[data-testid="login-submit"]').trigger('submit');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/me');
  });

  it('offers a GitHub entry with explicit guidance for existing accounts', async () => {
    const { wrapper } = await mountLogin(fakeApi(), fakeStore());
    expect(wrapper.text()).toContain('已有账号请先登录');
    const entry = wrapper.get('[data-testid="github-login"]');
    await entry.trigger('click');
    await flushPromises();
    expect(startGithubLogin).toHaveBeenCalled();
  });
});
