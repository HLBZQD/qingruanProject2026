# 技术方案审查报告（v2）

## 审查结果

**REJECTED**

## 逐维度审查

### 1. 技术准确性

**[通过]** `pg` (node-postgres) 选型准确。`pg` 是 PostgreSQL 生态最成熟的 Node.js 驱动（33k+ stars），KingbaseES 官方推荐使用 PostgreSQL 兼容驱动。与 `pg-promise` 的对比分析客观，本项目自建适配层不需要 `pg-promise` 的高阶查询封装。

**[通过]** `node-sql-parser`（v5.4.0）确已存在于项目 `package.json` 依赖中。方案利用其 AST 解析能力判断 INSERT 语句并自动追加 `RETURNING id`，这是对现有资产的合理复用。解析失败时回退到正则匹配的兜底策略合理。

**[通过]** `bcryptjs`（v2.4.3）确已存在于项目依赖中。方案利用它运行时生成 `admin123` 的 bcrypt 哈希替换 `init_kingbase.sql` 中的 `__BCRYPT_HASH_PLACEHOLDER__` 占位符，这与现有 SQLite 种子数据的动态密码机制一致。

**[通过]** SQL 方言差异清单（4.1 节）与实际代码匹配。经逐文件核查：`datetime('now','localtime')` 出现在 articles.js:133、user.js:55/101、plan.js:50/178、punch.js:125；`last_insert_rowid()` 出现在 punch.js:32；`json_extract()` 出现在 risk.js:153-156；`PRAGMA table_info` 出现在 admin.js:332。路径和行号准确。

**[通过]** init.sql 与 init_kingbase.sql 的 schema 差异分析（9.1 节）与两个文件的实际内容一致。10 张表的列名差异、缺失字段、类型差异全部核验通过。

**[通过]** 路由文件清单（3.5 节）准确。项目共有 13 个路由文件，其中 11 个涉及数据库访问（admin/plan/punch/risk/articles/auth/user/assistant/doctors/diabetes/chat），2 个不涉及（upload/index）。各文件的 DB 调用数和特殊改动点描述与源代码一致。

**[通过]** `CURRENT_TIMESTAMP` 在 SQLite 3.38+ 和 PostgreSQL/KingbaseES 均受支持。`better-sqlite3` v12 捆绑 SQLite 3.45+，满足版本要求。

**[通过]** `pg.Pool` 的连接池参数（max/min/idleTimeoutMillis/connectionTimeoutMillis）描述准确，均为 `pg` 原生支持的配置项。

**[通过]** 事务改造方案（第8节）准确识别了 plan.js 的 2 处事务（`/generate`、`/adjust`）和 admin.js 的 1 处事务（`/execute`），before/after 代码示例准确反映了现有模式。

**[通过]** 种子数据差异核验通过。init_kingbase.sql 中的医生姓名（张明华/李雅文/王志强）和文章标题与 seed.sql（张明远/李静怡/王建国）不同，方案正确指出需统一为 seed.sql 的数据。

**[一般]** **`pg` 参数占位符语法差异未处理**。当前项目使用 `?` 占位符（better-sqlite3 原生支持），但 `pg`（node-postgres）仅支持 `$1, $2, ...` 格式的参数占位符。方案定义了 `DatabaseAdapter` 接口（3.1 节），路由层改造示例（3.5 节）保持 `?` 占位符不变，但 KingbaseAdapter 实现要点（3.3 节）未说明如何将 `?` 转换为 `$1, $2, ...`。若不处理此转换，所有参数化查询在 KingbaseES 上将因语法错误而失败。这是 PostgreSQL 驱动的已知差异，实现者必须明确知道适配层需要做占位符转换。

**[一般]** **`statement_timeout` 在 Pool 配置中的位置不正确**。方案在第 7.2 节将 `statement_timeout: 30000` 作为 `pg.Pool` 构造函数的顶层属性列出。`pg` 不将 `statement_timeout` 识别为 Pool 配置键——它是 PostgreSQL 服务端参数，必须通过连接字符串的 `options` 参数传递（如 `?options=-c%20statement_timeout%3D30000`）或通过连接后 `SET` 命令设置。按方案当前写法，该超时配置会被 `pg` 静默忽略，查询将无超时保护。方案在注释中写"通过 options 或连接参数设置"暗示了正确方向，但配置示例本身会误导实现者。

**[轻微]** `doctor_information` 表的两个细微差异未在 schema 对比表（9.1 节）中显式列出：(1) init.sql 中 `chat_token TEXT NOT NULL`，init_kingbase.sql 中为可空 `VARCHAR(255)`；(2) init.sql 中 `description TEXT DEFAULT ''`，init_kingbase.sql 中无默认值。对齐策略"以 init.sql 为基准"会隐式修正这些差异，但对比表的遗漏可能让实现者忽略这两个字段的约束修复。

**[轻微]** `punch_in` 表外键约束差异未在对比表中提及：init.sql 中 `FOREIGN KEY (plan_item_id) REFERENCES life_plans(id) ON DELETE SET NULL`，init_kingbase.sql 中 `FOREIGN KEY (plan_id) REFERENCES life_plans(id)` 无 `ON DELETE` 子句。对齐策略会覆盖此差异，但显式列出有助于实现者逐一核对。

### 2. 完备性

**[通过]** 需求文档列出的 10 个技术问题全部有对应的方案说明：
1. 驱动选型 → 第2节，决策：`pg`
2. 数据库访问层改造 → 第3节，决策：自定义适配层，不引入 ORM/Knex
3. SQL 方言差异 → 第4节，决策：`sql.js` 方言辅助模块
4. 双数据库支持策略 → 第5节，决策：开发 SQLite + 生产 KingbaseES
5. 渐进式迁移路径 → 第6节，Phase 0-3 四阶段方案
6. 连接池管理 → 第7节，SQLite 保持单连接 + KingbaseES `pg.Pool`
7. 事务处理差异 → 第8节，async 统一包装
8. init_kingbase.sql 评估 → 第9节，逐表对比 + 重写策略
9. 环境配置 → 第10节，`.env` 完整设计
10. 前端无变动 → 第12节，确认零改动

**[通过]** 数据流闭环完整：应用启动 → initDatabase() 读取 DB_TYPE → 实例化对应 Adapter → 初始化建表/种子数据 → 路由层通过 getAdapter() 获取实例 → query/queryOne/execute/transaction → 数据库。两条路径（SQLite / KingbaseES）在适配层接口统一，路线清晰。

**[通过]** 数据迁移方案（第11节）覆盖了所有表的 datetime 字段时区转换，包含 9 张表的具体字段名、转换伪代码、以及 FK 依赖顺序的迁移序列。这是需求中未显式要求但实际部署必须的考量，属于合理的主动覆盖。

**[通过]** 风险与缓解表（第13节）覆盖了同步→异步竞态、双库行为差异、时区语义、连接不可用、迁移数据丢失、分号分割误判等 6 项风险，每项有具体缓解措施。

### 3. 可操作性

**[通过]** 适配层接口（3.1 节）定义了 7 个方法，每个方法明确了输入输出类型和语义。`tableInfo()` 方法的返回值格式（与 PRAGMA 对齐的六字段结构）给出了明确约定，KingbaseES 端的 `information_schema` 查询 SQL 完整可执行。

**[通过]** KingbaseAdapter.init() 的多语句 SQL 执行策略（3.3 节）给出了 7 步详细流程：读取文件 → 替换占位符 → 分号分割 → 过滤空语句 → 事务内逐条执行 → 幂等检查。分号分割的注意事项（字符串字面量、注释处理）和备选方案（拆分为 DDL/种子两个文件）均已说明。

**[通过]** SQL 方言辅助函数表（4.2 节）给出了每个函数的 SQLite 输出和 KingbaseES 输出，`sql.now()`、`sql.jsonField()`、`sql.jsonFieldAs()`、`sql.relativeDate()` 的用法和输出明确。`sql.relativeDate()` 同时给出了更简单的替代方案（应用层计算日期传入参数），为实现者提供了选择空间。

**[通过]** 路由层改动模式（3.5 节）给出了统一的 before/after 代码示例，各文件的特殊改动点（PRAGMA → tableInfo()、事务 → adapter.transaction()、datetime → sql.now() 等）在改动表中逐一标注。

**[通过]** 环境配置（第10节）给出了完整的 `.env` 字段设计，包括切换开关 DB_TYPE、SQLite 路径、KingbaseES 连接（支持 URL 和分离参数两种方式）、连接池参数。初始化流程图（10.3 节）清晰展示了 SQLite 和 KingbaseES 两条路径的执行步骤差异。

**[通过]** 文件变更清单（第14节）以表格形式列出了所有新建/改造/重写/更新/不变的文件，操作类型和说明明确，不变文件（前端、middleware、services、utils、upload.js、index.js）也明确列出。

## 修改要求

- **问题 1**：KingbaseAdapter 未处理 `pg` 驱动的参数占位符差异（`?` vs `$1`）
- **原因**：`pg`（node-postgres）仅支持 `$1, $2, ...` 格式的参数占位符，而当前项目全部使用 `?` 占位符。适配层接口保持 `?` 风格以减少路由层改动是合理决策，但 KingbaseAdapter 的 query/queryOne/execute 方法必须将 SQL 中的 `?` 转换为 `$1, $2, ...` 才能正确传递给 `pg.Pool.query()`。若未说明此转换需求，实现者编写的 KingbaseAdapter 将在首次参数化查询时失败，阻塞 KingbaseES 适配层的功能验证。
- **建议方向**：在 3.3 节 KingbaseAdapter 实现要点中增加占位符转换说明。简单方案：在 query/execute 等方法内部用计数器将第 N 个 `?` 替换为 `$N`（需处理字符串字面量和注释中的 `?`，可用简单状态机或直接依赖 `pg` 的 `pg-format` 等微小辅助）。或者改用 `pg` 的原生 `$1` 风格，但这会增加路由层改动量。推荐前一种方案，与"路由层最小改动"原则一致。

- **问题 2**：`statement_timeout` 在 `pg.Pool` 构造函数中的配置方式不正确
- **原因**：`pg` 的 Pool 构造函数不将 `statement_timeout` 识别为有效配置键。当前写法下该值会被静默忽略，生产环境的 KingbaseES 查询将无语句超时保护。虽然方案在同行的注释中写了"通过 options 或连接参数设置"，但配置示例本身具有误导性，实现者可能照抄此配置而遗漏正确设置。
- **建议方向**：修正 7.2 节的 Pool 配置示例。两种正确方式：(1) 在连接字符串中追加 `?options=-c%20statement_timeout%3D30000`；(2) 若使用分离参数配置（DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME），则在 `DATABASE_URL` 组装逻辑中拼接 `options` 参数。同时更新 10.1 节 `.env` 示例中的 `DATABASE_URL` 格式说明，给出带 `options` 参数的完整连接字符串示例。
