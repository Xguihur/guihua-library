<script setup lang="ts">
import type { BookListItemDto } from '@guihua/contracts';
import BookCover from './BookCover.vue';
import { statusLabel } from '../labels';

defineProps<{ book: BookListItemDto }>();
</script>

<template>
  <article class="card" data-testid="book-card">
    <RouterLink class="card__link" :to="`/books/${book.id}`">
      <BookCover :src="book.coverUrl" :title="book.title" />
      <div class="card__body">
        <span class="badge" :class="`badge--${book.status}`">{{ statusLabel(book.status) }}</span>
        <h2 class="card__title">{{ book.title }}</h2>
        <p class="card__meta">{{ book.author }} · 记录者 {{ book.owner.username }}</p>
        <p class="card__summary">{{ book.summary }}</p>
      </div>
    </RouterLink>
  </article>
</template>
