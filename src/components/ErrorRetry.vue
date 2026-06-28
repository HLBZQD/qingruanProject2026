<script setup lang="ts">
const props = withDefaults(defineProps<{
  message?: string
  icon?: string
  retryText?: string
}>(), {
  message: '加载失败，请检查网络后重试',
  icon: 'fa-exclamation-circle',
  retryText: '点击重试',
})

const emit = defineEmits<{
  (e: 'retry'): void
}>()

function onRetry() {
  emit('retry')
}
</script>

<template>
  <div class="error-retry" role="alert" aria-live="polite">
    <i :class="['fas', icon, 'error-icon']" aria-hidden="true"></i>
    <p class="error-message">{{ message }}</p>
    <button class="retry-btn" @click="onRetry">
      <i class="fas fa-redo-alt" aria-hidden="true"></i>
      {{ retryText }}
    </button>
  </div>
</template>

<style scoped>
.error-retry {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-3xl) var(--spacing-xl);
  text-align: center;
  color: var(--color-text-secondary);
}

.error-icon {
  font-size: 48px;
  color: var(--color-text-disabled);
  margin-bottom: var(--spacing-md);
}

.error-message {
  font-size: var(--font-size-body);
  margin-bottom: var(--spacing-lg);
  line-height: 1.5;
}

.retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 24px;
  border-radius: var(--radius-button);
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-size-body);
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: transform var(--transition-fast), opacity var(--transition-fast);
}

.retry-btn:active {
  transform: scale(0.96);
  opacity: 0.9;
}

.retry-btn i {
  font-size: 12px;
}
</style>
