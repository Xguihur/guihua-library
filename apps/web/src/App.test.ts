import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import { ref } from 'vue';
import App from './App.vue';
import { createAppRouter } from './router';
import { AUTH_API_KEY, BOOKS_API_KEY } from './api/injection';
import { SESSION_STORE_KEY, type SessionState } from './auth/session';
import { pageOf } from './testing/fixtures';

type TestUser = Omit<typeof user, 'avatarUrl'> & { avatarUrl: string | null };
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

function fakeStore(status: 'authenticated' | 'anonymous' | 'error' = 'anonymous', overrideUser?: TestUser) {
  const value: SessionState =
    status === 'authenticated' ? { status: 'authenticated', session: overrideUser ? { ...session, user: overrideUser } : session }
      : status === 'error' ? { status: 'error', message: '服务暂时不可用，请重试。' }
        : { status: 'anonymous' };
  // A real ref so template updates (e.g. after logout) are visible to tests.
  const state = ref<SessionState>(value);
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

async function mountApp(api: ReturnType<typeof fakeApi>, store: ReturnType<typeof fakeStore>, attachToDocument = false) {
  const router = createAppRouter(createMemoryHistory());
  await router.push('/books');
  await router.isReady();
  const wrapper = mount(App, {
    // Focus assertions need a real document connection.
    attachTo: attachToDocument ? document.body : undefined,
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
  it('keeps the user menu collapsed until the avatar is activated, then shows it', async () => {
    const api = fakeApi();
    const store = fakeStore('authenticated');
    const { wrapper } = await mountApp(api, store);

    // Collapsed by default: only the avatar button is in the nav.
    expect(wrapper.find('[data-testid="nav-avatar"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="nav-user"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="nav-logout"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="nav-avatar"]').attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('[data-testid="nav-login"]').exists()).toBe(false);

    const avatar = wrapper.get('[data-testid="nav-avatar"]');
    await avatar.trigger('click');
    expect(avatar.attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('[data-testid="nav-user"]').text()).toBe('Reader_01');
    expect(wrapper.find('[data-testid="nav-books"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="nav-profile"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="nav-settings"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="nav-logout"]').exists()).toBe(true);

    await avatar.trigger('click');
    expect(avatar.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('[data-testid="nav-logout"]').exists()).toBe(false);
  });

  it('opens on mouseenter and closes on mouseleave', async () => {
    const { wrapper } = await mountApp(fakeApi(), fakeStore('authenticated'));
    const menu = wrapper.get('[data-testid="nav-user-menu"]');
    await menu.trigger('mouseenter');
    expect(wrapper.find('[data-testid="nav-logout"]').exists()).toBe(true);
    await menu.trigger('mouseleave');
    expect(wrapper.find('[data-testid="nav-logout"]').exists()).toBe(false);
  });

  it('closes on Escape and returns focus to the avatar', async () => {
    const { wrapper } = await mountApp(fakeApi(), fakeStore('authenticated'), true);
    const avatar = wrapper.get('[data-testid="nav-avatar"]');
    await avatar.trigger('click');
    expect(wrapper.find('[data-testid="nav-logout"]').exists()).toBe(true);
    await avatar.trigger('keydown.escape');
    expect(wrapper.find('[data-testid="nav-logout"]').exists()).toBe(false);
    expect(document.activeElement).toBe(avatar.element);
    wrapper.unmount();
  });

  it('closes on an outside pointerdown but stays open for pointers inside the menu', async () => {
    const { wrapper } = await mountApp(fakeApi(), fakeStore('authenticated'), true);
    const menu = wrapper.get('[data-testid="nav-user-menu"]');
    await menu.trigger('mouseenter');
    expect(wrapper.find('[data-testid="nav-logout"]').exists()).toBe(true);

    // A pointerdown on the wrapper itself (avatar or panel) keeps the menu open.
    menu.element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await flushPromises();
    expect(wrapper.find('[data-testid="nav-logout"]').exists()).toBe(true);

    // A pointerdown on the page background closes it.
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await flushPromises();
    expect(wrapper.find('[data-testid="nav-logout"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('moves focus to the first menu item when the menu is keyboard-activated', async () => {
    const { wrapper } = await mountApp(fakeApi(), fakeStore('authenticated'), true);
    const avatar = wrapper.get('[data-testid="nav-avatar"]');
    // detail === 0 marks a keyboard-activated click (Enter/Space on the button).
    avatar.element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    await flushPromises();
    expect(document.activeElement).toBe(wrapper.get('[data-testid="nav-books"]').element);
    wrapper.unmount();
  });

  it('labels the avatar button with the account menu and username', async () => {
    const withAvatar = { ...user, avatarUrl: 'https://cdn.example.com/avatar.png' };
    const { wrapper } = await mountApp(fakeApi(), fakeStore('authenticated', withAvatar));
    // The inner img has alt="" and the fallback is aria-hidden, so the button
    // must carry the name itself.
    expect(wrapper.get('[data-testid="nav-avatar"]').attributes('aria-label')).toBe('账号菜单：Reader_01');
  });

  it('closes when keyboard focus leaves the menu wrapper and does not reopen afterwards', async () => {
    const { wrapper } = await mountApp(fakeApi(), fakeStore('authenticated'), true);
    const avatar = wrapper.get('[data-testid="nav-avatar"]');
    const title = wrapper.get('.site-title').element;

    await avatar.trigger('click');
    // Tabbing past the last item lands on an element outside the wrapper.
    wrapper.get('[data-testid="nav-books"]').element
      .dispatchEvent(new FocusEvent('focusout', { relatedTarget: title, bubbles: true }));
    await flushPromises();
    expect(wrapper.find('[data-testid="nav-logout"]').exists()).toBe(false);

    // Focus moving to browser chrome (relatedTarget null) also closes. The
    // panel is re-created on reopen, so grab the link element fresh.
    await avatar.trigger('click');
    wrapper.get('[data-testid="nav-books"]').element
      .dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await flushPromises();
    expect(wrapper.find('[data-testid="nav-logout"]').exists()).toBe(false);

    // Escape closes and refocuses the avatar; that focusout stays inside the
    // wrapper and must not leave the menu open.
    await avatar.trigger('click');
    await avatar.trigger('keydown.escape');
    expect(wrapper.find('[data-testid="nav-logout"]').exists()).toBe(false);
    expect(document.activeElement).toBe(avatar.element);
    await avatar.trigger('focusout', { relatedTarget: title });
    expect(wrapper.find('[data-testid="nav-logout"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('closes the menu immediately on logout even when the request fails', async () => {
    const store = fakeStore('authenticated');
    store.logout.mockRejectedValueOnce(new Error('network down'));
    const { wrapper } = await mountApp(fakeApi(), store);
    await wrapper.get('[data-testid="nav-avatar"]').trigger('click');
    expect(wrapper.find('[data-testid="nav-user"]').exists()).toBe(true);

    await wrapper.get('[data-testid="nav-logout"]').trigger('click');
    await flushPromises();
    // Still authenticated, but the menu is collapsed and the error is shown.
    expect(wrapper.get('[data-testid="logout-error"]').text()).toContain('网络连接失败');
    expect(wrapper.find('[data-testid="nav-user"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="nav-avatar"]').exists()).toBe(true);
  });

  it('closes when the route changes', async () => {
    const { wrapper, router } = await mountApp(fakeApi(), fakeStore('authenticated'));
    await wrapper.get('[data-testid="nav-avatar"]').trigger('click');
    expect(wrapper.find('[data-testid="nav-profile"]').exists()).toBe(true);
    await router.push('/me');
    expect(wrapper.find('[data-testid="nav-profile"]').exists()).toBe(false);
  });

  it('falls back to a green initial when the avatar image fails or is empty', async () => {
    const withAvatar = { ...user, avatarUrl: 'https://cdn.example.com/avatar.png' };
    const { wrapper } = await mountApp(fakeApi(), fakeStore('authenticated', withAvatar));
    const avatar = wrapper.get('[data-testid="nav-avatar"]');

    // A real URL renders an <img> with no-referrer so the foreign host never
    // receives the reader's origin.
    const image = avatar.get('img');
    expect(image.attributes('referrerpolicy')).toBe('no-referrer');

    // A broken image degrades to the username initial.
    await image.trigger('error');
    expect(avatar.find('img').exists()).toBe(false);
    expect(avatar.get('.avatar--fallback').text()).toBe('R');
  });

  it('shows the initial placeholder without any avatar URL', async () => {
    const { wrapper } = await mountApp(fakeApi(), fakeStore('authenticated'));
    const avatar = wrapper.get('[data-testid="nav-avatar"]');
    expect(avatar.find('img').exists()).toBe(false);
    expect(avatar.get('.avatar--fallback').text()).toBe('R');
  });

  it('logs out from the menu and returns to the anonymous navigation', async () => {
    const api = fakeApi();
    const store = fakeStore('authenticated');
    const { wrapper } = await mountApp(api, store);
    await wrapper.get('[data-testid="nav-avatar"]').trigger('click');
    await wrapper.get('[data-testid="nav-logout"]').trigger('click');
    await flushPromises();
    expect(store.logout).toHaveBeenCalledTimes(1);
    expect(store.anonymous).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-testid="nav-logout"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="nav-login"]').exists()).toBe(true);
  });

  it('offers books, login and register with spacing for an anonymous visitor', async () => {
    const { wrapper } = await mountApp(fakeApi(), fakeStore('anonymous'));
    expect(wrapper.find('[data-testid="nav-books"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="nav-login"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="nav-register"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="nav-avatar"]').exists()).toBe(false);
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
