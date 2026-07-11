import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// Mock API module
const mockGetPunchList = vi.fn()
const mockGetPunchAnalysis = vi.fn()

vi.mock('@/composables/usePunchApi', () => ({
  getPunchList: (...args: unknown[]) => mockGetPunchList(...args),
  getPunchAnalysis: (...args: unknown[]) => mockGetPunchAnalysis(...args),
}))

import { usePunchStore } from '@/stores/punchStore'

// 辅助：构造 mock PunchRecord 列表
function makePunchRecords(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    user_id: 1,
    plan_item_id: i + 1,
    punch_type: i % 2 === 0 ? 'diet' : 'exercise',
    completion_status: 'done' as const,
    note: `打卡备注 ${i + 1}`,
    created_at: `2024-06-${String(15 - i).padStart(2, '0')}T08:00:00.000Z`,
  }))
}

function makePagination(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
}

function makeAnalysisResponse() {
  return {
    total_days: 30,
    completion_rate: 0.85,
    streak_days: 7,
    summary: '您本周打卡表现良好，继续保持！',
    suggestions: ['建议增加运动强度', '饮食均衡良好'],
  }
}

describe('punchStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // 重置所有 fake timers
    vi.useRealTimers()
  })

  // ---------------------------------------------------------------
  // 初始状态
  // ---------------------------------------------------------------
  describe('初始状态', () => {
    it('records 初始为空数组', () => {
      const store = usePunchStore()
      expect(store.records).toEqual([])
    })

    it('pagination 初始为 null', () => {
      const store = usePunchStore()
      expect(store.pagination).toBeNull()
    })

    it('analysis 初始为 null', () => {
      const store = usePunchStore()
      expect(store.analysis).toBeNull()
    })

    it('listLoading / listLoadingMore / analysisLoading 均为 false', () => {
      const store = usePunchStore()
      expect(store.listLoading).toBe(false)
      expect(store.listLoadingMore).toBe(false)
      expect(store.analysisLoading).toBe(false)
    })

    it('error / analysisError 均为 null', () => {
      const store = usePunchStore()
      expect(store.error).toBeNull()
      expect(store.analysisError).toBeNull()
    })

    it('hasMore 初始为 false（无 pagination）', () => {
      const store = usePunchStore()
      expect(store.hasMore).toBe(false)
    })

    it('currentPage 初始为 1', () => {
      const store = usePunchStore()
      expect(store.currentPage).toBe(1)
    })
  })

  // ---------------------------------------------------------------
  // fetchList
  // ---------------------------------------------------------------
  describe('fetchList', () => {
    it('成功拉取列表并写入 records + pagination', async () => {
      const records = makePunchRecords(5)
      const pagination = makePagination(1, 20, 5)
      mockGetPunchList.mockResolvedValue({ records, pagination })

      const store = usePunchStore()
      await store.fetchList()

      expect(store.records).toHaveLength(5)
      expect(store.pagination).toEqual(pagination)
      expect(store.listLoading).toBe(false)
      expect(store.error).toBeNull()
    })

    it('空列表时 records 为空数组', async () => {
      mockGetPunchList.mockResolvedValue({
        records: [],
        pagination: makePagination(1, 20, 0),
      })

      const store = usePunchStore()
      await store.fetchList()

      expect(store.records).toEqual([])
      expect(store.pagination!.total).toBe(0)
    })

    it('API 失败时设置 error', async () => {
      mockGetPunchList.mockRejectedValue(new Error('网络错误'))

      const store = usePunchStore()
      await store.fetchList()

      expect(store.error).toBeInstanceOf(Error)
      expect(store.listLoading).toBe(false)
    })

    it('非 Error 类型异常被包装', async () => {
      mockGetPunchList.mockRejectedValue('connection refused')

      const store = usePunchStore()
      await store.fetchList()

      expect(store.error!.message).toBe('打卡记录加载失败')
    })

    it('应用当前 filter 参数', async () => {
      const records = makePunchRecords(3)
      mockGetPunchList.mockResolvedValue({
        records,
        pagination: makePagination(1, 20, 3),
      })

      const store = usePunchStore()
      store.$patch({ filter: { startDate: '2024-06-01', endDate: '2024-06-30' } })
      await store.fetchList()

      expect(mockGetPunchList).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1, pageSize: 20,
          startDate: '2024-06-01',
          endDate: '2024-06-30',
        })
      )
    })

    it('requestId 快照：快速连续调用时旧响应被丢弃', async () => {
      // 第一次调用延迟返回
      let resolveFirst: (value: unknown) => void
      const firstPromise = new Promise(resolve => { resolveFirst = resolve })

      mockGetPunchList
        .mockReturnValueOnce(firstPromise)
        .mockResolvedValueOnce({
          records: makePunchRecords(10),
          pagination: makePagination(1, 20, 10),
        })

      const store = usePunchStore()
      // 发起第一次请求
      const p1 = store.fetchList()
      // 发起第二次请求（覆盖第一次 requestId）
      const p2 = store.fetchList()

      // 第一次请求完成
      resolveFirst!({ records: makePunchRecords(2), pagination: makePagination(1, 20, 2) })
      await p1

      // 第二次请求完成
      await p2

      // 最终状态应该来自第二次请求
      expect(store.records).toHaveLength(10)
    })
  })

  // ---------------------------------------------------------------
  // loadMore
  // ---------------------------------------------------------------
  describe('loadMore', () => {
    it('追加下一页数据到 records', async () => {
      // 先设置首屏数据
      const store = usePunchStore()
      store.$patch({
        records: makePunchRecords(20),
        pagination: makePagination(1, 20, 45),
      })

      const moreRecords = makePunchRecords(20).map((r, i) => ({ ...r, id: i + 21 }))
      mockGetPunchList.mockResolvedValue({
        records: moreRecords,
        pagination: makePagination(2, 20, 45),
      })

      await store.loadMore()

      expect(store.records).toHaveLength(40)
      expect(store.pagination!.page).toBe(2)
    })

    it('hasMore=false 时不发起请求', async () => {
      const store = usePunchStore()
      store.$patch({
        records: makePunchRecords(5),
        pagination: makePagination(1, 20, 5),
      })

      await store.loadMore()
      expect(mockGetPunchList).not.toHaveBeenCalled()
    })

    it('listLoadingMore=true 时不发起请求（防重复）', async () => {
      const store = usePunchStore()
      store.$patch({
        records: makePunchRecords(20),
        pagination: makePagination(1, 20, 45),
        listLoadingMore: true,
      })

      await store.loadMore()
      expect(mockGetPunchList).not.toHaveBeenCalled()
    })

    it('loadMore 失败设置 error', async () => {
      const store = usePunchStore()
      store.$patch({
        records: makePunchRecords(20),
        pagination: makePagination(1, 20, 45),
      })

      mockGetPunchList.mockRejectedValue(new Error('网络断开'))
      await store.loadMore()

      expect(store.error).toBeInstanceOf(Error)
      expect(store.listLoadingMore).toBe(false)
    })
  })

  // ---------------------------------------------------------------
  // fetchAnalysis
  // ---------------------------------------------------------------
  describe('fetchAnalysis', () => {
    it('成功拉取 AI 分析', async () => {
      const analysis = makeAnalysisResponse()
      mockGetPunchAnalysis.mockResolvedValue(analysis)

      const store = usePunchStore()
      await store.fetchAnalysis()

      expect(store.analysis).toEqual(analysis)
      expect(store.analysisLoading).toBe(false)
      expect(store.analysisError).toBeNull()
    })

    it('AI 分析失败设置 analysisError', async () => {
      mockGetPunchAnalysis.mockRejectedValue(new Error('AI 不可用'))

      const store = usePunchStore()
      await store.fetchAnalysis()

      expect(store.analysisError).toBeInstanceOf(Error)
      expect(store.analysisError!.message).toBe('AI 不可用')
    })
  })

  // ---------------------------------------------------------------
  // setFilter
  // ---------------------------------------------------------------
  describe('setFilter', () => {
    it('更新 filter 并重新拉取列表', async () => {
      mockGetPunchList.mockResolvedValue({
        records: makePunchRecords(5),
        pagination: makePagination(1, 20, 5),
      })

      const store = usePunchStore()
      await store.setFilter({ startDate: '2024-06-01' })

      expect(store.filter.startDate).toBe('2024-06-01')
      expect(mockGetPunchList).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, startDate: '2024-06-01' })
      )
    })

    it('punch_type 设为 undefined 表示"全部"', async () => {
      mockGetPunchList.mockResolvedValue({
        records: [],
        pagination: makePagination(1, 20, 0),
      })

      const store = usePunchStore()
      store.$patch({ filter: { punch_type: 'diet' } })
      await store.setFilter({ punch_type: undefined })

      expect(store.filter.punch_type).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------
  // getters
  // ---------------------------------------------------------------
  describe('getters', () => {
    it('hasMore: 当前页 < 总页数时返回 true', () => {
      const store = usePunchStore()
      store.$patch({
        pagination: makePagination(1, 20, 60),
      })
      expect(store.hasMore).toBe(true)
    })

    it('hasMore: 当前页 >= 总页数时返回 false', () => {
      const store = usePunchStore()
      store.$patch({
        pagination: makePagination(3, 20, 60),
      })
      expect(store.hasMore).toBe(false)
    })

    it('hasMore: pagination=null 时返回 false', () => {
      const store = usePunchStore()
      expect(store.hasMore).toBe(false)
    })

    it('currentPage: 返回当前页码', () => {
      const store = usePunchStore()
      store.$patch({
        pagination: makePagination(3, 20, 60),
      })
      expect(store.currentPage).toBe(3)
    })

    it('currentPage: pagination=null 时返回 1', () => {
      const store = usePunchStore()
      expect(store.currentPage).toBe(1)
    })
  })

  // ---------------------------------------------------------------
  // retry 方法
  // ---------------------------------------------------------------
  describe('retry 方法', () => {
    it('retryFetchList 重新拉取列表', async () => {
      const records = makePunchRecords(3)
      mockGetPunchList.mockResolvedValue({
        records,
        pagination: makePagination(1, 20, 3),
      })

      const store = usePunchStore()
      await store.retryFetchList()

      expect(mockGetPunchList).toHaveBeenCalled()
      expect(store.records).toHaveLength(3)
    })

    it('retryFetchAnalysis 重新拉取分析', async () => {
      const analysis = makeAnalysisResponse()
      mockGetPunchAnalysis.mockResolvedValue(analysis)

      const store = usePunchStore()
      await store.retryFetchAnalysis()

      expect(mockGetPunchAnalysis).toHaveBeenCalled()
      expect(store.analysis).toEqual(analysis)
    })
  })
})
