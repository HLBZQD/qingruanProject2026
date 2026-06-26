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
