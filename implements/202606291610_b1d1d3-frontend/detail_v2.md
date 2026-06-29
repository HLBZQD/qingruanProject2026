# 详细设计（v2）

## 概述

实现 D1 — 会话历史加载功能。在 `src/types/sse.ts` 新增 `ConversationHistoryItem` 类型；在 `src/composables/useChatApi.ts` 新增两个历史会话 API 函数（fetch + Bearer token 鉴权）；在 `src/stores/chatStore.ts` 新增历史会话 state 与 actions；在 `src/views/DoctorChatView.vue` 新增历史会话入口 UI（header 按钮 + 弹层列表）。

**范围**：4 个文件修改，无新文件创建。
**前置**：无（B1 已通过 v1 完成，D1 无依赖）。
**后置**：D3 可依赖 D1 中 chatStore.ts 的新增 state/actions 暴露模式。

## 文件规划

| 文件路径 | 操作 | 职责 |
|---------|------|------|
| `src/types/sse.ts` | 修改 | 新增 `ConversationHistoryItem` 接口 |
| `src/composables/useChatApi.ts` | 修改 | 新增 `getDoctorConversationHistory`、`getAssistantConversations` |
| `src/stores/chatStore.ts` | 修改 | 新增历史会话 state（3 个 ref）+ actions（3 个函数）+ return 导出 |
| `src/views/DoctorChatView.vue` | 修改 | 新增历史会话按钮 + 弹层列表 UI |

## 类型定义

### ConversationHistoryItem

**形态**：interface
**文件**：`src/types/sse.ts`（追加在 `ChatMessage` 之后、文件末尾之前）
**职责**：表示 Dify 历史会话列表项（会话元数据，非消息内容）

```typescript
/**
 * Dify 历史会话列表项。
 *
 * 来源：后端 GET /api/chat/doctor/:id/conversations 和
 *       GET /api/assistant/conversations 响应 data 数组元素。
 *
 * 字段对齐 callDifyGetConversations 映射（server/services/difyService.js:134-166）：
 *   conversation_id ← item.id（Dify 返回的 UUID）
 *   name            ← item.name（用户输入的第一条消息摘要作为会话名称）
 *   created_at      ← 映射为 ISO 字符串（new Date(item.created_at * 1000).toISOString()）
 */
export interface ConversationHistoryItem {
  /** Dify 会话 UUID（恢复会话时作为 conversation_id 参数传入 sendChatMessage） */
  conversation_id: string
  /** 会话名称（Dify 自动生成，通常为用户第一条消息摘要） */
  name: string
  /** 会话创建时间 ISO 8601 字符串（如 "2026-06-29T10:30:00.000Z"） */
  created_at: string
}
```

**类型关系**：独立类型，无继承/实现。被 `useChatApi.ts` 和 `chatStore.ts` 消费。

## API 函数设计

### getDoctorConversationHistory

**文件**：`src/composables/useChatApi.ts`
**形态**：async 函数（模块作用域导出）

```typescript
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
): Promise<ConversationHistoryItem[]>
```

**实现签名**：

```typescript
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
```

### getAssistantConversations

**文件**：`src/composables/useChatApi.ts`
**形态**：async 函数（模块作用域导出）

```typescript
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
): Promise<ConversationHistoryItem[]>
```

**实现签名**：

```typescript
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
```

**新增 import**（useChatApi.ts 顶部追加）：

```typescript
import type { ConversationHistoryItem } from '@/types/sse'
```

## Store 扩展设计（chatStore.ts）

### 新增 state

在现有 `const conversations = ref<ChatMessage[]>([])` 之后追加：

```typescript
/** 历史会话列表（Dify 返回的会话元数据数组，非消息内容） */
const conversationHistory = ref<ConversationHistoryItem[]>([])

/** 历史会话加载中标志 */
const historyLoading = ref(false)

/** 历史会话加载错误消息（空字符串表示无错误） */
const historyError = ref('')
```

**新增 import**（chatStore.ts 顶部追加）：

```typescript
import type { ConversationHistoryItem } from '@/types/sse'
import { getDoctorConversationHistory, getAssistantConversations } from '@/composables/useChatApi'
```

**注意**：现有第 4 行已 `import { sendChatMessage, sendAssistantChatMessage, sendAdminChatMessage } from '@/composables/useChatApi'`，需将新增的两个函数合并到同一 import 语句中：

```typescript
import {
  sendChatMessage,
  sendAssistantChatMessage,
  sendAdminChatMessage,
  getDoctorConversationHistory,
  getAssistantConversations,
} from '@/composables/useChatApi'
```

### 新增 actions

#### loadDoctorConversationHistory

```typescript
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
```

#### loadAssistantConversationHistory

```typescript
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
```

#### clearConversationHistory

```typescript
/**
 * 清空历史会话列表 state。
 *
 * 调用时机：弹层关闭、切换医生、或组件卸载时调用。
 */
function clearConversationHistory(): void {
  conversationHistory.value = []
  historyError.value = ''
}
```

### return 导出块追加

在现有 `return { ... }` 块末尾（`navigate` 之后、`}` 之前）追加：

```typescript
    // state — 历史会话
    conversationHistory,
    historyLoading,
    historyError,

    // actions — 历史会话
    loadDoctorConversationHistory,
    loadAssistantConversationHistory,
    clearConversationHistory,
```

**位置注意**：追加在 `navigate,` 之后、`}`（第 760 行）之前。保持现有导出顺序（state → actions）不变。

## UI 设计（DoctorChatView.vue）

### 新增本地状态

```typescript
/** 历史会话弹层可见性 */
const showHistoryPanel = ref(false)
```

### 新增 computed

无需新增 computed。`chatStore.conversationHistory`、`chatStore.historyLoading`、`chatStore.historyError` 直接从 store 读取。

### 新增函数签名

```typescript
/**
 * 切换历史会话弹层显示/隐藏。
 * 打开时自动加载历史会话列表；关闭时清空历史 state。
 */
function toggleHistoryList(): void {
  showHistoryPanel.value = !showHistoryPanel.value
  if (showHistoryPanel.value) {
    loadHistory()
  } else {
    chatStore.clearConversationHistory()
  }
}

/**
 * 加载当前医生的历史会话列表。
 * 从 authStore 获取 token，从 route.params.id 获取 doctorId。
 */
function loadHistory(): void {
  const token = authStore.token
  if (!token) return
  const doctorId = Number(route.params.id)
  if (!Number.isFinite(doctorId) || doctorId <= 0) return
  chatStore.loadDoctorConversationHistory(doctorId, token)
}

/**
 * 选中某个历史会话并恢复。
 * 调用 chatStore.setDoctorConversation 设置 conversation_id，
 * 清空当前消息列表（切换会话上下文），关闭弹层。
 *
 * @param item - 选中的历史会话项
 */
function selectHistorySession(item: ConversationHistoryItem): void {
  const doctorId = Number(route.params.id)
  chatStore.setDoctorConversation(doctorId, item.conversation_id)
  // 清空当前消息列表以展示新会话上下文
  chatStore.conversations.length = 0
  showHistoryPanel.value = false
  chatStore.clearConversationHistory()
}

/**
 * 格式化 ISO 时间字符串为 "YYYY-MM-DD HH:mm"。
 * 复用现有 formatTime(timestamp: number) 的命名空间（新函数为 formatHistoryTime）。
 *
 * @param isoString - ISO 8601 时间字符串（如 "2026-06-29T10:30:00.000Z"）
 * @returns 格式化后的时间字符串，解析失败返回原始字符串
 */
function formatHistoryTime(isoString: string): string {
  if (!isoString) return ''
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return isoString
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}
```

**新增 import**（DoctorChatView.vue 顶部追加）：

```typescript
import { getDoctorConversationHistory } from '@/composables/useChatApi'
import type { ConversationHistoryItem } from '@/types/sse'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import ErrorRetry from '@/components/ErrorRetry.vue'
import EmptyState from '@/components/EmptyState.vue'
```

**注意**：`getDoctorConversationHistory` 导入用于类型引用（`formatHistoryTime` 的参数类型），实际数据通过 `chatStore.loadDoctorConversationHistory` 间接加载。但 `selectHistorySession` 的参数类型 `ConversationHistoryItem` 需要此类型导入。

**简化方案**：`getDoctorConversationHistory` 不直接导入到 DoctorChatView — 历史加载全部通过 chatStore 代理。仅需导入 `ConversationHistoryItem` 类型和三个共享组件。

```typescript
import type { ConversationHistoryItem } from '@/types/sse'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import ErrorRetry from '@/components/ErrorRetry.vue'
import EmptyState from '@/components/EmptyState.vue'
```

### `<template>` 模板变更

#### Header 区域新增历史按钮

在现有 `<button class="btn-delete">` 之前插入：

```html
<button
  class="btn-history"
  @click="toggleHistoryList"
  title="历史会话"
  aria-label="历史会话"
>
  <i class="fas fa-history"></i>
</button>
```

**位置**：header 内三按钮从左到右依次为 `.btn-back` → `.doctor-info-bar`（flex:1）→ `.btn-history` → `.btn-delete`。

#### 历史会话弹层

紧接 `</header>` 之后、`<div class="disclaimer-bar">` 之前插入：

```html
<!-- 历史会话弹层 -->
<div v-if="showHistoryPanel" class="history-panel-overlay" @click.self="toggleHistoryList">
  <div class="history-panel">
    <div class="history-panel-header">
      <h3>历史会话</h3>
      <button class="btn-close-panel" @click="toggleHistoryList" aria-label="关闭">
        <i class="fas fa-times"></i>
      </button>
    </div>

    <div class="history-panel-body">
      <!-- 加载中 -->
      <SkeletonLoader
        v-if="chatStore.historyLoading"
        type="list"
        :rows="3"
      />

      <!-- 加载失败 -->
      <ErrorRetry
        v-else-if="chatStore.historyError"
        :message="chatStore.historyError"
        @retry="loadHistory"
      />

      <!-- 空列表 -->
      <EmptyState
        v-else-if="chatStore.conversationHistory.length === 0"
        icon="fa-history"
        title="暂无历史会话"
        description="当前医生没有历史对话记录"
      />

      <!-- 会话列表 -->
      <ul v-else class="history-list">
        <li
          v-for="item in chatStore.conversationHistory"
          :key="item.conversation_id"
          class="history-item"
          @click="selectHistorySession(item)"
        >
          <div class="history-item-icon">
            <i class="fas fa-comment-dots"></i>
          </div>
          <div class="history-item-info">
            <span class="history-item-name">{{ item.name || '未命名会话' }}</span>
            <span class="history-item-time">{{ formatHistoryTime(item.created_at) }}</span>
          </div>
          <div class="history-item-arrow">
            <i class="fas fa-chevron-right"></i>
          </div>
        </li>
      </ul>
    </div>
  </div>
</div>
```

### `<style scoped>` 新增样式

在现有 `</style>` 之前追加：

```css
/* ===== 历史会话按钮 ===== */
.btn-history {
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
.btn-history:hover {
  color: var(--color-primary);
  background: rgba(74, 144, 217, 0.1);
}

/* ===== 历史会话弹层 ===== */
.history-panel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.history-panel {
  width: 100%;
  max-width: 768px;
  max-height: 60vh;
  background: var(--color-card);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.25s ease-out;
}
@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

/* ===== 弹层头部 ===== */
.history-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-divider);
  flex-shrink: 0;
}
.history-panel-header h3 {
  font-size: var(--font-size-h4);
  font-weight: 700;
  color: var(--color-text-primary);
}
.btn-close-panel {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 14px;
  border-radius: var(--radius-full);
  cursor: pointer;
}

/* ===== 弹层内容区 ===== */
.history-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-sm) 0;
}

/* ===== 会话列表 ===== */
.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.history-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  cursor: pointer;
  transition: background 0.15s;
}
.history-item:hover,
.history-item:active {
  background: var(--color-bg);
}
.history-item-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  background: var(--color-primary-light);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.history-item-icon i {
  font-size: 14px;
  color: var(--color-primary);
}
.history-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.history-item-name {
  font-size: var(--font-size-body);
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.history-item-time {
  font-size: 11px;
  color: var(--color-text-secondary);
}
.history-item-arrow {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
  font-size: 12px;
}
```

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| 网络错误（fetch 抛错） | `getDoctorConversationHistory`/`getAssistantConversations` 中 `!res.ok` 抛 Error → store catch 设置 `historyError` → UI 显示 `<ErrorRetry>` |
| HTTP 401（token 过期） | fetch 返回 401 → `!res.ok` 抛 Error → store 设置 `historyError`（不触发 useApi 拦截器的自动跳转）→ UI 显示 `<ErrorRetry>`，用户可点击重试 |
| 后端返回空数组（无历史） | `json.data` 为 `[]` → store 写空数组 → UI 显示 `<EmptyState>` |
| 后端返回 success:false | `!res.ok` 为 false（200 响应），但 `json.data` 可能为 undefined → `(json.data as ConversationHistoryItem[]) \|\| []` 降级为空数组 |
| `/api/chat/doctor/:id/conversations` 中 `:id` 无效 | `Number(route.params.id)` 产生 `NaN` → `loadHistory()` 的 `Number.isFinite` 守卫提前 return |
| 弹层打开时 token 为空 | `loadHistory()` 中 `!token` 守卫提前 return |
| 用户快速点击"选择会话" | `selectHistorySession` 同步操作（set Map + 清空数组 + 关弹层），无竞态风险 |
| localStorage 写入失败 | `setDoctorConversation` 内部已 try/catch 静默降级（现有逻辑，不新增） |

**错误状态重置**：
- 弹层关闭（`toggleHistoryList` 关闭分支或点击 overlay/关闭按钮）→ `clearConversationHistory()` 清空 `historyError` 和 `conversationHistory`
- 弹层打开 → `loadHistory()` 先重置 `historyLoading=true, historyError=''`

## 行为契约

### 前置条件
- 用户已进入 `/consultation/chat/:id` 路由，`DoctorChatView.vue` 已渲染
- `loadDoctor()` 已完成医生信息加载，`chatStore.currentDoctorId` 已设置
- `authStore.token` 存在（已登录）

### 后置条件
- **查看历史成功**：弹层展示会话列表，用户可浏览
- **选择会话成功**：`chatStore.doctorConversations` Map 已更新目标 conversation_id，当前消息列表已清空，弹层已关闭，后续 sendMessage 将携带恢复的 conversation_id
- **加载失败**：弹层中显示 `<ErrorRetry>`，用户可重试
- **无历史**：弹层中显示 `<EmptyState>`
- **关闭弹层**：历史 state 已清空，不影响当前对话

### 状态变化规则

1. **弹层状态机**：`showHistoryPanel: false → (点击按钮) → true → (加载完成) → 展示列表 / 空态 / 错误态 → (选择会话 / 关闭) → false`
2. **历史加载流程**：
   ```
   IDLE → (toggleHistoryList 打开) → LOADING (historyLoading=true) → SUCCESS (conversationHistory 写入) / ERROR (historyError 写入)
   ```
3. **会话恢复**：`selectHistorySession` → `setDoctorConversation` 写入 Map + localStorage → 清空 `conversations` → 关闭弹层
4. **与现有对话不冲突**：
   - 弹层打开/关闭不修改 `conversations`（仅选择会话恢复时清空）
   - 弹层打开/关闭不修改 `isStreaming`（不干扰活跃 SSE 连接）
   - 弹层打开期间仍可与当前医生正常对话（用户可关闭弹层继续对话）

### 方法调用顺序

```
用户点击"历史会话"按钮
  → toggleHistoryList()
    → showHistoryPanel = true
    → loadHistory()
      → authStore.token 校验
      → doctorId 校验
      → chatStore.loadDoctorConversationHistory(doctorId, token)
        → historyLoading = true
        → getDoctorConversationHistory(doctorId, token)  // fetch GET
        → conversationHistory = result
        → historyLoading = false

用户点击某个会话项
  → selectHistorySession(item)
    → chatStore.setDoctorConversation(doctorId, item.conversation_id)
    → chatStore.conversations.length = 0
    → showHistoryPanel = false
    → chatStore.clearConversationHistory()

用户点击 overlay / 关闭按钮
  → toggleHistoryList()
    → showHistoryPanel = false
    → chatStore.clearConversationHistory()
```

## 依赖关系

### 依赖的已有模块

| 模块 | 导入方式 | 用途 |
|------|----------|------|
| `vue` | `import { ref } from 'vue'` | 响应式状态定义（chatStore 中新增 3 个 ref；DoctorChatView 中新增 showHistoryPanel ref） |
| `@/types/sse` | `import type { ConversationHistoryItem } from '@/types/sse'` | 类型标注（useChatApi 返回值、chatStore state、DoctorChatView 参数） |
| `@/composables/useChatApi` | `import { getDoctorConversationHistory, getAssistantConversations } from '@/composables/useChatApi'` | 底层 fetch 调用（chatStore actions 中调用） |
| `@/stores/chatStore` | `import { useChatStore } from '@/stores/chatStore'` | store 实例（DoctorChatView 通过 chatStore 访问 state/actions） |
| `@/stores/authStore` | `import { useAuthStore } from '@/stores/authStore'` | 获取 token（DoctorChatView 中 `authStore.token`） |
| `vue-router` | `import { useRoute } from 'vue-router'` | 读取路由参数 `route.params.id` |
| `@/components/SkeletonLoader.vue` | import 组件 | 加载中骨架屏 |
| `@/components/ErrorRetry.vue` | import 组件 | 加载失败重试 |
| `@/components/EmptyState.vue` | import 组件 | 空列表提示 |

### 依赖的后端接口

| 方法 | 路径 | 响应 | 错误 |
|------|------|------|------|
| GET | `/api/chat/doctor/:id/conversations` | `{ success: true, data: ConversationHistoryItem[] }` | 401/500 等 HTTP 错误 |
| GET | `/api/assistant/conversations` | `{ success: true, data: ConversationHistoryItem[] }` | 同上 |

### 暴露给后续任务的接口

| 接口 | 位置 | 用途 |
|------|------|------|
| `ConversationHistoryItem` 类型 | `src/types/sse.ts` | D3 及后续轮次复用 |
| `getAssistantConversations(token)` | `src/composables/useChatApi.ts` | AssistantChatView 后续轮次调用 |
| `chatStore.loadAssistantConversationHistory(token)` | `src/stores/chatStore.ts` | AssistantChatView 后续轮次调用 |
| `chatStore.loadDoctorConversationHistory(id, token)` | `src/stores/chatStore.ts` | 其他视图调用 |
| `chatStore.conversationHistory` / `historyLoading` / `historyError` | `src/stores/chatStore.ts` | 任何组件消费历史会话状态 |

## 构建验证

命令：`npm run build:client`（执行 `vue-tsc -b && vite build`）

验证要点：
- `vue-tsc` 类型检查：确保 `ConversationHistoryItem` 导入路径正确、`chatStore` 新增 state/actions 类型推断正确、`v-for` 中 item 类型推断正确、模板中组件 props 类型匹配
- `vite build`：确保新导入（`SkeletonLoader`/`ErrorRetry`/`EmptyState` 组件 + 类型导入）路径可解析、scoped CSS 无语法错误

## 不变式检查

1. **现有对话功能不受影响**：新增代码仅在 `showHistoryPanel = true` 时渲染弹层，不影响消息列表、输入框、发送逻辑、SSE 流、清空功能
2. **现有 store 功能不受影响**：新增 state/actions 为纯增量追加，不修改现有任何 state/action 签名或逻辑
3. **现有 useChatApi 函数不受影响**：新增 2 个 fetch 函数为纯增量，不修改现有 `sendChatMessage`/`getDoctorInfo` 等
4. **v1（B1 Login.vue）不受影响**：D1 涉及文件与 B1 修改的 `Login.vue` 无交集
5. **conversations 与 conversationHistory 命名不冲突**：前者为 `ChatMessage[]`（消息内容），后者为 `ConversationHistoryItem[]`（会话元数据列表）
