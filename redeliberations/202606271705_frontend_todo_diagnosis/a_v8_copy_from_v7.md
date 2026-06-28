# 前端代码审查问题诊断报告 v13

> **诊断对象**: `reviews/202606271219_frontend_review/todo.md`（42项问题，13严重 + 29一般）
> **诊断基线**: `docs/2_detailed_design_v3.md`
> **诊断范围**: Home.vue、LifePlan.vue、Punch.vue 及关联 Store/API/类型/路由文件
> **诊断日期**: 2026-06-27
> **版本**: v13（修订版，响应第7轮审查反馈——含 G11 精确行号修正、G24 动画效果差异分析、S8 跨标签页 UX 退化量化及 BC 升级为强建议、G14 两阶段部署期间受影响 UI 路径及决策树、P4 层内部排序建议、工时汇总交叉引用说明等 6 项修订）
>
> **诊断范围声明**: 本报告以 `todo.md` 的42项问题为输入范围，对其中每个问题进行定位诊断——追溯根因、确认代码与设计文档的符合性、给出修复建议。本报告并非对项目全部代码进行独立的设计合规审计：设计文档明确要求但 todo.md 未涵盖的问题（如 News.vue 的 sessionStorage 缓存要求——设计文档第3483行、Risk.vue 的 sessionStorage 表单缓存等）不在本次诊断范围内。若团队需要对设计文档进行全面的合规性审计，建议另启独立的审查流程，以设计文档为基线逐模块交叉核验代码实现。
>
> **策略声明——低危代码质量条目的分析深度边界**: 本报告对全部42项问题的诊断深度按影响面分层。S1-S13及G14等中高危条目（影响功能正确性/安全/核心体验）获得逐函数修改清单、边界条件枚举、验证方法和副作用分析的完整诊断覆盖。G19-G23、G25-G29等15个P4级低危条目（纯代码风格/可维护性/组织规范问题，不产生功能缺陷）的诊断聚焦于问题识别与定位——修复建议给出修改方向和关键约束，但不逐项展开至"修改哪个文件的哪个函数"粒度。此差异是有意的分层策略，而非诊断覆盖遗漏：低危条目的修复属于代码组织迭代，具体实现细节（如重命名涉及的所有调用点、extract method 后 import 路径更新）高度依赖修复时的代码上下文，由修复者在编码时自行决定比诊断阶段提前锁定所有细节更高效。各条目修复建议中已给出的修改方向足以支撑修复者做出实现决策。
>
> **设计文档行号引用说明**: 本报告全文约60+处引用设计文档 `docs/2_detailed_design_v3.md` 的具体行号作为证据。引用格式优先使用"章节号+小节标题（行号）"作为主要标识，行号作为辅助定位信息。**注意：行号基于当前版本（2026-06-27）的设计文档快照，设计文档后续修订后行号可能发生漂移。** 建议修复者和后续读者以章节号/小节标题为稳定引用依据——即使行号因插入/删除内容而偏移，章节号和小节标题的语义定位不变。若行号已失效，可在设计文档中搜索对应章节标题重新定位。**已针对 2026-06-27 快照完成关键行号抽查验证——S 类条目 9 处（S1 第3474/3466/3504行、S2 第3482行、S3 第3779行、S4 第107/3725行、S5a 第432/2051行）及 G 类条目 3 处（G3 第3797行"完成率环形图 近7天趋势柱状图"、G6 第3298行"btn-refresh 刷新按钮"、G1 第3074行"empty-state 类名"），共计 12 处关键引用，确认全部与当前设计文档快照一致，引用有效。**

---

## 1. 诊断概述

对42项待办问题的逐项诊断结果：

| 诊断结论 | 严重问题 | 一般问题 | 合计 |
|---------|:------:|:------:|:---:|
| 确认（代码偏离设计） | 11 | 26 | 37 |
| 设计对齐（代码符合设计，但设计本身或观察成立） | 2 | 0 | 2 |
| 部分确认（问题存在但结论有细化空间） | 0 | 2 | 2 |
| 不成立（代码实现优于设计规定，无需修改代码） | 0 | 1 | 1 |

> **注（v5修正）**: G5（LifePlan打卡弹窗交互顺序）诊断结论为"不成立——代码实现优于设计文档规定"，仅需设计文档更新。无需代码修改的条目共计4项（G4、G5、S12、S13），详见各条目。"不成立"行仅计入结论标签为"不成立"的条目（G5）。v4 中"设计对齐"行标注为"3严重+1一般=4"，经逐项核对13个严重问题的头部诊断标签，仅S8和S13为"设计对齐"（2项），非3项；一般问题中G4头部标签为"部分确认"而非"设计对齐"。v5 将G4从原归类调整至"部分确认"行（2项含G4），"设计对齐"行修正为2严重+0一般=2。S12 标签为"确认"（问题存在但无需代码修改，数据一致性由后端保证），维持"确认"行统计。

核心根因：本轮前端实现（Task1-3）在数据缓存、路由完整性、跨模块数据传递三个维度上存在系统性的设计合规性偏差，根源在于实现阶段未逐项对齐设计文档4.2/4.3/1.6.1节的明确要求。

### 1.1 诊断定级与原始 todo.md 定级差异说明

经核实，todo.md 中13个"严重"问题有10个在本报告中被重新定级。差异原因如下：todo.md 使用统一的二元定级（严重/一般），而本报告在前端问题严重程度上采用了更细化的分层标准——将"影响功能可用性"和"安全风险"视为严重，将"功能偏差但可降级运行"和"设计内部矛盾"调整至中危或低危。具体差异及理由：

| 问题 | todo.md | 本报告 | 重新定级理由 |
|------|---------|--------|-------------|
| S3 | 严重 | 中 | 缺失默认日期不影响功能可用性——用户可手动选择日期，列表仍正常加载。属体验偏差而非功能阻断。 |
| S4 | 严重 | 中 | LifePlan 可独立运行（表单预填仍有效），缺失 result 仅损失了个性化上下文提示，非功能阻断。 |
| S6 | 严重 | 中 | 文章跳转目标偏离——用户仍可进入资讯列表页浏览文章，功能降级但未完全不可用。 |
| S7 | 严重 | 中 | 日期变更不重拉分析——当前分析仍展示整体统计数据，偏差在于分析范围与列表范围可能不一致，但分析功能本身正常工作。 |
| S8 | 严重 | 中 | Token 存储方式为设计决策层面的安全问题（设计文档明确选择 localStorage），代码严格遵循设计。安全风险客观存在但非实现偏差。修复需设计层面决策。 |
| S9 | 严重 | 中 | 竞态条件触发概率低（需快速切换筛选/重进页面），且同文件内 `fetchList`/`loadMore` 已有防竞态，`fetchAnalysis` 遗漏属同一模式的不完整应用。 |
| S10 | 严重 | 中 | DOMPurify 默认配置对常规 HTML 注入已有良好防护，ALLOWED_TAGS 缺失属于安全加固层面而非立即可利用的漏洞。 |
| S11 | 严重 | 低 | diabetesType query 参数仅影响展示提示条的完整性，不影响 LifePlan 核心功能。Risk.vue 传递了参数，LifePlan 可后续补充消费。 |
| S12 | 严重 | 低 | 两条打卡路径间的一致性由后端 API 契约保证，前端无需要修改的代码缺陷。是设计选择问题而非代码错误。 |
| S13 | 严重 | 低 | 路由守卫策略完全符合设计文档（Punch 在设计文档的路由守卫示例中未设置 requiresDisclaimer）。内部矛盾存在于设计文档层面，非代码偏差。 |

**对比总结**: 13个原始严重问题中，3个（S1/S2/S5）在本报告中维持高严重度，10个因上述理由被调整至中危或低危。修复者应以本报告的定级为修复优先级依据——本报告按功能影响面分层，todo.md 按审查发现来源分层。

---

## 2. 严重问题逐项诊断

### S1. Home.vue 缺失 sessionStorage 缓存机制（1小时过期）

- **诊断结论**: **确认 — 代码偏离设计**
- **严重程度**: 高（与 todo.md 一致）
- **设计依据**:
  - 4.2节状态管理表（第3474行）：`Home.vue | sessionStorage | 数据缓存 (含时间戳, 1小时过期)`
  - 4.2节架构说明（第3466行）：`sessionStorage: 用于页面级临时缓存场景——Home.vue 数据缓存（1小时过期）`
  - 4.3节Home.vue流程图（第3504行）：`页面加载 → 检查sessionStorage缓存 1小时有效期 → 缓存命中 → 直接渲染`
- **代码证据**: `src/stores/homeStore.ts:38-58` — `fetchHomeData()` 直接执行 `Promise.allSettled` 并行调用三个API，不存在任何 sessionStorage 的 `getItem`/`setItem` 逻辑；`src/views/Home.vue:158` — `onMounted` 直接调用 `homeStore.fetchHomeData()`，无缓存检查。
- **因果链**: 设计文档将 Home.vue 数据缓存列为 sessionStorage 四个页面级缓存场景之首 → 实现阶段遗漏了整个缓存读写机制 → 每次页面加载都产生3次API请求，浪费带宽且增加首屏延迟。
- **影响范围**: 仅影响首页性能，不影响功能正确性。
- **修复建议**:
  - **修改文件**: `src/stores/homeStore.ts` — `fetchHomeData()` 函数
  - **关键逻辑**: (a) 在 `fetchHomeData()` 开头读取 sessionStorage 键 `home_cache`（JSON `{ doctors, articles, diabetesTypes, timestamp }`），若存在且 `Date.now() - timestamp < 3600000`（1小时），则直接恢复数据到 ref 并 return；(b) API 成功后，在 `loading.value = false` 之前将数据和时间戳写入 sessionStorage；(c) `retryDoctors`/`retryArticles`/`retryTypes` 重试成功后同步更新缓存中的对应区块数据。
  - **边界条件**: sessionStorage 空间约5MB，需在 setItem 外套 try-catch 防 QuotaExceededError；缓存键命名使用项目前缀如 `qrzl_home_cache` 避免命名冲突；时间戳使用 `Date.now()` 而非 `new Date().toISOString()` 以减少序列化开销。
  - **与其他修复的交互**: 需在 homeStore 中暴露 `clearHomeCache()` 函数（清除 `qrzl_home_cache` 键）供 S8 的 `clearAuth()` 调用（参见 8.3(b) 缓解措施和 8.3(e) 交互B），确保登出/401 时旧用户缓存被清理。在 homeStore 的 `return {}` 块中暴露此函数。
- **验证方法**: 打开浏览器 DevTools Application 面板 > Session Storage，首次加载后应出现 `qrzl_home_cache` 键；刷新页面，Network 面板应无 /api/doctors、/api/articles、/api/diabetes-types 请求；等待1小时后刷新，应重新发起 API 请求。

### S2. LifePlan.vue 缺失 sessionStorage 方案缓存（30分钟过期）

- **诊断结论**: **确认 — 代码偏离设计**
- **严重程度**: 高（与 todo.md 一致）
- **设计依据**:
  - 4.2节状态管理表（第3482行）：`LifePlan.vue | sessionStorage | 方案缓存 (含生成时间戳, 30分钟过期)`
  - 4.2节架构说明（第3466行）：`sessionStorage: 用于页面级临时缓存场景——LifePlan.vue 方案缓存（30分钟过期）`
- **代码证据**: `src/stores/lifePlanStore.ts:42-53` — `fetchCurrent()` 直接 `await getCurrentPlan()`，无 sessionStorage 读写；`src/stores/lifePlanStore.ts:61-87` — `generate()` 成功后仅写 `currentPlan.value`，不写 sessionStorage；`src/stores/lifePlanStore.ts:93-103` — `adjust()` 同样不写 sessionStorage。
- **因果链**: 设计文档明确要求30分钟方案缓存 → 实现阶段遗漏 → 页面刷新后方案数据丢失，需重新请求API。
- **影响范围**: 用户刷新/重返页面时的体验和API调用量。
- **修复建议**:
  - **修改文件**: `src/stores/lifePlanStore.ts` — `fetchCurrent()`、`generate()`、`adjust()` 三个函数
  - **关键逻辑**: (a) `fetchCurrent()` 开头读 sessionStorage 键 `qrzl_plan_cache`，若存在且 `Date.now() - cache.timestamp < 1800000`（30分钟），直接恢复 `currentPlan` 和 `completedMap`；(b) `generate()` 和 `adjust()` 成功后，将 `{ currentPlan: currentPlan.value, completedMap: [...completedMap.value], timestamp: Date.now() }` 写入同一键；(c) `fetchCurrent()` API 成功后覆盖缓存。
  - **边界条件**: `completedMap`（`Map<number, CompletionStatus>`）不可直接 JSON 序列化，需转为 `[[k, v], ...]` 数组格式写入，读取时 `new Map(array)` 恢复；空方案（`currentPlan === null`）也写入缓存以区分"未请求过"和"已请求过但无数据"；缓存过期后静默降级为 API 请求。
  - **与其他修复的交互**: 需在 lifePlanStore 中暴露 `clearPlanCache()` 函数（清除 `qrzl_plan_cache` 键）供 S8 的 `clearAuth()` 调用（参见 8.3(b) 缓解措施和 8.3(e) 交互B），确保登出/401 时旧用户缓存被清理。在 lifePlanStore 的 `return {}` 块中暴露此函数。
- **验证方法**: DevTools Application 面板查看 sessionStorage 中 `qrzl_plan_cache` 键值；刷新页面后 Network 面板应无 /api/plan/current 请求（30分钟内）；等待30分钟后刷新应重新请求。

### S3. Punch.vue 缺失默认近30天日期筛选

- **诊断结论**: **确认 — 代码偏离设计**
- **严重程度**: 中（todo.md 定级"严重"，本报告调整为"中"——缺失默认日期不影响功能可用性，用户可手动选择日期。属体验偏差而非功能阻断。）
- **设计依据**:
  - 4.3节Punch.vue流程图（第3779行）：`页面加载 → 从URL参数或sessionStorage 读取筛选条件 默认近30天`
- **代码证据**: `src/views/Punch.vue:22-23` — `dateStart` 和 `dateEnd` 初始化为 `ref('')`（空字符串）；`src/views/Punch.vue:135-147` — `onMounted` 未计算默认日期范围。
- **因果链**: 设计要求"默认近30天" → 实现时初始化为空字符串 → 用户首次进入看到空日期筛选器，列表可能显示全部历史数据而非最近30天。
- **影响范围**: 用户体验偏差，日期筛选器初始状态不符合设计预期。
- **修复建议**:
  - **修改文件**: `src/views/Punch.vue` — `onMounted` 函数（第135-147行）
  - **关键逻辑**: 在 `onMounted` 中，在调用 `store.fetchList()` 之前：(a) 计算 `const end = new Date()`；(b) 计算 `const start = new Date(); start.setDate(start.getDate() - 30)`；(c) `dateEnd.value = formatDate(end)`；(d) `dateStart.value = formatDate(start)`；(e) 调用 `store.setFilter({ startDate: dateStart.value, endDate: dateEnd.value })` 替代直接调用 `store.fetchList()`。
  - **边界条件**: 使用 `toISOString().slice(0, 10)` 格式化为 `YYYY-MM-DD`；如果 URL query 参数已带日期（如从其他页面跳转携带筛选），优先使用 URL 参数而非默认近30天；如果 sessionStorage 已有上次筛选条件，优先恢复上次选择。
- **验证方法**: 首次进入 /profile/punch 页面，日期输入框应自动填充"30天前"和"今天"；检查 Network 面板中的 /api/punch/list 请求参数应包含 startDate 和 endDate。

### S4. LifePlan.vue 未读取 riskFormStore.result

- **诊断结论**: **确认 — 代码偏离设计**
- **严重程度**: 中（todo.md 定级"严重"，本报告调整为"中"——LifePlan 可独立运行，缺失 result 损失个性化上下文提示，非功能阻断。）
- **设计依据**:
  - 1.2节跨组件通信机制（第107行）：`风险预测页 -> riskFormStore.saveResult(data) -> 生活方案页 onMounted 读取 riskFormStore.result -> 预填方案生成参数`
  - 4.2节状态管理表（第3472行）：`App.vue + 各页面组件 | Pinia riskFormStore | ...LifePlan.vue 通过读取 riskFormStore.result 获取跨模块数据`
  - App.vue流程图（第3725行）：`跨模块数据传递: riskFormStore.saveResult() -> router.push /life-plan -> LifePlan.vue onMounted 读取 riskFormStore.result`
- **代码证据**: `src/views/LifePlan.vue:75-82` — `prefillFromRiskForm()` 仅读取 `riskForm.formData`（年龄/性别/身高/体重），完全未触及 `riskForm.result`；`src/views/LifePlan.vue:297-303` — `onMounted` 调用 `prefillFromRiskForm()` 后调用 `fetchCurrent()`，无任何 `result` 读取逻辑。
- **因果链**: 设计文档在三处（1.2/4.2/4.3）均明确 LifePlan 应读取 riskFormStore.result → 实现仅读取了 formData → 风险预测结果（风险等级、评分、匹配糖尿病类型）对方案生成页面完全不可见，无法用于展示上下文提示或影响方案生成偏好。
- **影响范围**: 跨模块数据传递链路断裂，LifePlan 无法利用已有的风险预测结果进行个性化展示。
- **修复建议**:
  - **修改文件**: `src/views/LifePlan.vue` — `onMounted` 函数（第297-303行）
  - **关键逻辑**: (a) 在 `onMounted` 中 `prefillFromRiskForm()` 之后，读取 `riskForm.result`；(b) 若 `result` 存在，新增 `riskResultHint` reactive 变量存储 `{ riskLevel: result.risk_level, riskScore: result.risk_score, diabetesType: result.matched_diabetes_type }`；(c) 在模板中已有 `riskLevelHint` 提示条下方，增加风险详情展示区（或扩展 `riskLevelHint` 包含更多信息）；(d) `route.query.diabetesType` 如有值则优先覆盖 `result.matched_diabetes_type`。
  - **边界条件**: `riskForm.result` 可能为 null（用户直接进入 LifePlan 未做过风险预测），此时跳过个性化提示展示，不报错；`riskForm.loadFromStorage()` 已在 `prefillFromRiskForm()` 中调用，保证 sessionStorage 数据水合。
- **验证方法**: 从 Risk 页面完成风险预测后跳转至 LifePlan，检查页面上方是否展示风险等级和匹配糖尿病类型提示；直接访问 /life-plan（无风险预测历史），提示区不应报错且不显示个性化内容。

### S5. 路由表缺少 consultation/doctor/:id 和 news/article/:id

- **诊断结论**: **确认 — 代码偏离设计，且组件文件缺失**
- **严重程度**: 高（与 todo.md 一致）

**S5a — ArticleDetailView.vue + /news/article/:id 路由**（复杂度: 低至中，取决于后端 API 就绪状态——降级方案仅可交付"文章元数据详情页"而非"完整文章详情页"，详见修复建议中的降级方案分析）

- **设计依据**: 1.6.1节路由映射表（第432行）：`/news/article/:id → ArticleDetailView.vue`；1.6.2节路由守卫代码示例（第477-480行）：`meta: { requiresAuth: false }`；3.2.20节 API接口设计（第2051行）：`GET /api/articles/:id` 响应体包含 `content` 字段（Markdown 正文）及 `is_collected`/`tags`/`summary`/`views` 等完整字段；6节接口测试规范（第6224行）：`GET /api/articles/:id 返回完整文章（含 content），views 计数+1`
- **代码证据**: `src/router/index.ts:5-67` 无此路由；文件系统中不存在 `ArticleDetailView.vue`；`src/types/api.ts:124-139` — `Article` 接口字段为 `id, title, cover, author, category, tags, summary, views, created_at`，**不含文章正文 `content`/`body` 字段**（接口注释第119行明确标注"列表项，无完整正文 content"）。此类型限制是后文降级方案评估的关键约束。
- **设计意图与类型约束的张力分析（v7新增，v8修订，v9定论）**: 设计文档 1.6.1 节路由映射表要求 `/news/article/:id → ArticleDetailView.vue`，暗示文章详情页应包含完整正文内容。但 `Article` 类型（api.ts:124-139）不含 `content`/`body` 字段且注释标注"列表项"。此张力存在两种可能：(a) 设计文档预期了独立的文章详情 API（`GET /api/articles/:id` 返回含 `content` 的扩展类型，如 `ArticleDetail extends Article { content: string }`），但类型定义阶段未创建 `ArticleDetail`；(b) 设计文档撰写时未考虑类型约束，文章详情页仅展示已有多字段（标题/作者/摘要/阅读量等元信息）而不含正文。**v9 定论：方案 (a) 已由设计文档确认**——3.2.20 节 API 接口设计（第2051行）明确 `GET /api/articles/:id` 响应体包含 `content` 字段（Markdown 格式正文）、`is_collected`、`tags`、`summary` 等完整字段；6节接口测试规范（第6224行）再次确认"`GET /api/articles/:id` 返回完整文章（含 content），views 计数+1"。该 API 契约在 1_requirements_analysis_v2.md 第943-963行也有所体现（"包含完整正文的单篇文章详情"）。**结论：后端 API 已设计为返回完整文章含正文，`Article` 类型与 API 契约之间的缺口是前端类型定义遗漏所致**——当前 `Article` 接口仅建模了列表视图字段，缺少详情视图所需的 `content`、`is_collected` 等字段。修复时需新建 `ArticleDetail extends Article { content: string; is_collected: boolean }` 类型，并在 `useHomeApi.ts` 中新增 `getArticle(id: number)` 函数。**操作建议（v8新增）**: 修复者也可通过浏览器 DevTools Network 面板或 `curl` 命令直接访问已部署后端的 `/api/articles/1` 验证 API 实际响应结构，作为对设计文档证据的二次确认。
- **影响范围**: 文章详情页不可达；S6（文章点击跳转）因此路由不存在而成为必然结果。
- **修复建议**:
  - **需创建文件**: `src/views/ArticleDetailView.vue`
  - **需修改文件**: `src/router/index.ts` — 添加路由配置
  - **关键逻辑**: (a) 组件接收 `route.params.id`，调用 API 获取文章详情（需确认后端是否已有 `GET /api/articles/:id` 接口，若不存在需新增 `useHomeApi.ts` 中的 `getArticle(id)` 函数——注意 `id` 为 number，应使用 `String(id)` 直接拼接，而非 `encodeURIComponent`（`getDiabetesType` 对 number 主键使用 `encodeURIComponent` 作为模板可能传播不精确实践）；(b) 使用 `marked.parse()` + `DOMPurify.sanitize()` 渲染文章正文（复用 LifePlan `safeContentHtml` 模板）；(c) 展示标题、作者、分类、发布时间、阅读量；(d) 路由 `meta: { requiresAuth: false }`。
  - **可复用模式**: `src/views/LifePlan.vue:94-99` 的 `safeContentHtml` 模式；`src/composables/useHomeApi.ts` 的 API 调用模式。
  - **边界条件**: 文章 ID 不存在时展示 404 提示（非路由级 404，组件内降级）；正文为空时显示占位文案；API 失败时展示重试按钮。
t  - **后端 API 不可用时的降级方案（v5新增，v7修订）**: 若 `GET /api/articles/:id` 未就绪，可尝试用 `getArticles()` 拉取文章列表后在客户端 `find(a => a.id === id)` 筛选包装为 `getArticle(id)`。**但存在两个关键限制须明确标注为待验证项**：(1) **分页行为未验证**——`getArticles()` 经实际代码审查确认为分页 API（内部调用 `api.get<PagedBody<Article>>('/articles', { params })`，参数 `ArticlesParams` 包含 `page`/`pageSize` 可选字段，但函数调用 `getArticles()` 时不传任何参数）。后端在无 `page`/`pageSize` 参数时的行为未经验证——若默认返回首页（如 page=1, pageSize=10），则 `find()` 仅搜索首页数据，目标文章不在首页时查找失败，降级方案不可用。若后端在无分页参数时返回全部文章（不限分页），降级方案有效。**诊断结论：降级方案仅为"条件可用"，修复者实施前需先确认后端分页默认行为**；(2) **Article 类型不含 content 字段**（api.ts:124-139，仅含 summary 摘要），降级交付物仅为"文章元数据详情页"无法渲染正文。模板中可通过 `v-if="article.content"` 区分两态。后端接口就绪后正文自动激活。复杂度重评估：接口就绪时"低"，未就绪时"中（且降级方案需先验证分页行为）"。建议返回类型新建 `ArticleDetail extends Article { content: string }`。
- **验证方法**: 直接访问 `/news/article/1`（假设存在此 ID），检查页面是否正常渲染文章标题、正文、元信息；访问 `/news/article/99999`（不存在ID），检查组件内降级展示；执行 `vue-tsc --noEmit` 或 `npm run build` 确认新建组件和路由注册无新增编译错误。

**S5b — DoctorChatView.vue + /consultation/doctor/:id 路由 + Consultation.vue 入口页**（复杂度: 高——chatStore 当前为骨架实现，需从头构建 SSE 通信层；Consultation.vue 为7行占位页面，需完整构建医生列表入口 UI。拆分为 S5b-1/S5b-2 两个子任务）

- **设计依据**: 1.6.1节路由映射表（第429行）：`/consultation/doctor/:id → DoctorChatView.vue`；1.6.2节路由守卫代码示例（第462-465行）：`meta: { requiresAuth: true, requiresDisclaimer: true }`
- **代码证据（v5 经实际代码读取验证）**: `src/router/index.ts:5-67` 无此路由；文件系统中不存在 `DoctorChatView.vue`。**经实际读取 `src/stores/chatStore.ts`（13行）**：`conversations` 为 `ref([])` 空数组，`abortActiveConnection()` 为空函数体，文件内无任何 EventSource/SSE/WebSocket 代码。`src/types/sse.ts` 中定义的 `SSEMessageEvent`、`SSEErrorEvent`、`ChatMessage` 等类型完全未被 chatStore 引用。**结论：chatStore 是骨架实现，SSE 通信层需从头构建**——v4 所称"依赖 chatStore 和 SSE 机制就绪"是基于未经验证假设的信任标注，实际情况是该依赖本身尚未实现。
- **代码证据（v6 经实际代码读取验证 — 补充 Consultation.vue 入口页状态）**: **经实际读取 `src/views/Consultation.vue`（7行）**：文件为占位页面——模板仅含静态提示文字 `<p>医师咨询 — 待组员开发</p>`，不含任何医生列表、医生卡片、`v-for` 渲染、`<script setup>` 逻辑或点击事件处理。路由表中 `/consultation` 路由（`src/router/index.ts:12-15`）已注册指向此占位文件，但该文件不包含设计文档 4.1.3 节 Consultation.vue 组件树（第3021行起）所描述的医生列表功能。**结论：即使 DoctorChatView.vue 和 `/consultation/doctor/:id` 路由就绪，用户也无法通过正常导航路径（从 Consultation 页点击医生卡片）进入医生对话界面——入口页本身是占位状态。**
- **影响范围**: 医生对话功能完全不可用——包含两个层面：(a) 入口页 Consultation.vue 为占位，无法展示医生列表和提供跳转入ロ；(b) 目标页 DoctorChatView.vue 不存在，chatStore SSE 通信层未实现。S5b 实际工作量远超 v4 评估的"中高"。

**S5b-1 — 实现 chatStore SSE 核心**（硬前置依赖，优先级 P0，复杂度: 高）

> **v7 技术方案修正**: v6 及此前版本推荐使用 `new EventSource(url)` 实现 SSE 连接管理，经查阅项目设计文档确认该方案不可行——EventSource API 不支持自定义 HTTP 请求头，无法携带 JWT Token（`Authorization: Bearer <token>`）通过认证。`docs/1_requirements_analysis_v1.md` 第15.2节（第1401-1407行）已将"推荐使用 EventSource API"标记为严重审查问题并修正为 `fetch + ReadableStream`；`docs/1_requirements_analysis_v2.md` 第989行再次强调"不使用 EventSource API"；`docs/2_detailed_design_v3.md` 第2373行明确 SSE 消费方式为"前端在fetch的ReadableStream中按 `\n\n` 分隔事件块，每行去除 `data: ` 前缀后JSON.parse解析"。v7 将 S5b-1 的 SSE 实现方案从 EventSource 全面修正为项目设计文档规定的 `fetch + ReadableStream`。

- **需修改文件**: `src/stores/chatStore.ts`（从13行骨架扩展为完整 SSE 实现）
- **需新建文件（v9新增 — API composable 层）**: `src/composables/useChatApi.ts` — chat API composable。当前代码库中不存在任何 chat 相关的 API composable（经全局搜索 `src/` 目录确认），`POST /api/chat/doctor/:id` 的前端调用函数需从零创建：(a) 定义 `sendChatMessage(params: { doctorId: number; message: string; conversationId?: string }): Promise<Response>` 函数——使用 `fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ message, conversation_id: params.conversationId }) })` 发起 SSE 请求并返回 `Response` 对象（ReadableStream 由 chatStore 消费，不在 API composable 中读取）；(b) 定义 `getDoctorInfo(id: number): Promise<DoctorDetail>` 函数——用于 DoctorChatView.vue 获取医生信息。此 API composable 层创建任务对标 S5a 的 [†D] 分析标准（显式检查 `useHomeApi.ts` 中是否存在 `getArticle(id)` 并标注其缺失），确保 S5b-1 的修复范围评估与 S5a 保持同等分析精度。**与 G14 的交叉引用**：G14（响应拦截器 success 字段检查）应先于 S5b-1 完成——G14 修复后 `useApi.ts` 响应拦截器统一处理 `success: false`，新创建的 `useChatApi.ts` 可自动受益于拦截器的错误处理，无需在 chat API composable 内重复实现。此依赖已在 8.2 节优先级表 S5b-1 行"前置依赖"列中标注。
- **关键逻辑**:
  - (a) **连接管理**——使用 `fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ message, conversation_id }) })` 发起 SSE 请求；通过 `response.body.getReader()` 获取 ReadableStream reader，循环 `reader.read()` 逐块（chunk）接收字节流（参考 `docs/2_detailed_design_v3.md` 第2373行消费规范、第3543行 fetch POST /api/chat/doctor/:id 模式）；
  - (b) **SSE 事件解析**——将 chunk 解码为文本后，按 `\n\n` 分隔事件块；对每个事件块按行处理：去除 `data: ` 前缀 → `JSON.parse` 解析事件数据；根据 `event` 字段分发：`message` → 增量追加 AI 回复 chunk 到当前消息气泡，`message_end` → 保存 `conversation_id` 并关闭流，`error` → 渲染错误气泡（参考 `docs/1_requirements_analysis_v2.md` 第989-1007行 ReadableStream 消费规范）；
  - (c) `conversation_id` 管理——首次对话不传 `conversation_id`（后端自动创建新会话），收到 `message_end` 事件后保存其返回的 `conversation_id` 至 localStorage（按 doctorId 区分存储键 `qrzl_conv_${doctorId}`）；后续对话读取并传入该 `conversation_id` 以保持上下文连续性；
  - (d) **断线重连**——网络中断或 fetch 异常时，使用指数退避重试（初始延迟 1s，倍增上限 30s，最大重试 5 次）；重试时携带已保存的 `conversation_id` 以恢复对话上下文；
  - (e) 实现 `abortActiveConnection()` 函数体——调用 `AbortController.abort()` 关闭当前 fetch 流（v7 修正：fetch + AbortController 替代 v6 的"关闭 EventSource 连接"）；设计文档 4.2 节要求"同时活跃 SSE 连接数上限为 1"，新连接发起前需 abort 旧连接；
  - (f) 多医生会话路由——不同 doctorId 维护独立 conversation_id 映射（`Map<number, string>`），切换医生时 abort 旧连接并加载目标医生的 conversation_id；
  - (g) `fabOpen` 状态管理——控制 Consultation 悬浮按钮展开/收起；
  - (h) 消息流式渲染——AI 回复 chunk 增量追加到当前 `conversations` 数组的最后一条 assistant 消息的 `content` 字段，ref 驱动 UI 更新。
- **参考类型**: `src/types/sse.ts` — `SSEMessageEvent`（event/message，含 answer/conversation_id/message_id/created_at）、`SSEMessageEndEvent`（event/message_end，含 conversation_id/message_id/created_at）、`SSEErrorEvent`（event/error，含 message/code）、`ChatMessage`（id/role/content/timestamp）。
- **边界条件**:
  - fetch API 在所有现代浏览器（含移动端）中均可用，无需降级为轮询——v6 中的"浏览器不支持 EventSource 时降级为轮询"不再适用（v7 修正）；
  - 网络中断时的重连策略使用 fetch 重试 + 指数退避（替代 v6 中的 EventSource 自动重连语义）；
  - `AbortController` 在 fetch 调用时传入 `signal`，`abortActiveConnection()` 通过 `controller.abort()` 取消进行中的流——这与 G18 的 AbortController 机制协同（chatStore 内部维护 `AbortController` 实例，组件卸载时调用 `abortActiveConnection()`）；
  - 多标签页仅最新标签页维持 SSE 连接（设计文档 4.2 节约束：同时活跃连接数上限为 1）；
  - `response.status === 401` 时触发 `authStore.clearAuth()` + Toast 提示（与设计文档 DoctorChatView.vue 流程图第3544-3546行 401 处理分支一致）。

**S5b-2 — 实现 DoctorChatView.vue 组件 + 路由注册**（依赖 S5b-1，优先级 P1，复杂度: 中高）

- **需创建文件**: `src/views/DoctorChatView.vue`
- **需修改文件**: `src/router/index.ts` — 添加路由配置（`/consultation/doctor/:id`）；**`src/views/Consultation.vue` — 从7行占位页面重写为医生列表功能页面（v6修正：v5 称"添加跳转逻辑"基于未经验证的假设——经实际读取确认 Consultation.vue 为占位页面，不含任何医生卡片、v-for 渲染或点击事件。修复者无法"修改跳转逻辑"——需先构建完整的医生列表 UI）**
- **Consultation.vue 重构要点（v6新增 — 入口页医生列表 UI 构建）**: (a) 引入 `homeStore` 或新增 API 调用获取医生列表（`getDoctors()` 已存在于 `useHomeApi.ts`）；(b) 使用 `v-for` 渲染医生卡片（头像、姓名、职称、科室、简介）；(c) 医生卡片绑定 `@click` 事件，执行 `router.push("/consultation/doctor/" + doctor.id)`；(d) 实现加载态（骨架屏/Spinner）、空态（"暂无在线医生"）、错误态（API 失败重试按钮）；(e) 注意 `getDoctors()` 当前已含有 `is_online` 字段——医生卡片可在 online 医生上展示"在线"标识。
- **DoctorChatView.vue 关键逻辑**: (a) 组件接收 `route.params.id`，在 `onMounted` 中调用 API 获取医生信息；(b) 集成 S5b-1 完成的 chatStore 进行 SSE 流式对话；(c) 展示对话消息列表（用户消息 + AI 回复流式渲染）；(d) 输入框发送消息调用 `chatStore.sendMessage()`；(e) 路由 `meta: { requiresAuth: true, requiresDisclaimer: true }`。
- **边界条件**: Consultation.vue — API 获取医生列表失败时展示重试按钮而非空白页；DoctorChatView.vue — 医生 ID 不存在时展示错误态，chatStore 未初始化时展示加载态，`requiresDisclaimer: true` 触发免责声明弹窗。
- **复杂度重评估（v6修正）**: S5b-2 复杂度从 v5 的"中高"上调为"中高至**高**"——Consultation.vue 从占位页面到功能页面的完整构建涉及医生列表 API 集成、卡片 UI、三态处理（加载/空/错误），工作量不亚于 DoctorChatView.vue 的创建。若团队将 Consultation.vue 的完整实现视为独立任务（如新增 S14/G30 Todo 项），则 S5b-2 可维持"中高"——但仍需标注 Consultation.vue 为**独立前置任务**（用户需从 Consultation 页的医生列表进入 DoctorChatView，入口页未就绪则医生对话功能的完整用户路径不可达）。

- **验证方法（S5b-2）**: 从 Consultation 页点击医生卡片跳转至 `/consultation/doctor/1`，检查医生信息和 SSE 流式渲染是否正常；检查免责声明弹窗是否触发；检查 Consultation 页医生列表的加载态、空态、错误态、在线标识是否正常。执行 `vue-tsc --noEmit` 确认新建组件和 Consultation.vue 重写后无新增编译错误。S5b-1 验证需独立进行（SSE 连接建立/消息收发/断线重连测试）。

### S6. Home.vue 文章点击跳转目标与设计不一致

- **诊断结论**: **确认 — 代码偏离设计，且受S5制约**
- **严重程度**: 中（todo.md 定级"严重"，本报告调整为"中"——用户仍可进入资讯列表页浏览文章，功能降级但未完全不可用。）
- **设计依据**:
  - 4.3节Home.vue流程图（第3515行）：`绑定文章点击事件 router.push({path:'/news/article/' + articleId})`
- **代码证据**: `src/views/Home.vue:80-82` — `goArticle(_id)` 接收 `id` 参数但完全忽略（`_id` 前缀），始终执行 `router.push('/news')` 跳转到资讯列表页。
- **因果链**: 设计要求跳转到文章详情页 `/news/article/:id` → 实现时可能因 S5（该路由不存在）而回退为跳转资讯列表 → 但注释称"文章详情页不在本任务"，而非标记为待实现。
- **影响范围**: 用户无法从首页直接查看具体文章内容，功能降级。
- **修复建议**:
  - **前置依赖**: S5a（ArticleDetailView.vue + /news/article/:id 路由）必须先完成。
  - **修改文件**: `src/views/Home.vue:80-82` — `goArticle()` 函数
  - **关键逻辑**: (a) 移除 `_id` 前缀（参数从 `_id` 改为 `id`）；(b) 实现 `router.push({ path: '/news/article/' + id })`；(c) 确认 `id` 类型为 `number`（Article 接口定义），拼接路径前转为字符串。
  - **边界条件**: 无 id 时不执行跳转（防御性判断 `if (!id) return`）。
- **验证方法**: 从首页点击任一篇推荐文章，检查跳转目标是否为 `/news/article/{id}` 而非 `/news`；检查文章详情页是否正确展示对应文章内容。

### S7. Punch.vue 日期筛选变更未同步触发 AI 分析重拉取

- **诊断结论**: **确认 — 代码偏离设计**
- **严重程度**: 中（todo.md 定级"严重"，本报告调整为"中"——当前分析仍展示整体统计数据，偏差在于分析范围与列表范围不一致，分析功能本身正常工作。）
- **设计依据**:
  - 4.3节Punch.vue流程图（第3793行）：`修改日期 → 重新请求list+analysis API 更新渲染`
- **代码证据**: `src/views/Punch.vue:127-132` — `onDateChange()` 调用 `store.setFilter({startDate, endDate})`；`src/stores/punchStore.ts:142-152` — `setFilter()` 仅调用 `fetchList()`，未调用 `fetchAnalysis()`。
- **因果链**: 设计明确要求"重新请求list+analysis" → `setFilter` 仅触发了 list 请求 → 日期变更后分析数据停留在初始加载的结果，与当前筛选范围不匹配。
- **影响范围**: 日期筛选后 AI 分析数据与用户可见的打卡记录范围不一致。
- **修复建议**:
  - **修改文件**: `src/stores/punchStore.ts:142-152` — `setFilter()` 函数
  - **关键逻辑**: 在 `setFilter()` 中 `fetchList()` 之后追加 `fetchAnalysis()` 调用（注意：需与 S9 竞态保护同步修复，为 `fetchAnalysis` 增加 requestId 快照后再在 `setFilter` 中调用）。
  - **边界条件**: `fetchAnalysis()` 失败不应阻断列表渲染（`fetchAnalysis` 已有独立的 `analysisError` 错误态）；如果用户在短时间内多次修改日期（如连续点击日期选择器），需防抖处理（300ms debounce）避免连续多次 API 请求。
- **验证方法**: 修改日期筛选范围（如从近30天改为近7天），检查 Network 面板中 /api/punch/analysis 请求是否随 /api/punch/list 一起重新发出；检查分析区的完成率、趋势图、评语是否与新的日期范围对应。

### S8. Token 明文存储在 localStorage，存在 XSS 窃取风险

- **诊断结论**: **代码符合设计但设计存在安全缺陷 — 建议代码先行缓解，随后修订设计文档**。变更顺序：(1) 第一步：实施 sessionStorage 迁移（代码先行，不影响设计合规性——sessionStorage 仍是 Web Storage API，与 localStorage 属同一技术家族，迁移不改变设计文档"Web Storage 存储 Token"的技术选型大类）；(2) 第二步：更新设计文档 1.2 节和 4.2 节，将 localStorage 改为 sessionStorage，并明确标注安全权衡（牺牲跨会话持久化换取 XSS 攻击面缩减）。此两步顺序确保修复者不会因"先改设计还是先改代码"而困惑。
- **严重程度**: 中（todo.md 定级"严重"，本报告调整为"中"——Token 存储方式为设计决策层面问题，代码严格遵循设计。修复需设计层面决策。）
- **设计依据**:
  - 1.2节公共状态（第98行）：`localStorage: JWT Token, role, 免责确认状态`
  - 4.2节架构说明（第3465行）：`localStorage: 仅用于跨会话持久化场景（JWT Token、conversation_id）`
  - 7.1节认证流程图（第5645-5656行）：Token的存储和过期处理机制描述中未提及 HttpOnly Cookie
- **代码证据**: `src/stores/authStore.ts:12` — `const token = ref<string | null>(localStorage.getItem('token'))`；`src/stores/authStore.ts:39` — `localStorage.setItem('token', newToken)`。
- **因果链**: 设计文档明确选择 localStorage 作为 JWT Token 的持久化方案 → 代码完全遵循了设计 → XSS 窃取风险是设计决策的固有后果（localStorage 无 HttpOnly 保护），非实现偏差。
- **有效性层级评估**:

  **短期缓解方案（sessionStorage，建议立即实施）**:
  - 优势：(a) 不跨标签页共享——攻击者即使在当前标签页成功注入 XSS，Token 不会泄露到攻击者控制的其他标签页；(b) 标签页关闭后自动清除——限制了 Token 的持久化时间窗口；(c) 与 localStorage 同为 Web Storage API，代码改动最小（`getItem`/`setItem` 调用格式相同）。
  - 局限：同一标签页内的 XSS 仍可读取 sessionStorage（与 localStorage 相同），不能根治 XSS 窃取问题。
  - 论据修正说明：v1 报告中列举的"不会随每次 HTTP 请求自动发送"用于对比 localStorage 是无效论据——localStorage 同样不具备自动 HTTP 发送能力，此属性是 Cookie 专有特征。本修订删除该无效论据。

  **根治方案（HttpOnly Cookie，需后端协同）**:
  - 优势：JavaScript 完全不可访问（XSS 无法窃取），浏览器自动附加到同域请求。
  - 局限：需后端修改登录响应头（Set-Cookie: token=xxx; HttpOnly; Secure; SameSite=Strict），需修改前端认证逻辑（从 `localStorage.getItem('token')` 改为依赖 Cookie 自动携带，移除 `Authorization` 请求拦截器中的手动附加），工作量涉及前后端联调。引入 CSRF 风险（Cookie 自动发送），需额外配置 SameSite 或 CSRF Token。

- **修复建议（短期过渡）**:
  - **修改文件**: `src/stores/authStore.ts` — 全部21处 `localStorage` 操作点（token/role/user 相关）
  - **需迁移至 sessionStorage 的函数及操作点清单**（经实际读取 `authStore.ts` 全文确认）:
  
    | 函数/位置 | 迁移的 localStorage 键 | 保留在 localStorage 的键 | 说明 |
    |-----------|----------------------|------------------------|------|
    | **初始化 ref 声明**（行12/13/17） | `token`, `role`, `user` | `must_change_password`（行25） | ref 初始值从 sessionStorage 读取 |
    | **`setToken()`**（行30-33） | `token` | — | setItem 改为 sessionStorage |
    | **`setAuth()`**（行35-42） | `token`, `role`, `user` | — | 登录和 token 恢复核心路径，三键均迁移 |
    | **`syncFromStorage()`**（行44-63） | `token`, `role`, `user` | `must_change_password`（行62） | 跨标签页同步数据源切换 |
    | **`clearAuth()`**（行65-74） | `token`, `role`, `user` | `must_change_password`（行73） | removeItem 改为 sessionStorage |
    | **`login()`**（行76-85） | —（通过 setAuth 间接迁移） | `must_change_password`（行83） | `must_change_password` 保持 localStorage 跨会话持久化 |
    | **`fetchProfile()`**（行94-102） | `role`, `user` | — | 用户刷新个人信息后更新缓存 |
    | **`setProfile()`**（行104-109） | `user` | — | 修改用户名/头像后更新缓存 |
    | **`clearMustChangePassword()`**（行111-114） | — | `must_change_password`（行113） | 保持 localStorage |
  
  - **关键逻辑**: (a) 上表中标注"迁移"的全部 `localStorage` 调用改为 `sessionStorage`（`getItem`/`setItem`/`removeItem` 调用格式相同，仅替换存储对象名称）；(b) `must_change_password` 所有操作点保持 localStorage（行25/62/73/83/113，共5处）；(c) `disclaimer_accepted` 保持 localStorage（`src/router/index.ts:79`，跨会话持久化场景）。
  - **迁移模式**: 全文搜索 `localStorage` → 逐处判断该键是否需要跨会话持久化（`must_change_password`/`disclaimer_accepted` 需要，其余不需要）→ 仅将不需要跨会话的键迁移至 sessionStorage。建议在完成迁移后全文再次搜索 `localStorage` 确认无遗漏。
  - **联动修改**: `src/router/index.ts:79` — `hasAcceptedDisclaimer()` 保持 `localStorage.getItem('disclaimer_accepted')`；路由守卫中对 `authStore.token` 的检查无需改动（authStore 内部已切换数据源）。
  - **边界条件**: 用户关闭标签页后重新打开，token 丢失需重新登录（这是预期行为——sessionStorage 设计目标）；跨标签页场景（如新标签页打开 /profile）需重新登录或通过其他机制同步（如下述 BroadcastChannel 可选用方案）。
  - **跨标签页同步（强建议）**: sessionStorage 迁移后，每个新标签页因缺失 token 将强制跳转登录页，形成 UX 退化。以下为 BroadcastChannel 最小实现方案（标注为强建议——代码量小约 30 行，可在不牺牲安全性的前提下消除跨标签页 UX 退化，强烈建议与核心修复一同交付）：
    ```typescript
    // 在 authStore.ts 中（v5修正：懒初始化 + 状态就绪检查 + 数据携带）
    let channel: BroadcastChannel | null = null
    function getChannel(): BroadcastChannel | null {
      if (channel) return channel
      try { channel = new BroadcastChannel('qrzl_auth_sync'); return channel } catch { return null }
    }
    const bc = getChannel()
    if (bc) {
      bc.onmessage = (e: MessageEvent) => {
        // v5修正：增加状态就绪检查，避免 Store 未完全水合时执行同步
        if (e.data?.type === 'AUTH_CHANGED' && token.value) {
          // v5修正：消息体直接携带认证数据（token/role/user），
          // 因为 sessionStorage 按标签页隔离，接收方调用 syncFromStorage()
          // 读取的是自身（可能为空的）sessionStorage。
          // 若不携带数据，跨标签页同步机制将无法实际生效。
          setAuth(e.data.token, e.data.role, e.data.user)
        }
      }
    }
    // 在 setAuth() / clearAuth() 末尾广播（v5修正：携带实际认证数据）：
    getChannel()?.postMessage({
      type: 'AUTH_CHANGED',
      token: token.value,
      role: role.value,
      user: user.value,
      timestamp: Date.now()
    })
    ```
    - **v5 修正说明**: (1) **懒初始化**——`new BroadcastChannel(...)` 从模块顶层 IIFE 改为按需懒初始化（`getChannel()` 函数），避免单元测试/SSR 环境中 BroadcastChannel API 不存在时的模块级初始化副作用；(2) **状态就绪检查**——`onmessage` 中增加 `token.value` 非空检查，避免 Store 未完全水合时执行状态同步；(3) **数据携带**——`postMessage` 消息体携带实际 token/role/user 数据，因为 sessionStorage 按标签页隔离，接收方 `syncFromStorage()` 只能读取自身的空 sessionStorage，无法获取发送方的认证数据。若不携带数据，跨标签页同步机制将形同虚设。
    - 实现要点：(a) `setAuth()` 和 `clearAuth()` 末尾通过 `getChannel()?.postMessage(...)` 广播，携带 token/role/user 数据；(b) 收到 `AUTH_CHANGED` 消息且本地 token 为空时调用 `setAuth()` 写入收到的认证数据；(c) 若浏览器不支持 BroadcastChannel，`getChannel()` 每次返回 null，静默降级；(d) `clearAuth()` 广播时 token/role/user 传 null 以通知其他标签页清除认证状态。
    - **明确标注**: 此方案为强建议，建议与 S8 核心修复（localStorage -> sessionStorage 迁移）一同交付。不做跨标签页同步不会导致数据错误——但会导致上述三种场景的 UX 退化（新标签页/外部链接/右键打开均需重新登录）。若因工期等原因暂不实施，应在产品层面评估 UX 退化是否可接受。
  - **与其他修复的交互**: S8 的 `clearAuth()` 需调用 S1 暴露的 `clearHomeCache()` 和 S2 暴露的 `clearPlanCache()` 函数，以清理 sessionStorage 中的缓存数据（参见 8.3(b) 缓解措施和 8.3(e) 交互B）。修改清单：(a) `clearAuth()` 函数末尾追加 `clearHomeCache()` 和 `clearPlanCache()` 调用；(b) authStore 顶部 import 引入 homeStore 和 lifePlanStore 的清理函数（或通过事件总线解耦）。
- **验证方法**: DevTools Application > Session Storage 中检查 token 键值存在；关闭浏览器标签页后重新打开，检查是否重定向到登录页（而非自动登录）；在 Application > Local Storage 中确认无 token 残留。

### S9. fetchAnalysis() 无竞态保护

- **诊断结论**: **确认 — 代码偏离一致性约定**
- **严重程度**: 中（todo.md 定级"严重"，本报告调整为"中"——触发概率低，需快速切换筛选/重进页面；同文件内已有防竞态模板。）
- **设计依据**: 无直接设计文档显式规定，但 punchStore 内部一致性要求：
  - `fetchList()`（第59-83行）和 `loadMore()`（第92-118行）均实现了 `requestId` 快照竞态保护
- **代码证据**: `src/stores/punchStore.ts:125-135` — `fetchAnalysis()` 无 `requestId` 快照机制，直接 `analysis.value = await getPunchAnalysis()`；对比同文件 `fetchList()`（第63行：`const snapshot = requestId.value`）、`loadMore()`（第97行：同样模式）。
- **因果链**: 同一 Store 内 `fetchList` 和 `loadMore` 有防竞态机制 → `fetchAnalysis` 作为同模式的异步拉取操作遗漏了相同的保护 → 快速页面切换场景下旧响应可能覆盖新请求状态。
- **影响范围**: 快速切换筛选条件或重进页面时分析数据可能短暂错乱。
- **修复建议**:
  - **修改文件**: `src/stores/punchStore.ts:125-135` — `fetchAnalysis()` 函数
  - **关键逻辑**: (a) 函数开头增加 `requestId.value++` 和 `const snapshot = requestId.value`；(b) `try` 块中 `analysis.value = await getPunchAnalysis()` 之后增加 `if (snapshot !== requestId.value) return`；(c) `catch` 块中 `analysisError.value = ...` 之前同样检查快照；(d) `finally` 块中检查快照后再设置 `analysisLoading.value = false`（参考 `fetchList` 第79-83行的 finally 模式）。
  - **边界条件**: `fetchAnalysis` 在 `onMounted` 中被 fire-and-forget 调用（`store.fetchAnalysis()` 不 await），快照保护在 fire-and-forget 场景下同样有效——新请求会递增 requestId 使旧响应的快照失效。
- **验证方法**: 在 Network 面板中模拟 Slow 3G 网络；快速连续两次进入 /profile/punch 页面（间隔 < 500ms），检查分析区数据是否与第二次请求的响应一致（而非第一次慢响应的数据覆盖了第二次的结果）。

### S10. DOMPurify 使用默认配置，未加固安全参数

- **诊断结论**: **确认 — 安全加固缺失**
- **严重程度**: 中（todo.md 定级"严重"，本报告调整为"中"——默认配置已有良好防护，ALLOWED_TAGS 缺失属加固层面非立即可利用漏洞。）
- **设计依据**:
  - 1.3节技术选型表（第120行）：`DOMPurify 3.x | HTML净化库，marked.js渲染Markdown后防XSS`
  - 设计文档未显式要求配置白名单参数
- **代码证据**: `src/views/Home.vue:116`、`src/views/LifePlan.vue:98`、`src/views/Punch.vue:59` — 三处均调用 `DOMPurify.sanitize(html)` 使用默认配置，未传第二个 options 参数设定 `ALLOWED_TAGS`/`ALLOWED_ATTR`。
- **因果链**: 设计文档引入 DOMPurify 的目的就是防 XSS → 默认配置对常规 HTML 注入已有良好防护 → 但默认配置允许的标签和属性集较宽泛（如允许 `<form>`、`<style>`、`on*` 事件属性等），在 Markdown 渲染场景下存在潜在的 XSS 绕过风险。
- **影响范围**: 所有 Markdown→HTML 净化管道（LifePlan方案内容、Punch AI分析评语、Home类型弹层）。
- **修复建议**:
  - **修改文件**: 新建 `src/utils/sanitize.ts` → 同时修改 `src/views/Home.vue:116`、`src/views/LifePlan.vue:98`、`src/views/Punch.vue:59` 三处调用
  - **关键逻辑**: (a) 创建 `sanitizeHtml(html: string): string` 统一函数，配置白名单参数：
    - `ALLOWED_TAGS`: `['h1','h2','h3','h4','h5','h6','p','br','strong','em','b','i','u','s','a','ul','ol','li','blockquote','code','pre','hr','table','thead','tbody','tr','th','td','span','div','img']`
    - `ALLOWED_ATTR`: `['href','title','alt','src','width','height','class','style','target']`
    - `ALLOWED_URI_REGEXP`: 仅允许 `http://`、`https://`、`mailto:`、相对路径（`/`开头）
    - `FORBID_TAGS`: `['style','script','iframe','object','embed','form','input','button']`
    - `FORBID_ATTR`: `['onerror','onload','onclick','onmouseover','onfocus','onblur']`
  - (b) 替换三处 `DOMPurify.sanitize(html)` 为 `sanitizeHtml(html)`；(c) Home.vue `escapeHtml` 函数（第132-137行）可整合进统一的 `sanitizeHtml` 或保留为独立函数（纯文本场景专用）。
  - **边界条件**: `<a>` 标签的 `href` 需确保 `target="_blank"` 和 `rel="noopener noreferrer"` 以防范 tabnabbing；`<img>` 标签需保留 `alt` 和 `src` 属性；Markdown 常用于生成 `<code>` 块，需保留。
- **验证方法**: 在 LifePlan 方案内容中尝试注入 `<img src=x onerror=alert(1)>`，检查渲染后 onerror 是否被移除；在 Punch 分析评语中尝试注入 `<a href="javascript:alert(1)">click</a>`，检查 href 是否被移除或替换为 `#`；执行 `vue-tsc --noEmit` 确认新建的 `sanitize.ts` 及三处 import 替换无新增编译错误。

### S11. diabetesType query 参数在 LifePlan 中完全丢失

- **诊断结论**: **确认 — 代码偏离设计**
- **严重程度**: 低（todo.md 定级"严重"，本报告调整为"低"——仅影响展示提示条完整性，不影响核心功能。）
- **设计依据**:
  - 1.2节跨组件通信机制（第107行）：`路由 query params（如 /life-plan?riskLevel=high&diabetesType=2型）在目标页面的 onMounted 中读取`
- **代码证据**: `src/views/Risk.vue:331` — `router.push({ path: '/life-plan', query: { riskLevel: ..., diabetesType: ... } })` 传入了两个参数；`src/views/LifePlan.vue:88-91` — `riskLevelHint` computed 仅读取 `route.query.riskLevel`，完全忽略 `route.query.diabetesType`。
- **因果链**: 设计明确通过 query 传递两个参数 → 发送方 Risk.vue 正确传递了两个 → 接收方 LifePlan.vue 仅消费了 riskLevel → diabetesType 被静默丢弃。
- **影响范围**: 用户无法在 LifePlan 页面看到自己所属的糖尿病类型提示。
- **修复建议**:
  - **修改文件**: `src/views/LifePlan.vue:88-91` — `riskLevelHint` computed（或新增 `diabetesTypeHint` computed）
  - **关键逻辑**: (a) 新增 `const diabetesTypeHint = computed(() => { const q = route.query.diabetesType; return typeof q === 'string' && q ? q : ''; })`；(b) 在模板的 query 提示条中，将 `{{ riskLevelHint }}` 扩展为同时展示 diabetesType（如"基于您的「2型糖尿病」「高风险」评估为您定制方案"）；(c) 或复用 `enumLabel('diabetes_type', diabetesTypeHint)` 映射中文显示。
  - **边界条件**: 如果 `riskForm.result` 已消费（S4修复后），优先使用 `riskForm.result.matched_diabetes_type` 而非 `route.query.diabetesType`（result 数据更权威）；两者均缺失时不展示类型提示而非报错。
- **验证方法**: 从 Risk 页面完成风险预测（选择糖尿病类型为"2型"）后跳转至 LifePlan，检查页面提示条是否包含"2型糖尿病"文案；直接访问 /life-plan（无 query 参数），检查提示条不崩溃且不展示类型信息。

### S12. LifePlan → Punch 打卡联动路径不一致

- **诊断结论**: **确认 — 两条路径的数据一致性依赖后端同步写入（条件成立）**。若后端为异步队列写入则需补充前端状态直通，但设计文档 API 契约证据支持同步写入前提。
- **严重程度**: 低（todo.md 定级"严重"，本报告调整为"低"——设计选择问题而非代码错误，无代码修改需求。）
- **设计依据**:
  - 4.2节状态管理表（第3488行）：`Punch.vue | 组件内 ref + API | 打卡记录列表数据`
  - Punch.vue流程图（第3782行）：`GET /api/punch/list`（从后端拉取，非从 store 读取）
  - 设计文档未要求 LifePlan 的打卡状态与 Punch 的列表视图间的前端直接共享
- **代码证据**: `src/views/LifePlan.vue:236-273` — 打卡操作通过 `store.createPunch()` 调用 `POST /api/punch` 并使用本地 `completedMap`；`src/views/Punch.vue:135-147` — 通过 `store.fetchList()` 调用 `GET /api/punch/list` 从后端拉取。两条路径通过后端 API 串联，无前端直接状态共享。
- **因果链**: 设计选择"前端写后端 + 前端从后端读"的间接一致性模型 → LifePlan 的 `completedMap` 和 Punch 的 `records` 是两套独立状态 → 从 LifePlan 打卡后立即跳转 Punch 页面，需等待 `fetchList` API 返回才能看到最新数据（依赖后端写入已生效）。
- **后端写入语义证据（v12新增）**: 设计文档 3.2.16 节（第1913-1939行）`POST /api/punch` 的响应状态码为 **HTTP 201（Created）**，响应体包含已创建的完整打卡记录（含 `id`、`punch_time` 等服务端生成字段）。HTTP 201 语义约定要求资源在响应返回前已持久化创建——这是 REST API 的语义契约，表明后端对 `POST /api/punch` 采用同步写入模型（数据库事务在响应返回前已提交）。此外，设计文档 6 节接口测试规范（第6220行）的验证方法为"curl + 数据库验证"，进一步确认写入路径为同步持久化。**结论：设计文档 API 契约支持后端同步写入前提，"间接一致性模型无需代码修改"的判断成立，前提已有文档证据支撑。**
- **影响范围**: 用户体验上，从 LifePlan 打卡后进入 Punch 页面可能看不到刚提交的打卡记录（取决于后端写入延迟），但功能正确性由后端 API 契约保证。

- **三元判断**:
  1. **是否需要代码修改**: 不需要。当前实现符合设计文档选择的间接一致性模型（前端写后端 + 前端从后端读），两条打卡路径通过后端 API 串联是正确的架构选择。后端 `POST /api/punch` 的 HTTP 201 响应契约（3.2.16 节）已提供同步写入证据——数据库事务在响应返回前已提交，`GET /api/punch/list` 后续请求可读取到已写入记录。在前端直接共享 `completedMap` 和 `records` 状态会引入状态同步复杂度（如冲突合并、乐观更新回滚传播），且设计文档未要求前端状态共享。
  2. **是否需要设计文档补充**: 可选。建议在数据流文档中注明：(a) LifePlan 内打卡与 Punch 列表展示采用间接一致性模型（consistency = eventual, via backend API）；(b) 后端 `POST /api/punch` 的 HTTP 201 契约保证写入在响应返回前已持久化，前端从 LifePlan 打卡后立即跳转 Punch 页面时 `GET /api/punch/list` 可读取到最新记录（延迟为数据库写入 + API 往返时间，通常 < 100ms）；(c) 前后端契约保证 `POST /api/punch` 写入在 `GET /api/punch/list` 读取之前已生效（数据库事务已提交）。
  3. **是否需要验证**: 可选——设计文档已提供 HTTP 201 同步写入的证据（v12 补充）。若团队仍希望运行时二次确认——确认从 LifePlan 打卡后立即跳转 Punch 页面能看到最新记录。若立刻可见则设计文档同步写入契约在运行环境中实际生效；若需刷新后才可见则后端可能存在实现偏差（未严格遵循 HTTP 201 语义），需评估是否需要前端状态直通。

- **修复建议**: 无需代码修改。建议在 `docs/2_detailed_design_v3.md` 中补充一条注释说明间接一致性模型。
- **验证方法**: 在 LifePlan 中执行一次打卡（点击完成），立即通过导航跳转到 /profile/punch，观察打卡记录列表是否包含刚提交的记录。若立刻可见，说明后端同步写入机制正常；若需刷新后才可见，说明后端存在写入延迟，需评估是否需要前端状态直通。

### S13. 路由守卫 requiresDisclaimer 策略不一致

- **诊断结论**: **设计对齐 — 代码符合设计文档，但设计内部存在一致性疑问**
- **严重程度**: 低（todo.md 定级"严重"，本报告调整为"低"——代码完全遵循设计文档，内部矛盾存在于设计层面，非代码偏差。）
- **设计依据**:
  - 1.6.2节路由守卫代码示例（第493-494行）：Punch 路由未设置 `requiresDisclaimer: true`
  - 1.6.2节免责声明拦截流程说明（第577-578行）：`涉及AI生成内容的路由（医师对话/生活方案/风险预测/健康建议）首次访问前必须确认免责声明` — Punch 不在所列路由中
- **代码证据**: `src/router/index.ts:37-39` — Punch 路由仅设置 `meta: { requiresAuth: true }`，未设置 `requiresDisclaimer`，与设计文档完全一致。
- **因果链**: 设计文档明确列出了需要免责声明的4个路由（医师对话/生活方案/风险预测/健康建议），Punch 不在其中 → 代码严格遵循设计 → 但 Punch 页面确实展示了 AI 生成的分析内容（依从性评语、改进建议），与免责声明覆盖"AI生成内容"的原则存在逻辑矛盾。
- **诊断说明**: 这不是代码偏离设计的问题，而是设计文档的内部一致性疑问。若团队认为 Punch 的 AI 分析内容需要免责声明保护，应首先修改设计文档再更新代码。
- **修复建议**:
  - **修改文件**: 取决于设计决策：(a) 若决定 Punch 需要免责声明 → 修改 `docs/2_detailed_design_v3.md` 1.6.2节免责声明路由列表，增加 Punch；然后修改 `src/router/index.ts:37-39` — Punch 路由 `meta` 增加 `requiresDisclaimer: true`；(b) 若决定 Punch 不需要免责声明 → 在设计文档中注明原因（如"Punch 页面展示的是统计性分析而非生成式AI内容，不触发免责声明要求"）。
  - **边界条件**: 若增加 `requiresDisclaimer: true`，需同步检查 Punch 页面的 AI 免责提示条（`src/views/Punch.vue:264-266`）是否与路由守卫的免责声明弹窗构成双重确认（产品层面决定是否保留双保险）。
- **验证方法**: 若增加 `requiresDisclaimer: true`：清除 `disclaimer_accepted` localStorage 标记，访问 /profile/punch，检查是否弹出免责声明弹窗；若决定不增加：确认设计文档已更新说明理由。

---

## 3. 一般问题逐项诊断

### G1. LifePlan.vue 组件树 CSS class / 按钮文案与设计文档有偏差

- **诊断结论**: **确认**
- **设计依据**: 4.1.4节LifePlan.vue组件DOM树（第3072行起）使用 `empty-state` 类名，使用 `<img>` 插图，按钮文案为"开始风险预测 / 生成我的生活方案"
- **代码证据**: `src/views/LifePlan.vue:337-342` — 使用 `lp-empty` 类名，FontAwesome `<i>` 图标代替 `<img>`，按钮文案"立即定制方案"
- **诊断说明**: CSS命名和图标实现方式的偏差不影响功能，但偏离了组件树规格。按钮文案简化是合理的UI精简。
- **修复建议**: (a) 确认 `lp-empty` 是否作为有意设计偏离保留（CSS 命名不强制对齐，但建议在代码注释中标注对应设计位置）；(b) FontAwesome 图标替代 `<img>` 是可接受的技术选择（减少静态资源依赖），无需修改；(c) 按钮文案"立即定制方案"建议修改为"生成我的生活方案"以对齐设计文案，或确认当前文案为有意简化。
- **验证方法**: 检查引导态（viewMode === 'empty'）的按钮文案是否符合设计预期；检查 CSS 类名在项目中是否一致使用（如一致性选择 `lp-*` 前缀则设计文档应更新）。

### G2. Home.vue 糖尿病类型区"全部"链接为静态占位

- **诊断结论**: **确认**
- **设计依据**: 4.1.2节Home.vue组件DOM树（第3009行）：`<a>全部</a>` — 为 `<a>` 标签，暗示可点击链接
- **代码证据**: `src/views/Home.vue:293-295` — 使用 `<span class="section-link-static">`，无点击事件
- **诊断说明**: 设计标注为链接元素但未在其流程图或交互描述中定义"全部"的跳转目标，存在设计模糊性。代码使用 `<span>` 静态占位是保守处理。
- **修复建议**: 两种选择：(a) 改为 `<button class="section-link" @click="goTypesList">全部</button>`——跳转至糖尿病类型科普列表页（需确认是否存在对应路由 `/diabetes-types` 或直接在页面内展开全部列表）；(b) 保持 `<span>` 占位，在设计文档中标注"全部链接为预留入口，待后续迭代实现"。建议选择 (b) 除非后端已提供完整的糖尿病类型列表接口且前端有对应列表页。
- **验证方法**: 若选择 (a)：点击"全部"检查跳转行为是否正确；若选择 (b)：确认设计文档已更新标注。

### G3. Punch.vue 分析区缺少环形图，趋势图实现差异

- **诊断结论**: **确认**
- **设计依据**: 4.3节Punch.vue流程图（第3797行）：`分析数据展示 完成率环形图 近7天趋势柱状图`
- **代码证据**: `src/views/Punch.vue:192-266` — 完成率为渐变文字百分比，无SVG环形图；趋势图为纯CSS叠柱（饮食+运动合并柱），非独立柱状图
- **诊断说明**: 环形图缺失是功能遗漏；趋势图实现方式差异是UI选择问题，CSS叠柱在数据可视化效果上可接受。
- **修复建议**:
  - **修改文件**: `src/views/Punch.vue` — 统计卡区域（第192-209行）替换为环形图
  - **关键逻辑**: (a) 完成率展示由渐变文字替换为 SVG 环形图（两种方案：纯 SVG `<circle>` + `stroke-dasharray` 实现，或引入轻量图表库如 chart.js）；建议使用 SVG 实现避免引入额外依赖——`<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" stroke-dasharray="251.2" stroke-dashoffset="251.2 * (1 - rate)" /></svg>`；(b) 趋势图保持当前 CSS 叠柱实现（可接受）。
  - **边界条件**: 完成率为 0% 时环形图 stroke-dashoffset 为最大值（空白环）；完成率为 null/undefined 时展示 '-' 而非环形图；环形图动画使用 CSS transition 实现填充动画效果。
- **验证方法**: 检查分析区完成率是否展示为环形图而非纯文字；检查不同完成率下环形图的填充比例是否正确（如 75% 应展示 3/4 环）。

### G4. Punch.vue 滚动监听 + 加载更多按钮双模式冗余

- **诊断结论**: **部分确认 — 双模式均有设计依据，但未明确二选一还是并存**
- **设计依据**: 4.1.8节组件DOM树（第3327-3328行）含 `<button id="btn-load-more">加载更多`；4.3节Punch.vue流程图（第3795行）：`滚动到底部 → page++ → GET /api/punch/list?page=N 追加渲染 无限滚动`
- **代码证据**: `src/views/Punch.vue:107-118` — 实现了滚动监听无限加载；`src/views/Punch.vue:427-433` — 同时存在手动"加载更多"按钮
- **诊断说明**: 设计文档在不同位置分别描述了按钮和无限滚动两种模式，未明确"二选一"。代码的并存实现虽然有冗余，但提供了双保险的用户体验。
- **修复建议**: 保持当前双模式实现（无功能缺陷，且提供双保险用户体验）。建议在设计文档中标注两种模式为有意并存（第3327行按钮模式 + 第3795行无限滚动模式），说明在设计阶段未明确二选一，代码实现选择双保险策略。无需修改代码。
- **验证方法**: 滚动到列表底部检查是否自动加载更多记录；点击"加载更多"按钮检查是否追加记录。

### G5. LifePlan.vue 打卡弹窗交互顺序与流程图有差异

- **诊断结论**: **不成立 — 代码实现优于设计文档规定（设计文档应更新以匹配更优实现）**
- **设计依据**: 4.3节LifePlan.vue流程图（第3631-3633行）：`打卡操作 → 点击方案项旁打卡按钮 → POST /api/punch → SweetAlert2确认弹窗`
- **代码证据**: `src/views/LifePlan.vue:236-273` — 先弹出 SweetAlert2 弹窗（收集用户确认和备注），用户确认后才调用 `POST /api/punch`
- **诊断说明**: 代码实现顺序（先弹窗后API）避免了用户取消后的无效API调用，是更优的交互设计。此处的设计文档顺序（先API后弹窗）反而不合理——用户还未确认操作就已发出网络请求。无需修改代码。

- **修复建议**: 无需修改代码。建议更新设计文档 4.3节 LifePlan.vue流程图，将步骤顺序调整为"点击打卡按钮 → SweetAlert2 确认弹窗 → POST /api/punch → 乐观更新 completedMap"，以匹配当前更优的代码实现。
- **验证方法**: 点击打卡按钮后检查弹窗顺序（应先弹窗再发 API）；取消弹窗后检查 Network 面板无 POST /api/punch 请求。

### G6. Punch.vue 缺少 refresh 刷新按钮

- **诊断结论**: **确认**
- **设计依据**: 4.1.8节Punch.vue组件DOM树（第3298行）：`<button class="btn-icon" id="btn-refresh"> <i class="fas fa-sync">`
- **代码证据**: `src/views/Punch.vue:270-304` — 筛选区仅包含日期输入和类型chip按钮，无刷新按钮
- **诊断说明**: 明确的组件树元素遗漏。
- **修复建议**:
  - **修改文件**: `src/views/Punch.vue` — 筛选区模板（第270-304行之间）
  - **关键逻辑**: (a) 在日期筛选行内或 chip 行内增加 `<button class="btn-icon press" @click="onRefresh"><i class="fa-solid fa-rotate"></i></button>`；(b) `onRefresh()` 函数调用 `store.fetchList()` 和 `store.fetchAnalysis()` 同时刷新列表和分析。
  - **边界条件**: 刷新按钮在加载中时应显示旋转动画（`fa-spin` class）并禁用防双击；刷新操作应保持当前筛选条件不变。
- **验证方法**: 检查筛选区是否新增刷新图标按钮；点击刷新后检查 Network 面板中 /api/punch/list 和 /api/punch/analysis 是否重新发出。

### G7. safeContentHtml / safeAnalysisHtml 函数重复定义

- **诊断结论**: **确认**
- **设计依据**: 非设计合规性问题，属代码质量（DRY原则）
- **代码证据**: `src/views/LifePlan.vue:94-99` 与 `src/views/Punch.vue:55-60` — 两处实现逻辑完全相同：`marked.parse() → DOMPurify.sanitize()`
- **诊断说明**: 无设计偏离，纯代码组织问题。
- **修复建议**:
  - **修改文件**: 新建 `src/composables/useMarkdown.ts` → 修改 `src/views/LifePlan.vue:94-99` 和 `src/views/Punch.vue:55-60`
  - **关键逻辑**: (a) 创建 `export function renderMarkdown(markdown: unknown): string` 统一函数，包含 `marked.parse() → DOMPurify.sanitize()` 管道；(b) 替换两处本地函数为 `import { renderMarkdown } from '@/composables/useMarkdown'` 并调用。
  - **边界条件**: `marked.parse` 当前使用 `{ async: false }`（同步模式），抽取后保持一致；若后续迁移至异步模式（G16），统一函数为唯一修改点。
- **验证方法**: 检查 LifePlan 方案内容渲染和 Punch AI 分析渲染是否正常（Markdown→HTML 管道功能不变）。

### G8. getErrorMessage 函数重复定义

- **诊断结论**: **确认**
- **诊断说明**: 同G7，LifePlan.vue:102-109 与 Punch.vue:63-77 逻辑重复。
- **修复建议**:
  - **修改文件**: 新建 `src/utils/errorMessage.ts` → 修改 `src/views/LifePlan.vue:102-109` 和 `src/views/Punch.vue:63-77`
  - **关键逻辑**: (a) 创建 `export function getErrorMessage(err: unknown, fallback?: string): string` 统一函数；(b) 替换两处本地函数为 import 调用。
  - **边界条件**: `fallback` 默认值设为 `'操作失败，请稍后重试'`（当前两处的各自默认值不同，抽取后统一使用默认参数）。
- **验证方法**: 在 LifePlan 和 Punch 中触发 API 错误（如断网），检查错误文案是否正确显示；执行 `vue-tsc --noEmit` 确认新建的 `errorMessage.ts` 无新增编译错误。

### G9. DiabetesTypeView 接口在组件和 Store 中重复定义

- **诊断结论**: **确认**
- **代码证据**: `src/views/Home.vue:17-20` 与 `src/stores/homeStore.ts:7-12` 独立定义相同结构的接口
- **诊断说明**: 两处定义如果不同步修改，TypeScript不会报错（因为是两个不同的接口定义），存在维护风险。
- **修复建议**:
  - **修改文件**: `src/stores/homeStore.ts:7` — 导出接口 → `src/views/Home.vue:17-20` — 改为 import
  - **关键逻辑**: (a) `homeStore.ts` 中将 `interface DiabetesTypeView` 前加 `export`；(b) `Home.vue` 中删除本地 `DiabetesTypeView` 定义，改为 `import type { DiabetesTypeView } from '@/stores/homeStore'`（如果 store 不暴露类型到公共 API 层，可考虑将其移至 `src/types/api.ts` 或 `src/types/home.ts`）。
  - **边界条件**: 确保两处接口字段完全一致后合并；若 store 端的接口后续增加字段（如 `cover` 的 fallback 逻辑扩展），组件自动同步。
- **验证方法**: 删除 Home.vue 本地接口定义后，TypeScript 编译无报错（证明 import 的接口已覆盖所有使用）；确认删除前的两处接口定义是否完全相同——若有差异需先统一字段再合并。

### G10. riskFormStore formData 缺少运行时类型守卫

- **诊断结论**: **确认**
- **代码证据**: `src/stores/riskFormStore.ts:45-70` — `loadFromStorage()` 仅做字段名白名单过滤（`allowedKeys`），不做值类型校验（如 `age` 可能被存为字符串 `"25"` 而非数字 `25`）
- **诊断说明**: sessionStorage 的 JSON 序列化/反序列化循环中，`v-model.number` 清空后重新赋值时，类型污染可能发生。
- **修复建议**:
  - **修改文件**: `src/stores/riskFormStore.ts:45-70` — `loadFromStorage()` 函数
  - **关键逻辑**: 对数字字段（`age`、`height`、`weight`、`waist`、`systolic_bp`）在赋值前使用 `Number.isFinite(Number(value)) ? Number(value) : undefined` 强制转换并校验；对枚举字段（`gender`、`diabetes_history`、`family_history`）校验值是否在允许的枚举集合中；对 `diabetes_type` 校验是否在 `['type1','type2','gestational','other']` 中。
  - **边界条件**: 类型校验失败时将该字段值设为 `undefined` 而非抛出错误（静默丢弃脏数据，不影响整体恢复）。
- **验证方法**: 在 sessionStorage 中手动修改 `risk_form_data` 的 `age` 值为字符串 `"25"`，刷新页面后检查 `formData.age` 是否被正确转为数字 `25`；将 `gender` 改为 `"invalid"`，检查是否被丢弃。

### G11. LifePlan.vue form 使用 reactive + null，空字符串可能漏过校验

- **诊断结论**: **确认**
- **代码证据**: `src/views/LifePlan.vue:158` — `if (form.age == null || form.age < 1 || form.age > 120) return false`：`== null` 宽松判等仅能捕获 `null` 和 `undefined`，无法捕获空字符串 `''`
- **诊断说明**: Vue 的 `v-model.number` 在输入框清空时可能产生空字符串而非 `null`，取决于浏览器实现。存在用户提交空表单的边界情况。
- **修复建议**:
  - **修改文件**: `src/views/LifePlan.vue` — `validateForm()` 函数（第157-163行）
  - **关键逻辑**: 将 `form.age == null` 替换为 `!Number.isFinite(form.age)`，将 `form.height == null` 替换为 `!Number.isFinite(form.height)`，将 `form.weight == null` 替换为 `!Number.isFinite(form.weight)`。
  - **边界条件**: `Number.isFinite(null)` 返回 `false`（null 转 Number 为 0，但 isFinite 判 NaN），`Number.isFinite('')` 返回 `false`（空字符串转 Number 为 0 但 isFinite 判 NaN），`Number.isFinite(0)` 返回 `true` 但 0 应被业务逻辑拒绝（需独立判断 age/height/weight > 0）。
- **验证方法**: 清空年龄输入框后点击提交，检查是否触发校验提示（而非静默通过）；输入 `0` 检查是否被拒绝。

### G12. escapeHtml 仅 Home.vue 本地函数

- **诊断结论**: **确认**
- **代码证据**: `src/views/Home.vue:132-137` — `escapeHtml()` 定义为本地函数，仅在糖尿病类型弹层中使用
- **诊断说明**: HTML实体转义是通用工具，应抽取到 `src/utils/` 下。
- **修复建议**:
  - **修改文件**: 新建或扩展 `src/utils/sanitize.ts` → 修改 `src/views/Home.vue:132-137`
  - **关键逻辑**: (a) 将 `escapeHtml` 移到 `src/utils/sanitize.ts` 并 `export`；(b) Home.vue 改为 `import { escapeHtml } from '@/utils/sanitize'`；(c) LifePlan 和 Punch 中如也有纯文本展示场景可复用。
  - **边界条件**: `escapeHtml` 与 `DOMPurify.sanitize` 的区别——前者用于纯文本片段（如弹窗中拼接的 HTML 字符串中的文本域），后者用于完整 HTML 片段净化，两者不重复。
- **验证方法**: 在糖尿病类型弹窗中检查病因/临床表现/治疗方式的文本是否正确转义（如含 `<` 的文本不被渲染为 HTML 标签）；执行 `vue-tsc --noEmit` 确认新建的 `sanitize.ts` 及 import 替换无新增编译错误。。

### G13. Punch onScroll 使用 document.documentElement 耦合布局假设

- **诊断结论**: **确认**
- **代码证据**: `src/views/Punch.vue:111` — `const { scrollTop, scrollHeight, clientHeight } = document.documentElement`
- **诊断说明**: 当页面内存在额外的滚动容器（如嵌套子路由导致多个滚动区域）时，`document.documentElement` 的滚动状态可能不代表实际可见区域的滚动位置。
- **修复建议**:
  - **修改文件**: `src/views/Punch.vue:107-118` — `onScroll` 函数和 `onMounted`/`onUnmounted`
  - **关键逻辑**: (a) 使用 `ref` 引用实际的滚动容器：在模板中给列表区外层容器加 `ref="listContainer"`；(b) `onScroll` 中改为 `const { scrollTop, scrollHeight, clientHeight } = listContainer.value`；(c) `addEventListener('scroll', onScroll)` 绑定到 `listContainer.value` 而非 `window`。
  - **边界条件**: 如果当前布局确实是 `document.documentElement` 作为唯一滚动容器（Profile 子路由布局），替代方案风险低，但使用 `ref` 是更健壮的做法——即使未来布局变更也不受影响。
- **验证方法**: 在 Punch 页面滚动到底部，检查是否触发 loadMore（列表追加记录）；在不同浏览器窗口大小下测试。

### G14. API 函数 res.data.data 嵌套解包缺少 success 字段检查

- **诊断结论**: **确认 — 系统性缺陷，修复优先级上调**
- **严重程度**: 中（从 v1 一般问题上调——G14 影响全部 API 调用路径，共涉及 3 个 API composable 文件中 10 个函数，具有系统性影响面。当后端返回 `success: false` + HTTP 200 时，所有调用方将静默接收 null/undefined 数据。）
- **代码证据及受影响文件**:
  - `src/composables/useHomeApi.ts:38-39` — `getDoctors()`: `return res.data.data`
  - `src/composables/useHomeApi.ts:47-48` — `getArticles()`: `return res.data.data`
  - `src/composables/useHomeApi.ts:58-59` — `getDiabetesTypes()`: `return res.data.data`
  - `src/composables/useHomeApi.ts:69-71` — `getDiabetesType(id)`: `return res.data.data`
  - `src/composables/useLifePlanApi.ts:20` — `getCurrentPlan()`: `return res.data.data`
  - `src/composables/useLifePlanApi.ts:35` — `generatePlan()`: `return res.data.data`
  - `src/composables/useLifePlanApi.ts:48` — `adjustPlan()`: `return res.data.data`
  - `src/composables/useLifePlanApi.ts:61` — `createPunch()`: `return res.data.data`
  - `src/composables/usePunchApi.ts:24` — `getPunchList()`: `return { records: res.data.data, pagination: res.data.pagination }`
  - `src/composables/usePunchApi.ts:38` — `getPunchAnalysis()`: `return res.data.data`
  - 共计 **3 个文件，10 个函数**（其中 useHomeApi 4个，useLifePlanApi 4个，usePunchApi 2个）
- **诊断说明**: 当后端返回 `{ success: false, data: null, message: "业务限流" }` (HTTP 200)时，所有 API 函数会将 `null` 作为正常数据返回，调用方无法区分"成功但数据为空"和"业务失败"。

  **后端 `success: false` 实际发生场景**（基于项目 API 设计模式推测）:
  - 业务限流（如短时间内重复生成方案，409 之外可能有 200+success:false）
  - 参数校验失败（如日期范围不合法，后端返回友好错误而非 400）
  - 业务规则拒绝（如已存在活跃方案时不允许重复生成）
  - 数据权限不足（如非管理员访问管理接口）

- **影响范围**: 当 `success: false` 发生时，Store 的 `catch` 块不会触发（HTTP 200 不经过 axios 错误拦截器），导致：(a) 列表用 `null` 渲染导致 blank 态；(b) Store error 字段不更新，UI 错误提示不显示；(c) 用户看不到后端返回的 `message` 错误信息。

- **修复建议**:
  - **修改文件**: `src/composables/useHomeApi.ts`、`src/composables/useLifePlanApi.ts`、`src/composables/usePunchApi.ts` 全部 10 个函数
  - **方案A（各函数内联检查，改动小但重复）**: 每个函数在 `return res.data.data` 前增加 `if (!res.data.success) throw new Error(res.data.message || '请求失败')`。
  - **方案B（响应拦截器统一处理，推荐）**: 在 `src/composables/useApi.ts:19-41` 的响应拦截器 success 分支中增加 `success: false` 检查：
    ```
    api.interceptors.response.use(
      (res) => {
        if (res.data && typeof res.data.success === 'boolean' && !res.data.success) {
          // 构造类 AxiosError 对象以兼容现有 getErrorMessage 函数
          // getErrorMessage（LifePlan.vue:102 / Punch.vue:63）通过 'response' in err 检查提取后端错误消息
          // 直接 new Error(...) 产生的 Error 对象不含 response 属性，会导致后端真实错误消息被 fallback 字符串吞没
          const err = new Error(res.data.message || '请求失败') as Error & { response?: { data?: { message?: string } } }
          err.response = { data: { message: res.data.message } }
          return Promise.reject(err)
        }
        return res
      },
      (err) => { /* 现有 401 处理 */ return Promise.reject(err) }
    )
    ```
    - 优点：一处修改覆盖所有 API 调用，无需修改 10 个 API composable 函数；调用方的 `catch` 块自动触发现有的错误处理逻辑；构造的 Error 对象附加 `response` 属性，与 getErrorMessage 函数完全兼容，后端 `message` 字段可正常提取展示。
    - **Error 对象与三个 Store catch 块的兼容性审计（v12新增）**: 经读取三个 Store 的全部 catch 块进行逐函数审计，确认方案B构造的 Error 对象与所有现有错误处理路径兼容：(1) **punchStore**（`fetchList`第76行、`loadMore`第111行、`fetchAnalysis`第130行）——catch 块模式 `e instanceof Error ? e : new Error(...)` 将 Error 对象原样存入 `error`/`analysisError` ref。组件模板中调用 `getErrorMessage(error)`（Punch.vue:63-77，`'response' in err` 分支提取 `err.response.data.message`）。方案B构造的 Error 满足 `instanceof Error`（通过 Store 直通）+ `'response' in err`（getErrorMessage 提取后端消息），链路完整。(2) **lifePlanStore**（`fetchCurrent`第48行、`generate`第72行、`adjust`第100行、`createPunchAction`第120行）——catch 块模式同为 `e instanceof Error ? e : new Error(...)`。`generate` 还有 409 状态码检查（`e.response?.status`）走 axios error 分支，不经过方案B拦截器。其余路径兼容链与 punchStore 相同。(3) **homeStore**（`fetchHomeData`第44-57行 `Promise.allSettled`）——`docRes.reason`（rejected promise 的 reason）为方案B构造的 Error 对象。`docRes.reason instanceof Error ? docRes.reason : new Error(...)` 将 Error 对象原样存入 `*Error` ref。组件模板中通过 `getErrorMessage` 消费，兼容链相同。**审计结论：方案B构造的 Error 对象（`instanceof Error` + `response` 属性）与三个 Store 的全部 10 个 catch 分支和 2 处 getErrorMessage 调用完全兼容，无需修改 Store 层代码。**
    - **与 G8 的潜在合并方案**: 如果同时执行 G8（抽取 getErrorMessage 为通用工具函数），可在抽取时增加纯 Error 对象的 `message` 提取分支（`if (err instanceof Error && err.message) return err.message`），作为 fallback 路径。两种途径均可解决兼容性问题，建议方案B（响应拦截器构造兼容对象）优先独立交付，G8 抽取时增加兜底分支作为防御层。
    - 需注意：确保后端所有正常响应的 `success` 字段恒为 `true`（当前接口文档确认此约定一致）。
  - **分阶段部署建议（v12新增，v13扩展）**: 方案B一次性全局拦截可能误伤已依赖"静默 null"语义的代码路径（如列表为空时依赖 `v-if="data"` 而非 `v-if="error"` 的判断链）。建议分两阶段部署：(a) **第一阶段（日志收集期）**——在拦截器中使用 `console.warn('[API success:false]', res.config.url, res.data.message)` 记录所有 `success: false` 的发生频率和触发场景，持续一个迭代周期，确认无误报（即所有 `success: false` 确实对应业务错误而非"暂无数据"等合法空态）；(b) **第二阶段（切换为 reject）**——日志收集确认无误报后，将 `console.warn` 替换为 `Promise.reject(err)`。第一阶段日志收集中特别关注 `GET /api/plan/current`（设计文档设计为"无方案时返回 data=null + success=true"，需确认是否有异常场景返回 success=false + data=null）。此分阶段策略确保修复者可在充分了解 `success: false` 实际发生场景后再部署拦截，将回归风险降至最低。
    - **日志收集期间受影响 UI 路径（v13新增）**: 在第一阶段（console.warn 日志收集期），因拦截器未 reject，`success: false` + HTTP 200 的响应仍按当前路径传递 `null` 数据到各 Store，以下 UI 路径将持续经历当前的静默 null 问题：(1) Home 首页——`getDoctors()`/`getArticles()`/`getDiabetesTypes()` 任一返回 `success: false` 时，对应区块 `doctors`/`articles`/`types` ref 被设为 `null`，模板中 `v-if="store.doctors"` 等条件渲染链降级为空态（空白区块），用户无错误提示——**影响面：首页的三个数据区块，任一 API 出现 success:false 时对应区块静默空白**；(2) LifePlan 方案页——`getCurrentPlan()` 返回 `success: false` 时 `currentPlan` 设为 `null`，用户看到空态引导页（"立即定制方案"按钮），无法知晓是"尚无方案"还是"查询失败"——**影响面：用户可能误以为系统正常，反复点击生成方案**；(3) Punch 打卡页——`getPunchAnalysis()` 返回 `success: false` 时 `analysis` 设为 `null`，分析区不渲染（模板中 `v-else-if="store.analysis"` 不被满足，可能回退到 `v-else` 空态），用户看不到分析数据且无错误反馈——**影响面：分析面板静默消失**。以上三条路径的风险告知供修复者和产品团队评估日志收集期（建议1-2个迭代周期，约1-2周）是否可接受——若不可接受过长的静默 null 窗口期，可缩短日志收集期或跳过直接部署方案B（需充分确认 `success: false` 语义后）。
    - **日志收集后决策树（v13新增）**: 日志收集期结束后，按以下决策树处理：(a) 若收集到的全部 `success: false` 均对应业务错误（如限流、参数校验失败、权限不足），确认为无误报 → 进入第二阶段，切换 `console.warn` 为 `Promise.reject`；(b) 若出现 `GET /api/plan/current` 在用户无方案时返回 `success: false + data: null`（而非设计文档规定的 `success: true + data: null`），此为**后端契约偏差**——不应在前端拦截器中 reject，应先与后端确认并修正 API 行为（使其在无方案时返回 `success: true`），待后端修正后再切换为 reject。此场景下可在拦截器中增加白名单逻辑（特定 API + 特定 message 暂不 reject，继续 warn）；(c) 若出现其他 API 在合法空数据场景返回 `success: false`（如分页列表无数据），同理应先修正后端契约。建议日志收集期时长 1-2 周（一个迭代周期），若期间所有 `success: false` 均确认对应业务错误（场景 a），可直接切换。
  - **边界条件**: 需要与后端确认 `success: false` + HTTP 200 的返回值中 `message` 字段是否一定存在（若不存在，兜底为 `'请求失败'`）；`generatePlan()` 的 409 冲突走 axios error（HTTP 409 触发 `(err) => ...` 分支），不经过此 success 检查，逻辑不受影响。
- **验证方法**: Mock 后端返回 `{ success: false, data: null, message: "测试错误" }`（HTTP 200），检查任意 API 调用是否触发 Store error 状态；检查 UI 是否展示错误提示；检查正常 API 调用（`success: true`）是否不受影响。

### G15. loadMore 后 AI 分析不变，用户可能困惑

- **诊断结论**: **确认**
- **代码证据**: `src/stores/punchStore.ts:92-118` — `loadMore()` 仅拉取更多列表记录；`src/views/Punch.vue:144` — `fetchAnalysis()` 仅在 `onMounted` 中调用一次
- **诊断说明**: loadMore 增加页面显示的记录数量后，AI分析统计仍然基于最初加载时的数据范围（可能是全部数据，取决于后端实现），用户在加载更多记录后可能期待分析数据相应更新。
- **修复建议**: 非代码修复。在分析区上方或下方增加提示文案"分析基于当前筛选范围内的打卡记录"，让用户知晓分析数据的范围。若后端 `GET /api/punch/analysis` 已返回全量分析（不受分页参数影响），则当前行为正确，仅需 UI 提示。
- **验证方法**: 加载更多打卡记录后，检查分析区是否有范围说明提示；与后端确认 analysis 接口是否始终返回全量统计。

### G16. marked.parse 使用 { async: false }，未来兼容性风险

- **诊断结论**: **确认**
- **代码证据**: `src/views/LifePlan.vue:96` 和 `src/views/Punch.vue:57` — `marked.parse(markdown, { async: false })`
- **诊断说明**: marked v12 当前支持 `{ async: false }`，但 marked 官方文档提示未来主版本可能移除同步模式。此问题当前不产生运行时错误，属技术债务。
- **修复建议**: 与 G7（Markdown 渲染函数抽取）合并处理——在 `src/composables/useMarkdown.ts` 中实现 `renderMarkdown` 时：(a) 保持当前 `{ async: false }` 同步模式（短期兼容）；(b) 添加注释标注"marked v13+ 可能移除同步模式，届时切换为 `await marked.parse(md)` + Suspense"；(c) 在 `package.json` 中锁定 marked 版本为当前主版本。
- **验证方法**: `npm outdated marked` 检查版本是否有主版本更新；阅读 marked CHANGELOG 确认同步模式移除计划。

### G17. typeFilter ref 与 store filter 状态不同步风险

- **诊断结论**: **确认**
- **代码证据**: `src/views/Punch.vue:26` — `const typeFilter = ref<PunchType | undefined>(undefined)` 独立于 `src/stores/punchStore.ts:19-23` 的 `filter.punch_type`
- **诊断说明**: 两处状态的同步依赖 `onTypeFilter()` 函数手动同时更新两者（第121-124行）。如果未来有其他代码路径修改 `store.filter.punch_type` 而不经过 `onTypeFilter`，UI 将出现不同步。
- **修复建议**:
  - **修改文件**: `src/views/Punch.vue:26` — 将 `typeFilter` 从 `ref` 改为 `computed`
  - **关键逻辑**: `const typeFilter = computed({ get: () => store.filter.punch_type, set: (val: PunchType | undefined) => store.setFilter({ punch_type: val }) })`；删除 `onTypeFilter` 函数和 `typeFilter` ref，将 chip 按钮的 `@click="onTypeFilter(opt.value)"` 改为 `@click="typeFilter = opt.value"`。
  - **边界条件**: `computed` 的 getter 返回 `store.filter.punch_type`（可能为 `undefined`），与当前 `typeFilter` 的初始值 `undefined` 行为一致。
- **验证方法**: 点击类型 chip 切换筛选，观察列表数据、chip 高亮状态、store.filter.punch_type 值三者是否一致；通过其他路径修改 store.filter.punch_type（如 URL 参数恢复），观察 chip 高亮是否同步。

### G18. 缺少 AbortController 取消机制

- **诊断结论**: **确认**
- **代码证据**: `src/composables/useApi.ts:45-48` — `createCancelToken()` 已导出；但所有 API composable 和组件均未在 `onUnmounted` 中调用 `AbortController.abort()`
- **诊断说明**: 工具已就绪但未被集成使用。组件销毁时进行中的 HTTP 请求不会被取消，响应处理可能操作已卸载组件的状态。
- **修复建议**:
  - **修改文件**: `src/composables/useApi.ts` — 在 `api` 实例的请求拦截器中集成 cancel token → 各 API composable 支持传入 `signal` 参数 → `src/views/Home.vue`、`src/views/LifePlan.vue`、`src/views/Punch.vue` 的 `onUnmounted` 中调用 `abort()`
	  - **关键逻辑**: (a) 方案A（推荐）: 不传递 cancel token 到每个 API 调用，而是在 Store 的 action 中使用 `requestId` 竞态快照（punchStore 已有此模式）来丢弃组件卸载后的响应——这比 AbortController 更简单且已部分实现；(b) 方案B: 如果仍希望使用 AbortController，在各 View 组件的 `onUnmounted` 中调用 `abort()` 取消该组件触发的所有进行中请求；(c) 方案A 优先——S9 修复后 punchStore 三个 action 均有 requestId 快照保护，homeStore 的并行请求可通过类似模式（page instance token）在组件卸载后丢弃响应。
	  - **与 S9 的关系（v5新增，v7修订）**: S9（`fetchAnalysis` 竞态保护）为 punchStore 的 `fetchList`/`loadMore`/`fetchAnalysis` 三个 action 实现了 `requestId` 快照模式。G18 需将该模式扩展到 homeStore 和 lifePlanStore。具体需补充保护的 action：(1) `homeStore.fetchHomeData()` —— `Promise.allSettled` 并行请求需增加 page instance token；(2) `lifePlanStore.fetchCurrent()` —— 增加 requestId 快照；(3) `lifePlanStore.generate()` —— 增加 requestId 快照（快速重复点击场景）；(4) `lifePlanStore.adjust()` —— 增加 requestId 快照。S9 完成后 punchStore 已完备，G18 仅需补充 homeStore 和 lifePlanStore。在 8.2 节优先级表中 S9 行和 G18 行通过 [†A] 脚注互相引用。

    **`homeStore.fetchHomeData()` 并行场景的 page instance token 实现（v7新增，v8修订）**: punchStore 的 requestId 模式为顺序调用设计——函数入口 `requestId.value++` 一次，每个 async 调用各自捕获快照后 await。`homeStore.fetchHomeData()` 使用 `Promise.allSettled` 同时发出 3 个请求（getDoctors/getArticles/getDiabetesTypes），3 个请求共享同一次递增产生的 requestId，且同时发出。如果函数被快速重复调用（如组件快速挂载卸载再挂载），第二次调用的 requestId 递增后，第一次调用的全部 3 个并行请求变为过期快照——推荐使用**整体丢弃策略**（page instance token），因为三个请求是同一次页面加载的原子操作。

    **`pageInstanceId` 变量声明位置（v8新增）**: 代码示例中使用 `const pageToken = ++pageInstanceId`，`pageInstanceId` 应在 `src/stores/homeStore.ts` 的 Store 函数体内、`fetchHomeData()` 函数外部声明，以 `let pageInstanceId = 0` 形式存在。`punchStore.ts` 中 `requestId` 的模式可供参考——在 Store 函数体内顶层以 `const requestId = ref(0)` 声明（`punchStore.ts:52`），但 homeStore 的 `pageInstanceId` 无需响应式绑定（仅在 `fetchHomeData` 内部使用），使用普通 `let` 变量即可。完整声明位置为：在 homeStore.ts 的 `export const useHomeStore = defineStore('home', () => {` 之后、`fetchHomeData` 函数定义之前，写入 `let pageInstanceId = 0`。

    **实现代码**：
      ```
      async function fetchHomeData(): Promise<void> {
        const pageToken = ++pageInstanceId  // 入口递增
        loading.value = true
        // ... clear errors ...
        const [docRes, artRes, typeRes] = await Promise.allSettled([...])
        if (pageToken !== pageInstanceId) return  // 三个请求完成后统一检查，过期则整体丢弃
        // ... 回填数据 ...
      }
      ```
      不需要逐请求独立 requestId——三个子请求的响应要么全部采用（当前页面调用），要么全部丢弃（旧页面调用），不存在"部分采用"的合理场景。与 punchStore 的 requestId 模式语义一致（入口递增一次 + await 后快照检查），仅变量名从 `requestId` 改为 `pageInstanceId` 以区分语义（页面实例 vs 请求序列）。
  - **边界条件**: `requestId` 快照方案仅能丢弃响应不更新状态，但 HTTP 请求本身仍会到达后端并消耗服务器资源（与 AbortController 相比的微小劣势）。
- **验证方法**: 快速切换页面（如 Home → LifePlan），在 Network 面板中观察进行中请求是否被 cancel（AbortController 方案）或响应被丢弃（requestId 方案）；检查卸载页面的 Store 状态是否被旧响应污染。

### G19. Store action 命名不一致（fetch/get 前缀混用）

- **诊断结论**: **确认**
- **代码证据**: homeStore 用 `fetchHomeData`、`retryDoctors`/`retryArticles`/`retryTypes`；lifePlanStore 用 `fetchCurrent`、`generate`、`adjust`；punchStore 用 `fetchList`、`loadMore`、`fetchAnalysis`
- **诊断说明**: 无设计违规，纯代码风格不一致。
- **修复建议**: 统一命名约定——`fetch*` 用于 GET 类操作，`create*`/`update*` 用于 POST/PUT 操作，`retry*` 用于重试操作。以下为三个 Store 全部 action 的当前命名与建议统一命名对照表：

  | Store | 当前 action 名 | 操作类型 | 建议统一命名 | 说明 |
  |-------|---------------|---------|-------------|------|
  | homeStore | `fetchHomeData()` | GET x3（并行） | `fetchHomeData()` | 已符合约定，保持不变 |
  | homeStore | `retryDoctors()` | GET（重试） | `retryDoctors()` | 已符合约定，保持不变 |
  | homeStore | `retryArticles()` | GET（重试） | `retryArticles()` | 已符合约定，保持不变 |
  | homeStore | `retryTypes()` | GET（重试） | `retryTypes()` | 已符合约定，保持不变 |
  | lifePlanStore | `fetchCurrent()` | GET | `fetchCurrent()` | 已符合约定，保持不变 |
  | lifePlanStore | `generate()` | POST | `createPlan()` | 建议重命名——`generate` 语义模糊（是"生成请求"还是"生成并返回"？），`create` 更精确表达 POST 创建语义 |
  | lifePlanStore | `adjust()` | POST | `updatePlan()` | 建议重命名——`adjust` 非标准 CRUD 动词，`update` 更直观 |
  | lifePlanStore | `retryFetchCurrent()` | GET（重试） | `retryFetchCurrent()` | 已符合约定，保持不变 |
  | punchStore | `fetchList()` | GET | `fetchList()` | 已符合约定，保持不变 |
  | punchStore | `loadMore()` | GET（分页追加） | `fetchMore()` 或保持 `loadMore()` | 可讨论——`loadMore` 是分页加载的行业惯用名，与 `fetch` 前缀体系不完全一致但语义清晰 |
  | punchStore | `fetchAnalysis()` | GET | `fetchAnalysis()` | 已符合约定，保持不变 |

  建议在团队代码规范文档中定义上述约定，逐个 Store 渐进式对齐（lifePlanStore 的 `generate`→`createPlan`、`adjust`→`updatePlan` 涉及调用方同步修改，建议在一个 commit 中完成重命名+所有调用点替换）。`loadMore` 可保留为特例（行业惯例命名）。
- **验证方法**: 检查团队代码规范文档中是否已有 Store action 命名约定；重命名后 `vue-tsc --noEmit` 确认无编译错误。

### G20. Store error 字段粒度不一致

- **诊断结论**: **确认**
- **代码证据**: homeStore 按数据区块分（`doctorsError`/`articlesError`/`typesError`，3个独立）；lifePlanStore 按操作分（`error`/`generateError`/`adjustError`，3个独立）；punchStore 按资源分（`error`/`analysisError`，2个独立）
- **诊断说明**: 三种不同的错误分类策略反映了三种不同的心智模型，不利于新开发者理解和维护。
- **修复建议**: 统一按资源拆分策略（推荐）：每个 Store 中，每种数据资源对应一个独立的 error ref。具体修改清单：
  - **homeStore**（当前已符合，保持不变）: `doctorsError`/`articlesError`/`typesError`——3个独立 ref，按数据区块拆分。
  - **lifePlanStore**（需合并）: 当前 `error`（fetchCurrent 错误）/ `generateError`（generate 错误）/ `adjustError`（adjust 错误）——按操作拆分。建议合并 `generateError` 和 `adjustError` 为 `mutationError`（两者是同一资源 `currentPlan` 的不同 mutation 操作），`error` 保持为 `fetchError`（GET 获取错误）。合并后接口为 `fetchError`/`mutationError`（2个 ref），语义为"获取当前方案是否出错"和"变更方案（生成/调整）是否出错"。
  - **punchStore**（当前已符合，保持不变）: `error`/`analysisError`——2个独立 ref，按资源（列表/分析）拆分。
  修改后的 Store 接口签名对比：
  ```
  // lifePlanStore 当前
  const error = ref<string | null>(null)           // fetchCurrent 错误
  const generateError = ref<string | null>(null)   // generate 错误
  const adjustError = ref<string | null>(null)     // adjust 错误
  
  // lifePlanStore 建议
  const fetchError = ref<string | null>(null)      // fetchCurrent 错误
  const mutationError = ref<string | null>(null)   // generate/adjust 共用错误
  ```
  模板中需同步更新 `v-if="store.generateError"`→`v-if="store.mutationError"`（含对应 `.message` 引用）。此问题的修复优先级低（代码风格），可在代码组织重构时一并处理。
- **验证方法**: 代码风格问题，无运行时验证。检查 Store 接口是否统一。

### G21. Store loading 字段粒度与 error 不对称

- **诊断结论**: **确认**
- **代码证据**: homeStore 单一 `loading` 覆盖三个接口，但错误拆三个；punchStore 三个独立 loading（`listLoading`/`listLoadingMore`/`analysisLoading`）
- **诊断说明**: loading 与 error 的粒度不对称使得 UI 无法精准显示"哪个区块正在加载"。
- **修复建议**: (a) homeStore: 将单一 `loading` 拆分为 `doctorsLoading`/`articlesLoading`/`typesLoading` 三个独立 ref，对应三个已有的 `*Error` 字段（粒度对齐）。拆分后的 Store 接口：
  ```
  // homeStore 当前（loading 与 error 粒度不对称）
  const loading = ref(false)            // 单一，覆盖三个接口
  const doctorsError = ref(...)         // 独立
  const articlesError = ref(...)        // 独立
  const typesError = ref(...)           // 独立
  
  // homeStore 建议（loading 与 error 粒度对齐）
  const doctorsLoading = ref(false)     // 独立，对应 doctorsError
  const articlesLoading = ref(false)    // 独立，对应 articlesError
  const typesLoading = ref(false)       // 独立，对应 typesError
  const loading = computed(() =>        // 整体加载标志（首屏用）
    doctorsLoading.value || articlesLoading.value || typesLoading.value
  )
  ```
  (b) `fetchHomeData` 中使用 `Promise.allSettled` 时在各 settled 分支中设置对应的 `*Loading` 状态——`doctorsLoading` 在 `getDoctors` settled 后置 false（无论成功/失败），以此类推。`loading` computed 自动聚合三个独立 loading。(c) 重试场景（`retryDoctors`/`retryArticles`/`retryTypes`）仅设置对应的 `*Loading` 为 true，`loading` computed 自动反映——首屏整体骨架屏消失后，重试某区块时仅该区块展示独立 loading 指示器。(d) `punchStore` 当前三个独立 loading（`listLoading`/`listLoadingMore`/`analysisLoading`）保持现状——粒度已合理。修改涉及 homeStore.ts（新增3个 ref + 1个 computed + `fetchHomeData`/`retry*` 中 loading 赋值调整）和 Home.vue 模板（`v-if="store.loading"` 首屏整体骨架屏保持不变，各区块增加 `v-if="store.doctorsLoading"` 独立加载指示器用于重试场景）。
- **验证方法**: Home 页面首次加载时，检查骨架屏/loading 指标是否按区块展示（而非全页单一 loading）。

### G22. Store retry* 方法实现模式不统一

- **诊断结论**: **确认**
- **代码证据**: `retryDoctors()`/`retryArticles()`/`retryTypes()` 无参数无返回值；`retryGenerate(req)` 带参数有返回值；`retryFetchCurrent()` 无参数无返回值
- **诊断说明**: 命名和签名不一致是代码演进中缺乏统一review的结果。
- **修复建议**: 统一为两种策略之一：(a) **统一无参模式（推荐）**: `retryXxx(): Promise<void>`。对于 `retryGenerate(req)` 这类需要请求参数的场景，改为从 Store state 中缓存上次 `generate` 的请求参数——在 `generate(req)` 函数中将 `req` 保存到 `lastGenerateReq` ref，`retryGenerate()` 读取 `lastGenerateReq` 重放请求。这样所有 `retry*` 方法签名统一为无参，调用方（模板中的重试按钮 `@click`）无需关心参数传递。(b) **标注为有意设计差异**: 若不统一，在设计文档或 Store 注释中明确说明 `retryGenerate(req)` 需要参数的原因（例如 generate 参数包含用户敏感输入，不应缓存在 Store 中），避免后续开发者误以为其他 `retry*` 也应为带参签名。推荐策略 (a)——参数缓存到 Store 是常规模式，不引入安全风险（generate 参数为年龄/身高/体重等表单数据，非敏感信息），且能消除接口不一致带来的认知负担。修改涉及 `lifePlanStore.ts`（新增 `lastGenerateReq` ref + `generate()` 中保存参数 + `retryGenerate()` 改为无参并读取缓存）和模板中重试按钮（移除参数传递）。
- **验证方法**: 代码风格问题，检查重试按钮的行为是否正常。

### G23. api.ts 类型定义与 API composable 脱节（死代码）

- **诊断结论**: **确认**
- **设计依据**: 3.8节 TypeScript类型定义（第2-31行）定义了 `ApiResponse<T>`/`ApiError`/`PaginatedResponse<T>`
- **代码证据**: `src/types/api.ts:2-31` — 三个通用类型定义存在；但 `useHomeApi.ts`、`useLifePlanApi.ts`、`usePunchApi.ts` 均使用内联类型（如 `{ success: boolean; data: T[]; pagination: PaginationInfo }`），未引用泛型
- **诊断说明**: 类型定义存在但从未被 API composable 引用，属于死代码。要么删除定义以保持简洁，要么统一 API composable 使用泛型。
- **修复建议**: (a) 推荐方案：删除 `ApiResponse<T>` 和 `PaginatedResponse<T>` 死代码（`ApiError` 保留用于类型标注），保持 API composable 的内联类型——内联类型更清晰表达了每个接口的响应结构，无需额外跳转到类型文件查看；(b) 替代方案：统一使用泛型——但需确认所有 API 响应与泛型约束完全兼容。
- **验证方法**: 删除死代码后 TypeScript 编译无报错（确认无其他文件引用这些类型）。

### G24. page-enter 动画在 Punch.vue 中失效

- **诊断结论**: **确认**
- **代码证据**: `src/views/Punch.vue:155` — 模板使用 `class="punch-page page-enter"`；`src/views/Home.vue:342-349` — `page-enter` 类和 `@keyframes pageEnter` 在 `<style scoped>` 中定义；`src/views/LifePlan.vue:1059-1061` — 有自己的 `page-enter` 定义（引用 `fadeIn` 动画）。Punch.vue 的 `<style scoped>` 中没有 `page-enter` 或 `@keyframes pageEnter` 的任何定义。
- **因果链**: Vue scoped 样式的作用域隔离机制 → Home.vue/LifePlan.vue 中的 `page-enter` 定义仅对各自的组件模板生效 → Punch.vue 使用 `page-enter` class 但在本组件的 scoped 样式中无对应定义 → 动画不生效。
- **影响范围**: Punch.vue 页面进入时无入场动画。
- **修复建议**:
  - **修改文件**: 新建或扩展全局样式文件（如 `src/styles/variables.css` 或 `src/styles/animations.css`）→ 修改 `src/views/Punch.vue` 的 `<style scoped>` 区域
  - **关键逻辑**: (a) 将 `@keyframes pageEnter` 和 `.page-enter` 动画定义从 Home/LifePlan 的 `<style scoped>` 中提取到全局样式文件（不加 scoped）；(b) Punch.vue 无需修改模板（`class="page-enter"` 已存在），只需确保全局样式被正确加载；(c) Home/LifePlan 中删除本地的 `page-enter` 定义（改为依赖全局样式）。
  - **动画效果差异分析（v13新增）**: 提取 `page-enter` 动画到全局样式前，需识别 Home.vue 和 LifePlan.vue 的当前动画效果差异——两者同名但效果不同：(a) **Home.vue** 的 `page-enter` 为 `fadeIn` + `translateY(-20px → 0)`（淡入+上滑，位移 20px），`@keyframes pageEnter` 包含 `opacity` 和 `transform: translateY` 两个属性；(b) **LifePlan.vue** 的 `page-enter` 为纯 `fadeIn`（仅 opacity 0→1，引用 `@keyframes fadeIn`，无位移）。若统一提取为全局样式，必须选择其中一种作为全局定义，另一页面的动画效果将被改变。三种统一选项及影响：(A) **全局 `fadeIn+translateY`**（取 Home.vue 定义）——Punch/LifePlan 获得上滑入场效果，LifePlan 从纯淡入变为淡入上滑，动画感受更活泼但与其他页面产生位移差异；(B) **全局纯 `fadeIn`**（取 LifePlan.vue 定义）——Home/Punch 失去上滑位移效果，动画感受更克制但 Home 失去当前的上滑动效；(C) **全局基础 `fadeIn` + Home 组件级覆盖 `translateY`**（推荐）——全局定义纯 `fadeIn` 动画基础类 `.page-enter`，Home.vue 在 `<style scoped>` 中通过组合选择器 `.page-enter.home-page` 追加 `translateY` 覆盖。此方案保留了两页面各自的动画效果不变，全局样式提取不产生副作用。实现要点：Home.vue 模板增加 `class="home-page"` 或使用已有唯一类名作为覆盖锚点。
  - **边界条件**: 确保动画效果一致（fadeIn + translateY 或 opacity 过渡）；各页面如需不同的入场动画效果，保留组件级别的覆盖定义。
- **验证方法**: 进入 /profile/punch 页面，检查是否有淡入上移动画效果；进入 Home 和 LifePlan 确认动画不受影响（方案C下 Home 保持上滑、LifePlan 保持纯淡入）。

### G25. press CSS class 重复定义

- **诊断结论**: **确认**
- **代码证据**: LifePlan.vue 和 Punch.vue 各自的 `<style scoped>` 中均定义 `.press:active { transform: scale(0.96) }`
- **诊断说明**: 纯代码复用问题，无功能影响。
- **修复建议**: 与 G24 合并处理——将 `.press:active` 定义提取到全局样式文件（`src/styles/variables.css` 或 `src/styles/utilities.css`），从 LifePlan 和 Punch 的 `<style scoped>` 中删除重复定义。
- **验证方法**: 在 LifePlan 和 Punch 页面中点击按钮，检查按下态是否仍有缩放效果。

### G26. enumLabel 映射表缺少严格类型约束

- **诊断结论**: **确认**
- **代码证据**: `src/utils/enumLabels.ts:1` — `Record<string, Record<string, string>>` 类型过宽，`LABELS.punch_type.die` 这样的拼写错误不会产生编译错误
- **诊断说明**: 使用 `as const satisfies` 可收紧类型约束。
- **修复建议**:
  - **修改文件**: `src/utils/enumLabels.ts:1`
  - **关键逻辑**: (a) 改为 `const LABELS = { ... } as const satisfies Record<string, Record<string, string>>`（TypeScript 4.9+）；(b) 或显式定义内部键的字面量类型：`type LabelCategory = 'gender' | 'family_history' | ...` → `const LABELS: Record<LabelCategory, Record<string, string>>`。
  - **边界条件**: `as const` 后 `LABELS` 的类型变为深度只读，但 `enumLabel` 函数仅读取不写入，不影响功能。
- **验证方法**: 在代码中故意使用错误键名（如 `LABELS.punch_type.die`），检查 TypeScript 是否产生编译错误。

### G27. punchStore.filter 使用 reactive 语义不明确

- **诊断结论**: **确认**
- **代码证据**: `src/stores/punchStore.ts:19-23` — `const filter = reactive<{ startDate?: string; endDate?: string; punch_type?: PunchType }>({})`
- **诊断说明**: `reactive` 的可变性和 `undefined` 清理语义不如 `ref` + 不可变更新清晰。当前代码通过 `setFilter()` 封装了修改逻辑，风险可控但不够理想。
- **修复建议**: (a) 改用 `ref` + 不可变更新模式：`const filter = ref<{ startDate?: string; endDate?: string; punch_type?: PunchType }>({})`，`setFilter` 中使用 `filter.value = { ...filter.value, ...partial }` 替换原地修改；(b) 所有读取 filter 的地方从 `filter.startDate` 改为 `filter.value.startDate`；(c) 传给 `fetchList`/`loadMore` 的参数构建逻辑不变（已在函数内部解构 filter 值）。
- **验证方法**: 修改日期筛选和类型筛选后，检查列表数据、filter 值是否均正确更新。

### G28. Home.vue 搜索图标行为与设计不一致

- **诊断结论**: **确认**
- **设计依据**: 4.1.2节Home.vue组件DOM树（第2979行）：`<i class="fas fa-search"> (搜索图标, 装饰性)`
- **代码证据**: `src/views/Home.vue:87-98` — 搜索图标绑定了 `@click="onSearch"` 事件，弹出 Toast "搜索功能开发中"
- **诊断说明**: 设计标注为"装饰性"（无交互），代码实现为功能占位（有交互但未实现）。差异在意图层面：设计认为不应有点击行为，代码认为应预留入口。
- **修复建议**: 两种选择：(a) 保留功能占位（`@click="onSearch"` 不变），在设计文档组件树中将"装饰性"标注改为"功能占位（待实现）"；(b) 移除 `@click` 事件，改为纯装饰（符合设计标注）。建议选择 (a)——搜索是常见用户预期功能，保留占位提示比空白图标更好的用户体验。
- **验证方法**: 点击搜索图标检查是否弹出"搜索功能开发中" Toast（方案 a）或无反应（方案 b）。

### G29. Punch.vue router.back() 返回路径不确定

- **诊断结论**: **确认**
- **代码证据**: `src/views/Punch.vue:160` — 返回按钮使用 `router.back()` 依赖浏览器历史栈
- **诊断说明**: Punch 页面可通过多个入口进入（Profile子路由、LifePlan跳转、直接URL），`router.back()` 在不同入口场景下返回不同页面，用户体验不一致。
- **修复建议**:
  - **修改文件**: `src/views/Punch.vue:160` — 返回按钮逻辑
  - **关键逻辑**: (a) 使用命名路由 `router.push('/profile')` 替代 `router.back()`——始终返回 Profile 页；(b) 或判断历史栈中是否有前一页（`window.history.length > 1`），有则 `router.back()`，无则 `router.push('/profile')`。
  - **边界条件**: 如果用户通过浏览器地址栏直接访问 /profile/punch（历史栈长度为 1），`router.back()` 将退出应用；使用 `router.push('/profile')` 更安全。
- **验证方法**: 从 LifePlan 进入 Punch 后点击返回，检查是否返回 LifePlan（方案 b）或 Profile（方案 a）；从直接 URL 进入 Punch 后点击返回，检查是否返回 Profile（两种方案均应正确）。

---

## 4. 与设计文档一致性检查汇总

### 4.1 功能遗漏（代码缺失，设计明确要求）

| 设计引用 | 遗漏内容 | 相关Todo |
|---------|---------|---------|
| 4.2/4.3节 Home.vue流程图 | sessionStorage 1小时缓存读写 | S1 |
| 4.2节 LifePlan状态管理 | sessionStorage 30分钟方案缓存 | S2 |
| 4.3节 Punch.vue流程图 | 默认近30天日期筛选 | S3 |
| 1.2/4.2/4.3节 跨模块通信 | LifePlan读取riskFormStore.result | S4 |
| 1.6.1节 路由映射表 | /consultation/doctor/:id 路由及组件（S5b） | S5 |
| 1.6.1节 路由映射表 | /news/article/:id 路由及组件（S5a） | S5 |
| 4.3节 Punch.vue流程图 | 日期变更同步重拉AI分析 | S7 |
| 4.1.8节 Punch组件树 | refresh刷新按钮 | G6 |
| 4.3节 Punch.vue流程图 | 完成率环形图 | G3 |

### 4.2 设计偏差（代码与设计不一致）

| 设计引用 | 设计规定 | 代码实际 | 相关Todo |
|---------|---------|---------|---------|
| 4.3节 Home流程图 | 文章点击跳 `/news/article/:id` | 跳 `/news` 列表页 | S6 |
| 4.1.2节 Home组件树 | 搜索图标"装饰性" | 有点击事件 | G28 |
| 4.1.2节 Home组件树 | 糖尿病类型"全部"为 `<a>` 链接 | `<span>` 无交互 | G2 |
| 4.3节 LifePlan流程图 | 先POST后弹窗 | 先弹窗后POST | G5 * |
| 4.1.4节 LifePlan组件树 | `empty-state` 类名 + `<img>` 插图 | `lp-empty` + FontAwesome图标 | G1 |

> **\* G5 注**: 代码实现顺序（先弹窗后 API）虽偏离设计文档，但避免了用户取消后的无效 API 调用，是更优的交互设计。诊断结论：不成立——仅需更新设计文档流程图顺序以匹配更优实现，无需修改代码。

### 4.3 设计内部矛盾或模糊点

| 设计位置 | 矛盾/模糊内容 | 相关Todo |
|---------|-------------|---------|
| 1.2/4.2 vs 安全最佳实践 | localStorage存储JWT Token的安全性 | S8 |
| 1.6.2节 requiresDisclaimer说明 vs Punch有AI内容 | Punch展示AI分析但不要求免责声明 | S13 |
| 4.1.8 vs 4.3节 | Punch加载更多：按钮模式 vs 无限滚动模式 | G4 |
| 4.1.2节 Home组件树 | "全部"链接无明确跳转目标 | G2 |

---

## 5. 技术可行性评估

对所有42项问题的技术可行性评估结论：**全部可实现，无阻塞性技术障碍**。

具体评估：

- **S1/S2（sessionStorage缓存）**: 浏览器原生API，纯前端实现，无后端依赖。实现复杂度低。需注意缓存键命名空间隔离和时间戳序列化格式。
- **S3（默认日期）**: JavaScript Date计算 + ref赋值。无技术难点。
- **S4（读取result）**: Pinia Store跨组件读取，响应式绑定。`riskFormStore.result` 已存在且类型完备。
- **S5a（ArticleDetailView组件+路由）**: 需新建一个 Vue 组件文件并注册路由。涉及 marked+DOMPurify 渲染，与 LifePlan 内容渲染模式一致。**v9 修正**——后端 `GET /api/articles/:id` 接口已在设计文档 3.2.20 节（第2051行）和 6 节接口测试规范（第6224行）确认返回含 `content`/`is_collected`/`tags`/`summary` 等完整字段的响应体，`Article` 类型与 API 契约之间的缺口是前端类型定义遗漏。修复时需：(a) 新建 `ArticleDetail extends Article { content: string; is_collected: boolean }` 类型；(b) 在 `useHomeApi.ts` 中新增 `getArticle(id: number)` 函数（注意 `id` 为 number，使用 `String(id)` 直接拼接而非 `encodeURIComponent`）；(c) 新建 `ArticleDetailView.vue` 组件渲染文章正文（`marked.parse()` + `DOMPurify.sanitize()`，复用 LifePlan `safeContentHtml` 模式）。复杂度评估：**低**（设计契约已明确，纯前端实现无后端不确定性，降级方案不再必要）。
- **S5b-1（chatStore SSE核心实现）**: **v5 经实际代码验证，v7 经设计文档验证，v9 经全局代码搜索验证**——`chatStore.ts`（13行）为骨架实现：`conversations = ref([])` 空数组，`abortActiveConnection()` 空函数体，无任何 SSE/fetch/WebSocket 代码。`sse.ts` 中定义的类型完全未被引用。**v9 新增发现**：经全局搜索 `src/` 目录确认，代码库中不存在 `useChatApi.ts` 或等价的 chat API composable——`POST /api/chat/doctor/:id` 的前端调用函数（fetch 请求构造、token 附加、响应处理）需从零创建。这与 S5a 的 [†D] 分析对标（`useHomeApi.ts` 中不存在 `getArticle(id)`），确保 S5b-1 的 API 层依赖检查与 S5a 保持同等精度。需从头构建：**fetch + ReadableStream SSE 连接管理**（v7 修正：项目设计文档 `docs/1_requirements_analysis_v1.md` 第15.2节已将 EventSource API 标记为严重技术错误并修正为 `fetch + ReadableStream`——EventSource 不支持自定义 HTTP 头，无法携带 JWT Token 通过认证；`docs/1_requirements_analysis_v2.md` 第989行、`docs/2_detailed_design_v3.md` 第2373行均明确 `fetch POST` + `ReadableStream` 按 `\n\n` 分隔事件块为唯一 SSE 消费方案）、消息收发（`sendMessage` REST API 发送 + SSE 流式接收）、断线重连（fetch 重试 + 指数退避，替代 v6 的 EventSource 自动重连语义）、conversation_id 管理（localStorage 按 doctorId 区分存储键）、多医生会话路由（Map<number, string>）、fabOpen 状态管理、AbortController 集成（与 G18 协同）、**API composable 层新建**（`src/composables/useChatApi.ts`——`sendChatMessage()` 和 `getDoctorInfo()` 函数，对标 S5a [†D] 分析标准）。**复杂度：高**（涉及 SSE 协议在认证场景下的 fetch+ReadableStream 实现、chunk→文本→事件块→JSON 解析管道、断线重连、消息流式渲染、API composable 层从零创建）。硬前置依赖——S5b-2 必须在 S5b-1 完成后才能进行。
- **S5b-2（DoctorChatView组件+路由+Consultation.vue 重构）**: **v6 经实际代码读取 `Consultation.vue`（7行占位）验证**——该组件不含任何医生列表、卡片或跳转逻辑。S5b-2 的实际工作量包含两个独立部分：(a) Consultation.vue 从占位页面重写为医生列表功能页（集成 `getDoctors()` API、v-for 卡片渲染、三态处理、点击跳转）；(b) DoctorChatView.vue 新建 + `/consultation/doctor/:id` 路由注册。**复杂度：高**（从 v5 的"中高"上调——Consultation.vue 的完整构建工作量不亚于 DoctorChatView.vue 的创建）。若团队将 Consultation.vue 的完整实现剥离为独立 Todo 项，则 S5b-2 复杂度可维持"中高"但需标注 Consultation.vue 为独立前置任务。依赖 S5b-1 提供完整的 chatStore 接口，依赖 `getDoctors()` API（已存在于 `useHomeApi.ts`）。
- **S7（日期变更拉分析）**: 在 `setFilter` 中追加一行 `fetchAnalysis()` 调用即可。需注意竞态保护（同S9）。
- **S8（Token安全）**: 切换到 sessionStorage 为纯前端改动（`s/localStorage/sessionStorage/g`），无后端依赖。切换到 HttpOnly Cookie 需后端协同修改登录和验证逻辑。
- **S9（竞态保护）**: 复用 `fetchList` 已有的 `requestId` 快照模式。模式已在本文件中验证可行。
- **S10（DOMPurify加固）**: 在 `sanitize()` 第二个参数中配置 `ALLOWED_TAGS`/`ALLOWED_ATTR`。需梳理 Markdown 渲染场景所需的合法标签集合。
- **G3（环形图）**: SVG/CSS 实现或引入轻量图表库。无 API 依赖。
- **G14（success 字段检查）**: 在 axios 响应拦截器中增加检查，或各 API 函数内联。技术路径明确，无依赖。

上述评估经审查确认：42项问题均无阻塞性技术障碍，所有修复均可通过前端代码修改在现有技术栈内完成。

> **术语说明（v8新增）**: 此处的"阻塞"指**技术可行性层面**的障碍——即是否存在无法通过前端代码修改解决的技术瓶颈（如浏览器API缺失、S5b-1 EventSource→fetch+ReadableStream方案修正后技术路径已验证可行）。8.1节影响面分级中的"功能阻断级"指**用户功能可用性层面**的障碍——即该问题是否导致用户完全无法使用某功能。两处使用同一中文词汇的不同维度含义，在此明确区分以避免修复者混淆。

---

## 6. 逻辑完整性和内部一致性分析

### 6.1 跨页面数据流完整性

当前跨页面数据流存在以下断裂点：

1. **Risk → LifePlan 链路**: Risk.vue 通过 `riskFormStore.saveResult()` 保存了 `result`，并额外通过 query params 传递了 `riskLevel` + `diabetesType`。LifePlan.vue 仅消费了 `riskFormStore.formData`（表单数据），未消费 `result`（预测结果）和 `diabetesType` query 参数。数据传递的3条路径中2条断在接收端。
2. **LifePlan → Punch 链路**: 通过后端API间接串联（`POST /api/punch` → `GET /api/punch/list`），无前端直接共享。设计文档选择此模式，但缺少明确的数据一致性保障说明。

### 6.2 Store 接口一致性

三个 Pinia Store 在以下维度上存在系统性不一致：

| 维度 | homeStore | lifePlanStore | punchStore |
|------|-----------|---------------|------------|
| Action命名 | fetchHomeData, retryXxx | fetchCurrent, generate, adjust | fetchList, loadMore, fetchAnalysis |
| Error粒度 | 按区块（3个） | 按操作（3个） | 按资源（2个） |
| Loading粒度 | 单个覆盖全部 | 按操作（generating+loading独立） | 按操作（3个独立） |
| Retry模式 | retryXxx(): Promise\<void\> | retryGenerate(req): Promise\<boolean\> | retryFetchXxx(): Promise\<void\> |

这种不一致增加了认知负担，但当前不产生功能缺陷。

### 6.3 类型系统一致性

- `ApiResponse<T>`、`ApiError`、`PaginatedResponse<T>` 三个通用类型在 `types/api.ts` 中已定义但未被任何API composable引用
- 所有API composable 使用内联类型，与集中类型定义脱节
- `DiabetesTypeView` 接口在 Home.vue 和 homeStore.ts 中独立定义两份
- 类型系统的这种碎片化增加了接口变更时遗漏更新点的风险

---

## 7. 根因分析

### 根因1: 实现阶段未逐项对齐设计文档4.2节（状态管理方案）

**受影响问题**: S1, S2（sessionStorage缓存缺失）

4.2节在所有组件的状态管理方案表中明确标注了每个页面的 sessionStorage 缓存需求（含过期时间）。实现时三个页面（Home/LifePlan/Punch）仅关注了 Pinia Store 和 API 调用的功能实现，系统性地遗漏了 sessionStorage 缓存层的读写逻辑。

**证据**: 4.2节表格中 sessionStorage 行对 Home、LifePlan、News、Risk 四个页面均有明确描述，但 Home 和 LifePlan 的对应代码中完全不存在 sessionStorage 操作。

### 根因2: 路由拆分（v13修订）后的组件创建工作未完成

**受影响问题**: S5, S6（路由和组件缺失）→ 交叉引用 S6 依赖 S5a

设计文档v13修订时（第6834-6858行）将 Consultation 拆分为 Consultation.vue（医生列表 + 跳转入ロ） + DoctorChatView.vue（医生对话），News 拆分为 NewsView.vue + ArticleDetailView.vue。修订更新了1.6.1路由表和组件树，但实现阶段两个拆分产物均未完整跟进：

- **DoctorChatView.vue**: 文件不存在，`/consultation/doctor/:id` 路由未注册 — 属于"完全缺失"。
- **Consultation.vue**: 文件已存在但为7行占位页面（`<p>医师咨询 — 待组员开发</p>`），不含任何医生列表、卡片渲染或跳转逻辑——属于"已创建但功能未实现"，同样未达到设计文档 4.1.3 节 Consultation.vue 组件树（第3021行起）的功能规格。
- **ArticleDetailView.vue**: 文件不存在，`/news/article/:id` 路由未注册 — 属于"完全缺失"。

**v6修正说明**: v5 及更早版本的根因2仅将"未跟进"限定为新组件文件（DoctorChatView.vue、ArticleDetailView.vue）的创建缺失，遗漏了 Consultation.vue 已存在但为占位状态的分析。这导致因果链不完整——从"路由拆分"到"S5b 医生对话功能不可用"，中间缺少"即使 DoctorChatView.vue 和路由就绪，用户仍需从 Consultation.vue 的医生列表进入对话页，而该入口页当前为占位状态"这一关键环节。v6 将 Consultation.vue 的占位状态纳入根因2的分析范围，完整的因果链为：设计文档将 Consultation 拆分为列表页+对话页 → 实现阶段列表页仅创建占位文件、对话页未创建 → 用户无法从任何正常导航路径进入医生对话功能。

**v9新增 — S5a与S5b完成度层级差异**: 虽然 S5a 和 S5b 同属"路由拆分未跟进"根因，两者的实际缺失程度存在数量级差异。S5a 为**3层缺失**（组件文件 + API函数 `getArticle(id)` + 前端类型 `ArticleDetail`），预估修复工时 2-4h；S5b 为**5层缺失**（chatStore 13行骨架 + Consultation.vue 7行占位入口页 + 组件文件 DoctorChatView.vue + API composable `useChatApi.ts` + SSE 通信层 fetch+ReadableStream 管道），预估修复工时 36-52h（S5b-1 20-28h + S5b-2 16-24h）。两者在修复工作量和复杂度上存在**约10倍差异**（2-4h vs 36-52h），修复者在初读根因时不应将两者视为同等量级的问题。详细逐项诊断（S5a/S5b-1/S5b-2）已充分区分了差异，此处补充概括以消除根因层面同质化概括可能导致的误判。

**证据**: 文件系统中不存在 `DoctorChatView.vue` 和 `ArticleDetailView.vue`，路由表中无对应的两条路由；`Consultation.vue` 为7行占位文件（经实际代码读取确认），`/consultation` 路由虽已注册但对应页面无功能。

### 根因3: Punch.vue 流程图实现时的筛选/分析联动遗漏

**受影响问题**: S3, S7（默认日期 + 日期变更不拉分析）→ 交叉引用 S3 和 S7 同属 Punch 筛选逻辑

4.3节Punch.vue流程图包含两个关键节点：(1) 页面加载时"默认近30天"；(2) 日期变更时"重新请求list+analysis"。实现时这两处设计意图均未转化为代码逻辑。

**证据**: dateStart/dateEnd初始为空；setFilter仅调用fetchList。

### 根因4: 跨模块数据传递的接收端消费不完整

**受影响问题**: S4, S11

Risk.vue（发送方）正确实现了数据保存和传参。LifePlan.vue（接收方）仅消费了 `riskFormStore.formData`（用于表单预填），遗漏了 `riskFormStore.result`（预测结果）和 `route.query.diabetesType` 的消费。

### 根因5: 缺乏统一的代码组织模式 review

**受影响问题**: G7-G9, G12, G17, G19-G23, G25-G27（重复代码、命名不一致、模式不统一）

三个Store和三个View组件由同一批次实现，但缺乏统一的代码组织规范（工具函数抽取、接口导出、命名约定、状态管理模式）。这些问题不产生功能缺陷，但增加了维护成本。

### 根因6: 缺乏统一的 API 响应处理规范

**受影响问题**: G14（10个 API 函数缺少 success 字段检查）

三个 API composable 文件（useHomeApi、useLifePlanApi、usePunchApi）均直接解包 `res.data.data` 返回数据，未对 `success: false` 做统一拦截。这属于 API 层的系统性遗漏——与根因5（代码组织缺乏规范）不同，G14 影响功能正确性（后端业务错误被静默吞没），需要架构层面的响应拦截器统一处理。

**证据**: `useApi.ts` 响应拦截器 success 分支仅 `(res) => res`，未检查 `res.data.success`；三个 API composable 文件共10个函数均使用 `return res.data.data` 模式，无一处检查 success 字段。

### 根因到问题映射关系

| 根因 | 直接受影响问题 | 间接受影响问题 |
|------|---------------|---------------|
| 状态管理未对齐 | S1, S2 | — |
| 路由拆分未跟进 | S5a（3层缺失——组件+API函数+类型，约2-4h），S5b（5层缺失——chatStore骨架+Consultation占位+组件+API composable+SSE通信层，约36-52h，含 Consultation.vue 占位——医生列表入口页未实现，属于 S5b 修复范围中的独立前置条件，参见 S5b-2 修复建议 v6 修订）。**注意：两者修复工作量差异约10倍，详见根因2 v9新增的完成度层级差异分析** | S6（前置依赖 S5a） |
| 筛选联动遗漏 | S3, S7 | — |
| 跨模块接收不完整 | S4, S11 | — |
| 代码组织缺乏规范 | G7, G8, G9, G12, G17, G19-G23, G25-G27 | G24（scoped 样式作用域） |
| 缺乏统一的 API 响应处理规范 | G14 | — |

---

## 8. 总体评估

### 8.1 影响面分级

**功能阻断级（用户不可用，影响功能可用性）**:
- S5a（ArticleDetailView 路由/组件缺失）：文章详情功能完全不可用
- S5b（DoctorChatView 路由/组件缺失 + Consultation.vue 入口页为占位）：医生对话功能完全不可用——两个阻断点：(a) 入口页 Consultation.vue 为7行占位不含医生列表，用户无导航入口；(b) 目标页 DoctorChatView.vue 不存在且 chatStore SSE 层未实现

**高危级（影响核心体验但功能可降级运行）**:
- S1（首页缓存缺失）：性能退化，每次加载3次API请求
- S2（方案缓存缺失）：页面刷新后方案丢失
- S6（文章跳转错误）：用户无法查看文章详情 — 前置依赖 S5a

**中危级（功能部分可用但有偏差）**:
- S3, S4, S7, S9, S10, S11, S13, G3, G6, G14, G24

**低危级（代码质量/可维护性，需代码修改）**:
- G1, G2, G7-G13, G15-G23, G25-G29

**无需代码修改（仅确认/设计文档更新）**:
- G4（双模式并存可接受，保持当前实现，仅在设计文档中标注两种模式为有意并存——v8修正：原建议"在代码注释中标注"属代码修改操作，与"无需代码修改"标签矛盾，已改为设计文档标注）
- G5（代码实现优于设计文档规定，仅更新设计文档流程图顺序）
- S12（间接一致性模型正确，无需代码修改，可选文档补充）
- S13（代码完全符合设计文档，内部矛盾在文档层面，可选更新设计文档路由守卫列表）

### 8.2 修复优先级排序及依赖关系

| 优先级 | 问题 | 严重度 | 行动类型 | 前置依赖 | 预估工时 | 可批处理组 | 说明 |
|:------:|------|:-----:|:------:|---------|:------:|-----------|------|
| **P0** | S5a | 高 | 代码修复 | 无（设计文档 3.2.20/6 节已确认 `GET /api/articles/:id` API 契约——返回含 `content`/`is_collected` 完整字段的响应体，前端类型缺口为 `ArticleDetail` 定义遗漏。v9 修正——API 就绪状态已明确，降级方案不再必要） | 2-4h（新建 `ArticleDetail` 类型 + `getArticle(id)` API 函数 + `ArticleDetailView.vue` 组件 + 路由注册） | — | ArticleDetailView.vue + 路由 + ArticleDetail 类型 + getArticle API 函数，纯前端实现无后端不确定性 |
| **P0** | S5b-1 | 高 | 代码修复 | G14（建议——chat API composable `useChatApi.ts` 需从零创建，G14 响应拦截器先完成可使新 composable 自动受益于统一错误处理）；当前代码库中不存在 `useChatApi.ts` 或等价的 chat API composable（全局搜索确认） | 20-28h（2.5-3.5人天——含 `useChatApi.ts` 新建 2-4h + fetch+ReadableStream SSE连接管理 + chunk→文本→事件块→JSON解析管道 + 断线重连指数退避 + conversation_id管理 + 多医生会话路由 + AbortController集成 + 消息流式渲染。v9 上调 4h 以覆盖 API composable 层创建） | — | 实现 chatStore SSE 核心 + 新建 `useChatApi.ts`（fetch+ReadableStream SSE连接/消息收发/重连/conversation_id管理），硬前置依赖 |
| **P1** | S5b-2 | 高 | 代码修复 | **→ S5b-1**；Consultation.vue 医生列表 UI（独立前置——当前为7行占位页面，需完整构建医生卡片列表及跳转入口。参见根因2 v6修订和 S5b-2 修复建议。若剥离为独立 Todo 项则标注为 P0 前置任务） | 16-24h（2-3人天——Consultation.vue重写8-12h + DoctorChatView.vue新建8-12h。若Consultation.vue剥离为独立Todo项，两者各约8-12h） | — | DoctorChatView.vue 组件 + 路由注册 + Consultation.vue 医生列表重构（v6修正：S5b-2 实际工作量包含入口页构建，复杂度从"中高"上调至"高"） |
| **P1** | S6 | 中 | 代码修复 | **→ S5a** | ~0.5h（一行路由跳转修改，工作量不计S5a前置依赖） | — | 文章跳转修复依赖 ArticleDetailView 路由存在 |
| **P1** | S1, S2 | 高 | 代码修复 | 无 | 4-6h（0.5-0.75人天——含Home缓存1h过期+LifePlan缓存30min过期+completedMap序列化+clearXxxCache清理函数预留） | **批处理 S1+S2** | 同为 sessionStorage 缓存模式，用同一模板实现 [†B] |
| **P1** | S3, S7 | 中 | 代码修复 | S9（竞态保护——S9 上调至 P1 作为此前置项，见下） | 2-3h（含默认日期计算+URL参数优先+sessionStorage恢复+setFilter追加fetchAnalysis+300ms防抖） | **批处理 S3+S7** | 同在 Punch.vue + punchStore.ts，修改区域重叠；S7 修复建议明确要求 fetchAnalysis 需先有竞态保护 |
| **P1** | S9 | 中 | 代码修复 | 无 | ~0.5h（约5行代码——复用同文件fetchList已有requestId模式，在fetchAnalysis函数入口递增+快照捕获+await后检查） | — | [†A] 竞态保护，v7 从 P2 上调至 P1——作为 S3/S7 批处理组的前置依赖项（S7 修复建议第187行明确要求 fetchAnalysis 需先有竞态保护）。置于 P1 层最前，在 S3+S7 之前执行 |
| **P2** | G14 | 中 | 代码修复 | S9（建议） | 2-3h（响应拦截器统一处理+构造兼容Error对象+10个API函数行为审计+与后端确认success:false语义） | — | [†A][†C] API 响应拦截器统一处理 success 字段检查，影响面最广 |
| **P2** | S4, S11 | 中/低 | 代码修复 | 无 | 2-3h（含riskResultHint变量+模板提示条扩展+diabetesTypeHint computed+枚举映射复用） | **批处理 S4+S11** | 同在 LifePlan.vue onMounted + computed，修改区域重叠 |
| **P2** | S8 | 中 | 代码修复 | S1/S2（建议） | 3-5h（21处localStorage→sessionStorage迁移+must_change_password保留+clearAuth联动清理+BC可选增强2-3h）**注：不含BC增强时约3h，含BC增强约5-6h** | — | [†B] sessionStorage 迁移，涉及 authStore + 路由守卫联动 |

> **预估工时汇总（v8新增，v9修订，v13补充交叉引用）**: 上述预估为粗略数量级参考（基于单人开发估算），不包含代码审查、联调、后端依赖等待时间。v9 工时调整：(a) S5b-1 上调 4h（API composable 层 `useChatApi.ts` 创建纳入工时评估，16-24h→20-28h）；(b) S5a 下调 2-4h（设计文档 API 契约已确认，降级方案不再必要，4-8h→2-4h）；(c) 两者对冲后 **P0+P1 总计约 45-66h（5.6-8.3人天）**，其中 S5b-1 和 S5b-2 合计 36-52h 为最大单项投入；P2 总计约 7-11h；P3 总计约 7-11h；P4 总计约 7-12h。全部42项问题修复**总预估工时约 66-100h（8.3-12.5人天）**，实际工时会因开发者熟悉度、后端接口就绪状态、代码审查轮次等因素浮动。
>
> **工时汇总数值交叉引用说明（v13新增）**: 上文 66-100h（约 8.3-12.5 人天）对应**纯串行单人开发**场景——所有42项问题由同一开发者按优先级顺序逐一完成，无并行加速。下文 8.2.1 节三人并行策略中的 41-64h（约 5.1-8 人天）对应**三人并行开发**场景——S5a/B/C 三组独立并行推进，关键路径为 S5b-1（20-28h）。两处数值基于不同的人力配置假设（1 人 vs 3 人），不可直接比较。读者在引用工时数据时应明确适用场景——单人项目或缺乏并行条件时使用 66-100h 估算，三人团队有明确分工时参考 41-64h 并行估算。造成混淆的根本原因是两处数值使用了不同的分母（人力数），而非同一分母下的估算差异。
>
> **P2 层内部执行排序（v5新增，v7修订）**: G14 最先执行（影响全部 10 个 API 函数的错误处理路径，影响面最广）；S4+S11 次之（同文件区域重叠，批处理）；S8 最后（建议 S1/S2 完成后执行，共享 sessionStorage 清理机制）。

> **v7 优先级调整裁决**: v5/v6 在 S9 的优先级归属上存在未解决的矛盾——S9 被明确标注为 P1 批处理组 S3+S7 的前置依赖，但 S9 自身定级为 P2。v7 做出最终裁决：**S9 上调至 P1**，置于 P1 层最前（S3+S7 之前执行）。裁决依据：(1) S7 修复建议第187行明确要求 `fetchAnalysis` 需先有竞态保护，若 S9 留在 P2 则 S3+S7 P1 批处理组在缺少前置依赖的情况下执行，违反修复间的硬性依赖约束；(2) S9 的实现工作量极低（在 `fetchAnalysis` 函数中复用同文件已有的 requestId 模式，约 5 行代码），上调至 P1 不显著增加 P1 层的总工作量；(3) S9 上调消除了优先级标签与依赖关系的矛盾，修复者可直接按 P1→P2→P3→P4 顺序执行而无须额外解读。
| **P3** | S10 | 中 | 代码修复 | G7, G12（工具抽取） | 2-3h（新建sanitize.ts+ALLOWED_TAGS/ATTR白名单配置+三处调用替换+验证） | — | DOMPurify 加固可与 Markdown 工具抽取合并 |
| **P3** | G7, G8, G12 | 低 | 代码修复 | 无 | 2-3h（新建3个工具文件+5处调用替换+编译验证） | **批处理 G7+G8+G12** | 均属抽取公共工具函数，一次重构统一处理 [†C] |
| **P3** | G3, G6 | 中/低 | 代码修复 | 无 | 3-5h（SVG环形图实现+动画+边界条件+刷新按钮+旋转动画+防双击） | — | UI 元素补充（环形图 + 刷新按钮） |
| **P4** | G24 | 低 | 代码修复 | G25（同类型修复） | 1-2h（全局样式文件+三组件删除本地定义） | **批处理 G24+G25** | 均在全局样式文件提取 |
| **P4** | G4 | 低 | 设计文档更新 | 无 | ~0.5h（设计文档标注，无代码修改） | — | 双模式并存可接受，保持当前实现，在设计文档中标注两种模式为有意并存（v8修正：原"加注释说明"改为设计文档标注，消除与"仅确认"标签的矛盾） |
| **P4** | G5 | 低 | 设计文档更新 | 无 | ~0.5h（设计文档流程图顺序调整，无代码修改） | — | 代码实现优于设计，仅更新设计文档流程图顺序 |
| **P4** | G1, G2 | 低 | 代码修复/设计确认 | 无 | 1-2h（CSS命名+按钮文案+糖尿病类型链接+设计确认沟通） | — | 设计对齐——确认偏离为有意选择或修复 |
| **P4** | S12 | 低 | 设计文档更新 | 无 | ~0.5h（可选——设计文档补充间接一致性模型注释，无代码修改） | — | 间接一致性模型正确，无需代码修改，可选文档补充。v11修正：行动类型从"仅确认"改为"设计文档更新"以与同模式 S13 保持一致——两者均为"代码正确，可选补充设计文档"，行动类型应统一 |
| **P4** | S13 | 低 | 设计文档更新 | 无 | ~0.5h（设计文档路由守卫列表更新，无代码修改） | — | 代码完全符合设计，内部矛盾在文档层面 |
| **P4** | G9-G11, G13, G15-G23, G26-G29 | 低 | 代码修复 | 无 | 4-8h**（总计——15项低危代码质量迭代，单项约0.3-0.5h） | — | 代码质量迭代 |

> **P4 层内部执行排序建议（v13新增）**: P4 层 15+ 条目建议按以下顺序执行，以降低冲突风险和利用隐式依赖：(a) **Store 层修改优先**——G27（punchStore filter reactive→ref）、G9（合并 DiabetesTypeView 接口）最先执行，因为 Store 接口变更会影响后续模板层的修改（G17 typeFilter computed 依赖 G27 完成后的 Store 接口稳定）。G23（删除 api.ts 死代码）建议在 G9 之后执行——G9 合并接口后类型引用关系更清晰，删除死代码时不易误删仍在使用的类型；(b) **工具函数抽取**次之——G7（renderMarkdown）、G8（getErrorMessage）、G12（escapeHtml）三项已在 P3 层批处理，若 P3 层未执行则在此阶段抽取。G16（marked async 兼容性注释）与 G7 相关——在抽取后的 `useMarkdown.ts` 中统一添加注释比在两处各自添加更高效，建议在 G7 完成后执行 G16；(c) **模板层修改**随后——G17（typeFilter computed）、G13（onScroll ref 绑定）、G1（CSS 类名/按钮文案）、G2（糖尿病类型"全部"链接）、G15（分析范围提示文案）、G28（搜索图标行为）在 Store 接口稳定后执行，避免 Store 变更导致的模板返工；(d) **类型安全和稳定性加固**最后——G26（enumLabel as const satisfies）建议在 Store 重构稳定后执行（避免存量的类型宽松代码在重构中被修正导致的编译错误与实际逻辑改动混在同一 commit）。G11、G29 与其他条目无依赖关系，可在任意阶段穿插执行。此排序为建议性指引，P4 层条目均为低危代码质量迭代，修复者可根据实际情况灵活调整。

> **行动类型说明**:
> - **代码修复**: 需要修改前端代码文件（含新建文件）。
> - **设计文档更新**: 仅需修改 `docs/2_detailed_design_v3.md` 设计文档，不涉及代码变更。
> - **仅确认**: 经诊断确认无需任何改动（代码正确），可选补充设计文档注释。
> - **代码修复/设计确认**: 需先确认设计意图（是有意偏离还是应该对齐），再决定是否修改代码。
>
> **修复间交互风险脚注**（详见 8.3(e) 节）:
> - **[†A]**: G14 ↔ S9 共享错误处理路径（`useApi.ts` 响应拦截器、punchStore catch 链）。建议 S9 先于 G14 或同一 commit。
> - **[†B]**: S8 ↔ S1/S2 共享 sessionStorage 命名空间和 `clearAuth()` 清理逻辑。建议 S1/S2 先于 S8，并在 S1/S2 中预留 `clearAllCaches()` 统一清理函数。
> - **[†C]**: G7 ↔ G14 共用 Markdown 渲染管道。经代码验证（Punch.vue:172-190 v-if/v-else-if 互斥链），G14 修复后不会将 null 传给 renderMarkdown。G7 抽取时建议增加空值防御作为通用健壮性增强，不特定关联 G14。
> - **[†D]**: S5a 依赖后端 GET /api/articles/:id 接口。**v9 修正**——设计文档 3.2.20 节（第2051行）和 6 节（第6224行）已确认该 API 契约：返回含 `content`/`is_collected`/`tags`/`summary` 等完整字段的响应体，`content` 为 Markdown 正文。当前 `useHomeApi.ts` 仅含 `getArticles`（列表），不存在 `getArticle(id)` 单篇详情函数，且 `Article` 类型不含 `content`/`is_collected` 字段——前端需新建 `ArticleDetail extends Article { content: string; is_collected: boolean }` 类型和 `getArticle(id: number)` API 函数。纯前端实现无后端不确定性。

**批处理说明**:
- **S1 + S2**: 同为 sessionStorage 缓存模式，可共用工具函数 `createSessionCache<T>(key, ttl)`，减少上下文切换。
- **S3 + S7**: 同在 `Punch.vue` (onMounted + onDateChange) 和 `punchStore.ts` (setFilter)，修改区域重叠，分两次修改变更冲突风险高。
- **G7 + G8 + G12**: 均属抽取公共工具函数（`renderMarkdown`、`getErrorMessage`、`escapeHtml`），可在一次重构中统一创建 `src/composables/useMarkdown.ts`、`src/utils/errorMessage.ts`、`src/utils/sanitize.ts`，批量替换所有调用点。
- **G24 + G25**: 同属全局样式提取（`page-enter` 动画 + `.press` 交互类），可在同一个全局样式文件中合并处理。

### 8.2.1 并行化执行策略与增量交付路径

上述优先级表采用线性串行排序，但各优先级层之间及内部存在大量可并行执行的独立性。以下标注并行化策略及增量交付建议。

**并行可行性矩阵**：

| 并行组 | 包含问题 | 独立于 | 可并行人数 | 并行后预估工期 | 说明 |
|:------:|---------|--------|:--------:|:-----------:|------|
| A | S5a | A ↔ B ↔ C 三者互不依赖，完全独立 | 3人并行 | 2-4h（单人） | ArticleDetailView 纯前端实现，无后端不确定性 |
| B | S5b-1 | 与 A、C 无硬性依赖。**注意：S5b-1 与 P2 层 G14 存在"建议"级软依赖**（参见 8.2 节优先级表 S5b-1 行"前置依赖"列——G14 响应拦截器先完成可使新创建的 `useChatApi.ts` 自动受益于统一错误处理）。若 B 组与 G14（P2 层）并行推进，useChatApi.ts 将在 G14 修改响应拦截器之前完成，后续 G14 修改拦截器时可能需要返工调整 useChatApi.ts 的错误处理逻辑。此为建议级依赖非硬性阻塞——团队可自行决定是串行（省返工）还是并行（省时间但可能返工，预估返工量 < 1h）。 | B 由另一人独立负责 | 20-28h（单人） | chatStore SSE 核心 + API composable 层，硬前置 S5b-2 |
| C | S1+S2（批处理）+ S3+S7（批处理，前置 S9）+ S9（前置 C 批处理组） | 与 A、B 无依赖 | C 由第三人独立负责 | 7-9.5h（单人，含 S9 0.5h + S3+S7 2-3h + S1+S2 4-6h） | C 组内顺序：S9 → S3+S7 → S1+S2 |

> **P0 层并行策略**: S5a 与 S5b-1 完全独立（不同路由、不同 Store、不同 API），可同时由两人并行开发。S5a 预计 2-4h 完成，S5b-1 预计 20-28h 完成（为 P0 层瓶颈项）。若 C 组（S9/S3/S7/S1/S2）也投入第三人并行，P0+P1 层可在 **20-28h（约 2.5-3.5 人天）** 内完成（以 S5b-1 为关键路径），对比串行策略的 45-66h（5.6-8.3 人天），**工期缩短约 55%**。

**P0 层内部并行可行性**：
- **S5a（2-4h）** 与 **S5b-1（20-28h）** 可完全并行——不同组件文件（ArticleDetailView.vue vs chatStore.ts/useChatApi.ts）、不同路由（/news/article/:id vs /consultation/doctor/:id）、不同 API composable（useHomeApi.ts vs useChatApi.ts）、无共享依赖。S5a 预计先于 S5b-1 完成，完成后开发者可转入 P1 层 S6（0.5h，依赖 S5a）或协助 S5b-1。
- **S5b-1 与 P2 层 G14 的软依赖提示**: S5b-1 的前置依赖列标注了 G14 为"建议"级依赖——G14 响应拦截器先完成可使新创建的 `useChatApi.ts` 自动受益于统一错误处理。若团队按三人并行策略同时推进 S5b-1（B 组）和 G14（P2 层，可由完成 P1 任务的开发者提前启动），useChatApi.ts 将在 G14 修改响应拦截器之前完成，后续 G14 修改拦截器时可能需要对 useChatApi.ts 的错误处理逻辑做小幅返工（预估 < 1h）。这不是硬性阻塞（S5b-1 可完全独立开发和测试），但团队应在排期时知悉此软依赖的存在，自行决定串行（省返工）或并行（省时间）。
- **S5b-1 内部**: chatStore SSE 核心实现（fetch+ReadableStream 管道、断线重连、conversation_id 管理）与 useChatApi.ts 创建（sendChatMessage/getDoctorInfo）可由同一人顺序完成（useChatApi 先于 chatStore 消费层——chatStore 调用 useChatApi 的函数）。

**P1 层并行可行性**：
- S5b-1 完成后，S5b-2（16-24h）进入——此时若 S5a+C 组已完成，多余人力可转入 S5b-2 协助（Consultation.vue 重写与 DoctorChatView.vue 创建可并行——两个独立 .vue 文件，仅共享 chatStore 接口）。
- S6（0.5h）在 S5a 完成后可由任意开发者快速完成。

**串行保守策略 vs 并行策略工期对比**：

| 策略 | P0+P1 工期 | 总工期（全部42项） | 所需人数 | 适用场景 |
|------|:--------:|:---------------:|:------:|---------|
| 纯串行 | 45-66h（5.6-8.3人天） | 66-100h（8.3-12.5人天） | 1人 | 单人开发、无并行条件 |
| 二人并行 | 28-42h（3.5-5.3人天） | 49-76h（6.1-9.5人天） | 2人 | S5a+C组一人、S5b-1/S5b-2一人 |
| 三人并行（推荐） | 20-28h（2.5-3.5人天） | 41-64h（5.1-8人天） | 3人 | 关键路径为 S5b-1（20-28h），P2-P4 修复为非关键路径可填充等待时间 |

**增量交付里程碑建议**：

| 里程碑 | 交付内容 | 前置条件 | 预估交付时间 | 交付物 |
|:------:|---------|---------|:----------:|-------|
| M1 | 首页缓存 + 方案缓存 + 打卡筛选修复 | S1+S2+S3+S7+S9 完成 | 第 1-2 天 | 可部署的功能改进：首页性能提升、方案刷新不丢失、打卡日期筛选完善 |
| M2 | 文章详情功能 | S5a+S6 完成 | 第 1-2 天（可与 M1 并行） | 可部署的新功能：文章详情页完整可访问 |
| M3 | 医生对话功能 | S5b-1+S5b-2 完成 | 第 3-5 天 | 可部署的新功能：医生列表+SSE 对话完整路径 |
| M4 | API 错误处理 + 跨模块数据修复 | G14+S4+S11+S8 完成 | 第 4-6 天 | 可部署的健壮性改进：统一错误拦截、风险→方案数据链路完整 |
| M5 | 代码质量迭代 + UI 完善 | P3+P4 全部完成 | 第 5-8 天 | 可部署的品质提升：工具函数抽取、安全加固、动画修复、环形图等 |

> **增量交付原则**: 每个里程碑完成后可独立部署，不阻塞后续里程碑。M1/M2 无相互依赖可同时交付。M3 为最大单次交付（S5b-1 20-28h），建议在 M1/M2 完成后集中人力攻坚。M4/M5 为质量迭代，可在 M3 开发期间由非关键路径开发者并行推进。

### 8.3 修复副作用评估

> **范围说明**: 本节对高风险修复（S5/S1/S2/S8/G14/G7/G8/G12）进行系统性副作用分析（8.3(a)-(d) 子节）。P3/P4 层低危修复（涉及共享路径如 `src/utils/`、`src/composables/`、`src/stores/`、`src/views/Punch.vue` 等）的交叉影响在 8.3(e) 交互风险表中补充标注（Punch.vue 多修复聚合条目），在 8.3(g) 回归测试清单中补充对应验证条目。P3/P4 层单项修改的独立副作用（如工具函数抽取后 import 路径变更）属标准重构操作，其影响面在逐项修复建议中已覆盖（含编译验证步骤），本节不再逐项展开。

对以下4个高风险修复点进行系统性副作用评估：

**(a) S5 新增路由对现有路由守卫逻辑的冲击**

- **S5a（`/news/article/:id`）**: `meta: { requiresAuth: false }`，不触发路由守卫中的 token 检查、admin 角色检查、免责声明弹窗。**副作用：无。** 路由守卫对 `requiresAuth: false` 的路由直接 `next()` 放行。
- **S5b（`/consultation/doctor/:id`）**: `meta: { requiresAuth: true, requiresDisclaimer: true }`，首次访问会触发路由守卫的免责声明弹窗（`showDisclaimer()`）。**副作用：正向。** 路由守卫逻辑无需修改——`requiresAuth` 和 `requiresDisclaimer` 已在现有路由中验证正常工作。需确认：新增路由的 `path` 格式 `/consultation/doctor/:id` 不与其他路由冲突（当前路由表无 `/consultation/*` 子路由）。**结论：无显著副作用。**

**(b) S1/S2 引入 sessionStorage 后 token 失效时缓存数据的清理策略**

- token 失效（401）时，`useApi.ts` 响应拦截器调用 `authStore.clearAuth()` 并跳转登录页。但 sessionStorage 中的 `home_cache` 和 `plan_cache` 不会被 `clearAuth()` 清理（因为缓存键不属于 authStore 范畴）。
- **副作用分析**: 用户重新登录后，sessionStorage 中的数据属于旧用户的缓存（标签页未关闭场景），新用户的 `fetchHomeData()` 可能因缓存命中而展示旧用户数据。
- **风险等级**: 低（标签页未关闭时 token 过期场景概率较低，且 sessionStorage 数据在标签页关闭后自动清除）。
- **跨标签页 UX 退化量化（v13新增）**: sessionStorage 迁移（S8 核心修复）本身会产生正向的 UX 退化——因为 sessionStorage 按标签页隔离、不跨标签页共享。以下为具体影响面量化：(a) **新标签页打开任意页面**——新标签页的 sessionStorage 为空白，无 token → 路由守卫强制跳转登录页。影响所有在新标签页中打开应用的用户（包括从外部链接、书签、地址栏直接访问），每次新标签页均需重新登录，登录频率显著增加；(b) **外部链接进入**——从微信/邮件/短信等外部渠道点击链接打开应用时，因新标签页无 token，用户总需先登录才能看到目标内容（即使旧标签页已登录），用户体验退化明显；(c) **正常浏览中的新标签页**——用户使用 Ctrl+Click 或右键"在新标签页中打开"链接时，新标签页无 token 需重新登录。此场景在当前 localStorage 方案下无需重新登录，迁移后变为必须重新登录。以上三种场景的 UX 退化是 sessionStorage 隔离特性的直接后果——这是安全性改进（XSS 攻击面缩减）与便利性退化之间的权衡。若不实施 BroadcastChannel 跨标签页同步增强，上述退化将实际发生。**强烈建议**将 BroadcastChannel 增强从"可选"升级为"强建议"——BC 增强的代码量小（约 30 行，已在 S8 修复建议中给出完整实现），可在不牺牲安全性的前提下消除上述三种场景的 UX 退化。若因工期等原因暂不实施 BC 增强，应在 8.3(g) 中明确标注未实现 BC 时的预期 UX 退化行为，供产品和测试团队评估是否可接受。
- **缓解措施**: 在 `authStore.clearAuth()` 中增加清理所有 sessionStorage 缓存键的逻辑（或提供统一的 `clearAllCaches()` 函数在 logout/401 时调用）；或在缓存 key 中加入 token hash 前缀以区分不同登录会话。
- **与修复建议的交叉引用**: 此缓解措施已落实至 S1 修复建议（第62行后"与其他修复的交互"——暴露 `clearHomeCache()`）、S2 修复建议（第78行后"与其他修复的交互"——暴露 `clearPlanCache()`）、S8 修复建议（第216行后"与其他修复的交互"——`clearAuth()` 中调用上述清理函数）。修复者按优先级顺序实施时，在 S1/S2 阶段预留清理函数，在 S8 阶段统一调用，可避免跨章节整合信息的额外成本。

**(c) G14 增加 success 字段检查后错误处理 UX 流程的变化**

- 当前：`success: false` + HTTP 200 → 静默传递 `null` 到 Store → 各组件以空数据/blank 态渲染，无错误提示。
- 修复后：`success: false` + HTTP 200 → axios 拦截器 reject → Store catch 块捕获 → `*Error` ref 更新 → UI 展示错误提示 + 重试按钮。
- **副作用**: 从静默空态转为显式错误提示。当前业务中 `success: false` 的实际触发场景需要梳理——如果后端在某些非错误场景也返回 `success: false`（如"暂无数据"），修复后将误报错误提示。
- **缓解措施**: 修复前与后端确认 `success: false` 的语义（仅用于业务错误，不用于"数据为空"的合法场景）；或根据 `message` 内容区分"业务错误"和"空数据"（如 message 包含特定关键词时仍正常返回空数据）。
- **结论**: 低副作用，但需与后端确认 API 契约。

**(d) G7/G8/G12 抽取公共函数后各级调用方 import 路径的批量修改量和回归范围**

- **G7（renderMarkdown）**: 影响 LifePlan.vue:94-99 和 Punch.vue:55-60（2处替换）。
- **G8（getErrorMessage）**: 影响 LifePlan.vue:102-109 和 Punch.vue:63-77（2处替换）。
- **G12（escapeHtml）**: 影响 Home.vue:132-137（1处替换，1处调用在 openTypeSwal 中）。
- **回归风险**: 低——三个函数都是纯函数（输入→输出，无副作用），替换后行为完全不变。回归测试范围：LifePlan 方案内容渲染（方案内容和错误提示）、Punch AI 分析渲染（分析内容和错误提示）、Home 糖尿病类型弹层（纯文本转义）。
- **结论**: 无显著副作用，建议在一个 commit 中完成三函数的抽取和替换以简化 review。

**(e) 修复间交互风险分析**

以下三组修复对之间存在交叉影响，需在修复顺序和集成测试中额外关注：

| 交互组 | 修复对 | 共享组件/路径 | 交互性质 | 建议修复顺序 |
|--------|--------|-------------|---------|-------------|
| **A** | G14（success 字段拦截器）↔ S9（fetchAnalysis 竞态保护） | `useApi.ts` 响应拦截器、punchStore `fetchAnalysis` catch 链 | G14 在响应拦截器中统一 reject `success:false` 响应，S9 为 `fetchAnalysis` 增加 requestId 快照保护。两者共享同一错误处理路径——G14 改变的是"何时进入 catch"，S9 改变的是"进入 catch 后是否丢弃过期响应"。若 G14 先修复而 S9 未修复，`success:false` 触发 reject 进入 catch 后再无快照保护，过期的 `success:false` 响应可能覆盖当前合法数据。 | 建议 **S9 先于 G14** 或在同一 commit 中完成。 |
| **B** | S8（sessionStorage 迁移）↔ S1/S2（sessionStorage 缓存） | sessionStorage 命名空间、`authStore.clearAuth()` 清理逻辑 | S8 将 token/role/user 迁移至 sessionStorage，S1/S2 使用 sessionStorage 存储 home/plan 缓存。三者共享 sessionStorage 命名空间（约5MB上限），且 S8 的 `clearAuth()` 需同步清理 S1/S2 的缓存键。若 `clearAuth()` 未清理 `qrzl_home_cache` 和 `qrzl_plan_cache`，token 失效重新登录后旧用户缓存仍残留在 sessionStorage 中（标签页未关闭场景）。 | 建议 **S1/S2 先于 S8**（先实现缓存机制，S8 的 clearAuth 中再追加缓存清理）；或在 S1/S2 实现时预留 `clearAllCaches()` 统一清理函数，后续 S8 直接调用。 |
| **C** | G7（Markdown 渲染抽取）↔ G14（success 字段拦截器） | `useMarkdown.ts`、API composable 响应路径 | G7 抽取 `renderMarkdown()` 统一函数供 LifePlan/Punch 共用，G14 在响应拦截器中统一 reject。两者修改的代码区域不同（composable vs 拦截器），无直接代码冲突。**经源代码验证**（Punch.vue:172-190 模板 v-if/v-else-if 互斥链）：G14 修复后 `success:false` 触发 reject → Store catch 设置 `analysisError` → 模板 `v-else-if="store.analysisError"` 渲染错误降级 UI（展示 getErrorMessage 文案 + 重试按钮），Markdown 渲染分支（`v-else-if="store.analysis"`）不被进入。**因此 G14 修复后不会将 null 输入传给 renderMarkdown，原交互表声称的"可能产生 null 输入"因果逻辑不成立。** | 无强制顺序要求。G7 抽取 `renderMarkdown()` 时建议增加空值防御（`if (!markdown || typeof markdown !== 'string') return ''`）作为通用健壮性增强。 |
| **D** | Punch.vue 多修复聚合（G3/G6/G7/G8/G13/G15/G17/G24/G27） | `src/views/Punch.vue`、`src/stores/punchStore.ts` | Punch.vue 被以下 9 项修复同时触及：G3（环形图替换统计卡模板）、G6（新增刷新按钮模板+逻辑）、G7（替换本地 renderMarkdown 为 import）、G8（替换本地 getErrorMessage 为 import）、G13（onScroll ref 绑定改为 listContainer）、G15（新增分析范围提示文案模板）、G17（typeFilter ref→computed 重构）、G24（page-enter 动画依赖全局样式）、G27（punchStore filter reactive→ref 迁移后模板中 filter 访问路径从 `filter.xxx` 改为 `filter.value.xxx`）。**9 项修复集中在同一组件文件，同时修改时合并冲突概率高**——特别是 G17（ref→computed）和 G27（reactive→ref）涉及 Store 接口签名变更，会影响 G3/G6/G7/G8/G13/G15 的模板引用。 | 建议修复顺序：(1) 先完成 Store 层修改（G27 punchStore filter 迁移）和 G17（typeFilter ref→computed），因为两者改变数据访问接口；(2) 再完成工具抽取（G7/G8），更新 import 路径；(3) 再完成 UI 修改（G3/G6/G15/G13/G24），此时数据接口已稳定。建议 Punch.vue 的 9 项修复在同一 commit 中完成，合并冲突由同一开发者消化。 |
| **E** | 全局样式提取（G24+G25）↔ 各组件 scoped 样式 | `src/styles/` 全局样式文件、Home.vue/LifePlan.vue/Punch.vue 的 `<style scoped>` | G24（page-enter 动画）+ G25（.press 交互类）提取到全局样式文件后，各组件删除本地定义。如果某组件对 page-enter 或 .press 有自定义覆盖样式，全局样式与组件 scoped 样式可能产生优先级冲突（全局样式优先级低于 scoped 样式，但需确认无 `!important` 冲突）。**v13新增——G24 动画效果差异风险**: Home.vue 的 page-enter 为 `fadeIn+translateY`（位移20px），LifePlan.vue 的 page-enter 为纯 `fadeIn`（无位移），两者效果不同。若未经差异分析直接提取其中一种为全局定义，另一页面的动画效果将被静默改变。G24 修复建议中已给出三种统一选项（推荐方案C：全局基础 `fadeIn` + Home 组件级 `translateY` 覆盖），修复者应在提取前确认选型。 | 提取前检查三个组件各自的 page-enter 定义是否完全一致（Home 为 fadeIn+translateY、LifePlan 为纯 fadeIn），确认差异后按 G24 修复建议的方案C统一提取。.press 定义在两个组件中完全相同（`transform: scale(0.96)`），无冲突风险。 |

**(f) 共享组件/路径的累积风险**

上述五组交互（A-E）涉及同一组核心文件（`useApi.ts` 响应拦截器、`punchStore.ts`、`authStore.ts`、`useMarkdown.ts`、`Punch.vue`、全局样式文件），其中交互 D（Punch.vue 9 项修复聚合）为累积风险最高的一组——单文件同时被 9 项修复触及，合并冲突概率高且修复顺序敏感。建议将这组关联修复放在同一迭代窗口中完成并在合并后执行回归测试（覆盖：登录→首页缓存命中→LifePlan 方案渲染→Punch 日期筛选+分析→登出→重新登录数据隔离）。Punch.vue 的 9 项修复（G3/G6/G7/G8/G13/G15/G17/G24/G27）强烈建议由同一开发者在一段时间内集中完成，避免多人并行修改同一文件导致的合并冲突和接口不一致。

**(g) 集成验证建议（v8新增）**

所有修复完成后，建议按以下清单执行全局集成验证，确保修复间无回归且完整用户路径可正常流转：

**核心用户路径端到端验证**：

| 序号 | 用户路径 | 验证点 | 关联修复 |
|:----:|---------|--------|:------:|
| 1 | 登录 → 首页加载 → 查看糖尿病类型 → 点击文章 → 返回 | 首页缓存命中（S1）、文章详情页正常渲染（S5a/S6）、糖尿病类型弹层正确转义（G12/S10） | S1, S5a, S6, G12, S10 |
| 2 | 风险预测 → 跳转生活方案 → 查看方案内容 → 打卡 → 跳转打卡页 | riskFormStore.result 跨模块传递（S4）、方案缓存命中（S2）、Markdown 安全渲染（S10/G7）、diabetesType 提示条（S11）、打卡跳转一致性（S12） | S4, S2, S10, G7, S11, S12 |
| 3 | 打卡页 → 日期筛选 → 类型筛选 → 修改日期 → 加载更多 → 刷新 | 默认近30天（S3）、日期变更重拉分析（S7/S9）、加载更多滚动（G13）、刷新按钮（G6）、完成率环形图（G3） | S3, S7, S9, G13, G6, G3 |
| 4 | 医师咨询入口 → 医生列表 → 点击医生卡片 → SSE对话 → 断网重连 | Consultation.vue 医生列表三态（S5b-2）、DoctorChatView SSE 流式渲染（S5b-1）、AbortController 取消（G18）、指数退避重连（S5b-1） | S5b-1, S5b-2, G18 |
| 5 | 登出 → 重新登录 → 访问各页面 | sessionStorage 缓存清理（S8/S1/S2 联动）、Token 隔离、旧用户数据不残留（8.3(b) 缓解措施） | S8, S1, S2 |
| 6 | Punch.vue 集中修改后完整功能冒烟（v10新增） | **Punch.vue 被 G3/G6/G7/G8/G13/G15/G17/G24/G27 共 9 项修复触及后的全功能验证**：(a) 完成率环形图正常渲染+动画（G3）；(b) 刷新按钮可点击+加载中旋转+防双击（G6）；(c) Markdown 分析评语正常渲染（G7 抽取后 import 路径正确）；(d) API 错误时错误文案正确显示（G8 抽取后 import 路径正确）；(e) 滚动到底部自动加载更多（G13 ref 绑定正确）；(f) 分析区展示范围说明提示文案（G15）；(g) 类型 chip 切换筛选+高亮同步（G17 computed 替换 ref 后数据绑定正常）；(h) 页面进入动画正常播放（G24 page-enter 全局样式生效）；(i) 日期筛选/类型筛选后 filter 值正确传递到 API 请求（G27 filter reactive→ref 迁移后 Store 接口兼容）。**建议此条为 Punch.vue 相关修复的必检项**，在全部 9 项修复合并后执行一次完整功能冒烟。 | G3, G6, G7, G8, G13, G15, G17, G24, G27 |

**交互风险专项验证**（对应 8.3(e) 五组交互）：

| 交互组 | 专项验证点 | 验证方法 |
|:------:|-----------|---------|
| A（G14↔S9） | `success:false` + 快速切换筛选 → catch 链中过期响应是否正确丢弃 | Mock 后端返回 `success:false`（HTTP 200），在 Slow 3G 下快速切换日期筛选两次，检查分析区错误提示是否对应最新请求 |
| B（S8↔S1/S2） | Token 失效后各 sessionStorage 缓存键是否全部清理 | 登录 → 首页缓存命中 → 模拟 401（手动清除 sessionStorage 中的 token）→ 检查 `qrzl_home_cache` 和 `qrzl_plan_cache` 是否被 `clearAuth()` 联动清除 |
| C（G7↔G14） | G14 修复后 Markdown 渲染管道不受 null 输入影响 | 经源代码验证（Punch.vue:172-190 v-if/v-else-if 互斥链）G14 不会将 null 传给 renderMarkdown，验证 G7 抽取后 LifePlan/Punch 两处 Markdown 渲染正常 |
| D（Punch.vue 多修复聚合） | 9 项修复合并后 Punch.vue 无编译错误且功能完整 | 执行 `vue-tsc --noEmit`，确认无新增 TS 错误；按核心用户路径 6 的 9 项冒烟清单逐项验证；检查 git diff 中 Punch.vue 的变更范围是否覆盖全部 9 项修复（无遗漏、无意外回归） |
| E（全局样式提取） | page-enter 动画在三页面均正常播放、.press 按钮按下态缩放正常 | Home/LifePlan/Punch 三页面分别进入，检查入场动画无闪烁/无冲突；各页面按钮点击按下态检查 scale(0.96) 效果正常 |

**跨标签页场景验证**（S8 sessionStorage 迁移后）：

| 序号 | 场景 | 验证点 |
|:----:|------|--------|
| 1 | 标签页A登录 → 新开标签页B访问任意页面 | 标签页B因无 token 应重定向登录页（sessionStorage 隔离预期行为）。若已实现 BroadcastChannel 强建议增强，标签页B应自动同步认证状态。**UX 退化风险（未实现 BC 增强时）**: 新标签页打开、外部链接进入、右键"在新标签页中打开"三种场景均需重新登录——此 UX 退化是 sessionStorage 隔离的直接后果，产品/测试团队应评估是否可接受。若不可接受则必须实施 BC 增强。 |
| 2 | 标签页A登出 → 标签页B刷新 | 标签页B应同步登出（若已实现 BroadcastChannel 强建议增强） |

**边界网络条件验证**：

| 条件 | 验证内容 |
|------|---------|
| 慢网络（Slow 3G） | 首页并行请求的加载态是否正确（G21 loading 粒度）、Punch loadMore 滚动是否重复触发（G13）、竞态保护是否生效（S9/G18） |
| 离线（Offline） | 所有 API 调用是否正确触发错误态和重试按钮（G14 统一拦截器、G8 统一错误文案） |
| 快速页面切换（< 500ms） | page instance token 是否丢弃旧页面响应（G18 homeStore）、punchStore requestId 快照是否生效（S9） |
| `success: false` + HTTP 200 | 各页面是否正确展示后端业务错误 message（G14 响应拦截器兼容 getErrorMessage） |

**回归测试最小范围**：建议对所有 `.vue` 和 `.ts` 文件变更执行 `vue-tsc --noEmit` 编译检查；对修改的三个 Store（homeStore/lifePlanStore/punchStore）执行单元测试（若已有测试套件）；对修改的三个 View（Home/LifePlan/Punch）执行上述核心用户路径 1-3 的手动验证。

### 8.4 整体质量评估

本报告对42项前端代码审查问题进行了逐项诊断，定位了5个系统性根因，覆盖了代码与设计文档的一致性检查、技术可行性评估、逻辑完整性分析和修复优先级排序。

技术可行性评估经审查确认——42项问题均无阻塞性技术障碍，所有修复均可通过前端代码修改在现有技术栈内完成。安全相关修复（S8/G14）需与后端协调确认 API 契约变更范围。

诊断定级与原始 todo.md 存在系统性差异（10/13 严重问题被重新定级），差异原因已在 1.1 节详细说明。建议修复者以本报告定级作为修复优先级依据。

---

*诊断报告结束。*

---

## 修订说明（v2）

响应审查报告（b_v1_diag_v1.md）和质询报告（b_v1_challenge_v1.md）的反馈，本次修订针对全部10个质量问题进行了改进：

| 质询意见 | 回应 |
|---------|------|
| **1. 缺失修复建议**（连续两轮严重问题） | 已在全部42个诊断条目末尾追加"修复建议"字段，包含：修改文件及函数、关键实现逻辑简述、需注意的边界条件。对于设计对齐类问题（S8/S13），修复建议指向设计文档更新而非代码修改。详见各条目。 |
| **2. 问题定级与 todo.md 差异未说明** | 新增 1.1 节"诊断定级与原始 todo.md 定级差异说明"，逐条列出10个重新定级条目的理由。在总体评估中增加对比总结段落。G5 诊断结论调整为"不成立（设计文档应更新以匹配更优实现）"。 |
| **3. G14 严重程度系统性低估** | G14 严重程度从"一般"上调至"中"，明确列出影响文件清单（3个 API composable 文件，10个函数），补充后端 `success: false` 发生场景（业务限流、参数校验失败、业务规则拒绝、权限不足），在修复建议中给出两种方案（拦截器统一处理推荐方案 vs 各函数内联检查）。 |
| **4. S8 sessionStorage 评估不完整** | 删除 v1 中关于"不会随每次 HTTP 请求自动发送"的无效论据（localStorage 同样不具备此能力）。新增"有效性层级评估"小节，明确区分短期缓解（sessionStorage，即时生效、无后端依赖、建议立即实施）和根治方案（HttpOnly Cookie，需后端协同）。补充 token 迁移后 authStore 和路由守卫的联动修改点说明。 |
| **5. 修复优先级缺少依赖关系和批处理标注** | 8.2节优先级表增加"前置依赖"列（如 S6→S5a）。标注可批处理的问题组：S1+S2（sessionStorage 缓存模板）、S3+S7（Punch.vue + punchStore.ts 区域重叠）、G7+G8+G12（公共工具函数抽取）、G24+G25（全局样式提取）。新增 8.3 节"高风险修复的副作用评估"。 |
| **6. S12 缺少明确结论性判断** | S12 诊断结论后增加"三元判断"子节，明确回答：(a) 是否需要代码修改——不需要；(b) 是否需要设计文档补充——可选；(c) 是否需要验证——可选。 |
| **7. S5 缺乏子任务分解** | S5 拆分为 S5a（ArticleDetailView.vue + /news/article/:id 路由，复杂度低，可独立完成）和 S5b（DoctorChatView.vue + /consultation/doctor/:id 路由，复杂度中高，依赖 chatStore 和 SSE 机制就绪）。分别列出依赖项、可复用模式、边界条件。标注 S5a 可独立完成，S5b 依赖 chatStore 就绪状态。 |
| **8. 缺少修复后的验证方法建议** | 所有42个诊断条目的修复建议末尾追加"验证方法"子项，1-2句话描述修复后如何确认问题已解决。高风险条目（S5a/S5b/S8/G14）的验证方法更详细，包含多个验证步骤。 |
| **9. 缺少高风险修复的副作用评估** | 新增 8.3 节，对4个高风险修复点进行系统性副作用评估：(a) S5 新增路由对路由守卫的冲击（正向副作用，无风险）；(b) S1/S2 sessionStorage 清理策略（低风险：token 失效后旧缓存残留，已给出缓解措施）；(c) G14 success 检查后错误处理 UX 变化（低风险：从静默空态转显式错误，已给出与后端确认建议）；(d) G7/G8/G12 抽取公共函数回归范围（无显著副作用：3处纯函数替换，影响面可控）。 |
| **10. 技术可行性维度未提及** | 在整体质量评估（8.4节）中增加技术可行性确认陈述："技术可行性评估经审查确认——42项问题均无阻塞性技术障碍，所有修复均可通过前端代码修改在现有技术栈内完成。"增强报告自洽性。 |

**修订总结**: 本次 v2 修订全面响应了审查和质询反馈中的全部10个质量问题（含质询补充建议2个），重点解决了连续两轮存在的核心结构性缺陷（修复建议缺失、定级差异未说明、G14低估、S8论据不严谨、优先级依赖关系缺失）。新增约 8000 字的修复建议、验证方法、子任务分解和副作用评估内容。

---

## 修订说明（v3）

响应 v2 审查报告（b_v2_diag_v1.md）和质询报告（b_v2_challenge_v1.md）的反馈，质询报告确认全部5项问题均定位准确（LOCATED），本次修订针对以下5个维度进行改进：

| 质询意见 | 回应 |
|---------|------|
| **1. G5 汇总表与详细诊断结论逻辑矛盾**（中） | 已在三处同步修正：(1) G5 条目头部诊断结论标签从"确认"改为"不成立 — 代码实现优于设计文档规定（设计文档应更新以匹配更优实现）"；(2) 第1节汇总表中"确认"行一般问题从27调整为26（合计37→36），"不成立"行一般问题从0调整为1（合计0→1），并增加注脚说明无需代码修改的4项条目分布；(3) 删除了 G5 正文中的"诊断结论调整"过渡期元注释段落。 |
| **2. S8 sessionStorage 迁移修复建议遗漏关键代码修改点**（中） | S8 修复建议已重写为完整函数修改清单。经实际读取 `authStore.ts` 全文确认21处 localStorage 操作点，新增表格逐函数列出：需迁移至 sessionStorage 的键（token/role/user）和保留在 localStorage 的键（must_change_password）。显式覆盖了 v2 遗漏的 `setAuth()`、`fetchProfile()`、`setProfile()` 和初始化 ref 声明（行12-25）。增加了"全文搜索 localStorage 并逐处判断"的操作指引。 |
| **3. G14 严重程度说明行保留 v1 残留数字**（低） | 将 G14 严重程度说明行中"约7个函数"修正为"10个函数"，与下方详细证据列表（10个函数逐条列出）对齐。此条目在 v1→v2 上调严重度时仅修正了诊断定级，漏修了附属文本。v3 彻底完成一致性修正。 |
| **4. 缺少修复间交互风险评估**（低） | 在 8.3 节末尾新增 (e) "修复间交互风险分析"和 (f) "共享组件/路径的累积风险"两个子节。识别了三组潜在交互：A（G14↔S9 共享错误处理路径）、B（S8↔S1/S2 共享 sessionStorage 命名空间和清理机制）、C（G7↔G14 共用 Markdown 渲染管道）。每组列出了共享组件、交互性质和建议修复顺序。在 8.2 节优先级表中对存在交互风险的修复对增加了 [†A]/[†B]/[†C] 脚注标注。 |
| **5. 缺少"无代码修改需求"条目的显式标注**（低） | 在三个位置增加了"无需代码修改"维度的显式区分：(1) 第1节汇总表增加注脚，列出 G4/G5/S12/S13 四项无需代码修改条目及其结论标签归类；(2) 8.2 节优先级表增加"行动类型"列（代码修复/设计文档更新/仅确认/代码修复-设计确认），G4/G5/S12/S13 拆分为独立行并标注行动类型；(3) 8.1 节影响面分级从低危级中分离出"无需代码修改（仅确认/设计文档更新）"独立行，列出 G4/G5/S12/S13。 |

**修订总结**: 本次 v3 修订全面响应了 v2 审查反馈中的全部5项质量问题（质询确认全部 LOCATED）。重点解决了 v2 中持续存在的修订完整度问题（G5 汇总表矛盾、G14 数字残留）和结构完整性缺失（S8 修复建议函数清单、修复间交互风险、无需代码修改标注）。新增约 1200 字的修复间交互分析和分类标注内容。

---

## 修订说明（v4）

响应 v3/v4 审查报告（b_v3_diag_v2.md）的反馈，本次修订针对全部8个问题（3个中等问题 + 4个低等问题 + 1个轻微问题）进行逐项处理：

| 质询意见 | 回应 |
|---------|------|
| **1. G14 响应拦截器修复方案（方案B）与现有 getErrorMessage 函数不兼容**（中，持续第3→4轮） | 已在 G14 修复建议 方案B 代码块中修正：`Promise.reject(new Error(...))` 改为构造带 `response` 属性的 Error 对象（`err.response = { data: { message: res.data.message } }`），确保与 LifePlan.vue:102 和 Punch.vue:63 中 `getErrorMessage()` 的 `'response' in err` 检查完全兼容。同时在方案B说明中增加了"与 G8 的潜在合并方案"段落——若 G8 同时执行，可在抽取 getErrorMessage 时增加 `err instanceof Error` 分支作为兜底。修改位置：G14 修复建议 方案B 代码块和说明文字。 |
| **2. S5a 隐藏后端 API 依赖，优先级表标注为"无前置依赖"不准确**（中，持续第3→4轮） | 已在三处同步修正：(a) 技术可行性评估（第5节）中 S5a 复杂度从"低"修正为"低至中，取决于后端 API 就绪状态"，并注明 `useHomeApi.ts` 当前仅含 `getArticles`（列表），不存在 `getArticle(id)`；(b) 优先级表 S5a 行"前置依赖"列从"无"改为"待确认：后端 GET /api/articles/:id 接口是否存在"，并新增 [†D] 脚注标注；(c) 8.2 节脚注区新增 [†D] 条目说明 S5a 对后端 API 的具体依赖。修改位置：第5节第682行、8.2 节优先级表第839行、8.2 节脚注第869行后。 |
| **3. S8 sessionStorage 迁移缺少跨标签页同步的具体方案**（中，持续第3→4轮） | 已在 S8 修复建议的"边界条件"和"验证方法"之间新增"跨标签页同步（可选增强）"子节，给出 BroadcastChannel 最小实现方案（含完整 TypeScript 代码示例、4条实现要点、浏览器不支持时的静默降级策略）。明确标注此方案为可选增强，核心修复可独立交付。修改位置：S8 修复建议第218行后新增约20行内容。 |
| **4. S1/S2/S8 修复建议中缺少统一的缓存清理函数实现**（低，持续第3→4轮） | 已在三处追加具体的清理函数暴露说明：(a) S1 修复建议新增"与其他修复的交互"子节——要求 homeStore 暴露 `clearHomeCache()`；(b) S2 修复建议新增"与其他修复的交互"子节——要求 lifePlanStore 暴露 `clearPlanCache()`；(c) S8 修复建议新增"与其他修复的交互"子节——`clearAuth()` 中调用上述两个清理函数，含具体修改清单。三处均指向 8.3(b) 缓解措施和 8.3(e) 交互B 作为交叉引用。修改位置：S1 第63行后、S2 第79行后、S8 第218行后。 |
| **5. G15 修复建议的提示文案与 S7 修复后行为存在语义矛盾**（低，持续第3→4轮） | 已修正：G15 修复建议中提示文案从"分析基于所有打卡记录"改为"分析基于当前筛选范围内的打卡记录"，与 S7 修复后（日期筛选变更触发重新拉取分析）的行为语义一致。修改位置：G15 修复建议第499行。 |
| **6. G14（API success 字段检查缺失）未被任何根因覆盖**（低，持续第3→4轮） | 已在第7节根因分析中新增**根因6"缺乏统一的 API 响应处理规范"**，将 G14 映射至此根因。包含：(a) 根因6的独立描述段落——定位为 API 层的系统性遗漏，与根因5（代码组织）区分；(b) 证据引用（`useApi.ts` 响应拦截器 + 10个 API 函数）；(c) 根因到问题映射表新增根因6行。修改位置：第7节第726-772行区域（根因5描述后新增根因6，映射表新增根因6行）。 |
| **7. 8.3(b) 副作用评估的缓解措施与各修复建议之间脱节**（低，持续第3→4轮） | 已在两处建立交叉引用：(a) 8.3(b) 缓解措施后新增"与修复建议的交叉引用"段落，明确指向 S1/S2/S8 中新增的"与其他修复的交互"子节，说明修复者按优先级顺序实施时的操作路径；(b) S1/S2/S8 各自的"与其他修复的交互"子节中均引用了 8.3(b) 和 8.3(e) 交互B 作为交叉参考。修改位置：8.3(b) 第854行后、S1 第63行后、S2 第79行后、S8 第218行后。 |
| **8. 8.3(e) 交互C（G7↔G14）的因果逻辑不准确**（轻微，本轮新发现） | 经源代码验证（Punch.vue:172-190 模板 v-if/v-else-if 互斥链：`analysisLoading` → `analysisError` → `analysis`），已确认 G14 修复后 `success:false` 触发 reject → Store catch 设置 `analysisError` → 模板渲染错误降级 UI，Markdown 渲染分支不被进入。因此：(a) 8.3(e) 交互风险表条目C 的交互性质已修正——删除原"可能产生 null 输入"的因果论述，改为"经源代码验证，G14 修复后不会将 null 输入传给 renderMarkdown"；(b) 建议修复顺序从"G7 抽取时需同步增加空值防御以兼容 G14"改为"G7 抽取时建议增加空值防御作为通用健壮性增强，不特定关联 G14"；(c) 8.2 节脚注 [†C] 同步修正。修改位置：8.3(e) 交互风险表条目C、8.2 节脚注 [†C]、8.2 节脚注 [†D]（新增）。 |

**修订总结**: 本次 v4 修订全面响应了 b_v3_diag_v2.md 审查反馈中的全部8个问题（3中/4低/1轻微）。重点解决了持续4轮的 G14 方案B 兼容性修复（影响10个 API 函数的错误提示路径）、持续3轮的 S5a 后端 API 依赖标注缺失、S8 跨标签页同步方案缺失，以及交叉引用体系的系统性格局修复（S1/S2/S8 清理函数落实 + 8.3(b) 脱节问题 + 8.3(e) 交互C 源代码验证修正）。新增根因6完善了根因分析对 G14 的覆盖。修改涉及约15处目标位置，新增约1800字内容。

---

## 修订说明（v5）

响应质询报告（a_v5_challenge_v4.md）的反馈及迭代需求（a_v5_iteration_requirement.md）中的审查结果，本次修订针对全部10项问题进行了逐项处理：

| 质询意见 | 回应 |
|---------|------|
| **S5b chatStore 未验证（严重，v4审查问题1）**: 诊断报告对 S5b 的技术可行性评估和复杂度判断基于未经验证的依赖假设"chatStore 和 SSE 机制就绪"，从未实际读取 `chatStore.ts` | 经实际读取 `src/stores/chatStore.ts`（13行）和 `src/types/sse.ts`（30行），确认 chatStore 为骨架实现——`conversations` 为 `ref([])` 空数组，`abortActiveConnection()` 为空函数体，不含任何 SSE/EventSource/WebSocket 代码，sse.ts 类型完全未被引用。已将 S5b 拆分为两个子任务：**S5b-1**（实现 chatStore SSE 核心——EventSource连接、消息收发、断线重连、conversation_id 管理、多医生会话路由、fabOpen 状态，复杂度"高"，P0）和 **S5b-2**（实现 DoctorChatView.vue 组件 + 路由注册，复杂度"中高"，P1，依赖 S5b-1）。8.2 节优先级表同步更新。修改位置：S5b 诊断条目（第137-156行）、5节技术可行性评估（第737行）、8.2节优先级表（第869-870行）。 |
| **S5a 降级方案 Article 类型限制（一般）**: 质询指出 `Article` 类型（api.ts:124-139）不含 `content`/`body` 字段，降级方案（`getArticles()` + 客户端筛选）仅能交付"文章元数据详情页"而非"完整文章详情页"，使 S5a 的"复杂度低至中"评估偏向乐观 | 已在三处同步修正：(a) S5a 代码证据增加 Article 类型字段清单及不含 `content` 字段的明确标注；(b) 修复建议新增"后端 API 不可用时的降级方案（v5新增）"子项——说明降级路径限制、MVP 交付物范围（文章元数据详情页）、两态渲染模式（`v-if="article.content"`）、预期返回类型（`ArticleDetail extends Article { content: string }`）；(c) 复杂度重评估——后端接口就绪时"低"，未就绪时"中"。修改位置：S5a 代码证据（第125行）、修复建议（第130行后）、5节技术可行性评估（第735行）。 |
| **G18 修复建议与 S9 关系未建立交叉引用（中，v4审查问题2）**: G18 推荐方案A（requestId 快照）与 S9 完全相同，但未引用 S9 也未说明 S9 完成后 G18 的哪些部分已被覆盖 | 已在 G18 修复建议末尾新增"与 S9 的关系（v5新增）"子项——明确列出 S9 为 punchStore 三个 action 实现的 requestId 快照覆盖范围，以及 G18 需补充保护的 homeStore/lifePlanStore action（`fetchHomeData`/`fetchCurrent`/`generate`/`adjust`），含具体函数签名。8.2 节 S9 行和 G18 行通过 [†A] 脚注互相引用。修改位置：G18 修复建议（第580行后）。 |
| **P2 优先级层内部缺少执行排序（中，v4审查问题3）**: 8.2 节 P2 层内 S9/S4+S11/S8/G14 四项未说明执行顺序，且存在两条隐式依赖 | 已在 8.2 节 P2 行后新增"P2 层内部执行排序（v5新增）"段落——建议 S9 最先（解除 S3/S7 P1 批处理组的隐式依赖），G14 次之（影响面最广），S4+S11 随后，S8 最后。同时更新 S3/S7 P1 行说明为"建议在 S9 完成后再执行"。修改位置：8.2 节优先级表（第877行后）。 |
| **S5a 缺少后端 API 不可用时的降级实现路径（中，v4审查问题4）**: 修复建议仅停在"需确认后端是否已有接口"层面，未提供后端 API 不存在时的降级方案 | 已在 S5a 修复建议中新增降级方案子项（见上"Article 类型限制"行），给出 `getArticles()` + 客户端 `find()` 筛选的具体实现路径、两种渲染模式的模板代码模式、后端接口就绪后的自动激活机制。同时明确降级方案的实质性限制（不含正文 content 字段）。修改位置：同 S5a 降级方案行。 |
| **S8 BroadcastChannel 跨标签页同步代码示例存在模块级初始化副作用（低，v4审查问题5）**和**BC 消息体不含实际 token 数据（轻微）**和**数据局限性（轻微，质询补充）** | 三处缺陷在 v5 中一并修正：(1) **懒初始化**——从模块顶层 IIFE `new BroadcastChannel(...)` 改为 `let channel = null` + `getChannel()` 按需懒初始化函数，避免单元测试/SSR 环境副作用；(2) **状态就绪检查**——`onmessage` 中增加 `token.value` 非空检查，避免 Store 未完全水合时执行状态同步；(3) **数据携带**——`postMessage` 消息体携带实际 token/role/user 数据（而非仅通知标志），因为 sessionStorage 按标签页隔离，接收方 `syncFromStorage()` 只能读取自身的空 sessionStorage，不携带数据则跨标签页同步无法实际生效。修改位置：S8 BC 代码示例（第229-260行）。 |
| **修复建议的验证方法缺少 TypeScript 编译检查步骤（低，v4审查问题6）**: 多项涉及新建文件/导出导入/类型签名的修复，验证方法仅覆盖运行时行为 | 已在 G7、G8、G12、S5a、S5b-2、S10、G9 的验证方法中各增加一条 `执行 vue-tsc --noEmit` 或 `执行 npm run build 确认通过` 的编译验证步骤。受影响条目：G7（useMarkdown.ts）、G8（errorMessage.ts）、G12/S10（sanitize.ts 新建+三处替换）、S5a/S5b-2（新建Vue组件+路由注册）、G9（合并接口后TS编译）。修改位置：各条目验证方法末尾。 |
| **第1节汇总表统计数字与详细条目诊断结论标签存在轻微不一致（低，v4审查问题7）**: "设计对齐"行标注为"3严重+1一般=4"，但仅 S8 和 S13 标签为"设计对齐"（2项），G4 标签为"部分确认" | 已逐项核对全部42个条目的头部诊断结论标签，修正汇总表："设计对齐"行从 3+1=4 修正为 2+0=2；G4 从"设计对齐"行移入"部分确认"行（2项含G4）；"确认"行从 10+26=36 修正为 11+26=37。注脚说明 G4 标签真实性（代码符合设计但设计文档内部矛盾→部分确认）。修改位置：第1节汇总表（第15-22行）。 |
| **getDiabetesType(id) 编码实践作为实现模板可能传播不精确模式（轻微，质询补充）**: `getDiabetesType(id)` 对 number 主键使用 `encodeURIComponent` 不标准——number 无需 URI 编码 | 已在 S5a 关键逻辑 (a) 中增加注意：`id` 为 number 时路径拼接使用 `String(id)` 或模板字符串直接拼接，并标注 `encodeURIComponent` 对 number 主键不必要，`getDiabetesType` 作为实现模板引用时可能传播不精确的编码实践。修改位置：S5a 关键逻辑（第129行）。 |

**修订总结**: 本次 v5 修订全面响应了质询报告（a_v5_challenge_v4.md）中的1个一般问题 + 2个轻微问题，以及迭代需求中的7个审查问题（严重1/中4/低3/轻微1——其中质询问题与审查问题重叠者合并处理，实际处理10项独立问题）。重点解决了 S5b chatStore 骨架验证（改变了对 S5b 工作量的评估从"中高"到"高+S5b-1硬前置依赖"）、S5a 降级方案 Article 类型限制修正（改变了 S5a 在降级场景下的交付能力评估）、S8 BC 机制的3处缺陷修正（懒初始化+状态检查+数据携带）、G18/S9 交叉引用体系建立、P2 优先层排序、TS 编译检查覆盖和汇总表统计修正。修改涉及约12处目标位置，新增约2500字内容。v5 修订的核心贡献是将诊断报告从"信任标注"模式升级为"验证标注"模式（S5b chatStore 骨架的代码级验证），并弥补了 S5a 降级方案在数据契约层面的评估盲区（Article 类型字段的完整审计）。

---

## 修订说明（v6）

响应质询报告（a_v5_challenge_v5.md）的反馈，质询结论为 CHALLENGED（2个质询要点）。经实际代码验证（`src/views/Consultation.vue` 为7行占位页面），两项质询均成立。本次修订针对以下3个维度进行改进：

| 质询意见 | 回应 |
|---------|------|
| **质询要点1: S5b-2 诊断在未读取 Consultation.vue 的情况下，将修复范围描述为"添加医生卡片跳转逻辑"，但实际文件为7行占位页面，不含任何医生卡片（一般）** | 经实际读取 `src/views/Consultation.vue`（7行）确认——模板仅含静态文字 `<p>医师咨询 — 待组员开发</p>`，不含任何 `<script setup>`、医生列表、`v-for` 渲染或点击事件处理。已在 S5b 诊断条目中进行以下修正：(a) **代码证据**新增 Consultation.vue 占位状态验证段落（v6 补充），明确标注"即使 DoctorChatView.vue 和路由就绪，用户也无法通过正常导航路径进入医生对话界面"；(b) **S5b-2 修复建议**完全重写"需修改文件"和"关键逻辑"——Consultation.vue 从"添加跳转逻辑"改为"从7行占位页面重写为医生列表功能页面"，新增"Consultation.vue 重构要点"子项（含 API 集成、v-for 卡片渲染、三态处理、在线标识等具体实现指引）；(c) **S5b-2 复杂度**从"中高"上调为"中高至**高**"，并标注若团队将 Consultation.vue 完整实现剥离为独立 Todo 项时的替代评估路径；(d) **S5b 头部标题**更新为明确包含"Consultation.vue 入口页"。修改位置：S5b 诊断条目（第135-160行）、5节技术可行性评估（第740行）、8.1节影响面分级（第854行）、8.2节优先级表 S5b-2 行（第879行）。 |
| **质询要点2: 根因2（路由拆分未跟进）仅描述组件文件和路由配置缺失，未覆盖 Consultation.vue 占位状态，因果链不完整（一般）** | 经核实，根因2 的因果链确实遗漏了 Consultation.vue 已创建但为占位这一关键环节——完整的因果链应为"设计拆分→列表页仅创建占位+对话页未创建→用户无法从任何正常导航路径进入医生对话功能"。已在以下位置修正：(a) **根因2 描述**全面重写——将 Consultation 的拆分产物从"Consultation.vue + DoctorChatView.vue"修正为"Consultation.vue（医生列表+跳转入ロ）+ DoctorChatView.vue（医生对话）"，增加 Consultant.vue 占位状态的专段分析（"已创建但功能未实现"），补充完整的因果链推导；(b) **根因证据**增加 `Consultation.vue` 为7行占位文件的代码验证引用；(c) **根因到问题映射表**更新"路由拆分未跟进"行——S5b 说明扩展为"含 Consultation.vue 占位——医生列表入口页未实现，属于 S5b 修复范围中的独立前置条件"。修改位置：第7节根因2（第790-806行）、根因到问题映射表（第837行）。 |
| **S5b-2 工作量未纳入优先级评估（轻微，质询补充观察）** | 质询报告指出 S5b-2 的复杂度评估（"中高"）和优先级（P1）仅基于 DoctorChatView.vue 创建 + 路由注册的估量，未反映 Consultation.vue 的构建工作。已在三处同步修正：(a) 复杂度重评估明确区分"包含 Consultation.vue 完整实现"和"剥离为独立 Todo"两种场景的工作量及复杂度；(b) 8.2 节优先级表 S5b-2 行"前置依赖"列和"说明"列均标注 Consultation.vue 医生列表 UI 为独立前置任务；(c) 8.1 节影响面分级 S5b 行明确标注两个阻断点（入口页占位 + 目标页缺失）。若团队决定将 Consultation.vue 完整实现剥离为新的 S14 或 G30 Todo 项，建议标注为 P0 前置任务——因为即使 DoctorChatView.vue 和路由就绪，无 Consultation.vue 医生列表入口则医生对话功能的完整用户路径不可达。修改位置：S5b-2 复杂度重评估（第155行）、8.2 节优先级表 S5b-2 行（第879行）、8.1 节影响面分级（第854行）。 |

**修订总结**: 本次 v6 修订全面响应了质询报告（a_v5_challenge_v5.md）中的2个质询要点和1个补充观察（均成立）。核心贡献是修正了 S5b-2 诊断中对 Consultation.vue 状态的未经验证假设——v5 将 Consultation.vue 描述为"有医生卡片需添加跳转逻辑"，v6 经实际代码验证后修正为"7行占位页面需完整构建医生列表 UI"。这一修正改变了 S5b-2 的工作量评估（从"中高"上调至"高"级，涉及 Consultation.vue 的完整前端页面构建）、根因2 的因果链完整性（从"组件缺失"扩展为"组件缺失+占位未实现"）、以及修复优先级表的依赖标注（新增 Consultation.vue 为独立前置条件）。修改涉及 S5b 诊断条目、第5节技术可行性、第7节根因分析、第8节优先级评估四个章节共约7处目标位置，新增约1800字内容。

---

## 修订说明（v7）

响应质询报告（a_v5_challenge_v6.md）的反馈，质询结论为 CHALLENGED（3个质询要点：1严重+2一般+3轻微）。经查阅项目设计文档（`docs/1_requirements_analysis_v1.md` 第15.2节、`docs/1_requirements_analysis_v2.md` 第989行、`docs/2_detailed_design_v3.md` 第2373行/第3543行）和源代码（`src/composables/useHomeApi.ts`、`src/stores/homeStore.ts:44-48`、`src/types/api.ts:124-139`），全部7项质询问题均成立。本次修订针对以下7个维度进行改进：

| 质询意见 | 回应 |
|---------|------|
| **质询要点1: S5b-1 修复建议推荐 EventSource API 与项目设计文档规定的 fetch+ReadableStream 方案矛盾（严重）** | 经查阅项目设计文档确认：(1) `docs/1_requirements_analysis_v1.md` 第15.2节（第1401-1407行）已将"推荐使用 EventSource API"标记为严重审查问题并修正为 `fetch + ReadableStream`，原因明确——EventSource 不支持自定义 HTTP 头，无法携带 JWT Token（`Authorization: Bearer <token>`）通过认证；(2) `docs/1_requirements_analysis_v2.md` 第989行、`docs/1_requirements_analysis_v3.md` 第635行再次强调"不使用 EventSource API"；(3) `docs/2_detailed_design_v3.md` 第2373行明确"前端在fetch的ReadableStream中按 `\n\n` 分隔事件块，每行去除 `data: ` 前缀后JSON.parse解析"，第3543行 DoctorChatView.vue 流程图中 SSE 请求方式为 `fetch POST /api/chat/doctor/:id`。已在 S5b-1 修复建议中进行全面修正：(a) **关键逻辑**从 EventSource 连接管理重写为 fetch + ReadableStream 实现（含 POST 请求头携带 `Authorization: Bearer token` + `Content-Type: application/json`、`response.body.getReader()` 逐块读取、按 `\n\n` 分隔事件块、去除 `data: ` 前缀后 JSON.parse 解析、event 字段分发到 message/message_end/error 处理分支）；(b) **断线重连**从 EventSource 自动重连改为 fetch 重试 + 指数退避（初始 1s，倍增上限 30s，max 5次）；(c) **AbortController 集成**——`abortActiveConnection()` 调用 `AbortController.abort()` 关闭当前 fetch 流（替代 v6 的"关闭 EventSource 连接"），与 G18 AbortController 机制协同；(d) **边界条件**删除"浏览器不支持 EventSource 时降级为轮询"（fetch API 在所有现代浏览器含移动端均可用），改为 `response.status === 401` 时的 Token 过期处理（对齐设计文档流程图 401 分支）；(e) S5b-1 头部增加**技术方案修正声明**，引用设计文档证据并说明修正理由。修改位置：S5b-1 修复建议（第142-162行）、5节技术可行性评估（第768行）、8.2节优先级表 S5b-1 行（第907行）。 |
| **质询要点2: S5a 降级方案未验证 getArticles() 的全量返回行为（一般）** | 经实际读取 `src/composables/useHomeApi.ts` 确认：(1) `getArticles(params: ArticlesParams = {})` 类型签名为 `Promise<Article[]>`（仅返回数组，丢弃 pagination 元数据——`PagedBody<Article>` 中的 `pagination: PaginationInfo` 被 `return res.data.data` 丢弃）；(2) 内部调用 `api.get<PagedBody<Article>>('/articles', { params })`，响应类型明确包含分页信息；(3) API 注释标注为"GET /api/articles（分页 + 分类筛选）"。因此 `getArticles()` 是分页 API，诊断报告此前未验证后端在 `page`/`pageSize` 参数缺失时的默认行为。已在 S5a 降级方案中进行以下修正：(a) 降级方案描述从"可用"改为"条件可用"，明确标注两个待验证项——分页默认行为和 Article 类型的 content 字段缺失；(b) 补充具体分析：若后端默认返回首页（如 page=1, pageSize=10），`find()` 仅搜索首页数据，目标文章不在首页则降级方案不可用；若后端返回全部文章则降级方案有效；(c) 复杂度评估增加"降级方案需先验证分页行为"的条件限定。修改位置：S5a 降级方案（第132行）、5节技术可行性评估（第767行）。 |
| **质询要点3: G18 requestId 快照扩展至 homeStore.fetchHomeData() 的并行场景适配未说明（一般）** | 经实际读取 `src/stores/homeStore.ts:44-48`，确认 `fetchHomeData()` 使用 `Promise.allSettled` 并行执行 3 个请求（getDoctors/getArticles/getDiabetesTypes）。已在 G18 修复建议的"与 S9 的关系"子项中新增**并行场景 page instance token 实现**专段：(a) 推荐**整体丢弃策略**——三个请求是同一次页面加载的原子操作，入口递增 `pageInstanceId` 一次，`Promise.allSettled` 完成后统一检查快照，过期则整体丢弃；(b) 给出具体代码模式（`const pageToken = ++pageInstanceId` → `await Promise.allSettled` → `if (pageToken !== pageInstanceId) return`）；(c) 明确不需要逐请求独立 requestId——"部分采用"在场景中无合理语义；(d) 与 punchStore requestId 模式的一致性说明（语义等价，变量名区分 `pageInstanceId` vs `requestId`）。修改位置：G18 修复建议（第583-598行）。 |
| **S5a 设计意图与 API 类型约束之间的张力未分析（轻微，质询补充）**: 设计文档 1.6.1 节路由映射表要求 `/news/article/:id → ArticleDetailView.vue`，暗示详情页含正文；但 `Article` 类型不含 `content` 字段且注释标注"列表项"。此张力未在诊断中分析 | 已在 S5a 代码证据后新增"设计意图与类型约束的张力分析"子项——分析两种可能：(a) 设计文档预期了独立文章详情 API（返回 `ArticleDetail extends Article { content: string }`），但类型定义阶段未创建该类型；(b) 设计文档撰写时未考虑类型约束，详情页仅展示元信息。诊断无法从现有文档中确定答案，修复者实施前需与设计方/后端确认。修改位置：S5a 代码证据后（第125-128行）、5节技术可行性评估（第767行）。 |
| **S5b-1 技术可行性评估中的 SSE 实现路径与设计文档不一致（轻微，质询补充）**: 技术可行性评估描述"需从头构建：EventSource连接管理"，未引用设计文档已有的 fetch+ReadableStream 规范 | 已在 5 节技术可行性评估 S5b-1 行全面重写——删除 EventSource 描述，改为引用 `docs/1_requirements_analysis_v1.md` 第15.2节、`docs/1_requirements_analysis_v2.md` 第989行、`docs/2_detailed_design_v3.md` 第2373行的 fetch+ReadableStream 规范，并描述完整的 chunk→文本→事件块→JSON 解析管道。修改位置：5节技术可行性评估 S5b-1 行（第768行）。 |
| **P2 优先级层与 P1 批处理组之间的依赖矛盾未做最终裁决（轻微）**: S9 定级 P2 但为 P1 批处理组 S3+S7 的前置依赖，v5/v6 给出"上调至 P1"和"在 S9 完成后执行 S3+S7"两种替代建议但未裁决 | 已在 8.2 节做出最终裁决：**S9 从 P2 上调至 P1**，置于 P1 层最前（S3+S7 之前执行）。裁决依据三条：(1) S7 修复建议明确要求 fetchAnalysis 需先有竞态保护——硬性依赖约束；(2) S9 实现工作量极低（约5行代码，复用同文件已有模式），不显著增加 P1 层总工作量；(3) 上调消除了优先级标签与依赖关系的矛盾。8.2 节优先级表 S9 行从 P2 移至 P1，P2 层内部排序删除 S9 条目。修改位置：8.2 节优先级表（第883-889行）、P2 层排序段落（第892行）。 |
| **S5b-2 修复建议和 Consultation.vue 重构要点中未提及 SSE 连接所需的认证请求头携带规范（轻微，质询补充观察）**: S5b-2 的 DoctorChatView.vue 关键逻辑描述了"集成 S5b-1 完成的 chatStore 进行 SSE 流式对话"，但未提及 chatStore 需要从 authStore 获取 token 并附加到 SSE 请求头 | 此问题不属于诊断报告的疏漏——chatStore 内部如何获取 token 是 S5b-1 的实现细节（chatStore 内部 `import { useAuthStore }` → `const token = authStore.token` → 在 fetch 请求头中拼接 `'Authorization': 'Bearer ' + token`），已在 S5b-1 修复建议的 fetch 请求头规范中体现。S5b-2 的"集成 S5b-1 完成的 chatStore"描述已隐含了 S5b-1 输出的完整接口（包括 token 管理），无需在 S5b-2 中重复描述。此条不纳入修订范围。 |

**修订总结**: 本次 v7 修订全面响应了质询报告（a_v5_challenge_v6.md）中的3个质询要点（1严重+2一般+3轻微，第7条轻微不纳入修订范围，实际处理6项独立问题）。核心贡献是将 S5b-1 的 SSE 实现方案从 EventSource 修正为项目设计文档规定的 `fetch + ReadableStream`——这是一个已被项目历史审查识别并修正过的技术错误（EventSource 无法携带 JWT 认证头），诊断报告在 v6 及此前版本中重复了此错误。此次修正改变了 S5b-1 的技术实现路径（从浏览器原生 EventSource API 到手动 fetch+ReadableStream 管道，包含 chunk→文本→`\n\n` 分隔→`data:` 去除→JSON.parse→event 分发的完整解析链）、边界条件（删除"EventSource 不支持时降级为轮询"、新增 401 处理分支）、以及与 G18 AbortController 机制的协同方式。同时修正了 S5a 降级方案在分页行为上的未验证假设（从"确定可用"下调为"条件可用"），补充了 G18 在 Promise.allSettled 并行场景下的 page instance token 实现路径，裁决了 P2 优先级矛盾（S9 上调至 P1），并新增了 S5a 设计意图与类型约束的张力分析。修改涉及 S5a/S5b-1/G18 三个诊断条目、第5节技术可行性、第8节优先级评估共约9处目标位置，新增约4000字内容。

---

## 修订说明（v8）

响应组件B质量审查报告（b_v5_diag_v1.md）的6个质量问题反馈，聚焦内部审议未充分覆盖的维度。本轮修订为诊断报告第8次迭代，全部6项问题均成立。本次修订针对以下6个维度进行改进：

| 质询意见 | 回应 |
|---------|------|
| **1. G18 pageInstanceId 变量声明位置缺失（中）**: G18 修复建议为 `homeStore.fetchHomeData()` 提供了详细的 page instance token 实现代码示例（`const pageToken = ++pageInstanceId`），但从未说明 `pageInstanceId` 变量应在何处声明、以何种形式（`let`/`ref`）存在。对比 punchStore.ts 中的 `requestId` 模式（Store 顶层声明），G18 的 homeStore 适配缺少等价的变量声明指引 | 已在 G18 代码示例前新增"`pageInstanceId` 变量声明位置（v8新增）"专段，明确指出：(a) `pageInstanceId` 应在 `src/stores/homeStore.ts` 的 Store 函数体内、`fetchHomeData()` 函数外部声明；(b) 以 `let pageInstanceId = 0` 形式存在（无需响应式绑定，仅 `fetchHomeData` 内部使用）；(c) 引用 `punchStore.ts:52` 的 `const requestId = ref(0)` 作为参考模式，说明变量位置等价但形式不同（homeStore 用 `let` 而非 `ref`）；(d) 给出完整的声明位置说明——在 `export const useHomeStore = defineStore('home', () => {` 之后、`fetchHomeData` 函数定义之前。修改位置：G18 修复建议代码示例前（第602-603行区域）。 |
| **2. "阻塞"术语双义冲突（中）**: 第5节（技术可行性评估，第777行）的结论为"42项问题均无阻塞性技术障碍"，其中"阻塞"指向实现层面的技术可行性。第8.1节（影响面分级，第881行）使用"阻塞级（影响功能可用性）"，其中"阻塞"指向用户层面的功能可用性。两处使用同一个中文词汇表达完全不同的两个维度，且未在文中注明区分 | 已在两处同步修正：(a) **8.1节**将"阻塞级（影响功能可用性）"改为"**功能阻断级（用户不可用**，影响功能可用性）"，从措辞上与第5节"技术障碍"维度明确区分；(b) **第5节末尾**新增术语说明块，明确指出此处的"阻塞"指技术可行性层面（是否存在无法通过前端代码修改解决的技术瓶颈），8.1节的"功能阻断级"指用户功能可用性层面（是否导致用户完全无法使用某功能），两处同词不同义在此明确区分。修改位置：8.1节影响面分级（第881行）、5节技术可行性评估末尾（第777行后）。 |
| **3. G4行动类型标注与实际修复建议不一致（一般）**: 8.1节影响面分级将G4列入"无需代码修改（仅确认/设计文档更新）"，8.2节优先级表将G4的"行动类型"标注为"仅确认"。但G4修复建议正文明确要求"在代码注释中标注设计文档对两种模式的描述位置差异"——向源代码添加注释属于代码修改操作，与"仅确认"/"无需代码修改"标签矛盾 | 采用审查建议**方案B**（推荐方案）：删除修复建议中"在代码注释中标注"的代码修改要求，改为"在设计文档中标注两种模式为有意并存"（纯设计文档更新，无需修改源代码）。已在三处同步修正：(a) **G4 修复建议**——"建议在代码注释中标注"改为"建议在设计文档中标注两种模式为有意并存"，增加"无需修改代码"结论；(b) **8.1节**——G4 行说明从"仅加注释说明"改为"仅在设计文档中标注两种模式为有意并存"，附 v8 修正说明；(c) **8.2节**优先级表 G4 行——行动类型从"仅确认"改为"设计文档更新"，说明列同步更新并附 v8 修正标注。修改位置：G4 修复建议（第411行）、8.1节 G4 条目（第896-897行）、8.2节优先级表 G4 行（第924行）。 |
| **4. 缺少修复后的全局集成测试策略（一般）**: 诊断报告为每个诊断条目提供了独立的"验证方法"（逐条覆盖42项），8.3(e)节也分析了三组修复对之间的交互风险。但缺少一个章节或段落描述所有修复完成后的集成验证策略——需按什么顺序测试哪些用户路径、哪些跨模块场景需特别关注、回归测试的最小范围 | 已在 8.3(f) 节后新增**8.3(g) 集成验证建议（v8新增）**子节，包含四部分：(a) **核心用户路径端到端验证**——5条完整用户路径的验证清单表格（登录→首页→文章详情；风险预测→生活方案→打卡；打卡页筛选→加载更多→刷新；医师咨询入口→SSE对话→断网重连；登出→重新登录数据隔离），每条路径标注关联修复编号；(b) **交互风险专项验证**——对应 8.3(e) 三组交互（A/B/C）的专项验证点和具体验证方法（含 Mock 条件、操作步骤、预期结果）；(c) **跨标签页场景验证**——S8 sessionStorage 迁移后的2个跨标签页场景（新标签页登录态同步、登出同步）及 BC 可选增强的验证点；(d) **边界网络条件验证**——4种网络条件（慢网络/离线/快速页面切换/`success:false`+HTTP200）下的验证内容和关联修复。同时明确回归测试最小范围（`vue-tsc --noEmit` 编译检查 + 三个 Store 单元测试 + 三个 View 核心路径手动验证）。修改位置：8.3(f) 与 8.4 节之间（原第994行后）。 |
| **5. S5a诊断缺少直接API验证路径建议（一般）**: S5a的"设计意图与类型约束的张力分析"正确识别了设计文档暗示详情页含正文但 Article 类型不含 content 字段的矛盾，结论为"诊断无法从现有文档中确定答案，修复者实施前需与设计方/后端确认"。但报告未建议修复者在确认前先通过浏览器开发者工具或直接调用后端API来验证 GET /api/articles/:id 的实际返回数据——这是比"与设计方确认"更直接、更快速的信息获取路径 | 已在 S5a 张力分析末尾新增**"操作建议（v8新增）"**段落，引导修复者：(a) 打开浏览器 DevTools Network 面板，访问已部署后端环境中的 `/api/articles/1`（或任意已知文章 ID），直接观察响应体 JSON 是否包含 `content`/`body` 字段；(b) 或使用 `curl -H "Authorization: Bearer <token>"` 命令行直接请求 API。同时给出两种观察结果的对应结论——若响应体含正文则方案(a)成立需新建 `ArticleDetail` 类型，若仅含列表字段则方案(b)成立以元数据详情页交付。修改位置：S5a 张力分析末尾（第125-128行区域）。 |
| **6. 8.2节优先级表缺少总体工时估算（轻微）**: 8.2节优先级表对每个问题标注了"严重度"和"复杂度"，但未提供任何时间维度的估算。仅有复杂度标签不足以进行迭代排期——"高复杂度"的S5b-1和S5b-2的实际工时可能有数量级差异 | 已在 8.2 节优先级表中新增**"预估工时"列**（置于"前置依赖"与"可批处理组"之间），并对全部条目填入粗略工时估算：(a) P0/P1 高复杂度条目给出具体范围估计（S5b-1 16-24h、S5b-2 16-24h），并标注工时构成和不确定性条件；(b) 中等复杂度条目给出 2-6h 范围；(c) 低复杂度条目给出 0.5-2h 范围；(d) 仅确认/设计文档更新条目标注为 0h 或 ~0.5h；(e) 在优先级表后新增**"预估工时汇总（v8新增）"**段落——P0+P1 总计约 43-70h（5.4-8.8人天），P2 总计约 7-11h，P3 总计约 7-11h，P4 总计约 7-12h，全部42项修复总预估工时约 64-104h（8-13人天）。同时注明"粗略数量级参考，不含代码审查/联调/后端依赖等待时间，实际工时会因开发者熟悉度等因素浮动"。修改位置：8.2 节优先级表表头及全部数据行（第906-930行区域）、表后新增汇总段。 |

**修订总结**: 本次 v8 修订全面响应了组件B质量审查报告（b_v5_diag_v1.md）中的6个质量问题（2中+3一般+1轻微）。核心贡献是：(1) 补全了 G18 修复建议的完整性缺口——明确了 `pageInstanceId` 变量在 homeStore.ts 中的声明位置、形式和参考模式，修复者不再需自行推断；(2) 消除了"阻塞"术语的双义混淆——第5节"技术可行性"与第8.1节"功能阻断级"在措辞上明确区分并附说明；(3) 修正了 G4 行动类型标签与实际修复建议的矛盾——采用方案B统一为设计文档更新，消除了"仅确认"标签与"在代码注释中标注"操作的矛盾；(4) 填补了集成层面的深度不足——新增完整的集成验证策略子节（8.3(g)），覆盖核心用户路径清单、交互风险专项验证、跨标签页场景和边界网络条件四维验证矩阵；(5) 为 S5a 的张力分析补充了直接 API 验证路径操作建议——DevTools/curl 验证比口头确认更快速准确；(6) 为 8.2 节优先级表新增预估工时列及汇总——给出 P0+P1 43-70h 全量 64-104h 的粗略工时参考，支撑迭代排期决策。修改涉及 G18 修复建议、第5节技术可行性、第8.1节影响面分级、第8.2节优先级表、第8.3节交互风险分析、S5a 张力分析共约12处目标位置，新增约3500字内容。

---

## 修订说明（v9）

响应质询报告（a_v6_challenge_v1.md）的3个质询要点（全部成立），本次修订针对以下3个维度进行改进：

| 质询意见 | 回应 |
|---------|------|
| **质询要点1: S5a 张力分析证据检索不完整——设计文档第6节第6224行明确记载 `GET /api/articles/:id 返回完整文章（含 content），views 计数+1`，可直接解答"文章详情页是否应含正文"问题，但诊断报告未引用该证据** | 经查阅设计文档确认：(1) `docs/2_detailed_design_v3.md` 3.2.20 节（第2051行）明确 `GET /api/articles/:id` 响应体包含 `content` 字段（Markdown 正文）、`is_collected`、`tags`、`summary` 等完整字段；(2) 同文档 6 节接口测试规范（第6224行）再次确认"`GET /api/articles/:id 返回完整文章（含 content），views 计数+1"；(3) `docs/1_requirements_analysis_v2.md` 第943-963行同样包含该 API 的完整正文响应描述。该 API 契约在项目文档的多个章节（需求分析、接口设计、测试规范）中均一致记载，具有充分的证据效力。已在三处同步修正：(a) **S5a 设计依据**——新增 3.2.20 节和 6 节引用，纳入 API 契约证据；(b) **S5a 张力分析**——从"诊断无法从现有文档中确定答案"修正为"v9 定论：方案(a)已由设计文档确认"，明确指出 `Article` 类型与 API 契约之间的缺口是前端类型定义遗漏，修复时需新建 `ArticleDetail extends Article { content: string; is_collected: boolean }` 类型；(c) **第5节技术可行性评估 S5a 行**——复杂度从"低至中，取决于后端API就绪状态"修正为"低（设计契约已明确，纯前端实现无后端不确定性，降级方案不再必要）"。操作建议（DevTools/curl 验证）保留作为对设计文档证据的二次确认手段。修改位置：S5a 设计依据（第123-124行）、S5a 张力分析（第125-128行）、第5节 S5a 行（第771行）。 |
| **质询要点2: S5b-1 前端 API composable 层创建需求未显式识别，与 S5a 的 [†D] API 依赖分析标准不一致——代码库中不存在 `useChatApi.ts` 或等价的 chat API composable，`POST /api/chat/doctor/:id` 的前端调用函数需从零创建** | 经全局搜索 `src/` 目录确认，不存在任何 chat 相关的 API composable 文件。已在四处同步修正：(a) **S5b-1 修复建议"需修改文件"**——新增"需新建文件（v9新增 — API composable 层）"条目，给出 `useChatApi.ts` 的具体函数规格（`sendChatMessage()` 和 `getDoctorInfo()`），对标 S5a [†D] 分析标准；(b) **第5节技术可行性评估 S5b-1 行**——新增"API composable 层新建"作为复杂度构成项，注明经全局代码搜索确认 API composable 层完全缺失；(c) **8.2节优先级表 S5b-1 行**——"前置依赖"列新增 G14（建议），工时从 16-24h 上调至 20-28h（覆盖 `useChatApi.ts` 创建 2-4h），说明列新增 `useChatApi.ts` 创建任务；(d) **预估工时汇总**——P0+P1 总计从 43-70h 修订为 47-78h，全量从 64-104h 修订为 68-112h。修改位置：S5b-1 修复建议（第147行后）、第5节 S5b-1 行（第772行）、8.2节优先级表 S5b-1 行（第914行）、预估工时汇总段（第923行）。 |
| **质询要点3: 根因2"路由拆分未跟进"对 S5a 和 S5b 的完成度层级差异做了同质化概括——S5a 为3层缺失（组件+API函数+类型，约2-4h），S5b 为5层缺失（chatStore骨架+Consultation占位+组件+API composable+SSE通信层，约36-52h），两者修复工作量存在约10倍差异** | 已在两处同步修正：(a) **根因2 描述**——在 v6 修正说明后新增"v9新增 — S5a与S5b完成度层级差异"专段，分别列出两者的缺失层数和预估工时差异（2-4h vs 36-52h，约10倍），明确说明修复者在初读根因时不应将两者视为同等量级的问题；(b) **根因到问题映射表"路由拆分未跟进"行**——S5a 列扩展为"3层缺失——组件+API函数+类型，约2-4h"，S5b 列扩展为"5层缺失——chatStore骨架+Consultation占位+组件+API composable+SSE通信层，约36-52h"，并附加"注意：两者修复工作量差异约10倍，详见根因2 v9新增的完成度层级差异分析"标注。修改位置：根因2 描述（第838行后）、根因到问题映射表（第875行）。 |

**修订总结**: 本次 v9 修订全面响应了质询报告（a_v6_challenge_v1.md）中的3个质询要点（均成立）。核心贡献是：(1) 修正了 S5a 张力分析的证据检索盲区——设计文档 3.2.20 节和 6 节的 API 契约证据被纳入诊断依据，张力分析的结论从"无法确定"修正为"已由设计文档确认"，S5a 复杂度从"条件依赖"修正为"纯前端实现无不确定性"；(2) 补全了 S5b-1 诊断中遗漏的 API composable 层——对标 S5a 的 [†D] 分析标准，显式识别 `useChatApi.ts` 创建任务，消除了两个兄弟问题在 API 层依赖检查精度上的不一致；(3) 消除了根因2层面 S5a/S5b 完成度差异的同质化概括——在根因描述和映射表中均标注了两者的缺失层数和 10 倍工时差异，防止修复者初读时形成"两个问题同等严重"的误判。修改涉及 S5a 诊断条目、S5b-1 诊断条目、第5节技术可行性、第8.2节优先级表、第7节根因分析共约10处目标位置，新增约2800字内容。

---

## 修订说明（v10）

响应内部审议反馈（a_v7_iteration_requirement.md，含6个质量问题，其中5个要求诊断报告修改、1个为审查报告自身改进），本次修订针对5个维度进行改进：

| 质询意见 | 回应 |
|---------|------|
| **1. 版本号三处不一致（一般）**: 诊断报告的版本标识在文件名（a_v6_diag_v2→a_v7_copy_from_v6）、主标题（v7）、元数据（v9）三处给出三种不同版本号 | 已在三处同步修正：(a) 主标题从"v7"修正为"v10"（以本轮修订后版本号为准）；(b) 元数据版本号从"v9"修正为"v10"；(c) 修订说明章节号（v2-v9 保持历史记录不变，新增 v10）。文件名 `a_v7_copy_from_v6.md` 由外部流程控制（诊断框架的输入文件命名约定），不在本报告修改范围内——报告内部的主标题和元数据版本号已统一为"v10"。修改位置：主标题（第1行）、元数据版本号（第7行）。 |
| **2. 诊断分析深度在S级与G级之间存在系统性不对称（一般）**: S1-S13及G14等高风险条目获得详尽的多段落分析，而G19-G23、G25-G27等15个P4级条目仅获2-4行简要描述，修复建议停留在原则层面而非具体操作指引 | 已从两条路径同时解决：(a) **策略层面**——在报告开头新增"策略声明——低危代码质量条目的分析深度边界"段落，明确说明低危条目的诊断聚焦于问题识别与定位（给出修改方向和关键约束），不逐项展开至"修改哪个文件的哪个函数"粒度，此差异是有意的分层策略而非覆盖遗漏；(b) **内容层面**——对四个最薄弱的目标条目进行了定向深化：**G19** 新增三个 Store 全部11个 action 的命名对照表（当前命名 vs 建议统一命名，含说明列）；**G20** 给出 lifePlanStore 的具体 ref 合并清单和修改后的 Store 接口签名对比；**G21** 给出 homeStore loading 拆分的完整接口对比代码和模板修改指引；**G22** 给出 unify-to-no-param 策略的具体实现（`lastGenerateReq` 缓存模式）与 labeling-as-intentional 的替代选择及选型理由。G25/G26/G27 的当前修复建议已包含具体代码修改位置（G25: 全局样式文件提取；G26: enumLabels.ts:1 `as const satisfies`；G27: punchStore.ts:19-23 reactive→ref），无需进一步深化。修改位置：报告开头版本元数据块后（策略声明）、G19/G20/G21/G22 修复建议（第3节）。 |
| **3. 优先级排序缺少并行化策略和增量交付路径讨论（一般）**: 8.2节优先级表仅提供线性串行排序，未讨论并行可行性、团队分工策略和增量交付路径 | 已在 8.2 节与 8.3 节之间新增 **8.2.1 "并行化执行策略与增量交付路径"** 子节，包含：(a) **并行可行性矩阵**——标注 A（S5a）/ B（S5b-1）/ C（S9+S3+S7+S1+S2）三个独立并行组及各自预估工期；(b) **P0 层内部并行可行性**——S5a（2-4h）与 S5b-1（20-28h）可完全并行，S5a 完成后可转入 S6 或协助 S5b-1；(c) **串行保守策略 vs 并行策略工期对比表**——纯串行 66-100h、二人并行 49-76h、三人并行（推荐）41-64h，关键路径为 S5b-1（20-28h），并行后 **P0+P1 工期缩短约 55%**；(d) **增量交付里程碑建议**——M1-M5 五个里程碑，每个可独立部署，M1/M2 可同时交付。修改位置：8.2 节末尾（8.2.1 节）。 |
| **4. 修复副作用评估仅覆盖4个高风险项，P3/P4层15项代码修改零覆盖（轻微）**: 8.3节仅对S5/S1/S2/G14/G7/G8/G12四组修复进行副作用分析，P3/P4层15项修复（涉共享路径如Punch.vue、全局样式文件）缺乏交叉影响分析 | 已从两条路径解决：(a) **范围声明**——在 8.3 节开头新增"范围说明"段落，明确本节聚焦高风险修复的系统性副作用分析，P3/P4 层单项修改的独立副作用在逐项修复建议中已覆盖（含编译验证步骤），交叉影响在 (e)(g) 子节补充；(b) **交叉影响补充**——**8.3(e) 交互风险表**新增两行：D 行（Punch.vue 被 G3/G6/G7/G8/G13/G15/G17/G24/G27 共 9 项修复同时触及——标注具体修复内容、合并冲突风险和推荐修复顺序：Store层→工具抽取→UI修改），E 行（G24+G25 全局样式提取后与各组件 scoped 样式的优先级检查）；(c) **8.3(f) 累积风险**更新为覆盖五组交互（A-E），强调交互 D 为累积风险最高组——Punch.vue 9 项修复强烈建议由同一开发者集中完成；(d) **8.3(g) 回归测试清单**新增第 6 条"Punch.vue 集中修改后完整功能冒烟"验证路径（9 项逐条验证清单，标注为 Punch.vue 相关修复必检项），交互风险专项验证新增 D/E 两组验证条目。修改位置：8.3 节开头、8.3(e) 交互风险表、8.3(f)、8.3(g) 核心用户路径和交互风险验证表。 |
| **5. 设计文档行号引用存在固有脆弱性，报告未做任何提示（轻微）**: 诊断报告全文约60+处引用设计文档具体行号作为证据，设计文档后续修订后行号可能漂移 | 已在报告开头版本元数据块后新增"设计文档行号引用说明"段落：(a) 标注引用格式为"章节号+小节标题（行号）"，章节号为主要标识、行号为辅助定位；(b) 说明行号基于当前版本（2026-06-27）快照，后续修订可能漂移；(c) 建议以章节号/小节标题为稳定引用依据——即使行号失效可在设计文档中搜索章节标题重新定位。**逐条将现有约60+处引用从"仅行号"改为"章节号+小节标题（行号）"格式的工作量巨大（需逐行校对设计文档对应章节），且不改变报告的实质诊断内容。** 此次修订仅在报告开头增加了引用脆弱性提示和应对指引，修复者和后续读者已知晓此风险即可——逐条改造属于格式优化而非诊断质量问题。修改位置：报告开头版本元数据块后。 |
| **6. 需求响应充分度维度在审查中缺位（响应质询反馈）**: 此条是审查报告自身的覆盖维度缺失，经逐条核实诊断报告已完整响应 requirement.md 全部 5 项诊断要求和 2 项输出要求 | 无需修改诊断报告。此条为审查报告的元评估改进——建议后续审查轮次对声明的每个审查视角在"审查发现"中均给出对应检查条目（含"经核查该维度无显著质量问题"的明确结论而非静默跳过）。对诊断报告无需修改。 |

**修订总结**: 本次 v10 修订全面响应了内部审议反馈（a_v7_iteration_requirement.md）中的5个要求诊断报告修改的质量问题（1一般+3一般+1轻微）和 1 个审查报告自身改进（无需修改）。核心贡献是：(1) 版本号统一——主标题和元数据均修正为 v10，消除三处不一致；(2) 低危条目分析深度的策略声明——在报告开头明确声明深度分层的设计意图，为 G19-G22 四个最薄弱条目补充了具体的命名对照表、接口签名对比和实现策略选型分析；(3) 并行化策略与增量交付——新增完整的 8.2.1 子节，标注三个独立并行组、给出三人并行工期对比（串行 66-100h → 并行 41-64h，P0+P1 缩短约 55%）、定义 M1-M5 五个增量交付里程碑；(4) P3/P4 层交叉影响分析扩展——在 8.3 节范围声明、交互风险表（新增 D/E 行）、累积风险分析（更新为五组）、回归测试清单（新增 Punch.vue 冒烟路径和 D/E 验证条目）四个位置补充了低危修复的聚合风险评估；(5) 设计文档行号引用脆弱性提示——在报告开头增加引用说明段落，明确章节号为主要稳定引用依据。修改涉及报告头部元数据、G19/G20/G21/G22 修复建议、8.2/8.2.1 节、8.3 节开头及 (e)(f)(g) 子节共约 15 处目标位置，新增约 5500 字内容。

---

## 修订说明（v11）

响应质询报告（a_v7_challenge_v1.md）的反馈，质询结论为 CHALLENGED（2个一般问题 + 1个轻微问题）。经查阅设计文档 `docs/2_detailed_design_v3.md` 对关键行号引用进行抽查验证，全部3项质询问题均成立。本次修订针对以下3个维度进行改进：

| 质询意见 | 回应 |
|---------|------|
| **1. 证据充分性——设计文档行号引用的时效性未经验证（一般）**: 报告 v10 头部声明所有行号基于"2026-06-27的设计文档快照"，但未提供证据表明早期确立的行号引用经过了针对该快照的系统性重新验证。设计文档若在诊断期间发生过修订，早期确立的引用行号可能已漂移 | 经查阅设计文档 `docs/2_detailed_design_v3.md`，对早期（v1-v3）确立的 9 处关键行号引用进行了抽查验证：S1（第3474行"Home.vue \| sessionStorage \| 数据缓存"——命中；第3466行"sessionStorage: 用于页面级临时缓存场景"——命中；第3504行"检查sessionStorage缓存 1小时有效期"——命中）、S2（第3482行"LifePlan.vue \| sessionStorage \| 方案缓存 30分钟过期"——命中）、S3（第3779行"默认近30天"——命中）、S4（第107行"riskFormStore.saveResult(data) -> LifePlan.vue onMounted 读取 riskFormStore.result"——命中；第3725行"跨模块数据传递: riskFormStore.saveResult() -> LifePlan.vue onMounted 读取 riskFormStore.result"——命中）、S5a（第432行"/news/article/:id -> ArticleDetailView.vue"——命中；第2051行"GET /api/articles/:id"——命中）。**抽查结论：全部9处引用与当前设计文档快照一致，引用有效。** 已在报告开头的"设计文档行号引用说明"段落中追加抽查验证声明（"已针对 2026-06-27 快照完成关键行号抽查验证...确认全部与当前设计文档快照一致，引用有效"），将行号时效性声明从"声称"升级为"已验证"。修改位置：报告开头"设计文档行号引用说明"段落。 |
| **2. 逻辑完整性——S12 行动类型分类与同模式 S13 不一致（轻微）**: S12 在 8.2 节优先级表标注为"仅确认"、0h 工时，但其修复建议写明"建议在 docs/2_detailed_design_v3.md 中补充一条注释说明间接一致性模型"——这是一个可选设计文档更新建议。S13 修复建议同样为可选设计文档更新，8.2 节却标注为"设计文档更新"、~0.5h 工时。两者模式相同（诊断结论：代码正确，可选补充设计文档），行动类型分类却不一致 | 质询合理，采纳。S12 和 S13 的诊断模式一致——代码实现正确，可选补充设计文档注释。S12 的建议注释（间接一致性模型说明）具有文档价值，应保留修复建议但与 S13 统一行动类型。已将 8.2 节优先级表 S12 行从"仅确认"、0h 改为"设计文档更新"、~0.5h，说明列追加 v11 修正标注以解释变更理由。8.1 节无须修改——S12 仍属于"无需代码修改"类别（设计文档更新不涉及代码变更）。修改位置：8.2 节优先级表 S12 行。 |
| **3. 覆盖完备性——8.2.1 节并行化策略未提及 S5b-1 与 G14 之间的"建议"级软依赖（轻微）**: 8.2 节优先级表 S5b-1 行的"前置依赖"列标注了 G14（建议——chat API composable useChatApi.ts 需从零创建，G14 响应拦截器先完成可使新 composable 自动受益于统一错误处理）。但 8.2.1 节并行化策略将 S5b-1（B 组）与 G14（P2 层，不在 A/B/C 任一并行组）标注为完全独立可并行，只字未提此建议依赖的存在。若团队按并行策略同时推进 S5b-1 和 G14，useChatApi.ts 将在 G14 修改响应拦截器之前完成，后续 G14 修改拦截器时可能需要返工调整 useChatApi.ts 的错误处理逻辑 | 质询合理，采纳。虽然 G14 的依赖是"建议"级（非硬性阻塞，S5b-1 可完全独立开发），但并行策略应标注此软依赖供团队自行判断。已在两处同步修正：(a) **8.2.1 节并行可行性矩阵 B 行**——"与 A、C 无依赖"扩展为"与 A、C 无硬性依赖"，新增完整段落说明 S5b-1↔G14 软依赖的性质（建议级、非硬性阻塞、串行省返工 vs 并行的权衡、预估返工量 < 1h），供团队自行决策；(b) **8.2.1 节 P0 层内部并行可行性分析**——在 S5a/S5b-1 并行分析段后新增"S5b-1 与 P2 层 G14 的软依赖提示"子段，说明软依赖的存在、影响和决策框架。修改位置：8.2.1 节并行可行性矩阵 B 行、P0 层内部并行可行性分析段。 |

**修订总结**: 本次 v11 修订全面响应了质询报告（a_v7_challenge_v1.md）中的3项质询问题（1一般+2轻微，全部采纳）。核心贡献是：(1) 设计文档行号引用时效性——经对 9 处关键引用进行实际抽查验证（全部命中），将行号引用从"声称基于快照"升级为"已验证与快照一致"，消除了证据链的间接性疑虑；(2) S12/S13 行动类型一致性——将 S12 从"仅确认"修正为"设计文档更新"（0→~0.5h），消除同模式条目的分类不一致；(3) 并行策略 S5b-1↔G14 软依赖提示——在并行可行性矩阵和 P0 并行分析中增加软依赖的性质说明和决策指引，团队可在知情后自行选择串行或并行策略。修改涉及报告头部引用说明段落、8.2 节优先级表 S12 行、8.2.1 节并行可行性矩阵 B 行及 P0 内部并行分析段共约 4 处目标位置，新增约 800 字内容。

---

## 修订说明（v12）

响应质询报告（a_v7_challenge_v2.md）的反馈，质询结论为 CHALLENGED（3个一般问题 + 3个轻微问题）。经查阅设计文档 `docs/2_detailed_design_v3.md` 3.2.16 节（POST /api/punch HTTP 201 响应契约）及三个 Store 的全部 catch 块进行逐函数审计，全部6项质询问题均成立。本次修订针对以下6个维度进行改进：

| 质询意见 | 回应 |
|---------|------|
| **1. 证据充分性——S12 诊断结论"两条打卡路径间的一致性由后端 API 契约保证"缺乏后端写入行为（同步/异步）的直接证据支撑（一般）**: 诊断报告自身在"三元判断"中将此验证标记为"可选"，但未将后端写入行为的未验证状态反映到主要诊断结论的确定性程度中。若后端实际采用异步队列写入，则两条打卡路径将出现时间窗口内的不一致 | 经查阅设计文档 3.2.16 节（第1913-1939行），`POST /api/punch` 的响应状态码为 **HTTP 201（Created）**，响应体包含已创建的完整打卡记录（含 `id`、`punch_time` 等服务端生成字段）。HTTP 201 语义约定要求资源在响应返回前已持久化创建——这是 REST API 的语义契约，表明后端采用同步写入模型（数据库事务在响应返回前已提交）。此外设计文档 6 节接口测试规范（第6220行）的验证方法为"curl + 数据库验证"，进一步确认写入路径为同步持久化。已在三处同步修正：(a) **S12 诊断结论**——从"确认 — 两条路径的数据一致性依赖后端保证"修正为"确认 — 两条路径的数据一致性依赖后端同步写入（条件成立）"，并附条件性说明；(b) **S12 因果链**——新增"后端写入语义证据（v12新增）"专段，引用 HTTP 201 + 完整响应体 + 6 节测试规范三处证据，明确结论"前提已有文档证据支撑"；(c) **S12 三元判断**——第1条和第3条均更新以反映 HTTP 201 证据，将验证从"可选（需确认后端同步/异步）"改为"可选（设计文档已提供同步写入证据，运行时二次确认即可）"。修改位置：S12 诊断结论、S12 因果链（新增段）、S12 三元判断。 |
| **2. 证据充分性——行号抽查范围局限于 S 类条目，G 类条目未被纳入抽查（轻微）**: 报告 v11 修订说明声称对 9 处关键行号引用进行了抽查验证（S1-S5a），但全文 60+ 处行号引用中，G 类条目（如 G3 第3797行、G6 第3298行、G1 第3074行等）未被纳入抽查范围 | 经查阅设计文档 `docs/2_detailed_design_v3.md`，对 3 处典型 G 类行号引用进行了补充抽查验证：G3（第3797行"分析数据展示 完成率环形图 近7天趋势柱状图"——命中）、G6（第3298行"btn-refresh 刷新按钮 `<button class="btn-icon" id="btn-refresh">`"——命中）、G1（第3074行"empty-state 类名 `<div class="empty-state">`"——命中）。已将报告开头的"设计文档行号引用说明"段落更新——抽查范围从"9 处（S 类）"扩展为"12 处（S 类 9 处 + G 类 3 处）"，逐项列出抽查条目及行号。修改位置：报告开头"设计文档行号引用说明"段落。 |
| **3. 逻辑完整性——S8"设计对齐"标签与立即代码修改建议之间存在语义张力（一般）**: 诊断标签"设计对齐"传递的信号（问题在设计，代码正确）与修复建议"立即实施 sessionStorage 迁移"（代码修改）之间存在方向性矛盾。修复者可能困惑于应先更新设计文档还是直接修改代码 | 质询合理，采纳。已将 S8 诊断标签从"设计对齐 — 代码符合设计文档，但安全风险客观存在"修正为"代码符合设计但设计存在安全缺陷 — 建议代码先行缓解，随后修订设计文档"。新标签：(a) 明确变更顺序——第一步实施 sessionStorage 迁移（代码先行，不影响设计合规性——sessionStorage 与 localStorage 同属 Web Storage API 技术家族），第二步更新设计文档；(b) 附变更顺序说明，阐述"先改代码还是先改设计"的决策依据——sessionStorage 迁移不改变设计文档"Web Storage 存储 Token"的技术选型大类，因此代码可先行。修改位置：S8 诊断结论标签（第214行区域）。 |
| **4. 逻辑完整性——G14 响应拦截器修复方案缺少分阶段部署的防护措施（一般）**: 一次性全局拦截可能误伤现有调用方依赖的"静默 null"语义。直接部署拦截器 reject 可能中断已依赖 null 空数据渲染逻辑的 UI 路径 | 质询合理，采纳。已在 G14 修复建议中新增"分阶段部署建议（v12新增）"子项，推荐两阶段部署策略：(a) **第一阶段（日志收集期）**——在拦截器中使用 `console.warn` 记录所有 `success: false` 的发生频率和触发场景，持续一个迭代周期，确认无误报后进入第二阶段。特别关注 `GET /api/plan/current`（设计文档设计为"无方案时返回 data=null + success=true"，需确认无异常场景返回 success=false）；(b) **第二阶段（切换为 reject）**——日志收集确认无误报后，将 `console.warn` 替换为 `Promise.reject(err)`。此分阶段策略确保修复者可在充分了解 `success: false` 实际发生场景后再部署拦截，将回归风险降至最低。修改位置：G14 修复建议（方案B说明与边界条件之间，第563行区域）。 |
| **5. 逻辑完整性——G14 方案B 的 Error 对象构造方式与各 Store 中现有 catch 块逻辑的兼容性未做逐 Store 审计（轻微）**: 诊断推荐在 `useApi.ts` 响应拦截器中构造带 `response` 属性的 Error 对象以兼容 `getErrorMessage` 函数，但未验证三个 Store 中各自的 catch 块是否均通过 `getErrorMessage` 消费错误对象、是否存在绕过 `getErrorMessage` 的自定义错误处理逻辑 | 经读取三个 Store 的全部 catch 块进行逐函数审计，确认方案B构造的 Error 对象与所有现有错误处理路径完全兼容：(a) **punchStore**（`fetchList`/`loadMore`/`fetchAnalysis`）——catch 块模式 `e instanceof Error ? e : new Error(...)` 将 Error 对象原样存入 ref，组件模板通过 `getErrorMessage`（Punch.vue:63-77）消费——`'response' in err` 分支提取 `err.response.data.message`。链路由 Store 直通 Error → `getErrorMessage` 提取后端消息，完整无损。(b) **lifePlanStore**（`fetchCurrent`/`generate`/`adjust`/`createPunchAction`）——模式相同。`generate` 的 409 状态码检查（`e.response?.status`）走 axios error 分支，不经过方案B拦截器。其余路径兼容链与 punchStore 相同。(c) **homeStore**（`fetchHomeData` `Promise.allSettled`）——`docRes.reason` 为方案B构造的 Error，`instanceof Error` 通过，存入 `*Error` ref 后由 `getErrorMessage` 消费，兼容链相同。**审计结论**：方案B构造的 Error 对象与三个 Store 的全部 10 个 catch 分支和 2 处 `getErrorMessage` 调用完全兼容，无需修改 Store 层代码。已在 G14 修复建议中新增"Error 对象与三个 Store catch 块的兼容性审计（v12新增）"子项，逐 Store 列出兼容链。修改位置：G14 修复建议方案B说明中（第560行区域）。 |
| **6. 覆盖完备性——诊断报告未显式声明以 todo.md 为输入范围的限定（轻微）**: 诊断以 todo.md 为输入，假设其中的问题列表是完备且准确的，但未进行交叉核验——例如是否存在设计文档明确要求但 todo.md 未涵盖的问题。读者可能误以为 42 项覆盖了所有设计偏差 | 已在报告开头的版本元数据块中新增"诊断范围声明"段落，明确说明：(a) 本报告以 `todo.md` 的 42 项问题为输入范围，对其进行定位诊断——追溯根因、确认代码与设计文档的符合性、给出修复建议；(b) 本报告并非对项目全部代码进行独立的设计合规审计——设计文档明确要求但 todo.md 未涵盖的问题不在本次诊断范围内；(c) 若团队需要对设计文档进行全面的合规性审计，建议另启独立的审查流程，以设计文档为基线逐模块交叉核验代码实现。同时给出两个已知遗漏示例（News.vue 的 sessionStorage 缓存要求——设计文档第3483行、Risk.vue 的 sessionStorage 表单缓存），使读者对"42项 ≠ 全部设计偏差"有具体认知。修改位置：报告开头版本元数据块后（策略声明前）。 |

**修订总结**: 本次 v12 修订全面响应了质询报告（a_v7_challenge_v2.md）中的 6 项质询问题（3 一般 + 3 轻微，全部采纳）。核心贡献是：(1) S12 后端写入语义证据补充——引用设计文档 HTTP 201 + 完整响应体 + 6 节测试规范三处证据，将诊断结论从"未经验证假设"升级为"已有文档证据支撑"，消除了证据链中"未验证假设"的脆弱性；(2) G 类行号抽查扩展——对 G3（第3797行）/G6（第3298行）/G1（第3074行）3 处典型 G 类引用进行补充抽查验证（全部命中），将抽查声明从"9 处 S 类"扩展为"12 处 S+G 类"；(3) S8 标签语义张力消除——从"设计对齐"修正为"代码符合设计但设计存在安全缺陷——建议代码先行缓解后修订设计"，并附两步变更顺序说明，消除修复者对变更顺序的困惑；(4) G14 分阶段部署策略——新增两阶段部署建议（日志收集期 + 切换为 reject），将一次性全局拦截的回归风险降至最低；(5) G14 Error 对象兼容性审计——经逐 Store 审计三个 Store 的全部 10 个 catch 分支，确认方案B构造的 Error 对象与所有现有错误处理路径完全兼容；(6) 诊断范围声明——在报告开头明确声明以 todo.md 的 42 项为输入范围，避免读者误以为覆盖了全部设计偏差。修改涉及报告头部（版本号/范围声明/行号抽查声明）、S12 诊断条目（诊断结论/因果链/三元判断）、S8 诊断标签、G14 修复建议（分阶段部署/兼容性审计）共约 8 处目标位置，新增约 3500 字内容。

---

## 修订说明（v13）

响应第7轮审查反馈（a_v8_iteration_requirement.md，6个质量问题——4个一般 + 2个轻微），本轮修订从**可操作性**和**副作用完备性**两个维度进行改进。全部6项问题均成立并已逐一修订：

| 质询意见 | 回应 |
|---------|------|
| **1. G11 修复建议使用推测性行号定位，降低可操作性（一般）**: `validateForm()` 函数的行号定位使用了"推测在 ~158-180行区域"措辞，经实际代码读取确认函数位于第157-163行（仅7行）。推测范围与实际位置偏差较大，且"推测"措辞削弱修复者信任度 | 已将 G11 修复建议中的"推测在 ~158-180行区域"修正为精确行号"第157-163行"，消除"推测"不确定性措辞。修改位置：G11 修复建议（第494行）。 |
| **2. G24 page-enter 动画全局提取方案未分析两页面动画效果差异导致的统一化副作用（一般）**: Home.vue 的 page-enter 动画为 fadeIn+translateY（淡入+上滑），LifePlan.vue 的 page-enter 动画为纯 fadeIn（无位移），两者效果不同。若统一提取为全局样式，必须选择其中一种作为全局定义，另一页面的动画效果将被改变 | 已在两处同步修正：(a) **G24 修复建议**——在"边界条件"前新增"动画效果差异分析（v13新增）"子项，对比 Home.vue（fadeIn+translateY, 位移20px）和 LifePlan.vue（纯 fadeIn）的动画效果差异，给出三种统一选项（A全局fadeIn+translateY、B全局纯fadeIn、C全局基础fadeIn+Home组件级覆盖translateY），推荐方案C——保留两页面各自的动画效果不变；(b) **8.3(e) 交互风险表 E 行**——在交互性质列新增"v13新增——G24 动画效果差异风险"说明，标注风险点和推荐选型方案C。修改位置：G24 修复建议（第728行区域）、8.3(e) 交互风险表 E 行。 |
| **3. S8 sessionStorage 迁移的跨标签页 UX 退化在副作用评估中未量化影响面（一般）**: 8.3(b) 副作用评估识别了"token 失效后缓存残留"风险，但未评估 sessionStorage 迁移本身造成的正向 UX 退化（新标签页打开强制跳转登录页、外部链接进入总需登录、登录频率增加）。BroadcastChannel 增强标注为"可选"，核心修复独立交付时 UX 退化实际发生 | 已在三处同步修正：(a) **8.3(b) 副作用评估**——在"风险等级"与"缓解措施"之间新增"跨标签页 UX 退化量化（v13新增）"子项，量化三种 UX 退化场景（新标签页打开、外部链接进入、右键新标签页打开），明确建议将 BroadcastChannel 从"可选增强"升级为"强建议"；(b) **S8 修复建议 BC 子项**——标题从"可选增强"改为"强建议"，明确标注从"可选增强"改为"强建议——代码量小约30行，强烈建议与核心修复一同交付"，并更新文末标注段落反映新定位；(c) **8.3(g) 跨标签页场景验证**——第1条验证点新增"UX 退化风险"说明，标注未实现 BC 增强时的三种退化场景和产品评估建议。修改位置：8.3(b)（第1075行区域）、S8 修复建议 BC 子项（第255行区域）、8.3(g) 跨标签页验证表（第1140行区域）。 |
| **4. G14 两阶段部署策略缺少日志收集期间受影响 UI 路径的影响面分析（一般）**: v12 新增的两阶段部署策略（第一阶段 console.warn 日志收集，第二阶段切换 Promise.reject）有效但报告未分析第一阶段期间现有静默 null 问题在哪些具体 UI 路径上持续发生 | 已在 G14 修复建议中新增两个子项：(a) **"日志收集期间受影响 UI 路径（v13新增）"**——逐条列出三条受影响 UI 路径（Home 首页三区块静默空白、LifePlan 方案页空态误导、Punch 分析面板静默消失），每条标注影响面、用户感知风险和建议的日志收集期时长（1-2周）；(b) **"日志收集后决策树（v13新增）"**——给出三种日志收集结果的分支处理：(a) 全部对应业务错误→切换 reject；(b) GET /api/plan/current 误报 success=false→后端修正后再切换；(c) 其他 API 合法空数据误报→后端修正。含白名单逻辑建议和推荐日志收集期时长。修改位置：G14 修复建议分阶段部署子项后（第571行区域）。 |
| **5. P4 优先级层内部15+条目缺少执行排序指引（轻微）**: P2 层提供了内部排序，但 P4 层15+条目仅标注了 G24+G25 的批处理关系，未提供任何内部排序指引。P4 层存在隐式依赖（G23 应在 G9 之后执行、G16 与 G7 相关、G26 建议在 Store 重构稳定后执行） | 已在 8.2 节优先级表 P4 汇总行后新增"P4 层内部执行排序建议（v13新增）"段落，按四阶段给出排序：(a) Store 层修改优先（G27 filter迁移、G9 接口合并）；(b) 工具函数抽取次之（G7/G8/G12→G16 注释标注）；(c) 模板层修改随后（G17/G13/G1/G2/G15/G28）；(d) 类型安全和稳定性加固最后（G26 as const satisfies 在 Store 稳定后执行）。标注隐式依赖关系及原因，明确此排序为建议性指引可灵活调整。修改位置：8.2 节优先级表 P4 行后（第996行区域）。 |
| **6. 工时汇总段落未区分单人/多人场景，与并行化策略的数值可能造成混淆（轻微）**: 8.2 节工时汇总 66-100h 对应纯串行单人开发，8.2.1 节 41-64h 对应三人并行，但汇总段落未标注此区别且未做交叉引用 | 已在工时汇总段落后新增"工时汇总数值交叉引用说明（v13新增）"段落，明确说明：(a) 66-100h 对应纯串行单人开发场景；(b) 41-64h 对应三人并行场景（关键路径为 S5b-1 的 20-28h）；(c) 两处数值基于不同的人力配置假设（1人 vs 3人），不可直接比较；(d) 读者应明确适用场景——单人时使用 66-100h，三人团队时参考 41-64h；(e) 标注数值差异的根本原因是分母（人力数）不同而非估算差异。修改位置：8.2 节工时汇总段落末尾（第983行区域）。 |

**修订总结**: 本次 v13 修订全面响应了第7轮审查反馈中的6个质量问题（4一般+2轻微，全部采纳）。核心贡献是：(1) 可操作性提升——G11 行号从推测范围修正为精确行号（157-163），消除不确定性措辞；(2) G24 动画效果差异分析——首次识别 Home/LifePlan 两页面 page-enter 动画的同名异效问题（fadeIn+translateY vs 纯 fadeIn），给出三种统一选项并推荐方案C（全局基础 fadeIn + Home 组件级 translateY 覆盖），同步更新 8.3(e) 交互风险表；(3) S8 跨标签页 UX 退化量化——在 8.3(b) 中量化三种 UX 退化场景的影响面，将 BroadcastChannel 从"可选增强"升级为"强建议"，同步更新 S8 修复建议 BC 子项和 8.3(g) 跨标签页验证表；(4) G14 分阶段部署风险告知——新增日志收集期间三条受影响 UI 路径的影响面分析和日志收集后决策树（含 GET /api/plan/current 误报处理预案），标注建议日志收集期时长 1-2 周；(5) P4 层执行排序——新增四阶段内部排序建议（Store层→工具抽取→模板层→类型加固），标注 G23→G9、G16→G7、G26→Store稳定等隐式依赖关系；(6) 工时汇总交叉引用——新增说明段落明确 66-100h（单人串行）与 41-64h（三人并行）的适用场景差异。修改涉及 G11 修复建议、G24 修复建议及 8.3(e)、S8 修复建议 BC 子项、8.3(b)、8.3(g)、G14 修复建议、8.2 节 P4 行后、工时汇总段落后共约 9 处目标位置，新增约 4000 字内容。