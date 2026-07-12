import { AdminLog, Article, ArticleDetail, CompletionStatus, DiabetesType, DiabetesTypeDetail, Doctor, DoctorDetail, HealthAdvice, LifePlan, PlanType, PunchRecord, PunchType, User, UserProfile } from './models';

export { AdminLog, Article, ArticleDetail, CompletionStatus, DiabetesType, DiabetesTypeDetail, Doctor, DoctorDetail, HealthAdvice, LifePlan, PlanType, PunchRecord, PunchType, User, UserProfile } from './models';

// D1: 可空字段改 `field: T | null` 必填（LoginResponse.must_change_password / UpdateProfileRequest / ChangePasswordRequest.old_password / RiskPredictRequest / PunchCreateRequest.remarks / PunchListParams / ArticleGenerateCategoryItem）。
// D2: 不写 `type ArticleGenerateResponse = X | Y` 联合；业务侧用 `stage` 字段路由 category_selection vs ArticleDetail。
// D3: 内联匿名 interface 抽为顶层具名（ApiErrorBody / ArticleGenerateCategoryItem / PlanGenerateRequestHealthInfo / PlanGenerateRequestPreferences / PunchAnalysisTrendDay）。
// D4: import / export 不带 `type` 关键字。
// 本文件无运行时值，纯类型导出。

export interface ApiErrorBody {
  code: string;
  message: string;
}

export class ApiError extends Error {
  readonly kind: 'network' | 'server' | 'auth' | 'client';
  readonly status?: number;
  readonly code?: string;

  constructor(kind: 'network' | 'server' | 'auth' | 'client', message: string, status?: number, code?: string) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
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
  must_change_password: boolean | null;
}

export interface UpdateProfileRequest {
  username: string | null;
  avatar: string | null;
}

export interface ChangePasswordRequest {
  old_password: string | null;
  new_password: string;
}

export interface RiskPredictRequest {
  diabetes_history: 'healthy' | 'prediabetes' | 'diagnosed';
  diabetes_type: 'type1' | 'type2' | 'gestational' | 'other' | null;
  age: number;
  gender: 'male' | 'female';
  height: number;
  weight: number;
  waist: number | null;
  systolic_bp: number | null;
  family_history: 'yes' | 'no';
  pregnancy: boolean | null;
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

export interface CollectedArticle extends Article {
  collect_id: number;
}

export interface ArticleGenerateCategoryItem {
  label: string;
  recommended: boolean | null;
  reason: string | null;
}

export interface ArticleGenerateCategorySelection {
  stage: 'category_selection';
  categories: ArticleGenerateCategoryItem[];
}

export interface PlanGenerateRequestHealthInfo {
  age: number;
  gender: 'male' | 'female';
  height: number;
  weight: number;
}

export interface PlanGenerateRequestPreferences {
  dietary: string;
  activity: string;
}

export interface PlanGenerateRequest {
  health_info: PlanGenerateRequestHealthInfo;
  preferences: PlanGenerateRequestPreferences;
}

export interface PlanAdjustRequest {
  plan_id: number;
  feedback: string;
}

export interface PlanResponse {
  plan_id: number;
  diet_plans: LifePlan[];
  exercise_plans: LifePlan[];
  other_plans: LifePlan[];
}

export interface PlanCurrentResponse extends PlanResponse {
  generated_at: string;
}

export interface PunchCreateRequest {
  plan_id: number;
  punch_type: PunchType;
  completion_status: CompletionStatus;
  remarks: string | null;
}

export interface PunchCreateResponse {
  id: number;
  plan_id: number;
  punch_type: PunchType;
  completion_status: CompletionStatus;
  remarks: string;
  punch_time: string;
}

export interface PunchListParams extends PaginationParams {
  startDate: string | null;
  endDate: string | null;
  punch_type: PunchType | null;
}

export interface PunchAnalysisTrendDay {
  date: string;
  diet_completed: number;
  exercise_completed: number;
}

export interface PunchAnalysisResponse {
  diet_completion_rate: number;
  exercise_completion_rate: number;
  total_punches: number;
  last_7_days_trend: PunchAnalysisTrendDay[];
  adherence_comment: string;
  improvement_suggestions: string[];
}
