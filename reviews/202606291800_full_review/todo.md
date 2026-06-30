# 全量代码审查问题汇总

> 来源：审议式三轮代码审查（Round 1 设计合规性 + Round 2 代码质量 + Round 3 集成一致性）
> 审查范围：全部前端（src/）和后端（server/）代码，56+28=84个文件
> 审查依据：`docs/2_detailed_design_v4.md` + `docs/prototype.html`
> 审查日期：2026-06-29

---

## 严重问题

### S1. App.vue 遗留死代码：localStorage StorageEvent 监听器（v16 迁移残留）

- **位置**: `src/App.vue:32-43, 49-53`
- **来源**: Round 1 #S1 + Round 2 #S1（合并）
- **描述**: `handleStorageChange` 监听 `window` 的 `storage` 事件，但其内部读取 `localStorage.getItem('token')` 和 `localStorage.getItem('role')`。v16 设计已将 token/role/user 全面迁移至 sessionStorage + BroadcastChannel。`StorageEvent` 仅对 localStorage 变更触发，此 handler 永不会被触发，是纯粹的死代码。`authStore.ts:17-37` 已正确实现 BroadcastChannel 跨标签页同步，此监听器遗留会造成 v16 迁移不彻底的误导。
- **建议修复**: 删除 `handleStorageChange` 函数（第32-43行）、`onMounted` 中的 `addEventListener('storage', ...)`（第50行）和 `onUnmounted` 中的 `removeEventListener`（第53行）。
- **已修复**: 2026-06-30, 批次 v2 (P1 设计合规修复), 删除 handleStorageChange + storage 事件监听器（v16 迁移残留死代码清理）

### S2. AiChatDialog.vue 综合设计合规缺陷（4项子问题合并）

- **位置**: `src/components/AiChatDialog.vue`
- **来源**: Round 1 #S2, #S3 + Round 2 #S2, #S3（合并）
- **描述**:
  1. **缺少设计文档规定的 DOM id**（§4.1.1）：登录引导区缺少 `id="fab-login-prompt"`，已登录欢迎区缺少 `id="fab-welcome-logged-in"`
  2. **绕过统一 XSS 净化管道**（§1.3）：`renderContent()` 直接调用 `DOMPurify.sanitize()` 使用默认配置，而非项目统一的 `sanitizeHtml()` 白名单加固（ALLOWED_TAGS/ALLOWED_ATTR/ALLOWED_URI_REGEXP），存在 XSS 风险
  3. **免责声明逻辑完全复制 useUI.ts**：内联 `hasAcceptedDisclaimer()`/`showDisclaimer()`/`ensureDisclaimer()` 三个函数，与 `useUI.ts` 导出版本重复，且绕过了 `getSwal()` 懒加载单例
  4. **未使用共享 useMarkdown composable**：`renderContent()` 内联 marked.parse + DOMPurify，未调用 `useMarkdown.ts` 导出的 `renderMarkdown()`（包含外部链接 `target="_blank"` 的自定义 link renderer）
- **建议修复**:
  1. 在第171行添加 `id="fab-login-prompt"`，第182行添加 `id="fab-welcome-logged-in"`
  2. 将 `renderContent()` 改为调用 `renderMarkdown(content)` 从 `@/composables/useMarkdown` 导入
  3. 删除内联的三个免责声明函数，改为从 `@/composables/useUI` 导入并使用
  4. `formatTime` 改为从 `@/utils/helpers` 导入统一版本
- **已修复**: 2026-06-30, 批次 v2 (P1 设计合规修复), 4项综合修复：添加 DOM id(fab-login-prompt/fab-welcome-logged-in)、切换 renderMarkdown 统一 XSS 管道、删除内联免责声明改用 useUI 函数、切换 formatTime 统一版本

### S3. DisclaimerBar 组件系统性未使用——6个AI内容页面中仅2个正确引用

- **位置**: `src/views/DoctorChatView.vue`, `src/views/LifePlan.vue`, `src/views/Risk.vue`, `src/views/Punch.vue`, `src/views/Admin.vue`, `src/views/ArticleDetailView.vue`
- **来源**: Round 1 #S4
- **描述**: 项目定义了统一的 `<DisclaimerBar>` 可复用组件，但6个展示AI内容的页面中仅 `NewsView.vue` 和 `HealthAdvice.vue` 正确引用。其余4个使用内联硬编码 `<div>`/`<p>` 渲染免责文本，ArticleDetailView.vue 完全缺失免责声明。这违反了设计文档 §7.4 的合规要求。
- **建议修复**: DoctorChatView/LifePlan/Risk/Punch/Admin 均替换内联免责标记为 `<DisclaimerBar>` 组件，ArticleDetailView 在正文后添加 `<DisclaimerBar />`。

### S4. 前端视图系统性缺失设计文档 §4.1 规定的 DOM id 和 data-* 属性

- **位置**: 14个视图文件（详见描述）
- **来源**: Round 1 #S5
- **描述**: 设计文档 §4.1 各页面组件树为几乎所有关键 DOM 节点规定了 `id` 和 `data-*` 属性。实际代码中大量使用 CSS class 和 Vue `ref` 替代，仅有 `DoctorChatView.vue` 的 `#chat-messages`、`#msgInput`、`#sendBtn` 三个 id 被保留。缺失涵盖：Home.vue（3个section id）、Consultation.vue（data-doctor属性）、Profile.vue（7个id）、Risk.vue（9个id）、Punch.vue（8个id）、Admin.vue（7个id）、Login.vue（10个id）、ArticleDetailView.vue（3个属性/id）。这些 id/data-* 属性是自动化测试（E2E）和辅助技术（无障碍访问）的重要锚点。
- **建议修复**: 按优先级分批补充（优先 Risk.vue 和 Punch.vue）。

### S5. admin.js Text2SQL 功能存在 SQL 注入漏洞

- **位置**: `server/routes/admin.js:241, 301, 320`
- **来源**: Round 2 #S11
- **描述**: `dispatchParameterizedQuery` 函数在三个工具操作中将 `params.where`（来自用户请求体）直接拼接到 SQL 字符串，未使用参数化占位符：`query_table`（第241行）、`update_record`（第301行）、`delete_record`（第320行）。虽然 `params.table` 通过了白名单校验，但 `params.where` 是原始用户输入，可直接注入任意 WHERE 条件。攻击者需要 admin 凭证，但一旦认证通过即可用于大规模数据破坏。
- **建议修复**: 将 `params.where` 解析为结构化条件后用参数化占位符重建，或对 WHERE 子句进行严格的语法校验（仅允许 `column = value AND ...` 模式）。
- **已修复**: 2026-06-30, 批次 v3 (P1 后端安全缺陷), 新增 parseWhereClause() 私有函数，query_table/update_record/delete_record 三处 WHERE 子句改为参数化 ? 占位符重建

### S6. encryption.js 使用硬编码默认加密密钥

- **位置**: `server/utils/encryption.js:22`
- **来源**: Round 2 #S6
- **描述**: `deriveKey()` 中，若 `process.env.JWT_SECRET` 未设置，回退到硬编码字符串 `'default_secret_change_me'`。代码不会报错或警告，静默使用可预测的密钥。若部署时忘记设置 JWT_SECRET，聊天 token 的 AES-256-GCM 加密将使用可预测的派生密钥，失去加密保护意义。
- **建议修复**: 若 JWT_SECRET 未设置，抛出启动错误：`throw new Error('[encryption] JWT_SECRET 未设置，无法派生加密密钥。')`
- **已修复**: 2026-06-30, 批次 v3 (P1 后端安全缺陷), 模块顶层添加 JWT_SECRET 环境变量启动校验，deriveKey() 移除硬编码默认密钥回退

### S7. ArticleDetailView.vue 功能性断裂——fetchArticle() 从未在 onMounted 中调用

- **位置**: `src/views/ArticleDetailView.vue:2, 46-76`
- **来源**: Round 3 #S1
- **描述**: `onMounted` 已从 Vue 导入但从未被调用。`fetchArticle()` 仅在错误重试按钮中被引用（`@click="fetchArticle"`），未在任何生命周期钩子中触发。初始状态 `loading = ref(true)` 导致页面始终停留在骨架屏加载态。**文章详情页完全无法正常工作**。
- **建议修复**: 添加 `onMounted(() => { fetchArticle() })`。
- **已修复**: 2026-06-30, 批次 v1 (P0 功能性断裂修复), 在 onMounted 中调用 fetchArticle()

### S8. DoctorChatView.vue 缺少组件和类型导入——运行时解析失败

- **位置**: `src/views/DoctorChatView.vue:3-9, 158, 255, 262, 269`
- **来源**: Round 3 #S2
- **描述**: 模板中使用了 `<SkeletonLoader>`（第255行）、`<ErrorRetry>`（第262行）、`<EmptyState>`（第269行），但 `<script setup>` 导入区未导入这些组件。Vue 3 `<script setup>` 要求所有组件显式导入。此外 `ConversationHistoryItem` 类型在第158行使用但未导入。
- **建议修复**: 添加三组件导入和 `ConversationHistoryItem` 类型导入。
- **已修复**: 2026-06-30, 批次 v1 (P0 功能性断裂修复), 补充 SkeletonLoader/ErrorRetry/EmptyState 组件导入和 ConversationHistoryItem 类型导入

### S9. authStore.clearAuth() 清理链不完整——401/BC/路由守卫三条登出路径存在状态泄露

- **位置**: `src/stores/authStore.ts:106-129`; `src/composables/useApi.ts:41-54`; `src/stores/authStore.ts:22-28`
- **来源**: Round 3 #S3
- **描述**: `clearAuth()` 清理了 homeStore 和 lifePlanStore 缓存，但遗漏了两个关键清理：(1) `chatStore.clearAllConversations()` 未调用——活跃 SSE 连接未被中止，conversation_id Map 和消息列表未清空；(2) `riskFormStore.reset()` 未调用——风险表单数据在 sessionStorage 中残留。此问题在三条路径触发：useApi 401 拦截器、BroadcastChannel 跨标签页同步、路由守卫 token 过期。对比 Profile.vue 手动登出正确地在调用 `authStore.logout()` 前先清理 chatStore——三条路径行为不一致。
- **建议修复**: 在 `clearAuth()` 中添加 `useChatStore().abortActiveConnection()` + `useChatStore().clearAllConversations()` 和 `useRiskFormStore().reset()`。
- **已修复**: 2026-06-30, 批次 v1 (P0 功能性断裂修复), clearAuth() 中补充 useChatStore().clearAllConversations() 和 useRiskFormStore().reset() 调用

### S10. authStore BroadcastChannel 三个缺陷叠加——跨标签页认证同步在多场景下失效

- **位置**: `src/stores/authStore.ts:23-31, 76-82, 85-104, 122-128`
- **来源**: Round 3 #S5, #S6, #G15（合并）
- **描述**: 三个独立缺陷叠加导致跨标签页同步完全不可靠：
  1. **消息无限回环**（#S5）：`onmessage` 无条件调用 `setAuth()`/`clearAuth()`，而这两个函数又在末尾 `postMessage` 重广播，两标签页间形成无限 ping-pong
  2. **已登录启动时聋子**（#S6）：`syncFromStorage()` 在从 sessionStorage 恢复 token 后未调用 `getBcChannel()` 初始化监听，此标签页对登出广播完全无效
  3. **站内新标签页无 auth 数据**（#G15）：sessionStorage 按标签页隔离，新标签页打开站内链接（右键/中键/Ctrl+点击）时 sessionStorage 为空，且 BC 未初始化无法获取其他标签页认证状态
- **建议修复**: (1) `onmessage` 添加去重守卫——比较收到的 token/role 与当前状态是否一致；(2) `syncFromStorage()` 末尾显式调用 `getBcChannel()`；(3) 通过 BC 发送 `REQUEST_AUTH` 消息从其他标签页获取认证状态。

### S11. sendStreamRequest 401 处理未重定向——用户认证已清空但停留在当前页面

- **位置**: `src/stores/chatStore.ts:303-317`
- **来源**: Round 3 #S7
- **描述**: SSE fetch 返回 401 时，代码正确调用了 `useAuthStore().clearAuth()` 并显示 toast，但未执行 `router.push('/login')`，直接 return。用户 token 已清空但仍停留在 AI 对话页或管理页。与 `useApi.ts:54`（axios 401 拦截器正确调用 `router.push('/login')`）行为不一致。
- **建议修复**: 在第316行 `return` 之前添加 `router.push('/login')`。

### S12. AiChatDialog.vue 缺少 onUnmounted——组件卸载时 SSE 连接未中断

- **位置**: `src/components/AiChatDialog.vue`（无 onUnmounted）
- **来源**: Round 3 #S8
- **描述**: AiChatDialog 仅在 `closeDialog()` 和 `watch(isOpen)` 中中止 SSE，但无 `onUnmounted` 钩子。若用户在 SSE 流式传输中通过 Tab 导航或浏览器后退离开，组件被卸载但活跃 SSE 连接未中止——ReadableStream reader 继续运行，`handleSSEEvent` 继续写入 `chatStore.conversations`，造成内存泄漏和数据污染。对比 DoctorChatView.vue 和 Admin.vue 均在 `onUnmounted` 中正确调用 `chatStore.abortActiveConnection()`。
- **建议修复**: 添加 `onUnmounted(() => { chatStore.abortActiveConnection() })`。

### S13. JWT Payload 字段名前后端不一致——user_id vs id

- **位置**: `src/composables/useAuth.ts:16`; `server/routes/auth.js:32,71`
- **来源**: Round 3 #S4
- **描述**: 前端 `JwtPayload` 接口声明 `user_id?: number`，但后端 `jwt.sign()` 使用的字段名是 `id`。中间件 `auth.js:28` 做了内部 `req.user.user_id = decoded.id` 重映射，但前端 `parseToken()` 解析后 `payload.id` 存在而 `payload.user_id` 为 `undefined`——此错误被 `[key: string]: any` 索引签名在编译期掩盖。
- **建议修复**: 将 `useAuth.ts:16` 的 `user_id?: number` 改为 `id?: number`。

### S14. sseProxy Mock 模式返回固定 conversation_id——污染前端会话状态

- **位置**: `server/services/sseProxy.js:13-15`
- **来源**: Round 2 #S8
- **描述**: 当 `DIFY_API_BASE` 未配置时 Mock 模式返回固定 `conversation_id: 'mock-001'`。前端 `chatStore.handleSSEEvent` 在 `onMessageEnd` 中将此 ID 保存到 doctorConversations Map 和 localStorage。Mock 模式下多次对话共享同一个假 ID，当后续配置真实 Dify 服务时可能导致不可预期的会话合并。
- **建议修复**: Mock 模式生成唯一 ID：`` `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` ``

### S15. DoctorChatView.vue 模板中直接修改 Pinia Store 内部状态

- **位置**: `src/views/DoctorChatView.vue:96-97, 162, 192`; `src/components/AiChatDialog.vue:162`
- **来源**: Round 2 #S4
- **描述**: 清空对话操作直接修改 `chatStore.conversations.length = 0`，绕过 Pinia DevTools action 追踪。`clearAssistantConversation()`/`clearDoctorConversation()` 仅清理 conversation_id 不清空消息列表。
- **建议修复**: 在 chatStore 中添加 `clearMessages()` action，各处统一调用。

### S16. NewsView.vue 搜索高亮 v-html 存在 XSS 边缘风险

- **位置**: `src/views/NewsView.vue:394`
- **来源**: Round 2 #S9
- **描述**: 搜索结果渲染使用 `v-html="highlightKeyword(item.title, searchedKeyword)"`。`highlightKeyword` 虽先用 `escapeHtml()` 转义，但渲染前未经过 `sanitizeHtml()` 二次净化。在 Markdown 格式标题等复杂场景下可能存在边缘绕过。
- **建议修复**: 对 `highlightKeyword` 的输出额外调用 `sanitizeHtml()` 一次。

### S17. Home.vue 未捕获的 Promise rejection

- **位置**: `src/views/Home.vue:107-111`
- **来源**: Round 2 #S10
- **描述**: `showDiabetesType` 是 async 函数，作为 `@click` 事件处理器直接调用。Vue 模板事件不自动捕获 async rejection。若 `homeStore.fetchDiabetesTypeDetail()` 抛出，成为 "Uncaught (in promise)" 错误，用户无任何提示。
- **建议修复**: 在 `showDiabetesType` 内部包裹 try-catch。

---

## 一般问题

### G1. main.ts 注释与实际存储介质不一致

- **位置**: `src/main.ts:12`
- **来源**: Round 1 #G1
- **描述**: 第12行注释写 `// 自动从 localStorage 恢复登录态`，但 `authStore.syncFromStorage()` 实际从 sessionStorage 读取。
- **建议修复**: 将注释改为 `// 自动从 sessionStorage 恢复登录态`

### G2. 后端缺失 Dify 代理路由文件 server/routes/dify.js

- **位置**: `server/routes/` 目录（缺少 dify.js）
- **来源**: Round 1 #G2
- **描述**: 设计文档 §3.1.11 定义 `POST /api/dify/workflow/:workflow_id` 和 `POST /api/dify/agent/:agent_id` 两个端点，设计文档 §1.4 列出 `server/routes/dify.js` 作为14个路由模块之一。当前各业务路由通过 `difyService.js` 内部调用 Dify，未暴露独立代理端点。
- **建议修复**: 若已废弃此设计，在设计文档中标注；否则创建 `server/routes/dify.js` 并挂载。

### G3. useApi 401 拦截器缺少 redirect 参数

- **位置**: `src/composables/useApi.ts:54`
- **来源**: Round 1 #G3 + Round 3 #G1（合并）
- **描述**: useApi.ts 401 处理执行 `router.push('/login')` 未附带 redirect 参数。路由守卫正确携带 redirect，但 useApi 触发的 401 不经路由守卫。用户被踢到登录页后无法回跳原页面。设计文档 §7.1 明确要求 `router.push('/login?redirect=当前路径')`。
- **建议修复**: 改为 `router.push('/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search))`

### G4. enumLabels 常量命名为 LABELS 而非 ENUM_LABELS

- **位置**: `src/utils/enumLabels.ts:1`
- **来源**: Round 1 #G5
- **描述**: 代码中常量命名为 `LABELS`，设计文档 §1.8.1 伪代码中为 `ENUM_LABELS`。功能完全一致但降低代码与设计文档的可追溯性。
- **建议修复**: 重命名为 `ENUM_LABELS` 或添加注释说明命名差异。

### G5. chatStore 使用 localStorage 持久化 conversation_id——与 v16 sessionStorage 迁移方向不一致

- **位置**: `src/stores/chatStore.ts:129-136, 152-157`
- **来源**: Round 1 #G7
- **描述**: chatStore 使用 localStorage 键 `qrzl_conv_{doctorId}` 持久化医生对话 ID。v16 整体迁移至 sessionStorage + BroadcastChannel，chatStore 仍使用 localStorage 造成持久化方案不一致。
- **建议修复**: 评估 conversation_id 的跨标签页需求，统一至 sessionStorage 或明确标注为何保留 localStorage。

### G6. admin.js get_table_schema 工具未校验表名白名单

- **位置**: `server/routes/admin.js:332`
- **来源**: Round 2 #S12
- **描述**: `get_table_schema` 执行 `PRAGMA table_info(${params.table})` 前未像其他工具操作一样校验表名白名单。与其他工具操作的安全模式不一致。
- **建议修复**: 将表名白名单校验移至 `dispatchParameterizedQuery` 开头，覆盖所有工具操作。

### G7. useAuth.ts JwtPayload 索引签名使用 `any`

- **位置**: `src/composables/useAuth.ts:26`
- **来源**: Round 2 #G1
- **描述**: `[key: string]: any` 索引签名允许 JWT payload 未知字段为任意类型，降低类型安全。
- **建议修复**: 将 `any` 改为 `unknown`。

### G8. useMarkdown.ts 使用 `as any` 绕过 marked.renderer 类型约束

- **位置**: `src/composables/useMarkdown.ts:42`
- **来源**: Round 2 #G2
- **描述**: `marked.use({ renderer: _linkRenderer as any })` 使用 `as any` 消解 all 类型保护。
- **建议修复**: 使用 marked 的 `Renderer` 类型或 `Partial<Renderer>`。

### G9. formatTime 函数在三处独立定义

- **位置**: `src/components/AiChatDialog.vue:105-110`, `src/views/DoctorChatView.vue`, `src/utils/helpers.ts:51-54`
- **来源**: Round 2 #G4
- **描述**: 三处独立实现 `formatTime`，维护负担大。helpers.ts 已有统一版本。
- **建议修复**: 统一使用 helpers.ts 中的 `formatTime`。

### G10. "请先登录" Toast 在三组件中重复

- **位置**: `src/components/AiChatDialog.vue:87-97`, `src/views/DoctorChatView.vue:67-76`, `src/views/Admin.vue:52-55`
- **来源**: Round 2 #G5
- **描述**: 三组件中相同的"检查 token → 显示登录提示"模式，SweetAlert2 toast 配置在三处独立维护。
- **建议修复**: 在 useUI.ts 中添加 `showLoginRequired()` 辅助函数。

### G11. useApi.ts 与 chatStore.ts 中 401 处理使用动态 import 可能引发竞态

- **位置**: `src/composables/useApi.ts:43-53`, `src/stores/chatStore.ts:303-317`
- **来源**: Round 2 #G6
- **描述**: 401 处理通过动态 `import('sweetalert2')` 显示 toast，而 `router.push('/login')` 已同步执行。Toast 可能在页面跳转后弹出或根本来不及显示。
- **建议修复**: 在模块顶层静态导入 SweetAlert2，替换动态 import。

### G12. plan.js 幂等检查在 Dify API 调用之后执行

- **位置**: `server/routes/plan.js:28,44`
- **来源**: Round 2 #G10 + Round 3 #G2（合并）
- **描述**: `checkIdempotent(userId)` 在 `callWorkflowBlocking()`（耗时可达15s）之后才执行。Dify 调用期间（15s窗口）重复请求都会成功调用 Dify（消耗 API token），仅数据库写入被阻止。前端 `generating` 标志仅在同一 Store 实例有效，无法阻止跨标签页双击。
- **建议修复**: 将 `checkIdempotent` 移至 `callWorkflowBlocking` 之前（第27行）。

### G13. Consultation.vue 4处 `(doctor as any)` 绕过类型检查

- **位置**: `src/views/Consultation.vue:84, 88-90`
- **来源**: Round 2 #G11
- **描述**: 模板中访问 `doctor.is_online`/`doctor.department`/`doctor.title`/`doctor.description` 使用 `as any` 断言。`Doctor` 接口未定义这些字段（`DoctorDetail` 有）。`as any` 消解了 TypeScript 保护。
- **建议修复**: 将组件中的 doctor 类型从 `Doctor` 改为 `DoctorDetail`。

### G14. punch.js 打卡分析使用本地模板替代 Dify AI

- **位置**: `server/routes/punch.js:105-177`
- **来源**: Round 3 #G3
- **描述**: 分析端点完全使用本地 JavaScript 模板函数生成评语和建议，而非调用设计文档 §5.2.4 定义的 Dify `punch-analysis` 工作流。前端 `PunchAnalysisResponse` JSDoc 仍标注"AI生成"，实际为纯文本模板。
- **建议修复**: 短期更新 JSDoc 移除"AI"标注；长期接入 Dify 工作流。

### G15. authStore.fetchProfile() 死代码——无任何组件调用

- **位置**: `src/stores/authStore.ts:149-157`; `src/views/Profile.vue:59-88`
- **来源**: Round 3 #G4
- **描述**: `fetchProfile()` 在 authStore 中定义了完整的 profile 拉取逻辑，但没有任何组件调用它。Profile.vue 直接调用 `api.get('/user/profile')` 并自行解析。
- **建议修复**: Profile.vue 改为调用 `authStore.fetchProfile()` 统一入口。

### G16. DoctorDetail.is_online 字段为死字段——后端永不返回

- **位置**: `src/types/models.ts:45-47`; `server/routes/doctors.js:17`
- **来源**: Round 3 #G5
- **描述**: `DoctorDetail` 接口定义 `is_online: boolean`，但 `doctor_information` 表 DDL 中无此列，后端 SELECT 从未查询或计算此字段。依赖此字段的 UI 将始终显示"离线"。
- **建议修复**: 从 `DoctorDetail` 中移除 `is_online`，或在数据库新增该列。

### G17. 缺少 useRiskApi.ts composable

- **位置**: `src/composables/` 目录（缺少 useRiskApi.ts）
- **来源**: Round 3 #G6
- **描述**: 风险预测两个端点（predict、history）无对应 API composable 封装。对比其他8个业务领域均有专门的 API composable，破坏了统一的架构模式。
- **建议修复**: 创建 `src/composables/useRiskApi.ts` 遵循现有 API composable 模式。

### G18. plan.js /current 端点返回额外字段不在 LifePlan 类型中

- **位置**: `server/routes/plan.js:103-104`; `src/types/models.ts:93-106`
- **来源**: Round 3 #G7
- **描述**: `/current` 的 SELECT 包含 `plan_id/is_active/created_at`，但其他端点（generate/adjust）的 SELECT 不包含。`LifePlan` 接口未定义这些字段，但 TypeScript 结构类型允许。前端访问这些字段时类型检查器不可见差异。
- **建议修复**: 将三字段添加为 `LifePlan` 接口的可选字段，或统一 SELECT 列。

### G19. punchStore.requestId 内部竞态机制暴露为公共状态

- **位置**: `src/stores/punchStore.ts:52,186`
- **来源**: Round 3 #G8
- **描述**: `requestId` 是防竞态的内部快照机制，但在 store return 中被导出为公共状态。违反封装原则。
- **建议修复**: 从 store return 对象中移除 `requestId`。

### G20. AbortController.abort() 无法中止已建立的 ReadableStream

- **位置**: `src/stores/chatStore.ts:95-101`; `src/composables/useSSE.ts:80-105`
- **来源**: Round 3 #G10
- **描述**: `AbortController.abort()` 仅能取消未完成的 fetch 请求，对已建立连接的 ReadableStream 无效。`readSSEStream` 无 AbortSignal 检查，流数据可能继续写入已离开页面的 chatStore，`onMessageEnd` 中的 `navigate()` 可能在用户离开后仍触发路由跳转。
- **建议修复**: 向 `readSSEStream` 传入 `AbortSignal`，每次 `reader.read()` 前检查 `signal.aborted`；或存储 reader 引用并在 `abortActiveConnection` 中调用 `reader.cancel()`。

### G21. sseProxy.js 数据写入未检查 res.writableEnded

- **位置**: `server/services/sseProxy.js:72-79`
- **来源**: Round 3 #G11
- **描述**: `upstreamRes.on('data')` handler 直接写入 `res` 不检查 `res.writableEnded`。客户端断开后至 `close` 事件触发前的时间窗口内，data handler 可能向已关闭的响应写入数据。
- **建议修复**: 在 data handler 开头添加 `if (aborted || res.writableEnded) return;`。

### G22. DoctorChatView 清空按钮在 SSE 流式传输中未禁用

- **位置**: `src/views/DoctorChatView.vue:233-240, 94-98`
- **来源**: Round 3 #G12
- **描述**: "清空对话"按钮未绑定 `:disabled="chatStore.isStreaming"`。用户在 SSE 流式传输中点击清空 → conversations 清空 → 但 SSE 流继续推送 message → 形成"已清除但消息又出现"的撕裂状态。AiChatDialog.vue 已正确处理此场景。
- **建议修复**: 为清空按钮添加 `:disabled="chatStore.isStreaming"`。

### G23. /change-password 路由守卫使用 push 导致后退按钮无限重定向

- **位置**: `src/router/index.ts:119`
- **来源**: Round 3 #G13
- **描述**: `next('/change-password')` 默认 push 模式添加历史记录。管理员从 /admin 被强制重定向后按浏览器后退回到 /admin → 守卫再次触发 → 再次 push /change-password → 历史栈无限增长。
- **建议修复**: 使用 `next({ path: '/change-password', replace: true })`。

### G24. LoginResponse 类型命名误导——描述 data 负载非完整响应

- **位置**: `src/types/api.ts:80-85`
- **来源**: Round 3 #G14
- **描述**: `LoginResponse` 接口描述的是 `res.data.data` 负载（{token, role, user, must_change_password?}），非完整 HTTP 响应。类型名暗示是整个响应。注册端点无对应的 RegisterResponse 类型。
- **建议修复**: 重命名为 `LoginData`，为注册添加 `RegisterData`。

### G25. NewsView.vue sessionStorage 恢复缺少运行时类型校验

- **位置**: `src/views/NewsView.vue:43-55`
- **来源**: Round 2 #G12
- **描述**: `restoreState()` 从 sessionStorage 恢复 page 和 category 时仅做假值回退，未校验 `typeof state.page === 'number'`。
- **建议修复**: 增加显式类型校验 `typeof state.page === 'number' && state.page > 0 ? state.page : 1`。

### G26. risk.js 正则回退解析缺少日志记录

- **位置**: `server/routes/risk.js:11-29`
- **来源**: Round 2 #G7
- **描述**: `parseRiskOutputRegex` 在 JSON 解析失败后作为回退，但无任何日志记录走了回退路径。运维无法排查 Dify 输出格式问题。
- **建议修复**: 在回退解析时增加 `console.warn` 日志。

### G27. sseProxy.js 超时/错误处理缺少日志

- **位置**: `server/services/sseProxy.js:89-97`
- **来源**: Round 2 #G8
- **描述**: `upstreamReq.on('timeout')` 和 `upstreamReq.on('error')` 回调均未记录日志。Dify SSE 代理超时或连接错误时运维无法定位根因。
- **建议修复**: 增加 `console.error` 日志。

### G28. useUI.ts loadingCounter 模块级 ref 在 SSR 下有潜在问题

- **位置**: `src/composables/useUI.ts:67`
- **来源**: Round 2 #G9
- **描述**: `loadingCounter` 定义在模块顶层为单例。当前 SPA 场景下正常，但若迁移到 SSR 会在请求间共享状态。
- **建议修复**: 将 `loadingCounter` 移到 composable 内部，或标注为 SPA-only。

### G29. upload.js filename 回调中未防御性检查 req.user

- **位置**: `server/routes/upload.js:23`
- **来源**: Round 2 #G13
- **描述**: Multer filename 回调直接访问 `req.user.user_id`。若中间件链被重排，`req.user` 为 undefined 时抛出 TypeError。
- **建议修复**: 在回调开头增加 `if (!req.user?.user_id) return cb(new Error('User not authenticated'))`。

### G30. app.js CORS 配置过于宽松且缺少全局限流

- **位置**: `server/app.js:9`
- **来源**: Round 2 #G14
- **描述**: `app.use(cors())` 使用默认选项允许所有来源。处理认证和敏感健康数据的 API 缺少 origin 白名单和速率限制。
- **建议修复**: 配置 CORS origin 白名单；添加速率限制中间件。

### G31. 多条路由中未校验 :id 参数是否为合法整数

- **位置**: `server/routes/articles.js:159`, `server/routes/chat.js:21`, `server/routes/diabetes.js:13`, `server/routes/doctors.js:17`
- **来源**: Round 2 #G15
- **描述**: 路由参数 `:id` 直接用于数据库查询，未校验是否为合法数字格式。非数字 ID 传给 better-sqlite3 导致查询返回 undefined，404 处理依赖隐式类型转换。
- **建议修复**: 在路由处理器开头添加 `if (!/^\d+$/.test(req.params.id)) throw new AppError(400, ...)`。

### G32. helpers.ts 泛型工具使用 `any` 降低类型推导质量

- **位置**: `src/utils/helpers.ts:58, 136`
- **来源**: Round 2 #G3
- **描述**: `DebouncedFn<T extends (...args: any[]) => any>` 和 `ThrottledFn` 使用 `any[]`/`any` 作为约束。虽已通过 `Parameters<T>` 获得精确推导，但 `any` 约束降低了调用方的类型检查严格度。
- **建议修复**: 将 `any[]` 改为 `unknown[]`。

### G33. Login.vue catch 块使用 `err: any` 且未使用 getErrorMessage

- **位置**: `src/views/Login.vue:42`
- **来源**: Round 2 #S5
- **描述**: `catch (err: any)` 使用 `any` 类型，直接访问 `err?.response?.data?.error?.message` 绕过 TypeScript 类型检查。项目已有 `getErrorMessage()` 工具函数。
- **建议修复**: 改为 `catch (err: unknown) { errorMsg.value = getErrorMessage(err, '登录失败') }`。

---

## 统计

| 来源 | 严重 | 一般 | 小计 |
|------|:---:|:---:|:---:|
| Round 1（设计合规性） | 5 | 7 | 12 |
| Round 2（代码质量与类型安全） | 12 | 15 | 27 |
| Round 3（集成一致性） | 8 | 15 | 23 |
| 去重合并后 | **17** | **33** | **50** |

**总计：50 个问题**（17 严重 + 33 一般）

### 按模块分布（去重后）

| 模块 | 严重 | 一般 |
|------|:---:|:---:|
| App.vue / main.ts | 1 | 1 |
| AiChatDialog.vue | 2 | 2 |
| DoctorChatView.vue | 2 | 1 |
| ArticleDetailView.vue | 1 | — |
| Home.vue | 1 | — |
| NewsView.vue | 1 | 1 |
| Login.vue | — | 1 |
| Consultation.vue | — | 1 |
| 各View DOM属性（系统性） | 1 | — |
| DisclaimerBar使用（系统性） | 1 | — |
| authStore + BC | 2 | — |
| chatStore | 1 | 1 |
| punchStore | — | 1 |
| router/index.ts | — | 1 |
| useApi.ts | — | 1 |
| useAuth.ts | 1 | 1 |
| useMarkdown.ts | — | 1 |
| useUI.ts | — | 1 |
| types/api.ts & models.ts | — | 3 |
| helpers / enumLabels | — | 2 |
| server/admin.js | 1 | 1 |
| server/encryption.js | 1 | — |
| server/sseProxy.js | 1 | 2 |
| server/plan.js | — | 2 |
| server/punch.js | — | 1 |
| server/risk.js | — | 1 |
| server/upload.js | — | 1 |
| server/app.js | — | 1 |
| server routes（通用） | — | 2 |

### 按优先级

| 优先级 | 数量 | 关键问题 |
|:------:|:---:|---------|
| **P0 立即修复** | 3 | R3-S1（ArticleDetailView不加载）、R3-S2（DoctorChatView导入缺失）、R3-S3（认证清理链不完整） |
| **P1 本迭代** | 6 | S1（dead code）、S2（AiChatDialog综合）、S5（SQL注入）、S6（加密密钥）、S10（BC三缺陷）、S11（SSE 401无重定向） |
| **P2 下迭代** | 8 | S4（DOM属性）、S3（DisclaimerBar）、S12（onUnmounted）、S7-S16等 |
| **P3 后续优化** | 33 | 所有一般问题 |

---

## 实现计划与进度追踪

> 审议式实现流程（deliberative-implementation）进行中
> 实现分支：`202606301800_fix_review_issues`
> 实现目录：`implements/202606301800_fix_review_issues/`

### 批次 1 — P0 功能性断裂修复 ✅ 已完成

- [x] **S7** ArticleDetailView.vue — `fetchArticle()` 在 `onMounted` 中调用
- [x] **S8** DoctorChatView.vue — 补充 SkeletonLoader/ErrorRetry/EmptyState 组件导入 + ConversationHistoryItem 类型导入
- [x] **S9** authStore.clearAuth() — 清理链补充 chatStore.clearAllConversations() + riskFormStore.reset()

### 批次 2 — P1 设计合规修复 ✅ 已完成

- [x] **S1** App.vue — 删除 handleStorageChange + storage 事件监听器
- [x] **S2** AiChatDialog.vue — 4项综合修复（DOM id / XSS管道 / 免责声明 / Markdown 渲染）

### 批次 3 — P1 后端安全缺陷 ✅ 已完成

- [x] **S5** admin.js — SQL 注入修复（WHERE 子句参数化）
- [x] **S6** encryption.js — JWT_SECRET 缺失时抛出启动错误

### 批次 4 — P1 跨标签页认证修复 🔴 待实现

- [ ] **S10** authStore BroadcastChannel 三缺陷修复
  - 消息去重守卫（对比 token/role 是否一致）
  - syncFromStorage() 末尾调用 getBcChannel()
  - REQUEST_AUTH 消息机制支持新标签页
- [ ] **S11** chatStore sendStreamRequest — 401 后添加 `router.push('/login')`

### 批次 5 — P2 组件与DOM合规 🔴 待实现

- [ ] **S3** DisclaimerBar — 6个页面统一使用：DoctorChatView / LifePlan / Risk / Punch / Admin → `<DisclaimerBar>`，ArticleDetailView 正文后添加
- [ ] **S4** DOM id / data-* 属性 — 按优先级分批补充（优先 Risk.vue → Punch.vue → Home.vue → Profile.vue → Admin.vue → Login.vue → Consultation.vue → ArticleDetailView.vue）
- [ ] **S12** AiChatDialog.vue — 添加 `onUnmounted(() => { chatStore.abortActiveConnection() })`
- [ ] **S13** useAuth.ts — JwtPayload 字段名 `user_id` → `id`
- [ ] **S14** sseProxy.js — Mock 模式生成唯一 conversation_id
- [ ] **S15** chatStore — 添加 `clearMessages()` action，各处统一调用
- [ ] **S16** NewsView.vue — highlightKeyword 输出额外调用 sanitizeHtml()
- [ ] **S17** Home.vue — showDiabetesType 包裹 try-catch

### 批次 6 — P3 一般问题（前端） 🔴 待实现

- [ ] **G1** main.ts — 注释改为 `// 自动从 sessionStorage 恢复登录态`
- [ ] **G3** useApi.ts — 401 处理添加 redirect 参数
- [ ] **G4** enumLabels.ts — 重命名 LABELS → ENUM_LABELS 或添加注释
- [ ] **G5** chatStore.ts — 统一至 sessionStorage 或标注保留原因
- [ ] **G7** useAuth.ts — JwtPayload 索引签名 `any` → `unknown`
- [ ] **G8** useMarkdown.ts — 修复 `as any` 类型断言
- [ ] **G9** formatTime — 统一使用 helpers.ts 版本（清理 AiChatDialog/DoctorChatView 内联版本）
- [ ] **G10** "请先登录" Toast — 在 useUI.ts 添加 `showLoginRequired()` 辅助函数
- [ ] **G11** useApi.ts + chatStore.ts — SweetAlert2 改为静态导入
- [ ] **G13** Consultation.vue — 4处 `(doctor as any)` 改为 `DoctorDetail` 类型
- [ ] **G15** authStore.fetchProfile() — Profile.vue 改为调用 authStore.fetchProfile()
- [ ] **G16** DoctorDetail.is_online — 从接口移除或在数据库新增该列
- [ ] **G19** punchStore.requestId — 从 store return 移除公共导出
- [ ] **G22** DoctorChatView — 清空按钮添加 `:disabled="chatStore.isStreaming"`
- [ ] **G23** router/index.ts — `/change-password` 守卫使用 `replace: true`
- [ ] **G24** LoginResponse — 重命名为 `LoginData`，添加 `RegisterData`
- [ ] **G25** NewsView.vue — sessionStorage 恢复增加显式类型校验
- [ ] **G28** useUI.ts — loadingCounter 移到 composable 内部或标注 SPA-only
- [ ] **G32** helpers.ts — 泛型 `any[]` → `unknown[]`
- [ ] **G33** Login.vue — catch 块使用 `getErrorMessage()` 工具函数

### 批次 7 — P3 一般问题（后端） 🔴 待实现

- [ ] **G2** server/routes/dify.js — 创建或在设计文档中标注废弃
- [ ] **G6** admin.js — 表名白名单校验移至 `dispatchParameterizedQuery` 开头
- [ ] **G12** plan.js — `checkIdempotent` 移至 `callWorkflowBlocking` 之前
- [ ] **G14** punch.js — 更新 JSDoc 移除"AI"标注，长期接入 Dify 工作流
- [ ] **G17** 缺少 useRiskApi.ts — 创建并遵循现有 API composable 模式
- [ ] **G18** plan.js — LifePlan 接口添加 plan_id/is_active/created_at 可选字段
- [ ] **G20** chatStore.ts — 向 readSSEStream 传入 AbortSignal，reader.cancel()
- [ ] **G21** sseProxy.js — data handler 开头添加 `if (aborted || res.writableEnded) return;`
- [ ] **G26** risk.js — 正则回退解析增加 console.warn 日志
- [ ] **G27** sseProxy.js — 超时/错误处理增加 console.error 日志
- [ ] **G29** upload.js — filename 回调添加 req.user 防御性检查
- [ ] **G30** app.js — CORS 配置 origin 白名单 + 速率限制中间件
- [ ] **G31** 多条路由 — :id 参数添加合法整数校验

### 实现进度总览

| 批次 | 优先级 | 问题数 | 状态 | 提交 |
|------|:------:|:-----:|:----:|------|
| 1 | P0 | 3 | ✅ 完成 | `fd16e3f` |
| 2 | P1 | 2 | ✅ 完成 | `06d7db1` |
| 3 | P1 | 2 | ✅ 完成 | `266f297` |
| 4 | P1 | 2 | 🔴 待实现 | — |
| 5 | P2 | 8 | 🔴 待实现 | — |
| 6 | P3 前端 | 20 | 🔴 待实现 | — |
| 7 | P3 后端 | 13 | 🔴 待实现 | — |
| **合计** | — | **50** | **7/50** | **3 commits** |
