<script setup lang="ts">
defineProps<{ page: number; totalPages: number; label?: string }>();
const emit = defineEmits<{ (event: 'update:page', page: number): void }>();
</script>

<template>
  <nav class="pagination" :aria-label="label ?? '分页'">
    <button
      class="pagination__button"
      type="button"
      data-testid="prev-page"
      :disabled="page <= 1"
      @click="emit('update:page', page - 1)"
    >
      上一页
    </button>
    <span class="pagination__status" data-testid="page-indicator">第 {{ page }} / {{ totalPages }} 页</span>
    <button
      class="pagination__button"
      type="button"
      data-testid="next-page"
      :disabled="page >= totalPages"
      @click="emit('update:page', page + 1)"
    >
      下一页
    </button>
  </nav>
</template>
