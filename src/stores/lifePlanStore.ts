import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  PlanGenerateRequest,
  PlanAdjustRequest,
  PlanCurrentResponse,
  PunchCreateRequest,
  PunchCreateResponse,
  CompletionStatus,
} from '@/types/api'
import { getCurrentPlan, generatePlan, adjustPlan, createPunch } from '@/composables/useLifePlanApi'

export const useLifePlanStore = defineStore('lifePlan', () => {
  // ===== state =====
  /** 当前活跃方案组（空方案时 null，非错误） */
  const currentPlan = ref<PlanCurrentResponse | null>(null)
  /** 生成中锁（防双击 + 按钮 loading） */
  const generating = ref<boolean>(false)
  /** 初始加载态（fetchCurrent） */
  const loading = ref<boolean>(false)
  /** fetchCurrent 错误 */
  const error = ref<Error | null>(null)
  /** generate/adjust 错误（独立于 fetch，支持降级分支） */
  const generateError = ref<Error | null>(null)
  const adjustError = ref<Error | null>(null)
  /** 历史降级标记（生成失败但渲染缓存 currentPlan） */
  const isHistoryFallback = ref<boolean>(false)
  /** 409 幂等标记（生成过于频繁） */
  const isConflict = ref<boolean>(false)
  /**
   * 打卡完成态本地缓存：按方案项 LifePlan.id 索引 → CompletionStatus。
   * 供按钮态渲染 + Task 3 复用。乐观更新：先置目标态，失败回滚。
   */
  const completedMap = ref<Map<number, CompletionStatus>>(new Map())

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

  // ===== actions =====

  /**
   * 拉取当前方案。空方案 data:null → currentPlan=null（非错误）。
   * 失败回填 error，不抛出（组件按 error 显示重试态）。
   */
  async function fetchCurrent(): Promise<void> {
    // 检查 sessionStorage 缓存
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
      writePlanCache()          // API 成功后覆盖缓存
    } catch (e: unknown) {
      error.value = e instanceof Error ? e : new Error('方案加载失败')
    } finally {
      loading.value = false
    }
  }

  /**
   * 生成方案。成功写 currentPlan（补 generated_at = new Date().toISOString()，
   * 因 PlanResponse 不含此字段而 PlanCurrentResponse 需要）。
   * 409 CONFLICT → isConflict=true + generateError 文案「请求过于频繁，请稍后再试」。
   * 其他失败 → generateError 回填，isHistoryFallback 由组件据 currentPlan 是否存在决定。
   */
  async function generate(req: PlanGenerateRequest): Promise<boolean> {
    if (generating.value) return false // 防双击
    generating.value = true
    generateError.value = null
    isConflict.value = false
    isHistoryFallback.value = false
    try {
      const data = await generatePlan(req)
      currentPlan.value = { ...data, generated_at: new Date().toISOString() }
      completedMap.value = new Map() // 新方案重置打卡态
      writePlanCache()  // 成功后写入缓存
      return true
    } catch (e: unknown) {
      // 409 幂等识别：axios error.response.status === 409
      const status = (e as { response?: { status?: number } }).response?.status
      if (status === 409) {
        isConflict.value = true
        generateError.value = new Error('请求过于频繁，请稍后再试')
      } else {
        generateError.value = e instanceof Error ? e : new Error('方案生成失败')
        // L3: 生成失败但有缓存 → store 内部置 isHistoryFallback（组件只读，不越过封装）
        if (currentPlan.value) isHistoryFallback.value = true
      }
      return false
    } finally {
      generating.value = false
    }
  }

  /**
   * 调整方案。成功替换 currentPlan（旧方案后端已逻辑过期，前端无需清理）。
   * 失败 → adjustError 回填，保留原 currentPlan 不替换。
   */
  async function adjust(req: PlanAdjustRequest): Promise<boolean> {
    adjustError.value = null
    try {
      const data = await adjustPlan(req)
      currentPlan.value = { ...data, generated_at: new Date().toISOString() }
      completedMap.value = new Map() // 调整后重置打卡态
      writePlanCache()  // 成功后写入缓存
      return true
    } catch (e: unknown) {
      adjustError.value = e instanceof Error ? e : new Error('方案调整失败')
      return false
    }
  }

  /**
   * 新增打卡（乐观更新 completedMap，失败回滚）。
   * req.plan_id 即方案项 LifePlan.id（= itemId 参数，同值），completedMap 索引键同为 itemId。
   * 返回 PunchCreateResponse 供组件 toast。
   */
  async function createPunchAction(
    req: PunchCreateRequest,
    itemId: number,
  ): Promise<PunchCreateResponse> {
    const prev = completedMap.value.get(itemId) // 回滚快照
    completedMap.value.set(itemId, req.completion_status) // 乐观更新
    try {
      const data = await createPunch(req)
      return data
    } catch (e: unknown) {
      // 回滚
      if (prev === undefined) completedMap.value.delete(itemId)
      else completedMap.value.set(itemId, prev)
      throw e // 组件 catch 做 toast
    }
  }

  /** 重试生成（清错误后重试） */
  async function retryGenerate(req: PlanGenerateRequest): Promise<boolean> {
    generateError.value = null
    return generate(req)
  }

  /** 重试拉取当前方案 */
  async function retryFetchCurrent(): Promise<void> {
    await fetchCurrent()
  }

  return {
    // state
    currentPlan,
    generating,
    loading,
    error,
    generateError,
    adjustError,
    isHistoryFallback,
    isConflict,
    completedMap,
    // actions
    fetchCurrent,
    generate,
    adjust,
    createPunch: createPunchAction,
    retryGenerate,
    retryFetchCurrent,
    // cache
    clearPlanCache,
  }
})
