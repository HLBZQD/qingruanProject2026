# 第三轮修复详细设计 v3

> **依据**: 任务文件 `task_v3.md` (1315行, 7组 G1-G7)，诊断报告 `redeliberations/202606271705_frontend_todo_diagnosis/a_v8_diag_v3.md` S5b-1/S5b-2，计划审查 `plan_review_v3_r2.md`
> **设计基线**: `docs/2_detailed_design_v3.md` (3.3节 SSE事件格式 / 3.7节 chatStore接口 / 3.8.7节 SSE类型 / 4.1.3节组件树 / 4.3节流程图)
> **日期**: 2026-06-27
> **范围**: 7个任务组 -- G1-G7，覆盖 S5b-1 (chatStore SSE核心) + S5b-2 (Consultation重写 + DoctorChatView + 路由集成)
> **总工时**: 28-40h (简化交付，详见 task_v3.md 第9节可推迟项)

---

## 总体设计约定

### 命名与代码风格

| 约定 | 规则 |
|------|------|
| localStorage 键前缀 | `qrzl_` 统一前缀，避免命名冲突 (如 `qrzl_conv_1`、`qrzl_conv_2`) |
| Map<number, string> 序列化 | doctorConversations Map 不可直接序列化；pinia-plugin-persistedstate 持久化或手动 localStorage 按 doctorId 分键 |
| 时间戳 | SSE 事件 `created_at` 为 Unix 秒，前端乘以 1000 转为毫秒使用 `Date.now()` 的逻辑 |
| sessionStorage 写保护 | conversation_id 后备存储 `localStorage.setItem()` 外套 `try-catch` 防 `QuotaExceededError` |
| token 传递方式 | `sendChatMessage` 使用原生 fetch，token 通过参数传入（从 authStore 读取后传入），避免 useChatApi.ts 直接依赖 authStore |
| SSE chunk 处理 | TextDecoder 增量解码，buffer 拼接，按 `\n\n` 分隔，保留半截块 `remaining` |

### 与其他轮次的接口约定

| 本轮暴露 | 用途 | 消费方 (后续轮次) |
|---------|------|-------------------|
| `chatStore.sendMessageWithRetry()` | 发送消息(含重连) | DoctorChatView.vue (G6) |
| `chatStore.abortActiveConnection()` | 中止SSE连接 | DoctorChatView.vue + 登出流程(S8) |
| `chatStore.conversations` | 消息列表响应式数组 | DoctorChatView.vue 模板渲染 |
| `chatStore.isStreaming` | 流式状态标记 | DoctorChatView.vue 发送按钮 disabled + 输入动画 |
| `chatStore.clearAllConversations()` | 登出清理 | authStore.clearAuth() (S8 后续轮次) |
| `useChatApi.sendChatMessage()` | SSE 请求入口 | chatStore (内部调用) |
| `useChatApi.getDoctorInfo()` | 医生详情 API | DoctorChatView.vue |
| `/consultation/doctor/:id` 路由 | 医师对话路由 | Consultation.vue goToChat() |

---

## 架构决策总览

### AD-1: fetch + ReadableStream 而非 EventSource

| 维度 | EventSource | fetch + ReadableStream (采用) |
|------|------------|------------------------------|
| HTTP 方法 | 仅 GET | POST (携带 JSON body) |
| 自定义 Header | 不支持 | 支持 Authorization bearer token |
| 请求体 | 不支持 | 支持 `{ message, conversation_id }` |
| 浏览器兼容 | IE 不支持 | 所有现代浏览器 (含 Chrome 43+) |
| 取消机制 | close() | AbortController.signal |
| 错误处理 | onerror 事件 (信息有限) | response.status / response.ok |

**决策理由**: 后端 SSE 端点为 `POST /api/chat/doctor/:id`，需在请求体中携带 `message` 和 `conversation_id`，且需通过 `Authorization` 头传递 JWT Token。EventSource 不支持 POST 方法和自定义请求头，因此采用 `fetch + ReadableStream` 方案。

### AD-2: chatStore 集中管理 SSE 连接 (而非 useSSE.ts composable 分散管理)

**决策理由** (对齐设计文档 3.7 节):
- "同时活跃 SSE 连接数上限为 1" 约束 (需求 4.2 节) 需要全局单例的 `activeAbortController` 追踪。
- `registerAbortController()` 需自动 abort 旧连接——此逻辑需要跨组件感知，composable 作用域无法覆盖。
- conversation_id 的持久化 (localStorage) 为全局状态，与 SSE 连接生命周期耦合。
- 登出时 `clearAllConversations()` 需同时 abort 活跃连接，此协调逻辑天然属于 Store。

**折中**: `useSSE.ts` composable 的设计 (设计文档 4.4.2 节) 包含 `streamRequest` 函数——本轮设计中该函数的核心逻辑 (fetch + ReadableStream 读取 + `\n\n` 分隔 + `data:` 前缀 + JSON.parse) 内联到 chatStore 的 `readSSEStream()` 中。这样做避免 chatStore 与 useSSE composable 之间的接口重复抽象 (both would wrap fetch)，且 chatStore 需要直接控制 reader 和 AbortController 的生命周期。

### AD-3: conversation_id 持久化双层策略

| 层级 | 存储 | 用途 |
|------|------|------|
| 内存 (Map) | `doctorConversations: ref<Map<number, string>>` | 当前会话快速读写，sendMessage 时优先读取 |
| localStorage | `qrzl_conv_{doctorId}` | 跨页面刷新持久化，getDoctorConversation 中 fallback 读取 |

**决策理由**: 设计文档 3.7 节定义了 chatStore 通过 `pinia-plugin-persistedstate` 将 `doctorConversations` Map 持久化到 localStorage。然而 Map 的序列化/反序列化在 `pinia-plugin-persistedstate` 中存在兼容性风险 (JSON.stringify 将 Map 转为 `{}`)。本轮采用双重策略：内存 Map 为主存储，localStorage 按 `doctorId` 分键作为后备——两层的读写均在 `getDoctorConversation()` / `setDoctorConversation()` / `clearDoctorConversation()` 三个方法中统一。

### AD-4: 简化版重连策略

**v3 简化交付** (对齐 task_v3.md 第9节):
- 固定间隔 3 次重试: 2s / 4s / 8s
- 重试时携带已保存的 conversation_id (恢复对话上下文)
- 指数退避增强 (1s → 30s, 最大5次, 倍增因子2) 推迟至 v4

**决策理由**: 指数退避的调试复杂度高 (边界条件: 网络抖动 vs 服务端宕机需不同退避策略)，v3 优先保证基本重连可用，在真实网络环境中充分验证后再升级为指数退避。

---

## 模块间数据流图

```
┌──────────────────────────────────────────────────────────────────┐
│                      用户浏览器 (Vue3 SPA)                        │
│                                                                  │
│  ┌─────────────────────┐     ┌──────────────────────────────┐   │
│  │  Consultation.vue    │     │  DoctorChatView.vue          │   │
│  │  (医生列表入口页)     │     │  (医生对话界面)              │   │
│  │                     │     │                              │   │
│  │  getDoctors()       │     │  getDoctorInfo(id)           │   │
│  │    ↓                │     │    ↓                         │   │
│  │  doctors[] 渲染卡片  │     │  doctor 信息头部             │   │
│  │                     │     │                              │   │
│  │  goToChat(id)       │     │  handleSend()                │   │
│  │  → router.push()    │────→│    ↓                         │   │
│  │                     │     │  chatStore.sendMessage       │   │
│  └─────────────────────┘     │  WithRetry(docId, text)      │   │
│                              │    ↓                         │   │
│                              │  chatStore.conversations     │   │
│                              │  (响应式消息列表)             │   │
│                              │    ↓                         │   │
│                              │  v-for 渲染消息气泡           │   │
│                              │  isStreaming → 发送按钮状态   │   │
│                              └──────────────┬───────────────┘   │
│                                             │                   │
│  ┌──────────────────────────────────────────┴────────────────┐  │
│  │  chatStore.ts (Pinia Store - SSE 连接管理中枢)             │  │
│  │                                                           │  │
│  │  状态:                                                     │  │
│  │    conversations: ChatMessage[]    消息列表                │  │
│  │    isStreaming: boolean            SSE流活跃标记            │  │
│  │    activeAbortController           SSE连接控制器            │  │
│  │    doctorConversations: Map        conversation_id映射     │  │
│  │    currentDoctorId: number|null    当前活跃医生             │  │
│  │    fabOpen: boolean               FAB弹窗状态              │  │
│  │                                                           │  │
│  │  核心方法:                                                 │  │
│  │    sendMessage()          fetch + ReadableStream 管道      │  │
│  │    sendMessageWithRetry() 带重连的sendMessage包装          │  │
│  │    readSSEStream()        SSE流读取循环                    │  │
│  │    parseSSEBuffer()       SSE事件块解析                    │  │
│  │    dispatchSSEEvent()     SSE事件分发                      │  │
│  │    registerAbortController() 注册+自动abort旧连接          │  │
│  │    abortActiveConnection()   中止活跃连接                  │  │
│  │    getDoctorConversation()   读取conversation_id           │  │
│  │    setDoctorConversation()   保存conversation_id           │  │
│  │    clearAllConversations()   登出清理                      │  │
│  └────────────┬──────────────────────────────────────────────┘  │
│               │                                                 │
│  ┌────────────┴──────────────────────────────────────────────┐  │
│  │  useChatApi.ts (API 封装层)                                │  │
│  │                                                           │  │
│  │  sendChatMessage({ doctorId, message, conversationId?,    │  │
│  │                     token, signal? })                      │  │
│  │    → fetch POST /api/chat/doctor/:id                      │  │
│  │    → 返回 Response (body: ReadableStream)                  │  │
│  │                                                           │  │
│  │  getDoctorInfo(id)                                         │  │
│  │    → api.get /doctors/:id                                 │  │
│  │    → 返回 Doctor                                           │  │
│  └────────────┬──────────────────────────────────────────────┘  │
│               │                                                 │
└───────────────┼─────────────────────────────────────────────────┘
                │
    HTTP/HTTPS  │  POST /api/chat/doctor/:id (SSE流)
    GET /api/doctors/:id
                │
                ▼
┌──────────────────────────────────────────────────────────────────┐
│  Express 中间层 (server.js)                                      │
│  /api/chat/doctor/:id → sseProxy → Dify API (SSE 透传)          │
│  /api/doctors/:id      → SQLite 查询                             │
└──────────────────────────────────────────────────────────────────┘
```

---

## Task G1: useChatApi.ts 创建 -- SSE API 封装层

### G1.1 涉及文件

| 文件 | 行范围 / 说明 | 操作 |
|------|--------------|------|
| `src/composables/useChatApi.ts` | 完整新建 | 新建 ~50行 |
| `src/types/api.ts` | `Doctor` 接口定义之后 | 修改 (追加 `DoctorDetail` 类型，按需) |

### G1.2 当前代码状态

`src/composables/useChatApi.ts` 不存在。chatStore 直接使用 `fetch` 无 API 层封装。`src/composables/useHomeApi.ts` 已有 `getDoctors()` 等函数——useChatApi.ts 对标其模式，但 SSE 端点需使用原生 fetch (非 axios)。

### G1.3 新增文件: `src/composables/useChatApi.ts`

#### G1.3.1 完整代码结构

```typescript
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
```

#### G1.3.2 函数签名与参数语义

| 函数 | 签名 | HTTP 方法 | 使用客户端 | 拦截器 |
|------|------|:--------:|----------|:----:|
| `sendChatMessage` | `(params: { doctorId, message, token, conversationId?, signal? }) => Promise<Response>` | POST | 原生 fetch | 无 (需自行处理 401) |
| `getDoctorInfo` | `(id: number) => Promise<Doctor>` | GET | axios (useApi) | 自动 (req: Authorization, res: success 检查) |

#### G1.3.3 token 传递设计决策

`sendChatMessage` 的 `token` 参数由调用方 (chatStore) 从 `authStore` 获取后传入——useChatApi.ts 不 import authStore。

**决策理由**: 审查报告 S1 建议 (plan_review_v3_r2.md 第314行) 指出 token 通过参数传入可避免 useChatApi -> authStore 循环依赖风险。虽然当前 chatStore 与 authStore 无相互引用，但采纳此建议使 useChatApi.ts 成为纯函数模块 (无 Store 依赖)，提升可测试性和可复用性。

### G1.4 类型扩展 (按需)

若后端 `GET /api/doctors/:id` 返回包含 `is_online` 字段，在 `src/types/api.ts` `Doctor` 接口之后追加:

```typescript
/** 医生详情 (含在线状态)，GET /api/doctors/:id */
export interface DoctorDetail extends Doctor {
  is_online: boolean
}
```

若后端当前不返回 `is_online`，先以 `Doctor` 类型工作，`getDoctorInfo` 返回类型为 `Promise<Doctor>`。模板中使用 `v-if="doctor.is_online !== false"` 双阴性保护——字段不存在时不报错、不显示在线标识。

### G1.5 数据流

```
chatStore.sendMessage()
  → authStore.token 获取 token
  → getDoctorConversation(doctorId) 获取 conversationId
  → sendChatMessage({ doctorId, message, token, conversationId, signal })
    → fetch POST /api/chat/doctor/:id
    → 返回 Response (status 200, body: ReadableStream)
    → chatStore 接管 reader
```

```
DoctorChatView.vue loadDoctor()
  → getDoctorInfo(Number(route.params.id))
    → api.get /api/doctors/:id
    → 返回 Doctor { id, name, avatar, department, title, description, ... }
```

### G1.6 边界条件

| 场景 | 行为 |
|------|------|
| conversationId 为 undefined | 请求体不含 `conversation_id` 字段 (首次对话，后端创建新会话) |
| conversationId 为 string | 请求体含 `conversation_id` (恢复历史对话) |
| signal 已 abort | fetch 抛出 `AbortError`，由 chatStore catch 块静默处理 |
| 网络断开 | fetch 抛出 `TypeError: Failed to fetch`，由 chatStore sendMessageWithRetry 捕获并启动重连 |
| token 过期 (后端返回 401) | chatStore 在 `sendMessage()` 中检查 `response.status === 401`，触发 clearAuth + Toast |

### G1.7 验收标准

- [ ] `sendChatMessage()` 可成功发起 `POST /api/chat/doctor/:id` 请求，返回 `Response` 对象 (status 200)
- [ ] `getDoctorInfo()` 可成功获取医生详情，返回 `Doctor` 对象
- [ ] `sendChatMessage()` 传入 `conversationId` 时，请求体包含 `conversation_id` 字段；不传时该字段不存在
- [ ] `vue-tsc --noEmit` 无新增编译错误

---

## Task G2: chatStore.ts -- fetch + ReadableStream SSE 连接管理

### G2.1 涉及文件

| 文件 | 行范围 / 说明 | 操作 |
|------|--------------|------|
| `src/stores/chatStore.ts` | 完整重写 (从13行骨架) | 重写 ~60行 (G2) |

### G2.2 当前代码状态

`src/stores/chatStore.ts` 为 13 行骨架:
```typescript
// 仅含 conversations: ref([]), abortActiveConnection() 空函数体,
// clearAllConversations() 仅清空数组
```

无 `isStreaming`、`activeAbortController`、`doctorConversations`、`sendMessage`、`readSSEStream` 等状态和逻辑。

### G2.3 修改后代码结构

#### G2.3.1 Store 状态扩展 (类型定义)

```typescript
// src/stores/chatStore.ts
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { sendChatMessage } from '@/composables/useChatApi'
import type { ChatMessage } from '@/types/sse'
import type { SSEEvent } from '@/types/sse'

export const useChatStore = defineStore('chat', () => {
  // ===== 状态 =====
  /** 当前对话消息列表 (响应式数组，驱动 DoctorChatView 模板渲染) */
  const conversations = ref<ChatMessage[]>([])

  /** SSE 流是否活跃 (用于 UI: 发送按钮 disabled + "对方正在输入..." 动画) */
  const isStreaming = ref(false)

  /** 活跃的 SSE AbortController (连接数上限为1的控制点) */
  const activeAbortController = ref<AbortController | null>(null)

  /** FAB 悬浮按钮展开/收起 (UI 增强，v3简化版可留空) */
  const fabOpen = ref(false)
```

#### G2.3.2 AbortController 生命周期管理 (registerAbortController + abortActiveConnection)

```typescript
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
```

#### G2.3.3 sendMessage() -- fetch + ReadableStream 管道

```typescript
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
    }
    conversations.value.push(userMessage)

    // 2. 读取 conversation_id (首次对话不传)
    const conversationId = getDoctorConversation(doctorId) ?? undefined

    // 3. 注册 AbortController (自动 abort 旧连接)
    const controller = new AbortController()
    registerAbortController(controller)

    isStreaming.value = true

    try {
      // 4. 发起 SSE 请求
      const response = await sendChatMessage({
        doctorId,
        message: text,
        token,
        conversationId,
        signal: controller.signal,
      })

      // 5. 检查响应状态码
      if (response.status === 401) {
        // 401 Token 过期 — 触发 clearAuth + Toast，保持对话窗口打开
        const { useAuthStore } = await import('@/stores/authStore')
        useAuthStore().clearAuth()
        const Swal = await import('sweetalert2')
        Swal.default.fire({
          toast: true,
          position: 'top',
          icon: 'info',
          title: '登录已过期，请重新登录',
          showConfirmButton: false,
          timer: 2500,
          timerProgressBar: true,
        })
        isStreaming.value = false
        return
      }

      if (!response.ok) {
        throw new Error(`SSE 请求失败: HTTP ${response.status}`)
      }

      // 6. 获取 ReadableStream reader
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('浏览器不支持 ReadableStream')
      }

      // 7. 流式读取循环 (G3 实现具体的 SSE 事件解析)
      await readSSEStream(reader)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // 用户主动取消或切换医生 — 静默处理，不展示错误
        return
      }
      // 其他异常由 sendMessageWithRetry (G4) 处理
      throw err
    } finally {
      isStreaming.value = false
      activeAbortController.value = null
    }
  }
```

#### G2.3.4 readSSEStream() 循环框架 (G2 占位，G3 填充)

```typescript
  /**
   * SSE 流读取循环框架。
   *
   * 设计依据: docs/2_detailed_design_v3.md
   *   - 3.3 节: 按 \n\n 分隔事件块，去除 data: 前缀后 JSON.parse (第2373行)
   *   - 4.4.2 节: useSSE.ts streamRequest 循环模式 (第4097-4112行)
   *
   * G2 范围: 建立 reader 循环结构 + TextDecoder + buffer + 异常处理
   * G3 范围: 在循环中实现 parseSSEBuffer() + dispatchSSEEvent() 具体逻辑
   *
   * @param reader - ReadableStreamDefaultReader<Uint8Array>
   */
  async function readSSEStream(
    reader: ReadableStreamDefaultReader<Uint8Array>
  ): Promise<void> {
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // 解码 chunk → 文本 (stream: true 保留不完整的多字节字符)
        buffer += decoder.decode(value, { stream: true })

        // G3 在此实现:
        //   const result = parseSSEBuffer(buffer)
        //   buffer = result.remaining
        //   for (const event of result.events) { dispatchSSEEvent(event) }

        // [G2 占位] 临时消费 buffer 避免无限增长
        // G3 将替换为完整的 parseSSEBuffer + dispatchSSEEvent 逻辑
        const result = parseSSEBuffer(buffer)
        buffer = result.remaining
        for (const event of result.events) {
          dispatchSSEEvent(event)
        }
      }
    } finally {
      // 确保流资源释放
      reader.releaseLock()
    }
  }

  // [G2 占位] parseSSEBuffer 和 dispatchSSEEvent 的临时空实现
  // G3 将替换为完整的 SSE 协议解析逻辑
  function parseSSEBuffer(buffer: string): {
    events: SSEEvent[]
    remaining: string
  } {
    // G3 实现 (G2 仅提供骨架)
    return { events: [], remaining: buffer }
  }

  function dispatchSSEEvent(event: SSEEvent): void {
    // G3 实现 (G2 仅提供骨架)
  }
```

**G2 占位说明**: `parseSSEBuffer` 和 `dispatchSSEEvent` 在 G2 阶段提供空实现 (返回空事件列表 / 空函数体)。这允许 G2 独立编译通过并验证 reader 管道和 AbortController 生命周期。G3 将替换为完整的 SSE 协议解析逻辑。

### G2.4 数据流

```
DoctorChatView.vue handleSend()
  → chatStore.sendMessage(doctorId, text, token)
    → conversations.push(userMessage)           // 用户气泡
    → getDoctorConversation(doctorId)            // 查 conversation_id
    → registerAbortController(new AbortController())  // 注册 (auto-abort 旧)
    → sendChatMessage({ doctorId, message, token, conversationId, signal })
      → fetch POST /api/chat/doctor/:id
    → response.status === 401 ? clearAuth + Toast : 继续
    → response.body.getReader()
    → readSSEStream(reader)
      → while (reader.read())
        → buffer += decoder.decode(value)
        → [G3] parseSSEBuffer → dispatchSSEEvent
    → finally: isStreaming = false, activeAbortController = null
```

### G2.5 边界条件

| 场景 | 行为 |
|------|------|
| 第二条消息发送时 (第一条 SSE 仍在进行) | `registerAbortController` 内部 abort 旧连接 → 第一条 SSE 抛 AbortError → catch 静默 → 新连接建立 |
| 组件卸载时 (onUnmounted → abortActiveConnection) | `activeAbortController.abort()` → reader.read() 抛 AbortError → finally 中 `reader.releaseLock()` 释放 |
| 后端返回 401 | `clearAuth()` + SweetAlert2 Toast + `isStreaming = false` + return (不进入流读取) |
| 后端返回 500 | `!response.ok` → throw Error → sendMessageWithRetry (G4) 捕获并启动重连 |
| `response.body` 为 null (罕见) | throw '浏览器不支持 ReadableStream' → sendMessageWithRetry 处理 |
| reader 读取过程中网络断开 | `reader.read()` 可能长时间挂起或抛 NetworkError → finally 中 `releaseLock()` 确保释放 |

### G2.6 验收标准

- [ ] 发送消息后，Network 面板可见 `POST /api/chat/doctor/:id` 请求 (status 200)
- [ ] 发送第二条消息时，前一条消息的 SSE 连接被 abort (Network 面板旧请求显示 canceled)
- [ ] 组件卸载时 (`onUnmounted` 调用 `abortActiveConnection()`)，正在进行的 SSE 连接被取消
- [ ] 后端返回 401 时，触发 Toast "登录已过期" 提示，对话窗口保持不变
- [ ] `vue-tsc --noEmit` 无新增编译错误

---

## Task G3: chatStore.ts -- SSE 事件解析 + 流式渲染

### G3.1 涉及文件

| 文件 | 行范围 / 说明 | 操作 |
|------|--------------|------|
| `src/stores/chatStore.ts` | G2 基础上追加 ~70行 | 修改 (在 G2 readSSEStream 框架内实现) |
| `src/types/sse.ts` | 参考 SSE 类型定义 | 不修改 (仅引用) |
| `src/composables/useChatApi.ts` | 追加 signal 参数 (如 G1 未含) | 修改 (补充 signal 参数) |

### G3.2 当前代码状态 (G2 产出)

- `readSSEStream()` 已有 reader 循环 + TextDecoder + buffer 框架
- `parseSSEBuffer()` 为空函数 (返回 `{ events: [], remaining: buffer }`)
- `dispatchSSEEvent()` 为空函数体
- `sendMessage()` 已包含完整的 fetch + AbortController + 401 处理

### G3.3 SSE 协议解析 -- `parseSSEBuffer()`

#### G3.3.1 SSE 事件格式规范 (设计文档 3.3 节)

所有 SSE 端点严格使用 Dify 原始事件格式透传:

| event 类型 | data 字段结构 | 触发时机 |
|-----------|-------------|---------|
| `message` | `{"event":"message","answer":"文本片段","conversation_id":"xxx","message_id":"xxx","created_at":1719139200}` | AI 逐 token 生成时多次推送 |
| `message_end` | `{"event":"message_end","conversation_id":"xxx","message_id":"xxx","created_at":1719139200}` | AI 完整回复结束 |
| `error` | `{"event":"error","message":"错误描述","code":"错误码"}` | 流内逻辑错误 |
| `workflow_started` | `{"event":"workflow_started","workflow_run_id":"xxx"}` | 工作流开始 (静默忽略) |
| `workflow_finished` | `{"event":"workflow_finished","workflow_run_id":"xxx"}` | 工作流完成 (静默忽略) |
| `agent_message` | `{"event":"agent_message","answer":"...","conversation_id":"xxx"}` | Agent 中间消息 (静默忽略) |
| `agent_thought` | `{"event":"agent_thought","thought":"...","tool":"Text2SQL"}` | Agent ReAct 推理 (静默忽略) |

原始 SSE 文本流格式:
```
data: {"event":"message","answer":"您好","conversation_id":"abc123","message_id":"msg001","created_at":1719139200}

data: {"event":"message","answer":"，我是张医生。","conversation_id":"abc123","message_id":"msg001","created_at":1719139200}

data: {"event":"message_end","conversation_id":"abc123","message_id":"msg001","created_at":1719139200}

```

#### G3.3.2 解析算法

```typescript
  // ===== [G3] SSE 协议解析 =====

  /**
   * 按 \n\n 分隔解析 SSE 事件块。
   *
   * 设计依据: docs/2_detailed_design_v3.md 3.3 节 (第2373行):
   *   "前端在 fetch 的 ReadableStream 中按 \n\n 分隔事件块，
   *    每行去除 data: 前缀后 JSON.parse 解析"
   *
   * 算法:
   *   1. 按 \n\n 分割 buffer → 完整事件块数组 + 最后一个半截块
   *   2. 对每个完整事件块:
   *      a. 按 \n 分行
   *      b. 跳过非 "data: " 开头的行 (如 event: 行、空行)
   *      c. 去除 "data: " 前缀 (6个字符)
   *      d. JSON.parse 解析为 SSEEvent
   *      e. 解析失败则静默跳过 (console.warn)
   *   3. 返回 { events, remaining } — remaining 为未完成的半截块
   *
   * @param buffer - 当前累积的文本缓冲区
   * @returns 解析出的事件列表 + 剩余未完成文本
   */
  function parseSSEBuffer(buffer: string): {
    events: SSEEvent[]
    remaining: string
  } {
    const events: SSEEvent[] = []

    // 按 \n\n 分隔事件块 (SSE 协议标准分隔符)
    const parts = buffer.split('\n\n')
    // 最后一部分可能是不完整的半截块，留待后续 chunk 拼接
    const remaining = parts.pop() || ''

    for (const part of parts) {
      if (!part.trim()) continue

      // 按行处理每个事件块
      const lines = part.split('\n')
      let dataLine = ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          dataLine = line.slice(6)  // 去除 "data: " 前缀
        }
        // 忽略其他行 (event: 行、空行等)
      }

      if (!dataLine) continue

      try {
        const parsed = JSON.parse(dataLine) as SSEEvent
        events.push(parsed)
      } catch {
        // JSON 解析失败: 静默跳过损坏的事件块
        console.warn(
          '[chatStore] SSE 事件 JSON 解析失败:',
          dataLine.slice(0, 100)
        )
      }
    }

    return { events, remaining }
  }
```

#### G3.3.3 chunk 边界处理策略

```
场景: chunk 在 \n\n 中间切断

示例:
  chunk1 = 'data: {"event":"message","answer":"您'
  chunk2 = '好"}\n\n'

处理:
  迭代1: buffer = 'data: {"event":"message","answer":"您'
          parts = ['data: {"event":"message","answer":"您']  (无 \n\n)
          remaining = 'data: {"event":"message","answer":"您'
  迭代2: buffer = 'data: {"event":"message","answer":"您' + '好"}\n\n'
          parts = ['data: {"event":"message","answer":"您好"}', '']
          remaining = ''
          events = [{"event":"message","answer":"您好",...}]
```

```typescript
// TextDecoder 多字节字符边界保护
// decoder.decode(value, { stream: true })
//   stream: true 表示后续还有数据，解码器保留不完整的多字节字符
//   当 chunk 在多字节字符 (如中文 UTF-8 3字节) 中间切断时，
//   解码器会将不完整的字节保留在内部状态中，等待下一个 chunk 拼接后再输出
```

### G3.4 事件分发 -- `dispatchSSEEvent()`

```typescript
  /**
   * 根据 event 字段分发处理 SSE 事件。
   *
   * 设计依据: docs/2_detailed_design_v3.md
   *   - 3.3 节: SSE 事件格式表 (第2359-2367行)
   *   - 3.8.7 节: SSE 事件类型定义 (第2843-2893行)
   *   - 4.3 节: DoctorChatView.vue 流程图事件分发分支 (第3547-3553行)
   *
   * @param event - 解析后的 SSE 事件对象
   */
  function dispatchSSEEvent(event: SSEEvent): void {
    switch (event.event) {
      case 'message': {
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
            timestamp: (event.created_at || 0) * 1000,  // Unix秒 → 毫秒
          }
          conversations.value.push(assistantMsg)
        }
        break
      }

      case 'message_end': {
        // AI 完整回复结束
        // 保存 conversation_id
        if (event.conversation_id) {
          setDoctorConversation(currentDoctorId.value!, event.conversation_id)
        }
        // 更新最后一条 assistant 消息的元数据
        const lastMsg = conversations.value[conversations.value.length - 1]
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.id = event.message_id || lastMsg.id
          lastMsg.timestamp = (event.created_at || 0) * 1000
        }
        isStreaming.value = false
        break
      }

      case 'error': {
        // 流内逻辑错误 (工具调用失败等)
        const errorMsg: ChatMessage = {
          id: `error_${Date.now()}`,
          role: 'assistant',
          content: `[错误] ${event.message || '未知错误'}`,
          timestamp: Date.now(),
        }
        conversations.value.push(errorMsg)
        isStreaming.value = false
        break
      }

      // 以下事件类型静默忽略 (设计文档 3.3 节标注为可选/预扩展)
      case 'workflow_started':
      case 'workflow_finished':
      case 'agent_message':
      case 'agent_thought':
        // 不渲染，不报错 — 容错处理 (未知事件类型静默忽略)
        break

      default:
        // 未知事件类型静默忽略 (向前兼容)
        break
    }
  }
```

### G3.5 流式渲染机制

```
conversations: ref<ChatMessage[]>  (Vue 响应式)
     │
     │  dispatchSSEEvent('message')
     │    → lastMsg.content += event.answer   ← 响应式触发
     │    → 或 conversations.value.push(...)  ← 响应式触发
     │
     ▼
DoctorChatView.vue 模板:
  <div v-for="msg in chatStore.conversations" :key="msg.id">
    {{ msg.content }}   ← 自动更新 (Vue 细粒度响应式)
  </div>

isStreaming: ref<boolean>
  → DoctorChatView.vue 发送按钮: :disabled="chatStore.isStreaming"
  → "对方正在输入..." 动画: v-if="chatStore.isStreaming"
```

**性能考量**: 高频率 `message` 事件 (每个 token 一次) 触发 `lastMsg.content += text`——Vue 3 的响应式系统对字符串替换有优化 (diff 算法只更新变化的文本节点)，不会引起整个列表重新渲染。`v-for` 的 key 为 `msg.id`，确保已渲染气泡的 DOM 节点复用。

### G3.6 G1 修订 -- sendChatMessage 追加 signal 参数

若 G1 的 `sendChatMessage` 未包含 `signal` 参数，在 G3 中补充:

```typescript
// src/composables/useChatApi.ts — G3 修订
export async function sendChatMessage(params: {
  doctorId: number
  message: string
  token: string
  conversationId?: string
  signal?: AbortSignal     // G3 新增
}): Promise<Response> {
  // ... 函数体已包含 signal 传递 (见 G1.3.1 完整代码)
}
```

### G3.7 边界条件

| 场景 | 行为 |
|------|------|
| chunk 在 `\n\n` 中间切断 | `parseSSEBuffer` 将半截块保留在 `remaining`，拼接到下一 chunk 首部 |
| chunk 在多字节字符中间切断 | `TextDecoder.decode(value, { stream: true })` 保留不完整字节在解码器内部状态 |
| `data:` 行无空格 (如 `data:{"event":...}`) | `line.startsWith('data: ')` 为 false → 该行被忽略。**设计假设**: 后端 SSE 格式严格为 `data: ` (含空格) |
| JSON 解析失败 | `catch` 块 `console.warn` + 静默跳过，不中断流 (一个损坏的事件块不应导致整个对话崩溃) |
| `message` 事件缺少 `message_id` | 使用 `id: 'assistant_' + Date.now()` 生成临时 ID |
| `message` 事件缺少 `created_at` | `(event.created_at \|\| 0) * 1000` = 0 → `new Date(0)` = 1970-01-01 → `formatTime` 渲染异常。**G6 处理**: formatTime 遇到 0 或 NaN 返回空字符串 |
| `error` 事件缺少 `message` | `event.message \|\| '未知错误'` 兜底 |
| 连续收到两个 `message_end` (异常) | 第二次 `message_end` 时 `isStreaming` 已为 false，`setDoctorConversation` 幂等覆盖 |
| 流式过程中用户切换页面 | reader.read() 抛 AbortError → catch 静默 → finally 中 `reader.releaseLock()` → `isStreaming = false` |

### G3.8 验收标准

- [ ] 发送消息后，AI 回复逐字流式出现在消息列表中 (非一次性显示)
- [ ] `message_end` 事件后，`conversation_id` 被保存 (可在 DevTools Pinia 检查 chatStore 状态)
- [ ] `error` 事件时，消息列表中出现错误气泡 (`[错误] xxx`)，包含错误描述文本
- [ ] 手动断开网络，消息列表中已接收的文本保留不丢失
- [ ] `vue-tsc --noEmit` 无新增编译错误

---

## Task G4: chatStore.ts -- conversation_id 管理 + 断线重连 + 多医生路由

### G4.1 涉及文件

| 文件 | 行范围 / 说明 | 操作 |
|------|--------------|------|
| `src/stores/chatStore.ts` | G3 基础上追加 ~70行 | 修改 (续写 conversation_id + 重连 + 多医生) |

### G4.2 当前代码状态 (G3 产出)

- `sendMessage()` 完整实现 (fetch + AbortController + 401 + reader)
- `readSSEStream()` + `parseSSEBuffer()` + `dispatchSSEEvent()` 完整实现
- `conversations` / `isStreaming` / `activeAbortController` / `fabOpen` 状态就绪
- `conversation_id` 管理 (`doctorConversations` / `getDoctorConversation` / `setDoctorConversation`) 未实现
- `sendMessageWithRetry` (重连) 未实现
- `switchDoctor` (多医生路由) 未实现

### G4.3 conversation_id 管理 (按 doctorId 区分)

#### G4.3.1 双层存储策略

```
┌─────────────────────────────────┐
│  内存层: doctorConversations     │
│  ref<Map<number, string>>       │
│  优先读取，毫秒级访问             │
└────────────┬────────────────────┘
             │ 初始化时从 localStorage 恢复
             │ 写入时同步到 localStorage
             ▼
┌─────────────────────────────────┐
│  localStorage 持久化层           │
│  qrzl_conv_{doctorId}           │
│  跨页面刷新恢复                  │
└─────────────────────────────────┘
```

#### G4.3.2 实现代码

```typescript
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
```

### G4.4 断线重连 (简化版：固定间隔3次)

#### G4.4.1 重连配置

```typescript
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
    maxRetries: 3,           // 最大重试次数 (简化版)
    delays: [2000, 4000, 8000], // 固定延迟 (ms)
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
    }
    conversations.value.push(failMsg)
    isStreaming.value = false
  }
```

#### G4.4.2 重连时序图

```
sendMessageWithRetry(doctorId, text, token)
  │
  ├── attempt 0: sendMessage() → fetch 失败 (NetworkError)
  │     catch: 非 AbortError → lastError = err
  │     delay: 2000ms
  │
  ├── attempt 1: sendMessage() → 重试
  │     → getDoctorConversation(doctorId) 仍返回旧 conversation_id
  │     → sendChatMessage({ conversationId: 'abc123' })
  │     → fetch 恢复 → SSE 流继续 (后端恢复对话上下文)
  │     → return (成功)
  │
  └── 若 attempt 3 仍失败:
        → conversations.push(failMsg)
        → isStreaming = false
```

### G4.5 多医生会话路由 (简化版: 单医生)

#### G4.5.1 switchDoctor 实现

```typescript
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
```

### G4.6 完整 clearAllConversations (登出清理)

```typescript
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
```

### G4.7 Store 完整 exports (G1-G4 累计)

```typescript
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

    // actions — SSE 连接控制
    registerAbortController,
    abortActiveConnection,

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
  }
})
```

### G4.8 边界条件

| 场景 | 行为 |
|------|------|
| `localStorage.setItem` QuotaExceededError | `try-catch` 静默丢弃；内存 Map 已保存，当前会话不受影响；刷新后丢失 (降级为首次对话) |
| `localStorage.getItem` 返回 null | `getDoctorConversation` 返回 null → sendMessage 不传 conversation_id → 后端创建新会话 |
| 重连 3 次全部失败 | 消息列表追加 `[连接失败]` 气泡；`isStreaming = false`；用户可手动重新发送 |
| 重连过程中用户点击 abort | `controller.abort()` → reader.read() 抛 AbortError → sendMessage 中 catch → throw → sendMessageWithRetry 中 catch (AbortError) → throw 向上 → DoctorChatView 不展示错误 |
| `switchDoctor` 调用时无活跃连接 | `abortActiveConnection()` 中 `activeAbortController.value` 为 null → 跳过 abort → 安全 |
| `currentDoctorId` 为 null 时 `message_end` 触发 | `setDoctorConversation(currentDoctorId.value!, ...)` 非空断言——`message_end` 仅在 sendMessage 过程中触发，此时 `currentDoctorId` 必然已设置 |
| 多个浏览器标签页操作同一医生 | 各标签页独立 chatStore 实例；conversation_id 分别保存到同一 localStorage 键 (后者覆盖前者)；**已知限制**: 多标签页不共享 conversation_id 状态 |

### G4.9 验收标准

- [ ] 发送首次对话 → 收到 `message_end` → localStorage 中出现 `qrzl_conv_{doctorId}` 键
- [ ] 刷新页面后再次发送消息 → 请求体包含上次保存的 `conversation_id`
- [ ] 手动断开网络 (DevTools Network Offline) → 发送消息 → 页面展示重连提示 (console.warn) → 恢复网络后自动重连成功
- [ ] 重试 3 次全部失败 → 消息列表出现 "[连接失败]" 提示
- [ ] `clearAllConversations()` 调用后，localStorage 中所有 `qrzl_conv_*` 键被清除
- [ ] `vue-tsc --noEmit` 无新增编译错误

---

## Task G5: Consultation.vue 重写 -- 医生列表入口页

### G5.1 涉及文件

| 文件 | 行范围 / 说明 | 操作 |
|------|--------------|------|
| `src/views/Consultation.vue` | 完整重写 (从6行占位) | 重写 ~120行 |

### G5.2 当前代码状态

`src/views/Consultation.vue` 为 6 行占位页面:
```html
<template>
  <p>医师咨询 -- 待组员开发</p>
</template>
```
无 `<script setup>`、无 `v-for`、无 API 调用。

### G5.3 组件状态机

```
                    ┌──────────────┐
                    │   加载态      │ ← onMounted → fetchDoctors() → API 请求中
                    │ (loading)    │   展示骨架屏 (3-4 灰色占位卡片 + 脉冲动画)
                    └──────┬───────┘
                           │
                 ┌─────────┴─────────┐
                 │                   │
            API 成功              API 失败
                 │                   │
         ┌───────┴───────┐    ┌──────┴───────┐
         │               │    │   错误态      │
    数据非空          数据为空  │ (error)      │
         │               │    │ 错误消息      │
         ▼               ▼    │ + 重试按钮    │
  ┌──────────────┐ ┌──────────┐└──────────────┘
  │   正常渲染    │ │  空态     │
  │ 医生卡片列表  │ │ 暂无在线   │
  │ (v-for)      │ │ 医生      │
  └──────────────┘ └──────────┘
```

### G5.4 完整代码结构

```vue
<!-- src/views/Consultation.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getDoctors } from '@/composables/useHomeApi'
import type { Doctor } from '@/types/api'

const router = useRouter()
const doctors = ref<Doctor[]>([])
const loading = ref(true)
const error = ref('')

async function fetchDoctors() {
  loading.value = true
  error.value = ''
  try {
    doctors.value = await getDoctors()
  } catch (err: unknown) {
    error.value =
      (err as { message?: string }).message || '获取医生列表失败，请检查网络后重试'
  } finally {
    loading.value = false
  }
}

function goToChat(doctorId: number) {
  router.push(`/consultation/doctor/${doctorId}`)
}

onMounted(() => {
  fetchDoctors()
})
</script>

<template>
  <div class="consultation-list-container">
    <!-- 顶部导航栏 -->
    <header class="top-bar">
      <h1>医师咨询</h1>
    </header>

    <!-- 加载态 -->
    <div v-if="loading" class="loading-state">
      <div class="skeleton-card" v-for="n in 3" :key="n">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-lines">
          <div class="skeleton-line skeleton-name"></div>
          <div class="skeleton-line skeleton-dept"></div>
          <div class="skeleton-line skeleton-desc"></div>
        </div>
      </div>
    </div>

    <!-- 错误态 -->
    <div v-else-if="error" class="error-state">
      <i class="fas fa-exclamation-circle error-icon"></i>
      <p>{{ error }}</p>
      <button @click="fetchDoctors" class="btn-retry">重试</button>
    </div>

    <!-- 空态 -->
    <div v-else-if="doctors.length === 0" class="empty-state">
      <i class="fas fa-user-md empty-icon"></i>
      <p>暂无在线医生</p>
    </div>

    <!-- 医生列表 -->
    <div v-else id="doctor-list">
      <div
        v-for="doctor in doctors"
        :key="doctor.id"
        class="doctor-card-detail"
        @click="goToChat(doctor.id)"
      >
        <img
          class="doctor-avatar-large"
          :src="doctor.avatar || '/default-avatar.png'"
          :alt="doctor.name"
        />
        <div class="doctor-info">
          <h2>
            {{ doctor.name }}
            <span
              v-if="(doctor as any).is_online !== false"
              class="online-badge"
            >在线</span>
          </h2>
          <p class="department">{{ (doctor as any).department }}</p>
          <p class="title">{{ (doctor as any).title }}</p>
          <p class="description">{{ (doctor as any).description }}</p>
        </div>
        <button class="btn-chat">开始咨询</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ===== 页面容器 ===== */
.consultation-list-container {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--color-bg);
  padding-bottom: calc(var(--tab-bar-height) + 8px);
}

/* ===== 顶部导航栏 ===== */
.top-bar {
  position: sticky;
  top: 0;
  z-index: 30;
  background: var(--color-card);
  border-bottom: 1px solid var(--color-divider);
  padding: var(--spacing-lg) var(--spacing-xl);
}
.top-bar h1 {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--color-text-primary);
}

/* ===== 医生卡片 ===== */
#doctor-list {
  padding: var(--spacing-md) var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}
.doctor-card-detail {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  background: var(--color-card);
  border-radius: var(--radius-md);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  cursor: pointer;
  transition: box-shadow 0.2s;
}
.doctor-card-detail:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
}
.doctor-avatar-large {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  object-fit: cover;
  flex-shrink: 0;
}
.doctor-info {
  flex: 1;
  min-width: 0;
}
.doctor-info h2 {
  font-size: var(--font-size-h4);
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.online-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  background: #52c41a;
  color: #fff;
  font-weight: 500;
}
.department {
  font-size: var(--font-size-caption);
  color: var(--color-primary);
  margin-bottom: 2px;
}
.title {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}
.description {
  font-size: 12px;
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.btn-chat {
  flex-shrink: 0;
  padding: 8px 16px;
  border-radius: var(--radius-button);
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-size-caption);
  font-weight: 700;
  border: none;
  cursor: pointer;
  white-space: nowrap;
}
.btn-chat:active {
  transform: scale(0.96);
}

/* ===== 加载骨架屏 ===== */
.loading-state {
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}
.skeleton-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  background: var(--color-card);
  border-radius: var(--radius-md);
}
.skeleton-avatar {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  background: var(--color-divider);
  animation: pulse 1.5s ease-in-out infinite;
}
.skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.skeleton-line {
  height: 14px;
  border-radius: var(--radius-sm);
  background: var(--color-divider);
  animation: pulse 1.5s ease-in-out infinite;
}
.skeleton-name { width: 40%; }
.skeleton-dept { width: 25%; }
.skeleton-desc { width: 60%; }
@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}

/* ===== 错误态 ===== */
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-3xl) var(--spacing-xl);
  text-align: center;
  color: var(--color-text-secondary);
}
.error-icon {
  font-size: 48px;
  color: var(--color-divider);
  margin-bottom: var(--spacing-lg);
}
.btn-retry {
  margin-top: var(--spacing-lg);
  padding: 10px 24px;
  border-radius: var(--radius-button);
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-size-body);
  font-weight: 700;
  border: none;
  cursor: pointer;
}

/* ===== 空态 ===== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-3xl) var(--spacing-xl);
  color: var(--color-text-secondary);
}
.empty-icon {
  font-size: 48px;
  color: var(--color-divider);
  margin-bottom: var(--spacing-lg);
}
</style>
```

### G5.5 组件设计决策

#### 5.5.1 `is_online` 字段兼容处理

```typescript
// 模板中使用双阴性保护:
v-if="(doctor as any).is_online !== false"
```

**设计理由**: 当前后端 `Doctor` 接口不含 `is_online` 字段。此写法实现三层兼容:
1. 字段不存在 (`undefined`) → `undefined !== false` = `true` → 不显示在线标识 (符合预期: 无数据不误显示)
2. 字段为 `true` → 显示绿色 "在线" 徽章
3. 字段为 `false` → 隐藏

使用 `(doctor as any)` 类型断言绕过 TypeScript 对 `Doctor` 接口的类型检查。后端 `is_online` 字段就绪后，替换 `Doctor` 为 `DoctorDetail` 并移除 `as any`。

#### 5.5.2 getDoctors() 分页行为

`getDoctors()` 不传 `page`/`pageSize` 参数。后端默认分页行为需在 G5 执行前确认 (curl 验证)。若后端仅返回首页数据 (如 pageSize=20)，而医生总数超过 20，页面仅展示首页医生。

**v3 简化方案**: 不实现无限滚动或"加载更多"。产品若需展示全部医生，调整后端默认 pageSize 或前端传 `pageSize: 100`。

### G5.6 数据流

```
用户访问 /consultation
  → onMounted() → fetchDoctors()
    → loading = true
    → getDoctors() → GET /api/doctors (axios + 拦截器)
      → 成功: doctors.value = data → loading = false → 模板渲染卡片列表
      → 失败: error.value = message → loading = false → 错误态 + 重试按钮

用户点击 "开始咨询" 按钮
  → goToChat(doctor.id)
    → router.push(`/consultation/doctor/${doctor.id}`)
    → Vue Router 匹配 /consultation/doctor/:id (G7 注册)
    → DoctorChatView.vue 加载
```

### G5.7 边界条件

| 场景 | 行为 |
|------|------|
| API 返回空数组 (无医生) | `doctors.length === 0` → 空态 "暂无在线医生" |
| API 网络错误 | `error` 显示错误消息 + "重试" 按钮 |
| API 返回分页数据 (仅首页) | 卡片列表仅展示首页医生 (v3 不实现分页加载更多) |
| 医生字段缺失 (如无 `description`) | `(doctor as any).description` 为 `undefined` → `<p>` 渲染空内容 (不报错) |
| 点击卡片跳转前路由未注册 (G7 未完成) | router.push 触发 Vue Router 404 兜底 — **G5 阶段可验证 router.push 调用，完整跳转验证延迟至 G7** |
| 未登录用户访问 `/consultation` | 路由 meta `requiresAuth: false` (现有配置) → 允许访问；点击 "开始咨询" 跳转 `/consultation/doctor/:id` → 目标路由 `requiresAuth: true` 拦截 (G7 注册) |

### G5.8 验收标准

- [ ] 访问 `/consultation` 页面，展示加载态 (骨架屏 3 个占位卡片)
- [ ] 加载完成后展示医生列表卡片 (含头像、姓名、职称、科室、简介)
- [ ] 若后端返回 `is_online` 字段，在线医生展示绿色 "在线" 标识
- [ ] 点击医生卡片的 "开始咨询" 按钮，路由跳转至 `/consultation/doctor/{id}` (G7 注册路由后生效)
- [ ] API 调用失败时展示错误消息 + 重试按钮，点击重试可重新加载
- [ ] 医生列表为空时展示 "暂无在线医生" 占位
- [ ] `vue-tsc --noEmit` 无新增编译错误

---

## Task G6: DoctorChatView.vue 创建 -- 医生对话界面

### G6.1 涉及文件

| 文件 | 行范围 / 说明 | 操作 |
|------|--------------|------|
| `src/views/DoctorChatView.vue` | 完整新建 | 新建 ~200行 |

### G6.2 当前代码状态

`src/views/DoctorChatView.vue` 不存在。

### G6.3 组件状态机

```
                ┌──────────────────────┐
                │      加载态           │ ← loadDoctor() → API 请求中
                │ (loading)            │   Spinner / 骨架屏
                └──────────┬───────────┘
                           │
                 ┌─────────┴─────────┐
                 │                   │
            API 成功              API 失败
                 │                   │
                 ▼                   ▼
          ┌──────────────┐    ┌──────────────┐
          │   对话态       │    │   错误态      │
          │ (chat)        │    │ (doctorError) │
          │              │    │ 医生不存在     │
          │ ┌──────────┐ │    │ + 返回按钮    │
          │ │ 空闲模式  │ │    └──────────────┘
          │ │ (idle)   │ │
          │ └────┬─────┘ │
          │      │发送消息 │
          │      ▼       │
          │ ┌──────────┐ │
          │ │ 流式接收  │ │ ← isStreaming = true
          │ │(streaming)│ │   发送按钮 disabled
          │ └────┬─────┘ │   "对方正在输入..." 动画
          │      │完成/错误│
          │      ▼       │
          │ ┌──────────┐ │
          │ │ 空闲模式  │ │ ← isStreaming = false
          │ │ (idle)   │ │   发送按钮恢复
          │ └──────────┘ │
          └──────────────┘
```

### G6.4 完整代码结构

```vue
<!-- src/views/DoctorChatView.vue -->
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chatStore'
import { useAuthStore } from '@/stores/authStore'
import { getDoctorInfo } from '@/composables/useChatApi'
import type { Doctor } from '@/types/api'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()
const authStore = useAuthStore()

// ===== 本地状态 =====
const doctor = ref<Doctor | null>(null)
const loading = ref(true)
const doctorError = ref('')
const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

// ===== 计算属性 =====
const userAvatar = computed(() => {
  return (authStore.user as any)?.avatar || '/default-avatar.png'
})

// ===== 加载医生信息 =====
async function loadDoctor() {
  const id = Number(route.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    doctorError.value = '医生ID无效'
    loading.value = false
    return
  }

  loading.value = true
  doctorError.value = ''
  try {
    doctor.value = await getDoctorInfo(id)
    // 切换到该医生的对话上下文
    chatStore.switchDoctor(id)
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 404) {
      doctorError.value = '该医生不存在'
    } else {
      doctorError.value =
        (err as { message?: string }).message || '获取医生信息失败'
    }
  } finally {
    loading.value = false
  }
}

// ===== 发送消息 =====
async function handleSend() {
  const text = inputText.value.trim()
  if (!text || chatStore.isStreaming) return

  inputText.value = ''
  const token = authStore.token
  if (!token) {
    // Token 不存在 — 引导登录
    const Swal = await import('sweetalert2')
    Swal.default.fire({
      toast: true,
      position: 'top',
      icon: 'warning',
      title: '请先登录',
      showConfirmButton: false,
      timer: 2000,
    })
    return
  }

  await chatStore.sendMessageWithRetry(
    Number(route.params.id),
    text,
    token,
  )
  await scrollToBottom()
}

// ===== 导航 =====
function goBack() {
  chatStore.abortActiveConnection()
  router.push('/consultation')
}

// ===== 清空对话 =====
function clearChat() {
  const id = Number(route.params.id)
  chatStore.clearDoctorConversation(id)
  chatStore.conversations.length = 0
}

// ===== 自动滚动到底部 =====
async function scrollToBottom() {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// ===== 消息内容渲染 (Markdown → 安全 HTML) =====
function renderContent(content: string): string {
  if (!content) return ''
  try {
    const html = marked.parse(content, { async: false })
    if (typeof html !== 'string') return ''
    return DOMPurify.sanitize(html)
  } catch {
    // marked 解析失败，返回原始文本 (DOMPurify 转义)
    return DOMPurify.sanitize(content)
  }
}

// ===== 时间格式化 (Unix ms → HH:MM) =====
function formatTime(timestamp: number): string {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ===== 路由参数变化监听 (医生A → 医生B 同组件复用) =====
watch(
  () => route.params.id,
  (newId, oldId) => {
    if (newId !== oldId && oldId !== undefined) {
      chatStore.abortActiveConnection()
      chatStore.conversations.length = 0
      loadDoctor()
    }
  },
)

onMounted(() => {
  loadDoctor()
})

onUnmounted(() => {
  chatStore.abortActiveConnection()
})
</script>

<template>
  <div class="doctor-chat-container">
    <!-- 顶部固定: 医生信息头部 -->
    <header class="chat-header">
      <button class="btn-back" @click="goBack" aria-label="返回医生列表">
        <i class="fas fa-arrow-left"></i>
      </button>
      <div class="doctor-info-bar">
        <img
          class="avatar-small"
          :src="doctor?.avatar || '/default-avatar.png'"
          :alt="doctor?.name"
        />
        <div>
          <h2>{{ doctor?.name || '加载中...' }}</h2>
          <p>{{ (doctor as any)?.department }} · {{ (doctor as any)?.title }}</p>
        </div>
      </div>
      <button
        class="btn-delete"
        @click="clearChat"
        title="清空对话"
        aria-label="清空对话"
      >
        <i class="fas fa-trash"></i>
      </button>
    </header>

    <!-- 免责声明条 (对话全程可见) -->
    <div class="disclaimer-bar">
      <p>本对话由AI虚拟医师提供，回复内容仅供参考</p>
    </div>

    <!-- 消息列表 (可滚动) -->
    <div
      id="chat-messages"
      ref="messagesContainer"
    >
      <!-- 加载态 -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>加载对话中...</p>
      </div>

      <!-- 错误态 (医生不存在) -->
      <div v-else-if="doctorError" class="error-state">
        <i class="fas fa-exclamation-circle error-icon"></i>
        <p>{{ doctorError }}</p>
        <button @click="goBack" class="btn-retry">返回医生列表</button>
      </div>

      <!-- 消息列表 -->
      <template v-else>
        <div
          v-for="msg in chatStore.conversations"
          :key="msg.id"
          :class="[
            'message-bubble',
            msg.role === 'user' ? 'sent' : 'received',
          ]"
        >
          <img
            class="msg-avatar"
            :src="
              msg.role === 'user'
                ? userAvatar
                : (doctor?.avatar || '/default-avatar.png')
            "
            :alt="msg.role === 'user' ? '我' : doctor?.name"
          />
          <span class="msg-name">
            {{ msg.role === 'user' ? '我' : doctor?.name }}
          </span>
          <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
          <div
            class="msg-content"
            v-html="renderContent(msg.content)"
          ></div>
        </div>
      </template>

      <!-- 对方正在输入... -->
      <div v-if="chatStore.isStreaming" class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>

    <!-- 底部固定: 输入框 -->
    <div class="chat-input">
      <input
        type="text"
        id="msgInput"
        v-model="inputText"
        placeholder="输入您的问题..."
        @keyup.enter="handleSend"
        :disabled="chatStore.isStreaming"
      />
      <button
        id="sendBtn"
        @click="handleSend"
        :disabled="!inputText.trim() || chatStore.isStreaming"
        :class="{ visible: inputText.trim() && !chatStore.isStreaming }"
      >
        <i class="fas fa-paper-plane"></i>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ===== 页面容器 (全屏布局) ===== */
.doctor-chat-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 768px;
  margin: 0 auto;
  background: var(--color-bg);
}

/* ===== Header 顶栏 ===== */
.chat-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--color-card);
  border-bottom: 1px solid var(--color-divider);
  flex-shrink: 0;
}
.btn-back,
.btn-delete {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
  border-radius: var(--radius-full);
  cursor: pointer;
  flex-shrink: 0;
}
.doctor-info-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex: 1;
  min-width: 0;
}
.avatar-small {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  object-fit: cover;
  flex-shrink: 0;
}
.doctor-info-bar h2 {
  font-size: var(--font-size-body);
  font-weight: 700;
  color: var(--color-text-primary);
}
.doctor-info-bar p {
  font-size: 11px;
  color: var(--color-text-secondary);
}

/* ===== 免责声明条 ===== */
.disclaimer-bar {
  padding: 6px var(--spacing-lg);
  background: rgba(250, 173, 20, 0.1);
  border-bottom: 1px solid rgba(250, 173, 20, 0.2);
  flex-shrink: 0;
}
.disclaimer-bar p {
  font-size: 11px;
  color: #ad8b00;
  text-align: center;
  margin: 0;
}

/* ===== 消息列表 ===== */
#chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md) var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  -webkit-overflow-scrolling: touch;
}

/* ===== 消息气泡 ===== */
.message-bubble {
  display: grid;
  grid-template-columns: 32px 1fr;
  grid-template-rows: auto auto;
  gap: 2px 8px;
  max-width: 80%;
  animation: msg-enter 0.2s ease-out;
}
@keyframes msg-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.message-bubble.sent {
  align-self: flex-end;
  direction: rtl;
}
.message-bubble.sent .msg-content {
  background: var(--color-primary);
  color: #fff;
  border-radius: var(--radius-md) 4px var(--radius-md) var(--radius-md);
  direction: ltr;
}
.message-bubble.received {
  align-self: flex-start;
}
.message-bubble.received .msg-content {
  background: var(--color-card);
  color: var(--color-text-primary);
  border-radius: 4px var(--radius-md) var(--radius-md) var(--radius-md);
}
.msg-avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  object-fit: cover;
  grid-row: 1 / 3;
}
.msg-name {
  font-size: 11px;
  color: var(--color-text-secondary);
  grid-column: 2;
}
.msg-time {
  font-size: 10px;
  color: var(--color-text-tertiary);
  justify-self: end;
}
.message-bubble.sent .msg-name {
  text-align: right;
}
.msg-content {
  padding: 8px 12px;
  font-size: var(--font-size-body);
  line-height: 1.5;
  word-break: break-word;
  grid-column: 2;
}

/* ===== 对方正在输入... ===== */
.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  align-self: flex-start;
}
.typing-indicator span {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-text-tertiary);
  animation: typing-bounce 1.4s ease-in-out infinite;
}
.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
@keyframes typing-bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-6px); }
}

/* ===== 底部输入区 ===== */
.chat-input {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--color-card);
  border-top: 1px solid var(--color-divider);
  flex-shrink: 0;
}
.chat-input input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-full);
  font-size: var(--font-size-body);
  outline: none;
  background: var(--color-bg);
  color: var(--color-text-primary);
}
.chat-input input:focus {
  border-color: var(--color-primary);
}
#sendBtn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-full);
  font-size: 16px;
  cursor: pointer;
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 0.2s, transform 0.2s;
  flex-shrink: 0;
}
#sendBtn.visible {
  opacity: 1;
  transform: scale(1);
}
#sendBtn:disabled {
  background: var(--color-divider);
  cursor: not-allowed;
}

/* ===== 加载态 ===== */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-3xl);
  color: var(--color-text-secondary);
  gap: var(--spacing-md);
}
.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-divider);
  border-top-color: var(--color-primary);
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ===== 错误态 ===== */
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-3xl);
  text-align: center;
  color: var(--color-text-secondary);
  gap: var(--spacing-md);
}
.error-icon {
  font-size: 48px;
  color: var(--color-divider);
}
.btn-retry {
  padding: 10px 24px;
  border-radius: var(--radius-button);
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-size-body);
  font-weight: 700;
  border: none;
  cursor: pointer;
}
</style>
```

### G6.5 模板渲染与 chatStore 集成点

| 模板区域 | chatStore 数据源 | 渲染方式 |
|---------|-----------------|---------|
| 消息列表 | `chatStore.conversations` | `v-for="msg in chatStore.conversations"` — Vue 响应式自动追踪 |
| 用户气泡 (右侧) | `msg.role === 'user'` | CSS class `sent` (右对齐, 蓝色背景) |
| AI 气泡 (左侧) | `msg.role === 'assistant'` | CSS class `received` (左对齐, 白色背景) |
| "对方正在输入..." | `chatStore.isStreaming` | `v-if="chatStore.isStreaming"` 三个跳动圆点 |
| 发送按钮 disabled | `chatStore.isStreaming` | `:disabled="!inputText.trim() \|\| chatStore.isStreaming"` |

### G6.6 依赖 chatStore 接口契约

| 使用的 chatStore 属性/方法 | 类型 | 使用位置 |
|---|---|---|
| `chatStore.conversations` | `ref<ChatMessage[]>` | 模板 v-for |
| `chatStore.isStreaming` | `ref<boolean>` | 发送按钮 disabled + 输入动画 |
| `chatStore.sendMessageWithRetry()` | `(number, string, string) => Promise<void>` | `handleSend()` |
| `chatStore.abortActiveConnection()` | `() => void` | `goBack()` + `onUnmounted()` + `watch()` |
| `chatStore.clearDoctorConversation()` | `(number) => void` | `clearChat()` |
| `chatStore.switchDoctor()` | `(number) => void` | `loadDoctor()` |

### G6.7 边界条件

| 场景 | 行为 |
|------|------|
| 医生 ID 无效 (NaN / <= 0) | `doctorError` = "医生ID无效" → 错误态 |
| 后端返回 404 (医生不存在) | `doctorError` = "该医生不存在" → 错误态 + "返回医生列表" 按钮 |
| `authStore.token` 为空 (未登录) | `handleSend()` 展示 Toast "请先登录"，不发送消息 |
| `chatStore.isStreaming === true` 时用户点击发送 | 发送按钮 disabled + `handleSend()` 第一行 `if (chatStore.isStreaming) return` 双重保护 |
| 输入框为空时按 Enter | `handleSend()` 第一行 `if (!text) return` |
| 路由参数变化 (`/consultation/doctor/1` → `/consultation/doctor/2`) | `watch(route.params.id)` 触发 → `abortActiveConnection()` → `conversations.length = 0` → `loadDoctor()` |
| 组件卸载 | `onUnmounted` → `abortActiveConnection()` |
| SSE 连接中断 (非 abort) | `sendMessageWithRetry` (G4) 自动重连 3 次；全部失败展示 "[连接失败]" |
| 消息内容含 Markdown | `marked.parse()` 转 HTML → `DOMPurify.sanitize()` 防 XSS |
| 消息内容含恶意脚本 (`<script>alert(1)</script>`) | `DOMPurify.sanitize()` 移除 `<script>` 标签 |
| `marked.parse()` 抛异常 | `catch` 块 fallback 为 `DOMPurify.sanitize(content)` (纯文本转义) |
| `created_at` 为 0 或 undefined | `formatTime(0)` → `new Date(0)` → `isNaN` → 返回 '' (不渲染时间) |

### G6.8 验收标准

- [ ] 从 Consultation 页点击医生卡片 → 进入 DoctorChatView → 顶部展示医生头像、姓名、科室、职称
- [ ] 输入消息并发送 → 用户消息出现在右侧 → AI 回复逐字流式出现在左侧
- [ ] AI 回复中发送按钮 disabled (`isStreaming`)，回复完成后可再次发送
- [ ] 点击返回按钮 → SSE 连接中止 → 路由跳转回 `/consultation`
- [ ] 访问不存在的医生 ID (如 `/consultation/doctor/99999`) → 展示 "该医生不存在" 提示
- [ ] `vue-tsc --noEmit` 无新增编译错误

---

## Task G7: 路由注册 + 端到端集成验证

### G7.1 涉及文件

| 文件 | 行范围 / 说明 | 操作 |
|------|--------------|------|
| `src/router/index.ts` | 在 `/consultation` 路由之后、`/life-plan` 之前 | 修改 (新增 1 条路由) ~8行 |

### G7.2 当前代码状态

`src/router/index.ts` routes 数组中无 `/consultation/doctor/:id` 路由。现有 `/consultation` 路由 meta 为 `requiresAuth: false`。

### G7.3 路由注册

```typescript
// src/router/index.ts — 在 routes 数组中，/consultation 路由之后追加:

  {
    path: '/consultation/doctor/:id',
    name: 'DoctorChat',
    component: () => import('@/views/DoctorChatView.vue'),
    meta: {
      requiresAuth: true,
      requiresDisclaimer: true,
    },
  },
```

**路由插入位置要求**: 必须在 `/consultation` 路由之后、`/life-plan` 路由之前注册，避免 `/consultation/doctor/:id` 被 `/consultation` 的模糊匹配拦截。

**路由元信息行为**:
- `requiresAuth: true` — 未登录用户重定向至 `/login` (现有守卫逻辑)
- `requiresDisclaimer: true` — 首次进入触发免责声明 SweetAlert2 弹窗，同意后记录 `disclaimer_accepted=true` (现有守卫逻辑)

### G7.4 路由守卫交互说明

```
用户访问 /consultation/doctor/1
  ↓
全局前置守卫 (beforeEach)
  ├── 步骤1: 检查 meta.requiresAuth
  │   └── true 且无 token → redirect '/login?redirect=/consultation/doctor/1'
  │   └── true 且有 token → 继续
  ├── 步骤2: 检查 meta.requiresDisclaimer
  │   └── true 且 localStorage['disclaimer_accepted'] !== 'true'
  │       → await showDisclaimer()
  │       → 用户同意 → localStorage['disclaimer_accepted'] = 'true' → 继续
  │       → 用户拒绝 → 停在当前页 (不进入 DoctorChatView)
  └── 通过 → 加载 DoctorChatView.vue
```

### G7.5 端到端集成测试路径

#### G7.5.1 完整用户路径 (AC-1)

```
1. 用户访问 /consultation
   → Consultation.vue onMounted
   → getDoctors() → API 返回医生列表
   → 模板渲染医生卡片 (v-for)

2. 用户点击第1位医生的 "开始咨询" 按钮
   → goToChat(1) → router.push('/consultation/doctor/1')
   → 路由守卫: requiresAuth (已登录) → requiresDisclaimer (已同意) → 通过
   → DoctorChatView.vue 懒加载
   → onMounted → loadDoctor()
   → getDoctorInfo(1) → API 返回医生详情
   → chatStore.switchDoctor(1)

3. 用户在输入框输入 "你好，我最近血糖有点高"
   → 按 Enter → handleSend()
   → chatStore.sendMessageWithRetry(1, text, token)
     → sendMessage → conversations.push(userMessage)
     → sendChatMessage({ doctorId: 1, message, token })
     → fetch POST /api/chat/doctor/1 → status 200
     → reader = response.body.getReader()
     → readSSEStream(reader)
       → parseSSEBuffer → dispatchSSEEvent('message') × N
       → conversations[last].content += answer → v-for 自动更新
       → dispatchSSEEvent('message_end')
       → isStreaming = false

4. AI 回复完成，用户可再次发送消息
```

#### G7.5.2 断网重连 (AC-2)

```
1. 在 DoctorChatView 中，AI 回复完成后
2. DevTools Network → Offline
3. 用户输入并发送消息 → sendMessageWithRetry
   → attempt 0: sendMessage → fetch 失败 (NetworkError)
   → catch: 非 AbortError → delay 2000ms
   → attempt 1: sendMessage → 仍失败 → delay 4000ms
   → 切换 Network → Online
   → attempt 2 (8000ms 后): sendMessage → fetch 成功 → SSE 流恢复
```

#### G7.5.3 组件卸载清理 (AC-4)

```
1. 在 DoctorChatView 中 AI 正在流式回复 (isStreaming = true)
2. 用户点击返回按钮 → goBack()
   → chatStore.abortActiveConnection() → activeAbortController.abort()
   → router.push('/consultation')
3. DoctorChatView.vue 组件卸载 → onUnmounted
   → chatStore.abortActiveConnection() (幂等安全，重复调用无副作用)
4. DevTools Network: POST /api/chat/doctor/1 状态为 canceled
```

### G7.6 编译验证

```bash
# TypeScript 类型检查
npx vue-tsc --noEmit

# Vite 构建验证
npx vite build
```

**特别检查点**:
- `useChatApi.ts` 的 `sendChatMessage` 类型与 `chatStore.ts` 调用处一致
- `DoctorChatView.vue` 模板中使用的 chatStore 属性/方法均在 chatStore return 块中暴露
- `Consultation.vue` 和 `DoctorChatView.vue` 的 import 路径正确
- 路由 lazy import 路径 `@/views/DoctorChatView.vue` 与文件名完全匹配 (大小写敏感)

### G7.7 边界条件

| 场景 | 行为 |
|------|------|
| 未登录用户直接访问 `/consultation/doctor/1` | 路由守卫 `requiresAuth: true` → 重定向 `/login?redirect=/consultation/doctor/1` |
| 已登录但未接受免责声明 → 首次访问 | 路由守卫 `requiresDisclaimer: true` → 弹窗 → 同意后进入 |
| `/consultation/doctor/:id` 路由在 `/consultation` 之后注册 | 确保 `/consultation/doctor/1` 优先匹配精确路由而非 `/consultation` |
| `route.params.id` 为 string | DoctorChatView 中使用 `Number(route.params.id)` 转换为数字 |

### G7.8 验收标准

- [ ] 直接访问 `/consultation/doctor/1` → 未登录时重定向至 `/login` (带 redirect query)
- [ ] 已登录但未接受免责声明 → 首次访问时弹出免责声明弹窗 → 同意后进入对话
- [ ] 完整用户路径: Consultation 医生列表 → 点击卡片 → DoctorChatView 对话 → SSE 收发 → 返回按钮
- [ ] `vue-tsc --noEmit` 零错误
- [ ] `vite build` 零错误

---

## 核心用户路径验收标准 (5条)

本轮全部任务完成后，以下 5 条核心用户路径必须全部通过:

### AC-1: Consultation → DoctorChatView → SSE 流式对话

- **前置**: 用户已登录且已接受免责声明
- **步骤**:
  1. 访问 `/consultation`，医生列表正常渲染 (含头像、姓名、职称、科室、简介)
  2. 点击某位医生的 "开始咨询" 按钮
  3. 路由跳转至 `/consultation/doctor/{id}`，顶部展示该医生信息
  4. 输入消息文本，点击发送或按 Enter
  5. 消息列表出现用户消息 (右对齐)，AI 回复逐字流式出现 (左对齐)
  6. 回复完成后，`message_end` 事件的 `conversation_id` 被保存
- **验证工具**: DevTools Network 面板 + Application 面板 (localStorage `qrzl_conv_{doctorId}`)

### AC-2: 断网 → 重连 → 对话上下文恢复

- **步骤**:
  1. 在 DoctorChatView 中已建立对话 (至少一个来回)
  2. DevTools Network 面板切换为 Offline
  3. 发送新消息 → 页面展示重连提示 (console.warn)
  4. 切换回 Online → 检查是否自动重连
  5. 重连成功后发送消息，请求体包含之前的 `conversation_id`
- **简化版 (v3 交付)**: 固定间隔 3 次重试即可通过

### AC-3: 切换医生 → 旧连接 abort → 独立 conversation_id

- **步骤**:
  1. 在 DoctorChatView 中 (医生A, `doctorId=1`)，已建立对话并获得 `conversation_id`
  2. 返回 Consultation 页，点击医生B (`doctorId=2`) 的 "开始咨询"
  3. 检查 Network 面板: 医生A 的 SSE 连接已被 cancel
  4. 与医生B 对话 → 获得的 `conversation_id` 与医生A 不同
  5. 返回医生A → 再次对话 → 使用之前保存的医生A 的 `conversation_id`
- **简化版 (v3 交付)**: v3 仅验证单医生 scenario (AC-2 覆盖)，多医生独立会话推迟至 v4

### AC-4: 组件卸载 → SSE 连接关闭 (AbortController cleanup)

- **步骤**:
  1. 在 DoctorChatView 中正在进行 SSE 流式响应 (`isStreaming === true`)
  2. 点击返回按钮或浏览器后退 → 路由离开 DoctorChatView
  3. Network 面板确认: 正在进行的 `POST /api/chat/doctor/:id` 请求状态为 canceled
  4. 再次进入同一医生的 DoctorChatView → 页面正常加载，无残留连接
- **验证工具**: DevTools Network 面板 + console (无未捕获异常)

### AC-5: `vue-tsc --noEmit` + `vite build` 零错误

- **步骤**:
  1. 在项目根目录执行 `npx vue-tsc --noEmit`
  2. 确认输出无任何 TypeScript 类型错误
  3. 执行 `npx vite build`
  4. 确认构建成功 (无 warning 或 error)
- **特别检查点**:
  - `useChatApi.ts` 的 `sendChatMessage` 类型与 `chatStore.ts` 调用处一致
  - `DoctorChatView.vue` 模板中使用的 chatStore 属性/方法均在 chatStore 中暴露
  - `Consultation.vue` 和 `DoctorChatView.vue` 的 import 路径正确

---

## 跨任务依赖验证矩阵

```
G1 (useChatApi.ts) ──→ G2 (连接管理) ──→ G3 (SSE解析) ──→ G4 (conversation_id+重连)
         │                    │                  │                  │
         │                    │                  │                  │
         │                    ▼                  ▼                  ▼
         │              chatStore.ts         chatStore.ts       chatStore.ts
         │              (注册AbortCtrl)      (+parseSSE)        (+retry+Map)
         │                                                         │
         │                                                         ▼
         │                                              G6 (DoctorChatView.vue)
         │                                              集成 chatStore SSE 接口
         │                                                         │
         ▼                                                         ▼
G5 (Consultation.vue) ─────────────────────────────────────→ G7 (路由注册+集成测试)
(独立并行，不依赖G1-G4)                                         (依赖 G5+G6 完成)
```

**关键协调点**:
- **G1 → G2**: `sendChatMessage` 需支持 `signal` 参数 (G1 阶段即包含，避免 G3 回修)
- **G2 → G3**: `dispatchSSEEvent` 中的 `setDoctorConversation` 依赖 G4 实现，G3 阶段可临时使用 `console.log` 占位
- **G3 → G4**: `sendMessageWithRetry` 包装 `sendMessage`，不修改 sendMessage 内部逻辑
- **G5 ∥ G1-G4**: 完全独立，仅共享 `getDoctors()` (已存在于 useHomeApi.ts)
- **G6 → G7**: 路由注册后 G6 组件的懒加载路径才生效

---

## 文件修改汇总

| 文件 | G1 | G2 | G3 | G4 | G5 | G6 | G7 | 操作 | 预估行数 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|------|:------:|
| `src/composables/useChatApi.ts` | + | ~ | ~ | | | | | **新建** | ~50行 |
| `src/stores/chatStore.ts` | | ++ | ++ | ++ | | | | **重写** (从13行骨架) | ~250行 |
| `src/types/api.ts` | + | | | | | | | 修改 (追加 DoctorDetail) | ~5行 |
| `src/views/Consultation.vue` | | | | | ++ | | | **重写** (从6行占位) | ~150行 |
| `src/views/DoctorChatView.vue` | | | | | | ++ | | **新建** | ~250行 |
| `src/router/index.ts` | | | | | | | + | 修改 (追加1条路由) | ~8行 |
| **合计** | ~50 | ~60 | ~70 | ~70 | ~150 | ~250 | ~8 | | **~658行** |

---

## 风险缓解措施

| 风险 | 概率 | 影响 | 缓解措施 |
|------|:----:|:----:|---------|
| 后端 SSE API 未就绪 | 中 | 高 | G1 开始前执行 curl 验证 `POST /api/chat/doctor/:id` 端点可用性 |
| SSE chunk 边界处理复杂 (ReadableStream + \n\n + JSON) | 中高 | 高 | G3 由最有 SSE 开发经验的开发者负责；parseSSEBuffer 单元测试 (console 手动验证) |
| useChatApi 与 authStore 循环依赖 | 低 | 中 | token 通过参数传入 (G1 设计决策)；useChatApi.ts 不 import 任何 Store |
| chatStore.ts 同一文件 G2/G3/G4 合并冲突 | 低 | 中 | G1→G2→G3→G4 为同一开发者串行链，避免多人同时修改 |
| DoctorChatView.vue 模板引用不存在的 chatStore 属性 | 中 | 低 | G6 中明确接口契约表；G7 编译验证优先执行 `vue-tsc --noEmit` |

---

*详细设计文件结束 (v3)。审查报告 plan_review_v3_r2.md APPROVED，可进入执行阶段。*
