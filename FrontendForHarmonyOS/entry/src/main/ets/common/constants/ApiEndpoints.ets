export const BASE_URL: string = 'http://222.241.14.34:3000';

// ==================== Auth (认证) ====================
export const API_AUTH_LOGIN: string = '/api/auth/login';
export const API_AUTH_REGISTER: string = '/api/auth/register';
export const API_AUTH_LOGOUT: string = '/api/auth/logout';

// ==================== User (用户) ====================
export const API_USER_PROFILE: string = '/api/user/profile';
export const API_USER_PASSWORD: string = '/api/user/password';

// ==================== Risk (风险预测) ====================
export const API_RISK_PREDICT: string = '/api/risk/predict';
export const API_RISK_HISTORY: string = '/api/risk/history';

// ==================== Doctor (医生) ====================
export const API_DOCTORS: string = '/api/doctors';
export const API_DOCTORS_ID: (id: number) => string = (id) => `/api/doctors/${id}`;

// ==================== Chat (医师对话) ====================
export const API_CHAT_DOCTOR_ID: (id: number) => string = (id) => `/api/chat/doctor/${id}`;
export const API_CHAT_DOCTOR_ID_CONVERSATIONS: (id: number) => string = (id) => `/api/chat/doctor/${id}/conversations`;

// ==================== Plan (方案) ====================
export const API_PLAN_GENERATE: string = '/api/plan/generate';
export const API_PLAN_ADJUST: string = '/api/plan/adjust';
export const API_PLAN_CURRENT: string = '/api/plan/current';

// ==================== Punch (打卡) ====================
export const API_PUNCH: string = '/api/punch';
export const API_PUNCH_LIST: string = '/api/punch/list';
export const API_PUNCH_ANALYSIS: string = '/api/punch/analysis';

// ==================== Article (资讯) ====================
export const API_ARTICLES: string = '/api/articles';
export const API_ARTICLES_ID: (id: number) => string = (id) => `/api/articles/${id}`;
export const API_ARTICLES_GENERATE: string = '/api/articles/generate';
export const API_ARTICLES_COLLECT: (id: number) => string = (id) => `/api/articles/${id}/collect`;
export const API_ARTICLES_COLLECTIONS: string = '/api/articles/collections';

// ==================== Diabetes Types (糖尿病类型) ====================
export const API_DIABETES_TYPES: string = '/api/diabetes-types';
export const API_DIABETES_TYPES_ID: (id: number) => string = (id) => `/api/diabetes-types/${id}`;

// ==================== Assistant (AI 助手) ====================
export const API_ASSISTANT_CHAT: string = '/api/assistant/chat';
export const API_ASSISTANT_ADVICE: string = '/api/assistant/advice';
export const API_ASSISTANT_CONVERSATIONS: string = '/api/assistant/conversations';

// ==================== Admin (管理) ====================
export const API_ADMIN_CHAT: string = '/api/admin/chat';
export const API_ADMIN_EXECUTE: string = '/api/admin/execute';
export const API_ADMIN_LOGS: string = '/api/admin/logs';

// ==================== Dify (Dify 代理) ====================
export const API_DIFY_WORKFLOW_ID: (workflow_id: string) => string = (id) => `/api/dify/workflow/${id}`;
export const API_DIFY_AGENT_ID: (agent_id: string) => string = (id) => `/api/dify/agent/${id}`;

// ==================== Home (首页) ====================
export const API_HEALTH_ADVICE: string = '/api/assistant/advice';

// ==================== Upload (上传) ====================
export const API_UPLOAD_AVATAR: string = '/api/upload/avatar';
