# detail_v3 — 打卡记录与分析 Punch 前端详细设计（第 3 轮）

> 产出方：Designer 角色
> 范围：Task 3 = `src/views/Punch.vue` 完整重写 + 配套 `types/api.ts` 增补 / `stores/punchStore.ts` 新建 / `composables/usePunchApi.ts` 新建
> 视觉与交互唯一基准：`docs/prototype.html` Punch 模板（1246-1305 行）+ mock（196-202 行 `punchRecords`）
> 复用范式：`detail_v2.md`（LifePlan 的设计风格、类型定义颗粒度、store/api 签名格式）、`Risk.vue`（marked+DOMPurify+getErrorMessage+onUnmounted timer）、`homeStore.ts`（setup-store + retry）、`useHomeApi.ts`（axios 内联泛型解包）

---

## 0. 定调收敛（必读）

| # | 未决点 | 最终结论 |
|---|---|---|
| 1 | Punch 页是否提供新增打卡入口？ | **否**。打卡创建在 LifePlan 页完成（Task 2 已实现 `handlePunch` → `store.createPunch`）；Punch 页只做**列表展示、筛选、统计、AI 分析**，不提供新增打卡入口。空态引导跳 `/life-plan`，CTA 文案「去打卡」。 |
| 2 | 分页策略：翻页 vs 滚动触底加载更多？ | **`loadMore` 追加模式**。`fetchList` 为首页/筛选重置（全量替换 `records`）；`loadMore` 为下一页追加（`records.push(...newRecords)`）。分页复用已有 `PaginatedResponse<PunchRecord>` 和 `PaginationParams`。 |
| 3 | 趋势柱状图技术方案？ | **纯 CSS**（div height 百分比 + `linear-gradient` 背景），不引入图表库（ECharts/Chart.js 等）。7 列对应近 7 天，每列 `height` 按 `diet_completed / maxInTrend * 100`（与运动合成单柱或双叠柱——见 §4 视图派生）。 |
| 4 | AI 分析 `adherence_comment` 是否含 Markdown？ | **按 Markdown 处理**。契约注释为 `string`，但 §3.2.18 示例为纯文本。Designer 采用 **Markdown 兼容安全链**：`marked.parse → DOMPurify.sanitize → v-html`（即使当前后端返回纯文本，`marked.parse` 仍正确输出 `<p>…</p>`，净化后安全渲染）。此链路与 LifePlan 方案正文一致。 |
| 5 | AI 分析失败降级 | 降级为通用提示条（非空白区）：固定文案「AI 分析暂不可用，请稍后重试」+ 重试按钮。统计卡（diet_completion_rate / exercise_completion_rate / total_punches）若 analysis 为 null 则**整区替换为降级 UI**（统计卡依赖 analysis 数据，不单独渲染）。 |
| 6 | 日期范围筛选 UI 形态 | 两个 `<input type="date">`（startDate / endDate），`change` 事件触发 `store.setFilter`。原型 1246-1305 无日期筛选器——需求 4.7「支持按日期范围和打卡类型筛选」要求前端提供。放置于筛选 chip 行上方。 |
| 7 | 列表排序 | 按 `punch_time DESC`（后端 SQL 已 ORDER BY），前端**不二次排序**。 |
| 8 | 子组件抽离 | 全部内联于 `Punch.vue`，不抽 `src/components/punch/`，对齐 Round 1/2 决策。 |

---

## 1. 类型清单（`src/types/api.ts` 仅增补 `PunchAnalysisResponse`，勿动既有）

> Task 2 已落地且位于 `types/api.ts`：`PunchType`、`CompletionStatus`、`PunchCreateRequest`、`PunchCreateResponse`、`PunchListParams`、`PunchRecord`。
> 本轮**仅增补** `PunchAnalysisResponse`，追加在文件末尾 `PunchRecord` 之后。不动既有任何类型。

```typescript
// ========== 打卡分析类型（Task 3）==========

/**
 * 打卡分析响应（GET /api/punch/analysis 的 data）。
 * 字段严格对齐 docs/2_detailed_design_v3.md §3.2.18。
 */
export interface PunchAnalysisResponse {
  /** 饮食总完成率（0-1 浮点，如 0.75 表示 75%） */
  diet_completion_rate: number;
  /** 运动总完成率（0-1 浮点） */
  exercise_completion_rate: number;
  /** 查询时段内总打卡次数 */
  total_punches: number;
  /** 近 7 天每日完成趋势数组（不足 7 天则后端补 0 或返回实际天数） */
  last_7_days_trend: Array<{
    /** 日期 YYYY-MM-DD */
    date: string;
    /** 当日饮食完成数 */
    diet_completed: number;
    /** 当日运动完成数 */
    exercise_completed: number;
  }>;
  /**
   * AI 依从性评语（可能含 Markdown）。
   * 前端必须经 marked.parse → DOMPurify.sanitize → v-html 渲染。
   * 当前后端示例为纯文本，marked.parse 可正确处理输出 <p>…</p>。
   */
  adherence_comment: string;
  /** AI 改进建议列表（纯文本字符串数组） */
  improvement_suggestions: string[];
}
```

> **字段说明**：
> - `diet_completion_rate` / `exercise_completion_rate`：0-1 浮点，UI 展示时乘 100 加 `%`。
> - `last_7_days_trend`：数组长度 ≤ 7。每元素含当日饮食/运动完成数（非比例）。UI 层派生柱高百分比。
> - `adherence_comment`：Markdown 安全链渲染（见 §4）。
> - `improvement_suggestions`：纯文本，以 `<li>` 逐条渲染，不经 marked（非 Markdown）。

---

## 2. `src/composables/usePunchApi.ts`（新建）

> 全部走 `useApi.ts` 的 `api`（axios，baseURL `/api`，JWT 拦截器），禁 `any`，泛型精准解包。参照 `useHomeApi.ts` / `useLifePlanApi.ts` 的内联 body 泛型 + `api` import 范式。

```typescript
import { api } from '@/composables/useApi'
import type {
  PunchListParams,
  PunchRecord,
  PunchAnalysisResponse,
  PaginationInfo,
} from '@/types/api'

/**
 * GET /api/punch/list — 打卡记录分页列表（含日期范围 + 类型筛选）。
 * 请求：params 作为 query 参数（startDate/endDate/punch_type/page/pageSize）。
 * 响应结构：{ success, data: PunchRecord[], pagination: PaginationInfo }
 * 解包：res.data.data → records, res.data.pagination → pagination。
 */
export async function getPunchList(
  params: PunchListParams,
): Promise<{ records: PunchRecord[]; pagination: PaginationInfo }> {
  const res = await api.get<{
    success: boolean
    data: PunchRecord[]
    pagination: PaginationInfo
    message?: string
  }>('/punch/list', { params })
  return { records: res.data.data, pagination: res.data.pagination }
}

/**
 * GET /api/punch/analysis — AI 打卡分析。
 * 响应结构：{ success, data: PunchAnalysisResponse }
 * 解包：res.data.data → PunchAnalysisResponse。
 */
export async function getPunchAnalysis(): Promise<PunchAnalysisResponse> {
  const res = await api.get<{
    success: boolean
    data: PunchAnalysisResponse
    message?: string
  }>('/punch/analysis')
  return res.data.data
}
```

> **签名要点**：
> - `getPunchList` 返回 `{ records, pagination }`，非裸 `data` 数组 —— store 需同时取 records 填列表 + pagination 判分页。
> - `getPunchAnalysis` 返回裸 `PunchAnalysisResponse` —— store 直接回填。
> - 分页 query 参数走 `{ params }`（axios GET 自动序列化），**非 body**。`PunchListParams extends PaginationParams`，含 `page`/`pageSize` 必填字段 + 可选 `startDate`/`endDate`/`punch_type`。

---

## 3. `src/stores/punchStore.ts`（新建，setup-store）

> 参照 `homeStore.ts` / `lifePlanStore.ts` 写法。`defineStore('punch', () => {...})`。禁 `any`，禁读 `localStorage.token`。

### 3.1 state

```typescript
import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import type {
  PunchRecord,
  PunchAnalysisResponse,
  PunchListParams,
  PunchType,
  PaginationInfo,
} from '@/types/api'
import { getPunchList, getPunchAnalysis } from '@/composables/usePunchApi'

export const usePunchStore = defineStore('punch', () => {
  // ===== state =====
  /** 打卡记录列表（loadMore 追加，fetchList/setFilter 全量替换） */
  const records = ref<PunchRecord[]>([])
  /** 分页信息（null = 未加载或加载失败） */
  const pagination = ref<PaginationInfo | null>(null)
  /** 当前筛选条件 */
  const filter = reactive<{
    startDate?: string
    endDate?: string
    punch_type?: PunchType
  }>({})
  /** AI 分析结果（null = 未加载或加载失败） */
  const analysis = ref<PunchAnalysisResponse | null>(null)

  /** 列表初始加载中（fetchList 首屏或 setFilter 重置） */
  const listLoading = ref<boolean>(false)
  /** 列表加载更多中（loadMore 追加） */
  const listLoadingMore = ref<boolean>(false)
  /** AI 分析加载中 */
  const analysisLoading = ref<boolean>(false)

  /** 列表加载错误 */
  const error = ref<Error | null>(null)
  /** AI 分析加载错误 */
  const analysisError = ref<Error | null>(null)
```

### 3.2 getters

```typescript
  // ===== getters =====
  /** 是否还有下一页 */
  const hasMore = computed(() => {
    if (!pagination.value) return false
    return pagination.value.page < pagination.value.totalPages
  })

  /** 当前页码（loadMore 用） */
  const currentPage = computed(() => pagination.value?.page ?? 1)
```

### 3.3 actions 实现要点

> **防竞态方案（fetchList / loadMore）**：store 内维护 `requestId` 递增计数器（`const requestId = ref(0)`）。`fetchList` / `loadMore` 在发起请求前 `requestId.value++` 并快照 `const snapshot = requestId.value`；await 返回后仅当 `snapshot === requestId.value` 时才赋值 records/pagination/error。防止快速切换筛选条件时旧请求后返回覆盖新请求结果。

```typescript
  // ===== actions =====

  /** 请求序列号（防竞态：快速切换筛选时旧响应不覆盖新响应） */
  const requestId = ref(0)

  /**
   * 拉取打卡列表（首屏 / 筛选重置）。
   * 全量替换 records + pagination；清空 error。
   * page 固定为 1。
   */
  async function fetchList(): Promise<void> {
    listLoading.value = true
    error.value = null
    requestId.value++
    const snapshot = requestId.value
    try {
      const params: PunchListParams = {
        page: 1,
        pageSize: 20,
        ...(filter.startDate ? { startDate: filter.startDate } : {}),
        ...(filter.endDate ? { endDate: filter.endDate } : {}),
        ...(filter.punch_type ? { punch_type: filter.punch_type } : {}),
      }
      const { records: r, pagination: p } = await getPunchList(params)
      if (snapshot !== requestId.value) return // 已被后续请求覆盖，丢弃
      records.value = r
      pagination.value = p
    } catch (e) {
      if (snapshot !== requestId.value) return
      error.value = e instanceof Error ? e : new Error('打卡记录加载失败')
    } finally {
      if (snapshot === requestId.value) {
        listLoading.value = false
      }
    }
  }

  /**
   * 加载更多（追加模式）。
   * 仅当 hasMore 为 true 且非 loadingMore 时执行。
   * 追加到 records 末尾，更新 pagination。
   * 同样使用 requestId 防竞态快照。
   */
  async function loadMore(): Promise<void> {
    if (!hasMore.value || listLoadingMore.value) return
    listLoadingMore.value = true
    error.value = null
    requestId.value++
    const snapshot = requestId.value
    try {
      const nextPage = currentPage.value + 1
      const params: PunchListParams = {
        page: nextPage,
        pageSize: 20,
        ...(filter.startDate ? { startDate: filter.startDate } : {}),
        ...(filter.endDate ? { endDate: filter.endDate } : {}),
        ...(filter.punch_type ? { punch_type: filter.punch_type } : {}),
      }
      const { records: r, pagination: p } = await getPunchList(params)
      if (snapshot !== requestId.value) return
      records.value.push(...r)
      pagination.value = p
    } catch (e) {
      if (snapshot !== requestId.value) return
      error.value = e instanceof Error ? e : new Error('加载更多失败')
    } finally {
      if (snapshot === requestId.value) {
        listLoadingMore.value = false
      }
    }
  }

  /**
   * 拉取 AI 打卡分析。
   * 成功回填 analysis，失败回填 analysisError（不阻断列表渲染）。
   */
  async function fetchAnalysis(): Promise<void> {
    analysisLoading.value = true
    analysisError.value = null
    try {
      analysis.value = await getPunchAnalysis()
    } catch (e) {
      analysisError.value = e instanceof Error ? e : new Error('AI 分析暂不可用')
    } finally {
      analysisLoading.value = false
    }
  }

  /**
   * 更新筛选条件并重新拉取列表（重置到第 1 页）。
   * partial 仅含变化字段；未提供字段保留原值。
   * punch_type 切回 undefined 表示「全部」。
   */
  function setFilter(partial: {
    startDate?: string
    endDate?: string
    punch_type?: PunchType | undefined
  }): void {
    if ('startDate' in partial) filter.startDate = partial.startDate
    if ('endDate' in partial) filter.endDate = partial.endDate
    if ('punch_type' in partial) filter.punch_type = partial.punch_type
    // 重置到首屏
    fetchList()
  }

  /** 重试列表加载（保持当前筛选） */
  async function retryFetchList(): Promise<void> {
    await fetchList()
  }

  /** 重试 AI 分析加载 */
  async function retryFetchAnalysis(): Promise<void> {
    await fetchAnalysis()
  }

  return {
    // state
    records, pagination, filter, analysis,
    listLoading, listLoadingMore, analysisLoading,
    error, analysisError,
    // 防竞态
    requestId,
    // getters
    hasMore, currentPage,
    // actions
    fetchList, loadMore, fetchAnalysis, setFilter,
    retryFetchList, retryFetchAnalysis,
  }
})
```

> **分页边界**：
> - `fetchList`：始终 page=1，**全量替换** `records`，用于首屏加载和筛选条件变更。
> - `loadMore`：page = currentPage+1，**追加**到 `records` 末尾，用于滚动触底或点击「加载更多」。
> - `setFilter`：更新 filter reactive 对象后立即调 `fetchList()`（重置 page=1），不独立缓存旧列表。

---

## 4. `src/views/Punch.vue`（完整重写，`<script setup lang="ts">`）

> 三区布局：① 统计/AI 分析区（顶部）→ ② 筛选 chip 行 → ③ 打卡记录列表（主体）。
> 空记录引导态替代列表区。子组件全部内联（对齐 Round 1/2 决策）。

### 4.1 script setup 结构骨架

```typescript
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { usePunchStore } from '@/stores/punchStore'
import { enumLabel } from '@/utils/enumLabels'
import type { PunchType, PunchRecord } from '@/types/api'

const router = useRouter()
const store = usePunchStore()

// ===== 视图态 =====
/**
 * 'list'       — 列表渲染（含记录 或 空记录引导）
 * 'listLoading' — 列表骨架屏（首屏加载中，脉动动画）
 * 'listError'  — 列表加载失败 + 重试
 */
const listViewMode = ref<'list' | 'listLoading' | 'listError'>('listLoading')

// ===== 日期范围筛选 =====
const dateStart = ref('')
const dateEnd = ref('')

// ===== 打卡类型筛选 chip =====
const typeFilter = ref<PunchType | undefined>(undefined)
const TYPE_OPTIONS: Array<{ label: string; value: PunchType | undefined }> = [
  { label: '全部', value: undefined },
  { label: '饮食', value: 'diet' },
  { label: '运动', value: 'exercise' },
]

// ===== 趋势柱状图数据派生（纯 CSS，7 天） =====
const trendData = computed(() => {
  const trend = store.analysis?.last_7_days_trend ?? []
  if (trend.length === 0) return []
  // 计算柱高基准：取趋势中每日 (diet+exercise) 的最大值，避免单柱 100% 时其余占比失序
  const maxVal = Math.max(
    ...trend.map(d => d.diet_completed + d.exercise_completed),
    1, // 防 /0
  )
  return trend.map((d, i) => {
    const dietPct = Math.round((d.diet_completed / maxVal) * 100)
    const exercisePct = Math.round((d.exercise_completed / maxVal) * 100)
    // 短日期标签：取 MM-DD 或末两位（如 "06-17"）
    const shortDate = d.date.length >= 10 ? d.date.slice(5) : d.date
    // 周标签回退：若 trend 恰好 7 天，用周一~周日
    const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
    const dayLabel = trend.length === 7 ? WEEKDAYS[i] : shortDate
    return { date: d.date, dietPct, exercisePct, dayLabel }
  })
})

// ===== AI 分析 Markdown 净化链（对齐 LifePlan safeContentHtml 范式） =====
function safeAnalysisHtml(markdown: unknown): string {
  if (typeof markdown !== 'string') return ''
  const html = marked.parse(markdown, { async: false })
  if (typeof html !== 'string') return ''
  return DOMPurify.sanitize(html) // 单次净化（S6：不双重净化）
}

// ===== 错误消息（复用 Risk.vue getErrorMessage 范式） =====
function getErrorMessage(err: unknown, fallback = '操作失败，请稍后重试'): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const axiosErr = err as {
      response?: {
        data?: { error?: { message?: string }; message?: string }
        status?: number
      }
    }
    if (axiosErr.response?.data?.error?.message)
      return axiosErr.response.data.error.message
    if (axiosErr.response?.data?.message)
      return axiosErr.response.data.message
  }
  return fallback
}

// ===== 完成率百分比格式化 =====
function ratePercent(rate: number | undefined | null): string {
  if (rate == null) return '-'
  return `${Math.round(rate * 100)}%`
}

// ===== 打卡时间格式化（"2026-06-23T07:30:00" → "06-23 · 07:30"） =====
function formatPunchTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    const mm = `${d.getMonth() + 1}`.padStart(2, '0')
    const dd = `${d.getDate()}`.padStart(2, '0')
    const hh = `${d.getHours()}`.padStart(2, '0')
    const mi = `${d.getMinutes()}`.padStart(2, '0')
    return `${mm}-${dd} · ${hh}:${mi}`
  } catch {
    return iso
  }
}

// ===== 类型图标派生 =====
function typeIcon(punchType: PunchType): string {
  return punchType === 'diet' ? 'fa-utensils' : 'fa-person-running'
}

// ===== 滚动触底监听（loadMore） =====
let scrollTicking = false
function onScroll() {
  if (scrollTicking) return
  scrollTicking = true
  requestAnimationFrame(() => {
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement
    // 距底部 120px 触发
    if (scrollHeight - scrollTop - clientHeight < 120) {
      store.loadMore()
    }
    scrollTicking = false
  })
}

// ===== 筛选 chip 点击 =====
function onTypeFilter(val: PunchType | undefined) {
  typeFilter.value = val
  store.setFilter({ punch_type: val })
}

// ===== 日期范围变更 =====
function onDateChange() {
  store.setFilter({
    startDate: dateStart.value || undefined,
    endDate: dateEnd.value || undefined,
  })
}

// ===== 初始化 =====
onMounted(async () => {
  listViewMode.value = 'listLoading'
  await store.fetchList()
  if (store.error) {
    listViewMode.value = 'listError'
  } else {
    listViewMode.value = 'list'
  }
  // AI 分析独立并行拉取（不阻塞列表）
  store.fetchAnalysis()
  // 滚动监听（用于触底加载更多）
  window.addEventListener('scroll', onScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})
</script>
```

### 4.2 template 区块结构

```html
<template>
  <div class="punch-page page-enter">
    <!-- ===== Header（复刻原型 1249-1253） ===== -->
    <header class="punch-header">
      <button
        class="punch-back press"
        @click="router.back()"
        aria-label="返回"
      >
        <i class="fa-solid fa-chevron-left"></i>
      </button>
      <h1 class="punch-title">打卡记录与分析</h1>
      <div class="punch-header-spacer"></div>
    </header>

    <!-- ===== 统计/AI 分析区（顶部） ===== -->
    <section class="punch-analysis-section">
      <!-- AI 分析加载中：骨架屏 -->
      <div v-if="store.analysisLoading" class="punch-analysis-card">
        <div class="punch-analysis-skeleton">
          <div class="skeleton-line skeleton-short"></div>
          <div class="skeleton-line skeleton-mid"></div>
          <div class="skeleton-line skeleton-long"></div>
        </div>
      </div>

      <!-- AI 分析失败：降级提示条 + 重试 -->
      <div v-else-if="store.analysisError" class="punch-analysis-card punch-analysis-fallback">
        <div class="punch-fallback-row">
          <i class="fa-solid fa-circle-exclamation punch-fallback-icon"></i>
          <p class="punch-fallback-text">{{ getErrorMessage(store.analysisError, 'AI 分析暂不可用') }}</p>
          <button class="punch-retry-btn press" @click="store.retryFetchAnalysis()">重试</button>
        </div>
      </div>

      <!-- AI 分析成功：统计卡 + 趋势图 + 评语 + 建议 + 免责 -->
      <template v-else-if="store.analysis">
        <!-- 统计卡三列（饮食/运动完成率 + 总打卡次数） -->
        <div class="punch-stats-row">
          <div class="punch-stat-card">
            <span class="punch-stat-label">饮食完成率</span>
            <span class="punch-stat-value gradient-text">{{
              ratePercent(store.analysis.diet_completion_rate)
            }}</span>
          </div>
          <div class="punch-stat-card">
            <span class="punch-stat-label">运动完成率</span>
            <span class="punch-stat-value gradient-text">{{
              ratePercent(store.analysis.exercise_completion_rate)
            }}</span>
          </div>
          <div class="punch-stat-card">
            <span class="punch-stat-label">总打卡</span>
            <span class="punch-stat-value">{{ store.analysis.total_punches }}</span>
          </div>
        </div>

        <!-- 本周完成趋势柱状图（纯 CSS，7 列） -->
        <div class="punch-trend-card">
          <h2 class="punch-section-title">本周完成趋势</h2>
          <div class="punch-trend-chart" v-if="trendData.length > 0">
            <div
              v-for="(d, i) in trendData"
              :key="i"
              class="punch-trend-col"
            >
              <div class="punch-trend-bar-wrap">
                <!-- 合并柱（饮食+运动叠柱）：饮食底 + 运动顶 -->
                <div
                  class="punch-trend-bar punch-trend-diet"
                  :style="{ height: (d.dietPct + d.exercisePct) + '%' }"
                >
                  <div
                    class="punch-trend-bar punch-trend-exercise"
                    :style="{ height: (d.exercisePct / (d.dietPct + d.exercisePct || 1)) * 100 + '%' }"
                  ></div>
                </div>
              </div>
              <span class="punch-trend-label">{{ d.dayLabel }}</span>
            </div>
          </div>
          <p v-else class="punch-empty-text">暂无趋势数据</p>
        </div>

        <!-- AI 依从性评语（Markdown 净化链） -->
        <div class="punch-comment-card">
          <div class="punch-comment-head">
            <i class="fa-solid fa-lightbulb punch-comment-icon"></i>
            <h3 class="punch-comment-title">AI 分析</h3>
          </div>
          <div
            class="punch-comment-body"
            v-html="safeAnalysisHtml(store.analysis.adherence_comment)"
          ></div>
          <!-- 改进建议列表 -->
          <ul
            v-if="store.analysis.improvement_suggestions.length > 0"
            class="punch-suggestions"
          >
            <li
              v-for="(s, idx) in store.analysis.improvement_suggestions"
              :key="idx"
              class="punch-suggestion-item"
            >
              {{ s }}
            </li>
          </ul>
        </div>

        <!-- AI 免责提示条（恒显底部） -->
        <div class="punch-disclaimer">
          AI 分析内容仅供参考，不能替代专业医疗诊断，如有不适请及时就医
        </div>
      </template>
    </section>

    <!-- ===== 筛选区 ===== -->
    <section class="punch-filter-section">
      <!-- 日期范围 -->
      <div class="punch-date-row">
        <input
          type="date"
          v-model="dateStart"
          class="punch-date-input"
          @change="onDateChange"
          aria-label="开始日期"
        />
        <span class="punch-date-sep">至</span>
        <input
          type="date"
          v-model="dateEnd"
          class="punch-date-input"
          @change="onDateChange"
          aria-label="结束日期"
        />
      </div>

      <!-- 类型筛选 chip -->
      <div class="punch-chip-row">
        <button
          v-for="opt in TYPE_OPTIONS"
          :key="opt.label"
          :class="[
            'punch-chip press',
            typeFilter === opt.value ? 'punch-chip-active' : '',
          ]"
          @click="onTypeFilter(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </section>

    <!-- ===== 列表区 ===== -->
    <section class="punch-list-section">
      <h2 class="punch-section-title">打卡记录</h2>

      <!-- 列表骨架屏（首屏加载中） -->
      <div v-if="listViewMode === 'listLoading'" class="punch-skeleton-list">
        <div
          v-for="n in 4"
          :key="n"
          class="punch-skeleton-card"
        >
          <div class="skeleton-circle"></div>
          <div class="skeleton-lines">
            <div class="skeleton-line skeleton-mid"></div>
            <div class="skeleton-line skeleton-short"></div>
          </div>
        </div>
      </div>

      <!-- 列表加载失败 -->
      <div v-else-if="listViewMode === 'listError'" class="punch-error">
        <p class="punch-error-text">
          {{ getErrorMessage(store.error, '打卡记录加载失败') }}
        </p>
        <button class="punch-retry-btn press" @click="store.retryFetchList()">
          重试
        </button>
      </div>

      <!-- 列表为空（空记录引导态） -->
      <div v-else-if="store.records.length === 0" class="punch-empty">
        <div class="punch-empty-card">
          <div class="punch-empty-icon">
            <i class="fa-solid fa-clipboard-check"></i>
          </div>
          <h2 class="punch-empty-title">还没有打卡记录</h2>
          <p class="punch-empty-desc">
            去生活方案页开始打卡吧，记录每日饮食与运动执行情况
          </p>
          <button
            class="punch-cta press"
            @click="router.push('/life-plan')"
          >
            去打卡
          </button>
        </div>
      </div>

      <!-- 记录列表 + 分页加载更多 -->
      <template v-else>
        <!-- 筛选重新加载中微弱指示条（列表已有记录，重新拉取时告知用户） -->
        <div v-if="store.listLoading && store.records.length > 0" class="punch-reloading-bar">
          <i class="fa-solid fa-spinner punch-spinner punch-spinner-sm"></i>
          <span>刷新中...</span>
        </div>

        <div class="punch-record-list">
          <div
            v-for="record in store.records"
            :key="record.id"
            class="punch-record-card"
          >
            <div class="punch-record-main">
              <!-- 类型图标 -->
              <div
                :class="[
                  'punch-type-icon',
                  record.punch_type === 'diet'
                    ? 'punch-type-diet'
                    : 'punch-type-exercise',
                ]"
              >
                <i :class="['fa-solid', typeIcon(record.punch_type)]"></i>
              </div>
              <!-- 打卡信息 -->
              <div class="punch-record-info">
                <div class="punch-record-head">
                  <span class="punch-type-badge">{{
                    enumLabel('punch_type', record.punch_type)
                  }}</span>
                  <h3 class="punch-record-title">
                    {{ record.plan_title || '（方案项已删除）' }}
                  </h3>
                </div>
                <p class="punch-record-time">
                  {{ formatPunchTime(record.punch_time) }}
                </p>
              </div>
            </div>
            <!-- 完成状态 badge -->
            <span
              :class="[
                'punch-status-badge',
                record.completion_status === 'completed'
                  ? 'punch-status-done'
                  : 'punch-status-undone',
              ]"
            >
              {{ enumLabel('completion_status', record.completion_status) }}
            </span>
          </div>
        </div>

        <!-- 加载更多失败（已有列表存在，追加失败的错误提示） -->
        <!--
          加载失败（fetchList 或 loadMore），共享 error 状态。
          重试统一调用 retryFetchList() 从 page=1 重新拉取——这是最安全的恢复路径，
          避免 loadMore 在筛选变更后误追加旧数据（task_v3 §4 技术约束）。
        -->
        <div v-if="store.error && store.records.length > 0" class="punch-loadmore-error">
          <p class="punch-error-text">{{ getErrorMessage(store.error, '加载失败') }}</p>
          <button class="punch-retry-btn press" @click="store.retryFetchList()">重试</button>
        </div>

        <!-- 加载更多中 -->
        <div v-if="store.listLoadingMore" class="punch-loadmore">
          <i class="fa-solid fa-spinner punch-spinner"></i>
          <span>加载中...</span>
        </div>

        <!-- 还有更多：手动加载按钮 -->
        <button
          v-else-if="store.hasMore"
          class="punch-loadmore-btn press"
          @click="store.loadMore()"
        >
          加载更多
        </button>

        <!-- 已全部加载 -->
        <p v-else-if="store.records.length > 0" class="punch-loadmore-end">
          已加载全部记录
        </p>
      </template>
    </section>
  </div>
</template>
```

### 4.3 关键交互逻辑说明

| 交互 | 触发 | 代码路径 |
|------|------|----------|
| 首屏加载 | `onMounted` | `store.fetchList()` → 列表骨架 → 成功/失败分流；`store.fetchAnalysis()` 并行 |
| 筛选 chip 点击 | `@click` on chip | `onTypeFilter(val)` → `store.setFilter({ punch_type })` → `fetchList()` (page=1 重置) |
| 日期范围变更 | `@change` on input | `onDateChange()` → `store.setFilter({ startDate, endDate })` → `fetchList()` |
| 滚动触底加载更多 | `window scroll` | `onScroll` (throttle via rAF) → `store.loadMore()` → 追加 records + spinner |
| 手动加载更多 | `@click` on btn | `store.loadMore()` |
| 列表重试 | `@click` on retry btn | `store.retryFetchList()` → `fetchList()` |
| AI 分析重试 | `@click` on retry btn | `store.retryFetchAnalysis()` → `fetchAnalysis()` |
| 空记录引导 CTA | `@click` on CTA btn | `router.push('/life-plan')` |
| 返回 | `@click` on header back | `router.back()` |

---

## 5. scoped CSS（关键类与 CSS 变量映射）

> 对齐 `detail_v1.md` §7 / `detail_v2.md` §5.3 范式：`max-width: 480px; margin: 0 auto;`，`padding-bottom: calc(var(--tab-bar-height) + 8px)`，scoped 自定义语义类，全部用 `src/assets/variables.css` 变量。复刻原型 1246-1305 视觉。

```css
<style scoped>
/* ===== 页面容器 ===== */
.punch-page {
  max-width: 480px;
  margin: 0 auto;
  padding-bottom: calc(var(--tab-bar-height) + 8px);
  min-height: 100vh;
  background: var(--color-bg);
}

/* ===== Header 白色粘性顶栏（复刻原型 1250-1253） ===== */
.punch-header {
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
.punch-title {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--color-text-primary);
  flex: 1;
}
.punch-back {
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
.punch-header-spacer {
  width: 32px; /* 对称占位 */
}

/* ===== 通用区块内边距 ===== */
.punch-analysis-section,
.punch-filter-section,
.punch-list-section {
  padding: 0 var(--spacing-lg);
}
.punch-analysis-section {
  margin-top: var(--spacing-lg);
}
.punch-filter-section {
  margin-top: var(--spacing-xl);
}
.punch-list-section {
  margin-top: var(--spacing-xl);
}

/* ===== 统计卡三列行 ===== */
.punch-stats-row {
  display: flex;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}
.punch-stat-card {
  flex: 1;
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--spacing-md);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.punch-stat-label {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}
.punch-stat-value {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--color-text-primary);
}

/* gradient-text（复刻原型统计卡渐变文字） */
.gradient-text {
  background: linear-gradient(135deg, #4A90D9, #38BDF8);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* ===== 趋势柱状图卡片 ===== */
.punch-trend-card {
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-md);
}
.punch-section-title {
  font-size: var(--font-size-body);
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-md);
}
.punch-trend-chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  height: 120px;
  gap: 4px;
}
.punch-trend-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  justify-content: flex-end;
}
.punch-trend-bar-wrap {
  width: 100%;
  height: 100px;
  background: var(--color-bg);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  position: relative;
  overflow: hidden;
}
.punch-trend-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  transition: height var(--transition-fast);
}
.punch-trend-diet {
  background: linear-gradient(to top, #4A90D9, #38BDF8);
}
.punch-trend-exercise {
  background: linear-gradient(to top, #52C41A, #73D13D);
}
.punch-trend-label {
  font-size: 10px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

/* ===== AI 分析评语卡片（复刻原型 1289-1297） ===== */
.punch-comment-card {
  background: linear-gradient(135deg, #E8F1FB, #E0F2FE);
  border: 1px solid rgba(74, 144, 217, 0.15);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-md);
}
.punch-comment-head {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}
.punch-comment-icon {
  color: #FAAD14;
  font-size: var(--font-size-body);
}
.punch-comment-title {
  font-size: var(--font-size-body);
  font-weight: 700;
  color: var(--color-text-primary);
}
.punch-comment-body {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  line-height: 1.6;
}
.punch-comment-body :deep(p) {
  margin: 4px 0;
}
.punch-comment-body :deep(ul),
.punch-comment-body :deep(ol) {
  padding-left: 20px;
  margin: 4px 0;
}

/* ===== 改进建议列表 ===== */
.punch-suggestions {
  margin-top: var(--spacing-md);
  padding-left: 20px;
  list-style: disc;
}
.punch-suggestion-item {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  line-height: 1.6;
}

/* ===== AI 免责提示条（恒显底部，对齐 LifePlan lp-disclaimer 范式） ===== */
.punch-disclaimer {
  margin-bottom: var(--spacing-md);
  padding: 10px 12px;
  background: var(--color-primary-light);
  color: var(--color-text-secondary);
  font-size: var(--font-size-caption);
  border-radius: var(--radius-md);
  text-align: center;
  line-height: 1.5;
}

/* ===== AI 分析降级提示条 ===== */
.punch-analysis-fallback {
  background: #FFF7E6;
  border: 1px solid #FAAD14;
}
.punch-fallback-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}
.punch-fallback-icon {
  color: #FAAD14;
  font-size: var(--font-size-body);
}
.punch-fallback-text {
  flex: 1;
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}
.punch-retry-btn {
  padding: 4px 12px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-size-caption);
  border: none;
  white-space: nowrap;
}

/* ===== 分析区骨架屏 ===== */
.punch-analysis-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ===== 筛选区 ===== */
.punch-date-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}
.punch-date-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-md);
  font-size: var(--font-size-caption);
  font-family: var(--font-family);
  background: var(--color-card);
  color: var(--color-text-primary);
}
.punch-date-sep {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}

/* chip 筛选行 */
.punch-chip-row {
  display: flex;
  gap: var(--spacing-sm);
}
.punch-chip {
  padding: 6px 14px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-caption);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-divider);
}
.punch-chip-active {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}

/* ===== 记录列表 ===== */
.punch-record-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}
.punch-record-card {
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--spacing-lg);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.punch-record-main {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex: 1;
  min-width: 0;
}
.punch-type-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 16px;
}
.punch-type-diet {
  background: #E8F1FB;
  color: #4A90D9;
}
.punch-type-exercise {
  background: #E6F7EE;
  color: #52C41A;
}
.punch-record-info {
  flex: 1;
  min-width: 0;
}
.punch-record-head {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: 2px;
}
.punch-type-badge {
  font-size: 10px;
  color: var(--color-text-secondary);
  background: var(--color-bg);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}
.punch-record-title {
  font-size: var(--font-size-body);
  font-weight: 700;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.punch-record-time {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}

/* ===== 完成状态 badge ===== */
.punch-status-badge {
  font-size: var(--font-size-caption);
  font-weight: 700;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  white-space: nowrap;
  flex-shrink: 0;
}
.punch-status-done {
  background: #E6F7EE;
  color: #52C41A;
}
.punch-status-undone {
  background: var(--color-bg);
  color: var(--color-text-secondary);
}

/* ===== 空记录引导态 ===== */
.punch-empty {
  display: flex;
  justify-content: center;
  padding: var(--spacing-2xl) 0;
}
.punch-empty-card {
  text-align: center;
  max-width: 280px;
}
.punch-empty-icon {
  font-size: 48px;
  color: var(--color-divider);
  margin-bottom: var(--spacing-lg);
}
.punch-empty-title {
  font-size: var(--font-size-h3);
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-sm);
}
.punch-empty-desc {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-xl);
  line-height: 1.5;
}
.punch-empty-text {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  text-align: center;
}
.punch-cta {
  background: linear-gradient(135deg, #4A90D9, #38BDF8);
  color: #fff;
  border: none;
  border-radius: var(--radius-button);
  padding: 12px 24px;
  font-weight: 700;
  box-shadow: var(--shadow-md);
}

/* ===== 错误态 ===== */
.punch-error {
  text-align: center;
  padding: var(--spacing-xl);
}
.punch-error-text {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-md);
}

/* ===== 通用卡片（分析降级/骨架共用） ===== */
.punch-analysis-card {
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-md);
}

/* ===== 加载更多 ===== */
.punch-loadmore {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg);
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}
.punch-loadmore-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-lg);
  background: #FFF7E6;
  border: 1px solid #FAAD14;
  border-radius: var(--radius-md);
  margin-top: var(--spacing-md);
}
.punch-loadmore-btn {
  display: block;
  width: 100%;
  padding: var(--spacing-md);
  text-align: center;
  font-size: var(--font-size-caption);
  color: var(--color-primary);
  background: var(--color-card);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-md);
  margin-top: var(--spacing-md);
}
.punch-loadmore-end {
  text-align: center;
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  padding: var(--spacing-lg);
}

/* ===== 骨架屏（脉动动画） ===== */
.punch-skeleton-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}
.punch-skeleton-card {
  background: var(--color-card);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}
.skeleton-circle {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: var(--color-divider);
  animation: punch-pulse 1.5s ease-in-out infinite;
  flex-shrink: 0;
}
.skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.skeleton-line {
  height: 12px;
  border-radius: var(--radius-sm);
  background: var(--color-divider);
  animation: punch-pulse 1.5s ease-in-out infinite;
}
.skeleton-short {
  width: 50%;
}
.skeleton-mid {
  width: 75%;
}
.skeleton-long {
  width: 90%;
}
@keyframes punch-pulse {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 0.8;
  }
}

/* ===== 筛选重新加载微弱指示条 ===== */
.punch-reloading-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: 6px var(--spacing-lg);
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  background: var(--color-bg);
  opacity: 0.7;
}
.punch-spinner-sm {
  font-size: 12px;
}

/* ===== 旋转动画（加载中 spinner） ===== */
.punch-spinner {
  animation: punch-spin 1s linear infinite;
}
@keyframes punch-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* ===== 按压动画 ===== */
.press:active {
  transform: scale(0.96);
  transition: var(--transition-fast);
}
</style>
```

> **变量映射**：`--color-primary`(#4A90D9) / `--color-primary-light`(#E8F1FB) / `--color-primary-dark`(#2B6CB0) / `--color-accent`(#52C41A) / `--color-warning`(#FAAD14) / `--color-card`(#fff) / `--color-bg`(#F8FAFC) / `--color-divider`(#E2E8F0) / `--color-text-primary`(#1E293B) / `--color-text-secondary`(#64748B) / `--radius-sm`(4px) / `--radius-md`(8px) / `--radius-lg`(12px) / `--radius-full`(9999px) / `--radius-button`(12px) / `--shadow-sm` / `--shadow-md` / `--spacing-sm`(6px) / `--spacing-md`(12px) / `--spacing-lg`(16px) / `--spacing-xl`(24px) / `--spacing-2xl`(40px) / `--tab-bar-height` / `--font-size-caption`(12px) / `--font-size-body`(14px) / `--font-size-h2`(18px) / `--font-size-h3`(16px) / `--transition-fast`(150ms ease)。原型渐变 `bg-gradient-to-t from-blue-500 to-sky-400` 用硬编码 `linear-gradient(to top, #4A90D9, #38BDF8)`（与 variables.css 主色系一致，非 Tailwind 类）。

---

## 6. 降级 / 空态 / 加载态 / 错误态矩阵

| 场景 | 代码路径 | 表现 |
|---|---|---|
| 列表首屏加载中 | `onMounted` → `listViewMode='listLoading'` | 4 条骨架卡片，脉动动画（skeleton-circle + skeleton-lines） |
| 列表为空 | `listViewMode='list'` + `store.records.length===0` | 空记录引导态：大图标 + 「还没有打卡记录」+ 「去打卡」CTA（跳 `/life-plan`） |
| 列表加载失败 | `listViewMode='listError'` | 错误文案 + 重试按钮（`store.retryFetchList()` → 重判 viewMode） |
| 列表加载更多中 | `store.listLoadingMore===true` | 底部 spinner + 「加载中...」，不覆盖已有列表 |
| 列表加载失败（fetchList 或 loadMore） | `store.error` 非空 + `store.records.length>0`（已有列表不丢失） | 列表底部错误提示条 + 重试按钮（`store.retryFetchList()` 从 page=1 重新拉取），不替换已有记录列表 |
| 列表已全部加载 | `store.records.length>0` + `!store.hasMore` | 底部「已加载全部记录」文案 |
| AI 分析加载中 | `store.analysisLoading===true` + `store.analysis===null` | 分析区骨架屏（3 行 skeleton-line） |
| AI 分析成功 + trend 空 | `store.analysis` 存在但 `last_7_days_trend=[]` | 统计卡正常渲染；趋势卡片显示「暂无趋势数据」 |
| AI 分析失败 | `store.analysisError` 非空 | 降级通用提示条（#FFF7E6 背景 + 「AI 分析暂不可用」+ 重试按钮）；统计卡不渲染（analysis 整体为 null 则整区降级） |
| `adherence_comment` 为空字符串 | `safeAnalysisHtml('')` → 返回 `''` | 评语区空白（不渲染空 `<p>`），改进建议独立渲染 |
| `improvement_suggestions` 为空数组 | `v-if` 条件不满足 | 不渲染 `<ul>` |
| `plan_title` 为 null/undefined | `record.plan_title \|\| '（方案项已删除）'` | 显示「（方案项已删除）」兜底文案 |
| 滚动触底 | `onScroll` (rAF throttle) → `store.loadMore()` | 自动加载下一页，追加到 records；`!store.hasMore` 时不触发 |
| 手动加载更多 | 按钮 visible 当 `store.hasMore && !store.listLoadingMore` | 点击调 `store.loadMore()` |

---

## 7. 文件清单（task_v3 §3 落地）

**新增**：
- `src/stores/punchStore.ts`（§3）
- `src/composables/usePunchApi.ts`（§2）

**修改（仅增补 / 重写，勿动既有）**：
- `src/types/api.ts`：文件末尾追加 `PunchAnalysisResponse`（§1），不动既有任何类型（`ApiResponse`/`Doctor`/`Article`/`DiabetesType`/`LifePlan`/`Plan*`/`PunchType`/`CompletionStatus`/`PunchCreateRequest`/`PunchCreateResponse`/`PunchListParams`/`PunchRecord` 等全部保留不动）。
- `src/views/Punch.vue`：完整重写（§4）。

**不改**：
- `src/router/index.ts`（路由 `/profile/punch` + `meta.requiresAuth:true` 已存在）
- `src/App.vue`
- `src/composables/useApi.ts`
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
- `src/utils/enumLabels.ts`（`punch_type`/`completion_status` 已在 Task 2 落地）
- `server/**`
- `package.json` / `vite.config.ts` / `tsconfig.app.json`（**不引入任何新依赖**，`marked`/`dompurify`/`sweetalert2`/`@fortawesome` 均已存在）

---

## 8. 验收映射（对 Verifier，列代码证据点）

| 验收项（task_v3 §6） | 代码证据点 |
|---|---|
| 列表支持日期范围 + punch_type 筛选 | `Punch.vue`: `dateStart`/`dateEnd` v-model + `@change` → `onDateChange()` → `store.setFilter()`；`TYPE_OPTIONS` chip + `onTypeFilter()` → `store.setFilter()`；`punchStore.fetchList()` 构造 `PunchListParams` 含筛选字段 |
| 分页正常（首屏 + 加载更多） | `punchStore.fetchList()` (page=1, 全量替换) vs `punchStore.loadMore()` (page+1, 追加)；`hasMore` getter 判 `page < totalPages`；滚动触发 `onScroll` + 手动按钮双重路径 |
| 本周趋势柱状图 7 天渲染（纯 CSS） | `trendData` 派生：`maxVal` 归一 → `dietPct`/`exercisePct`；template 内 `.punch-trend-bar` 内联 `style.height`；scoped CSS `.punch-trend-diet` / `.punch-trend-exercise` gradient |
| AI 分析 `adherence_comment` 经 DOMPurify 净化后 v-html | `safeAnalysisHtml()`：`marked.parse → DOMPurify.sanitize → return`；template `v-html="safeAnalysisHtml(store.analysis.adherence_comment)"` |
| 统计卡（饮食/运动完成率 + 总打卡） | `.punch-stats-row` 三列；`ratePercent()` 格式化 0-1 → X%；`store.analysis.total_punches` 直接渲染 |
| 改进建议列表渲染 | `v-for="s in store.analysis.improvement_suggestions"` + `.punch-suggestions` `<li>` |
| AI 分析失败降级 + 重试 | `v-else-if="store.analysisError"` → `.punch-analysis-fallback` + `store.retryFetchAnalysis()` |
| 空态引导 + CTA 跳 LifePlan | `v-else-if="store.records.length===0"` → `.punch-empty-card` + `router.push('/life-plan')` |
| 免责提示条恒显（AI 分析区底部） | `.punch-disclaimer` 位于 `v-else-if="store.analysis"` 模板块底部 |
| 列表骨架屏（首屏加载中） | `listViewMode='listLoading'` → `.punch-skeleton-list` 4 条 `.punch-skeleton-card`；`@keyframes punch-pulse` |
| 列表加载失败 + 重试 | `listViewMode='listError'` → `.punch-error` + `store.retryFetchList()` |
| `npx vue-tsc --noEmit` 零错误 | §1 类型全显式，无 `any`；§2/§3 axios 泛型精确解包；§4 全 `<script setup lang="ts">` 显式类型标注 |
| 不引入新依赖 | 不改 `package.json`；`marked`/`dompurify` 已有 |
| S1 无 any | §1/§2/§3/§4 全显式类型，无 `any` 出现 |
| S2 所有 v-html 经 DOMPurify | `safeAnalysisHtml` 唯一 v-html 来源，内含 `DOMPurify.sanitize` |
| S3 无硬编码后端 URL | 全走 `usePunchApi` → `api`（baseURL `/api`），无硬编码 host |
| S4 变更集仅目标文件 | §7 文件清单，不动 router/App/useApi/authStore/riskFormStore/homeStore/lifePlanStore/Risk/LifePlan/variables.css/package.json/vite.config.ts/server |
| S5 无新依赖 | 不改 `package.json` |
| S6 不双重净化 | `safeAnalysisHtml` 内 marked 输出整体 DOMPurify 一次，组件不再二次 sanitize |
| 移动端 375px 无横向滚动 | `.punch-page` max-width 480px + margin auto + padding-bottom tab-bar-height |
| 视觉贴合 prototype.html Punch 模板 | 白色粘性 header、flex items-end 柱状图、record 卡片 type-icon + badge + status badge、AI 分析卡片 gradient 背景 + lightbulb 图标 |

---

## 9. 复用范式索引（Coder 实现时对照）

| 范式 | 来源文件:行 | 本设计落点 |
|---|---|---|
| `marked.parse` + `DOMPurify.sanitize` | `Risk.vue:6-7,69-74` / `LifePlan.vue safeContentHtml` | `safeAnalysisHtml`（§4.1） |
| `getErrorMessage(err)` | `Risk.vue:219-225` / `LifePlan.vue` | `getErrorMessage`（§4.1，扩展 message 兜底） |
| `onUnmounted` 清理 listener/timer | `Risk.vue:113-116` / `LifePlan.vue onUnmounted(stopStageTimer)` | `onUnmounted(removeEventListener scroll)`（§4.1） |
| setup-store + retry action | `homeStore.ts:16-150` / `lifePlanStore.ts` | `punchStore`（§3） |
| axios 内联 body 泛型解包 | `useHomeApi.ts:37-72` / `useLifePlanApi.ts` | `usePunchApi`（§2） |
| 展示字段挂视图不污染契约类型 | `homeStore.ts:7-12 DiabetesTypeView` / `LifePlan.vue slotLabel/itemIcon` | `trendData` / `formatPunchTime` / `typeIcon` 视图派生（§4.1） |
| scoped CSS + CSS 变量无 Tailwind | `detail_v1.md §7` / `detail_v2.md §5.3` | §5 |
| 空态引导 + CTA 按钮 | `LifePlan.vue lp-empty` | `punch-empty` → CTA「去打卡」跳 `/life-plan` |
| 历史降级/失败降级提示条 | `Risk.vue isHistoryFallback` / `LifePlan.vue lp-fallback-hint` | `punch-analysis-fallback`（§6） |
| 骨架屏脉动动画 | `detail_v1.md` 骨架规范 | `.skeleton-circle`/`.skeleton-line` + `@keyframes punch-pulse`（§5） |
| 分页加载更多（追加模式） | `homeStore.ts loadMore` 范式（扩展至 punch 场景） | `punchStore.loadMore()` records.push + hasMore 判（§3.3） |
| 筛选 chip 互斥切换 | LifePlan.vue `HABITS` chip toggle | `TYPE_OPTIONS` + `onTypeFilter`（§4.1/§4.2） |
| 滚动触底 rAF throttle | 通用范式 | `onScroll` + `requestAnimationFrame`（§4.1） |

---

---

## 10. 修订记录（r1）

> 本轮修复 Design Reviewer 拒绝的 6 个问题。日期：2026-06-27。

| # | 级别 | 问题 | 修改位置 | 修改摘要 |
|---|---|---|---|---|
| G1 | 一般 | 加载更多失败无用户可见错误 | §4.2 template + §5 CSS + §6 矩阵 | template 在 `punch-loadmore` 上方新增 `v-if="store.error && store.records.length > 0"` 错误提示条+重试按钮（`.punch-loadmore-error`）；§6 降级矩阵新增「列表加载更多失败」行 |
| G2 | 一般 | 筛选变更无防竞态 | §3.3 + return block | store 内新增 `requestId` 递增计数器，`fetchList`/`loadMore` 请求前快照，响应后仅当 `snapshot === requestId.value` 时赋值 records/pagination/error；return 块导出 `requestId` |
| M1 | 轻微 | store imports 缺少 `computed` | §3.1 | `import { ref, reactive } from 'vue'` → `import { ref, reactive, computed } from 'vue'` |
| M2 | 轻微 | 分析区 `v-else` 分支为死代码 | §4.2 template + §6 矩阵 | 删除 `v-else` 分支（AI 分析未加载初始态占位），因 `onMounted` 中立即 `fetchAnalysis()` 使 `analysisLoading=true`，该分支永不可达；§6 同步删除对应矩阵行 |
| M3 | 轻微 | `.punch-header` 硬编码 `#fff` | §5 CSS | `background: #fff` → `background: var(--color-card)` |
| M4 | 轻微 | 筛选重新加载期间无视觉反馈 | §4.2 template + §5 CSS | template 在 `.punch-record-list` 上方新增 `v-if="store.listLoading && store.records.length > 0"` 微弱 loading 指示条（`.punch-reloading-bar`）；CSS 新增 `.punch-reloading-bar` + `.punch-spinner-sm` |

| N1 (r2) | 轻微 | punch-loadmore-error 重试按钮调用 loadMore() 不适用于 fetchList 失败 | §4.2 template + §6 矩阵 | 重试按钮改为调用 `store.retryFetchList()`（从 page=1 重新拉取，最安全恢复路径）；§6 矩阵同步更新；模板增加注释说明 |

> Designer 修订完毕，交 Coder 按 §1-§5 落地编码，交 Verifier 按 §8 验收。
