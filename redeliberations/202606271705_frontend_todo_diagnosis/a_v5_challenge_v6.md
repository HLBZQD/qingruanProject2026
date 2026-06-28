# 诊断质询报告（v6）

## 质询结果

CHALLENGED

## 逐维度审查

### 1. 证据充分性

**[通过]** S1-S13 各项均引用了具体的设计文档行号和代码文件行号，代码证据与诊断结论一致。经实际读取 `src/views/Consultation.vue`（7行占位）、`src/stores/chatStore.ts`（13行骨架）、`src/types/sse.ts`（4个接口定义）确认，v6 对 S5b 的代码状态描述准确。

**[通过]** G14 受影响文件清单（3个 API composable 文件，10个函数）经实际读取 `src/composables/useHomeApi.ts` 验证，函数列表和行号均准确。

**[通过]** S5a 对 `Article` 类型不含 `content` 字段的判断经实际读取 `src/types/api.ts:124-139` 验证，确认类型仅含 `summary` 字段而无正文 `content`/`body`。

**[问题-严重]** S5b-1 修复建议推荐使用 `EventSource` API（`new EventSource(url)`）实现 SSE 连接管理，但该技术选型与项目设计文档明确规定的方案矛盾。经查阅项目文档：(1) `docs/1_requirements_analysis_v1.md` 第15.2节（第1401-1407行）将"推荐使用 EventSource API"标记为**严重审查问题**，明确指出"EventSource 不支持自定义 HTTP 头，无法携带 JWT Token 以通过认证"，修订后统一为 `fetch + ReadableStream`；(2) `docs/1_requirements_analysis_v2.md` 第989行再次强调"不使用 EventSource API"；(3) `docs/2_detailed_design_v3.md` 第2373行、第3543-3546行、第3841行在 Consultation.vue 流程图中全部使用 `fetch POST` + `ReadableStream` 方式消费 SSE 流，无一处使用 EventSource。诊断报告推荐的 `new EventSource(url)` 方案因无法附加 `Authorization: Bearer <token>` 请求头，将导致 SSE 连接认证失败——这是已被项目历史审查识别并修正过的技术错误。

诊断报告在 S5b-1 边界条件中甚至考虑了"浏览器不支持 EventSource 时降级为轮询"——这表明诊断对 SSE 实现方案的理解停留在浏览器原生 API 层面，未验证项目实际需要的认证 SSE 场景对传输层的要求，也未查阅项目设计文档中已有的 SSE 实现规范。

**[问题-一般]** S5a 降级方案（第132行）建议使用 `getArticles()` 全量拉取后在客户端 `find()` 筛选。经实际读取 `src/composables/useHomeApi.ts` 确认，`getArticles(params: ArticlesParams = {})` 使用 `PagedBody<Article>` 类型（第17-22行），调用 `api.get<PagedBody<Article>>('/articles', { params })`（第47-48行），属于分页 API——其返回类型包含 `pagination: PaginationInfo`（第20行）。诊断报告未验证 `getArticles()` 在无 `page`/`pageSize` 参数时的后端行为：是返回全部文章（不限分页）还是返回默认首页（如 page=1, pageSize=10）。若是后者，客户端 `find()` 仅搜索首页数据，目标文章若不在首页则查找失败，降级方案不可用。此假设未经验证，导致降级方案的可行性评估缺乏依据。

**[问题-一般]** G18 修复建议推荐将 requestId 快照模式扩展到 `homeStore.fetchHomeData()`（第584行）。经实际读取 `src/stores/homeStore.ts:44-48` 确认，`fetchHomeData()` 使用 `Promise.allSettled` 并行发起 3 个请求（getDoctors / getArticles / getDiabetesTypes）。现有 punchStore 的 requestId 模式为顺序调用场景设计——函数入口递增 `requestId`，每个 async 调用捕获快照，await 返回后比较快照判定是否丢弃。但 `Promise.allSettled` 中 3 个请求共享同一次 `requestId++` 递增，无法区分"哪个并行请求的响应是过期的"——3 个请求要么全丢弃要么全保留。诊断报告提到使用"page instance token"作为替代方案，但未说明其与 requestId 快照模式在并行场景下的机制差异，也未给出具体实现路径。此证据缺口意味着 `homeStore.fetchHomeData()` 的竞态保护方案实际不可操作。

**[问题-轻微]** S5b-1 的技术可行性评估（第5节第740行）将 SSE 核心实现描述为"需从头构建：EventSource连接管理、消息收发、断线重连（指数退避）"，但未查阅或引用项目设计文档中已有的 SSE 实现规范（`fetch + ReadableStream` 逐块解析、按 `\n\n` 分隔事件块、`data: ` 前缀去除）。诊断报告中的 SSE 实现方案（EventSource）与项目已确立的技术规范不一致，导致 S5b-1 的复杂度评估（"高"）虽然结论正确，但依据的技术路径是错误的。

### 2. 逻辑完整性

**[通过]** 根因1-6 的因果链整体完整。v6 修正了根因2中 Consultation.vue 占位状态的分析，补充了"入口页占位→用户无导航入口"这一关键逻辑环节。

**[通过]** 8.3(e) 交互风险分析经过 v4/v5 多轮修正，交互C（G7↔G14）经源代码验证（Punch.vue 模板 v-if/v-else-if 互斥链）后因果逻辑已修正，当前版本准确。

**[通过]** 跨页面数据流完整性分析（6.1节）准确识别了3条数据传递路径中2条断裂的问题。

**[问题-轻微]** P2 优先级层与 P1 批处理组之间存在未解决的依赖矛盾（第883-888行）。S9（fetchAnalysis 竞态保护，定级 P2）被明确标注为 S3/S7 P1 批处理组的前置依赖（S7 修复建议第187行明确要求"需与 S9 竞态保护同步修复"）。诊断报告在 P2 层内部排序中建议 S9 最先执行以"解除 S3/S7 P1 批处理组对 fetchAnalysis 竞态保护的隐式依赖"，同时给出了"上调至 P1"的替代建议。但最终优先级表中 S9 仍留在 P2，S3/S7 仍在 P1——这两个决策之间的矛盾未做最终裁决。修复者面对此表无法直接获取明确的执行顺序指令：若严格按优先级排序（P1 先于 P2），S3/S7 将在其前置依赖 S9 就绪前执行；若按依赖关系排序（S9 先于 S3/S7），则优先级标签失去指导意义。

**[问题-轻微]** S5a 诊断中存在未分析的设计意图与 API 类型约束之间的张力。设计文档 1.6.1 节路由映射表要求 `/news/article/:id → ArticleDetailView.vue`，暗示文章详情页应包含完整正文内容。但 `Article` 类型（api.ts:124-139）不含 `content`/`body` 字段，仅含 `summary`。诊断报告正确指出了这一类型约束（第125行），但未进一步分析：设计文档是否预期了独立的文章详情 API（返回含 `content` 的扩展类型，如 `ArticleDetail extends Article { content: string }`），还是设计文档撰写时未考虑类型约束。此分析缺口导致无法判断 S5a 的修复工作是否仅限前端（后端文章详情 API 已就绪）还是涉及前后端联调（需新增后端接口）。

### 3. 覆盖完备性

**[通过]** 42项 todo 问题（S1-S13, G1-G29）逐项诊断完备，无遗漏。

**[通过]** 任务描述要求的四个维度（设计一致性、技术可行性、逻辑完整性、内部一致性）均已覆盖。

**[通过]** 6个根因的识别覆盖了全部42个问题的归类，根因到问题映射表完整。

**[通过]** 修复优先级排序涵盖全部42项，批处理组标注合理，行动类型区分清晰（代码修复/设计文档更新/仅确认/代码修复-设计确认）。

## 质询要点

### 质询要点1: S5b-1 修复建议推荐 EventSource API 与项目设计文档规定的 fetch+ReadableStream 方案矛盾（严重）

- **问题**：S5b-1 修复建议（第145行）推荐使用 `new EventSource(url)` 实现 SSE 连接管理，但项目设计文档（`docs/1_requirements_analysis_v1.md` 第15.2节、`docs/1_requirements_analysis_v2.md` 第989行、`docs/2_detailed_design_v3.md` 第2373/3543-3546行）已明确排除 EventSource API——原因是非认证 SSE 端点需要 JWT Token 通过自定义 HTTP 头携带，而 EventSource API 不支持自定义请求头。项目历史审查（第6轮严重问题2）已将"推荐使用 EventSource API"定性为严重技术错误并修正为 `fetch + ReadableStream`。

- **原因**：此问题直接影响 S5b-1 的修复可行性——若修复者按诊断报告建议使用 EventSource 实现 SSE 连接，将因无法附加 `Authorization: Bearer <token>` 请求头而导致所有 SSE 连接认证失败，整个 chatStore SSE 核心实现需要推倒重来。此外，诊断报告的 S5b-1 复杂度评估（"高"）虽然定性结论正确，但依据的技术路径（EventSource + 断线重连指数退避）与项目实际需要的技术路径（fetch + ReadableStream + 按 `\n\n` 分隔事件块 + `data: ` 前缀去除）不同，两种方案的重连策略、错误处理、流解析逻辑均有差异，可能导致修复者对工作量的判断偏差。

- **建议方向**：
  1. 查阅 `docs/1_requirements_analysis_v2.md` 第989-1007行（SSE 代理转发策略 + ReadableStream 消费规范）和 `docs/2_detailed_design_v3.md` 第2373行（fetch ReadableStream 按 `\n\n` 分隔事件块），将 S5b-1 修复建议中的 SSE 实现方案从 EventSource 修正为 `fetch + ReadableStream`
  2. 参考 `docs/2_detailed_design_v3.md` 第5480行（Express 代理层 SSE 透传策略）确认后端 SSE 端点路径为 `POST /api/chat/doctor/:id`
  3. S5b-1 边界条件中的"浏览器不支持 EventSource 时降级为轮询"应修正为"fetch API 在所有现代浏览器中均可用（包括移动端），无需降级；网络中断时的重连策略使用 fetch 重试 + 指数退避"
  4. 在 S5b-1 修复建议中补充 fetch+ReadableStream 的具体实现指引：请求头携带 `Authorization: Bearer ${token}` + `Content-Type: application/json`；请求体携带 `message` 和 `conversation_id`；ReadableStream 消费循环按 `\n\n` 分隔 SSE 事件块，每行去除 `data: ` 前缀后 `JSON.parse` 解析；`event: "message_end"` 标记流结束

### 质询要点2: S5a 降级方案未验证 `getArticles()` 的全量返回行为（一般）

- **问题**：S5a 修复建议中的降级方案（第132行）假设 `getArticles()` 在无分页参数时返回全部文章，然后客户端 `find(a => a.id === id)` 筛选。经实际读取 `src/composables/useHomeApi.ts` 确认，(1) `getArticles(params: ArticlesParams = {})` 的类型签名为 `Promise<Article[]>`（仅返回数组，丢弃 pagination 元数据）；(2) 内部调用 `api.get<PagedBody<Article>>('/articles', { params })`，响应类型明确包含 `pagination: PaginationInfo`；(3) API 注释标注为"GET /api/articles（分页 + 分类筛选）"。因此 `getArticles()` 是分页 API，诊断报告未验证后端在 `page`/`pageSize` 参数缺失时的默认行为。

- **原因**：降级方案的可行性取决于后端行为：若后端在无分页参数时返回全部文章（不限分页），降级方案有效；若后端使用默认分页（如 `page=1, pageSize=10`），则 `find()` 仅搜索首页数据，目标文章若在 page>1 则查找失败。此假设未经验证，导致降级方案的"可用性"评估和复杂度评估（"中"）可能过于乐观。

- **建议方向**：
  1. 查阅 `docs/2_detailed_design_v3.md` 第 3.2.19 节（文章列表接口规范）确认 `GET /api/articles` 在无分页参数时的行为
  2. 若后端默认分页，降级方案需修正为：分页循环拉取全量文章后再 `find()`，或以"当前文章不在首页数据中"为由标注降级方案不可行
  3. 在修复建议中明确标注该假设为待验证项，而非作为确定可用的降级路径呈现

### 质询要点3: G18 requestId 快照扩展至 `homeStore.fetchHomeData()` 的并行场景适配未说明（一般）

- **问题**：G18 修复建议（第584行）要求将 requestId 快照模式扩展到 `homeStore.fetchHomeData()`。经实际读取 `src/stores/homeStore.ts:44-48`，该函数使用 `Promise.allSettled` 并行执行 3 个异步请求（getDoctors / getArticles / getDiabetesTypes）。现有 punchStore 的 requestId 模式为顺序调用设计——函数入口 `requestId.value++` 一次，每个 async 调用各自捕获快照后 await。在 `Promise.allSettled` 场景下，3 个请求共享同一次递增产生的 requestId 值，且 3 个 Promise 同时发出——如果函数被快速重复调用（如组件快速挂载卸载再挂载），第二次调用的 requestId 递增后，第一次调用的 3 个并行请求全部变为过期快照，无法精确区分"3 个请求中哪个已完成、哪个仍在进行"的状态。诊断报告虽提到"page instance token"，但未解释其与 requestId 的机制差异及并行场景下的适配方式。

- **原因**：此缺口意味着 `homeStore.fetchHomeData()` 的竞态保护方案仅给出了方向（"需要竞态保护"），未给出可操作的实现路径。修复者无法据此直接实施，需自行设计并行场景的竞态保护机制。诊断结论"G18 需补充保护 homeStore 和 lifePlanStore"本身正确，但实施路径的证据链不完整。

- **建议方向**：
  1. 分析 `Promise.allSettled` 并行场景下的竞态保护需求：是整体丢弃（一个 page instance token 控制三个请求全部丢弃）还是逐请求丢弃（每个子请求独立 requestId）
  2. 若采用整体丢弃（推荐，因为三个请求是同一次页面加载的原子操作），明确"page instance token"的实现：`const pageToken = ++pageInstanceId`，三个请求完成后各自检查 `if (pageToken !== pageInstanceId) return` 丢弃结果
  3. 若采用逐请求丢弃，说明为何需要更细粒度控制（如单个请求重试场景）

