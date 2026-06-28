import { api } from '@/composables/useApi'
import type { ArticleGenerateResponse, ArticleGenerateCategorySelection, ArticleDetail } from '@/types/api'

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
