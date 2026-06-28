# 技术方案审查报告（v1）

## 审查结果

**APPROVED**

## 逐维度审查

### 1. 技术准确性

**[通过]** 技术选型准确且经项目实际代码验证：

- **`pg` (node-postgres) 驱动选型**：正确。`pg` 是 PostgreSQL 兼容驱动，KingbaseES V8R6 基于 PostgreSQL 12 内核，兼容 `pg.Pool` 连接池。方案中关于 `pg.Pool` 的 `ssl` 参数、`connectionTimeoutMillis`、`idleTimeoutMillis`、`pool.on('error')` 事件等描述与实际 API 文档一致。
- **`node-sql-parser`（v5.4.0）**：项目 `package.json` 已依赖该包（第 26 行），方案中关于利用其解析 SQL AST 以追加 `RETURNING id` 的用法可行。
- **`express-async-errors` 包不存在**：经核查项目 `package.json`，确认未引入此包，方案第 3.6 节明确要求所有 async handler 使用 `try/catch + next(e)` 模式，与项目实际状态一致。
- **`async` 函数同步异常转 Promise rejection**：方案第 3.3 节已修正为正确的 `async` 函数体自动转换语义，替换了此前误导的 `Promise.resolve()` 描述。
- **SQL 方言差异清单**（第 4.1 节）：与实际代码中 `datetime('now','localtime')`（user.js:55,101、plan.js:50,178、articles.js:133、punch.js:125）、`json_extract()`（risk.js:153-156）、`last_insert_rowid()`（punch.js:32）等使用位置一致。
- **`CURRENT_TIMESTAMP` SQL 方言统一**：SQLite 3.38+ 和 KingbaseES 均支持 `CURRENT_TIMESTAMP`，返回 UTC 时间，方案对此语义变更的标注准确。
- **KingbaseES Docker 镜像可用性**：方案第 5.1 节已明确标注 `kingbase/kingbasees:v8r6` 为"待验证假设"，并提供 3 种替代部署方案（直接安装、使用已有测试实例、最低保障手动验证）。技术诚实度充分。
- **`FOR UPDATE` SQLite 兼容性**：SQLite 3.33+ 确实支持 `SELECT ... FOR UPDATE` 语法，方案第 8.5 节的兼容性声明准确。
- **`pg_get_serial_sequence()` 函数**：PostgreSQL/KingbaseES 内置函数，存在且适用于动态获取序列名称，方案第 12 节第 6 条的使用方式正确。

**[通过]** 已核实的关键代码匹配点：
- `checkIdempotent()` 在 `plan.js` 中位于 `parsePlanOutput()`（Dify 调用）之后（第 44 行在 37 行之后），方案第 8.5 节对此竞态窗口的分析准确。
- `insertAdminLog()` 是模块级闭包，直接使用模块级 `db` 变量（admin.js:147-156），方案第 8.3 节对该函数在事务内外的上下文矛盾分析准确。
- `database.js` 当前同步调用 `initDatabase()` 后 `module.exports.db = database`（第 34 行），`server.js` 同步调用后立即 `app.listen()`，方案第 3.5.1 节和第 3.5.2 节的改造分析准确。
- `init_kingbase.sql` 当前使用 `DROP TABLE IF EXISTS ... CASCADE`（第 9-18 行），方案第 10.2 节修正为 `CREATE TABLE IF NOT EXISTS` 的决策准确。

**[轻微]** 方案第 4.2 节 `sql.jsonField(col, path)` 仅定义单层路径提取语法，而第 4.1 节差异清单指出多路径（嵌套数组索引）场景需用 `->>` 逐级提取。二者之间缺少从"已知差异"到"函数实现"的明确衔接——实现时开发者需自行理解如何将多层路径拆解为多次单层提取调用。建议在 `sql.jsonField()` 函数说明处补充一行备注："多层路径传入时，调用方需先按路径拆解为多次单层 `->>` 调用，或使用独立辅助函数 `sql.jsonFieldDeep(col, segments)` 逐段拼接"。此不影响通过，仅为路径清晰性微调。

### 2. 完备性

**[通过]** 原始用户需求（requirement.md）的 10 个技术问题全部获得明确决策：

| # | 需求问题 | 方案决策 | 位置 |
|---|---------|---------|------|
| 1 | 驱动选型 | `pg`（node-postgres），版本 ^8.12 | 第 2 节 |
| 2 | 数据库访问层改造 | 适配层模式（DatabaseAdapter + SqliteAdapter + KingbaseAdapter），不引入 ORM/Knex | 第 1 节、第 3 节 |
| 3 | SQL 方言差异 | `server/db/sql.js` 方言辅助模块 + 两套独立 DDL 脚本 | 第 4 节 |
| 4 | 双数据库支持策略 | `DB_TYPE` 环境变量切换，开发 SQLite / 生产 KingbaseES | 第 5 节 |
| 5 | 渐进式迁移路径 | Phase 0→1→2→3 四阶段，含具体验收标准 | 第 6 节 |
| 6 | 连接池管理 | `pg.Pool`（max=10, min=2），含 SSL/TLS 配置 | 第 7 节 |
| 7 | 事务处理差异 | `adapter.transaction()` 统一 async 接口 | 第 8 节 |
| 8 | init_kingbase.sql 评估完善 | 完整差异分析（21 项不一致）+ 对齐策略 | 第 10 节 |
| 9 | 环境配置 | `.env` 新增 10 个字段 + `.env.example` 同步 | 第 11 节 |
| 10 | 前端无变动 | 确认零改动 | 第 14 节 |

**[通过]** 本轮迭代要求（a_v5_iteration_requirement.md）的 10 个问题全部获得针对性回应：

- **严重问题 1**（Phase 0 增量改造可行性）：第 3.5.2 节"双导出过渡（6 步）"方案，含每步操作、导出状态、可启动性、git 操作建议。已解决。
- **严重问题 2**（时区双重转换冲突）：第 4.2 节"Phase 0 与 Phase 2 脚本互斥关系"，方案 A/B/C 对比，推荐方案 A（Phase 2 统一转换）。第 6 节 Phase 0 描述同步修订。已解决。
- **一般问题 3**（sql.js 方言感知）：第 4.2 节"方言感知机制"，`setDialect()`/`getDialect()` + 模块级私有变量 + fail-fast 防御。已解决。
- **一般问题 4**（Docker 镜像验证）：第 5.1 节"KingbaseES Docker 镜像可用性说明"，待验证假设标注 + 3 种替代方案 + 最低保障。已解决。
- **一般问题 5**（文字精确性）：第 3.3 节修正为 `async` 函数体自动转换语义。已解决。
- **一般问题 6**（测试策略）：第 5.1.1 节"手工回归测试策略"，18 个 API 端点测试清单 + 3 个 E2E 流程 + CI 冒烟脚本。已解决。
- **一般问题 7**（停机时间估算）：第 12.2 节"停机时间估算"，公式 + 4 级数据量参考表 + 降低停机措施 + 推荐做法。已解决。
- **轻微问题 8**（序列名称验证）：第 12 节第 6 条改为 `pg_get_serial_sequence()` 动态获取 + dry-run 验证。已解决。
- **轻微问题 9**（Dify 操作步骤）：第 9.2 节补充 `difyService.js` 改造、管理后台位置、变更范围、完整 prompt 片段；第 16 节文件清单新增 `difyService.js` 条目。已解决。
- **轻微问题 10**（异常场景保障）：第 12.3 节"迁移异常处理策略"（逐表迁移 + 即时验证 + 断点续传）、第 12.4 节"回退决策触发条件"（立即回退 4 条 + 评估性回退 3 条 + 数据丢失缓解 3 项）。已解决。

**[通过]** 数据流完整闭环已确认：
- 路由层 → `getAdapter()` → `adapter.query/queryOne/execute/transaction()` → SqliteAdapter/KingbaseAdapter → better-sqlite3/pg.Pool → SQLite/KingbaseES
- 方言感知链路：`database.js:initDatabase()` → `sql.setDialect(dbType)` → 路由层调用 `sql.now()/sql.jsonField()` 等 → `getDialect()` 获取当前方言 → 返回对应 SQL 片段
- 错误传播链路：adapter 方法抛出 → async handler 的 `try/catch` → `next(e)` → Express 统一错误处理中间件

### 3. 可操作性

**[通过]** 实现者可从方案中明确知道每个阶段的"做什么"和"怎么做的大方向"：

- **Phase 0 过渡策略**（第 3.5.2 节）：6 步顺序表，每步的 database.js 导出状态、路由文件状态、可启动性均标注。实现者可逐行执行。
- **适配层接口定义**（第 3.2 节）：7 个方法签名完整，含职责说明、幂等保证要求、返回值契约。
- **路由层 async 改造清单**（第 3.6 节）：13 个文件逐文件列出需标记 async 的 handler、DB 调用数预估、特殊改动点。
- **SqliteAdapter 实现要点**（第 3.3 节）：8 个方法逐一的实现策略说明。
- **KingbaseAdapter 实现要点**（第 3.4 节）：含构造参数组装、连接池错误处理、`?` → `$1` 占位符转换状态机算法轮廓、`RETURNING id` 自动追加策略、`init()` 多语句执行流程（7 步）、事务连接释放 `try/catch/finally` 伪代码、SSL/TLS 配置分级。
- **database.js 改造轮廓**（第 3.5 节）：完整代码轮廓，含启动环境变量校验、`sql.setDialect()` 调用时机。
- **server.js 改造轮廓**（第 3.5.1 节）：完整代码轮廓（IIFE + async/await），三种方案对比表。
- **Dify 工作流操作**（第 9.2 节）：`difyService.js` 代码改动轮廓 + Dify 管理后台操作路径 + 完整 Jinja2 模板片段。
- **迁移脚本设计**（第 12 节）：时区转换代码轮廓、`pg_get_serial_sequence()` 完整 SQL、7 维度验证清单（含检查方法和验收标准）、迁移异常处理 5 步流程 + 断点续传逻辑、结构化日志格式要求。
- **CI 验证**（第 5.1.1 节）：手工回归测试 18 个端点的完整表格（测试编号/API 路径/HTTP 方法/测试场景/验证点）+ 3 个 E2E 流程（含涉及端点）+ CI 冒烟脚本的 curl 命令。
- **风险表**（第 15 节）：42 个风险项，每个含影响分析和缓解措施。

**[通过]** 技术引用具体性：
- 所有 npm 包标注了建议版本（`pg` ^8.12、`node-sql-parser` ^5.4.0）。
- KingbaseES 目标版本明确：V8R6 及以上。
- 环境变量全部列举了具体名称和默认值。
- 文件变更清单（第 16 节）列出 30 个文件的操作类型（新建/改造/重写/更新/不变）和具体说明。

## 审查依据

审查过程中验证了以下项目实际文件：
- `C:\Users\DELL\Desktop\qingruanProject2026\package.json` — 确认 `node-sql-parser` ^5.4.0 存在，`express-async-errors` 不存在，无 `"test"` 脚本
- `C:\Users\DELL\Desktop\qingruanProject2026\server.js` — 确认当前同步启动流程
- `C:\Users\DELL\Desktop\qingruanProject2026\server\db\database.js` — 确认当前 `module.exports.db` 导出模式
- `C:\Users\DELL\Desktop\qingruanProject2026\server\db\init_kingbase.sql` — 确认当前使用 `DROP TABLE IF EXISTS`
- `C:\Users\DELL\Desktop\qingruanProject2026\server\routes\plan.js` — 确认 `checkIdempotent()` 位于 `parsePlanOutput()` 之后
- `C:\Users\DELL\Desktop\qingruanProject2026\server\routes\admin.js` — 确认 `insertAdminLog()` 闭包行为和 `lastInsertRowid` 使用
- 各路由文件 `datetime()`、`json_extract()` 使用位置 — 确认方言差异清单准确
