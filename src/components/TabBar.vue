<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/icons/AppIcon.vue'
import DiabetesIcon from '@/components/icons/DiabetesIcon.vue'

const route = useRoute()

export interface TabItem {
  path: string
  label: string
  icon: string
  iconType?: 'app' | 'diabetes'
}

const props = defineProps<{
  tabs: TabItem[]
}>()

const emit = defineEmits<{
  (e: 'tab-click', path: string): void
}>()

function isActive(tabPath: string): boolean {
  return route.path === tabPath || route.path.startsWith(tabPath + '/')
}

function onClick(path: string) {
  emit('tab-click', path)
}
</script>

<template>
  <nav
    class="tab-bar"
    role="tablist"
    aria-label="底部导航"
  >
    <div class="tab-island">
      <router-link
        v-for="tab in props.tabs"
        :key="tab.path"
        :to="tab.path"
        role="tab"
        :aria-selected="isActive(tab.path)"
        class="tab-item"
        :class="{ active: isActive(tab.path) }"
        @click="onClick(tab.path)"
      >
        <div class="tab-icon-wrap">
          <AppIcon
            v-if="!tab.iconType || tab.iconType === 'app'"
            :name="tab.icon"
            :size="20"
            class="tab-icon"
          />
          <DiabetesIcon
            v-else
            :name="tab.icon"
            :size="20"
            class="tab-icon"
          />
        </div>
        <span class="tab-label">{{ tab.label }}</span>
        <span v-if="isActive(tab.path)" class="tab-active-pill" aria-hidden="true"></span>
      </router-link>
    </div>
  </nav>
</template>

<style scoped>
.tab-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--tab-bar-height);
  z-index: 50;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 8px var(--spacing-lg) calc(8px + env(safe-area-inset-bottom));
  pointer-events: none;
}

.tab-island {
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 4px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(232, 228, 223, 0.8);
  border-radius: var(--radius-4xl);
  padding: 6px 8px;
  box-shadow: 0 8px 24px rgba(26, 26, 46, 0.12), 0 2px 6px rgba(26, 26, 46, 0.04);
  pointer-events: auto;
  max-width: 420px;
  width: 100%;
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: var(--color-text-tertiary);
  text-decoration: none;
  transition: color var(--transition-fast), transform var(--transition-fast);
  min-width: 48px;
  padding: 6px 4px;
  border-radius: var(--radius-2xl);
  position: relative;
  font-weight: 600;
}

.tab-item:active {
  transform: scale(0.94);
}

.tab-item.active {
  color: var(--color-primary);
}

.tab-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  z-index: 1;
}

.tab-icon {
  transition: transform var(--transition-fast);
}

.tab-item.active .tab-icon {
  transform: translateY(-1px);
}

.tab-active-pill {
  position: absolute;
  inset: 0;
  background: var(--color-primary-light);
  border-radius: var(--radius-2xl);
  z-index: 0;
}

.tab-label {
  font-size: 10px;
  line-height: 1;
  z-index: 1;
}

@media (prefers-reduced-motion: reduce) {
  .tab-icon {
    transition: none;
  }
}
</style>
