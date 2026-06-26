# 糖尿病预治智能助手

基于 Vue3 + Express + Dify/DeepSeek 的全栈智慧医疗应用。提供糖尿病风险评估、个性化生活方案、AI 健康助手、医师在线咨询、健康资讯科普等核心功能。

## 系统架构

```
用户浏览器                     Nginx (主/备)                 数据服务器                 外部云服务
┌──────────────┐      ┌──────────────────────┐      ┌─────────────────┐      ┌──────────────┐
│ Vue3 SPA     │─HTTP─▶│ 反向代理 + 负载均衡    │─/api─▶│ Express :3000   │─API─▶│ Dify 平台     │
│ (Vite dist/) │      │ VIP: 10.0.0.100      │      │ REST API + SSE  │      │ 工作流/Agent  │
│              │      │ Keepalived 高可用     │      │ JWT + SQLite    │      ├──────────────┤
│ Pinia Store  │      └──────────────────────┘      └─────────────────┘      │ DeepSeek 模型 │
│ Vue Router 4 │                                                             └──────────────┘
│ Axios + JWT  │
└──────┬───────┘
       │ SSE 流 (AI 对话 / 医师对话)
       ▼ 直连 Express
```

**三层架构**：前端层（浏览器 SPA）→ 中间层（Express API + Nginx）→ AI 层（Dify + DeepSeek）

## 前端 (Vue3 SPA)

| 技术 | 用途 |
|------|------|
| Vue 3 + TypeScript | 组合式 API，静态类型 |
| Vite 5 | 构建工具，HMR 热更新 |
| Vue Router 4 | history 模式路由，全局前置守卫 |
| Pinia 2 | 状态管理（auth/chart/riskForm） |
| Vant 4 | 移动端组件库 |
| Tailwind CSS 3 | 原子化样式 |
| Axios | HTTP 客户端，JWT 拦截器 |

**页面路由**：首页 → 医师咨询 → 生活方案 → 健康资讯 → 个人中心

**核心组件**：TabBar（底部导航）、FabButton（悬浮 AI 按钮）、AiChatDialog（AI 对话弹窗）、SkeletonLoader（骨架屏）、DisclaimerBar（医学免责声明）

## 后端 (Express + SQLite)

| 技术 | 用途 |
|------|------|
| Express 4 | Web 框架 |
| SQLite 3 (WAL) | 数据库，10 张表 |
| JWT + bcryptjs | 认证与授权 |
| multer | 文件上传 |
| Dify SDK | AI 工作流调用（blocking） |
| SSE Proxy | AI 流式对话代理 |

### 数据库表

`users` · `doctor_information` · `articles` · `diabetes_types` · `article_collections` · `user_risk_info` · `life_plans` · `life_advice` · `punch_in` · `admin_logs`

### 响应格式

- **成功**: `{ success: true, message: "...", data: {...} }`
- **错误**: `{ error: { code: "ERROR_CODE", message: "..." } }`
- **分页**: `{ success: true, data: [...], pagination: { page, pageSize, total, totalPages } }`

## 项目结构

```
qingruanProject2026/
├── .env                      # 环境变量（不提交）
├── .env.example              # 环境变量模板
├── package.json              # 后端依赖
├── server.js                 # 后端启动入口
├── test_all_endpoints.sh     # 全端点自动化测试
│
├── src/                      # 前端源码 (Vue3 + TypeScript)
│   ├── main.ts               # 应用入口
│   ├── App.vue               # 根组件
│   ├── router/index.ts       # 路由配置
│   ├── stores/               # Pinia Store
│   │   ├── authStore.ts      # 登录态
│   │   ├── chatStore.ts      # AI 对话
│   │   └── riskFormStore.ts  # 风险预测表单
│   ├── views/                # 页面组件 (12 个)
│   │   ├── Home.vue          # 首页
│   │   ├── Consultation.vue  # 医师咨询
│   │   ├── LifePlan.vue      # 生活方案
│   │   ├── NewsView.vue      # 健康资讯
│   │   ├── Profile.vue       # 个人中心
│   │   ├── Risk.vue          # 风险预测
│   │   ├── Punch.vue         # 打卡记录
│   │   ├── HealthAdvice.vue  # 健康建议
│   │   ├── Admin.vue         # 智能管理
│   │   ├── Login.vue         # 登录/注册
│   │   ├── DoctorChatView.vue# 医师对话
│   │   ├── ArticleDetailView.vue # 文章详情
│   │   └── ChangePassword.vue# 强制改密
│   ├── components/           # 可复用组件 (7 个)
│   ├── composables/          # 组合式函数
│   ├── types/                # TypeScript 类型
│   ├── utils/                # 工具函数
│   └── styles/               # 样式
│
├── server/                   # 后端源码 (Express)
│   ├── app.js                # Express 配置
│   ├── routes/               # 路由 (13 个模块)
│   │   ├── auth.js           # 注册/登录/登出
│   │   ├── user.js           # 个人信息
│   │   ├── doctors.js        # 医生列表
│   │   ├── articles.js       # 文章/收藏/AI 生成
│   │   ├── diabetes.js       # 糖尿病类型
│   │   ├── risk.js           # 风险预测
│   │   ├── plan.js           # 生活方案
│   │   ├── punch.js          # 打卡
│   │   ├── chat.js           # 医师对话 (SSE)
│   │   ├── assistant.js      # AI 助手 (SSE)
│   │   ├── admin.js          # 管理: 日志/参数化查询/SQL
│   │   └── upload.js         # 头像上传
│   ├── middleware/            # 中间件
│   │   ├── auth.js           # JWT 认证
│   │   ├── admin.js          # 管理员校验
│   │   ├── optionalAuth.js   # 可选认证
│   │   ├── difyAuth.js       # Dify API Key 认证
│   │   └── errorHandler.js   # 统一错误处理
│   ├── services/             # 业务逻辑
│   │   ├── difyService.js    # Dify 工作流调用
│   │   └── sseProxy.js       # SSE 流代理
│   ├── utils/                # 工具函数 (8 个)
│   └── db/
│       ├── database.js       # SQLite 连接
│       ├── init.sql          # DDL
│       └── seed.sql          # 种子数据
│
├── static/                   # 静态资源
│   ├── lib/                  # 第三方库
│   ├── images/               # 图片 (医生/糖尿病/横幅/默认)
│   └── uploads/              # 用户上传
│
├── docs/                     # 设计文档
├── implements/               # 审议式实现记录 (8 批次)
└── data/                     # 运行时数据 (不提交)
```

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 JWT_SECRET 和 Dify API Keys

# 3. 启动后端
npm start

# 4. 测试所有端点
bash test_all_endpoints.sh
```

## 部署架构

- **服务器 1**（数据服务器）：Nginx 静态服务 + Express API + SQLite
- **服务器 2/3**（主/备）：Nginx 反向代理 + Keepalived VIP 漂移
- **高可用**：主备 Nginx 通过 Keepalived 实现 VIP: `10.0.0.100`
- **前端部署**：Vite 构建产物 `dist/` 部署到 Nginx `/static/` 路径

## API 端点（34 个）

| # | 方法 | 路径 | 认证 | 说明 |
|---|------|------|------|------|
| 1 | GET | `/api/health` | — | 健康检查 |
| 2 | POST | `/api/auth/register` | — | 用户注册 |
| 3 | POST | `/api/auth/login` | — | 用户登录 |
| 4 | POST | `/api/auth/logout` | JWT | 退出登录 |
| 5 | GET | `/api/user/profile` | JWT | 个人信息 |
| 6 | PUT | `/api/user/profile` | JWT | 修改信息 |
| 7 | PUT | `/api/user/password` | JWT | 修改密码 |
| 8 | GET | `/api/doctors` | — | 医生列表 |
| 9 | GET | `/api/doctors/:id` | — | 医生详情 |
| 10 | GET | `/api/articles` | — | 文章列表 |
| 11 | GET | `/api/articles/collections` | JWT | 我的收藏 |
| 12 | POST | `/api/articles/generate` | JWT | AI 生成文章 |
| 13 | GET | `/api/articles/:id` | 可选 | 文章详情 |
| 14 | POST | `/api/articles/:id/collect` | JWT | 收藏 |
| 15 | DELETE | `/api/articles/:id/collect` | JWT | 取消收藏 |
| 16 | GET | `/api/diabetes-types` | — | 糖尿病类型 |
| 17 | GET | `/api/diabetes-types/:id` | — | 类型详情 |
| 18 | POST | `/api/risk/predict` | JWT | 风险预测 |
| 19 | GET | `/api/risk/history` | JWT | 预测历史 |
| 20 | POST | `/api/plan/generate` | JWT | 生成方案 |
| 21 | GET | `/api/plan/current` | JWT | 当前方案 |
| 22 | PUT | `/api/plan/adjust` | JWT | 调整方案 |
| 23 | POST | `/api/punch` | JWT | 打卡 |
| 24 | GET | `/api/punch/list` | JWT | 打卡列表 |
| 25 | GET | `/api/punch/analysis` | JWT | 打卡分析 |
| 26 | POST | `/api/chat/doctor/:id` | JWT | 医师对话 (SSE) |
| 27 | GET | `/api/chat/doctor/:id/conversations` | JWT | 对话历史 |
| 28 | POST | `/api/assistant/chat` | JWT | AI 助手 (SSE) |
| 29 | GET | `/api/assistant/advice` | JWT | 健康建议 |
| 30 | GET | `/api/assistant/conversations` | JWT | AI 对话历史 |
| 31 | GET | `/api/admin/logs` | JWT+Admin | 操作日志 |
| 32 | POST | `/api/admin/execute` | 双认证 | 参数化查询/SQL |
| 33 | POST | `/api/admin/chat` | JWT+Admin | 管理对话 (SSE) |
| 34 | POST | `/api/upload/avatar` | JWT | 头像上传 |
