# Round 3: 集成一致性审查

## 审查范围

审查所有已实现代码的跨模块集成一致性，覆盖六大集成维度：
- **A. 前后端 API 契约一致性**: 9 个 API composable × 14 个后端路由模块对比请求/响应字段、方法、路径
- **B. Store 与 Component 集成**: 6 个 Pinia Store 与 14 个消费组件的 state/action 交互
- **C. 跨 Store 交互**: Store 间依赖链、清理链、循环依赖风险
- **D. 路由与页面集成**: 路由 meta 定义与页面行为的对应、守卫与拦截器的竞态
- **E. SSE/流式数据集成**: useSSE.ts ↔ chatStore ↔ sseProxy.js 的事件处理链
- **F. 数据持久化集成**: sessionStorage/localStorage 键名唯一性、TTL 一致性、BroadcastChannel 消息格式

审查依据：设计文档 `docs/2_detailed_design_v4.md` §1.5-1.8、§3、§5.2.1.1

---

## 严重问题

### R3-S1. ArticleDetailView.vue: fetchArticle() 从未在 onMounted 中调用，文章详情页永远不加载

- **位置**: `src/views/ArticleDetailView.vue:2,46-76`
- **描述**: `onMounted` 已从 Vue 导入（第2行）但从未被调用。`fetchArticle()` 函数（第46-76行）负责从 API 加载文章内容，但仅在模板的错误重试按钮中被引用（`@click="fetchArticle"`，第194行），未在任何生命周期钩子中触发。初始状态 `loading = ref(true)`（第18行）导致页面始终停留在骨架屏加载态，用户永远看不到文章内容——除非先看到错误页面再点击"重试"。这是一个**完全功能性断裂**，文章详情页无法正常工作。
- **建议修复**: 在 `</script>` 之前添加 `onMounted(fetchArticle)` 或在 `onMounted` 回调中调用 `fetchArticle()`：
  ```typescript
  onMounted(() => {
    fetchArticle()
  })
  ```

### R3-S2. DoctorChatView.vue: 缺少组件和类型导入，导致运行时解析失败

- **位置**: `src/views/DoctorChatView.vue:3-9, 158, 255, 262, 269`
- **描述**: 模板中使用了三个可复用组件——`<SkeletonLoader>`（第255行）、`<ErrorRetry>`（第262行）、`<EmptyState>`（第269行）——但 `<script setup>` 的导入区（第3-9行）中均未导入这些组件。Vue 3 `<script setup>` 要求所有组件须显式导入或全局注册。此外，`ConversationHistoryItem` 类型在第158行 `selectHistorySession(item: ConversationHistoryItem)` 中使用但未导入（该类型定义在 `@/types/sse` 但不在当前文件的导入列表中）。这将导致 Vue 运行时组件解析失败——医生的对话界面无法正常渲染。
- **建议修复**:
  1. 添加组件导入:
     ```typescript
     import SkeletonLoader from '@/components/SkeletonLoader.vue'
     import ErrorRetry from '@/components/ErrorRetry.vue'
     import EmptyState from '@/components/EmptyState.vue'
     ```
  2. 添加类型导入: `import type { ConversationHistoryItem } from '@/types/sse'`

### R3-S3. authStore.clearAuth() 未联动清理 chatStore 和 riskFormStore，401路径和跨标签页登出路径存在状态泄露

- **位置**: `src/stores/authStore.ts:106-129`; `src/composables/useApi.ts:41-54`; `src/stores/authStore.ts:22-28`
- **描述**: `clearAuth()` 正确地调用了 `useHomeStore().clearHomeCache()`（第118行）和 `useLifePlanStore().clearPlanCache()`（第119行），但**遗漏了两个关键清理**：
  1. **chatStore.clearAllConversations() 未调用**: 活跃 SSE 连接未被中止（`abortActiveConnection()` 未触发），conversation_id Map 未清空，消息列表 conversations[] 未清空。且 `chatStore.clearAllConversations()` 已经实现并正确清理 localStorage 中的 `qrzl_conv_*` 键——只是 `clearAuth()` 从未调用它。
  2. **riskFormStore.reset() 未调用**: 风险预测表单数据 `risk_form_data` 在 sessionStorage 中残留，下一个登录用户可能看到上一个用户的风险评估数据。

  此问题在以下三条路径中触发：
  - **路径A（useApi 401 拦截器）**: `useApi.ts:42` → `authStore.clearAuth()` → SSE 连接继续运行 → 用户已跳转至登录页但流式数据继续推送至 chatStore
  - **路径B（BroadcastChannel 跨标签页同步）**: `authStore.ts:28` → 另一标签页登出 → 当前标签页 `clearAuth()` → 同上
  - **路径C（路由守卫 token 过期）**: `router/index.ts:109` → `authStore.clearAuth()` → 同上
  
  对比：Profile.vue 手动登出（第204-210行）**正确**地在调用 `authStore.logout()` 前先调用 `chatStore.abortActiveConnection()` 和 `chatStore.clearAllConversations()`，形成不一致的清理行为。
- **建议修复**: 在 `clearAuth()` 中添加 chatStore 和 riskFormStore 清理：
  ```typescript
  function clearAuth() {
    // ... 现有清理 ...
    
    // 联动清理 chatStore（中止 SSE + 清空对话历史）
    try { 
      const cs = useChatStore()
      cs.abortActiveConnection()
      cs.clearAllConversations()
    } catch { /* Store 未初始化时静默 */ }
    
    // 联动清理风险表单数据
    try { useRiskFormStore().reset() } catch { /* Store 未初始化时静默 */ }
    
    // ... BC 广播 ...
  }
  ```
  注意：需要在 `authStore.ts` 顶部添加 `import { useChatStore } from '@/stores/chatStore'` 和 `import { useRiskFormStore } from '@/stores/riskFormStore'`（不会造成循环依赖：chatStore 通过动态 `import()` 引用 authStore，riskFormStore 完全不引用 authStore）。

### R3-S4. JWT Payload 字段名前后端不一致: `user_id` vs `id`

- **位置**: `src/composables/useAuth.ts:16`; `server/routes/auth.js:32,71`; `server/middleware/auth.js:28`
- **描述**: 前端 `JwtPayload` 接口将用户ID声明为 `user_id?: number`（第16行）。但后端 `jwt.sign()` 在签发 JWT 时使用的字段名是 `id`（`auth.js:32`: `{ id: userId, username, role }`），而非 `user_id`。中间件 `auth.js:28` 在验证时通过 `req.user.user_id = decoded.id` 做了内部重映射，因此 `req.user.user_id` 在后端是正确的。但前端 `parseToken()` 解析 token 后，`payload.id` 存在而 `payload.user_id` 为 `undefined`——此错误被 `[key: string]: any` 索引签名（第26行）在编译期掩盖。所有直接读取 `payload.user_id` 的前端代码将在运行时得到 `undefined`。
- **建议修复**: 将 `useAuth.ts:16` 的 `user_id?: number` 改为 `id?: number`，并添加注释说明中间件内部做了 `user_id = decoded.id` 的映射。

---

## 一般问题

### R3-S5. authStore BroadcastChannel 消息回环：setAuth/clearAuth 无条件重广播导致无限 ping-pong

- **位置**: `src/stores/authStore.ts:23-31, 76-82, 122-128`
- **描述**: `onmessage` handler（第23-31行）在收到 `AUTH_CHANGED` 消息时无条件调用 `setAuth()` 或 `clearAuth()`。但 `setAuth()`（第76-82行）和 `clearAuth()`（第122-128行）均在函数末尾调用 `getBcChannel()?.postMessage(...)` 重广播。这构成无限回环：
  ```
  Tab A: setAuth() → postMessage →
  Tab B: onmessage → setAuth() → postMessage →
  Tab A: onmessage → setAuth() → postMessage →
  ...无限循环
  ```
  两个（或更多）打开的标签页均以相同的认证状态持续互发消息，消耗 CPU 和内存。虽然功能上不会导致错误（两端的认证状态一致），但这是无意义的无限消息循环。
- **建议修复**: 在 `onmessage` handler 中添加去重守卫——比较收到的 token/role 与当前状态是否一致，若完全一致则跳过。或使用 `timestamp` 字段做版本比较，仅当收到的消息更新时才应用：
  ```typescript
  onmessage = (e: MessageEvent) => {
    const d = e.data
    if (d?.type === 'AUTH_CHANGED') {
      // 若当前状态与消息一致，跳过避免回环
      if (d.token === token.value && d.role === role.value) return
      if (d.token) {
        setAuth(d.token, d.role, d.user)
      } else {
        clearAuth()
      }
    }
  }
  ```

### R3-S6. authStore BroadcastChannel 在已登录启动时未初始化，导致跨标签页登出同步失效

- **位置**: `src/stores/authStore.ts:85-104`; `src/main.ts:15`
- **描述**: `syncFromStorage()`（第85-104行）在从 sessionStorage 恢复有效认证数据时，直接设置 ref 值（第100-103行），**但不调用 `getBcChannel()`**。BroadcastChannel 是惰性创建的——仅在 `setAuth()`、`setToken()`、`clearAuth()` 被调用时才创建。这意味着：
  - 当用户在标签页 A 登录后 → 打开新标签页 B → 新标签页 B 通过 `syncFromStorage()` 从 sessionStorage 恢复 token → 但 BroadcastChannel **未被创建** → 标签页 B 对跨标签页登出事件**完全无效**（聋子状态）
  - 如果标签页 A 登出 → 广播 `AUTH_CHANGED` token=null → 标签页 B 收不到 → 标签页 B 继续以已过期的认证状态运行 → 直到某个 API 调用返回 401 才发现
- **建议修复**: 在 `syncFromStorage()` 的末尾显式调用 `getBcChannel()` 初始化 BroadcastChannel 监听：
  ```typescript
  function syncFromStorage() {
    // ... 现有恢复逻辑 ...
    // 初始化跨标签页监听（确保已登录启动的标签页能收到登出广播）
    getBcChannel()
  }
  ```

### R3-G1. useApi 401 拦截器未携带 redirect 参数，登录后无法回跳原页面

- **位置**: `src/composables/useApi.ts:54`
- **设计依据**: 设计文档 §7.1 JWT 鉴权流程: `router.push('/login?redirect=当前路径')`
- **描述**: useApi.ts 的 401 拦截器在第54行执行 `router.push('/login')`，未附带 `redirect` query 参数。路由守卫 `router/index.ts:111` 正确地在无 token 或 token 过期时将 `to.fullPath` 编码为 redirect 参数，但 useApi 中触发的 401（如 token 在 API 调用中途过期）不经路由守卫，用户将被踢到登录页且登录成功后无法回跳到原访问页面。**补充**：R1-G3 已从设计合规角度指出此问题——本轮从集成一致性角度确认其影响面：useApi 401 路径与路由守卫 401 路径的 redirect 行为不一致。
- **建议修复**: 将第54行改为 `router.push('/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search))`

### R3-G2. plan.js 幂等检查在 Dify API 调用之后执行，防双击依赖前端独自承载

- **位置**: `server/routes/plan.js:28,44`; `src/stores/lifePlanStore.ts:127-128`
- **描述**: `checkIdempotent(userId)` 在第44行调用，但 Dify 工作流调用 `callWorkflowBlocking()` 在第28行已经执行完毕（blocking 模式，耗时可达 15s）。如果在 Dify 调用期间（15s 窗口）用户通过另一标签页或网络重试发送了第二个请求，两个请求都会成功调用 Dify（消耗 API token），仅数据库写入被阻止。前端 `lifePlanStore.generate()` 中 `generating` 标志（第128行）是本场景的**唯一有效保护**，但只在同一 Store 实例内有效——无法阻止跨标签页的双击。**补充**：R2-G10 已从代码质量角度指出此问题——本轮从集成一致性角度确认其跨标签页防御缺失。
- **建议修复**: 将 `checkIdempotent` 调用移至 `callWorkflowBlocking` 之前（第27行），使幂等保护在 Dify 调用前生效。同问题也存在于 `articles.js:62-66`——该文件的幂等检查在 Dify 调用前执行（正确），两处应保持一致。

### R3-G3. punch.js 打卡分析使用本地计算替代 Dify AI，与设计文档 §5.2.4 描述的 AI 分析不一致

- **位置**: `server/routes/punch.js:105-177`; `docs/2_detailed_design_v4.md` §5.2.4
- **设计依据**: 设计文档 §5.2.4 定义了 `punch-analysis` Dify 工作流，含 AI 生成的 `adherence_comment` 和 `improvement_suggestions`；§3.2.18 响应格式包含 Dify 生成的依从性评语和改进建议。
- **描述**: `punch.js` 分析端点完全使用本地 JavaScript 模板函数 `generateAdherenceComment()`（第161行，第186-209行）和 `generateImprovementSuggestions()`（第162行，第212-228行）生成离散文本，而非调用 Dify AI 工作流。前端 `PunchAnalysisResponse` 类型的 JSDoc 注释仍写"AI 依从性评语（可能含 Markdown）"和"AI 改进建议列表"，实际后端输出为纯文本（无 Markdown）。目前功能上两端一致（前端正常渲染），但若未来重新接入 Dify AI，输出格式（Markdown 内容）可能变化导致前端渲染异常。
- **建议修复**: 
  - 短期：更新 `PunchAnalysisResponse` 的 JSDoc 注释移除"可能含 Markdown"表述，标注当前为本地模板生成模式
  - 长期：按设计文档 §5.2.4 接入 Dify `punch-analysis` 工作流（需先实现 Express 层的三层降级解析）

### R3-G4. authStore.fetchProfile() — 死代码 Store action，与 Profile.vue 直接 API 调用重复

- **位置**: `src/stores/authStore.ts:149-157`; `src/views/Profile.vue:59-88`
- **描述**: `fetchProfile()` action 定义在 authStore 中（含 profile 字段解析和 setAuth/sessionStorage 写入），但**没有任何组件调用此 action**。Profile.vue 在第60-63行直接调用 `api.get('/user/profile')` 并自行处理 `res.data.data` 解析和 `authStore.setAuth()` 调用。两处逻辑功能等价但独立维护：
  - authStore.fetchProfile(): 解析 profile 为 `{ id, username, role, avatar }` 并更新 user ref 和 sessionStorage
  - Profile.vue loadProfile(): 解析 res.data.data 为 UserProfile 并调用 `authStore.setAuth(storedToken, res.data.data.role, { ... })`
  
  两处对 profile 结构（特别是 `role` 字段）的提取逻辑高度一致，存在维护分叉风险。
- **建议修复**: Profile.vue 改为调用 `authStore.fetchProfile()` 统一入口，删除内联的 profile 解析/设值逻辑。

### R3-G5. DoctorDetail.is_online 后端永不返回，前端类型承诺的字段为死字段

- **位置**: `src/types/models.ts:45-47`; `server/routes/doctors.js:17`; `server/db/init.sql` (doctor_information DDL)
- **描述**: `DoctorDetail` 接口定义 `is_online: boolean` 字段（第45-47行），暗示前端可展示医生的在线状态。但 `doctor_information` 表 DDL 中无 `is_online` 列，后端 `doctors.js:17` 的 SELECT 语句也从未查询或计算此字段。任何依赖 `is_online` 的 UI 组件将始终显示"离线"（`undefined` → falsy），无论实际状态如何。
- **建议修复**: 二选一：①在 `doctor_information` 表中新增 `is_online INTEGER DEFAULT 1` 列并在 SELECT 中包含；②从 `DoctorDetail` 接口中移除 `is_online` 字段（使 `DoctorDetail` 与 `Doctor` 同形）。

### R3-G6. 缺少 `useRiskApi.ts` composable，风险预测 API 调用无契约封装

- **位置**: `src/composables/` 目录缺少 `useRiskApi.ts`; `src/types/api.ts:99-133`
- **设计依据**: 设计文档 §1.4 模块划分明确列出 composables/ 目录含 `useApi.ts`、`useAuth.ts`、`useSSE.ts`、`useUI.ts`（v16 修订前）；新增的 `useHomeApi.ts`、`useLifePlanApi.ts`、`usePunchApi.ts` 等均已按统一模式实现。
- **描述**: 风险预测相关的两个端点（`POST /api/risk/predict` 和 `GET /api/risk/history`）的前端类型定义完整（`RiskPredictRequest`/`RiskPredictResponse`/`RiskHistoryItem`），但没有对应的 `useRiskApi.ts` composable 封装。对比其他 8 个业务领域均有专门的 API composable（useHomeApi / useLifePlanApi / usePunchApi / useChatApi / useArticleApi / useAdviceApi / useAdminApi / useUserApi），风险预测领域缺少 API 封装层导致 Risk.vue 需要直接使用底层 `api` 对象或通过 store 间接调用，打破了项目内一致的"每个业务领域一个 API composable"的架构模式。
- **建议修复**: 创建 `src/composables/useRiskApi.ts`，导出 `predictRisk(req: RiskPredictRequest): Promise<RiskPredictResponse>` 和 `getRiskHistory(params: PaginationParams): Promise<{ records: RiskHistoryItem[]; pagination: PaginationInfo }>` 两个函数，遵循现有 API composable 的内联类型注解模式。

### R3-G7. plan.js `/current` 端点返回的单个方案项携带 plan_id/is_active/created_at 字段，不在 LifePlan 类型定义中

- **位置**: `server/routes/plan.js:103-104`; `src/types/models.ts:93-106`
- **描述**: `GET /api/plan/current` 的 SELECT 语句（第103-104行）包含 `plan_id, is_active, created_at` 三个额外字段，而 `POST /api/plan/generate` 和 `PUT /api/plan/adjust` 的 SELECT（第79-84行、第206-210行）仅返回 `id, plan_type, order_num, time_desc, title, content` 六个字段。`LifePlan` TypeScript 接口定义（models.ts:93-106）仅包含这6个字段，不包含 `plan_id`、`is_active`、`created_at`。TypeScript 结构类型允许额外键的存在（编译通过），但类型检查器不可见这些字段。若前端代码尝试访问 `plan.plan_id`（在 `/current` 响应中存在但在 `/generate` 响应中不存在），类型检查器不会警告差异——依赖运行时行为。
- **建议修复**: 将 `LifePlan` 接口中的 `plan_id`、`is_active`、`created_at` 添加为可选字段（`plan_id?: number; is_active?: number; created_at?: string`），或在 `/current` 的 SELECT 中移除这些字段，或将 `/current` 的方案项映射为仅含 6 个字段的子集。

### R3-G8. punchStore.requestId 内部竞态防护机制暴露为公共状态

- **位置**: `src/stores/punchStore.ts:52,186`
- **描述**: `requestId` ref（第52行）是 `fetchList`/`loadMore`/`fetchAnalysis` 中用于防止快速切换筛选条件导致旧响应覆盖新响应的**内部竞态快照机制**（防竞态），但它在 store 的 return 对象中被导出为公共状态（第186行）。组件不应读取或修改此值。虽然不会导致功能错误，但暴露内部实现细节违反了封装原则，且可能在代码审查中被误认为可读的公共字段。
- **建议修复**: 从 store return 对象中移除 `requestId`。

### R3-S7. sendStreamRequest 401 处理未重定向至登录页，用户停留在当前页面但认证已过期

- **位置**: `src/stores/chatStore.ts:303-317`
- **描述**: `sendStreamRequest()` 中 SSE fetch 返回 401 时，代码正确调用了 `useAuthStore().clearAuth()` 并显示 "登录已过期" toast（第304-315行），但**未执行 `router.push('/login')`**（第316行直接 `return`）。用户认证状态已清空，但仍停留在当前页面（如医生对话页或 AI 助手弹窗）。与 `useApi.ts:54`（axios 401 拦截器）形成行为不一致——后者正确调用 `router.push('/login')`。用户可能已无 token 但继续尝试在对话页发送消息，导致每次请求都触发 401。
- **建议修复**: 在第316行 `return` 之前添加 `router.push('/login')`。

### R3-S8. AiChatDialog.vue 缺少 onUnmounted 生命周期钩子，组件卸载时 SSE 连接未中断

- **位置**: `src/components/AiChatDialog.vue` (无 onUnmounted)
- **描述**: AiChatDialog 的 SSE 连接仅在两个路径被中止：`closeDialog()`（弹窗关闭按钮/遮罩点击，第72-75行）和 `watch(isOpen)` 的 else 分支。但组件没有 `onUnmounted` 钩子。如果用户在 AI 弹窗打开且 SSE 正在流式返回时通过浏览器后退/前进按钮或直接导航离开（如点击底部 Tab），组件被卸载但活跃的 SSE 连接未中止——ReadableStream reader 继续运行，`handleSSEEvent` 继续写入 `chatStore.conversations`，造成内存泄漏和数据污染。对比 DoctorChatView.vue（第202-204行）和 Admin.vue（第144-146行），二者均在 `onUnmounted` 中正确调用 `chatStore.abortActiveConnection()`。
- **建议修复**: 添加 `onUnmounted(() => { chatStore.abortActiveConnection() })`。

### R3-G10. `AbortController.abort()` 无法中止已建立连接的 ReadableStream，SSE 取消为假性中止

- **位置**: `src/stores/chatStore.ts:95-101`; `src/composables/useSSE.ts:80-105`
- **描述**: `abortActiveConnection()` 通过 `AbortController.abort()` 取消 fetch 请求。但根据 Fetch 规范，如果 `fetch()` 的 Response 已经接收完毕、body ReadableStream 正在被消费（即 `readSSEStream` 正在 `reader.read()` 循环中），`controller.abort()` **对已建立的流无效**——它只能取消尚未完成的请求阶段。当前 `readSSEStream`（useSSE.ts:80-105）没有任何取消机制（无 AbortSignal 检查），会继续运行到流自然结束或错误。这意味着：(a) 用户点击"停止生成"或切换医生后，SSE 数据可能仍继续到达并写入 conversations；(b) `onMessageEnd` handler 中的 `navigate()` 调用（chatStore.ts:263）在用户已离开对话页后仍可能触发路由跳转（若 AI 回复末尾含 `[[NAVIGATE:...]]` 标记）。这是一个结构性设计缺陷——`AbortSignal` 被用于取消 fetch 但不能取消流消费。
- **建议修复**: 向 `readSSEStream` 传入 `AbortSignal`，在每次 `reader.read()` 前检查 `signal.aborted`；或存储 reader 引用并在 `abortActiveConnection` 中调用 `reader.cancel()`。

### R3-G11. sseProxy.js 数据写入未检查 `res.writableEnded`，客户端断开后仍可能写入响应

- **位置**: `server/services/sseProxy.js:72-79`; `server/services/sseProxy.js:50-53`
- **描述**: `upstreamRes.on('data')` handler（第72-79行）在循环中直接将 `line + '\n'` 写入 `res`（第77行），但不检查 `res.writableEnded` 或 `aborted` 标志。`req.on('close')` handler（第99-104行）最终会销毁 upstream 请求，但在 `close` 事件触发之前的时间窗口内，data handler 仍可能向已关闭的响应写入数据。对比 `writeErrorEvent`（第50-53行）已正确检查 `res.writableEnded`。虽然 Node.js `http.ServerResponse` 在 writableEnded 后写入会触发 'error' 事件（被默认忽略），但仍是不安全的模式。
- **建议修复**: 在 data handler 开头添加 `if (aborted || res.writableEnded) return;`。

### R3-G12. DoctorChatView 清空对话按钮在 SSE 流式传输中未禁用，导致消息撕裂

- **位置**: `src/views/DoctorChatView.vue:233-240, 94-98`
- **描述**: "清空对话"按钮的模板（第233-240行）未绑定 `:disabled="chatStore.isStreaming"`。用户在 SSE 流式传输中点击清空 → `clearChat()`（第94-98行）将 `conversations` 设为空数组 `[]` → 但 SSE 流仍在推送 `message` 事件 → `onMessage` handler 看到空数组后创建新的 assistant 消息气泡 → 形成"已清除但消息又出现"的撕裂状态。对比 AiChatDialog.vue:162，其清空按钮已正确绑定 `:disabled="messages.length === 0 || chatStore.isStreaming"`。
- **建议修复**: 为清空按钮添加 `:disabled="chatStore.isStreaming"`，或在 `clearChat()` 方法内部添加 streaming 状态检查。

### R3-G13. `/change-password` 路由守卫使用 `push` 导航导致浏览器后退按钮无限重定向循环

- **位置**: `src/router/index.ts:119`
- **描述**: `next('/change-password')`（第119行）默认使用 `push` 模式添加历史记录。管理员从 `/admin` 被强制重定向到 `/change-password` 后（history: `... → /admin → /change-password`），按浏览器后退按钮回到 `/admin` → 路由守卫再次触发 → 再次 push `/change-password` → 历史栈无限增长。管理员在修改密码前将陷入无法逃离的回退循环。
- **建议修复**: 使用 `next({ path: '/change-password', replace: true })` 避免积累重复的历史记录。

### R3-G15. sessionStorage 隔离 + BroadcastChannel 聋子启动 = 站内新标签页无认证态

- **位置**: `src/stores/authStore.ts:39-50, 85-104`; `src/main.ts:15`
- **描述**: v16 迁移至 sessionStorage 后，新标签页（通过右键/中键打开站内链接、Ctrl+点击、window.open 等）的 sessionStorage 为空——sessionStorage 按标签页隔离，不像 localStorage 可以在同源标签页间共享。`syncFromStorage()` 读取到空 sessionStorage → `clearAuth()` → token 为 null → 路由守卫触发 → 重定向至 `/login`。与此同时，BroadcastChannel 在 `syncFromStorage()` 中未初始化（见 R3-S6）。这导致：
  1. 用户在标签页 A 已登录 → 在标签页 A 中右键打开 `/news/article/5` 在新标签页 → 新标签页 sessionStorage 为空 → token=null → 被踢到 `/login?redirect=...`
  2. 即使未来 BroadcastChannel 在启动时初始化，从"空 sessionStorage"恢复的标签页也无法通过 BroadcastChannel 获取其他标签页的认证状态——`setAuth()` 从未被调用，BC 从未建立
  
  这是 sessionStorage 方案的**天然局限性**——站内导航打开的新标签页必然丢失登录态，用户期望的"已登录后打开任何站内链接都保持登录态"在纯 sessionStorage 方案下无法实现。
- **建议修复**: 短期——在 `syncFromStorage()` 末尾初始化 BC 后，通过 BC 向其他标签页发送 `REQUEST_AUTH` 消息，其他标签页收到后用 `RESPONSE_AUTH` 回复（含 token/role/user）。长期——评估是否需要将 token 恢复至 localStorage 或使用 `SharedWorker` 作跨标签页状态共享。

### R3-G14. LoginResponse 类型命名误导——描述的是 `res.data.data` 负载非完整 API 响应

- **位置**: `src/types/api.ts:80-85`; `src/stores/authStore.ts:133-134`
- **描述**: `LoginResponse` 接口定义 `{ token, role, user, must_change_password? }`，描述的是完整 HTTP 响应体 `{ success, message, data }` 中的 `data` 负载，而非完整的 API 响应。但类型名称 `LoginResponse` 暗示它是整个响应的类型。authStore 中的使用（第134行: `const data = res.data.data`）正确解包了两层，但类型注解与语义不匹配。此外，注册端点返回与登录相同的结构，但没有对应的 `RegisterResponse` 类型——Login.vue 中注册调用直接使用未类型化的解包。
- **建议修复**: 重命名为 `LoginData` 或 `LoginPayload`，并为注册端点添加 `RegisterData` 类型（结构同 `LoginData`）。

---

## 审查统计

- 审查集成点数: 42（9个 API composable ↔ 14 个后端路由 + 6 个 Store ↔ 14 个消费组件 + 4 条跨 Store 清理链 + 3 条 401 登出路径 + SSE 事件链 + 12 个存储键 + BroadcastChannel 消息回环 + 路由守卫行为）
- 严重问题: 8（功能性断裂2个 + 状态泄露与无限回环3个 + 契约不一致1个 + SSE 连接管理2个）
- 一般问题: 15

## 审查结论

本轮审查发现了 8 个严重集成问题和 15 个一般问题，覆盖前端-后端 API 契约、Store-Component 交互、跨 Store 状态清理、BroadcastChannel 同步机制、SSE 流连接管理、路由守卫行为六大集成维度。

**三大系统性风险**：

1. **清理链不完整（R3-S3, R3-S7）**: `authStore.clearAuth()` 的清理不完整是本轮发现的最核心架构性问题——401 SSE 路径既不清理 chatStore 也不导航至登录页，BroadcastChannel 跨标签页登出路径同样遗漏 chatStore 和 riskFormStore 清理。与 Profile.vue 手动登出路径的正确清理形成三路径行为不一致。

2. **BroadcastChannel 三个缺陷叠加（R3-S5, R3-S6, R3-G15）**: 消息回环（无限 ping-pong）+ 已登录启动时聋子（BC 未初始化）+ 站内新标签页无 auth 数据（sessionStorage 天然隔离）——三者叠加使得跨标签页认证同步在面对站内链接打开的标签页时完全失效。已登录用户通过右键/中键在新标签页中打开的页面没有 token 且收不到同步。

3. **SSE 连接管理缺陷链（R3-S8, R3-G10, R3-G11, R3-G12）**: AiChatDialog 卸载不清理 SSE → AbortController 对已建流无效（假性中止）→ sseProxy 写入不检查 writableEnded → 清空按钮在流式传输中未禁用。四个问题形成一条缺陷链：SSE 流从浏览器到服务器的整个生命周期都缺乏可靠的取消和清理机制。

**功能性断裂**：
- **ArticleDetailView.vue 永久加载态**（R3-S1）-- `fetchArticle()` 从未在 onMounted 中调用，文章详情页完全不工作
- **DoctorChatView.vue 组件导入缺失**（R3-S2）-- 三个可复用组件和一个类型导入遗漏，运行时解析失败

**正面发现**：
- API 字段命名风格一致（统一使用 `snake_case`，零 camelCase/snake_case 混用）
- 21 个 GET/POST/PUT/DELETE 端点的请求体/响应体契约经逐项对比，核心契约正确
- sessionStorage 键名 7 个无一冲突；localStorage 键名 3 组互不重叠
- BroadcastChannel 消息格式在 senders/receivers 间完全一致
- 路由守卫与页面 meta 定义一致，守卫检查顺序正确
- 跨 Store 无循环依赖（chatStore 通过动态 import 引用 authStore）

**优先级建议**：
- **P0（立即修复）**: R3-S1（ArticleDetailView 不加载）、R3-S2（DoctorChatView 组件导入缺失）——完全功能性断裂
- **P1（本迭代修复）**: R3-S3（401路径状态泄露）、R3-S6（BC 聋子启动）、R3-S7（SSE 401 无导航）——涉及安全和数据泄漏
- **P2（下迭代修复）**: R3-S5（BC 回环）、R3-S8（AiChatDialog 清理）、R3-G10（假性中止）——设计改进
- **P3（后续优化）**: 其余一般问题
