import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import App from './App.vue';
import { createAppRouter } from './router';
import { AUTH_API_KEY, BOOKS_API_KEY } from './api/injection';
import { SESSION_STORE_KEY } from './auth/session';
import { pageOf } from './testing/fixtures';

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
  return { login: vi.fn(), register: vi.fn(), current: vi.fn(), logout: vi.fn(async () => undefined), updateProfile: vi.fn() };
}

function fakeStore(status: 'authenticated' | 'anonymous' | 'error' = 'anonymous') {
  const value =
    status === 'authenticated' ? { status: 'authenticated', session }
      : status === 'error' ? { status: 'error', message: '服务暂时不可用，请重试。' }
        : { status: 'anonymous' };
  const state = { value };
  const anonymous = vi.fn(() => { state.value = { status: 'anonymous' }; });
  return {
    state,
    restore: vi.fn(async () => undefined),
    authenticated: vi.fn(),
    anonymous,
    fail: vi.fn(),
    updateUser: vi.fn(),
    logout: vi.fn(async () => { anonymous(); }),
  };
}

async function mountApp(api: ReturnType<typeof fakeApi>, store: ReturnType<typeof fakeStore>) {
  const router = createAppRouter(createMemoryHistory());
  await router.push('/books');
  await router.isReady();
  const wrapper = mount(App, {
    global: {
      plugins: [router],
      provide: {
        [AUTH_API_KEY]: api,
        [SESSION_STORE_KEY]: store,
        [BOOKS_API_KEY]: {
          listBooks: vi.fn(async () => pageOf([])),
          getBook: vi.fn(),
          listComments: vi.fn(),
        },
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('navigation session state', () => {
  it('shows the username and a logout control for an authenticated visitor', async () => {
    const api = fakeApi();
    const store = fakeStore('authenticated');
    const { wrapper } = await mountApp(api, store);
    expect(wrapper.get('[data-testid="nav-user"]').text()).toBe('Reader_01');
    expect(wrapper.find('[data-testid="nav-logout"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="nav-login"]').exists()).toBe(false);

    await wrapper.get('[data-testid="nav-logout"]').trigger('click');
    await flushPromises();
    expect(store.logout).toHaveBeenCalledTimes(1);
    expect(store.anonymous).toHaveBeenCalledTimes(1);
  });

  it('offers login and register for an anonymous visitor', async () => {
    const { wrapper } = await mountApp(fakeApi(), fakeStore('anonymous'));
    expect(wrapper.find('[data-testid="nav-login"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="nav-register"]').exists()).toBe(true);
  });

  it('shows a retry action without treating a network error as logout', async () => {
    const store = fakeStore('error');
    const { wrapper } = await mountApp(fakeApi(), store);
    expect(wrapper.get('[data-testid="nav-session-error"]').text()).toContain('服务暂时不可用');
    expect(wrapper.find('[data-testid="nav-login"]').exists()).toBe(false);

    await wrapper.get('[data-testid="nav-session-retry"]').trigger('click');
    await flushPromises();
    expect(store.restore).toHaveBeenCalled();
    expect(store.anonymous).not.toHaveBeenCalled();
  });
});
