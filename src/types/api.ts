// ========== 通用类型 ==========
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

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

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationInfo;
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
