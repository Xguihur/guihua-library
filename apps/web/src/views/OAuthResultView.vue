<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { oauthResultMessage } from '../labels';
import { useSessionStore } from '../auth/session';

const route = useRoute();
const router = useRouter();
const store = useSessionStore();

// Only fixed server-controlled statuses are rendered; code/state never appear.
const message = computed(() => oauthResultMessage(route.query.status));

onMounted(() => {
  const status = route.query.status;
  if (status === 'login-success') {
    void store.restore().then(() => router.replace('/books'));
  } else if (status === 'link-success') {
    void store.restore().then(() => router.replace('/settings'));
  }
});
</script>

<template>
  <section class="oauth-result" aria-labelledby="oauth-result-heading">
    <h1 id="oauth-result-heading">GitHub 登录</h1>
    <p data-testid="oauth-result" role="status">{{ message }}</p>
    <RouterLink v-if="route.query.status === 'reauth-success'" to="/settings?rechecked=1" data-testid="oauth-confirm">
      返回账号设置并确认操作
    </RouterLink>
    <RouterLink v-else to="/login" data-testid="oauth-continue">返回登录</RouterLink>
  </section>
</template>
