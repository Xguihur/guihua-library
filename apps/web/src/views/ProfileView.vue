<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { GENDERS, type Gender, type UserPublicDto } from '@guihua/contracts';
import { useAuthApi } from '../api/injection';
import { toApiClientError } from '../api/client';
import { useSessionStore } from '../auth/session';

const api = useAuthApi();
const store = useSessionStore();

const username = ref('');
const gender = ref<Gender>('unspecified');
const avatarUrl = ref('');
const signature = ref('');
const error = ref('');
const saved = ref(false);
const submitting = ref(false);
const avatarFailed = ref(false);
const usernameInput = ref<HTMLInputElement | null>(null);

let generation = 0;
let baseline: UserPublicDto | null = null;

const currentUser = computed(() => {
  const state = store.state.value;
  return state.status === 'authenticated' ? state.session.user : null;
});

function sameUser(a: UserPublicDto | null, b: UserPublicDto | null): boolean {
  return !!a && !!b && a.id === b.id && a.username === b.username && a.gender === b.gender &&
    a.avatarUrl === b.avatarUrl && a.signature === b.signature && a.createdAt === b.createdAt;
}

function fill(user: UserPublicDto): void {
  username.value = user.username;
  gender.value = user.gender;
  avatarUrl.value = user.avatarUrl ?? '';
  signature.value = user.signature;
  avatarFailed.value = false;
  baseline = user;
}

watch(currentUser, (user) => {
  if (!user) {
    baseline = null;
    return;
  }
  if (!sameUser(baseline, user)) fill(user);
}, { immediate: true });

async function save(): Promise<void> {
  if (submitting.value) return;
  // Bind this write to the identity that was current when it was initiated,
  // not merely to "authenticated at response time". A logout + re-login (even
  // as the same account) during scrypt/network time must not be overwritten.
  const identity = store.identity();
  const mine = ++generation;
  submitting.value = true;
  error.value = '';
  saved.value = false;

  const patch: Record<string, unknown> = {};
  if (username.value !== baseline?.username) patch.username = username.value;
  if (gender.value !== baseline?.gender) patch.gender = gender.value;
  if ((avatarUrl.value || null) !== (baseline?.avatarUrl ?? null)) patch.avatarUrl = avatarUrl.value || null;
  if (signature.value !== baseline?.signature) patch.signature = signature.value;

  if (Object.keys(patch).length === 0) {
    saved.value = true;
    submitting.value = false;
    return;
  }

  try {
    const updated = await api.updateProfile(patch);
    // A logout/re-login or a newer save must not let a slow response write
    // stale data back, even if both identities are the same account.
    if (mine !== generation || !store.isCurrent(identity)) return;
    store.updateUser(updated, identity);
    baseline = updated;
    saved.value = true;
  } catch (cause) {
    if (mine !== generation) return;
    const failure = toApiClientError(cause);
    if (failure.status === 401) {
      // A 401 belongs to the identity that STARTED the request. If a newer
      // login replaced it, this error must not clear that new session.
      if (!store.isCurrent(identity)) return;
      store.anonymous(identity);
    } else {
      error.value = failure.message;
      usernameInput.value?.focus();
    }
  } finally {
    if (mine === generation) submitting.value = false;
  }
}

onBeforeUnmount(() => {
  generation += 1;
});
</script>

<template>
  <section class="profile-panel" aria-labelledby="profile-heading">
    <h1 id="profile-heading">个人资料</h1>

    <div v-if="store.state.value.status === 'authenticated' && currentUser" class="profile-content">
      <div class="profile-avatar">
        <img
          v-if="currentUser.avatarUrl && !avatarFailed"
          data-testid="profile-avatar"
          :src="currentUser.avatarUrl"
          referrerpolicy="no-referrer"
          alt="头像"
          @error="avatarFailed = true"
        />
        <div v-else data-testid="avatar-placeholder" class="avatar-placeholder" aria-label="默认头像">
          {{ currentUser.username.slice(0, 1).toUpperCase() }}
        </div>
      </div>

      <p v-if="error" class="form-error" role="alert" data-testid="auth-error">{{ error }}</p>
      <p v-if="saved" class="form-note" role="status" data-testid="profile-saved">资料已保存。</p>

      <form class="profile-form" @submit.prevent="save">
        <label for="profile-username">用户名</label>
        <input
          id="profile-username"
          ref="usernameInput"
          v-model="username"
          data-testid="profile-username"
          type="text"
          autocomplete="username"
          required
        />

        <label for="profile-gender">性别</label>
        <select id="profile-gender" v-model="gender" data-testid="profile-gender">
          <option v-for="option in GENDERS" :key="option" :value="option">{{ option }}</option>
        </select>

        <label for="profile-avatar-url">头像 URL（仅 HTTPS）</label>
        <input
          id="profile-avatar-url"
          v-model="avatarUrl"
          data-testid="profile-avatar-url"
          type="url"
          autocomplete="off"
        />

        <label for="profile-signature">签名</label>
        <textarea id="profile-signature" v-model="signature" data-testid="profile-signature" rows="3" />
        <p class="signature-preview" data-testid="signature-preview">{{ signature }}</p>

        <button class="button" data-testid="profile-save" type="submit" :disabled="submitting">
          {{ submitting ? '保存中…' : '保存资料' }}
        </button>
      </form>
    </div>

    <div v-else-if="store.state.value.status === 'error'" class="form-error" data-testid="profile-error">
      <p>{{ store.state.value.message }}</p>
      <button class="button" type="button" data-testid="nav-session-retry" @click="store.restore()">重试</button>
    </div>

    <p v-else class="lede" data-testid="profile-login-prompt">
      请先登录再查看资料。<RouterLink to="/login" data-testid="profile-login-link">登录</RouterLink>
    </p>
  </section>
</template>
