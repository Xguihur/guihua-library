<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthApi } from '../api/injection';
import { toApiClientError } from '../api/client';
import { useSessionStore } from '../auth/session';
import { safeReturnTo } from '../auth/return-to';

const api = useAuthApi();
const store = useSessionStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const username = ref('');
const password = ref('');
const error = ref('');
const submitting = ref(false);
const emailInput = ref<HTMLInputElement | null>(null);

async function submit(): Promise<void> {
  if (submitting.value) return;
  submitting.value = true;
  error.value = '';
  try {
    await api.register({ email: email.value, username: username.value, password: password.value });
    password.value = '';
    // Registration sets the HttpOnly cookie; current() restores the full session.
    await store.restore();
    await router.push(safeReturnTo(route.query.returnTo));
  } catch (cause) {
    error.value = toApiClientError(cause).message;
    emailInput.value?.focus();
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="auth-panel" aria-labelledby="register-heading">
    <h1 id="register-heading">注册</h1>
    <p class="lede">用一个站内账号开始记录你读过的书。</p>

    <p v-if="error" class="form-error" role="alert" data-testid="auth-error">{{ error }}</p>

    <form class="auth-form" @submit.prevent="submit">
      <label for="register-email">邮箱</label>
      <input
        id="register-email"
        ref="emailInput"
        v-model="email"
        data-testid="register-email"
        type="email"
        autocomplete="email"
        required
      />

      <label for="register-username">用户名</label>
      <input
        id="register-username"
        v-model="username"
        data-testid="register-username"
        type="text"
        autocomplete="username"
        required
      />

      <label for="register-password">密码</label>
      <input
        id="register-password"
        v-model="password"
        data-testid="register-password"
        type="password"
        autocomplete="new-password"
        minlength="12"
        required
      />

      <button class="button" data-testid="register-submit" type="submit" :disabled="submitting">
        {{ submitting ? '注册中…' : '注册' }}
      </button>
    </form>

    <p class="auth-alt">已有账号？<RouterLink to="/login" data-testid="to-login">登录</RouterLink></p>
  </section>
</template>
