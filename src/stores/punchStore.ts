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

  // ===== getters =====
  /** 是否还有下一页 */
  const hasMore = computed(() => {
    if (!pagination.value) return false
    return pagination.value.page < pagination.value.totalPages
  })

  /** 当前页码（loadMore 用） */
  const currentPage = computed(() => pagination.value?.page ?? 1)

  // ===== actions =====

  /** 请求序列号（防竞态：快速切换筛选时旧响应不覆盖新响应） */
  const requestId = ref(0)

  /** 防抖 timer：setFilter 中 fetchAnalysis 使用，避免连续改日期导致多次 API 请求 */
  let analysisDebounceTimer: ReturnType<typeof setTimeout> | null = null

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
    requestId.value++
    const snapshot = requestId.value
    try {
      analysis.value = await getPunchAnalysis()
      if (snapshot !== requestId.value) return
    } catch (e) {
      if (snapshot !== requestId.value) return
      analysisError.value = e instanceof Error ? e : new Error('AI 分析暂不可用')
    } finally {
      if (snapshot === requestId.value) {
        analysisLoading.value = false
      }
    }
  }

  /**
   * 更新筛选条件并重新拉取列表（重置到第 1 页）。
   * partial 仅含变化字段；未提供字段保留原值。
   * punch_type 切回 undefined 表示「全部」。
   */
  async function setFilter(partial: {
    startDate?: string
    endDate?: string
    punch_type?: PunchType | undefined
  }): Promise<void> {
    if ('startDate' in partial) filter.startDate = partial.startDate
    if ('endDate' in partial) filter.endDate = partial.endDate
    if ('punch_type' in partial) filter.punch_type = partial.punch_type
    // 重置到首屏
    await fetchList()

    // 防抖触发分析重拉取（300ms）
    if (analysisDebounceTimer !== null) {
      clearTimeout(analysisDebounceTimer)
    }
    analysisDebounceTimer = setTimeout(() => {
      analysisDebounceTimer = null
      fetchAnalysis()
    }, 300)
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
