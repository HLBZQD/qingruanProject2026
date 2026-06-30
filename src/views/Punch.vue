<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { renderMarkdown } from '@/composables/useMarkdown'
import { getErrorMessage } from '@/utils/errorMessage'
import { usePunchStore } from '@/stores/punchStore'
import { enumLabel } from '@/utils/enumLabels'
import type { PunchType } from '@/types/api'
import DisclaimerBar from '@/components/DisclaimerBar.vue'
import AppIcon from '@/components/icons/AppIcon.vue'

const router = useRouter()
const route = useRoute()
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

// ===== 日期格式化工具函数 =====
function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10) // "YYYY-MM-DD"
}

// ===== URL 日期格式校验正则 =====
const DATE_FORMAT_RE = /^\d{4}-\d{2}-\d{2}$/

// ===== 打卡类型筛选 chip =====
const typeFilter = computed<PunchType | undefined>({
  get: () => store.filter.punch_type,
  set: (val: PunchType | undefined) => store.setFilter({ punch_type: val }),
})
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

// ===== 环形图计算 (G4) =====

/** 圆环周长（半径 40 在 viewBox 100x100 中） */
const CIRCLE_LENGTH = 2 * Math.PI * 40

/** 完成率（0-1 数值），无数据时返回 null */
const completionRate = computed(() => {
  const analysis = store.analysis
  // 无分析数据
  if (!analysis) return null
  // 综合完成率取饮食+运动平均值
  const avg = (analysis.diet_completion_rate + analysis.exercise_completion_rate) / 2
  // 限制最大值为 1（防御异常数据）
  return Math.min(avg, 1)
})

/** stroke-dashoffset 取值（控制进度环的可见长度） */
const dashOffset = computed(() => {
  if (completionRate.value === null) return CIRCLE_LENGTH // 无数据：全空环
  return CIRCLE_LENGTH * (1 - completionRate.value)
})

/** 环形图中心文字 */
const rateText = computed(() => {
  if (completionRate.value === null) return '-'
  return Math.round(completionRate.value * 100) + '%'
})

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
  return punchType === 'diet' ? 'utensils' : 'person-running'
}

// ===== 滚动触底监听（loadMore） =====
let scrollTicking = false
function onScroll() {
  if (scrollTicking) return
  // 仅在当前页面可见时处理滚动逻辑
  const container = document.querySelector('[data-scroll-container="punch"]')
  if (!container) return

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

// ===== 日期范围变更 =====
function onDateChange() {
  store.setFilter({
    startDate: dateStart.value || undefined,
    endDate: dateEnd.value || undefined,
  })
}

// ===== 刷新按钮 (G5) =====

/** 刷新动画延迟（ms）— 避免快速刷新时图标闪烁 */
const REFRESH_ANIM_DELAY = 500

/** 是否展示旋转动画 */
const isRefreshing = ref(false)

/** 旋转动画的延迟启动 timer */
let refreshAnimTimer: ReturnType<typeof setTimeout> | null = null

/** 刷新按钮的 title 提示文案 */
const refreshTitle = computed(() => {
  if (store.listLoading || store.analysisLoading) return '刷新中...'
  return '刷新打卡数据'
})

/** 刷新：并发拉取列表和分析 */
async function onRefresh(): Promise<void> {
  // 防双击/防重复刷新：正在加载时直接返回
  if (store.listLoading || store.analysisLoading) return

  try {
    // 延迟启动旋转动画（避免快速刷新时闪烁）
    refreshAnimTimer = setTimeout(() => {
      isRefreshing.value = true
    }, REFRESH_ANIM_DELAY)

    // 并发刷新列表和分析（利用 Store 已有的竞态保护）
    await Promise.all([store.fetchList(), store.fetchAnalysis()])
  } catch {
    // 错误由各自 Store 的 error ref 处理，onRefresh 层面不重复提示
    // fetchList() 和 fetchAnalysis() 内部已有 try/catch 回填 listError/analysisError
  } finally {
    // 清理 timer 并恢复视觉状态
    if (refreshAnimTimer !== null) {
      clearTimeout(refreshAnimTimer)
      refreshAnimTimer = null
    }
    isRefreshing.value = false
  }
}

// ===== 初始化 =====
onMounted(async () => {
  listViewMode.value = 'listLoading'

  // 计算默认日期范围（近30天），优先使用 URL query 参数（带格式校验）
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

  // 使用 setFilter 替代 fetchList
  // setFilter 内部 await fetchList() + 防抖 fetchAnalysis()
  await store.setFilter({
    startDate: dateStart.value || undefined,
    endDate: dateEnd.value || undefined,
  })

  if (store.error) {
    listViewMode.value = 'listError'
  } else {
    listViewMode.value = 'list'
  }
  // 滚动监听（用于触底加载更多）
  window.addEventListener('scroll', onScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  // 清理刷新按钮旋转定时器（防止组件卸载后 timer 操作已销毁的响应式状态）
  if (refreshAnimTimer !== null) {
    clearTimeout(refreshAnimTimer)
    refreshAnimTimer = null
  }
})
</script>

<template>
  <div class="punch-page page-enter" data-scroll-container="punch">
    <!-- ===== Header（复刻原型 1249-1253） ===== -->
    <header class="punch-header">
      <button
        class="punch-back press"
        @click="router.push('/profile')"
        aria-label="返回"
      >
        <AppIcon name="chevron-left" :size="18" />
      </button>
      <h1 class="punch-title">打卡记录与分析</h1>
      <div class="punch-header-spacer"></div>
    </header>

    <!-- ===== 统计/AI 分析区（顶部） ===== -->
    <section id="analysis-section" class="punch-analysis-section">
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
          <AppIcon name="exclamation" :size="18" class="punch-fallback-icon" />
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
            <span id="diet-rate" class="punch-stat-value gradient-text">{{
              ratePercent(store.analysis.diet_completion_rate)
            }}</span>
          </div>
          <div class="punch-stat-card">
            <span class="punch-stat-label">运动完成率</span>
            <span id="exercise-rate" class="punch-stat-value gradient-text">{{
              ratePercent(store.analysis.exercise_completion_rate)
            }}</span>
          </div>
          <div class="punch-stat-card">
            <span class="punch-stat-label">总打卡</span>
            <span id="total-punches" class="punch-stat-value">{{ store.analysis.total_punches }}</span>
          </div>
        </div>

        <!-- 统计卡 - 完成率环形图 (G4) -->
        <div class="punch-stat-card punch-donut-card">
          <h3 class="punch-stat-label">综合完成率</h3>
          <div class="donut-chart">
            <svg viewBox="0 0 100 100" class="donut-svg">
              <!-- 背景环（灰色底环） -->
              <circle
                cx="50" cy="50" r="40"
                fill="none"
                stroke="var(--color-divider, #e0e0e0)"
                stroke-width="8"
              />
              <!-- 进度环（有颜色、带动画） -->
              <circle
                cx="50" cy="50" r="40"
                fill="none"
                stroke="var(--color-primary, #4A90D9)"
                stroke-width="8"
                stroke-linecap="round"
                :stroke-dasharray="CIRCLE_LENGTH"
                :stroke-dashoffset="dashOffset"
                class="donut-progress"
                transform="rotate(-90 50 50)"
              />
              <!-- 中心文字 -->
              <text
                x="50" y="50"
                text-anchor="middle"
                dominant-baseline="central"
                class="donut-text"
                :class="{ 'donut-text--small': rateText.length > 4 }"
              >
                {{ rateText }}
              </text>
            </svg>
          </div>
          <p class="punch-stat-desc">
            总打卡 {{ store.analysis.total_punches }} 次
          </p>
        </div>

        <!-- 本周完成趋势柱状图（纯 CSS，7 列） -->
        <div class="punch-trend-card">
          <h2 class="punch-section-title">本周完成趋势</h2>
          <div id="trend-chart" class="punch-trend-chart" v-if="trendData.length > 0">
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
            <AppIcon name="lightbulb" :size="18" class="punch-comment-icon" />
            <h3 class="punch-comment-title">AI 分析</h3>
          </div>
          <div
            class="punch-comment-body"
            v-html="renderMarkdown(store.analysis.adherence_comment)"
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

        <!-- 分析范围提示 -->
        <p class="analysis-range-hint" v-if="store.analysis">
          分析基于当前筛选范围内的打卡记录
        </p>

        <!-- AI 免责提示条（恒显底部） -->
        <DisclaimerBar text="AI 分析内容仅供参考，不能替代专业医疗诊断，如有不适请及时就医。" />
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
        <!-- 刷新按钮 (G5) -->
        <button
          class="btn-icon press"
          id="btn-refresh"
          @click="onRefresh"
          :disabled="store.listLoading || store.analysisLoading"
          :title="refreshTitle"
          aria-label="刷新打卡数据"
        >
          <AppIcon name="arrows-rotate" :size="18" :class="{ 'is-spinning': isRefreshing }" />
        </button>
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
          @click="typeFilter = opt.value"
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
      <div id="empty-container" v-else-if="store.records.length === 0" class="punch-empty">
        <div class="punch-empty-card">
          <div class="punch-empty-icon">
            <AppIcon name="calendar-check" :size="48" />
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
          <AppIcon name="spinner" :size="12" class="punch-spinner punch-spinner-sm" />
          <span>刷新中...</span>
        </div>

        <div id="punch-list" class="punch-record-list">
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
                <AppIcon :name="typeIcon(record.punch_type)" :size="16" />
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
          <AppIcon name="spinner" :size="18" class="punch-spinner" />
          <span>加载中...</span>
        </div>

        <!-- 还有更多：手动加载按钮 -->
        <button
          v-else-if="store.hasMore"
          id="btn-load-more"
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

/* ===== 分析范围提示 ===== */
.analysis-range-hint {
  font-size: 12px;
  color: var(--color-text-secondary, #999);
  text-align: center;
  margin: 8px 0;
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

/* 按压动画（已迁移至全局 animations.css） */

/* ===== 环形图 (G4) ===== */

.punch-donut-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: var(--spacing-md);
}

.donut-chart {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 120px;
  height: 120px;
  margin: 0 auto;
}

.donut-svg {
  width: 100%;
  height: 100%;
}

/* 进度环动画：CSS transition 驱动 stroke-dashoffset 变化 */
.donut-progress {
  transition: stroke-dashoffset 0.8s ease-out;
}

/* 中心文字 */
.donut-text {
  font-size: 14px;
  font-weight: 600;
  fill: var(--color-text-primary, #333);
}

/* 小字号变体（如 "100%" 4字符以上时缩小字号避免溢出） */
.donut-text--small {
  font-size: 12px;
}

.punch-stat-desc {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-top: var(--spacing-xs);
}

/* ===== 刷新按钮 (G5) ===== */

#btn-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--color-divider, #ddd);
  background: var(--color-bg, #fff);
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  font-size: 16px;
  flex-shrink: 0;
}

#btn-refresh:hover:not(:disabled) {
  background: var(--color-bg, #f5f5f5);
  color: var(--color-primary, #4A90D9);
}

#btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 旋转动画 class */
.is-spinning {
  animation: spin 1s linear infinite;
}

/* 通用旋转关键帧 */
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
