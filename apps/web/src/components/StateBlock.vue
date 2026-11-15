<script setup lang="ts">
defineProps<{ variant: 'loading' | 'empty' | 'error' | 'not-found'; title: string; message?: string }>();
</script>

<template>
  <div
    class="state"
    :class="`state--${variant}`"
    :role="variant === 'error' ? 'alert' : 'status'"
    data-testid="state-block"
  >
    <p class="state__title">{{ title }}</p>
    <p v-if="message" class="state__message">{{ message }}</p>
    <slot name="action" />
  </div>
</template>
