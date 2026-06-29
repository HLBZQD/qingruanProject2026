/**
 * API 类型定义
 *
 * 类型策略: API composable 采用内联类型定义每个接口的请求/响应结构，
 * 更好地表达每个端点的具体契约。不使用泛型包装器 (ApiResponse<T> 等)。
 *
 * 业务实体类型（User/Doctor/Article/LifePlan 等）已拆分至 models.ts，
 * 本文件通过 re-export 保持向后兼容，避免一次改动所有引用方。
 */

import type {
  AdminLog,
  Article,
  ArticleDetail,
  CompletionStatus,
  DiabetesType,
  DiabetesTypeDetail,
  Doctor,
  DoctorDetail,
  HealthAdvice,
  LifePlan,
  PlanType,
  PunchRecord,
  PunchType,
  User,
  UserProfile,
} from './models'

export type {
  AdminLog,
  Article,
  ArticleDetail,
  CompletionStatus,
  DiabetesType,
  DiabetesTypeDetail,
  Doctor,
  DoctorDetail,
  HealthAdvice,
  LifePlan,
  PlanType,
  PunchRecord,
  PunchType,
  User,
  UserProfile,
} from './models'

// ========== 通用类型 ==========

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ========== 认证类型 ==========

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  role: 'user' | 'admin';
  user: User;
  must_change_password?: boolean;
}

export interface UpdateProfileRequest {
  username?: string;
  avatar?: string;
}

export interface ChangePasswordRequest {
  old_password?: string
  new_password: string
}

// ========== 风险预测类型 ==========

export interface RiskPredictRequest {
  diabetes_history: 'healthy' | 'prediabetes' | 'diagnosed';
  diabetes_type?: 'type1' | 'type2' | 'gestational' | 'other';
  age: number;
  gender: 'male' | 'female';
  height: number;
  weight: number;
  waist?: number;
  systolic_bp?: number;
  family_history: 'yes' | 'no';
  pregnancy?: boolean;
}

export interface RiskPredictResponse {
  record_id: number;
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high';
  risk_level_label: string;
  matched_diabetes_type: string;
  advice: string;
  created_at: string;
}

export interface RiskHistoryItem {
  id: number;
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high';
  risk_level_label: string;
  matched_diabetes_type: string;
  age: number;
  gender: 'male' | 'female';
  bmi: number;
  family_history: 'yes' | 'no';
  created_at: string;
}

// ========== 医生类型 ==========

/** 医生详情 (含在线状态)，GET /api/doctors/:id */
// Doctor / DoctorDetail 业务实体已定义在 models.ts 并通过顶部 re-export 暴露。

// ========== 健康科普文章类型 ==========

/**
 * 健康科普文章列表项（GET /api/articles 的 data 数组元素，无完整正文 content）。
 * 字段严格对齐 docs/2_detailed_design_v3.md 3.8.3 / 3.2.19（v13 修订后稳定返回）。
 * 注意：3.2.19 注释中 created_at↔publish_time、views↔read_count 为语义映射，
 *       后端只返回 created_at / views，不引入别名字段，避免类型允许不可能状态。
 *
 * Article 业务实体已定义在 models.ts 并通过顶部 re-export 暴露。
 */

/** 文章详情（含正文），GET /api/articles/:id
 *  设计依据: docs/2_detailed_design_v3.md 3.2.20 节 (第2051行)
 *
 *  ArticleDetail 业务实体已定义在 models.ts 并通过顶部 re-export 暴露。
 */

/** 收藏列表项，GET /api/articles/collections 的 data 数组元素。
 *  在 Article 基础上附带 collect_id（收藏记录主键），用于取消收藏等操作。 */
export interface CollectedArticle extends Article {
  /** 收藏记录主键（article_collections.id） */
  collect_id: number
}

/** 文章生成两阶段响应 */
export interface ArticleGenerateCategorySelection {
  stage: 'category_selection'
  categories: Array<{
    label: string
    recommended?: boolean
    reason?: string
  }>
}

export type ArticleGenerateResponse = ArticleGenerateCategorySelection | ArticleDetail

/** 健康建议
 *  HealthAdvice 业务实体已定义在 models.ts 并通过顶部 re-export 暴露。
 */

// ========== 糖尿病类型科普 ==========

/**
 * 糖尿病类型（GET /api/diabetes-types 列表元素，与 GET /api/diabetes-types/:id 详情字段一致）。
 * 字段对齐 docs/2_detailed_design_v3.md 3.8.3 / 3.2.24。
 * id 为后端 number 主键。
 *
 * DiabetesType / DiabetesTypeDetail 业务实体已定义在 models.ts 并通过顶部 re-export 暴露。
 */

// ========== 生活方案类型（Task 2）==========

/**
 * PlanType 业务实体已定义在 models.ts 并通过顶部 re-export 暴露。
 */

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
  /** 方案组 ID（同批所有方案项共享，对应 life_plans.plan_id） */
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

/**
 * PunchType / CompletionStatus 业务实体已定义在 models.ts 并通过顶部 re-export 暴露。
 */

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

/** 打卡记录（GET /api/punch/list 的 data 数组元素，Task 3 用；本轮仅落地类型）
 *  PunchRecord 业务实体已定义在 models.ts 并通过顶部 re-export 暴露。
 */

// ========== 打卡分析类型（Task 3）==========

/**
 * 打卡分析响应（GET /api/punch/analysis 的 data）。
 * 字段严格对齐 docs/2_detailed_design_v3.md §3.2.18。
 */
export interface PunchAnalysisResponse {
  /** 饮食总完成率（0-1 浮点，如 0.75 表示 75%） */
  diet_completion_rate: number;
  /** 运动总完成率（0-1 浮点） */
  exercise_completion_rate: number;
  /** 查询时段内总打卡次数 */
  total_punches: number;
  /** 近 7 天每日完成趋势数组（不足 7 天则后端补 0 或返回实际天数） */
  last_7_days_trend: Array<{
    /** 日期 YYYY-MM-DD */
    date: string;
    /** 当日饮食完成数 */
    diet_completed: number;
    /** 当日运动完成数 */
    exercise_completed: number;
  }>;
  /**
   * AI 依从性评语（可能含 Markdown）。
   * 前端必须经 marked.parse → DOMPurify.sanitize → v-html 渲染。
   */
  adherence_comment: string;
  /** AI 改进建议列表（纯文本字符串数组） */
  improvement_suggestions: string[];
}
