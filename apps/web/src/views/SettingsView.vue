<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { LoginMethodsDto } from '@guihua/contracts';
import { useAuthApi } from '../api/injection';
import { toApiClientError } from '../api/client';
import { useSessionStore } from '../auth/session';

const api = useAuthApi();
const store = useSessionStore();
const route = useRoute();

const methods = ref<LoginMethodsDto>({ github: { linked: false }, password: { enabled: false, email: null } });
const error = ref('');
const notice = ref('');
const reauthed = ref(route.query.rechecked === '1');
const password = ref('');
const verificationEmail = ref('');
const busy = ref(false);

onMounted(() => {
  void load();
});

async function load(): Promise<void> {
  error.value = '';
  try {
    methods.value = await api.loginMethods();
  } catch (cause) {
    const failure = toApiClientError(cause);
    if (failure.status === 401) {
      store.anonymous();
      return;
    }
    error.value = failure.message;
  }
}

/** The server still enforces the recheck; this flag only guides the UI. */
function needsRecheck(): boolean {
  if (reauthed.value) return false;
  notice.value = '敏感操作需要先复核身份。';
  return true;
}

async function recheckWithPassword(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    await api.reauthenticatePassword(password.value);
    password.value = '';
    reauthed.value = true;
    notice.value = '身份复核已通过，请确认后续操作。';
  } catch (cause) {
    error.value = toApiClientError(cause).message;
  } finally {
    busy.value = false;
  }
}

async function recheckWithGithub(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const { authorizationUrl } = await api.beginGithubReauth();
    reauthed.value = true;
    window.location.assign(authorizationUrl);
  } catch (cause) {
    error.value = toApiClientError(cause).message;
    busy.value = false;
  }
}

async function bindGithub(): Promise<void> {
  if (needsRecheck()) return;
  busy.value = true;
  error.value = '';
  try {
    const { authorizationUrl } = await api.beginGithubLink();
    window.location.assign(authorizationUrl);
  } catch (cause) {
    error.value = toApiClientError(cause).message;
    busy.value = false;
  }
}

async function unlinkGithub(): Promise<void> {
  if (needsRecheck()) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    await api.unlinkGithub();
    reauthed.value = false;
    await load();
    notice.value = 'GitHub 已解绑，当前会话已更新。';
  } catch (cause) {
    error.value = toApiClientError(cause).message;
  } finally {
    busy.value = false;
  }
}

async function sendVerification(): Promise<void> {
  if (needsRecheck()) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const result = await api.requestEmailVerification(verificationEmail.value);
    notice.value = result.message;
  } catch (cause) {
    error.value = toApiClientError(cause).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="settings-panel" aria-labelledby="settings-heading">
    <h1 id="settings-heading">账号设置</h1>

    <p v-if="error" class="form-error" role="alert" data-testid="settings-error">{{ error }}</p>
    <p v-if="notice" class="form-note" role="status" data-testid="settings-notice">{{ notice }}</p>

    <div class="methods">
      <h2>登录方式</h2>
      <p data-testid="github-status">GitHub：{{ methods.github.linked ? '已绑定' : '未绑定' }}</p>
      <p data-testid="password-status">
        邮箱密码：{{ methods.password.enabled ? methods.password.email : '未设置' }}
      </p>
    </div>

    <div v-if="!reauthed" class="recheck">
      <h2>身份复核</h2>
      <form v-if="methods.password.enabled" @submit.prevent="recheckWithPassword">
        <label for="reauth-password">当前密码</label>
        <input
          id="reauth-password"
          v-model="password"
          data-testid="reauth-password"
          type="password"
          autocomplete="current-password"
          required
        />
        <button class="button" data-testid="reauth-submit" type="submit" :disabled="busy">复核身份</button>
      </form>
      <p v-if="methods.github.linked">
        <button class="link-button" data-testid="reauth-github" type="button" :disabled="busy" @click="recheckWithGithub">
          使用 GitHub 复核身份
        </button>
      </p>
      <p class="lede">GitHub 复核不保证上游重新询问密码；解绑仍需要已验证邮箱和密码作为保底。</p>
    </div>

    <div class="actions">
      <h2>管理</h2>
      <p>
        <button class="button" data-testid="bind-github" type="button" :disabled="busy" @click="bindGithub">
          绑定 GitHub
        </button>
      </p>
      <p v-if="methods.github.linked">
        <button class="button" data-testid="unlink-github" type="button" :disabled="busy" @click="unlinkGithub">
          解绑 GitHub
        </button>
      </p>
      <form data-testid="verification-form" @submit.prevent="sendVerification">
        <label for="verify-email-input">验证邮箱</label>
        <input id="verify-email-input" v-model="verificationEmail" data-testid="verify-email-input" type="email" autocomplete="email" />
        <button class="button" data-testid="send-verification" type="submit" :disabled="busy">
          {{ methods.password.enabled ? '验证原邮箱' : '发送添加密码链接' }}
        </button>
      </form>
      <p class="lede">添加密码需到原浏览器打开邮件链接完成；此页面不接收新密码。</p>
    </div>
  </section>
</template>
