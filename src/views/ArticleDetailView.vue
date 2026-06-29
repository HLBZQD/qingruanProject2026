<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getArticle } from '@/composables/useHomeApi'
import { renderMarkdown } from '@/composables/useMarkdown'
import type { ArticleDetail } from '@/types/api'

const route = useRoute()
const router = useRouter()

// ===== 状态 =====
const article = ref<ArticleDetail | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const notFound = ref(false)

// ===== Markdown 净化链（统一使用 useMarkdown.renderMarkdown） =====
const safeContent = computed(() => renderMarkdown(article.value?.content))

// ===== 日期格式化（"2026-06-23T07:30:00" → "2026年6月23日"） =====
function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  } catch {
    return iso
  }
}

// ===== 获取文章详情 =====
async function fetchArticle(): Promise<void> {
  const id = Number(route.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    notFound.value = true
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  notFound.value = false
  try {
    const data = await getArticle(id)
    if (!data) {
      notFound.value = true
    } else {
      article.value = data
    }
  } catch (e: unknown) {
    // 区分 404 与一般错误
    const status = (e as { response?: { status?: number } }).response?.status
    if (status === 404) {
      notFound.value = true
    } else {
      error.value = (e as { message?: string }).message || '文章加载失败，请稍后重试'
    }
  } finally {
    loading.value = false
  }
}

// ===== 导航 =====
function goBack(): void {
  router.push('/news')
}

// ===== 收藏（本期占位） =====
function toggleCollect(): void {
  // TODO: 调用收藏 API
  console.warn('[ArticleDetailView] 收藏功能待实现 (S5a 占位)')
}
</script>

<template>
  <div class="article-page page-enter">
    <!-- Header 粘性顶栏 -->
    <header class="article-header">
      <button class="article-back press" @click="goBack" aria-label="返回资讯列表">
        <i class="fa-solid fa-chevron-left"></i>
      </button>
      <h1 class="article-header-title">文章详情</h1>
      <!-- 收藏按钮（正常态可见） -->
      <button
        v-if="article"
        class="article-collect-btn press"
        @click="toggleCollect"
        :aria-label="article.is_collected ? '取消收藏' : '收藏文章'"
      >
        <i
          :class="[
            'fa-solid',
            article.is_collected ? 'fa-bookmark article-collected' : 'fa-bookmark article-not-collected'
          ]"
        ></i>
      </button>
      <div v-else class="article-header-spacer"></div>
    </header>

    <!-- 加载态 -->
    <div v-if="loading" class="article-skeleton">
      <div class="skeleton-line skeleton-title"></div>
      <div class="skeleton-line skeleton-meta"></div>
      <div class="skeleton-line skeleton-long"></div>
      <div class="skeleton-line skeleton-mid"></div>
      <div class="skeleton-line skeleton-short"></div>
    </div>

    <!-- 404态 -->
    <div v-else-if="notFound" class="article-error-card">
      <i class="fa-solid fa-file-circle-question article-error-icon"></i>
      <h2 class="article-error-title">文章不存在</h2>
      <p class="article-error-desc">文章可能已被删除，或链接地址不正确</p>
      <button class="article-retry-btn press" @click="goBack">返回资讯列表</button>
    </div>

    <!-- 错误态 -->
    <div v-else-if="error" class="article-error-card">
      <i class="fa-solid fa-triangle-exclamation article-error-icon"></i>
      <h2 class="article-error-title">加载失败</h2>
      <p class="article-error-desc">{{ error }}</p>
      <button class="article-retry-btn press" @click="fetchArticle">重试</button>
    </div>

    <!-- 正常态 -->
    <template v-else-if="article">
      <!-- 文章元信息 -->
      <section class="article-meta-section">
        <h1 class="article-title">{{ article.title }}</h1>
        <div class="article-meta-row">
          <span class="article-meta-item">
            <i class="fa-solid fa-user-pen"></i> {{ article.author }}
          </span>
          <span class="article-meta-sep">|</span>
          <span class="article-meta-item">
            <i class="fa-solid fa-layer-group"></i> {{ article.category }}
          </span>
          <span class="article-meta-sep">|</span>
          <span class="article-meta-item">
            <i class="fa-solid fa-calendar"></i> {{ formatDate(article.created_at) }}
          </span>
          <span class="article-meta-sep">|</span>
          <span class="article-meta-item">
            <i class="fa-solid fa-eye"></i> {{ article.views }} 阅读
          </span>
        </div>
        <!-- 标签 -->
        <div v-if="article.tags.length > 0" class="article-tags-row">
          <span v-for="tag in article.tags" :key="tag" class="article-tag">{{ tag }}</span>
        </div>
      </section>

      <!-- 正文渲染区（Markdown → HTML） -->
      <section class="article-body-section">
        <div
          v-if="safeContent"
          class="article-body markdown-body"
          v-html="safeContent"
        ></div>
        <p v-else class="article-empty-body">暂无正文内容</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* ===== 页面容器 ===== */
.article-page {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--color-bg);
  padding-bottom: calc(var(--tab-bar-height) + 8px);
}

/* ===== Header 粘性顶栏 ===== */
.article-header {
  position: sticky;
  top: 0;
  z-index: 30;
  background: var(--color-card);
  border-bottom: 1px solid var(--color-divider);
  padding: var(--spacing-lg) var(--spacing-xl);
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}
.article-header-title {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--color-text-primary);
  flex: 1;
}
.article-back {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  font-size: var(--font-size-body);
  border-radius: var(--radius-full);
}
.article-collect-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  font-size: 18px;
  border-radius: var(--radius-full);
}
.article-collected {
  color: #FAAD14;
}
.article-not-collected {
  color: var(--color-divider);
}
.article-header-spacer {
  width: 32px;
}

/* ===== 文章元信息区 ===== */
.article-meta-section {
  padding: var(--spacing-xl) var(--spacing-lg) var(--spacing-md);
  background: var(--color-card);
  border-bottom: 1px solid var(--color-divider);
}
.article-title {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.4;
  margin-bottom: var(--spacing-md);
}
.article-meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}
.article-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.article-meta-sep {
  color: var(--color-divider);
}
.article-tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
}
.article-tag {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--color-primary-light);
  color: var(--color-primary);
}

/* ===== 正文渲染区 ===== */
.article-body-section {
  padding: var(--spacing-xl) var(--spacing-lg);
}
.article-body {
  font-size: 15px;
  line-height: 1.8;
  color: var(--color-text-primary);
}
/* Markdown 内容排版 */
.article-body :deep(h1),
.article-body :deep(h2),
.article-body :deep(h3) {
  margin: 1.2em 0 0.6em;
  font-weight: 700;
  color: var(--color-text-primary);
}
.article-body :deep(p) {
  margin: 0.8em 0;
}
.article-body :deep(ul),
.article-body :deep(ol) {
  padding-left: 1.5em;
  margin: 0.6em 0;
}
.article-body :deep(li) {
  margin: 0.3em 0;
}
.article-body :deep(blockquote) {
  border-left: 3px solid var(--color-primary);
  padding-left: var(--spacing-md);
  color: var(--color-text-secondary);
  margin: 0.8em 0;
}
.article-body :deep(code) {
  background: var(--color-bg);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 13px;
}
.article-body :deep(pre) {
  background: var(--color-bg);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  overflow-x: auto;
  margin: 0.8em 0;
}
.article-body :deep(img) {
  max-width: 100%;
  border-radius: var(--radius-md);
  margin: 0.6em 0;
}
.article-body :deep(a) {
  color: var(--color-primary);
}
.article-empty-body {
  text-align: center;
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
  padding: var(--spacing-2xl) 0;
}

/* ===== 骨架屏 ===== */
.article-skeleton {
  padding: var(--spacing-xl) var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.skeleton-title {
  height: 24px;
  width: 70%;
}
.skeleton-meta {
  height: 14px;
  width: 50%;
}
.skeleton-line {
  height: 14px;
  border-radius: var(--radius-sm);
  background: var(--color-divider);
  animation: article-pulse 1.5s ease-in-out infinite;
}
.skeleton-long { width: 100%; }
.skeleton-mid { width: 75%; }
.skeleton-short { width: 50%; }
@keyframes article-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}

/* ===== 错误/404 态 ===== */
.article-error-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-3xl) var(--spacing-xl);
  text-align: center;
}
.article-error-icon {
  font-size: 48px;
  color: var(--color-divider);
  margin-bottom: var(--spacing-lg);
}
.article-error-title {
  font-size: var(--font-size-h3);
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-sm);
}
.article-error-desc {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-xl);
  line-height: 1.5;
}
.article-retry-btn {
  padding: 10px 24px;
  border-radius: var(--radius-button);
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-size-body);
  font-weight: 700;
  border: none;
}

/* ===== 按压动画 ===== */
.press:active {
  transform: scale(0.96);
  transition: var(--transition-fast);
}
</style>
