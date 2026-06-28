# code_v3 — 打卡记录与分析 Punch 实现（Task 3）

> 分支：`202606271219_home_plan_punch_frontend`（禁止切分支）
> 产出方：Coder（严格据 `detail_v3.md` r1 修订版实现，未偏离设计）
> 验收映射：见 `detail_v3.md` 第 8 节

---

## 1. 实现清单（新建 / 修改的文件及关键改动）

### 1.1 修改：`src/types/api.ts`（仅增补，勿动既有）

在 `PunchRecord` 之后**增补** `PunchAnalysisResponse` 接口（7 个字段：diet_completion_rate / exercise_completion_rate / total_punches / last_7_days_trend / adherence_comment / improvement_suggestions），未改动任何既有类型（ApiResponse / PaginationInfo / PunchType / CompletionStatus / PunchCreateRequest / PunchCreateResponse / PunchListParams / PunchRecord 等全部保留不动）。

### 1.2 新建：`src/composables/usePunchApi.ts`

按设计 §2。两个函数，全部禁 `any`，泛型解包精准：

- `getPunchList(params)` → `api.get<{ success, data: PunchRecord[], pagination: PaginationInfo }>('/punch/list', { params })` 返回 `{ records, pagination }`
- `getPunchAnalysis()` → `api.get<{ success, data: PunchAnalysisResponse }>('/punch/analysis')` 返回裸 `PunchAnalysisResponse`

全部走 `api`（axios），不读 token、不拼 URL。

### 1.3 新建：`src/stores/punchStore.ts`

按设计 §3（r1 修订版），setup-store 风格（`defineStore('punch', () => {...})`）：

- **state**（10 个 ref + 1 个 reactive）：
  - `records: Ref<PunchRecord[]>` — 列表数据（loadMore 追加，fetchList 全量替换）
  - `pagination: Ref<PaginationInfo | null>` — 分页信息
  - `filter: Reactive<{ startDate?, endDate?, punch_type? }>` — 筛选条件
  - `analysis: Ref<PunchAnalysisResponse | null>` — AI 分析结果
  - `listLoading / listLoadingMore / analysisLoading: Ref<boolean>` — 分场景加载态
  - `error / analysisError: Ref<Error | null>` — 分来源错误

- **getters**（2 个）：
  - `hasMore: ComputedRef<boolean>` — `page < totalPages`
  - `currentPage: ComputedRef<number>` — `pagination?.page ?? 1`

- **防竞态（r1 G2 修复）**：
  - `requestId: Ref<number>` 递增计数器
  - `fetchList` / `loadMore` 请求前快照 `const snapshot = requestId.value`，响应后仅当 `snapshot === requestId.value` 时赋值

- **actions**（6 个）：
  - `fetchList()`：page=1，全量替换 records + pagination；requestId 防竞态
  - `loadMore()`：hasMore 守卫 + listLoadingMore 锁；page=currentPage+1；追加到 records 末尾；requestId 防竞态
  - `fetchAnalysis()`：回填 analysis；失败回填 analysisError（不阻断列表）
  - `setFilter(partial)`：更新 filter reactive 对象 → 调用 fetchList()（page=1 重置）
  - `retryFetchList()` / `retryFetchAnalysis()`

禁 `any`、禁读 `localStorage.token`。`computed` 已正确 import（r1 M1 修复）。

### 1.4 修改：`src/views/Punch.vue`（完整重写）

按设计 §4（r1 + r2 修订版），`<script setup lang="ts">` + scoped CSS + CSS 变量，**无 Tailwind、无新依赖**。

**script 关键结构**：

- **视图态**：`listViewMode: 'list' | 'listLoading' | 'listError'`，初始值 `'listLoading'`
- **筛选**：日期范围 `dateStart`/`dateEnd` v-model + `@change` → `onDateChange()` → `store.setFilter()`；类型 chip `TYPE_OPTIONS` + `onTypeFilter()` → `store.setFilter()`
- **趋势图派生**：`trendData` computed，maxVal 归一 → dietPct / exercisePct / dayLabel（周标签或 MM-DD）
- **Markdown 净化链**：`safeAnalysisHtml(markdown: unknown): string` — `marked.parse({ async: false }) → DOMPurify.sanitize → return`（S6：单次净化）
- **工具函数**：`getErrorMessage`（扩展 axios error.message 兜底）、`ratePercent`（0-1 → X%）、`formatPunchTime`（ISO → MM-DD · HH:mm）、`typeIcon`（diet→fa-utensils, exercise→fa-person-running）
- **滚动触底**：`onScroll`（rAF throttle，距底 120px 触发 `store.loadMore()`）
- **生命周期**：`onMounted` → `store.fetchList()` → 分流 listViewMode；`store.fetchAnalysis()` 并行；`window.addEventListener('scroll', onScroll, { passive: true })`；`onUnmounted` → 清理 listener

**template 结构**（三区布局）：

1. **统计/AI 分析区**（顶部）：
   - `v-if="store.analysisLoading"` — 3 行骨架屏
   - `v-else-if="store.analysisError"` — 降级提示条（#FFF7E6 背景 + 警告图标 + 错误文案 + 重试按钮；r1 G2/M2 修复）— 分析为 null 时整区降级，不单独渲染统计卡
   - `v-else-if="store.analysis"` — 统计卡三列（饮食/运动完成率渐变文字 + 总打卡） + 趋势柱状图（7 列纯 CSS，`v-if="trendData.length > 0"` else "暂无趋势数据"）+ AI 评语卡（`v-html="safeAnalysisHtml(...)"`）+ 改进建议 `<ul>` + 免责提示条恒显底部

2. **筛选区**：日期双 input + 类型三 chip（全部/饮食/运动）

3. **打卡记录列表**：
   - `listViewMode='listLoading'` — 4 条骨架卡片（skeleton-circle + skeleton-lines 脉动动画）
   - `listViewMode='listError'` — 错误文案 + 重试按钮
   - `records.length===0` — 空记录引导态（clipboard-check 图标 + CTA "去打卡" → `router.push('/life-plan')`）
   - 正常列表 — 记录卡片（type-icon 左 + 类型 badge + 方案标题 + 时间 + 完成状态 badge 右）
     - `plan_title` 为 null/undefined 时显示「（方案项已删除）」
   - 筛选重新加载微弱指示条（`listLoading && records.length>0`；r1 M4 修复）
   - 加载失败错误提示条（`error && records.length>0`；r1 G1 修复 — 重试按钮调用 `retryFetchList()` 从 page=1 拉取；r2 N1 修复）
   - 加载更多中 spinner / "加载更多"按钮 / "已加载全部记录"

### 1.5 不改文件（仅读取复用）

- `src/router/index.ts` — `/profile/punch` 路由已存在，meta.requiresAuth:true
- `src/App.vue`
- `src/composables/useApi.ts` — api（axios）JWT 拦截器
- `src/stores/authStore.ts`
- `src/stores/riskFormStore.ts`
- `src/stores/homeStore.ts`
- `src/stores/lifePlanStore.ts`
- `src/composables/useHomeApi.ts`
- `src/composables/useLifePlanApi.ts`
- `src/views/Risk.vue`
- `src/views/LifePlan.vue`
- `src/views/Home.vue`
- `src/assets/variables.css`
- `src/utils/enumLabels.ts` — `punch_type` / `completion_status` 枚举已在 Task 2 落地
- `server/**`
- `package.json` / `vite.config.ts` / `tsconfig.app.json`

---

## 2. 自检结论

### 2.1 vue-tsc 零错误

```
npx vue-tsc --noEmit
```

**结果：无输出（exit code 0）**，零类型错误。

### 2.2 S1-S6 静态审查

| 检查项 | 结果 | 证据 |
|--------|------|------|
| **S1** — 无 `any` | PASS | grep `\bany\b` 在 usePunchApi.ts / punchStore.ts / Punch.vue 三文件均为 0 匹配 |
| **S2** — 所有 v-html 经 DOMPurify | PASS | Punch.vue 仅一处 `v-html="safeAnalysisHtml(store.analysis.adherence_comment)"`，safeAnalysisHtml 内含 `DOMPurify.sanitize(html)` |
| **S3** — 无硬编码后端 URL | PASS | 全部走 `api`（axios），baseURL `/api`；grep `http://\|https://\|localhost` 在 usePunchApi.ts 为 0 匹配 |
| **S4** — 变更集仅目标文件 | PASS | 仅修改 api.ts（末尾追加）、Punch.vue（完整重写）；新建 punchStore.ts、usePunchApi.ts。未动 router/App/useApi/authStore/riskFormStore/homeStore/lifePlanStore/Risk/LifePlan/variables.css/package.json/vite.config.ts/server |
| **S5** — 无新依赖 | PASS | 未修改 `package.json`；`marked` / `dompurify` / `sweetalert2` / `@fortawesome` 均已在 Task 1/2 引入 |
| **S6** — 不双重净化 | PASS | `safeAnalysisHtml` 内 marked 输出整体 DOMPurify.sanitize 一次，组件不再二次 sanitize；无其他 v-html 调用 |

### 2.3 降级/空态/加载态/错误态矩阵

| 场景 | 代码路径 | 表现 |
|------|----------|------|
| 列表首屏加载中 | `listViewMode='listLoading'` | 4 条骨架卡片，脉动动画 |
| 列表为空 | `listViewMode='list'` + `records.length===0` | 空记录引导态 + 「去打卡」CTA（跳 `/life-plan`） |
| 列表加载失败 | `listViewMode='listError'` | 错误文案 + 重试按钮 |
| 列表加载更多中 | `listLoadingMore===true` | 底部 spinner + 「加载中...」 |
| 列表加载失败（已有数据） | `error` 非空 + `records.length>0` | 底部警告条 + 重试（`retryFetchList()` page=1 恢复） |
| 列表已全部加载 | `records.length>0` + `!hasMore` | 「已加载全部记录」|
| AI 分析加载中 | `analysisLoading===true` + `analysis===null` | 分析区 3 行骨架屏 |
| AI 分析成功 + trend 空 | `analysis` 存在但 `last_7_days_trend=[]` | 统计卡正常；趋势卡片「暂无趋势数据」 |
| AI 分析失败 | `analysisError` 非空 | 降级提示条 + 重试按钮；整区降级不单独渲染统计卡 |
| `adherence_comment` 为空 | `safeAnalysisHtml('')` → `''` | 评语区空白 |
| `improvement_suggestions` 为空 | `v-if` 不满足 | 不渲染 `<ul>` |
| `plan_title` 为 null/undefined | `record.plan_title \|\| '（方案项已删除）'` | 兜底文案 |
| 筛选重新加载 | `listLoading && records.length>0` | 微弱 loading 指示条 |
| 滚动触底 | `onScroll` rAF throttle → `loadMore()` | 自动追加下一页 |
| 手动加载更多 | `hasMore && !listLoadingMore` → 按钮 | 点击调 `loadMore()` |

### 2.4 验收项映射（对 Verifier）

| 验收项（task_v3 §6） | 代码证据点 |
|----------------------|-----------|
| 列表支持日期范围 + punch_type 筛选 | `Punch.vue`: `dateStart`/`dateEnd` v-model + `@change` → `onDateChange()` → `store.setFilter()`；`TYPE_OPTIONS` chip + `onTypeFilter()` → `store.setFilter()`；`punchStore.fetchList()` 构造 `PunchListParams` 含筛选字段 |
| 分页正常（首屏 + 加载更多） | `punchStore.fetchList()` (page=1, 全量替换) vs `punchStore.loadMore()` (page+1, 追加)；`hasMore` getter 判 `page < totalPages`；滚动触发 `onScroll` + 手动按钮双重路径 |
| 本周趋势柱状图 7 天渲染（纯 CSS） | `trendData` 派生：`maxVal` 归一 → `dietPct`/`exercisePct`；template 内 `.punch-trend-bar` 内联 `style.height`；scoped CSS `.punch-trend-diet` / `.punch-trend-exercise` gradient |
| AI 分析经 DOMPurify 净化后 v-html | `safeAnalysisHtml()`：`marked.parse → DOMPurify.sanitize → return`；template `v-html="safeAnalysisHtml(store.analysis.adherence_comment)"` |
| 统计卡（饮食/运动完成率 + 总打卡） | `.punch-stats-row` 三列；`ratePercent()` 格式化 0-1 → X%；`store.analysis.total_punches` 直接渲染 |
| 改进建议列表渲染 | `v-for="s in store.analysis.improvement_suggestions"` + `.punch-suggestions` `<li>` |
| AI 分析失败降级 + 重试 | `v-else-if="store.analysisError"` → `.punch-analysis-fallback` + `store.retryFetchAnalysis()` |
| 空态引导 + CTA 跳 LifePlan | `v-else-if="store.records.length===0"` → `.punch-empty-card` + `router.push('/life-plan')` |
| 免责提示条恒显 | `.punch-disclaimer` 位于 `v-else-if="store.analysis"` 模板块底部 |
| 列表骨架屏 | `listViewMode='listLoading'` → `.punch-skeleton-list` 4 条 `.punch-skeleton-card`；`@keyframes punch-pulse` |
| 列表加载失败 + 重试 | `listViewMode='listError'` → `.punch-error` + `store.retryFetchList()` |
| 加载更多失败可见错误 + 重试 | `store.error && store.records.length > 0` → `.punch-loadmore-error` + `store.retryFetchList()` |
| 防竞态（筛选快速切换） | `punchStore.requestId` 递增计数器 + `fetchList`/`loadMore` 快照校验 |
| `npx vue-tsc --noEmit` 零错误 | 已验证：exit code 0，零输出 |
| 不引入新依赖 | 未改 `package.json` |
| 移动端 375px 无横向滚动 | `.punch-page` max-width 480px + margin auto + padding-bottom tab-bar-height |
| 视觉贴合 prototype.html | 白色粘性 header + flex items-end 柱状图 + record 卡片 type-icon/badge/status badge + AI 分析 gradient 背景 + lightbulb 图标 |

---

## 3. 偏差说明

无偏差。严格按 `detail_v3.md` r1/r2 修订版 §1-§9 实现，包含 r1 修复的所有 6 个问题（G1 加载更多失败提示条、G2 防竞态 requestId、M1 computed import、M2 死代码分支删除、M3 硬编码颜色改 CSS 变量、M4 筛选重载指示条）以及 r2 修复（N1 loadMore 失败重试按钮改为 retryFetchList）。
