# 首轮修复详细设计 v1

> **依据**: 诊断报告 `redeliberations/202606271705_frontend_todo_diagnosis/a_v8_diag_v3.md`，计划文件 `plan.md`，任务文件 `task_v1.md`
> **设计基线**: `docs/2_detailed_design_v3.md`
> **日期**: 2026-06-27
> **范围**: 6项任务 — S9, S7, S3, S1, S2, S5a (P0+P1)
> **修订**: v1-r1 — 修正审查报告 `design_review_v1_r1.md` 中的2个阻塞问题 + 2个建议问题
> **任务执行顺序**: Task1 (S9) → Task2 (S7) → Task3 (S3), 并行组B/C/D: Task4 (S1), Task5 (S2), Task6 (S5a)

---

## 总体设计约定

### 命名与代码风格

| 约定 | 规则 |
|------|------|
| sessionStorage 键前缀 | `qrzl_` 统一前缀，避免命名冲突（如 `qrzl_home_cache`、`qrzl_plan_cache`） |
| 时间戳 | 使用 `Date.now()` (Unix ms)，非 `new Date().toISOString()` 以减少序列化开销 |
| 缓存过期比较 | `Date.now() - cache.timestamp < EXPIRY_MS`，单位为毫秒 |
| sessionStorage 写保护 | 所有 `sessionStorage.setItem()` 外套 `try-catch` 防 `QuotaExceededError`（约5MB上限） |
| 日期格式化 | 使用 `toISOString().slice(0, 10)` 产出 `YYYY-MM-DD` 格式 |
| 竞态快照变量名 | punchStore 用 `requestId`（请求序列）；homeStore 用 `pageInstanceId`（页面实例） |
| API 函数返回类型 | 保持现有 `Promise<T>` 签名不变，不修改 API composable 层 |

### 与其他轮次的接口约定

| 本轮暴露 | 用途 | 消费方（后续轮次） |
|---------|------|-------------------|
| `homeStore.clearHomeCache()` | 清除 `qrzl_home_cache` | S8 `clearAuth()` |
| `lifePlanStore.clearPlanCache()` | 清除 `qrzl_plan_cache` | S8 `clearAuth()` |
| `/news/article/:id` 路由 | 文章详情页路由 | S6 `goArticle()` 跳转 |
| `getArticle(id: number)` | 文章详情 API | S6 (Home.vue) + ArticleDetailView |
| `ArticleDetail` 类型 | 文章详情类型定义 | S6 + 未来扩展 |

---

## Task 1: S9 -- fetchAnalysis() 竞态保护

### 1.1 涉及文件

| 文件 | 行范围 | 操作 |
|------|--------|------|
| `src/stores/punchStore.ts` | 第125-135行 | 修改 `fetchAnalysis()` 函数体 |

### 1.2 当前代码结构

```
src/stores/punchStore.ts (第125-135行)
├── async function fetchAnalysis(): Promise<void> {
│     analysisLoading.value = true
│     analysisError.value = null
│     try {
│       analysis.value = await getPunchAnalysis()          // ← 无竞态保护
│     } catch (e) {
│       analysisError.value = e instanceof Error ? e : new Error(...)
│     } finally {
│       analysisLoading.value = false                      // ← 无条件设置
│     }
│   }
```

对比同文件已实现竞态保护的模式：
- `fetchList()` (第59-83行): 使用 `requestId` ref + `snapshot` 快照
- `loadMore()` (第92-118行): 同样模式

### 1.3 修改后代码结构

```typescript
async function fetchAnalysis(): Promise<void> {
  analysisLoading.value = true
  analysisError.value = null
  requestId.value++                          // [新增] 递增序列号
  const snapshot = requestId.value           // [新增] 捕获快照
  try {
    analysis.value = await getPunchAnalysis()
    if (snapshot !== requestId.value) return // [新增] 旧请求丢弃
  } catch (e) {
    if (snapshot !== requestId.value) return // [新增] 旧请求丢弃
    analysisError.value = e instanceof Error ? e : new Error('AI 分析暂不可用')
  } finally {
    if (snapshot === requestId.value) {      // [修改] 条件设置
      analysisLoading.value = false
    }
  }
}
```

### 1.4 函数签名变更

无。`fetchAnalysis(): Promise<void>` 签名不变。`requestId` 已在 Store 第52行声明为 `const requestId = ref(0)`，无需新增变量。

### 1.5 数据流变化

```
修改前:
  onMounted → store.fetchAnalysis() → getPunchAnalysis() → analysis.value = result
  (快速重入时旧响应可能覆盖新响应)

修改后:
  onMounted → store.fetchAnalysis() → requestId++ → snapshot=1
  快速重入 → store.fetchAnalysis() → requestId++ (→2) → snapshot=2
  getPunchAnalysis() 返回 → snapshot(2) === requestId(2) → 写入  ← 正确响应
  (旧请求 snapshot=1 !== requestId=2 → return 丢弃)             ← 旧响应丢弃
```

fire-and-forget 场景（`onMounted` 中 `store.fetchAnalysis()` 不 await）同样有效——新调用递增 `requestId` 使旧快照自动失效。

### 1.6 边界条件与错误处理

| 场景 | 行为 |
|------|------|
| 连续两次进入页面 (<500ms) | 第二次 `requestId` 递增，第一次响应被丢弃；最终展示第二次数据 |
| fetchAnalysis 抛异常 | catch 块同样检查快照，过期异常不覆盖 `analysisError` |
| 并发 fetchAnalysis + setFilter 触发 fetchAnalysis | 各自独立快照；最后完成的有效快照写入 |
| fire-and-forget 调用（不 await） | 快照机制不依赖 await 调用方，`requestId` 在 Store 闭包内递增 |

### 1.7 与其他模块接口约定

- `requestId` 已被 `fetchList()` 和 `loadMore()` 使用，`fetchAnalysis()` 加入后三者共享同一序列号空间。这是预期行为：任何 action 触发都会递增 `requestId`，使其他进行中的旧 action 响应失效。
- 不影响 `punchStore` 对外暴露的接口（`fetchAnalysis` 函数签名不变）。

---

## Task 2: S7 -- 日期筛选变更同步触发 AI 分析重拉取

> **注意**: 本 Task 在原设计中为 Task 3，根据审查报告 `design_review_v1_r1.md` 的阻塞问题2调整为先于 S3 执行。执行顺序: Task1 (S9) → **Task2 (S7)** → Task3 (S3)。

### 2.1 涉及文件

| 文件 | 行范围 | 操作 |
|------|--------|------|
| `src/stores/punchStore.ts` | 第142-152行 | 修改 `setFilter()` 函数 |
| `src/stores/punchStore.ts` | 第49-52行附近 | 新增防抖 timer 变量声明 |

### 2.2 当前代码结构

```
src/stores/punchStore.ts (第142-152行)
├── function setFilter(partial: { ... }): void {
│     if ('startDate' in partial) filter.startDate = partial.startDate
│     if ('endDate' in partial) filter.endDate = partial.endDate
│     if ('punch_type' in partial) filter.punch_type = partial.punch_type
│     fetchList()                                        // ← 仅拉取列表，不拉取分析
│   }
```

### 2.3 修改后代码结构

在 Store 函数体内新增防抖 timer 变量（第52行 `const requestId = ref(0)` 之后）：

```typescript
/** 防抖 timer：setFilter 中 fetchAnalysis 使用，避免连续改日期导致多次 API 请求 */
let analysisDebounceTimer: ReturnType<typeof setTimeout> | null = null
```

修改 `setFilter()` 函数（第142-152行）：

```typescript
async function setFilter(partial: {
  startDate?: string
  endDate?: string
  punch_type?: PunchType | undefined
}): Promise<void> {
  if ('startDate' in partial) filter.startDate = partial.startDate
  if ('endDate' in partial) filter.endDate = partial.endDate
  if ('punch_type' in partial) filter.punch_type = partial.punch_type
  // 重置到首屏 — [修改] await 确保 fetchList 完成后再返回
  await fetchList()

  // [新增] 防抖触发分析重拉取（300ms）
  if (analysisDebounceTimer !== null) {
    clearTimeout(analysisDebounceTimer)
  }
  analysisDebounceTimer = setTimeout(() => {
    analysisDebounceTimer = null
    fetchAnalysis()
  }, 300)
}
```

**关键变更说明**：原 `setFilter` 为同步函数（返回 `void`），内部调用 `fetchList()` 但不 `await`，导致调用方 `await store.setFilter(...)` 立即返回、`store.error` 检测逻辑失效。修订后将 `setFilter` 改为 `async function`，内部 `await fetchList()`。调用方 `await store.setFilter(...)` 将等待 `fetchList` 完成后才继续执行，`store.error` 检测逻辑正确。

### 2.4 函数签名变更

| 项目 | 变更 |
|------|------|
| `setFilter()` | 返回值从 `void` 改为 `Promise<void>`；函数声明从 `function` 改为 `async function` |
| `analysisDebounceTimer` | 新增模块级私有变量，不暴露在 `return {}` 块中 |

### 2.5 数据流变化

```
修改前:
  onDateChange → store.setFilter({startDate, endDate})
    → filter 更新 → fetchList() → GET /api/punch/list  （分析不更新）

修改后:
  onDateChange → await store.setFilter({startDate, endDate})
    → filter 更新
    → await fetchList() → GET /api/punch/list         （等待完成）
    → clearTimeout + setTimeout(300ms)
    → fetchAnalysis() → GET /api/punch/analysis       （300ms 后触发）
    
  调用方在 await 后可以安全读取 store.error（fetchList 已完成）:
    await store.setFilter(...)
    if (store.error) { ... }  // ← 此时 fetchList 已完成，error 已回填
```

快速连续修改日期3次的数据流：
```
修改1: await setFilter(day1) → await fetchList() → timer1=setTimeout(fetchAnalysis, 300)
修改2: await setFilter(day2) → await fetchList() → clearTimeout(timer1) → timer2=setTimeout(fetchAnalysis, 300)
修改3: await setFilter(day3) → await fetchList() → clearTimeout(timer2) → timer3=setTimeout(fetchAnalysis, 300)
300ms后: timer3 触发 → fetchAnalysis() ← 仅最后一次生效
```

### 2.6 边界条件与错误处理

| 场景 | 行为 |
|------|------|
| 单次日期变更 | `await fetchList()` 完成；300ms 后 `fetchAnalysis()` 执行 |
| 快速连续3次变更 | 前2次 timer 被 `clearTimeout` 取消；仅最后一次 `fetchAnalysis()` 执行 |
| fetchAnalysis 失败 | 不阻断列表渲染；`analysisError` 独立错误态，UI 展示降级提示条 |
| setFilter 仅改 punch_type（不改日期） | 仍然触发 `fetchAnalysis()`；分析数据应反映类型筛选变化（后端支持 punch_type 参数或全量分析） |
| setFilter 时 fetchList 正在执行 | `requestId` 竞态保护在 fetchList 内部生效；fetchAnalysis 的竞态保护（Task1 S9）在 fetchAnalysis 内部生效 |
| 调用方 await setFilter 后读取 store.error | setFilter 为 async，await 后 fetchList 已完成 → error 已回填 → 检测逻辑正确 |
| 组件卸载后 timer 触发 | `fetchAnalysis()` 内部的 `requestId` 快照保护：组件卸载后无新请求递增 requestId，但 timer 回调中 fetchAnalysis 仍会执行并更新 Store 状态；因 Store 是全局单例，这不导致内存泄漏——但需确认是否为预期行为。当前实现保持此行为（与 fire-and-forget 语义一致） |
| analysisDebounceTimer 清理 | timer 变量为模块级 `let`，仅在 Store 实例生命周期内有效；Pinia Store 为单例，无需额外清理 |

### 2.7 与其他模块接口约定

- **依赖 Task1 (S9)**: `fetchAnalysis()` 已具备 `requestId` 竞态保护，防抖回调中调用安全。
- **被 Task3 (S3) 消费**: `onMounted` 中 `await store.setFilter()` 会同时触发列表（等待完成）和分析拉取（防抖）。
- **与 `fetchList` 的关系**: `fetchList` 不防抖（在 setFilter 中 await 立即执行），因为列表是用户直接可见的主要交互结果，需要即时响应。

---

## Task 3: S3 -- Punch.vue 默认近30天日期筛选

> **注意**: 本 Task 在原设计中为 Task 2，根据审查报告 `design_review_v1_r1.md` 的阻塞问题2调整到 S7 之后执行。执行顺序: Task1 (S9) → Task2 (S7) → **Task3 (S3)**。
> **依赖确认**: `setFilter` 已在 Task2 (S7) 中改为 async（内部 `await fetchList()` + 防抖 `fetchAnalysis()`）。本 Task 中 `await store.setFilter(...)` 正确等待 fetchList 完成后才继续。

### 3.1 涉及文件

| 文件 | 行范围 | 操作 |
|------|--------|------|
| `src/views/Punch.vue` | 第135-147行 | 修改 `onMounted` 函数 |
| `src/views/Punch.vue` | 第21-23行 | `dateStart`/`dateEnd` 声明处（无修改，仅为上下文） |
| `src/views/Punch.vue` | 第127-132行 | `onDateChange` 函数（无修改，仅为上下文） |

### 3.2 当前代码结构

```
src/views/Punch.vue (第135-147行)
├── onMounted(async () => {
│     listViewMode.value = 'listLoading'
│     await store.fetchList()                              // ← 直接 fetchList，无默认日期
│     if (store.error) { listViewMode.value = 'listError' }
│     else { listViewMode.value = 'list' }
│     store.fetchAnalysis()                                // ← fire-and-forget
│     window.addEventListener('scroll', onScroll, ...)
│   })

dateStart / dateEnd 声明 (第22-23行):
  const dateStart = ref('')                                // ← 空字符串初始值
  const dateEnd = ref('')
```

### 3.3 修改后代码结构

```typescript
// ===== 日期范围筛选 ===== (第21-23行，保持不变)
const dateStart = ref('')
const dateEnd = ref('')

// ===== 日期格式化工具函数 [新增] =====
function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10) // "YYYY-MM-DD"
}

// ===== URL 日期格式校验正则 [新增] =====
const DATE_FORMAT_RE = /^\d{4}-\d{2}-\d{2}$/

// ===== 初始化 ===== (第135-147行，修改后)
onMounted(async () => {
  listViewMode.value = 'listLoading'

  // [新增] 计算默认日期范围（近30天），优先使用 URL query 参数（带格式校验）
  const qStart = route.query.startDate
  const qEnd = route.query.endDate
  if (
    typeof qStart === 'string' && DATE_FORMAT_RE.test(qStart) &&
    typeof qEnd === 'string' && DATE_FORMAT_RE.test(qEnd)
  ) {
    // URL 参数有效 → 优先使用（从其他页面跳转携带筛选条件）
    dateStart.value = qStart
    dateEnd.value = qEnd
  } else {
    // 默认近30天（含：无参数、格式非法、仅一个参数存在）
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 30)
    dateEnd.value = formatDate(end)
    dateStart.value = formatDate(start)
  }

  // [修改] 使用 setFilter 替代 fetchList
  //        setFilter 在 Task2 (S7) 中已改为 async: 内部 await fetchList() + 防抖 fetchAnalysis()
  await store.setFilter({
    startDate: dateStart.value || undefined,
    endDate: dateEnd.value || undefined,
  })

  // 此时 fetchList 已完成 (setFilter 为 async)，store.error 已回填 → 检测逻辑正确
  if (store.error) {
    listViewMode.value = 'listError'
  } else {
    listViewMode.value = 'list'
  }
  // [删除] store.fetchAnalysis() — 已由 Task2 (S7) 在 setFilter 中覆盖
  // 滚动监听（用于触底加载更多）
  window.addEventListener('scroll', onScroll, { passive: true })
})
```

注意：需在 `<script setup>` 顶部增加 `useRoute` 引入：
```typescript
import { useRouter, useRoute } from 'vue-router'
// ...
const route = useRoute()  // [新增] 读取 URL query 参数
```

### 3.4 函数签名变更

| 项目 | 变更 |
|------|------|
| `formatDate(d: Date): string` | 新增内部工具函数，不导出 |
| `DATE_FORMAT_RE` | 新增常量，`/^\d{4}-\d{2}-\d{2}$/`，用于 URL query 参数格式校验 |
| `useRoute` 引入 | 新增 `import { useRoute }` + `const route = useRoute()` |

### 3.5 数据流变化

```
修改前:
  onMounted → store.fetchList() → 无日期参数 → 后端返回全部记录

修改后:
  onMounted → 检查 URL query (startDate/endDate) + 正则校验
    ├── URL 有效参数 → 使用 URL 参数
    └── URL 无效/不存在 → 计算近30天默认值 → dateStart/dateEnd ref 赋值
  → await store.setFilter({ startDate, endDate })
    → [Task2] await fetchList() → GET /api/punch/list?startDate=...&endDate=...
    → [Task2] 防抖 300ms → fetchAnalysis() 带相同日期范围
  → await 返回后检测 store.error → 设置 listViewMode
```

### 3.6 边界条件与错误处理

| 场景 | 行为 |
|------|------|
| 首次进入（无 URL 参数） | 自动填充近30天日期，input 框显示默认值 |
| URL 携带 `?startDate=2026-01-01&endDate=2026-06-01` | 正则校验通过 → 优先使用 URL 参数覆盖默认值 |
| URL query 参数格式非法（如 `startDate=abc`） | `DATE_FORMAT_RE.test('abc')` = false → 走默认近30天分支（安全兜底，避免无效请求） |
| URL query 参数部分格式非法（如 `startDate=2026-01-01&endDate=abc`） | `&&` 短路，仅 endDate 不通过则整体走默认分支 |
| 仅一个 query 参数存在（如只有 startDate） | `typeof qEnd === 'string'` 为 false → 不满足 `&&` 条件，走默认近30天分支（安全兜底） |
| `toISOString()` 时区偏移 | UTC 零点可能跨日；但 `YYYY-MM-DD` 格式用于日期筛选，时区偏移 +/-1天在30天窗口内可接受 |
| 日期输入框用户清空 | `onDateChange` 将 `undefined` 传入 setFilter，不覆盖 filter 中的值（保持上次有效值）—这是 `setFilter` 现有行为 |

### 3.7 与其他模块接口约定

- **依赖 Task1 (S9)**: `fetchAnalysis()` 已具备竞态保护，`setFilter` 中间接触发安全。
- **依赖 Task2 (S7)**: `setFilter` 已改为 async（内部 `await fetchList()` + 防抖 `fetchAnalysis()`），`onMounted` 中 `await store.setFilter(...)` 正确等待 fetchList 完成。`store.fetchAnalysis()` 直接调用已在 onMounted 中移除，由 setFilter 内部覆盖。
- **route.query 消费**: 从 `vue-router` 的 `useRoute()` 读取，不依赖 Pinia Store。

---

## Task 4: S1 -- Home.vue sessionStorage 1小时缓存

### 4.1 涉及文件

| 文件 | 行范围 | 操作 |
|------|--------|------|
| `src/stores/homeStore.ts` | 第38-58行 | 修改 `fetchHomeData()` 函数 |
| `src/stores/homeStore.ts` | 第80-87行 | 修改 `retryDoctors()` / `retryArticles()` / `retryTypes()` |
| `src/stores/homeStore.ts` | 第90-115行 | 修改 `fetchSingle()` 函数（重试后缓存更新） |
| `src/stores/homeStore.ts` | 第132-149行 | 修改 `return {}` 块（暴露 `clearHomeCache`） |

### 4.2 当前代码结构

```
src/stores/homeStore.ts
├── fetchHomeData() (第38-58行):
│     loading.value = true
│     清空 errors
│     Promise.allSettled([getDoctors, getArticles, getDiabetesTypes])
│     回填数据/错误
│     loading.value = false
│     // 无 sessionStorage 读写
│
├── retry* / fetchSingle() (第80-115行):
│     单个 API 重试，成功后回填对应 ref
│     // 无 sessionStorage 写
│
└── return {} (第132-149行):
      // 无 clearHomeCache 暴露
```

### 4.3 修改后代码结构

**4.3.1 缓存常量与工具函数** (在 Store 函数体内、`fetchHomeData` 之前新增)

```typescript
// ===== sessionStorage 缓存 =====
const HOME_CACHE_KEY = 'qrzl_home_cache'
const HOME_CACHE_TTL = 3600000 // 1 小时（毫秒）

interface HomeCache {
  doctors: Doctor[]
  articles: Article[]
  diabetesTypes: DiabetesTypeView[]
  timestamp: number
}

/** 从 sessionStorage 读取并验证缓存 */
function readHomeCache(): HomeCache | null {
  try {
    const raw = sessionStorage.getItem(HOME_CACHE_KEY)
    if (!raw) return null
    const cache: HomeCache = JSON.parse(raw)
    // 结构完整性校验：必须有 timestamp 且三个 data 字段为数组
    if (
      typeof cache.timestamp !== 'number' ||
      !Array.isArray(cache.doctors) ||
      !Array.isArray(cache.articles) ||
      !Array.isArray(cache.diabetesTypes)
    ) {
      sessionStorage.removeItem(HOME_CACHE_KEY) // 脏数据清理
      return null
    }
    if (Date.now() - cache.timestamp >= HOME_CACHE_TTL) {
      sessionStorage.removeItem(HOME_CACHE_KEY) // 过期清理
      return null
    }
    return cache
  } catch {
    // JSON.parse 失败（损坏数据），静默降级为 API 请求
    sessionStorage.removeItem(HOME_CACHE_KEY)
    return null
  }
}

/** 写入 sessionStorage 缓存 */
function writeHomeCache(): void {
  try {
    sessionStorage.setItem(HOME_CACHE_KEY, JSON.stringify({
      doctors: doctors.value,
      articles: articles.value,
      diabetesTypes: diabetesTypes.value,
      timestamp: Date.now(),
    }))
  } catch {
    // QuotaExceededError 或其他存储异常，静默丢弃——缓存为性能优化，不影响功能
  }
}

/** 清除缓存（供 clearAuth 等外部调用） */
function clearHomeCache(): void {
  try {
    sessionStorage.removeItem(HOME_CACHE_KEY)
  } catch { /* ignore */ }
}
```

**4.3.2 修改 `fetchHomeData()`** (第38-58行)

```typescript
async function fetchHomeData(): Promise<void> {
  // [新增] 检查 sessionStorage 缓存
  const cache = readHomeCache()
  if (cache) {
    doctors.value = cache.doctors
    articles.value = cache.articles
    diabetesTypes.value = cache.diabetesTypes
    // 缓存命中直接返回；loading 保持 false（初始值），组件正常渲染
    return
  }

  loading.value = true
  doctorsError.value = null
  articlesError.value = null
  typesError.value = null

  const [docRes, artRes, typeRes] = await Promise.allSettled([
    getDoctors({ page: 1, pageSize: 20 }),
    getArticles({ page: 1, pageSize: 3 }),
    getDiabetesTypes(),
  ])

  if (docRes.status === 'fulfilled') doctors.value = docRes.value
  else doctorsError.value = docRes.reason instanceof Error ? docRes.reason : new Error('医师列表加载失败')
  if (artRes.status === 'fulfilled') articles.value = artRes.value
  else articlesError.value = artRes.reason instanceof Error ? artRes.reason : new Error('科普文章加载失败')
  if (typeRes.status === 'fulfilled') diabetesTypes.value = normalizeTypes(typeRes.value)
  else typesError.value = typeRes.reason instanceof Error ? typeRes.reason : new Error('糖尿病类型加载失败')

  // [新增] API 成功后写入缓存（部分成功也写入——已有数据即可缓存）
  if (docRes.status === 'fulfilled' || artRes.status === 'fulfilled' || typeRes.status === 'fulfilled') {
    writeHomeCache()
  }

  loading.value = false
}
```

**4.3.3 修改 `fetchSingle()` 重试函数** (第90-115行)

在每个重试成功分支末尾追加 `writeHomeCache()`：

```typescript
async function fetchSingle(which: 'doctors' | 'articles' | 'types'): Promise<void> {
  if (which === 'doctors') {
    doctorsError.value = null
    try {
      doctors.value = await getDoctors({ page: 1, pageSize: 20 })
      writeHomeCache()  // [新增] 重试成功后更新缓存
    } catch (e) {
      doctorsError.value = e instanceof Error ? e : new Error('医师列表加载失败')
    }
    return
  }
  if (which === 'articles') {
    articlesError.value = null
    try {
      articles.value = await getArticles({ page: 1, pageSize: 3 })
      writeHomeCache()  // [新增]
    } catch (e) {
      articlesError.value = e instanceof Error ? e : new Error('科普文章加载失败')
    }
    return
  }
  typesError.value = null
  try {
    diabetesTypes.value = normalizeTypes(await getDiabetesTypes())
    writeHomeCache()    // [新增]
  } catch (e) {
    typesError.value = e instanceof Error ? e : new Error('糖尿病类型加载失败')
  }
}
```

**4.3.4 修改 `return {}` 块** (第132-149行)

在 return 对象中新增 `clearHomeCache`：

```typescript
return {
  // state
  doctors, articles, diabetesTypes,
  loading, doctorsError, articlesError, typesError,
  detailLoading, detailError,
  // actions
  fetchHomeData, fetchDiabetesTypeDetail,
  retryDoctors, retryArticles, retryTypes,
  // cache [新增]
  clearHomeCache,
}
```

### 4.4 函数签名变更

| 项目 | 变更 |
|------|------|
| `readHomeCache(): HomeCache \| null` | 新增私有函数 |
| `writeHomeCache(): void` | 新增私有函数 |
| `clearHomeCache(): void` | 新增公开函数，暴露在 return 块中 |
| `fetchHomeData()` | 签名不变，内部增加缓存读取逻辑 |
| `fetchSingle()` | 签名不变，内部增加缓存写入 |

类型 `HomeCache` 为 Store 内部 interface，不导出——无需修改 `src/types/api.ts`。

### 4.5 数据流变化

```
修改前:
  onMounted → homeStore.fetchHomeData()
    → Promise.allSettled([getDoctors, getArticles, getDiabetesTypes])
    → 回填数据 → loading=false

修改后:
  onMounted → homeStore.fetchHomeData()
    → readHomeCache()
      ├── 命中 → 直接恢复数据到 ref → return（loading=false，无 API 请求）
      └── 未命中/过期
          → Promise.allSettled([...])
          → 回填数据
          → writeHomeCache()  ← 成功后写入
          → loading=false

重试流程:
  用户点击重试 → retryDoctors() → fetchSingle('doctors')
    → API 成功 → doctors.value = newData → writeHomeCache() ← 更新缓存中对应区块
```

### 4.6 边界条件与错误处理

| 场景 | 行为 |
|------|------|
| 首次访问（无缓存） | `readHomeCache()` 返回 null → 正常 API 请求 → 成功后写入缓存 |
| 1小时内刷新 | `readHomeCache()` 命中 → 直接恢复数据，Network 面板无 API 请求 |
| 超过1小时刷新 | `readHomeCache()` 检测过期 → 清除旧缓存 → API 请求 → 写入新缓存 |
| sessionStorage 满（QuotaExceededError） | `writeHomeCache()` catch 块静默丢弃，API 数据正常渲染，仅缓存写入失败 |
| 缓存 JSON 损坏 | `JSON.parse` 抛异常 → catch 块清除脏数据 → 降级为 API 请求 |
| 缓存结构不完整 | 结构校验失败 → 清除 → API 请求 |
| 部分 API 失败 | `Promise.allSettled` 部分成功也写入缓存（已有数据即可缓存，失败的区块下次仍走 API） |
| 重试成功 | 对应 retry* 函数成功后调用 `writeHomeCache()` 更新缓存 |
| clearHomeCache 被调用 | 清除 `qrzl_home_cache`，下次 `fetchHomeData` 将走 API 请求 |

### 4.7 与其他模块接口约定

- **暴露 `clearHomeCache()`**: 供 S8 的 `authStore.clearAuth()` 调用，登出时清除旧用户缓存。
- **依赖 `homeStore` 现有状态结构**: `doctors`, `articles`, `diabetesTypes` 三个 ref 的运行时类型与缓存结构一致。
- **Home.vue 无需修改**: `onMounted` 中 `void homeStore.fetchHomeData()` 调用保持不变；缓存命中时 `loading` 为 `false`（初始值），组件正常渲染缓存数据。

---

## Task 5: S2 -- LifePlan.vue sessionStorage 30分钟方案缓存

### 5.1 涉及文件

| 文件 | 行范围 | 操作 |
|------|--------|------|
| `src/stores/lifePlanStore.ts` | 第42-53行 | 修改 `fetchCurrent()` 函数 |
| `src/stores/lifePlanStore.ts` | 第61-87行 | 修改 `generate()` 函数 |
| `src/stores/lifePlanStore.ts` | 第93-103行 | 修改 `adjust()` 函数 |
| `src/stores/lifePlanStore.ts` | 第13-34行 | 状态声明区（无修改，仅为上下文） |
| `src/stores/lifePlanStore.ts` | 第139-157行 | 修改 `return {}` 块（暴露 `clearPlanCache`） |

### 5.2 当前代码结构

```
src/stores/lifePlanStore.ts
├── fetchCurrent() (第42-53行):
│     loading=true → getCurrentPlan() → currentPlan.value=data → loading=false
│     // 无 sessionStorage 读写
│
├── generate() (第61-87行):
│     防双击 → generatePlan(req) → currentPlan.value=... → completedMap=new Map()
│     // 无 sessionStorage 写
│
├── adjust() (第93-103行):
│     adjustPlan(req) → currentPlan.value=... → completedMap=new Map()
│     // 无 sessionStorage 写
│
└── return {} (第139-157行):
      // 无 clearPlanCache 暴露
```

### 5.3 修改后代码结构

**5.3.1 缓存常量与工具函数** (在 Store 函数体内、状态声明之后新增)

```typescript
// ===== sessionStorage 方案缓存 =====
const PLAN_CACHE_KEY = 'qrzl_plan_cache'
const PLAN_CACHE_TTL = 1800000 // 30 分钟（毫秒）

/**
 * completedMap (Map<number, CompletionStatus>) 不可直接 JSON 序列化。
 * 序列化时转为 [[k, v], ...] 数组格式；反序列化时 new Map(array) 恢复。
 */
interface PlanCache {
  currentPlan: PlanCurrentResponse | null
  /** completedMap 的数组表示: [[itemId, status], ...] */
  completedMapArray: Array<[number, CompletionStatus]>
  timestamp: number
}

function readPlanCache(): PlanCache | null {
  try {
    const raw = sessionStorage.getItem(PLAN_CACHE_KEY)
    if (!raw) return null
    const cache: PlanCache = JSON.parse(raw)
    if (
      typeof cache.timestamp !== 'number' ||
      !Array.isArray(cache.completedMapArray)
    ) {
      sessionStorage.removeItem(PLAN_CACHE_KEY)
      return null
    }
    if (Date.now() - cache.timestamp >= PLAN_CACHE_TTL) {
      sessionStorage.removeItem(PLAN_CACHE_KEY)
      return null
    }
    return cache
  } catch {
    sessionStorage.removeItem(PLAN_CACHE_KEY)
    return null
  }
}

function writePlanCache(): void {
  try {
    sessionStorage.setItem(PLAN_CACHE_KEY, JSON.stringify({
      currentPlan: currentPlan.value,            // 可为 null（空方案）
      completedMapArray: [...completedMap.value], // Map → Array
      timestamp: Date.now(),
    }))
  } catch {
    // QuotaExceededError 静默丢弃
  }
}

function clearPlanCache(): void {
  try {
    sessionStorage.removeItem(PLAN_CACHE_KEY)
  } catch { /* ignore */ }
}
```

**5.3.2 修改 `fetchCurrent()`** (第42-53行)

```typescript
async function fetchCurrent(): Promise<void> {
  // [新增] 检查 sessionStorage 缓存
  const cache = readPlanCache()
  if (cache) {
    currentPlan.value = cache.currentPlan // 可为 null（空方案）
    completedMap.value = new Map(cache.completedMapArray)
    // 缓存命中直接返回；loading 保持 false（初始值）
    return
  }

  loading.value = true
  error.value = null
  try {
    const data = await getCurrentPlan()
    currentPlan.value = data // 可为 null（空方案态）
    writePlanCache()          // [新增] API 成功后覆盖缓存
  } catch (e: unknown) {
    error.value = e instanceof Error ? e : new Error('方案加载失败')
  } finally {
    loading.value = false
  }
}
```

**5.3.3 修改 `generate()`** (第61-87行)

在成功分支中追加 `writePlanCache()`：

```typescript
async function generate(req: PlanGenerateRequest): Promise<boolean> {
  if (generating.value) return false
  generating.value = true
  generateError.value = null
  isConflict.value = false
  isHistoryFallback.value = false
  try {
    const data = await generatePlan(req)
    currentPlan.value = { ...data, generated_at: new Date().toISOString() }
    completedMap.value = new Map()
    writePlanCache()  // [新增] 成功后写入缓存
    return true
  } catch (e: unknown) {
    const status = (e as { response?: { status?: number } }).response?.status
    if (status === 409) {
      isConflict.value = true
      generateError.value = new Error('请求过于频繁，请稍后再试')
    } else {
      generateError.value = e instanceof Error ? e : new Error('方案生成失败')
      if (currentPlan.value) isHistoryFallback.value = true
    }
    return false
  } finally {
    generating.value = false
  }
}
```

**5.3.4 修改 `adjust()`** (第93-103行)

在成功分支中追加 `writePlanCache()`：

```typescript
async function adjust(req: PlanAdjustRequest): Promise<boolean> {
  adjustError.value = null
  try {
    const data = await adjustPlan(req)
    currentPlan.value = { ...data, generated_at: new Date().toISOString() }
    completedMap.value = new Map()
    writePlanCache()  // [新增] 成功后写入缓存
    return true
  } catch (e: unknown) {
    adjustError.value = e instanceof Error ? e : new Error('方案调整失败')
    return false
  }
}
```

**5.3.5 修改 `return {}` 块** (第139-157行)

```typescript
return {
  // state
  currentPlan, generating, loading,
  error, generateError, adjustError,
  isHistoryFallback, isConflict, completedMap,
  // actions
  fetchCurrent, generate, adjust,
  createPunch: createPunchAction,
  retryGenerate, retryFetchCurrent,
  // cache [新增]
  clearPlanCache,
}
```

### 5.4 函数签名变更

| 项目 | 变更 |
|------|------|
| `readPlanCache(): PlanCache \| null` | 新增私有函数 |
| `writePlanCache(): void` | 新增私有函数 |
| `clearPlanCache(): void` | 新增公开函数，暴露在 return 块中 |
| `fetchCurrent()` | 签名不变，内部增加缓存读取 + 写入 |
| `generate()` | 签名不变，内部增加缓存写入 |
| `adjust()` | 签名不变，内部增加缓存写入 |

类型 `PlanCache` 为 Store 内部 interface，不导出。

### 5.5 数据流变化

```
修改前:
  onMounted → store.fetchCurrent() → getCurrentPlan() → currentPlan.value = data
  (页面刷新后重新请求 API)

修改后:
  onMounted → store.fetchCurrent()
    → readPlanCache()
      ├── 命中 → currentPlan = cache.currentPlan, completedMap = new Map(cache.completedMapArray)
      │         → return（loading=false，无 API 请求）
      └── 未命中/过期 → getCurrentPlan() → currentPlan = data → writePlanCache()

generate/adjust 成功:
  generate(req) → generatePlan() 成功
    → currentPlan = newData + completedMap = new Map()
    → writePlanCache()  ← 缓存更新
```

### 5.6 边界条件与错误处理

| 场景 | 行为 |
|------|------|
| 首次访问（无方案，无缓存） | `fetchCurrent()` → API 返回 `data: null` → `currentPlan = null` → `writePlanCache()` 缓存空方案（区分"未请求过"和"已请求过但无数据"） |
| 30分钟内刷新（有方案） | `readPlanCache()` 命中 → 恢复 `currentPlan` + `completedMap` → 无 API 请求 |
| 超过30分钟刷新 | 缓存过期 → 清除 → API 请求 → 新缓存 |
| `completedMap` 序列化 | `Map<number, CompletionStatus>` → `[[k, v], ...]` 数组 → JSON → 反序列化 `new Map(array)` |
| 生成方案后刷新 | `generate()` 中 `writePlanCache()` 已写入 → 30分钟内刷新命中缓存 |
| 调整方案后刷新 | `adjust()` 中 `writePlanCache()` 已写入 → 30分钟内刷新命中缓存 |
| 空方案缓存 | `currentPlan === null` 也写入缓存，刷新后跳过 API 请求（避免用户无方案时每次刷新都请求） |
| sessionStorage 满 | `writePlanCache()` catch 静默丢弃；方案数据正常使用，仅缓存不可用 |
| `createPunch` 后缓存 | `createPunchAction` 更新 `completedMap`（乐观更新），但**不写缓存**——打卡操作频繁，每次写 sessionStorage 开销大（约 1-2ms 序列化）；缓存以方案生成为粒度更新（generate/adjust/fetchCurrent 时全量写入）。**已知权衡**：用户在30分钟内打卡后刷新页面，`completedMap` 将恢复为上次 generate/adjust/fetchCurrent 时的状态。若产品需求要求打卡后刷新保持最新状态，可在 `createPunchAction` 成功后追加 `writePlanCache()`。建议 Product Owner 确认此行为是否可接受。 |
| clearPlanCache 被调用 | 清除 `qrzl_plan_cache`，下次 `fetchCurrent` 走 API |

### 5.7 与其他模块接口约定

- **暴露 `clearPlanCache()`**: 供 S8 的 `authStore.clearAuth()` 调用，登出时清除旧用户方案缓存。
- **`createPunch` 不写缓存**: 详见 5.6 边界条件表最后一行。此为有意的设计权衡，已标注待 Product Owner 确认。

---

## Task 6: S5a -- ArticleDetailView.vue + /news/article/:id 路由 + API

### 6.1 涉及文件清单

| 操作 | 文件路径 | 行范围 / 说明 |
|:----:|---------|--------------|
| **新建** | `src/views/ArticleDetailView.vue` | 完整新建，~150行 (script + template + style) |
| **修改** | `src/types/api.ts` | 第139行之后（`Article` 接口定义后）新增 `ArticleDetail` 接口 |
| **修改** | `src/composables/useHomeApi.ts` | 第72行之后（`getDiabetesType` 函数之后）新增 `getArticle` 函数 |
| **修改** | `src/router/index.ts` | 第24行之前（`/news` 路由之前）插入 `/news/article/:id` 路由 |

### 6.2 类型定义变更

#### 6.2.1 `src/types/api.ts` — 新增 `ArticleDetail`

在 `Article` 接口定义（第139行）之后追加：

```typescript
/** 文章详情（含正文），GET /api/articles/:id
 *  设计依据: docs/2_detailed_design_v3.md 3.2.20 节 (第2051行)
 */
export interface ArticleDetail extends Article {
  /** Markdown 正文 */
  content: string
  /** 当前用户是否已收藏 */
  is_collected: boolean
}
```

### 6.3 API 层变更

#### 6.3.1 `src/composables/useHomeApi.ts` — 新增 `getArticle`

在 `getDiabetesType` 函数（第72行）之后追加：

```typescript
/**
 * 获取单篇文章详情（含 Markdown 正文）
 * GET /api/articles/:id
 * 设计依据: docs/2_detailed_design_v3.md 3.2.20 节
 *
 * @param id - 文章主键 (number)。注意：使用 String(id) 直接拼接，非 encodeURIComponent
 *             （id 为 number 主键，不含特殊字符；与 getDiabetesType 保持一致的拼接模式）
 * @returns ArticleDetail（含 content 和 is_collected）
 */
export async function getArticle(id: number): Promise<ArticleDetail> {
  const res = await api.get<{ success: boolean; data: ArticleDetail; message?: string }>(
    `/articles/${id}`
  )
  return res.data.data
}
```

注意事项：
- `id` 为 number 主键，使用模板字符串 `` `/articles/${id}` `` 直接拼接（`${id}` 自动调用 `id.toString()`），不使用 `encodeURIComponent`——与 `getDiabetesType` 的模式一致。
- `getDiabetesType` 中使用了 `encodeURIComponent(id)`（第69行），这是不必要的（number 主键不含需编码字符），但不影响功能。`getArticle` 不延续此模式。

### 6.4 组件设计: ArticleDetailView.vue

#### 6.4.1 组件状态机

```
            ┌──────────────┐
            │   加载态      │ ← 进入页面，API 请求中
            │ (loading)    │   展示 Spinner / 骨架屏
            └──────┬───────┘
                   │
         ┌─────────┴─────────┐
         │                   │
    API 成功              API 失败
         │                   │
         ▼                   ▼
  ┌──────────────┐    ┌──────────────┐
  │   正常渲染    │    │   错误态      │
  │ (loaded)     │    │ (error)      │
  │ 文章内容展示  │    │ 错误消息      │
  └──────────────┘    │ + 重试按钮    │
                      └──────────────┘

组件内404降级：
  如果 API 返回 success: false 或 data 为 null
  → 展示 "文章不存在或已被删除" 提示（非路由级 404）
```

#### 6.4.2 组件结构设计

```
ArticleDetailView.vue
├── <script setup lang="ts">
│   ├── 导入: ref, computed, onMounted, useRoute, useRouter
│   ├── 导入: marked, DOMPurify, getArticle
│   ├── 导入类型: ArticleDetail
│   ├── 状态:
│   │   ├── article: ref<ArticleDetail | null>(null)
│   │   ├── loading: ref<boolean>(true)
│   │   ├── error: ref<string | null>(null)
│   │   └── notFound: ref<boolean>(false)
│   ├── 计算属性:
│   │   └── safeContent: computed → marked.parse + DOMPurify.sanitize
│   ├── 方法:
│   │   ├── fetchArticle(): 从 route.params.id 获取文章
│   │   ├── goBack(): router.push('/news')
│   │   └── toggleCollect(): 收藏切换（本期占位 console.warn）
│   └── onMounted: 调用 fetchArticle()
│
├── <template>
│   ├── 加载态 (loading && !error && !notFound)
│   │   └── Spinner / 骨架屏
│   ├── 错误态 (error)
│   │   └── 错误消息 + 重试按钮
│   ├── 404态 (notFound)
│   │   └── "文章不存在" 提示 + 返回按钮
│   └── 正常态 (article)
│       ├── 返回按钮 (← 返回资讯列表)
│       ├── 文章标题 + 元信息 (作者/分类/发布时间/阅读量/标签)
│       ├── 收藏按钮 (is_collected toggle)
│       └── 正文渲染区 (v-html="safeContent")
│
└── <style scoped>
    ├── 页面容器 (max-width: 480px, margin: 0 auto)
    ├── Header 粘性顶栏 (返回按钮 + 标题)
    ├── 文章元信息区 (flex 布局)
    ├── 正文渲染区 (Markdown→HTML rich 排版)
    └── 骨架屏 / 错误态样式
```

#### 6.4.3 完整代码结构

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { getArticle } from '@/composables/useHomeApi'
import type { ArticleDetail } from '@/types/api'

const route = useRoute()
const router = useRouter()

// ===== 状态 =====
const article = ref<ArticleDetail | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const notFound = ref(false)

// ===== Markdown 净化链（复用 LifePlan safeContentHtml 范式） =====
const safeContent = computed(() => {
  const md = article.value?.content
  if (typeof md !== 'string' || md.length === 0) return ''
  const html = marked.parse(md, { async: false })
  if (typeof html !== 'string') return ''
  return DOMPurify.sanitize(html)
})

// ===== 日期格式化（"2026-06-23T07:30:00" → "2026年6月23日"） =====
function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  } catch {
    return iso
  }
}

// ===== 获取文章详情 =====
async function fetchArticle(): Promise<void> {
  const id = Number(route.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    notFound.value = true
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  notFound.value = false
  try {
    const data = await getArticle(id)
    if (!data) {
      notFound.value = true
    } else {
      article.value = data
    }
  } catch (e: unknown) {
    // 区分 404 与一般错误
    const status = (e as { response?: { status?: number } }).response?.status
    if (status === 404) {
      notFound.value = true
    } else {
      error.value = (e as { message?: string }).message || '文章加载失败，请稍后重试'
    }
  } finally {
    loading.value = false
  }
}

// ===== 导航 =====
function goBack(): void {
  router.push('/news')
}

// ===== 收藏（本期占位） =====
function toggleCollect(): void {
  // TODO: 调用收藏 API
  console.warn('[ArticleDetailView] 收藏功能待实现 (S5a 占位)')
}
</script>

<template>
  <div class="article-page page-enter">
    <!-- Header 粘性顶栏 -->
    <header class="article-header">
      <button class="article-back press" @click="goBack" aria-label="返回资讯列表">
        <i class="fa-solid fa-chevron-left"></i>
      </button>
      <h1 class="article-header-title">文章详情</h1>
      <!-- 收藏按钮（正常态可见） -->
      <button
        v-if="article"
        class="article-collect-btn press"
        @click="toggleCollect"
        :aria-label="article.is_collected ? '取消收藏' : '收藏文章'"
      >
        <i
          :class="[
            'fa-solid',
            article.is_collected ? 'fa-bookmark article-collected' : 'fa-bookmark article-not-collected'
          ]"
        ></i>
      </button>
      <div v-else class="article-header-spacer"></div>
    </header>

    <!-- 加载态 -->
    <div v-if="loading" class="article-skeleton">
      <div class="skeleton-line skeleton-title"></div>
      <div class="skeleton-line skeleton-meta"></div>
      <div class="skeleton-line skeleton-long"></div>
      <div class="skeleton-line skeleton-mid"></div>
      <div class="skeleton-line skeleton-short"></div>
    </div>

    <!-- 404态 -->
    <div v-else-if="notFound" class="article-error-card">
      <i class="fa-solid fa-file-circle-question article-error-icon"></i>
      <h2 class="article-error-title">文章不存在</h2>
      <p class="article-error-desc">文章可能已被删除，或链接地址不正确</p>
      <button class="article-retry-btn press" @click="goBack">返回资讯列表</button>
    </div>

    <!-- 错误态 -->
    <div v-else-if="error" class="article-error-card">
      <i class="fa-solid fa-triangle-exclamation article-error-icon"></i>
      <h2 class="article-error-title">加载失败</h2>
      <p class="article-error-desc">{{ error }}</p>
      <button class="article-retry-btn press" @click="fetchArticle">重试</button>
    </div>

    <!-- 正常态 -->
    <template v-else-if="article">
      <!-- 文章元信息 -->
      <section class="article-meta-section">
        <h1 class="article-title">{{ article.title }}</h1>
        <div class="article-meta-row">
          <span class="article-meta-item">
            <i class="fa-solid fa-user-pen"></i> {{ article.author }}
          </span>
          <span class="article-meta-sep">|</span>
          <span class="article-meta-item">
            <i class="fa-solid fa-layer-group"></i> {{ article.category }}
          </span>
          <span class="article-meta-sep">|</span>
          <span class="article-meta-item">
            <i class="fa-solid fa-calendar"></i> {{ formatDate(article.created_at) }}
          </span>
          <span class="article-meta-sep">|</span>
          <span class="article-meta-item">
            <i class="fa-solid fa-eye"></i> {{ article.views }} 阅读
          </span>
        </div>
        <!-- 标签 -->
        <div v-if="article.tags.length > 0" class="article-tags-row">
          <span v-for="tag in article.tags" :key="tag" class="article-tag">{{ tag }}</span>
        </div>
      </section>

      <!-- 正文渲染区（Markdown → HTML） -->
      <section class="article-body-section">
        <div
          v-if="safeContent"
          class="article-body markdown-body"
          v-html="safeContent"
        ></div>
        <p v-else class="article-empty-body">暂无正文内容</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* ===== 页面容器 ===== */
.article-page {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--color-bg);
  padding-bottom: calc(var(--tab-bar-height) + 8px);
}

/* ===== Header 粘性顶栏 ===== */
.article-header {
  position: sticky;
  top: 0;
  z-index: 30;
  background: var(--color-card);
  border-bottom: 1px solid var(--color-divider);
  padding: var(--spacing-lg) var(--spacing-xl);
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}
.article-header-title {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--color-text-primary);
  flex: 1;
}
.article-back {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  font-size: var(--font-size-body);
  border-radius: var(--radius-full);
}
.article-collect-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  font-size: 18px;
  border-radius: var(--radius-full);
}
.article-collected {
  color: #FAAD14;
}
.article-not-collected {
  color: var(--color-divider);
}
.article-header-spacer {
  width: 32px;
}

/* ===== 文章元信息区 ===== */
.article-meta-section {
  padding: var(--spacing-xl) var(--spacing-lg) var(--spacing-md);
  background: var(--color-card);
  border-bottom: 1px solid var(--color-divider);
}
.article-title {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.4;
  margin-bottom: var(--spacing-md);
}
.article-meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}
.article-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.article-meta-sep {
  color: var(--color-divider);
}
.article-tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
}
.article-tag {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--color-primary-light);
  color: var(--color-primary);
}

/* ===== 正文渲染区 ===== */
.article-body-section {
  padding: var(--spacing-xl) var(--spacing-lg);
}
.article-body {
  font-size: 15px;
  line-height: 1.8;
  color: var(--color-text-primary);
}
/* Markdown 内容排版 */
.article-body :deep(h1),
.article-body :deep(h2),
.article-body :deep(h3) {
  margin: 1.2em 0 0.6em;
  font-weight: 700;
  color: var(--color-text-primary);
}
.article-body :deep(p) {
  margin: 0.8em 0;
}
.article-body :deep(ul),
.article-body :deep(ol) {
  padding-left: 1.5em;
  margin: 0.6em 0;
}
.article-body :deep(li) {
  margin: 0.3em 0;
}
.article-body :deep(blockquote) {
  border-left: 3px solid var(--color-primary);
  padding-left: var(--spacing-md);
  color: var(--color-text-secondary);
  margin: 0.8em 0;
}
.article-body :deep(code) {
  background: var(--color-bg);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 13px;
}
.article-body :deep(pre) {
  background: var(--color-bg);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  overflow-x: auto;
  margin: 0.8em 0;
}
.article-body :deep(img) {
  max-width: 100%;
  border-radius: var(--radius-md);
  margin: 0.6em 0;
}
.article-body :deep(a) {
  color: var(--color-primary);
}
.article-empty-body {
  text-align: center;
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
  padding: var(--spacing-2xl) 0;
}

/* ===== 骨架屏 ===== */
.article-skeleton {
  padding: var(--spacing-xl) var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.skeleton-title {
  height: 24px;
  width: 70%;
}
.skeleton-meta {
  height: 14px;
  width: 50%;
}
.skeleton-line {
  height: 14px;
  border-radius: var(--radius-sm);
  background: var(--color-divider);
  animation: article-pulse 1.5s ease-in-out infinite;
}
.skeleton-long { width: 100%; }
.skeleton-mid { width: 75%; }
.skeleton-short { width: 50%; }
@keyframes article-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}

/* ===== 错误/404 态 ===== */
.article-error-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-3xl) var(--spacing-xl);
  text-align: center;
}
.article-error-icon {
  font-size: 48px;
  color: var(--color-divider);
  margin-bottom: var(--spacing-lg);
}
.article-error-title {
  font-size: var(--font-size-h3);
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-sm);
}
.article-error-desc {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-xl);
  line-height: 1.5;
}
.article-retry-btn {
  padding: 10px 24px;
  border-radius: var(--radius-button);
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-size-body);
  font-weight: 700;
  border: none;
}

/* ===== 按压动画 ===== */
.press:active {
  transform: scale(0.96);
  transition: var(--transition-fast);
}
</style>
```

### 6.5 路由注册

#### 6.5.1 `src/router/index.ts` — 新增路由

在 `/news` 路由（第21-25行）**之前**插入：

```typescript
  {
    path: '/news/article/:id',
    name: 'ArticleDetail',
    component: () => import('@/views/ArticleDetailView.vue'),
    meta: { requiresAuth: false },
  },
```

修改后的路由顺序：
```
/news/article/:id  → ArticleDetailView.vue  ← [新增，在 /news 之前]
/news              → NewsView.vue           ← [现有]
```

此顺序确保 `/news/article/1` 优先匹配到详情路由，而非被 `/news` 的模糊匹配捕获。

### 6.6 数据流

```
用户点击文章 (Home.vue goArticle)
  → router.push('/news/article/' + id)
    → Vue Router 匹配 /news/article/:id
    → 懒加载 ArticleDetailView.vue
    → onMounted → fetchArticle()
      → Number(route.params.id) 提取 id
      → getArticle(id) → GET /api/articles/:id
        → 成功: article.value = data → 模板渲染
        → 404: notFound = true → 降级提示
        → 其他错误: error = message → 错误态
```

### 6.7 边界条件与错误处理

| 场景 | 行为 |
|------|------|
| 正常文章 ID (如 /news/article/1) | 调用 `getArticle(1)` → 渲染标题、元信息、正文 |
| 不存在的文章 ID (如 /news/article/99999) | 后端返回 404 → `notFound = true` → "文章不存在" 提示 + 返回按钮 |
| `route.params.id` 非数字 (如 "abc") | `Number("abc")` = NaN → `Number.isFinite(NaN)` = false → `notFound = true` |
| `route.params.id` 为 0 或负数 | `id <= 0` → `notFound = true` |
| API 网络错误 | catch → 通用错误消息 + 重试按钮 |
| 文章 `content` 为空字符串 | `safeContent` computed 返回 '' → `v-if="safeContent"` = false → "暂无正文内容" |
| 文章 `content` 为 Markdown | `marked.parse()` + `DOMPurify.sanitize()` 净化后渲染 |
| 文章 `content` 含 XSS (如 `<script>`) | `DOMPurify.sanitize()` 移除危险标签/属性 |
| `tags` 数组为空 | `v-if="article.tags.length > 0"` 不渲染标签行 |
| `cover` 为 null | 文章详情页不展示封面图（封面图主要用于列表卡片） |
| 后端 API 未就绪 (`GET /api/articles/:id`) | 详见 6.8 节降级方案 |

### 6.8 后端 API 未就绪时的降级方案

若 `GET /api/articles/:id` 端点尚未部署：

**降级方案**：用 `getArticles()` 拉取文章列表后客户端筛选。

```typescript
// 降级版 fetchArticle（替换上述 getArticle 调用）
import { getArticles } from '@/composables/useHomeApi'

async function fetchArticle(): Promise<void> {
  // ... id 校验同上 ...
  try {
    // 降级：拉取列表后客户端 find
    const list = await getArticles({ page: 1, pageSize: 20 })
    const found = list.find(a => a.id === id) ?? null
    if (!found) {
      notFound.value = true
      return
    }
    // 注意：Article 类型不含 content 字段，正文为空
    article.value = {
      ...found,
      content: '',           // 降级模式下无正文
      is_collected: false,   // 默认未收藏
    }
  } catch (e: unknown) {
    // 错误处理同上
  }
}
```

**降级方案限制**：
1. **分页风险**: `getArticles()` 无参调用时后端默认分页行为未验证。若默认 `page=1, pageSize=10`，只能查找首页文章。若目标文章不在首页，`find()` 失败误判为"不存在"。
2. **正文缺失**: `Article` 类型不含 `content` 字段，降级交付物为"文章元数据详情页"（无正文）。模板中 `v-if="safeContent"` 分支自动降级为"暂无正文内容"。
3. **建议**: 降级方案标注为临时措施，后端 API 就绪后立即切换到正式实现（替换 import 和 fetchArticle 中的 getArticles → getArticle）。

### 6.9 可复用的现有模式

| 模式 | 来源文件 | 在 ArticleDetailView 中的对应 |
|------|---------|---------------------------|
| Markdown 净化链 | `LifePlan.vue:94-99` (`safeContentHtml`) | `safeContent` computed |
| 错误消息提取 | `Punch.vue:63-77` (`getErrorMessage`) | 简化为直接读取 `e.message`（ArticleDetailView 错误处理较简单） |
| 骨架屏脉动动画 | `Punch.vue:926-976` | `article-pulse` keyframes |
| 粘性 Header 布局 | `Punch.vue:454-486` | `article-header` 样式 |
| 按压动画 | `Punch.vue:1007-1011` | `.press:active` |

### 6.10 与其他模块接口约定

- **路由注册顺序**: `/news/article/:id` 必须在 `/news` 之前，确保精确匹配优先。
- **Home.vue 跳转 (后续 Task S6)**: `goArticle(id)` 将改为 `router.push('/news/article/' + id)`，依赖本 Task 创建的路由和组件。
- **收藏 API**: 本期以 `console.warn` 占位，后续迭代补充 `POST /api/articles/:id/collect` 调用。
- **`getArticle` API 函数**: 位于 `useHomeApi.ts`，与 `getDoctors`/`getArticles`/`getDiabetesTypes`/`getDiabetesType` 同文件，遵循相同的 `res.data.data` 解包模式。

---

## 跨任务依赖验证矩阵

```
修订后的执行顺序: Task1 (S9) → Task2 (S7) → Task3 (S3)
并行组: Task4 (S1), Task5 (S2), Task6 (S5a) 独立并行

Task1 (S9) ────┬──→ Task2 (S7)   [S7 在 setFilter 中追加 fetchAnalysis 调用 (竞态已保护)]
               └──→ Task3 (S3)   [S3 调用 setFilter，setFilter 调用 fetchAnalysis (竞态已保护)]

Task2 (S7) ────┬──→ Task3 (S3)   [S3 中 await setFilter 正确等待 fetchList 完成；
               │                   setFilter 已增强: await fetchList() + 防抖 fetchAnalysis()]

Task4 (S1) ──── 独立             [无依赖其他 Task]
Task5 (S2) ──── 独立             [无依赖其他 Task]
Task6 (S5a) ─── 独立             [无依赖其他 Task，但为后续 S6 提供基础]

S1 + S2 ──────→ S8 (后续轮次)    [暴露 clearHomeCache / clearPlanCache 供 clearAuth 调用]
S5a ──────────→ S6 (后续轮次)    [路由 + 组件就绪，Home.vue goArticle 可跳转]
```

**关键修正**（相对于 v1）：
- **阻塞问题1（已修正）**: `setFilter` 改为 `async function`，返回 `Promise<void>`。内部 `await fetchList()` 确保调用方 `await store.setFilter(...)` 后 `store.error` 已回填，`listViewMode` 状态机逻辑正确。
- **阻塞问题2（已修正）**: 执行顺序从 `Task1→Task2(S3)→Task3(S7)` 调整为 `Task1→Task2(S7)→Task3(S3)`。S7 先增强 setFilter（改为 async + 追加 fetchAnalysis），S3 再使用增强后的 setFilter，消除了中间窗口期分析数据缺失的问题。

---

## 文件修改汇总

| 文件 | Task1 S9 | Task2 S7 | Task3 S3 | Task4 S1 | Task5 S2 | Task6 S5a | 总修改行数 |
|------|:----:|:----:|:----:|:----:|:----:|:----:|:--------:|
| `src/stores/punchStore.ts` | ~8行 | ~10行 | — | — | — | — | ~18行 |
| `src/views/Punch.vue` | — | — | ~20行 | — | — | — | ~20行 |
| `src/stores/homeStore.ts` | — | — | — | ~55行 | — | — | ~55行 |
| `src/stores/lifePlanStore.ts` | — | — | — | — | ~60行 | — | ~60行 |
| `src/types/api.ts` | — | — | — | — | — | ~8行 | ~8行 |
| `src/composables/useHomeApi.ts` | — | — | — | — | — | ~12行 | ~12行 |
| `src/router/index.ts` | — | — | — | — | — | ~6行 | ~6行 |
| `src/views/ArticleDetailView.vue` | — | — | — | — | — | **新建**~210行 | ~210行 |
| **合计** | ~8 | ~10 | ~20 | ~55 | ~60 | ~236 | **~389行** |

---

*详细设计文件结束（v1-r1，已修正审查报告中的阻塞问题）。*
