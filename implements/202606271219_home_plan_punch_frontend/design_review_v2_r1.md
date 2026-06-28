# design_review_v2_r1 — Design Reviewer 第 2 轮审查意见

> 审查对象：`implements/202606271219_home_plan_punch_frontend/detail_v2.md`
> 审查依据：`task_v2.md` 9 节要点、`docs/2_detailed_design_v3.md`（§2.2 DDL、§2.5 数据字典、§3.2.13-3.2.17、§3.8.3-3.8.6、§1.8 枚举、§4.4 LifePlan 流程图）、`docs/prototype.html`（LifePlan 619-761、mock 178-188）、复用范式文件（`Risk.vue`/`homeStore.ts`/`useHomeApi.ts`/`types/api.ts`/`enumLabels.ts`/`riskFormStore.ts`/`router/index.ts`/`useApi.ts`/`variables.css`/`tsconfig.app.json`/`package.json`）
> 决议：**REJECTED**（含 1 严重 + 2 一般 + 若干轻微，须 Designer 修订后复审）

---

## 严重问题（阻断落地）

### S1. 打卡 `plan_id` 语义结论错误——应填**方案项 ID（`LifePlan.id`）**而非方案组 ID

**位置**：`detail_v2.md` §0 未决 #1（第 14 行）、§4.2 `createPunchAction` 注释、§5.1 `handlePunch`（第 652 行 `plan_id: store.currentPlan.plan_id`）。

**问题**：设计把打卡请求 `plan_id` 收敛为**方案组 ID（`currentPlan.plan_id`）**，理由是「§3.2.16 请求体示例 `plan_id:1` 与 `GET /api/plan/current` 返回 `plan_id:1` 同值」+「DDL 列名 `plan_item_id` 与 API 字段 `plan_id` 命名偏离属后端映射职责」。该结论与 v3 权威证据直接冲突：

1. **§2.5 数据字典（v3 第 1296 行）明确**：`punch_in.plan_item_id` = "关联 life_plans 的**方案项ID**"，且 v15 修订注明「`plan_item_id` 在 `POST /api/punch` 接口层为必填」——即 `POST /api/punch` 请求体字段 `plan_id` 在 Express `punch.js` 中写入 DDL 列 `plan_item_id`，存的是**方案项 ID（`life_plans.id`）**，非方案组 ID。
2. **§3.2.17 列表查询 SQL（v3 第 1972-1981 行）**：`LEFT JOIN life_plans l ON p.plan_id = l.id`——`l.id` 是 `life_plans` 主键（方案项 ID），证明 `punch_in` 存的值按**方案项 ID** 关联。
3. **§3.2.17 响应示例**：`{ "plan_id": 1, "plan_title": "燕麦粥 + 水煮蛋", "punch_type": "diet" }`——`plan_title`「燕麦粥 + 水煮蛋」正是 `GET /api/plan/current` 中 `id=1` 的**饮食早餐方案项**标题（§3.2.13 示例 `id:1, plan_type:diet, title:"燕麦粥 + 水煮蛋 + 凉拌黄瓜"`）。若 `plan_id` 是方案组 ID（值也为 1），JOIN `life_plans.id=1` 恰好命中早餐项是**巧合**（方案组 plan_id=1 与首项 id=1 同值），并非语义证据；而 §2.5 字典 + §3.2.17 JOIN 两条独立证据一致指向**方案项 ID**。

**设计内部自相矛盾**：§0 #1 既已承认「DDL 列名 `plan_item_id`（FK→`life_plans.id`）」（即 FK 指向方案项主键 = 方案项 ID），却得出「语义对齐方案组 ID」的结论——FK 目标是方案项 ID，结论却是方案组 ID，二者无法并存。

**后果**：若按设计落地 `plan_id = currentPlan.plan_id`（方案组），`punch_in.plan_item_id` 将存方案组 ID；§3.2.17 的 `LEFT JOIN life_plans l ON p.plan_id = l.id` 会拿方案组 ID 去匹配 `life_plans.id`（方案项主键），多数情况匹配失败 → Task 3 打卡列表 `plan_title` 为 NULL，打卡与方案项标题关联断裂，且依从性分析（`punch-analysis` 工作流 `plan_item_id` 入参）失真。

**修复要求**：
- `handlePunch` 请求体改为 `plan_id: item.id`（方案项 `LifePlan.id`），删除 `currentPlan.plan_id` 透传。
- `createPunchAction(req, itemId)` 中 `req.plan_id` 即 `itemId`（二者同值），可简化签名或在注释中显式标注「`plan_id` = 方案项 ID = `completedMap` 索引键」。
- §0 #1 结论改写为：**方案项 ID（`LifePlan.id`）**，依据 §2.5 字典 `plan_item_id`=方案项ID + §3.2.17 SQL `p.plan_id = l.id` + §3.2.17 示例 plan_title 匹配 id=1 早餐项；并指出「§3.2.16 示例 `plan_id:1` 与 `GET /current plan_id:1` 同值属方案组 plan_id 与首项 id 巧合重合，不可作为语义证据」。
- `task_v2.md` §1.3/§8#1「倾向方案组 ID」的前提「`punch_in.plan_id` DDL 关联 `life_plans.plan_id`」与实际 DDL（`plan_item_id`→`life_plans.id`）不符，Designer 须在 detail 中显式勘误此前提。

> 说明：v3 文档自身存在 DDL 列名 `plan_item_id`（§2.2/§2.5）与 §3.2.17 SQL 引用 `p.plan_id` 的命名不一致（应为 `p.plan_item_id`），属后端文档瑕疵；但「存的是方案项 ID」这一语义由 §2.5 字典文字 + §3.2.17 JOIN + 示例三重佐证，前端契约应据此取方案项 ID。若后端实际按方案组 ID 存储，须由后端确认并修订 v3 §2.5/§3.2.17，否则前端按方案项 ID 落地。

---

## 一般问题（须修订，不单独阻断但本轮一并修）

### G1. `riskForm.formData` 预填未触发 `loadFromStorage()`，直接加载/刷新时预填失效

**位置**：§5.1 `prefillFromRiskForm()`（第 460-466 行）、`onMounted`（第 684-690 行）。

**问题**：`riskFormStore.formData` 初值为 `{}`，仅在 `loadFromStorage()` 被调用后才从 sessionStorage 水合（见 `riskFormStore.ts` 第 14、45-71 行）。`Risk.vue` 在 `onMounted`→`restoreForm()` 中调 `store.loadFromStorage()`；而 `LifePlan.vue` 的 `onMounted` 只调 `prefillFromRiskForm()` + `store.fetchCurrent()`，**未调 `riskForm.loadFromStorage()`**。当用户从风险页跳转后**刷新 `/life-plan`**（Pinia state 重置为 `{}`，sessionStorage 仍有数据），`prefillFromRiskForm` 读到空 `formData`，age/gender/height/weight 全部不预填，违反 `task_v2.md` §1.5「复用 `riskFormStore.formData`（已持久化 sessionStorage）」的兜底意图。

**修复要求**：`onMounted` 中先 `riskForm.loadFromStorage()`（返回值可忽略，仅触发水合）再 `prefillFromRiskForm()`；或在 `prefillFromRiskForm` 内部先 `riskForm.loadFromStorage()`。须注意 `loadFromStorage` 已有 try/catch 与类型收窄，安全可调。

### G2. 错误态模板固定读 `store.error`，生成失败（无缓存）时丢失真实错误文案

**位置**：§5.2 错误态模板（第 889-892 行 `getErrorMessage(store.error, '方案加载失败')`）、§5.1 `handleGenerate`（第 604-606 行 `viewMode='error'`）。

**问题**：错误态视图同时服务两种失败来源——`onMounted` 的 `fetchCurrent` 失败（`store.error` 有值）与 `handleGenerate` 无缓存生成失败（`store.generateError` 有值、`store.error` 为 null）。模板硬编码 `getErrorMessage(store.error, ...)`，生成失败时 `store.error=null` → `getErrorMessage(null, '方案加载失败')` 走兜底分支返回「方案加载失败」，**真实的 `store.generateError`（如「方案生成失败」/超时/网络）被丢弃**，用户看不到失败原因。

**修复要求**：错误态文案改为据来源区分，例如引入 `const errorRef = computed(() => store.generateError ?? store.error)`，模板用 `getErrorMessage(errorRef, '方案加载失败')`；或错误态分两个 viewMode（`'error-fetch'`/`'error-generate'`）。须保证生成失败显示 `store.generateError`、拉取失败显示 `store.error`。

---

## 轻微问题（建议修订，不阻断）

### L1. 打卡备注 `escapeHtml` 与 `task_v2.md` §3.3 结论不一致

`task_v2.md` §3.3 明确「备注作为请求体字符串发送，后端存储，**前端无需净化请求体**」；§8#8 又说「仅 `escapeHtml` 不需 DOMPurify」。设计 §0 #8/§5.1 对备注做 `escapeHtml` 后入请求体。`escapeHtml` 后存储的备注在 Task 3 `Punch.vue` 列表直接渲染 `remarks` 时会出现 `&lt;`/`&amp;` 等转义字符（除非 Task 3 再反转义）。建议：备注**不 `escapeHtml`**，原样入请求体（对齐 §3.3 主结论「无需净化请求体」）；DOMPurify 仅用于渲染 DOM 的 AI 输出（方案 `content`），已在 `safeContentHtml` 落实。

### L2. `enumLabel`、`PlanType` 导入未使用

§5.1 import 了 `enumLabel` 与 `PlanType`，但 `slotLabel`/`itemIcon` 用硬编码 `DIET_SLOT`/`SPORT_SLOT`/`DIET_ICON`/`SPORT_ICON` 派生，分组标题「饮食管理/运动建议/其他建议」也硬编码，未调用 `enumLabel('plan_type', ...)`。`tsconfig.app.json` `noUnusedLocals:false` 不报错，但属死导入。建议：要么移除未用 import，要么在分组标题/类型展示处实际使用 `enumLabel('plan_type', item.plan_type)`（对齐 v3 §1.8.3「LifePlan.vue 调 `enumLabel('plan_type', plan.plan_type)` 显示饮食」）。

### L3. 组件直接写 `store.isHistoryFallback = true` 越过 store 封装

§5.1 `handleGenerate` 第 601 行 `store.isHistoryFallback = true` 直接改 store state。Pinia setup-store 暴露的 ref 可写，运行无碍，但历史降级标记的判定逻辑（「失败 + 有缓存」）应由 store `generate()` 内部据 `currentPlan` 是否存在自行置位，组件只读 `store.isHistoryFallback`，避免状态归属混乱。建议把 `isHistoryFallback` 置位逻辑移入 `generate()` catch 分支。

### L4. `toggleHabit`/`computedBmi`/`retryFetch` 在模板引用但 script 骨架未定义

§5.2 模板用 `toggleHabit(h)`、`computedBmi`、`retryFetch`，§5.1 script 骨架未给出实现，仅 §5.2 末尾注释「须在 script 中补全」。详细设计颗粒度可接受，但建议在 §5.1 骨架中至少给出三者的签名/实现要点（`toggleHabit` 仿原型 735-738 行 splice；`computedBmi` 由 `form.height`/`form.weight` 派生 `weight/(height/100)^2` 保留 1 位、未填显 `-`；`retryFetch` 调 `store.retryFetchCurrent()` 后据 `store.error`/`currentPlan` 重判 viewMode），降低 Coder 实现歧义。

### L5. 初始 `fetchCurrent` 期间无加载态，闪现「无方案引导态」

`onMounted` 时 `viewMode` 初值 `'empty'`，`fetchCurrent` 异步未返回期间模板渲染「还没有专属方案」引导态，请求返回后才切 `display`/`error`，存在短暂空态闪烁。`store.loading` 已存在但模板未消费。建议：`viewMode` 增加 `'loading'` 初态，或 `onMounted` 在 `fetchCurrent` 前置 `viewMode='loading'`（复用生成中态的 spinner 或简单骨架），返回后切换。

---

## 已核对通过项（确认无问题）

- **类型严格**：§1 全部类型显式联合、可空标注清晰（`PunchRecord.plan_id: number|null` 对齐 §3.8.3、`plan_title?` 可空），无 `any`；`PlanGenerateRequest.health_info.gender` 收紧为 `'male'|'female'`（对齐 `RiskPredictRequest.gender` 与 §1.8.2）。
- **打卡类型前置落地**：`PunchType='diet'|'exercise'`（不含 `other`，对齐 §2.2 DDL CHECK + §3.8.6）、`CompletionStatus='completed'|'uncompleted'`、`PunchCreateRequest/Response/PunchListParams/PunchRecord` 字段对齐 §3.8.6/§3.8.3。`other_plans` 项不渲染打卡按钮（§5.2 第 853-871 行）。
- **方案生成 blocking 非 SSE**：§3 `useLifePlanApi` 全走 `api`（axios），`generatePlan` 请求级 `timeout:20000`，未引入 `useSSE`/`chatStore`，对齐 §3.2.13 step4「blocking 模式 超时 15s」。
- **Markdown 净化**：`safeContentHtml` = `marked.parse`→`DOMPurify.sanitize` 一次→`v-html`，复用 `Risk.vue:69-74` 范式，S6 不双重净化；唯一 `v-html` 来源。
- **enumLabels 增补**：`plan_type`/`punch_type`/`completion_status` 三组对齐 v3 §1.8.1 LABELS（第 651-654 行），仅追加不动既有，`enumLabel()` 不改。
- **store/api 范式**：`lifePlanStore` setup-store 对齐 `homeStore.ts`；`useLifePlanApi` axios 内联 body 泛型解包对齐 `useHomeApi.ts`；无硬编码 URL；不读 `localStorage.token`（JWT 走拦截器）。
- **不重复弹免责**：组件内无免责弹窗代码，依赖 `router/index.ts` `requiresDisclaimer` 守卫（第 116-125 行已实现）；底部 `.lp-disclaimer` 恒显（§5.2 第 883-885 行）。
- **scoped CSS 无 Tailwind**：§5.3 全 scoped 语义类 + `variables.css` 变量；`--color-warning`(#FAAD14)/`--color-primary-light`/`--color-primary-dark`/`--color-accent` 等均已核对存在；`--radius-2xl` 不存在，设计已显式标注 fallback 硬编码 24px（第 1016 行），合规。`.lp-fallback-hint` 硬编码 `#FFF7E6` 与 `Risk.vue:517` 范式一致。
- **不改约束文件**：§7 文件清单与 `task_v2.md` §4 一致，不改 router/App/useApi/riskFormStore/homeStore/Risk.vue/variables.css/package.json/vite.config.ts/server；依赖 `marked`/`dompurify`/`sweetalert2` 均已在 `package.json`（已核对）。
- **SweetAlert2 打卡弹窗**：`input:'textarea'` + `showDenyButton` + `showCancelButton` 组合可行；`isDismissed`→取消返回、`isConfirmed`→completed、`isDenied`→uncompleted 的分支逻辑正确；`onUnmounted(stopStageTimer)` 清理 1800ms 轮播 timer 对齐 `Risk.vue:113-116`。
- **未决收敛**：§0 表覆盖 `task_v2.md` §8 全部 8 项并给结论（除 #1 结论错误见 S1，#2/#3/#4/#5/#6/#7/#8 结论合理）。
- **降级矩阵**：§6 各场景代码路径与 `task_v2.md` §6 对齐（409/失败+缓存/失败无缓存/调整失败/打卡失败/打卡 409 幂等）。

---

## 修复后须复审的要点

1. S1：打卡 `plan_id` 改为 `item.id`（方案项 ID），§0 #1 结论改写并勘误 `task_v2.md` §1.3/§8#1 前提。
2. G1：`onMounted`/`prefillFromRiskForm` 先调 `riskForm.loadFromStorage()`。
3. G2：错误态文案据 `store.generateError ?? store.error` 区分来源。
4. L1-L5：按建议修订（L1 备注 escapeHtml、L2 死导入、L3 store 封装、L4 补全三函数、L5 初始加载态）。

> 修订后请 Designer 重出 `detail_v2.md`（或在原文标注修订点），交 Design Reviewer 第 2 轮 r2 复审。
