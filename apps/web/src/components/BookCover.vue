<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ src: string | null; title: string }>();
const failed = ref(false);

watch(
  () => props.src,
  () => {
    failed.value = false;
  },
);
</script>

<template>
  <div class="cover">
    <img v-if="src && !failed" class="cover__image" :src="src" :alt="`${title} 的封面`" @error="failed = true" />
    <div v-else class="cover__placeholder" role="img" :aria-label="`${title} 暂无封面`">暂无封面</div>
  </div>
</template>
