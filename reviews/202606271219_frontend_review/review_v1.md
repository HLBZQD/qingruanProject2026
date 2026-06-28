# Round 1: 设计合规性审查报告

## 严重问题（与设计不符，影响功能）

### 1. Home.vue 缺失 sessionStorage 缓存机制（1小时过期）
- **位置**: `src/stores/homeStore.ts:38-58`
- **设计规定**: 设计文档 4.2 节表格明确要求 "Home.vue | sessionStorage | 数据缓存 (含时间戳, 1小时过期) | 标签页关闭或超时清除"，4.3 节 Home.vue 流程图步骤 B "检查 sessionStorage 缓存 1小时有效期"，缓存命中直接渲染，未命中才调 API。
- **实际实现**: `homeStore.ts` 的 `fetchHomeData()` 每次 `onMounted` 都直接调用 `Promise.allSettled` 并行拉取三个 API，完全没有检查 sessionStorage 缓存，也没有写入 sessionStorage 的逻辑。任何情况下都发起 3 个网络请求。
- **影响**: 每次进入首页都冗余请求，增加服务端负载和用户等待时间；页面切换回首页时无法从缓存秒开。
- **建议修复**: 在 `fetchHomeData()` 开头检查 `sessionStorage` 中存储的缓存数据（含时间戳）；若缓存命中且未超过 1 小时，直接恢复 `doctors`/`articles`/`diabetesTypes`；API 成功后写入 sessionStorage（含 `cacheTime` 字段）。可创建一个独立的 composable 管理缓存读写。

### 2. LifePlan.vue 缺失 sessionStorage 方案缓存（30分钟过期）
- **位置**: `src/stores/lifePlanStore.ts:42-52`
- **设计规定**: 设计文档 4.2 节表格明确规定 "LifePlan.vue | sessionStorage | 方案缓存 (含生成时间戳, 30分钟过期) | 标签页关闭或超时清除"。
- **实际实现**: `fetchCurrent()` 直接调用 API `getCurrentPlan()`，没有检查 sessionStorage。方案生成成功后 (`generate()`) 也没有将 `currentPlan` 写入 sessionStorage。设计 4.3 节 LifePlan 流程图中，生成失败分支 K2 "检查是否存在最近一次的方案缓存" 依赖此缓存，当前代码中 store 虽然通过 `currentPlan` 内存引用实现降级，但页面刷新后缓存丢失。
- **影响**: 页面刷新/重新进入时无法从 sessionStorage 恢复方案数据，必须重新调 API；设计文档规定的 "30 分钟过期客户端缓存" 完全未落地。
- **建议修复**: 在 `fetchCurrent()` 开头先读 sessionStorage，命中且未超 30 分钟则恢复 `currentPlan` 并直接渲染；API 成功后写入 sessionStorage（key 如 `life_plan_cache`，包含 `data` + `cacheTime`）。在 `generate()`/`adjust()` 成功后同步更新缓存。

### 3. Punch.vue 缺失默认近30天日期筛选
- **位置**: `src/views/Punch.vue:22-23`
- **设计规定**: 设计文档 4.3 节 Punch.vue 流程图步骤 A→B 明确要求 "从 URL 参数或 sessionStorage 读取筛选条件，**默认近30天**"。
- **实际实现**: `dateStart` 和 `dateEnd` 初始值均为空字符串 `''`；`onMounted` 中调用 `store.fetchList()` 时 `filter` 对象中没有默认填充近 30 天日期范围。虽然 API 不传日期参数时可能走后端默认行为，但前端没有按设计实现"默认近 30 天"的日期回填逻辑，用户看到的日期输入框为空白。
- **影响**: 用户首次进入打卡页面时日期筛选器空闲，不清楚筛选范围；与设计明确要求的默认行为不符。
- **建议修复**: 在 `onMounted` 中或 store 初始化时计算默认日期范围：`dateEnd` = 今天（YYYY-MM-DD），`dateStart` = 30 天前，并写入 `filter` 对象。

### 4. LifePlan.vue 未读取 riskFormStore.result 作为跨模块数据传递
- **位置**: `src/views/LifePlan.vue:75-82`
- **设计规定**: 设计文档 4.2 节表格明确要求 "LifePlan.vue | Pinia riskFormStore | 从风险预测页传递的预测结果 (在 onMounted 中读取)"；App.vue 流程图步骤 P "riskFormStore.saveResult() -> router.push /life-plan -> LifePlan.vue onMounted 读取 riskFormStore.result"。
- **实际实现**: `prefillFromRiskForm()` 只读取 `riskForm.formData`（年龄、性别、身高、体重），完全没有读取 `riskForm.result`。`riskLevelHint` 仅仅是从 `route.query.riskLevel` 读取 query 参数（展示用 "基于您的风险等级定制方案"），不依赖 store 的 result。即使 `riskForm.result` 存在，也不会用于预填表单或提供上下文。
- **影响**: 从风险预测页跳转到生活方案页时，无法利用已完成的预测结果（风险等级、预测评分等上下文信息）；方案生成请求体 `preferences` 没有利用预测结果做更个性化的偏好预填。
- **建议修复**: 在 `onMounted` 中调用 `riskForm.loadFromStorage()` 后，不仅读取 `formData`，还应读取 `riskForm.result`；如果存在 result，可将 `riskLevel` 数据用于优先显示提示条或影响方案生成的偏好字段。

### 5. 路由表缺少 `/consultation/doctor/:id` 和 `/news/article/:id` 路由
- **位置**: `src/router/index.ts:5-67`
- **设计规定**: 设计文档 1.6.1 路由映射表明确包含 `/consultation/doctor/:id`（meta: requiresAuth, requiresDisclaimer）和 `/news/article/:id`（meta: requiresAuth: false）。这两个路由是核心功能入口。
- **实际实现**: 路由器 `routes` 数组中完全没有定义这两个路由。`/consultation/doctor/:id` 缺失意味着医师对话功能无路由入口；`/news/article/:id` 缺失意味着文章详情页无路由入口。
- **影响**: **严重功能缺口**——`/consultation/doctor/:id` 缺失导致无法导航到医生对话页；`/news/article/:id` 缺失导致首页文章卡片点击 `goArticle()` 跳转到 `/news` 而非 `/news/article/:id`，用户无法查看文章详情。

### 6. Home.vue 文章点击跳转目标与设计不一致
- **位置**: `src/views/Home.vue:80-82`
- **设计规定**: 设计文档 4.3 节 Home.vue 流程图步骤 K "绑定文章点击事件 router.push({path:'/news/article/' + articleId})"，组件树中存在 `goArticle` 范式。
- **实际实现**: 代码注释明确说 "文章详情页不在本任务；仅跳资讯 tab"，`goArticle(_id: number)` 函数直接将所有文章点击跳转到 `/news` 列表页，忽略 `articleId` 参数。
- **影响**: 用户点击首页文章卡片后无法查看文章详情，只能跳转到资讯列表页重新寻找。这在 Task3（打卡记录）完成时仍然如此，属于未跟进修复的遗留问题。

### 7. Punch.vue 日期筛选变更未同步触发 AI 分析重拉取
- **位置**: `src/views/Punch.vue:127-132`
- **设计规定**: 设计文档 4.3 节 Punch.vue 流程图步骤 L→M "修改日期 → 重新请求 list+analysis API 更新渲染"。
- **实际实现**: `onDateChange()` 只调用 `store.setFilter()`，而 `setFilter()` 内部仅调用 `fetchList()`，不重新拉取 `fetchAnalysis()`。筛选项变更后 AI 分析区域不更新，仍展示旧数据。
- **影响**: 用户切换日期范围后，AI 分析统计（完成率、趋势图、评语）仍基于旧数据，与列表内容不一致，可能导致用户混淆。

## 一般问题（与设计有偏差，不影响核心功能）

### 8. LifePlan.vue 组件树结构与设计文档存在偏差
- **位置**: `src/views/LifePlan.vue:310-563`
- **设计规定**: 设计文档 4.1.4 组件树：
  ```
  ├── (引导视图) # 方案为空时展示
  │   ├── <div class="empty-state">
  │   │   ├── <img class="empty-illustration"> (插图)
  │   │   ├── <p>功能简介: 2-3句说明
  │   │   └── <button class="btn-cta">开始风险预测 / 生成我的生活方案
  ```
- **实际实现**: 引导视图使用了 `<div class="lp-empty">` 和 `<div class="lp-empty-card">`（CSS class 为 `lp-empty` 而非 `empty-state`），使用 `<i class="fa-solid fa-clipboard-list">` 图标代替 `<img>` 插图标签。按钮文案为 "立即定制方案"，而非设计的 "开始风险预测 / 生成我的生活方案"。
- **建议修复**: 如设计文本为硬性要求，将按钮文案改为 "开始风险预测 / 生成我的生活方案"；若插图仅为虚拟需求可保留 FontAwesome 图标方案。

### 9. Home.vue 糖尿病类型区 "全部" 链接为静态占位（非可点击按钮）
- **位置**: `src/views/Home.vue:293-296`
- **设计规定**: 设计文档 4.1.2 组件树 `#types-section` 中 `<a>全部</a>` 为可点击跳转链接。
- **实际实现**: 使用 `<span class="section-link-static">` 而非 `<button>` 或 `<a>` 标签，无 `@click` 事件绑定，仅作视觉占位。其他两个区块（医师团队"查看全部"、健康科普"更多"）均已正确实现为 `<button class="section-link">`。
- **建议修复**: 将 `<span class="section-link-static">` 改为 `<button class="section-link" @click="goTypesList">` 并对齐跳转逻辑（如跳转到新页面或 Tab）。

### 10. Punch.vue 分析区缺少环形图，趋势图实现与设计有差异
- **位置**: `src/views/Punch.vue:192-266`
- **设计规定**: 设计文档 4.3 节 Punch.vue 流程图步骤 P "分析数据展示 完成率**环形图** 近7天趋势**柱状图**"；4.1.8 组件树 `#trend-chart` 描述为 "简易柱状图/列表, canvas或纯CSS实现"。
- **实际实现**: 完成率仅以渐变文字百分比展示，无环形图；趋势图采用了纯 CSS 堆叠柱状图，但缺少 Canvas 实现；柱状图使用叠柱设计（饮食+运动在一根柱子上分层），而原型描述的是单一柱状图。
- **影响**: 视觉上与设计文档的小程度偏差，功能正常。
- **建议修复**: 如需严格对齐设计，为完成率添加 SVG 环形图；趋势图保持纯 CSS 实现即可（优于 Canvas 维护性）。

### 11. Punch.vue 设计要求滚动到底部加载更多，但还保留了滚动监听 + 加载更多按钮双模式
- **位置**: `src/views/Punch.vue:107-118` (滚动监听), `src/views/Punch.vue:427-433` (加载更多按钮)
- **设计规定**: 设计文档 4.3 节 Punch.vue 流程图中步骤 L→O "滚动到底部 → page++ → 追加渲染 无限滚动"；4.1.8 组件树末尾 "加载更多按钮, 或无限滚动"。
- **实际实现**: 同时实现了滚动触底监听（距底部 120px）和手动"加载更多"按钮。两套机制同时存在，设计文档以 "或" 表示二选一。
- **影响**: 双机制冗余但功能正常，用户有更多操作选择，不影响使用。
- **建议修复**: 可保持双机制（既支持无限滚动又提供手动按钮），但注释说明意图。

### 12. 路由 meta 字段与设计文档存在一些小差异
- **位置**: `src/router/index.ts:19,34,44`
- **设计规定**: 设计文档 1.6.1 路由映射表中 `/life-plan` 的 meta 仅定义为 `{ requiresAuth: true }`（无 `requiresDisclaimer`），`/profile/punch` 的 meta 仅定义为 `{ requiresAuth: true }`。
- **实际实现**: `/life-plan` 实际携带 `{ requiresAuth: true, requiresDisclaimer: true }`——添加了额外的 `requiresDisclaimer` 字段。这实际上是**对齐了 v13/v15 修订后的设计**（4.11 节合规要求为 AI 功能入口添加免责声明），与路由表最新版本一致。
- **影响**: 无负面影响，实际是积极的对齐。

### 13. LifePlan.vue 打卡 SweetAlert2 弹窗交互与设计流程图顺序有差异
- **位置**: `src/views/LifePlan.vue:236-273`
- **设计规定**: 设计文档 4.3 节 LifePlan.vue 流程图步骤 M→N→O "点击方案项旁打卡按钮 → POST /api/punch → SweetAlert2 确认弹窗 完成/未完成选择"。
- **实际实现**: 实际情况是**先弹 SweetAlert2 后调 API**（流程图要求的顺序是先调 API 后弹窗），即用户在弹窗中选择完成/未完成并填写备注后，才调用 `store.createPunch()`。
- **影响**: 实际实现更合理（用户确认意图后才提交），但 API 设计中的 `POST /api/punch` 应先于 UI 确认。当前实现避免了无效 API 调用，是用户体验优化。
- **建议修复**: 确认当前实现是否为有意偏离，如是可将流程图同步更新为 "弹窗确认 → POST"。

### 14. Home.vue 设计中要求的搜索图标与实现存在差异
- **位置**: `src/views/Home.vue:176-178`
- **设计规定**: 设计文档 4.1.2 组件树中 Header 要求 `<i class="fas fa-search">`（搜索图标, 装饰性）。同时 component tree 中使用了 Font Awesome 5 的 `fas` 前缀（用于 `<i>` 标签）。
- **实际实现**: 搜索按钮使用了 `<i class="fa-solid fa-magnifying-glass">`（Font Awesome 6 solid 风格），实际有 `@click="onSearch"` 事件处理，弹出了 "搜索功能开发中" Toast 提示。设计的 "装饰性" 注释与实际的 "功能占位" 不同。
- **影响**: 搜索按钮有交互行为（提示开发中），但搜索功能确实未实现，属于预留入口。

### 15. Punch.vue 缺少 refresh 刷新按钮
- **位置**: 设计文档 4.1.8 组件树 `Punch.vue` 筛选条件区域中包含 `<button class="btn-icon" id="btn-refresh"> (刷新) <i class="fas fa-sync">`
- **实际实现**: `src/views/Punch.vue:270-304` 的筛选区中只有日期输入和 chip 按钮组，没有独立的刷新/同步图标按钮。
- **影响**: 用户无法手动刷新当前数据，需修改筛选才触发重拉取。

## 设计符合项（值得肯定的正确实现）

- **路由守卫完整性**: `src/router/index.ts:96-128` 正确实现了 5 步前置守卫（免登录放行、未登录拦截、admin 权限检查、mustChangePassword 检查、免责声明检查），与设计文档 1.6.2 节完全一致。
- **免责声明弹窗**: `src/router/index.ts:82-93` 正确使用 SweetAlert2 实现 `showDisclaimer()`，标题、文案、确认/取消按钮文案均与设计规范匹配，点击"不同意"时正确跳转到 `/home`。
- **组件内 ref 状态管理**: 所有三个页面（Home/LifePlan/Punch）的局部 UI 状态（加载态、错误态、表单数据）正确存储在组件内 `ref`/`reactive` 中，符合设计文档 4.2 节的 "组件内 ref 局部状态" 规定。
- **Pinia Store 架构**: 三个模块均正确使用 Pinia Store 管理跨组件共享数据，`useHomeStore`/`useLifePlanStore`/`usePunchStore` 均正确采用 `defineStore` 组合式 API 风格。
- **API 端点一致性**: 三个模块的 composable API 端点路径与设计文档一致：
  - GET `/api/doctors`, `/api/articles`, `/api/diabetes-types` -- Home
  - GET `/api/plan/current`, POST `/api/plan/generate`, PUT `/api/plan/adjust`, POST `/api/punch` -- LifePlan
  - GET `/api/punch/list`, GET `/api/punch/analysis` -- Punch
- **请求参数对齐**: API 请求参数结构（分页、筛选、请求体）与 `src/types/api.ts` 类型定义及设计文档契约完全一致。
- **Markdown 净化渲染链**: 所有三个模块中涉及 Markdown 内容的渲染均正确使用 `marked.parse() → DOMPurify.sanitize() → v-html` 三段式安全渲染链，符合 XSS 防护设计规范。
- **LifePlan.vue 免责声明条**: `src/views/LifePlan.vue:553-555` 正确实现了底部恒定显示的 AI 免责提示条（`lp-disclaimer`），文案与设计一致。
- **Punch.vue 空态引导**: `src/views/Punch.vue:337-353` 正确实现了空记录引导态，含空图标、说明文字、CTA 跳转按钮，与设计文档 4.6.3 节空数据引导页规范一致。
- **竞态防护**: `punchStore.ts:52-83` 正确实现了 `requestId` 防竞态快照机制，快速切换筛选条件时旧响应不会覆盖新响应数据。
- **Promise.allSettled 容错**: `homeStore.ts:44-56` 使用 `Promise.allSettled` 并行拉取三个独立 API，任一失败不阻断其余区块渲染，符合设计文档 Home.vue 流程图的容错设计。
- **类型严格性**: 所有文件中均无 `any` 类型滥用，`PunchType`、`CompletionStatus` 等枚举严格使用字面量联合类型，全局类型定义集中于 `src/types/api.ts`。
