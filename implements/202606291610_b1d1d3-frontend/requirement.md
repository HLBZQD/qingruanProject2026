# 实现需求：B1 + D1 + D3 前端差距补完

> 依据 `docs/2_detailed_design_v4.md`（第13版设计文档）与 `docs/4_frontend_gap_todo_v2.md`（前端差距诊断报告 v2）。

## 总体技术栈

- Vue 3.5 `<script setup lang="ts">` + Composition API + Pinia 3（setup store 风格）+ Vue Router 4 + Vite 8 + TypeScript 6
- 构建校验命令：`npm run build:client`（实际执行 `vue-tsc -b && vite build`）——这是本项目的类型检查/编译验证途径，替代框架模板中的 `cjpm test`
- 本项目当前**没有单元测试框架**（package.json 无 vitest/jest 依赖，src/ 下无任何 *.test/spec 文件）。因此验证环节以 `vue-tsc` 类型检查 + `vite build` 构建通过为通过判据；若增写测试需先引入测试框架（本任务范围不建议引入新依赖，验证以类型检查 + 构建为准）。

## 任务上下文（来自差距报告 §12 与设计文档）

### B1 — Login.vue 注册表单（工作量 1.0d，Group B，无前置依赖）

**差距**（报告 §8.3）：`Login.vue` 当前只有登录表单，"立即注册"链接是自环链接（`<router-link to="/login">`），注册表单完全缺失。后端 `POST /api/auth/register` 已实现（`server/routes/auth.js:11-47`），注册成功返回 `{token, role:'user', user:{id,username,avatar}}`（HTTP 201），可直接用 `authStore.setAuth(token, 'user', user)` 自动登录。

**设计依据**（设计文档 §4.1.10，第3417-3436行的注册视图组件树）：
- 登录视图与注册视图在同一页面切换，注册视图默认隐藏
- 注册表单字段：用户名（3-50字符，全局唯一）+ 密码（≥8位，含字母和数字）+ 确认密码 + 错误提示 + 提交按钮
- 切换链接：注册视图底部"已有账号？立即登录"

**实现要求**：
1. 在 `src/views/Login.vue` 添加注册视图，保留现有登录表单功能完全不变
2. 登录/注册视图切换（本地 `view` ref: 'login' | 'register'），通过点击切换链接切换，不走路由
3. 注册表单校验：用户名必填（3-50字符）、密码必填（≥8位含字母和数字）、确认密码必填且与密码一致
4. 校验失败显示 `regErrorMsg`（字段级错误提示，复用现有登录错误的样式风格）
5. 调用 `POST /api/auth/register` —— 通过 `useApi` 的 `api` 实例（走 axios 拦截器，baseURL `/api`，与 authStore.login 一致）。注意：项目无独立 register composable，参考 authStore.login 的 `api.post('/auth/login', ...)` 调用模式。register 响应结构为 `{success, data:{token, role, user}, message}`（success 包装），需从 `res.data.data` 取 token/role/user
6. 注册成功后：调用 `authStore.setAuth(data.token, data.role, data.user)` 完成自动登录 → `router.replace(safeRedirect(route.query.redirect))`（复用现有 safeRedirect 开放重定向防护）
7. 注册失败（用户名已存在返回 409 / 校验错误 422）：显示后端错误消息（`err?.response?.data?.error?.message || '注册失败'`）
8. 保持现有 Tailwind 样式风格与配色（`#4A90D9` 主色）
9. 切换视图时清空对应错误信息

### D1 — 会话历史加载（工作量 1.0d，Group D，无前置依赖）

**差距**（报告 §8.5、§4.2、§11.2）：设计定义 `GET /api/chat/doctor/:id/conversations` 和 `GET /api/assistant/conversations` 两个历史会话接口，后端均已实现，但前端 composable 层和 chatStore 均未实现历史会话加载。当前 `getDoctorConversation` 仅读取本地缓存的 conversation_id，不调用远端。

**后端 API 确认**（已读源码）：
- `GET /api/chat/doctor/:id/conversations`（`server/routes/chat.js:40-53`，需 auth）：调用 Dify `callDifyGetConversations`，返回 `{success:true, message:'查询成功', data: [{conversation_id, name, created_at}, ...]}`
- `GET /api/assistant/conversations`（`server/routes/assistant.js:64-74`，需 auth）：同上结构
- `callDifyGetConversations`（`server/services/difyService.js:134-166`）在无 DIFY_API_BASE 时返回空数组 `[]`（mock 模式）；有 base 时映射 Dify `body.data` 为 `{conversation_id: item.id, name, created_at(ISO)}`

**实现要求**：
1. **扩展 `src/composables/useChatApi.ts`**：
   - 新增 `getDoctorConversationHistory(doctorId: number, token: string): Promise<ConversationHistoryItem[]>` —— 调用 `fetch(\`/api/chat/doctor/${doctorId}/conversations\`, GET, Authorization Bearer)`，解析 `res.data.data` 数组
   - 新增 `getAssistantConversations(token: string): Promise<ConversationHistoryItem[]>` —— 调用 `fetch('/api/assistant/conversations', GET, Authorization Bearer)`，解析 `res.data.data` 数组
   - 这两个端点返回普通 JSON（非 SSE），使用 `fetch` + Authorization header（与 sendChatMessage 一致的鉴权方式），不走 useApi 的 axios 拦截器（因为 axios 拦截器会处理 401 跳转，但这里是按需加载历史，401 应由调用方处理；为保持与现有 sendChatMessage 的鉴权一致性，使用 fetch + Bearer token）。需处理 401（返回空或抛错由调用方决定）和 !ok 的情况
   - 类型：在 `src/types/sse.ts` 或 `src/types/api.ts` 新增 `ConversationHistoryItem`（`{conversation_id: string; name: string; created_at: string}`）。设计文档未明确定义此类型，参考后端返回结构定义
2. **扩展 `src/stores/chatStore.ts`**：
   - 新增 state：`conversationHistory = ref<ConversationHistoryItem[]>([])`、`historyLoading = ref(false)`、`historyError = ref('')`
   - 新增 `loadDoctorConversationHistory(doctorId: number, token: string): Promise<void>` —— 调用 `getDoctorConversationHistory`，写入 conversationHistory/historyLoading/historyError
   - 新增 `loadAssistantConversationHistory(token: string): Promise<void>` —— 调用 `getAssistantConversations`，写入同上 state
   - 新增 `clearConversationHistory(): void` —— 清空历史 state
   - 这些方法在 store 导出中暴露
3. **`src/views/DoctorChatView.vue` 加载历史会话交互 UI**：
   - 新增"历史会话"入口（按钮，放在 header 区域，与现有清空对话按钮并列），点击触发 `loadDoctorConversationHistory`
   - 历史会话以列表/弹层形式展示（conversation name + created_at），用户可选择某个历史会话恢复（设置 chatStore 的 doctorConversation 为该 conversation_id）
   - 注意：Dify 历史会话接口返回的是**会话列表**（conversation_id + name），**不是消息内容**。恢复会话 = 设置 conversation_id，后续 sendMessage 会携带该 id 续接 Dify 上下文。因此 UI 展示的是会话列表，选择会话后调用 `chatStore.setDoctorConversation(doctorId, conversationId)` 并关闭列表
   - 复用现有组件风格（SkeletonLoader/ErrorRetry/EmptyState 可用于加载态/错误态/空态）
4. 保持现有 DoctorChatView 医生对话、SSE 发送、清空对话等功能不变

### D3 — Admin.vue SSE 逻辑统一（工作量 0.4d，Group D，建议与 D1 同人避免 chatStore 冲突）

**差距**（报告 §8.13、§11.2、决策4）：Admin.vue 自行内联实现了 `parseSSEBuffer`/`readSSEStream`/`dispatchSSEEvent`（`Admin.vue:36-119`），与 `chatStore.ts` 重复。chatStore 已暴露 `sendAdminMessage`（含完整 SSE 收发循环 + 消息管理 + isStreaming + 错误处理）但 Admin.vue 未使用。设计文档决策4（第7267-7270行）明确：**切换至 chatStore.sendAdminMessage**（纳入 D3）。

**多模式共享问题**（报告 §11.2、§12 D3）：`chatStore.conversations` 被 doctor/assistant/admin 三种模式共享，Admin.vue 切换后将看到所有模式对话混入同一列表。**需为 conversations 消息新增 `mode` 字段**（'doctor'|'assistant'|'admin'）标记来源模式，Admin.vue 用 computed 过滤 admin 模式消息。

**实现要求（完整迁移 checklist）**：
1. **`src/types/sse.ts`**：为 `ChatMessage` 类型新增可选字段 `mode?: 'doctor' | 'assistant' | 'admin'`
2. **`src/stores/chatStore.ts`**：
   - 在 `sendMessage`/`sendAssistantMessage`/`sendAdminMessage` 构造 userMessage 和 dispatchSSEEvent 构造 assistant/error/fail 消息时，写入对应的 `mode` 字段
   - `dispatchSSEEvent` 中创建 assistant 消息时带上 `activeChatMode.value`；message 增量追加时无需改 mode（已在创建时设置）
   - 确保 `switchDoctor`/`clearAllConversations` 等清空逻辑不受影响
3. **`src/views/Admin.vue`**：
   - 移除内联的 `parseSSEBuffer`/`readSSEStream`/`dispatchSSEEvent`（第36-119行）
   - 模板消息数据源从本地 `messages` ref 切换为 `chatStore.conversations` 的 admin 模式过滤 computed（如 `adminMessages = computed(() => chatStore.conversations.filter(m => m.mode === 'admin'))`）
   - 本地 `isStreaming` ref 切换为 `chatStore.isStreaming`
   - `handleSend` 简化为：取 token → 校验 → `chatStore.sendAdminMessage(text, token)` → 清空 inputText；移除本地 AbortController/SSE 读取/401 处理（chatStore.sendAdminMessage 内部已处理）
   - 移除从 `useAdminApi` 导入 `sendAdminChatMessage`，改从 chatStore 导入 `sendAdminMessage`
   - `isChatEmpty` 改为基于 `adminMessages` computed
   - 保留操作日志视图（logs）全部功能不变
   - 保留 view 切换（chat/logs）逻辑，`switchView('logs')` 仍调 `chatStore.abortActiveConnection()`
4. **`src/composables/useAdminApi.ts`**：移除已成为死代码的 `sendAdminChatMessage`（第28-49行，与 `useChatApi.ts:97-118` 完全重复）。保留 `getAdminLogs`。注意：移除后需检查是否有其他文件引用 `useAdminApi` 的 `sendAdminChatMessage`（grep 确认仅 Admin.vue 引用，D3 改造后 Admin.vue 不再引用）

### 行为等价性验证要求（报告 §12 D3）

迁移后需执行 Admin 对话端到端冒烟验证，覆盖：
- 正常对话（user 消息 + assistant 流式回复 + message_end 会话 id 持久化）
- 流内错误（error 事件 → 错误气泡）
- 多模式隔离（doctor/assistant 消息不混入 admin 列表）

## 全局约束

- 严格遵循项目现有代码风格：`<script setup lang="ts">`、setup store、CSS 变量（var(--color-*)）、Tailwind utility（Login.vue 已用）、SweetAlert2 动态 import 弹窗、`@/` 路径别名
- 不引入新 npm 依赖
- 不修改未涉及的功能
- 每个文件的修改需通过 `vue-tsc` 类型检查
- 设计文档是权威依据，发现设计矛盾在报告中标注，不自行偏离

## 文件清单（预期涉及）

| 文件 | 任务 | 操作 |
|------|------|------|
| `src/views/Login.vue` | B1 | 修改（新增注册视图） |
| `src/composables/useChatApi.ts` | D1 | 修改（新增2个历史会话函数） |
| `src/types/sse.ts` 或 `src/types/api.ts` | D1/D3 | 修改（新增 ConversationHistoryItem、ChatMessage.mode） |
| `src/stores/chatStore.ts` | D1/D3 | 修改（历史会话 state/methods + mode 字段） |
| `src/views/DoctorChatView.vue` | D1 | 修改（历史会话 UI） |
| `src/views/Admin.vue` | D3 | 修改（切换到 chatStore.sendAdminMessage） |
| `src/composables/useAdminApi.ts` | D3 | 修改（移除 sendAdminChatMessage 死代码） |
