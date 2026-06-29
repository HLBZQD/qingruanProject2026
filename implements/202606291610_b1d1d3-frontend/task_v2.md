# 任务指令（v2）

## 动作
NEW

## 任务描述
实现 D1 — 会话历史加载功能：
1. `src/types/sse.ts` — 新增 `ConversationHistoryItem` 类型
2. `src/composables/useChatApi.ts` — 新增 `getDoctorConversationHistory` 和 `getAssistantConversations`
3. `src/stores/chatStore.ts` — 新增历史会话 state 和 actions（含 return 导出块）
4. `src/views/DoctorChatView.vue` — 新增历史会话入口 UI（header 按钮 + 弹层列表）

## 选择理由
D1 无前置依赖，底层 API/Store 优先于 UI；且 D1 的 chatStore.ts 修改是 D3 的前置——先完成 D1 的 store 增量可避免 D3 回改 chatStore.ts 冲突。B1 已完成并通过验证。

## 任务上下文

### 需求摘要
- 后端 `GET /api/chat/doctor/:id/conversations` 和 `GET /api/assistant/conversations` 已实现
- 响应格式：`{success:true, data:[{conversation_id, name, created_at}, ...]}`
- 历史会话返回的是**会话列表**（conversation_id + name + created_at），**不是消息内容**
- 恢复会话 = 设置 conversation_id（调用 chatStore.setDoctorConversation），后续 sendMessage 携带该 id 续接 Dify 上下文
- 鉴权方式：fetch + Bearer token（与 sendChatMessage 一致），不使用 useApi 的 axios 拦截器

### 1. 类型定义（src/types/sse.ts）
`ConversationHistoryItem`：`{conversation_id: string; name: string; created_at: string}` — 放在 `src/types/sse.ts`，参考后端返回结构

### 2. API 函数（src/composables/useChatApi.ts）
```typescript
getDoctorConversationHistory(doctorId: number, token: string): Promise<ConversationHistoryItem[]>
```
- GET `/api/chat/doctor/${doctorId}/conversations`
- Headers: `Authorization: Bearer ${token}`
- 解析 `res.json()` → 检查 `!res.ok` 抛错 → 返回 `json.data`（数组）
- 401/!ok 抛 Error 由调用方捕获

```typescript
getAssistantConversations(token: string): Promise<ConversationHistoryItem[]>
```
- GET `/api/assistant/conversations`
- 同上 Headers 和解析逻辑

### 3. Store 扩展（src/stores/chatStore.ts）

新增 state：
- `conversationHistory = ref<ConversationHistoryItem[]>([])`
- `historyLoading = ref(false)`
- `historyError = ref('')`

新增 actions：
- `loadDoctorConversationHistory(doctorId: number, token: string): Promise<void>`
  — 设置 historyLoading=true、historyError='' → 调用 getDoctorConversationHistory → 写入 conversationHistory → catch 设置 historyError → finally historyLoading=false
- `loadAssistantConversationHistory(token: string): Promise<void>`
  — 同上，调用 getAssistantConversations
- `clearConversationHistory(): void`
  — conversationHistory = []; historyError = ''

在 store 导出 return { ... } 块中暴露以上 3 个 state + 3 个 actions。注意：`conversations` 已存在，新增的 history state 命名为 `conversationHistory` 以避免混淆。

### 4. UI（src/views/DoctorChatView.vue）

**Header 区域新增"历史会话"按钮**（与清空按钮 `.btn-delete` 并列）：
- 图标：`fa-history`
- 点击触发 `toggleHistoryList()`

**弹层/下拉列表**（点击按钮后展示，覆盖在消息区域上方或作为独立弹出面板）：
- 加载中：`<SkeletonLoader type="list" :rows="3" />`
- 加载失败：`<ErrorRetry :message="chatStore.historyError" @retry="loadHistory" />`
- 空列表：`<EmptyState icon="fa-history" title="暂无历史会话" description="当前医生没有历史对话记录" />`
- 有数据 (v-for)：每项显示 `name` + `created_at`(格式化为 `YYYY-MM-DD HH:mm`)，点击某项 → `chatStore.setDoctorConversation(doctorId, item.conversation_id)` → 关闭弹层 → 可提示"已恢复历史会话"

**关键交互逻辑**：
- `loadHistory()` — 获取 token（authStore.token）和 doctorId（Number(route.params.id)），调用 `chatStore.loadDoctorConversationHistory(doctorId, token)`
- 弹层关闭不影响当前对话，仅作为查询/选择辅助
- 保持现有对话、SSE 发送、清空、路由监听等功能完全不变
- 保持现有 scoped 样式风格和 CSS 变量系统

### 5. 全局约束
- 严格遵循 `<script setup lang="ts">`、CSS 变量、Tailwind（DoctorChatView 未用 Tailwind，保持 scoped CSS 变量风格）
- 不引入新 npm 依赖
- 不改动未涉及功能
- 必须通过 `npm run build:client`（vue-tsc + vite build）

## 已有代码上下文

### useChatApi.ts（119行）
- 已有 `sendChatMessage`（fetch POST SSE 返回 Response 对象，手动 Bearer token header）
- 已有 `getDoctorInfo`（axios GET 走 useApi 拦截器，取 `res.data.data`）
- 已有 `sendAssistantChatMessage`、`sendAdminChatMessage`（同 fetch + Bearer token 模式）
- 导入：`import { api } from '@/composables/useApi'`、`import type { Doctor } from '@/types/api'`
- **新增 2 个函数需导入 `ConversationHistoryItem` 类型**：`import type { ConversationHistoryItem } from '@/types/sse'`

### chatStore.ts（761行）
- 已有完整 setup store 结构，末尾 `return { ... }` 集中导出
- 已有 state：conversations、isStreaming、activeAbortController、doctorConversations(Map)、currentDoctorId、fabOpen、assistantConversationId、adminConversationId
- 已有 conversation_id 管理：`getDoctorConversation(doctorId)` 查 Map+localStorage、`setDoctorConversation(doctorId, id)` 写 Map+localStorage、`clearDoctorConversation(doctorId)`
- 已有 `switchDoctor(doctorId)`：中止旧连接 + 设置 currentDoctorId + 清空 conversations
- **新增 state/actions 需追加到 return 导出块**

### DoctorChatView.vue（522行）
- 导入：vue/vue-router composables、chatStore、authStore、getDoctorInfo、Doctor、marked、DOMPurify
- Header 结构：`<header class="chat-header">` flex 布局，含 `.btn-back` + `.doctor-info-bar` + `.btn-delete`
- 清空按钮：`<button class="btn-delete" @click="clearChat" title="清空对话">`（fa-trash 图标）
- `loadDoctor()` 获取医生信息并调用 `chatStore.switchDoctor(id)`
- `handleSend()` 取 `authStore.token` 调 `chatStore.sendMessageWithRetry`
- 路由监听 `watch(() => route.params.id)` 自动切换医生
- **新增 history 按钮放在 `.btn-delete` 旁边**，样式与现有 `.btn-back`/`.btn-delete` 一致（32x32，flex 居中，圆图标）

### 后端 API 确认
- `GET /api/chat/doctor/:id/conversations` — `server/routes/chat.js:40-53`，需 auth，查 doctor_information 表 → decryptChatToken → callDifyGetConversations
- `GET /api/assistant/conversations` — `server/routes/assistant.js:64-74`，需 auth，直接 callDifyGetConversations(DIFY_ASSISTANT_APP_KEY)
- `callDifyGetConversations`（`server/services/difyService.js:134-166`）无 DIFY_API_BASE 时返回 []（mock 模式）；有值时映射返回 `[{conversation_id: item.id, name, created_at}]`
- 两端点均返回：`{success:true, message:'查询成功', data: [...]}`

### 共享组件（src/components/）
- `SkeletonLoader` — props: `type`('card'|'list'|'text'|'avatar'|'article'|'custom'), `rows`, `avatar`
- `ErrorRetry` — props: `message`, `icon`, `retryText`; emit: `retry`
- `EmptyState` — props: `icon`, `title`, `description`, `actionText`; emit: `action`
