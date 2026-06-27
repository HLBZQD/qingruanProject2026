# task_v3 — 打卡记录 Punch 前端实现（第 3 轮）

> 分支：`202606271219_home_plan_punch_frontend`（禁止切分支）
> 产出方：Planner 角色 → Designer（产出 `detail_v3.md`）→ Coder → Verifier
> 范围：仅 Task 3 = 打卡记录与分析 Punch（`src/views/Punch.vue` 完整重写 + 配套 store/composables/类型复用）
> 视觉与交互唯一基准：`docs/prototype.html` 的 Punch 模板（约 1246-1305 行）+ mock 数据（约 196-202 行 `punchRecords`）
> 上一轮基础：Task 1 = Home ✅、Task 2 = LifePlan ✅（均已完成并验证），PunchCreate 类型/枚举已在 Task 2 落地，直接复用

---

## 0. 输入文档路径（Designer/Coder 必读）

| 文档 | 路径 | 用途 |
|---|---|---|
| 总计划 | `plan.md` | 第 2 节全局约束、第 4 节 Task 3 范围 |
| 上一轮详细设计 | `detail_v2.md` | 复用范式——打卡类型 PunchType/CompletionStatus/PunchCreateRequest/PunchCreateResponse/PunchListParams/PunchRecord 已在 Task 2 types/api.ts 落地 |
| 上一轮编码 | `code_v2.md` | 复用解包路径约定、lifePlanStore 的 createPunch 边界 |
| 上一轮验证 | `verify_v2.md` | 验收门禁口径、S1-S6 静态审查清单口径 |
| 需求分析 | `docs/1_requirements_analysis_v2.md` | 4.7 打卡记录与分析（约 303-314 行）；6.6 接口列表（约 891-908 行） |
| 详细设计 | `docs/2_detailed_design_v3.md` | **3.2.17** GET /api/punch/list（1942 行起，分页+筛选）、**3.2.18** GET /api/punch/analysis（1999 行起）、**3.2.16** POST /api/punch（1913 行起）；**2.5** punch_in 数据字典（1290 行起）；枚举标签 1.8 节；Punch.vue 流程图 4.1.8（3281 行起） |
| 前端原型 | `docs/prototype.html` | Punch 模板 1246-1305 行、mock 196-202 行 |

### 0.1 项目现状文件（核对后决定改/不改）

| 文件 | 现状 | 处置 |
|---|---|---|
| `src\views\Punch.vue` | 骨架占位 | **完整重写** |
| `src\router\index.ts` | `/profile/punch` 已存在，`meta: { requiresAuth:true }` | **不改** |
| `src\types\api.ts` | PunchType/CompletionStatus/PunchCreateRequest/PunchCreateResponse/PunchListParams/PunchRecord 已在 Task 2 落地 | **只读复用，不重复定义**。仅增补 PunchAnalysis 类型 |
| `src\utils\enumLabels.ts` | punch_type/completion_status 映射已在 Task 2 落地 | **只读复用** |
| `src\composables\useLifePlanApi.ts` | createPunch 已在 Task 2 落地 | **只读复用**（Punch 页只做列表/统计/分析，打卡操作走 LifePlan 页） |
| `src\stores\lifePlanStore.ts` | completedMap 可复用 | **只读复用**（读取打卡完成状态用于列表展示） |
| `src\composables\useApi.ts` | api（axios） | **不改** |
| `src\stores\authStore.ts` | isLoggedIn/user | **只读复用** |

> **禁止改动**：`src\router\index.ts`、`src\App.vue`、`src\composables\useApi.ts`、`src\stores\authStore.ts`、`src\stores\riskFormStore.ts`、`src\stores\homeStore.ts`、`src\stores\lifePlanStore.ts`、`src\composables\useHomeApi.ts`、`src\composables\useLifePlanApi.ts`、`src\views\Risk.vue`、`src\views\LifePlan.vue`、`server/**`、`package.json` / `vite.config.ts` / `tsconfig.app.json`（**不引入任何新依赖**）。

---

## 1. 任务范围（Punch 前端完整实现）

1. **打卡记录列表**：以 `punchRecords` 列表项卡片展示，每条记录含类型图标（饮食/运动）、方案项标题、日期时间、完成状态标签。支持按日期范围（startDate/endDate）和打卡类型（punch_type）筛选。
2. **分页**：列表支持分页，复用 `PaginatedResponse<PunchRecord>`，滚动触底加载更多或手动翻页。
3. **统计卡**：本周完成趋势柱状图（7 天）、饮食/运动完成率汇总。
4. **AI 分析区**：调用 `GET /api/punch/analysis`，展示 AI 生成的依从性评语（Markdown 渲染 + DOMPurify 净化）。含 diet_completion_rate、exercise_completion_rate、last_7_days_trend、adherence_comment。
5. **降级/空态**：空记录引导态（「还没有打卡记录，去生活方案页开始打卡吧」+ CTA 按钮）；AI 分析失败降级为通用提示。
6. **免责提示条**：AI 分析区底部恒显固定免责提示条。

> 注意：**打卡创建操作已在 LifePlan 页完成**（Task 2），Punch 页**只做列表展示、筛选、统计和分析**，不提供新增打卡入口。如需打卡，引导用户跳转 `/life-plan`。

---

## 2. 子任务拆分

### 2.1 types 子任务（在 `src/types/api.ts` 仅增补 PunchAnalysis，勿动既有）

Task 2 已落地：`PunchType`、`CompletionStatus`、`PunchCreateRequest`、`PunchCreateResponse`、`PunchListParams`、`PunchRecord`。

本轮仅增补：
- `PunchAnalysisResponse`：对齐 §3.2.18 响应结构
  ```typescript
  export interface PunchAnalysisResponse {
    diet_completion_rate: number;
    exercise_completion_rate: number;
    total_punches: number;
    last_7_days_trend: Array<{ date: string; diet_completed: number; exercise_completed: number }>;
    adherence_comment: string;  // Markdown，需 DOMPurify 净化
    improvement_suggestions: string[];
  }
  ```

### 2.2 store 子任务（新增 `src/stores/punchStore.ts`，setup-store）

参照 `homeStore.ts` / `lifePlanStore.ts` 写法：
- state：`records: Ref<PunchRecord[]>`、`pagination: Ref<PaginationInfo|null>`、`filter: Ref<{startDate?, endDate?, punch_type?}>`、`analysis: Ref<PunchAnalysisResponse|null>`、`loading/listLoading/analysisLoading: Ref<boolean>`、`error/analysisError: Ref<Error|null>`
- `fetchList(params: PunchListParams)`：调 GET /api/punch/list，回填 records + pagination
- `fetchAnalysis()`：调 GET /api/punch/analysis，回填 analysis
- `setFilter(partial)`：更新筛选条件 + 重新 fetchList
- `loadMore()`：分页加载下一页（追加到 records）
- 禁 `any`、禁读 `localStorage.token`

### 2.3 api 子任务（新增 `src/composables/usePunchApi.ts`）

封装两个端点：
- `getPunchList(params: PunchListParams)` → `api.get<PagedBody<PunchRecord>>('/punch/list', { params })` → 返回 `{ records: res.data.data, pagination: res.data.pagination }`
- `getPunchAnalysis()` → `api.get<ApiResponse<PunchAnalysisResponse>>('/punch/analysis')` → 返回 `res.data.data`
- 全部走 `api`（axios），禁 `any`

### 2.4 视图子任务（完整重写 `src/views/Punch.vue`，`<script setup lang="ts">`）

原型 1246-1305 行要素：
- Header（返回 + 标题「打卡记录与分析」）
- 本周趋势柱状图（7 列，百分比高度，渐变柱）
- 打卡记录列表卡片（类型图标 + 类型标签 + 方案项标题 + 日期时间 + 完成状态 badge）
- AI 分析区（图标 + 标题 + 评语文本，Markdown 渲染）
- 筛选器（类型 chip：全部/饮食/运动）
- 空记录引导态

关键实现：
- AI 分析 `adherence_comment` 经 `marked.parse → DOMPurify.sanitize → v-html`
- 趋势柱状图用纯 CSS（div height 百分比 + 渐变背景，不用图表库）
- 筛选 chip 点击更新 store.filter，触发 fetchList
- 免责提示条在 AI 分析区底部恒显
- 子组件全部内联，不抽 `src/components/punch/`

### 2.5 样式子任务（scoped CSS + CSS 变量，**无 Tailwind**）

复刻原型 Punch 1246-1305 视觉（header、趋势柱状图、记录卡片、状态 badge、AI 分析卡片、筛选 chip、免责条）。scoped 自定义语义类 + `src/assets/variables.css` 变量，对齐 Round 1/2 范式。移动端 375px 无横向滚动。

---

## 3. 新增 / 修改文件清单

**新增**：
- `src/stores/punchStore.ts`
- `src/composables/usePunchApi.ts`

**修改（仅增补 / 重写，勿动既有）**：
- `src/types/api.ts`：仅增补 `PunchAnalysisResponse` 类型（文件末尾追加）
- `src/views/Punch.vue`：完整重写

**不改**：router/index.ts、App.vue、useApi.ts、authStore.ts、riskFormStore.ts、homeStore.ts、lifePlanStore.ts、useHomeApi.ts、useLifePlanApi.ts、Risk.vue、LifePlan.vue、Home.vue、variables.css、enumLabels.ts、package.json、vite.config.ts、server/

---

## 4. 技术约束（适用本轮）

- Vue 3.5 `<script setup lang="ts">` + Composition API；TS strict，禁 `any`
- HTTP 仅走 `useApi.ts` 的 `api`（baseURL `/api`，JWT 拦截器）
- 富文本：AI 分析 `adherence_comment` 经 `marked.parse → DOMPurify.sanitize → v-html`；禁止未净化 v-html
- 枚举标签：复用已有 `enumLabel('punch_type', record.punch_type)` / `enumLabel('completion_status', record.completion_status)`
- 分页：复用 `PaginatedResponse<T>` / `PaginationParams`（已在 types/api.ts）；vue-tsc 编译期校验
- 样式 scoped CSS + CSS 变量，**无 Tailwind**
- 不改路由表 / App.vue / server
- 复用 Round 1/2 范式：`getErrorMessage`、内联 style 弹层、`onUnmounted` 清理 timer

---

## 5. 降级 / 空态 / 加载态 / 错误态

| 场景 | 表现 |
|---|---|
| 列表加载中 | 骨架屏（3-4 条横条骨架，脉动动画） |
| 列表为空 | 空记录引导态 + CTA「去打卡」（跳 /life-plan） |
| 列表加载失败 | 错误态 + 重试按钮 |
| AI 分析加载中 | 分析区 skeleton（或 spinner + "AI 分析中..."） |
| AI 分析失败 | 降级通用提示条（"AI 分析暂不可用"）+ 重试按钮 |
| 分页加载更多 | 底部加载指示器（spinner），不覆盖列表 |

---

## 6. 验收标准（本轮 + 对齐 plan.md Task 3）

- 列表支持日期范围 + punch_type 筛选；分页正常
- 本周趋势柱状图 7 天渲染
- AI 分析 `adherence_comment` 经 DOMPurify 净化后 v-html 渲染
- 空态引导 + CTA 跳 LifePlan
- `npx vue-tsc --noEmit -p tsconfig.app.json` **零错误**；不新增 `any`；不引入新依赖
- S1-S6 静态审查通过
- 移动端 375px 无横向滚动，视觉贴合 prototype.html Punch 模板

---

## 7. 对 Designer 的 `detail_v3.md` 要点提示

Designer 须在 `detail_v3.md` 至少覆盖：
1. **§类型清单**：`PunchAnalysisResponse` 的 TS 定义与字段来源注释
2. **§punchStore 完整签名**：state/action 代码骨架（含分页追加、筛选重置）
3. **§usePunchApi**：两个函数解包路径（标注分页与否）
4. **§Punch.vue 组件结构**：列表/筛选/趋势图/AI 分析区/空态/加载态/错误态；marked+DOMPurify 净化链；子组件内联决策
5. **§样式**：scoped CSS 关键类与 CSS 变量映射（复刻原型 1246-1305）
6. **§降级矩阵**：各场景代码路径
7. **§文件清单**：§3 落地
8. **§验收映射**：对 Verifier 列出验收项的代码证据点

---

本任务文件交接 Designer 产出 `detail_v3.md`。
