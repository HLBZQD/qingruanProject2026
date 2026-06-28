import { api } from '@/composables/useApi'
import type { HealthAdvice, PaginationInfo } from '@/types/api'

interface PagedBody<T> {
  success: boolean
  data: T[]
  pagination: PaginationInfo
  message?: string
}

/**
 * 获取健康建议列表（分页）
 * GET /api/assistant/advice
 */
export async function getHealthAdvice(page = 1, pageSize = 20): Promise<{ list: HealthAdvice[]; pagination: PaginationInfo }> {
  const res = await api.get<PagedBody<HealthAdvice>>('/assistant/advice', {
    params: { page, pageSize },
  })
  return { list: res.data.data, pagination: res.data.pagination }
}
