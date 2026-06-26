# 代码审查报告 — Batch 8 Fix Review Issues

> 审查日期：2026-06-26
> 审查依据：detail_v1.md / task_v1.md / 2_detailed_design_v3.md / code_v1.md

---

## 语法检查结果

| 文件 | `node -c` | 结果 |
|------|-----------|------|
| server/middleware/auth.js | 通过 | ✓ |
| server/middleware/optionalAuth.js | 通过 | ✓ |
| server/middleware/difyAuth.js | 通过 | ✓ |
| server/db/database.js | 通过 | ✓ |
| server/utils/encryption.js | 通过 | ✓ |
| server/utils/validateRowLevelPermission.js | 通过 | ✓ |
| server/utils/validators.js | 通过 | ✓ |
| server/utils/planParser.js | 通过 | ✓ |
| server/routes/admin.js | 通过 | ✓ |
| server/routes/plan.js | 通过 | ✓ |
| server/routes/risk.js | 通过 | ✓ |
| server/routes/auth.js | 通过 | ✓ |
| server/routes/chat.js | 通过 | ✓ |
| server/routes/assistant.js | 通过 | ✓ |
| server/routes/articles.js | 通过 | ✓ |
| server/routes/upload.js | 通过 | ✓ |
| server/routes/user.js | 通过 | ✓ |
| server/routes/punch.js | 通过 | ✓ |
| server/services/difyService.js | 通过 | ✓ |
| server.js | 通过 | ✓ |

**20/20 文件语法检查通过，无语法错误。**

---

## 逐任务评估

### Task 1: 修复 plan.js/risk.js Dify API Key 环境变量命名不匹配 — **经过**
- plan.js: 4 处 `DIFY_PLAN_WORKFLOW_API_KEY` → `DIFY_PLAN_WORKFLOW_KEY` (行 29, 39, 160, 171)
- risk.js: 2 处 `DIFY_RISK_WORKFLOW_API_KEY` → `DIFY_RISK_WORKFLOW_KEY` (行 54, 73)
- `rg "DIFY_PLAN_WORKFLOW_API_KEY|DIFY_RISK_WORKFLOW_API_KEY" server/` 无匹配
- .env / .env.example 中 `DIFY_PLAN_WORKFLOW_KEY` / `DIFY_RISK_WORKFLOW_KEY` 保持不变

### Task 2: database.js 添加 WAL 模式和 busy_timeout pragma — **经过**
- database.js:18 后追加 `journal_mode = WAL`、`busy_timeout = 5000` (行 19-20)
- 顺序：`foreign_keys = ON` → `journal_mode = WAL` → `busy_timeout = 5000`，与设计文档 6.4 节一致

### Task 3: plan.js 事务顺序修正 — **经过**
- POST /generate: 先调 Dify (行 28-35) → checkIdempotent 后移 (行 44) → 事务内 deactivate+生成 plan_id+写入 (行 48-77)
- PUT /adjust: 先调 Dify (行 159-167) → 事务内 deactivate+生成 new plan_id+写入 (行 176-204)
- 所有 `req.user.id` → `req.user.user_id` 替换完成
- checkIdempotent 后移至 Dify 成功后调用

### Task 4: 新建 difyAuth.js 中间件 — **经过**
- server/middleware/difyAuth.js 新建完成
- SHA-256 常量时间比较 (行 17-22) ✓
- `req.difyAuth = { userId: user_id, mode: 'callback' }` (行 41) ✓
- api_key 不存在时 `next()` (行 7) ✓
- 与设计文档一致：`optionalAuth, difyAuthMiddleware` 中间件链 (admin.js:33)

### Task 5: admin/execute 实现 tool_name 参数化工具分发 — **经过**
- 7 个 diabetes-assistant-agent 工具全部实现 (行 160-230)
- 5 个 admin-manager-agent 工具全部实现 (行 232-337)
- 所有工具使用参数化查询 `db.prepare(sql).all/bind/run(param)` 防 SQL 注入
- admin-manager-agent 工具检查 `operatorRole !== 'admin'` 返回 403
- execute_SQL 兜底路径含行级权限校验、白名单、防篡改、事务日志 (行 65-112)
- 未知 tool_name 返回 400 BAD_REQUEST (行 339-340)

### Task 6: admin/execute 行级权限校验 — AST 解析方案 — **经过**
- server/utils/validateRowLevelPermission.js 新建完成
- 基于 node-sql-parser AST 解析 (行 1-2)
- 四类表分类 (行 4-12)：禁止访问(users)、公开只读(articles/doctor_information/diabetes_types)、审计日志(admin_logs)、用户私有(user_risk_info/life_plans/life_advice/punch_in/article_collections)
- extractTableNames (行 66-101)、containsUserIdConstraint (行 103-135)、insertContainsUserId (行 137-158) 实现完整
- AST 解析失败 → fail-closed (行 18-19)
- admin.js 中仅在 `operatorRole !== 'admin'` 时调用 (行 74-79)
- package.json 已添加 `node-sql-parser: ^5.4.0`

### Task 7: 新增 POST /api/admin/chat 端点 — **经过**
- admin.js:115-136 新增 `POST /chat` 路由
- 使用 `authMiddleware + adminMiddleware` 中间件链
- 使用 `proxyDifySSE` 代理，API Key 为 `DIFY_ADMIN_AGENT_KEY`
- 消息验证 (行 119-123) ✓
- .env / .env.example 已添加 `DIFY_ADMIN_AGENT_KEY=`

### Task 8a: chat_token AES-256-GCM 加密端实现 — **经过**
- server/utils/encryption.js 新建完成
- `deriveKey`: crypto.scryptSync + JWT_SECRET (行 21-24) ✓
- `getSalt`: 读 AES_SALT 或自动生成 (行 5-19) ✓
- `encryptChatToken`: AES-256-GCM + AAD + 随机 IV (行 26-38) ✓
- 输出格式：`iv:authTag:ciphertext` (base64) (行 37)
- admin.js insert_record (行 266-268) / update_record (行 294-296) 自动加密 doctor_information.chat_token
- .env / .env.example 已添加 `AES_SALT=`

### Task 8b: chat_token 解密 + chat.js 集成 — **经过**
- `decryptChatToken` 在 encryption.js 完整实现 (行 40-61)
- chat.js 解密后传 Dify (行 25, 28)
- userId 使用 `req.user.user_id` (行 31)

### Task 9: auth.js JWT 有效期对齐设计规范（24h） — **经过**
- auth.js:35: `{ expiresIn: process.env.JWT_EXPIRES_IN || '24h' }` ✓
- auth.js:74: `{ expiresIn: process.env.JWT_EXPIRES_IN || '24h' }` ✓
- .env / .env.example 已添加 `JWT_EXPIRES_IN=24h`

### Task 10: JWT Payload 字段名统一为 user_id — **经过**
- auth.js:28: `req.user = { user_id: decoded.id, ... }` ✓
- optionalAuth.js:14: `req.user = { user_id: decoded.id, ... }` ✓
- `rg "req\.user\.id\b" server/routes/` 无任何匹配
- 所有路由文件 `req.user.id` → `req.user.user_id` 全部替换
  - articles.js: 全部替换 (行 33, 62, 77, 136, 163, 174, 176, 182, 184)
  - assistant.js: 全部替换 (行 24, 39, 43, 68)
  - chat.js: 全部替换 (行 31, 47)
  - plan.js: 全部替换
  - punch.js: 全部替换
  - risk.js: 全部替换
  - upload.js: 全部替换 (行 24)
  - user.js: 全部替换 (行 11, 38, 56, 61, 82, 102)
  - admin.js: 全部替换 (行 47, 129)

### Task 11: 环境变量名对齐检查（验证任务） — **经过**
- 验证通过：DB_PATH、DIFY_API_BASE 等代码与 .env 变量名完全自洽，无需修改代码

### Task 12: database.js 移除模块顶层副作用 — **经过**
- database.js 不再有模块顶层的 `initDatabase()` 调用
- server.js:8 显式调用 `initDatabase()` 保持不变

### Task 13: difyService.js Mock 模式检测改进 — **经过**
- `callWorkflowBlocking` 增加第三个参数 `workflowType` (行 84)
- Mock 分支按类型返回：`'risk'` → MOCK_RISK_DATA, `'plan'` → MOCK_PLAN_DATA, `'article'` → 空 text (行 89-91)
- plan.js 传入 `'plan'` (行 34)
- risk.js 传入 `'risk'` (行 56)
- articles.js 传入 `'article'` (行 102)

### Task 14: validators.js 移除未使用的导入 — **经过**
- `const { error } = require('./response')` 已删除
- 文件直接从 `function validateUsername` 开始

### Task 15: planParser.js 放宽 JSON 正则顺序依赖 — **经过**
- `objPattern = /\{[^}]*\}/g` 匹配 JSON 对象边界 (行 63)
- `extractField` 逐字段独立正则提取 (行 67-71, 87-90)
- `labelPattern` 中文标签正则已删除

### Task 16: 对话历史会话列表实现 — **经过**
- `callDifyGetConversations` 在 difyService.js 实现 (行 134-166)
- chat.js conversations 端点调用真实 API (行 40-53)，先解密 chat_token
- assistant.js conversations 端点调用真实 API (行 64-74)
- Mock 模式返回空数组降级处理

### Task 17: admin.js SQL 关键字检查 — 统一白名单模式 — **经过**
- 已移除 `.toUpperCase()` 预处理
- 单一正则白名单 `/^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i` (行 81)
- 无 `forbidden` 数组或黑名单循环
- 多语句检测保留 (行 85-89)

### Task 18: articles.js 统一日期格式 — **经过**
- articles.js:133 使用 `datetime('now', 'localtime')` (空格分隔格式)
- 与 DDL 默认值一致

### Task 19: upload.js 目录创建移入函数内部 — **经过**
- `ensureUploadDir()` 函数含 try-catch 包裹 (行 10-18)
- 模块顶层无 `fs.mkdirSync` 副作用
- `router.ensureUploadDir = ensureUploadDir` (行 65)
- server.js 启动时显式调用 `uploadRoutes.ensureUploadDir()` (行 9-11)

---

## 一致性检查

| 检查项 | 结果 |
|--------|------|
| `req.user.id` 残余引用 (server/routes/) | 无匹配 |
| 旧 API Key 变量名 (server/) | 无匹配 |
| 中间件 `req.user` 字段名统一为 `user_id` | 已统一 |
| `req.difyAuth.userId` camelCase 保持不变 | 已保持 |
| `.env` 与 `.env.example` 新增变量一致 | AES_SALT, DIFY_SERVICE_API_KEY, DIFY_ADMIN_AGENT_KEY, JWT_EXPIRES_IN 均已添加 |

## 设计符合性

| 检查项 | 结果 |
|--------|------|
| difyAuth.js 中间件符合设计 7.3.2 节 | ✓ |
| admin/execute 双认证 (`optionalAuth + difyAuthMiddleware`) 符合设计 7.3.1 节 | ✓ |
| 12 个工具分发符合设计 7.3.3 节 | ✓ |
| AST 行级权限校验符合设计 7.3.4 节 | ✓ |
| admin/chat SSE 端点符合设计 7.x 节 | ✓ |
| AES-256-GCM 加密符合设计 7.8 节 | ✓ |
| WAL 模式 + busy_timeout 符合设计 6.4 节 | ✓ |
| JWT 24h 有效期符合设计规范 | ✓ |

---

## 总结

- **任务总数**：19 个
- **经过**：19 个
- **有问题**：0 个
- **语法错误**：0 个文件
- **严重问题**：0
- **一般/轻微问题**：0

APPROVED
