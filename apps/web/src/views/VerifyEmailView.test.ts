import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import VerifyEmailView from './VerifyEmailView.vue';
import { createAppRouter } from '../router';
import { AUTH_API_KEY } from '../api/injection';
import { SESSION_STORE_KEY } from '../auth/session';

const TOKEN = 'a_very_long_single_use_email_verification_token_123456';

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
    state: { value: { status: 'authenticated' } },
    restore: vi.fn(async () => undefined),
    authenticated: vi.fn(),
    anonymous: vi.fn(),
    fail: vi.fn(),
    updateUser: vi.fn(),
    logout: vi.fn(async () => undefined),
  };
}

async function mountVerify(query: string, fragment: string) {
  window.location.hash = fragment;
  const api = fakeApi();
  const store = fakeStore();
  const router = createAppRouter(createMemoryHistory());
  await router.push(`/verify-email${query}`);
  await router.isReady();
  const wrapper = mount(VerifyEmailView, {
    global: { plugins: [router], provide: { [AUTH_API_KEY]: api, [SESSION_STORE_KEY]: store } },
  });
  await flushPromises();
  return { wrapper, api };
}

describe('email verification fragment page', () => {
  it('reads the token from the fragment, removes the fragment and submits a new password', async () => {
    const { wrapper, api } = await mountVerify('?mode=add', `#${TOKEN}`);
    expect(window.location.hash).toBe('');
    api.completePasswordCredential.mockResolvedValue(undefined);

    await wrapper.get('[data-testid="verify-password"]').setValue('a-brand-new-password');
    await wrapper.get('[data-testid="verify-submit"]').trigger('submit');
    await flushPromises();

    expect(api.completePasswordCredential).toHaveBeenCalledWith({
      token: TOKEN,
      password: 'a-brand-new-password',
    });
  });

  it('submits only the token when confirming an existing email', async () => {
    const { wrapper, api } = await mountVerify('?mode=verify', `#${TOKEN}`);
    expect(wrapper.find('[data-testid="verify-password"]').exists()).toBe(false);
    api.completePasswordCredential.mockResolvedValue(undefined);

    await wrapper.get('[data-testid="verify-submit"]').trigger('submit');
    await flushPromises();
    expect(api.completePasswordCredential).toHaveBeenCalledWith({ token: TOKEN });
  });

  it('does not load third-party resources and shows a fixed message without a token', async () => {
    const { wrapper, api } = await mountVerify('?mode=add', '');
    expect(wrapper.get('[data-testid="verify-error"]').text()).toContain('链接');
    expect(api.completePasswordCredential).not.toHaveBeenCalled();
    expect(wrapper.html()).not.toMatch(/<img[^>]+src=["']https?:/);
  });
});
