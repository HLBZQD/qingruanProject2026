/**
 * DoctorChatView.vue — G3 空态欢迎语验证
 *
 * 行为契约来源: detail_v2.md §G3 行为契约
 *
 * BC-G3-1: 无消息且非流式传输时渲染 .chat-welcome 欢迎区
 *   前置: loading=false, doctorError='', conversations为空, isStreaming=false
 *   后置: .chat-welcome 节点存在，含 h3 + p + 3个example-chip
 *
 * BC-G3-2: 有消息时渲染消息列表（.chat-welcome 不存在）
 *   前置: loading=false, doctorError='', conversations非空
 *   后置: .message-bubble 节点存在，.chat-welcome 不存在
 *
 * BC-G3-3: 加载态不渲染欢迎语
 *   前置: loading=true
 *   后置: SkeletonLoader 渲染，.chat-welcome 不存在
 *
 * BC-G3-4: 错误态不渲染欢迎语
 *   前置: loading=false, doctorError非空
 *   后置: .error-state 渲染，.chat-welcome 不存在
 *
 * BC-G3-5: isStreaming 守卫 — 流式传输中即使无消息也不渲染欢迎语
 *   前置: conversations为空, isStreaming=true
 *   后置: .chat-welcome 不存在，.typing-indicator 存在
 *
 * BC-G3-6: doctor 已加载时显示个性化欢迎语
 *   前置: doctor.name = '张医生'
 *   后置: h3 包含 '张医生'
 *
 * BC-G3-7: doctor 为 null 时显示通用欢迎语
 *   前置: doctor = null
 *   后置: h3 包含 '您好，我是您的AI医生'
 *
 * 不变式: loading/error 态的 v-if/v-else-if 顺序不变（先 loading, 再 error, 再 welcome, 最后 messages）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

// ============================================================
// 全局 mock — vitest 自动提升到文件顶部
// ============================================================
vi.mock('@/stores/authStore')
vi.mock('@/stores/chatStore')
vi.mock('@/composables/useChatApi')
vi.mock('@/composables/useMarkdown')
vi.mock('vue-router', async () => {
  const actual = await vi.importActual('vue-router')
  return {
    ...(actual as object),
    useRoute: vi.fn(),
    useRouter: vi.fn(),
  }
})

// ============================================================
// 导入（在 vi.mock 提升之后）
// ============================================================
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { getDoctorInfo } from '@/composables/useChatApi'
import { renderMarkdown } from '@/composables/useMarkdown'
import { useRoute, useRouter } from 'vue-router'
import DoctorChatView from '@/views/DoctorChatView.vue'

// ============================================================
// 测试辅助
// ============================================================

function makeRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div></div>' } },
      { path: '/consultation', component: { template: '<div>consultation</div>' } },
      { path: '/login', component: { template: '<div>login</div>' } },
    ],
  })
}

/**
 * 响应式 mock 状态。
 * 使用 reactive() 包裹 plain 值以避免 Vue template 中 ref 不解包的问题。
 * 参考 AiChatDialog.spec.ts 的 mock 模式。
 */
let mockAuth: {
  token: string | null
  role: string
  user: { avatar: string } | null
}
let mockChat: {
  conversations: Array<{ id: number; role: string; content: string; timestamp: number }>
  isStreaming: boolean
  conversationHistory: Array<unknown>
  historyLoading: boolean
  historyError: string
  switchDoctor: ReturnType<typeof vi.fn>
  sendMessageWithRetry: ReturnType<typeof vi.fn>
  abortActiveConnection: ReturnType<typeof vi.fn>
  clearDoctorConversation: ReturnType<typeof vi.fn>
  clearMessages: ReturnType<typeof vi.fn>
  loadDoctorConversationHistory: ReturnType<typeof vi.fn>
  clearConversationHistory: ReturnType<typeof vi.fn>
  setDoctorConversation: ReturnType<typeof vi.fn>
}

let mockRoute: { params: { id: string } }

beforeEach(() => {
  mockAuth = reactive({
    token: 'fake-token',
    role: 'user',
    user: { avatar: '/user-avatar.png' },
  })

  mockChat = reactive({
    conversations: [] as Array<{ id: number; role: string; content: string; timestamp: number }>,
    isStreaming: false,
    conversationHistory: [] as Array<unknown>,
    historyLoading: false,
    historyError: '',
    switchDoctor: vi.fn(),
    sendMessageWithRetry: vi.fn(),
    abortActiveConnection: vi.fn(),
    clearDoctorConversation: vi.fn(),
    clearMessages: vi.fn(),
    loadDoctorConversationHistory: vi.fn(),
    clearConversationHistory: vi.fn(),
    setDoctorConversation: vi.fn(),
  })

  mockRoute = { params: { id: '1' } }

  vi.mocked(useAuthStore).mockReturnValue(mockAuth as unknown as ReturnType<typeof useAuthStore>)
  vi.mocked(useChatStore).mockReturnValue(mockChat as unknown as ReturnType<typeof useChatStore>)
  vi.mocked(useRoute).mockReturnValue(mockRoute as ReturnType<typeof useRoute>)
  vi.mocked(useRouter).mockReturnValue(makeRouter() as ReturnType<typeof useRouter>)
  vi.mocked(getDoctorInfo).mockResolvedValue({
    id: 1,
    name: '张医生',
    avatar: '/doctor-avatar.png',
    title: '主任医师',
    specialty: '内分泌科',
    hospital: '市人民医院',
    description: '专业糖尿病诊疗',
  })
  vi.mocked(renderMarkdown).mockImplementation((content: string) => `<p>${content}</p>`)
})

afterEach(() => {
  vi.clearAllMocks()
})

// ============================================================
// 测试套件
// ============================================================
describe('DoctorChatView.vue G3 — 空态欢迎语验证', () => {
  /**
   * 挂载辅助函数。
   * 组件在 onMounted 中调用 loadDoctor()，需要等待异步完成。
   * 使用 shallow mount 减少子组件干扰。
   */
  async function mountDoctorChat() {
    const wrapper = mount(DoctorChatView, {
      global: {
        plugins: [makeRouter()],
        stubs: {
          SkeletonLoader: true,
          ErrorRetry: true,
          EmptyState: true,
          DisclaimerBar: true,
          'router-link': true,
          'router-view': true,
        },
      },
    })
    // 等待 onMounted → loadDoctor 完成（getDoctorInfo resolve → loading=false）
    await flushPromises()
    return wrapper
  }

  // ================================================================
  // BC-G3-1: 空态欢迎语渲染
  // ================================================================
  describe('BC-G3-1: 无消息且非流式传输时渲染 .chat-welcome', () => {
    it('conversations 为空 + isStreaming=false 时 .chat-welcome 存在', async () => {
      mockChat.conversations = []
      mockChat.isStreaming = false

      const wrapper = await mountDoctorChat()

      expect(wrapper.find('.chat-welcome').exists()).toBe(true)
    })

    it('.chat-welcome 包含 .welcome-avatar 头像区', async () => {
      mockChat.conversations = []
      mockChat.isStreaming = false

      const wrapper = await mountDoctorChat()

      expect(wrapper.find('.chat-welcome .welcome-avatar').exists()).toBe(true)
      expect(wrapper.find('.welcome-avatar .fa-user-doctor').exists()).toBe(true)
    })

    it('.chat-welcome 包含欢迎标题 h3', async () => {
      mockChat.conversations = []
      mockChat.isStreaming = false

      const wrapper = await mountDoctorChat()

      const h3 = wrapper.find('.chat-welcome h3')
      expect(h3.exists()).toBe(true)
      expect(h3.text()).toContain('您好')
      expect(h3.text()).toContain('医生')
    })

    it('.chat-welcome 包含欢迎文案 p', async () => {
      mockChat.conversations = []
      mockChat.isStreaming = false

      const wrapper = await mountDoctorChat()

      const p = wrapper.find('.chat-welcome > p')
      expect(p.exists()).toBe(true)
      expect(p.text()).toContain('请问有什么可以帮您')
    })

    it('.chat-welcome 包含 3 个 example-chip', async () => {
      mockChat.conversations = []
      mockChat.isStreaming = false

      const wrapper = await mountDoctorChat()

      const chips = wrapper.findAll('.chat-welcome .example-chip')
      expect(chips).toHaveLength(3)
      expect(chips[0].text()).toBe('最近血糖控制得怎么样？')
      expect(chips[1].text()).toBe('我的用药方案需要调整吗？')
      expect(chips[2].text()).toBe('饮食上有什么建议？')
    })
  })

  // ================================================================
  // BC-G3-2: 有消息时不渲染欢迎语
  // ================================================================
  describe('BC-G3-2: 有消息时渲染消息列表，不渲染欢迎语', () => {
    it('conversations 非空时 .chat-welcome 不存在', async () => {
      mockChat.conversations = [
        { id: 1, role: 'user', content: '你好', timestamp: Date.now() },
      ]
      mockChat.isStreaming = false

      const wrapper = await mountDoctorChat()

      expect(wrapper.find('.chat-welcome').exists()).toBe(false)
    })

    it('conversations 非空时 .message-bubble 存在', async () => {
      mockChat.conversations = [
        { id: 1, role: 'user', content: '你好', timestamp: Date.now() },
      ]
      mockChat.isStreaming = false

      const wrapper = await mountDoctorChat()

      expect(wrapper.find('.message-bubble').exists()).toBe(true)
    })

    it('conversations 非空时消息列表使用 v-else 分支（非 welcome 分支）', async () => {
      mockChat.conversations = [
        { id: 1, role: 'user', content: '你好', timestamp: Date.now() },
      ]
      mockChat.isStreaming = false

      const wrapper = await mountDoctorChat()

      // v-else 分支渲染的消息列表包含 msg-content (v-html)，不是静态 chip
      expect(wrapper.find('.message-bubble .msg-content').exists()).toBe(true)
    })
  })

  // ================================================================
  // BC-G3-3: 加载态不渲染欢迎语
  // ================================================================
  describe('BC-G3-3: 加载态不渲染欢迎语', () => {
    it('loading=true 时 .loading-state 渲染（v-if 分支），.chat-welcome 不存在', async () => {
      // 让 getDoctorInfo 永不 resolve，保持 loading=true
      vi.mocked(getDoctorInfo).mockImplementation(() => new Promise(() => {}))

      const wrapper = mount(DoctorChatView, {
        global: {
          plugins: [makeRouter()],
          stubs: {
            SkeletonLoader: true,
            ErrorRetry: true,
            EmptyState: true,
            DisclaimerBar: true,
            'router-link': true,
            'router-view': true,
          },
        },
      })
      await nextTick()

      // loading 为 true 时 v-if="loading" 命中，渲染 .loading-state
      expect(wrapper.find('.loading-state').exists()).toBe(true)
      expect(wrapper.find('.chat-welcome').exists()).toBe(false)
    })
  })

  // ================================================================
  // BC-G3-4: 错误态不渲染欢迎语
  // ================================================================
  describe('BC-G3-4: 错误态不渲染欢迎语', () => {
    it('getDoctorInfo 失败时 .error-state 存在，.chat-welcome 不存在', async () => {
      vi.mocked(getDoctorInfo).mockRejectedValue(new Error('网络错误'))
      mockChat.conversations = []

      const wrapper = await mountDoctorChat()

      expect(wrapper.find('.error-state').exists()).toBe(true)
      expect(wrapper.find('.chat-welcome').exists()).toBe(false)
    })

    it('doctor id 无效时 .error-state 存在', async () => {
      mockRoute.params.id = '-1'
      vi.mocked(getDoctorInfo).mockClear() // 无效 ID 时不应调用 API
      mockChat.conversations = []

      const wrapper = await mountDoctorChat()

      expect(wrapper.find('.error-state').exists()).toBe(true)
      expect(wrapper.find('.chat-welcome').exists()).toBe(false)
    })
  })

  // ================================================================
  // BC-G3-5: isStreaming 守卫
  // ================================================================
  describe('BC-G3-5: isStreaming 守卫 — 流式传输中不渲染欢迎语', () => {
    it('conversations 为空但 isStreaming=true 时 .chat-welcome 不存在', async () => {
      mockChat.conversations = []
      mockChat.isStreaming = true

      const wrapper = await mountDoctorChat()

      // 条件 guards: conversations.length===0 (true) && !isStreaming (false) = false
      expect(wrapper.find('.chat-welcome').exists()).toBe(false)
    })

    it('isStreaming=true 时 .typing-indicator 存在（对方正在输入）', async () => {
      mockChat.conversations = []
      mockChat.isStreaming = true

      const wrapper = await mountDoctorChat()

      expect(wrapper.find('.typing-indicator').exists()).toBe(true)
    })
  })

  // ================================================================
  // BC-G3-6: 个性化欢迎语（doctor.name 存在）
  // ================================================================
  describe('BC-G3-6: doctor 已加载时显示个性化欢迎语', () => {
    it('doctor.name="张医生" 时 h3 包含个性化文案', async () => {
      vi.mocked(getDoctorInfo).mockResolvedValue({
        id: 1,
        name: '张医生',
        avatar: '/doctor-avatar.png',
        title: '主任医师',
        specialty: '内分泌科',
        hospital: '市人民医院',
        description: '专业糖尿病诊疗',
      })
      mockChat.conversations = []
      mockChat.isStreaming = false

      const wrapper = await mountDoctorChat()

      const h3 = wrapper.find('.chat-welcome h3')
      expect(h3.exists()).toBe(true)
      expect(h3.text()).toBe('您好，我是张医生医生')
    })
  })

  // ================================================================
  // BC-G3-7: 兜底欢迎语（doctor 为 null）
  // ================================================================
  describe('BC-G3-7: doctor 为 null 时显示通用欢迎语', () => {
    it('doctor 信息未加载时显示通用欢迎文案', async () => {
      // getDoctorInfo resolve 为 null 模拟 doctor 未加载场景
      vi.mocked(getDoctorInfo).mockResolvedValue(null as unknown as {
        id: number; name: string; avatar: string; title: string;
        specialty: string; hospital: string; description: string;
      })
      mockChat.conversations = []
      mockChat.isStreaming = false

      const wrapper = await mountDoctorChat()

      const h3 = wrapper.find('.chat-welcome h3')
      expect(h3.exists()).toBe(true)
      expect(h3.text()).toBe('您好，我是您的AI医生')
    })
  })

  // ================================================================
  // 不变式: v-if 链的顺序
  // ================================================================
  describe('不变式: v-if/v-else-if/v-else 条件链顺序', () => {
    it('loading=true 优先级最高（v-if），屏蔽 welcome', async () => {
      vi.mocked(getDoctorInfo).mockImplementation(() => new Promise(() => {}))
      mockChat.conversations = []
      mockChat.isStreaming = false

      const wrapper = mount(DoctorChatView, {
        global: {
          plugins: [makeRouter()],
          stubs: {
            SkeletonLoader: true,
            ErrorRetry: true,
            EmptyState: true,
            DisclaimerBar: true,
            'router-link': true,
            'router-view': true,
          },
        },
      })
      await nextTick()

      expect(wrapper.find('.chat-welcome').exists()).toBe(false)
    })

    it('loading=false + doctorError 非空优先级高于 welcome（v-else-if）', async () => {
      vi.mocked(getDoctorInfo).mockRejectedValue(new Error('加载失败'))
      mockChat.conversations = []
      mockChat.isStreaming = false

      const wrapper = await mountDoctorChat()

      expect(wrapper.find('.error-state').exists()).toBe(true)
      expect(wrapper.find('.chat-welcome').exists()).toBe(false)
    })
  })
})
