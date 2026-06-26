# 批次 8 修复实现计划

## 1. 现状分析

### 1.1 基础设施层

| 文件 | 当前状态 | 与设计文档差异 |
|------|---------|--------------|
| `server/db/database.js` | 仅设置 `foreign_keys = ON` pragma；`initDatabase()` 在模块顶层自动执行（第33行）；使用 `DB_PATH` 环境变量 | 缺少 `journal_mode = WAL` 和 `busy_timeout = 5000` pragma（设计文档6.4节）；顶层副作用违背工厂模式；设计文档使用 `SQLITE_PATH` |
| `server/middleware/auth.js` | JWT 验证后设置 `req.user = { id, username, role }`；无独立 `difyAuth.js` 文件 | 设计文档约定 `req.user = { user_id, role }`；无 `difyAuth.js` |
| `server/middleware/optionalAuth.js` | 同 auth.js 使用 `{ id, username, role }` 字段名 | 需与 auth.js 同步修改 |
| `server/services/difyService.js` | `DIFY_API_BASE` 环境变量名；Mock 检测基于 `inputs` 字段启发式推断 | 设计文档使用 `DIFY_API_BASE_URL`；Mock 检测脆弱 |
| `server/services/sseProxy.js` | `DIFY_API_BASE` 环境变量名 | 设计文档使用 `DIFY_API_BASE_URL` |
| `server/utils/validators.js` | 第1行 `const { error } = require('./response')` 从未使用 | — |
| `server/utils/planParser.js` | 正则 `jsonPattern` 硬编码字段顺序 | 逐字段独立提取更健壮 |
| `server/utils/` | 无 `validateRowLevelPermission.js`，无 `encryption.js` | 设计文档 7.3.4 节要求 AST 解析的行级权限校验；7.8 节要求 AES-256-GCM 加解密 |

### 1.2 路由层

| 文件 | 当前状态 | 与设计文档差异 |
|------|---------|--------------|
| `server/routes/admin.js` | 仅有 `GET /logs` 和 `POST /execute`；execute 仅处理 `sql` 字段，SQL 检查用 `.toUpperCase()` 预处理；仅支持 SELECT | 缺失 `POST /chat`；缺失 `tool_name` 分发（12 个工具）；缺失 `difyAuth` 双认证；缺失行级权限（AST 解析）；SQL 检查应改为统一白名单模式 |
| `server/routes/auth.js` | JWT 签发硬编码 `expiresIn: '7d'`；payload 使用 `id` 字段名 | 应从 `process.env.JWT_EXPIRES_IN` 读取 |
| `server/routes/plan.js` | 事务在 Dify 调用前提交（第32-45行）；`adjust` 同样先 deactivate 后调 Dify（第146-149行）；使用 `DIFY_PLAN_WORKFLOW_API_KEY` | 事务应在 Dify 成功后执行 deactivate；`.env` 中变量名为 `DIFY_PLAN_WORKFLOW_KEY`（不匹配 → 运行时 undefined） |
| `server/routes/risk.js` | 使用 `DIFY_RISK_WORKFLOW_API_KEY` | `.env` 中变量名为 `DIFY_RISK_WORKFLOW_KEY`（不匹配 → 运行时 undefined） |
| `server/routes/chat.js` | 直接传递 `row.chat_token` 明文；会话列表返回 `data: []` | 设计文档 v15 要求 AES-256-GCM 解密；应调用 Dify Conversations API |
| `server/routes/assistant.js` | 会话列表返回 `data: []` | 应调用 Dify Conversations API |
| `server/routes/articles.js` | `strftime` 使用 `%Y-%m-%dT%H:%M:%S`（T分隔符） | 其他表使用 `datetime('now','localtime')`（空格分隔） |
| `server/routes/upload.js` | `fs.mkdirSync()` 在第9行模块顶层执行 | 应移入请求处理函数或 try-catch 包裹 |
| `server/routes/index.js` | `admin` 和 `upload` 路由已挂载（第18-19行） | 已符合要求（G10 无需修复） |

### 1.3 配置文件

| 文件 | 当前状态 | 与设计文档差异 |
|------|---------|--------------|
| `.env` / `.env.example` | `DB_PATH`、`DIFY_API_BASE`、`DIFY_RISK_WORKFLOW_KEY`、`DIFY_PLAN_WORKFLOW_KEY` 等 | 缺少 `JWT_EXPIRES_IN`、`DIFY_SERVICE_API_KEY`、`DIFY_ADMIN_AGENT_KEY`；API Key 变量名与 plan.js/risk.js 代码不匹配 |

### 1.4 环境变量匹配状态总表

| 代码文件 | 代码读取的变量名 | .env 中变量名 | 是否匹配 |
|---------|----------------|-------------|---------|
| `database.js` | `DB_PATH` | `DB_PATH` | 匹配 |
| `difyService.js` | `DIFY_API_BASE` | `DIFY_API_BASE` | 匹配 |
| `sseProxy.js` | `DIFY_API_BASE` | `DIFY_API_BASE` | 匹配 |
| **`plan.js`** | `DIFY_PLAN_WORKFLOW_API_KEY` | `DIFY_PLAN_WORKFLOW_KEY` | **不匹配 → 运行时 undefined** |
| **`risk.js`** | `DIFY_RISK_WORKFLOW_API_KEY` | `DIFY_RISK_WORKFLOW_KEY` | **不匹配 → 运行时 undefined** |
| `articles.js` | `DIFY_ARTICLE_WORKFLOW_KEY` | `DIFY_ARTICLE_WORKFLOW_KEY` | 匹配 |
| `assistant.js` | `DIFY_ASSISTANT_APP_KEY` | `DIFY_ASSISTANT_APP_KEY` | 匹配 |

---

## 2. 依赖关系图

```
P0 运行时缺陷（必须最先修复）
├── 问题19: plan.js/risk.js API Key 命名不匹配 ★
├── S1: database.js WAL + busy_timeout    ★
└── S9: plan.js 事务顺序                  ★
    │
    ├── 问题19 修复使得 plan.js/risk.js 的 Dify 调用恢复正常
    │   但 S9 的事务问题会在此之后暴露（Dify 调用成功但事务已提前提交的风险增大）
    │
P1 配置与约定统一（可并行）
├── S2: 环境变量名对齐检查 ── 验证任务，代码与 .env 已自洽
├── G1: JWT 有效期改为读取环境变量
└── S3: JWT Payload 字段名修改（id→user_id，波及 43+ 处引用，随 P2 任务实现而增长）
    │
    ├── S3 依赖 auth.js 和 optionalAuth.js 先修改
    │   所有路由文件中的 req.user.id 跟随修改
    │   注意：difyAuth 使用 userId (camelCase)，user 对象使用 user_id (snake_case)
    │   两者命名风格不同因所处上下文语义差异，不建议强行统一
    │
P2 架构改进（按依赖序）
├── S5: 新建 difyAuth.js 中间件 ────── 先决条件 ──┐
├── S6: admin/execute tool_name 分发 ── 依赖 S5 ──┤ 可并行
├── S7: admin/execute 行级权限校验 ── 依赖 S5 ──┘ （S7 为 AST 解析，S6 为参数化分发，策略不同可并行）
├── S8a: chat_token AES-256-GCM 加密函数 ── 独立（新建加密工具）
├── S8b: chat_token 解密 + 集成 ── 依赖 S8a
├── S4: admin/chat 端点 ── 独立（简单 SSE 代理）
├── G2: database.js 模块顶层副作用 ── 可结合 S1 一起重构
├── G9: upload.js mkdirSync 移入函数 ── 独立
└── G6: 对话历史会话列表 ── 依赖 S8a（chat.js 的 conversations 端点需先完成解密函数）

P3 代码质量（可随时并行）
├── G3: difyService.js Mock 检测改进
├── G4: validators.js 删除未使用导入
├── G5: planParser.js 正则放宽
├── G7: admin.js SQL 关键字检查改进 → 改为统一白名单模式
└── G8: articles.js 日期格式统一
```

**关键约束：**
- **问题19 必须在 S9 之前修复**：因为问题19修复后 plan.js 的 Dify 调用才真正有效，S9 的事务顺序问题才会暴露
- **S5 必须在 S6 和 S7 之前实现**：tool_name 分发和行级权限校验均依赖 `req.difyAuth` 上下文
- **S8a（加密）必须在 S8b（解密）之前实现**：解密端需依赖加密端的函数实现
- **S8a（加密）必须在 G6（会话列表）之前实现**：chat.js 的 conversations 端点需要解密后的 chat_token
- **S3 修改 auth.js/optionalAuth.js 后**，所有路由文件（9个文件，43+ 处引用）必须批量替换。随着 P2 任务在 admin.js、chat.js 等文件中新增代码，引用数会增长，验证时需以 `rg "req.user\.id\b"` 搜索结果为准

---

## 3. 实现步骤

### 阶段 A：P0 运行时缺陷修复（不可延期）

#### 步骤 A1：修复 Dify API Key 命名不匹配（问题19）
- **影响文件**：`server/routes/plan.js`（4处）、`server/routes/risk.js`（2处）
- **修复方向**：将代码侧变量名改为与 `.env` 一致（`DIFY_PLAN_WORKFLOW_API_KEY` → `DIFY_PLAN_WORKFLOW_KEY`，`DIFY_RISK_WORKFLOW_API_KEY` → `DIFY_RISK_WORKFLOW_KEY`）
- **风险**：低。纯字符串替换，不改变逻辑
- **验证方式**：检查 `process.env` 能否正确读取

#### 步骤 A2：修复 plan.js 事务顺序（S9）
- **影响文件**：`server/routes/plan.js`
- **说明**：
  - **POST /generate**：将事务内的 deactivate 操作和 plan_id 生成 **一并后移** 至 Dify 调用成功后。流程变为：先调 Dify → Dify 成功后 → 事务内（deactivate 旧方案 + 生成新 plan_id + 写入新方案项）。Dify 失败时旧方案保持 `is_active=1`，plan_id 不增加。
  - **PUT /adjust**：同样将 deactivate 语句后移至 Dify 调用成功后执行。
  - **checkIdempotent()**：后移至 Dify 成功后、事务前。这样 Dify 调用失败时用户在 30s 冷却期内仍可立即重试；仅在 Dify 成功后才注册冷却锁，防止成功后的快速重复提交。
- **风险**：中等。需确保异常处理路径不会跳过 deactivate 操作；Dify 成功但事务内 INSERT 失败时旧方案已被 deactivate（需考虑此极端边界）。
- **验证方式**：Dify 失败时旧方案 `is_active=1`，plan_id 不变；Dify 成功时旧方案 `is_active=0`，新方案写入；Dify 失败后立即重试不触发 409。

#### 步骤 A3：添加 WAL + busy_timeout pragma（S1）
- **影响文件**：`server/db/database.js`
- **说明**：在 `new Database(dbPath)` 后添加 2 行 pragma，按设计文档 6.4 节 `getDatabase()` 工厂函数的 pragma 配置顺序
- **风险**：极低。纯增加配置，不影响现有逻辑
- **验证方式**：SQLite 并发写入不再出现 "database is locked"

### 阶段 B：P1 配置与约定统一

#### 步骤 B1：JWT 有效期改为环境变量（G1）
- **影响文件**：`server/routes/auth.js`、`.env`、`.env.example`
- **说明**：`jwt.sign` 的 `expiresIn` 改为 `process.env.JWT_EXPIRES_IN || '24h'`
- **风险**：低
- **验证方式**：修改后 Token 有效期为 24h；不设环境变量时默认 24h

#### 步骤 B2：JWT Payload 字段名统一（S3）
- **影响文件**：`server/middleware/auth.js`、`server/middleware/optionalAuth.js`、以及 9 个路由文件中的 `req.user.id` 引用
- **说明**：auth.js 改为 `req.user = { user_id: decoded.id, username: decoded.username, role: decoded.role }`，所有路由文件中的 `req.user.id` → `req.user.user_id`
- **特别注意**：当前代码库有 43 处 `req.user.id` 引用，但随着 P2 任务（Task 4-7 在 admin.js 中新增代码等）实现，引用数会增长。验证时必须以 `rg "req\.user\.id\b" server/` 搜索结果为准，确保零残留。
- **命名风格说明**：`difyAuth` 中间件设置 `req.difyAuth = { userId: ..., mode: ... }`（camelCase），此为独立认证上下文字段（非 req.user 的子属性），与 `req.user = { user_id, role }`（snake_case）分属不同语义空间，保持各自风格不变。
- **风险**：中高。跨 11 个文件批量替换，遗漏会直接导致 500 错误
- **验证方式**：全局搜索 `req.user.id` 确认无残留；所有认证端点正常返回数据

#### 步骤 B3：环境变量名对齐检查（S2）
- **影响文件**：无需修改代码（验证任务）
- **说明**：确认当前代码与 `.env`/`.env.example` 完全自洽——`database.js` 使用 `DB_PATH`，`.env` 定义为 `DB_PATH`；`difyService.js`/`sseProxy.js` 使用 `DIFY_API_BASE`，`.env` 定义为 `DIFY_API_BASE`。此项为验证确认任务，无需修改任何代码。
- **风险**：低。仅为一致性确认
- **验证方式**：确认代码读取的变量名与 `.env` 完全一致

### 阶段 C：P2 架构改进

#### 步骤 C1：新建 difyAuth.js 中间件（S5）
- **影响文件**：`server/middleware/difyAuth.js`（新建）、`server/routes/admin.js`
- **说明**：实现双认证模式——检查 `req.body.api_key`，若存在则与 `process.env.DIFY_SERVICE_API_KEY` 做常量时间比较，验证通过设置 `req.difyAuth = { userId: req.body.user_id, mode: 'callback' }`；若 `api_key` 不存在则放行给后续 authMiddleware 处理
- **风险**：低
- **验证方式**：发送带 `api_key` 字段的请求验证 Dify Agent 回调认证；带 JWT 的请求验证浏览器直连认证；无认证的请求返回 401

#### 步骤 C2：实现 tool_name 参数化工具分发（S6）
- **影响文件**：`server/routes/admin.js`
- **说明**：实现 `dispatchParameterizedQuery(db, toolName, params, operatorId, operatorRole)` 函数，按设计文档 7.3.3 节完整定义 12 个工具：

  **diabetes-assistant-agent 专用工具（7 个，用户端）**：
  | tool_name | SQL 模板 | 权限约束 |
  |-----------|---------|---------|
  | `query_user_profile` | `SELECT id, username, role, avatar, created_at FROM users WHERE id = ?` | admin 可查指定 user_id，普通用户仅查本人 |
  | `query_risk_history` | `SELECT ... FROM user_risk_info WHERE user_id = ? ORDER BY created_at DESC LIMIT ?` | admin 可查指定 user_id，普通用户仅查本人 |
  | `query_punch_records` | `SELECT ... FROM punch_in WHERE user_id = ? [AND punch_time >= ?] [AND punch_time <= ?] [AND punch_type = ?] ORDER BY punch_time DESC LIMIT ?` | 同上的行级约束 |
  | `query_life_plans` | `SELECT ... FROM life_plans WHERE user_id = ? AND is_active = 1 ORDER BY plan_type, order_num` | 同上的行级约束 |
  | `query_health_advice` | `SELECT id, title, tags, content, created_at FROM life_advice WHERE user_id = ? ORDER BY created_at DESC LIMIT ?` | 同上的行级约束 |
  | `write_health_advice` | `INSERT INTO life_advice (user_id, title, tags, content) VALUES (?, ?, ?, ?)` | 仅限写入本人数据；admin 可代理指定 user_id |
  | `update_user_profile` | `UPDATE users SET {fields} WHERE id = ?` | 仅限修改本人（允许字段：username, avatar, password_changed）；admin 可代理 |

  **admin-manager-agent 专用工具（5 个，管理员端）**：
  | tool_name | SQL 模板 | 权限约束 |
  |-----------|---------|---------|
  | `query_table` | `SELECT * FROM {table} [WHERE {where}] [ORDER BY {order_by}] LIMIT ? OFFSET ?` | 仅 admin；表名白名单校验 |
  | `insert_record` | `INSERT INTO {table} ({cols}) VALUES ({placeholders})` | 仅 admin；表名白名单（禁止 admin_logs）；`doctor_information.chat_token` 写入前须加密 |
  | `update_record` | `UPDATE {table} SET {setClause} WHERE {where}` | 仅 admin；表名白名单（禁止 admin_logs）；`doctor_information.chat_token` 写入前须加密 |
  | `delete_record` | `DELETE FROM {table} WHERE {where}` | 仅 admin；表名白名单（禁止 admin_logs） |
  | `get_table_schema` | `PRAGMA table_info({table})` | 仅 admin |

- **风险**：中等。涉及 12 个工具 SQL 模板定义和角色校验分支
- **验证方式**：发送带不同 `tool_name` 的请求验证分发正确性；管理员工具拒绝对普通用户开放
- **补充说明**：设计文档 3.2 节另提及 `query_article_collections` 工具（查询收藏记录），但 7.3.3 节 `dispatchParameterizedQuery` 伪代码未包含此工具的实现。本任务可选择同步实现或标注为"后续补充"。

#### 步骤 C3：实现行级权限校验 — AST 解析方案（S7）
- **影响文件**：`server/utils/validateRowLevelPermission.js`（新建）、`server/routes/admin.js`
- **说明**：按设计文档 7.3.4 节，采用 `node-sql-parser`（npm 包，支持 SQLite 方言）将 SQL 解析为 AST，遍历 AST 节点提取表名和 WHERE 条件进行结构化校验。

  **四类表校验规则**：
  | 分类 | 表名 | 规则 |
  |------|------|------|
  | 用户私有表 | `user_risk_info`, `life_plans`, `life_advice`, `punch_in`, `article_collections` | SELECT/UPDATE/DELETE 的 WHERE 必须包含 `user_id = operatorId`；INSERT 的 VALUES 必须包含 `user_id = operatorId` |
  | 公共只读表 | `articles`, `doctor_information`, `diabetes_types` | 仅允许 SELECT |
  | 审计日志表 | `admin_logs` | 仅允许 SELECT（禁止增删改） |
  | 禁止访问表 | `users` | 任何操作均拒绝 |
  | 未知表 | 任何未在上述分类中的表 | 拒绝（fail-closed） |

  **关键实现约束**：
  - AST 解析失败一律返回 `false`（fail-closed），不放过语法异常的 SQL
  - `operatorId` 为后端从认证上下文注入的数值，LLM 无法篡改
  - 实现辅助函数：`extractTableNames(stmt)`、`containsUserIdConstraint(stmt, operatorId, userTables)`、`insertContainsUserId(stmt, operatorId)`
  - admin 角色跳过行级校验（调用前判断 `operatorRole !== 'admin'`）

- **npm 依赖**：`node-sql-parser`（纯 JS，无需编译）
- **风险**：中等。需正确实现 AST 遍历逻辑和处理多种 SQL 形态
- **验证方式**：普通用户 SELECT 无 user_id 约束的表被拒绝；含子查询/JOIN/别名的 SQL 正确校验

#### 步骤 C4：新增 admin/chat 端点（S4）
- **影响文件**：`server/routes/admin.js`
- **说明**：添加 `POST /api/admin/chat` 路由，SSE 代理模式调用 Dify admin-manager-agent。参照 `assistant.js` 的 `proxyDifySSE` 模式，使用 `process.env.DIFY_ADMIN_AGENT_KEY` 作为 API Key
- **风险**：低。模式与 assistant/chat 相同
- **验证方式**：管理员通过 SSE 客户端测试流式对话；普通用户访问返回 403

#### 步骤 C5a：实现 chat_token AES-256-GCM 加密函数（S8 加密端）
- **影响文件**：`server/utils/encryption.js`（新建）、`server/routes/admin.js`
- **说明**：按设计文档 7.8 节实现：
  - `encryptChatToken(plainToken)`：从 `JWT_SECRET` 用 `crypto.scryptSync` 派生 256-bit 密钥，生成随机 IV（16字节），使用 `crypto.createCipheriv('aes-256-gcm', key, iv)` 加密，返回 `base64(iv):base64(authTag):base64(ciphertext)` 格式密文
  - 在 admin/execute 的 `insert_record` / `update_record` 工具中，当目标表为 `doctor_information` 且字段包含 `chat_token` 时，对 chat_token 值调用 `encryptChatToken()` 后再写入数据库
- **salt 管理**：salt 从环境变量 `AES_SALT` 读取，不存在时随机生成 16 字节并提示运维写入 `.env`
- **风险**：中等。加密实现需正确，引入 crypto 内置模块无额外依赖
- **验证方式**：加密后的 chat_token 为 `base64:base64:base64` 格式密文；解密端可还原明文

#### 步骤 C5b：实现 chat_token 解密 + 集成（S8 解密端）
- **影响文件**：`server/routes/chat.js`
- **说明**：在 `chat.js` 中从 `encryption.js` 引入 `decryptChatToken` 函数。在 `proxyDifySSE` 调用前将 `row.chat_token` 解密为明文后传入
- **风险**：中等。依赖 C5a 的加密函数和密文格式
- **验证方式**：数据库中加密后的 chat_token 可正确解密；Dify API 调用正常工作

#### 步骤 C6：移除 database.js 模块顶层副作用（G2）
- **影响文件**：`server/db/database.js`、`server.js`
- **说明**：删除 `database.js:33` 的 `initDatabase()` 自动调用，`server.js:7` 已显式调用
- **风险**：低。server.js 已有显式调用
- **验证方式**：确认服务器正常启动

#### 步骤 C7：upload.js 目录创建移入函数（G9）
- **影响文件**：`server/routes/upload.js`
- **说明**：将 `fs.mkdirSync` 用 try-catch 包裹，或在首次上传时创建
- **风险**：低
- **验证方式**：目录缺失时不影响模块加载

#### 步骤 C8：对话历史会话列表实现（G6）
- **影响文件**：`server/routes/chat.js`、`server/routes/assistant.js`、`server/services/difyService.js`
- **说明**：在 `difyService.js` 中新增 `callDifyGetConversations(apiKey, userId)` 函数，代理调用 Dify Conversations API。修改 `chat.js` 和 `assistant.js` 的会话列表端点调用此函数
- **特别注意**：chat.js 的 conversations 端点使用的 `chat_token` 需先经 `decryptChatToken()`（C5b）解密为明文后再传入
- **依赖**：Task C5b（解密函数必须先于 chat.js conversations 端点实现）
- **风险**：低
- **验证方式**：返回非空会话列表

### 阶段 D：P3 代码质量

#### 步骤 D1：删除 validators.js 未使用导入（G4）
- **影响文件**：`server/utils/validators.js`
- **说明**：删除第1行
- **风险**：极低

#### 步骤 D2：改进 Mock 检测（G3）
- **影响文件**：`server/services/difyService.js`
- **说明**：为 `callWorkflowBlocking(apiKey, inputs)` 增加第三个参数 `workflowType`，Mock 分支根据 `workflowType` 返回对应 Mock 数据
- **风险**：低。需同步 3 个调用方
- **验证方式**：Mock 模式下各端点返回正确 Mock 数据

#### 步骤 D3：放宽 planParser 正则（G5）
- **影响文件**：`server/utils/planParser.js`
- **说明**：将单一 `jsonPattern` 正则替换为逐字段独立正则提取
- **风险**：低

#### 步骤 D4：改进 SQL 关键字检查 — 改为统一白名单模式（G7）
- **影响文件**：`server/routes/admin.js`
- **说明**：删除 `.toUpperCase()` 预处理；将 `startsWith('SELECT')` + 黑名单循环的混合模式替换为单一正则白名单 `/^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i`（对齐设计文档 7.3.3 节 v15 修订）。同时保留多语句检测。
- **风险**：极低

#### 步骤 D5：统一日期格式（G8）
- **影响文件**：`server/routes/articles.js`（可能需要 `server/db/init.sql`）
- **说明**：
  - 先检查 `server/utils/` 下是否存在日期格式化工具函数（目前无，仅有 `dateRange.js` 处理日期范围查询）
  - 方案 A（推荐）：将 `articles.js:133` 的 `strftime('%Y-%m-%dT%H:%M:%S', ...)` 改为与其他表 DDL 默认值一致的 `datetime('now','localtime')` 空格分隔格式
  - 方案 B（全库统一 ISO8601）：修改 `init.sql` 所有 DDL 的 `datetime('now','localtime')` 为 `strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')`，同步所有路由中手动写入 `created_at` 的位置
  - 可选创建共用函数 `nowStr()` 供复用
- **风险**：低

---

## 4. 推荐执行顺序

```
第1批  P0 修复（顺序执行）：
       A1 → A2 → A3
       注：A1 必须在 A2 前执行（A1 修复后 plan.js 的 Dify 调用才有效，A2 的事务问题才完整暴露）

第2批  P1 统一（可并行，但建议顺序）：
       B1 → B2 → B3
       注：B2 波及面广，建议最后做；B3 为验证任务可随时执行

第3批  P2 架构（按依赖序）：
       C1 → C2 → C3 → C5a → C5b → C4 → C6 → C8 → C7
       注：C2/C3 可并行（不同安全策略独立实现）；C5a 必须先于 C5b；C8 依赖 C5b；C4 可独立于 C1-C3/C5

第4批  P3 清洁（任意顺序）：
       D1 → D2 → D3 → D4 → D5

G10（路由挂载检查）：已验证 `routes/index.js:18-19` 已正确挂载，跳过。
```

---

## 修订说明

以下逐条说明本修订版如何回应审查意见（plan_review_v1_r1.md）中的各发现：

### [严重] Task 6 (S7) — 行级权限校验方案错误，应采用 AST 解析而非正则匹配
**回应**：已将 Task 6（现步骤 C3）完全重写，明确要求：(1) 引入 `node-sql-parser` npm 依赖；(2) 按设计文档 7.3.4 节实现 AST-based `validateRowLevelPermission` 函数；(3) 按设计文档定义四类表的完整校验规则（用户私有表、公共只读表、审计日志表、禁止访问表），包括每类表的具体表名列表和校验逻辑。plan.md 步骤 C3 和 task_v1.md Task 6 均已更新。

### [严重] Task 5 (S6) — tool_name 映射表严重不完整，仅列出 4 个工具
**回应**：已将 Task 5（现步骤 C2）扩展为完整枚举 12 个 `tool_name`，包括：diabetes-assistant-agent 的 7 个工具（query_user_profile、query_risk_history、query_punch_records、query_life_plans、query_health_advice、write_health_advice、update_user_profile）和 admin-manager-agent 的 5 个工具（query_table、insert_record、update_record、delete_record、get_table_schema），每个工具有明确的 SQL 模板、参数绑定和角色校验逻辑。plan.md 步骤 C2 已新增完整工具映射表；task_v1.md Task 5 已逐工具展开实现步骤。

### [严重] Task 8 (S8) — 缺少加密端实现任务，解密无法独立验证
**回应**：已将 Task 8 拆分为 Task 8a（C5a，加密端）和 Task 8b（C5b，解密端）。C5a 新建 `server/utils/encryption.js` 实现 `encryptChatToken()` 函数，并明确在 admin/execute 的 `insert_record`/`update_record` 工具中（当操作 doctor_information 表的 chat_token 字段时）调用加密函数。plan.md 和 task_v1.md 均已更新，依赖图已反映 S8a→S8b 的依赖关系。

### [严重] Task 3 (S9) — 事务顺序修正步骤不完整，plan_id 生成未同步后移
**回应**：已修正 Task 3（现步骤 A2）：(1) 明确 plan_id 生成逻辑与 deactivate 操作一并后移至 Dify 调用成功后；(2) 明确 checkIdempotent() 后移至 Dify 成功后、事务前——Dify 失败时用户可立即重试（无冷却锁），仅 Dify 成功后才注册冷却锁；(3) 验证步骤已消除与实现步骤的"冷却期 30s 仍生效"矛盾（Dify 失败时不再持有冷却锁）。plan.md 步骤 A2 和 task_v1.md Task 3 均已更新。

### [一般] Task 10 (S3) — 引用计数与执行顺序冲突，新代码引用遗漏风险
**回应**：(1) 已在 Task 10（现步骤 B2）说明中注明"当前代码库有 43 处引用，但随着 P2 任务实现引用数会增长，验证时以 `rg` 搜索结果为准"；(2) 已添加命名风格说明：`difyAuth` 使用 `userId`（camelCase）为其独立认证上下文字段，`user` 对象使用 `user_id`（snake_case）为设计文档约定的路由处理器字段，两者分属不同语义空间，保持各自风格（不建议强行统一）。plan.md 步骤 B2 和 task_v1.md Task 10 均已更新。

### [一般] Task 16 (G6) — 缺少对 Task 8 的形式依赖声明
**回应**：已更新 Task 16 的依赖字段，明确标注"依赖 Task C5b（chat_token 解密函数）"。plan.md 依赖图已添加 G6→S8a 的依赖边；task_v1.md Task 16 依赖字段已更新为"Task 8b（chat_token 解密函数必须先于 chat.js conversations 端点实现）"。

### [轻微] 需求文档与任务清单的问题计数不一致
**回应**：此发现针对 `requirement.md`（非 plan.md / task_v1.md 的修订范围）。plan.md 和 task_v1.md 已正确识别 19 个问题（10 严重 + 9 一般），无需修订。可在后续单独更新 requirement.md。

### [轻微] Task 11 (S2) — 实际为验证任务但列为"一般"修复
**回应**：已将 Task 11（现步骤 B3）明确标记为"验证确认"任务。经确认代码与配置完全自洽（`DB_PATH`/`DIFY_API_BASE` 各处一致），无需修改任何代码。plan.md 步骤 B3 和 task_v1.md Task 11 均已标注为验证任务。

### [轻微] Task 18 (G8) — 日期格式统一应优先检查是否存在共用工具函数
**回应**：已为 Task 18（现步骤 D5）增加预检查步骤：先检查 `server/utils/` 下是否存在日期格式化工具函数（确认仅存在 `dateRange.js` 处理日期范围查询，无通用日期格式化函数），再决定采用方案 A 或方案 B。plan.md 步骤 D5 和 task_v1.md Task 18 均已更新。

G10（路由挂载检查）：已验证确认已挂载后跳过，无需修复。
