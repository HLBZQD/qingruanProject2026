<script setup lang="ts">
const props = withDefaults(defineProps<{
  icon?: string
  title?: string
  description?: string
  actionText?: string
}>(), {
  icon: 'fa-inbox',
  title: '暂无数据',
  description: '',
  actionText: '',
})

const emit = defineEmits<{
  (e: 'action'): void
}>()

function onAction() {
  emit('action')
}
</script>

<template>
  <div class="empty-state" role="status">
    <div class="empty-icon-wrap">
      <i :class="['fas', icon, 'empty-icon']" aria-hidden="true"></i>
    </div>
    <h3 class="empty-title">{{ title }}</h3>
    <p v-if="description" class="empty-desc">{{ description }}</p>
    <button
      v-if="actionText"
      class="empty-action"
      @click="onAction"
    >
      {{ actionText }}
    </button>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-3xl) var(--spacing-xl);
  text-align: center;
}

.empty-icon-wrap {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-full);
  background: var(--color-primary-light);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--spacing-md);
}

.empty-icon {
  font-size: 32px;
  color: var(--color-primary);
}

.empty-title {
  font-size: var(--font-size-h4);
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.empty-desc {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin-bottom: var(--spacing-lg);
  max-width: 280px;
}

.empty-action {
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

.empty-action:active {
  transform: scale(0.96);
  opacity: 0.9;
}
</style>
