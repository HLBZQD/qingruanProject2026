# 质量审查报告 v5

## 审查概要

**审查对象**：`a_v5_diag_v1.md`（前端模块实现差距诊断报告 v5）

**审查范围**：由于内部审议已覆盖诊断报告的因果链条、根因定位、依赖关系一致性、人力工期计算、后端 API 验证、优先级排序等维度，本审查侧重以下三个维度：
1. 产出是否充分响应了用户需求
2. 产出中是否存在事实错误或逻辑矛盾
3. 产出的深度和完整性（特别是可操作性）是否满足后续使用需要

**整体评价**：报告逐模块对照设计文档与源代码进行了详尽的差距分析，覆盖了需求中列出的全部 13 个页面组件、7 个复用组件、6 个 Pinia Store、10 个 composable 以及路由/类型/工具层，产出物 1（逐模块差距清单）和产出物 2（并行开发分组）均达到了需求要求。总体质量较高，但存在以下若干影响后续执行可操作性的问题。

---

## 发现的问题

### 问题 1：D3 Admin.vue SSE 迁移任务过度简化，遗漏关键重构步骤

- **问题描述**：§12 D3（第 765 行）将 Admin.vue SSE 统一描述为"仅需切换调用入口并丢弃内联实现"，但经代码验证，chatStore.sendAdminMessage（`chatStore.ts:597-636`）将消息推入 `chatStore.conversations`（`chatStore.ts:11` 定义的 Store 级共享消息列表），而 Admin.vue 当前使用本地 `const messages = ref<ChatMessage[]>([])`（`Admin.vue:22`）渲染消息列表。迁移不仅涉及调用入口切换，还必然涉及：**(a)** Admin.vue 模板中消息数据源从本地 `messages` 切换为 `chatStore.conversations`；**(b)** Admin.vue 本地 `isStreaming` ref（`Admin.vue:24`）切换为 `chatStore.isStreaming`。此外，`chatStore.conversations` 被 doctor/assistant/admin 三种对话模式共享（chatStore 不按 mode 隔离消息列表），Admin.vue 切换后将在同一列表中看到所有模式的对话历史（混入 doctor/assistant 消息），这是一个非平凡的语义变化。
- **所在位置**：§12 Group D，D3 第 765 行；§11.2 第 673 行（"Admin.vue 仅需切换调用入口"）
- **严重程度**：中
- **改进建议**：
  1. 补充 D3 任务的完整迁移 checklist：切换 `messages` → `chatStore.conversations`、切换 `isStreaming` → `chatStore.isStreaming`、移除本地 SSE 函数、移除本地 sendAdminChatMessage 导入
  2. 评估 chatStore.conversations 多模式共享对 Admin.vue 的影响：Admin 视图是否需过滤非 admin 消息？若需过滤，应补充过滤逻辑说明或讨论 chatStore 是否应按模式维护独立消息列表
  3. 将 D3 工作量从 0.3d 重新评估（当前 0.3d 已含"行为等价性分析 + 冒烟测试"，但未含模板绑定改造）

### 问题 2：C1 文章收藏方案A 未明确跨组件状态共享机制

- **问题描述**：§11.2 第 662 行及 §12 C1 第 754 行推荐方案A——在 useArticleApi.ts 内建 reactive `collectedMap: Ref<Record<number, boolean>>` 实现乐观更新和跨页面状态同步。但 Vue 3 composable 在 `<script setup>` 中调用时默认创建**每组件实例独立状态**（即 ArticleDetailView 和 NewsView 各自持有的 `collectedMap` 是不同引用）。若不明确指定模块级共享状态（export 的 ref 定义在 `export function` 外部），跨页面 `is_collected` 同步将无法工作：用户在某页面收藏文章后，其他已打开的页面不会感知状态变化，即使通过 BroadcastChannel/API 主动刷新也会因各自独立的 `collectedMap` 而无法体现。第 662 行提到"方案A（扩展 useArticleApi 为带 reactive state 的 stateful composable）"使用了"stateful composable"这个术语，但该模式在 Vue 3 社区中有多种实现方式（模块级单例 vs provide/inject），当前描述不足以让执行者选择正确实现。
- **所在位置**：§11.2 第 662 行（C1 方案描述）、§12 C1 第 754 行
- **严重程度**：中（修订后降级为低，见修订说明）
- **后注**：经代码验证，当前 `useArticleApi.ts` 中 `sendGenerateArticleRequest` 和 `sendChatMessage` 等函数定义于模块顶层（export function 体外），若 `collectedMap` 同样定义于模块顶层，则可自然实现单例语义。审查报告的原始措辞"不足以让执行者选择正确实现"过强——正确实现仅需遵循文件内已有模块级定义模式。此问题降级为低严重度。
- **改进建议**：明确方案A 的实现模式：
  1. 指定使用**模块级单例**模式（`collectedMap` 定义在 `export function` 外部、模块顶层），确保所有 import 方共享同一引用
  2. 或改用方案B（新建 articleStore），利用 Pinia 天然的全局单例特性
  3. 若保留方案A，补充模块级单例实现的关键代码骨架（如 `const collectedMap = ref<Record<number, boolean>>({})` 置于 composable 函数体外，确认 Pinia 外的模块级 ref 在 Vue 3 中的响应性保障）

### 问题 3：C2 搜索方案前端全量拉取边界条件分析与实际技术约束不匹配

- **问题描述**：§11.3 推荐方案采用"直接调用 `GET /api/articles`（取 pageSize=100），在本地进行标题/标签关键词匹配"。经代码验证，后端 `parsePagination`（`server/utils/pagination.js:9`）已将 `pageSize` 上限钳制为 100（`if (pageSize > 100) pageSize = 100`），即单次 API 调用最多返回 100 条。报告将"适用条件"设为"文章总量 < 200 条"（第 698 行），但当文章量为 150 条时，单次 pageSize=100 的调用将漏掉 50 条文章，搜索结果为不全集。实际安全阈值为 ≤ 100 条（单页全覆盖），100-200 条区间需至少 2 次分页拉取。此外，第 688 行将文章量级预估为"上线初期 < 100 条"，此预估值与后端容量限制刚好相同，但未在"适用条件"中与上限形成显式关联。
- **所在位置**：§11.3 第 690-698 行（搜索方案 API 策略与适用条件）、§12 C2 第 755 行
- **严重程度**：低
- **改进建议**：
  1. 将适用条件修正为：≤ 100 条文章时单页全覆盖；100-200 条时需 2 页分页拉取（pageSize=100, page=1+2）；> 200 条时升级为后端搜索
  2. 在 C2 工作量的 1.0d 估算中明确是否已包含分页拉取逻辑（当前描述"取 pageSize=100"暗示单页，若需 2 页拉取应追加 0.1-0.2d）

### 问题 4：A7 Markdown 渲染统一化未验证 DOMPurify 配置一致性

- **问题描述**：§12 A7（第 734 行）要求将 5 个页面的内联 `marked.parse() + DOMPurify.sanitize()` 替换为 `useMarkdown.ts` 的 `renderMarkdown()` 调用。报告仅提及 `renderMarkdown()` 额外注入链接安全属性（`rel="noopener noreferrer"`），但未验证 `useMarkdown.ts` 使用的 `sanitizeHtml()` 白名单配置（`utils/sanitize.ts` 的 `ALLOWED_TAGS` / `ALLOWED_ATTR` / `FORBID_TAGS` / `FORBID_ATTR`）与各页面内联 DOMPurify 调用的配置是否一致。经代码验证确认差异实际存在：6 个页面（DoctorChatView、ArticleDetailView、Admin、HealthAdvice、AiChatDialog、Risk）的内联调用均使用 `DOMPurify.sanitize(html)` 无配置参数（使用 DOMPurify 默认允许策略——更为宽松），而 `sanitizeHtml()` 使用显式白名单（ALLOWED_TAGS/ALLOWED_ATTR——更为严格）。由于 WhiteList 标签覆盖 Markdown 标准输出（h1-h6, p, ul/ol/li, code, pre, blockquote, a, img, em, strong, table, thead, tbody, tr, th, td, hr, br），实际内容剥离风险极低。但两个关键差异需注意：**(a)** `sanitizeHtml()` 的 `ALLOWED_ATTR` 仅包含 `['href','title','rel','alt','src','width','height','class','style','target']`，默认 DOMPurify 可允许更多属性——若某些 Markdown 插件额外生成 `data-*` 属性，替换后将被剥离；**(b)** `sanitizeHtml()` 的 `ALLOWED_URI_REGEXP` 允许绝对路径，是自定义正则，与 DOMPurify 默认 URI 校验范围不完全一致。
- **所在位置**：§12 Group A，A7 第 734 行
- **严重程度**：低
- **改进建议**：
  1. 逐页对比 5 个页面内联 DOMPurify 调用与 `sanitizeHtml()` 的配置差异（已在本报告中完成 DoctorChatView 的验证作为示例）
  2. 在 A7 任务说明中补充配置对比 checklist，或建议替换前在每个页面执行一次冒烟测试（当前已提及冒烟测试但未具体到 DOMPurify 配置验证）
  3. 若发现差异，在任务中列出需同步更新的 sanitize.ts 白名单项

### 问题 5：B1 注册任务 authStore 集成描述不精确，可能导致实现歧义

- **问题描述**：§11.2 第 661 行 B1 行描述为"注册操作仅需存储后端返回的 token/role/user，不涉及 JWT 解析"，但在同一段的方案描述中使用"authStore.login 兼容该响应结构"作为辅助说明。经代码验证，`authStore.login()`（`authStore.ts:131-140`）执行 `const data = res.data.data; setAuth(data.token, data.role, data.user)` 完整登录流程；而注册的正确实现应为：调用 `api.post('/auth/register', ...)` → 提取 `res.data.data` → 调用 `authStore.setAuth(data.token, data.role, data.user)`（不调用 `login()`，因为注册无需提交用户名密码到 `/auth/login`）。两种路径的最终状态（token/role/user 被写入 sessionStorage + BroadcastChannel 广播）相同，但若执行者按字面理解"兼容 login 的响应结构即为可直接调用 login()"会走错误路径。§12 B1 第 744 行已正确描述为"注册成功自动登录（authStore.setAuth）"，与 §11.2 的措辞差异可能造成跨节引用时的混淆。
- **所在位置**：§11.2 第 661 行 vs §12 B1 第 744 行（两处描述一致但"authStore.login 兼容该响应结构"的表述可能产生歧义）
- **严重程度**：低
- **改进建议**：将 §11.2 中"authStore.login 兼容该响应结构"替换为更精确的表述，如"注册响应结构与登录一致（均为 `{token, role, user}`），注册成功后直接调用 `authStore.setAuth()` 完成登录态初始化"，消除"login"一词可能导致的歧义。§12 B1 的描述已经准确，可保留不动。

### 问题 6：并行分组中 B1（注册）与 Phase 1 的时序关系未明确

- **问题描述**：§12 第 847 行将 B1 放在 Phase 2，但 B1 任务说明（第 744 行）明确标注"不依赖 A2/A4/A5"，即不依赖任何 Phase 1（Group A）的产出。从依赖图看，B1 完全可以在 Phase 1 期间并行启动，理论上可将 Phase 2 最长时间路径从 2.4d（人2 路径）缩短（若将 B1 挪至 Phase 1 与人同做，Phase 2 的最长路径将降为 max(1.5, 1.4, 2.0) = 2.0d，总工期从 3.0d 降至 2.6d）。当然，报告将 B1 放在 Phase 2 可能是基于组织清晰度（"Phase 1 = 基础设施，Phase 2 = 功能"），但作为并行开发规划，未提及此优化可能和执行者自行优化的方向。
- **所在位置**：§12 第 847 行（Phase 划分）、第 744 行（B1 依赖声明）
- **严重程度**：低
- **改进建议**：在 §12 调度说明中增加一句：B1 不依赖 Group A，若有人力富余可在 Phase 1 期间并行启动以缩短总工期（工期优化约 0.4d）。具体是否执行由团队根据实际人力情况决定。注意 B1 若提前完成，Login.vue 文件改动需在 Phase 2 其他修改 Login.vue 的任务（如注册功能后续迭代）启动前合并，避免冲突。

### 问题 7：诊断报告 §4.2 chatStore state 字段命名与代码不一致

- **问题描述**：诊断报告 §4.2 设计要求的 state 字段表中将消息列表列名为 `messages | Message[]（对话消息列表）`，但经代码验证，`chatStore.ts:11` 中实际使用的字段名为 `const conversations = ref<ChatMessage[]>([])`。两者语义均表示"对话消息列表"，功能等价，但字段名不一致。此差异不影响功能分析但可能导致执行者在阅读报告后查找代码时代码定位错误（搜索 `messages` 但实际代码使用 `conversations`）。
- **所在位置**：诊断报告 §4.2 第 133 行
- **严重程度**：低
- **改进建议**：将诊断报告 §4.2 设计要求的 `messages` 字段名修正为 `conversations`，或增加备注说明设计与代码的命名差异。

### 问题 8：§14 优先级排序存在若干待商榷项

- **问题描述**：任务描述要求从可操作性视角评估"优先级排序是否合理"。诊断报告 §14 定义了 P0/P1/P2/P3 四级优先级，经审查发现以下可商榷之处：

  **(a) "编辑资料"列为 P2 但其入口已用户可见**：`Profile.vue` 菜单中已渲染"编辑资料"入口（`Profile.vue:108-109`），用户点击后收到"编辑资料功能开发中" Toast——符合 P1 定义"可通过界面入口直接感知功能不可用"。同列 P2 的"Admin.vue SSE 重复"、"sendAdminChatMessage 重复定义"等为纯代码层面问题（用户不可感知），"编辑资料"对用户体验的影响显著高于这些项。建议将编辑资料提升为 P1。

  **(b) "会话历史加载"列为 P1 依据不足**：当前 DoctorChatView 不具备"加载历史消息"交互入口——用户进入医生对话页后仅看到新对话界面，无任何按钮或提示指向"加载历史"。与搜索功能（Home.vue 首页搜索栏已渲染）不同，会话历史加载对用户完全不可见——用户不知道历史上存在过与同一医生的对话。若交互 UI（"加载历史消息"按钮）需随 D1 任务一并开发，则 UI 入口尚未出现时功能不可感知。若 UI 已存在（如对话页面顶部有历史消息区域），则符合 P1。应补充证据或调整为 P2 并备注升级条件。

  **(c) P3 项"免责声明拒绝行为修复"与更高优先级任务无依赖关系**：该任务独立可执行（仅修改 `router/index.ts:137` 一行），不阻塞任何 P0/P1/P2 任务。当前列为 P3 合理。P3 中"helpers.ts"和"models.ts"同样无阻塞关系，列为 P3 合理。

  **(d) P0 与 P1 边界**：P0 两项（用户注册功能缺失、文章收藏占位）均直接影响用户完成核心任务——注册功能缺失阻断新用户使用系统，文章收藏占位阻断内容用户的常规操作。P1 项（搜索、JWT 过期检测、会话历史加载）当前用户可见但存在兜底或替代路径。P0/P1 边界清晰、定义一致。

- **所在位置**：诊断报告 §14 第 890-913 行
- **严重程度**：中（优先级排序直接决定开发团队执行顺序）
- **改进建议**：
  1. 将"编辑资料"提升为 P1（理由：Profile.vue 菜单入口已渲染，用户可感知）
  2. 补充"会话历史加载"的 P1 依据或降级为 P2（说明升级条件为"DoctorChatView 开发历史消息加载 UI 入口后"）
  3. 其他优先级项维持不变

### 问题 9：Group A 任务编号缺失 A9

- **问题描述**：诊断报告 §12 Group A 任务编号从 A1 跳至 A8 后直接到 A10，中间无 A9。§12 推荐执行顺序框图同样跳过 A9。此编号异常虽不影响功能分析，但可能引发执行者困惑（是否遗漏了一个任务？）。
- **所在位置**：§12 第 726-736 行（Group A 任务表）、第 825-834 行（推荐执行顺序框图）
- **严重程度**：低
- **改进建议**：说明 A9 空缺原因（如有意预留未来任务），或将 A10 重新编号为 A9。

### 问题 10：D4 任务过度细分，可合并入 D3

- **问题描述**：D4 定义为移除 `useAdminApi.ts` 中与 `useChatApi.ts` 重复的 `sendAdminChatMessage` 函数，工作量 0.1d。该任务严格依赖 D3（Admin.vue 迁移至 chatStore.sendAdminMessage），且 D3 本身已修改 Admin.vue 的 import 源。D3 开发者在切换 Admin.vue 调用入口时，自然可以在同一 PR 中完成 D4 的清理（删除 useAdminApi.ts 的重复函数），无需独立为一个 0.1d 任务。将 D4 作为独立任务增加了一项目管理开销（依赖跟踪、验收检查点），对工期无实质影响（D4 在 D3 所在的轨道上不增加总路径长度）。若将 D4 并入 D3，D3 工作量从 0.3d 增至 0.4d，人2 路径从 2.4d 变为 2.4d（D4 0.1d 被 D3 0.1d 增量覆盖，路径不变）。
- **所在位置**：§12 Group D 第 766 行（D4）
- **严重程度**：低
- **改进建议**：建议 D4 并入 D3 作为一个 D3 子步骤，标注为"移除 useAdminApi.ts 的 sendAdminChatMessage 死代码"，消除独立任务编号。若保留独立任务，至少说明合并可行性供执行者选择。

### 问题 11：Phase 3（E1）的独立 Phase 划分可能夸大项目工期

- **问题描述**：Phase 3 定义 E1（持久化决策文档归档，0.1d）为独立 Phase。该任务本质为将 §12 E1 决策分析框架中已完成的 5 维度对比分析格式化输出为独立 Markdown 文件——属于纯文档产出，与软件开发工作无直接关系。将其列为独立 Phase 在 3 人方案中形成 3.0d 的总工期，但实际开发工期为 2.9d（Phase 1 0.5d + Phase 2 2.4d）。对于以"开发工时"为口径的估算，3.0d 有 0.1d 的虚增。
- **所在位置**：§12 第 845 行（Phase 3）
- **严重程度**：低
- **改进建议**：将 E1 从 Phase 3 改为 Phase 2 结束后的独立收尾项（不纳入 Phase 工期统计），或明确标注"总开发工期（不含文档归档）= 2.9d"。

---

## 需求响应充分度评价

- **产出物 1（逐模块差距清单）**：覆盖了需求列出的全部 13 个页面组件、7 个复用组件、6 个 Pinia Store（含 3 个设计外扩展）、10 个 composable（含 8 个设计外扩展）、路由、类型、工具层。每个模块列出了设计要求的完整功能点、当前实现状态、具体差距描述。响应充分。
- **产出物 2（并行开发分组）**：提供了基于文件级依赖分析的分组方案（A/B/C/D/E 五组）、分组间依赖链、逐任务工作量估算、人力分配方案、总工期估算。响应充分。
- **约束遵循**：全部差距分析均基于源代码实际内容（有行号引用），非假设性描述。缺失功能、stub/占位实现、设计偏离均已识别。约束满足。

## 深度与完整性评价

- 报告在各模块的功能点级别进行了逐项对比，粒度适中。后端 API 就绪状态经过代码验证（§10.1），为前端开发提供了可靠的前提确认。
- 依赖关系图（§11.1）和待实现功能前置依赖表（§11.2）覆盖全面，为并行分组提供了清晰的架构依据。
- 架构偏离汇总表（§13）给出了每个偏离项的建议决策方向，有助于团队在"对齐设计"与"更新设计"之间选择。
- 除上述问题 1-11 所涉及的可操作性不足外，其余任务描述基本达到执行者可据此开工的水平。

## 优先级排序评价（补充 §14 审查）

| 优先级项 | 当前评级 | 评价 | 建议 |
|---------|:------:|------|------|
| 用户注册功能缺失 | P0 | 合理。注册功能缺失阻断新用户使用系统核心流程，符合 P0 定义。 | 维持 |
| 文章收藏 | P0 | 合理。收藏功能占位，用户可感知不可用，影响内容用户常规操作。 | 维持 |
| 搜索功能 | P1 | 合理。Home.vue 首页搜索栏已渲染，用户点击后收到 Toast 占位提示，符合 P1"用户可感知"定义。当前不搜索不影响核心流程。 | 维持 |
| JWT 过期检测 | P1 | 合理。有 useApi.ts 401 拦截器兜底，但 token 过期到下次 API 调用之间存在认证漏洞窗口。 | 维持 |
| 会话历史加载 | P1 | 依据不足。当前 DoctorChatView 无"加载历史消息"交互入口，用户不可感知此功能缺失。 | 降级为 P2，备注"待历史消息加载 UI 入口开发后升级为 P1" |
| AI 助手导航 | P2 | 合理。经确认 navigate() 无调用方，AI 工作流未集成导航指令，功能不可感知。 | 维持 |
| 编辑资料 | P2 | 评级偏低。Profile.vue 菜单中"编辑资料"入口已渲染，用户点击后收到 Toast 占位提示，符合 P1 定义。 | 提升为 P1（理由：可感知、非核心但有替代需求的用户会被拒绝） |
| Admin.vue SSE 重复 | P2 | 合理。纯代码质量问题，用户不可感知。 | 维持 |
| useAuth/useSSE/useUI composable 补建 | P2 | 合理。基础设施层，为其他功能提供支撑。 | 维持 |
| Markdown 渲染统一化 | P2 | 合理。纯代码质量/安全加固，用户不可感知。 | 维持 |
| sendAdminChatMessage 重复定义 | P2 | 合理。纯代码质量问题。 | 维持 |
| 免责声明拒绝行为修复 | P3 | 合理。独立修复，不影响其他任务。 | 维持 |
| helpers.ts | P3 | 合理。纯代码重构。 | 维持 |
| models.ts | P3 | 合理。纯文件拆分。 | 维持 |

---

## 修订说明（v2）

| 质询意见 | 回应 |
|---------|------|
| **问题1 字段名证据充分性**：质询称审查报告使用的 `chatStore.conversations` 与诊断报告 §4.2 的 `messages` 不一致，可能误导执行者。 | 质询不成立。经代码验证，`chatStore.ts:11` 中存储消息列表的 state 字段实际名称为 `const conversations = ref<ChatMessage[]>([])`，审查报告使用的字段名与代码一致。诊断报告 §4.2 将设计要求的该字段列名为 `messages`，与代码实际使用的 `conversations` 存在命名偏差。**新增发现**：此不一致构成诊断报告自身的事实偏差（§4.2 第 133 行），已作为新问题 7 纳入本报告。审查报告问题 1 关于 Admin.vue 迁移复杂度的核心论证——Admin.vue 使用本地 `messages`（`Admin.vue:22`）而 chatStore 使用全局 `conversations`（`chatStore.ts:11`）且多模式共享——仍成立。 |
| **问题1 补充验证**：Admin.vue 本地 state 经代码确认 | 经代码验证确认：Admin.vue 仍使用本地 `const messages = ref<ChatMessage[]>([])`（`Admin.vue:22`）和本地 `const isStreaming = ref(false)`（`Admin.vue:24`），chatStore.sendAdminMessage 将消息推入全局 `conversations`（`chatStore.ts:11`）。D3 迁移涉及从本地 state 到 Store 级 state 的数据源切换，复杂度不可简化。审查报告问题 1 维持原严重度（中）和原改进建议。 |
| **问题4 质询（A7 DOMPurify 纯推测）**：质询称问题 4 完全基于推测（"若白名单存在差异"），未实际对比任何页面内联 DOMPurify 调用与 sanitizeHtml() 配置差异，降低了审查报告可信度。 | 接受质询——审查报告 v1 的问题 4 论证的确仅基于推测。已通过代码验证补充证据：6 个页面的内联调用均为 `DOMPurify.sanitize(html)` 无配置参数，`sanitizeHtml()` 使用显式白名单（ALLOWED_TAGS/ALLOWED_ATTR/ALLOWED_URI_REGEXP/FORBID_TAGS/FORBID_ATTR）。差异真实存在——`sanitizeHtml()` 比默认 `DOMPurify.sanitize()` 更严格。但由于内容均为 Markdown 解析输出（仅产生白名单内标签），实际内容剥离风险极低。**问题 4 严重度维持低**，描述已更新为含代码验证证据。 |
| **问题2 质询（C1 判定强度与证据深度不匹配）**：质询称 §11.2 第 662 行使用的"stateful composable"术语及"内建 reactive collectedMap"描述可解读为模块级共享状态——若 collectedMap 定义于 export function 体外即为单例。审查报告"不足以让执行者选择正确实现"的判定可能过强。 | 接受质询。经重新审视，诊断报告描述已隐含模块级单例方向，且当前 `useArticleApi.ts` 中已有函数定义于模块顶层的先例模式。审查报告原始措辞过强。**问题 2 严重度从中降级为低**，问题描述中增加后注说明正确实现方向已隐含在描述中，改进建议修改为强调确认 collectedMap 定义于 export function 体外即可。 |
| **遗漏评估维度**：质询称审查报告完全未评估诊断报告的优先级排序是否合理，但任务描述明确要求从可操作性视角评估"优先级排序是否合理"。 | 完全接受。**新增问题 8**（§14 优先级排序评估），逐项检查 P0/P1/P2/P3 四级排序，发现：(a) 编辑资料应提升为 P1（Profile.vue 菜单入口已渲染）；(b) 会话历史加载 P1 依据不足（用户不可感知，无交互入口）；(c) P3 项无阻塞关系，维持合理；(d) P0/P1 边界清晰一致。新增「优先级排序评价」章节汇总评估结果。 |
| **A9 编号空缺 & 覆盖遗漏**：质询称审查报告未指出 Group A 任务编号从 A8 跳至 A10（无 A9），可能引发执行者困惑。 | 接受。**新增问题 9**，指出编号异常并建议说明原因或重新编号。 |
| **D4 合并可行性 & 覆盖遗漏**：质询称审查报告未评估 D4 并入 D3 的可行性（两者同为同一开发者在 admin 相关代码上的连续操作）。 | 接受。**新增问题 10**，分析 D4 并入 D3 的可行性（D4 为 D3 的自然后续清理步骤，可合并不影响总路径长度），建议将 D4 作为 D3 子步骤或标注合并可行性。 |
| **Phase 3（E1）实际意义 & 覆盖遗漏**：质询称 Phase 3 的 E1（0.1d 文档归档）与开发工作无直接关系，列为独立 Phase 夸大总工期。 | 接受。**新增问题 11**，分析 E1 的 Phase 独立划分导致总工期虚增 0.1d（3.0d vs 实际开发 2.9d），建议将 E1 改为 Phase 2 收尾项或明确标注"开发工期不含文档归档"。 |
| **问题6 工期优化分析成本侧不完整**：质询称审查报告虽提出 B1 前移 Phase 1 可缩短工期 0.4d，但未分析人力分配变化对 Phase 1 其他并行任务的影响。 | 接受部分。问题6 改进建议已包含"具体是否执行由团队根据实际人力情况决定"的审慎措辞。补充说明：若 3 人团队中抽取 1 人做 B1（1.0d），Phase 1 期间该人最多贡献 0.5d 的 B1 进度，剩余 0.5d 需带入 Phase 2。但 B1 无前置依赖，可灵活拆分（Phase 1 完成 UI 框架 + Phase 2 完成表单逻辑）。人力分配的具体影响取决于团队实际人员配置，本报告不强制预判。问题 6 建议维持原表述。 |
