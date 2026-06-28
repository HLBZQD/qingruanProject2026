# task_v2 — 生活方案 LifePlan 前端实现（第 2 轮）

> 分支：`202606271219_home_plan_punch_frontend`（禁止切分支）
> 产出方：Planner 角色 → Designer（产出 `detail_v2.md`）→ Coder → Verifier
> 范围：仅 Task 2 = 生活方案 LifePlan（`src/views/LifePlan.vue` 完整重写 + 配套 types/store/composables/枚举扩展）
> 视觉与交互唯一基准：`docs/prototype.html` 的 LifePlan 模板（约 619-761 行）+ mock 数据（约 178-190 行 `lifePlanDiet`/`lifePlanSport`）
> 上一轮基础：Task 1 = Home 已完成并验证（commit 490b3e2，vue-tsc PASS），`detail_v1.md` / `code_v1.md` / `verify_v1.md` 已落地约定须复用，不得重做。

---

## 0. 输入文档路径（Designer/Coder 必读）

| 文档 | 路径 | 用途 |
|---|---|---|
| 总计划 | `C:\Users\DELL\Desktop\qingruanProject2026\implements\202606271219_home_plan_punch_frontend\plan.md` | 第 2 节全局约束、第 4 节 Task 2 范围 |
| 上一轮详细设计 | 同目录 `detail_v1.md` | 复用范式：分页端点 `PagedBody<T>`、`getErrorMessage`、SweetAlert2 + DOMPurify 净化链、scoped CSS + CSS 变量（无 Tailwind）、内联 style 弹层、`onerror` 占位兜底 |
| 上一轮编码 | 同目录 `code_v1.md` | 复用解包路径约定、store setup-store 写法 |
| 上一轮验证 | 同目录 `verify_v1.md` | 验收门禁口径、S1-S6 静态审查清单口径 |
| 需求分析 | `C:\Users\DELL\Desktop\qingruanProject2026\docs\1_requirements_analysis_v2.md` | 4.5 生活方案（约 267-287 行）；6.5 接口列表（约 836-894 行） |
| 详细设计 | `C:\Users\DELL\Desktop\qingruanProject2026\docs\2_detailed_design_v3.md` | **3.2.13** POST /api/plan/generate（1791 行起）、**3.2.14** PUT /api/plan/adjust（1859 行起，复用旧 health_info）、**3.2.15** GET /api/plan/current（1879 行起，空方案 data:null）、**3.2.16** POST /api/punch（1913 行起）；类型 **3.8.5** 方案类型（2766 行起）、**3.8.6** 打卡类型（2807 行起）；枚举标签 1.8 节（`plan_type`/`punch_type`/`completion_status`）；LifePlan 流程图 4.4.x（3616 行起） |
| 前端原型 | `C:\Users\DELL\Desktop\qingruanProject2026\docs\prototype.html` | LifePlan 模板 619-761 行、mock 178-190 行 |
| 项目现状 | 见下表 | |

### 0.1 项目现状文件（核对后决定改/不改）

| 文件 | 现状 | 处置 |
|---|---|---|
| `src\views\LifePlan.vue` | 骨架占位（`p-8 pt-20 text-center` + 「待组员开发」）| **完整重写** |
| `src\router\index.ts` | `/life-plan` 已存在，`meta: { requiresAuth:true, requiresDisclaimer:true }`；守卫已实现免责声明弹窗 | **不改**（免责声明由守卫处理，组件内不重复弹） |
| `src\types\api.ts` | 已有 `ApiResponse<T>` / `PaginatedResponse<T>` / `PaginationParams` / `PaginationInfo` / `Doctor` / `Article` / `DiabetesType` / `RiskPredictRequest` / `RiskPredictResponse` / `RiskHistoryItem`（Round 1 落地）| **仅增补** Task 2 类型，勿动既有 |
| `src\composables\useApi.ts` | `api`（axios，baseURL `/api`，JWT 拦截器 + 401 处理）| **不改** |
| `src\stores\riskFormStore.ts` | `formData: Partial<RiskPredictRequest>`（含 `age/gender/height/weight/...`），`result: RiskPredictResponse|null` | **只读复用**（预填 health_info），不改 |
| `src\stores\authStore.ts` | `isLoggedIn` / `isAdmin` / `user` | **只读复用**，不改 |
| `src\utils\enumLabels.ts` | 已有 `gender/family_history/diabetes_history/diabetes_type/risk_level`；**缺 `plan_type`/`punch_type`/`completion_status`** | **增补三组枚举映射**（集中在此，勿散落） |
| `src\views\Risk.vue` | Dify blocking 调用范式 + `marked` + `DOMPurify` + `getErrorMessage` + 历史降级 + 重试冷却范式 | **只读参考**，不改 |
| `src\composables\useHomeApi.ts` / `src\stores\homeStore.ts` | Round 1 落地，setup-store + `PagedBody<T>` 范式 | **只读参考**，不改 |

> **禁止改动**：`src\router\index.ts`、`src\App.vue`、`src\composables\useApi.ts`、`src\assets\variables.css`、`src\stores\authStore.ts`、`src\stores\riskFormStore.ts`、`src\stores\homeStore.ts`、`src\views\Risk.vue`、`server/**`、`package.json` / `vite.config.ts` / `tsconfig.app.json`（不引入任何新依赖）。

---

## 1. 关键技术定调（须据实核对，不可臆断）

### 1.1 方案生成接口形态：**普通 POST 返回结构化 JSON（非 SSE 流式）** ✅ 已确认

核对依据：详细设计 v3「3.2.13 POST /api/plan/generate」处理流程第 4 步明确「调用 `life-plan-generator` 工作流，**blocking 模式，超时 15s**」；需求 6.5 节响应为结构化 `{plan_id, items}`；需求 1.6 节「AI 生成加载…使用包含进度提示的加载组件——展示当前阶段描述文本…阶段描述文本**由 Dify 工作流在不同处理阶段通过 SSE 事件推送，或由前端根据 SSE 事件类型推断阶段切换**」——但**plan/generate 走 blocking 模式无 SSE 事件流**（与 chat/assistant/doctor 的 streaming 模式不同，见 v3 §5 Dify 调用模式 5471-5480 行：blocking 用于风险预测/方案生成/文章生成，streaming 用于对话类）。

**结论**：
- `POST /api/plan/generate` 与 `PUT /api/plan/adjust` 走 `useApi.ts` 的 axios `api`（**不是** `useSSE.ts`），返回 `{success, data: PlanResponse, message?}`，取 `res.data.data`。
- 「生成中」阶段描述文本由**前端本地轮播假进度文案**实现（如「正在分析您的健康数据…」「正在生成饮食方案…」「正在生成运动方案…」），**不**等 SSE 事件——因 blocking 模式后端不会推送阶段事件。Designer 须明确：用 `setInterval` 轮换阶段文案 + 不确定进度条动画，超时阈值/兜底文案；生命周期 `onUnmounted` 清理 timer（对齐 Round 1 轮播 timer 范式）。
- 生成超时：axios `useApi.ts` 全局 `timeout: 15000`（15s）与后端 Dify 15s 超时一致；`request` 级可设 `timeout: 20000` 给余量（Designer 决定，防误降级）。超时按错误处理（见 §6 降级）。

> 这是与 `Risk.vue`（也是 blocking Dify 调用）相同形态——直接复用 `api.post` + `getErrorMessage` + 历史降级思路，**无需引入 `useSSE.ts`/`chatStore`**。计划中「LifePlan 方案生成可能用 SSE/流式」的存疑到此收敛为**否**。

### 1.2 方案条目数据结构（核对 3.8.3 `LifePlan`）

后端 `life_plans` 表/响应元素字段（权威）：`id, plan_type: 'diet'|'exercise'|'other', order_num: number, time_desc: string, title: string, content: string`。**注意 `content` 契约为纯文本/可能含 Markdown**（见 §1.4）。

时段映射（需求 4.5 / 3.2.13 注），前端按时段分组渲染：
- 饮食 `order_num`：1=早餐、2=午餐、3=晚餐、4=加餐
- 运动 `order_num`：1=晨间、2=晚间、3=周末

原型 mock 字段（`item.time / item.kcal / item.min / item.icon / item.completed`）**后端不返回**——`kcal`/`min`/`icon`/原型 `completed` 由组件展示层派生或省略，不入 `LifePlan` 类型（对齐 Round 1 `DiabetesTypeView` 范式：展示字段挂组件/store 视图，不污染契约类型）。

### 1.3 方案保存 / 引用打卡的接口与前端落点

- 打卡接口 `POST /api/punch`，请求体 `{plan_id, punch_type, completion_status: 'completed'|'uncompleted', remarks?}`（3.2.16）。
- **plan_id 透传**：`PlanResponse.plan_id`（方案组 ID，同批所有方案项共享）。**注意**：打卡的 `plan_id` 取的是**方案组 ID**而非方案项 `id`（核对 3.2.16 请求体 `plan_id` 与需求 4.5「关联的方案项ID」措辞差异——DDL `punch_in.plan_id` 列对应 `life_plans.plan_id` 组 ID，3.2.16 示例 `plan_id:1` 与 `GET /api/plan/current` 返回的 `plan_id:1` 一致）。Designer 须据 `punch_in` DDL 与 3.2.16 注核准：打卡请求 `plan_id` 字段应填方案组 `plan_id`（= `currentPlan.plan_id`），传该方案项所属组的 ID。
- **打卡类型 `punch_type` 仅 `'diet'|'exercise'`**（不含 'other'，'other' 方案项仅供展示不支持打卡——3.8.6 / 2.5 数据字典 v14 已决）。`other_plans` 项不渲染打卡按钮。
- 打卡确认交互：原型为直接 toggle 本地 `completed`；真实实现须用 **SweetAlert2 弹窗**选「完成/未完成 + 备注」后再 `POST /api/punch`（对齐 v3 LifePlan 流程图 3631-3634 行「SweetAlert2确认弹窗 完成/未完成选择」）。Designer 须定调弹窗交互形态（对齐 Round 1 糖尿病类型弹层内联 style 净化范式，但此处输入是用户备注，输出是 POST——不涉及 AI 富文本，净化仅需对备注做 `escapeHtml` 后入请求体，无需 DOMPurify）。
- 打卡完成态本地缓存：在 `lifePlanStore` 维护按方案项 `id` 的完成标记（`completedItemIds: Set<number>` 或 `Map<number, 'completed'|'uncompleted'>`），uint to Task 3 复用。1s 内按钮状态更新（乐观更新 + 失败回滚）。

### 1.4 方案正文 Markdown 渲染需求 ✅ 需 marked + DOMPurify

核对：需求 6.5 / 3.2.13 示例 `content` 为纯文本（`"燕麦50g，加水煮粥..."`），但需求 4.6 节「文章正文以 Markdown 格式存储…前端渲染时使用 marked 解析」属同源 Dify LLM 输出习惯；`Risk.vue` 已对风险建议 `advice`（同为 Dify LLM 输出）用 `marked.parse` + `DOMPurify.sanitize` 渲染。

**定调**：方案条目 `content` 按 **Markdown 处理**（防御性，若后端纯文本 marked 也能渲染），渲染链 `marked.parse(content)` → `DOMPurify.sanitize(html)` → `v-html`。**禁止**直接 `v-html` 未净化字符串（全局约束第 23 条）。复用 `Risk.vue` 第 6-7 行 / 73 行 `marked` + `DOMPurify` 范式。`marked` 与 `dompurify` 均已在 `package.json` 依赖中，**不引入新依赖**。

### 1.5 路由参数预填（核对 v3 §4.8.4 流程图 418 行 + 通用 §3 模块数据传递）

进入 `/life-plan` 可有两种来源：
1. 从风险预测页跳转：方案生成 `health_info` 优先**复用 `riskFormStore.formData`**（含 `age/gender/height/weight`，已持久化 sessionStorage）+ `riskFormStore.result`。Designer 须明确 `health_info` 字段映射：`age/gender/height/weight` 从 `riskFormStore.formData` 取（缺则表单可手动填），`gender` 为 `'male'|'female'` 英文枚举（对齐。
2. 路由 query 预填：`/life-plan?riskLevel=high&diabetesType=2型` 读取方式——但本任务 `/life-plan` 路由表禁止改，且**不臆造 query 解析**——若需 query 预填展示提示条，可读 `route.query.riskLevel` 作展示文案；`health_info` 仍以 `riskFormStore.formData` 为主，query 仅作 UI 提示。Designer 须标注此为 §8 未决（若风险页实际跳转带 query 则解析，否则省略）。

> 关键约束：**未经风险预测也能直接生成方案**（需求 4.5「方案为空时…提示用户先完成风险预测或**直接生成方案**」）。表单须支持手动填 `health_info`（age/gender/height/weight），`riskFormStore.formData` 仅作预填兜底，缺字段不阻断生成。

---

## 2. 任务范围（LifePlan 前端完整实现）

1. **无方案引导态**（`fetchCurrent()` 返回 `data:null`）：卡片 + 「立即定制方案」CTA → 切到生成表单。
2. **生成表单态**：身体信息（age/gender/height/weight，优先从 `riskFormStore.formData` 预填）+ 偏好（`preferences.dietary` / `preferences.activity`，原型为「生活习惯多选 + 方案建议 textarea」——**须把原型 UI 输入映射到契约 `preferences.dietary/activity` 两字符串字段**，Designer 定调映射方式，如 ` dietary = selectedHabits.join('；') + '；' + advice`）。顶部「重新定制」按钮可随时切回表单。
3. **生成中态**：调用 `POST /api/plan/generate`，本地轮播阶段文案 + 不确定进度条 + 按钮防重复点击（`generating` 锁，对齐 v3 §3.2.13 30s 幂等性 + 按钮 loading 防双击）。409 CONFLICT 提示「请求过于频繁，请稍后再试」。
4. **方案展示态**：统计卡（饮食 x/total、运动 x/total、今日进度 %，对齐原型 `gradient-text`）+ 饮食分组卡片 + 运动分组卡片 + 其他分组（若有 `other_plans` 则展示但**不渲染打卡按钮**）。`order_num` 升序，按时段映射标签渲染。
5. **方案调整**：`PUT /api/plan/adjust`（body `{plan_id, feedback}`，`plan_id` 取当前方案组），成功后用新方案替换本地 `currentPlan`（旧方案后端已逻辑过期，前端无需额外清理）。
6. **打卡**：每条 diet/exercise 项旁打卡按钮 → SweetAlert2 弹窗选「完成/未完成 + 备注」→ `POST /api/punch`（`plan_id` = 方案组 ID，`punch_type` = 该项 `plan_type`）→ 1s 内按钮状态更新（乐观更新）。'other' 项不打卡。
7. **AI 免责提示条**：方案展示态底部**恒显**固定免责条（「AI 生成内容仅供参考，不能替代专业医疗诊断…」），route 守卫已弹免责声明（`requiresDisclaimer`），组件内**不重复弹**免责。
8. **降级**：生成失败/超时 → 检查是否有最近方案缓存（`currentPlan`），有则历史降级提示条 + 渲染缓存方案（对齐 Risk.vue `isHistoryFallback` 范式）；无则错误态 + 重试。`fetchCurrent` 失败→错误态重试。

---

## 3. 子任务拆分

### 3.1 types 子任务（在 `src/types/api.ts` 仅增补，勿动既有）

- `PlanType = 'diet' | 'exercise' | 'other'`
- `LifePlan`（id: number; plan_type: PlanType; order_num: number; time_desc: string; title: string; content: string）— 对齐 3.8.3，字段名 `order_num`/`time_desc`（勿用 `order`/`time` 别名）。
- `PlanGenerateRequest`（health_info: { age: number; gender: 'male'|'female'; height: number; weight: number }; preferences: { dietary: string; activity: string }）— 对齐 3.8.5。**gender 用精确联合 `'male'|'female'`**（非 PlanGenerateRequest 原文 `string`，对齐全局禁 any + 精确枚举）。
- `PlanAdjustRequest`（plan_id: number; feedback: string）
- `PlanResponse`（plan_id: number; diet_plans: LifePlan[]; exercise_plans: LifePlan[]; other_plans: LifePlan[]）
- `PlanCurrentResponse = PlanResponse & { generated_at: string }`
- **打卡类型前置落地（供 Task 3 复用，本轮 Task 2 打卡也用）**：
  - `PunchType = 'diet' | 'exercise'`（不含 'other'）
  - `CompletionStatus = 'completed' | 'uncompleted'`
  - `PunchCreateRequest`（plan_id: number; punch_type: PunchType; completion_status: CompletionStatus; remarks?: string）
  - `PunchCreateResponse`（id: number; plan_id: number; punch_type: PunchType; completion_status: CompletionStatus; remarks: string; punch_time: string）
  - `PunchListParams extends PaginationParams`（startDate?: string; endDate?: string; punch_type?: PunchType）
  - `PunchRecord`（id: number; plan_id: number | null; plan_title?: string; punch_type: PunchType; completion_status: CompletionStatus; remarks: string; punch_time: string）

> 与 Task 3 共享 `PunchType`/`CompletionStatus`/`PunchCreateRequest`/`PunchCreateResponse`/`PunchRecord`/`PunchListParams`——按 plan.md §5「共享类型集中在 `types/api.ts`，先做的一方落地」约定，**Task 2 落地打卡相关类型**，Task 3 直接 import 复用。`PunchAnalysis`、`punchStore`/`usePunchApi` 留 Task 3。

### 3.2 枚举标签子任务（在 `src/utils/enumLabels.ts` 仅增补，勿动既有 LABELS）

- `plan_type: { diet: '饮食', exercise: '运动', other: '其他' }`
- `punch_type: { diet: '饮食', exercise: '运动' }`
- `completion_status: { completed: '已完成', uncompleted: '未完成' }`

### 3.3 store 子任务（新增 `src/stores/lifePlanStore.ts`，setup-store）

参照 `homeStore.ts` / `authStore.ts` 写法。state / action：
- state：`currentPlan: Ref<PlanCurrentResponse|null>`、`generating: Ref<boolean>`、`loading: Ref<boolean>`、`error: Ref<Error|null>`、`adjustError: Ref<Error|null>`、`isHistoryFallback: Ref<boolean>`；打卡完成态本地缓存 `completedMap: Ref<Map<number, CompletionStatus>>`（按方案项 `LifePlan.id` 索引，供按钮态与 Task 3 复用）。
- `fetchCurrent()`：`GET /api/plan/current`，**空方案 data:null** 处理（`currentPlan=null` 不算错误）；失败回填 `error`。
- `generate(req: PlanGenerateRequest)`：`POST /api/plan/generate`，成功写 `currentPlan`（注意响应无 `generated_at`，须补或置空——Designer 据实敲定）；409 单独提示文案。
- `adjust(req: PlanAdjustRequest)`：`PUT /api/plan/adjust`，成功替换 `currentPlan`。
- `createPunch(req: PunchCreateRequest)`：`POST /api/punch`，**乐观更新** `completedMap`（先置目标态，失败回滚），返回响应供组件 toast。**注意**：打卡请求 `plan_id` 用方案组 `currentPlan.plan_id`（见 §1.3）。
- 重试 action：`retryGenerate`/`retryFetchCurrent`。
- 禁 `any`、禁读 `localStorage.token`（JWT 走拦截器）；打卡备注须 `escapeHtml`? — 备注作为请求体字符串发送，后端存储，前端无需净化请求体（净化仅针对渲染到 DOM 的 AI 输出）。

> **store 是否落地打卡 `createPunch`**：plan.md §3.2 原建议「打卡留 Task 3」，但需求/原型打卡发生在 LifePlan 页内（每条方案项旁打卡按钮），且 Designer 流程图打卡在 LifePlan 页。**定调**：`createPunch` 落在 `useLifePlanApi` + `lifePlanStore`（LifePlan 页打卡直接用），Task 3 仅做**列表/统计/分析**复用 `PunchType` 等类型，不改 Task 2 的 `createPunch`。Designer 须在 detail 中明确此分工边界。

### 3.4 api 子任务（新增 `src/composables/useLifePlanApi.ts`）

封装三个 plan 端点 + `createPunch`，全部走 `api`（axios），禁 `any`，泛型精准解包：
- `getCurrentPlan()` → `api.get<ApiResponse<PlanCurrentResponse|null>>('/plan/current')` → 返回 `res.data.data`（可为 null）。
- `generatePlan(req)` → `api.post<ApiResponse<PlanResponse>>('/plan/generate', req)` → 返回 `res.data.data`。
- `adjustPlan(req)` → `api.put<ApiResponse<PlanResponse>>('/plan/adjust', req)` → 返回 `res.data.data`。
- `createPunch(req)` → `api.post<ApiResponse<PunchCreateResponse>>('/punch', req)` → 返回 `res.data.data`（HTTP 201，axios 仍走 `res.data`）。
- 参照 `useHomeApi.ts` 的内联 body 泛型 + `api` import 范式；`generatePlan` 可设 `timeout: 20000` 防 15s 边界误降级（Designer 决定）。

> **不新建** `usePunchApi.ts`（打卡只 create 用的部分内联 `useLifePlanApi`；Task 3 的 list/analysis 再建 `usePunchApi.ts`）。Designer 须在 detail 明确边界。

### 3.5 视图子任务（完整重写 `src/views/LifePlan.vue`，`<script setup lang="ts">`）

四态切换：无方案引导态 / 生成表单态 / 生成中态 / 方案展示态。「重新定制」按钮随时切回生成表单态。onMounted 调 `lifePlanStore.fetchCurrent()`。
- 方案正文用 `marked.parse + DOMPurify.sanitize` 渲染（复用 Risk.vue 范式），`v-html` 净化后输出。
- 统计卡 `gradient-text` 复刻原型。
- 饮食/运动/其他分组按 `order_num` 升序，时段映射标签（早餐/午餐/晚餐/加餐/晨间/晚间/周末）。
- 打卡按钮：SweetAlert2 弹窗（完成/未完成 + 备注 textarea）→ `createPunch` → 乐观更新按钮态。
- AI 免责提示条恒显底部。
- 子组件全部内联（对齐 Round 1 决策），不抽 `src/components/life-plan/`。

### 3.6 样式子任务（scoped CSS + CSS 变量，**无 Tailwind**）

复刻原型 LifePlan 619-761 视觉（header 渐变圆角、`gradient-text` 统计、卡片、`wand-magic-sparkles` 生成按钮、`press` 按压、avatar + BMI 信息条、习惯多选 chip、textarea）。**全部 scoped 自定义语义类** + `src/assets/variables.css` 变量，对齐 Round 1 `detail_v1.md` §7 范式（项目未装 Tailwind，已由 Round 1 §C2 证实）。移动端 375px 无横向滚动，`max-width: 480px; margin: 0 auto;`，`padding-bottom: calc(var(--tab-bar-height) + 8px)`。

---

## 4. 新增 / 修改文件清单

**新增**：
- `src/stores/lifePlanStore.ts`
- `src/composables/useLifePlanApi.ts`

**修改（仅增补 / 重写，勿动既有内容）**：
- `src/types/api.ts`：增补 §3.1 全部类型（`LifePlan`/`PlanType`/`PlanGenerateRequest`/`PlanAdjustRequest`/`PlanResponse`/`PlanCurrentResponse`/`PunchType`/`CompletionStatus`/`PunchCreateRequest`/`PunchCreateResponse`/`PunchListParams`/`PunchRecord`）。
- `src/utils/enumLabels.ts`：增补 `plan_type` / `punch_type` / `completion_status` 三组映射。
- `src/views/LifePlan.vue`：完整重写。

**不改**：`router/index.ts`（路由已有 `/life-plan` + 守卫免责）、`App.vue`、`composables/useApi.ts`、`stores/authStore.ts`、`stores/riskFormStore.ts`、`stores/homeStore.ts`、`composables/useHomeApi.ts`、`views/Risk.vue`、`server/**`、`assets/variables.css`、`package.json` / `vite.config.ts` / `tsconfig.app.json`（**不引入新依赖**，`marked` / `dompurify` / `sweetalert2` 均已存在）。

---

## 5. 技术约束（适用本轮）

- Vue 3.5 `<script setup lang="ts">` + Composition API；TS strict，禁 `any`（边界 `unknown` + 收窄或显式 `as` + 注释）。
- HTTP 仅走 `useApi.ts` 的 `api`（baseURL `/api`，JWT 拦截器），组件/store 不读 token、不拼 URL、无硬编码 host。
- 富文本：方案 `content` 经 `marked.parse` → `DOMPurify.sanitize` → `v-html`；禁止未净化 `v-html`。
- 弹窗/Toast：`sweetalert2`（`await import('sweetalert2')` 或顶层 import，与 `router/index.ts` / Round 1 风格一致）。
- 打卡备注：请求体字符串，不净化（净化仅针对渲染 DOM 的 AI 输出）。
- 枚举标签集中 `enumLabels.ts`，新枚举（`plan_type`/`punch_type`/`completion_status`）在此增补。
- 样式 scoped CSS + CSS 变量，**无 Tailwind**（Round 1 已证项目未装 Tailwind）。
- 路由 `/life-plan` + requiresDisclaimer 守卫已实现，组件内**不重复弹**免责；仅底部固定 AI 免责提示条。
- 不改路由表 / App.vue / server。
- 复用 Round 1 范式：`getErrorMessage`（Risk.vue 219 行）、`onerror` 占位兜底、内联 style 弹层、`onUnmounted` 清理 timer。

---

## 6. 降级 / 空态 / 加载态 / 错误态

| 场景 | 表现 |
|---|---|
| `fetchCurrent` 返回 data:null | 无方案引导态（CTA 定制方案）|
| `fetchCurrent` 失败 | 错误态 + 重试 `retryFetchCurrent` |
| 生成中 | 阶段文案轮播 + 不定进度条 + 按钮 disabled（防双击）；`generating` 锁 |
| 生成成功 | 切方案展示态 + toast「方案已生成」|
| 生成 409 CONFLICT | toast「请求过于频繁，请稍后再试」，按钮恢复 |
| 生成失败/超时且有缓存 `currentPlan` | 历史降级提示条 + 渲染缓存方案（对齐 Risk.vue `isHistoryFallback`）|
| 生成失败/超时无缓存 | 错误态 + 重试 `retryGenerate` |
| 调整失败 | toast 错误 + 保留原方案，不替换 |
| 打卡失败 | 乐观更新回滚 + toast 错误，1s 内反馈 |
| `other_plans` 非空 | 展示卡片但**无打卡按钮** |

---

## 7. 验收标准（本轮 + 对齐 plan.md Task 2）

- 无方案 → 生成（含 409/失败/超时降级）→ 展示 → 调整 全流程可达；方案至少含 4 饮食 + 3 运动项按时段分组渲染（mock/真实数据均可验证渲染路径）。
- 生成阶段文案轮播 + 按钮 loading 防双击（普通 POST，非 SSE）。
- 打卡 SweetAlert2 确认 → `POST /api/punch`，1s 内按钮态更新，`plan_id` 透传方案组 ID。
- 方案正文 `marked + DOMPurify` 净化后 `v-html`，无未净化 `v-html`。
- AI 免责提示条恒显；组件内不重复弹免责。
- `npx vue-tsc --noEmit -p tsconfig.app.json` **零错误**；不新增 `any`；不引入新依赖；不改路由表/App/server/`useApi.ts`/`riskFormStore.ts`。
- S1-S6 静态审查（对齐 verify_v1 口径）：S1 新增文件无 `any`；S2 `LifePlan.vue` 所有 `v-html` 均经 DOMPurify；S3 无硬编码后端 URL；S4 变更集仅目标文件（不动 router/App/useApi/riskFormStore/homeStore/Risk.vue/variables.css/package.json/vite.config.ts/server）；S5 无新依赖；S6 不双重净化（marked 输出整体 DOMPurify 一次）。
- 移动端 375px 无横向滚动，视觉贴合 prototype.html LifePlan 模板。

---

## 8. 未决问题清单（交 Designer 在 `detail_v2.md` §未决中收敛或留 Coder 兼容）

| # | 未决点 | 影响范围 | 倾向结论 / 兼容 |
|---|---|---|---|
| 1 | 打卡请求 `plan_id` 应填**方案组 ID**（`currentPlan.plan_id`）还是方案项 `LifePlan.id`？ | `createPunch` 入参构造、打卡可追溯性 | 据 3.2.16 请求体示例 + `punch_in.plan_id` DDL 关联 `life_plans.plan_id`，**倾向方案组 ID**。Designer 须据 2.5 `punch_in` 数据字典 + 3.2.16 注最终敲定。 |
| 2 | 原型「生活习惯多选 + advice textarea」如何映射为契约 `preferences.dietary(activity)` 两个字符串字段？ | 生成表单→请求体映射 | 倾向：`dietary = selectedHabits.join('；') + (advice ? '；' + advice : '')`，或拆 dietary/activity 两个独立 textarea。Designer 据原型 UI 决定并标注。 |
| 3 | `POST /api/plan/generate` 响应是否含 `generated_at`？ | `generate()` 写 `currentPlan` 字段补全 | 3.2.13 响应示例**无** `generated_at`，3.2.15 `GET /current` 有。倾向：`generate` 写入时 `generated_at` 置 `new Date().toISOString()` 或留空字符串，类型上 `PlanResponse` 不含 `generated_at`（已与 `PlanCurrentResponse` 分离）。 |
| 4 | 从风险页跳 `/life-plan` 是否带 query（`?riskLevel=&diabetesType=`）？ | 路由参数预填提示 | v3 §4.8.4 流程图提到 query 读取，但路由表禁止改。建议：尝试读 `route.query.riskLevel` 作展示提示条；`health_info` 仍主取 `riskFormStore.formData`。若风险页实际不带 query 则省略提示条。 |
| 5 | `health_info.gender` 类型用 `'male'\|'female'` 精确联合还是契约原文 `string`？ | `PlanGenerateRequest` 类型 | **倾向精确联合**（全局禁 any + 对齐，Designer 敲定。 |
| 6 | 「生成中」阶段文案轮播 timer 间隔与超时阈值？ | 生成中态 UX | 倾向 `setInterval` 1.5-2s 轮换 3-4 条文案；axios `timeout` 20000（给 15s Dify 余量）；超时走降级。 |
| 7 | `useSSE.ts`/`chatStore` 是否需引入？ | store/api 设计 | **否**（plan/generate blocking 非 SSE），本任务不引入 SSE 链路。 |
| 8 | 打卡 SweetAlert2 弹窗交互具体形态（单弹 + 备注 textarea + 完成/未完成两按钮）？ | 打卡 UX | 照 Round 1 内联 style 弹层范式，但输入是用户备注（非 AI 渲染），仅 `escapeHtml` 不需 DOMPurify。Designer 定调。 |

---

## 9. 对 Designer 的 `detail_v2.md` 要点提示

Designer 须在 `detail_v2.md` 至少覆盖：
1. **§类型清单**：逐字段给出 §3.1 所有类型（含打卡前置类型）的 TS 定义与字段来源注释（对齐 detail_v1 §1 颗粒度）。
2. **§lifePlanStore 完整签名**：state/action 代码骨架（对齐 detail_v1 §2 颗粒度），含 `completedMap` 乐观更新/回滚、409 处理、空方案 data:null 处理、`createPunch` 边界。
3. **§useLifePlanApi**：四个函数解包路径（标注分页与否、`data:null` 可能性），内联 body 泛型，`generatePlan` timeout。
4. **§LifePlan.vue 组件结构**：四态切换逻辑、阶段文案轮播 timer 生命周期、`marked+DOMPurify` 渲染链、SweetAlert2 打卡弹窗交互、`route.query` 预填、子组件内联决策。
5. **§样式**：scoped CSS 关键类与 CSS 变量映射（对齐 detail_v1 §7 颗粒度，复刻原型 619-761）。
6. **§降级矩阵**：§6 各场景代码路径。
7. **§未决**：§8 各项的最终结论或明确容错。
8. **§文件清单**：§4 落地。
9. **§验收映射**：对 Verifier 列出 §7 验收项的代码证据点。

---

本任务文件交接 Designer 产出 `detail_v2.md`。