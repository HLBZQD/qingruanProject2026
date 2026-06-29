# 前端模块实现差距诊断报告 v1

## 1. 诊断概述

**诊断对象**：`src/` 下所有前端模块的实现状态与 `docs/2_detailed_design_v3.md` 定义的对比分析。

**诊断方法**：逐模块阅读设计文档（第1-5章）与全部源代码文件，逐功能点对比，确认已实现/部分实现/未实现/偏离项目。

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
- ❌ `setupAxiosInterceptors()` 未被调用 — 根因：`useApi.ts:11-58` 在模块顶层直接定义了 axios 实例和拦截器（导入即生效），不走设计定义的显式初始化函数。
- ❌ 样式路径偏离：设计引用 `./styles/variables.css`，实际为 `./assets/variables.css`；设计引用 `./styles/common.css`，实际无此文件，改为 `./styles/animations.css`。
- ❌ 设计定义 `authStore.syncFromStorage()` 在 main.ts 中显式调用以恢复登录态，但实际 main.ts 中确实有此调用（第 15 行），此点符合设计。

**偏离根因**：团队选择 sessionStorage + BroadcastChannel 方案替代 localStorage + pinia-plugin-persistedstate 方案，此决策是实现层面的有意选择而非遗漏，但未在设计中体现。此偏离影响跨标签页认证同步行为（BroadcastChannel 不持久化，标签页关闭后丢失；设计原方案 localStorage 持久化，刷新不丢失）。

### 2.2 env.d.ts

**设计要求**（文档 1.4 节第 321-332 行）：存在 `src/env.d.ts`，包含 `.vue` 模块类型声明和 Vite 环境变量类型引用。

**实际状态**：未实现
- ❌ `src/env.d.ts` 不在实际代码中

**根因**：该文件缺失。影响：TypeScript 对 `.vue` 文件的 import 可能报类型错误（取决于 tsconfig 配置）。

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
- ❌ **会话历史加载未实现**：设计定义 `GET /api/chat/doctor/:id/conversations` 和 `GET /api/assistant/conversations` 两个历史会话接口，但 composable 层和 chatStore 均未实现历史消息加载和展示。
- ✅ Admin.vue 自行实现了 SSE 解析和事件分发（`Admin.vue:36-78`），重复了 chatStore 的逻辑，偏离了设计"SSE 逻辑统一在 chatStore"的架构要求。

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
- ❌ 文件不存在。JWT 相关逻辑全部整合在 authStore.ts 中。
- 缺失功能：
  - JWT Token 解析（从 token 中提取 payload）
  - JWT Token 过期检测（检查 exp 字段）
  - 作为独立工具函数的 Token 读写（当前仅通过 authStore 封装）

### 5.3 useSSE.ts

**设计要求**（文档 1.4 节第 196 行）：SSE 流式请求封装。

**实际状态**：未实现
- ❌ 文件不存在。SSE 流式消费逻辑分散在 chatStore.ts（readSSEStream / parseSSEBuffer / dispatchSSEEvent）和 Admin.vue（内联的 readSSEStream / parseSSEBuffer / dispatchSSEEvent）。
- 缺失功能：作为独立 composable 的通用 SSE 流式请求封装（可复用于 doctor/assistant/admin 三种场景）。

### 5.4 useUI.ts

**设计要求**（文档 1.4 节第 197 行）：UI 工具（Toast、Loading）。

**实际状态**：未实现
- ❌ 文件不存在。UI 工具（Toast/Loading）散落在各页面组件中通过 SweetAlert2 内联调用。
- 设计文档 1.6.2 节路由守卫伪代码引用了 `useUI().showDisclaimer()` 和 `useUI().hasAcceptedDisclaimer()`，但实际路由守卫（`router/index.ts:97-109`）将这些函数直接定义在路由文件中，未走 useUI。

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

## 6. 工具函数层差距分析

### 6.1 utils/helpers.ts

**设计要求**（文档 1.4 节第 199 行）：日期格式化、防抖截流等通用工具函数。

**实际状态**：未实现
- ❌ 文件不存在。日期格式化函数散落在各组件中内联定义（`Home.vue`, `NewsView.vue`, `Profile.vue` 等各有自己的 formatDate），造成代码重复。

### 6.2 utils/enumLabels.ts

**设计要求**（文档 1.8.1 节第 650-673 行）：英文枚举值 → 中文展示标签映射字典。

**实际状态**：已实现
- ✅ 全部枚举类别映射（gender/family_history/diabetes_history/diabetes_type/risk_level/plan_type/punch_type/completion_status）

### 6.3 utils/sanitize.ts

**设计文档未定义**，为实际代码扩展。
- ✅ escapeHtml()：HTML 实体转义
- ✅ sanitizeHtml()：DOMPurify 白名单加固（含 ALLOWED_TAGS/ATTR/URI_REGEXP/FORBID_TAGS/FORBID_ATTR）

### 6.4 utils/errorMessage.ts

**设计文档未定义**，为实际代码扩展。
- ✅ getErrorMessage()：统一错误消息提取（Axios 错误/标准 Error/字符串/fallback）

---

## 7. 页面组件差距分析（Views）

### 7.1 App.vue

**设计要求**（文档 4.1.1 节第 2939-2982 行）：根组件，含 `<router-view />`、`<TabBar>`、`<FabButton>`、`<AiChatDialog>`。

**实际状态**：已实现
- ✅ router-view / TabBar / FabButton / AiChatDialog 四件套完整
- ✅ TabBar 显隐逻辑（noTabRoutes = ['/login', '/change-password', '/admin']）
- ✅ FAB 显隐逻辑（不在 /login 和 /change-password 时显示）
- ✅ 跨浏览器标签页登录态同步（storage 事件监听），含 token/role/user 三字段同步
- ✅ 存储键使用 'token' / 'role' / 'user'（与 authStore 中 sessionStorage 键一致）
- ❌ 设计要求的 `pinia-plugin-persistedstate` 持久化监听（storage 事件 → authStore 同步）被 BroadcastChannel 方案替代

### 7.2 Home.vue

**设计要求**（文档 4.1.2 节第 2984-3027 行）：系统首页，含轮播 Banner、医师列表、科普文章、糖尿病类型四区块。

**实际状态**：已实现
- ✅ 轮播 Banner（纯 CSS 实现，3 条，4s 自动切换，替代设计的 Swiper）
- ✅ 医师团队（从 homeStore 获取，横向滚动卡片）
- ✅ 健康科普（前 3 条文章卡片）
- ✅ 糖尿病类型（2 列网格，含渐变封面、弹层详情）
- ✅ 骨架屏/错误态/空态覆盖四区块
- ✅ 各区块独立降级（Promise.allSettled + 各区块独立错误/重试）
- ❌ 搜索功能为占位：`onSearch()` 弹出 "搜索功能开发中" Toast

### 7.3 Login.vue

**设计要求**（文档 4.1.10 节第 3368-3407 行）：登录表单 + 注册表单，两表单一页面，视图切换。

**实际状态**：部分实现
- ✅ 登录表单完整（用户名 + 密码 + 登录按钮 + 错误提示）
- ❌ **注册表单完全缺失**：设计定义的注册表单（用户名 + 密码 + 确认密码 + 验证 + 提交注册）未实现。当前"立即注册"链接指向 `/login`（自环）。
  - 根因：`Login.vue:77` 的 `<router-link to="/login">立即注册</router-link>` 是自环链接，未触发注册视图展示。
  - 此外，`POST /api/auth/register` 接口设计的注册 success 响应结构需返回 `token` + `role` + `user`（注册成功直接登录），此端点前端调用逻辑也未实现。
- ✅ 登录成功后 `router.replace(safeRedirect(route.query.redirect))`，带开放重定向防护

### 7.4 Consultation.vue

**设计要求**（文档 4.1.3 节第 3031-3046 行）：医生列表页。

**实际状态**：已实现
- ✅ 医生列表（头像 + 姓名 + 在线标识 + 科室 + 职称 + 简介 + "开始咨询"按钮）
- ✅ 加载态（3 个骨架卡片）
- ✅ 错误态 + 重试
- ✅ 空态（"暂无在线医生"）

### 7.5 DoctorChatView.vue

**设计要求**（文档 4.1.3 节第 3048-3078 行）：医生对话页，含消息气泡（用户/AI）、流内错误警告、输入发送。

**实际状态**：已实现
- ✅ 医生信息头部（头像 + 姓名 + 在线状态 + 科室·职称）
- ✅ 消息气泡（用户右侧蓝色 / AI 左侧白色，含头像 + 时间）
- ✅ Markdown 渲染 + DOMPurify 净化（AiChatDialog 和 DoctorChatView 均内联了 marked + DOMPurify 而非复用 useMarkdown.ts）
- ✅ SSE 流式消息（打字机效果，chatStore.sendMessageWithRetry）
- ✅ "对方正在输入..."动画（isStreaming）
- ✅ 清空对话（clearDoctorConversation + 清除 messages）
- ✅ 免责声明条（固定可见）
- ❌ **会话历史加载未实现**：设计定义 `GET /api/chat/doctor/:id/conversations` 用于加载历史会话列表，实际未实现。
  - 根因：chatStore 的 `getDoctorConversation` 仅读取 conversation_id，不加载历史消息列表。缺少 history API composable 和 DoctorChatView 的 "加载历史消息" 交互。
- ⚠️ 自己管理 marked + DOMPurify 而非复用 useMarkdown composable（`DoctorChatView.vue:9-10`），造成代码重复

### 7.6 LifePlan.vue

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
- ✅ 使用 `renderMarkdown()` 统一渲染管道

### 7.7 NewsView.vue

**设计要求**（文档 4.1.5 节第 3114-3129 行）：资讯列表页，含分类标签筛选、文章卡片列表、分页加载更多、"生成资讯"（需登录）、免责提示。

**实际状态**：已实现
- ✅ 分类标签筛选（全部/饮食指导/运动指南/生活习惯/知识科普）
- ✅ 文章列表（封面 + 标题 + 摘要/标签 + 作者·时间 + 阅读量）
- ✅ 分页加载更多
- ✅ 文章生成两阶段（category_selection → 选择主题 → 生成文章 → 跳转详情）
- ✅ 免责声明判定（生成前检查）
- ✅ 骨架屏 / 错误重试 / 空态（复用全局组件）
- ✅ sessionStorage 页面状态缓存（5min TTL）
- ❌ **文章收藏按钮未实现**：列表中不显示收藏状态，无法从列表页触发收藏操作
- ❌ **文章分类图标未实现**：设计未定义但原型中列表分类有图标，实际代码无分类图标

### 7.8 ArticleDetailView.vue

**设计要求**（文档 4.1.5 节第 3131-3144 行）：文章详情页，含 Header（返回 + 收藏按钮）、封面、标题、元信息（作者·发布时间）、正文（Markdown 渲染）、免责提示。

**实际状态**：部分实现
- ✅ 文章详情加载 + 404/错误区分
- ✅ 头部粘性导航栏（返回按钮 + 文章标题）
- ✅ 封面图 + 标题 + 作者 + 时间 + 分类标签
- ✅ Markdown 正文净化渲染（marked + DOMPurify，但直接内联而非复用 useMarkdown.ts）
- ✅ 加载态/错误态/404 态
- ✅ 收藏按钮 UI 存在（书签图标，根据 `article.is_collected` 切换实心/空心）
- ❌ **收藏交互未实现**：`toggleCollect()` 为占位实现（`ArticleDetailView.vue:75-78`），`console.warn('[ArticleDetailView] 收藏功能待实现 (S5a 占位)')`。
  - 根因：缺少 `POST /api/articles/:id/collect` 和 `DELETE /api/articles/:id/collect` 的 composable 调用层。
- ❌ Markdown 渲染未复用 `useMarkdown.ts`

### 7.9 Profile.vue

**设计要求**（文档 4.1.6 节第 3146-3191 行）：个人中心，含头像 + 用户名 + 角色、菜单入口列表（风险预测/打卡/健康建议/编辑资料/智能管理(admin)/退出登录）、嵌套路由出口。

**实际状态**：部分实现
- ✅ 头像（含上传触发 + 格式/大小校验）
- ✅ 用户名/角色/注册时间显示
- ✅ 菜单入口列表（风险预测/打卡记录/健康建议/智能管理(admin)/退出登录）
- ✅ 嵌套路由出口（子路由活跃时隐藏主菜单）
- ✅ 登出流程（中止 SSE → 清理会话 → 清除表单 → authStore.logout → 跳转首页），对齐设计 v15 登出完整流程
- ❌ **编辑资料功能为占位**：`onEditProfile()` 弹出 "编辑资料功能开发中" Toast（`Profile.vue:108-109`）
  - 根因：`PUT /api/user/profile` 接口的 composable 层未实现（仅 useUserApi.ts 有 changePassword），缺少用户名修改的 API 调用和前端表单。

### 7.10 Risk.vue

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

### 7.11 Punch.vue

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

### 7.12 HealthAdvice.vue

**设计要求**（文档 4.1.9 节第 3342-3366 行）：健康建议列表，可展开卡片（标题 + 标签 + 时间 + 内容），分页。

**实际状态**：已实现
- ✅ 可展开健康建议卡片（点击切换展开/收起）
- ✅ 标签展示 + 创建时间
- ✅ Markdown 正文渲染（marked + DOMPurify 内联）
- ✅ 分页加载更多
- ✅ 顶部免责声明条（复用 DisclaimerBar 组件）
- ✅ 骨架屏 / 错误重试 / 空态（复用全局组件）
- ❌ 内容渲染未复用 useMarkdown.ts composable

### 7.13 Admin.vue

**设计要求**（文档 4.1.11 节第 3409-3450 行）：管理页，含对话视图（自然语言管理指令）、操作日志子视图。

**实际状态**：部分实现
- ✅ 对话视图（Chat 模式）完整实现（消息气泡 + SSE 流式）
- ✅ 操作日志视图（Logs 模式）完整实现（分页列表 + 加载更多）
- ✅ Chat/Logs 视图切换
- ✅ SSE 解析和事件分发（Admin.vue 内联实现，未复用 chatStore）
- ⚠️ Admin.vue 重复实现了 SSE 流读取逻辑（`Admin.vue:36-78` 与 `chatStore.ts:218-339` 功能重复），偏离设计"SSE 逻辑统一在 chatStore"的架构意图
- ❌ Admin SSE 未使用 chatStore 的 sendAdminMessage 方法，而是在 Admin.vue 中自行管理 messages 数组和 SSE 连接

### 7.14 ChangePassword.vue

**设计要求**（文档 1.6.2 节第 596-603 行）：管理员首次登录强制改密码页，含新密码 + 确认密码 + 提交，不允许绕过。

**实际状态**：已实现
- ✅ 密码校验（8 位 + 含字母数字）
- ✅ 确认密码一致性校验
- ✅ 强制改密场景（mustChangePassword=true 时不可绕过）
- ✅ 非强制场景自动跳转
- ✅ 提交后清除 mustChangePassword 标记 + SweetAlert2 成功弹窗 + 跳转

---

## 8. 复用组件差距分析

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

## 9. API Composable 覆盖率分析

对比设计文档 3.1 节完整端点清单（14 组 API）与前端 composable 覆盖情况：

| API 组 | 端点 | 前端 Cover | 说明 |
|--------|------|-----------|------|
| auth | POST /api/auth/login | ✅ useApi.ts (authStore.login) | |
| auth | POST /api/auth/register | ❌ | 无前端调用 |
| auth | POST /api/auth/logout | ✅ useApi.ts (authStore.logout) | |
| user | GET /api/user/profile | ✅ useApi.ts (Profile.vue 直接调用) | 未封装为 composable |
| user | PUT /api/user/profile | ❌ | 编辑资料功能待实现 |
| user | PUT /api/user/password | ✅ useUserApi.ts | |
| risk | POST /api/risk/predict | ✅ Risk.vue 直接调用 useApi | 未封装为 composable |
| risk | GET /api/risk/history | ✅ Risk.vue 直接调用 useApi | 未封装为 composable |
| doctors | GET /api/doctors | ✅ useHomeApi.ts | |
| doctors | GET /api/doctors/:id | ✅ useChatApi.ts (getDoctorInfo) | |
| chat | POST /api/chat/doctor/:id | ✅ useChatApi.ts (sendChatMessage) | |
| chat | GET /api/chat/doctor/:id/conversations | ❌ | 历史会话列表未实现 |
| plan | POST /api/plan/generate | ✅ useLifePlanApi.ts | |
| plan | PUT /api/plan/adjust | ✅ useLifePlanApi.ts | |
| plan | GET /api/plan/current | ✅ useLifePlanApi.ts | |
| punch | POST /api/punch | ✅ useLifePlanApi.ts (createPunch) | |
| punch | GET /api/punch/list | ✅ usePunchApi.ts | |
| punch | GET /api/punch/analysis | ✅ usePunchApi.ts | |
| articles | GET /api/articles | ✅ useHomeApi.ts | |
| articles | GET /api/articles/:id | ✅ useHomeApi.ts (getArticle) | |
| articles | POST /api/articles/generate | ✅ useArticleApi.ts | |
| articles | POST /api/articles/:id/collect | ❌ | 收藏功能待实现 |
| articles | DELETE /api/articles/:id/collect | ❌ | 取消收藏待实现 |
| articles | GET /api/articles/collections | ❌ | 收藏列表待实现 |
| diabetes | GET /api/diabetes-types | ✅ useHomeApi.ts | |
| diabetes | GET /api/diabetes-types/:id | ✅ useHomeApi.ts | |
| assistant | POST /api/assistant/chat | ✅ useChatApi.ts (sendAssistantChatMessage) | |
| assistant | GET /api/assistant/advice | ✅ useAdviceApi.ts | |
| assistant | GET /api/assistant/conversations | ❌ | 历史会话列表未实现 |
| admin | POST /api/admin/chat | ✅ useAdminApi.ts (useChatApi.ts 重复定义) | |
| admin | POST /api/admin/execute | N/A | 后端内部调用，前端不直调 |
| admin | GET /api/admin/logs | ✅ useAdminApi.ts | |
| upload | POST /api/upload/avatar | ✅ Profile.vue 直接调用 useApi | 未封装为 composable |

**覆盖率统计**：
- 已覆盖：26 个端点
- 未覆盖：5 个端点（register、user/profile(PUT)、conversations(2 个)、collections(2 个)、collections list）
- 覆盖率：26/31 = 83.9%

---

## 10. 依赖关系分析

### 10.1 模块依赖方向

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

### 10.2 各待实现功能的前置依赖

| 待实现功能 | 前置依赖 | 说明 |
|-----------|---------|------|
| 用户注册前端 | useApi.ts, Login.vue 现有结构 | 需在 Login.vue 添加注册表单视图，调用 POST /api/auth/register |
| 文章收藏 | useArticleApi.ts (新增), ArticleDetailView.vue | 需新增 fetch 函数调用 POST/DELETE /api/articles/:id/collect，增加收藏列表接口 |
| 编辑资料 | useUserApi.ts (扩展), Profile.vue | 需扩展 useUserApi.ts 添加 updateProfile()，Profile.vue 添加编辑表单 |
| 搜索功能 | — | 独立功能，Home.vue 占位需替换为实际搜索 UI |
| 会话历史加载 | useChatApi.ts (扩展), chatStore.ts, DoctorChatView.vue | 需新增 fetchConversationsHistory 和 getAssistantConversations |
| AI 助手导航 | chatStore.ts navigate() | 需实现 AI 回复中的 router.push 跨模块跳转 |
| useAuth composable | authStore.ts | 从 authStore 中抽取 JWT 工具函数为独立 composable |
| useSSE composable | chatStore.ts, Admin.vue | 从 chatStore 和 Admin.vue 中抽取通用 SSE 流式封装 |
| useUI composable | router/index.ts, App.vue | 从路由守卫中抽取 disclaimer 判定和 showDisclaimer |
| models.ts | api.ts | 从 api.ts 中拆分业务实体类型为独立文件 |
| helpers.ts | 各 views 组件 | 抽取散落的日期格式化、debounce/throttle 为统一工具 |
| env.d.ts | — | 新建文件，定义 .vue 模块类型声明 |

### 10.3 模块间耦合关系

- **authStore ← 几乎所有页面**：Login/Register、路由守卫、Profile、所有需认证的 API 调用
- **chatStore ← DoctorChatView, AiChatDialog, Admin.vue, App.vue**：对话状态共享
- **riskFormStore ← Risk.vue, LifePlan.vue**：风险预测结果传递给生活方案生成参数
- **homeStore ← Home.vue, Consultation.vue (间接)**：首页数据和医生列表共享 getDoctors
- **lifePlanStore ← LifePlan.vue**：方案状态管理
- **punchStore ← Punch.vue**：打卡状态管理

---

## 11. 并行开发分组建议

### 分组原则
- 同一分组内的模块互不依赖，或依赖已完成模块
- 分组间严格执行依赖顺序
- 基于文件级别的依赖分析

### Group A：基础设施补完（无外部依赖，可最先并行）
| 编号 | 模块 | 工作量 | 说明 |
|------|------|-------|------|
| A1 | `src/env.d.ts` | 0.1d | 新建，.vue 类型声明 + Vite 环境变量引用 |
| A2 | `src/utils/helpers.ts` | 0.3d | 新建，从各 views 抽取日期格式化/防抖截流 |
| A3 | `src/types/models.ts` | 0.2d | 从 api.ts 拆分业务实体类型 |
| A4 | `src/composables/useAuth.ts` | 0.3d | 从 authStore 抽取 JWT 工具函数 |
| A5 | `src/composables/useUI.ts` | 0.3d | 新建，Toast/Loading/Disclaimer 统一 UI 工具 |
| A6 | `src/composables/useSSE.ts` | 0.5d | 从 chatStore + Admin.vue 抽取通用 SSE 封装 |

**依赖链**：A 组内无相互依赖，可全并行。**A 组总工期：0.5d**（取最长路径 A6）。

### Group B：认证与用户功能增强（依赖 A2, A4, A5）
| 编号 | 模块 | 工作量 | 说明 |
|------|------|-------|------|
| B1 | Login.vue 注册表单 | 1.0d | 添加注册视图 + 表单校验 + POST /api/auth/register 调用 + 注册成功自动登录 |
| B2 | Profile.vue 编辑资料 | 0.5d | 扩展 useUserApi.ts + Profile.vue 编辑表单 + PUT /api/user/profile |
| B3 | useMarkdown.ts 复用化 | 0.3d | 替换 DoctorChatView.vue / ArticleDetailView.vue / Admin.vue / HealthAdvice.vue / Risk.vue 中内联的 marked+DOMPurify 调用为统一的 renderMarkdown() |

**依赖链**：B1→(A2,A4)；B2→(A5)；B3 无前置依赖。B1/B2/B3 可并行。**B 组总工期：1.0d**（取最长 B1）。

### Group C：内容与资讯功能增强（依赖 A2）
| 编号 | 模块 | 工作量 | 说明 |
|------|------|-------|------|
| C1 | 文章收藏功能 | 1.5d | 新增 useCollectionApi composable + ArticleDetailView.vue 收藏交互 + NewsView.vue 列表中的收藏状态展示 + 收藏列表页 |
| C2 | 搜索功能 | 0.5d | Home.vue 搜索入口替换占位为实际搜索实现 |
| C3 | Markdown 渲染统一 | 0.2d | 已在 B3 中覆盖，此处仅收尾验证 |

**依赖链**：C1→(A2)；C2 无前置依赖。C1/C2 可并行。**C 组总工期：1.5d**（取最长 C1）。

### Group D：对话系统增强（依赖 A6）
| 编号 | 模块 | 工作量 | 说明 |
|------|------|-------|------|
| D1 | 会话历史加载 | 1.0d | 新增 useChatApi 的 getConversationHistory() + chatStore 历史消息管理 + DoctorChatView 历史消息展示 |
| D2 | AI 助手导航 | 0.3d | chatStore.navigate() 从占位实现 → 实际 router.push 调用 |
| D3 | useSSE 重构 | 0.5d | 已在 A6 中覆盖，此处 Admin.vue 改调 chatStore.sendAdminMessage 统一 SSE 逻辑 |

**依赖链**：D1→(A6)；D2 在 chatStore 内闭环，无外部依赖；D3→(A6)。D1/D2/D3 可并行。**D 组总工期：1.0d**（取最长 D1）。

### Group E：pinia-plugin-persistedstate 迁移（依赖全部功能稳定）
| 编号 | 模块 | 工作量 | 说明 |
|------|------|-------|------|
| E1 | 持久化方案切换 | 2.0d | 评估 sessionStorage+BroadcastChannel 方案是否保留；若切换回设计原方案需：安装 pinia-plugin-persistedstate、修改 main.ts、修改 authStore/chatStore 存储介质为 localStorage、调整 App.vue 的 storage 事件监听 |

**注意**：此变更涉及全站登录态行为，建议在 A-D 组功能稳定后再评估是否需要切换。

**E 组总工期：2.0d**。

### 推荐执行顺序

```
Phase 1 ──┐  A1 env.d.ts       (0.1d)
           ├  A2 helpers.ts     (0.3d)  
           ├  A3 models.ts      (0.2d)
           ├  A4 useAuth.ts     (0.3d)
           ├  A5 useUI.ts       (0.3d)
           ├  A6 useSSE.ts      (0.5d)
           └  B3 Markdown复用    (0.3d)
               (可全并行，最大路径 0.5d)
Phase 2 ──┐  B1 注册表单        (1.0d)
           ├  B2 编辑资料        (0.5d)
           ├  C1 文章收藏        (1.5d)  ← 可与 B1/B2 并行
           ├  C2 搜索功能        (0.5d)  ← 可与 B1/B2/C1 并行
           ├  D1 会话历史        (1.0d)  ← 可与 B/C 组并行
           ├  D2 AI 导航         (0.3d)  ← 可与 B/C/D1 并行
           └  D3 Admin SSE重构   (0.5d)  ← 可与 B/C 组并行
               (可全并行，最大路径 1.5d)
Phase 3 ───  E1 Pinia持久化     (2.0d)   ← 依赖 Phase 1+2 完成
               (独立任务，1人)
```

**并行开发所需最少人力**：3 人（Phase 1: 1人 0.5d, Phase 2: 2-3人 并行 1.5d, Phase 3: 1人 2.0d）

**总串行工期估算**：~4.0d（含 E1）
**总并行工期估算**：~3.5d（Phase 1 0.5d + Phase 2 1.5d + Phase 3 2.0d，Phase 2 完成后 etc.）

---

## 12. 架构偏离汇总

以下偏离点需要决策：是否需要对齐设计文档，还是更新设计文档以适应实际实现。

| 偏离项 | 设计 | 实际 | 影响范围 | 建议 |
|--------|------|------|---------|------|
| 存储介质 | localStorage | sessionStorage | authStore, App.vue | 决策：保留 sessionStorage+BroadcastChannel 方案（更安全），需更新设计文档 |
| 持久化插件 | pinia-plugin-persistedstate | 手动读写 sessionStorage + BroadcastChannel | authStore, chatStore, main.ts | 同上 |
| composable 架构 | 4 个 composables (useApi/useAuth/useSSE/useUI) | 10 个 composables（6 个设计外新增，3 个设计定义缺失） | useAuth.ts, useSSE.ts, useUI.ts 缺失 | 补建缺失的 3 个 composable |
| Admin.vue SSE | 复用 chatStore SSE 逻辑 | Admin.vue 自建 SSE 逻辑 | Admin.vue | 重构为调用 chatStore.sendAdminMessage |
| Markdown 渲染 | 统一走 useMarkdown composable | DoctorChatView/ArticleDetailView/Admin/HealthAdvice/Risk 内联 marked+DOMPurify | 多个 views | 统一替换为 renderMarkdown() 调用 |

---

## 13. 关键未实现功能清单（按优先级排序）

| 优先级 | 功能 | 根因位置 | 影响页面 |
|--------|------|---------|---------|
| P0 | 文章收藏（收藏/取消/列表） | `ArticleDetailView.vue:75-78` 占位 | ArticleDetailView, NewsView |
| P0 | 用户注册 | `Login.vue:77` 自环链接 | Login |
| P1 | AI 助手导航（navigate） | `chatStore.ts:716-718` 占位 | AiChatDialog |
| P1 | 会话历史加载 | useChatApi 缺少 conversations 端点 | DoctorChatView |
| P2 | 编辑资料 | `Profile.vue:108-109` 占位 | Profile |
| P2 | 搜索功能 | `Home.vue:82-93` 占位 Toast | Home |
| P2 | useAuth / useSSE / useUI composable 补建 | 三个文件缺失 | — |
| P3 | env.d.ts | 文件缺失 | — |
| P3 | helpers.ts | 文件缺失 | 多页面 |
| P3 | models.ts | 文件缺失 | — |
