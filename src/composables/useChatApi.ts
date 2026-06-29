// src/composables/useChatApi.ts
import { api } from '@/composables/useApi'
import type { Doctor } from '@/types/api'
import type { ConversationHistoryItem } from '@/types/sse'

/**
 * 发起医生对话 SSE 请求
 * POST /api/chat/doctor/:id
 *
 * 设计依据: docs/2_detailed_design_v3.md
 *   - 3.2.11 节: POST /api/chat/doctor/:id 端点定义 (第1751行)
 *   - 3.3 节: SSE 事件格式 (第2355行) — fetch + ReadableStream 消费
 *   - 4.4.2 节: useSSE.ts streamRequest 模式 (第4046行)
 *
 * 注意: 此函数返回 Response 对象 (body 为 ReadableStream)，
 * 由 chatStore 消费流，不在此函数中读取 body。
 *
 * @param doctorId       - 医生主键
 * @param message        - 用户消息文本
 * @param token          - JWT Token (调用方从 authStore 获取后传入)
 * @param conversationId - 可选，已有会话ID (首次对话不传)
 * @param signal         - AbortController.signal，支持外部取消
 * @returns fetch Response (body: ReadableStream<Uint8Array>)
 */
export async function sendChatMessage(params: {
  doctorId: number
  message: string
  token: string
  conversationId?: string
  signal?: AbortSignal
}): Promise<Response> {
  const { doctorId, message, token, conversationId, signal } = params

  const body: Record<string, string> = { message }
  if (conversationId) {
    body.conversation_id = conversationId
  }

  return fetch(`/api/chat/doctor/${doctorId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal,
  })
}

/**
 * 获取医生详情信息
 * GET /api/doctors/:id
 *
 * 用于 DoctorChatView.vue 展示医生信息头部
 * 使用 axios (走 useApi.ts 拦截器，自动注入 Authorization header + success:false 检查)
 *
 * @param id - 医生主键 (number)
 * @returns Doctor
 */
export async function getDoctorInfo(id: number): Promise<Doctor> {
  const res = await api.get<{ success: boolean; data: Doctor; message?: string }>(
    `/doctors/${id}`
  )
  return res.data.data
}

/**
 * 发起 AI 助手对话 SSE 请求
 * POST /api/assistant/chat
 */
export async function sendAssistantChatMessage(params: {
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

  return fetch('/api/assistant/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal,
  })
}

/**
 * 发起管理员自然语言对话 SSE 请求
 * POST /api/admin/chat
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

/**
 * 查询指定医生的 Dify 历史会话列表。
 *
 * GET /api/chat/doctor/:id/conversations
 * 鉴权：fetch + Authorization: Bearer ${token}（与 sendChatMessage 一致）
 *
 * 后端路由：server/routes/chat.js:40-53
 * 返回结构：{ success: true, message: '查询成功', data: ConversationHistoryItem[] }
 *
 * @param doctorId - 医生主键（number，来自 route.params.id）
 * @param token    - JWT Token（调用方从 authStore.token 获取）
 * @returns ConversationHistoryItem[] — 历史会话列表（无历史时为空数组 []）
 * @throws  Error — 网络错误 或 HTTP !ok（含 401）
 */
export async function getDoctorConversationHistory(
  doctorId: number,
  token: string
): Promise<ConversationHistoryItem[]> {
  const res = await fetch(`/api/chat/doctor/${doctorId}/conversations`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    throw new Error(`获取医生历史会话失败: HTTP ${res.status}`)
  }

  const json = await res.json()
  // 响应结构: { success: true, data: [...] }
  return (json.data as ConversationHistoryItem[]) || []
}

/**
 * 查询 AI 助手的 Dify 历史会话列表。
 *
 * GET /api/assistant/conversations
 * 鉴权：fetch + Authorization: Bearer ${token}
 *
 * 后端路由：server/routes/assistant.js:64-74
 * 返回结构：{ success: true, message: '查询成功', data: ConversationHistoryItem[] }
 *
 * @param token - JWT Token（调用方从 authStore.token 获取）
 * @returns ConversationHistoryItem[] — 历史会话列表（无历史时为空数组 []）
 * @throws  Error — 网络错误 或 HTTP !ok（含 401）
 */
export async function getAssistantConversations(
  token: string
): Promise<ConversationHistoryItem[]> {
  const res = await fetch('/api/assistant/conversations', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    throw new Error(`获取助手历史会话失败: HTTP ${res.status}`)
  }

  const json = await res.json()
  return (json.data as ConversationHistoryItem[]) || []
}
