<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { toApiClientError } from './api/client';
import { useSessionStore } from './auth/session';

const store = useSessionStore();
const router = useRouter();
const logoutError = ref('');

// Refresh restores identity from the server session, never from localStorage.
onMounted(() => {
  void store.restore();
});

const state = computed(() => store.state.value);
const username = computed(() => (state.value.status === 'authenticated' ? state.value.session.user.username : ''));

async function logout(): Promise<void> {
  logoutError.value = '';
  try {
    await store.logout();
    await router.push('/books');
  } catch (cause) {
    logoutError.value = toApiClientError(cause).message;
  }
}
</script>

<template>
  <a class="skip-link" href="#main">跳到主要内容</a>
  <header class="site-header">
    <RouterLink class="site-title" to="/books">桂花图书馆</RouterLink>
    <nav class="site-nav" aria-label="主导航">
      <RouterLink to="/books">书库</RouterLink>
      <template v-if="state.status === 'authenticated'">
        <span class="nav-user" data-testid="nav-user">{{ username }}</span>
        <RouterLink to="/me" data-testid="nav-profile">资料</RouterLink>
        <RouterLink to="/settings" data-testid="nav-settings">账号设置</RouterLink>
        <button class="link-button" type="button" data-testid="nav-logout" @click="logout">退出</button>
      </template>
      <template v-else-if="state.status === 'error'">
        <span class="nav-error" data-testid="nav-session-error">{{ state.message }}</span>
        <button class="link-button" type="button" data-testid="nav-session-retry" @click="store.restore()">重试</button>
      </template>
      <template v-else-if="state.status === 'anonymous'">
        <RouterLink to="/login" data-testid="nav-login">登录</RouterLink>
        <RouterLink to="/register" data-testid="nav-register">注册</RouterLink>
      </template>
    </nav>
    <p v-if="logoutError" class="form-error" role="alert" data-testid="logout-error">{{ logoutError }}</p>
  </header>
  <main id="main" class="site-main">
    <RouterView />
  </main>
  <footer class="site-footer">
    <p>公开阅读记录 · 写书与评论功能将在后续版本开放</p>
  </footer>
</template>
