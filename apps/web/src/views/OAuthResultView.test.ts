import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import OAuthResultView from './OAuthResultView.vue';
import { createAppRouter } from '../router';
import { AUTH_API_KEY } from '../api/injection';
import { SESSION_STORE_KEY } from '../auth/session';

function fakeApi() {
  return {
    loginMethods: vi.fn(),
    beginGithubLink: vi.fn(),
    unlinkGithub: vi.fn(),
    reauthenticatePassword: vi.fn(),
    beginGithubReauth: vi.fn(),
    requestEmailVerification: vi.fn(),
    completePasswordCredential: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    current: vi.fn(),
    logout: vi.fn(),
    updateProfile: vi.fn(),
  };
}

function fakeStore() {
  return {
    state: { value: { status: 'loading' } },
    restore: vi.fn(async () => undefined),
    authenticated: vi.fn(),
    anonymous: vi.fn(),
    fail: vi.fn(),
    updateUser: vi.fn(),
    logout: vi.fn(async () => undefined),
  };
}

async function mountResult(query: string) {
  const api = fakeApi();
  const store = fakeStore();
  const router = createAppRouter(createMemoryHistory());
  await router.push(`/oauth-result${query}`);
  await router.isReady();
  const wrapper = mount(OAuthResultView, {
    global: { plugins: [router], provide: { [AUTH_API_KEY]: api, [SESSION_STORE_KEY]: store } },
  });
  await flushPromises();
  return { wrapper, store, router };
}

describe('OAuth fixed result view', () => {
  it('shows a stable message for a binding conflict without echoing any query string', async () => {
    const { wrapper } = await mountResult('?status=conflict&code=leaked&state=leaked');
    expect(wrapper.get('[data-testid="oauth-result"]').text()).toContain('已被其他账号绑定');
    expect(wrapper.html()).not.toContain('leaked');
  });

  it('restores the session and returns in-site after a successful login', async () => {
    const { store, router } = await mountResult('?status=login-success');
    expect(store.restore).toHaveBeenCalled();
    expect(router.currentRoute.value.path).toBe('/books');
  });

  it('asks the user to confirm the operation again after a GitHub recheck', async () => {
    const { wrapper, router } = await mountResult('?status=reauth-success');
    expect(wrapper.get('[data-testid="oauth-result"]').text()).toContain('请再次确认');
    expect(router.currentRoute.value.path).toBe('/oauth-result');
  });

  it('maps cancellation and expiry to fixed guidance', async () => {
    const cancelled = await mountResult('?status=cancelled');
    expect(cancelled.wrapper.get('[data-testid="oauth-result"]').text()).toContain('取消');
    const expired = await mountResult('?status=expired');
    expect(expired.wrapper.get('[data-testid="oauth-result"]').text()).toContain('过期');
  });
});
