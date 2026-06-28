# 首轮修复代码变更报告 v1

> **设计依据**: `implements/202606272139_frontend_todo_fix/detail_v1.md`
> **任务文件**: `implements/202606272139_frontend_todo_fix/task_v1.md`
> **诊断报告**: `redeliberations/202606271705_frontend_todo_diagnosis/a_v8_diag_v3.md`
> **执行顺序**: Task1 (S9) -> Task2 (S7) -> Task3 (S3) -> Task4 (S1) -> Task5 (S2) -> Task6 (S5a)

---

## Task 1: S9 -- fetchAnalysis() 竞态保护

**文件**: `src/stores/punchStore.ts`
**修改行**: 第128-144行（原第125-135行）

### 修改内容
- 在 `fetchAnalysis()` 函数体内新增 `requestId.value++` 递增序列号（第131行）
- 新增 `const snapshot = requestId.value` 捕获快照（第132行）
- `try` 块中 `analysis.value = await getPunchAnalysis()` 之后增加 `if (snapshot !== requestId.value) return`（第135行）
- `catch` 块中 `analysisError.value = ...` 之前增加 `if (snapshot !== requestId.value) return`（第137行）
- `finally` 块中 `analysisLoading.value = false` 改为条件设置 `if (snapshot === requestId.value)`（第140-142行）

### 与设计的偏差
无。严格按照设计文档 1.3 节修改后代码结构实施。

---

## Task 2: S7 -- 日期筛选变更同步触发 AI 分析重拉取

**文件**: `src/stores/punchStore.ts`
**修改行**: 第54-55行（新增变量）、第151-170行（修改函数）

### 修改内容
- 第54-55行：在 `requestId` 声明后新增 `analysisDebounceTimer` 变量声明
- 第151行：`setFilter` 从 `function` 改为 `async function`
- 第155行：返回类型从 `void` 改为 `Promise<void>`
- 第160行：`fetchList()` 改为 `await fetchList()`
- 第162-169行：新增防抖逻辑（clearTimeout + setTimeout 300ms），在 timer 回调中调用 `fetchAnalysis()`

### 与设计的偏差
无。严格按照设计文档 2.3 节修改后代码结构实施。

---

## Task 3: S3 -- Punch.vue 默认近30天日期筛选

**文件**: `src/views/Punch.vue`
**修改行**: 第3行（import）、第11行（useRoute）、第27-32行（新增工具）、第144-180行（修改onMounted）

### 修改内容
- 第3行：`import { useRouter }` 改为 `import { useRouter, useRoute }`
- 第11行：新增 `const route = useRoute()`
- 第27-29行：新增 `formatDate(d: Date): string` 工具函数（`toISOString().slice(0, 10)`）
- 第32行：新增 `DATE_FORMAT_RE` 正则常量 `/^\d{4}-\d{2}-\d{2}$/`
- 第144-180行：`onMounted` 函数重写：
  - 新增 URL query 参数检测（`route.query.startDate` / `route.query.endDate`），带 `DATE_FORMAT_RE` 格式校验
  - URL 参数有效则优先使用；无效/不存在则计算近30天默认值
  - `await store.fetchList()` 替换为 `await store.setFilter(...)`
  - 移除显式的 `store.fetchAnalysis()` 调用（由 setFilter 内部防抖覆盖）
  - `store.error` 检测逻辑在 `await` 后正确执行

### 与设计的偏差
无。严格按照设计文档 3.3 节修改后代码结构实施。

---

## Task 4: S1 -- Home.vue sessionStorage 1小时缓存

**文件**: `src/stores/homeStore.ts`
**修改行**: 第32-90行（新增缓存机制）、第98-133行（修改fetchHomeData）、第165-193行（修改fetchSingle）、第210-229行（修改return块）

### 修改内容
- 第33-34行：新增缓存常量 `HOME_CACHE_KEY = 'qrzl_home_cache'`、`HOME_CACHE_TTL = 3600000`
- 第36-41行：新增 `HomeCache` 内部 interface
- 第44-68行：新增 `readHomeCache()` 函数（读sessionStorage、JSON.parse、结构校验、过期检查）
- 第72-83行：新增 `writeHomeCache()` 函数（JSON.stringify、setItem、try-catch防QuotaExceededError）
- 第86-89行：新增 `clearHomeCache()` 函数（removeItem，供外部调用）
- 第99-107行：`fetchHomeData()` 开头新增缓存检查，命中则恢复数据并return
- 第128-130行：API成功后写入缓存（部分成功也写入）
- 第170行：`fetchSingle('doctors')` 成功后新增 `writeHomeCache()` 调用
- 第180行：`fetchSingle('articles')` 成功后新增 `writeHomeCache()` 调用
- 第190行：`fetchSingle('types')` 成功后新增 `writeHomeCache()` 调用
- 第228行：return 块新增 `clearHomeCache` 暴露

### 与设计的偏差
无。严格按照设计文档 4.3 节修改后代码结构实施。

---

## Task 5: S2 -- LifePlan.vue sessionStorage 30分钟方案缓存

**文件**: `src/stores/lifePlanStore.ts`
**修改行**: 第36-90行（新增缓存机制）、第98-119行（修改fetchCurrent）、第137行（修改generate）、第166行（修改adjust）、第207-227行（修改return块）

### 修改内容
- 第37-38行：新增缓存常量 `PLAN_CACHE_KEY = 'qrzl_plan_cache'`、`PLAN_CACHE_TTL = 1800000`
- 第44-49行：新增 `PlanCache` 内部 interface（含 `currentPlan`、`completedMapArray`、`timestamp`）
- 第51-71行：新增 `readPlanCache()` 函数（读sessionStorage、JSON.parse、结构校验、过期检查）
- 第74-83行：新增 `writePlanCache()` 函数（`currentPlan` + `[...completedMap.value]` 数组序列化）
- 第86-89行：新增 `clearPlanCache()` 函数
- 第99-106行：`fetchCurrent()` 开头新增缓存检查，命中则恢复 `currentPlan` + `completedMap`（`new Map(array)`）并return
- 第113行：API成功后新增 `writePlanCache()` 调用
- 第137行：`generate()` 成功后新增 `writePlanCache()` 调用
- 第166行：`adjust()` 成功后新增 `writePlanCache()` 调用
- 第226行：return 块新增 `clearPlanCache` 暴露

### 与设计的偏差
无。严格按照设计文档 5.3 节修改后代码结构实施。`createPunch` 中不写缓存，与设计文档 5.6 节的已知权衡一致。

---

## Task 6: S5a -- ArticleDetailView.vue + /news/article/:id 路由 + API

**涉及文件**: 4个（1新建 + 3修改）

### 6.1 类型定义 -- `src/types/api.ts`

**修改行**: 第141-149行（在 `Article` 接口之后插入）

新增 `ArticleDetail` 接口：
```typescript
export interface ArticleDetail extends Article {
  content: string
  is_collected: boolean
}
```

### 6.2 API 层 -- `src/composables/useHomeApi.ts`

**修改行**: 第5行（import）、第84-89行（新增函数）

- 第5行：import 中新增 `ArticleDetail` 类型
- 第84-89行：新增 `getArticle(id: number): Promise<ArticleDetail>` 函数，调用 `GET /articles/${id}`

### 6.3 组件 -- `src/views/ArticleDetailView.vue`（新建文件）

**文件行数**: 约265行（script ~83行 + template ~90行 + style ~92行）

组件结构：
- 状态管理：`article`、`loading`、`error`、`notFound` 四个 ref
- Markdown 净化链：`safeContent` computed（marked.parse + DOMPurify.sanitize）
- 日期格式化：`formatDate(iso)` -> "YYYY年M月D日"
- 四态渲染：加载态（骨架屏）、404态、错误态（重试按钮）、正常态（元信息+正文）
- 粘性 Header：返回按钮 + 标题 + 收藏按钮（占位 console.warn）
- 样式：复用项目 CSS 变量，含 Markdown 深层排版、脉动动画、按压动画

### 6.4 路由 -- `src/router/index.ts`

**修改行**: 第22-26行（在 `/news` 路由之前插入）

```typescript
{
  path: '/news/article/:id',
  name: 'ArticleDetail',
  component: () => import('@/views/ArticleDetailView.vue'),
  meta: { requiresAuth: false },
},
```

路由顺序：`/news/article/:id` 在 `/news` 之前，确保精确匹配优先。

### 与设计的偏差
无。严格按照设计文档 6.2-6.5 节完整实施。

---

## 文件修改汇总

| 文件 | Task1 S9 | Task2 S7 | Task3 S3 | Task4 S1 | Task5 S2 | Task6 S5a | 实际修改行 |
|------|:----:|:----:|:----:|:----:|:----:|:----:|:--------:|
| `src/stores/punchStore.ts` | ~10行 | ~10行 | -- | -- | -- | -- | ~20行 |
| `src/views/Punch.vue` | -- | -- | ~28行 | -- | -- | -- | ~28行 |
| `src/stores/homeStore.ts` | -- | -- | -- | ~60行 | -- | -- | ~60行 |
| `src/stores/lifePlanStore.ts` | -- | -- | -- | -- | ~60行 | -- | ~60行 |
| `src/types/api.ts` | -- | -- | -- | -- | -- | ~9行 | ~9行 |
| `src/composables/useHomeApi.ts` | -- | -- | -- | -- | -- | ~15行 | ~15行 |
| `src/router/index.ts` | -- | -- | -- | -- | -- | ~6行 | ~6行 |
| `src/views/ArticleDetailView.vue` | -- | -- | -- | -- | -- | **新建**~265行 | ~265行 |

---

## 实际修改与设计的偏差

**无偏差**。所有6项任务均严格按照 `detail_v1.md` 中的"修改后代码结构"逐行实施，未对设计文档中的代码片段做任何自行发挥或偏离。

## 未实施的修改

**无**。本轮计划的所有6项任务（S9, S7, S3, S1, S2, S5a）均已实施完成。

## 完整性检查

- [x] `punchStore.ts` -- fetchAnalysis 竞态保护 + setFilter async/防抖
- [x] `Punch.vue` -- useRoute集成 + formatDate/DATE_FORMAT_RE + onMounted默认近30天 + setFilter替换
- [x] `homeStore.ts` -- readHomeCache/writeHomeCache/clearHomeCache + fetchHomeData/fetchSingle缓存集成
- [x] `lifePlanStore.ts` -- readPlanCache/writePlanCache/clearPlanCache + fetchCurrent/generate/adjust缓存集成
- [x] `api.ts` -- ArticleDetail 类型追加
- [x] `useHomeApi.ts` -- getArticle 函数新增
- [x] `ArticleDetailView.vue` -- 完整组件新建（四态渲染 + Markdown净化链）
- [x] `router/index.ts` -- /news/article/:id 路由插入（/news之前）

---

*代码变更报告结束。*
