# R2: 路由层代码审查 —— 对照设计文档逐端点核对

审查时间：2026-06-26 10:37

### 审查范围

- `server/routes/index.js`
- `server/routes/auth.js`
- `server/routes/user.js`
- `server/routes/doctors.js`
- `server/routes/articles.js`
- `server/routes/diabetes.js`
- `server/routes/risk.js`
- `server/routes/plan.js`
- `server/routes/punch.js`
- `server/routes/chat.js`
- `server/routes/assistant.js`
- `server/routes/admin.js`
- `server/routes/upload.js`

对照设计文档 `docs/2_detailed_design_v3.md` 第3节 API 接口详细设计（共约32个端点）。

### 发现

#### [严重] 缺失 `POST /api/admin/chat` 端点（管理员自然语言对话 SSE）

- **位置**：`server/routes/admin.js:1`（整个文件缺失此端点）
- **描述**：设计文档 3.1.10 节明确指定 `POST /api/admin/chat` 端点为管理员自然语言对话（SSE 流），需 JWT + admin 认证。当前 `admin.js` 中完全没有该路由实现。
- **建议**：在 `admin.js` 中添加 `router.post('/chat', authMiddleware, adminMiddleware, ...)` 路由，参照 `chat.js` 的 `proxyDifySSE` 模式，使用 `DIFY_ADMIN_AGENT_KEY` 环境变量调用 Dify admin-manager-agent。

#### [严重] 缺失 `server/middleware/difyAuth.js` 中间件 — `POST /api/admin/execute` 双认证模式不完整

- **位置**：`server/routes/admin.js:28`
- **描述**：设计文档 3.2.29 节规定 `POST /api/admin/execute` 需同时支持两种认证方式：Dify Agent 回调（携带 `api_key` 字段，由 `difyAuth.js` 中间件校验 `DIFY_SERVICE_API_KEY`）和浏览器直连（JWT + admin）。当前实现仅使用 `authMiddleware, adminMiddleware`，Dify Agent 回调无法通过认证。`difyAuth.js` 中间件文件不存在。
- **建议**：
  1. 创建 `server/middleware/difyAuth.js`，校验 `req.body.api_key === process.env.DIFY_SERVICE_API_KEY`
  2. 修改 `admin.js:28` 为条件认证链：先尝试 JWT 认证，若无 JWT 则走 API Key 认证；或拆分为两个中间件组合（`difyAuth` 优先级检测 `api_key` 字段，`authMiddleware` 检测 `Authorization` 头）

#### [严重] `POST /api/admin/execute` 缺少参数化工具分发（`tool_name` 路由）

- **位置**：`server/routes/admin.js:28-69`
- **描述**：设计文档 3.2.29 节和 5.2.5/5.2.6 节定义了专用参数化查询工具（`query_user_profile`、`query_risk_info`、`query_life_plans`、`query_punch_records` 等）通过 `tool_name` 字段分发，使用预定义 SQL 模板 + 占位符绑定杜绝 SQL 注入。当前实现仅处理 `execute_SQL` 兜底路径（携带 `sql` 字段），未实现 `tool_name` 分发逻辑。
- **建议**：在 `admin.js` 中添加 `tool_name` 检查逻辑，当请求体包含 `tool_name` 时跳过分发至对应的参数化查询处理器，仅当不含 `tool_name` 时走 `sql` 兜底路径。参数化查询处理器应校验 `user_id` 参数与 `req.body.user_id` 的行级权限。

#### [严重] `POST /api/admin/execute` 行级权限校验缺失（AI 助手 Text2SQL 场景）

- **位置**：`server/routes/admin.js:28-69`
- **描述**：设计文档 1.7 节（路径2）规定 AI 助手场景中 `POST /api/admin/execute` 需执行行级权限约束（`validateRowLevelPermission`），确保普通用户仅能查询/操作本人数据。当前实现仅检查 SQL 关键字（不允许 INSERT/UPDATE/DELETE 等），但未实现行级权限校验。
- **建议**：当调用来自 AI 助手（非 admin 用户，由 `user_id` 字段推断）时，在 SQL 执行前解析 SQL 并验证 WHERE 条件强制包含 `user_id = <请求者的user_id>` 约束。admin 用户不受此限。

#### [严重] 医师对话 `chat_token` 未解密直接传递给 Dify

- **位置**：`server/routes/chat.js:24-27`
- **描述**：设计文档 2.5 节（doctor_information 表）v15 修订规定 `chat_token` 字段存储 AES-256-GCM 加密后的密文，Express 读取后须用 `JWT_SECRET` 派生密钥解密。当前实现 `proxyDifySSE({ apiKey: row.chat_token, ... })` 直接传递原始值，未做解密处理。若数据库已存储加密值，将导致 Dify API 调用失败（401 鉴权错误）。
- **建议**：在 `chat.js` 中引入 `crypto` 模块，从 `JWT_SECRET` 派生解密密钥，在传递给 `proxyDifySSE` 前对 `row.chat_token` 进行 AES-256-GCM 解密。

#### [严重] `POST /api/plan/generate` 事务提交过早 — Dify 失败时用户丢失活跃方案

- **位置**：`server/routes/plan.js:34-46`（事务）与 `server/routes/plan.js:47-53`（Dify 调用）
- **描述**：`plan.js:34-46` 的事务将旧方案 `is_active` 设为 0 并生成新 `plan_id`，事务在 `planData = db.transaction(() => {...})()` 处立即提交。随后 Dify 调用（line 47-53）若失败或超时，用户的旧方案已被逻辑删除且新方案未生成，导致用户处于无活跃方案状态。
- **建议**：将 Dify 调用移入事务内，或将旧方案失效操作推迟到 Dify 调用成功之后。如果 Dify 调用是异步的（需要 await），可以将事务拆分为：Dify 成功 → 再执行旧方案失效 + 新方案写入的事务。

#### [一般] 对话历史会话列表端点为桩实现（始终返回空数组）

- **位置**：`server/routes/chat.js:36-38`，`server/routes/assistant.js:63-64`
- **描述**：设计文档 3.2.12 和 3.2.27 节定义 `GET /api/chat/doctor/:id/conversations` 和 `GET /api/assistant/conversations` 返回历史会话列表。两者当前均硬编码返回 `data: []`。前端需调用 Dify API 获取实际会话列表，或由后端调用 Dify Conversations API 代理查询后返回。
- **建议**：实现通过 `callDifyGetConversations(apiKey, userId)` 从 Dify API 获取会话列表并格式化为 `{ conversation_id, name, created_at }` 结构返回。

#### [一般] `POST /api/admin/execute` SQL 关键字检查在 uppercase 版本上执行，存在边缘误判风险

- **位置**：`server/routes/admin.js:33-46`
- **描述**：将 SQL 转换为大写后（`req.body.sql.trim().toUpperCase()`）检查禁止关键字。这可能导致：1）合法的列名或字符串字面量中包含禁止关键字时被误判（如列名 `insert_count` 会匹配 `INSERT`）；2）某些绕过技术在转大写后检查会漏掉（如 SQLite 允许 `sElEcT` 这种大小写混写，但转大写后正确拦截）。总体风险较低但不够严谨。
- **建议**：对原始 SQL 做大小写不敏感的正则匹配（当前已使用 `'i'` 标志的 `RegExp`），去掉 `.toUpperCase()` 预处理以避免误判。

#### [一般] `articles.js` 生成文章时使用了与其他表不一致的日期格式

- **位置**：`server/routes/articles.js:133`
- **描述**：`strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')` 生成 ISO8601 带 T 分隔符的格式（如 `2026-06-26T10:30:00`），而其他表通过 DDL 默认值 `datetime('now', 'localtime')` 生成空格分隔格式（如 `2026-06-26 10:30:00`）。虽然 T 分隔符更符合设计文档 API 响应示例格式，但同一数据库内不同表的 `created_at` 列格式不一致。
- **建议**：统一所有 `created_at` 生成为 ISO8601 T 分隔符格式，或创建一个共用工具函数 `nowISO()` 供所有路由处理器使用。

#### [一般] `upload.js` 在模块加载时同步创建目录

- **位置**：`server/routes/upload.js:9`
- **描述**：`fs.mkdirSync(uploadDir, { recursive: true })` 在模块顶层执行，若目录创建失败（如权限不足），整个 `require('./routes/upload')` 会抛出异常导致服务器无法启动。应放在函数内部或使用 try-catch 包裹。
- **建议**：将目录创建移入请求处理函数中（首次上传时），或使用 try-catch 包裹并在初始化失败时记录警告日志而非崩溃。

#### [轻微] `articles.js` 幂等性检查使用内存 Map，服务重启后失效

- **位置**：`server/routes/articles.js:13`（`recentGenerates`）、`server/routes/plan.js:11`（`lastGenerateRequest`）
- **描述**：两者使用内存级 `Map` 实现 30 秒幂等性保护。服务重启后 Map 清空，短时间内重复请求可能绕过大模型调用限制。
- **建议**：内存级 Map 对于大多数场景已足够（服务重启用户通常不会立即重新请求）。如需更可靠保护，可结合数据库 `created_at` 列查询最近一条记录作为补充判断。

#### [轻微] `risk.js` 二次重试机制可能导致 Dify 循环调用

- **位置**：`server/routes/risk.js:71-80`
- **描述**：当 Dify 返回的文本既非 JSON 也无法被正则解析时，会以原输出作为 `__retry_parse` 参数重新调用 Dify 工作流。如果 Dify 持续返回不可解析的输出，重试一次后抛出异常（line 78），不会无限循环。但第二次调用仍可能返回不可解析的结果，此时用户体验为 502 错误。
- **建议**：当前实现只有一次重试，风险可控。可考虑在重试时在 inputs 中加入更明确的格式指令（如 `"请以 JSON 格式返回..."`）。

#### [轻微] `plan.js` adjust 端点未校验 `plan_id` 归属

- **位置**：`server/routes/plan.js:146-149`
- **描述**：`UPDATE ... WHERE user_id = ? AND plan_id = ?` 在用户提供不存在或不属于自己的 `plan_id` 时不会报错，静默返回空更新，随后继续执行 Dify 调用和新建方案。用户可能因输入错误的 `plan_id` 而不知道实际是创建了新方案组。
- **建议**：在 UPDATE 前先查询验证 `plan_id` 是否属于当前用户且存在，若不存在则返回 404 错误。

#### [轻微] `risk.js` history 端点缺少 `pregnancy` 字段的 boolean 转换

- **位置**：`server/routes/risk.js:148-164`
- **描述**：设计文档 1.8.2 节规定 Express 路由在查询 `user_risk_info` 后应将 `pregnancy` 从 INTEGER（0/1）转换为 boolean 返回。当前 history 查询未包含 `pregnancy` 字段，但 GET `/api/risk/history` 的设计响应（3.2.8 节）也不包含该字段 — 仅 `POST /api/risk/predict` 响应和详情页需要。当前实现正确 —— `pregnancy` 字段在历史列表响应中确实不返回。此项无问题。（注：此为自查项，无需修复）

### 本轮统计

| 严重程度 | 数量 |
|---------|------|
| 严重 | 6 |
| 一般 | 5 |
| 轻微 | 5 |

### 总评

路由层整体端点覆盖率达到 **87.5%**（32 个设计端点中 28 个已实现，4 个缺失/不完整）。已实现的端点中 HTTP 方法、路径、认证中间件配置均与设计文档一致。分页格式、统一错误响应格式（`success`/`error` 工具函数）与设计规范保持一致。

主要缺口集中在 **管理模块**：`POST /api/admin/chat` 完全缺失，`POST /api/admin/execute` 的双认证模式（`difyAuth.js` 中间件）、参数化工具分发、行级权限约束均未实现。这导致设计文档 1.7 节路径 2（AI 驱动的 Text2SQL 路径）无法正常工作。医师对话模块的 `chat_token` AES 解密也未实现，与 v15 修订的加密策略不一致。

此外 `plan.js` 的事务设计缺陷（过早提交导致 Dify 失败时用户丢失方案）是一个需要优先修复的数据完整性风险。

建议修复优先级：1) admin/chat 缺失端点 → 2) plan/generate 事务顺序 → 3) admin/execute 双认证 + tool_name 分发 → 4) chat_token 解密 → 5) 其余一般/轻微问题。
