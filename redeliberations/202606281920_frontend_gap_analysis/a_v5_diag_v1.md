# 前端模块实现差距诊断报告 v5

## 1. 诊断概述

**诊断对象**：`src/` 下所有前端模块的实现状态与 `docs/2_detailed_design_v3.md` 定义的对比分析。

**诊断方法**：逐模块阅读设计文档（第1-5章）与全部源代码文件，逐功能点对比，确认已实现/部分实现/未实现/偏离项目。对后端 API 依赖项，通过阅读 `server/routes/` 下全部路由文件验证后端端点实现状态。

**核心发现**：
- 设计文档定义 3 个 Pinia Store、4 个 composables（useApi / useAuth / useSSE / useUI）、13 个页面组件、7 个复用组件。
- 实际代码有 6 个 Pinia Store、10 个 composables、13 个页面组件、7 个复用组件，但存在结构偏离和若干功能未实现。
- 主要偏离点：设计使用 localStorage + pinia-plugin-persistedstate，实际使用 sessionStorage + BroadcastChannel；设计定义 useAuth/useSSE/useUI 三个独立 composable，实际将这些逻辑散落到 Store 和页面中；多个功能标记为占位/开发中。

---

## 2. 基础设施层差距分析

### 2.1 main.ts（应用入口）

**设计要求**（文档 1.4 节第 258-285 行）：
1. 导入 `pinia-plugin-persistedstate` 并注册 `pinia.use(piniaPluginPersistedstate)`
2. 调用 `setupAxiosInterceptors()` 注册 Axios 全局拦截器
3. 导入 `./styles/variables.css` 和 `./styles/common.css`

**实际状态**：部分实现 — 偏离设计
- ❌ `pinia-plugin-persistedstate` 未安装/未使用 — 根因：`src/main.ts:9` 仅调用 `app.use(createPinia())`，无插件注册。实际使用 sessionStorage + BroadcastChannel 替代持久化方案。
- ❌ `setupAxiosInterceptors()` 未被调用 — 根因：`useApi.ts:11-58` 在模块顶层直接定义了 axios 实例和拦截器（导入即生效），不走设计定义的显式初始化函数。拦截器在 `import { api } from '@/composables/useApi'` 时自注册，功能等价但不经 main.ts 显式调用链。
- ❌ 样式路径偏离：设计引用 `./styles/variables.css`，实际为 `./assets/variables.css`；设计引用 `./styles/common.css`，实际无此文件，改为 `./styles/animations.css`（`main.ts:5-6`）。
- ✅ 设计定义 `authStore.syncFromStorage()` 在 main.ts 中显式调用以恢复登录态，实际 main.ts 第 15 行确实有此调用，此点符合设计。
- ⚠️ `main.ts:12` 注释"自动从 localStorage 恢复登录态"与实际存储介质 `sessionStorage`（`authStore.ts:39-41`）不一致，注释需修正为 sessionStorage。

**偏离根因**：团队选择 sessionStorage + BroadcastChannel 方案替代 localStorage + pinia-plugin-persistedstate 方案，此决策是实现层面的有意选择而非遗漏，但未在设计中体现。此偏离影响跨标签页认证同步行为（BroadcastChannel 不持久化，标签页关闭后丢失；设计原方案 localStorage 持久化，刷新不丢失）。

### 2.2 env.d.ts

**设计要求**（文档 1.4 节第 321-332 行）：存在 `src/env.d.ts`，包含 `.vue` 模块类型声明和 Vite 环境变量类型引用。

**实际状态**：文件缺失，但无实际功能影响
- ❌ `src/env.d.ts` 不在实际代码中
- ⚠️ `.vue` 模块类型声明：Vite 客户端类型库（`tsconfig.app.json:5` 配置 `"types": ["vite/client"]`）已内置 `.vue` 模块的类型声明，项目当前无因 env.d.ts 缺失导致的 `.vue` import 编译错误
- ⚠️ Vite 环境变量类型引用（`ImportMetaEnv` 扩展）：经全局代码搜索确认，项目当前未使用任何自定义 `VITE_*` 环境变量，`import.meta.env` 在 `src/` 下无引用。此部分也无实际影响

**结论**：env.d.ts 的缺失在当前项目状态下不造成任何编译或运行时问题。A1 任务中 `.vue` 模块声明的部分是冗余工作（Vite 已内置）；Vite 环境变量类型扩展在当前也无实际需要（项目未使用自定义环境变量）。若未来引入自定义环境变量，届时再建 env.d.ts 即可。

### 2.3 vite.config.ts

**设计要求**（文档 1.4 节第 287-318 行）：配置 `@` 路径别名、开发代理 `/api`→`localhost:3000`、`/static`→`localhost:3000`。

**实际状态**：已实现
- ✅ 文件存在，路径别名和代理配置与设计一致

### 2.4 样式文件

**设计要求**（文档 1.4 节第 200-202 行）：
- `src/styles/variables.css` — CSS 变量定义（设计系统）
- `src/styles/common.css` — 公共组件样式

**实际状态**：部分实现 — 偏离
- ❌ `src/styles/variables.css` 不存在 — 实际为 `src/assets/variables.css`，CSS 变量定义完整
- ❌ `src/styles/common.css` 不存在 — 实际为 `src/styles/animations.css`
- `src/assets/variables.css` 包含了设计要求的全部 CSS 变量（颜色、字体、间距、圆角、阴影、过渡），内容完整

---

## 3. TypeScript 类型层差距分析

### 3.1 src/types/api.ts

**设计要求**（文档 1.4 节第 168-170 行）：定义 API 请求/响应类型（RiskPredictRequest, PaginatedResponse<T>, ApiError 等）。

**实际状态**：已实现，且超出设计范围
- ✅ 包含设计要求的全部类型（ApiError, PaginationParams, PaginationInfo, LoginRequest/Response, RegisterRequest, UserProfile, RiskPredictRequest/Response, RiskHistoryItem, Doctor/DoctorDetail, Article/ArticleDetail, DiabetesType, LifePlan, PlanResponse, PunchRecord, PunchAnalysisResponse, HealthAdvice 等）
- ✅ 类型策略采用内联定义而非泛型包装器，符合设计文档 3.8.3 节规范
- ✅ 枚举字段全部使用英文枚举值（如 `'diet' | 'exercise'`），对齐 1.8.2 节四层统一英文规范

### 3.2 src/types/models.ts

**设计要求**（文档 1.4 节第 169 行）：定义业务实体类型（User, Doctor, Article, LifePlan, PunchRecord 等）。

**实际状态**：未创建（但功能上已由 api.ts 覆盖）
- ❌ 文件不存在。业务实体类型全部整合在 `api.ts` 中（如 `Doctor`, `Article`, `LifePlan`, `PunchRecord` 等），未按设计独立为 `models.ts`。
- 影响：设计定义的两个类型文件有明确职责划分（api.ts 为请求/响应，models.ts 为业务实体），当前合并为一文件。不影响功能，但偏离设计规范。

### 3.3 src/types/sse.ts

**设计要求**（文档 1.4 节第 170 行）：定义 SSE 事件类型（SSEMessageEvent, SSEErrorEvent, SSEMessageEndEvent 等）。

**实际状态**：已实现
- ✅ 包含 7 个事件类型（SSEMessageEvent, SSEMessageEndEvent, SSEErrorEvent, SSEWorkflowStartedEvent, SSEWorkflowFinishedEvent, SSEAgentMessageEvent, SSEAgentThoughtEvent）
- ✅ SSEEvent 联合类型正确
- ✅ ChatMessage 类型定义完整（对齐文档 3.8.7 节）

---

## 4. Store 层差距分析

### 4.1 authStore.ts

**设计要求**（文档 1.5.1 节第 342 行、1.5.2 节第 349-387 行）：

| 接口 | 设计要求 |
|------|---------|
| 存储 | localStorage（token/role/user） |
| login() | 调用 api.post('/api/auth/login')，从 res.data.role 提取 role |
| logout() | 清除 token/role/user/mustChangePassword，清除 localStorage，router.push('/home') |
| setToken() | 设置 token + localStorage |
| setAuth() | 同时设置 token/role/user + localStorage |
| syncFromStorage() | 从 localStorage 恢复全部三个字段 |
| clearAuth() | 清除认证状态 + localStorage |
| fetchProfile() | 调用 GET /api/user/profile |
| mustChangePassword | 管理员的首次改密标记 |
| 持久化插件 | pinia-plugin-persistedstate |

**实际状态**：已实现 — 偏离
- ✅ login/logout/setToken/setAuth/syncFromStorage/clearAuth/fetchProfile/setProfile/clearMustChangePassword — 全部实现
- ❌ 存储介质偏离：设计用 `localStorage`，实际用 `sessionStorage`（`authStore.ts:39-41`）
- ❌ 持久化方案偏离：设计用 `pinia-plugin-persistedstate`，实际用手动 sessionStorage 读写 + BroadcastChannel 跨标签页广播
- ✅ BroadcastChannel 跨标签页同步（`authStore.ts:17-37`）为实际代码独有的增强功能，设计未定义
- ✅ clearAuth 联动清理 homeStore 和 lifePlanStore 缓存（`authStore.ts:118-119`），设计未定义此联动
- ✅ role 独立 ref 声明 + parseRole 函数（`authStore.ts:8-11`），对齐设计 v14 修订

**偏离根因**：团队选择了 sessionStorage（标签页隔离）替代 localStorage（跨标签页共享），并通过 BroadcastChannel 实现跨标签页同步。此方案解决了设计原 localStorage 方案中"多标签页同时登录不同账号导致 token 覆盖"的问题，但引入了"新标签页/右键打开需重新登录"的限制。

### 4.2 chatStore.ts

**设计要求**（文档 1.5.1 节、3.7 节）：

| 接口 | 设计要求 |
|------|---------|
| doctorConversations | Map<number, string>（按医生 ID 管理会话 ID） |
| assistantConversationId | string \| null |
| adminConversationId | string \| null |
| messages | Message[]（对话消息列表） |
| fabOpen | boolean（FAB 弹窗状态） |
| isStreaming | boolean（SSE 连接状态） |
| activeAbortController | AbortController \| null（SSE 连接控制） |
| sendMessage() | 发送医生对话 + SSE 流式消费 |
| toggleFab() | 切换 FAB 弹窗 |
| navigate() | AI 回复中的跨模块导航（router.push） |
| get/set/clear DoctorConversation | 医生会话 ID 管理 |
| get/set/clear AssistantConversation | 助手会话 ID 管理 |
| get/set/clear AdminConversation | 管理员会话 ID 管理 |
| registerAbortController() | SSE 连接控制 |
| abortActiveConnection() | 中止活跃连接 |
| clearAllConversations() | 登出时清理所有会话 |

**实际状态**：部分实现
- ✅ 全部 state 字段已实现
- ✅ sendMessage / sendMessageWithRetry / sendAssistantMessage / sendAdminMessage — 全部实现
- ✅ 多医生会话管理（getDoctorConversation / setDoctorConversation / clearDoctorConversation）— 实现
- ✅ SSE 解析（parseSSEBuffer）和事件分发（dispatchSSEEvent）— 完整实现
- ✅ 断线重连（sendMessageWithRetry，固定间隔 2s/4s/8s 共 3 次）— v3 简化版已实现
- ✅ conversation_id 双层存储（内存 Map + localStorage）— 实现
- ❌ **navigate() 为占位实现**（`chatStore.ts:716-718`）：`function navigate(_path: string): void { // v3 留空，v4 实现 }`
  - 根因：AI 助手跨模块导航功能未实现。当 AI 回复含导航指令时无法跳转。
- ❌ **chatStore 未通过 pinia-plugin-persistedstate 持久化**：设计定义 chatStore.doctorConversations/assistantConversationId/adminConversationId 需持久化。实际通过手动 Map→localStorage 实现 doctorConversations 持久化，assistantConversationId/adminConversationId 未持久化（刷新丢失）。
- ❌ **会话历史加载未实现**：设计定义 `GET /api/chat/doctor/:id/conversations`（后端已实现，`server/routes/chat.js:40-53`）和 `GET /api/assistant/conversations`（后端已实现，`server/routes/assistant.js:64-74`）两个历史会话接口，但前端 composable 层和 chatStore 均未实现历史消息加载和展示。
- ❌ Admin.vue 自行实现了 SSE 解析和事件分发（`Admin.vue:36-78`），重复了 chatStore 的逻辑，偏离了设计"SSE 逻辑统一在 chatStore"的架构要求。

### 4.3 riskFormStore.ts

**设计要求**（文档 1.5.1 节第 344 行）：

| 接口 | 设计要求 |
|------|---------|
| currentStep | 1 \| 2 \| 3 |
| formData | RiskFormData |
| result | RiskResult \| null |
| saveStep() | 保存步骤数据 |
| saveResult() | 保存预测结果 |
| reset() | 重置所有状态 |
| loadFromStorage() | 从存储恢复 |

**实际状态**：已实现
- ✅ 所有接口完整实现
- ✅ sessionStorage 持久化（含类型校验和恢复防御）
- ✅ 数字字段恢复时强制类型转换（NUMBER_FIELDS）
- ✅ 枚举字段允许值校验（ENUM_FIELDS）
- ✅ clearSession() / reset() 已实现
- ✅ isValidResult() 防御校验

### 4.4 设计外新增 Store

**homeStore.ts / lifePlanStore.ts / punchStore.ts**：三个 Store 在设计文档 1.5 节未定义，属于实际代码扩展。
- homeStore.ts：管理首页数据（doctors/articles/diabetesTypes），含 sessionStorage 缓存（TTL 1h），独立错误态、重试、详情按需加载
- lifePlanStore.ts：管理生活方案（生成/调整/打卡），含 sessionStorage 缓存（TTL 30min），乐观更新、409 幂等识别、历史降级
- punchStore.ts：管理打卡记录（列表/分析/筛选），含防竞态 requestId、防抖 fetchAnalysis、分页加载更多

**根因**：设计文档 1.5 节仅定义了 3 个跨组件通信 Store，未覆盖页面级业务状态管理需求。这三个新增 Store 是符合模块依赖方向规则（composables 不依赖页面组件）的合理扩展。

---

## 5. Composable 层差距分析

### 5.1 useApi.ts

**设计要求**（文档 1.4 节第 194 行）：API 请求封装（axios + JWT + 拦截器）。

**实际状态**：已实现
- ✅ axios 实例创建、baseURL '/api'、15s 超时
- ✅ 请求拦截器：自动注入 Authorization header
- ✅ 响应拦截器：401 → clearAuth + SweetAlert2 Toast + router.push('/login')
- ✅ success:false 响应拦截（G14-phase1 日志收集期）
- ✅ createCancelToken() 工具函数

### 5.2 useAuth.ts

**设计要求**（文档 1.4 节第 195 行）：JWT 认证工具（Token 读写、解析、过期检测）。

**实际状态**：未实现
- ❌ 文件不存在。JWT 解析功能完全缺失——authStore（`authStore.ts:39-41`）仅将 token 作为不透明字符串（opaque string）存储在 sessionStorage，通过 setToken()/setAuth() 写入、syncFromStorage() 恢复、token ref 公开读写。代码中不存在任何 JWT 解析逻辑：无 atob 解码、无 base64 解码、无 payload 提取、无 exp 字段检查。
- 缺失功能：
  - JWT Token 解析（从 token 中提取 payload — 需实现 split('.') → atob(payload) → JSON.parse → JwtPayload 类型提取）
  - JWT Token 过期检测（检查 exp 字段，Date.now()/1000 > payload.exp 判定过期）
  - 作为独立工具函数的 Token 读写（当前仅通过 authStore 封装为 Pinia state，非可复用纯函数）

### 5.3 useSSE.ts

**设计要求**（文档 1.4 节第 196 行）：SSE 流式请求封装。

**实际状态**：未实现
- ❌ 文件不存在。SSE 流式消费逻辑分散在 chatStore.ts（readSSEStream / parseSSEBuffer / dispatchSSEEvent）和 Admin.vue（内联的 readSSEStream / parseSSEBuffer / dispatchSSEEvent）。
- 缺失功能：作为独立 composable 的通用 SSE 流式请求封装（可复用于 doctor/assistant/admin 三种场景）。

### 5.4 useUI.ts

**设计要求**（文档 1.4 节第 197 行）：UI 工具（Toast、Loading）。

**实际状态**：未实现
- ❌ 文件不存在。UI 工具（Toast/Loading）散落在各页面组件中通过 SweetAlert2 内联调用。
- 设计文档 1.6.2 节路由守卫伪代码引用了 `useUI().showDisclaimer()` 和 `useUI().hasAcceptedDisclaimer()`，但实际路由守卫（`router/index.ts:93-109`）将这些函数直接定义在路由文件中，未走 useUI。

### 5.5 设计外新增 Composable

以下 composables 在设计文档 1.4 节未定义，为实际代码扩展：

| 文件 | 职责 | 状态 |
|------|------|------|
| useHomeApi.ts | 首页数据 API（doctors/articles/diabetes-types/articles/:id） | ✅ 完整实现 |
| useChatApi.ts | 对话 API（sendChatMessage/sendAssistantChatMessage/getDoctorInfo）+ sendAdminChatMessage（也存在于 useAdminApi.ts 中，重复定义） | ✅ 实现 |
| useLifePlanApi.ts | 方案 API（getCurrentPlan/generatePlan/adjustPlan/createPunch） | ✅ 完整实现 |
| usePunchApi.ts | 打卡 API（getPunchList/getPunchAnalysis） | ✅ 完整实现 |
| useAdviceApi.ts | 健康建议 API（getHealthAdvice） | ✅ 完整实现 |
| useArticleApi.ts | 文章生成 API（generateArticle 两阶段 + 类型守卫） | ✅ 完整实现 |
| useAdminApi.ts | 管理 API（getAdminLogs/sendAdminChatMessage） | ✅ 实现 |
| useUserApi.ts | 用户 API（changePassword） | ✅ 实现 |
| useMarkdown.ts | Markdown 渲染管道（marked + DOMPurify + 链接安全） | ✅ 完整实现 |

---

## 6. 路由模块差距分析

### 6.1 路由表对比

**设计要求**（文档 1.6.1 节，14条路由）：

| 路径 | 组件(懒加载) | requiresAuth | requiresAdmin |
|------|-------------|:-----------:|:-------------:|
| /home | Home.vue | false | false |
| /consultation | Consultation.vue | false | false |
| /consultation/doctor/:id | DoctorChatView.vue | true | false |
| /life-plan | LifePlan.vue | true | false |
| /news | NewsView.vue | false | false |
| /news/article/:id | ArticleDetailView.vue | false | false |
| /profile | Profile.vue | true | false |
| /profile/risk | Risk.vue | true | false |
| /profile/punch | Punch.vue | true | false |
| /profile/advice | HealthAdvice.vue | true | false |
| /admin | Admin.vue | true | true |
| /change-password | ChangePassword.vue | true | false |
| /login | Login.vue | false | false |
| /:pathMatch(.*)* | redirect /home | — | — |

**实际状态**（`router/index.ts:5-82`）：

- ✅ 14 条路由全部存在，路径、组件映射与设计一致
- ✅ 全部使用懒加载（`() => import(...)` 语法），与设计一致
- ✅ meta.requiresAuth 字段全部与设计一致
- ✅ meta.requiresAdmin 仅 `/admin` 设置 true，与设计一致
- ✅ `/profile` 嵌套路由（children 数组 — risk/punch/advice 三条子路由）结构与设计完全一致
- ⚠️ **路由声明顺序偏离**：设计文档（1.6.1）中 `/news` 排在 `/news/article/:id` 之前，但实际代码中 `/news/article/:id`（`router/index.ts:31`）声明在 `/news`（`router/index.ts:37`）之前。此差异为有意为之——Vue Router 按声明顺序匹配路由，`/news/article/:id` 必须先于 `/news` 才能正确匹配（否则 `/news` 会先匹配到 `/news/article/123` 的 `/news` 前缀并返回 NewsView 而非 ArticleDetailView）。此差异属于设计文档精度不足（未体现路由顺序约束），而非实现偏离。
- ⚠️ **meta.requiresDisclaimer 字段**：设计文档路由表（1.6.1）中未列出此 meta 字段，但导航守卫伪代码（1.6.2 第 568 行）引用了 `to.meta.requiresDisclaimer`。实际代码中此字段设置于：`/consultation/doctor/:id`（第 22 行）、`/life-plan`（第 28 行）、`/profile/risk`（第 49 行）、`/profile/advice`（第 59 行）。此 meta 字段为设计隐含要求（AI 功能入口需免责声明），实际实现与设计意图一致，但设计路由表应显式声明此字段。
- ⚠️ **路由命名不全**：设计文档未定义路由 name。实际代码为 `/consultation/doctor/:id` 命名 `'DoctorChat'`（第 18 行），`/news/article/:id` 命名 `'ArticleDetail'`（第 32 行）。其余路由未命名。命名路由可用于 `router.push({ name: 'DoctorChat', params: { id: 1 } })` 编程式导航，当前仅两处使用。此差异不影响功能。

### 6.2 全局导航守卫对比

**设计要求**（文档 1.6.2 节第 540-583 行，5 步骤）：

1. 公开路由（`requiresAuth === false`）直接放行
2. **检查 Token 是否存在且未过期**，无效则重定向 `/login?redirect={to.fullPath}`
3. 管理员首次登录（`mustChangePassword`）→ 强制跳转 `/change-password`
4. 管理员路由（`requiresAdmin`）→ 校验 `role === 'admin'`，否则跳 `/home`
5. AI 功能入口免责声明（`requiresDisclaimer`）→ 调用 `useUI().hasAcceptedDisclaimer()` / `useUI().showDisclaimer()`，拒绝则 `next(false)` 返回上一页

**实际状态**（`router/index.ts:111-143`）：

- ✅ **步骤 1**（公开路由放行）：实现一致，检查 `to.meta.requiresAuth === false`（第 114 行）
- ❌ **步骤 2**（JWT 过期检测缺失）：设计定义"Token 是否存在且未过期"，实际仅检查 `!authStore.token`（第 118 行，仅判断 token 是否为 null/空字符串），**不检测 JWT exp 过期**。若 token 已过期但仍存在于 sessionStorage，用户可绕过路由守卫，直到后续 API 调用返回 401 才被拦截。根因：设计定义的 `useAuth` composable（含 JWT 解析和过期检测）未实现（见第 5.2 节），路由守卫无法获得过期检测能力。
- ⚠️ **步骤 2**（登录重定向编码）：设计使用 `to.fullPath`（原始字符串），实际使用 `encodeURIComponent(to.fullPath)`（第 119 行）。此差异为防御性编码改进（防止特殊字符破坏 URL），功能等价但安全性更高。
- ⚠️ **步骤 3/4 顺序偏离**：实际代码将管理员角色校验（步骤 4 等价逻辑，第 123 行）放在强制改密检查（步骤 3 等价逻辑，第 127 行）之前。设计顺序（步骤 3 → 步骤 4）在语义上更优（改密应优先于功能权限检查），但实际顺序在 `mustChangePassword=true` 场景下对管理员无影响——角色检查通过后，下一行仍会被改密检查拦截。
- ✅ **步骤 4**（管理员角色校验）：实现一致，检查 `to.meta.requiresAdmin && authStore.role !== 'admin'`（第 123 行）
- ⚠️ **步骤 5**（免责声明函数位置）：设计调用 `useUI()` composable，实际将 `hasAcceptedDisclaimer()`（第 93-95 行）和 `showDisclaimer()`（第 97-109 行）直接定义在路由文件中，未走 useUI composable。此偏离与第 5.4 节 useUI 未实现一致——功能行为等价，但架构偏离设计。
- ❌ **步骤 5**（免责声明拒绝行为偏离）：设计定义"拒绝 → `next(false)` 返回上一页，无上一页则回 `/home`"；实际实现始终重定向至 `/home`（第 137 行 `next('/home')`）。差异影响：设计允许用户在拒绝免责声明后保留在原页面，实际强制回首页可能破坏用户导航意图（例如从 /profile/risk 进入被拦截，拒绝后本应回到 /profile，实际却到了 /home）。注意：Vue Router 的 `next(false)` 仅中止当前导航，**不会自动回退到 `/home`**——实现"无来源页时回 /home，有来源页时停留在来源页"需额外逻辑判断 `from` 参数（如 `next(from && from.path !== to.path ? false : '/home')`）。

### 6.3 路由模块差距汇总

| 差距项 | 严重度 | 位置 | 说明 |
|--------|:------:|------|------|
| JWT 过期检测缺失 | **中** | router/index.ts:118 | 守卫仅检查 token 存在性，不检查 exp 过期。修复需先实现 useAuth composable（A4 项） |
| 免责声明拒绝行为偏离 | 低 | router/index.ts:137 | 设计定义 next(false) 保留来源页，实际重定向 /home。修复需实现 `next(from && from.path !== to.path ? false : '/home')` 语义 |
| 导航守卫步骤 3/4 顺序颠倒 | 低 | router/index.ts:123,127 | 角色检查先于改密检查，与设计相反，实际影响极小 |
| 免责声明函数未走 useUI | 低 | router/index.ts:93-109 | 函数内联在路由文件中，架构偏离设计（与 useUI 未实现联动） |
| 路由表缺少 requiresDisclaimer 显式列 | 文档级 | 设计文档 1.6.1 | 设计路由表未列出 requiresDisclaimer，实际代码已补充 |

---

## 7. 工具函数层差距分析

### 7.1 utils/helpers.ts

**设计要求**（文档 1.4 节第 199 行）：日期格式化、防抖截流等通用工具函数。

**实际状态**：未实现
- ❌ 文件不存在。日期格式化函数散落在各组件中内联定义（`Home.vue`, `NewsView.vue`, `Profile.vue` 等各有自己的 formatDate），造成代码重复。

### 7.2 utils/enumLabels.ts

**设计要求**（文档 1.8.1 节第 650-673 行）：英文枚举值 → 中文展示标签映射字典。

**实际状态**：已实现
- ✅ 全部枚举类别映射（gender/family_history/diabetes_history/diabetes_type/risk_level/plan_type/punch_type/completion_status）

### 7.3 utils/sanitize.ts

**设计文档未定义**，为实际代码扩展。
- ✅ escapeHtml()：HTML 实体转义
- ✅ sanitizeHtml()：DOMPurify 白名单加固（含 ALLOWED_TAGS/ATTR/URI_REGEXP/FORBID_TAGS/FORBID_ATTR）

### 7.4 utils/errorMessage.ts

**设计文档未定义**，为实际代码扩展。
- ✅ getErrorMessage()：统一错误消息提取（Axios 错误/标准 Error/字符串/fallback）

---

## 8. 页面组件差距分析（Views）

### 8.1 App.vue

**设计要求**（文档 4.1.1 节第 2939-2982 行）：根组件，含 `<router-view />`、`<TabBar>`、`<FabButton>`、`<AiChatDialog>`。

**实际状态**：已实现
- ✅ router-view / TabBar / FabButton / AiChatDialog 四件套完整
- ✅ TabBar 显隐逻辑（noTabRoutes = ['/login', '/change-password', '/admin']）
- ✅ FAB 显隐逻辑（不在 /login 和 /change-password 时显示）
- ✅ 跨浏览器标签页登录态同步（storage 事件监听），含 token/role/user 三字段同步
- ✅ 存储键使用 'token' / 'role' / 'user'（与 authStore 中 sessionStorage 键一致）
- ❌ 设计要求的 `pinia-plugin-persistedstate` 持久化监听（storage 事件 → authStore 同步）被 BroadcastChannel 方案替代

### 8.2 Home.vue

**设计要求**（文档 4.1.2 节第 2984-3027 行）：系统首页，含轮播 Banner、医师列表、科普文章、糖尿病类型四区块。

**实际状态**：已实现
- ✅ 轮播 Banner（纯 CSS 实现，3 条，4s 自动切换，替代设计的 Swiper）
- ✅ 医师团队（从 homeStore 获取，横向滚动卡片）
- ✅ 健康科普（前 3 条文章卡片）
- ✅ 糖尿病类型（2 列网格，含渐变封面、弹层详情）
- ✅ 骨架屏/错误态/空态覆盖四区块
- ✅ 各区块独立降级（Promise.allSettled + 各区块独立错误/重试）
- ❌ 搜索功能为占位：`onSearch()`（`Home.vue:82-93`）弹出 SweetAlert2 Toast "搜索功能开发中"。用户可感知的功能缺口——首页首屏已渲染搜索栏，用户点击后收到"开发中"提示

### 8.3 Login.vue

**设计要求**（文档 4.1.10 节第 3368-3407 行）：登录表单 + 注册表单，两表单一页面，视图切换。

**实际状态**：部分实现
- ✅ 登录表单完整（用户名 + 密码 + 登录按钮 + 错误提示）
- ❌ **注册表单完全缺失**：设计定义的注册表单（用户名 + 密码 + 确认密码 + 验证 + 提交注册）未实现。当前"立即注册"链接指向 `/login`（自环）。
  - 根因：`Login.vue:76` 的 `<router-link to="/login">立即注册</router-link>` 是自环链接，未触发注册视图展示。此为用户可感知缺陷——用户点击"立即注册"后链接停留在当前页面，没有任何反馈。
  - 后端 `POST /api/auth/register` 已实现（`server/routes/auth.js:11-47`），注册成功返回 `{token, role, user}` 可直接自动登录（authStore.login 兼容该响应结构）。
- ✅ 登录成功后 `router.replace(safeRedirect(route.query.redirect))`，带开放重定向防护

### 8.4 Consultation.vue

**设计要求**（文档 4.1.3 节第 3031-3046 行）：医生列表页。

**实际状态**：已实现
- ✅ 医生列表（头像 + 姓名 + 在线标识 + 科室 + 职称 + 简介 + "开始咨询"按钮）
- ✅ 加载态（3 个骨架卡片）
- ✅ 错误态 + 重试
- ✅ 空态（"暂无在线医生"）

### 8.5 DoctorChatView.vue

**设计要求**（文档 4.1.3 节第 3048-3078 行）：医生对话页，含消息气泡（用户/AI）、流内错误警告、输入发送。

**实际状态**：已实现
- ✅ 医生信息头部（头像 + 姓名 + 在线状态 + 科室·职称）
- ✅ 消息气泡（用户右侧蓝色 / AI 左侧白色，含头像 + 时间）
- ✅ Markdown 渲染 + DOMPurify 净化
- ✅ SSE 流式消息（打字机效果，chatStore.sendMessageWithRetry）
- ✅ "对方正在输入..."动画（isStreaming）
- ✅ 清空对话（clearDoctorConversation + 清除 messages）
- ✅ 免责声明条（固定可见）
- ❌ **会话历史加载未实现**：设计定义 `GET /api/chat/doctor/:id/conversations` 用于加载历史会话列表。后端已实现（`server/routes/chat.js:40-53`），但前端 composable 层缺少对应 fetch 函数，chatStore 的 `getDoctorConversation` 仅读取本地缓存的 conversation_id，不调用远端加载历史消息。
  - 根因：前端 useChatApi.ts 缺少 `getConversationHistory()` 函数，chatStore 缺少历史消息管理 state 和方法，DoctorChatView 缺少"加载历史消息"交互 UI。
- ⚠️ Markdown 渲染内联 marked + DOMPurify（`DoctorChatView.vue:9-10`）而非复用 `useMarkdown.ts` 的 `renderMarkdown()`。此差异与 LifePlan.vue 形成对比——后者已统一使用 `renderMarkdown()`，说明 useMarkdown composable 在 LifePlan.vue 开发时已存在并被采用，而 DoctorChatView（及 ArticleDetailView、HealthAdvice、Admin、Risk）在 useMarkdown 创建之前已完成开发，未做后续统一重构。功能等价，但存在代码重复（见第 8.6 节说明）。

### 8.6 LifePlan.vue

**设计要求**（文档 4.1.4 节第 3080-3110 行）：生活方案页，含空方案引导、生成表单、方案展示（饮食/运动分组 + 打卡按钮）、调整方案、免责提示。

**实际状态**：已实现 — 完整
- ✅ 六种视图态（loading / empty / form / generating / display / error）
- ✅ 空方案引导（图标 + 说明 + 快捷入口到风险预测页）
- ✅ 生成表单（年龄/性别/身高/体重 + 5 种生活习惯多选 + 建议输入）
- ✅ 风险表单数据预填（从 riskFormStore 读取）、query 参数提示条
- ✅ 生成中阶段文案轮播（4 阶段，"正在分析…"→"正在生成饮食…"→...）
- ✅ 方案展示（饮食/运动分组，时段标签，Markdown 内容渲染，useMarkdown composable）
- ✅ 打卡按钮（乐观更新 + 失败回滚），completedMap 本地缓存
- ✅ 调整方案（输入反馈 → PUT /api/plan/adjust）
- ✅ 重新生成（409 幂等处理）
- ✅ 历史降级展示（生成失败但有缓存方案时，渲染旧方案 + 降级标记）
- ✅ 使用 `renderMarkdown()` 统一渲染管道（`LifePlan.vue:4`）
- 📝 **Markdown 渲染统一化说明**：LifePlan.vue 是项目中唯一已全面使用 `useMarkdown.ts` composable 的页面组件（`renderMarkdown()` 含 marked 链接安全渲染器 + DOMPurify 白名单加固）。其他 5 个需要 Markdown 渲染的页面组件（DoctorChatView、ArticleDetailView、HealthAdvice、Admin、Risk）仍各自内联 `marked.parse() + DOMPurify.sanitize()`，未复用统一管道。此差异源于开发时序：LifePlan.vue 开发较晚，开发时 useMarkdown composable 已存在并被采用；其余页面在 useMarkdown 创建之前已完成开发，未做后续统一重构。功能层面等价，但存在代码重复和链接安全渲染器缺失（内联方案未注入 `rel="noopener noreferrer"`）。

### 8.7 NewsView.vue

**设计要求**（文档 4.1.5 节第 3114-3129 行）：资讯列表页，含分类标签筛选、文章卡片列表、分页加载更多、"生成资讯"（需登录）、免责提示。

**实际状态**：已实现
- ✅ 分类标签筛选（全部/饮食指导/运动指南/生活习惯/知识科普）
- ✅ 文章列表（封面 + 标题 + 摘要/标签 + 作者·时间 + 阅读量）
- ✅ 分页加载更多
- ✅ 文章生成两阶段（category_selection → 选择主题 → 生成文章 → 跳转详情）
- ✅ 免责声明判定（生成前检查）
- ✅ 骨架屏 / 错误重试 / 空态（复用全局组件）
- ✅ sessionStorage 页面状态缓存（5min TTL）
- ⚠️ **列表页收藏状态展示未实现**：设计文档 4.1.5 节 NewsView 组件树仅定义文章卡片的基础信息展示（标题/元信息/阅读量），未定义列表页收藏按钮及 `is_collected` 状态展示。当前文章列表卡片不显示收藏状态（代码中无 `is_collected` 相关渲染），但此点并非设计文档的直接差距项——设计文档仅在 ArticleDetailView（4.1.5 节第 3138 行）中定义了收藏按钮。列表页收藏状态属于功能完整性补充建议，而非设计合规差距。收藏功能的核心未实现部分见第 8.8 节 ArticleDetailView 的 `toggleCollect()` 占位。
- ❌ **文章分类图标未实现**：设计未定义但原型中列表分类有图标，实际代码无分类图标。

### 8.8 ArticleDetailView.vue

**设计要求**（文档 4.1.5 节第 3131-3144 行）：文章详情页，含 Header（返回 + 收藏按钮）、封面、标题、元信息（作者·发布时间）、正文（Markdown 渲染）、免责提示。

**实际状态**：部分实现
- ✅ 文章详情加载 + 404/错误区分
- ✅ 头部粘性导航栏（返回按钮 + 文章标题）
- ✅ 封面图 + 标题 + 作者 + 时间 + 分类标签
- ✅ Markdown 正文净化渲染
- ✅ 加载态/错误态/404 态
- ✅ 收藏按钮 UI 存在（书签图标，根据 `article.is_collected` 切换实心/空心）
- ❌ **收藏交互未实现**：`toggleCollect()` 为占位实现（`ArticleDetailView.vue:75-78`），`console.warn('[ArticleDetailView] 收藏功能待实现 (S5a 占位)')`。
  - 根因：前端缺少调用 `POST /api/articles/:id/collect` 和 `DELETE /api/articles/:id/collect` 的 composable 函数。后端两个收藏端点均已实现（`server/routes/articles.js:171-185`），收藏列表接口 `GET /api/articles/collections` 也已实现（`server/routes/articles.js:31-38`）。
- ⚠️ Markdown 渲染内联 marked + DOMPurify（`ArticleDetailView.vue:4-5`）而非复用 `useMarkdown.ts`，与 LifePlan.vue 形成对比（见第 8.6 节说明）。

### 8.9 Profile.vue

**设计要求**（文档 4.1.6 节第 3146-3191 行）：个人中心，含头像 + 用户名 + 角色、菜单入口列表（风险预测/打卡/健康建议/编辑资料/智能管理(admin)/退出登录）、嵌套路由出口。

**实际状态**：部分实现
- ✅ 头像（含上传触发 + 格式/大小校验）
- ✅ 用户名/角色/注册时间显示
- ✅ 菜单入口列表（风险预测/打卡记录/健康建议/智能管理(admin)/退出登录）
- ✅ 嵌套路由出口（子路由活跃时隐藏主菜单）
- ✅ 登出流程（中止 SSE → 清理会话 → 清除表单 → authStore.logout → 跳转首页），对齐设计 v15 登出完整流程
- ❌ **编辑资料功能为占位**：`onEditProfile()` 弹出 "编辑资料功能开发中" Toast（`Profile.vue:108-109`）
  - 根因：后端 `PUT /api/user/profile` 已实现（`server/routes/user.js:25-68`，接受 `{username, avatar}`），但前端 useUserApi.ts 仅含 changePassword()，缺少 updateProfile() 函数，Profile.vue 缺少编辑表单 UI。

### 8.10 Risk.vue

**设计要求**（文档 4.1.7 节第 3192-3290 行）：三步风险预测向导（病史状态 → 健康信息 → 评估结果），含进度指示器、表单校验、步骤间导航、结果展示（风险等级/评分/建议）、"去生成生活方案"按钮。

**实际状态**：已实现 — 完整
- ✅ 三步进度指示器（激活/未激活/完成态）
- ✅ Step 1 病史状态选择（3 级 + 条件显示糖尿病类型）
- ✅ Step 2 健康信息采集（年龄/性别/身高/体重/腰围/收缩压/家族史/妊娠条件显示）
- ✅ 表单校验（数字范围、必填项、条件字段联动）
- ✅ sessionStorage 持久化（断点续填）
- ✅ 风险预测提交（带 AbortController）
- ✅ Step 3 结果展示（风险等级颜色标签 + 评分数字 + 详细建议）
- ✅ "去生成生活方案"按钮（跳转 /life-plan + query 参数传递）
- ✅ 历史预测记录列表（分页 + 展示卡片）
- ✅ 历史记录加载错误与列表并存的降级渲染
- ✅ 加载态 + 错误重试（含冷却期）
- ❌ 字段校验错误文本（field-error-container）：设计定义为独立容器统一显示，实际在每个表单域内联显示
- ⚠️ Markdown 渲染内联 marked + DOMPurify（`Risk.vue:6-7`）而非复用 `useMarkdown.ts`（见第 8.6 节说明）。

### 8.11 Punch.vue

**设计要求**（文档 4.1.8 节第 3292-3340 行）：打卡记录与分析页，含日期筛选、类型筛选 chip、AI 分析区域（完成率统计卡片 + 7 天趋势图 + 依从性评语 + 改进建议）、打卡记录列表（分页）。

**实际状态**：已实现 — 完整
- ✅ 日期范围筛选
- ✅ 类型筛选 chip（全部/饮食/运动）
- ✅ AI 分析区域（饮食完成率/运动完成率/总打卡次数 三卡片）
- ✅ 7 天趋势柱状图（纯 CSS 实现，含分色饮食/运动柱 + 周标签）
- ✅ 综合完成率环形图（SVG 圆环，纯 CSS）
- ✅ 依从性评语（Markdown 渲染）
- ✅ 改进建议列表
- ✅ 打卡记录列表（含类型标签/方案标题/打卡时间/完成状态/备注）
- ✅ 加载更多分页
- ✅ 防竞态 requestId 快照
- ✅ 筛选防抖（300ms 后触发 fetchAnalysis）
- ✅ shareable query filter（URL 参数同步筛选条件）
- ✅ 骨架屏 / 错误重试 / 空态

### 8.12 HealthAdvice.vue

**设计要求**（文档 4.1.9 节第 3342-3366 行）：健康建议列表，可展开卡片（标题 + 标签 + 时间 + 内容），分页。

**实际状态**：已实现
- ✅ 可展开健康建议卡片（点击切换展开/收起）
- ✅ 标签展示 + 创建时间
- ✅ Markdown 正文渲染
- ✅ 分页加载更多
- ✅ 顶部免责声明条（复用 DisclaimerBar 组件）
- ✅ 骨架屏 / 错误重试 / 空态（复用全局组件）
- ⚠️ Markdown 渲染内联 marked + DOMPurify（`HealthAdvice.vue:4-5`）而非复用 `useMarkdown.ts`（见第 8.6 节说明）。

### 8.13 Admin.vue

**设计要求**（文档 4.1.11 节第 3409-3450 行）：管理页，含对话视图（自然语言管理指令）、操作日志子视图。

**实际状态**：部分实现
- ✅ 对话视图（Chat 模式）完整实现（消息气泡 + SSE 流式）
- ✅ 操作日志视图（Logs 模式）完整实现（分页列表 + 加载更多）
- ✅ Chat/Logs 视图切换
- ❌ Admin.vue 自行实现了完整的 SSE 流读取逻辑（`Admin.vue:36-78` — parseSSEBuffer / readSSEStream / dispatchSSEEvent），与 `chatStore.ts` 的 SSE 解析逻辑功能重复。chatStore 已对外暴露 `sendAdminMessage` 方法但 Admin.vue 未使用——根因为 Admin.vue 的开发先于 chatStore 的 sendAdminMessage 方法完成，导致 SSE 逻辑被内联实现而非通过统一接口调用。
- ⚠️ Markdown 渲染内联 marked + DOMPurify（`Admin.vue:4-5`）而非复用 `useMarkdown.ts`（见第 8.6 节说明）。

### 8.14 ChangePassword.vue

**设计要求**（文档 1.6.2 节第 596-603 行）：管理员首次登录强制改密码页，含新密码 + 确认密码 + 提交，不允许绕过。

**实际状态**：已实现
- ✅ 密码校验（8 位 + 含字母数字）
- ✅ 确认密码一致性校验
- ✅ 强制改密场景（mustChangePassword=true 时不可绕过）
- ✅ 非强制场景自动跳转
- ✅ 提交后清除 mustChangePassword 标记 + SweetAlert2 成功弹窗 + 跳转

---

## 9. 复用组件差距分析

全部 7 个复用组件均已实现，功能与设计一致：

| 组件 | 设计要求（文档 1.4 节） | 状态 |
|------|------------------------|------|
| TabBar.vue | 底部 5 Tab 导航栏，active 高亮 | ✅ 实现 |
| FabButton.vue | FAB 悬浮按钮，旋转动画 | ✅ 实现 |
| AiChatDialog.vue | AI 助手对话弹窗，含免责声明 + 登录引导 | ✅ 实现 |
| SkeletonLoader.vue | 骨架屏（card/list/text/avatar/article 5 种） | ✅ 实现 |
| ErrorRetry.vue | 错误提示 + 重试按钮 | ✅ 实现 |
| EmptyState.vue | 空数据引导 + 操作入口 | ✅ 实现 |
| DisclaimerBar.vue | 医学免责标识条（可固定底部） | ✅ 实现 |

---

## 10. API Composable 覆盖率分析

### 10.1 后端 API 实现状态验证

经过对 `server/routes/` 下全部路由文件的阅读验证，所有 7 个前端未覆盖的 API 端点均已在后端完成实现：

| 端点 | 后端实现位置 | 前端覆盖 |
|------|-------------|:--------:|
| POST /api/auth/register | `server/routes/auth.js:11-47`（含 bcrypt 加密、JWT 签发，注册成功返回 `{token, role, user}` 可直接自动登录） | ❌ |
| PUT /api/user/profile | `server/routes/user.js:25-68`（接受 `{username, avatar}`，含冲突检测） | ❌ |
| GET /api/chat/doctor/:id/conversations | `server/routes/chat.js:40-53`（返回 Dify 会话列表） | ❌ |
| POST /api/articles/:id/collect | `server/routes/articles.js:171-178`（含幂等处理） | ❌ |
| DELETE /api/articles/:id/collect | `server/routes/articles.js:180-185` | ❌ |
| GET /api/articles/collections | `server/routes/articles.js:31-38`（分页、tags 解析、按收藏时间倒序） | ❌ |
| GET /api/assistant/conversations | `server/routes/assistant.js:64-74`（返回 Dify 会话列表） | ❌ |

**结论**：后端 API 已就绪，前端功能缺失的阻塞因素并非后端不可用，而是前端 composable 层和页面交互层未实现。前端开发无需 mock 即可直接对接真实后端端点。

### 10.2 前端 API 覆盖对比

对比设计文档 3.1 节完整端点清单与前端 composable 覆盖情况：

| API 组 | 端点 | 前端 Cover | 说明 |
|--------|------|:----------:|------|
| auth | POST /api/auth/login | ✅ | useApi.ts (authStore.login) |
| auth | POST /api/auth/register | ❌ | 后端已实现，前端缺少调用 |
| auth | POST /api/auth/logout | ✅ | useApi.ts (authStore.logout) |
| user | GET /api/user/profile | ✅ | useApi.ts (Profile.vue 直接调用) |
| user | PUT /api/user/profile | ❌ | 后端已实现，前端缺少调用 |
| user | PUT /api/user/password | ✅ | useUserApi.ts |
| risk | POST /api/risk/predict | ✅ | Risk.vue 直接调用 useApi |
| risk | GET /api/risk/history | ✅ | Risk.vue 直接调用 useApi |
| doctors | GET /api/doctors | ✅ | useHomeApi.ts |
| doctors | GET /api/doctors/:id | ✅ | useChatApi.ts (getDoctorInfo) |
| chat | POST /api/chat/doctor/:id | ✅ | useChatApi.ts (sendChatMessage) |
| chat | GET /api/chat/doctor/:id/conversations | ❌ | 后端已实现，前端缺少调用 |
| plan | POST /api/plan/generate | ✅ | useLifePlanApi.ts |
| plan | PUT /api/plan/adjust | ✅ | useLifePlanApi.ts |
| plan | GET /api/plan/current | ✅ | useLifePlanApi.ts |
| punch | POST /api/punch | ✅ | useLifePlanApi.ts (createPunch) |
| punch | GET /api/punch/list | ✅ | usePunchApi.ts |
| punch | GET /api/punch/analysis | ✅ | usePunchApi.ts |
| articles | GET /api/articles | ✅ | useHomeApi.ts |
| articles | GET /api/articles/:id | ✅ | useHomeApi.ts (getArticle) |
| articles | POST /api/articles/generate | ✅ | useArticleApi.ts |
| articles | POST /api/articles/:id/collect | ❌ | 后端已实现，前端缺少调用 |
| articles | DELETE /api/articles/:id/collect | ❌ | 后端已实现，前端缺少调用 |
| articles | GET /api/articles/collections | ❌ | 后端已实现，前端缺少调用 |
| diabetes | GET /api/diabetes-types | ✅ | useHomeApi.ts |
| diabetes | GET /api/diabetes-types/:id | ✅ | useHomeApi.ts |
| assistant | POST /api/assistant/chat | ✅ | useChatApi.ts (sendAssistantChatMessage) |
| assistant | GET /api/assistant/advice | ✅ | useAdviceApi.ts |
| assistant | GET /api/assistant/conversations | ❌ | 后端已实现，前端缺少调用 |
| admin | POST /api/admin/chat | ✅ | useAdminApi.ts (useChatApi.ts 重复定义) |
| admin | POST /api/admin/execute | N/A | 后端内部调用，前端不直调 |
| admin | GET /api/admin/logs | ✅ | useAdminApi.ts |
| dify | POST /api/dify/workflow/:workflow_id | N/A | Express 后端内部调用，前端不直调。由各专用端点（如 POST /api/risk/predict、POST /api/plan/generate 等）在服务端内部转发至 Dify 工作流 |
| dify | POST /api/dify/agent/:agent_id | N/A | Express 后端内部调用，前端不直调。由 POST /api/assistant/chat 和 POST /api/admin/chat 在服务端内部转发至 Dify Agent |
| upload | POST /api/upload/avatar | ✅ | Profile.vue 直接调用 useApi |

**覆盖率统计**（含设计文档 §3.1.11 定义的 Dify 代理端点）：
- 总行数：35 行（含 3 个 N/A 端点：admin/execute + 2 个 dify 代理）
- 可操作端点：32 个（排除 3 个 N/A 端点，Dify 代理端点为 Express 后端内部调用，前端不直接访问）
- 已覆盖：25 个端点
- 未覆盖：7 个端点（POST /api/auth/register、PUT /api/user/profile、GET /api/chat/doctor/:id/conversations、POST /api/articles/:id/collect、DELETE /api/articles/:id/collect、GET /api/articles/collections、GET /api/assistant/conversations）
- 覆盖率：25/32 ≈ 78.1%

**重要说明**：上述 7 个未覆盖端点的后端实现均已通过代码验证确认就绪（见第 10.1 节）。前端功能缺失的根因仅限于前端 composable 层和页面交互层，无需 mock 即可直接开发。

### 10.3 搜索 API 端点缺失

经 grep 检查 `server/routes/` 下全部路由文件，后端当前**不存在任何搜索端点**（无 `/api/search`、无 `?keyword=` 参数支持）。搜索功能（C2）若需后端配合，需新建搜索端点或对现有 `GET /api/articles` 端点增加关键词过滤参数。

---

## 11. 依赖关系分析

### 11.1 模块依赖方向

```
类型层 (api.ts, sse.ts)
    ↓
工具层 (sanitize.ts, errorMessage.ts, enumLabels.ts)
    ↓
API 通信层 (useApi.ts → use{Home,Chat,LifePlan,Punch,Advice,Article,Admin,User}Api.ts)
    ↓
状态管理层 (authStore, chatStore, riskFormStore, homeStore, lifePlanStore, punchStore)
    ↓
复用组件层 (TabBar, FabButton, AiChatDialog, SkeletonLoader, ErrorRetry, EmptyState, DisclaimerBar)
    ↓
页面组件层 (views/*.vue)
    ↓
路由层 (router/index.ts)
```

### 11.2 各待实现功能的前置依赖

| 待实现功能 | 前置依赖 | 说明 |
|-----------|---------|------|
| 用户注册前端 | useApi.ts（已存在）, Login.vue 现有结构 | 需在 Login.vue 添加注册表单视图（含视图切换逻辑），调用 POST /api/auth/register。后端返回 `{token, role, user}` 与 authStore.login() 的响应处理完全兼容，注册成功直接调用 authStore.setAuth 自动登录。**不需要** helpers.ts（A2）的日期格式化或防抖截流——注册表单无此类需要。**不需要** useAuth.ts（A4）——注册操作仅需存储后端返回的 token/role/user，不涉及 JWT 解析。 |
| 文章收藏 | useArticleApi.ts（扩展 collect/uncollect/collection list 函数）, ArticleDetailView.vue, NewsView.vue（可选） | 后端三个收藏端点均已实现（`server/routes/articles.js:31-38, 171-185`）。需在 useArticleApi.ts 中新增 3 个 fetch 函数并替换 ArticleDetailView.vue 的 toggleCollect 占位。**需额外评估状态管理需求**：收藏涉及乐观更新（点击收藏按钮即刻反映 UI 状态，API 失败回滚）、跨页面状态同步（ArticleDetailView 与 NewsView 的 `is_collected` 需一致）、收藏列表分页缓存。当前 useArticleApi.ts 为纯 API 调用层（无状态管理），需决策收藏状态的管理层级：方案A（扩展 useArticleApi 为带 reactive state 的 stateful composable，含 isCollectedMap、乐观更新逻辑）或方案B（新建 articleStore 统一管理文章的收藏状态、列表缓存）。方案A 侵入小但状态分散，方案B 架构清晰但增加 Store 数量。建议先采用方案A（useArticleApi 内建 reactive `collectedMap: Ref<Record<number, boolean>>` + `collectArticle()` 含乐观更新），后续如 NewsView 列表页等需求扩展时再考虑方案B。 |
| 编辑资料 | useUserApi.ts（扩展 updateProfile）, Profile.vue | 后端 PUT /api/user/profile 已实现（`server/routes/user.js:25-68`）。Profile.vue 已直接使用 SweetAlert2 进行 Toast/弹窗交互，编辑资料表单可直接沿用此模式，**A5（useUI.ts）非严格依赖**——可并行开发，A5 完成后可统一替换为 useUI 以消除代码重复。 |
| 搜索功能 | **未明确**（见下方设计分析） | Home.vue 的 `onSearch()`（`Home.vue:82-93`）为占位 Toast。搜索功能实现在设计和代码中均无明确定义——无搜索结果页路由、无搜索 API composable、后端无搜索端点。需先明确设计方案（搜索范围、结果展示方式、是否需要新 API），再评估工作量。 |
| 会话历史加载 | useChatApi.ts（扩展 getConversationHistory/getAssistantConversations）, chatStore.ts, DoctorChatView.vue | 后端两端均已实现（`server/routes/chat.js:40-53`, `server/routes/assistant.js:64-74`）。需在 useChatApi.ts 新增两个 fetch 函数，chatStore 新增历史消息管理 state 和方法，DoctorChatView 新增"加载历史消息"交互 UI。 |
| AI 助手导航 | chatStore.ts navigate() | 需实现 AI 回复中的 router.push 跨模块跳转，chatStore 内闭环，无外部依赖。 |
| JWT 过期检测（路由守卫） | useAuth composable（A4） | 路由守卫需引入 useAuth 进行 token exp 检查，当前仅检查 token 存在性（`router/index.ts:118`）。注意：authStore 仅将 token 作为不透明字符串存储，不包含 JWT 解析逻辑——useAuth 需从零实现 JWT 解析。 |
| useAuth composable | authStore.token（仅提供 token 字符串） | authStore 不包含 JWT 解析逻辑，useAuth 需从零实现：split('.') → atob(payload) → JSON.parse → JwtPayload 类型提取 + exp 过期检测。 |
| useSSE composable | chatStore.ts, Admin.vue | 从 chatStore 和 Admin.vue 中抽取通用 SSE 流式封装 |
| useUI composable | router/index.ts, App.vue | 从路由守卫中抽取 disclaimer 判定和 showDisclaimer，同时抽取散落的 Toast/Loading |
| models.ts | api.ts | 从 api.ts 中拆分业务实体类型为独立文件 |
| helpers.ts | 各 views 组件 | 抽取散落的日期格式化、debounce/throttle 为统一工具 |
| Admin.vue SSE 统一 | chatStore.sendAdminMessage（已存在） | Admin.vue 当前内联实现 SSE 解析逻辑（`Admin.vue:36-78`），与 chatStore 重复。chatStore 已暴露 sendAdminMessage 方法（含消息管理、isStreaming、error 处理、断线重连），Admin.vue 仅需切换调用入口并丢弃内联实现。**此任务独立于 A6（useSSE 抽取）**——chatStore.sendAdminMessage 已封装完整的 SSE 收发循环，Admin.vue 无需感知 useSSE composable 的存在。 |
| Markdown 渲染统一化 | useMarkdown.ts 已存在 | 将 DoctorChatView/ArticleDetailView/HealthAdvice/Admin/Risk 的内联 marked+DOMPurify 替换为 renderMarkdown() 调用，消除链接安全渲染器缺失（`rel="noopener noreferrer"`）。 |
| 路由守卫免责声明拒绝行为修复 | **无需前置依赖**（最简方案） | 最简方案（仅修改 `router/index.ts:137` 的 `next('/home')` 为保留来源页 + 无来源页回 /home 逻辑）完全独立，无需等待 A5。注意：Vue Router 的 `next(false)` 仅中止当前导航，不会自动回退到 /home — 需实现 `next(from && from.path !== to.path ? false : '/home')` 或等效判断逻辑。最佳实践（将 disclaimer 函数移入 useUI）依赖 A5 完成后方可进行。 |

### 11.3 搜索功能设计分析

搜索功能当前状态：
- 入口：Home.vue 搜索栏触发 `onSearch()`（`Home.vue:82-93`），当前为占位 Toast "搜索功能开发中"
- 后端：无搜索端点（`server/routes/` 下无 search 相关路由）；现有 `GET /api/articles` 不支持 `keyword` 参数，仅支持 `category` 分类筛选（`server/routes/articles.js:40-58`）
- 设计文档：未定义搜索功能页面、路由或 API 端点
- 文章量级：基于 SQLite 存储和当前系统用户规模，预计上线初期文章总量 < 100 条

**推荐方向：最简可行方案（前端本地过滤 + NewsView.vue 内联展示）**

基于项目当前约束（后端无搜索端点、设计文档未定义搜索、Home.vue 仅一个入口、文章量级小）给出明确推荐：

1. **推荐方案**：
   - 搜索范围：文章标题 + 标签（本地过滤，不搜索正文全文）
   - 结果展示：在 NewsView.vue 内联展示搜索结果（带关键词高亮标识），URL 查询参数 `?keyword=xxx` 驱动页面进入"搜索模式"
   - API 策略：前端在搜索时直接调用 `GET /api/articles`（取 pageSize=100），在本地进行标题/标签关键词匹配。**重要**：搜索时必须直接调用 API（绕过 homeStore 的 sessionStorage 缓存），否则新发布文章在 homeStore 缓存 TTL（`HOME_CACHE_TTL=3600000`，即 1 小时，见 `homeStore.ts:34`）内不会出现在搜索结果中。搜索使用独立的 API 调用链路，不依赖 homeStore 的 `fetchHomeData()` 缓存逻辑。
   - 工作量：0.8-1.0d（含 NewsView.vue 搜索模式切换 + 本地过滤逻辑 + 关键词高亮 + API 直接调用）
2. **选择依据**：
   - 当前文章量级 ≤100 条，全量拉取网络开销 <50KB，本地过滤耗时 <5ms，无性能瓶颈
   - 无需新建后端端点，开发周期短，可快速上线验证搜索需求
   - 升级路径清晰：当文章量级 >200 条或用户反馈搜索结果不满足时，升级为后端全文搜索方案
3. **适用条件**：**仅适用于文章总量 < 200 条的阶段**。超过此量级，全量拉取的网络开销和本地过滤的 CPU 开销将显著增加，需升级为后端搜索方案。
4. **缓存时效性警示**：homeStore 对文章数据实施 sessionStorage 缓存（`HOME_CACHE_TTL=3600000`，1小时，`homeStore.ts:34`）。搜索功能若复用 homeStore 的 `articles` ref（缓存命中优先返回），新发布的文章在缓存过期前不会出现在搜索结果中。因此搜索实现必须直接调用 API 而非使用缓存数据，确保搜索结果的实时性。此限制仅在搜索时适用——首页展示等非搜索场景仍可正常使用缓存加速。
5. **前置决策任务（纳入 Phase 1）**：搜索交互设计决策（0.2d）——产出搜索交互原型（NewsView.vue 搜索模式下的 UI 草稿 + 搜索状态转换图），明确搜索触发逻辑（回车/防抖/清除）和空结果/错误处理。此决策任务确保开发者在启动 C2 编码前对齐搜索交互预期，避免返工。

**若不采纳最简方案**（如需一开始就支持后端全文搜索），备选方案：
- 后端全文搜索：新增 Express 路由 `GET /api/search?keyword=&page=&pageSize=`，后端使用 SQLite `LIKE '%keyword%'` 对标题/标签/摘要进行查询，前端在 NewsView.vue 以搜索模式展示结果。工作量约 1.5-2.0d（含后端端点开发 + 前端搜索结果页）。

### 11.4 模块间耦合关系

- **authStore ← 几乎所有页面**：Login/Register、路由守卫、Profile、所有需认证的 API 调用
- **chatStore ← DoctorChatView, AiChatDialog, Admin.vue, App.vue**：对话状态共享
- **riskFormStore ← Risk.vue, LifePlan.vue**：风险预测结果传递给生活方案生成参数
- **homeStore ← Home.vue, Consultation.vue (间接)**：首页数据和医生列表共享 getDoctors
- **lifePlanStore ← LifePlan.vue**：方案状态管理
- **punchStore ← Punch.vue**：打卡状态管理
- **router ← authStore**：路由守卫依赖 authStore.token/role/mustChangePassword 进行认证和授权判定

---

## 12. 并行开发分组建议

### 分组原则
- 同一分组内的模块互不依赖，或依赖已完成模块
- 分组间严格执行依赖顺序
- 基于文件级别的依赖分析

### Group A：基础设施补完（无外部依赖，可最先并行）

| 编号 | 模块 | 工作量 | 说明 |
|------|------|-------|------|
| A1 | ~~`src/env.d.ts`~~ | 0d | 经代码验证，Vite 客户端类型库（`tsconfig.app.json:5`）已内置 `.vue` 模块类型声明；项目未使用自定义 VITE 环境变量。env.d.ts 的缺失在当前项目状态下不造成任何编译或运行时问题。**此任务取消**。若未来引入自定义环境变量，届时再建 env.d.ts。 |
| A2 | `src/utils/helpers.ts` | 0.3d | 新建，从各 views 抽取日期格式化/防抖截流 |
| A3 | `src/types/models.ts` | 0.2d | 从 api.ts 拆分业务实体类型 |
| A4 | `src/composables/useAuth.ts` | 0.4d | 从零实现 JWT 工具函数（含 token 解析、过期检测）。注意：authStore 仅将 token 作为不透明字符串存储（`authStore.ts:39-41`），不包含任何 JWT 解析逻辑（无 atob、base64 解码、payload 提取、exp 检查）。useAuth 需完整实现：split('.') → atob(payload) → JSON.parse → JwtPayload 类型提取 + isTokenExpired() 过期检测 + 集成 authStore.token 读取。0.4d 含类型定义、实现、单元测试。 |
| A5 | `src/composables/useUI.ts` | 0.3d | 新建，Toast/Loading/Disclaimer 统一 UI 工具 |
| A6 | `src/composables/useSSE.ts` | 0.5d | 从 chatStore + Admin.vue 抽取通用 SSE 封装（含 readSSEStream / parseSSEBuffer / dispatchSSEEvent）。产出后供 chatStore 内部调用，chatStore 对外仍暴露 sendMessage/sendAdminMessage 等高层接口，下游页面无需感知 useSSE 的存在 |
| A7 | Markdown 渲染统一化 | 0.3d | 将 DoctorChatView/ArticleDetailView/HealthAdvice/Admin/Risk 的内联 marked+DOMPurify 替换为 renderMarkdown() 调用。**低风险提示**：`renderMarkdown()` 额外注入 `rel="noopener noreferrer"` 到外部链接（`useMarkdown.ts:35-40`），此为安全改进，不改变内容结构，但建议在 5 个页面各做 1 次快速冒烟测试确认链接样式无异样。 |
| A8 | 路由守卫免责声明拒绝行为修复 | 0.1d | `router/index.ts:137` 修改为：无来源页时回 /home，有来源页时停留在来源页。注意：Vue Router 的 `next(false)` **仅中止当前导航**，不会自动回退到 /home——需实现 `next(from && from.path !== to.path ? false : '/home')` 或等效的 from 参数判断逻辑。**明确推荐**：优先执行最简方案（在 Phase 1 中完成，仅 0.1d 且与 A5 解耦）。最佳实践（将 disclaimer 函数移入 useUI）待 A5 完成后统一重构，届时将架构偏离表中"免责声明函数位置"偏离项的修复状态更新为"A8 最简方案已修复行为，架构迁移待 A5 完成后执行"。 |
| A10 | 搜索功能设计决策 | 0.2d | 见 §11.3 推荐方案的「前置决策任务」：产出搜索交互原型（NewsView.vue 搜索模式下的 UI 草稿 + 搜索状态转换图），明确搜索触发逻辑和空结果/错误处理，确保 C2 编码前对齐交互预期 |

**依赖链**：A 组内无相互依赖，可全并行。A8 最简方案独立于 A5，最佳实践 A8→(A5)。A10 为 C2 前置，应在 Phase 1 内完成。**A 组总工期：0.5d**（取最长路径 A6）。

### Group B：认证与用户功能增强（依赖 A4，A5 非严格）

| 编号 | 模块 | 工作量 | 说明 |
|------|------|-------|------|
| B1 | Login.vue 注册表单 | 1.0d | 添加注册视图（Views 切换）+ 表单校验（用户名/密码/确认密码）+ 调用 POST /api/auth/register + 注册成功自动登录（authStore.setAuth）。后端已实现，响应与 authStore.login 兼容。**不依赖 A2/A4/A5**。 |
| B2 | Profile.vue 编辑资料 | 0.5d | 扩展 useUserApi.ts 添加 updateProfile() + Profile.vue 编辑表单（用户名/头像）+ PUT /api/user/profile。后端已实现。A5（useUI）为**非严格依赖**——当前 Profile.vue 已直接使用 SweetAlert2，编辑表单可直接沿用，A5 完成后可统一替换。 |
| B3 | 路由守卫 JWT 过期检测 | 0.2d | 引入 A4（useAuth）在 router/index.ts:118 处进行 token exp 检查，替换当前的仅检查存在性逻辑 |

**依赖链**：B1→()；B2→(A5, 非严格)；B3→(A4)。B1/B2/B3 可并行。**B 组总工期：1.0d**（取最长 B1）。

### Group C：内容与资讯功能增强

| 编号 | 模块 | 工作量 | 说明 |
|------|------|-------|------|
| C1 | 文章收藏功能 | 1.5d | **状态管理架构**：收藏涉及乐观更新（点击按钮即刻反映 UI，API 失败回滚）、跨页面状态同步（ArticleDetailView 与 NewsView 的 `is_collected` 需一致）、收藏列表分页缓存。当前 useArticleApi.ts（`useArticleApi.ts:1-31`）为纯 API 调用层，无状态管理能力。需决策收藏状态的管理层级，建议采用方案A：在 useArticleApi.ts 内建 reactive `collectedMap: Ref<Record<number, boolean>>` + `collectArticle()` 含乐观更新（先设 `collectedMap.value[id]=true` → 调用 API → 失败回滚）。方案B（新建 articleStore）架构更清晰但增加 Store 数量，可在 NewsView 等列表页需求扩展时再考虑。具体实现：扩展 useArticleApi.ts 新增 collectArticle/uncollectArticle/getCollections 三个函数 + ArticleDetailView.vue toggleCollect 替换占位为真实交互 + NewsView.vue 列表收藏状态展示（可选）+ 收藏列表页（可选）。后端三个端点已全部实现。 |
| C2 | 搜索功能 | 1.0d | **推荐方案**：前端本地过滤（见 §11.3）。NewsView.vue 搜索模式（URL `?keyword=xxx` 驱动）+ 直接调用 API（绕过 homeStore 缓存）取 pageSize=100 文章后在本地进行标题/标签关键词匹配 + 关键词高亮。**缓存时效性**：搜索时必须直接调用 API 而非使用 homeStore 的 sessionStorage 缓存——homeStore 的 `HOME_CACHE_TTL=3600000`（1小时，`homeStore.ts:34`）意味着新发布文章在缓存过期前不会出现在搜索结果中。搜索使用独立的 API 调用链路（如 useHomeApi.getArticles({ pageSize: 100 }) 直接调用，不走 homeStore.fetchHomeData 的缓存优先逻辑）。**适用条件**：文章总量 < 200 条阶段；超过此量级需升级为后端全文搜索方案。若采用备选后端搜索方案（新增 Express 路由 + 后端 SQLite LIKE），工作量约 1.5-2.0d。**前置依赖**：A10（搜索设计决策 0.2d，Phase 1 内完成）。 |

**依赖链**：C1 无前置依赖（useArticleApi.ts 的扩展不阻塞其他模块）；C2 前置依赖 A10（搜索设计决策，Phase 1 内完成）。C1/C2 可并行。**C 组总工期：1.5d**（取 C1 1.5d 与 C2 1.0d 中的最长路径 C1）。

### Group D：对话系统增强

| 编号 | 模块 | 工作量 | 说明 |
|------|------|-------|------|
| D1 | 会话历史加载 | 1.0d | 扩展 useChatApi.ts 新增 getDoctorConversationHistory/getAssistantConversations 两个函数 + chatStore 新增历史消息 state 和方法 + DoctorChatView 加载历史消息 UI。后端两端点均已实现。 |
| D2 | AI 助手导航 | 0.3d | chatStore.navigate() 从占位实现（`chatStore.ts:716-718` 空函数体）→ 实际 router.push 调用。chatStore 内闭环，无外部依赖。 |
| D3 | Admin.vue SSE 逻辑统一 | 0.3d | Admin.vue 废弃内联的 parseSSEBuffer/readSSEStream/dispatchSSEEvent（`Admin.vue:36-78`），改调 chatStore.sendAdminMessage（已完整实现 SSE 收发循环 + 消息管理）。**行为等价性验证要求**：迁移前需对比 Admin.vue 内联的 dispatchSSEEvent（`Admin.vue:81-119`）与 chatStore 的 dispatchSSEEvent（`chatStore.ts:270-339`）对 admin 对话特有事件类型的处理差异——chatStore 对 `agent_message` 和 `agent_thought` 事件静默忽略（line 330-331），而 Admin.vue 内联版本未处理这两个事件类型（switch 仅有 message/message_end/error 三分支，未匹配的事件走 default 分支静默忽略，行为等价）。迁移后至少执行一次 Admin 对话端到端冒烟测试，覆盖正常对话、流内错误、message_end 会话 ID 持久化三个场景。**此任务独立于 A6**——chatStore.sendAdminMessage 是完成的功能接口，Admin.vue 只需切换调用入口。A6 完成后 chatStore 内部可改为使用 useSSE composable，但 Admin.vue 不感知此变化。**文件冲突提示**：D1（扩展 chatStore.ts）与 D3（修改 Admin.vue 调用 chatStore 的路径）均涉及 `chatStore.ts`——D1 修改 chatStore.ts 新增历史消息 state/方法，D3 修改 Admin.vue 调用 chatStore.sendAdminMessage。建议在人力分配中将 D1 和 D3 分配给同一人，以避免合并冲突并确保 D3 不因 D1 延期而阻塞。若 D1 延期，D3 独立分配给另一人会导致：D1 未合入时 D3 依赖的 chatStore.sendAdminMessage 虽已存在但 D1 的新增改动可能与之冲突。工作量从 0.2d 增至 0.3d（含行为等价性分析 + 冒烟测试）。 |
| D4 | sendAdminChatMessage 重复定义去重 | 0.1d | `useAdminApi.ts:28-48` 与 `useChatApi.ts:97-118` 中的 `sendAdminChatMessage` 实现完全一致（函数签名和 fetch 逻辑均相同）。此任务严格依赖 D3 完成——D3 将 Admin.vue 迁移至 chatStore.sendAdminMessage 后，`useAdminApi.ts` 中的 `sendAdminChatMessage` 即成为死代码，方可移除。**不可在 Phase 1 独立执行**：`Admin.vue:8` 当前从 `@/composables/useAdminApi` 导入 `sendAdminChatMessage` 并在第 155 行实际调用，在 D3 迁移 Admin.vue 调用入口之前删除该函数将导致构建失败。执行方式：D3 完成后，移除 `useAdminApi.ts` 中的 `sendAdminChatMessage`，Admin.vue 改从 `chatStore` 导入。 |

**依赖链**：D1 无前置依赖（extension of useChatApi.ts is self-contained）；D2 在 chatStore 内闭环，无外部依赖；D3/D4 建议与 D1 分配同一人（避免合并冲突和阻塞风险）。D1/D2 可并行。**D 组总工期：1.0d**（取最长 D1）。

### Group E：pinia-plugin-persistedstate 迁移（决策前置任务）

| 编号 | 模块 | 工作量 | 说明 |
|------|------|-------|------|
| E1 | 持久化方案决策（已完成） | 0.1d | 本报告 §12 E1 决策分析框架已完整完成 sessionStorage+BroadcastChannel vs localStorage+pinia-plugin-persistedstate 的 5 维度对比分析，并给出明确推荐（保留当前方案）。此任务的增量工作仅为将已有分析格式化输出为独立决策文档（Markdown 格式）以供团队归档，工作量 0.1d。决策本身无需重新执行。 |

#### E1 决策分析框架

**当前方案：sessionStorage + BroadcastChannel**

| 维度 | 评估 |
|------|------|
| 跨标签页安全隔离 | ✅ 强 — 每标签页独立 sessionStorage，不会出现"多标签页登录不同账号时 token 覆盖"问题 |
| 跨标签页登录态同步 | ⚠️ 弱 — BroadcastChannel 仅实时同步已打开的标签页，新标签页/右键打开/外部链接打开均无 token，需重新登录 |
| 持久化 | ❌ 标签页关闭后丢失，刷新不丢失 |
| 实现复杂度 | 中 — 手动读写 sessionStorage + BroadcastChannel 双向同步，authStore 内含 ~20 行同步逻辑 |
| 依赖 | 零外部依赖 |

**设计原方案：localStorage + pinia-plugin-persistedstate**

| 维度 | 评估 |
|------|------|
| 跨标签页安全隔离 | ❌ 弱 — 所有标签页共享同一 localStorage，不同标签页登录不同账号时后登录者覆盖前者的 token |
| 跨标签页登录态同步 | ✅ 强 — 所有标签页共享 localStorage，新标签页自动读取已有 token |
| 持久化 | ✅ 标签页关闭后不丢失，刷新不丢失，重启浏览器后仍保留 |
| 实现复杂度 | 低 — npm 安装插件 + 2 行配置，自动序列化/反序列化 |
| 依赖 | 需安装 `pinia-plugin-persistedstate` npm 包 |

**推荐方向**：**保留当前 sessionStorage + BroadcastChannel 方案**。

理由：
1. 安全隔离优先：当前方案天然隔离多标签页多账号场景，避免 token 覆盖导致的安全隐患——这是设计原方案的已知缺陷，修复该缺陷需要额外的跨标签页协调逻辑，增加复杂度。
2. "新标签页需重新登录"是可接受的用户体验折衷——用户可被引导使用"Ctrl+点击"同一标签页内的链接在新标签页打开（此时 BroadcastChannel 即时同步）。
3. 无需新增 npm 依赖，降低维护成本。
4. 若未来用户反馈"新标签页登录繁琐"的占比高（>20% 活跃用户），可再评估迁移——迁移成本约 0.5d 编码 + 回归测试。

**决策前置动作**：建议在 Phase 2 完成后收集以下数据作为决策输入：
- 用户反馈中"多标签页"相关问题的数量
- sessionStorage 方案下通过 BroadcastChannel 跨标签页同步的成功率
- 后台日志中多账号同时活跃的比例

**若经数据验证决定迁移，编码任务拆解**：

| 子任务 | 工作量 |
|--------|-------|
| 安装 pinia-plugin-persistedstate + 配置 main.ts | 0.1d |
| 修改 authStore 存储介质为 localStorage | 0.1d |
| 修改 chatStore 持久化（doctorConversations/assistantConversationId/adminConversationId） | 0.2d |
| 调整 App.vue storage 事件监听适配插件 | 0.1d |
| 全站回归测试（登录/登出/刷新/多标签页/认证过期） | 0.5d |
| **合计** | **1.0d**（非当前必备项） |

### 推荐执行顺序

```
Phase 1 ──┐  A1 ~~env.d.ts~~         (0d, 取消)
           ├  A2 helpers.ts          (0.3d)
           ├  A3 models.ts           (0.2d)
           ├  A4 useAuth.ts          (0.4d)
           ├  A5 useUI.ts            (0.3d)
           ├  A6 useSSE.ts           (0.5d)
           ├  A7 Markdown统一        (0.3d)
           ├  A8 路由守卫修复         (0.1d)
           └  A10 搜索设计决策        (0.2d)
                (可全并行，最大路径 A6: 0.5d)
Phase 2 ──┐  B1 注册表单             (1.0d)
           ├  B2 编辑资料             (0.5d)
           ├  B3 路由JWT过期检测       (0.2d)
           ├  C1 文章收藏             (1.5d)
           ├  C2 搜索功能             (1.0d)  ← 前置: A10
           ├  D1 会话历史             (1.0d)
           ├  D2 AI 导航              (0.3d)
           ├  D3 Admin SSE统一        (0.3d)  ← 建议与D1同人; D4严格依赖D3
           └  D4 sendAdminChatMessage去重(0.1d)  ← 严格依赖D3
                (可全并行，D3/D4与D1建议同人)
Phase 3 ───  E1 持久化决策文档归档    (0.1d)  ← 格式化已有分析，非重新决策
                (独立任务，1人)
```

### 人力与工期估算

**Phase 2 各轨道工作量与最短分配方案**（按 3 人排期）：

| 人员 | 任务分配 | 累计 |
|------|---------|------|
| 人1 | C1 (1.5d) | 1.5d |
| 人2 | B1 (1.0d) + D1 (1.0d) + D3 (0.3d) + D4 (0.1d) | 2.4d |
| 人3 | C2 (1.0d) + B2 (0.5d) + B3 (0.2d) + D2 (0.3d) | 2.0d |

> **调度说明**：D1 和 D3 均涉及 `chatStore.ts` 修改（D1 新增历史消息 state/方法，D3 修改 Admin.vue 调用 chatStore 入口）。为避免合并冲突和 D3 因 D1 延期而阻塞，将 D1+D3+D4 分配给同一人（人2）。若需调整分配，可作为**备选方案**：人2 承担 D1(1.0d)+D3(0.3d)+D4(0.1d)+B3(0.2d)=1.6d，人1 承担 C1(1.5d)，人3 承担 B1(1.0d)+C2(1.0d)+B2(0.5d)+D2(0.3d)=2.8d。请根据团队实际情况选择方案。

**人力与工期**（基于主分配表）：
- Phase 2 工期 = max(1.5, 2.4, 2.0) = 2.4d
- **3 人方案**：Phase 1 (0.5d) + Phase 2 (2.4d) + Phase 3 (0.1d) ≈ **3.0d**
- **4 人方案**（重新分配）：人1:C1(1.5d), 人2:D1+D3+D4(1.4d), 人3:B1+B3(1.2d), 人4:C2+B2+D2(1.8d)，Phase 2 = 1.8d，总工期 ~**2.4d**

> **注意**：以上为纯前端开发工时，不含联调、测试时间。C2（搜索功能）工作量基于最简前端方案（1.0d），前置决策任务 A10（0.2d）已纳入 Phase 1。若采用备选后端搜索方案，C2 工作量增至 1.5-2.0d，Phase 2 工期需相应延长。D3/D4 建议与 D1 分配给同一人以避免 chatStore.ts 合并冲突。

---

## 13. 架构偏离汇总

以下偏离点需要决策：是否需要对齐设计文档，还是更新设计文档以适应实际实现。

| 偏离项 | 设计 | 实际 | 影响范围 | 建议 |
|--------|------|------|---------|------|
| 存储介质 | localStorage | sessionStorage | authStore, App.vue | 保留 sessionStorage+BroadcastChannel 方案（更安全），更新设计文档（见第12节E1决策分析） |
| 持久化插件 | pinia-plugin-persistedstate | 手动读写 sessionStorage + BroadcastChannel | authStore, chatStore, main.ts | 同上 |
| composable 架构 | 4 个 composables (useApi/useAuth/useSSE/useUI) | 10 个 composables（6 个设计外新增，3 个设计定义缺失） | useAuth.ts, useSSE.ts, useUI.ts 缺失 | 补建缺失的 3 个 composable |
| Admin.vue SSE | 复用 chatStore SSE 逻辑 | Admin.vue 自建 SSE 逻辑（`Admin.vue:36-78`），与 chatStore 重复 | Admin.vue | 切换为调用 chatStore.sendAdminMessage（第12节 D3） |
| Markdown 渲染 | 统一走 useMarkdown composable | DoctorChatView/ArticleDetailView/Admin/HealthAdvice/Risk 内联 marked+DOMPurify；仅 LifePlan.vue 使用 renderMarkdown() | 多个 views | 统一替换为 renderMarkdown() 调用。此差异源于开发时序——LifePlan.vue 开发较晚，useMarkdown composable 已存在时被采用；其余页面在 useMarkdown 创建前完成开发，未做统一重构 |
| 路由守卫 JWT 过期检测 | 设计步骤 2 检查"Token是否存在且未过期" | 仅检查 token 存在性，不检测 exp（`router/index.ts:118`） | router/index.ts:118 | 引入 useAuth composable（A4 项）进行 token exp 检查 |
| 路由守卫免责声明函数位置 | useUI().hasAcceptedDisclaimer() / showDisclaimer() | 函数直接定义在 router/index.ts（`router/index.ts:93-109`） | router/index.ts:93-109 | 完成 useUI composable（A5 项）后移入 |
| 路由守卫免责声明拒绝行为 | next(false) 保留来源页 | 始终重定向 /home（`router/index.ts:137`） | router/index.ts:137 | A8 最简方案（Phase 1）修复行为——保留来源页语义。免责声明函数移入 useUI 待 A5 完成后统一重构 |
| 路由守卫步骤 3/4 顺序 | 步骤3改密→步骤4角色 | 步骤4角色→步骤3改密 | router/index.ts:123,127 | 影响极小，可按需调整 |
| Axios 拦截器初始化方式 | main.ts 调用 setupAxiosInterceptors() 显式注册 | useApi.ts:11-58 在模块顶层直接定义拦截器（导入即生效），main.ts 不显式调用 | main.ts, useApi.ts | 维持现状并更新设计文档——模块顶层自注册等价于显式调用，功能无差异 |
| 样式文件路径 | src/styles/variables.css + src/styles/common.css | src/assets/variables.css + src/styles/animations.css（`main.ts:5-6`） | main.ts:5-6 | 更新设计文档以反映实际路径——CSS 变量功能完整，动画文件替代原 common.css |

---

## 14. 关键未实现功能清单（按优先级排序）

**优先级定义**：
- **P0（阻塞核心功能）**：用户可感知的核心功能缺失，直接影响用户留存和产品使用闭环。用户点击相关入口时无法完成预期操作，产生明显的功能断层体验。
- **P1（用户可感知的功能缺口）**：用户可通过界面入口直接感知到功能不可用，但当前有替代路径或功能不属于核心闭环。需优先填补以消除负面用户体验。
- **P2（架构合规/体验优化）**：功能可用但存在代码重复、架构偏离或用户体验不完整，不影响核心使用流程。
- **P3（清洁工/文档对齐）**：次要修复或文档级对齐，不影响功能或用户体验。

| 优先级 | 功能 | 根因位置 | 影响页面 | 后端状态 |
|--------|------|---------|---------|:--------:|
| P0 | 用户注册功能缺失（含 Login.vue 死链接「立即注册」） | `Login.vue:76` — 自环 `<router-link to="/login">` 导致注册入口死链接，用户点击后停留在登录页面且无任何反馈；注册表单完全缺失，`POST /api/auth/register` 后端已实现但前端未调用。两者为同一问题（症状与根因），合并为一条 P0 项。若注册功能开发周期较长，可先在 B1 中以临时 Toast 修补死链接，注册功能上线后整体替换 | Login | ✅ 已实现 |
| P0 | 文章收藏（收藏/取消/列表） | `ArticleDetailView.vue:75-78` 占位 | ArticleDetailView, NewsView | ✅ 已实现 |
| P1 | 搜索功能 | `Home.vue:82-93` 占位 Toast "搜索功能开发中" + 后端无搜索端点 + 设计文档未定义。首页首屏已渲染搜索栏，用户点击后收到"开发中"提示，符合 P1"用户可感知的功能缺口"——用户可通过界面入口直接感知功能不可用 | Home, NewsView | ❌ 无端点 |
| P1 | JWT 过期检测（路由守卫） | `router/index.ts:118` 仅检查 token 存在性，不检测 exp。当前有 useApi.ts 401 响应拦截器兜底——token 过期后首次 API 调用会被 401 拦截并触发重新登录，但在 token 过期后到首次 API 调用之间用户可访问需认证页面 | 全局 | — |
| P1 | 会话历史加载 | useChatApi 缺少 conversations 端点函数 | DoctorChatView | ✅ 已实现 |
| P2 | AI 助手导航（navigate） | `chatStore.ts:716-718` 空函数体。经全局代码搜索确认，当前项目中 `navigate()` 无任何调用方——AI 工作流尚未集成导航指令体系，此功能在任何用户交互中不可感知。降级为 P2 并备注：待 AI 集成导航指令后升级为 P1 | AiChatDialog | — |
| P2 | 编辑资料 | `Profile.vue:108-109` 占位 Toast | Profile | ✅ 已实现 |
| P2 | Admin.vue SSE 逻辑重复 | `Admin.vue:36-78` 内联 SSE 解析，与 chatStore 重复 | Admin | — |
| P2 | useAuth / useSSE / useUI composable 补建 | 三个文件缺失 | — | — |
| P2 | Markdown 渲染统一化 | DoctorChatView/ArticleDetailView/HealthAdvice/Admin/Risk 内联渲染 | 多个 views | — |
| P2 | sendAdminChatMessage 重复定义 | `useAdminApi.ts:28-48` 与 `useChatApi.ts:97-118` 实现完全一致（函数签名和 fetch 逻辑均相同）。D3 将 Admin.vue 迁移后，useAdminApi.ts 版本成为死代码，应一并清理 | useAdminApi.ts, useChatApi.ts | — |
| P3 | 免责声明拒绝行为修复 | `router/index.ts:137` next('/home') → 应为保留来源页语义 | 全局 | — |
| P3 | helpers.ts | 文件缺失 | 多页面 | — |
| P3 | models.ts | 文件缺失 | — | — |

> **后端状态列说明**：✅ 已实现 = 后端端点已在 `server/routes/` 中完成实现，前端开发无需 mock；❌ 无端点 = 后端缺乏对应接口，前端开发需同步新建后端端点或采用前端纯本地实现方案；— = 纯前端问题，不涉及后端。

> **优先级调整说明**：搜索功能从 P2 提升至 P1。理由：Home.vue 首页首屏已渲染搜索栏（供用户直接交互），用户点击后收到"搜索功能开发中" Toast，属于"用户可通过界面入口直接感知功能不可用"的 P1 场景。区别于注册功能——注册涉及产品使用闭环（未注册则无法使用系统核心功能），为 P0；搜索功能虽然用户可感知，但当前不搜索不影响核心使用流程（浏览首页文章、查看医生列表、风险预测等均可正常进行），故定为 P1 而非 P0。

---

## 修订说明（v5）

| 质询意见 | 回应 |
|---------|------|
| **问题1（高）**：§11.2 行661 依赖描述与 §5.2 结论存在事实矛盾——"JWT 解析已由 authStore 完成"与 §5.2"代码中不存在任何 JWT 解析逻辑"直接矛盾 | 已修正：行661 依赖表 B1 条目中"JWT 解析已由 authStore 完成"改为"注册操作仅需存储后端返回的 token/role/user，不涉及 JWT 解析"。与 §5.2 结论一致。该结论（B1 不依赖 A4）本身正确，仅表述有误。 |
| **问题2（高）**：§12 人力与工期估算存在多处数据不一致——①行861 C2 无法消化与分配表矛盾；②行864 汇总 2.5d 与主分配表 2.3d 不匹配；③行859 混淆单人负荷与阶段工期概念 | 已修正：①删除行861"C2 无法在 3 人内消化"表述（C2 已在主分配表分配给 人3）。②统一基于主分配表计算：Phase 2 = max(1.5, 2.4, 2.0) = 2.4d（D3 工作量同步修正为 0.3d），3 人总工期 = 0.5 + 2.4 + 0.1 = 3.0d。③删除行859"超过 3 人内最短工期"混淆表述，改为客观调度说明。替代分配方案标注为"备选方案"并独立计算工期。 |
| **问题3（中）**：D3 迁移任务未分析 Admin.vue 内联 SSE 与 chatStore.sendAdminMessage 的行为等价性 | 已补充：经代码对比验证——Admin.vue 内联 dispatchSSEEvent（`Admin.vue:81-119`）仅处理 message/message_end/error 三分支；chatStore dispatchSSEEvent（`chatStore.ts:270-339`）额外显式静默忽略 agent_message/agent_thought 事件。两者在 admin 当前对话场景中行为等价（Admin.vue 未匹配事件走 default 分支静默忽略）。D3 任务说明已补充行为等价性验证要求及端到端冒烟测试要求，工作量从 0.2d 增至 0.3d。 |
| **问题4（中）**：AI 助手导航（navigate）的 P1 优先级依据不足——navigate() 为空函数体，未评估 AI 工作流导航指令集成状态 | 已修正：经全局代码搜索确认，`chatStore.navigate()` 在项目当前代码中无任何调用方，AI 工作流尚未集成导航指令体系，此功能在任何用户交互中不可感知。已将该条目从 P1 降级为 P2，并备注"待 AI 集成导航指令后升级为 P1"。 |
| **问题5（低）**：§14 P0 项存在语义重叠——Login.vue 死链接与用户注册实为同一问题的两个方面 | 已修正：将行902"用户注册"和行903"Login.vue 死链接「立即注册」"合并为一条 P0 项"用户注册功能缺失（含 Login.vue 死链接「立即注册」）"，明确两者为症状与根因关系，并建议若注册功能周期较长可先以临时 Toast 修补死链接。 |
| **问题6（低）**：A8 导航守卫免责声明拒绝行为修复的最简路径与最佳路径选择缺乏指引 | 已修正：明确推荐优先执行最简方案（Phase 1 中完成，0.1d 且与 A5 解耦）；最佳实践（disclaimer 函数移入 useUI）待 A5 完成后统一重构。§13 架构偏离表对应行同步更新修复状态描述。 |
| D3 工作量 0.2d→0.3d 连锁影响 | 连锁修正：Phase 2 主分配表 人2 累计 2.3d→2.4d；备选方案 人2 1.5d→1.6d；3 人方案总工期 2.9d→3.0d。以上所有数值已同步更新。 |

