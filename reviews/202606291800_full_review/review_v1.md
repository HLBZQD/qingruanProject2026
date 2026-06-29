# Round 1: 设计合规性审查

## 审查范围

审查所有已实现的前端（Vue3 SPA, src/）和后端（Express, server/）代码，与详细设计文档 `docs/2_detailed_design_v4.md` 和交互原型 `docs/prototype.html` 进行逐项对比。覆盖 14 个前端视图、7 个组件、6 个 Store、13 个 composable、14 个后端路由模块、5 个中间件、数据库 DDL、类型定义、工具函数、路由配置及入口文件。

## 严重问题

### R1-S1. App.vue 遗留 dead code：localStorage `storage` 事件监听器与 v16 sessionStorage 迁移冲突

- **位置**: `src/App.vue:32-43`, `src/App.vue:49-51`
- **设计依据**: 设计文档 §1.5.2 (v16 修订)，v16 决策将存储介质由 localStorage 全面切换为 sessionStorage + BroadcastChannel 实现跨标签页同步
- **描述**: App.vue 的 `onMounted` 中注册了 `window.addEventListener('storage', handleStorageChange)`（第50行），在 `handleStorageChange` 函数内部读取 `localStorage.getItem('token')` 和 `localStorage.getItem('role')`（第34-35行）。然而 authStore 已按 v16 迁移至 sessionStorage（`authStore.ts:39-40`），`storage` 事件仅对 localStorage 变更触发，不会对 sessionStorage 变更触发。因此该监听器为 **永不会被触发的 dead code**，虽然不会导致功能错误，但：
  1. 留下了"使用 localStorage 进行跨标签页同步"的误导性代码痕迹
  2. BroadcastChannel 的正确同步逻辑已在 `authStore.ts:17-37` 实现，App.vue 的 `storage` 监听器应被清理
- **建议修复**: 删除 App.vue 中的 `handleStorageChange` 函数（第32-43行）、`storage` 事件监听注册（第50行）和注销（第53行），仅保留 authStore 内部的 BroadcastChannel 同步机制（已正确实现）

### R1-S2. AiChatDialog 缺少设计文档 §4.1.1 规定的 DOM id 属性

- **位置**: `src/components/AiChatDialog.vue:171-178`, `src/components/AiChatDialog.vue:182-198`
- **设计依据**: 设计文档 §4.1.1 App.vue 组件树，明确规定：
  - 已登录欢迎区: `<div id="fab-welcome-logged-in" class="welcome-tips" v-if="authStore.token">`
  - 未登录引导区: `<div id="fab-login-prompt" class="login-prompt" v-else>`
- **描述**: 代码中登录引导区使用了 `class="login-prompt"` 但无 `id="fab-login-prompt"`（第171行）；已登录欢迎区使用了 `class="welcome-area"` 但无 `id="fab-welcome-logged-in"`（第182行）。这些 id 是设计文档 §4.1.1 显式定义的 DOM 锚点，缺失可能导致：
  1. 自动化测试脚本（如 E2E 测试）无法定位这些关键 UI 区域
  2. 与设计文档的组件树契约断裂（组件树是前后端协作的接口约定的一部分）
  3. 未来若通过 DOM 选择器做埋点或 A/B 测试时将失效
- **建议修复**: 
  - 在第171行 `<div class="login-prompt">` 添加 `id="fab-login-prompt"`
  - 在第182行 `<div class="welcome-area">` 添加 `id="fab-welcome-logged-in"`

### R1-S3. AiChatDialog 内联复制免责声明逻辑，未复用 useUI composable

- **位置**: `src/components/AiChatDialog.vue:21-47`
- **设计依据**: 设计文档 §1.6.2 (v16 修订) 指出"hasAcceptedDisclaimer / showDisclaimer 待 useUI composable 实现后统一迁移至此"，useUI.ts 已在 `src/composables/useUI.ts:109-141` 完整实现
- **描述**: AiChatDialog.vue 内联定义了三个免责声明相关函数：`hasAcceptedDisclaimer()`（第21-23行）、`showDisclaimer()`（第25-37行）、`ensureDisclaimer()`（第39-47行），与 `useUI.ts` 导出的 `hasAcceptedDisclaimer()`（第109行）和 `showDisclaimer()`（第118行）完全重复。这违反了设计文档 v16 修订的"统一迁移至 useUI"意图，造成：
  1. 代码重复：两个文件维护相同的免责声明文案和 SweetAlert2 配置
  2. 维护风险：未来免责声明文案变更需同步修改两处
  3. AiChatDialog 的 `showDisclaimer()` 使用动态 `import('sweetalert2')`（第26行），而 useUI 使用统一的懒加载 `getSwal()` 机制（第15-20行），SweetAlert2 模块加载路径不统一
- **建议修复**: 从 AiChatDialog.vue 删除内联的 `hasAcceptedDisclaimer()`、`showDisclaimer()`、`ensureDisclaimer()` 三个函数，改为从 `useUI` 导入 `hasAcceptedDisclaimer` 和 `showDisclaimer`，`ensureDisclaimer` 逻辑在组件内重构为调用这两个导入函数

### R1-S4. DisclaimerBar 组件系统性未使用：6 个 AI 内容页面中仅 2 个正确引用

- **位置**: `src/views/DoctorChatView.vue`, `src/views/LifePlan.vue`, `src/views/Risk.vue`, `src/views/Punch.vue`, `src/views/Admin.vue`, `src/views/ArticleDetailView.vue`
- **设计依据**: 设计文档 §4.1.1 明确规定 `<DisclaimerBar>` 组件用于渲染医学免责标识条；§7.4 要求所有 AI 内容页面展示固定免责提示；§4.1.3 DoctorChatView 组件树显式包含 `<div class="disclaimer-bar">`；§4.1.7 Risk.vue 组件树包含 `<p class="disclaimer-text">`
- **描述**: 项目定义了统一的 `DisclaimerBar.vue` 可复用组件（带 `text` 和 `fixed` props），但 6 个展示 AI 生成内容的页面中，仅 `NewsView.vue` 和 `HealthAdvice.vue` 正确引用了 `<DisclaimerBar>` 组件。其余 4 个页面使用内联硬编码 `<div>` 或 `<p>` 渲染免责文本，造成：
  1. 免责文本分散在 4 个文件中（DoctorChatView inline div、LifePlan `.lp-disclaimer`、Risk `.disclaimer-text`、Punch `.punch-disclaimer`），文案维护成本高
  2. Admin.vue 使用内联 `<div class="disclaimer-bar">` 但样式不同于 DisclaimerBar 组件
  3. ArticleDetailView.vue 完全缺失免责声明，AI 生成文章详情页没有任何免责标识
- **建议修复**:
  - DoctorChatView.vue: 将内联 `<div class="disclaimer-bar">` 替换为 `<DisclaimerBar text="本对话由AI虚拟医师提供，回复内容仅供参考，不能替代专业医疗诊断。" />`
  - LifePlan.vue: 将 `<div class="lp-disclaimer">` 替换为 `<DisclaimerBar fixed />`
  - Risk.vue: 将 `<p class="disclaimer-text">` 替换为 `<DisclaimerBar />`
  - Punch.vue: 将 `<div class="punch-disclaimer">` 替换为 `<DisclaimerBar text="打卡分析由 AI 生成，仅供参考。" />`
  - Admin.vue: 将内联 `<div class="disclaimer-bar">` 替换为 `<DisclaimerBar text="管理员操作将记录至审计日志，请谨慎执行。" />`
  - ArticleDetailView.vue: 在正文渲染后添加 `<DisclaimerBar />`

### R1-S5. 前端视图系统性缺失设计文档 §4.1 规定的 DOM id 和 data-* 属性

- **位置**: 多个文件（见下文详细列表）
- **设计依据**: 设计文档 §4.1 各页面组件树显式定义了 DOM 元素的 `id` 和 `data-*` 属性
- **描述**: 设计文档 §4.1 为几乎所有关键 DOM 节点规定了 `id` 和 `data-*` 属性（如 `#doctors-section`、`#bannerDiv`、`#chat-messages`、`#risk-level-badge`、`data-doctor="id"` 等），这些属性是组件树的约定接口。但实际代码中大量使用 CSS class 和 `v-for` 索引替代，缺失情况如下：
  - **Home.vue**: 缺失 `#doctors-section`、`#articles-section`、`#types-section`、`data-doctor` 属性
  - **Consultation.vue**: 缺失 `data-doctor="id"` 属性
  - **Profile.vue**: 缺失 `#avatar-upload-trigger`、`#user-avatar`、`#profile-username`、`#profile-role`、`#avatar-input`、`#btn-logout`
  - **Risk.vue**: 缺失 `data-step`、`#step-1/2/3`、`#risk-level-badge`、`#risk-level-text`、`#risk-score`、`#suggestions-list`、`#field-error-container`
  - **Punch.vue**: 缺失 `#analysis-section`、`#diet-rate`、`#exercise-rate`、`#total-punches`、`#trend-chart`、`#punch-list`、`#empty-container`、`#btn-load-more`
  - **Admin.vue**: 缺失 `#admin-chat-messages`、`#admin-msg-input`、`#admin-send-btn`、`#btn-view-logs`、`#logs-list`、`#btn-back-to-chat`
  - **Login.vue**: 缺失 `#login-container`、`#register-container`、`#login-username`、`#login-password`、`#login-error`、`#register-error`、`#link-to-register`、`#link-to-login`
  - **ArticleDetailView.vue**: 缺失 `#article-content`、`data-collected` 属性、`<img class="article-cover">`
  
  虽然功能上 Vue 的 `ref` 和 `v-model` 替代了 DOM id 选择器的需求，但设计文档的 id/属性约定是自动化测试（E2E）、埋点和无障碍访问的重要锚点。Vue 的响应式系统不依赖 DOM id，但测试脚本和辅助技术依赖这些标记。全部 14 个视图中仅 `DoctorChatView.vue` 的 `#chat-messages`、`#msgInput`、`#sendBtn` 三个 id 被正确保留。
- **建议修复**: 此为系统性债务，建议在后续轮次按视图优先级分批补充 id 属性（优先 Risk.vue 和 Punch.vue——这两个页面的自动化测试覆盖率最可能被需要）

## 一般问题

### R1-G1. main.ts 注释与实际存储介质不一致

- **位置**: `src/main.ts:12`
- **设计依据**: 设计文档 §1.4 main.ts 伪代码注释说明 v16 切换至 sessionStorage
- **描述**: 第12行注释写 `// 自动从 localStorage 恢复登录态`，但 `authStore.syncFromStorage()` 实际从 sessionStorage 读取（authStore.ts:86）。代码运行时行为正确，注释为 stale 遗留文字。
- **建议修复**: 将注释改为 `// 自动从 sessionStorage 恢复登录态`

### R1-G2. 后端缺失 Dify 代理路由文件

- **位置**: `server/routes/` 目录
- **设计依据**: 设计文档 §3.1.11 定义了两个 Dify 代理端点:
  - `POST /api/dify/workflow/:workflow_id`
  - `POST /api/dify/agent/:agent_id`
  设计文档 §1.4 模块划分中明确列出 `server/routes/dify.js` 作为 14 个路由模块之一。
- **描述**: `server/routes/dify.js` 文件不存在，对应的两个端点未在路由挂载表 (`server/routes/index.js`) 中注册。实际的 Dify 调用是各业务路由（risk.js, plan.js, chat.js 等）通过 `difyService.js` 内部调用的，未暴露为独立的 Dify 代理端点。如果这两个端点被设计为面向前端的透传代理（供 `useApi` 直接调用），则当前实现存在功能缺口。
- **建议修复**: 若设计意图是前端通过这两个端点直接调用 Dify（如绕过 Express 业务逻辑的场景），则需创建 `server/routes/dify.js` 并挂载。若当前架构已废弃这两个端点（各路由直接调用 difyService），则应在设计文档中标注这两个端点为"已废弃/已内化"。

### R1-G3. useApi 401 响应拦截器未保留 redirect 参数

- **位置**: `src/composables/useApi.ts:54`
- **设计依据**: 设计文档 §7.1 JWT 鉴权流程中过期处理步骤明确写道: `router.push('/login?redirect=当前路径')`
- **描述**: useApi.ts 的 401 响应拦截器在第54行执行 `router.push('/login')`，未将当前页面路径作为 `redirect` query 参数附带。虽然路由守卫 `router/index.ts:111` 在无 token 或 token 过期时将 `to.fullPath` 编码为 redirect 参数，但 useApi 中的 401 处理不会经过路由守卫，用户被踢到登录页后登录成功无法回跳到原访问页面。
- **建议修复**: 在第54行改为 `router.push('/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search))` 或等效逻辑

### R1-G4. AiChatDialog 未使用共享 useMarkdown composable

- **位置**: `src/components/AiChatDialog.vue:112-121`
- **设计依据**: 设计文档 §1.3 技术选型表定义 marked.js + DOMPurify 为前端统一的 Markdown 渲染方案；`src/composables/useMarkdown.ts` 为设计文档 §4.4 定义的公共 TypeScript 模块
- **描述**: AiChatDialog.vue 的 `renderContent()` 函数（第112-121行）内联使用 `marked.parse()` + `DOMPurify.sanitize()`，未调用 `useMarkdown.ts` 导出的 `renderMarkdown()` 函数。差异在于：
  1. 共享 composable 在 `marked.use()` 中注册了自定义 link renderer（为外部链接添加 `target="_blank" rel="noopener noreferrer"`），AiChatDialog 的内联渲染未启用此功能，AI 回复中的外部链接不会在新标签页打开
  2. 若未来 marked 升级至 v13+ 异步模式，仅需修改 useMarkdown.ts 一处的 G16 注释标注的迁移点
- **建议修复**: 将 AiChatDialog 的 `renderContent()` 改为调用 `useMarkdown` 从 `@/composables/useMarkdown` 导入的 `renderMarkdown()`

### R1-G5. enumLabels 常量命名与设计文档不一致

- **位置**: `src/utils/enumLabels.ts:1`
- **设计依据**: 设计文档 §1.8.1 定义 `const ENUM_LABELS = { ... }`
- **描述**: 代码中常量命名为 `LABELS`，设计文档伪代码中为 `ENUM_LABELS`。功能完全一致（所有 8 个类别 21 个映射对均匹配设计）。此差异不影响功能，但降低代码与设计文档之间的可追溯性。
- **建议修复**: 将 `LABELS` 重命名为 `ENUM_LABELS` 以对齐设计文档 §1.8.1，或在文件顶部添加注释说明命名差异

### R1-G6. 路由表新增 `/news/collections` 不在设计文档中

- **位置**: `src/router/index.ts:39-43`
- **设计依据**: 设计文档 §1.6.1 路由映射表仅定义了 `/news` 和 `/news/article/:id` 两个新闻相关路由
- **描述**: 路由表中包含 `path: '/news/collections'`（name: 'NewsCollections', component: CollectionsView.vue），这是一个功能性新增页面（独立的收藏列表视图），设计文档 §1.6.1 路由表中未定义此路由。CollectionsView.vue 也未出现在设计文档 §1.4 模块划分的 views/ 文件列表中。此功能为用户提供了独立的"我的收藏"入口，是有意扩展而非 bug。
- **建议修复**: 在设计文档 §1.6.1 路由表中补充 `/news/collections` 路由条目，在 §1.4 views/ 列表中补充 `CollectionsView.vue`

### R1-G7. chatStore 使用 localStorage 持久化 conversation_id，与 v16 sessionStorage 迁移方向有偏离

- **位置**: `src/stores/chatStore.ts:129-136`, `src/stores/chatStore.ts:152-157`
- **设计依据**: 设计文档 §3.7 chatStore 接口定义注释说明 conversation_id 通过 `pinia-plugin-persistedstate` 持久化到 localStorage，但 v16 修订后 pinia-plugin-persistedstate 已移除。§1.5.1 v16 修订说明未明确 conversation_id 的持久化介质。
- **描述**: chatStore 的 `getDoctorConversation()` 和 `setDoctorConversation()` 使用 localStorage 键 `qrzl_conv_{doctorId}` 持久化医生对话 ID。虽然 conversation_id 不是认证 Token（无需跨标签页隔离），但 chatStore 在 v16 框架下不应使用 localStorage 而应统一使用 sessionStorage（或由调用方自行管理持久化）。当前混合使用 sessionStorage（authStore）+ localStorage（chatStore）的持久化方案偏离了 v16 统一迁移至 sessionStorage 的设计意图。
- **建议修复**: 评估 conversation_id 的跨标签页需求：若需隔离（不同标签页不同会话），改为 sessionStorage 存储；若需共享（同一用户同一会话），可使用 BroadcastChannel 同步。建议至少与 design doc v16 方向一致，将 localStorage 替换为 sessionStorage。

## 合规通过项

以下方面经逐项审查，代码实现与设计文档完全一致：

| 审查项 | 设计依据 | 状态 |
|--------|---------|------|
| 数据库 DDL（10 张表 + 索引） | §2.2 | 完全匹配 |
| 路由使用 `createWebHistory` 非 hash | §1.6.1 | 通过 |
| 路由守卫 5 步检查（公开路由/Token/角色/改密/免责） | §1.6.2 | 通过 |
| `requiresDisclaimer` meta 守卫覆盖 AI 页面 | §1.6.2 | 通过 |
| authStore 使用 sessionStorage + BroadcastChannel | §1.5.2 (v16) | 通过 |
| main.ts 不导入 `setupAxiosInterceptors` | §1.4 (v16) | 通过 |
| main.ts 不导入 `pinia-plugin-persistedstate` | §1.4 (v16) | 通过 |
| main.ts 从 `assets/variables.css` 导入 CSS 变量 | §1.4 (v16) | 通过 |
| main.ts 从 `styles/animations.css` 导入动画 | §1.4 (v16) | 通过 |
| chatStore 消息列表命名为 `conversations` | §1.5.1 注释 | 通过 |
| riskFormStore sessionStorage 键 `risk_form_data` | §3.7 | 通过 |
| enumLabels 映射字典 8 类 21 对完全匹配 | §1.8.1 | 通过 |
| 前端类型定义（api.ts, models.ts） | §3.8 | 通过 |
| 所有 32 个核心 API 端点均已实现（除 dify 代理） | §3.1 | 94% (30/32) |
| useUI 提供 `hasAcceptedDisclaimer` / `showDisclaimer` | §1.6.2 (v16) | 通过 |
| useSSE 处理 message/error/message_end 事件 | §3.3 | 通过 |
| DisclaimerBar 组件提供固定免责文本 | §4.1.1 | 通过 |
| 5 个 Tab 路径、标签、图标正确 | §4.1.1 | 通过 |
| `server/middleware/auth.js` JWT 验证逻辑 | §7.1 | 通过 |
| `server/middleware/difyAuth.js` 双认证模式 | §7.3.2 | 通过 |
| punch_type CHECK 约束仅含 diet/exercise (v14) | §2.2 | 通过 |
| pregnancy INTEGER (0/1/NULL) CHECK 约束 (v14) | §2.2 | 通过 |
| tags JSON 序列化/反序列化 | §1.8.4 | 通过 |

## 审查统计

- 审查文件数: 56（14 个 Vue 视图 + 7 个组件 + 6 个 Store + 13 个 composable/工具 + 13 个后端路由 + 3 个核心配置）
- 严重问题: 5
- 一般问题: 7

## 审查结论

代码实现与设计文档的整体一致性良好。核心架构决策（sessionStorage + BroadcastChannel 方案、en-US 枚举值 + enumLabel 中文展示、5 步路由守卫、14 组 API 端点）均已按设计落地。DDL 与设计文档完全匹配，TypeScript 类型定义覆盖全面。

主要问题集中在五个方面：
1. **App.vue 遗留 dead code**: localStorage `storage` 事件监听器与 v16 sessionStorage 迁移冲突，BroadcastChannel 已在 authStore 正确实现
2. **DisclaimerBar 组件系统性未使用**: 6 个 AI 内容页面中仅 2 个引用了统一的 `<DisclaimerBar>` 组件，其余使用内联硬编码，ArticleDetailView 完全缺失免责声明
3. **DOM id 和 data-* 属性系统性缺失**: 设计文档 §4.1 为各页面组件树规定的 id/data-* 属性在全部 14 个视图中几乎全部缺失（仅 DoctorChatView 的 3 个 id 被保留）
4. **AiChatDialog 设计合规性缺口**: 缺少 §4.1.1 规定的两个 DOM id、内联复制了 useUI 已实现的免责声明逻辑、未使用共享 useMarkdown composable
5. **细节不一致**: 注释、常量命名、401 跳转缺少 redirect 参数、Dify 代理路由缺失

这些问题的共同特征是：功能正确但设计合规标记缺失或代码清理不彻底。DOM id 缺失（R1-S5）是规模最大的系统性债务，影响自动化测试和辅助技术的可访问性。DisclaimerBar 分散使用（R1-S4）是合规风险最集中的问题——多个 AI 内容页面的免责提示文案分散在 4 个文件中，ArticleDetailView 的免责声明完全缺失。

整体评价：代码实现遵循设计文档的核心意图和架构决策，枚举值映射机制、路由守卫、Store 通信、API 契约等关键设计点均正确实现。主要偏差属于实现细节层的遗漏（DOM 标记）和清理不彻底（v16 迁移 dead code），无架构性偏离。
