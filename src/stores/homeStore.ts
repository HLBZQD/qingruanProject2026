import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Doctor, Article, DiabetesType, DiabetesTypeDetail } from '@/types/api'
import { getDoctors, getArticles, getDiabetesTypes, getDiabetesType } from '@/composables/useHomeApi'

/** 展示视图类型（不入 api.ts，避免污染对外契约类型） */
export interface DiabetesTypeView extends DiabetesType {
  /** 归一后的封面（image || '' → 组件判空走渐变） */
  cover: string
  /** 归一后的卡片简介（pathogenesis 截断 28 字兜底，空则 ''） */
  brief: string
}

const FALLBACK_DIABETES_COVER = ''

export const useHomeStore = defineStore('home', () => {
  // ===== state =====
  const doctors = ref<Doctor[]>([])
  const articles = ref<Article[]>([])
  const diabetesTypes = ref<DiabetesTypeView[]>([])

  /** 全局加载态（三接口至少一个 pending 为 true） */
  const loading = ref<boolean>(false)
  /** 分区块错误，支持独立降级 */
  const doctorsError = ref<Error | null>(null)
  const articlesError = ref<Error | null>(null)
  const typesError = ref<Error | null>(null)
  /** 弹层详情按需拉取 */
  const detailLoading = ref<boolean>(false)
  const detailError = ref<Error | null>(null)

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

  // ===== actions =====

  /**
   * 并行拉取三个公开接口；任一失败不阻断其余区块。
   * 用 Promise.allSettled，按 result.status 回填数据/错误。
   */
  async function fetchHomeData(): Promise<void> {
    // 检查 sessionStorage 缓存
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
      getArticles({ page: 1, pageSize: 3 }), // 首页仅取前 3 条
      getDiabetesTypes(),
    ])

    if (docRes.status === 'fulfilled') doctors.value = docRes.value
    else doctorsError.value = docRes.reason instanceof Error ? docRes.reason : new Error('医师列表加载失败')
    if (artRes.status === 'fulfilled') articles.value = artRes.value
    else articlesError.value = artRes.reason instanceof Error ? artRes.reason : new Error('科普文章加载失败')
    if (typeRes.status === 'fulfilled') diabetesTypes.value = normalizeTypes(typeRes.value)
    else typesError.value = typeRes.reason instanceof Error ? typeRes.reason : new Error('糖尿病类型加载失败')

    // API 成功后写入缓存（部分成功也写入——已有数据即可缓存）
    if (docRes.status === 'fulfilled' || artRes.status === 'fulfilled' || typeRes.status === 'fulfilled') {
      writeHomeCache()
    }

    loading.value = false
  }

  /**
   * 弹层按需拉取单个类型详情；失败回退列表项已有数据。
   * id 为后端 number 主键。
   */
  async function fetchDiabetesTypeDetail(id: number): Promise<DiabetesTypeDetail | null> {
    detailLoading.value = true
    detailError.value = null
    try {
      return await getDiabetesType(id)
    } catch (e) {
      detailError.value = e instanceof Error ? e : new Error('类型详情加载失败')
      // 回退：从已缓存列表中找（id 为 number，直接比较）
      const cached = diabetesTypes.value.find((t) => t.id === id)
      return cached ?? null
    } finally {
      detailLoading.value = false
    }
  }

  /** 重试单个区块 */
  async function retryDoctors(): Promise<void> {
    await fetchSingle('doctors')
  }
  async function retryArticles(): Promise<void> {
    await fetchSingle('articles')
  }
  async function retryTypes(): Promise<void> {
    await fetchSingle('types')
  }

  async function fetchSingle(which: 'doctors' | 'articles' | 'types'): Promise<void> {
    if (which === 'doctors') {
      doctorsError.value = null
      try {
        doctors.value = await getDoctors({ page: 1, pageSize: 20 })
        writeHomeCache()
      } catch (e) {
        doctorsError.value = e instanceof Error ? e : new Error('医师列表加载失败')
      }
      return
    }
    if (which === 'articles') {
      articlesError.value = null
      try {
        articles.value = await getArticles({ page: 1, pageSize: 3 })
        writeHomeCache()
      } catch (e) {
        articlesError.value = e instanceof Error ? e : new Error('科普文章加载失败')
      }
      return
    }
    typesError.value = null
    try {
      diabetesTypes.value = normalizeTypes(await getDiabetesTypes())
      writeHomeCache()
    } catch (e) {
      typesError.value = e instanceof Error ? e : new Error('糖尿病类型加载失败')
    }
  }

  // ===== 内部归一（纯函数，组件只读归一化后的 diabetesTypes） =====
  /** 将后端 image 归一为展示 cover；brief 由 pathogenesis 截断 28 字兜底 */
  function normalizeType(t: DiabetesType): DiabetesTypeView {
    const cover = (t.image ?? '') || FALLBACK_DIABETES_COVER
    const brief = t.pathogenesis
      ? t.pathogenesis.length > 28
        ? t.pathogenesis.slice(0, 28) + '…'
        : t.pathogenesis
      : ''
    return { ...t, cover, brief }
  }
  function normalizeTypes(list: DiabetesType[]): DiabetesTypeView[] {
    return list.map(normalizeType)
  }

  return {
    // state
    doctors,
    articles,
    diabetesTypes,
    loading,
    doctorsError,
    articlesError,
    typesError,
    detailLoading,
    detailError,
    // actions
    fetchHomeData,
    fetchDiabetesTypeDetail,
    retryDoctors,
    retryArticles,
    retryTypes,
    // cache
    clearHomeCache,
  }
})
