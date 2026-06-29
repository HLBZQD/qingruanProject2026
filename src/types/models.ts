/**
 * 业务实体类型定义
 *
 * 设计依据: docs/4_frontend_gap_todo_v2.md A3
 * 从 api.ts 拆分出的业务实体类型，与 API 请求/响应类型解耦。
 * 请求/响应类型（LoginRequest/Response、PaginatedResponse 等）仍保留在 api.ts。
 */

// ========== 用户实体 ==========

export interface User {
  id: number;
  username: string;
  role: 'user' | 'admin';
  avatar: string | null;
}

export interface UserProfile extends User {
  created_at: string;
}

// ========== 管理员操作日志实体 ==========

export interface AdminLog {
  id: number;
  operator_id: number;
  operator_username: string;
  operation_type: 'INSERT' | 'UPDATE' | 'DELETE' | 'SELECT' | string;
  operation_content: string;
  operation_result: string;
  operation_time: string;
}

// ========== 医生实体 ==========

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

// ========== 健康科普文章实体 ==========

export interface Article {
  id: number;
  title: string;
  /** 封面图 URL；可空，组件回退占位图 */
  cover: string | null;
  author: string;
  category: string;
  /** 标签数组；DB 以 TEXT(JSON) 存储，后端已 JSON.parse 降级为 [] */
  tags: string[];
  /** 文章摘要（列表卡片副文案） */
  summary: string;
  /** 阅读量 */
  views: number;
  /** 发布时间 ISO 字符串 */
  created_at: string;
}

export interface ArticleDetail extends Article {
  /** Markdown 正文 */
  content: string;
  /** 当前用户是否已收藏 */
  is_collected: boolean;
}

// ========== 糖尿病类型科普实体 ==========

export interface DiabetesType {
  id: number;
  name: string;
  /** 后端真实字段名为 image；string | null */
  image: string | null;
  pathogenesis: string;
  manifestation: string;
  treatment: string;
}

export type DiabetesTypeDetail = DiabetesType;

// ========== 生活方案实体 ==========

export type PlanType = 'diet' | 'exercise' | 'other';

export interface LifePlan {
  /** 方案项主键 id */
  id: number;
  /** 方案类型：diet/exercise/other */
  plan_type: PlanType;
  /** 排序号 */
  order_num: number;
  /** 时间描述文本（如 "7:00-8:00"） */
  time_desc: string;
  /** 方案项标题 */
  title: string;
  /** 方案详细内容，可能含 Markdown */
  content: string;
}

// ========== 健康建议实体 ==========

export interface HealthAdvice {
  id: number;
  title: string;
  tags: string[];
  content: string;
  created_at: string;
}

// ========== 打卡记录实体 ==========

export type PunchType = 'diet' | 'exercise';
export type CompletionStatus = 'completed' | 'uncompleted';

export interface PunchRecord {
  id: number;
  /** 方案组 ID（可空，历史记录可能方案已过期） */
  plan_id: number | null;
  /** 关联方案项标题 */
  plan_title?: string;
  punch_type: PunchType;
  completion_status: CompletionStatus;
  remarks: string;
  punch_time: string;
}
