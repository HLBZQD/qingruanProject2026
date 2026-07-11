import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// Mock sessionStorage
const sessionStore: Record<string, string> = {}
vi.stubGlobal('sessionStorage', {
  getItem: vi.fn((key: string) => sessionStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { sessionStore[key] = value }),
  removeItem: vi.fn((key: string) => { delete sessionStore[key] }),
})

// Mock API module
const mockGetCurrentPlan = vi.fn()
const mockGeneratePlan = vi.fn()
const mockAdjustPlan = vi.fn()
const mockCreatePunch = vi.fn()

vi.mock('@/composables/useLifePlanApi', () => ({
  getCurrentPlan: (...args: unknown[]) => mockGetCurrentPlan(...args),
  generatePlan: (...args: unknown[]) => mockGeneratePlan(...args),
  adjustPlan: (...args: unknown[]) => mockAdjustPlan(...args),
  createPunch: (...args: unknown[]) => mockCreatePunch(...args),
}))

import { useLifePlanStore } from '@/stores/lifePlanStore'

// 辅助：构造 mock PlanCurrentResponse
function makePlanResponse() {
  return {
    generated_at: '2024-06-15T08:00:00.000Z',
    plans: [
      { id: 1, plan_type: 'diet', order_num: 1, time_desc: '7:00-8:00', title: '早餐', content: '燕麦粥' },
      { id: 2, plan_type: 'exercise', order_num: 1, time_desc: '6:30-7:00', title: '晨练', content: '快走30分钟' },
    ],
    has_existing_plan: true,
  }
}

describe('lifePlanStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    Object.keys(sessionStore).forEach(k => delete sessionStore[k])
    vi.clearAllMocks()
  })

  // ---------------------------------------------------------------
  // 初始状态
  // ---------------------------------------------------------------
  describe('初始状态', () => {
    it('currentPlan 初始为 null', () => {
      const store = useLifePlanStore()
      expect(store.currentPlan).toBeNull()
    })

    it('generating / loading 均为 false', () => {
      const store = useLifePlanStore()
      expect(store.generating).toBe(false)
      expect(store.loading).toBe(false)
    })

    it('error / generateError / adjustError 均为 null', () => {
      const store = useLifePlanStore()
      expect(store.error).toBeNull()
      expect(store.generateError).toBeNull()
      expect(store.adjustError).toBeNull()
    })

    it('isHistoryFallback / isConflict 均为 false', () => {
      const store = useLifePlanStore()
      expect(store.isHistoryFallback).toBe(false)
      expect(store.isConflict).toBe(false)
    })

    it('completedMap 初始为空 Map', () => {
      const store = useLifePlanStore()
      expect(store.completedMap).toBeInstanceOf(Map)
      expect(store.completedMap.size).toBe(0)
    })
  })

  // ---------------------------------------------------------------
  // fetchCurrent
  // ---------------------------------------------------------------
  describe('fetchCurrent', () => {
    it('成功拉取方案数据', async () => {
      const data = makePlanResponse()
      mockGetCurrentPlan.mockResolvedValue(data)

      const store = useLifePlanStore()
      await store.fetchCurrent()

      expect(store.currentPlan).not.toBeNull()
      expect(store.currentPlan!.plans).toHaveLength(2)
      expect(store.loading).toBe(false)
      expect(store.error).toBeNull()
    })

    it('API 返回 null（空方案）时 currentPlan 设为 null', async () => {
      mockGetCurrentPlan.mockResolvedValue(null)

      const store = useLifePlanStore()
      await store.fetchCurrent()

      expect(store.currentPlan).toBeNull()
      expect(store.error).toBeNull()
    })

    it('API 失败时设置 error', async () => {
      mockGetCurrentPlan.mockRejectedValue(new Error('网络错误'))

      const store = useLifePlanStore()
      await store.fetchCurrent()

      expect(store.error).toBeInstanceOf(Error)
      expect(store.error!.message).toBe('网络错误')
      expect(store.loading).toBe(false)
    })

    it('非 Error 类型异常被包装为 Error', async () => {
      mockGetCurrentPlan.mockRejectedValue('string error')

      const store = useLifePlanStore()
      await store.fetchCurrent()

      expect(store.error).toBeInstanceOf(Error)
      expect(store.error!.message).toBe('方案加载失败')
    })

    it('sessionStorage 缓存命中时跳过 API 调用', async () => {
      const cachedPlan = makePlanResponse()
      sessionStore['qrzl_plan_cache'] = JSON.stringify({
        currentPlan: cachedPlan,
        completedMapArray: [[1, 'done']],
        timestamp: Date.now(),
      })

      const store = useLifePlanStore()
      await store.fetchCurrent()

      expect(mockGetCurrentPlan).not.toHaveBeenCalled()
      expect(store.currentPlan).not.toBeNull()
      expect(store.currentPlan!.plans).toHaveLength(2)
      expect(store.completedMap.get(1)).toBe('done')
    })

    it('缓存过期时重新请求 API', async () => {
      const data = makePlanResponse()
      mockGetCurrentPlan.mockResolvedValue(data)
      sessionStore['qrzl_plan_cache'] = JSON.stringify({
        currentPlan: null,
        completedMapArray: [],
        timestamp: Date.now() - 2000000, // 超过 30 分钟 TTL
      })

      const store = useLifePlanStore()
      await store.fetchCurrent()

      expect(mockGetCurrentPlan).toHaveBeenCalled()
    })

    it('缓存数据损坏时重新请求 API', async () => {
      const data = makePlanResponse()
      mockGetCurrentPlan.mockResolvedValue(data)
      sessionStore['qrzl_plan_cache'] = 'not-valid-json'

      const store = useLifePlanStore()
      await store.fetchCurrent()

      expect(mockGetCurrentPlan).toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------
  // generate
  // ---------------------------------------------------------------
  describe('generate', () => {
    const genReq = {
      age: 45, gender: 'male' as const, height: 170, weight: 75,
      diabetes_type: 'type2' as const, risk_level: 'medium' as const,
    }

    it('成功生成方案返回 true', async () => {
      mockGeneratePlan.mockResolvedValue(makePlanResponse())

      const store = useLifePlanStore()
      const result = await store.generate(genReq)

      expect(result).toBe(true)
      expect(store.currentPlan).not.toBeNull()
      expect(store.currentPlan!.generated_at).toBeDefined()
      expect(store.completedMap.size).toBe(0) // 新方案重置打卡态
      expect(store.generating).toBe(false)
    })

    it('生成失败返回 false 并设置 generateError', async () => {
      mockGeneratePlan.mockRejectedValue(new Error('AI 服务超时'))

      const store = useLifePlanStore()
      const result = await store.generate(genReq)

      expect(result).toBe(false)
      expect(store.generateError).toBeInstanceOf(Error)
    })

    it('409 冲突时设置 isConflict=true', async () => {
      const conflictError = new Error('冲突') as Error & { response?: { status?: number } }
      conflictError.response = { status: 409 }
      mockGeneratePlan.mockRejectedValue(conflictError)

      const store = useLifePlanStore()
      await store.generate(genReq)

      expect(store.isConflict).toBe(true)
      expect(store.generateError!.message).toBe('请求过于频繁，请稍后再试')
    })

    it('生成中防双击：generating=true 时直接返回 false', async () => {
      const store = useLifePlanStore()
      // 模拟 generating 状态
      store.$patch({ generating: true })

      const result = await store.generate(genReq)

      expect(result).toBe(false)
      expect(mockGeneratePlan).not.toHaveBeenCalled()
    })

    it('生成失败但有旧 currentPlan 时置 isHistoryFallback=true', async () => {
      // 先成功生成一次
      mockGeneratePlan.mockResolvedValueOnce(makePlanResponse())
      const store = useLifePlanStore()
      await store.generate(genReq)

      // 再次生成失败
      mockGeneratePlan.mockRejectedValue(new Error('失败'))
      await store.generate(genReq)

      expect(store.isHistoryFallback).toBe(true)
    })
  })

  // ---------------------------------------------------------------
  // adjust
  // ---------------------------------------------------------------
  describe('adjust', () => {
    const adjustReq = {
      feedback: '早餐太清淡，想要更多蛋白质',
      current_plan_summary: 'existing plan',
    }

    it('成功调整方案返回 true', async () => {
      mockAdjustPlan.mockResolvedValue(makePlanResponse())

      const store = useLifePlanStore()
      const result = await store.adjust(adjustReq)

      expect(result).toBe(true)
      expect(store.currentPlan).not.toBeNull()
      expect(store.completedMap.size).toBe(0) // 调整后重置打卡态
    })

    it('调整失败返回 false 并设置 adjustError', async () => {
      mockAdjustPlan.mockRejectedValue(new Error('调整失败'))

      const store = useLifePlanStore()
      const result = await store.adjust(adjustReq)

      expect(result).toBe(false)
      expect(store.adjustError).toBeInstanceOf(Error)
    })

    it('调整失败保留原有 currentPlan', async () => {
      // 先生成一个方案
      mockGeneratePlan.mockResolvedValueOnce(makePlanResponse())
      const store = useLifePlanStore()
      await store.generate({
        age: 45, gender: 'male' as const, height: 170, weight: 75,
        diabetes_type: 'type2' as const, risk_level: 'medium' as const,
      })

      const savedPlan = store.currentPlan
      mockAdjustPlan.mockRejectedValue(new Error('调整失败'))
      await store.adjust(adjustReq)

      expect(store.currentPlan).toBe(savedPlan)
    })
  })

  // ---------------------------------------------------------------
  // createPunch
  // ---------------------------------------------------------------
  describe('createPunch', () => {
    it('乐观更新 completedMap 并返回结果', async () => {
      const punchResponse = { message: '打卡成功' }
      mockCreatePunch.mockResolvedValue(punchResponse)

      const store = useLifePlanStore()
      const req = { plan_id: 1, completion_status: 'done' as const }
      const result = await store.createPunch(req, 1)

      expect(result).toEqual(punchResponse)
      expect(store.completedMap.get(1)).toBe('done')
    })

    it('打卡失败时回滚 completedMap', async () => {
      mockCreatePunch.mockRejectedValue(new Error('打卡失败'))

      const store = useLifePlanStore()
      store.completedMap.set(1, 'pending')

      const req = { plan_id: 1, completion_status: 'done' as const }
      await expect(store.createPunch(req, 1)).rejects.toThrow('打卡失败')

      // 回滚到原值
      expect(store.completedMap.get(1)).toBe('pending')
    })

    it('打卡失败时若无原值则删除键', async () => {
      mockCreatePunch.mockRejectedValue(new Error('fail'))

      const store = useLifePlanStore()
      const req = { plan_id: 2, completion_status: 'done' as const }
      await expect(store.createPunch(req, 2)).rejects.toThrow('fail')

      expect(store.completedMap.has(2)).toBe(false)
    })
  })

  // ---------------------------------------------------------------
  // sessionStorage 缓存
  // ---------------------------------------------------------------
  describe('clearPlanCache', () => {
    it('清除 sessionStorage 中的方案缓存', () => {
      sessionStore['qrzl_plan_cache'] = JSON.stringify({ currentPlan: null, completedMapArray: [], timestamp: Date.now() })

      const store = useLifePlanStore()
      store.clearPlanCache()

      expect('qrzl_plan_cache' in sessionStore).toBe(false)
    })

    it('缓存不存在时不报错', () => {
      const store = useLifePlanStore()
      expect(() => store.clearPlanCache()).not.toThrow()
    })
  })

  // ---------------------------------------------------------------
  // retryGenerate / retryFetchCurrent
  // ---------------------------------------------------------------
  describe('retry 方法', () => {
    it('retryGenerate 清除 generateError 后调用 generate', async () => {
      mockGeneratePlan.mockResolvedValue(makePlanResponse())

      const store = useLifePlanStore()
      store.$patch({ generateError: new Error('旧错误') })

      const req = {
        age: 45, gender: 'male' as const, height: 170, weight: 75,
        diabetes_type: 'type2' as const, risk_level: 'medium' as const,
      }
      await store.retryGenerate(req)

      expect(store.generateError).toBeNull()
    })

    it('retryFetchCurrent 调用 fetchCurrent', async () => {
      mockGetCurrentPlan.mockResolvedValue(makePlanResponse())

      const store = useLifePlanStore()
      await store.retryFetchCurrent()

      expect(mockGetCurrentPlan).toHaveBeenCalled()
      expect(store.currentPlan).not.toBeNull()
    })
  })
})
