/**
 * API 类型定义
 *
 * 类型策略: API composable 采用内联类型定义每个接口的请求/响应结构，
 * 更好地表达每个端点的具体契约。不使用泛型包装器 (ApiResponse<T> 等)。
 */

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

export interface LoginUser {
  id: number;
  username: string;
  role: 'user' | 'admin';
  avatar: string | null;
}

export interface LoginResponse {
  token: string;
  role: 'user' | 'admin';
  user: LoginUser;
  must_change_password?: boolean;
}

export interface UserProfile {
  id: number;
  username: string;
  role: 'user' | 'admin';
  avatar: string | null;
  created_at: string;
}

export interface UpdateProfileRequest {
  username?: string;
  avatar?: string;
}

export interface ChangePasswordRequest {
  old_password?: string
  new_password: string
}

/** 管理员操作日志 */
export interface AdminLog {
  id: number
  operator_id: number
  operator_username: string
  operation_type: 'INSERT' | 'UPDATE' | 'DELETE' | 'SELECT' | string
  operation_content: string
  operation_result: string
  operation_time: string
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
export interface Doctor {
  id: number;
  name: string;
  department: string;
  title: string;
  description: string;
  avatar: string | null;
}

/** 医生详情 (含在线状态)，GET /api/doctors/:id */
export interface DoctorDetail extends Doctor {
  is_online: boolean
}

// ========== 健康科普文章类型 ==========
/**
 * 健康科普文章列表项（GET /api/articles 的 data 数组元素，无完整正文 content）。
 * 字段严格对齐 docs/2_detailed_design_v3.md 3.8.3 / 3.2.19（v13 修订后稳定返回）。
 * 注意：3.2.19 注释中 created_at↔publish_time、views↔read_count 为语义映射，
 *       后端只返回 created_at / views，不引入别名字段，避免类型允许不可能状态。
 */
export interface Article {
  id: number;
  title: string;
  /** 封面图 URL；契约为 string | null（可空但字段存在）。缺失时组件回退占位图 */
  cover: string | null;
  author: string;
  category: string;
  /** 标签数组；DB 以 TEXT(JSON) 存储，Express 已 JSON.parse 降级为 [] */
  tags: string[];
  /** 文章摘要（列表卡片副文案）；v13 修订后稳定返回 */
  summary: string;
  /** 阅读量；对应需求 6.7 节 read_count，后端字段名为 views */
  views: number;
  /** 发布时间 ISO 字符串；对应需求 6.7 节 publish_time，后端字段名为 created_at */
  created_at: string;
}

/** 文章详情（含正文），GET /api/articles/:id
 *  设计依据: docs/2_detailed_design_v3.md 3.2.20 节 (第2051行)
 */
export interface ArticleDetail extends Article {
  /** Markdown 正文 */
  content: string
  /** 当前用户是否已收藏 */
  is_collected: boolean
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

/** 健康建议 */
export interface HealthAdvice {
  id: number
  title: string
  tags: string[]
  content: string
  created_at: string
}

// ========== 糖尿病类型科普 ==========
/**
 * 糖尿病类型（GET /api/diabetes-types 列表元素，与 GET /api/diabetes-types/:id 详情字段一致）。
 * 字段对齐 docs/2_detailed_design_v3.md 3.8.3 / 3.2.24。
 * id 为后端 number 主键。
 */
export interface DiabetesType {
  id: number;
  name: string;
  /** 后端真实字段名为 image；string | null，缺失时组件用主色渐变叠层占位 */
  image: string | null;
  pathogenesis: string;
  manifestation: string;
  treatment: string;
}

/**
 * 糖尿病类型详情（GET /api/diabetes-types/:id）。
 * 3.2.24 详情响应字段与列表一致，故直接取 DiabetesType。
 */
export type DiabetesTypeDetail = DiabetesType;

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
