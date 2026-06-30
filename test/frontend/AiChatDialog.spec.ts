import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

// ============================================================
// AiChatDialog.vue — S2 4项综合设计合规修复验证
// ============================================================
//
// 行为契约来源: detail_v2.md §修改2 (2a/2b/2c/2d)
//
// BC-S2a-1: 未登录时渲染 fab-login-prompt
//   前置: authStore.token 为假值 (未登录), fabOpen 为 true
//   后置: 登录引导区 DOM 节点 id="fab-login-prompt" 存在
//
// BC-S2a-2: 已登录无消息时渲染 fab-welcome-logged-in
//   前置: authStore.token 为真值 (已登录), messages.length === 0, fabOpen 为 true
//   后置: 欢迎区 DOM 节点 id="fab-welcome-logged-in" 存在
//
// BC-S2b-1: 消息内容使用 renderMarkdown 渲染（统一 XSS 管道）
//   前置: messages 中有 content 为 Markdown 格式字符串的消息
//   后置: content 经 marked.parse → sanitizeHtml 白名单加固后渲染;
//         外部链接自动附带 rel="noopener noreferrer" target="_blank"
//
// BC-S2c-1: 已同意免责声明时不弹窗
//   前置: localStorage['disclaimer_accepted'] === 'true', isOpen 变为 true
//   后置: 不调用 showDisclaimer(), 对话框正常打开
//
// BC-S2c-2: 未同意免责声明时弹窗确认
//   前置: localStorage['disclaimer_accepted'] !== 'true', isOpen 变为 true
//   后置: 调用 showDisclaimer() 弹窗; 用户同意后 setDisclaimerAccepted(true);
//         用户拒绝后关闭对话框 (toggleFab)
//
// BC-S2d-1: 消息时间戳使用 HH:mm 格式
//   前置: msg.timestamp 为有效 Unix 毫秒时间戳
//   后置: 显示 HH:mm 格式时间 (如 "14:30"), 与 helpers.formatTime 行为一致

// ---- Mock store & composable modules ----
// vi.mock 被 vitest 自动提升到文件顶部，在所有 import 之前执行

vi.mock('@/stores/authStore')
vi.mock('@/stores/chatStore')
vi.mock('@/composables/useUI')

// ---- 真实导入（在 vi.mock 提升之后） ----

import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import {
  hasAcceptedDisclaimer,
  showDisclaimer,
  setDisclaimerAccepted,
} from '@/composables/useUI'
import { renderMarkdown } from '@/composables/useMarkdown'
import { formatTime } from '@/utils/helpers'
import AiChatDialog from '@/components/AiChatDialog.vue'

// ---- 测试辅助函数 ----

function makeRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div></div>' } },
      { path: '/login', component: { template: '<div>login</div>' } },
    ],
  })
}

// 响应式 mock 状态 —— 每个测试在 beforeEach 中重设
let mockAuth: {
  token: string | null
  role: string
}
let mockChat: {
  fabOpen: boolean
  conversations: Array<{ id: number; role: string; content: string; timestamp: number }>
  isStreaming: boolean
  toggleFab: ReturnType<typeof vi.fn>
  abortActiveConnection: ReturnType<typeof vi.fn>
  sendAssistantMessage: ReturnType<typeof vi.fn>
  clearAssistantConversation: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  mockAuth = reactive({ token: null, role: 'user' })
  mockChat = reactive({
    fabOpen: false,
    conversations: [],
    isStreaming: false,
    toggleFab: vi.fn(),
    abortActiveConnection: vi.fn(),
    sendAssistantMessage: vi.fn(),
    clearAssistantConversation: vi.fn(),
  })

  vi.mocked(useAuthStore).mockReturnValue(mockAuth as ReturnType<typeof useAuthStore>)
  vi.mocked(useChatStore).mockReturnValue(mockChat as ReturnType<typeof useChatStore>)

  vi.mocked(hasAcceptedDisclaimer).mockReturnValue(false)
  vi.mocked(showDisclaimer).mockResolvedValue(true)
  vi.mocked(setDisclaimerAccepted).mockImplementation(() => {})
})

// ---- 测试套件 ----

describe('AiChatDialog.vue S2 — 设计合规修复验证', () => {
  // ================================================================
  // S2a: DOM id 验证
  // ================================================================

  describe('BC-S2a: DOM id 验证', () => {
    it('BC-S2a-1: 未登录时渲染 #fab-login-prompt', () => {
      mockAuth.token = null
      mockChat.fabOpen = true

      const wrapper = mount(AiChatDialog, {
        global: {
          plugins: [makeRouter()],
          stubs: { DisclaimerBar: true },
        },
      })

      expect(wrapper.find('#fab-login-prompt').exists()).toBe(true)
    })

    it('BC-S2a-2: 已登录且无消息时渲染 #fab-welcome-logged-in', () => {
      mockAuth.token = 'fake-token'
      mockChat.fabOpen = true
      mockChat.conversations = []

      const wrapper = mount(AiChatDialog, {
        global: {
          plugins: [makeRouter()],
          stubs: { DisclaimerBar: true },
        },
      })

      expect(wrapper.find('#fab-welcome-logged-in').exists()).toBe(true)
    })
  })

  // ================================================================
  // S2b: renderMarkdown 统一 XSS 管道
  // ================================================================

  describe('BC-S2b: renderMarkdown 统一 XSS 管道', () => {
    it('BC-S2b-1-a: 模板中消息内容经 renderMarkdown 渲染为安全 HTML', () => {
      mockAuth.token = 'fake-token'
      mockChat.fabOpen = true
      mockChat.conversations = [
        {
          id: 1,
          role: 'assistant',
          content: '**粗体文本**',
          timestamp: 1700000000000,
        },
      ]

      const wrapper = mount(AiChatDialog, {
        global: {
          plugins: [makeRouter()],
          stubs: { DisclaimerBar: true },
        },
      })

      const msgContent = wrapper.find('.msg-content')
      expect(msgContent.exists()).toBe(true)
      // renderMarkdown 将 **粗体文本** 转为 <strong>粗体文本</strong>
      // 经过 sanitizeHtml 白名单后仍保留 strong 标签
      expect(msgContent.html()).toContain('<strong>粗体文本</strong>')
    })

    it('BC-S2b-1-b: renderMarkdown 外部链接自动附带安全属性', () => {
      const html = renderMarkdown('[示例链接](https://example.com/page)')
      expect(html).toContain('rel="noopener noreferrer"')
      expect(html).toContain('target="_blank"')
    })
  })

  // ================================================================
  // S2c: useUI 免责声明
  // ================================================================

  describe('BC-S2c: useUI 免责声明', () => {
    it('BC-S2c-1: 已同意免责声明时跳过弹窗', async () => {
      mockAuth.token = 'fake-token'
      mockChat.fabOpen = false
      vi.mocked(hasAcceptedDisclaimer).mockReturnValue(true)

      mount(AiChatDialog, {
        global: {
          plugins: [makeRouter()],
          stubs: { DisclaimerBar: true },
        },
      })

      // 触发 watcher: fabOpen false → true
      mockChat.fabOpen = true
      await flushPromises()

      // hasAcceptedDisclaimer 返回 true，不应调用 showDisclaimer
      expect(showDisclaimer).not.toHaveBeenCalled()
    })

    it('BC-S2c-2-a: 用户同意免责声明后调用 setDisclaimerAccepted(true)', async () => {
      mockAuth.token = 'fake-token'
      mockChat.fabOpen = false
      vi.mocked(hasAcceptedDisclaimer).mockReturnValue(false)
      vi.mocked(showDisclaimer).mockResolvedValue(true)

      mount(AiChatDialog, {
        global: {
          plugins: [makeRouter()],
          stubs: { DisclaimerBar: true },
        },
      })

      mockChat.fabOpen = true
      await flushPromises()

      expect(showDisclaimer).toHaveBeenCalled()
      expect(setDisclaimerAccepted).toHaveBeenCalledWith(true)
      // 用户同意了，不应关闭对话框
      expect(mockChat.toggleFab).not.toHaveBeenCalled()
    })

    it('BC-S2c-2-b: 用户拒绝免责声明后关闭对话框', async () => {
      mockAuth.token = 'fake-token'
      mockChat.fabOpen = false
      vi.mocked(hasAcceptedDisclaimer).mockReturnValue(false)
      vi.mocked(showDisclaimer).mockResolvedValue(false)

      mount(AiChatDialog, {
        global: {
          plugins: [makeRouter()],
          stubs: { DisclaimerBar: true },
        },
      })

      mockChat.fabOpen = true
      await flushPromises()

      expect(showDisclaimer).toHaveBeenCalled()
      expect(setDisclaimerAccepted).not.toHaveBeenCalled()
      expect(mockChat.toggleFab).toHaveBeenCalled()
    })
  })

  // ================================================================
  // S2d: formatTime 统一
  // ================================================================

  describe('BC-S2d: formatTime 统一版本', () => {
    it('BC-S2d-1-a: 有效时间戳返回 HH:mm 格式', () => {
      const result = formatTime(1700000000000)
      // 验证 HH:mm 格式（两位小时:两位分钟）
      expect(result).toMatch(/^\d{2}:\d{2}$/)
      expect(result.length).toBe(5)
    })

    it('BC-S2d-1-b: falsy 时间戳返回空字符串', () => {
      expect(formatTime(0)).toBe('')
      // 防御性：undefined/null 作为入参时不应抛错
      expect(() => formatTime(undefined as unknown as number)).not.toThrow()
    })
  })
})
