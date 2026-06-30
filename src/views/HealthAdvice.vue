<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getHealthAdvice } from '@/composables/useAdviceApi'
import { useChatStore } from '@/stores/chatStore'
import { renderMarkdown } from '@/composables/useMarkdown'
import type { HealthAdvice as HealthAdviceItem } from '@/types/api'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import ErrorRetry from '@/components/ErrorRetry.vue'
import EmptyState from '@/components/EmptyState.vue'
import DisclaimerBar from '@/components/DisclaimerBar.vue'
import AppIcon from '@/components/icons/AppIcon.vue'

const router = useRouter()
const chatStore = useChatStore()

const adviceList = ref<HealthAdviceItem[]>([])
const loading = ref(false)
const error = ref('')
const currentPage = ref(1)
const hasMore = ref(true)
const expandedId = ref<number | null>(null)

const pageSize = 10

async function fetchAdvice(reset = false) {
  if (reset) {
    currentPage.value = 1
    adviceList.value = []
    hasMore.value = true
  }
  if (loading.value) return

  loading.value = true
  error.value = ''

  try {
    const { list, pagination } = await getHealthAdvice(currentPage.value, pageSize)
    if (reset) {
      adviceList.value = list
    } else {
      adviceList.value.push(...list)
    }
    hasMore.value = currentPage.value < pagination.totalPages
  } catch (err: unknown) {
    error.value = (err as { message?: string }).message || '获取健康建议失败，请检查网络后重试'
  } finally {
    loading.value = false
  }
}

function loadMore() {
  if (!hasMore.value || loading.value) return
  currentPage.value++
  fetchAdvice()
}

function toggleExpand(id: number) {
  expandedId.value = expandedId.value === id ? null : id
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function renderContent(content: string): string {
  return renderMarkdown(content)
}

function goBack() {
  router.push('/profile')
}

function openAiAssistant() {
  if (!chatStore.fabOpen) {
    chatStore.toggleFab()
  }
}

onMounted(() => {
  fetchAdvice(true)
})
</script>

<template>
  <div class="health-advice-container">
    <header class="top-bar">
      <button class="btn-back" aria-label="返回" @click="goBack">
        <AppIcon name="arrow-left" :size="18" />
      </button>
      <h1>健康建议</h1>
      <div class="placeholder"></div>
    </header>

    <!-- 加载态 -->
    <div v-if="loading && adviceList.length === 0" class="content-pad">
      <SkeletonLoader type="card" :rows="3" />
    </div>

    <!-- 错误态 -->
    <ErrorRetry
      v-else-if="error && adviceList.length === 0"
      :message="error"
      @retry="fetchAdvice(true)"
    />

    <!-- 空态 -->
    <EmptyState
      v-else-if="adviceList.length === 0 && !loading"
      icon="lightbulb"
      title="还没有健康建议"
      description="去 AI 助手对话中获取您的个性化健康建议吧。"
      action-text="打开 AI 助手"
      @action="openAiAssistant"
    />

    <!-- 建议列表 -->
    <div v-else id="advice-list" class="content-pad">
      <div
        v-for="item in adviceList"
        :key="item.id"
        class="advice-item"
        :class="{ expanded: expandedId === item.id }"
      >
        <div class="advice-header" @click="toggleExpand(item.id)">
          <div class="advice-title-row">
            <h3 class="advice-title">{{ item.title }}</h3>
          <AppIcon
            name="chevron-down"
            :size="12"
            class="expand-icon"
            :class="{ rotated: expandedId === item.id }"
          />
          </div>
          <div class="advice-tags">
            <span v-for="(tag, idx) in item.tags" :key="idx" class="tag">{{ tag }}</span>
            <span class="advice-time">{{ formatDate(item.created_at) }}</span>
          </div>
        </div>

        <Transition name="expand">
          <div v-show="expandedId === item.id" class="advice-content">
            <div class="markdown-body" v-html="renderContent(item.content)"></div>
            <DisclaimerBar text="以上建议由 AI 生成，仅供参考，不能替代专业医疗意见。" />
          </div>
        </Transition>
      </div>

      <!-- 加载更多 -->
      <div class="load-more-wrap">
        <button
          v-if="hasMore"
          class="btn-load-more"
          :disabled="loading"
          @click="loadMore"
        >
          <AppIcon v-if="loading" name="spinner" :size="14" class="is-spinning" />
          {{ loading ? '加载中...' : '加载更多' }}
        </button>
        <p v-else class="no-more">已经到底啦</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.health-advice-container {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--color-bg);
  padding-bottom: calc(var(--tab-bar-height) + 8px + env(safe-area-inset-bottom));
}

.top-bar {
  position: sticky;
  top: 0;
  z-index: 30;
  background: var(--color-card);
  border-bottom: 1px solid var(--color-divider);
  padding: var(--spacing-md) var(--spacing-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.btn-back {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
  border-radius: var(--radius-full);
  cursor: pointer;
}

.btn-back:active {
  background: var(--color-bg);
}

.top-bar h1 {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--color-text-primary);
}

.placeholder {
  width: 32px;
}

.content-pad {
  padding: var(--spacing-md) var(--spacing-lg);
}

.advice-item {
  background: var(--color-card);
  border-radius: 16px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  margin-bottom: var(--spacing-md);
  transition: transform var(--transition-fast);
}

.advice-item:active {
  transform: scale(0.99);
}

.advice-header {
  padding: var(--spacing-lg);
  cursor: pointer;
}

.advice-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.advice-title {
  flex: 1;
  font-size: var(--font-size-h4);
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.4;
}

.expand-icon {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-top: 4px;
  transition: transform var(--transition-normal);
}

.expand-icon.rotated {
  transform: rotate(180deg);
}

.advice-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
}

.tag {
  font-size: 10px;
  color: var(--color-primary);
  background: var(--color-primary-light);
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

.advice-time {
  font-size: 11px;
  color: var(--color-text-tertiary);
  margin-left: auto;
}

.advice-content {
  padding: 0 var(--spacing-lg) var(--spacing-lg);
}

.advice-content :deep(.markdown-body) {
  font-size: var(--font-size-body);
  line-height: 1.6;
  color: var(--color-text-primary);
}

.advice-content :deep(.markdown-body p) {
  margin-bottom: var(--spacing-sm);
}

.advice-content :deep(.markdown-body ul) {
  padding-left: var(--spacing-xl);
  margin-bottom: var(--spacing-sm);
}

.advice-content :deep(.markdown-body li) {
  margin-bottom: 4px;
}

.load-more-wrap {
  padding: var(--spacing-md) 0 var(--spacing-lg);
  text-align: center;
}

.btn-load-more,
.no-more {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.btn-load-more {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: var(--spacing-sm) var(--spacing-lg);
}

.btn-load-more:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.no-more {
  color: var(--color-text-disabled);
}

.is-spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 展开动画 */
.expand-enter-active,
.expand-leave-active {
  transition: all var(--transition-normal) ease;
  max-height: 800px;
  opacity: 1;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
