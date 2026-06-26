# 待办事项

## 严重问题 (9)

### 1. database.js — 缺少 WAL 模式和 busy_timeout 配置
- **位置**：`server/db/database.js:17-18`
- **描述**：设计文档第 6.4 节 `getDatabase()` 函数明确要求启用 `journal_mode = WAL` 和 `busy_timeout = 5000` 两个 pragma。当前代码仅设置了 `foreign_keys = ON`，缺少这两个关键 pragma。SQLite 默认 journal_mode 为 DELETE 回滚日志模式，在并发读写场景下（如多个 SSE 流同时回调 admin/execute 写入日志 + 前端 CRUD 操作）容易出现 "database is locked" 错误，导致请求失败。高可用局限一节（6.8 节）也明确指出了此风险。

### 2. database.js / difyService.js / sseProxy.js — Dify API Base URL 环境变量名与设计文档不一致
- **位置**：`server/db/database.js:10` (`DB_PATH`)、`server/services/difyService.js:85` (`DIFY_API_BASE`)、`server/services/sseProxy.js:10` (`DIFY_API_BASE`)
- **描述**：`database.js` 使用 `process.env.DB_PATH`，设计文档 `.env.example`（6.3.2 节）定义为 `SQLITE_PATH`。`difyService.js` 和 `sseProxy.js` 使用 `process.env.DIFY_API_BASE`，设计文档 `.env.example`（6.3.2 节）和 `difyService.js` 行为规格（6.3.5 节）中均使用 `DIFY_API_BASE_URL`。变量名不一致可能导致部署或配置时无法正确加载环境变量，AI 服务静默失效（进入 Mock 模式）。

### 3. auth.js — JWT Payload 字段名与设计文档不匹配
- **位置**：`server/middleware/auth.js:28`
- **描述**：`auth.js` 中间件在 JWT 验证通过后设置 `req.user = { id: decoded.id, username: decoded.username, role: decoded.role }`，字段名为 `id`。但设计文档第 7.1 节 JWT 鉴权流程图和 7.3.3 节路由处理器伪代码中均约定 `req.user = { user_id, role }`，字段名为 `user_id`。若路由处理器按设计文档使用 `req.user.user_id` 提取用户 ID，将获取到 `undefined`，导致数据库查询约束条件失效（SQL 中 `WHERE user_id = ?` 绑定 `undefined`），可能返回全部用户数据或写入错误的用户关联。

### 4. 缺失 `POST /api/admin/chat` 端点（管理员自然语言对话 SSE）
- **位置**：`server/routes/admin.js:1`（整个文件缺失此端点）
- **描述**：设计文档 3.1.10 节明确指定 `POST /api/admin/chat` 端点为管理员自然语言对话（SSE 流），需 JWT + admin 认证。当前 `admin.js` 中完全没有该路由实现。

### 5. 缺失 `server/middleware/difyAuth.js` 中间件 — `POST /api/admin/execute` 双认证模式不完整
- **位置**：`server/routes/admin.js:28`
- **描述**：设计文档 3.2.29 节规定 `POST /api/admin/execute` 需同时支持两种认证方式：Dify Agent 回调（携带 `api_key` 字段，由 `difyAuth.js` 中间件校验 `DIFY_SERVICE_API_KEY`）和浏览器直连（JWT + admin）。当前实现仅使用 `authMiddleware, adminMiddleware`，Dify Agent 回调无法通过认证。`difyAuth.js` 中间件文件不存在。

### 6. `POST /api/admin/execute` 缺少参数化工具分发（`tool_name` 路由）
- **位置**：`server/routes/admin.js:28-69`
- **描述**：设计文档 3.2.29 节和 5.2.5/5.2.6 节定义了专用参数化查询工具（`query_user_profile`、`query_risk_info`、`query_life_plans`、`query_punch_records` 等）通过 `tool_name` 字段分发，使用预定义 SQL 模板 + 占位符绑定杜绝 SQL 注入。当前实现仅处理 `execute_SQL` 兜底路径（携带 `sql` 字段），未实现 `tool_name` 分发逻辑。

### 7. `POST /api/admin/execute` 行级权限校验缺失（AI 助手 Text2SQL 场景）
- **位置**：`server/routes/admin.js:28-69`
- **描述**：设计文档 1.7 节（路径2）规定 AI 助手场景中 `POST /api/admin/execute` 需执行行级权限约束（`validateRowLevelPermission`），确保普通用户仅能查询/操作本人数据。当前实现仅检查 SQL 关键字（不允许 INSERT/UPDATE/DELETE 等），但未实现行级权限校验。

### 8. 医师对话 `chat_token` 未解密直接传递给 Dify
- **位置**：`server/routes/chat.js:24-27`
- **描述**：设计文档 2.5 节（doctor_information 表）v15 修订规定 `chat_token` 字段存储 AES-256-GCM 加密后的密文，Express 读取后须用 `JWT_SECRET` 派生密钥解密。当前实现 `proxyDifySSE({ apiKey: row.chat_token, ... })` 直接传递原始值，未做解密处理。若数据库已存储加密值，将导致 Dify API 调用失败（401 鉴权错误）。

### 9. `POST /api/plan/generate` 事务提交过早 — Dify 失败时用户丢失活跃方案
- **位置**：`server/routes/plan.js:34-46`（事务）与 `server/routes/plan.js:47-53`（Dify 调用）
- **描述**：`plan.js:34-46` 的事务将旧方案 `is_active` 设为 0 并生成新 `plan_id`，事务在 `planData = db.transaction(() => {...})()` 处立即提交。随后 Dify 调用（line 47-53）若失败或超时，用户的旧方案已被逻辑删除且新方案未生成，导致用户处于无活跃方案状态。

---

## 一般问题 (10)

### 10. auth.js — JWT 有效期偏离设计规范
- **位置**：`server/middleware/auth.js:15`（及对应的登录路由 `routes/auth.js` 中 `jwt.sign` 的 `expiresIn`）
- **描述**：根据 batch2 审查记录，登录路由中 JWT 签名的 `expiresIn` 为 `'7d'`（7 天），但设计文档 `.env.example`（6.3.2 节）定义 `JWT_EXPIRES_IN=24h`。更长的过期时间增加了 Token 泄露后的安全风险窗口。设计文档 7.1 节 JWT 鉴权流程图也明确标注 `expiresIn:'24h'`。

### 11. database.js — 模块顶层执行副作用
- **位置**：`server/db/database.js:33`
- **描述**：`initDatabase()` 在模块末尾（第 33 行）被直接调用，这意味着 `require('./db/database')` 时会立即触发文件 I/O（创建目录、读取 SQL 文件、写入数据库）。这违背了模块化原则，且 batch1 审查记录（问题 1）明确指出了顶层立即执行连接代码的风险。设计文档第 6.3.1 节 `server.js` 启动入口中，`initDatabase()` 应由 `server.js` 显式调用。

### 12. difyService.js — Mock 模式检测逻辑不可靠
- **位置**：`server/services/difyService.js:88-93`
- **描述**：当 `DIFY_API_BASE` 未设置时进入 Mock 模式，通过检查 `inputs` 对象中是否包含 `family_history` 或 `diabetes_history` 字段来区分风险预测请求和方案生成请求。此启发式检测脆弱——若未来新增工作流（如 punch-analysis）的 inputs 中不包含这两个字段，将被误判为方案生成请求返回 Mock Plan 数据；反之若方案生成的 inputs 因业务扩展加入类似字段，也会误判。

### 13. validators.js — 未使用的导入
- **位置**：`server/utils/validators.js:1`
- **描述**：`const { error } = require('./response')` 导入了 `error` 函数但文件中从未使用。此问题在 batch2 审查记录中已标注为非阻塞 Minor 问题，但未被修复。引入无用的模块依赖链（`response.js` → `errorHandler.js`）增加了不必要的耦合。

### 14. planParser.js — JSON 正则模式过于严格，字段顺序硬编码
- **位置**：`server/utils/planParser.js:63`
- **描述**：JSON 解析后备的正则匹配模式 `jsonPattern` 假设 JSON 对象的字段顺序固定为 `plan_type, order_num, time_desc, title, content`。若 Dify 工作流输出的 JSON 字段顺序不同（如在 diff 平台版本中字段顺序变化），正则将无法匹配，直接进入 LLM 二次调用降级，增加了不必要的延迟和 Token 消耗。

### 15. 对话历史会话列表端点为桩实现（始终返回空数组）
- **位置**：`server/routes/chat.js:36-38`，`server/routes/assistant.js:63-64`
- **描述**：设计文档 3.2.12 和 3.2.27 节定义 `GET /api/chat/doctor/:id/conversations` 和 `GET /api/assistant/conversations` 返回历史会话列表。两者当前均硬编码返回 `data: []`。前端需调用 Dify API 获取实际会话列表，或由后端调用 Dify Conversations API 代理查询后返回。

### 16. `POST /api/admin/execute` SQL 关键字检查在 uppercase 版本上执行，存在边缘误判风险
- **位置**：`server/routes/admin.js:33-46`
- **描述**：将 SQL 转换为大写后（`req.body.sql.trim().toUpperCase()`）检查禁止关键字。这可能导致合法的列名或字符串字面量中包含禁止关键字时被误判（如列名 `insert_count` 会匹配 `INSERT`）。

### 17. `articles.js` 生成文章时使用了与其他表不一致的日期格式
- **位置**：`server/routes/articles.js:133`
- **描述**：`strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')` 生成 ISO8601 带 T 分隔符的格式，而其他表通过 DDL 默认值 `datetime('now', 'localtime')` 生成空格分隔格式。同一数据库内不同表的 `created_at` 列格式不一致。

### 18. `upload.js` 在模块加载时同步创建目录
- **位置**：`server/routes/upload.js:9`
- **描述**：`fs.mkdirSync(uploadDir, { recursive: true })` 在模块顶层执行，若目录创建失败（如权限不足），整个 `require('./routes/upload')` 会抛出异常导致服务器无法启动。
