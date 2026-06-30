<script setup lang="ts">
import DiabetesIcon from '@/components/icons/DiabetesIcon.vue'

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
    <span class="fab-shape" aria-hidden="true"></span>
    <span class="fab-glow" aria-hidden="true"></span>
    <DiabetesIcon name="doctor-bag" :size="26" color="#fff" />
    <span class="fab-pulse" aria-hidden="true"></span>
  </button>
</template>

<style scoped>
.fab-button {
  position: fixed;
  right: 16px;
  bottom: calc(var(--tab-bar-height) + 16px + env(safe-area-inset-bottom));
  width: 58px;
  height: 58px;
  border-radius: 30%;
  background: var(--color-primary);
  color: #fff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 60;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast), border-radius var(--transition-fast);
  box-shadow: var(--shadow-primary);
  transform: rotate(2deg);
}

.fab-button::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 30%;
  border: 1.5px solid var(--color-accent);
  opacity: 0;
  transform: scale(1);
  transition: opacity var(--transition-fast), transform var(--transition-slow);
}

.fab-button:active {
  transform: rotate(0deg) scale(0.94);
}

.fab-button.open {
  transform: rotate(45deg);
  border-radius: 24%;
  box-shadow: 0 3px 10px rgba(79, 70, 229, 0.3);
}

.fab-button.open::before {
  opacity: 1;
  transform: scale(1.12);
}

.fab-shape {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 42px;
  height: 42px;
  background: var(--color-vivid);
  opacity: 0.2;
  border-radius: 0 0 30% 0;
  pointer-events: none;
}

.fab-glow {
  position: absolute;
  inset: 0;
  border-radius: 30%;
  background: radial-gradient(circle at center, rgba(6, 214, 160, 0.3), transparent 70%);
  opacity: 0.6;
  pointer-events: none;
}

.fab-pulse {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  animation: dataPulse 2s ease-in-out infinite;
  pointer-events: none;
}

@media (min-width: 768px) {
  .fab-button {
    right: 24px;
    bottom: calc(var(--tab-bar-height) + 24px + env(safe-area-inset-bottom));
    width: 64px;
    height: 64px;
  }
  .fab-button .diabetes-icon {
    width: 26px;
    height: 26px;
    font-size: 26px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fab-pulse,
  .fab-button::before {
    animation: none;
    transition: none;
  }
}
</style>
