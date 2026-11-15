<script setup lang="ts">
import type { BookStatus } from '@guihua/contracts';

defineProps<{ value: BookStatus | 'all' }>();
const emit = defineEmits<{ (event: 'update:value', value: BookStatus | 'all'): void }>();

const options = [
  { value: 'all', label: '全部' },
  { value: 'reading', label: '正在读' },
  { value: 'finished', label: '已读完' },
] as const;

function select(value: BookStatus | 'all'): void {
  emit('update:value', value);
}
</script>

<template>
  <div class="filters" role="group" aria-label="按阅读状态筛选">
    <button
      v-for="option in options"
      :key="option.value"
      class="filter"
      :class="{ 'filter--active': value === option.value }"
      type="button"
      :aria-pressed="value === option.value"
      :data-testid="`filter-${option.value}`"
      @click="select(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
