// src/composables/useChatApi.ts
import { api } from '@/composables/useApi'
import type { Doctor } from '@/types/api'

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
