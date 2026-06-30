<script setup lang="ts">
import AppIcon from '@/components/icons/AppIcon.vue'
const props = withDefaults(defineProps<{
  message?: string
  icon?: string
  retryText?: string
}>(), {
  message: '加载失败，请检查网络后重试',
  icon: 'exclamation',
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
    <div class="error-icon-wrap">
      <AppIcon :name="icon" :size="28" color="var(--color-danger)" class="error-icon" />
    </div>
    <p class="error-message">{{ message }}</p>
    <button class="retry-btn" @click="onRetry">
      <AppIcon name="redo" :size="12" />
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

.error-icon-wrap {
  width: 72px;
  height: 72px;
  border-radius: 28%;
  background: var(--color-danger-light);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--spacing-md);
  transform: rotate(3deg);
}

.error-icon {
  font-size: 28px;
  color: var(--color-danger);
}

.error-message {
  font-size: var(--font-size-body);
  margin-bottom: var(--spacing-lg);
  line-height: 1.5;
  max-width: 280px;
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
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast), transform var(--transition-fast);
  box-shadow: var(--shadow-primary);
}

.retry-btn:active {
  background: var(--color-primary-dark);
  transform: scale(0.97);
  box-shadow: var(--shadow-md);
}

.retry-btn i {
  font-size: 12px;
}
</style>
