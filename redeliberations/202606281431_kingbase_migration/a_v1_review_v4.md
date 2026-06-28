# 技术方案审查报告（v4）

## 审查结果

**APPROVED**

## 逐维度审查

### 1. 技术准确性

**[通过]** 驱动选型准确：`pg`（node-postgres）是 Node.js 生态最成熟的 PostgreSQL 驱动，KingbaseES 兼容 PostgreSQL 线协且官方推荐使用 PostgreSQL 兼容驱动。`pg.Pool` 原生支持连接池，`pg-promise` 确为 `pg` 的上层封装——选 `pg` 无损功能且减少依赖层级。

**[通过]** 项目依赖验证：`node-sql-parser`（v5.4.0）和 `bcryptjs`（^2.4.3）均在 package.json 中已声明，方案提议复用这两个现有依赖的决定正确且有依据。

**[通过]** SQL 方言差异清单准确：通过对比 init.sql、init_kingbase.sql 及路由层实际 SQL 代码，确认 4.1 节 7 类差异（时间戳、日期运算、JSON 提取、最后插入 ID、自增主键、布尔值、PRAGMA 查询）均真实存在且出现位置标注准确。

**[通过]** PostgreSQL/KingbaseES 特性断言正确：`RETURNING id`、`SERIAL PRIMARY KEY`、`information_schema.columns`、`::jsonb->>` 操作符、`ON DELETE SET NULL`、`CREATE TABLE IF NOT EXISTS` 均为 KingbaseES 兼容的标准 SQL 特性，不存在方案引用不存在的语法。

**[通过]** `pg` 限制认知准确：(1) `pg.Pool.query()` 不支持多语句批量执行——方案正确识别并给出分号分割方案；(2) `pg` 仅支持 `$1, $2, ...` 参数占位符——方案正确识别并给出 `?` → `$N` 状态机转换方案；(3) `statement_timeout` 不是 `pg.Pool` 构造函数配置键——方案正确识别并在 v3/v4 中修正为连接字符串 `options` 参数传递方式。

**[通过]** SQLite `CURRENT_TIMESTAMP` 可用性准确：better-sqlite3 ^12.11.1 捆绑 SQLite ~3.47，完全支持 `CURRENT_TIMESTAMP`。方案正确指出其时区语义差异（返回 UTC vs `datetime('now','localtime')` 返回本地时间）并给出 UTC 统一存储的解决决策。

**[通过]** schema 差异对比表准确：通过逐行比对 init.sql（152行）与 init_kingbase.sql（346行），确认 9.1 节所有行差异描述（字段缺失、列名差异、类型差异、约束差异、枚举值差异、索引缺失）均与实际文件内容一致，无遗漏、无误判。

**[通过]** 路由层改动点识别准确：通过 grep 验证 11 个路由文件的 SQL 模式（`db.prepare`、`db.transaction`、`PRAGMA table_info`、`json_extract`、`datetime()`、`last_insert_rowid`、`lastInsertRowid`），方案 3.5 节的改动清单与代码实际使用模式完全匹配。

### 2. 完备性

**[通过]** 需求覆盖完整：需求文档列出的 10 个技术讨论问题均被方案覆盖——(1) 驱动选型（第 2 节）、(2) 数据库访问层改造（第 3 节）、(3) SQL 方言差异（第 4 节）、(4) 双数据库支持策略（第 5 节）、(5) 渐进式迁移路径（第 6 节）、(6) 连接池管理（第 7 节）、(7) 事务处理适配（第 8 节）、(8) init_kingbase.sql 评估与完善（第 9 节）、(9) 环境配置设计（第 10 节）、(10) 前端无变动（第 12 节）。

**[通过]** 数据流闭环完整：方案覆盖了从应用启动（10.3 节初始化流程）→ 路由访问（3.5 节路由层改造）→ SQL 方言转换（4.2 节 sql.js）→ 适配层执行（3.2/3.3 节）→ 数据库后端（SQLite/KingbaseES）的完整链路，且含数据迁移（第 11 节）、回退路径（DB_TYPE=sqlite）、风险缓解（第 13 节），形成全生命周期闭环。

**[通过]** 关键实现难题均有应对方案：(1) PRAGMA table_info 替代——提供 `information_schema.columns` 完整查询 SQL；(2) 多语句 SQL 执行——提供分号分割+事务包裹方案；(3) `?` → `$N` 占位符转换——提供状态机方案含字符串字面量跳过逻辑；(4) INSERT RETURNING id——提供 node-sql-parser AST 检测+正则回退方案；(5) 种子密码哈希——提供占位符替换方案；(6) statement_timeout——提供连接字符串 options 参数方案。

**[通过]** 边界文件明确：14 节文件变更清单清晰标注了 3 个不变目录（`src/`、`server/middleware/`、`server/services/`、`server/utils/`）和 2 个不变路由文件（`upload.js`、`index.js`），避免实现者误改。

### 3. 可操作性

**[通过]** 架构决策明确：方案在第 1 节用架构图明确了适配层的位置和职责边界——路由层 → sql.js（方言）→ adapter.js（适配）→ 数据库。三个核心否定决策（不引入 ORM、不引入 Knex、前端零改动）清晰且有理有据。

**[通过]** 接口定义具体：3.1 节 `DatabaseAdapter` 接口包含 7 个方法的签名、参数类型、返回值格式。`tableInfo()` 方法的返回值格式精确到字段级别（`cid`/`name`/`type`/`notnull`/`dflt_value`/`pk`），两个适配器的实现路径各自明确。

**[通过]** 改造模式可操作：3.5 节给出改造前后代码对照模式（`db.prepare(sql).get()` → `await adapter.queryOne(sql, params)`）；8.2 节给出事务改造前后对照（同步 `db.transaction(() => {...})()` → async `adapter.transaction(async (tx) => {...})`）。实现者对每个路由文件的改造方式一目了然。

**[通过]** 渐进式路径清晰：6 节分 Phase 0/1/2/3，每阶段有具体任务清单和可验证的验收标准。Phase 0 首先用 SQLite 验证适配层不引入回归，降低了后续 KingbaseES 切换的风险。

**[通过]** 环境配置可落地：10.1 节给出完整 `.env` 示例（含 `options` 参数），10.3 节给出初始化流程图解。连接池配置（7.2 节）给出具体默认值和调优建议，实现者可直接使用。

**[通过]** 风险识别到位：13 节覆盖 8 个风险点及具体缓解措施，且每个风险对应方案中相应的处理章节，形成闭环。

**[轻微]** 建议：KingbaseAdapter `init()` 的初始化流程图中，数据存在性检查（"检查 users 表是否有数据，避免重复初始化"）位于执行初始化 SQL 之后。建议实现时将此检查前置（执行 DDL/种子数据前先检查），或为 INSERT 种子语句添加 `ON CONFLICT DO NOTHING` 以确保幂等性。当前流程描述不影响对设计意图的理解，但可能导致粗心实现者在服务重启时遇到唯一约束冲突。

## 修订历史说明

本方案已历经四轮审查修订（v1→v2→v3→v4），累计解决 2 个严重问题、7 个一般问题、4 个轻微问题。当前 v4 版本质量成熟，所有严重和一般问题均已在前序审查中修正。本次审查未发现新的严重或一般问题。
