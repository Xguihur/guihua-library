<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { BookDetailDto, CommentListResponse } from '@guihua/contracts';
import PaginationBar from '../components/PaginationBar.vue';
import StateBlock from '../components/StateBlock.vue';
import { useBooksApi } from '../api/injection';
import { toApiClientError, type ApiClientError } from '../api/client';
import { formatDate, statusLabel } from '../labels';

const api = useBooksApi();
const route = useRoute();

const bookId = computed(() => String(route.params.bookId ?? ''));
const book = ref<BookDetailDto | null>(null);
const comments = ref<CommentListResponse | null>(null);
const loading = ref(true);
const error = ref<ApiClientError | null>(null);
const notFound = ref(false);
const commentsLoading = ref(false);
const commentsError = ref<ApiClientError | null>(null);
const page = ref(1);

let bookToken = 0;
let commentsToken = 0;

async function loadComments(): Promise<void> {
  const token = ++commentsToken;
  commentsLoading.value = true;
  commentsError.value = null;
  try {
    const response = await api.listComments(bookId.value, { page: page.value });
    if (token !== commentsToken) return;
    comments.value = response;
  } catch (cause) {
    if (token !== commentsToken) return;
    comments.value = null;
    commentsError.value = toApiClientError(cause);
  } finally {
    if (token === commentsToken) commentsLoading.value = false;
  }
}

async function loadBook(): Promise<void> {
  const token = ++bookToken;
  loading.value = true;
  error.value = null;
  notFound.value = false;
  book.value = null;
  comments.value = null;
  try {
    const response = await api.getBook(bookId.value);
    if (token !== bookToken) return;
    book.value = response;
    await loadComments();
  } catch (cause) {
    if (token !== bookToken) return;
    const apiError = toApiClientError(cause);
    if (apiError.status === 404) notFound.value = true;
    else error.value = apiError;
  } finally {
    if (token === bookToken) loading.value = false;
  }
}

function setCommentsPage(next: number): void {
  const total = comments.value ? Math.max(1, Math.ceil(comments.value.total / comments.value.pageSize)) : 1;
  if (next < 1 || next > total || next === page.value) return;
  page.value = next;
  void loadComments();
}

watch(
  bookId,
  () => {
    page.value = 1;
    void loadBook();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  bookToken += 1;
  commentsToken += 1;
});

const commentsTotalPages = computed(() => {
  if (!comments.value) return 1;
  return Math.max(1, Math.ceil(comments.value.total / comments.value.pageSize));
});
</script>

<template>
  <article class="detail">
    <RouterLink class="back-link" to="/books" data-testid="back-link">← 返回书库</RouterLink>

    <StateBlock
      v-if="notFound"
      variant="not-found"
      title="找不到这本书"
      message="它可能已被隐藏或删除。"
      data-testid="not-found-state"
    />

    <StateBlock v-else-if="error" variant="error" title="加载失败" :message="error.message" data-testid="error-state">
      <template #action>
        <button class="button" type="button" data-testid="retry-button" @click="loadBook">重试</button>
      </template>
    </StateBlock>

    <StateBlock v-else-if="loading" variant="loading" title="正在加载书籍" data-testid="loading-state" />

    <template v-else-if="book">
      <header class="detail__header">
        <p class="detail__eyebrow">
          <span class="badge" :class="`badge--${book.status}`">{{ statusLabel(book.status) }}</span>
          <span class="detail__owner">记录者 {{ book.owner.username }}</span>
        </p>
        <h1 class="detail__title" data-testid="detail-title">{{ book.title }}</h1>
        <p class="detail__meta">{{ book.author }} · 更新于 {{ formatDate(book.updatedAt) }}</p>
        <p class="detail__summary">{{ book.summary }}</p>
      </header>

      <section class="detail__section" aria-labelledby="review-heading">
        <h2 id="review-heading">书评</h2>
        <p class="detail__review" data-testid="detail-review">{{ book.review }}</p>
      </section>

      <section class="detail__section" aria-labelledby="comments-heading">
        <h2 id="comments-heading">评论</h2>

        <StateBlock
          v-if="commentsError"
          variant="error"
          title="评论加载失败"
          :message="commentsError.message"
          data-testid="comments-error"
        >
          <template #action>
            <button class="button" type="button" data-testid="comments-retry" @click="loadComments">重试</button>
          </template>
        </StateBlock>

        <p v-else-if="commentsLoading" class="muted" data-testid="comments-loading">正在加载评论…</p>

        <p v-else-if="comments && comments.items.length === 0" class="muted" data-testid="comments-empty">
          还没有评论。
        </p>

        <template v-else-if="comments">
          <ul class="comment-list">
            <li v-for="comment in comments.items" :key="comment.id" class="comment" data-testid="comment-item">
              <p class="comment__body">{{ comment.content }}</p>
              <p class="comment__meta">{{ comment.author.username }} · {{ formatDate(comment.createdAt) }}</p>
            </li>
          </ul>
          <PaginationBar
            :page="page"
            :total-pages="commentsTotalPages"
            label="评论分页"
            @update:page="setCommentsPage"
          />
        </template>
      </section>
    </template>
  </article>
</template>
