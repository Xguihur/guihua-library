<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthApi } from '../api/injection';
import { toApiClientError } from '../api/client';
import { useSessionStore } from '../auth/session';
import { safeReturnTo } from '../auth/return-to';
import { startGithubLogin } from '../auth/github-login';

const api = useAuthApi();
const store = useSessionStore();
const router = useRouter();
const route = useRoute();

const identifier = ref('');
const password = ref('');
const error = ref('');
const submitting = ref(false);
const identifierInput = ref<HTMLInputElement | null>(null);
const githubError = ref('');

async function githubLogin(): Promise<void> {
  githubError.value = '';
  try {
    await startGithubLogin();
  } catch (cause) {
    githubError.value = cause instanceof Error ? cause.message : 'GitHub 登录暂不可用。';
  }
}

async function submit(): Promise<void> {
  if (submitting.value) return;
  submitting.value = true;
  error.value = '';
  try {
    const session = await api.login({ identifier: identifier.value, password: password.value });
    store.authenticated(session);
    // Never keep the typed password in client state after a successful login.
    password.value = '';
    await router.push(safeReturnTo(route.query.returnTo));
  } catch (cause) {
    error.value = toApiClientError(cause).message;
    identifierInput.value?.focus();
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="auth-panel" aria-labelledby="login-heading">
    <h1 id="login-heading">登录</h1>
    <p class="lede">已有账号请先登录，再在账号设置里绑定 GitHub。</p>

    <p v-if="error" class="form-error" role="alert" data-testid="auth-error">{{ error }}</p>

    <form class="auth-form" @submit.prevent="submit">
      <label for="login-identifier">邮箱或用户名</label>
      <input
        id="login-identifier"
        ref="identifierInput"
        v-model="identifier"
        data-testid="login-identifier"
        type="text"
        autocomplete="username"
        required
      />

      <label for="login-password">密码</label>
      <input
        id="login-password"
        v-model="password"
        data-testid="login-password"
        type="password"
        autocomplete="current-password"
        required
      />

      <button class="button" data-testid="login-submit" type="submit" :disabled="submitting">
        {{ submitting ? '登录中…' : '登录' }}
      </button>
    </form>

    <div class="github-entry">
      <button class="button" type="button" data-testid="github-login" :disabled="submitting" @click="githubLogin">
        使用 GitHub 登录或注册
      </button>
      <p v-if="githubError" class="form-error" role="alert" data-testid="github-error">{{ githubError }}</p>
      <p class="lede">
        新 GitHub 账号会自动创建站内账号；已有邮箱账号不会按邮箱合并，请先登录再到账号设置绑定。
      </p>
    </div>

    <p class="auth-alt">还没有账号？<RouterLink to="/register" data-testid="to-register">注册</RouterLink></p>
  </section>
</template>
