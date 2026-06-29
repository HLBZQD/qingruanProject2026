import { api } from '@/composables/useApi'
import type { AdminLog, PaginationInfo } from '@/types/api'

interface PagedBody<T> {
  success: boolean
  data: T[]
  pagination: PaginationInfo
  message?: string
}

/**
 * 获取管理员操作日志（分页）
 * GET /api/admin/logs
 */
export async function getAdminLogs(page = 1, pageSize = 20): Promise<{ list: AdminLog[]; pagination: PaginationInfo }> {
  const res = await api.get<PagedBody<AdminLog>>('/admin/logs', {
    params: { page, pageSize },
  })
  return { list: res.data.data, pagination: res.data.pagination }
}

// sendAdminChatMessage 已统一由 chatStore.sendAdminMessage 管理（D3 任务）。
// 管理对话 SSE 请求请使用 useChatApi.sendAdminChatMessage（已由 chatStore.ts:7 导入）。
