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

/**
 * 发起管理员自然语言对话 SSE 请求
 * POST /api/admin/chat
 *
 * 返回 Response 对象，由 chatStore 消费 ReadableStream。
 */
export async function sendAdminChatMessage(params: {
  message: string
  token: string
  conversationId?: string
  signal?: AbortSignal
}): Promise<Response> {
  const { message, token, conversationId, signal } = params
  const body: Record<string, string> = { message }
  if (conversationId) {
    body.conversation_id = conversationId
  }

  return fetch('/api/admin/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal,
  })
}
