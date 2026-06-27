import { api } from '@/composables/useApi'
import type {
  Doctor,
  Article,
  ArticleDetail,
  DiabetesType,
  DiabetesTypeDetail,
  PaginationParams,
  PaginationInfo,
} from '@/types/api'

/**
 * 分页端点的 HTTP body 类型。
 * 依据 docs/2_detailed_design_v3.md 3.2.9 / 3.2.19：body = { success, data: T[], pagination }，
 * pagination 与 data 平级在最外层（即 body 本身），不是 ApiResponse<PaginatedResponse<T>>。
 * 此类型即 PaginatedResponse<T> & { success: boolean; message?: string } 的内联等价。
 */
interface PagedBody<T> {
  success: boolean
  data: T[]
  pagination: PaginationInfo
  message?: string
}

/** 医生列表分页参数（page/pageSize 均可选，缺省走后端默认） */
type DoctorsParams = Partial<PaginationParams>

/** 文章列表参数：分类筛选 + 分页 */
interface ArticlesParams extends Partial<PaginationParams> {
  category?: string
}

/**
 * GET /api/doctors（分页）
 * 解包：res.data 是 body（PagedBody<Doctor>），数组 = res.data.data，分页 = res.data.pagination。
 * 返回 Doctor[]。
 */
export async function getDoctors(params: DoctorsParams = {}): Promise<Doctor[]> {
  const res = await api.get<PagedBody<Doctor>>('/doctors', { params })
  return res.data.data
}

/**
 * GET /api/articles（分页 + 分类筛选）
 * 解包：res.data.data 是 Article[]；返回 Article[]。
 */
export async function getArticles(params: ArticlesParams = {}): Promise<Article[]> {
  const res = await api.get<PagedBody<Article>>('/articles', { params })
  return res.data.data
}

/**
 * GET /api/diabetes-types（非分页，数组直返）
 * 依据 3.2.24 / 3.8.3：body = { success, data: DiabetesType[] }（无 pagination）。
 * 单一解包路径 res.data.data，不做过度兼容分支。
 * 返回 DiabetesType[]。
 */
export async function getDiabetesTypes(): Promise<DiabetesType[]> {
  const res = await api.get<{ success: boolean; data: DiabetesType[]; message?: string }>('/diabetes-types')
  return res.data.data
}

/**
 * GET /api/diabetes-types/:id（单对象，详情字段与列表一致）
 * 解包：res.data.data 是 DiabetesType；返回 DiabetesTypeDetail。
 * id 为后端 number 主键。
 */
export async function getDiabetesType(id: number): Promise<DiabetesTypeDetail> {
  const res = await api.get<{ success: boolean; data: DiabetesType; message?: string }>(
    `/diabetes-types/${encodeURIComponent(id)}`,
  )
  return res.data.data
}

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
