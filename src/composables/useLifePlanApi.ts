import { api } from '@/composables/useApi'
import type {
  PlanGenerateRequest,
  PlanAdjustRequest,
  PlanResponse,
  PlanCurrentResponse,
  PunchCreateRequest,
  PunchCreateResponse,
} from '@/types/api'

/**
 * GET /api/plan/current — 获取当前活跃方案组。
 * 解包：res.data 是 ApiResponse<PlanCurrentResponse|null>，data = res.data.data。
 * 空方案时 data 为 null（非错误），调用方须判空。
 */
export async function getCurrentPlan(): Promise<PlanCurrentResponse | null> {
  const res = await api.get<{ success: boolean; data: PlanCurrentResponse | null; message?: string }>(
    '/plan/current',
  )
  return res.data.data
}

/**
 * POST /api/plan/generate — 生成方案（Dify blocking，超时 15s）。
 * 解包：res.data.data 是 PlanResponse（无 generated_at）。
 * 请求级 timeout: 20000（给后端 15s 余量，防边界误降级）。
 * 409 CONFLICT 由调用方 catch 处理（30s 幂等）。
 */
export async function generatePlan(req: PlanGenerateRequest): Promise<PlanResponse> {
  const res = await api.post<{ success: boolean; data: PlanResponse; message?: string }>(
    '/plan/generate',
    req,
    { timeout: 20000 },
  )
  return res.data.data
}

/**
 * PUT /api/plan/adjust — 调整方案（复用原 health_info，Dify blocking）。
 * 解包：res.data.data 是 PlanResponse（无 generated_at）。
 * plan_id 取方案组 ID（currentPlan.plan_id）。
 */
export async function adjustPlan(req: PlanAdjustRequest): Promise<PlanResponse> {
  const res = await api.put<{ success: boolean; data: PlanResponse; message?: string }>(
    '/plan/adjust',
    req,
  )
  return res.data.data
}

/**
 * POST /api/punch — 新增打卡（HTTP 201，axios 仍走 res.data 解包）。
 * 解包：res.data.data 是 PunchCreateResponse。
 * plan_id 取方案项 ID（LifePlan.id）；punch_type 仅 diet/exercise。
 */
export async function createPunch(req: PunchCreateRequest): Promise<PunchCreateResponse> {
  const res = await api.post<{ success: boolean; data: PunchCreateResponse; message?: string }>(
    '/punch',
    req,
  )
  return res.data.data
}
