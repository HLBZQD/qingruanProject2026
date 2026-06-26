# 糖尿病预治智能助手 — 后端服务

基于 Express + SQLite 的 RESTful API 后端，为糖尿病预治智能助手 SPA 前端提供数据服务，并通过 Dify 平台代理 AI 大模型接口。

## 项目结构

```
├── .env                      # 环境变量（密钥、API Key，不提交）
├── .env.example              # 环境变量模板
├── package.json              # Node.js 依赖
├── server.js                 # Express 启动入口
├── test_all_endpoints.sh     # 全端点测试脚本
│
├── server/
│   ├── app.js                # Express 应用配置
│   ├── db/
│   │   ├── database.js       # SQLite 初始化和导出
│   │   ├── init.sql          # 数据库 DDL（10 张表 + 索引）
│   │   └── seed.sql          # 初始种子数据
│   ├── middleware/
│   │   ├── auth.js           # JWT Bearer 认证中间件
│   │   ├── admin.js          # 管理员角色校验
│   │   ├── optionalAuth.js   # 可选认证（admin/execute 双认证链）
│   │   ├── difyAuth.js       # Dify API Key 回调认证
│   │   └── errorHandler.js   # 全局错误处理（统一 { error: { code, message } } 格式）
│   ├── routes/
│   │   ├── index.js          # 路由汇总挂载 + 404 兜底
│   │   ├── auth.js           # 注册 / 登录 / 登出
│   │   ├── user.js           # 个人信息 / 修改密码
│   │   ├── doctors.js        # 医生列表 / 详情
│   │   ├── diabetes.js       # 糖尿病类型百科
│   │   ├── articles.js       # 文章列表 / 详情 / 收藏 / AI 生成
│   │   ├── risk.js           # 风险预测 / 历史记录
│   │   ├── plan.js           # 生活方案生成 / 查询 / 调整
│   │   ├── punch.js          # 打卡记录 / 列表 / 分析
│   │   ├── chat.js           # 医师对话 SSE 代理
│   │   ├── assistant.js      # AI 助手对话 + 健康建议
│   │   ├── admin.js          # 管理日志 / 自然语言 SQL / 参数化工具分发
│   │   └── upload.js         # 头像上传（JPEG/PNG/WebP, ≤2MB）
│   ├── services/
│   │   ├── difyService.js    # Dify 工作流调用（blocking + mock 兜底）
│   │   └── sseProxy.js       # Dify SSE 流代理
│   └── utils/
│       ├── validators.js     # 请求参数校验（注册/登录/风险/方案/打卡/文章生成）
│       ├── pagination.js     # 统一分页（page=1, pageSize=20, max=100）
│       ├── response.js       # 统一响应 (success/error)
│       ├── dateRange.js      # 日期范围校验
│       ├── jsonFields.js     # JSON 字段序列化/反序列化
│       ├── planParser.js     # 方案输出解析（JSON + 正则降级）
│       ├── encryption.js     # AES-256-GCM 加密（chat_token）
│       └── validateRowLevelPermission.js  # 行级权限校验
│
├── docs/                     # 设计文档
│   ├── 1_requirements_analysis_v*.md
│   ├── 2_detailed_design_v*.md
│   ├── skill/                # 审议式编排框架
│   └── ...
│
├── implements/               # 审议式实现产物（8 批次）
├── redeliberations/          # 再审议诊断产物
├── reviews/                  # 代码审查报告
├── static/uploads/           # 上传文件存储
└── data/                     # SQLite 数据库文件（不提交）
```

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 JWT_SECRET 和 Dify API Keys

# 3. 启动服务
npm start

# 4. 运行测试
bash test_all_endpoints.sh
```

## API 端点（34 个）

| # | 方法 | 路径 | 认证 | 说明 |
|---|------|------|------|------|
| 1 | GET | `/api/health` | 否 | 健康检查 |
| 2 | POST | `/api/auth/register` | 否 | 用户注册 |
| 3 | POST | `/api/auth/login` | 否 | 用户登录 |
| 4 | POST | `/api/auth/logout` | JWT | 退出登录 |
| 5 | GET | `/api/user/profile` | JWT | 获取个人信息 |
| 6 | PUT | `/api/user/profile` | JWT | 修改个人信息 |
| 7 | PUT | `/api/user/password` | JWT | 修改密码 |
| 8 | GET | `/api/doctors` | 否 | 医生列表（分页） |
| 9 | GET | `/api/doctors/:id` | 否 | 医生详情 |
| 10 | GET | `/api/articles` | 否 | 文章列表（分页+分类筛选） |
| 11 | GET | `/api/articles/collections` | JWT | 我的收藏 |
| 12 | POST | `/api/articles/generate` | JWT | AI 生成文章 |
| 13 | GET | `/api/articles/:id` | 可选 | 文章详情 |
| 14 | POST | `/api/articles/:id/collect` | JWT | 收藏文章 |
| 15 | DELETE | `/api/articles/:id/collect` | JWT | 取消收藏 |
| 16 | GET | `/api/diabetes-types` | 否 | 糖尿病类型列表 |
| 17 | GET | `/api/diabetes-types/:id` | 否 | 糖尿病类型详情 |
| 18 | POST | `/api/risk/predict` | JWT | 风险预测 |
| 19 | GET | `/api/risk/history` | JWT | 预测历史（分页） |
| 20 | POST | `/api/plan/generate` | JWT | 生成生活方案 |
| 21 | GET | `/api/plan/current` | JWT | 当前活跃方案 |
| 22 | PUT | `/api/plan/adjust` | JWT | 调整方案 |
| 23 | POST | `/api/punch` | JWT | 打卡 |
| 24 | GET | `/api/punch/list` | JWT | 打卡列表（分页+筛选） |
| 25 | GET | `/api/punch/analysis` | JWT | 打卡分析 |
| 26 | POST | `/api/chat/doctor/:id` | JWT | 医师对话（SSE） |
| 27 | GET | `/api/chat/doctor/:id/conversations` | JWT | 医师对话历史 |
| 28 | POST | `/api/assistant/chat` | JWT | AI助手对话（SSE） |
| 29 | GET | `/api/assistant/advice` | JWT | 健康建议列表（分页） |
| 30 | GET | `/api/assistant/conversations` | JWT | AI对话历史 |
| 31 | GET | `/api/admin/logs` | JWT+Admin | 操作日志（分页） |
| 32 | POST | `/api/admin/execute` | 双认证 | 参数化查询 / SQL 执行 |
| 33 | POST | `/api/admin/chat` | JWT+Admin | 管理对话（SSE） |
| 34 | POST | `/api/upload/avatar` | JWT | 头像上传 |

## 响应格式

**成功：**
```json
{ "success": true, "message": "...", "data": {...} }
```

**错误：**
```json
{ "error": { "code": "ERROR_CODE", "message": "..." } }
```

**分页：**
```json
{ "success": true, "data": [...], "pagination": { "page": 1, "pageSize": 20, "total": 150, "totalPages": 8 } }
```

## 数据库

SQLite 3（WAL 模式），10 张表：`users`, `doctor_information`, `articles`, `diabetes_types`, `article_collections`, `user_risk_info`, `life_plans`, `life_advice`, `punch_in`, `admin_logs`。

## 技术栈

- **运行时**: Node.js 18+
- **框架**: Express 4
- **数据库**: SQLite 3 (better-sqlite3)
- **认证**: JWT (jsonwebtoken) + bcryptjs
- **文件上传**: multer
- **AI 代理**: Dify 平台
- **SQL 解析**: node-sql-parser
