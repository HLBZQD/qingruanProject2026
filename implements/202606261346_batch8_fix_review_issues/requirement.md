# 批次 8 实现需求：修复代码审查发现的所有问题

## 批次目标
根据审议式代码审查 + 再审议诊断流程产出的诊断报告，修复 `server/` 后端代码中 18 个问题（9 严重 + 9 一般）。

## 设计依据
- 详细设计文档：`docs/2_detailed_design_v3.md`
- 问题诊断报告：`redeliberations/202606261050_todo_diagnosis/a_v7_diag_v1.md`
- 原始代码审查报告：`reviews/202606261037_server_backend_review/review_v1.md`, `review_v2.md`

## 严重问题 (9)

### S1: database.js — 添加 WAL 模式和 busy_timeout
`server/db/database.js` 缺少 `journal_mode = WAL` 和 `busy_timeout = 5000` pragma。

### S2: 环境变量名统一
`database.js` 使用 `DB_PATH`（设计文档为 `SQLITE_PATH`），`difyService.js` 和 `sseProxy.js` 使用 `DIFY_API_BASE`（设计文档为 `DIFY_API_BASE_URL`）。需统一变量名。

### S3: auth.js — JWT Payload 字段名修正
`auth.js` 设置 `req.user = { id, username, role }`，设计文档约定 `req.user = { user_id, role }`。需统一，并同步所有路由处理器的引用。

### S4: 新增 POST /api/admin/chat 端点
管理员自然语言对话 SSE 流，需 JWT + admin 认证，调用 Dify admin-manager-agent。

### S5: 新增 difyAuth.js 中间件
`POST /api/admin/execute` 需同时支持 JWT Bearer Token 和 Dify API Key（`req.body.api_key`）双认证模式。

### S6: admin/execute 参数化工具分发
需要实现 `tool_name` 字段分发逻辑（`query_user_profile`、`query_risk_info`、`query_life_plans`、`query_punch_records` 等），使用预定义 SQL 模板 + 占位符绑定。

### S7: admin/execute 行级权限校验
AI 助手 Text2SQL 场景中，普通用户需行级权限约束（`validateRowLevelPermission`），确保仅能查询/操作本人数据。

### S8: chat.js — chat_token AES-256-GCM 解密
医师对话的 `chat_token` 字段存储加密值，Express 读取后须用 `JWT_SECRET` 派生密钥解密后再传给 Dify。

### S9: plan.js — 事务顺序修正
`POST /api/plan/generate` 中事务在 Dify 调用前提交，Dify 失败时用户丢失活跃方案。需调整事务时机。

## 一般问题 (10)

### G1: auth.js — JWT 有效期对齐 24h
登录路由 JWT 签名使用 `'7d'`，设计文档定义为 `24h`。改为读取 `process.env.JWT_EXPIRES_IN`。

### G2: database.js — 移除模块顶层副作用
`initDatabase()` 在模块末尾自动调用，应改为由 `server.js` 显式调用。

### G3: difyService.js — 改进 Mock 模式检测
基于 `inputs` 字段的启发式检测不可靠，改用明确请求类型参数或 `workflow_id`。

### G4: validators.js — 移除未使用的导入
`const { error } = require('./response')` 从未使用。

### G5: planParser.js — 放宽 JSON 正则顺序依赖
正则以固定字段顺序匹配，改用逐字段独立正则提取。

### G6: chat.js / assistant.js — 实现对话历史会话列表
当前返回空数组，需调用 Dify Conversations API 代理查询。

### G7: admin.js — SQL 关键字检查改进
移除 `.toUpperCase()` 预处理，直接用大小写不敏感正则匹配。

### G8: articles.js — 统一日期格式
`strftime` 使用 T 分隔符格式，与其他表不一致。创建共用工具函数。

### G9: upload.js — 目录创建移入函数内部
`fs.mkdirSync` 在模块顶层执行，移至请求处理函数中或用 try-catch 包裹。

### G10: 路由挂载检查
确保 `routes/index.js` 挂载 `admin` 和 `upload` 路由。

## 项目根目录
/home/derpyIsTheBest/qingruanProject2026

## 详细设计参考
`docs/2_detailed_design_v3.md`
