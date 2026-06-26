# 批次 8 任务清单 v2

> 基于诊断报告 `a_v7_diag_v1.md` 及审查意见 `plan_review_v1_r1.md` 修订。
> 共 19 个问题（10 严重 + 9 一般）对应 20 个任务（S8 拆分为加密+解密）。
> 严重问题排前，一般问题排后。有依赖关系的任务按序排列。

---

## Task 1: 修复 plan.js/risk.js Dify API Key 环境变量命名不匹配
**文件**：`server/routes/plan.js`, `server/routes/risk.js`
**严重程度**：严重
**描述**：plan.js 使用 `DIFY_PLAN_WORKFLOW_API_KEY`，risk.js 使用 `DIFY_RISK_WORKFLOW_API_KEY`，但 `.env` 中定义为 `DIFY_PLAN_WORKFLOW_KEY`/`DIFY_RISK_WORKFLOW_KEY`，导致 `process.env` 返回 `undefined`，方案生成和风险预测功能在非 Mock 模式下完全不可用。

### 实现步骤
- [ ] 将 `plan.js:48,57,171,181` 中 `process.env.DIFY_PLAN_WORKFLOW_API_KEY` 改为 `process.env.DIFY_PLAN_WORKFLOW_KEY`
- [ ] 将 `risk.js:54,72` 中 `process.env.DIFY_RISK_WORKFLOW_API_KEY` 改为 `process.env.DIFY_RISK_WORKFLOW_KEY`
- [ ] 确认 `.env` 和 `.env.example` 中 `DIFY_PLAN_WORKFLOW_KEY`/`DIFY_RISK_WORKFLOW_KEY` 变量名不变

### 验证
- [ ] 启动服务器后 `POST /api/plan/generate` 和 `POST /api/risk/predict` 的 Dify 调用返回 401（需有效 Key）而非行为静默失败
- [ ] `rg "DIFY_PLAN_WORKFLOW_API_KEY|DIFY_RISK_WORKFLOW_API_KEY" server/` 无任何匹配

### 依赖
- 无（必须先于 Task 3 执行，否则 Task 3 修复后 Dify 调用仍会失败）

---

## Task 2: database.js 添加 WAL 模式和 busy_timeout pragma
**文件**：`server/db/database.js`
**严重程度**：严重
**描述**：`database.js:17-18` 仅设置 `foreign_keys = ON`，缺少 `journal_mode = WAL` 和 `busy_timeout = 5000`。SQLite 默认 journal_mode 为 DELETE，并发写入时概率触发 "database is locked" 错误，影响所有端点的并发稳定性。

### 实现步骤
- [ ] 在 `database.js:18`（`db.pragma('foreign_keys = ON')`）之后按设计文档 6.4 节 `getDatabase()` 工厂函数的 pragma 配置顺序添加：
  ```js
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  ```

### 验证
- [ ] 启动服务器后无错误
- [ ] SQLite 数据库文件目录中出现 `-wal` 和 `-shm` 辅助文件（WAL 模式标志）
- [ ] 并发 SSE 流写入 + 前端 CRUD 操作时不再出现 "database is locked"

### 依赖
- 无

---

## Task 3: plan.js 事务顺序修正（含 plan_id 生成与 checkIdempotent 同步调整）
**文件**：`server/routes/plan.js`
**严重程度**：严重
**描述**：`POST /api/plan/generate`（第32-45行）在事务内先 deactivate 旧方案 + 生成新 plan_id 并提交，再调用 Dify（第47行）。Dify 失败时用户旧方案已丢失且新方案未生成。`PUT /api/plan/adjust`（第146-149行）相同模式。问题19（API Key 不匹配）修复后此缺陷将完整暴露。

### 实现步骤
- [ ] **POST /generate**：将事务内的 deactivate 操作和 plan_id 生成逻辑**一并后移**至 Dify 调用成功后：
  - 先调用 `callWorkflowBlocking` 获取 Dify 响应
  - 解析 Dify 输出成功后，在事务内：deactivate 旧方案 → 生成新 plan_id → 写入新方案项
  - Dify 调用失败时事务不执行，旧方案保持 `is_active=1`，plan_id 不增加
- [ ] **checkIdempotent() 位置调整**：将 `checkIdempotent()` 调用从入口处（第25行）**后移**至 Dify 调用成功后、事务前。逻辑变更：
  - Dify 调用失败 → 不注册冷却锁 → 用户可立即重试（无 30s 限制）
  - Dify 调用成功 → 事务前注册冷却锁 → 防止成功后的快速重复提交
  - 此调整消除原方案"Dify 失败 + 禁止重试"的双重障碍
- [ ] **PUT /adjust**：将第146-149行的 deactivate 语句和 plan_id 生成（第165-168行）后移至 Dify 调用成功后执行。事务流程：Dify 成功 → 事务内（deactivate 旧 plan_id → 生成新 plan_id → 写入新方案项）

### 验证
- [ ] 模拟 Dify 调用失败（如设置无效 API Key 或网络不通），检查旧方案 `is_active` 仍为 1，plan_id 不变；失败后立即重试不返回 409
- [ ] Dify 调用成功后，旧方案 `is_active=0`，新方案 `is_active=1`，plan_id 增加
- [ ] 成功生成后 30s 内重复请求返回 409 CONFLICT

### 依赖
- Task 1（API Key 修复后可正确测试 Dify 成功/失败路径）

---

## Task 4: 新建 difyAuth.js 中间件
**文件**：`server/middleware/difyAuth.js`（新建）, `server/routes/admin.js`
**严重程度**：严重
**描述**：设计文档 7.3.2 节要求 `POST /api/admin/execute` 支持双认证：JWT Bearer Token 和 Dify API Key（`req.body.api_key`）。当前仅挂载 `authMiddleware, adminMiddleware`，Dify Agent 回调无法认证。

### 实现步骤
- [ ] 新建 `server/middleware/difyAuth.js`，实现：
  - 检查 `req.body.api_key` 是否存在
  - 若存在，与 `process.env.DIFY_SERVICE_API_KEY` 做常量时间比较
  - 验证通过后设置 `req.difyAuth = { userId: req.body.user_id, mode: 'callback' }`，调用 `next()`
  - 若 `api_key` 不存在，立即调用 `next()`（放行给后续 authMiddleware 处理）
  - 若 API Key 存在但验证失败，返回 403 FORBIDDEN
- [ ] 修改 `admin.js:28`，将中间件链改为 `difyAuthMiddleware, optionalAuth, (req, res) => { ... }`：
  - difyAuth 先检测 api_key 字段，有则验证并放行
  - 无 api_key 时走 optionalAuth → JWT 认证
- [ ] 在 `.env` 和 `.env.example` 中添加 `DIFY_SERVICE_API_KEY=` 变量

### 验证
- [ ] 发送带 `api_key` 字段但不带 Authorization 头的请求 → 认证通过，`req.difyAuth` 包含 userId 和 mode
- [ ] 发送带 Authorization 头（JWT）的请求 → 认证通过，`req.user` 正常
- [ ] 发送无 api_key 无 Authorization 的请求 → 401 AUTH_REQUIRED

### 依赖
- 无（独立模块）

---

## Task 5: admin/execute 实现 tool_name 参数化工具分发（12 个工具完整实现）
**文件**：`server/routes/admin.js`
**严重程度**：严重
**描述**：设计文档 7.3.3 节 `dispatchParameterizedQuery` 函数定义了 12 个参数化工具通过 `tool_name` 字段分发。当前 `admin.js:28-69` 仅处理 `execute_SQL` 兜底路径（携带 `sql` 字段），未实现 `tool_name` 分发。

### 实现步骤
- [ ] 在 `admin.js` 的 execute 路由处理器中添加 `tool_name` 检查分支（在 `sql` 字段检查之前），引入 `dispatchParameterizedQuery` 函数
- [ ] 实现 `dispatchParameterizedQuery(db, toolName, params, operatorId, operatorRole)` 函数，映射 12 个工具：

**diabetes-assistant-agent 专用工具（7 个）**：
- [ ] `query_user_profile`：`SELECT id, username, role, avatar, created_at FROM users WHERE id = ?`。admin 可查指定 `params.user_id`，普通用户仅查 `operatorId`
- [ ] `query_risk_history`：`SELECT ... FROM user_risk_info WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`。admin 可查指定 user_id，普通用户仅查本人。支持 `params.limit`
- [ ] `query_punch_records`：`SELECT ... FROM punch_in WHERE user_id = ? [AND punch_time >= ?] [AND punch_time <= ?] [AND punch_type = ?] ORDER BY punch_time DESC LIMIT ?`。支持可选日期范围和类型筛选。admin 可查指定 user_id
- [ ] `query_life_plans`：`SELECT ... FROM life_plans WHERE user_id = ? AND is_active = 1 ORDER BY plan_type, order_num`。admin 可查指定 user_id
- [ ] `query_health_advice`：`SELECT id, title, tags, content, created_at FROM life_advice WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`。支持 `params.limit`。admin 可查指定 user_id
- [ ] `write_health_advice`：`INSERT INTO life_advice (user_id, title, tags, content) VALUES (?, ?, ?, ?)`。tags 写入前 `JSON.stringify()`。普通用户仅可写入本人数据（targetUserId 必须等于 operatorId），admin 可代理指定 user_id
- [ ] `update_user_profile`：`UPDATE users SET {fields} WHERE id = ?`。允许字段白名单：`username, avatar, password_changed`。普通用户仅可修改本人，admin 可代理指定 user_id

**admin-manager-agent 专用工具（5 个，仅管理员可用）**：
- [ ] `query_table`：`SELECT * FROM {table} [WHERE {where}] [ORDER BY {order_by}] LIMIT ? OFFSET ?`。表名白名单 10 个表。仅 admin
- [ ] `insert_record`：`INSERT INTO {table} ({cols}) VALUES ({placeholders})`。表名白名单（排除 admin_logs）。仅 admin。**重要：若 table='doctor_information' 且字段含 chat_token，写入前须调用 encryptChatToken()（Task 8a）加密**
- [ ] `update_record`：`UPDATE {table} SET {setClause} WHERE {where}`。表名白名单（排除 admin_logs）。仅 admin。**重要：若 table='doctor_information' 且字段含 chat_token，写入前须加密**
- [ ] `delete_record`：`DELETE FROM {table} WHERE {where}`。表名白名单（排除 admin_logs）。需 `params.where`。仅 admin
- [ ] `get_table_schema`：`PRAGMA table_info({table})`。仅 admin

- [ ] 每个工具使用 `db.prepare(sql).all/bind/run(param)` 参数化绑定防止 SQL 注入
- [ ] `tool_name` 不存在且 `sql` 字段存在时回退到 execute_SQL 兜底路径
- [ ] 未知 `tool_name` 返回 400 BAD_REQUEST

### 验证
- [ ] 发送 `{ tool_name: "query_user_profile", user_id: 1, api_key: "..." }` → 返回对应用户信息
- [ ] 普通用户执行 `query_table` → 返回 403（仅管理员可用）
- [ ] 管理员执行 `delete_record` → 成功删除指定记录
- [ ] 发送不含 `tool_name` 但含 `sql` 的请求 → 走 execute_SQL 兜底路径
- [ ] 发送 `{ tool_name: "nonexistent_tool" }` → 返回 400 BAD_REQUEST

### 依赖
- Task 4（需 `req.difyAuth` 上下文中的 `userId`）

---

## Task 6: admin/execute 行级权限校验 — AST 解析方案（node-sql-parser）
**文件**：`server/utils/validateRowLevelPermission.js`（新建）、`server/routes/admin.js`
**严重程度**：严重
**描述**：AI 助手 Text2SQL 场景中，普通用户通过 `POST /api/admin/execute` 执行的 SQL 需行级权限约束。设计文档 7.3.4 节明确要求采用 `node-sql-parser` AST 解析方案（非正则匹配），正则匹配无法可靠处理子查询、别名、JOIN、嵌套条件等复杂形态。当前仅检查 SQL 关键字，未实现任何行级权限约束。

### 实现步骤

#### 1. 安装依赖
- [ ] `npm install node-sql-parser`（纯 JS 实现，支持 SQLite 方言，无需编译）

#### 2. 新建 `server/utils/validateRowLevelPermission.js`
- [ ] 引入 `node-sql-parser`：`const { Parser } = require('node-sql-parser')`，`const parser = new Parser()`

- [ ] 定义四类表的分类常量：
  ```js
  const USER_SCOPED_TABLES = new Set(['user_risk_info', 'life_plans', 'life_advice', 'punch_in', 'article_collections']);
  const PUBLIC_READONLY_TABLES = new Set(['articles', 'doctor_information', 'diabetes_types']);
  const AUDIT_LOG_TABLES = new Set(['admin_logs']);
  const FORBIDDEN_TABLES = new Set(['users']);
  ```

- [ ] 实现主函数 `validateRowLevelPermission(sql, operatorId)`：
  - 调用 `parser.astify(sql, { database: 'sqlite' })` 解析 SQL 为 AST
  - AST 解析失败 → 返回 `false`（fail-closed）
  - 处理多语句情况：`const stmt = Array.isArray(ast) ? ast[0] : ast`
  - 遍历 4 类表校验规则（见下方）
  - 全部通过返回 `true`

- [ ] 实现辅助函数：
  - `extractTableNames(stmt)`：遍历 AST 的 `from`/`join`/`into`/`update` 等节点收集表名（含别名归一化）
  - `containsUserIdConstraint(stmt, operatorId, userTables)`：遍历 AST 的 `where` 节点，检查是否存在 `binary_expr` 形式的 `user_id = operatorId` 条件（left 为 column 节点 `user_id`，operator 为 `=`，right 为数值字面量 `operatorId`）。需正确遍历嵌套 AND/OR 逻辑表达式的 AST 树结构
  - `insertContainsUserId(stmt, operatorId)`：检查 INSERT 的 `columns` 含 `user_id` 且对应 `values` 项为 `operatorId`

- [ ] 实现四类表校验逻辑：
  1. **禁止访问表** (`users`)：若涉及 → 立即返回 `false`
  2. **公共只读表** (`articles`, `doctor_information`, `diabetes_types`)：仅允许 `SELECT`，若为 INSERT/UPDATE/DELETE → 返回 `false`
  3. **审计日志表** (`admin_logs`)：仅允许 `SELECT`；禁止增删改（审计日志由系统内部生成）
  4. **用户私有表** (`user_risk_info`, `life_plans`, `life_advice`, `punch_in`, `article_collections`)：
     - SELECT/UPDATE/DELETE → WHERE 必须包含 `user_id = operatorId`
     - INSERT → VALUES 必须包含 `user_id` 且值为 `operatorId`
  5. **未知表**（不在上述分类中）→ 返回 `false`（fail-closed）

#### 3. 集成到 admin.js
- [ ] 在 `admin.js` 中引入 `validateRowLevelPermission`
- [ ] 在 execute_SQL 兜底路径中，`operatorRole !== 'admin'` 时调用 `validateRowLevelPermission(sql, operatorId)`
- [ ] 校验失败返回 `403 FORBIDDEN`（行级权限拒绝）
- [ ] admin 角色跳过行级校验（调用前判断角色）

### 验证
- [ ] 普通用户执行 `SELECT * FROM users` → 被拒绝（users 表禁止访问）
- [ ] 普通用户执行 `SELECT * FROM user_risk_info` → 被拒绝（无 WHERE user_id 约束）
- [ ] 普通用户执行 `SELECT * FROM user_risk_info WHERE user_id = 5 AND gender = 'male'` → 通过（含 user_id=5 约束，且 operatorId=5）
- [ ] 普通用户执行 `SELECT * FROM articles` → 通过（公共只读表允许 SELECT）
- [ ] 普通用户执行 `DELETE FROM articles WHERE id = 1` → 被拒绝（公共只读表禁止写）
- [ ] 普通用户执行含 JOIN 的查询（如 `SELECT * FROM life_plans lp JOIN user_risk_info r ON lp.user_id = r.user_id WHERE lp.user_id = 5`）→ 正确校验
- [ ] 管理员执行 `SELECT * FROM users` → 通过（admin 跳过行级校验）
- [ ] 管理员执行 `SELECT * FROM admin_logs` → 通过
- [ ] 语法错误的 SQL → 被拒绝（fail-closed）

### 依赖
- Task 4（需 `req.difyAuth.userId` 或 `req.user.user_id` 作为 `operatorId`）

---

## Task 7: 新增 POST /api/admin/chat 端点
**文件**：`server/routes/admin.js`
**严重程度**：严重
**描述**：设计文档定义 `POST /api/admin/chat` 为管理员自然语言对话 SSE 流端点。当前 `admin.js` 完全缺失此路由。

### 实现步骤
- [ ] 在 `admin.js` 中添加 `router.post('/chat', authMiddleware, adminMiddleware, ...)` 路由
- [ ] 使用 `proxyDifySSE` 代理转发至 Dify admin-manager-agent
- [ ] 使用 `process.env.DIFY_ADMIN_AGENT_KEY` 作为 API Key
- [ ] 参照 `assistant.js:9-30` 的实现模式
- [ ] 在 `.env` 和 `.env.example` 中添加 `DIFY_ADMIN_AGENT_KEY=` 变量

### 验证
- [ ] 管理员通过 `POST /api/admin/chat` 发送消息 → 接收 SSE 流式响应
- [ ] 普通用户访问 → 403 权限不足
- [ ] 未登录访问 → 401

### 依赖
- 无（独立 SSE 代理端点，代码层面不依赖 Task 4-6）

---

## Task 8a: chat_token AES-256-GCM 加密端实现
**文件**：`server/utils/encryption.js`（新建）、`server/routes/admin.js`
**严重程度**：严重
**描述**：设计文档 7.8 节要求 `doctor_information.chat_token` 以 AES-256-GCM 加密存储。Task 8b（解密端）依赖加密端提供的密文格式。当前 chat_token 以明文存储，加密和解密两端均未实现。

### 实现步骤
- [ ] 新建 `server/utils/encryption.js`，实现：
  - `deriveKey(salt)`：使用 `crypto.scryptSync(process.env.JWT_SECRET, salt, 32)` 从 JWT_SECRET 派生 256-bit 密钥
  - `getSalt()`：从 `process.env.AES_SALT` 读取 salt，不存在时用 `crypto.randomBytes(16)` 生成并提示运维写入 `.env`（输出 `console.warn` 含生成的 salt hex 值）
  - `encryptChatToken(plainToken)`：
    - 生成随机 IV（`crypto.randomBytes(16)`）
    - `const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(getSalt()), iv)`
    - `cipher.setAAD(Buffer.from('chat_token', 'utf-8'))`（附加认证数据防篡改）
    - 加密：`encrypted = Buffer.concat([cipher.update(plainToken, 'utf-8'), cipher.final()])`
    - `authTag = cipher.getAuthTag()`
    - 返回 `iv.toString('base64') + ':' + authTag.toString('base64') + ':' + encrypted.toString('base64')`
  - 导出 `{ encryptChatToken, deriveKey, getSalt }`

- [ ] 在 `admin.js` 的 `dispatchParameterizedQuery` 函数中，对 `insert_record` 和 `update_record` 工具操作 `doctor_information` 表时：
  - 检测 `params.table === 'doctor_information'` 且 `params.fields.chat_token` 存在
  - 对 `params.fields.chat_token` 值调用 `encryptChatToken()` 加密后再写入数据库

- [ ] 在 `.env` 和 `.env.example` 中添加 `AES_SALT=` 变量（首次启动时自动提示生成值）

### 验证
- [ ] 加密输出格式为 `base64:base64:base64`（三个 base64 片段用冒号分隔）
- [ ] 相同明文每次加密输出不同（随机 IV 保证）
- [ ] 加密后的 chat_token 通过 admin/execute insert_record 写入 doctor_information 表后，数据库存储为密文
- [ ] 解密端（Task 8b）可正确还原明文
- [ ] `AES_SALT` 未设置时输出 warn 提示含生成的 salt 值

### 依赖
- 无（独立模块，使用 Node.js 内置 `crypto` 模块）

---

## Task 8b: chat_token 解密 + chat.js 集成
**文件**：`server/routes/chat.js`
**严重程度**：严重
**描述**：`chat.js:24` 直接传递 `row.chat_token` 明文给 Dify。数据库中以 AES-256-GCM 加密存储后，Express 读取后须解密。

### 实现步骤
- [ ] 在 `server/utils/encryption.js` 中补充 `decryptChatToken(encryptedToken)` 函数：
  - 按 `:` 分割密文为 `[iv_b64, authTag_b64, ciphertext_b64]`，各做 base64 解码
  - `const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(getSalt()), iv)`
  - `decipher.setAAD(Buffer.from('chat_token', 'utf-8'))`
  - `decipher.setAuthTag(Buffer.from(authTag_b64, 'base64'))`
  - 解密：`decipher.update(Buffer.from(ciphertext_b64, 'base64'), undefined, 'utf-8') + decipher.final('utf-8')`
  - 返回明文 token

- [ ] 在 `chat.js` 中引入 `{ decryptChatToken }`，在 `proxyDifySSE` 调用前：
  - 从数据库读取 `row.chat_token`
  - 调用 `decryptChatToken(row.chat_token)` 获取明文
  - 将明文传入 Dify API 调用

### 验证
- [ ] 数据库中存储加密后的 chat_token 密文
- [ ] Express 读取后解密为正确明文
- [ ] Dify API 调用正常（解密后的 token 格式为 `app-XXX`）

### 依赖
- Task 8a（加密函数和密文格式已定义）

---

## Task 9: auth.js JWT 有效期对齐设计规范（24h）
**文件**：`server/routes/auth.js`, `.env`, `.env.example`
**严重程度**：一般
**描述**：`auth.js:35,74` 硬编码 `expiresIn: '7d'`，设计文档定义 `JWT_EXPIRES_IN=24h`。Token 泄露后安全风险窗口从 24h 扩展到 7d。

### 实现步骤
- [ ] 将 `auth.js:35` 和 `auth.js:74` 中 `{ expiresIn: '7d' }` 改为 `{ expiresIn: process.env.JWT_EXPIRES_IN || '24h' }`
- [ ] 在 `.env` 和 `.env.example` 中添加 `JWT_EXPIRES_IN=24h`

### 验证
- [ ] 注册/登录后检查 JWT 解码结果中的 `exp` 字段，确认过期时间为签发后 24h
- [ ] 不设置 `JWT_EXPIRES_IN` 环境变量时默认使用 `24h`

### 依赖
- 无

---

## Task 10: JWT Payload 字段名统一为 user_id（含动态引用数说明）
**文件**：`server/middleware/auth.js`, `server/middleware/optionalAuth.js`, `server/routes/admin.js`, `server/routes/articles.js`, `server/routes/assistant.js`, `server/routes/chat.js`, `server/routes/plan.js`, `server/routes/punch.js`, `server/routes/risk.js`, `server/routes/upload.js`, `server/routes/user.js`
**严重程度**：一般
**描述**：`auth.js:28` 设置 `req.user = { id, username, role }`，设计文档约定 `req.user = { user_id, role }`。当前代码库有 43 处 `req.user.id` 引用需改为 `req.user.user_id`。**注意：此计数基于当前代码，随着 P2 任务（Task 4-7）在 admin.js/chat.js 等文件中新增代码，引用数会增长。验证时必须以 `rg "req\.user\.id\b" server/` 搜索结果为准。**

### 实现步骤
- [ ] 修改 `server/middleware/auth.js:28`：
  ```js
  req.user = { user_id: decoded.id, username: decoded.username, role: decoded.role };
  ```
- [ ] 修改 `server/middleware/optionalAuth.js:14`：
  ```js
  req.user = { user_id: decoded.id, username: decoded.username, role: decoded.role };
  ```
- [ ] 批量替换以下文件中的 `req.user.id` → `req.user.user_id`：
  - `server/routes/admin.js`（1处当前 + 将随 P2 任务增长）
  - `server/routes/articles.js`（11处）
  - `server/routes/assistant.js`（3处）
  - `server/routes/chat.js`（1处 + 将随 P2 任务增长）
  - `server/routes/plan.js`（11处）
  - `server/routes/punch.js`（6处）
  - `server/routes/risk.js`（3处）
  - `server/routes/upload.js`（1处）
  - `server/routes/user.js`（6处）
- [ ] 确认 `admin.js:8` 中 `req.user.role` 保持不变（role 字段名不变）

### 命名风格说明
`difyAuth` 中间件设置 `req.difyAuth = { userId: ..., mode: ... }`（camelCase），此为独立认证上下文字段（非 req.user 的子属性），与 `req.user = { user_id, role }`（snake_case）分属不同语义空间，保持各自风格不变。`userId` 为 difyAuth 中间件的上下文键名，`user_id` 为路由处理器统一使用的用户标识字段名。

### 验证
- [ ] 全局搜索 `req\.user\.id\b` 在 `server/routes/` 下无任何匹配
- [ ] 所有认证端点正常返回数据（无 undefined SQL 参数绑定）
- [ ] Task 4-7 新增代码中的引用也已替换

### 依赖
- 需在所有其他任务完成后最后执行（波及面广，避免与其他任务冲突）

---

## Task 11: 环境变量名对齐检查（验证任务，无需修改代码）
**文件**：无需修改代码
**严重程度**：一般（验证确认）
**描述**：设计文档使用 `SQLITE_PATH` 和 `DIFY_API_BASE_URL`，代码和 `.env` 使用 `DB_PATH` 和 `DIFY_API_BASE`。经确认：`database.js` 使用 `DB_PATH`，`.env` 定义为 `DB_PATH`；`difyService.js`/`sseProxy.js` 使用 `DIFY_API_BASE`，`.env` 定义为 `DIFY_API_BASE`。代码与配置**完全自洽**，无运行时故障。此项为验证确认任务，无需修改任何代码。

### 实现步骤
- [ ] 确认 `database.js` 读取 `process.env.DB_PATH`，`.env` 定义为 `DB_PATH` → 匹配 ✓
- [ ] 确认 `difyService.js` 读取 `process.env.DIFY_API_BASE`，`.env` 定义为 `DIFY_API_BASE` → 匹配 ✓
- [ ] 确认 `sseProxy.js` 读取 `process.env.DIFY_API_BASE`，`.env` 定义为 `DIFY_API_BASE` → 匹配 ✓
- [ ] 在设计文档中标注命名差异（可选，非本任务代码范围）

### 验证
- [ ] 代码 `process.env.XXX` 中的变量名与 `.env` 完全匹配
- [ ] 服务器正常启动，Dify API 调用正常（非 Mock 模式）

### 依赖
- 无

---

## Task 12: database.js 移除模块顶层副作用
**文件**：`server/db/database.js`, `server.js`
**严重程度**：一般
**描述**：`database.js:33` 的 `initDatabase()` 在模块加载时自动执行。设计文档 6.3.1 节要求由 `server.js` 显式调用。当前 `server.js:7` 已有显式调用，模块顶层调用是冗余的副作用。

### 实现步骤
- [ ] 删除 `database.js:33` 的 `initDatabase()` 调用
- [ ] 确认 `server.js:7` 的 `initDatabase()` 显式调用保持不变

### 验证
- [ ] 启动服务器，数据库正常初始化
- [ ] `require('./db/database')` 不再触发文件 I/O（纯导入无副作用）

### 依赖
- 无

---

## Task 13: difyService.js Mock 模式检测改进
**文件**：`server/services/difyService.js`, `server/routes/plan.js`, `server/routes/risk.js`, `server/routes/articles.js`
**严重程度**：一般
**描述**：`difyService.js:88-93` 通过 `inputs` 中是否含 `family_history`/`diabetes_history` 来推断请求类型（风险预测 vs 方案生成）。启发式推断脆弱，扩展性差。

### 实现步骤
- [ ] 为 `callWorkflowBlocking(apiKey, inputs)` 增加第三个参数 `workflowType`（如 `'risk'`、`'plan'`、`'article'`）
- [ ] 修改 Mock 分支逻辑：根据 `workflowType` 返回对应 Mock 数据，而非基于 inputs 推测
- [ ] 修改所有调用方传入对应的 `workflowType`：
  - `plan.js` 传 `'plan'`
  - `risk.js` 传 `'risk'`
  - `articles.js` 传 `'article'`（当前 articles 自行处理 Mock，需统一）

### 验证
- [ ] Mock 模式下（`DIFY_API_BASE` 为空），各端点返回正确的 Mock 数据
- [ ] 新增第三个工作流时不会误判
- [ ] 非 Mock 模式调用不受影响

### 依赖
- 无

---

## Task 14: validators.js 移除未使用的导入
**文件**：`server/utils/validators.js`
**严重程度**：一般
**描述**：第 1 行 `const { error } = require('./response')` 从未使用，引入不必要的模块依赖。

### 实现步骤
- [ ] 删除 `validators.js:1` 整行

### 验证
- [ ] 服务器正常启动，所有验证器功能正常（注册、登录、风险预测等验证仍可用）

### 依赖
- 无

---

## Task 15: planParser.js 放宽 JSON 正则顺序依赖
**文件**：`server/utils/planParser.js`
**严重程度**：一般
**描述**：`planParser.js:63` 的 `jsonPattern` 正则硬编码字段顺序 `plan_type → order_num → time_desc → title → content`。Dify 输出字段顺序变化时正则失败，触发 LLM 二次调用增加延迟和 Token 消耗。

### 实现步骤
- [ ] 将单一 `jsonPattern` 正则替换为逐字段独立正则提取：
  - 用 `/\{[^}]*\}/g` 匹配每个 JSON 对象边界
  - 对每个匹配到的对象，分别用独立正则提取各字段：
    - `/"plan_type"\s*:\s*"(diet|exercise|other)"/`
    - `/"order_num"\s*:\s*(\d+)/`
    - `/"time_desc"\s*:\s*"([^"]*)"/`
    - `/"title"\s*:\s*"([^"]*)"/`
    - `/"content"\s*:\s*"([^"]*)"/`
  - 所有字段都提取到的对象才加入 items 数组
- [ ] 删除旧的 `labelPattern` 中文标签正则（已有 JSON 优先解析 + 字段独立正则，中文格式极少出现）

### 验证
- [ ] 字段顺序与预期一致的 JSON → 成功解析
- [ ] 字段顺序随机的 JSON（如 `{"content":"xxx","title":"yyy","plan_type":"diet",...}`）→ 成功解析
- [ ] 字段缺失的 JSON 对象 → 跳过该对象
- [ ] 完全无法解析的文本 → 进入 LLM 二次调用降级

### 依赖
- 无

---

## Task 16: 对话历史会话列表实现
**文件**：`server/routes/chat.js`, `server/routes/assistant.js`, `server/services/difyService.js`
**严重程度**：一般
**描述**：`chat.js:36-38` 和 `assistant.js:63-64` 硬编码返回 `data: []`。设计文档要求调用 Dify Conversations API 代理查询历史会话列表。

### 实现步骤
- [ ] 在 `difyService.js` 中新增 `callDifyGetConversations(apiKey, userId)` 函数：
  - 调用 `GET {DIFY_API_BASE}/conversations?user=user-{userId}`
  - 返回会话列表，映射为 `{ conversation_id, name, created_at }` 结构
- [ ] 修改 `chat.js:36-38`：调用 `callDifyGetConversations(decryptedToken, req.user.user_id)`（注意需先用 Task 8b 的 `decryptChatToken` 解密 chat_token）
- [ ] 修改 `assistant.js:63-64`：调用 `callDifyGetConversations(process.env.DIFY_ASSISTANT_APP_KEY, req.user.user_id)`

### 验证
- [ ] `GET /api/chat/doctor/:id/conversations` 返回非空会话列表（需 Dify 已配置）
- [ ] `GET /api/assistant/conversations` 返回非空会话列表
- [ ] Dify 未配置时返回空数组（降级处理，不报错）

### 依赖
- Task 8b（chat_token 解密函数必须先于 chat.js conversations 端点实现）

---

## Task 17: admin.js SQL 关键字检查改进 — 改为统一白名单模式
**文件**：`server/routes/admin.js`
**严重程度**：一般
**描述**：`admin.js:33` 先做 `.toUpperCase()` 预处理再用大小写不敏感正则检查。去掉 `.toUpperCase()` 预处理可避免合法列名（如 `insert_count`、`update_time`）被误判。同时按设计文档 7.3.3 节 v15 修订将混合模式（SELECT 白名单 + 关键字黑名单循环）统一为单一正则白名单。

### 实现步骤
- [ ] 删除 `admin.js:33` 中的 `.toUpperCase()` 调用：
  - `const trimmed = req.body.sql.trim();`（移除 `.toUpperCase()`）
- [ ] 将 `admin.js:34` 的 `startsWith('SELECT')` 检查 + `admin.js:38-46` 的禁止关键字循环替换为单一正则白名单：
  ```js
  if (!/^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i.test(trimmed)) {
    return error(res, 'FORBIDDEN', '仅允许 SELECT/INSERT/UPDATE/DELETE 操作，禁止 DDL/DCL/TCL 及其他语句类型', 403);
  }
  ```
- [ ] 保留多语句检测逻辑（分号判断）
- [ ] 删除原有的 `forbidden` 数组和循环（不再需要黑名单）

### 验证
- [ ] `SELECT * FROM stats WHERE insert_count > 0` → 不被误判（通过）
- [ ] `DROP TABLE users` → 被拒绝（403）
- [ ] `select * from users`（小写）→ 通过（正则大小写不敏感）
- [ ] `INSERT INTO admin_logs ...` → 通过白名单，但后续 `insertAdminLog` 防篡改逻辑（见 execute_SQL 兜底路径中的 admin_logs 拦截）仍应拒绝
- [ ] 多语句 `SELECT 1; DROP TABLE users` → 被多语句检测拒绝

### 依赖
- 无

---

## Task 18: articles.js 统一日期格式
**文件**：`server/routes/articles.js`（可能需要 `server/db/init.sql`）
**严重程度**：一般
**描述**：`articles.js:133` 使用 `strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')` 生成 ISO8601 T分隔符格式，其他表 DDL 使用 `datetime('now', 'localtime')` 空格分隔格式。同一数据库内不同表日期格式不一致。

### 实现步骤
- [ ] **预检查**：检查 `server/utils/` 下是否存在日期格式化工具函数。当前仅有 `dateRange.js`（处理日期范围查询），无通用 `nowStr()` 或 `nowISO()` 函数。若检查发现已存在则复用。

- [ ] **方案 A（推荐）**：将 `articles.js:133` 改为与 DDL 默认值一致的格式：
  ```sql
  strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')
  ```
  或改用 `datetime('now', 'localtime')` 函数（等价于空格分隔格式）

- [ ] **方案 B**（若全库统一为 ISO8601）：修改 `init.sql` 中所有 DDL 的 `datetime('now', 'localtime')` 为 `strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')`，同步修改所有路由中手动写入 `created_at` 的位置

- [ ] **可选**：创建共用工具函数 `nowStr()` 或 `nowISO()` 供所有路由使用（在 `server/utils/` 下新建）

### 验证
- [ ] 生成文章后检查数据库中 `articles.created_at` 格式与其他表一致
- [ ] 前端日期解析正常

### 依赖
- 无

---

## Task 19: upload.js 目录创建移入函数内部
**文件**：`server/routes/upload.js`
**严重程度**：一般
**描述**：`upload.js:9` 在模块顶层执行 `fs.mkdirSync(uploadDir, { recursive: true })`。目录创建失败（权限不足）会导致整个模块加载异常，服务器无法启动。

### 实现步骤
- [ ] 方案 A：将 `fs.mkdirSync` 用 try-catch 包裹，失败时仅输出警告日志不抛出异常
- [ ] 方案 B：将目录创建逻辑移入 `ensureUploadDir()` 工具函数，在 `server.js` 启动流程中显式调用
- [ ] 在路由首次被访问时（上传请求到来前）确保目录存在

### 验证
- [ ] 上传目录不存在且无写权限时，模块正常加载，`require('./routes/upload')` 不抛出异常
- [ ] 目录可写时，文件上传功能正常
- [ ] 目录不可写时，上传请求返回友好的错误提示

### 依赖
- 无

---

## 附录

### 快速参考：文件修改矩阵

| 文件 | 涉及任务 | 操作类型 |
|------|---------|---------|
| `server/db/database.js` | Task 2, Task 12 | 添加 pragma + 删除自动调用 |
| `server/middleware/auth.js` | Task 10 | 字段名 id → user_id |
| `server/middleware/optionalAuth.js` | Task 10 | 字段名 id → user_id |
| `server/middleware/difyAuth.js` | Task 4 | **新建** |
| `server/utils/encryption.js` | Task 8a, Task 8b | **新建** |
| `server/utils/validateRowLevelPermission.js` | Task 6 | **新建** |
| `server/routes/admin.js` | Task 4, Task 5, Task 6, Task 7, Task 8a, Task 10, Task 17 | 挂载中间件 + 新增路由 + 12 工具分发 + AST 权限校验 + chat_token 加密 + 字段替换 + 统一白名单 |
| `server/routes/auth.js` | Task 9 | expiresIn 硬编码 → 环境变量 |
| `server/routes/plan.js` | Task 1, Task 3, Task 10, Task 13 | 命名修正 + 事务重构 + 字段替换 + 参数追加 |
| `server/routes/risk.js` | Task 1, Task 10, Task 13 | 命名修正 + 字段替换 + 参数追加 |
| `server/routes/chat.js` | Task 8b, Task 10, Task 16 | 解密 + 字段替换 + 会话列表 |
| `server/routes/assistant.js` | Task 10, Task 16 | 字段替换 + 会话列表 |
| `server/routes/articles.js` | Task 10, Task 13, Task 18 | 字段替换 + 参数追加 + 日期格式 |
| `server/routes/upload.js` | Task 10, Task 19 | 字段替换 + mkdirSync 重构 |
| `server/routes/user.js` | Task 10 | 字段替换 |
| `server/routes/punch.js` | Task 10 | 字段替换 |
| `server/services/difyService.js` | Task 13, Task 16 | MockType 参数 + Conversations API |
| `server/services/sseProxy.js` | Task 11 | 无需修改（已验证一致性） |
| `server/utils/validators.js` | Task 14 | 删除未使用导入 |
| `server/utils/planParser.js` | Task 15 | 正则改为逐字段提取 |
| `.env` / `.env.example` | Task 4, Task 7, Task 8a, Task 9 | 新增 DIFY_SERVICE_API_KEY, DIFY_ADMIN_AGENT_KEY, AES_SALT, JWT_EXPIRES_IN |

### 已验证无需修复
- **G10（路由挂载检查）**：`routes/index.js:18-19` 已正确挂载 `admin` 和 `upload` 路由，无需修复。
- **S2（环境变量名对齐）**：Task 11 已验证代码与 `.env` 完全自洽，无需修改代码。
