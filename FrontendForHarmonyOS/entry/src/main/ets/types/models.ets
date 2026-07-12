// D1: ArkTS 不支持 interface 可选字段 `?:`，可空字段改 `field: T | null` 必填。
// D2: ArkTS 不支持异构字段 discriminated union，保留具名 interface + 字面量联合 `type` 出口。
// 本文件无运行时值，纯类型导出。

export type PlanType = 'diet' | 'exercise' | 'other';
export type PunchType = 'diet' | 'exercise';
export type CompletionStatus = 'completed' | 'uncompleted';
export type DiabetesTypeDetail = DiabetesType;

export interface User {
  id: number;
  username: string;
  role: 'user' | 'admin';
  avatar: string | null;
}

export interface UserProfile extends User {
  created_at: string;
}

export interface AdminLog {
  id: number;
  operator_id: number;
  operator_username: string;
  operation_type: 'INSERT' | 'UPDATE' | 'DELETE' | 'SELECT';
  operation_content: string;
  operation_result: string;
  operation_time: string;
}

export interface Doctor {
  id: number;
  name: string;
  department: string;
  title: string;
  description: string;
  avatar: string | null;
}

export interface DoctorDetail extends Doctor {
  is_online: boolean;
}

export interface Article {
  id: number;
  title: string;
  cover: string | null;
  author: string;
  category: string;
  tags: string[];
  summary: string;
  views: number;
  created_at: string;
}

export interface ArticleDetail extends Article {
  content: string;
  is_collected: boolean;
}

export interface DiabetesType {
  id: number;
  name: string;
  image: string | null;
  pathogenesis: string;
  manifestation: string;
  treatment: string;
}

export interface LifePlan {
  id: number;
  plan_type: PlanType;
  order_num: number;
  time_desc: string;
  title: string;
  content: string;
}

export interface HealthAdvice {
  id: number;
  title: string;
  tags: string[];
  content: string;
  created_at: string;
}

export interface PunchRecord {
  id: number;
  plan_id: number | null;
  plan_title: string | null;
  punch_type: PunchType;
  completion_status: CompletionStatus;
  remarks: string;
  punch_time: string;
}
