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
