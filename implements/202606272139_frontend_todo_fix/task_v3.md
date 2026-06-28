# 前端待办修复 -- 第3轮任务 v3

> **依据**: 诊断报告 `redeliberations/202606271705_frontend_todo_diagnosis/a_v8_diag_v3.md` S5b-1/S5b-2 详细规格
> **计划文件**: `plan.md` 第4.1节 v3行
> **审查报告**: `plan_review_v3_r1.md`（7组分解 + 并行策略）
> **上一轮**: v1 已完成 S9/S7/S3/S1/S2/S5a (6项)，v2 已完成 S6/G14/S4/S11/S8 (5项)
> **范围**: 7个任务组 -- S5b-1 (chatStore SSE核心) + S5b-2 (Consultation重写 + DoctorChatView + 路由集成)
> **日期**: 2026-06-27
> **总工时**: 36-52h（单人串行），28-36h（三人并行关键路径）
> **简化交付工时**: 28-40h（断线重连简化版 + 单医生对话，详见第9节可推迟项）

---

## 执行顺序与依赖图

```
串行链 A (chatStore SSE 核心):
  [G1] useChatApi.ts (2-4h) ──→ [G2] 连接管理 (6-8h) ──→ [G3] SSE解析+流式渲染 (6-8h) ──→ [G4] conversation_id+重连+多医生 (6-8h)

独立并行 B (不依赖 chatStore):
  [G5] Consultation.vue 重写 (8-12h) ←── 可与 G1-G4 完全并行

依赖 A 流:
  [G6] DoctorChatView.vue (6-8h) ←── 依赖 G1-G4 完成（chatStore SSE 接口就绪）

最终集成:
  [G7] 路由注册+集成验证 (2-4h) ←── 依赖 G5 + G6 完成
```

**推荐执行顺序（三人并行）**:
```
开发者1 (关键路径): G1 → G2 → G3 → G4                           (20-28h)
开发者2 (独立并行): G5                                           (8-12h)  → 完成后可协助 G3/G4 或开始 G6 静态 UI 准备
开发者3 (等待后接入): 等待 G1 完成(接口稳定) → G6 静态UI部分      → G4 完成后集成 chatStore → G7
```

**推荐执行顺序（单人串行）**: G1 → G2 → G3 → G4 → G5 → G6 → G7

---

## 任务组 G1: useChatApi.ts 创建 -- SSE API 封装层

- **问题编号**: S5b-1 (子项 a)
- **严重程度**: P0 -- 功能阻断级，chatStore 的上游依赖
- **预估工时**: 2-4h
- **前置依赖**: 无（G14 success 拦截器已在 v2 完成，useChatApi.ts 自动受益于统一错误处理）
- **可并行**: 与 G5 (Consultation.vue) 无依赖，可完全并行

### 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| 新建 | `src/composables/useChatApi.ts` | chat API composable，对标 useHomeApi.ts 模式 |
| 修改 | `src/types/api.ts`（追加） | 新增 `DoctorDetail` 类型（如需要 `is_online` 等扩展字段） |

### 具体修改描述

#### 1.1 新建 useChatApi.ts

参照 `src/composables/useHomeApi.ts` 的 API composable 模式，创建 `src/composables/useChatApi.ts`:

```typescript
import { api } from '@/composables/useApi'
import type { Doctor } from '@/types/api'

/**
 * 发起医生对话 SSE 请求
 * POST /api/chat/doctor/:id
 * 设计依据: docs/2_detailed_design_v3.md 第2373行 (fetch + ReadableStream SSE消费)
 *
 * 注意: 此函数返回 Response 对象（body 为 ReadableStream），
 * 由 chatStore 消费流，不在此函数中读取 body。
 *
 * @param doctorId - 医生主键
 * @param message  - 用户消息文本
 * @param conversationId - 可选，已有会话ID（首次对话不传）
 * @returns fetch Response（body: ReadableStream<Uint8Array>）
 */
export async function sendChatMessage(params: {
  doctorId: number
  message: string
  conversationId?: string
}): Promise<Response> {
  const { doctorId, message, conversationId } = params
  // token 通过参数传入或从 authStore 读取
  // 设计建议(审查报告 S1): token 通过函数参数传入，避免 useChatApi -> authStore 循环依赖
  // 实际实现: 若 chatStore 调用此函数，由 chatStore 负责从 authStore 获取 token 并传入；
  // 若为简化可采用 useChatApi 内部直接 import authStore（当前代码库中 useHomeApi 等均通过
  // useApi.ts 的 request 拦截器自动注入 token，useChatApi.ts 的 sendChatMessage 使用原生 fetch
  // 不走 axios 拦截器，因此需要在调用处显式传入 token）
  return fetch(`/api/chat/doctor/${doctorId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,  // token 由调用方 chatStore 传入或通过 authStore 获取
    },
    body: JSON.stringify({
      message,
      conversation_id: conversationId,
    }),
  })
}

/**
 * 获取医生详情信息
 * GET /api/doctors/:id
 * 用于 DoctorChatView.vue 展示医生信息头部
 *
 * 注意: 当前后端 Doctor 接口不含 is_online 字段。
 * 若需要在对话页展示在线状态，需确认后端 API 是否返回该字段。
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

#### 1.2 类型扩展（按需）

若后端 `GET /api/doctors/:id` 返回的医生详情包含 `is_online` 字段（设计文档 Consultation.vue 要求展示"在线"标识），在 `src/types/api.ts` 中追加:

```typescript
/** 医生详情（含在线状态），GET /api/doctors/:id */
export interface DoctorDetail extends Doctor {
  is_online: boolean
}
```

若后端当前不返回 `is_online`，可先以 `Doctor` 类型工作，待后端字段就绪后扩展。

### 边界条件

- `sendChatMessage()` 使用原生 `fetch` 而非 axios（SSE 需要访问 `response.body` ReadableStream，axios 不支持流式消费）。
- `getDoctorInfo()` 使用 axios（走 `useApi.ts` 拦截器，自动注入 Authorization header + success:false 检查）。
- `sendChatMessage()` 的 token 获取方式：由调用方 chatStore 传入，或在函数内部 import authStore（审查报告 S1 建议通过参数传入以避免循环依赖风险，但当前项目 chatStore 与 authStore 无相互引用，直接 import 亦可。具体实现由开发者判断）。

### 验收标准

- [ ] `sendChatMessage()` 可成功发起 `POST /api/chat/doctor/:id` 请求，返回 `Response` 对象（status 200）。
- [ ] `getDoctorInfo()` 可成功获取医生详情，返回 `Doctor` 对象。
- [ ] `sendChatMessage()` 传入 `conversationId` 时，请求体包含 `conversation_id` 字段；不传时该字段不存在。
- [ ] `vue-tsc --noEmit` 无新增编译错误。

---

## 任务组 G2: chatStore.ts -- fetch + ReadableStream SSE 连接管理

- **问题编号**: S5b-1 (子项 b, f)
- **严重程度**: P0 -- 功能阻断级，SSE 通信核心
- **预估工时**: 6-8h
- **前置依赖**: G1 (useChatApi.ts -- sendChatMessage 函数就绪)
- **不可并行**: 依赖 G1 完成；G3 依赖本任务完成

### 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| 重写 | `src/stores/chatStore.ts` | 从13行骨架扩展为完整 SSE 实现（本轮新增: 连接管理 + AbortController） |

### 具体修改描述

chatStore.ts 当前为 13 行骨架（仅 `conversations: ref([])` + 空 `abortActiveConnection()` + 空 `clearAllConversations()`）。G2 构建连接管理层:

#### 2.1 Store 状态扩展

在 chatStore 中新增以下状态（对齐设计文档 3.7 节 chatStore 接口定义）:

```typescript
// 状态
const conversations = ref<ChatMessage[]>([])           // 当前对话消息列表，已有
const isStreaming = ref(false)                          // SSE 流是否活跃
const activeAbortController = ref<AbortController | null>(null)  // 活跃的 SSE 控制器
const fabOpen = ref(false)                              // FAB 悬浮按钮展开/收起
```

类型导入: `import type { ChatMessage } from '@/types/sse'`

#### 2.2 实现 `sendMessage()` -- fetch + ReadableStream 管道

```typescript
async function sendMessage(doctorId: number, text: string, token: string): Promise<void> {
  // 1. 构造用户消息气泡
  const userMessage: ChatMessage = {
    id: `user_${Date.now()}`,
    role: 'user',
    content: text,
    timestamp: Date.now(),
  }
  conversations.value.push(userMessage)

  // 2. 读取 conversation_id（首次对话不传，后续传）
  const conversationId = getDoctorConversation(doctorId) ?? undefined

  // 3. 注册 AbortController（自动 abort 旧连接，确保连接数上限为 1）
  const controller = new AbortController()
  registerAbortController(controller)

  isStreaming.value = true

  try {
    // 4. 调用 useChatApi.sendChatMessage 发起 SSE 请求
    const response = await sendChatMessage({
      doctorId,
      message: text,
      conversationId,
    })
    // 注意: sendChatMessage 内部使用原生 fetch，需要将 AbortController.signal 传入。
    // 若 G1 的 sendChatMessage 不支持 signal 参数，需在此任务中修改 useChatApi.ts 追加 signal 参数。

    // 5. 检查响应状态码
    if (response.status === 401) {
      // 401 Token 过期 -- 触发 clearAuth + Toast，保持对话窗口打开
      const { useAuthStore } = await import('@/stores/authStore')
      useAuthStore().clearAuth()
      const Swal = await import('sweetalert2')
      Swal.default.fire({
        toast: true, position: 'top', icon: 'info',
        title: '登录已过期，请重新登录',
        showConfirmButton: false, timer: 2500, timerProgressBar: true,
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

    // 7. 流式读取循环（事件解析留到 G3）
    // G2 范围: 建立 reader 管道 + 循环框架 + 异常处理
    // 详细的 SSE 协议解析（\n\n 分隔、data: 前缀、JSON.parse、event 分发）由 G3 完成
    await readSSEStream(reader)  // G3 实现具体逻辑
  } catch (err: any) {
    if (err.name === 'AbortError') {
      // 用户主动取消或切换医生，静默处理
      return
    }
    // 其他异常由 G4 (断线重连) 处理
    throw err
  } finally {
    isStreaming.value = false
    activeAbortController.value = null
  }
}
```

#### 2.3 实现 `registerAbortController()` + `abortActiveConnection()`

对齐设计文档 3.7 节 SSE 连接控制机制:

```typescript
/**
 * 注册并追踪活跃的 AbortController。
 * 若已有活跃连接，先 abort 旧连接再注册新控制器。
 * 确保同时活跃 SSE 连接数上限为 1（设计文档 4.2 节约束）。
 */
function registerAbortController(controller: AbortController): void {
  if (activeAbortController.value) {
    activeAbortController.value.abort()  // 中止旧连接
  }
  activeAbortController.value = controller
}

/**
 * 中止当前活跃的 SSE 连接。
 * 组件卸载时调用 (onUnmounted) 或用户手动返回时调用。
 */
function abortActiveConnection(): void {
  if (activeAbortController.value) {
    activeAbortController.value.abort()
    activeAbortController.value = null
  }
  isStreaming.value = false
}
```

#### 2.4 `readSSEStream()` 循环框架

```typescript
/**
 * SSE 流读取循环框架。
 * 详细的 SSE 事件解析由 G3 在循环内部实现。
 * G2 仅建立 reader 循环结构和异常处理。
 */
async function readSSEStream(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      // 解码 chunk → 文本
      buffer += decoder.decode(value, { stream: true })

      // G3 在此实现: 按 \n\n 分隔事件块 → 去 data: 前缀 → JSON.parse → event 分发
      // G2 范围: 留一个空循环占位，G3 填充具体解析逻辑
      const result = parseSSEBuffer(buffer)  // G3 实现
      buffer = result.remaining
      for (const event of result.events) {
        dispatchSSEEvent(event)  // G3 实现
      }
    }
  } finally {
    reader.releaseLock()
  }
}
```

### 边界条件

- `AbortController` 在 `sendMessage` 中创建，通过 `signal` 传入 fetch 调用。G1 的 `sendChatMessage` 需支持 `signal` 参数。
- 连接数上限为 1：`registerAbortController` 自动 abort 旧连接。
- `response.status === 401` 时的处理与 `useApi.ts` 拦截器逻辑等价（clearAuth + Toast + 不路由跳转，保持对话窗口）。
- `reader.releaseLock()` 在 finally 中调用，确保流资源释放。

### 验收标准

- [ ] 发送消息后，Network 面板可见 `POST /api/chat/doctor/:id` 请求（status 200）。
- [ ] 发送第二条消息时，前一条消息的 SSE 连接被 abort（Network 面板旧请求显示 canceled）。
- [ ] 组件卸载时（`onUnmounted` 调用 `abortActiveConnection()`），正在进行的 SSE 连接被取消。
- [ ] 后端返回 401 时，触发 Toast "登录已过期" 提示，对话窗口保持不变。
- [ ] `vue-tsc --noEmit` 无新增编译错误。

---

## 任务组 G3: chatStore.ts -- SSE 事件解析 + 流式渲染

- **问题编号**: S5b-1 (子项 c, h)
- **严重程度**: P0 -- 功能阻断级，消息内容呈现
- **预估工时**: 6-8h
- **前置依赖**: G2 (chatStore 连接管理层 -- reader 管道就绪)
- **不可并行**: 依赖 G2 完成；G4 依赖本任务完成

### 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| 修改 | `src/stores/chatStore.ts` | 在 G2 的流读取循环框架内实现 SSE 协议解析 + event 分发 + 流式渲染 |
| 参考 | `src/types/sse.ts` | `SSEMessageEvent`、`SSEMessageEndEvent`、`SSEErrorEvent`、`ChatMessage` |

### 具体修改描述

#### 3.1 SSE 协议解析 -- `parseSSEBuffer()`

实现 `parseSSEBuffer()` 函数，按设计文档 3.3 节 SSE 事件格式规范解析:

```typescript
interface ParsedSSEResult {
  events: SSEEvent[]       // 解析出的完整事件列表
  remaining: string        // 未完成的半截事件块（等待后续 chunk）
}

function parseSSEBuffer(buffer: string): ParsedSSEResult {
  const events: SSEEvent[] = []

  // 按 \n\n 分隔事件块（SSE 协议标准分隔符）
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
      // 忽略 event: 行（事件类型从 JSON data 内部的 event 字段获取，符合 Dify 透传格式）
    }

    if (!dataLine) continue

    try {
      const parsed = JSON.parse(dataLine) as SSEEvent
      events.push(parsed)
    } catch {
      // JSON 解析失败: 静默跳过损坏的事件块
      console.warn('[chatStore] SSE 事件 JSON 解析失败:', dataLine.slice(0, 100))
    }
  }

  return { events, remaining }
}
```

#### 3.2 事件分发 -- `dispatchSSEEvent()`

根据 `event` 字段分发处理（对齐设计文档 3.3 节事件格式表）:

```typescript
function dispatchSSEEvent(event: SSEEvent): void {
  switch (event.event) {
    case 'message': {
      // AI 逐 token 生成时多次推送
      // 增量追加 answer 到当前最后一条 assistant 消息
      const lastMsg = conversations.value[conversations.value.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        // 已有 assistant 气泡：追加内容
        lastMsg.content += event.answer
      } else {
        // 首个 message 事件：创建新 assistant 气泡
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
      // 保存 conversation_id（G4 实现 setDoctorConversation）
      if (event.conversation_id) {
        setDoctorConversation(currentDoctorId.value, event.conversation_id)
      }
      // 更新最后一条 assistant 消息的 message_id
      const lastMsg = conversations.value[conversations.value.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        lastMsg.id = event.message_id || lastMsg.id
        lastMsg.timestamp = (event.created_at || 0) * 1000
      }
      isStreaming.value = false
      break
    }

    case 'error': {
      // 流内逻辑错误
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

    // 以下事件类型静默忽略（设计文档 3.3 节标注为可选/预扩展）
    case 'workflow_started':
    case 'workflow_finished':
    case 'agent_message':
    case 'agent_thought':
      // 不渲染，不报错
      break

    default:
      // 未知事件类型静默忽略
      break
  }
}
```

#### 3.3 流式渲染机制

- `conversations` 数组是 `ref<ChatMessage[]>`，Vue 响应式系统自动追踪。
- `message` 事件的 `answer` chunk 通过字符串拼接追加到 `lastMsg.content`，触发模板重新渲染。
- DoctorChatView.vue (G6) 模板中使用 `v-for` 渲染 `conversations`，AI 消息气泡内容实时更新。
- `isStreaming` ref 用于 UI 展示"对方正在输入..."动画（G6 实现）。

#### 3.4 G1 修订 -- sendChatMessage 追加 signal 参数

若 G1 中 `sendChatMessage` 未支持 `AbortController.signal`，在 G3 中追加:

```typescript
export async function sendChatMessage(params: {
  doctorId: number
  message: string
  conversationId?: string
  signal?: AbortSignal     // G3 新增
}): Promise<Response> {
  return fetch(`/api/chat/doctor/${doctorId}`, {
    method: 'POST',
    headers: { /* ... 同 G1 */ },
    body: JSON.stringify({ message, conversation_id: params.conversationId }),
    signal: params.signal,  // 支持外部 AbortController
  })
}
```

### 边界条件

- `\n\n` 分隔符: chunk 可能在 `\n\n` 中间切断，需保留 `remaining` 拼接到下一 chunk。
- `data: ` 前缀: 严格匹配 `data: `（含空格），不以 `data:` 开头的行忽略。
- JSON 解析失败: 静默跳过，不中断流（一个损坏的事件块不应导致整个对话崩溃）。
- `message` 事件没有 `message_id` 时，使用 `id: 'assistant_' + Date.now()` 生成临时 ID。
- `created_at` 为 Unix 秒，转换为毫秒: `event.created_at * 1000`。
- `isStreaming` 在 `message_end`、`error`、异常时均需设为 false。

### 验收标准

- [ ] 发送消息后，AI 回复逐字流式出现在消息列表中（非一次性显示）。
- [ ] `message_end` 事件后，`conversation_id` 被保存（可在 DevTools 中检查 chatStore 状态）。
- [ ] `error` 事件时，消息列表中出现红色错误气泡，包含错误描述文本。
- [ ] 手动断开网络，消息列表中已接收的文本保留不丢失。
- [ ] `vue-tsc --noEmit` 无新增编译错误。

---

## 任务组 G4: chatStore.ts -- conversation_id 管理 + 断线重连 + 多医生路由

- **问题编号**: S5b-1 (子项 d, e, g, i)
- **严重程度**: P0 -- 功能阻断级，对话持久化与健壮性
- **预估工时**: 6-8h
- **前置依赖**: G3 (SSE 事件解析就绪 -- message_end 事件分发中需调用 setDoctorConversation)
- **不可并行**: 依赖 G3 完成

### 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| 修改 | `src/stores/chatStore.ts` | 继续扩展: conversation_id 管理 + 断线重连 + 多医生路由 + fabOpen |

### 具体修改描述

#### 4.1 conversation_id 管理（按 doctorId 区分）

对齐设计文档 3.7 节 chatStore 接口 -- `doctorConversations: Map<number, string>`:

```typescript
import { useStorage } from '@vueuse/core'  // 或直接使用 localStorage

// 多医生 conversation_id 映射
const doctorConversations = ref<Map<number, string>>(new Map())

// 当前活跃的医生 ID（由 DoctorChatView.vue 设置）
const currentDoctorId = ref<number | null>(null)

/** 获取指定医生的 conversation_id */
function getDoctorConversation(doctorId: number): string | null {
  // 1. 先从内存 Map 查
  if (doctorConversations.value.has(doctorId)) {
    return doctorConversations.value.get(doctorId)!
  }
  // 2. 从 localStorage 恢复（跨会话持久化）
  const stored = localStorage.getItem(`qrzl_conv_${doctorId}`)
  if (stored) {
    doctorConversations.value.set(doctorId, stored)
    return stored
  }
  return null
}

/** 保存指定医生的 conversation_id */
function setDoctorConversation(doctorId: number, id: string): void {
  doctorConversations.value.set(doctorId, id)
  try {
    localStorage.setItem(`qrzl_conv_${doctorId}`, id)
  } catch {
    // 静默丢弃（localStorage 满了不影响功能）
  }
}

/** 清除指定医生的 conversation_id */
function clearDoctorConversation(doctorId: number): void {
  doctorConversations.value.delete(doctorId)
  localStorage.removeItem(`qrzl_conv_${doctorId}`)
}

/** 登出时统一清理所有对话会话（对齐设计文档 chatStore.clearAllConversations） */
function clearAllConversations(): void {
  // 清空 conversation_id 映射
  const ids = [...doctorConversations.value.keys()]
  for (const id of ids) {
    localStorage.removeItem(`qrzl_conv_${id}`)
  }
  doctorConversations.value.clear()
  // 清空消息列表
  conversations.value = []
  // 清空其他会话 ID
  assistantConversationId.value = null
  adminConversationId.value = null
}
```

#### 4.2 断线重连（指数退避）

```typescript
/** 重连配置 */
const RETRY_CONFIG = {
  initialDelay: 1000,      // 初始延迟 1s
  maxDelay: 30000,         // 最大延迟 30s
  maxRetries: 5,           // 最大重试次数
  backoffMultiplier: 2,    // 指数退避倍增因子
}

/**
 * 带重连的 sendMessage 包装。
 * 网络中断或 fetch 异常时自动重试。
 * 重试时携带已保存的 conversation_id 以恢复对话上下文。
 *
 * 简化版（v3 交付）: 固定间隔 3 次重试，延迟 2s/4s/8s。
 * 指数退避增强版推迟至 v4（见第9节可推迟项）。
 */
async function sendMessageWithRetry(doctorId: number, text: string, token: string): Promise<void> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      await sendMessage(doctorId, text, token)
      return  // 成功，退出重试循环
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw err  // 用户主动取消，不重试
      }
      lastError = err

      if (attempt < RETRY_CONFIG.maxRetries) {
        // 指数退避延迟
        const delay = Math.min(
          RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
          RETRY_CONFIG.maxDelay,
        )
        console.warn(`[chatStore] SSE 连接失败，${delay}ms 后重试 (${attempt + 1}/${RETRY_CONFIG.maxRetries})`, err)

        // 在消息列表添加重连提示（可选 UI 增强）
        await new Promise(resolve => setTimeout(resolve, delay))
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

#### 4.3 多医生会话路由

切换医生时 abort 旧连接、加载目标医生的 conversation_id:

```typescript
/**
 * 切换到指定医生。
 * 由 DoctorChatView.vue 在 onMounted 和 watch(route.params.id) 中调用。
 */
function switchDoctor(doctorId: number): void {
  // 1. 中止旧医生的 SSE 连接
  abortActiveConnection()

  // 2. 设置当前医生
  currentDoctorId.value = doctorId

  // 3. 清空消息列表（准备新对话）
  conversations.value = []

  // 4. 加载目标医生的 conversation_id（如有历史会话，下次 sendMessage 自动携带）
  // 由 G6 DoctorChatView.vue 在 switchDoctor 后展示欢迎语或历史消息
}
```

**简化版（v3 交付建议）**: v3 仅交付单医生对话，`switchDoctor` 简化为仅 abort + 清空消息。`doctorConversations` Map 仅用于单医生 conversation_id 持久化。多医生路由（Map 遍历、切换时加载独立历史）推迟至 v4。

#### 4.4 fabOpen 状态管理

```typescript
function toggleFab(): void {
  fabOpen.value = !fabOpen.value
}
```

此功能为 UI 增强项，Consultation 页悬浮按钮展开/收起。若 v3 时间紧张可推迟至 v4。

### 边界条件

- `localStorage.setItem` 使用 try-catch 防 QuotaExceededError。
- 重连时继续使用 AbortController.signal: 每次重试前创建新的 AbortController（旧 controller 已被 abort）。
- `switchDoctor` 在路由参数变化时触发（`watch(() => route.params.id, ...)` -- G6/G7 实现）。
- 简化版重连: 最大 3 次固定间隔重试（2s/4s/8s），减少调试复杂度。

### 验收标准

- [ ] 发送首次对话 → 收到 `message_end` → localStorage 中出现 `qrzl_conv_{doctorId}` 键。
- [ ] 刷新页面后再次发送消息 → 请求体包含上次保存的 `conversation_id`。
- [ ] 手动断开网络（DevTools Network 面板 Offline）→ 发送消息 → 页面展示重连提示 → 恢复网络后自动重连成功。
- [ ] 重试 3 次（简化版）全部失败 → 消息列表出现 "[连接失败]" 提示。
- [ ] `clearAllConversations()` 调用后，localStorage 中所有 `qrzl_conv_*` 键被清除。
- [ ] `vue-tsc --noEmit` 无新增编译错误。

---

## 任务组 G5: Consultation.vue 重写 -- 医生列表入口页

- **问题编号**: S5b-2 (子项 a)
- **严重程度**: P1 -- 功能阻断级（入口页未就绪则用户无法进入医生对话）
- **预估工时**: 8-12h
- **前置依赖**: 无（仅使用已存在的 `getDoctors()` API，不依赖 chatStore SSE）
- **并行策略**: 可与 G1-G4 完全并行（与 chatStore 开发无交叉）

### 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| 重写 | `src/views/Consultation.vue` | 从 7 行占位页面重写为完整医生列表功能页面 |

### 具体修改描述

当前 `src/views/Consultation.vue` 为 7 行占位页面（模板仅含静态提示文字 `<p>医师咨询 -- 待组员开发</p>`，无 `<script setup>` 逻辑）。需完整构建医生列表 UI，对齐设计文档 4.1.3 节 Consultation.vue 组件树（第3022-3035行）和流程图（第3521-3529行）。

#### 5.1 模板结构

对齐设计文档组件树:

```html
<template>
  <div class="consultation-list-container">
    <!-- 顶部导航栏 -->
    <header class="top-bar">
      <h1>医师咨询</h1>
    </header>

    <!-- 加载态 -->
    <div v-if="loading" class="loading-state">
      <Spinner />  <!-- 或骨架屏 -->
      <p>加载医生列表中...</p>
    </div>

    <!-- 错误态 -->
    <div v-else-if="error" class="error-state">
      <i class="fas fa-exclamation-circle text-4xl text-red-400 mb-3"></i>
      <p>{{ error }}</p>
      <button @click="fetchDoctors" class="btn-retry">重试</button>
    </div>

    <!-- 空态 -->
    <div v-else-if="doctors.length === 0" class="empty-state">
      <i class="fas fa-user-md text-5xl text-gray-300 mb-4"></i>
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
            <span v-if="doctor.is_online !== false" class="online-badge">在线</span>
          </h2>
          <p class="department">{{ doctor.department }}</p>
          <p class="title">{{ doctor.title }}</p>
          <p class="description">{{ doctor.description }}</p>
        </div>
        <button class="btn-chat">开始咨询</button>
      </div>
    </div>
  </div>
</template>
```

#### 5.2 Script 逻辑

```typescript
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
  } catch (err: any) {
    error.value = err.message || '获取医生列表失败，请检查网络后重试'
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
```

#### 5.3 样式要点

- 医生卡片: 白色圆角卡片，阴影悬浮效果，flex 布局（头像左、信息中、按钮右）。
- 在线标识: 绿色圆点 + "在线" 文字，位于医生姓名右侧。
- 加载骨架屏: 3-4 个灰色占位卡片（脉冲动画）。
- 响应式: 手机端卡片纵向堆叠，桌面端可两列网格。

### 边界条件

- `getDoctors()` 返回分页数据（当前 `getDoctors()` 不传 page/pageSize，后端默认行为需确认 -- 若仅返回首页数据，需调整为无限滚动或"加载更多"按钮。**建议在 G5 执行前用 curl 确认后端不传分页参数时的返回行为**）。
- `is_online` 字段: 当前 Doctor 接口不含此字段。若后端不返回，在线标识先隐藏（`v-if="doctor.is_online !== false"` 双阴性保护: 字段不存在时不报错、不显示）。
- 点击卡片跳转前，无需额外鉴权（路由守卫 `requiresAuth: true` 由 G7 注册时设置）。
- API 失败时展示重试按钮（不展示空白页）。

### 验收标准

- [ ] 访问 `/consultation` 页面，展示加载态（骨架屏/Spinner）。
- [ ] 加载完成后展示医生列表卡片（含头像、姓名、职称、科室、简介）。
- [ ] 若后端返回 `is_online` 字段，在线医生展示绿色"在线"标识。
- [ ] 点击医生卡片的"开始咨询"按钮，路由跳转至 `/consultation/doctor/{id}`（G7 注册路由后生效）。
- [ ] API 调用失败时展示错误消息 + 重试按钮，点击重试可重新加载。
- [ ] 医生列表为空时展示"暂无在线医生"占位。
- [ ] `vue-tsc --noEmit` 无新增编译错误。

---

## 任务组 G6: DoctorChatView.vue 创建 -- 医生对话界面

- **问题编号**: S5b-2 (子项 b)
- **严重程度**: P1 -- 功能阻断级
- **预估工时**: 6-8h
- **前置依赖**: G1-G4 (chatStore SSE 核心完成) + G5 (Consultation.vue 入口页完成 -- 用户需从入口页进入)
- **建议**: 等待 G1 完成（useChatApi.ts 接口稳定）后，可先开始 G6 的静态 UI 部分（header/input/layout），G4 完成后再集成 chatStore 动态数据。

### 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| 新建 | `src/views/DoctorChatView.vue` | 医生对话页面组件 |

### 具体修改描述

对齐设计文档 4.1.3 节 DoctorChatView.vue 组件树（第3038-3066行）和流程图（第3533-3567行）。

#### 6.1 模板结构

```html
<template>
  <div class="doctor-chat-container">
    <!-- 顶部固定: 医生信息头部 -->
    <header class="chat-header">
      <button class="btn-back" @click="goBack">
        <i class="fas fa-arrow-left"></i>
      </button>
      <div class="doctor-info-bar">
        <img class="avatar-small" :src="doctor?.avatar || '/default-avatar.png'" />
        <div>
          <h2>{{ doctor?.name || '加载中...' }}</h2>
          <p>{{ doctor?.department }} · {{ doctor?.title }}</p>
        </div>
      </div>
      <button class="btn-delete" @click="clearChat" title="清空对话">
        <i class="fas fa-trash"></i>
      </button>
    </header>

    <!-- 免责声明条 (对话全程可见) -->
    <div class="disclaimer-bar">
      <p>本对话由AI虚拟医师提供，回复内容仅供参考</p>
    </div>

    <!-- 消息列表 (可滚动) -->
    <div id="chat-messages" ref="messagesContainer">
      <!-- 加载态 -->
      <div v-if="loading" class="loading-state">
        <Spinner />
        <p>加载对话中...</p>
      </div>

      <!-- 错误态 (医生不存在) -->
      <div v-else-if="doctorError" class="error-state">
        <p>{{ doctorError }}</p>
        <button @click="goBack">返回医生列表</button>
      </div>

      <!-- 消息列表 -->
      <template v-else>
        <div
          v-for="msg in chatStore.conversations"
          :key="msg.id"
          :class="['message-bubble', msg.role === 'user' ? 'sent' : 'received']"
        >
          <img
            class="msg-avatar"
            :src="msg.role === 'user' ? userAvatar : (doctor?.avatar || '/default-avatar.png')"
          />
          <span class="msg-name">{{ msg.role === 'user' ? '我' : doctor?.name }}</span>
          <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
          <div class="msg-content" v-html="renderContent(msg.content)"></div>
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
      />
      <button
        id="sendBtn"
        :class="{ hidden: !inputText.trim() }"
        @click="handleSend"
        :disabled="chatStore.isStreaming"
      >
        <i class="fas fa-paper-plane"></i>
      </button>
    </div>
  </div>
</template>
```

#### 6.2 Script 逻辑

```typescript
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

const doctor = ref<Doctor | null>(null)
const loading = ref(true)
const doctorError = ref('')
const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

const userAvatar = computed(() => authStore.user?.avatar || '/default-avatar.png')

// 加载医生信息
async function loadDoctor() {
  const id = Number(route.params.id)
  if (!id) {
    doctorError.value = '医生ID无效'
    loading.value = false
    return
  }

  loading.value = true
  doctorError.value = ''
  try {
    doctor.value = await getDoctorInfo(id)
    // 切换到该医生的对话上下文
    chatStore.switchDoctor?.(id)  // G4 实现的 switchDoctor
  } catch (err: any) {
    doctorError.value = err.response?.status === 404
      ? '该医生不存在'
      : err.message || '获取医生信息失败'
  } finally {
    loading.value = false
  }
}

// 发送消息
async function handleSend() {
  const text = inputText.value.trim()
  if (!text || chatStore.isStreaming) return

  inputText.value = ''
  await chatStore.sendMessageWithRetry(
    Number(route.params.id),
    text,
    authStore.token || '',
  )
  await scrollToBottom()
}

// 返回医生列表
function goBack() {
  chatStore.abortActiveConnection()
  router.push('/consultation')
}

// 清空对话
function clearChat() {
  const id = Number(route.params.id)
  chatStore.clearDoctorConversation(id)
  chatStore.conversations.length = 0
}

// 滚动到底部
async function scrollToBottom() {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// 消息内容渲染 (Markdown → 安全HTML)
function renderContent(content: string): string {
  const html = marked.parse(content) as string
  return DOMPurify.sanitize(html)
}

// 时间格式化
function formatTime(timestamp: number): string {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

// 路由参数变化监听 (医生A → 医生B 同组件复用)
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
```

#### 6.3 样式要点

- 全屏布局: `100vh` 高度，flex column（header + disclaimer + messages + input）。
- 消息气泡: 用户消息右对齐（蓝色背景），AI 消息左对齐（白色背景），圆角卡片。
- 消息列表: `flex: 1; overflow-y: auto`，新消息自动滚动到底部。
- 输入区: 底部固定（`position: sticky` 或 flex 布局固定底部），输入框 + 发送按钮。
- "对方正在输入..." 动画: 三个跳动圆点。
- 免责声明条: 半透明背景，黄色/灰色底，12px 字号。
- 响应式: 手机端全屏，桌面端最大宽度 768px 居中。

### 边界条件

- 医生 ID 不存在（`getDoctorInfo` 返回 404）: 展示错误提示 + 返回按钮。
- chatStore SSE 连接中时: 发送按钮 disabled（`chatStore.isStreaming`），防止重复发送。
- 路由参数变化（同组件复用）: `watch(route.params.id)` 触发医生切换、abort 旧连接、清空消息。
- 组件卸载: `onUnmounted` 中调用 `abortActiveConnection()`。
- `requiresDisclaimer: true` 由路由守卫触发免责声明弹窗（G7 注册），组件内无需额外处理。
- Markdown 渲染: 复用 `marked.parse()` + `DOMPurify.sanitize()` 模式（与 LifePlan.vue 一致）。

### 验收标准

- [ ] 从 Consultation 页点击医生卡片 → 进入 DoctorChatView → 顶部展示医生头像、姓名、科室、职称。
- [ ] 输入消息并发送 → 用户消息出现在右侧 → AI 回复逐字流式出现在左侧。
- [ ] AI 回复中发送按钮 disabled（`isStreaming`），回复完成后可再次发送。
- [ ] 点击返回按钮 → SSE 连接中止 → 路由跳转回 `/consultation`。
- [ ] 访问不存在的医生 ID（如 `/consultation/doctor/99999`）→ 展示"该医生不存在"提示。
- [ ] `vue-tsc --noEmit` 无新增编译错误。

---

## 任务组 G7: 路由注册 + 端到端集成验证

- **问题编号**: S5b-2 (子项 c)
- **严重程度**: P1
- **预估工时**: 2-4h
- **前置依赖**: G5 (Consultation.vue) + G6 (DoctorChatView.vue) 均已完成

### 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| 修改 | `src/router/index.ts` | 新增 `/consultation/doctor/:id` 路由 |

### 具体修改描述

#### 7.1 路由注册

在 `src/router/index.ts` 的 `routes` 数组中新增（建议在 `/consultation` 路由之后、`/life-plan` 路由之前注册，避免模糊匹配拦截）:

```typescript
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

**路由守卫行为说明**:
- `requiresAuth: true` -- 未登录用户重定向至 `/login`（现有守卫逻辑第109-112行）。
- `requiresDisclaimer: true` -- 首次进入触发免责声明 SweetAlert2 弹窗，同意后记录 `disclaimer_accepted=true`（现有守卫逻辑第122-129行）。

#### 7.2 端到端集成测试

完整用户路径冒烟测试:

1. **Consultation → DoctorChatView 完整路径**:
   - 访问 `/consultation` → 医生列表正常加载。
   - 点击某位医生的"开始咨询" → 路由跳转至 `/consultation/doctor/{id}`。
   - DoctorChatView 展示该医生的头像、姓名、科室、职称。
   - 首次进入触发免责声明弹窗 → 同意后进入对话。

2. **SSE 对话收发**:
   - 输入消息并发送 → Network 面板确认 `POST /api/chat/doctor/:id` 请求发起。
   - AI 回复逐字流式出现在消息列表中。
   - 回复结束后发送按钮恢复可用。

3. **断线重连冒烟测试**:
   - DevTools Network 面板切换 Offline → 发送消息 → 检查重连提示。
   - 恢复 Online → 检查是否自动重连并恢复对话。

4. **切换医生**:
   - 在 DoctorChatView 中无法直接切换医生（需返回 Consultation 页），但可通过修改 URL 直接测试: 从 `/consultation/doctor/1` 改为 `/consultation/doctor/2` → 旧连接被 abort → 新医生信息加载。

5. **编译零错误**:
   - 执行 `vue-tsc --noEmit`（或 `npm run build`）确认无新增编译错误。
   - 确认新建的三个文件（`useChatApi.ts`、`Consultation.vue`、`DoctorChatView.vue`）和修改的文件（`chatStore.ts`、`router/index.ts`）均通过类型检查。

#### 7.3 编译验证

```bash
# TypeScript 类型检查
npx vue-tsc --noEmit

# Vite 构建验证
npx vite build
```

### 边界条件

- `/consultation/doctor/:id` 路由参数 `id` 为 string，组件内使用 `Number(route.params.id)` 转换。
- 路由守卫的 `requiresAuth` 和 `requiresDisclaimer` 顺序: auth 检查在前（第109行），disclaimer 检查在后（第122行）。未登录用户先被重定向至登录页，不会触发免责声明弹窗。
- `/consultation` 路由 meta 为 `requiresAuth: false`（现有配置），无需修改 -- 医生列表页允许未登录用户浏览，但点击"开始咨询"触发路由跳转时由目标路由 `/consultation/doctor/:id` 的 `requiresAuth: true` 拦截。

### 验收标准

- [ ] 直接访问 `/consultation/doctor/1` → 未登录时重定向至 `/login`（带 redirect query）。
- [ ] 已登录但未接受免责声明 → 首次访问时弹出免责声明弹窗 → 同意后进入对话。
- [ ] 完整用户路径: Consultation 医生列表 → 点击卡片 → DoctorChatView 对话 → SSE 收发 → 返回按钮。
- [ ] `vue-tsc --noEmit` 零错误。
- [ ] `vite build` 零错误。

---

## 核心用户路径验收标准（5条）

本轮全部任务完成后，以下 5 条核心用户路径必须全部通过:

### AC-1: 从 Consultation 页点击医生卡片 → 进入 DoctorChatView → 发送消息 → 接收 SSE 流式回复

- **前置**: 用户已登录且已接受免责声明。
- **步骤**:
  1. 访问 `/consultation`，医生列表正常渲染（含头像、姓名、职称、科室、简介）。
  2. 点击某位医生的"开始咨询"按钮。
  3. 路由跳转至 `/consultation/doctor/{id}`，顶部展示该医生信息。
  4. 输入消息文本，点击发送或按 Enter。
  5. 消息列表出现用户消息（右对齐），AI 回复逐字流式出现（左对齐）。
  6. 回复完成后，`message_end` 事件的 `conversation_id` 被保存。
- **验证工具**: DevTools Network 面板 + Application 面板（localStorage `qrzl_conv_{doctorId}`）。

### AC-2: 断网场景 → 重连 → 对话上下文恢复（conversation_id 未丢失）

- **步骤**:
  1. 在 DoctorChatView 中已建立对话（至少一个来回）。
  2. DevTools Network 面板切换为 Offline。
  3. 发送新消息 → 页面展示重连提示（或连接中断提示条）。
  4. 切换回 Online → 检查是否自动重连。
  5. 重连成功后发送消息，请求体包含之前的 `conversation_id`。
- **简化版（v3 交付）**: 固定间隔 3 次重试即可通过。指数退避增强推迟至 v4。

### AC-3: 切换医生 → 旧连接 abort → 新连接建立 → 独立 conversation_id

- **步骤**:
  1. 在 DoctorChatView 中（医生 A，`doctorId=1`），已建立对话并获得 `conversation_id`。
  2. 返回 Consultation 页，点击医生 B（`doctorId=2`）的"开始咨询"。
  3. 检查 Network 面板: 医生 A 的 SSE 连接已被 cancel。
  4. 与医生 B 对话 → 获得的 `conversation_id` 与医生 A 不同。
  5. 返回医生 A → 再次对话 → 使用之前保存的医生 A 的 `conversation_id`。
- **简化版（v3 交付建议）**: v3 仅验证单医生 scenario（AC-2 覆盖），多医生独立会话推迟至 v4。

### AC-4: 组件卸载 → SSE 连接关闭（AbortController cleanup）

- **步骤**:
  1. 在 DoctorChatView 中正在进行 SSE 流式响应（`isStreaming === true`）。
  2. 点击返回按钮或浏览器后退 → 路由离开 DoctorChatView。
  3. Network 面板确认: 正在进行的 `POST /api/chat/doctor/:id` 请求状态为 canceled。
  4. 再次进入同一医生的 DoctorChatView → 页面正常加载，无残留连接。
- **验证工具**: DevTools Network 面板 + console（无未捕获异常）。

### AC-5: `vue-tsc --noEmit` + `vite build` 零错误

- **步骤**:
  1. 在项目根目录执行 `npx vue-tsc --noEmit`。
  2. 确认输出无任何 TypeScript 类型错误。
  3. 执行 `npx vite build`。
  4. 确认构建成功（无 warning 或 error）。
- **特别检查点**:
  - `useChatApi.ts` 的 `sendChatMessage` 类型与 `chatStore.ts` 调用处一致。
  - `DoctorChatView.vue` 模板中使用的 chatStore 属性/方法均在 chatStore 中暴露。
  - `Consultation.vue` 和 `DoctorChatView.vue` 的 import 路径正确。

---

## 可推迟项清单

以下子任务可在 v3 中简化交付或推迟至 v4，以降低本轮工时和调试复杂度:

| 项目 | 所在任务组 | v3 简化交付策略 | v4 完整交付 | 节省工时 |
|------|:--------:|---------------|-----------|:------:|
| **断线重连指数退避** | G4 | 固定间隔 3 次重试（2s/4s/8s） | 指数退避 1s→30s，最大 5 次 | ~2h |
| **多医生独立会话路由** | G4 | 仅单医生对话（v3 只验证 `doctorId=1`） | Map<number,string> 完整多医生切换 | ~4h |
| **fabOpen 悬浮按钮状态** | G4 | 移除或留空函数体 | 完整展开/收起动画 | ~1h |
| **Consultation 在线标识** | G5 | `v-if="doctor.is_online !== false"`（双阴性保护，字段不存在时不报错不显示） | 后端 is_online 字段就绪后激活 | 0h（模板已占位） |
| **DoctorChatView 免责声明弹窗（组件内）** | G6 | 路由守卫 `requiresDisclaimer: true` 已覆盖（G7），组件内不再重复弹窗 | 如产品要求双重确认，可额外增加 | 0h（路由守卫已满足） |
| **消息内容 Markdown 渲染** | G6 | 使用 `marked.parse()` 基础渲染 | 增加代码高亮、表格样式等增强 | ~1h |

**推荐 v3 简化交付方案**:
- 工时: 36-52h → **28-40h**（节省约 8-12h）
- 核心功能完整性: AC-1/AC-2/AC-4/AC-5 全部通过，AC-3 部分通过（单医生 scenario）。
- 风险降低: 指数退避和多医生路由是 SSE 调试的两个主要障碍源，推迟后可显著降低关键路径风险。

---

## 文件修改清单

| 文件 | G1 | G2 | G3 | G4 | G5 | G6 | G7 | 操作 | 预估行数 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|------|:------:|
| `src/composables/useChatApi.ts` | + | ~ | ~ | ~ | | | | **新建** | ~50行 |
| `src/stores/chatStore.ts` | | ++ | ++ | ++ | | | | **重写** (从13行骨架) | ~200行 |
| `src/types/api.ts` | + | | | | | | | 修改（追加 DoctorDetail） | ~5行 |
| `src/views/Consultation.vue` | | | | | ++ | | | **重写** (从7行占位) | ~120行 |
| `src/views/DoctorChatView.vue` | | | | | | ++ | | **新建** | ~200行 |
| `src/router/index.ts` | | | | | | | + | 修改（追加1条路由） | ~8行 |
| **合计** | ~50 | ~60 | ~70 | ~70 | ~120 | ~200 | ~8 | | **~578行** |

---

## 风险提示

1. **后端 SSE API 就绪状态**（概率: 中，影响: 高）: 在 G1 开始前，建议用 curl 验证 `POST /api/chat/doctor/:id` 端点可用性:
   ```bash
   curl -X POST http://localhost:3000/api/chat/doctor/1 \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{"message":"你好"}'
   ```
   若不可用，需先实现 Mock SSE 服务器（或与后端协调接口开发进度）。

2. **chatStore SSE 管道调试复杂度**（概率: 中高，影响: 高）: `fetch + ReadableStream` 的 chunk 边界处理、`\n\n` 分隔、JSON 解析异常是已知高耗时领域。建议 G3 (SSE 解析) 由最有 SSE 开发经验的开发者负责。

3. **G1 useChatApi.ts 与 authStore 循环依赖**（概率: 低，影响: 中）: `sendChatMessage` 需要 token 构造 Authorization header。若 useChatApi.ts 直接 import authStore，且 authStore 未来引用 chatStore，会形成循环依赖。缓解措施: token 通过函数参数传入，或 useChatApi.ts 不 import 任何 store。

4. **Consultation.vue 重写超估**（概率: 低，影响: 中）: 医生列表 UI 有明确设计文档参考（4.1.3节组件树 + 流程图），可复用 Home.vue 的医生卡片样式模式。

5. **`vue-tsc --noEmit` 新增错误**（概率: 中，影响: 低）: 新建 3 个文件 + 重写 2 个文件，类型定义链可能引入新错误。G7 编译验证环节应优先执行，确保尽早暴露问题。

---

## 跨轮次依赖就绪确认

| 前置依赖 | 来自轮次 | 状态 | 对 v3 的影响 |
|---------|:------:|:----:|------------|
| G14 (success 拦截器) → S5b-1 | v2 | **已完成** | useChatApi.ts 走 axios 的函数（getDoctorInfo）自动受益于统一错误拦截。sendChatMessage 使用原生 fetch 不走 axios 拦截器，需在 chatStore 中自行处理 401。 |
| S1/S2 (sessionStorage 缓存) → v3 | v1 | **已完成** | v3 不直接依赖 S1/S2。仅 S8 联动清理依赖 S1/S2，v3 无此需求。 |
| S5a (ArticleDetailView) → v3 | v1 | **已完成** | 无交叉依赖。文章详情功能与医生对话功能完全独立。 |

**结论**: 所有跨轮次硬性依赖已满足，v3 可以立即开始。

---

*第3轮任务文件结束。下一轮 v4 将处理: P3 层任务（G7/G8/G12 工具抽取 + S10 XSS 加固 + G3/G6 Punch UI 完善）及 v3 可推迟项的完整交付。*
