# 计划：首页 Home + 生活方案 LifePlan + 打卡记录 Punch 前端实现

> 分支：`202606271219_home_plan_punch_frontend`（禁止切分支）
> 产出方：Planner 角色
> 适用管线：审议式「计划-设计-编码-验证」

## 1. 任务概述

在现有 Vue 3.5 + TypeScript + Vite 8 + Pinia 3 + Vue Router 4 工程基础上，完整实现三个前端模块：

1. **系统首页 Home**（`/home` → `src/views/Home.vue`，requiresAuth:false）— 公开访问。
2. **生活方案 LifePlan**（`/life-plan` → `src/views/LifePlan.vue`，requiresAuth + requiresDisclaimer）— 登录 + 免责声明。
3. **打卡记录 Punch**（`/profile/punch` → `src/views/Punch.vue`，requiresAuth）— 登录，引用 LifePlan 方案条目。

三模块当前均为「待组员开发」骨架占位，需完整实现。视觉与交互一切以 `docs/prototype.html` 为准。

## 2. 技术栈与硬性约束（全局适用）

- **框架**：Vue 3.5 `<script setup lang="ts">` + Composition API；TS strict，禁用 `any`（边界处用 `unknown` 并收窄或显式 `as` 斵言并注释）。
- **DTO/响应外壳**：后端统一返回 `{ success, data, message }`（见 `src/types/api.ts` `ApiResponse<T>`）；列表走 `PaginatedResponse<T>`（`{ data, pagination }`）。复用既有 `ApiResponse<T>`、`PaginatedResponse<T>`、`PaginationParams`。
- **HTTP**：仅用 `src/composables/useApi.ts` 导出的 `api`（axios，baseURL `/api`，自带 JWT 拦截器与 401 处理）；JWT token 从 `useAuthStore().token` 由拦截器注入，组件中不读 token、不拼 URL。
- **鉴权/状态**：复用 `useAuthStore`（含 `isLoggedIn` / `isAdmin` / `user`）；新 store 命名沿用现有风格（`xxxStore.ts`，setup-store 写法，参见 `authStore.ts`）。
- **富文本安全**：任何来自 AI/文章的 Markdown 输出必经 `marked` 解析后 `DOMPurify.sanitize`，再 `v-html`。组件中不允许直接 `v-html` 未净化字符串。
- **弹窗/Toast**：复用 SweetAlert2（按需 `await import('sweetalert2')`，与 `router/index.ts` 风格一致）。
- **枚举标签**：复用 `src/utils/enumLabels.ts` `enumLabel(category, value)`；新增枚举在此扩展，勿散落。
- **样式**：移动端优先（375px 基准），主色 `#4A90D9`，复用项目现有 Tailwind 工具类 + 设计系统参数；不破坏 `src/assets/variables.css`。
- **路由**：路由已存在，禁止改动 `src/router/index.ts` 路由表（除非补充独立子路由，需与现有约定一致并经审议）；不改 `App.vue` 底部 tab 栏。
- **后端**：严禁改动 `server/`。
- **验收门禁**：`npx vue-tsc --noEmit -p tsconfig.app.json` 零错误。

## 3. API 端点依据（来自详细设计 docs/2_detailed_design_v3.md 第 6 节）

- 医生：`GET /api/doctors`（分页，公开）；`GET /api/doctors/:id`。
- 文章：`GET /api/articles`（分页，公开，category 过滤）；`GET /api/articles/:id`。
- 糖尿病类型：`GET /api/diabetes-types`（公开）；`GET /api/diabetes-types/:id`。
- 生活方案：`POST /api/plan/generate`、`PUT /api/plan/adjust`、`GET /api/plan/current`（均需登录）。
- 打卡：`POST /api/punch`、`GET /api/punch/list`（分页+startDate/endDate/punch_type 筛选）、`GET /api/punch/analysis`（均需登录）。

> 注：首页涉及 `/api/doctors`、`/api/articles`、`/api/diabetes-types`，均为公开浏览，首页在未登录态也须可渲染。

## 4. 任务拆分清单

按模块拆为 3 个主任务，每个主任务内再拆分「类型 / Store / API / 视图 / 样式」子任务，并标注依赖。

---

### Task 1：系统首页 Home（第 1 轮，task_v1.md）

**范围**：
- 顶部 Logo + 搜索栏（sticky）。
- 轮播 Banner（自动轮播 4s，可点击切换、指示器）。
- 专业医师团队（横向滚动卡片，点击跳 `/consultation` 的对应医生对话——若 Consultation 已实现入口则跳医生，否则跳 `/consultation`）。
- 健康科普文章（取 `GET /api/articles` 前 3 条，点击进文章详情——若 NewsView 未实现详情路由，点击跳 `/news`）。
- 糖尿病类型科普网格（2 列，点击展开/查看详情——若后端 `/api/diabetes-types/:id` 可用则弹层展示病因/表现/治疗，否则仅展示 type 列表卡片）。
- 未登录态降级：未 `requiresAuth` 路由，但登录后的「今日打卡概览」等登录态区块需用 `authStore.isLoggedIn` 控制显隐。

**子任务拆分**：
1. **types 子任务**：在 `src/types/api.ts` 增补：
   - `Article`（id、title、cover、author、publish_time、category、tags、read_count、summary、content?、is_collected?）
   - `DiabetesType`（id、name、cover、pathogenesis、manifestation、treatment）
   - 复用已有 `Doctor`（已存在）。
   - `HomeSummary`（可选，今日打卡/健康指标摘要，若后端无专门接口则前端聚合或省略）。
   - 列表响应复用 `PaginatedResponse<Doctor>`、`PaginatedResponse<Article>`。
2. **store 子任务**：新增 `src/stores/homeStore.ts`（setup-store）——缓存 `doctors`、`articles`（前 N 条用于首页）、`diabetesTypes` 及对应 loading/error 状态；提供 `fetchHomeData()` 并行拉取三个公开接口（`Promise.allSettled`，单个失败不阻断其余区块——对应 7.3 健壮性降级）。
3. **api 子任务**：在 `src/composables/useApi.ts` 同目录或新增 `src/composables/useHomeApi.ts` 封装 `getDoctors(params)`、`getArticles(params)`、`getDiabetesTypes()`、`getDiabetesType(id)`，均走 `api` 返回 `data.data`。
4. **视图子任务**：完整重写 `src/views/Home.vue`——`<script setup lang="ts">`，onMounted 调 `homeStore.fetchHomeData()`；组件化渲染（可在文件内拆 sub-template 或抽 `src/components/home/` 下小组件，推荐内联以贴合 prototype）。
5. **样式子任务**：贴合 prototype.html 的 Home 模板（banner-glow、avatar-ring、hide-scrollbar、press-card 等效果用 Tailwind 工具类复刻；移动端 375px 无横向滚动）。

**依赖**：无（最独立），可作为第 1 轮。
**验收标准**：
- `/home` 在登录/未登录两态均能渲染，无白屏、无横向滚动条。
- 三个公开接口失败时对应区块降级为空状态/重试，不阻断其余区块。
- `vue-tsc --noEmit` 零错误；不新增 `any`。
- 视觉与 prototype.html 首页一致（banner / 医师 / 科普 / 糖尿病类型四区）。

---

### Task 2：生活方案 LifePlan（第 2 轮，task_v2.md）

**范围**：
- 无方案引导态（hasPlan=false）+ 生成表单（身体信息 + 偏好）。
- 调用 `POST /api/plan/generate`，生成中 loading（阶段描述文本）。
- 方案展示态：饮食方案（早/中/晚/加餐，order 映射）、运动方案（晨间/晚间/周末），按 prototype 分卡片展示。
- 每条方案项可打卡（调用 `POST /api/punch`，携带 `plan_id` + `punch_type` + `completion_status`），即时反馈 1s 内。
- 完成率统计（饮食 x/total、运动 x/total，gradient-text）。
- 方案调整：`PUT /api/plan/adjust`（feedback 文本）→ 新方案替换（is_active 逻辑过期，前端重新拉 `GET /api/plan/current`）。
- 进入路由已由 router 守卫处理 requiresDisclaimer，组件内不重复弹免责，但 AI 生成内容底部固定免责提示条。

**子任务拆分**：
1. **types 子任务**：在 `src/types/api.ts` 增补：
   - `PlanType = 'diet' | 'exercise' | 'other'`；`PlanItem`（id、plan_id、plan_type、order、time、title、content（Markdown））。
   - `PlanGenerateRequest`（health_info、preferences 子结构；内部字段待概要设计/后端确认时补，先以接口占位并注释）。
   - `PlanAdjustRequest`（plan_id、feedback）。
   - `PlanResponse`（plan_id、items: PlanItem[]）。
   - 复用 `PunchRequest`（见 Task 3，但 Task 2 打卡会用到，需协调——见依赖）。
2. **store 子任务**：新增 `src/stores/lifePlanStore.ts`——`currentPlan`（PlanResponse|null）、`generating`/`loading`/`error`、`generate(req)`、`adjust(feedback)`、`fetchCurrent()`；打卡完成态本地缓存（按 plan_id 维护 `completed[planId]`），与 punch 模块解耦但状态可被 Punch 模块复用。
3. **api 子任务**：新增 `src/composables/useLifePlanApi.ts` 封装三个 plan 端点 + 复用 `usePunchApi`（见 Task 3）的 `createPunch`。
4. **视图子任务**：完整重写 `src/views/LifePlan.vue`——引导/生成中/展示/调整四态切换；Markdown 方案内容经 DOMPurify+marked 渲染；打卡按钮防重复点击。
5. **样式子任务**：贴合 prototype 生活方案模板（gradient-text 统计、卡片、wand-magic-sparkles 生成按钮）。

**依赖**：
- 依赖 plan 接口类型与后端 `/api/plan/*`。
- 打卡功能依赖 `PlanItem` 类型；与 Task 3 共享 `PunchRequest`/`PunchType` 类型——Punch 的类型应在 Task 3 定义，但 Task 2 需用，建议 Task 2 提前在 `types/api.ts` 落地 `PunchType`、`PunchRequest`（或由 Planner 协调：Task 2 内只引入 Task 3 将定义的类型，类型文件由先做的一方落地）。
- 富文本净化需 DOMPurify + marked（已在 deps）。

**验收标准**：
- 无方案 → 生成 → 调整 全流程可达；方案至少含 4 饮食 + 3 运动项渲染按时段分组。
- 打卡 1s 内反馈；方案条目可追溯（plan_id 透传）。
- AI 生成内容底部免责提示条恒显；Markdown 必经净化。
- `vue-tsc` 零错误。

---

### Task 3：打卡记录 Punch（第 3 轮，task_v3.md）

**范围**：
- 打卡日历/列表视图（按日期分组，prototype punchRecords 形态）。
- 新增打卡入口（选择方案条目 → 拉自 `GET /api/plan/current` 的活跃方案项 → 记录数值/备注 → `POST /api/punch`）。
- 列表筛选：startDate/endDate + punch_type；分页（复用 PaginatedResponse）。
- 统计：连续天数、完成率、按类型汇总；`GET /api/punch/analysis` 返回 AI 分析评语（Markdown 渲染+DOMPurify）。
- 历史记录删除（若后端提供 DELETE 端点；详细设计第 6.6 节未列 DELETE，若不存在则前端仅展示，不做删除——需 Designer/Coder 与后端确认后标注）。

**子任务拆分**：
1. **types 子任务**：在 `src/types/api.ts` 增补：
   - `PunchType = 'diet' | 'exercise'`；`CompletionStatus = 'completed' | 'uncompleted'`。
   - `PunchRequest`（plan_id、punch_type、completion_status、remarks?）。
   - `PunchRecord`（id、plan_id、punch_type、completion_status、remarks、created_at、关联 plan 标题?）。
   - `PunchListParams`（startDate?、endDate?、punch_type? + PaginationParams）。
   - `PunchAnalysis`（评语文本/结构，具体字段以后端 analysis 响应为准，先占位）。
2. **store 子任务**：新增 `src/stores/punchStore.ts`——`records`、`filter`、`analysis`、loading/error、`fetchList(params)`、`createPunch(req)`、`fetchAnalysis()`。
3. **api 子任务**：新增 `src/composables/usePunchApi.ts` 封装 `POST /api/punch`、`GET /api/punch/list`、`GET /api/punch/analysis`。
4. **视图子任务**：完整重写 `src/views/Punch.vue`——列表/筛选/新增弹层(SweetAlert2 或内嵌)/统计卡/AI 分析区。
5. **样式子任务**：贴合 prototype 打卡模板。

**依赖**：
- 依赖方案条目类型 `PlanItem`（来自 Task 2）以关联 plan_id 与方案项标题展示。
- 依赖 Task 2 的 `useLifePlanApi.fetchCurrent()` 获取活跃方案项供新增打卡选择。
- 依赖 `/api/punch/analysis` 的 AI 输出 Markdown 净化。

**验收标准**：
- 列表支持日期范围+类型筛选；分页正常。
- 新增打卡关联方案项 plan_id，提交后列表即时刷新。
- 统计含完成率+连续天数+按类型汇总；AI 分析评语 DOMPurify 净化后渲染。
- `vue-tsc` 零错误。

## 5. 依赖关系图

```
Task 1 (Home)            无依赖           ──┐ 最先
Task 2 (LifePlan)        依赖 plan 类型 / DOMPurify  ──┐ 中间
Task 3 (Punch)           依赖 Task 2 的 PlanItem / fetchCurrent  ── 最后
```

共享类型（`PunchType`/`PunchRequest`/`CompletionStatus`、`Article`、`DiabetesType`、`Doctor`、`PlanItem`）集中落在 `src/types/api.ts`，各任务在此基础上增补且避免冲突——由 Designer 在每轮 detail 中明确字段清单后再落地。

## 6. 执行顺序建议

**Task 1 → Task 2 → Task 3**，逐轮推进，每轮一个模块，符合「每轮一个模块」的用户要求。
- 第 1 轮：Task 1 = Home（最独立，公开接口，先跑通骨架与设计系统）。
- 第 2 轮：Task 2 = LifePlan（引入登录态、AI 生成、Markdown 净化、打卡雏形）。
- 第 3 轮：Task 3 = Punch（复用方案条目，做列表/统计/分析）。

## 7. 全局验收标准（三模块完成后整体回归）

- `npx vue-tsc --noEmit -p tsconfig.app.json` 零错误。
- 三路由可达、交互完整、视觉贴合 prototype.html。
- Pinia store 状态清晰、API 调用集中（composables 层）。
- 不破坏 `server/`、不改路由表（除非审议通过）、不新增 `any`、富文本必经 DOMPurify、JWT 走拦截器。
- 代码风格遵循现有约定（中英混排注释、文件命名 `xxxStore.ts` / `useXxxApi.ts`）。