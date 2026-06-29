<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getCollections, uncollectArticle, syncCollectedState } from '@/composables/useArticleApi'
import { getErrorMessage } from '@/utils/errorMessage'
import type { CollectedArticle } from '@/types/api'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import ErrorRetry from '@/components/ErrorRetry.vue'
import EmptyState from '@/components/EmptyState.vue'

const router = useRouter()

const collections = ref<CollectedArticle[]>([])
const loading = ref(false)
const error = ref('')
const currentPage = ref(1)
const hasMore = ref(true)
const uncollectingId = ref<number | null>(null)

const pageSize = 10

async function fetchCollections(reset = false) {
  if (reset) {
    currentPage.value = 1
    collections.value = []
    hasMore.value = true
  }
  if (loading.value) return

  loading.value = true
  error.value = ''

  try {
    const { list, pagination } = await getCollections({
      page: currentPage.value,
      pageSize,
    })
    if (reset) {
      collections.value = list
    } else {
      collections.value.push(...list)
    }
    hasMore.value = currentPage.value < pagination.totalPages
  } catch (err: unknown) {
    error.value = getErrorMessage(err, '获取收藏列表失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

function loadMore() {
  if (!hasMore.value || loading.value) return
  currentPage.value++
  fetchCollections()
}

function goDetail(id: number) {
  router.push(`/news/article/${id}`)
}

function goBack() {
  router.push('/news')
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function handleUncollect(item: CollectedArticle) {
  if (uncollectingId.value !== null) return
  uncollectingId.value = item.id
  try {
    await uncollectArticle(item.id)
    // 从列表中移除
    collections.value = collections.value.filter((a) => a.id !== item.id)
    const Swal = (await import('sweetalert2')).default
    Swal.fire({
      toast: true,
      position: 'top',
      icon: 'success',
      title: '已取消收藏',
      showConfirmButton: false,
      timer: 1800,
    })
  } catch (err: unknown) {
    // 乐观更新已在 composable 内回滚，同步 collectedMap 保持一致
    syncCollectedState(item.id, true)
    const Swal = (await import('sweetalert2')).default
    Swal.fire({
      toast: true,
      position: 'top',
      icon: 'error',
      title: getErrorMessage(err, '取消收藏失败'),
      showConfirmButton: false,
      timer: 2500,
    })
  } finally {
    uncollectingId.value = null
  }
}

function goNews() {
  router.push('/news')
}

onMounted(() => {
  fetchCollections(true)
})
</script>

<template>
  <div class="collections-container">
    <header class="top-bar">
      <button class="btn-back" aria-label="返回" @click="goBack">
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
      </button>
      <h1>我的收藏</h1>
    </header>

    <!-- 加载态 -->
    <div v-if="loading && collections.length === 0" class="content-pad">
      <SkeletonLoader type="article" :rows="3" />
    </div>

    <!-- 错误态 -->
    <ErrorRetry
      v-else-if="error && collections.length === 0"
      :message="error"
      @retry="fetchCollections(true)"
    />

    <!-- 空态 -->
    <EmptyState
      v-else-if="collections.length === 0 && !loading"
      icon="fa-heart"
      title="暂无收藏"
      description="您还没有收藏任何文章，去资讯列表发现感兴趣的内容吧。"
      action-text="浏览资讯"
      @action="goNews"
    />

    <!-- 收藏列表 -->
    <div v-else class="content-pad">
      <article
        v-for="item in collections"
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
            <button
              class="btn-uncollect"
              :disabled="uncollectingId === item.id"
              @click.stop="handleUncollect(item)"
              aria-label="取消收藏"
            >
              <i
                v-if="uncollectingId === item.id"
                class="fas fa-spinner fa-spin"
                aria-hidden="true"
              ></i>
              <i v-else class="fas fa-heart card-collected-icon" aria-hidden="true"></i>
            </button>
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
  </div>
</template>

<style scoped>
.collections-container {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--color-bg);
  padding-bottom: calc(var(--tab-bar-height) + 16px + env(safe-area-inset-bottom));
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
  gap: var(--spacing-md);
}

.btn-back {
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
  cursor: pointer;
}

.btn-back:active {
  transform: scale(0.96);
}

.top-bar h1 {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--color-text-primary);
  flex: 1;
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

.btn-uncollect {
  background: none;
  border: none;
  padding: 4px 8px;
  cursor: pointer;
  color: #FF4D4F;
  font-size: 16px;
  border-radius: var(--radius-full);
  transition: transform var(--transition-fast);
}

.btn-uncollect:active:not(:disabled) {
  transform: scale(0.9);
}

.btn-uncollect:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.card-collected-icon {
  color: #FF4D4F;
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
</style>
