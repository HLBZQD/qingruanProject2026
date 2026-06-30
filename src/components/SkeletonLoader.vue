<script setup lang="ts">
const props = withDefaults(defineProps<{
  type?: 'card' | 'list' | 'text' | 'avatar' | 'article' | 'custom'
  rows?: number
  avatar?: boolean
}>(), {
  type: 'list',
  rows: 3,
  avatar: false,
})
</script>

<template>
  <div class="skeleton-loader" role="status" aria-label="加载中">
    <!-- 文本行骨架 -->
    <template v-if="type === 'text'">
      <div
        v-for="n in rows"
        :key="`text-${n}`"
        class="skeleton-line"
        :style="{ width: n === rows ? '60%' : '100%' }"
      ></div>
    </template>

    <!-- 列表项骨架 -->
    <template v-else-if="type === 'list'">
      <div v-for="n in rows" :key="`list-${n}`" class="skeleton-list-item">
        <div v-if="avatar" class="skeleton-avatar"></div>
        <div class="skeleton-lines">
          <div class="skeleton-line" style="width: 40%"></div>
          <div class="skeleton-line" style="width: 70%"></div>
          <div v-if="!avatar" class="skeleton-line" style="width: 55%"></div>
        </div>
      </div>
    </template>

    <!-- 卡片骨架 -->
    <template v-else-if="type === 'card'">
      <div v-for="n in rows" :key="`card-${n}`" class="skeleton-card">
        <div class="skeleton-card-header">
          <div v-if="avatar" class="skeleton-avatar"></div>
          <div class="skeleton-lines">
            <div class="skeleton-line" style="width: 50%"></div>
            <div class="skeleton-line" style="width: 30%"></div>
          </div>
        </div>
        <div class="skeleton-line" style="width: 90%"></div>
        <div class="skeleton-line" style="width: 75%"></div>
      </div>
    </template>

    <!-- 文章卡片骨架（带封面） -->
    <template v-else-if="type === 'article'">
      <div v-for="n in rows" :key="`article-${n}`" class="skeleton-article">
        <div class="skeleton-cover"></div>
        <div class="skeleton-article-body">
          <div class="skeleton-line" style="width: 80%"></div>
          <div class="skeleton-line" style="width: 100%"></div>
          <div class="skeleton-line" style="width: 60%"></div>
        </div>
      </div>
    </template>

    <!-- 自定义插槽 -->
    <template v-else>
      <slot />
    </template>
  </div>
</template>

<style scoped>
.skeleton-loader {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.skeleton-line,
.skeleton-avatar,
.skeleton-cover,
.skeleton-list-item,
.skeleton-card,
.skeleton-article {
  background: var(--color-divider);
  border-radius: var(--radius-md);
}

.skeleton-line,
.skeleton-avatar,
.skeleton-cover {
  animation: skeletonPulse 1.4s ease-in-out infinite;
}

.skeleton-line {
  height: 14px;
}

.skeleton-avatar {
  width: 48px;
  height: 48px;
  border-radius: 28%;
  flex-shrink: 0;
}

.skeleton-cover {
  width: 88px;
  height: 88px;
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.skeleton-list-item,
.skeleton-card,
.skeleton-article {
  background: var(--color-card);
  padding: var(--spacing-lg);
  border: 1.5px solid var(--color-border);
}

.skeleton-list-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  border-radius: 20px 8px 20px 8px;
}

.skeleton-list-item:nth-child(even) {
  border-radius: 8px 20px 8px 20px;
}

.skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-card {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  border-radius: var(--radius-xl);
}

.skeleton-card-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-xs);
}

.skeleton-article {
  display: flex;
  gap: var(--spacing-md);
  border-radius: var(--radius-xl);
}

.skeleton-article-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}

@keyframes skeletonPulse {
  0%, 100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-line,
  .skeleton-avatar,
  .skeleton-cover {
    animation: none;
  }
}
</style>
