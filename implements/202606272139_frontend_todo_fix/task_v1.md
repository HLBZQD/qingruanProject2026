# 首轮修复任务 v1

> **所属计划**: `implements/202606272139_frontend_todo_fix/plan.md`
> **本轮范围**: P0+P1 优先任务（6项，共约 8-13h）
> **本轮策略**: 快速见效 + 独立并行 — S5a/S1/S2 无依赖可并行推进，S9→S3→S7 链式推进
> **日期**: 2026-06-27

---

## 任务执行顺序

```
并行组A: [Task1 S9] → [Task2 S3] → [Task3 S7]     （punchStore + Punch.vue 链式）
并行组B: [Task4 S1]                                   （homeStore.ts 独立）
并行组C: [Task5 S2]                                   （lifePlanStore.ts 独立）
并行组D: [Task6 S5a]                                  （ArticleDetailView 独立）
```

建议：如果多人协作，A/B/C/D 可完全并行推进（4组无交叉依赖）。单人串行时按 Task1→Task6 顺序执行。

---

## Task 1: S9 — fetchAnalysis() 竞态保护

- **问题编号**: S9
- **严重程度**: 中（P1）
- **预估工时**: ~0.5h
- **前置依赖**: 无

### 修改文件

`src/stores/punchStore.ts` — `fetchAnalysis()` 函数（第125-135行附近）

### 具体修改描述

在 `fetchAnalysis()` 中复用同文件 `fetchList()` 已有的 `requestId` 快照竞态保护模式：

1. 函数开头增加 `requestId.value++` 和 `const snapshot = requestId.value`。
2. `try` 块中 `analysis.value = await getPunchAnalysis()` 之后增加 `if (snapshot !== requestId.value) return;`。
3. `catch` 块中 `analysisError.value = ...` 之前同样检查快照。
4. `finally` 块中检查快照后再设置 `analysisLoading.value = false`（参考 `fetchList` 第79-83行的 finally 模式）。

### 参考模板

同文件 `fetchList()` 函数（第59-83行）已有完整实现，直接复用其模式即可，约5行新增代码。

### 验收标准

- [ ] 在浏览器 DevTools Network 面板中模拟 Slow 3G 网络。
- [ ] 快速连续两次进入 `/profile/punch` 页面（间隔 < 500ms）。
- [ ] 检查分析区数据是否与第二次请求的响应一致（而非第一次慢响应覆盖了第二次结果）。
- [ ] `vue-tsc --noEmit` 无新增编译错误。

---

## Task 2: S3 — Punch.vue 默认近30天日期筛选

- **问题编号**: S3
- **严重程度**: 中（P1）
- **预估工时**: ~1.5h
- **前置依赖**: Task 1 (S9 — 竞态保护)

### 修改文件

`src/views/Punch.vue` — `onMounted` 函数（第135-147行附近）

### 具体修改描述

1. 在 `onMounted` 中，在调用 `store.fetchList()` 之前计算默认日期范围：
   - `const end = new Date()`
   - `const start = new Date(); start.setDate(start.getDate() - 30)`
   - `dateEnd.value = formatDate(end)` （格式 `YYYY-MM-DD`，使用 `toISOString().slice(0, 10)`）
   - `dateStart.value = formatDate(start)`
2. 将 `store.fetchList()` 替换为 `store.setFilter({ startDate: dateStart.value, endDate: dateEnd.value })`（setFilter 内部已调用 fetchList，并将在 Task3 中追加 fetchAnalysis）。
3. 边界条件处理：
   - 如果 URL query 参数已带日期（如从其他页面跳转携带筛选），优先使用 URL 参数而非默认近30天。
   - 如果 sessionStorage 已有上次筛选条件（后续迭代），优先恢复上次选择。
4. 确保 `dateStart` 和 `dateEnd` 的 ref 初始值仍为 `ref('')`（URL 优先判断在 onMounted 中进行）。

### 验收标准

- [ ] 首次进入 `/profile/punch` 页面，日期输入框应自动填充 "30天前" 和 "今天" 的日期。
- [ ] 检查 Network 面板中 `/api/punch/list` 请求参数应包含 `startDate` 和 `endDate`。
- [ ] 若 URL 携带 `?startDate=2026-01-01&endDate=2026-06-01` query 参数，应优先使用该参数而非默认30天。
- [ ] `vue-tsc --noEmit` 无新增编译错误。

---

## Task 3: S7 — 日期筛选变更同步触发 AI 分析重拉取

- **问题编号**: S7
- **严重程度**: 中（P1）
- **预估工时**: ~1h
- **前置依赖**: Task 1 (S9 — 竞态保护)

### 修改文件

`src/stores/punchStore.ts` — `setFilter()` 函数（第142-152行附近）

### 具体修改描述

1. 在 `setFilter()` 中 `fetchList()` 调用之后，追加 `fetchAnalysis()` 调用。
2. 注意：`fetchAnalysis()` 在 Task1 (S9) 中已增加竞态保护，此处直接调用即可。
3. 增加防抖处理（300ms debounce）：如果用户在短时间内多次修改日期（如连续点击日期选择器），避免连续多次 API 请求。实现方式：
   - 在 punchStore 中增加 `let debounceTimer: ReturnType<typeof setTimeout> | null = null`
   - `setFilter()` 中 `fetchList()` 正常触发，`fetchAnalysis()` 用防抖包裹（清除旧 timer → 设置新 timer → 300ms 后执行）。
4. 边界条件：`fetchAnalysis()` 失败不应阻断列表渲染（`fetchAnalysis` 已有独立的 `analysisError` 错误态）。

### 验收标准

- [ ] 修改日期筛选范围（如从近30天改为近7天），检查 Network 面板中 `/api/punch/analysis` 请求是否随 `/api/punch/list` 一起重新发出。
- [ ] 检查分析区的完成率、趋势图、评语是否与新的日期范围对应。
- [ ] 快速连续修改日期3次，Network 面板应仅发出最后一次 analysis 请求（防抖生效）。
- [ ] `vue-tsc --noEmit` 无新增编译错误。

---

## Task 4: S1 — Home.vue sessionStorage 1小时缓存

- **问题编号**: S1
- **严重程度**: 高（P1）
- **预估工时**: ~3h
- **前置依赖**: 无

### 修改文件

`src/stores/homeStore.ts` — `fetchHomeData()` 函数及 Store 导出块

### 具体修改描述

1. **缓存读取**（`fetchHomeData()` 开头）:
   - 读取 sessionStorage 键 `qrzl_home_cache`（JSON 格式: `{ doctors, articles, diabetesTypes, timestamp }`）。
   - 若存在且 `Date.now() - timestamp < 3600000`（1小时），则直接恢复数据到对应 ref（`doctors.value = cache.doctors` 等）并 `return`，跳过 API 调用。

2. **缓存写入**（API 成功后）:
   - 在 `Promise.allSettled` 全部完成后、`loading.value = false` 之前，将数据和时间戳写入 sessionStorage:
     ```typescript
     try {
       sessionStorage.setItem('qrzl_home_cache', JSON.stringify({
         doctors: doctors.value,
         articles: articles.value,
         diabetesTypes: diabetesTypes.value,
         timestamp: Date.now()
       }))
     } catch (e) {
       // QuotaExceededError 静默丢弃，不影响功能
     }
     ```

3. **重试后缓存更新**:
   - `retryDoctors()`/`retryArticles()`/`retryTypes()` 重试成功后，同步更新 sessionStorage 中的对应区块数据（读取旧缓存 → 更新对应字段 → 写回）。

4. **清理函数暴露**:
   - 在 homeStore 的 `return {}` 块中暴露 `clearHomeCache()` 函数（清除 `qrzl_home_cache` 键），供后续 S8 的 `clearAuth()` 调用。

5. **边界条件**:
   - `sessionStorage.setItem()` 外套 `try-catch` 防 `QuotaExceededError`（sessionStorage 约5MB上限）。
   - 缓存键使用项目前缀 `qrzl_` 避免命名冲突。
   - 时间戳使用 `Date.now()` 而非 `new Date().toISOString()` 以减少序列化开销。

### 验收标准

- [ ] 打开浏览器 DevTools Application 面板 > Session Storage，首次加载后应出现 `qrzl_home_cache` 键。
- [ ] 刷新页面，Network 面板应无 `/api/doctors`、`/api/articles`、`/api/diabetes-types` 请求（缓存命中）。
- [ ] 等待1小时后刷新，应重新发起 API 请求（缓存过期）。
- [ ] 重试某个区块（如首页医生列表加载失败后点击重试），缓存中对应区块数据应更新。
- [ ] `vue-tsc --noEmit` 无新增编译错误。

---

## Task 5: S2 — LifePlan.vue sessionStorage 30分钟方案缓存

- **问题编号**: S2
- **严重程度**: 高（P1）
- **预估工时**: ~3h
- **前置依赖**: 无

### 修改文件

`src/stores/lifePlanStore.ts` — `fetchCurrent()`、`generate()`、`adjust()` 三个函数及 Store 导出块

### 具体修改描述

1. **缓存读取**（`fetchCurrent()` 开头）:
   - 读取 sessionStorage 键 `qrzl_plan_cache`。
   - 若存在且 `Date.now() - cache.timestamp < 1800000`（30分钟），则直接恢复:
     - `currentPlan.value = cache.currentPlan`
     - `completedMap.value = new Map(cache.completedMapArray)`（Map 不可直接 JSON 序列化，需转为 `[[k, v], ...]` 数组格式写入，读取时 `new Map(array)` 恢复）
   - 缓存命中后 `return`，跳过 API 调用。

2. **缓存写入**（`generate()` 和 `adjust()` 成功后）:
   - 将 `{ currentPlan: currentPlan.value, completedMapArray: [...completedMap.value], timestamp: Date.now() }` 写入 `qrzl_plan_cache`。
   - `fetchCurrent()` API 成功后同样覆盖缓存。

3. **空方案处理**:
   - `currentPlan === null` 也写入缓存，以区分"未请求过"和"已请求过但无数据"。

4. **清理函数暴露**:
   - 在 lifePlanStore 的 `return {}` 块中暴露 `clearPlanCache()` 函数（清除 `qrzl_plan_cache` 键），供后续 S8 的 `clearAuth()` 调用。

5. **边界条件**:
   - `completedMap`（`Map<number, CompletionStatus>`）不可直接 JSON 序列化，使用数组格式 `[[k, v], ...]` 桥接。
   - 缓存过期后静默降级为 API 请求（不报错）。
   - `sessionStorage.setItem()` 外套 `try-catch` 防 `QuotaExceededError`。

### 验收标准

- [ ] DevTools Application 面板查看 sessionStorage 中 `qrzl_plan_cache` 键值。
- [ ] 生成方案后刷新页面，Network 面板应无 `/api/plan/current` 请求（30分钟内缓存命中）。
- [ ] 等待30分钟后刷新应重新请求 API（缓存过期）。
- [ ] 方案中已有打卡完成状态（`completedMap`），刷新后打卡状态应正确恢复。
- [ ] 无方案时（`currentPlan === null`），缓存应记录空方案状态，刷新后不重复请求。
- [ ] `vue-tsc --noEmit` 无新增编译错误。

---

## Task 6: S5a — ArticleDetailView.vue + /news/article/:id 路由 + API

- **问题编号**: S5a
- **严重程度**: 高（P0 — 功能阻断级）
- **预估工时**: ~4h
- **前置依赖**: 无

### 修改/新建文件清单

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| 新建 | `src/views/ArticleDetailView.vue` | 文章详情页组件 |
| 新建 | `src/types/api.ts`（追加） | 新增 `ArticleDetail` 类型 |
| 修改 | `src/composables/useHomeApi.ts` | 新增 `getArticle(id)` 函数 |
| 修改 | `src/router/index.ts` | 新增 `/news/article/:id` 路由 |

### 具体修改描述

#### 6.1 新建 ArticleDetail 类型

在 `src/types/api.ts` 中追加:

```typescript
/** 文章详情（含正文），GET /api/articles/:id */
export interface ArticleDetail extends Article {
  content: string          // Markdown 正文
  is_collected: boolean    // 是否已收藏
}
```

#### 6.2 新增 getArticle API 函数

在 `src/composables/useHomeApi.ts` 中新增:

```typescript
/**
 * 获取单篇文章详情
 * GET /api/articles/:id
 * 注意：id 为 number，使用 String(id) 直接拼接而非 encodeURIComponent
 */
export async function getArticle(id: number): Promise<ArticleDetail> {
  const res = await api.get<{ success: boolean; data: ArticleDetail }>(`/articles/${id}`)
  return res.data.data
}
```

#### 6.3 新建 ArticleDetailView.vue

功能要求：
1. 从 `route.params.id` 获取文章 ID，`onMounted` 中调用 `getArticle(Number(route.params.id))` 获取文章详情。
2. 使用 `marked.parse(markdown)` + `DOMPurify.sanitize(html)` 渲染文章正文（复用 LifePlan.vue 的 `safeContentHtml` 模式——参考 `src/views/LifePlan.vue:94-99`）。
3. 展示文章元信息：标题、作者、分类、发布时间、阅读量、标签。
4. 返回按钮：`router.push('/news')` 返回资讯列表页。
5. 收藏按钮（`is_collected` toggle，调用收藏API或占位 `console.warn` 标注待实现）。

三态处理：
- **加载态**: 骨架屏或 Spinner。
- **错误态**: API 失败时展示错误消息 + 重试按钮。
- **404态**: 文章 ID 不存在时展示提示（组件内降级，非路由级 404）。

#### 6.4 注册路由

在 `src/router/index.ts` 中添加路由配置:

```typescript
{
  path: '/news/article/:id',
  name: 'ArticleDetail',
  component: () => import('@/views/ArticleDetailView.vue'),
  meta: { requiresAuth: false }
}
```

注意：确保此路由在 `/news` 路由之前注册，避免 `/news` 模糊匹配拦截 `/news/article/:id`。

### 验收标准

- [ ] 直接访问 `/news/article/1`（假设存在此 ID），页面正常渲染文章标题、正文（Markdown→HTML）、元信息。
- [ ] 访问 `/news/article/99999`（不存在ID），组件内展示降级提示（不崩溃、不白屏）。
- [ ] API 请求失败时展示错误消息 + 重试按钮，点击重试后重新拉取。
- [ ] 加载中展示骨架屏/Spinner。
- [ ] 点击返回按钮跳转至 `/news` 资讯列表页。
- [ ] 执行 `vue-tsc --noEmit` 或 `npm run build` 确认新建组件和路由注册无新增编译错误。
- [ ] Home.vue 中文章点击行为（后续 Task S6 修复后）应能正确跳转到此页面。

---

## 本轮完成标准

1. 全部 6 项任务的验收标准均通过。
2. `vue-tsc --noEmit` 或 `npm run build` 无新增编译错误。
3. 核心用户路径可正常流转：
   - 首页加载 → 缓存命中（S1）
   - 生活方案生成 → 缓存命中（S2）
   - 打卡页日期筛选 → 分析联动更新（S3+S7+S9）
   - 文章详情页可访问（S5a）

---

*首轮任务文件结束。下一轮 v2 将处理：S6（文章跳转修复，依赖S5a）、G14（success字段拦截器）、S4+S11（跨模块数据）、S8（Token安全迁移）。*
