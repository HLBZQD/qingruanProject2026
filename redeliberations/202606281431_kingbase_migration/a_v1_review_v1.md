# 技术方案审查报告（v1）

## 审查结果

**REJECTED**

## 逐维度审查

### 1. 技术准确性

**[通过]** 驱动选型 `pg`（node-postgres）作为 KingbaseES 驱动：`pg` 是 PostgreSQL 兼容驱动，KingbaseES 官方推荐使用 PostgreSQL 兼容驱动，选型合理。`pg.Pool` 原生支持连接池，API 干净直接，正确。

**[通过]** SQLite `CURRENT_TIMESTAMP` 兼容性：SQLite 3.38+ 确实支持 `CURRENT_TIMESTAMP`，方案中 `sql.now()` 统一输出 `CURRENT_TIMESTAMP` 在语法层面可行。

**[通过]** `json_extract` → `col::jsonb->>'path'` 的方言翻译正确，PostgreSQL/KingbaseES 的 JSONB 操作符映射准确。

**[通过]** `RETURNING id` 作为 PostgreSQL 获取插入 ID 的方式正确，优于 SQLite 的 `last_insert_rowid()`。

**[通过]** `DB_TYPE=sqlite` / `DB_TYPE=kingbase` 环境变量切换方案可行，适配层在 `initDatabase()` 阶段读取并实例化对应 adapter 的架构清晰。

**[通过]** 前端零变动的判断正确：经验证，API 接口的请求/响应格式不变、路由路径不变、前端不直接访问数据库，确认无需修改 `src/` 目录。

**[通过]** `server/middleware/` 零变动的判断正确：经验证，middleware 目录下所有文件均无 `require('../db/database')` 或任何数据库引用，确认无需修改。

**[严重]** init_kingbase.sql 多语句执行方案缺失。`pg` 驱动的 `pool.query()` **不支持**单次调用执行多条 SQL 语句（这是 PostgreSQL 驱动的安全设计，防止 SQL 注入）。而 `init_kingbase.sql` 是一个包含多条 CREATE TABLE、CREATE INDEX、INSERT 语句的脚本文件。SQLite 通过 `db.exec()` 可以一次性执行整个 SQL 文件，但 `pg` 没有等价方法。技术方案在 10.3 节仅说"执行 init_kingbase.sql"，未说明 KingbaseAdapter 如何解析和执行多语句 SQL 脚本（是按 `;` 分割逐条执行、还是引入迁移工具、还是其他方案）。这会直接阻塞 KingbaseAdapter.init() 的实现。

**[严重]** `PRAGMA table_info` 替换方案存在内部不一致。方案在 3.5 节（路由层改动范围表）和 14 节（文件变更清单）中要求将 `admin.js` 中的 `PRAGMA table_info(${params.table})` 转换为 "adapter 方法"，但 3.1 节定义的 `DatabaseAdapter` 接口（query / queryOne / execute / transaction / healthCheck / close）中**没有**表结构查询方法。实现者无法从方案中得知应该新增什么方法、该方法的签名和返回值格式是什么。这是一个方案内部矛盾。

**[一般]** `datetime()` 带修饰符的日期运算未覆盖。经验证，`punch.js:125` 存在 `datetime('now', 'localtime', '-7 days')` 这种带日期运算的用法（查询近7天记录）。方案 4.2 节的 `sql.now()` 只能处理简单当前时间戳替换，无法处理日期加减运算。在 PostgreSQL 中需要用 `CURRENT_TIMESTAMP - INTERVAL '7 days'`。方案未提供日期运算的方言辅助函数（如 `sql.dateSub(days)`），实现者遇到此场景时缺乏指导。

**[一般]** 时区数据迁移未纳入迁移计划。方案在 4.2 节明确了"统一使用 UTC 存储"的决策，且承认现有数据使用 `datetime('now','localtime')` 存储的是本地时间。但在 11 节数据迁移方案中，**未提及**迁移过程中需要将现有本地时间数据转换为 UTC。如果不做转换，迁移后的数据库中将同时存在本地时间和 UTC 时间的数据，造成时间字段混乱。

**[一般]** `RETURNING id` 自动追加的实现机制不明确。方案 3.3 节说 KingbaseAdapter.execute() 会"自动追加 RETURNING id（如果 SQL 中未包含）"。这要求对 SQL 语句进行解析：判断是否为 INSERT 语句、是否已包含 RETURNING 子句。方案未说明解析策略（正则匹配？SQL 解析器？）。当前项目已依赖 `node-sql-parser`（package.json 中存在），但方案中未提及可利用此依赖。

**[轻微]** 项目已有 `node-sql-parser` 依赖（package.json 中已安装），该库支持 SQL 方言解析和转换。方案选择了手动编写 `sql.js` 辅助函数的路径而非利用此现有依赖。这不影响正确性，但实现者可考虑复用已有依赖以降低维护成本。建议在方案中至少提及此依赖的存在及不使用它的理由。

**[轻微]** 方案 3.5 节称"所有路由文件（约 11 个文件）"，实际 `server/routes/` 下有 13 个文件。未列入的 `upload.js` 和 `index.js` 经验证确实不使用数据库，不影响改动范围判断，但计数不够精确。

### 2. 完备性

**[通过]** 需求中的 10 个技术问题全部有对应方案：驱动选型（问题1→第2节）、访问层改造（问题2→第3节）、SQL方言差异（问题3→第4节）、双库策略（问题4→第5节）、渐进迁移（问题5→第6节）、连接池（问题6→第7节）、事务处理（问题7→第8节）、init_kingbase评估（问题8→第9节）、环境配置（问题9→第10节）、前端无变动（问题10→第12节）。

**[通过]** 数据流形成完整闭环：应用启动→initDatabase()→实例化Adapter→执行init→导出adapter→路由层通过getAdapter()访问→query/queryOne/execute/transaction→底层驱动执行→返回结果。

**[通过]** 渐进式迁移路径（Phase 0→1→2→3）设计合理，每个阶段有明确的验收标准和回退机制。Phase 0（适配层+SQLite验证）确保不影响现有功能的设计约束得到满足。

**[通过]** 文件变更清单（第14节）覆盖全面：新建3个文件、改造11个路由文件、重写init_kingbase.sql、新建迁移脚本、更新配置文件。不变更文件清单也明确列出。

**[通过]** DDL 层面的 schema 差异分析（第9.1节）细致完整：逐表对比了 init.sql 与 init_kingbase.sql 的列名差异、类型差异、约束差异、种子数据差异，且与实际代码验证一致。

**[通过]** 连接池配置（第7节）给出了具体参数值和环境变量设计，`max=10` 对中小型应用合理，配置项覆盖了连接数上下限、空闲回收、连接超时、语句超时等关键参数。

**[一般]** KingbaseES 种子数据的密码哈希生成机制缺失。SQLite 的 seed.sql 使用 `$2a$10$PLACEHOLDER_BCRYPT_HASH_GOES_HERE` 占位符，由 `database.js` 在运行时用 `bcryptjs` 实时生成 `admin123` 的哈希替换。方案说将种子数据统一到 `init_kingbase.sql`，但 KingbaseAdapter.init() 的执行方式未说明是否支持类似的运行时占位符替换。如果直接将 bcrypt 哈希硬编码到 SQL 文件中，则失去了灵活性（更换默认密码需要重新生成哈希）。

### 3. 可操作性

**[通过]** 适配层接口定义（3.1节）清晰：5个核心方法 + healthCheck + close，每个方法的输入输出语义明确。实现者知道要做什么。

**[通过]** SqliteAdapter（3.2节）和 KingbaseAdapter（3.3节）的实现要点分别描述了关键适配逻辑：Promise 包裹、execute 的 ID 获取机制、transaction 的 client 管理模式。实现者有明确方向。

**[通过]** 方言辅助函数表（4.2节）给出了每个函数的 SQLite 输出和 KingbaseES 输出，实现者可以直接按照映射表编写代码。

**[通过]** 环境变量设计（10.1节）完整，包含 DB_TYPE 切换开关、SQLite 路径、KingbaseES 连接串（支持 URL 和分离字段两种方式）、连接池参数。`.env.example` 同步更新也已提及。

**[通过]** 事务处理适配（8.2节）给出了改造前后的代码对比，async/await 模式清晰，仅影响 2 个文件 3 处事务，改动范围可控。

**[通过]** 风险与缓解表（13节）覆盖了 5 个关键风险：竞态条件、行为差异、时区差异、连接不可用、数据丢失。每个风险有对应的缓解措施。

**[严重]** 同维度1中"init_kingbase.sql多语句执行方案缺失"问题——实现者接到任务后，无法确定 KingbaseAdapter.init() 应如何执行 multi-statement 的 init SQL 脚本，这是一个明确的实现路径阻断。

**[严重]** 同维度1中"PRAGMA table_info 替换方案内部不一致"问题——实现者在改造 admin.js 时，面对 PRAGMA table_info 的替换无从下手，因为方案既要求用 adapter 方法替代，又没有在 adapter 接口中定义对应方法。

**[一般]** 同维度1中"datetime() 带修饰符的日期运算未覆盖"和"RETURNING id 自动追加机制不明确"问题——这两点在实现时会遇到，虽不至于完全阻断（实现者可以自行设计扩展），但缺乏指导会增加实现偏差的风险。

## 修改要求

- **问题1**：init_kingbase.sql 多语句执行方案缺失
- **原因**：`pg.Pool.query()` 单次只执行一条 SQL 语句，无法像 SQLite 的 `db.exec()` 那样一次性执行整个 .sql 脚本文件。KingbaseAdapter.init() 的实现路径因此阻断——实现者不知道应如何解析和执行 init_kingbase.sql 中的多条 CREATE TABLE / CREATE INDEX / INSERT 语句。
- **建议方向**：明确 KingbaseAdapter.init() 的执行策略。可选方案包括：(a) 使用 `fs.readFileSync` 读取 SQL 文件，按 `;` 分割后逐条执行，注意处理字符串字面量中的分号；(b) 将 init_kingbase.sql 拆分为每个语句一个文件，按顺序执行；(c) 引入轻量级 SQL 脚本执行工具。推荐方案 (a) 并说明分号分割的注意事项。

- **问题2**：PRAGMA table_info 替换方案内部不一致
- **原因**：方案多处提到 admin.js 的 `PRAGMA table_info(table)` 需要转换为 adapter 方法，但 DatabaseAdapter 接口（第3.1节）中未定义对应的表结构查询方法。实现者无法确定调用什么方法、传什么参数、得到什么返回值。
- **建议方向**：在 DatabaseAdapter 接口中新增 `tableInfo(tableName)` 方法。SQLite 实现调用 `PRAGMA table_info(table)` 并返回统一格式（如 `[{cid, name, type, notnull, dflt_value, pk}]`）；KingbaseES 实现查询 `information_schema.columns` 并映射到相同格式。明确定义返回值的字段名和类型。

- **问题3**：`datetime()` 带修饰符的日期运算未覆盖
- **原因**：punch.js:125 使用了 `datetime('now', 'localtime', '-7 days')` 这种日期运算，方案仅提供了 `sql.now()` 处理简单当前时间戳，实现者遇到此场景缺乏方言统一方案。
- **建议方向**：在 `sql.js` 中新增 `sql.relativeDate(days)` 或类似函数，SQLite 端输出 `datetime('now', 'localtime', '${days} days')`，KingbaseES 端输出 `CURRENT_TIMESTAMP + INTERVAL '${days} days'`。或在路由层改为应用层计算日期后作为参数传入（更简单，推荐）。

- **问题4**：时区数据迁移未纳入迁移计划
- **原因**：现有数据中的 `created_at`/`updated_at` 字段使用 `datetime('now','localtime')` 存储为本地时间（UTC+8），方案决定统一使用 UTC 存储。如果迁移脚本不转换时区，迁移后的混合时区数据将导致时间比较和展示错误。
- **建议方向**：在迁移脚本（第11节）中明确：对于所有 datetime 字段，读取 SQLite 本地时间后，使用 `moment.js`/`dayjs` 或手动减去 8 小时偏移转换为 UTC 后再写入 KingbaseES。列出所有涉及时间字段的表和列名。

- **问题5**：KingbaseES 种子数据密码哈希生成机制缺失
- **原因**：SQLite 的种子机制在运行时用 `bcryptjs` 动态生成密码哈希（替换占位符），而 init_kingbase.sql 中种子数据以静态 SQL 形式存在，无法在运行时替换。
- **建议方向**：明确 KingbaseAdapter.init() 的种子数据执行方式。推荐方案：保持与 SQLite 相同的占位符替换机制——在 KingbaseAdapter.init() 中读取 init_kingbase.sql，用 `bcryptjs` 实时生成 `admin123` 的哈希替换占位符后再分割执行。或单独维护 `seed_kingbase.sql` 文件并实现相同的替换逻辑。

- **问题6**：`RETURNING id` 自动追加的实现机制不明确
- **原因**：KingbaseAdapter.execute() 需要判断 SQL 是否为 INSERT、是否已包含 RETURNING 子句，但方案未说明解析策略。实现者可能在正则匹配和 SQL 解析器之间犹豫。
- **建议方向**：明确 INSERT 检测策略。推荐利用项目已有的 `node-sql-parser` 依赖进行 SQL AST 解析（准确、可靠），或说明简单的正则匹配策略及其局限性（如处理子查询中的 INSERT、ON CONFLICT 等复杂场景）。给出具体判断逻辑的伪代码。
