# 前端代码审查问题诊断报告 v1

> **诊断对象**: `reviews/202606271219_frontend_review/todo.md`（42项问题，13严重 + 29一般）
> **诊断基线**: `docs/2_detailed_design_v3.md`
> **诊断范围**: Home.vue、LifePlan.vue、Punch.vue 及关联 Store/API/类型/路由文件
> **诊断日期**: 2026-06-27

---

## 1. 诊断概述

对42项待办问题的逐项诊断结果：

| 诊断结论 | 严重问题 | 一般问题 | 合计 |
|---------|:------:|:------:|:---:|
| 确认（代码偏离设计） | 10 | 27 | 37 |
| 设计对齐（代码符合设计，但设计本身或观察成立） | 3 | 1 | 4 |
| 部分确认（问题存在但结论有细化空间） | 0 | 1 | 1 |
| 不成立 | 0 | 0 | 0 |

核心根因：本轮前端实现（Task1-3）在数据缓存、路由完整性、跨模块数据传递三个维度上存在系统性的设计合规性偏差，根源在于实现阶段未逐项对齐设计文档4.2/4.3/1.6.1节的明确要求。

---

## 2. 严重问题逐项诊断

### S1. Home.vue 缺失 sessionStorage 缓存机制（1小时过期）

- **诊断结论**: **确认 — 代码偏离设计**
- **严重程度**: 高
- **设计依据**:
  - 4.2节状态管理表（第3474行）：`Home.vue | sessionStorage | 数据缓存 (含时间戳, 1小时过期)`
  - 4.2节架构说明（第3466行）：`sessionStorage: 用于页面级临时缓存场景——Home.vue 数据缓存（1小时过期）`
  - 4.3节Home.vue流程图（第3504行）：`页面加载 → 检查sessionStorage缓存 1小时有效期 → 缓存命中 → 直接渲染`
- **代码证据**: `src/stores/homeStore.ts:38-58` — `fetchHomeData()` 直接执行 `Promise.allSettled` 并行调用三个API，不存在任何 sessionStorage 的 `getItem`/`setItem` 逻辑；`src/views/Home.vue:158` — `onMounted` 直接调用 `homeStore.fetchHomeData()`，无缓存检查。
- **因果链**: 设计文档将 Home.vue 数据缓存列为 sessionStorage 四个页面级缓存场景之首 → 实现阶段遗漏了整个缓存读写机制 → 每次页面加载都产生3次API请求，浪费带宽且增加首屏延迟。
- **影响范围**: 仅影响首页性能，不影响功能正确性。

### S2. LifePlan.vue 缺失 sessionStorage 方案缓存（30分钟过期）

- **诊断结论**: **确认 — 代码偏离设计**
- **严重程度**: 高
- **设计依据**:
  - 4.2节状态管理表（第3482行）：`LifePlan.vue | sessionStorage | 方案缓存 (含生成时间戳, 30分钟过期)`
  - 4.2节架构说明（第3466行）：`sessionStorage: 用于页面级临时缓存场景——LifePlan.vue 方案缓存（30分钟过期）`
- **代码证据**: `src/stores/lifePlanStore.ts:42-53` — `fetchCurrent()` 直接 `await getCurrentPlan()`，无 sessionStorage 读写；`src/stores/lifePlanStore.ts:61-87` — `generate()` 成功后仅写 `currentPlan.value`，不写 sessionStorage；`src/stores/lifePlanStore.ts:93-103` — `adjust()` 同样不写 sessionStorage。
- **因果链**: 设计文档明确要求30分钟方案缓存 → 实现阶段遗漏 → 页面刷新后方案数据丢失，需重新请求API。
- **影响范围**: 用户刷新/重返页面时的体验和API调用量。

### S3. Punch.vue 缺失默认近30天日期筛选

- **诊断结论**: **确认 — 代码偏离设计**
- **严重程度**: 中
- **设计依据**:
  - 4.3节Punch.vue流程图（第3779行）：`页面加载 → 从URL参数或sessionStorage 读取筛选条件 默认近30天`
- **代码证据**: `src/views/Punch.vue:22-23` — `dateStart` 和 `dateEnd` 初始化为 `ref('')`（空字符串）；`src/views/Punch.vue:135-147` — `onMounted` 未计算默认日期范围。
- **因果链**: 设计要求"默认近30天" → 实现时初始化为空字符串 → 用户首次进入看到空日期筛选器，列表可能显示全部历史数据而非最近30天。
- **影响范围**: 用户体验偏差，日期筛选器初始状态不符合设计预期。

### S4. LifePlan.vue 未读取 riskFormStore.result

- **诊断结论**: **确认 — 代码偏离设计**
- **严重程度**: 中
- **设计依据**:
  - 1.2节跨组件通信机制（第107行）：`风险预测页 -> riskFormStore.saveResult(data) -> 生活方案页 onMounted 读取 riskFormStore.result -> 预填方案生成参数`
  - 4.2节状态管理表（第3472行）：`App.vue + 各页面组件 | Pinia riskFormStore | ...LifePlan.vue 通过读取 riskFormStore.result 获取跨模块数据`
  - App.vue流程图（第3725行）：`跨模块数据传递: riskFormStore.saveResult() -> router.push /life-plan -> LifePlan.vue onMounted 读取 riskFormStore.result`
- **代码证据**: `src/views/LifePlan.vue:75-82` — `prefillFromRiskForm()` 仅读取 `riskForm.formData`（年龄/性别/身高/体重），完全未触及 `riskForm.result`；`src/views/LifePlan.vue:297-303` — `onMounted` 调用 `prefillFromRiskForm()` 后调用 `fetchCurrent()`，无任何 `result` 读取逻辑。
- **因果链**: 设计文档在三处（1.2/4.2/4.3）均明确 LifePlan 应读取 riskFormStore.result → 实现仅读取了 formData → 风险预测结果（风险等级、评分、匹配糖尿病类型）对方案生成页面完全不可见，无法用于展示上下文提示或影响方案生成偏好。
- **影响范围**: 跨模块数据传递链路断裂，LifePlan 无法利用已有的风险预测结果进行个性化展示。

### S5. 路由表缺少 consultation/doctor/:id 和 news/article/:id

- **诊断结论**: **确认 — 代码偏离设计，且组件文件缺失**
- **严重程度**: 高
- **设计依据**:
  - 1.6.1节路由映射表（第429行）：`/consultation/doctor/:id → DoctorChatView.vue`
  - 1.6.1节路由映射表（第432行）：`/news/article/:id → ArticleDetailView.vue`
  - 1.6.2节路由守卫代码示例（第462-465行）：`path: '/consultation/doctor/:id', component: () => import('@/views/DoctorChatView.vue'), meta: { requiresAuth: true, requiresDisclaimer: true }`
  - 1.6.2节路由守卫代码示例（第477-480行）：`path: '/news/article/:id', component: () => import('@/views/ArticleDetailView.vue'), meta: { requiresAuth: false }`
- **代码证据**: `src/router/index.ts:5-67` — 路由数组共13条记录，不存在 `/consultation/doctor/:id` 和 `/news/article/:id` 两条路由。经文件系统检索，`DoctorChatView.vue` 和 `ArticleDetailView.vue` 两个组件文件亦不存在于项目中。
- **因果链**: 设计文档v13修订时拆分 consultation 和 news 为列表+详情两个组件 → 实现阶段未创建详情组件文件，也未在路由表中注册对应路由 → 所有咨询和文章相关的详情导航路径完全不可达。
- **影响范围**: 
  - S6（文章点击跳转）因 `/news/article/:id` 路由不存在而成为必然结果
  - 医生对话功能因 `DoctorChatView.vue` 缺失而完全不可用
  - 文章详情页因 `ArticleDetailView.vue` 缺失而完全不可用
  - 任何指向这两条路由的 `router.push` 将触发 404 兜底

### S6. Home.vue 文章点击跳转目标与设计不一致

- **诊断结论**: **确认 — 代码偏离设计，且受S5制约**
- **严重程度**: 中
- **设计依据**:
  - 4.3节Home.vue流程图（第3515行）：`绑定文章点击事件 router.push({path:'/news/article/' + articleId})`
- **代码证据**: `src/views/Home.vue:80-82` — `goArticle(_id)` 接收 `id` 参数但完全忽略（`_id` 前缀），始终执行 `router.push('/news')` 跳转到资讯列表页。
- **因果链**: 设计要求跳转到文章详情页 `/news/article/:id` → 实现时可能因 S5（该路由不存在）而回退为跳转资讯列表 → 但注释称"文章详情页不在本任务"，而非标记为待实现。
- **影响范围**: 用户无法从首页直接查看具体文章内容，功能降级。

### S7. Punch.vue 日期筛选变更未同步触发 AI 分析重拉取

- **诊断结论**: **确认 — 代码偏离设计**
- **严重程度**: 中
- **设计依据**:
  - 4.3节Punch.vue流程图（第3793行）：`修改日期 → 重新请求list+analysis API 更新渲染`
- **代码证据**: `src/views/Punch.vue:127-132` — `onDateChange()` 调用 `store.setFilter({startDate, endDate})`；`src/stores/punchStore.ts:142-152` — `setFilter()` 仅调用 `fetchList()`，未调用 `fetchAnalysis()`。
- **因果链**: 设计明确要求"重新请求list+analysis" → `setFilter` 仅触发了 list 请求 → 日期变更后分析数据停留在初始加载的结果，与当前筛选范围不匹配。
- **影响范围**: 日期筛选后 AI 分析数据与用户可见的打卡记录范围不一致。

### S8. Token 明文存储在 localStorage，存在 XSS 窃取风险

- **诊断结论**: **设计对齐 — 代码符合设计文档，但安全风险客观存在**
- **严重程度**: 中（安全风险确认，但非代码偏离）
- **设计依据**:
  - 1.2节公共状态（第98行）：`localStorage: JWT Token, role, 免责确认状态`
  - 4.2节架构说明（第3465行）：`localStorage: 仅用于跨会话持久化场景（JWT Token、conversation_id）`
  - 7.1节认证流程图（第5645-5656行）：Token的存储和过期处理机制描述中未提及 HttpOnly Cookie
- **代码证据**: `src/stores/authStore.ts:12` — `const token = ref<string | null>(localStorage.getItem('token'))`；`src/stores/authStore.ts:39` — `localStorage.setItem('token', newToken)`。
- **因果链**: 设计文档明确选择 localStorage 作为 JWT Token 的持久化方案 → 代码完全遵循了设计 → XSS 窃取风险是设计决策的固有后果（localStorage 无 HttpOnly 保护），非实现偏差。
- **诊断说明**: todo.md 将此问题标记为"严重"并将修复建议指向代码改动。但诊断发现，根本原因在于设计阶段选择了 localStorage 方案。代码修复（如切换到 sessionStorage）只能降低非持久会话风险，无法根本解决 XSS 窃取问题（攻击者仍可在会话期间读取）。根治方案需设计层面决策（如后端协同改为 HttpOnly Cookie）。

### S9. fetchAnalysis() 无竞态保护

- **诊断结论**: **确认 — 代码偏离一致性约定**
- **严重程度**: 中
- **设计依据**: 无直接设计文档显式规定，但 punchStore 内部一致性要求：
  - `fetchList()`（第59-83行）和 `loadMore()`（第92-118行）均实现了 `requestId` 快照竞态保护
- **代码证据**: `src/stores/punchStore.ts:125-135` — `fetchAnalysis()` 无 `requestId` 快照机制，直接 `analysis.value = await getPunchAnalysis()`；对比同文件 `fetchList()`（第63行：`const snapshot = requestId.value`）、`loadMore()`（第97行：同样模式）。
- **因果链**: 同一 Store 内 `fetchList` 和 `loadMore` 有防竞态机制 → `fetchAnalysis` 作为同模式的异步拉取操作遗漏了相同的保护 → 快速页面切换场景下旧响应可能覆盖新请求状态。
- **影响范围**: 快速切换筛选条件或重进页面时分析数据可能短暂错乱。

### S10. DOMPurify 使用默认配置，未加固安全参数

- **诊断结论**: **确认 — 安全加固缺失**
- **严重程度**: 中
- **设计依据**:
  - 1.3节技术选型表（第120行）：`DOMPurify 3.x | HTML净化库，marked.js渲染Markdown后防XSS`
  - 设计文档未显式要求配置白名单参数
- **代码证据**: `src/views/Home.vue:116`、`src/views/LifePlan.vue:98`、`src/views/Punch.vue:59` — 三处均调用 `DOMPurify.sanitize(html)` 使用默认配置，未传第二个 options 参数设定 `ALLOWED_TAGS`/`ALLOWED_ATTR`。
- **因果链**: 设计文档引入 DOMPurify 的目的就是防 XSS → 默认配置对常规 HTML 注入已有良好防护 → 但默认配置允许的标签和属性集较宽泛（如允许 `<form>`、`<style>`、`on*` 事件属性等），在 Markdown 渲染场景下存在潜在的 XSS 绕过风险。
- **影响范围**: 所有 Markdown→HTML 净化管道（LifePlan方案内容、Punch AI分析评语、Home类型弹层）。

### S11. diabetesType query 参数在 LifePlan 中完全丢失

- **诊断结论**: **确认 — 代码偏离设计**
- **严重程度**: 低
- **设计依据**:
  - 1.2节跨组件通信机制（第107行）：`路由 query params（如 /life-plan?riskLevel=high&diabetesType=2型）在目标页面的 onMounted 中读取`
- **代码证据**: `src/views/Risk.vue:331` — `router.push({ path: '/life-plan', query: { riskLevel: ..., diabetesType: ... } })` 传入了两个参数；`src/views/LifePlan.vue:88-91` — `riskLevelHint` computed 仅读取 `route.query.riskLevel`，完全忽略 `route.query.diabetesType`。
- **因果链**: 设计明确通过 query 传递两个参数 → 发送方 Risk.vue 正确传递了两个 → 接收方 LifePlan.vue 仅消费了 riskLevel → diabetesType 被静默丢弃。
- **影响范围**: 用户无法在 LifePlan 页面看到自己所属的糖尿病类型提示。

### S12. LifePlan → Punch 打卡联动路径不一致

- **诊断结论**: **确认 — 两条路径的数据一致性依赖后端保证**
- **严重程度**: 低
- **设计依据**:
  - 4.2节状态管理表（第3488行）：`Punch.vue | 组件内 ref + API | 打卡记录列表数据`
  - Punch.vue流程图（第3782行）：`GET /api/punch/list`（从后端拉取，非从 store 读取）
  - 设计文档未要求 LifePlan 的打卡状态与 Punch 的列表视图间的前端直接共享
- **代码证据**: `src/views/LifePlan.vue:236-273` — 打卡操作通过 `store.createPunch()` 调用 `POST /api/punch` 并使用本地 `completedMap`；`src/views/Punch.vue:135-147` — 通过 `store.fetchList()` 调用 `GET /api/punch/list` 从后端拉取。两条路径通过后端 API 串联，无前端直接状态共享。
- **因果链**: 设计选择"前端写后端 + 前端从后端读"的间接一致性模型 → LifePlan 的 `completedMap` 和 Punch 的 `records` 是两套独立状态 → 从 LifePlan 打卡后立即跳转 Punch 页面，需等待 `fetchList` API 返回才能看到最新数据（依赖后端写入已生效）。
- **影响范围**: 用户体验上，从 LifePlan 打卡后进入 Punch 页面可能看不到刚提交的打卡记录（取决于后端写入延迟），但功能正确性由后端 API 契约保证。

### S13. 路由守卫 requiresDisclaimer 策略不一致

- **诊断结论**: **设计对齐 — 代码符合设计文档，但设计内部存在一致性疑问**
- **严重程度**: 低
- **设计依据**:
  - 1.6.2节路由守卫代码示例（第493-494行）：Punch 路由未设置 `requiresDisclaimer: true`
  - 1.6.2节免责声明拦截流程说明（第577-578行）：`涉及AI生成内容的路由（医师对话/生活方案/风险预测/健康建议）首次访问前必须确认免责声明` — Punch 不在所列路由中
- **代码证据**: `src/router/index.ts:37-39` — Punch 路由仅设置 `meta: { requiresAuth: true }`，未设置 `requiresDisclaimer`，与设计文档完全一致。
- **因果链**: 设计文档明确列出了需要免责声明的4个路由（医师对话/生活方案/风险预测/健康建议），Punch 不在其中 → 代码严格遵循设计 → 但 Punch 页面确实展示了 AI 生成的分析内容（依从性评语、改进建议），与免责声明覆盖"AI生成内容"的原则存在逻辑矛盾。
- **诊断说明**: 这不是代码偏离设计的问题，而是设计文档的内部一致性疑问。若团队认为 Punch 的 AI 分析内容需要免责声明保护，应首先修改设计文档再更新代码。

---

## 3. 一般问题逐项诊断

### G1. LifePlan.vue 组件树 CSS class / 按钮文案与设计文档有偏差

- **诊断结论**: **确认**
- **设计依据**: 4.1.4节LifePlan.vue组件DOM树（第3072行起）使用 `empty-state` 类名，使用 `<img>` 插图，按钮文案为"开始风险预测 / 生成我的生活方案"
- **代码证据**: `src/views/LifePlan.vue:337-342` — 使用 `lp-empty` 类名，FontAwesome `<i>` 图标代替 `<img>`，按钮文案"立即定制方案"
- **诊断说明**: CSS命名和图标实现方式的偏差不影响功能，但偏离了组件树规格。按钮文案简化是合理的UI精简。

### G2. Home.vue 糖尿病类型区"全部"链接为静态占位

- **诊断结论**: **确认**
- **设计依据**: 4.1.2节Home.vue组件DOM树（第3009行）：`<a>全部</a>` — 为 `<a>` 标签，暗示可点击链接
- **代码证据**: `src/views/Home.vue:293-295` — 使用 `<span class="section-link-static">`，无点击事件
- **诊断说明**: 设计标注为链接元素但未在其流程图或交互描述中定义"全部"的跳转目标，存在设计模糊性。代码使用 `<span>` 静态占位是保守处理。

### G3. Punch.vue 分析区缺少环形图，趋势图实现差异

- **诊断结论**: **确认**
- **设计依据**: 4.3节Punch.vue流程图（第3797行）：`分析数据展示 完成率环形图 近7天趋势柱状图`
- **代码证据**: `src/views/Punch.vue:192-266` — 完成率为渐变文字百分比，无SVG环形图；趋势图为纯CSS叠柱（饮食+运动合并柱），非独立柱状图
- **诊断说明**: 环形图缺失是功能遗漏；趋势图实现方式差异是UI选择问题，CSS叠柱在数据可视化效果上可接受。

### G4. Punch.vue 滚动监听 + 加载更多按钮双模式冗余

- **诊断结论**: **部分确认 — 双模式均有设计依据，但未明确二选一还是并存**
- **设计依据**: 4.1.8节组件DOM树（第3327-3328行）含 `<button id="btn-load-more">加载更多`；4.3节Punch.vue流程图（第3795行）：`滚动到底部 → page++ → GET /api/punch/list?page=N 追加渲染 无限滚动`
- **代码证据**: `src/views/Punch.vue:107-118` — 实现了滚动监听无限加载；`src/views/Punch.vue:427-433` — 同时存在手动"加载更多"按钮
- **诊断说明**: 设计文档在不同位置分别描述了按钮和无限滚动两种模式，未明确"二选一"。代码的并存实现虽然有冗余，但提供了双保险的用户体验。

### G5. LifePlan.vue 打卡弹窗交互顺序与流程图有差异

- **诊断结论**: **确认 — 但实际实现比设计更合理**
- **设计依据**: 4.3节LifePlan.vue流程图（第3631-3633行）：`打卡操作 → 点击方案项旁打卡按钮 → POST /api/punch → SweetAlert2确认弹窗`
- **代码证据**: `src/views/LifePlan.vue:236-273` — 先弹出 SweetAlert2 弹窗（收集用户确认和备注），用户确认后才调用 `POST /api/punch`
- **诊断说明**: 代码实现顺序（先弹窗后API）避免了用户取消后的无效API调用，是更优的交互设计。此处的设计文档顺序（先API后弹窗）反而不合理——用户还未确认操作就已发出网络请求。

### G6. Punch.vue 缺少 refresh 刷新按钮

- **诊断结论**: **确认**
- **设计依据**: 4.1.8节Punch.vue组件DOM树（第3298行）：`<button class="btn-icon" id="btn-refresh"> <i class="fas fa-sync">`
- **代码证据**: `src/views/Punch.vue:270-304` — 筛选区仅包含日期输入和类型chip按钮，无刷新按钮
- **诊断说明**: 明确的组件树元素遗漏。

### G7. safeContentHtml / safeAnalysisHtml 函数重复定义

- **诊断结论**: **确认**
- **设计依据**: 非设计合规性问题，属代码质量（DRY原则）
- **代码证据**: `src/views/LifePlan.vue:94-99` 与 `src/views/Punch.vue:55-60` — 两处实现逻辑完全相同：`marked.parse() → DOMPurify.sanitize()`
- **诊断说明**: 无设计偏离，纯代码组织问题。

### G8. getErrorMessage 函数重复定义

- **诊断结论**: **确认**
- **诊断说明**: 同G7，LifePlan.vue:102-109 与 Punch.vue:63-77 逻辑重复。

### G9. DiabetesTypeView 接口在组件和 Store 中重复定义

- **诊断结论**: **确认**
- **代码证据**: `src/views/Home.vue:17-20` 与 `src/stores/homeStore.ts:7-12` 独立定义相同结构的接口
- **诊断说明**: 两处定义如果不同步修改，TypeScript不会报错（因为是两个不同的接口定义），存在维护风险。

### G10. riskFormStore formData 缺少运行时类型守卫

- **诊断结论**: **确认**
- **代码证据**: `src/stores/riskFormStore.ts:45-70` — `loadFromStorage()` 仅做字段名白名单过滤（`allowedKeys`），不做值类型校验（如 `age` 可能被存为字符串 `"25"` 而非数字 `25`）
- **诊断说明**: sessionStorage 的 JSON 序列化/反序列化循环中，`v-model.number` 清空后重新赋值时，类型污染可能发生。

### G11. LifePlan.vue form 使用 reactive + null，空字符串可能漏过校验

- **诊断结论**: **确认**
- **代码证据**: `src/views/LifePlan.vue:158` — `if (form.age == null || form.age < 1 || form.age > 120) return false`：`== null` 宽松判等仅能捕获 `null` 和 `undefined`，无法捕获空字符串 `''`
- **诊断说明**: Vue 的 `v-model.number` 在输入框清空时可能产生空字符串而非 `null`，取决于浏览器实现。存在用户提交空表单的边界情况。

### G12. escapeHtml 仅 Home.vue 本地函数

- **诊断结论**: **确认**
- **代码证据**: `src/views/Home.vue:132-137` — `escapeHtml()` 定义为本地函数，仅在糖尿病类型弹层中使用
- **诊断说明**: HTML实体转义是通用工具，应抽取到 `src/utils/` 下。

### G13. Punch onScroll 使用 document.documentElement 耦合布局假设

- **诊断结论**: **确认**
- **代码证据**: `src/views/Punch.vue:111` — `const { scrollTop, scrollHeight, clientHeight } = document.documentElement`
- **诊断说明**: 当页面内存在额外的滚动容器（如嵌套子路由导致多个滚动区域）时，`document.documentElement` 的滚动状态可能不代表实际可见区域的滚动位置。

### G14. API 函数 res.data.data 嵌套解包缺少 success 字段检查

- **诊断结论**: **确认**
- **代码证据**: `src/composables/useHomeApi.ts:38-39` — `return res.data.data` 无 `success` 检查；`src/composables/useLifePlanApi.ts:20`、`src/composables/usePunchApi.ts:24` — 同样模式
- **诊断说明**: 当后端返回 `{ success: false, data: null, message: "xxx" }` (HTTP 200)时，所有 API 函数会将 `null` 作为正常数据返回，调用方无法区分"成功但数据为空"和"业务失败"。

### G15. loadMore 后 AI 分析不变，用户可能困惑

- **诊断结论**: **确认**
- **代码证据**: `src/stores/punchStore.ts:92-118` — `loadMore()` 仅拉取更多列表记录；`src/views/Punch.vue:144` — `fetchAnalysis()` 仅在 `onMounted` 中调用一次
- **诊断说明**: loadMore 增加页面显示的记录数量后，AI分析统计仍然基于最初加载时的数据范围（可能是全部数据，取决于后端实现），用户在加载更多记录后可能期待分析数据相应更新。

### G16. marked.parse 使用 { async: false }，未来兼容性风险

- **诊断结论**: **确认**
- **代码证据**: `src/views/LifePlan.vue:96` 和 `src/views/Punch.vue:57` — `marked.parse(markdown, { async: false })`
- **诊断说明**: marked v12 当前支持 `{ async: false }`，但 marked 官方文档提示未来主版本可能移除同步模式。此问题当前不产生运行时错误，属技术债务。

### G17. typeFilter ref 与 store filter 状态不同步风险

- **诊断结论**: **确认**
- **代码证据**: `src/views/Punch.vue:26` — `const typeFilter = ref<PunchType | undefined>(undefined)` 独立于 `src/stores/punchStore.ts:19-23` 的 `filter.punch_type`
- **诊断说明**: 两处状态的同步依赖 `onTypeFilter()` 函数手动同时更新两者（第121-124行）。如果未来有其他代码路径修改 `store.filter.punch_type` 而不经过 `onTypeFilter`，UI 将出现不同步。

### G18. 缺少 AbortController 取消机制

- **诊断结论**: **确认**
- **代码证据**: `src/composables/useApi.ts:45-48` — `createCancelToken()` 已导出；但所有 API composable 和组件均未在 `onUnmounted` 中调用 `AbortController.abort()`
- **诊断说明**: 工具已就绪但未被集成使用。组件销毁时进行中的 HTTP 请求不会被取消，响应处理可能操作已卸载组件的状态。

### G19. Store action 命名不一致（fetch/get 前缀混用）

- **诊断结论**: **确认**
- **代码证据**: homeStore 用 `fetchHomeData`、`retryDoctors`/`retryArticles`/`retryTypes`；lifePlanStore 用 `fetchCurrent`、`generate`、`adjust`；punchStore 用 `fetchList`、`loadMore`、`fetchAnalysis`
- **诊断说明**: 无设计违规，纯代码风格不一致。

### G20. Store error 字段粒度不一致

- **诊断结论**: **确认**
- **代码证据**: homeStore 按数据区块分（`doctorsError`/`articlesError`/`typesError`，3个独立）；lifePlanStore 按操作分（`error`/`generateError`/`adjustError`，3个独立）；punchStore 按资源分（`error`/`analysisError`，2个独立）
- **诊断说明**: 三种不同的错误分类策略反映了三种不同的心智模型，不利于新开发者理解和维护。

### G21. Store loading 字段粒度与 error 不对称

- **诊断结论**: **确认**
- **代码证据**: homeStore 单一 `loading` 覆盖三个接口，但错误拆三个；punchStore 三个独立 loading（`listLoading`/`listLoadingMore`/`analysisLoading`）
- **诊断说明**: loading 与 error 的粒度不对称使得 UI 无法精准显示"哪个区块正在加载"。

### G22. Store retry* 方法实现模式不统一

- **诊断结论**: **确认**
- **代码证据**: `retryDoctors()`/`retryArticles()`/`retryTypes()` 无参数无返回值；`retryGenerate(req)` 带参数有返回值；`retryFetchCurrent()` 无参数无返回值
- **诊断说明**: 命名和签名不一致是代码演进中缺乏统一review的结果。

### G23. api.ts 类型定义与 API composable 脱节（死代码）

- **诊断结论**: **确认**
- **设计依据**: 3.8节 TypeScript类型定义（第2-31行）定义了 `ApiResponse<T>`/`ApiError`/`PaginatedResponse<T>`
- **代码证据**: `src/types/api.ts:2-31` — 三个通用类型定义存在；但 `useHomeApi.ts`、`useLifePlanApi.ts`、`usePunchApi.ts` 均使用内联类型（如 `{ success: boolean; data: T[]; pagination: PaginationInfo }`），未引用泛型
- **诊断说明**: 类型定义存在但从未被 API composable 引用，属于死代码。要么删除定义以保持简洁，要么统一 API composable 使用泛型。

### G24. page-enter 动画在 Punch.vue 中失效

- **诊断结论**: **确认**
- **代码证据**: `src/views/Punch.vue:155` — 模板使用 `class="punch-page page-enter"`；`src/views/Home.vue:342-349` — `page-enter` 类和 `@keyframes pageEnter` 在 `<style scoped>` 中定义；`src/views/LifePlan.vue:1059-1061` — 有自己的 `page-enter` 定义（引用 `fadeIn` 动画）。Punch.vue 的 `<style scoped>` 中没有 `page-enter` 或 `@keyframes pageEnter` 的任何定义。
- **因果链**: Vue scoped 样式的作用域隔离机制 → Home.vue/LifePlan.vue 中的 `page-enter` 定义仅对各自的组件模板生效 → Punch.vue 使用 `page-enter` class 但在本组件的 scoped 样式中无对应定义 → 动画不生效。
- **影响范围**: Punch.vue 页面进入时无入场动画。

### G25. press CSS class 重复定义

- **诊断结论**: **确认**
- **代码证据**: LifePlan.vue 和 Punch.vue 各自的 `<style scoped>` 中均定义 `.press:active { transform: scale(0.96) }`
- **诊断说明**: 纯代码复用问题，无功能影响。

### G26. enumLabel 映射表缺少严格类型约束

- **诊断结论**: **确认**
- **代码证据**: `src/utils/enumLabels.ts:1` — `Record<string, Record<string, string>>` 类型过宽，`LABELS.punch_type.die` 这样的拼写错误不会产生编译错误
- **诊断说明**: 使用 `as const satisfies` 可收紧类型约束。

### G27. punchStore.filter 使用 reactive 语义不明确

- **诊断结论**: **确认**
- **代码证据**: `src/stores/punchStore.ts:19-23` — `const filter = reactive<{ startDate?: string; endDate?: string; punch_type?: PunchType }>({})`
- **诊断说明**: `reactive` 的可变性和 `undefined` 清理语义不如 `ref` + 不可变更新清晰。当前代码通过 `setFilter()` 封装了修改逻辑，风险可控但不够理想。

### G28. Home.vue 搜索图标行为与设计不一致

- **诊断结论**: **确认**
- **设计依据**: 4.1.2节Home.vue组件DOM树（第2979行）：`<i class="fas fa-search"> (搜索图标, 装饰性)`
- **代码证据**: `src/views/Home.vue:87-98` — 搜索图标绑定了 `@click="onSearch"` 事件，弹出 Toast "搜索功能开发中"
- **诊断说明**: 设计标注为"装饰性"（无交互），代码实现为功能占位（有交互但未实现）。差异在意图层面：设计认为不应有点击行为，代码认为应预留入口。

### G29. Punch.vue router.back() 返回路径不确定

- **诊断结论**: **确认**
- **代码证据**: `src/views/Punch.vue:160` — 返回按钮使用 `router.back()` 依赖浏览器历史栈
- **诊断说明**: Punch 页面可通过多个入口进入（Profile子路由、LifePlan跳转、直接URL），`router.back()` 在不同入口场景下返回不同页面，用户体验不一致。

---

## 4. 与设计文档一致性检查汇总

### 4.1 功能遗漏（代码缺失，设计明确要求）

| 设计引用 | 遗漏内容 | 相关Todo |
|---------|---------|---------|
| 4.2/4.3节 Home.vue流程图 | sessionStorage 1小时缓存读写 | S1 |
| 4.2节 LifePlan状态管理 | sessionStorage 30分钟方案缓存 | S2 |
| 4.3节 Punch.vue流程图 | 默认近30天日期筛选 | S3 |
| 1.2/4.2/4.3节 跨模块通信 | LifePlan读取riskFormStore.result | S4 |
| 1.6.1节 路由映射表 | /consultation/doctor/:id 路由及组件 | S5 |
| 1.6.1节 路由映射表 | /news/article/:id 路由及组件 | S5 |
| 4.3节 Punch.vue流程图 | 日期变更同步重拉AI分析 | S7 |
| 4.1.8节 Punch组件树 | refresh刷新按钮 | G6 |
| 4.3节 Punch.vue流程图 | 完成率环形图 | G3 |

### 4.2 设计偏差（代码与设计不一致）

| 设计引用 | 设计规定 | 代码实际 | 相关Todo |
|---------|---------|---------|---------|
| 4.3节 Home流程图 | 文章点击跳 `/news/article/:id` | 跳 `/news` 列表页 | S6 |
| 4.1.2节 Home组件树 | 搜索图标"装饰性" | 有点击事件 | G28 |
| 4.1.2节 Home组件树 | 糖尿病类型"全部"为 `<a>` 链接 | `<span>` 无交互 | G2 |
| 4.3节 LifePlan流程图 | 先POST后弹窗 | 先弹窗后POST | G5 |
| 4.1.4节 LifePlan组件树 | `empty-state` 类名 + `<img>` 插图 | `lp-empty` + FontAwesome图标 | G1 |

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
- **S5（缺失路由+组件）**: 需新建两个Vue组件文件并注册路由。`DoctorChatView.vue` 涉及SSE流式对话和chatStore集成，实现复杂度中等；`ArticleDetailView.vue` 涉及marked+DOMPurify渲染，与LifePlan内容渲染模式一致，技术路径明确。
- **S7（日期变更拉分析）**: 在 `setFilter` 中追加一行 `fetchAnalysis()` 调用即可。需注意竞态保护（同S9）。
- **S8（Token安全）**: 切换到HttpOnly Cookie需后端协同修改，短期方案（sessionStorage）为降低风险的过渡措施，非根治方案。
- **S9（竞态保护）**: 复用 `fetchList` 已有的 `requestId` 快照模式。模式已在本文件中验证可行。
- **S10（DOMPurify加固）**: 在 `sanitize()` 第二个参数中配置 `ALLOWED_TAGS`/`ALLOWED_ATTR`。需梳理Markdown渲染场景所需的合法标签集合。
- **G3（环形图）**: SVG/CSS实现或引入轻量图表库。无API依赖。

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
| Retry模式 | retryXxx(): Promise<void> | retryGenerate(req): Promise<boolean> | retryFetchXxx(): Promise<void> |

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

**受影响问题**: S5, S6（路由和组件缺失）

设计文档v13修订时（第6834-6858行）将 Consultation 拆分为 Consultation.vue + DoctorChatView.vue，News 拆分为 NewsView.vue + ArticleDetailView.vue。修订更新了1.6.1路由表和组件树，但实现阶段未跟进创建这两个新增组件文件及对应的路由配置。

**证据**: 文件系统中不存在 `DoctorChatView.vue` 和 `ArticleDetailView.vue`，路由表中无对应的两条路由。

### 根因3: Punch.vue 流程图实现时的筛选/分析联动遗漏

**受影响问题**: S3, S7（默认日期 + 日期变更不拉分析）

4.3节Punch.vue流程图包含两个关键节点：(1) 页面加载时"默认近30天"；(2) 日期变更时"重新请求list+analysis"。实现时这两处设计意图均未转化为代码逻辑。

**证据**: dateStart/dateEnd初始为空；setFilter仅调用fetchList。

### 根因4: 跨模块数据传递的接收端消费不完整

**受影响问题**: S4, S11

Risk.vue（发送方）正确实现了数据保存和传参。LifePlan.vue（接收方）仅消费了 `riskFormStore.formData`（用于表单预填），遗漏了 `riskFormStore.result`（预测结果）和 `route.query.diabetesType` 的消费。

### 根因5: 缺乏统一的代码组织模式 review

**受影响问题**: G7-G9, G12, G17, G19-G23, G25-G27（重复代码、命名不一致、模式不统一）

三个Store和三个View组件由同一批次实现，但缺乏统一的代码组织规范（工具函数抽取、接口导出、命名约定、状态管理模式）。这些问题不产生功能缺陷，但增加了维护成本。

---

## 8. 总体评估

### 8.1 影响面分级

**阻塞级（影响功能可用性）**:
- S5（路由/组件缺失）：医生对话和文章详情功能完全不可用

**高危级（影响核心体验但功能可降级运行）**:
- S1（首页缓存缺失）：性能退化，每次加载3次API请求
- S2（方案缓存缺失）：页面刷新后方案丢失
- S6（文章跳转错误）：用户无法查看文章详情

**中危级（功能部分可用但有偏差）**:
- S3, S4, S7, S9, S10, S11, S13, G3, G6, G14, G24

**低危级（代码质量/可维护性）**:
- G1, G2, G4, G5, G7-G13, G15-G23, G25-G29

### 8.2 修复优先级建议

1. **S5**（路由/组件缺失）— 最高优先级，功能完全不可用
2. **S1, S2, S3, S6, S7** — 核心设计合规性偏差
3. **S4, S9, S11** — 跨模块数据流修复
4. **G14, G24** — 运行时行为缺陷
5. **G6, G3** — 设计合规性（UI元素）
6. **其余一般问题** — 代码质量迭代

---

*诊断报告结束。本报告定位问题根因至具体代码位置和触发条件，不包含修复步骤或代码补丁。*
