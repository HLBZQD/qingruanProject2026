# code_v2 — 生活方案 LifePlan 实现（Task 2）

> 分支：`202606271219_home_plan_punch_frontend`（禁止切分支）
> 产出方：Coder（严格据 `detail_v2.md` 实现，未偏离设计）
> 验收映射：见 `detail_v2.md` 第 8 节

---

## 1. 实现清单（新建 / 修改的文件及关键改动）

### 1.1 修改：`src/types/api.ts`（仅增补，勿动既有）

在末尾 `DiabetesTypeDetail` 之后**增补**全部 Task 2 类型（共 12 个），未改动任何既有类型：

- `PlanType = 'diet' | 'exercise' | 'other'`
- `LifePlan`（6 字段：id, plan_type, order_num, time_desc, title, content）
- `PlanGenerateRequest`（health_info { age, gender:'male'|'female', height, weight }; preferences { dietary, activity }）—— gender 精确联合，非 string
- `PlanAdjustRequest`（plan_id, feedback）
- `PlanResponse`（plan_id, diet_plans, exercise_plans, other_plans）
- `PlanCurrentResponse extends PlanResponse { generated_at: string }`
- `PunchType = 'diet' | 'exercise'`
- `CompletionStatus = 'completed' | 'uncompleted'`
- `PunchCreateRequest`（plan_id 注解为"方案项 ID LifePlan.id"，punch_type, completion_status, remarks?）
- `PunchCreateResponse`（id, plan_id, punch_type, completion_status, remarks, punch_time）
- `PunchListParams extends PaginationParams`（startDate?, endDate?, punch_type?）
- `PunchRecord`（id, plan_id:number|null, plan_title?, punch_type, completion_status, remarks, punch_time）

### 1.2 修改：`src/utils/enumLabels.ts`（仅增补，勿动既有 LABELS）

在 `LABELS` 对象内部追加三组映射：
- `plan_type: { diet: '饮食', exercise: '运动', other: '其他' }`
- `punch_type: { diet: '饮食', exercise: '运动' }`
- `completion_status: { completed: '已完成', uncompleted: '未完成' }`

`enumLabel()` 函数未改。

### 1.3 新建：`src/composables/useLifePlanApi.ts`

按设计 §3。四个函数，全部禁 `any`，泛型解包精准：

- `getCurrentPlan()` → `api.get<...>('/plan/current')` 返回 `PlanCurrentResponse | null`（空方案 data:null）
- `generatePlan(req)` → `api.post<...>('/plan/generate', req, { timeout: 20000 })` 返回 `PlanResponse`
- `adjustPlan(req)` → `api.put<...>('/plan/adjust', req)` 返回 `PlanResponse`
- `createPunch(req)` → `api.post<...>('/punch', req)` 返回 `PunchCreateResponse`

全部走 `api`（axios），不读 token、不拼 URL。`generatePlan` 设 `timeout: 20000`。

### 1.4 新建：`src/stores/lifePlanStore.ts`

按设计 §4，setup-store 风格（`defineStore('lifePlan', () => {...})`）：

- **state**（10 个 ref）：
  - `currentPlan: PlanCurrentResponse | null`
  - `generating: boolean`（防双击锁）
  - `loading: boolean`（fetchCurrent 加载态）
  - `error / generateError / adjustError: Error | null`（分来源错误）
  - `isHistoryFallback: boolean`（生成失败降级渲染缓存）
  - `isConflict: boolean`（409 幂等标记）
  - `completedMap: Map<number, CompletionStatus>`（按方案项 id 索引打卡完成态）

- **actions**（6 个）：
  - `fetchCurrent()`：GET /api/plan/current，空方案 data:null→currentPlan=null（非错误）
  - `generate(req)`：POST /api/plan/generate，成功补 `generated_at = new Date().toISOString()` 写入 currentPlan；409→isConflict+generateError；其他失败且有缓存→isHistoryFallback=true（L3：store 内部置位）
  - `adjust(req)`：PUT /api/plan/adjust，成功替换 currentPlan，失败保留原方案
  - `createPunch(req, itemId)`：乐观更新 completedMap，失败回滚，throw 供组件 catch
  - `retryGenerate(req)` / `retryFetchCurrent()`

禁 `any`、禁读 `localStorage.token`。

### 1.5 修改：`src/views/LifePlan.vue`（完整重写）

按设计 §5，`<script setup lang="ts">` + scoped CSS + CSS 变量，**无 Tailwind、无新依赖**。

**script 关键结构**：

- **视图态**：`viewMode: 'loading' | 'empty' | 'form' | 'generating' | 'display' | 'error'`，初始值 `'loading'`（L5）
- **表单**：age/gender/height/weight（reactive），生活习惯多选 chip（`toggleHabit` 已实现 L4），建议 textarea
- **派生**：`computedBmi`（已实现 L4，未填显 '-'）、`sortedDiet/sortedExercise/sortedOther`（order_num 升序）、统计卡 `dietDone/sportDone/progress`
- **生成中**：`STAGE_TEXTS` 4 条文案 1800ms 轮播 + 不定进度条动画；`startStageTimer/stopStageTimer` 生命周期
- **预填**：`prefillFromRiskForm()` 内部先调 `riskForm.loadFromStorage()`（G1），再读 `formData`
- **错误态**：`errorRef = computed(() => store.generateError ?? store.error)`（G2），模板用 `errorRef`
- **Markdown 渲染**：`safeContentHtml()` = `marked.parse → DOMPurify.sanitize` 单次净化（S6）
- **错误消息**：`getErrorMessage(err, fallback)` 扩展 message 兜底（对齐 Risk.vue 范式）
- **打卡弹窗**：SweetAlert2 `showDenyButton`（完成/未完成两按钮），`plan_id: item.id`（方案项 ID，S1 已修正），备注原样入请求体（L1：不 escapeHtml）
- **调整**：`handleAdjust()` 方案组 `plan_id` + feedback
- **生命周期**：`onMounted` → `prefillFromRiskForm()` + `store.fetchCurrent()` → 判 viewMode；`onUnmounted` → `stopStageTimer()`

**template**：6 种 viewMode 分支（loading / empty / form / generating / display / error），含历史降级提示条、query 提示条（仅展示）、统计卡（gradient-text）、饮食/运动/其他分组卡片、打卡按钮（other 不渲染）、调整入口、AI 免责提示条恒显。

**scoped CSS**：全部使用 `var(--color-*)` / `var(--spacing-*)` / `var(--radius-*)` 等 CSS 变量。关键视觉：
- Header：`linear-gradient(135deg, #4A90D9, #38BDF8)`，`border-radius: 0 0 24px 24px`
- gradient-text：`-webkit-background-clip: text` 渐变文字
- 生成按钮：渐变背景 + shadow-md + press 按压动画
- 打卡按钮：done 态 `background: var(--color-accent)` 绿色
- 习惯 chip：active 态 `background: var(--color-primary)` 蓝色
- 不定进度条：`@keyframes lp-indeterminate` margin-left 动画
- 脉冲 spinner：`@keyframes lp-pulse` opacity 动画
- 移动端：`max-width: 480px; margin: 0 auto; padding-bottom: calc(var(--tab-bar-height) + 8px)`

---

## 2. 对设计的偏差说明

**无偏差。** 严格按 `detail_v2.md` 实现。所有修订点（S1/G1/G2/L1/L2/L3/L4/L5）均已落地。

微小调整（不计为偏差）：
- 原型中「BMI 信息条」含用户头像/昵称——本实现用 `fa-user` 图标 + 「健康管理」占位文案，因 LifePlan 页无独立用户信息上下文，authStore.user 可能为空，不臆造 avatar 逻辑。
- `computedBmi` 除 height/weight null 检查外额外增加 `> 0` 防御（height=0 或 weight=0 时显 '-'）。
- 表单输入增加 placeholder 提示（如「请输入年龄」），提升 UX。

---

## 3. 自检结论

| 检查项 | 结论 |
|---|---|
| 类型安全（`vue-tsc --noEmit -p tsconfig.app.json`） | PASS -- 零错误（EXIT: 0） |
| 禁 `any` | PASS -- 新增 4 个文件（types/api.ts 增补、enumLabels.ts 增补、useLifePlanApi.ts、lifePlanStore.ts、LifePlan.vue）无任何 `: any` / `<any>` / `as any`。catch 分支用 `unknown` + 类型收窄 |
| S1 禁 `any` | PASS -- 全部显式类型 |
| S2 所有 v-html 经 DOMPurify | PASS -- `safeContentHtml()` 是唯一 v-html 来源，`marked.parse → DOMPurify.sanitize` 单次净化 |
| S3 无硬编码后端 URL | PASS -- 全部走 `api`（baseURL `/api`），无硬编码 host |
| S4 变更集仅目标文件 | PASS -- 仅改/建 `src/types/api.ts`（增补）、`src/utils/enumLabels.ts`（增补）、`src/composables/useLifePlanApi.ts`、`src/stores/lifePlanStore.ts`、`src/views/LifePlan.vue`。未触碰 router/index.ts、App.vue、useApi.ts、authStore.ts、riskFormStore.ts、homeStore.ts、useHomeApi.ts、Risk.vue、variables.css、package.json、vite.config.ts、server/** |
| S5 无新依赖 | PASS -- 仅使用既有依赖（marked / dompurify / sweetalert2 / pinia / vue / vue-router），未改 package.json / vite.config.ts |
| S6 不双重净化 | PASS -- `safeContentHtml()` marked 输出整体 DOMPurify 一次，组件不再二次 sanitize |
| 打卡 plan_id = 方案项 ID（S1 已修正） | PASS -- `handlePunch` 中 `plan_id: item.id`（LifePlan.id），非方案组 plan_id；`createPunch` 第二个参数 `item.id` 作 completedMap 索引键 |
| 预填前调 loadFromStorage（G1 已修正） | PASS -- `prefillFromRiskForm()` 内部首行 `riskForm.loadFromStorage()` |
| 错误态区分来源（G2 已修正） | PASS -- `errorRef = computed(() => store.generateError ?? store.error)`，模板用 `getErrorMessage(errorRef, ...)` |
| 备注不转义（L1 已修正） | PASS -- `handlePunch` 中 `remarks: result.value.trim() || undefined`，无 escapeHtml |
| 删除死导入（L2 已修正） | PASS -- 未导入 `PlanType`；分组标题用 `enumLabel('plan_type', ...)` 动态映射 |
| isHistoryFallback 在 store 内置位（L3 已修正） | PASS -- `store.generate()` catch 分支内置 `isHistoryFallback.value = true`；组件 `handleGenerate` 仅读不写 |
| 补全函数（L4 已修正） | PASS -- `toggleHabit`、`computedBmi`、`retryFetch` 均已完整实现 |
| 初始加载态（L5 已修正） | PASS -- `viewMode` 初值 `'loading'`，模板含 loading 块（spinner +「加载中...」） |
| 轮播定时器生命周期 | PASS -- `onMounted` 不启轮播（仅在 handleGenerate 中启），`onUnmounted(stopStageTimer)` 清理 |
| 移动端无横向溢出 | PASS -- `.life-plan { max-width: 480px; margin: 0 auto; }`，`padding-bottom` 避开 tab 栏 |
| 不改路由表/App/server | PASS -- 未触碰任何禁止改动的文件 |

**字段契约核对**（对照 detail_v2.md §1）：
- `LifePlan` 仅 6 个契约字段（id/plan_type/order_num/time_desc/title/content），kcal/min/icon/completed 全由视图派生 PASS
- `PlanGenerateRequest.health_info.gender` = `'male' | 'female'` 精确联合 PASS
- `PunchCreateRequest.plan_id` 注释为「方案项 ID（LifePlan.id）」PASS
- `PlanCurrentResponse extends PlanResponse { generated_at }` PASS
- 打卡类型 PunchType/CompletionStatus 等由 Task 2 落地，供 Task 3 复用 PASS
