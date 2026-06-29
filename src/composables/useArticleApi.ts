import { ref } from 'vue'
import { api } from '@/composables/useApi'
import type {
  ArticleGenerateResponse,
  ArticleGenerateCategorySelection,
  ArticleDetail,
  CollectedArticle,
  PaginationParams,
  PaginationInfo,
} from '@/types/api'

// ===== 模块级单例：收藏状态映射表 =====
// 关键实现约束：必须定义在 export function 体外，确保所有组件实例共享同一 reactive 状态，
// 实现跨页面（ArticleDetailView ↔ NewsView ↔ CollectionsView）收藏状态同步。
// 沿用 useArticleApi.ts 现有模块顶层导出的先例模式。
const collectedMap = ref<Record<number, boolean>>({})

/**
 * 文章生成两阶段接口
 * POST /api/articles/generate
 *
 * 阶段1: 不传 category，返回推荐分类列表
 * 阶段2: 传入 category，返回生成的完整文章
 */
export async function generateArticle(category?: string): Promise<ArticleGenerateResponse> {
  const res = await api.post<{ success: boolean; data: ArticleGenerateResponse; message?: string }>(
    '/articles/generate',
    category ? { category } : {},
  )
  return res.data.data
}

/**
 * 类型守卫：判断生成响应是否为分类选择阶段
 */
export function isCategorySelection(res: ArticleGenerateResponse): res is ArticleGenerateCategorySelection {
  return 'stage' in res && res.stage === 'category_selection'
}

/**
 * 类型守卫：判断生成响应是否为文章详情
 */
export function isArticleDetail(res: ArticleGenerateResponse): res is ArticleDetail {
  return 'id' in res && typeof res.id === 'number'
}

/**
 * 收藏文章（乐观更新）
 * POST /api/articles/:id/collect
 * 先设置 collectedMap[id]=true 即刻反映 UI，API 失败则回滚到原值。
 */
export async function collectArticle(id: number): Promise<void> {
  const previous = collectedMap.value[id]
  collectedMap.value = { ...collectedMap.value, [id]: true }
  try {
    await api.post(`/articles/${id}/collect`)
  } catch (err) {
    collectedMap.value = { ...collectedMap.value, [id]: previous }
    throw err
  }
}

/**
 * 取消收藏（乐观更新）
 * DELETE /api/articles/:id/collect
 * 先设置 collectedMap[id]=false 即刻反映 UI，API 失败则回滚到原值。
 */
export async function uncollectArticle(id: number): Promise<void> {
  const previous = collectedMap.value[id]
  collectedMap.value = { ...collectedMap.value, [id]: false }
  try {
    await api.delete(`/articles/${id}/collect`)
  } catch (err) {
    collectedMap.value = { ...collectedMap.value, [id]: previous }
    throw err
  }
}

/**
 * 获取收藏列表（分页）
 * GET /api/articles/collections
 * 响应结构：{ success, data: CollectedArticle[], pagination }
 * 拉取后同步 collectedMap，将所有返回的文章标记为已收藏。
 */
export async function getCollections(
  params: PaginationParams,
): Promise<{ list: CollectedArticle[]; pagination: PaginationInfo }> {
  const res = await api.get<{
    success: boolean
    data: CollectedArticle[]
    pagination: PaginationInfo
    message?: string
  }>('/articles/collections', { params })
  const nextMap = { ...collectedMap.value }
  res.data.data.forEach((a) => {
    nextMap[a.id] = true
  })
  collectedMap.value = nextMap
  return { list: res.data.data, pagination: res.data.pagination }
}

/**
 * 从 ArticleDetail 同步收藏状态到 collectedMap。
 * 在 ArticleDetailView 获取文章详情后调用，确保 collectedMap 与服务端状态一致。
 */
export function syncCollectedState(id: number, isCollected: boolean): void {
  collectedMap.value = { ...collectedMap.value, [id]: isCollected }
}

/**
 * 读取 collectedMap 的只读引用，供组件响应式追踪收藏状态。
 */
export function useCollectedMap() {
  return collectedMap
}

/**
 * 检查指定文章是否已收藏（非响应式读取，用于一次性判断）。
 */
export function isCollected(id: number): boolean {
  return !!collectedMap.value[id]
}
