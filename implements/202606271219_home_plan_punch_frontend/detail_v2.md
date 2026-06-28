# detail_v2 — 生活方案 LifePlan 前端详细设计（第 2 轮）

> 产出方：Designer 角色
> 范围：Task 2 = `src/views/LifePlan.vue` 完整重写 + 配套 `types/api.ts` 增补 / `stores/lifePlanStore.ts` 新建 / `composables/useLifePlanApi.ts` 新建 / `utils/enumLabels.ts` 增补
> 视觉与交互唯一基准：`docs/prototype.html` LifePlan 模板（619-761 行）+ mock（178-188 行 `lifePlanDiet`/`lifePlanSport`）
> 复用范式：`Risk.vue`（marked+DOMPurify+Swal+tBlock+onUnmounted timer+getErrorMessage）、`homeStore.ts`（setup-store）、`useHomeApi.ts`（axios 解包）、`detail_v1.md`（scoped CSS+CSS 变量、内联 style 弹层、`onerror` 占位兜底）

---

## 0. 定调收敛（必读，覆盖 task_v2 §8 未决）

| # | 未决点 | 最终结论 |
|---|---|---|
| 1 | 打卡请求 `plan_id` 填方案组 ID 还是方案项 `LifePlan.id`？ | **方案项 ID（`LifePlan.id`）**。依据：§2.5 数据字典 `punch_in.plan_item_id` = "关联 life_plans 的**方案项ID**"（v15 修订注明 `plan_item_id` 在 `POST /api/punch` 接口层为必填）；§3.2.17 SQL `LEFT JOIN life_plans l ON p.plan_id = l.id`——`l.id` 是 `life_plans` 主键（方案项 ID）；§3.2.17 示例 `plan_title`「燕麦粥 + 水煮蛋」匹配 §3.2.13 `id=1` 早餐方案项标题。三条独立证据一致指向方案项 ID。§3.2.16 示例 `plan_id:1` 与 `GET /current plan_id:1` 同值属**方案组 plan_id 与首项 id 巧合重合**，不可作为语义证据。`task_v2.md` §1.3/§8#1「倾向方案组 ID」的前提「`punch_in.plan_id` DDL 关联 `life_plans.plan_id`」与实际 DDL（`plan_item_id`→`life_plans.id`）不符，属勘误。Coder 须用 `item.id`（方案项 `LifePlan.id`）透传，禁用方案组 `currentPlan.plan_id`。 |
| 2 | 原型「生活习惯多选 + advice textarea」→契约 `preferences.dietary/activity` 两字符串映射 | **拆为两个字段**：表单保留「当前生活习惯」多选 chip + 「对方案的建议」textarea。映射：`preferences.dietary = selectedHabits.join('；')`（习惯归饮食维度），`preferences.activity = advice`（建议 textarea 归运动/活动维度）。空则空字符串。理由：契约明确 `dietary`/`activity` 两独立字段，单 textarea 无法语义切分；习惯多选天然偏饮食维度，advice textarea 天然偏活动/整体建议。组件内注释说明此映射为「近似归类」，不阻断后端 Dify 解析。 |
| 3 | `POST /api/plan/generate` 响应是否含 `generated_at`？ | **不含**（§3.2.13 响应示例无 `generated_at`，§3.2.15 `GET /current` 有）。`generate()` 成功写 `currentPlan` 时，因 `PlanResponse` 类型不含 `generated_at`，前端以 `new Date().toISOString()` 补全写入 `PlanCurrentResponse.generated_at`（视图展示「生成时间」用），类型上 `PlanResponse` 与 `PlanCurrentResponse` 已分离。 |
| 4 | 从风险页跳 `/life-plan` 是否带 query | **读但不依赖**。组件读 `route.query.riskLevel` / `route.query.diabetesType`（均为可选），若存在则在生成表单态顶部渲染一条提示条（如「基于高风险评估为您定制方案」）；不存在则不渲染。`health_info` 仍主取 `riskFormStore.formData`，query 仅作 UI 提示，不参与请求体。不臆造 query 解析逻辑。 |
| 5 | `health_info.gender` 类型 | **精确联合 `'male'\|'female'`**（全局禁 any + 对齐 `RiskPredictRequest.gender` 与 §1.8.2 TS 层）。`PlanGenerateRequest.health_info.gender` 收紧为联合，非契约原文 `string`。 |
| 6 | 「生成中」阶段文案轮播 timer 间隔与超时阈值 | `setInterval` **1800ms** 轮换 4 条文案（见 §4.2），`onUnmounted` 清理；axios `generatePlan` 请求级 `timeout: 20000`（给后端 Dify 15s blocking 余量，防 15s 边界误降级）；超时按失败降级处理（见 §6）。 |
| 7 | `useSSE.ts`/`chatStore` 是否引入？ | **否**。plan/generate/adjust 走 axios blocking（§3.2.13 step4 「blocking 模式 超时 15s」），非 SSE。本任务不引入 SSE 链路。 |
| 8 | 打卡 SweetAlert2 弹窗交互形态 | 单弹窗：标题「{{item.title}} 打卡」+ 备注 textarea（placeholder「记录今日执行情况...」）+ 两个 confirm 按钮（`完成` / `未完成`，通过 `Swal.getConfirmButton()` / 自定义 `preConfirm` 或两按钮 `showDenyButton` 区分）。备注为用户输入，**原样入请求体**（不 escapeHtml，不对请求体做净化——净化仅针对渲染 DOM 的 AI 输出，§5 约束；task_v2 §3.3 明确「备注作为请求体字符串发送，前端无需净化请求体」）。409 幂等（30s 内重复打卡）→ toast「刚已提交过，请稍后再试」。 |

---

## 1. 类型清单（`src/types/api.ts` 仅增补，勿动既有）

> 全部追加在文件末尾，`DiabetesTypeDetail` 之后。字段名严格对齐 §3.8.3/3.8.5/3.8.6 + DDL（`order_num`/`time_desc`，勿用 `order`/`time` 别名）。`any` 禁用，可空显式标注。

```typescript
// ========== 生活方案类型（Task 2）==========

/** 方案类型枚举：diet=饮食, exercise=运动, other=其他（仅展示不打卡） */
export type PlanType = 'diet' | 'exercise' | 'other';

/**
 * 方案条目（life_plans 表行 / PlanResponse 各分组数组元素）。
 * 字段对齐 docs/2_detailed_design_v3.md 3.8.3 / 2.5 数据字典。
 * 权威字段仅此 6 个；原型 kcal/min/icon/completed 不入契约类型，
 * 由组件/store 视图派生（对齐 Round1 DiabetesTypeView 范式）。
 */
export interface LifePlan {
  /** 方案项主键 id（life_plans.id AUTOINCREMENT） */
  id: number;
  /** 方案类型：diet/exercise/other（英文枚举，UI 经 enumLabel 映射中文） */
  plan_type: PlanType;
  /** 排序号：饮食 1=早餐 2=午餐 3=晚餐 4=加餐；运动 1=晨间 2=晚间 3=周末 */
  order_num: number;
  /** 时间描述文本（如 "7:00-8:00"）；可空字符串 */
  time_desc: string;
  /** 方案项标题（如 "燕麦粥 + 水煮蛋"） */
  title: string;
  /** 方案详细内容，可能含 Markdown，前端 marked.parse+DOMPurify.sanitize+v-html 渲染 */
  content: string;
}

/**
 * 方案生成请求体（POST /api/plan/generate）。
 * 对齐 3.8.5；gender 收紧为 'male'|'female'（非契约原文 string，全局禁 any）。
 */
export interface PlanGenerateRequest {
  health_info: {
    age: number;
    gender: 'male' | 'female';
    height: number;
    weight: number;
  };
  preferences: {
    /** 饮食偏好：由表单「生活习惯多选」join('；') 得出 */
    dietary: string;
    /** 活动偏好：由表单「对方案的建议」textarea 得出 */
    activity: string;
  };
}

/** 方案调整请求体（PUT /api/plan/adjust）；plan_id 为方案组 ID（currentPlan.plan_id） */
export interface PlanAdjustRequest {
  plan_id: number;
  feedback: string;
}

/**
 * 方案响应（POST /api/plan/generate / PUT /api/plan/adjust 的 data）。
 * 对齐 3.8.5；分组结构 diet_plans/exercise_plans/other_plans。
 * 不含 generated_at（仅 PlanCurrentResponse 含）。
 */
export interface PlanResponse {
  /** 方案组 ID（同批所有方案项共享，对应 life_plans.plan_id；打卡透传此值） */
  plan_id: number;
  diet_plans: LifePlan[];
  exercise_plans: LifePlan[];
  /** 'other' 类型方案项（当前 Dify 默认空数组，仅供展示不打卡） */
  other_plans: LifePlan[];
}

/**
 * 当前方案响应（GET /api/plan/current 的 data）。
 * 空方案时 data 为 null（非错误）。
 */
export interface PlanCurrentResponse extends PlanResponse {
  /** 方案生成时间 ISO 字符串（仅 GET /current 返回，generate 响应无此字段） */
  generated_at: string;
}

// ========== 打卡类型（Task 2 前置落地，供 Task 3 复用）==========

/** 打卡类型枚举：仅 diet/exercise（'other' 方案项不打卡，DDL CHECK 约束） */
export type PunchType = 'diet' | 'exercise';

/** 完成状态枚举：completed=已完成, uncompleted=未完成 */
export type CompletionStatus = 'completed' | 'uncompleted';

/** 打卡创建请求（POST /api/punch）；plan_id 为方案项 ID（LifePlan.id） */
export interface PunchCreateRequest {
  plan_id: number;
  punch_type: PunchType;
  completion_status: CompletionStatus;
  /** 用户备注（可选，原样入请求体，不对用户输入做 escapeHtml） */
  remarks?: string;
}

/** 打卡创建响应（POST /api/punch 的 data，HTTP 201） */
export interface PunchCreateResponse {
  id: number;
  plan_id: number;
  punch_type: PunchType;
  completion_status: CompletionStatus;
  remarks: string;
  /** 打卡时间 ISO 字符串 */
  punch_time: string;
}

/** 打卡列表查询参数（GET /api/punch/list，Task 3 用；本轮仅落地类型） */
export interface PunchListParams extends PaginationParams {
  /** YYYY-MM-DD */
  startDate?: string;
  endDate?: string;
  punch_type?: PunchType;
}

/** 打卡记录（GET /api/punch/list 的 data 数组元素，Task 3 用；本轮仅落地类型） */
export interface PunchRecord {
  id: number;
  /** 方案组 ID（可空，历史记录可能方案已过期） */
  plan_id: number | null;
  /** 关联方案项标题（LEFT JOIN life_plans 得，可空） */
  plan_title?: string;
  punch_type: PunchType;
  completion_status: CompletionStatus;
  remarks: string;
  punch_time: string;
}
```

> **共享类型分工**：`PunchType`/`CompletionStatus`/`PunchCreateRequest`/`PunchCreateResponse`/`PunchListParams`/`PunchRecord` 由 Task 2 落地于 `types/api.ts`，Task 3 直接 `import` 复用，**不重复定义**。`PunchAnalysis`/`punchStore`/`usePunchApi`（list/analysis）留 Task 3。

---

## 2. 枚举标签增补（`src/utils/enumLabels.ts`）

> 仅在 `LABELS` 对象内追加三组键，勿动既有 `gender/family_history/diabetes_history/diabetes_type/risk_level`。`enumLabel()` 函数不改。

```typescript
// 追加到 LABELS 对象：
plan_type: { diet: '饮食', exercise: '运动', other: '其他' },
punch_type: { diet: '饮食', exercise: '运动' },
completion_status: { completed: '已完成', uncompleted: '未完成' },
```

---

## 3. `src/composables/useLifePlanApi.ts`（新建）

> 全部走 `useApi.ts` 的 `api`（axios，baseURL `/api`，JWT 拦截器），禁 `any`，泛型精准解包。参照 `useHomeApi.ts` 的内联 body 泛型 + `api` import 范式。**不新建 `usePunchApi.ts`**（打卡仅 create 用，内联此处；Task 3 的 list/analysis 再建 `usePunchApi.ts`）。

```typescript
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
```

---

## 4. `src/stores/lifePlanStore.ts`（新建，setup-store）

> 参照 `homeStore.ts` / `authStore.ts` 写法。`defineStore('lifePlan', () => {...})`。禁 `any`，禁读 `localStorage.token`。

### 4.1 state

```typescript
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
```

### 4.2 actions 实现要点

```typescript
  // ===== actions =====

  /**
   * 拉取当前方案。空方案 data:null → currentPlan=null（非错误）。
   * 失败回填 error，不抛出（组件按 error 显示重试态）。
   */
  async function fetchCurrent(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const data = await getCurrentPlan()
      currentPlan.value = data // 可为 null（空方案态）
    } catch (e) {
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
      return true
    } catch (e) {
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
      return true
    } catch (e) {
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
  ): Promise<PunchCreateResponse | null> {
    const prev = completedMap.value.get(itemId) // 回滚快照
    completedMap.value.set(itemId, req.completion_status) // 乐观更新
    try {
      const data = await createPunch(req)
      return data
    } catch (e) {
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
    currentPlan, generating, loading, error, generateError, adjustError,
    isHistoryFallback, isConflict, completedMap,
    // actions
    fetchCurrent, generate, adjust, createPunch: createPunchAction,
    retryGenerate, retryFetchCurrent,
  }
})
```

> **`createPunch` 落点边界**：`createPunch` 落 `lifePlanStore` + `useLifePlanApi`（LifePlan 页打卡直接用）；Task 3 仅做**列表/统计/分析**，复用 `PunchType` 等类型，**不改** Task 2 的 `createPunch`。Designer 此处明确分工边界，Coder/Task3 不得越界。

---

## 5. `src/views/LifePlan.vue`（完整重写，`<script setup lang="ts">`）

> 四态切换：无方案引导态 / 生成表单态 / 生成中态 / 方案展示态。「重新定制」按钮随时切回生成表单态。子组件全部内联（对齐 Round 1 决策），不抽 `src/components/life-plan/`。

### 5.1 script setup 结构骨架

```typescript
<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import Swal from 'sweetalert2'
import { useLifePlanStore } from '@/stores/lifePlanStore'
import { useRiskFormStore } from '@/stores/riskFormStore'
import { enumLabel } from '@/utils/enumLabels'
import type {
  LifePlan, PlanGenerateRequest, PunchType, CompletionStatus,
} from '@/types/api'

const route = useRoute()
const store = useLifePlanStore()
const riskForm = useRiskFormStore()

// ===== 视图态 =====
/** 'loading' | 'empty' | 'form' | 'generating' | 'display' | 'error' */
const viewMode = ref<'loading' | 'empty' | 'form' | 'generating' | 'display' | 'error'>('loading')

// ===== 表单 =====
const form = reactive({
  age: null as number | null,
  gender: '' as 'male' | 'female' | '',
  height: null as number | null,
  weight: null as number | null,
})
const HABITS = ['久坐少动', '经常熬夜', '饮食不规律', '爱喝甜饮', '有吸烟习惯', '有饮酒习惯'] as const
const selectedHabits = ref<string[]>([])
const advice = ref('')

// ===== 习惯多选 toggle（L4: 补齐实现） =====
function toggleHabit(habit: string) {
  const idx = selectedHabits.value.indexOf(habit)
  if (idx >= 0) selectedHabits.value.splice(idx, 1)
  else selectedHabits.value.push(habit)
}

// ===== BMI 派生（L4: 补齐实现，未填身高体重时显示「-」） =====
const computedBmi = computed(() => {
  if (form.height && form.weight) {
    return (form.weight / ((form.height / 100) ** 2)).toFixed(1)
  }
  return '-'
})

// ===== 重试拉取方案（L4: 补齐实现，调 store.retryFetchCurrent 后重判 viewMode） =====
async function retryFetch() {
  await store.retryFetchCurrent()
  if (store.error) viewMode.value = 'error'
  else if (store.currentPlan) viewMode.value = 'display'
  else viewMode.value = 'empty'
}

// ===== 生成中阶段文案轮播 =====
const STAGE_TEXTS = [
  '正在分析您的健康数据…',
  '正在生成饮食方案…',
  '正在生成运动方案…',
  '正在个性化调整建议…',
] as const
const stageIndex = ref(0)
const stageText = ref(STAGE_TEXTS[0])
let stageTimer: ReturnType<typeof setInterval> | null = null

// ===== 调整反馈 =====
const adjustFeedback = ref('')
const showAdjust = ref(false)

// ===== 预填（riskFormStore.formData 兜底） =====
function prefillFromRiskForm() {
  riskForm.loadFromStorage()  // G1: 先水合 sessionStorage，再读 formData（对齐 Risk.vue restoreForm 范式）
  const fd = riskForm.formData
  if (fd.age != null) form.age = fd.age
  if (fd.gender === 'male' || fd.gender === 'female') form.gender = fd.gender
  if (fd.height != null) form.height = fd.height
  if (fd.weight != null) form.weight = fd.weight
}

// ===== 错误态文案引用（G2: 区分 fetch 失败与 generate 失败来源） =====
const errorRef = computed(() => store.generateError ?? store.error)

// ===== query 提示条（不依赖，仅展示） =====
const riskLevelHint = computed(() => {
  const q = route.query.riskLevel
  return typeof q === 'string' && q ? q : ''
})

// ===== Markdown 渲染（复用 Risk.vue safeAdviceHtml 范式） =====
function safeContentHtml(markdown: unknown): string {
  if (typeof markdown !== 'string') return ''
  const html = marked.parse(markdown, { async: false })
  if (typeof html !== 'string') return ''
  return DOMPurify.sanitize(html) // 单次净化（S6：不双重净化）
}

// ===== 错误消息（复用 Risk.vue getErrorMessage 范式） =====
function getErrorMessage(err: unknown, fallback = '操作失败，请稍后重试'): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const axiosErr = err as { response?: { data?: { error?: { message?: string }; message?: string }; status?: number } }
    if (axiosErr.response?.data?.error?.message) return axiosErr.response.data.error.message
    if (axiosErr.response?.data?.message) return axiosErr.response.data.message
  }
  return fallback
}

// ===== 时段映射标签（视图派生，不入类型） =====
const DIET_SLOT: Record<number, string> = { 1: '早餐', 2: '午餐', 3: '晚餐', 4: '加餐' }
const SPORT_SLOT: Record<number, string> = { 1: '晨间', 2: '晚间', 3: '周末' }
function slotLabel(item: LifePlan): string {
  if (item.plan_type === 'diet') return DIET_SLOT[item.order_num] ?? item.time_desc
  if (item.plan_type === 'exercise') return SPORT_SLOT[item.order_num] ?? item.time_desc
  return item.time_desc
}
/** 图标派生（按 plan_type + order_num，复刻原型 fa 图标） */
const DIET_ICON: Record<number, string> = { 1: 'fa-sun', 2: 'fa-bowl-food', 3: 'fa-apple-whole', 4: 'fa-moon' }
const SPORT_ICON: Record<number, string> = { 1: 'fa-person-walking', 2: 'fa-dumbbell', 3: 'fa-person-swimming' }
function itemIcon(item: LifePlan): string {
  if (item.plan_type === 'diet') return DIET_ICON[item.order_num] ?? 'fa-utensils'
  if (item.plan_type === 'exercise') return SPORT_ICON[item.order_num] ?? 'fa-person-running'
  return 'fa-clipboard-list'
}

// ===== 排序后列表（order_num 升序） =====
const sortedDiet = computed(() =>
  [...(store.currentPlan?.diet_plans ?? [])].sort((a, b) => a.order_num - b.order_num),
)
const sortedExercise = computed(() =>
  [...(store.currentPlan?.exercise_plans ?? [])].sort((a, b) => a.order_num - b.order_num),
)
const sortedOther = computed(() =>
  [...(store.currentPlan?.other_plans ?? [])].sort((a, b) => a.order_num - b.order_num),
)

// ===== 统计卡（复刻原型 gradient-text） =====
const dietTotal = computed(() => sortedDiet.value.length)
const sportTotal = computed(() => sortedExercise.value.length)
const dietDone = computed(() => sortedDiet.value.filter(i => store.completedMap.get(i.id) === 'completed').length)
const sportDone = computed(() => sortedExercise.value.filter(i => store.completedMap.get(i.id) === 'completed').length)
const progress = computed(() => {
  const total = dietTotal.value + sportTotal.value
  if (total === 0) return 0
  return Math.round(((dietDone.value + sportDone.value) / total) * 100)
})

// ===== 打卡按钮态（视图派生） =====
function punchStatus(itemId: number): CompletionStatus | undefined {
  return store.completedMap.get(itemId)
}
function isCompleted(itemId: number): boolean {
  return store.completedMap.get(itemId) === 'completed'
}

// ===== 表单校验 =====
function validateForm(): boolean {
  if (form.age == null || form.age < 1 || form.age > 120) return false
  if (form.gender !== 'male' && form.gender !== 'female') return false
  if (form.height == null || form.height <= 0) return false
  if (form.weight == null || form.weight <= 0) return false
  return true
}

// ===== 构造请求体（未决 #2 映射） =====
function buildGenerateRequest(): PlanGenerateRequest {
  return {
    health_info: {
      age: form.age as number,
      gender: form.gender as 'male' | 'female',
      height: form.height as number,
      weight: form.weight as number,
    },
    preferences: {
      dietary: selectedHabits.value.join('；'),  // 习惯多选 → dietary
      activity: advice.value,                     // 建议 textarea → activity
    },
  }
}

// ===== 生成中轮播 timer 生命周期 =====
function startStageTimer() {
  stopStageTimer()
  stageIndex.value = 0
  stageText.value = STAGE_TEXTS[0]
  stageTimer = setInterval(() => {
    stageIndex.value = (stageIndex.value + 1) % STAGE_TEXTS.length
    stageText.value = STAGE_TEXTS[stageIndex.value]
  }, 1800)
}
function stopStageTimer() {
  if (stageTimer) { clearInterval(stageTimer); stageTimer = null }
}

// ===== 生成方案 =====
async function handleGenerate() {
  if (store.generating || !validateForm()) return
  viewMode.value = 'generating'
  startStageTimer()
  const ok = await store.generate(buildGenerateRequest())
  stopStageTimer()
  if (ok) {
    viewMode.value = 'display'
    await toastSuccess('方案已生成，请按计划执行')
  } else if (store.isConflict) {
    viewMode.value = 'form'
    await toastInfo('请求过于频繁，请稍后再试')
  } else {
    // 降级：有缓存 → 历史降级提示 + 渲染缓存（isHistoryFallback 由 store.generate() catch 内置位）；无 → error
    if (store.currentPlan) {
      viewMode.value = 'display'
      await toastInfo('生成失败，已展示最近方案，可稍后重试')
    } else {
      viewMode.value = 'error'
    }
  }
}

// ===== 调整方案 =====
async function handleAdjust() {
  if (!store.currentPlan || !adjustFeedback.value.trim()) return
  const ok = await store.adjust({
    plan_id: store.currentPlan.plan_id,  // 方案组 ID
    feedback: adjustFeedback.value.trim(),
  })
  if (ok) {
    showAdjust.value = false
    adjustFeedback.value = ''
    await toastSuccess('方案已调整')
  } else {
    await toastError(getErrorMessage(store.adjustError, '调整失败，请稍后重试'))
  }
}

// ===== 打卡 SweetAlert2 弹窗 =====
async function handlePunch(item: LifePlan) {
  // 'other' 不打卡（按钮不渲染，此为防御性判断）
  if (item.plan_type === 'other') return
  const punchType = item.plan_type as PunchType  // diet | exercise
  const result = await Swal.fire({
    title: `${item.title} 打卡`,
    input: 'textarea',
    inputPlaceholder: '记录今日执行情况（可选）...',
    showDenyButton: true,            // deny = 未完成
    confirmButtonText: '完成',
    denyButtonText: '未完成',
    confirmButtonColor: '#52C41A',
    denyButtonColor: '#BFBFBF',
    showCancelButton: true,
    cancelButtonText: '取消',
    inputValidator: undefined,        // 备注可选，不校验
    // 内联 style 对齐 Round 1 弹层范式（customClass 或 customContainerCss）
  })
  if (result.isDismissed) return  // cancel / esc / backdrop
  const status: CompletionStatus = result.isConfirmed ? 'completed' : 'uncompleted'
  const remarks = typeof result.value === 'string' ? result.value.trim() : ''
  if (!store.currentPlan) return
  try {
    await store.createPunch(
      {
        plan_id: item.id,  // 方案项 ID（LifePlan.id，§0 #1 收敛）
        punch_type: punchType,
        completion_status: status,
        remarks: remarks || undefined,
      },
      item.id,  // completedMap 索引键 = 方案项 id
    )
    await toastSuccess(status === 'completed' ? '打卡成功，继续加油！' : '已记录未完成')
  } catch (e) {
    // 409 幂等（30s 内重复）→ toast；其他 → toast 错误（乐观已回滚）
    const status2 = (e as { response?: { status?: number } }).response?.status
    if (status2 === 409) await toastInfo('刚已提交过，请稍后再试')
    else await toastError(getErrorMessage(e, '打卡失败，请稍后重试'))
  }
}

// ===== SweetAlert2 toast 封装（复用 Round 1 tBlock 范式） =====
async function toastSuccess(title: string) { await Swal.fire({ toast: true, position: 'top', timer: 1500, showConfirmButton: false, icon: 'success', title }) }
async function toastInfo(title: string) { await Swal.fire({ toast: true, position: 'top', timer: 1500, showConfirmButton: false, icon: 'info', title }) }
async function toastError(title: string) { await Swal.fire({ toast: true, position: 'top', timer: 2000, showConfirmButton: false, icon: 'error', title }) }

// ===== 切换表单 =====
function showForm() {
  prefillFromRiskForm()
  viewMode.value = 'form'
}
function backToDisplay() {
  if (store.currentPlan) viewMode.value = 'display'
  else viewMode.value = 'empty'
}

// ===== 生命周期 =====
onMounted(async () => {
  prefillFromRiskForm()
  await store.fetchCurrent()
  if (store.error) viewMode.value = 'error'
  else if (store.currentPlan) viewMode.value = 'display'
  else viewMode.value = 'empty'
})

onUnmounted(() => {
  stopStageTimer()  // 清理轮播 timer（对齐 Round 1 onUnmounted 清理范式）
})
</script>
```

### 5.2 template 区块结构

```html
<template>
  <div class="life-plan page-enter">
    <!-- Header（渐变圆角，复刻原型 623-633） -->
    <header class="lp-header">
      <div class="lp-header-left">
        <h1 class="lp-title">生活方案</h1>
        <p class="lp-subtitle">个性化饮食与运动建议</p>
      </div>
      <button v-if="store.currentPlan" class="lp-recustomize press" @click="showForm">
        <i class="fa-solid fa-arrows-rotate"></i> 重新定制
      </button>
    </header>

    <!-- query 提示条（未决 #4：仅展示，不依赖） -->
    <div v-if="riskLevelHint" class="lp-query-hint">
      基于您的「{{ riskLevelHint }}」风险评估为您定制方案
    </div>

    <!-- 初始加载态（L5: 防 fetchCurrent 异步期间闪现空态） -->
    <div v-if="viewMode === 'loading'" class="lp-generating">
      <div class="lp-gen-card">
        <div class="lp-gen-spinner"><i class="fa-solid fa-spinner"></i></div>
        <p class="lp-gen-text">加载中...</p>
      </div>
    </div>

    <!-- 无方案引导态 -->
    <div v-else-if="viewMode === 'empty'" class="lp-empty">
      <div class="lp-empty-card">
        <div class="lp-empty-icon"><i class="fa-solid fa-clipboard-list"></i></div>
        <h2 class="lp-empty-title">还没有专属方案</h2>
        <p class="lp-empty-desc">基于您的健康信息，AI 将为您生成个性化饮食与运动方案</p>
        <button class="lp-cta press" @click="showForm">立即定制方案</button>
      </div>
    </div>

    <!-- 生成表单态 -->
    <div v-else-if="viewMode === 'form'" class="lp-form-wrap">
      <div class="lp-form-card">
        <h2 class="lp-section-title">方案定制</h2>
        <!-- BMI 信息条（avatar + 派生 BMI） -->
        <div class="lp-bmi-bar">
          <div class="lp-avatar">{{ /* 头像占位 */ }}</div>
          <div>
            <p class="lp-bmi-name">{{ /* 用户名或游客 */ }}</p>
            <p class="lp-bmi-text">BMI {{ computedBmi }}</p>
          </div>
        </div>
        <!-- 身体信息输入（age/gender/height/weight，预填自 riskForm.formData） -->
        <div class="lp-form-row">
          <label>年龄</label>
          <input v-model.number="form.age" type="number" min="1" max="120" class="lp-input" />
        </div>
        <div class="lp-form-row">
          <label>性别</label>
          <div class="lp-gender-group">
            <button :class="['lp-gender-btn press', form.gender==='male'?'active':'']" @click="form.gender='male'">男</button>
            <button :class="['lp-gender-btn press', form.gender==='female'?'active':'']" @click="form.gender='female'">女</button>
          </div>
        </div>
        <div class="lp-form-row">
          <label>身高(cm)</label>
          <input v-model.number="form.height" type="number" class="lp-input" />
        </div>
        <div class="lp-form-row">
          <label>体重(kg)</label>
          <input v-model.number="form.weight" type="number" class="lp-input" />
        </div>
        <!-- 生活习惯多选 chip（→ preferences.dietary） -->
        <div class="lp-form-block">
          <label class="lp-block-label">当前生活习惯</label>
          <div class="lp-habits">
            <button v-for="h in HABITS" :key="h"
              :class="['lp-habit-chip press', selectedHabits.includes(h)?'active':'']"
              @click="toggleHabit(h)">{{ h }}</button>
          </div>
        </div>
        <!-- 建议 textarea（→ preferences.activity） -->
        <div class="lp-form-block">
          <label class="lp-block-label">对方案的建议</label>
          <textarea v-model="advice" placeholder="例如：希望以低GI食物为主，运动以有氧为主..."
            class="lp-textarea"></textarea>
        </div>
        <button class="lp-generate-btn press" :disabled="store.generating || !validateForm()" @click="handleGenerate">
          <i class="fa-solid fa-wand-magic-sparkles"></i>
          {{ store.generating ? 'AI 生成中...' : '生成生活方案' }}
        </button>
      </div>
    </div>

    <!-- 生成中态 -->
    <div v-else-if="viewMode === 'generating'" class="lp-generating">
      <div class="lp-gen-card">
        <div class="lp-gen-spinner"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
        <p class="lp-gen-text">{{ stageText }}</p>
        <div class="lp-gen-progress"><div class="lp-gen-progress-bar"></div></div>
      </div>
    </div>

    <!-- 方案展示态 -->
    <div v-else-if="viewMode === 'display' && store.currentPlan" class="lp-display">
      <!-- 历史降级提示条（对齐 Risk.vue isHistoryFallback 范式） -->
      <div v-if="store.isHistoryFallback" class="lp-fallback-hint">
        AI 服务暂不可用，以下为最近方案，可稍后重试
      </div>

      <!-- 统计卡（gradient-text，复刻原型 675-681） -->
      <div class="lp-stats">
        <div class="lp-stat"><p class="lp-stat-num gradient-text">{{ dietDone }}/{{ dietTotal }}</p><p class="lp-stat-label">饮食打卡</p></div>
        <div class="lp-stat-divider"></div>
        <div class="lp-stat"><p class="lp-stat-num gradient-text">{{ sportDone }}/{{ sportTotal }}</p><p class="lp-stat-label">运动打卡</p></div>
        <div class="lp-stat-divider"></div>
        <div class="lp-stat"><p class="lp-stat-num gradient-text">{{ progress }}%</p><p class="lp-stat-label">今日进度</p></div>
      </div>

      <!-- 饮食管理分组 -->
      <h2 class="lp-group-title"><i class="fa-solid fa-utensils"></i>{{ enumLabel('plan_type', 'diet') }}管理</h2>
      <div class="lp-card-list">
        <div v-for="item in sortedDiet" :key="item.id" class="lp-item-card">
          <div class="lp-item-head">
            <div class="lp-item-left">
              <div class="lp-item-icon lp-item-icon-diet"><i :class="['fa-solid', itemIcon(item)]"></i></div>
              <div>
                <div class="lp-item-meta">
                  <span class="lp-item-slot">{{ slotLabel(item) }}</span>
                </div>
                <h3 class="lp-item-title">{{ item.title }}</h3>
              </div>
            </div>
            <button :class="['lp-punch-btn press', isCompleted(item.id)?'done':'']" @click="handlePunch(item)">
              <i :class="isCompleted(item.id)?'fa-solid fa-check':'fa-regular fa-circle'"></i>
              {{ isCompleted(item.id)?'已打卡':'打卡' }}
            </button>
          </div>
          <!-- Markdown 净化渲染（S2/S6：marked→DOMPurify 一次→v-html） -->
          <div class="lp-item-content" v-html="safeContentHtml(item.content)"></div>
        </div>
      </div>

      <!-- 运动建议分组 -->
      <h2 class="lp-group-title"><i class="fa-solid fa-person-running"></i>{{ enumLabel('plan_type', 'exercise') }}建议</h2>
      <div class="lp-card-list">
        <div v-for="item in sortedExercise" :key="item.id" class="lp-item-card">
          <div class="lp-item-head">
            <div class="lp-item-left">
              <div class="lp-item-icon lp-item-icon-sport"><i :class="['fa-solid', itemIcon(item)]"></i></div>
              <div>
                <div class="lp-item-meta"><span class="lp-item-slot">{{ slotLabel(item) }}</span></div>
                <h3 class="lp-item-title">{{ item.title }}</h3>
              </div>
            </div>
            <button :class="['lp-punch-btn press', isCompleted(item.id)?'done':'']" @click="handlePunch(item)">
              <i :class="isCompleted(item.id)?'fa-solid fa-check':'fa-regular fa-circle'"></i>
              {{ isCompleted(item.id)?'已打卡':'打卡' }}
            </button>
          </div>
          <div class="lp-item-content" v-html="safeContentHtml(item.content)"></div>
        </div>
      </div>

      <!-- 其他分组（若有 other_plans：展示卡片但无打卡按钮） -->
      <template v-if="sortedOther.length > 0">
        <h2 class="lp-group-title"><i class="fa-solid fa-clipboard-list"></i>{{ enumLabel('plan_type', 'other') }}建议</h2>
        <div class="lp-card-list">
          <div v-for="item in sortedOther" :key="item.id" class="lp-item-card">
            <div class="lp-item-head">
              <div class="lp-item-left">
                <div class="lp-item-icon lp-item-icon-other"><i :class="['fa-solid', itemIcon(item)]"></i></div>
                <div>
                  <div class="lp-item-meta"><span class="lp-item-slot">{{ slotLabel(item) }}</span></div>
                  <h3 class="lp-item-title">{{ item.title }}</h3>
                </div>
              </div>
              <!-- other 不渲染打卡按钮（需求/DDL：punch_type 仅 diet/exercise） -->
            </div>
            <div class="lp-item-content" v-html="safeContentHtml(item.content)"></div>
          </div>
        </div>
      </template>

      <!-- 调整反馈入口 -->
      <button class="lp-adjust-entry press" @click="showAdjust = !showAdjust">
        <i class="fa-solid fa-sliders"></i> 调整方案
      </button>
      <div v-if="showAdjust" class="lp-adjust-card">
        <textarea v-model="adjustFeedback" placeholder="如：减少晚餐碳水，增加周末运动强度" class="lp-textarea"></textarea>
        <button class="lp-generate-btn press" :disabled="!adjustFeedback.trim()" @click="handleAdjust">提交调整</button>
      </div>

      <!-- AI 免责提示条（恒显底部） -->
      <div class="lp-disclaimer">
        AI 生成内容仅供参考，不能替代专业医疗诊断，如有不适请及时就医
      </div>
    </div>

    <!-- 错误态（G2: 统一读 errorRef = generateError ?? error，区分 fetch/generate 失败来源） -->
    <div v-else-if="viewMode === 'error'" class="lp-error">
      <p class="lp-error-text">{{ getErrorMessage(errorRef, '方案加载失败') }}</p>
      <button class="lp-retry press" @click="retryFetch">重试</button>
    </div>
  </div>
</template>
```

> `toggleHabit`、`computedBmi`、`retryFetch` 均已在上方 §5.1 script 骨架中给出实现。`computedBmi` 仅在表单态展示，未填身高体重时显示「-」。

### 5.3 scoped CSS 关键帧（CSS 变量，无 Tailwind）

> 对齐 `detail_v1.md` §7 范式：`max-width: 480px; margin: 0 auto;`，`padding-bottom: calc(var(--tab-bar-height) + 8px)`，scoped 自定义语义类，全部用 `src/assets/variables.css` 变量。复刻原型 619-761 视觉。仅列关键类与变量映射。

```css
<style scoped>
.life-plan {
  max-width: 480px;
  margin: 0 auto;
  padding-bottom: calc(var(--tab-bar-height) + 8px);
  min-height: 100vh;
  background: var(--color-bg);
}
/* Header 渐变圆角（复刻原型 from-blue-600 to-sky-500） */
.lp-header {
  background: linear-gradient(135deg, #4A90D9, #38BDF8);
  color: #fff;
  padding: 48px var(--spacing-xl) var(--spacing-2xl);
  border-radius: 0 0 var(--radius-2xl) var(--radius-2xl);
  display: flex; justify-content: space-between; align-items: center;
}
.lp-title { font-size: var(--font-size-h1); font-weight: 700; }
.lp-subtitle { font-size: var(--font-size-caption); opacity: .85; margin-top: 2px; }
.lp-recustomize {
  background: rgba(255,255,255,.2); color: #fff;
  font-size: var(--font-size-caption); padding: 6px 12px;
  border-radius: var(--radius-full); border: none; backdrop-filter: blur(4px);
}
/* 通用卡片 */
.lp-empty-card, .lp-form-card, .lp-item-card, .lp-gen-card, .lp-adjust-card {
  background: var(--color-card); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md); padding: var(--spacing-xl); margin: var(--spacing-lg) var(--spacing-lg);
}
/* gradient-text（复刻原型统计卡渐变文字） */
.gradient-text {
  font-size: 24px; font-weight: 700;
  background: linear-gradient(135deg, #4A90D9, #38BDF8);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
/* 统计卡 */
.lp-stats {
  background: var(--color-card); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md); padding: var(--spacing-lg); margin: var(--spacing-lg);
  display: flex; justify-content: space-around; text-align: center;
}
.lp-stat-divider { width: 1px; background: var(--color-divider); }
.lp-stat-label { font-size: var(--font-size-caption); color: var(--color-text-secondary); margin-top: 2px; }
/* 生成按钮（复刻原型 wand-magic-sparkles 渐变） */
.lp-cta, .lp-generate-btn {
  background: linear-gradient(135deg, #4A90D9, #38BDF8);
  color: #fff; border: none; border-radius: var(--radius-button);
  padding: 12px 24px; font-weight: 700; width: 100%;
  box-shadow: var(--shadow-md);
}
.lp-generate-btn:disabled { opacity: .6; }
/* 按压动画 */
.press:active { transform: scale(.96); transition: var(--transition-fast); }
/* 习惯 chip */
.lp-habit-chip {
  padding: 6px 12px; border-radius: var(--radius-full);
  background: var(--color-primary-light); color: var(--color-text-secondary);
  font-size: var(--font-size-caption); border: none;
}
.lp-habit-chip.active { background: var(--color-primary); color: #fff; }
/* textarea / input */
.lp-textarea, .lp-input {
  width: 100%; border: 1px solid var(--color-divider);
  border-radius: var(--radius-md); padding: 8px 12px;
  font-size: var(--font-size-body); font-family: var(--font-family);
}
.lp-textarea { min-height: 80px; resize: none; }
/* 打卡按钮态 */
.lp-punch-btn {
  padding: 6px 12px; border-radius: var(--radius-full);
  background: var(--color-primary-light); color: var(--color-text-secondary);
  font-size: var(--font-size-caption); font-weight: 700; border: none;
}
.lp-punch-btn.done { background: var(--color-accent); color: #fff; }
/* 方案正文（Markdown 渲染后样式收敛） */
.lp-item-content { font-size: var(--font-size-body); color: var(--color-text-secondary); line-height: 1.6; }
.lp-item-content :deep(p) { margin: 4px 0; }
.lp-item-content :deep(ul), .lp-item-content :deep(ol) { padding-left: 20px; margin: 4px 0; }
/* 生成中不定进度条动画 */
.lp-gen-progress { height: 6px; background: var(--color-divider); border-radius: var(--radius-full); overflow: hidden; margin-top: 16px; }
.lp-gen-progress-bar {
  height: 100%; width: 40%; background: linear-gradient(135deg, #4A90D9, #38BDF8);
  border-radius: var(--radius-full);
  animation: lp-indeterminate 1.4s ease-in-out infinite;
}
@keyframes lp-indeterminate {
  0% { margin-left: -40%; }
  100% { margin-left: 100%; }
}
.lp-gen-spinner { font-size: 32px; color: var(--color-primary); text-align: center; animation: lp-pulse 1.5s ease-in-out infinite; }
@keyframes lp-pulse { 0%,100%{opacity:.6} 50%{opacity:1} }
/* 历史降级提示条（对齐 Risk.vue #FFF7E6/#FAAD14 范式） */
.lp-fallback-hint {
  background: #FFF7E6; border: 1px solid var(--color-warning);
  color: var(--color-warning); font-size: var(--font-size-caption);
  padding: 8px 12px; border-radius: var(--radius-md); margin: var(--spacing-lg);
}
/* AI 免责提示条（恒显底部） */
.lp-disclaimer {
  margin: var(--spacing-lg); padding: 10px 12px;
  background: var(--color-primary-light); color: var(--color-text-secondary);
  font-size: var(--font-size-caption); border-radius: var(--radius-md);
  text-align: center; line-height: 1.5;
}
/* query 提示条 */
.lp-query-hint {
  margin: var(--spacing-lg); padding: 8px 12px;
  background: var(--color-primary-light); color: var(--color-primary-dark);
  font-size: var(--font-size-caption); border-radius: var(--radius-md);
}
</style>
```

> **变量映射**：`--color-primary`(#4A90D9) / `--color-primary-light`(#E8F1FB) / `--color-accent`(#52C41A) / `--color-warning`(#FAAD14) / `--color-card` / `--color-bg` / `--color-divider` / `--color-text-secondary` / `--radius-lg` / `--radius-full` / `--radius-button` / `--shadow-md` / `--spacing-lg` / `--spacing-xl` / `--tab-bar-height` / `--font-size-*` / `--transition-fast`。原型渐变 `from-blue-600 to-sky-500` 用硬编码 `#4A90D9→#38BDF8`（与 variables.css 主色系一致，非 Tailwind 类）。`--radius-2xl` 原型用 24px，若 variables.css 无则用 `border-radius: 24px` 硬编码。

---

## 6. 降级 / 空态 / 加载态 / 错误态矩阵

| 场景 | 代码路径 | 表现 |
|---|---|---|
| 初始加载中 | `onMounted`→`viewMode='loading'`→`store.fetchCurrent()` 异步未返回 | spinner + 「加载中...」文案，防闪现空态 |
| `fetchCurrent` 返回 data:null | `onMounted`→`store.fetchCurrent()`→`currentPlan=null`→`viewMode='empty'` | 无方案引导态 + CTA「立即定制方案」 |
| `fetchCurrent` 失败 | `store.error` 回填→`viewMode='error'` | 错误态 + 重试按钮（`retryFetch`→`store.retryFetchCurrent()`→重判 viewMode） |
| 生成中 | `viewMode='generating'`+`startStageTimer()`(1800ms 轮播 4 文案)+不定进度条动画+`generating` 锁禁按钮 | 阶段文案轮播 + 不定进度条 + 按钮 disabled |
| 生成成功 | `store.generate()` 返回 true→`viewMode='display'`+toast 成功 | 切方案展示态 |
| 生成 409 CONFLICT | `store.isConflict=true`→`viewMode='form'`+toast「请求过于频繁，请稍后再试」 | 按钮恢复，停留表单 |
| 生成失败/超时 + 有缓存 `currentPlan` | `store.generate()` 返回 false + `currentPlan` 存在→`store.isHistoryFallback=true`+`viewMode='display'`+toast | 历史降级提示条 + 渲染缓存方案 |
| 生成失败/超时 + 无缓存 | `store.generate()` 返回 false + `currentPlan` 为 null→`viewMode='error'` | 错误态（`store.generateError` 文案） |
| 调整失败 | `store.adjust()` 返回 false→`store.adjustError` 回填+toast 错误 | 保留原方案不替换 |
| 打卡失败 | `store.createPunch` catch→`completedMap` 回滚+toast 错误 | 1s 内按钮态回滚 + 反馈 |
| 打卡 409 幂等 | `handlePunch` catch 判 `response.status===409`→toast「刚已提交过，请稍后再试」 | 按钮态不变（回滚） |
| `other_plans` 非空 | `sortedOther.length>0`→渲染卡片，**不渲染打卡按钮** | 展示卡片无打卡按钮 |

---

## 7. 文件清单（task_v2 §4 落地）

**新增**：
- `src/stores/lifePlanStore.ts`（§4）
- `src/composables/useLifePlanApi.ts`（§3）

**修改（仅增补 / 重写，勿动既有）**：
- `src/types/api.ts`：追加 §1 全部类型（`PlanType`/`LifePlan`/`PlanGenerateRequest`/`PlanAdjustRequest`/`PlanResponse`/`PlanCurrentResponse`/`PunchType`/`CompletionStatus`/`PunchCreateRequest`/`PunchCreateResponse`/`PunchListParams`/`PunchRecord`），文件末尾追加，不动既有 `ApiResponse`/`Doctor`/`Article`/`DiabetesType`/`Risk*`。
- `src/utils/enumLabels.ts`：`LABELS` 内追加 `plan_type`/`punch_type`/`completion_status` 三组，不动既有，`enumLabel()` 函数不改。
- `src/views/LifePlan.vue`：完整重写（§5）。

**不改**：`router/index.ts`（路由 `/life-plan` + requiresDisclaimer 守卫已实现）、`App.vue`、`composables/useApi.ts`、`stores/authStore.ts`、`stores/riskFormStore.ts`、`stores/homeStore.ts`、`composables/useHomeApi.ts`、`views/Risk.vue`、`server/**`、`assets/variables.css`、`package.json` / `vite.config.ts` / `tsconfig.app.json`（**不引入新依赖**，`marked`/`dompurify`/`sweetalert2` 均已存在）。

---

## 8. 验收映射（对 Verifier，列代码证据点）

| 验收项（task_v2 §7） | 代码证据点 |
|---|---|
| 无方案→生成→展示→调整全流程 | `viewMode` 四态切换（§5.1）；`handleGenerate`/`handleAdjust`/`onMounted` |
| 4 饮食 + 3 运动按时段分组渲染 | `sortedDiet`/`sortedExercise` + `slotLabel` + `DIET_SLOT`/`SPORT_SLOT` |
| 生成阶段文案轮播 + 按钮 loading（非 SSE） | `startStageTimer`/`STAGE_TEXTS`/`stopStageTimer`/`generating` 锁；`generatePlan` axios blocking |
| 打卡 SweetAlert2 → POST /api/punch，1s 内按钮态，plan_id 透传方案项 ID | `handlePunch`→`store.createPunch`（`plan_id: item.id`）+ `completedMap` 乐观更新/回滚 |
| 方案正文 marked+DOMPurify 净化后 v-html | `safeContentHtml`（marked.parse→DOMPurify.sanitize 一次）+ `v-html` |
| AI 免责提示条恒显；组件内不重复弹免责 | `.lp-disclaimer` 在 display 态恒显；无免责弹窗代码（守卫已处理） |
| vue-tsc 零错误 / 禁 any / 无新依赖 | §1 类型全显式联合/可空标注；§3/§4 axios 泛型解包；依赖仅 marked/dompurify/sweetalert2（已有） |
| S1 无 any | §1/§3/§4/§5 全显式类型，无 `any` |
| S2 所有 v-html 经 DOMPurify | `safeContentHtml` 唯一 v-html 来源，DOMPurify.sanitize |
| S3 无硬编码后端 URL | 全走 `api`（baseURL `/api`），无硬编码 host |
| S4 变更集仅目标文件 | §7 文件清单，不动 router/App/useApi/riskFormStore/homeStore/Risk.vue/variables.css/package.json/vite.config.ts/server |
| S5 无新依赖 | 不改 package.json |
| S6 不双重净化 | `safeContentHtml` 内 marked 输出整体 DOMPurify 一次，组件不再二次 sanitize |
| 移动端 375px 无横向滚动 | `.life-plan` max-width 480px + margin auto + padding-bottom tab-bar-height |

---

## 9. 关键复用范式索引（Coder 实现时对照）

| 范式 | 来源文件:行 | 本设计落点 |
|---|---|---|
| `marked.parse`+`DOMPurify.sanitize` | `Risk.vue:6-7,69-74` | `safeContentHtml`（§5.1） |
| `getErrorMessage(err)` | `Risk.vue:219-225` | `getErrorMessage`（§5.1，扩展 message 兜底） |
| `onUnmounted` 清理 timer | `Risk.vue:113-116` | `onUnmounted(stopStageTimer)`（§5.1） |
| SweetAlert2 toast | Round 1 `tBlock` 范式 | `toastSuccess/Info/Error`（§5.1） |
| 历史降级 `isHistoryFallback` | `Risk.vue:19,278,517` | `store.isHistoryFallback` + `.lp-fallback-hint` |
| setup-store + retry action | `homeStore.ts:16-150` | `lifePlanStore`（§4） |
| axios 内联 body 泛型解包 | `useHomeApi.ts:37-72` | `useLifePlanApi`（§3） |
| 展示字段挂视图不污染契约类型 | `homeStore.ts:7-12 DiabetesTypeView` | `slotLabel`/`itemIcon`/`punchStatus` 视图派生（§5.1） |
| scoped CSS + CSS 变量无 Tailwind | `detail_v1.md §7` | §5.3 |

> Designer 产出完毕，交 Coder 按 §1-§5 落地编码，交 Verifier 按 §8 验收。

---

## 10. 修订记录（r2）

> 响应 `design_review_v2_r1.md` REJECTED 决议，本轮修订 1 严重 + 2 一般 + 5 轻微。

| # | 严重度 | 修订点 | 位置 | 修改摘要 |
|---|--------|--------|------|----------|
| S1 | **严重** | 打卡 `plan_id` 改为方案项 ID | §0 #1 / §1 `PunchCreateRequest` / §4.2 `createPunchAction` / §5.1 `handlePunch` / §8 验收 | `handlePunch` 请求体 `plan_id` 从 `store.currentPlan.plan_id`（方案组 ID）改为 `item.id`（方案项 `LifePlan.id`）；§0 #1 结论改写为「方案项 ID（`LifePlan.id`）」并附三重依据（§2.5 字典 + §3.2.17 JOIN + 示例 plan_title）；勘误 `task_v2.md` §1.3/§8#1 错误前提；`PunchCreateRequest` 注释 `plan_id` 说明从「方案组」改为「方案项」 |
| G1 | **一般** | 预填前调 `loadFromStorage()` | §5.1 `prefillFromRiskForm()` | 函数内部新增 `riskForm.loadFromStorage()` 调用，先水合 sessionStorage 再读 `formData`，对齐 `Risk.vue restoreForm` 范式；解决刷新后 Pinia state 重置导致预填失效 |
| G2 | **一般** | 错误态文案区分 fetch/generate 来源 | §5.1 script / §5.2 template 错误态 | 新增 `const errorRef = computed(() => store.generateError ?? store.error)`；模板 `getErrorMessage(store.error, ...)`→`getErrorMessage(errorRef, ...)`；生成失败无缓存时 `store.generateError` 不被丢弃 |
| L1 | 轻微 | 移除打卡备注 `escapeHtml` | §0 #8 / §1 `PunchCreateRequest` / §5.1 `handlePunch` + `escapeHtml` 函数 | 删除 `escapeHtml` 函数定义；`handlePunch` 中 `escapeHtml(result.value.trim())`→`result.value.trim()`（原样入请求体）；对齐 `task_v2` §3.3「备注作为请求体字符串发送，前端无需净化请求体」；`PunchCreateRequest.remarks` 注释同步更新 |
| L2 | 轻微 | 清理未用 import | §5.1 import | 移除未直接引用的 `PlanType`（类型仅通过 `LifePlan` 间接出现）；分组标题改用 `enumLabel('plan_type', 'diet')`/`'exercise'`/`'other'` 动态显示中文标签，java `enumLabel` 导入有实际调用 |
| L3 | 轻微 | `isHistoryFallback` 置位移入 store | §4.2 `generate()` catch / §5.1 `handleGenerate` | store `generate()` catch 分支新增「生成失败但有缓存 → `isHistoryFallback.value = true`」；组件 `handleGenerate` 移除 `store.isHistoryFallback = true` 直接赋值，仅保留 `viewMode='display'`+toast |
| L4 | 轻微 | 补全 `toggleHabit`/`computedBmi`/`retryFetch` | §5.1 script | 为三者在 script 骨架中给出完整实现：`toggleHabit` splice 增减数组、`computedBmi` 由 `form.height/form.weight` 派生 `weight/(height/100)^2` 保留 1 位/未填显 `-`、`retryFetch` 调 `store.retryFetchCurrent()` 后重判 viewMode |
| L5 | 轻微 | 增加初始加载态 | §5.1 viewMode / §5.2 template / §6 矩阵 | `viewMode` 初值从 `'empty'` 改为 `'loading'`，类型新增 `'loading'`；模板新增加载态块（spinner +「加载中...」）；§6 矩阵新增一行「初始加载中」；防 `fetchCurrent` 异步期间闪现空态 |
