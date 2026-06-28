# 技术方案审查报告（v1）

## 审查结果

REJECTED

## 逐维度审查

### 1. 技术准确性

**[通过]** 驱动的技术选型（`pg`）正确，KingbaseES 兼容 PostgreSQL 协议，`pg` (node-postgres) 是官方推荐的驱动。

**[通过]** 适配层接口设计（`DatabaseAdapter`）合理，不引入 ORM/查询构建器的决策与项目当前"原始 SQL"风格一致。`execute()` 返回 `{ lastInsertId, changes }` 的抽象正确覆盖了两端差异。

**[通过]** SQL 方言差异清单（4.1 节）覆盖全面，新增的 `date(column)` 列提取行（v7 补充）经代码核实与 `punch.js` 第 121、126 行实际使用一致。

**[通过]** `sql.js` 方言辅助函数设计合理，`CURRENT_TIMESTAMP` 在 SQLite 3.38+ 和 KingbaseES 中均可用的判断正确。`FOR UPDATE` 在 SQLite 3.33+ 和 PostgreSQL 中兼容的声明正确。

**[通过]** `pg.Pool` 连接池配置参数（`max`、`min`、`idleTimeoutMillis`、`connectionTimeoutMillis`）均为有效参数。`statement_timeout` 通过连接字符串 `options` 参数传递的方式正确——此参数是 PostgreSQL 服务端参数，不应写在 `pg.Pool` 构造配置中。

**[通过]** `? → $1` 占位符转换策略正确，状态机跳过字符串字面量的设计避免了误转换。SQL 注释无需处理的理由（路由层 SQL 不含注释）合理。

**[通过]** KingbaseES `information_schema.columns` 查询映射到 PRAGMA 格式的 SQL 逻辑正确。`pg_get_serial_sequence()` 是 PostgreSQL 标准函数，用于动态获取序列名称的推荐正确。

**[通过]** JSONB 类型选择、GIN 索引 DDL、空字符串默认值不可用于 JSONB 的分析均正确。`''::jsonb` 在 PostgreSQL 中确实会抛出 `invalid input syntax for type json` 错误。

**[通过]** `node-sql-parser` v5.4.0 确实在项目的 `package.json` 中已存在（第 26 行），文档声称利用已有依赖是准确的。

**[通过]** `express-async-errors` 包确实不在项目 `package.json` 中，文档要求所有 async handler 使用 `try/catch + next(e)` 模式的判断正确。

**[通过]** `initDatabase()` 当前为同步函数（`database.js` 第 9 行），`server.js` 在 `app.listen()` 之前调用 `initDatabase()` 但不等待其完成（第 3 行）。文档分析"当前 server.js 同步调用不等待初始化完成"是准确的。

**[通过]** `checkIdempotent()` 确实位于 `parsePlanOutput()`（Dify 调用）之后（`plan.js` 第 44 行 vs 第 37-42 行），文档关于"浪费 Dify API 配额"的分析经代码核实正确。

**[通过]** `insertAdminLog()` 确实是模块级函数（`admin.js` 第 147 行），内部使用模块级 `db` 变量（第 149 行），在事务回调内（第 98 行）调用时使用全局连接——文档关于"破坏事务原子性"的分析经代码核实正确。

**[通过]** `init_kingbase.sql` 确实使用 `DROP TABLE IF EXISTS ... CASCADE`（第 9-18 行），文档指出需要改为 `CREATE TABLE IF NOT EXISTS` 的判断正确。

**[通过]** `/health` 端点确实返回静态 JSON（`index.js` 第 4-6 行），不包含数据库状态检查，文档要求改造为调用 `adapter.healthCheck()` 的判断正确。

**[严重]** 无。

**[一般]** **`sql.formatDateParam()` 实现逻辑描述使用本地时间方法，与 UTC 存储决策存在时区不一致。** 第 4.2 节描述 `sql.formatDateParam()` 实现使用 `Date.getFullYear()`、`getMonth()`、`getDate()`、`getHours()`、`getMinutes()`、`getSeconds()` 拼接格式化字符串，并声称"此方式无需方言函数，两个数据库行为完全一致，且避免了时区歧义"。但该方案同时决策 `CURRENT_TIMESTAMP` 统一输出 UTC 时间——在 UTC+8 时区下，`getHours()` 返回 14（本地时间）而数据库存储的 `CURRENT_TIMESTAMP` 值为 06（UTC），格式一致的字符串在语义上相差 8 小时。这将导致以下场景的错误：

1. `punch.js` 近 7 天查询：`WHERE punch_time >= ?` 传入的 date 参数为本地时间格式（如 `'2025-06-28 14:30:00'`），但数据库中存储的 `punch_time` 为 UTC 格式（如 `'2025-06-28 06:30:00'`），字符串比较下新数据会被判定为"早于"查询边界而遗漏。
2. 所有使用 `sql.formatDateParam()` 的日期范围查询均受此影响，包括 Phase 1 KingbaseES 端——若 KingbaseES 服务器时区配置为非 UTC，问题同样存在。

**影响范围**：`punch.js` 的 7 天打卡查询、所有使用 `sql.formatDateParam()` 进行日期比较的路由逻辑。不修正将导致 Phase 0/1 验收测试中时间相关查询的边界结果不正确。

**建议方向**：将 `sql.formatDateParam()` 的实现方法从本地时间方法改为 UTC 方法（`getUTCFullYear()`、`getUTCMonth()`、`getUTCDate()`、`getUTCHours()`、`getUTCMinutes()`、`getUTCSeconds()`），确保输出的格式化字符串与 `CURRENT_TIMESTAMP` 在 UTC 时区下的输出语义一致。或者，在函数文档中显式声明该函数输出的是 UTC 时间字符串而非本地时间，并据此修正实现方法名称。同时更新"避免了时区歧义"的文字说明为"统一输出 UTC 格式，消除时区歧义"。

**[轻微]** 无。

### 2. 完备性

**[通过]** 用户原始需求（`requirement.md`）中列出的全部 10 个技术问题均有对应的方案说明：
- 驱动选型 → 第 2 节
- 数据库访问层改造 → 第 3 节
- SQL 方言差异 → 第 4 节
- 双数据库支持策略 → 第 5 节
- 渐进式迁移路径 → 第 6 节
- 连接池管理 → 第 7 节
- 事务处理差异 → 第 8 节
- `init_kingbase.sql` 评估与完善 → 第 10 节
- 环境配置 → 第 11 节
- 前端无变动 → 第 14 节

**[通过]** 第 5 轮审查发现的全部 8 个问题（`a_v6_iteration_requirement.md`）均已在 v7 文档中得到处理，修订说明（v6→v7）逐条列出了对应修订（R1-R8）。

**[通过]** 持续性问题 1（punch.js 日期参数格式化，Round 5→Round 6）已在 v7 第 4.2 节中得到重点解决：新增 `sql.formatDateParam(jsDate)` 辅助函数、替换 `.toISOString()` 为兼容格式、增加不兼容说明段落。但实现方法描述存在上述"技术准确性"维度的一般问题。

**[通过]** 持续性问题 2（Phase 0 混合时间戳，Round 2→Round 5→Round 6）已在 v7 第 4.2 节中得到重点解决：新增 4 维度影响量化评估表（punch.js / 前端展示 / Dify AI / 开发体验）、临时缓解措施（`sql.setDevMode(true)` 开关）、Phase 0 验收标准补充声明。严重程度已从 Round 2 的"严重"妥善降为"一般"。

**[通过]** 数据流闭环完整：用户请求 → 路由层（async handler + adapter）→ 方言层（sql.js）→ 适配层（SqliteAdapter/KingbaseAdapter）→ 数据库，异常沿调用链向上传播到 Express 统一错误处理。

**[通过]** `admin /execute` 端点的 `sql` 模式在 KingbaseES 下禁用策略覆盖了 Dify AI 跨系统协同——Dify prompt 的 `db_type` 变量注入方案（含 Jinja2 模板示例）、`difyService.js` 改造点、管理后台操作位置均已明确。

**[严重]** 无。

**[一般]** 无。

**[轻微]** 无。

### 3. 可操作性

**[通过]** 每个路由文件的改造模式明确：`db.prepare(sql).run/get/all()` → `await adapter.query/queryOne/execute(sql, params)`，handler 改为 `async (req, res, next) => { try { ... } catch (e) { next(e); } }`。改造前后代码对照清晰。

**[通过]** Phase 0 过渡策略（3.5.2 节）提供了 6 步双导出方案，每步操作明确、可独立验证。git 提交建议具体到阶段粒度。

**[通过]** Phase 0/Phase 1 手工回归测试清单（5.1.1 节）定义了 18 个 API 端点测试 + 3 个 E2E 流程，每个端点有明确的测试编号、HTTP 方法、测试场景和验证点。CI 冒烟脚本给出具体 curl 命令。

**[通过]** 文件变更清单（第 16 节）覆盖完整：新建 10 个文件、改造 14 个文件、2 个更新文件、5 个不变文件。每个文件的操作和改动说明明确。

**[通过]** `scripts/phase0_utc_convert.sql` 的操作已从"新建"改为"可选新建"并标注了适用场景（方案 B/C），解决了此前文件创建与执行策略的矛盾。

**[通过]** JSONB 列的 DDL 翻译（TEXT → JSONB）已补充到翻译规则表，默认值策略（`DEFAULT ''` → `DEFAULT NULL`）和 GIN 索引 DDL 示例均已给出。

**[通过]** 健康检查异常 HTTP 响应格式已明确：HTTP 503 + `{ status: "error", database: "disconnected", message: "数据库连接异常" }`，并解释了选择 503 的理由（负载均衡器假阳性问题）。

**[通过]** 运行时连接瞬断重试已作为文档化风险项（第 15 节）和 Phase 2+ 可选增强项（第 13.2 节）处理，不阻塞 Phase 0/1 实现。

**[通过]** 实现者可以从方案中明确知道每项改造"做什么"和"怎么做的大方向"——方案不是空洞的架构图，而是包含了具体的代码模式、改造前后对照、风险表和验收标准。

**[通过]** 技术引用具体：驱动版本（`pg` ^8.12）、KingbaseES 目标版本（V8R6+）、PostgreSQL 兼容版本（12）、SQLite 最低版本要求（3.33+ for FOR UPDATE, 3.38+ for CURRENT_TIMESTAMP）均在方案中声明。

**[严重]** 无。

**[一般]** 无。

**[轻微]** 无。

## 修改要求

- **问题**：`sql.formatDateParam()` 实现逻辑描述（4.2 节"方言统一策略"最后一段）使用 JavaScript 本地时间方法（`Date.getFullYear()`、`getMonth()`、`getDate()`、`getHours()`、`getMinutes()`、`getSeconds()`）拼接日期字符串，与方案本身的 UTC 存储决策产生时区不一致——在 UTC+8 环境下，格式化输出的字符串比数据库存储的 `CURRENT_TIMESTAMP` 值大 8 小时，导致日期范围查询边界错误。

- **原因**：此问题直接影响 `punch.js` 打卡查询等所有使用日期参数比较的功能的正确性。实现者如果严格按文档描述的实现方法（使用本地时间方法）编码，日期相关的查询将在验收测试中产生与实际 UTC 数据不匹配的错误结果——这属于"实现者按方案执行却得到错误行为"的场景，阻碍实现启动。

- **建议方向**：将实现方法描述从本地时间方法（`getHours()` 等）改为 UTC 方法（`getUTCHours()` 等），确保输出字符串语义与 `CURRENT_TIMESTAMP` UTC 输出一致。同步修正"避免了时区歧义"的表述为"统一输出 UTC 格式字符串，消除本地时区依赖"。或在函数说明中显式声明输出为 UTC 时间而非本地时间。
