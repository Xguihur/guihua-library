<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { toApiClientError } from './api/client';
import { useSessionStore } from './auth/session';

const store = useSessionStore();
const router = useRouter();
const route = useRoute();
const logoutError = ref('');

// Refresh restores identity from the server session, never from localStorage.
onMounted(() => {
  void store.restore();
});

const state = computed(() => store.state.value);
const user = computed(() => (state.value.status === 'authenticated' ? state.value.session.user : null));
const username = computed(() => (user.value ? user.value.username : ''));

// --- User menu (disclosure, not an ARIA menu) -------------------------------
// The avatar is a toggle button; hover opens for mouse users and click toggles
// for touch/keyboard users. One `menuOpen` state drives both aria-expanded and
// visibility so they can never drift apart.
const menuOpen = ref(false);
const menuRoot = ref<HTMLElement | null>(null);
const avatarButton = ref<HTMLButtonElement | null>(null);

// An <img> that 404s is replaced by the green initial fallback; changing the
// URL (profile edit) gives the new image a fresh chance to load.
const avatarFailed = ref(false);
watch(
  () => user.value?.avatarUrl,
  () => {
    avatarFailed.value = false;
  },
);

const avatarInitial = computed(() => (username.value.trim()[0] ?? '?').toUpperCase());

function focusFirstMenuItem(): void {
  void nextTick(() => {
    const focusable = menuRoot.value?.querySelector<HTMLElement>('.user-menu__panel a, .user-menu__panel button');
    focusable?.focus();
  });
}

// event.detail === 0 marks a keyboard-activated click; keyboard users get focus
// moved into the open menu so Tab order starts at its first item.
function toggleMenu(event: MouseEvent): void {
  menuOpen.value = !menuOpen.value;
  if (menuOpen.value && event.detail === 0) focusFirstMenuItem();
}

function openMenu(): void {
  menuOpen.value = true;
}

function closeMenu(refocusAvatar = false): void {
  menuOpen.value = false;
  if (refocusAvatar) avatarButton.value?.focus();
}

// Escape anywhere inside the avatar+menu wrapper closes and returns focus.
function onEscapeKeydown(): void {
  if (menuOpen.value) closeMenu(true);
}

function onDocumentPointerDown(event: PointerEvent): void {
  const root = menuRoot.value;
  if (menuOpen.value && root && event.target instanceof Node && !root.contains(event.target)) {
    menuOpen.value = false;
  }
}

// Tabbing beyond the wrapper — or into browser chrome, where relatedTarget is
// null — collapses the menu. Escape's own refocus lands on the avatar inside
// the wrapper and after closeMenu the flag is already false, so it never
// reopens or fights the mouseleave hover path.
function onMenuFocusOut(event: FocusEvent): void {
  if (!menuOpen.value) return;
  const next = event.relatedTarget;
  if (!(next instanceof Node) || !menuRoot.value?.contains(next)) menuOpen.value = false;
}
onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown));

// Route changes (menu link click, back/forward) always collapse the menu.
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false;
  },
);

async function logout(): Promise<void> {
  // Collapse immediately: if the route is already /books the router push below
  // never changes fullPath, so the route watcher alone would leave the menu open.
  closeMenu();
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
      <template v-if="state.status === 'authenticated' && user">
        <div
          ref="menuRoot"
          class="user-menu"
          data-testid="nav-user-menu"
          @mouseenter="openMenu"
          @mouseleave="menuOpen = false"
          @keydown.escape.stop="onEscapeKeydown"
          @focusout="onMenuFocusOut"
        >
          <button
            ref="avatarButton"
            class="avatar-button"
            type="button"
            data-testid="nav-avatar"
            :aria-expanded="menuOpen"
            aria-controls="user-menu-panel"
            :aria-label="`账号菜单：${username}`"
            @click="toggleMenu"
          >
            <img
              v-if="user.avatarUrl && !avatarFailed"
              class="avatar"
              :src="user.avatarUrl"
              alt=""
              referrerpolicy="no-referrer"
              @error="avatarFailed = true"
            />
            <span v-else class="avatar avatar--fallback" aria-hidden="true">{{ avatarInitial }}</span>
          </button>
          <div v-if="menuOpen" id="user-menu-panel" class="user-menu__panel">
            <p class="user-menu__name" data-testid="nav-user">{{ username }}</p>
            <RouterLink to="/books" data-testid="nav-books" @click="menuOpen = false">书库</RouterLink>
            <RouterLink to="/me" data-testid="nav-profile" @click="menuOpen = false">资料</RouterLink>
            <RouterLink to="/settings" data-testid="nav-settings" @click="menuOpen = false">账号设置</RouterLink>
            <hr class="user-menu__divider" />
            <button class="user-menu__logout" type="button" data-testid="nav-logout" @click="logout">退出</button>
          </div>
        </div>
      </template>
      <template v-else-if="state.status === 'error'">
        <span class="nav-error" data-testid="nav-session-error">{{ state.message }}</span>
        <button class="link-button" type="button" data-testid="nav-session-retry" @click="store.restore()">重试</button>
      </template>
      <template v-else-if="state.status === 'anonymous'">
        <RouterLink to="/books" data-testid="nav-books">书库</RouterLink>
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
