### Task 1: 修复 plan.js/risk.js Dify API Key 环境变量命名不匹配 — 完成
**修改文件**：server/routes/plan.js, server/routes/risk.js
**改动摘要**：plan.js 中 4 处 `DIFY_PLAN_WORKFLOW_API_KEY` → `DIFY_PLAN_WORKFLOW_KEY`；risk.js 中 2 处 `DIFY_RISK_WORKFLOW_API_KEY` → `DIFY_RISK_WORKFLOW_KEY`

### Task 2: database.js 添加 WAL 模式和 busy_timeout pragma — 完成
**修改文件**：server/db/database.js
**改动摘要**：在 `foreign_keys = ON` 后追加 `journal_mode = WAL` 和 `busy_timeout = 5000`

### Task 3: plan.js 事务顺序修正（含 plan_id 生成与 checkIdempotent 同步调整） — 完成
**修改文件**：server/routes/plan.js
**改动摘要**：POST /generate 和 PUT /adjust 均改为先调 Dify 后事务；checkIdempotent 后移至 Dify 成功后；全部 req.user.id → req.user.user_id

### Task 4: 新建 difyAuth.js 中间件 — 完成
**修改文件**：server/middleware/difyAuth.js（新建）
**改动摘要**：实现 Dify API Key SHA-256 常量时间比较认证，注入 `req.difyAuth = { userId, mode: 'callback' }`

### Task 5: admin/execute 实现 tool_name 参数化工具分发（12 个工具完整实现） — 完成
**修改文件**：server/routes/admin.js（完整重写）
**改动摘要**：新增 `optionalAuth, difyAuthMiddleware` 中间件链；实现 `dispatchParameterizedQuery` 12 个工具分发；execute_SQL 兜底路径含行级权限校验、白名单、防篡改、事务日志

### Task 6: admin/execute 行级权限校验 — AST 解析方案（node-sql-parser） — 完成
**修改文件**：server/utils/validateRowLevelPermission.js（新建），package.json（新增 node-sql-parser 依赖）
**改动摘要**：基于 node-sql-parser AST 解析实现四类表分类（禁止/公开只读/审计日志/用户私有）的行级权限约束

### Task 7: 新增 POST /api/admin/chat 端点 — 完成
**修改文件**：server/routes/admin.js
**改动摘要**：新增 `POST /chat` 路由，使用 authMiddleware + adminMiddleware + proxyDifySSE 代理至 DIFY_ADMIN_AGENT_KEY

### Task 8a: chat_token AES-256-GCM 加密端实现 — 完成
**修改文件**：server/utils/encryption.js（新建），.env，.env.example
**改动摘要**：实现 encryptChatToken/decryptChatToken，使用 JWT_SECRET 派生密钥 + AES-256-GCM + AAD 防篡改；admin.js insert/update_record 对 doctor_information.chat_token 自动加密

### Task 8b: chat_token 解密 + chat.js 集成 — 完成
**修改文件**：server/routes/chat.js
**改动摘要**：chat.js 读取 chat_token 后调用 decryptChatToken 解密再传 Dify；userId 改为 req.user.user_id

### Task 9: auth.js JWT 有效期对齐设计规范（24h） — 完成
**修改文件**：server/routes/auth.js，.env，.env.example
**改动摘要**：expiresIn 硬编码 '7d' → `process.env.JWT_EXPIRES_IN || '24h'`；新增 JWT_EXPIRES_IN 环境变量

### Task 10: JWT Payload 字段名统一为 user_id — 完成
**修改文件**：server/middleware/auth.js, server/middleware/optionalAuth.js, server/routes/articles.js, server/routes/assistant.js, server/routes/punch.js, server/routes/risk.js, server/routes/upload.js, server/routes/user.js
**改动摘要**：中间件 `req.user = { id: ... }` → `{ user_id: ... }`；routes 下所有 `req.user.id` → `req.user.user_id`（plan.js/admin.js/chat.js 在各自任务中已处理）

### Task 11: 环境变量名对齐检查（验证任务，无需修改代码） — 完成
**修改文件**：无
**改动摘要**：已验证 DB_PATH/DIFY_API_BASE 变量代码与 .env 完全自洽

### Task 12: database.js 移除模块顶层副作用 — 完成
**修改文件**：server/db/database.js
**改动摘要**：删除 database.js 第 33 行 `initDatabase()` 顶层调用；server.js 显式调用保持不变

### Task 13: difyService.js Mock 模式检测改进 — 完成
**修改文件**：server/services/difyService.js, server/routes/plan.js, server/routes/risk.js, server/routes/articles.js
**改动摘要**：`callWorkflowBlocking` 增加第三个参数 `workflowType`，Mock 分支按类型返回；所有调用方传入 'plan'/'risk'/'article'

### Task 14: validators.js 移除未使用的导入 — 完成
**修改文件**：server/utils/validators.js
**改动摘要**：删除第 1 行 `const { error } = require('./response')`

### Task 15: planParser.js 放宽 JSON 正则顺序依赖 — 完成
**修改文件**：server/utils/planParser.js
**改动摘要**：单一硬编码字段顺序正则 → 逐字段独立正则提取（extractField）；删除 labelPattern 中文标签正则

### Task 16: 对话历史会话列表实现 — 完成
**修改文件**：server/services/difyService.js, server/routes/chat.js, server/routes/assistant.js
**改动摘要**：新增 `callDifyGetConversations` 调用 Dify Conversations API；chat.js/assistant.js 的 conversations 端点从硬编码空数组改为真实代理查询

### Task 17: admin.js SQL 关键字检查改进 — 改为统一白名单模式 — 完成
**修改文件**：server/routes/admin.js（已在 Task 5 中覆盖）
**改动摘要**：移除 .toUpperCase() 预处理；`startsWith('SELECT')` + 黑名单 → 单一正则白名单 `SELECT|INSERT|UPDATE|DELETE`

### Task 18: articles.js 统一日期格式 — 完成
**修改文件**：server/routes/articles.js
**改动摘要**：`strftime('%Y-%m-%dT%H:%M:%S', ...)` → `datetime('now', 'localtime')` 空格分隔格式与其他表一致

### Task 19: upload.js 目录创建移入函数内部 — 完成
**修改文件**：server/routes/upload.js, server.js
**改动摘要**：模块顶层 `fs.mkdirSync` → `ensureUploadDir()` 函数（try-catch 包裹）；server.js 启动时显式调用；导出 `router.ensureUploadDir = ensureUploadDir`
