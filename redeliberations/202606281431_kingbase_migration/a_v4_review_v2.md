# 技术方案审查报告（v2）

## 审查结果

APPROVED

## 逐维度审查

### 1. 技术准确性

**[通过]** 所有关键技术选型均真实存在且适用。`pg`（node-postgres）是成熟的 PostgreSQL 兼容驱动，KingbaseES 官方推荐使用。`node-sql-parser`（v5.4.0）已在项目 `package.json` 第 26 行确认存在，方案中将其用于运行时 AST 解析检测 INSERT 语句的方案可行。

**[通过]** 方案对项目现有代码状态的描述准确。经实际代码核实：(1) `insertAdminLog` 确为模块级闭包，在 `admin.js:147` 定义，在事务回调内（`admin.js:98`）被调用，使用模块级 `db` 变量；(2) `checkIdempotent` 在 `plan.js:44` 调用，位于 `parsePlanOutput`（`plan.js:37`）之后，方案 8.5 节对竞态窗口位置的分析正确；(3) `auth.js` 的 `/register` handler（`auth.js:11`）未标记 async、无 try/catch 包裹；(4) `index.js` 的 `/health` 端点（`index.js:4-6`）为静态 JSON 响应，不检查数据库连接；(5) `init_kingbase.sql` 使用 `DROP TABLE IF EXISTS ... CASCADE`（第 9-18 行）、中文枚举值（`'饮食'`、`'运动'`、`'已完成'`、`'未完成'`）、无索引定义；(6) 项目 `package.json` 中未引入 `express-async-errors`。

**[通过]** 方案对语言特性能力的判断正确。SQLite 3.38+ 支持 `CURRENT_TIMESTAMP`，SQLite 支持 `SELECT ... FOR UPDATE` 语法（虽在 WAL 模式下为 no-op 但不报错），PostgreSQL/KingbaseES 支持 `RETURNING` 子句、`information_schema.columns` 查询、`SERIAL` 类型、`SELECT setval()`。

**[通过]** `statement_timeout` 的连接字符串 `options` 参数传递方式正确，`pg.Pool` 不会将其作为构造函数属性处理，需通过连接字符串或连接后 SET 语句设置，方案在 7.2.1 节给出的三种方式对比及推荐准确。

**[通过]** `pg.Pool` 的 `error` 事件监听必要性判断正确。方案 3.4.2 节指出不监听会导致 Node.js 进程崩溃，并给出了正确的处理策略（仅记录日志、不主动退出、依赖 pg.Pool 自动重连）。

### 2. 完备性

**[通过]** 原始需求（`requirement.md`）提出的全部 10 个技术问题均有对应的方案章节覆盖：驱动选型（第 2 节）、数据库访问层改造（第 3 节）、SQL 方言差异（第 4 节）、双数据库支持策略（第 5 节）、渐进式迁移路径（第 6 节）、连接池管理（第 7 节）、事务处理差异（第 8 节）、init_kingbase.sql 评估（第 10 节）、环境配置（第 11 节）、前端确认（第 14 节）。

**[通过]** 迭代需求（`a_v4_iteration_requirement.md`）中全部 6 个问题均已解决，每个问题在方案相应章节中有明确的修改说明：

- 问题 1（严重，insertAdminLog 事务上下文矛盾）→ 8.3 节改造要求，函数签名改为 `async function insertAdminLog(adapter, ...)`，15 节风险表新增风险项，16 节文件变更清单补充说明
- 问题 2（中等，plan.js 幂等锁竞态窗口）→ 8.5 节新增子节，给出三种方案对比及推荐（方案 1 + 方案 3），3.6 节和 16 节标注 checkIdempotent 位置调整
- 问题 3（中等，Dify 端协同）→ 9.2 节新增"Dify 端同步变更"子节，含 Jinja2 模板 prompt 示例，6 节 Phase 1 验收标准新增端到端测试条目
- 问题 4（中等，dispatchParameterizedQuery async 改造）→ 9.2 节新增 5 个改造要点，tool_name 适配表新增"函数整体"行，15 节和 16 节补充说明
- 问题 5（轻微，ROLLBACK 连接泄漏）→ 3.4.4 节新增 try/catch/finally 实现轮廓，三个关键设计点说明，15 节新增风险项
- 问题 6（轻微，auth.js error handling）→ 3.6 节明确 handler 改造模式，核实项目无 express-async-errors，15 节新增风险项，16 节补充说明

**[通过]** 数据流形成完整闭环：启动流程（3.5 节 + 3.5.1 节 server.js 改造）→ 路由层访问（3.6 节 async 改造清单 + adapter 调用）→ 适配层翻译（3.3/3.4 节 SqliteAdapter/KingbaseAdapter 实现要点）→ 方言辅助（4.2 节 sql.js）→ 数据库执行。迁移路径（12 节）覆盖正向迁移 + 验证 + 逆向回退框架。

**[通过]** 方案覆盖了非功能性维度（13 节）：安全（传输加密 SSL/TLS、凭据管理、最小权限、SQL 注入防护、日志脱敏）、监控（连接池指标、慢查询日志、健康检查、错误追踪）、运维（备份策略、停机时间、版本升级、性能基准）。

### 3. 可操作性

**[通过]** 适配层接口定义明确（3.2 节），含完整方法签名、返回值类型、契约说明。SqliteAdapter 和 KingbaseAdapter 的实现要点分别列出（3.3 节和 3.4 节），关键难点（参数占位符转换、RETURNING id 自动追加、多语句 SQL 分割、事务连接释放保护）均有具体实施方案。

**[通过]** 路由层改动范围明确。3.6 节提供了逐文件的 async 改造清单表格（12 个文件 / 13 个文件含 index.js），标注了每个 handler 的改造原因。16 节提供完整的文件变更清单（新建/改造/重写/更新/不变），每个文件的改动要点清晰。

**[通过]** 阶段划分清晰。Phase 0-3 各有明确的验收标准（6 节），Phase 0 的前置步骤（UTC 转换脚本）和执行顺序明确，Phase 1 的双库对比指标具体（响应时间 P50/P95/P99、Dify 端到端测试），Phase 2 的回滚步骤逐条可执行。

**[通过]** 技术引用具体。`pg` 版本建议 ^8.12，`node-sql-parser` 版本已在 package.json 锁定 v5.4.0，KingbaseES 目标版本 V8R6+。环境变量设计完整（11.1 节），连接池参数有默认值和说明。SSL/TLS 配置按环境分级（开发/测试/生产），每个级别有明确的配置值。

**[通过]** 疑难场景有代码级指南。(1) 参数占位符转换的状态机方案描述包含跳过字符串字面量的逻辑；(2) `transaction()` 的 try/catch/finally 伪代码完整可执行；(3) `sql.now()` / `sql.jsonField()` / `sql.jsonFieldAs()` 的 SQLite/KingbaseES 双端输出已在 4.2 节表格中给出；(4) `tableInfo()` 的 KingbaseES 端 SQL 查询完整给出（3.2 节）；(5) UTC 转换脚本的 SQL 逐表给出（4.2 节）；(6) SERIAL 序列重置的 setval 语句模板给出（12 节）。

**[轻微]** `tableInfo()` 方法中 `information_schema.columns` 查询使用 `WHERE table_name = $1`。PostgreSQL/KingbaseES 中 `information_schema.columns.table_name` 对未加引号的标识符存储为小写。当前项目所有表名均为小写，实际无问题。建议在方案中注明此大小写敏感性，以防将来新增含大写表名时查询失败。

**[轻微]** `sql.jsonField(col, path)` 辅助函数设计为单层路径（`col::jsonb->>'path'`）。方案 4.1 节已提及多层级路径需使用 `->>` 逐级提取，但未在 `sql.js` 接口中提供多层级路径的辅助函数。若 `risk.js:154-156` 中的 `json_extract` 调用使用了嵌套路径（如 `$.a.b`），实现者需自行处理运算符链式调用。建议在方案 4.2 节的 `sql.jsonField` 说明中补充多层级路径的推荐处理方式（如额外提供 `sql.jsonFieldNested(col, ...pathSegments)` 函数）。
