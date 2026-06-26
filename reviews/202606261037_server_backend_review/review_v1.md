# R1: 基础设施层代码审查

审查时间：2026-06-26

### 审查范围
`server/app.js`, `server/db/database.js`, `server/middleware/auth.js`, `server/middleware/admin.js`, `server/middleware/errorHandler.js`, `server/middleware/optionalAuth.js`, `server/utils/dateRange.js`, `server/utils/jsonFields.js`, `server/utils/pagination.js`, `server/utils/planParser.js`, `server/utils/response.js`, `server/utils/validators.js`, `server/services/difyService.js`, `server/services/sseProxy.js` 共14个文件。

### 发现

#### [严重] database.js — 缺少 WAL 模式和 busy_timeout 配置
- **位置**：`server/db/database.js:17-18`
- **描述**：设计文档第 6.4 节 `getDatabase()` 函数明确要求启用 `journal_mode = WAL` 和 `busy_timeout = 5000` 两个 pragma。当前代码仅设置了 `foreign_keys = ON`，缺少这两个关键 pragma。SQLite 默认 journal_mode 为 DELETE 回滚日志模式，在并发读写场景下（如多个 SSE 流同时回调 admin/execute 写入日志 + 前端 CRUD 操作）容易出现 "database is locked" 错误，导致请求失败。高可用局限一节（6.8 节）也明确指出了此风险。
- **建议**：在 `new Database(dbPath)` 之后补充：
  ```javascript
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  ```

#### [严重] database.js / difyService.js / sseProxy.js — Dify API Base URL 环境变量名与设计文档不一致
- **位置**：`server/db/database.js:10` (`DB_PATH`)、`server/services/difyService.js:85` (`DIFY_API_BASE`)、`server/services/sseProxy.js:10` (`DIFY_API_BASE`)
- **描述**：
  1. `database.js` 使用 `process.env.DB_PATH`，设计文档 `.env.example`（6.3.2 节）定义为 `SQLITE_PATH`，且第 6.4 节 `getDatabase()` 示例代码使用的变量名也是 `SQLITE_PATH`。
  2. `difyService.js` 和 `sseProxy.js` 使用 `process.env.DIFY_API_BASE`，设计文档 `.env.example`（6.3.2 节）和 `difyService.js` 行为规格（6.3.5 节）中均使用 `DIFY_API_BASE_URL`。变量名不一致可能导致部署或配置时无法正确加载环境变量，AI 服务静默失效（进入 Mock 模式）。
- **建议**：统一变量名：
  - `DB_PATH` → `SQLITE_PATH`（或同步更新 `.env.example`）
  - `DIFY_API_BASE` → `DIFY_API_BASE_URL`（或同步更新设计文档）

#### [严重] auth.js — JWT Payload 字段名与设计文档不匹配，存在下游消费方取值错误的风险
- **位置**：`server/middleware/auth.js:28`
- **描述**：`auth.js` 中间件在 JWT 验证通过后设置 `req.user = { id: decoded.id, username: decoded.username, role: decoded.role }`，字段名为 `id`。但设计文档第 7.1 节 JWT 鉴权流程图和 7.3.3 节路由处理器伪代码中均约定 `req.user = { user_id, role }`，字段名为 `user_id`。若路由处理器（如 `risk.js`、`plan.js`、`punch.js` 等）按设计文档使用 `req.user.user_id` 提取用户 ID，将获取到 `undefined`，导致数据库查询约束条件失效（SQL 中 `WHERE user_id = ?` 绑定 `undefined`），可能返回全部用户数据或写入错误的用户关联。
- **建议**：统一 `req.user` 的字段命名契约。建议修改 `auth.js:28` 为：
  ```javascript
  req.user = { user_id: decoded.id, username: decoded.username, role: decoded.role };
  ```
  并同步修改 `admin.js:8`、`optionalAuth.js:14` 以及所有路由处理器中对 `req.user.id` 的引用为 `req.user.user_id`。

#### [一般] auth.js — JWT 有效期偏离设计规范
- **位置**：`server/middleware/auth.js:15`（及对应的登录路由 `routes/auth.js` 中 `jwt.sign` 的 `expiresIn`）
- **描述**：根据 batch2 审查记录，登录路由中 JWT 签名的 `expiresIn` 为 `'7d'`（7 天），但设计文档 `.env.example`（6.3.2 节）定义 `JWT_EXPIRES_IN=24h`。更长的过期时间增加了 Token 泄露后的安全风险窗口。设计文档 7.1 节 JWT 鉴权流程图也明确标注 `expiresIn:'24h'`。
- **建议**：将 JWT 签发时的 `expiresIn` 改为读取 `process.env.JWT_EXPIRES_IN`（默认 `'24h'`），对齐设计规范。若业务上需要 7 天，应同步更新设计文档并评估安全影响。

#### [一般] database.js — 模块顶层执行副作用，缺少加密配置
- **位置**：`server/db/database.js:33`
- **描述**：
  1. `initDatabase()` 在模块末尾（第 33 行）被直接调用，这意味着 `require('./db/database')` 时会立即触发文件 I/O（创建目录、读取 SQL 文件、写入数据库）。这违背了模块化原则，且 batch1 审查记录（问题 1）明确指出了顶层立即执行连接代码的风险。虽然 batch1 的问题（第 33-34 行冗余连接）已被删除，但 `initDatabase()` 仍在模块加载时自动执行。
  2. 设计文档第 6.3.1 节 `server.js` 启动入口中，`initDatabase()` 应由 `server.js` 显式调用（而非在 `database.js` 模块加载时自动触发）。
- **建议**：移除第 33 行的 `initDatabase()` 自动调用，改为在 `server.js` 启动时显式调用。

#### [一般] difyService.js — Mock 模式检测逻辑不可靠
- **位置**：`server/services/difyService.js:88-93`
- **描述**：当 `DIFY_API_BASE` 未设置时进入 Mock 模式，通过检查 `inputs` 对象中是否包含 `family_history` 或 `diabetes_history` 字段来区分风险预测请求和方案生成请求。此启发式检测脆弱——若未来新增工作流（如 punch-analysis）的 inputs 中不包含这两个字段，将被误判为方案生成请求返回 Mock Plan 数据；反之若方案生成的 inputs 因业务扩展加入类似字段，也会误判。
- **建议**：增加明确的请求类型参数，或改用 `workflow_id` 区分，避免基于字段名的启发式判断。

#### [一般] validators.js — 未使用的导入
- **位置**：`server/utils/validators.js:1`
- **描述**：`const { error } = require('./response')` 导入了 `error` 函数但文件中从未使用。此问题在 batch2 审查记录中已标注为非阻塞 Minor 问题，但未被修复。引入无用的模块依赖链（`response.js` → `errorHandler.js`）增加了不必要的耦合。
- **建议**：删除第 1 行的无用导入。

#### [一般] planParser.js — JSON 正则模式过于严格，字段顺序硬编码
- **位置**：`server/utils/planParser.js:63`
- **描述**：JSON 解析后备的正则匹配模式 `jsonPattern` 假设 JSON 对象的字段顺序固定为 `plan_type, order_num, time_desc, title, content`。若 Dify 工作流输出的 JSON 字段顺序不同（如在 diff 平台版本中字段顺序变化），正则将无法匹配，直接进入 LLM 二次调用降级，增加了不必要的延迟和 Token 消耗。
- **建议**：改用逐字段独立正则提取（分别匹配 `plan_type`、`order_num` 等各字段），不依赖字段顺序，提升鲁棒性。

#### [轻微] response.js — 响应格式始终附带 `message` 字段
- **位置**：`server/utils/response.js:3-5`
- **描述**：`success()` 函数在 JSON 响应中始终包含 `message` 字段（默认值 `'操作成功'`）。但设计文档中多个成功响应示例（如 3.2.2 登录响应、3.2.4 个人信息响应）未包含 `message` 字段。虽然有额外的 `message` 字段通常不影响前端功能（前端大概率忽略未知字段），但增加了响应载荷体积，且与设计契约存在偏差。
- **建议**：当 `message` 为 null 或 undefined 时不将其加入响应体，或仅在显式传入时包含。

#### [轻微] errorHandler.js — 500 错误消息用词
- **位置**：`server/middleware/errorHandler.js:24`
- **描述**：`message: '服务端内部错误'`，batch1 审查记录指出行业惯用表述为 `'服务器内部错误'`。此问题 batch1 已标注为可选修改，未阻塞审批，仍保留原样。
- **建议**：可维持现状，或改为 `'服务器内部错误'` 以对齐行业惯用表述。

#### [轻微] app.js — CORS 中间件与 Nginx 重复
- **位置**：`server/app.js:9`
- **描述**：`app.use(cors())` 在生产环境中与 Nginx 反向代理的 CORS 响应头配置（6.1.2 节）重复。生产环境下 Nginx 已处理跨域请求，Express 端的 `cors` 中间件冗余。虽然开发环境需要，但缺乏环境判断可能导致响应头重复或冲突。
- **建议**：根据 `NODE_ENV` 环境变量条件启用 CORS：
  ```javascript
  if (process.env.NODE_ENV !== 'production') {
    app.use(cors());
  }
  ```

#### [轻微] difyService.js / sseProxy.js — 缺少显式的中止控制器支持
- **位置**：`server/services/sseProxy.js:99-104` 和 `server/services/difyService.js:64-67`
- **描述**：`sseProxy.js` 支持通过 `req.on('close')` 中止上游连接，但调用方无法在 SSE 代理外部主动中止连接（设计 3.7 节 chatStore 定义了 `abortActiveConnection()` 需求）。`difyService.js` 的 blocking 调用使用 `req.destroy()` 处理超时，但未对外暴露 AbortController 接口供调用方提前取消。
- **建议**：为 `difyService.callWorkflowBlocking` 增加可选的 `signal: AbortSignal` 参数，允许调用方主动取消长时间 AI 请求。

### 通过审查的文件

| # | 文件 | 状态 |
|---|------|------|
| 1 | `server/middleware/admin.js` | 通过 — 防御性校验 `!req.user` + `role !== 'admin'`，错误码和状态码符合设计 |
| 2 | `server/middleware/optionalAuth.js` | 通过 — "可选模式"实现正确，JWT 存在则解析注入、不存在则放行，与设计 7.3.1 节一致 |
| 3 | `server/utils/dateRange.js` | 通过 — 日期格式校验 + 范围逻辑校验完备，endDate 追加 `T23:59:59` 对齐设计 3.2.17 节 SQL 注释 |
| 4 | `server/utils/jsonFields.js` | 通过 — `parseTags` NULL 安全降级为空数组，`JSON.parse` 异常捕获，对齐设计 1.8.4 节 JSON 序列化规范 |
| 5 | `server/utils/pagination.js` | 通过 — 默认值 `page=1, pageSize=20`，上限 `pageSize ≤ 100`，`totalPages = Math.ceil(total/pageSize)` 完全对齐设计 3.5 节分页规范 |
| 6 | `server/services/sseProxy.js` | 通过 — batch6 审查报告的 4 个 bug（JSON 注入、double-write、客户端断连写入、writableEnded 守卫）均已修复。SSE 响应头完整，行缓冲透传正确，aborted 标志位守卫到位 |

### 本轮统计
| 严重程度 | 数量 |
|---------|------|
| 严重 | 3 |
| 一般 | 5 |
| 轻微 | 5 |

### 总评
本轮审查覆盖 14 个基础设施层文件，整体代码质量良好，`pagination.js`、`dateRange.js`、`jsonFields.js` 等工具模块对设计规范遵守度很高，`sseProxy.js` 的先前审查问题也已在 batch6 中得到妥善修复。但存在 **3 个严重问题**需要优先修复：缺失 SQLite WAL/busy_timeout 配置（影响并发稳定性）、环境变量名与设计文档不一致（可能导致 AI 功能静默失效）、JWT 字段命名契约不匹配（可能导致路由处理器取错用户 ID）。建议在修复后重新提交审查。此外，`validators.js` 中 batch2 已指出的未使用导入仍未被清理，建议一并处理。
