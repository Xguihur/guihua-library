<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthApi } from '../api/injection';
import { toApiClientError } from '../api/client';

const api = useAuthApi();
const route = useRoute();

const token = ref('');
const password = ref('');
const error = ref('');
const done = ref(false);
const busy = ref(false);

// A GitHub-only user adds a password; an existing password user only confirms
// the original email. The server chose this fixed page when it sent the mail.
const verifyOnly = computed(() => route.query.mode === 'verify');

onMounted(() => {
  // The token arrives only in the URL fragment. Read it once, then scrub it so
  // it is never persisted in history, logs or a referrer. No third-party asset
  // is loaded on this page.
  const fragment = window.location.hash.replace(/^#/, '');
  if (fragment) {
    token.value = decodeURIComponent(fragment);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
});

async function submit(): Promise<void> {
  if (!token.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api.completePasswordCredential(
      verifyOnly.value ? { token: token.value } : { token: token.value, password: password.value },
    );
    password.value = '';
    token.value = '';
    done.value = true;
  } catch (cause) {
    const failure = toApiClientError(cause);
    error.value = failure.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="verify-panel" aria-labelledby="verify-heading">
    <h1 id="verify-heading">{{ verifyOnly ? '确认原邮箱' : '添加密码登录' }}</h1>

    <p v-if="!token && !done" class="form-error" data-testid="verify-error" role="alert">
      链接无效或已被使用，请返回原浏览器重新获取验证邮件。
    </p>
    <p v-if="error" class="form-error" role="alert" data-testid="verify-error">{{ error }}</p>
    <p v-if="done" class="form-note" role="status" data-testid="verify-done">邮箱已确认，可以使用密码登录。</p>

    <form v-if="token && !done" @submit.prevent="submit">
      <label v-if="!verifyOnly" for="verify-password">新密码</label>
      <input
        v-if="!verifyOnly"
        id="verify-password"
        v-model="password"
        data-testid="verify-password"
        type="password"
        autocomplete="new-password"
        required
      />
      <button class="button" data-testid="verify-submit" type="submit" :disabled="busy">
        {{ verifyOnly ? '确认邮箱' : '设置密码' }}
      </button>
    </form>
  </section>
</template>
