# 技术方案审查报告（v2）

## 审查结果

**REJECTED**

## 逐维度审查

### 1. 技术准确性

**[通过]** 适配层接口设计方案中的技术选型（`pg` 驱动、`better-sqlite3`、`node-sql-parser`）均确实存在且适用于本场景。`pg.Pool` 的连接池配置参数（`max`、`min`、`idleTimeoutMillis`、`connectionTimeoutMillis`、`ssl`）描述准确。`pg.types.setTypeParser()` 对 OID 1114（timestamp）和 1184（timestamptz，PostgreSQL 12 标准）的用法正确。`RETURNING id` 语法、`FOR UPDATE` 行级锁、`information_schema.columns` 查询、`pg_get_serial_sequence()` 等 PostgreSQL/KingbaseES 特性描述准确。

**[通过]** 项目实际代码验证：`sseProxy.js` 函数签名（`function proxyDifySSE({ apiKey, query, conversationId, userId, res, req })`，非 async，单解构对象参数，第 4 行）、第 26 行硬编码 `inputs: {}` 与方案描述完全一致。`difyService.js` 的 `callWorkflowBlocking(apiKey, inputs, workflowType)` 签名（第 84 行）、`httpRequest()` 自定义函数（第 37 行）与方案 v10 修正后描述一致。`package.json` 中 `node-sql-parser`（^5.4.0）已安装、无 `express-async-errors` 包、无 `pg` 包、无 `"test"` 脚本——均与方案声明一致。

**[通过]** `init.sql` 第 145 行确为 `CREATE INDEX IF NOT EXISTS idx_plans_user_plan ON life_plans(user_id, plan_id)`（普通索引，非 UNIQUE）。`init_kingbase.sql` 第 9-18 行确实使用 `DROP TABLE IF EXISTS ... CASCADE`。`server.js` 第 3 行同步调用 `initDatabase()`（无 await）。`dateRange.js` 第 18 行输出 `endDate + 'T23:59:59'` 格式（含 T 分隔符）。`admin.js` 第 241 行 `query_table` 分支确实使用字符串插值 `sql += ' WHERE ${params.where}'`。`plan.js` 第 44 行 `checkIdempotent()` 确实位于 Dify 调用（第 28、37 行）之后。以上方案对实际代码状态的诊断全部准确。

**[一般] KingbaseES `CURRENT_TIMESTAMP` 时区依赖未讨论，统一 UTC 存储承诺无法保证**

方案将 `sql.now()` 统一输出 `CURRENT_TIMESTAMP` 作为关键简化决策（第 4.2 节），并以此为基石推导出整个 UTC 存储策略（Phase 0 行为变更、Phase 2 时区迁移转换、`sql.formatDateParam()` 的 UTC 方法要求）。但方案全文始终隐含假设 `CURRENT_TIMESTAMP` 在 KingbaseES 中返回 UTC——

而事实上，PostgreSQL/KingbaseES 的 `CURRENT_TIMESTAMP` 返回的是**服务器时区（`timezone` 参数）下的当前事务开始时间**。若 KingbaseES 服务器时区配置为 `Asia/Shanghai`（UTC+8，国产数据库在中国部署场景下的常见默认值），`CURRENT_TIMESTAMP` 将返回 UTC+8 时间，与 SQLite 的 `CURRENT_TIMESTAMP`（始终返回 UTC）相差 8 小时。

此遗漏直接影响以下核心路径：
1. **Phase 1 KingbaseES 下新写入的 timestamp 值**：若服务器非 UTC 时区，新数据将以本地时间存储而非 UTC——与方案"统一 UTC 存储"的基本承诺直接矛盾。
2. **Phase 2 迁移脚本的时区转换逻辑**：迁移脚本将 SQLite 本地时间减去 8 小时转换为 UTC 后写入 KingbaseES。但若 KingbaseES 新数据又通过 `CURRENT_TIMESTAMP` 写入了服务器时区的本地时间，则迁移后数据库内同时存在 UTC（迁移来的旧数据）和本地时间（`CURRENT_TIMESTAMP` 新写入的数据）——与方案试图消除的"混合时间戳"问题性质相同。
3. **`sql.formatDateParam()` 的 UTC 方法逻辑**：该函数使用 `getUTC*` 方法输出 UTC 字符串，假设数据库端也是 UTC 存储。若 KingbaseES 服务器时区非 UTC，应用层传入的 UTC 参数字符串与数据库列中存储的本地时间字符串在字符串比较时产生 8 小时偏差（与方案第 4.2 节讨论的 `.toISOString()` 不兼容问题同源）。

**建议方向**：
- 在第 4.2 节 `sql.now()` 决策中增加"KingbaseES 服务器时区配置要求"子段，明确要求 KingbaseES 服务器 `timezone` 参数必须设置为 `UTC`
- 在第 7.2 节连接池管理中增加时区验证步骤：KingbaseAdapter 初始化后执行 `SELECT current_setting('timezone')` 并打印日志，若非 UTC 则输出警告
- 在第 15 节风险表中新增对应风险项
- 在第 5.1 节 CI/Docker 部署配置中明确容器或 KingbaseES 实例的时区设置（如 Docker 环境变量 `TZ=UTC` 或 PostgreSQL 配置 `timezone = 'UTC'`）

**[轻微] SQLite `CURRENT_TIMESTAMP` 版本号引用不精确**

方案第 4.2 节（第 667 行）称"SQLite 3.38+ 和 KingbaseES 均支持该函数"。`CURRENT_TIMESTAMP` 在 SQLite 中自 3.0 版本起即已支持（2004 年），远早于 3.38（2022 年）。虽然"3.38+"的陈述本身为真（3.38 确实支持），但此版本号暗示了一个不存在的兼容性门槛——可能使实现者对 SQLite 版本产生不必要的顾虑。鉴于 `better-sqlite3 ^12.11.1` 捆绑的 SQLite 版本远高于 3.38，此问题无实际影响，仅为文档表述精度问题。

### 2. 完备性

**[通过]** 用户需求（`requirement.md`）中的 10 个技术问题（驱动选型、访问层改造、SQL 方言差异、双数据库策略、渐进式迁移、连接池、事务处理、init_kingbase.sql 评估、环境配置、前端无变动）在方案中均有对应的决策和说明章节。数据流（应用启动 → adapter 初始化 → 路由层查询 → 数据库 → 响应）形成了完整闭环，未见遗漏。

**[通过]** 方案的渐进式迁移路径（Phase 0/1/2/3）覆盖了从开发期（SQLite 适配层验证）到生产切换（KingbaseES 部署、数据迁移、灰度验证）再到远期裁剪（移除 SQLite）的完整生命周期。每个 Phase 的验收标准明确列出了量化条目（Phase 0：18 个 API 端点 + 3 个 E2E 流程；Phase 1：双库对比 + 性能基准 + Dify 对话测试）。

**[通过]** 非功能性维度覆盖完整：安全（传输加密、凭据管理、最小权限、SQL 注入防护、日志脱敏）、监控（连接池指标、慢查询日志、健康检查、错误追踪）、运维（备份、停机时间、版本升级、字符集、优雅关闭）。风险表（第 15 节）已累计到 50+ 个风险项，每个风险项含影响描述、缓解措施和对应的方案章节引用。

**[通过]** Phase 0 过渡策略（双导出方案，6 步顺序）解决了"database.js 导出变更与 11 个路由文件逐文件改造"的工程可行性矛盾。SqliteAdapter 暴露 `adapter.db` 属性、database.js 同时导出 `db` 和 `getAdapter()` 的设计确保每个中间步骤均可启动和自测。此方案经实际代码验证，工程可行。

**[通过]** admin chat 路径的 `db_type` 变量传递方案（`sseProxy.js` 函数体内部 `inputs: {}` → `inputs: { db_type: process.env.DB_TYPE || 'sqlite' }`，不修改函数签名）经实际代码验证——`proxyDifySSE` 的函数签名（单解构对象，非 async）确认匹配，三个调用方（`admin.js`、`assistant.js`、`chat.js`）零改动，方案可直接实施。

### 3. 可操作性

**[通过]** 适配层接口定义（`DatabaseAdapter`，第 3.2 节）给出了 8 个方法的完整签名、参数类型、返回值类型和契约约束（如 `transaction(fn)` 的自动 commit/rollback、`tableInfo()` 的统一 PRAGMA 格式映射、`init()` 的幂等保证）。实现者可以此接口契约为基准独立实现 `SqliteAdapter` 和 `KingbaseAdapter`。

**[通过]** 路由层改造模式明确且统一：将 `db.prepare(sql).run/get/all()` 替换为 `await adapter.query/queryOne/execute()`，handler 标记 async 并包裹 `try/catch + next(e)`。第 3.6 节逐文件列出了 async 改造清单（含 handler 函数名和改造原因），第 16 节文件变更清单给出了每个文件的改造说明。

**[通过]** KingbaseAdapter 的关键实现细节给出到伪代码级别：`pool.on('error')` 事件处理（第 3.4.2 节）、参数占位符转换状态机（第 3.4.4 节，含字符串字面量跳过和注释处理说明）、`transaction()` 的 `try/catch/finally` 连接释放保护（第 3.4.4 节）、`init()` 的多语句分割策略（第 3.4.5 节，含分号/注释/字符串处理、事务内 DDL 验证方法、拆分 DDL/种子文件的备选方案）、timestamp 类型解析器配置（第 3.4.8 节，含 OID 值和启动验证推荐）。实现者不需要自行探索这些关键路径。

**[通过]** 数据迁移方案（第 12 节）给出了详细的迁移验证维度（行数对比、抽样逐列对比、时区转换验证、FK 有效性、非空约束、JSON 有效性、SERIAL 序列验证）、停机时间估算公式、断点续传策略、回退决策触发条件和逆向迁移脚本框架。运维方可以从方案中明确知道迁移的操作步骤、验证方法和回退路径。

**[轻微] PostgreSQL `timestamptz` 字符串表示格式与 SQLite `CURRENT_TIMESTAMP` 输出格式的细微差异未讨论**

方案通过 `pg.types.setTypeParser` 将 timestamp 类型解析为原始字符串（第 3.4.8 节），确保与 SQLite 的字符串兼容性。但 PostgreSQL 的 timestamp 文本输出格式受 `DateStyle` 服务器参数影响——默认 `ISO, MDY` 设置下，含非零微秒的 timestamp 值输出格式为 `"2025-06-28 06:30:00.123456"`（含微秒），而 SQLite 的 `CURRENT_TIMESTAMP` 输出始终为 `"2025-06-28 06:30:00"`（秒级精度）。虽然本项目中 `CURRENT_TIMESTAMP` 生成的 timestamp 微秒部分通常为零（输出格式一致），但若存在通过应用层显式传入的含微秒的时间戳（如 `'2025-06-28 06:30:00.123456'::timestamp`），两端格式将不一致。此场景在当前项目中出现概率极低（应用层不生成微秒级时间戳），但作为"前端代码零变动"承诺的边界条件值得在方案中标注。Phase 1 双库对比测试中建议对 datetime 字段的字符串长度做一次抽样验证。

## 修改要求

- **问题**：KingbaseES `CURRENT_TIMESTAMP` 在非 UTC 时区下返回本地时间，与方案"统一 UTC 存储"核心承诺矛盾。方案全文未讨论 KingbaseES 服务器时区配置要求。
- **原因**：此遗漏将导致：(1) Phase 1 下 KingbaseES 新写入数据可能为本地时间而非 UTC，与方案决策直接矛盾；(2) Phase 2 迁移后数据库内同时存在 UTC（迁移来的旧数据）和本地时间（`CURRENT_TIMESTAMP` 新写入的数据），重新引入"混合时间戳"问题；(3) `sql.formatDateParam()` 输出的 UTC 参数字符串与数据库列中存储的本地时间字符串在比较时产生 8 小时偏差。实现者若不加验证地按方案实施，部署到默认时区为 Asia/Shanghai 的 KingbaseES 实例时，时间数据将全部偏移 8 小时。
- **建议方向**：(1) 在第 4.2 节 `sql.now()` 决策中增加"KingbaseES 服务器时区配置要求"子段，明确要求 `timezone = 'UTC'`；(2) 在 KingbaseAdapter 初始化后增加时区验证查询 `SELECT current_setting('timezone')`，非 UTC 时输出警告；(3) 在第 15 节风险表中新增对应风险项；(4) 在 CI/Docker 部署配置中明确容器或实例的时区设置方式。
