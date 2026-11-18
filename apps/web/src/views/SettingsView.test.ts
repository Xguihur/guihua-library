import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import SettingsView from './SettingsView.vue';
import { createAppRouter } from '../router';
import { AUTH_API_KEY } from '../api/injection';
import { SESSION_STORE_KEY } from '../auth/session';

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
    state: { value: { status: 'authenticated', session } },
    restore: vi.fn(async () => undefined),
    authenticated: vi.fn(),
    anonymous: vi.fn(),
    fail: vi.fn(),
    updateUser: vi.fn(),
    logout: vi.fn(async () => undefined),
  };
}

async function mountSettings(api: ReturnType<typeof fakeApi>, store: ReturnType<typeof fakeStore>) {
  const router = createAppRouter(createMemoryHistory());
  await router.push('/settings');
  await router.isReady();
  const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => undefined);
  const wrapper = mount(SettingsView, {
    global: { plugins: [router], provide: { [AUTH_API_KEY]: api, [SESSION_STORE_KEY]: store } },
  });
  await flushPromises();
  return { wrapper, assign };
}

describe('account settings view', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('loads and displays the owner login methods', async () => {
    const api = fakeApi();
    api.loginMethods.mockResolvedValue({ github: { linked: false }, password: { enabled: true, email: 'reader@example.com' } });
    const store = fakeStore();
    const { wrapper } = await mountSettings(api, store);

    expect(api.loginMethods).toHaveBeenCalled();
    expect(wrapper.get('[data-testid="github-status"]').text()).toContain('未绑定');
    expect(wrapper.get('[data-testid="password-status"]').text()).toContain('reader@example.com');
  });

  it('requires a password recheck before starting a GitHub binding', async () => {
    const api = fakeApi();
    api.loginMethods.mockResolvedValue({ github: { linked: false }, password: { enabled: true, email: 'reader@example.com' } });
    api.reauthenticatePassword.mockResolvedValue(undefined);
    api.beginGithubLink.mockResolvedValue({ authorizationUrl: 'https://github.example.test/authorize?state=s' });
    const store = fakeStore();
    const { wrapper, assign } = await mountSettings(api, store);

    await wrapper.get('[data-testid="reauth-password"]').setValue('correct-horse-battery');
    await wrapper.get('[data-testid="reauth-submit"]').trigger('submit');
    await flushPromises();
    await wrapper.get('[data-testid="bind-github"]').trigger('click');
    await flushPromises();

    expect(api.reauthenticatePassword).toHaveBeenCalledWith('correct-horse-battery');
    expect(api.beginGithubLink).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith('https://github.example.test/authorize?state=s');
  });

  it('offers GitHub-based recheck when the account has no password', async () => {
    const api = fakeApi();
    api.loginMethods.mockResolvedValue({ github: { linked: true }, password: { enabled: false, email: null } });
    api.beginGithubReauth.mockResolvedValue({ authorizationUrl: 'https://github.example.test/authorize?state=r' });
    const store = fakeStore();
    const { wrapper, assign } = await mountSettings(api, store);

    expect(wrapper.find('[data-testid="reauth-password"]').exists()).toBe(false);
    await wrapper.get('[data-testid="reauth-github"]').trigger('click');
    await flushPromises();
    expect(api.beginGithubReauth).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith('https://github.example.test/authorize?state=r');
  });

  it('sends a verification email without collecting a new password on this page', async () => {
    const api = fakeApi();
    api.loginMethods.mockResolvedValue({ github: { linked: true }, password: { enabled: true, email: 'reader@example.com' } });
    api.reauthenticatePassword.mockResolvedValue(undefined);
    api.requestEmailVerification.mockResolvedValue({ message: '验证邮件已发送，请到原浏览器完成操作。' });
    const store = fakeStore();
    const { wrapper } = await mountSettings(api, store);

    await wrapper.get('[data-testid="reauth-password"]').setValue('correct-horse-battery');
    await wrapper.get('[data-testid="reauth-submit"]').trigger('submit');
    await flushPromises();
    await wrapper.get('[data-testid="verify-email-input"]').setValue('new@example.com');
    await wrapper.get('[data-testid="verification-form"]').trigger('submit');
    await flushPromises();

    expect(api.requestEmailVerification).toHaveBeenCalledWith('new@example.com');
    expect(wrapper.get('[data-testid="settings-notice"]').text()).toContain('验证邮件');
    expect(wrapper.find('[data-testid="new-password"]').exists()).toBe(false);
  });
});
