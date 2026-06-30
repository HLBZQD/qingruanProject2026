// src/stores/chatStore.ts
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { readSSEStream, dispatchSSEEvent } from '@/composables/useSSE'

import {
  sendChatMessage,
  sendAssistantChatMessage,
  sendAdminChatMessage,
  getDoctorConversationHistory,
  getAssistantConversations,
} from '@/composables/useChatApi'
import type { ChatMessage, SSEEvent, ConversationHistoryItem } from '@/types/sse'
import { router } from '@/router'

export const useChatStore = defineStore('chat', () => {
  // ===== 状态 =====
  /** 当前对话消息列表 (响应式数组，驱动 DoctorChatView 模板渲染) */
  const conversations = ref<ChatMessage[]>([])

  /** 历史会话列表（Dify 返回的会话元数据数组，非消息内容） */
  const conversationHistory = ref<ConversationHistoryItem[]>([])

  /** 历史会话加载中标志 */
  const historyLoading = ref(false)

  /** 历史会话加载错误消息（空字符串表示无错误） */
  const historyError = ref('')

  /** SSE 流是否活跃 (用于 UI: 发送按钮 disabled + "对方正在输入..." 动画) */
  const isStreaming = ref(false)

  /** 活跃的 SSE AbortController (连接数上限为1的控制点) */
  const activeAbortController = ref<AbortController | null>(null)

  /** FAB 悬浮按钮展开/收起 (UI 增强，v3简化版可留空) */
  const fabOpen = ref(false)

  // ===== [G4] conversation_id 管理 =====

  /**
   * 多医生 conversation_id 映射。
   *
   * 设计依据: docs/2_detailed_design_v3.md 3.7 节 (第2473行):
   *   doctorConversations: Map<number, string> — 按医生ID管理会话ID
   *
   * 持久化策略:
   *   - 内存 Map<number, string> 主存储 (快速读写)
   *   - localStorage `qrzl_conv_{doctorId}` 后备持久化 (跨页面刷新)
   */
  const doctorConversations = ref<Map<number, string>>(new Map())

  /** 当前活跃的医生 ID (由 DoctorChatView.vue 在 switchDoctor 中设置) */
  const currentDoctorId = ref<number | null>(null)

  /** 助手对话 ID */
  const assistantConversationId = ref<string | null>(null)

  /** 管理员对话 ID */
  const adminConversationId = ref<string | null>(null)

  /** 当前流式对话模式，用于 message_end 时保存 conversation_id */
  const activeChatMode = ref<'doctor' | 'assistant' | 'admin'>('doctor')

  // ===== SSE 连接控制 =====

  /**
   * 注册并追踪活跃的 AbortController。
   * 若已有活跃连接，先 abort 旧连接再注册新控制器。
   *
   * 设计依据: docs/2_detailed_design_v3.md 3.7 节
   *   - SSE 连接控制与并发限制机制 (第2506-2516行)
   *   - "同时活跃 SSE 连接数上限为 1" 约束 (需求 4.2 节)
   *
   * 调用时机:
   *   - sendMessage() 发起新请求前
   *   - 由 chatStore 内部调用，组件不直接访问
   */
  function registerAbortController(controller: AbortController): void {
    if (activeAbortController.value) {
      activeAbortController.value.abort()  // 中止旧连接
    }
    activeAbortController.value = controller
  }

  /**
   * 中止当前活跃的 SSE 连接。
   *
   * 调用时机:
   *   - 组件卸载时 (onUnmounted)
   *   - 用户点击返回按钮
   *   - 切换医生时 (switchDoctor)
   *   - 登出清理时 (clearAllConversations)
   */
  function abortActiveConnection(): void {
    if (activeAbortController.value) {
      activeAbortController.value.abort()
      activeAbortController.value = null
    }
    isStreaming.value = false
  }

  /**
   * 释放指定控制器引用（仅当该控制器仍是当前活跃控制器时）。
   * 用于外部组件在 SSE 流自然结束后安全释放控制器，避免误删新连接。
   */
  function releaseActiveController(controller: AbortController): void {
    if (activeAbortController.value === controller) {
      activeAbortController.value = null
    }
  }

  // ===== conversation_id 读写 =====

  /**
   * 获取指定医生的 conversation_id。
   *
   * 查找顺序:
   *   1. 内存 Map (当前会话快速访问)
   *   2. localStorage `qrzl_conv_{doctorId}` (跨页面刷新恢复)
   *   3. 返回 null (首次对话)
   */
  function getDoctorConversation(doctorId: number): string | null {
    // 1. 先从内存 Map 查
    if (doctorConversations.value.has(doctorId)) {
      return doctorConversations.value.get(doctorId)!
    }
    // 2. 从 localStorage 恢复 (跨会话持久化)
    try {
      const stored = localStorage.getItem(`qrzl_conv_${doctorId}`)
      if (stored) {
        doctorConversations.value.set(doctorId, stored)
        return stored
      }
    } catch {
      // localStorage 读取异常，静默降级
    }
    return null
  }

  /**
   * 保存指定医生的 conversation_id。
   *
   * 调用时机:
   *   - dispatchSSEEvent('message_end') 中 (G3)
   *   - conversation_id 从 message_end 事件获取
   *
   * 同时写入内存 Map 和 localStorage 双层存储。
   */
  function setDoctorConversation(doctorId: number, id: string): void {
    doctorConversations.value.set(doctorId, id)
    try {
      localStorage.setItem(`qrzl_conv_${doctorId}`, id)
    } catch {
      // localStorage QuotaExceededError 或其他异常，静默丢弃
      // 内存 Map 已保存，不影响当前会话功能
    }
  }

  /**
   * 清除指定医生的 conversation_id。
   *
   * 调用时机:
   *   - DoctorChatView.vue clearChat() — 用户点击清空对话按钮
   *   - 同时清除内存 Map 和 localStorage 持久化键
   */
  function clearDoctorConversation(doctorId: number): void {
    doctorConversations.value.delete(doctorId)
    try {
      localStorage.removeItem(`qrzl_conv_${doctorId}`)
    } catch {
      // 静默忽略
    }
  }

  // ===== [G4] conversation_id 预留接口 =====

  function getAssistantConversation(): string | null {
    return assistantConversationId.value
  }

  function setAssistantConversation(id: string): void {
    assistantConversationId.value = id
  }

  function clearAssistantConversation(): void {
    assistantConversationId.value = null
  }

  function getAdminConversation(): string | null {
    return adminConversationId.value
  }

  function setAdminConversation(id: string): void {
    adminConversationId.value = id
  }

  // ===== [G4] 断线重连 =====

  /**
   * 重连配置 (简化版 v3)
   *
   * v3 简化交付: 固定间隔 3 次重试 (2s/4s/8s)
   * v4 完整交付: 指数退避 1s→30s，最大5次，倍增因子2
   *
   * 设计依据: task_v3.md 第9节可推迟项 (第1248-1264行)
   */
  const RETRY_CONFIG = {
    maxRetries: 3,              // 最大重试次数 (简化版)
    delays: [2000, 4000, 8000], // 固定延迟 (ms)
  }

// ===== [G3] SSE 事件处理 =====

/**
 * 业务侧 SSE 事件处理。
 *
 * 使用 useSSE.dispatchSSEEvent 作为通用分发框架，
 * 将 chatStore 特定的状态更新逻辑注入 handlers。
 */
function handleSSEEvent(event: SSEEvent): void {
  dispatchSSEEvent(event, {
    onMessage: (event) => {
      // AI 逐 token 生成时多次推送
      // 增量追加 answer 到当前最后一条 assistant 消息
      const lastMsg = conversations.value[conversations.value.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        // 已有 assistant 气泡: 追加内容 (字符串拼接)
        lastMsg.content += event.answer
      } else {
        // 首个 message 事件: 创建新 assistant 气泡
        const assistantMsg: ChatMessage = {
          id: event.message_id || `assistant_${Date.now()}`,
          role: 'assistant',
          content: event.answer,
          timestamp: (event.created_at || 0) * 1000, // Unix秒 → 毫秒
        }
        conversations.value.push(assistantMsg)
      }
    },
    onMessageEnd: (event) => {
      // AI 完整回复结束
      // 保存 conversation_id
      if (event.conversation_id) {
        if (activeChatMode.value === 'doctor' && currentDoctorId.value != null) {
          setDoctorConversation(currentDoctorId.value, event.conversation_id)
        } else if (activeChatMode.value === 'assistant') {
          setAssistantConversation(event.conversation_id)
        } else if (activeChatMode.value === 'admin') {
          setAdminConversation(event.conversation_id)
        }
      }
      // 更新最后一条 assistant 消息的元数据
      const lastMsg = conversations.value[conversations.value.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        lastMsg.id = event.message_id || lastMsg.id
        lastMsg.timestamp = (event.created_at || 0) * 1000

        // D2 AI导航：检测 [[NAVIGATE:/path]] 标记
        const navMatch = lastMsg.content.match(/\[\[NAVIGATE:([^\]]+)\]\]/)
        if (navMatch) {
          lastMsg.content = lastMsg.content.replace(/\[\[NAVIGATE:[^\]]+\]\]/g, '').trim()
          navigate({ path: navMatch[1] })
        }
      }
      isStreaming.value = false
    },
    onError: (event) => {
      // 流内逻辑错误 (工具调用失败等)
      const errorMsg: ChatMessage = {
        id: `error_${Date.now()}`,
        role: 'assistant',
        content: `[错误] ${event.message || '未知错误'}`,
        timestamp: Date.now(),
      }
      conversations.value.push(errorMsg)
      isStreaming.value = false
    },
  })
}

// ===== SSE 流读取循环 =====

// readSSEStream / parseSSEBuffer / dispatchSSEEvent 已下沉至 useSSE.ts，
// chatStore 通过 readSSEStream(reader, handleSSEEvent) 复用通用实现。

// ===== 通用 SSE 发送辅助 =====

  /**
   * 统一的 SSE 请求发送与流式消费。
   * 由 sendMessage / sendAssistantMessage / sendAdminMessage 调用。
   */
  async function sendStreamRequest(
    mode: 'doctor' | 'assistant' | 'admin',
    fetchResponse: () => Promise<Response>,
  ): Promise<void> {
    activeChatMode.value = mode
    isStreaming.value = true

    try {
      const response = await fetchResponse()

      if (response.status === 401) {
        const { useAuthStore } = await import('@/stores/authStore')
        useAuthStore().clearAuth()
        const Swal = await import('sweetalert2')
        // await 等待 toast 自动关闭（timer: 2500ms），避免页面跳转中断 toast 显示
        await Swal.default.fire({
          toast: true,
          position: 'top',
          icon: 'info',
          title: '登录已过期，请重新登录',
          showConfirmButton: false,
          timer: 2500,
          timerProgressBar: true,
        })
        isStreaming.value = false
        // 设计 4.3 节要求：401 时保持对话窗口打开，不强制跳转
        return
      }

      if (!response.ok) {
        throw new Error(`SSE 请求失败: HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('浏览器不支持 ReadableStream')
      }

      await readSSEStream(reader, handleSSEEvent)
    } finally {
      isStreaming.value = false
    }
  }

  // ===== 消息发送 =====

  /**
   * 发送用户消息并建立 SSE 流式连接。
   *
   * 设计依据: docs/2_detailed_design_v3.md
   *   - 4.3 节 DoctorChatView.vue 流程图 (第3531-3567行)
   *   - 3.3 节 SSE 事件格式 (第2355行)
   *
   * 数据流:
   *   1. 创建用户消息气泡 → push 到 conversations
   *   2. 读取 conversation_id → getDoctorConversation(doctorId)
   *   3. 注册 AbortController → registerAbortController
   *   4. 调用 sendChatMessage → fetch POST /api/chat/doctor/:id
   *   5. 检查 response.status (401 特殊处理)
   *   6. 获取 reader → readSSEStream(reader)
   *
   * @param doctorId - 医生主键
   * @param text     - 用户消息文本
   * @param token    - JWT Token (从 authStore 获取后传入)
   */
  async function sendMessage(
    doctorId: number,
    text: string,
    token: string
  ): Promise<void> {
    // 1. 构造用户消息气泡
    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      mode: 'doctor',
    }
    conversations.value.push(userMessage)

    // 2. 读取 conversation_id (首次对话不传)
    const conversationId = getDoctorConversation(doctorId) ?? undefined

    // 3. 注册 AbortController (自动 abort 旧连接)
    const controller = new AbortController()
    registerAbortController(controller)

    try {
      await sendStreamRequest('doctor', () =>
        sendChatMessage({
          doctorId,
          message: text,
          token,
          conversationId,
          signal: controller.signal,
        })
      )
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }
      throw err
    } finally {
      // [F1 fix] 仅在当前 controller 仍为活跃 controller 时才重置
      if (activeAbortController.value === controller) {
        activeAbortController.value = null
      }
    }
  }

  /**
   * 带重连的 sendMessage 包装。
   *
   * 网络中断或 fetch 异常时自动重试。
   * 重试时携带已保存的 conversation_id 以恢复对话上下文。
   *
   * 调用方: DoctorChatView.vue handleSend()
   *
   * @param doctorId - 医生主键
   * @param text     - 用户消息文本
   * @param token    - JWT Token
   */
  async function sendMessageWithRetry(
    doctorId: number,
    text: string,
    token: string
  ): Promise<void> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        await sendMessage(doctorId, text, token)
        return  // 成功，退出重试循环
      } catch (err: unknown) {
        // AbortError — 用户主动取消，不重试，直接向上抛
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err
        }

        lastError = err instanceof Error ? err : new Error(String(err))

        if (attempt < RETRY_CONFIG.maxRetries) {
          const delay = RETRY_CONFIG.delays[attempt]
          console.warn(
            `[chatStore] SSE 连接失败，${delay}ms 后重试 ` +
            `(${attempt + 1}/${RETRY_CONFIG.maxRetries})`,
            err
          )

          // 等待延迟
          await new Promise(resolve => setTimeout(resolve, delay))

          // 重试前重置 isStreaming 状态 (sendMessage 会重新设置)
          isStreaming.value = false
        }
      }
    }

    // 所有重试均失败
    const failMsg: ChatMessage = {
      id: `fail_${Date.now()}`,
      role: 'assistant',
      content: `[连接失败] 无法连接到医生服务，请检查网络后重试。${lastError?.message || ''}`,
      timestamp: Date.now(),
      mode: 'doctor',
    }
    conversations.value.push(failMsg)
    isStreaming.value = false
  }

  /**
   * 发送 AI 助手消息并建立 SSE 流式连接。
   */
  async function sendAssistantMessage(text: string, token: string): Promise<void> {
    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      mode: 'assistant',
    }
    conversations.value.push(userMessage)

    const conversationId = getAssistantConversation() ?? undefined
    const controller = new AbortController()
    registerAbortController(controller)

    try {
      await sendStreamRequest('assistant', () =>
        sendAssistantChatMessage({
          message: text,
          token,
          conversationId,
          signal: controller.signal,
        })
      )
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }
      const failMsg: ChatMessage = {
        id: `fail_${Date.now()}`,
        role: 'assistant',
        content: `[连接失败] 无法连接到 AI 助手，请检查网络后重试。${err instanceof Error ? err.message : ''}`,
        timestamp: Date.now(),
        mode: 'assistant',
      }
      conversations.value.push(failMsg)
      isStreaming.value = false
    } finally {
      if (activeAbortController.value === controller) {
        activeAbortController.value = null
      }
    }
  }

  /**
   * 发送管理员自然语言指令并建立 SSE 流式连接。
   */
  async function sendAdminMessage(text: string, token: string): Promise<void> {
    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      mode: 'admin',
    }
    conversations.value.push(userMessage)

    const conversationId = getAdminConversation() ?? undefined
    const controller = new AbortController()
    registerAbortController(controller)

    try {
      await sendStreamRequest('admin', () =>
        sendAdminChatMessage({
          message: text,
          token,
          conversationId,
          signal: controller.signal,
        })
      )
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }
      const failMsg: ChatMessage = {
        id: `fail_${Date.now()}`,
        role: 'assistant',
        content: `[连接失败] 无法连接到管理服务，请检查网络后重试。${err instanceof Error ? err.message : ''}`,
        timestamp: Date.now(),
        mode: 'admin',
      }
      conversations.value.push(failMsg)
      isStreaming.value = false
    } finally {
      if (activeAbortController.value === controller) {
        activeAbortController.value = null
      }
    }
  }

  // ===== [G4] 多医生路由 =====

  /**
   * 切换到指定医生。
   *
   * 设计依据: docs/2_detailed_design_v3.md 4.3 节
   *   DoctorChatView.vue 流程图 (第3560-3563行):
   *   路由参数变化 → watch route.params.id →
   *   abortActiveConnection → 重新初始化
   *
   * 调用时机: DoctorChatView.vue loadDoctor() 和 watch(route.params.id)
   *
   * v3 简化版: 仅 abort + 清空消息 + 设置 currentDoctorId。
   * v4 完整版: 加载目标医生的 conversation_id 和历史消息。
   *
   * @param doctorId - 目标医生主键
   */
  function switchDoctor(doctorId: number): void {
    // 1. 中止旧医生的 SSE 连接
    abortActiveConnection()

    // 2. 设置当前医生
    currentDoctorId.value = doctorId

    // 3. 清空消息列表 (准备新对话)
    conversations.value = []

    // 4. conversation_id 在下次 sendMessage 时自动通过
    //    getDoctorConversation(doctorId) 读取 (无需在此显式加载)
  }

  // ===== [G4] 登出清理 =====

  /**
   * 登出时统一清理所有对话会话。
   *
   * 设计依据: docs/2_detailed_design_v3.md 3.7 节 (第2495-2498行)
   *
   * 清理内容:
   *   1. 中止活跃 SSE 连接
   *   2. 清空 doctorConversations Map
   *   3. 清除 localStorage 中所有 qrzl_conv_* 键
   *   4. 清空消息列表
   *   5. 清空 assistantConversationId
   *   6. 清空 adminConversationId
   *
   * 调用时机:
   *   - authStore.clearAuth() 中 (S8 后续轮次)
   *   - 用户手动登出
   */
  function clearAllConversations(): void {
    // 1. 中止活跃连接
    abortActiveConnection()

    // 2. 清除所有 doctor conversation_id
    const ids = [...doctorConversations.value.keys()]
    for (const id of ids) {
      try {
        localStorage.removeItem(`qrzl_conv_${id}`)
      } catch { /* ignore */ }
    }
    doctorConversations.value.clear()

    // 3. 清空消息列表
    conversations.value = []

    // 4. 清空其他会话 ID
    assistantConversationId.value = null
    adminConversationId.value = null
  }

  /** 清空当前消息列表（供外部组件调用，进入 Pinia action 追踪） */
  function clearMessages(): void {
    conversations.value = []
  }

  // ===== [G4] UI 辅助 =====

  function toggleFab(): void {
    fabOpen.value = !fabOpen.value
  }

  /** 导航方法 (预留，后续轮次使用) */
  function navigate(target: { name?: string; path?: string; params?: object; query?: object }): void {
    router.push(target)
  }

  // ===== 历史会话 =====

  /**
   * 加载指定医生的历史会话列表。
   *
   * 调用时机：DoctorChatView.vue 中用户点击"历史会话"按钮后触发。
   *
   * 执行流程：
   *   1. 设置 historyLoading = true, historyError = ''
   *   2. await getDoctorConversationHistory(doctorId, token)
   *   3. 写入 conversationHistory.value = result
   *   4. catch: historyError.value = err.message（网络错误/401 等）
   *   5. finally: historyLoading = false
   *
   * @param doctorId - 医生主键
   * @param token    - JWT Token（调用方从 authStore.token 取）
   */
  async function loadDoctorConversationHistory(
    doctorId: number,
    token: string
  ): Promise<void> {
    historyLoading.value = true
    historyError.value = ''
    try {
      conversationHistory.value = await getDoctorConversationHistory(doctorId, token)
    } catch (err: unknown) {
      historyError.value = err instanceof Error ? err.message : '加载历史会话失败'
    } finally {
      historyLoading.value = false
    }
  }

  /**
   * 加载 AI 助手的历史会话列表。
   *
   * 调用时机：AssistantChatView.vue 中用户触发（本轮 D1 仅落地接口，UI 后续轮次实现）。
   *
   * 执行流程：同 loadDoctorConversationHistory。
   *
   * @param token - JWT Token
   */
  async function loadAssistantConversationHistory(
    token: string
  ): Promise<void> {
    historyLoading.value = true
    historyError.value = ''
    try {
      conversationHistory.value = await getAssistantConversations(token)
    } catch (err: unknown) {
      historyError.value = err instanceof Error ? err.message : '加载历史会话失败'
    } finally {
      historyLoading.value = false
    }
  }

  /**
   * 清空历史会话列表 state。
   *
   * 调用时机：弹层关闭、切换医生、或组件卸载时调用。
   */
  function clearConversationHistory(): void {
    conversationHistory.value = []
    historyError.value = ''
  }

  // ===== Store 导出 =====
  return {
    // state
    conversations,
    isStreaming,
    activeAbortController,
    doctorConversations,
    currentDoctorId,
    fabOpen,
    assistantConversationId,
    adminConversationId,

    // actions — 消息
    sendMessage,
    sendMessageWithRetry,
    sendAssistantMessage,
    sendAdminMessage,

    // actions — SSE 连接控制
    registerAbortController,
    abortActiveConnection,
    releaseActiveController,

    // actions — conversation_id 管理
    getDoctorConversation,
    setDoctorConversation,
    clearDoctorConversation,
    getAssistantConversation,
    setAssistantConversation,
    clearAssistantConversation,
    getAdminConversation,
    setAdminConversation,
    clearAllConversations,

    // actions — 多医生路由
    switchDoctor,

    // actions — UI
    toggleFab,
    navigate,
    clearMessages,

    // state — 历史会话
    conversationHistory,
    historyLoading,
    historyError,

    // actions — 历史会话
    loadDoctorConversationHistory,
    loadAssistantConversationHistory,
    clearConversationHistory,
  }
})
