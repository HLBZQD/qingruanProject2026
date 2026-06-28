<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

export interface TabItem {
  path: string
  label: string
  icon: string
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
      <i :class="['fas', tab.icon, 'tab-icon']" aria-hidden="true"></i>
      <span class="tab-label">{{ tab.label }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
.tab-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--tab-bar-height);
  background: var(--color-card);
  border-top: 1px solid var(--color-divider);
  z-index: 50;
  display: flex;
  align-items: stretch;
  justify-content: space-around;
  padding-bottom: env(safe-area-inset-bottom);
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
}

.tab-item:active {
  transform: scale(0.96);
}

.tab-item.active {
  color: var(--color-primary);
}

.tab-icon {
  font-size: 20px;
  line-height: 1;
}

.tab-label {
  font-size: 10px;
  line-height: 1;
}
</style>
