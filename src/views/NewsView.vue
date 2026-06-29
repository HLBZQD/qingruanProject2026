<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getArticles } from '@/composables/useHomeApi'
import { generateArticle, isCategorySelection, isArticleDetail } from '@/composables/useArticleApi'
import { useAuthStore } from '@/stores/authStore'
import type { Article } from '@/types/api'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import ErrorRetry from '@/components/ErrorRetry.vue'
import EmptyState from '@/components/EmptyState.vue'
import DisclaimerBar from '@/components/DisclaimerBar.vue'

const router = useRouter()
const authStore = useAuthStore()

const categories = ['全部', '饮食指导', '运动指南', '生活习惯', '知识科普']
const currentCategory = ref('全部')
const articles = ref<Article[]>([])
const loading = ref(false)
const error = ref('')
const currentPage = ref(1)
const hasMore = ref(true)
const generating = ref(false)

const isLoggedIn = computed(() => !!authStore.token)

const categoryForApi = computed(() => {
  return currentCategory.value === '全部' ? undefined : currentCategory.value
})

const STORAGE_KEY = 'news_view_state'

function saveState() {
  const state = {
    page: currentPage.value,
    category: currentCategory.value,
    timestamp: Date.now(),
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function restoreState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const state = JSON.parse(raw)
    if (state && Date.now() - state.timestamp < 5 * 60 * 1000) {
      currentPage.value = state.page || 1
      currentCategory.value = state.category || '全部'
    }
  } catch {
    // ignore corrupted cache
  }
}

async function fetchArticles(reset = false) {
  if (reset) {
    currentPage.value = 1
    articles.value = []
    hasMore.value = true
  }
  if (loading.value) return

  loading.value = true
  error.value = ''

  try {
    const res = await getArticles({
      category: categoryForApi.value,
      page: currentPage.value,
      pageSize: 10,
    })
    if (reset) {
      articles.value = res
    } else {
      articles.value.push(...res)
    }
    hasMore.value = res.length === 10
    saveState()
  } catch (err: unknown) {
    error.value = (err as { message?: string }).message || '获取资讯失败，请检查网络后重试'
  } finally {
    loading.value = false
  }
}

function loadMore() {
  if (!hasMore.value || loading.value) return
  currentPage.value++
  fetchArticles()
}

function switchCategory(cat: string) {
  if (cat === currentCategory.value) return
  currentCategory.value = cat
  fetchArticles(true)
}

function goDetail(id: number) {
  router.push(`/news/article/${id}`)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hasAcceptedDisclaimer(): boolean {
  return localStorage.getItem('disclaimer_accepted') === 'true'
}

async function showDisclaimer(): Promise<boolean> {
  const Swal = (await import('sweetalert2')).default
  const result = await Swal.fire({
    title: '医学免责声明',
    html: '<p style="text-align:left;font-size:14px">本平台的 AI 健康建议、风险预测、方案生成等内容仅供健康参考，<b>不能替代专业医疗诊断、治疗或建议</b>。如有健康问题，请及时就医咨询专业医师。</p>',
    icon: 'info',
    showCancelButton: true,
    confirmButtonText: '我已知晓并同意',
    cancelButtonText: '不同意',
    allowOutsideClick: false,
  })
  return result.isConfirmed
}

async function handleGenerate() {
  if (!isLoggedIn.value) {
    const Swal = (await import('sweetalert2')).default
    Swal.fire({
      toast: true,
      position: 'top',
      icon: 'warning',
      title: '请先登录后生成资讯',
      showConfirmButton: false,
      timer: 2000,
    })
    return
  }

  if (!hasAcceptedDisclaimer()) {
    const agreed = await showDisclaimer()
    if (!agreed) return
    localStorage.setItem('disclaimer_accepted', 'true')
  }

  if (generating.value) return
  generating.value = true

  try {
    const stageRes = await generateArticle()

    if (isCategorySelection(stageRes)) {
      const recommended = stageRes.categories.find((c) => c.recommended)
      const defaultChoice = recommended ? recommended.label : stageRes.categories[0]?.label

      const Swal = (await import('sweetalert2')).default
      const { value: category } = await Swal.fire({
        title: '选择生成主题',
        input: 'select',
        inputOptions: Object.fromEntries(stageRes.categories.map((c) => [c.label, c.label])),
        inputValue: defaultChoice,
        showCancelButton: true,
        confirmButtonText: '生成文章',
        cancelButtonText: '取消',
        inputValidator: (value) => {
          if (!value) return '请选择一个主题'
          return undefined
        },
      })

      if (!category) {
        generating.value = false
        return
      }

      const articleRes = await generateArticle(category)
      if (isArticleDetail(articleRes)) {
        router.push(`/news/article/${articleRes.id}`)
      }
    } else if (isArticleDetail(stageRes)) {
      router.push(`/news/article/${stageRes.id}`)
    }
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } }).response?.status
    const message = (err as { message?: string }).message || '生成失败，请稍后重试'
    const Swal = (await import('sweetalert2')).default
    if (status === 409) {
      Swal.fire({ toast: true, position: 'top', icon: 'warning', title: '请求过于频繁，请稍后再试', showConfirmButton: false, timer: 2500 })
    } else {
      Swal.fire({ toast: true, position: 'top', icon: 'error', title: message, showConfirmButton: false, timer: 2500 })
    }
  } finally {
    generating.value = false
  }
}

watch(currentCategory, saveState)

onMounted(() => {
  restoreState()
  fetchArticles(true)
})
</script>

<template>
  <div class="news-list-container">
    <header class="top-bar">
      <h1>健康资讯</h1>
      <router-link
        v-if="isLoggedIn"
        to="/news/collections"
        class="btn-collections"
        aria-label="我的收藏"
      >
        <i class="fas fa-heart" aria-hidden="true"></i>
        <span>我的收藏</span>
      </router-link>
    </header>

    <!-- 分类标签 -->
    <div class="category-tabs" role="tablist" aria-label="资讯分类">
      <button
        v-for="cat in categories"
        :key="cat"
        role="tab"
        :aria-selected="currentCategory === cat"
        class="category-tab"
        :class="{ active: currentCategory === cat }"
        @click="switchCategory(cat)"
      >
        {{ cat }}
      </button>
    </div>

    <!-- 加载态 -->
    <div v-if="loading && articles.length === 0" class="content-pad">
      <SkeletonLoader type="article" :rows="3" />
    </div>

    <!-- 错误态 -->
    <ErrorRetry
      v-else-if="error && articles.length === 0"
      :message="error"
      @retry="fetchArticles(true)"
    />

    <!-- 空态 -->
    <EmptyState
      v-else-if="articles.length === 0 && !loading"
      icon="fa-newspaper"
      title="暂无资讯"
      description="当前分类下还没有文章，您可以生成一篇专属健康资讯。"
      action-text="生成健康资讯"
      @action="handleGenerate"
    />

    <!-- 文章列表 -->
    <div v-else id="article-list" class="content-pad">
      <article
        v-for="item in articles"
        :key="item.id"
        class="article-card"
        @click="goDetail(item.id)"
      >
        <img
          class="card-cover"
          :src="item.cover || '/static/images/placeholder-article.svg'"
          :alt="item.title"
          @error="($event.target as HTMLImageElement).style.display = 'none'"
        />
        <div class="card-body">
          <div>
            <span class="card-category">{{ item.category }}</span>
            <h3 class="card-title">{{ item.title }}</h3>
            <p v-if="item.summary" class="card-summary">{{ item.summary }}</p>
          </div>
          <div class="card-meta">
            <span>{{ item.author || 'AI健康助手' }} · {{ formatDate(item.created_at) }}</span>
            <span><i class="fas fa-eye" aria-hidden="true"></i> {{ item.views }}</span>
          </div>
        </div>
      </article>

      <!-- 加载更多 -->
      <div class="load-more-wrap">
        <button
          v-if="hasMore"
          class="btn-load-more"
          :disabled="loading"
          @click="loadMore"
        >
          <i v-if="loading" class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          {{ loading ? '加载中...' : '加载更多' }}
        </button>
        <p v-else class="no-more">已经到底啦</p>
      </div>
    </div>

    <!-- 生成按钮 -->
    <button
      class="btn-generate"
      :disabled="generating"
      aria-label="生成健康资讯"
      @click="handleGenerate"
    >
      <i :class="generating ? 'fas fa-spinner fa-spin' : 'fas fa-magic'" aria-hidden="true"></i>
      {{ generating ? '生成中...' : '生成资讯' }}
    </button>

    <DisclaimerBar class="news-disclaimer" />
  </div>
</template>

<style scoped>
.news-list-container {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--color-bg);
  padding-bottom: calc(var(--tab-bar-height) + 16px + env(safe-area-inset-bottom));
  position: relative;
}

.top-bar {
  position: sticky;
  top: 0;
  z-index: 30;
  background: var(--color-card);
  border-bottom: 1px solid var(--color-divider);
  padding: var(--spacing-lg) var(--spacing-xl);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.top-bar h1 {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--color-text-primary);
}

.btn-collections {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: var(--radius-full);
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  transition: transform var(--transition-fast);
}

.btn-collections:active {
  transform: scale(0.96);
}

.btn-collections i {
  font-size: 11px;
  color: #FF4D4F;
}

.category-tabs {
  position: sticky;
  top: 49px;
  z-index: 20;
  background: var(--color-card);
  border-bottom: 1px solid var(--color-divider);
  padding: var(--spacing-sm) var(--spacing-lg);
  display: flex;
  gap: var(--spacing-sm);
  overflow-x: auto;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.category-tabs::-webkit-scrollbar {
  display: none;
}

.category-tab {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: var(--radius-full);
  background: var(--color-bg);
  border: 1px solid var(--color-divider);
  color: var(--color-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.category-tab.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.category-tab:active {
  transform: scale(0.96);
}

.content-pad {
  padding: var(--spacing-md) var(--spacing-lg);
}

.article-card {
  background: var(--color-card);
  border-radius: 16px;
  padding: var(--spacing-md);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  display: flex;
  gap: var(--spacing-md);
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  margin-bottom: var(--spacing-md);
}

.article-card:active {
  transform: scale(0.98);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.card-cover {
  width: 88px;
  height: 88px;
  border-radius: var(--radius-lg);
  object-fit: cover;
  flex-shrink: 0;
  background: var(--color-divider);
}

.card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.card-category {
  font-size: 10px;
  color: var(--color-primary);
  background: var(--color-primary-light);
  padding: 2px var(--spacing-sm);
  border-radius: var(--radius-full);
  align-self: flex-start;
}

.card-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-top: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.35;
}

.card-summary {
  font-size: 11px;
  color: var(--color-text-tertiary);
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--color-text-tertiary);
  margin-top: 6px;
}

.card-meta i {
  margin-right: 2px;
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
  transition: color var(--transition-fast);
}

.btn-load-more:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-load-more:active:not(:disabled) {
  color: var(--color-primary);
}

.no-more {
  color: var(--color-text-disabled);
}

.btn-generate {
  position: fixed;
  right: 16px;
  bottom: calc(var(--tab-bar-height) + 80px + env(safe-area-inset-bottom));
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-accent), #73d13d);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  border: none;
  box-shadow: 0 4px 12px rgba(82, 196, 26, 0.35);
  cursor: pointer;
  transition: transform var(--transition-fast), opacity var(--transition-fast);
}

.btn-generate:active:not(:disabled) {
  transform: scale(0.96);
}

.btn-generate:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.news-disclaimer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(var(--tab-bar-height) + env(safe-area-inset-bottom));
}

@media (min-width: 768px) {
  .btn-generate {
    right: 24px;
    bottom: calc(var(--tab-bar-height) + 90px + env(safe-area-inset-bottom));
  }
}
</style>
