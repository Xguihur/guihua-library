<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { BookListResponse, BookStatus } from '@guihua/contracts';
import BookCard from '../components/BookCard.vue';
import PaginationBar from '../components/PaginationBar.vue';
import StatusFilter from '../components/StatusFilter.vue';
import StateBlock from '../components/StateBlock.vue';
import { useBooksApi } from '../api/injection';
import { toApiClientError, type ApiClientError } from '../api/client';

const api = useBooksApi();

const selected = ref<BookStatus | 'all'>('all');
const page = ref(1);
const data = ref<BookListResponse | null>(null);
const loading = ref(false);
const error = ref<ApiClientError | null>(null);

// Only the newest request may write state, so a slow response cannot override a newer filter.
let latestRequest = 0;

async function load(): Promise<void> {
  const requestId = ++latestRequest;
  loading.value = true;
  error.value = null;
  try {
    const response = await api.listBooks({
      status: selected.value === 'all' ? undefined : selected.value,
      page: page.value,
    });
    if (requestId !== latestRequest) return;
    data.value = response;
  } catch (cause) {
    if (requestId !== latestRequest) return;
    data.value = null;
    error.value = toApiClientError(cause);
  } finally {
    if (requestId === latestRequest) loading.value = false;
  }
}

function setStatus(next: BookStatus | 'all'): void {
  if (selected.value === next) return;
  selected.value = next;
  page.value = 1;
}

function setPage(next: number): void {
  if (next < 1 || next === page.value) return;
  page.value = next;
}

watch([selected, page], () => {
  void load();
}, { immediate: true });

onBeforeUnmount(() => {
  latestRequest += 1;
});

const totalPages = computed(() => {
  if (!data.value) return 1;
  return Math.max(1, Math.ceil(data.value.total / data.value.pageSize));
});
</script>

<template>
  <section class="library" aria-labelledby="library-heading" :aria-busy="loading">
    <header class="library__header">
      <h1 id="library-heading">书库</h1>
      <p class="lede">浏览大家正在读和已经读完的记录，点开可以看书评和评论。</p>
    </header>

    <StatusFilter :value="selected" @update:value="setStatus" />

    <StateBlock
      v-if="error"
      variant="error"
      title="加载失败"
      :message="error.message"
      data-testid="error-state"
    >
      <template #action>
        <button class="button" type="button" data-testid="retry-button" @click="load">重试</button>
      </template>
    </StateBlock>

    <StateBlock
      v-else-if="loading"
      variant="loading"
      title="正在加载书库"
      message="请稍候。"
      data-testid="loading-state"
    />

    <StateBlock
      v-else-if="data && data.items.length === 0"
      variant="empty"
      title="暂无符合条件的记录"
      message="换一个筛选条件试试。"
      data-testid="empty-state"
    />

    <template v-else-if="data">
      <p class="result-meta" data-testid="result-meta">共 {{ data.total }} 条记录</p>
      <ul class="book-grid">
        <li v-for="book in data.items" :key="book.id">
          <BookCard :book="book" />
        </li>
      </ul>
      <PaginationBar :page="page" :total-pages="totalPages" @update:page="setPage" />
    </template>
  </section>
</template>
