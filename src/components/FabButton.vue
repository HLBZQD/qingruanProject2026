<script setup lang="ts">
const props = defineProps<{
  open?: boolean
}>()

const emit = defineEmits<{
  (e: 'click'): void
}>()

function onClick() {
  emit('click')
}
</script>

<template>
  <button
    class="fab-button"
    :class="{ open: props.open }"
    aria-label="AI 智能助手"
    @click="onClick"
  >
    <i class="fas fa-robot" aria-hidden="true"></i>
  </button>
</template>

<style scoped>
.fab-button {
  position: fixed;
  right: 16px;
  bottom: calc(var(--tab-bar-height) + 16px + env(safe-area-inset-bottom));
  width: 52px;
  height: 52px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  color: #fff;
  border: none;
  box-shadow: 0 4px 14px rgba(74, 144, 217, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  cursor: pointer;
  z-index: 60;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

.fab-button:active {
  transform: scale(0.94);
  box-shadow: 0 2px 8px rgba(74, 144, 217, 0.35);
}

.fab-button.open {
  transform: rotate(135deg);
  box-shadow: 0 2px 8px rgba(74, 144, 217, 0.35);
}

@media (min-width: 768px) {
  .fab-button {
    right: 24px;
    bottom: calc(var(--tab-bar-height) + 24px + env(safe-area-inset-bottom));
    width: 58px;
    height: 58px;
    font-size: 24px;
  }
}
</style>
