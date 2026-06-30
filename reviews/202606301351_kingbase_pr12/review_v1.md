# R1: 适配层核心 + 基础设施（9 个文件）

审查时间：2026-06-30

### 审查范围

- `server/db/adapter/DatabaseAdapter.js`（抽象接口）
- `server/db/adapter/SqliteAdapter.js`（SQLite 适配器）
- `server/db/adapter/KingbaseAdapter.js`（金仓适配器）
- `server/db/sql.js`（SQL 方言辅助）
- `server/db/database.js`（双导出 async 模式）
- `server.js`（async 启动 + 优雅关闭）
- `server/db/init_kingbase_ddl.sql`（金仓 DDL）
- `server/db/init_kingbase_seed.sql`（金仓种子数据）
- `package.json`（依赖变更）

### 发现

---

#### [严重] SqliteAdapter.init() 中 seed.sql 占位符替换正则与实际占位符格式不匹配，admin 密码无法正确设置

- **位置**：`server/db/adapter/SqliteAdapter.js:55-58`
- **描述**：实际 `seed.sql` 第 3 行的占位符为字面量 `$2a$10$PLACEHOLDER_BCRYPT_HASH_GOES_HERE`（共 3 个 `$`）。但实现使用的正则 `/\$2[ab]\$\d+\$[A-Za-z0-9./]+\$PLACEHOLDER_BCRYPT_HASH_GOES_HERE[A-Za-z0-9./]+/` 要求在 `PLACEHOLDER` 之前出现第 4 个 `$`（即 `\$` 期望 4 个 `$` 符号），且字符类 `[A-Za-z0-9./]` 不包含下划线 `_`，导致 `[A-Za-z0-9./]+` 匹配到 `PLACEHOLDER` 后遇到 `_` 即停止，下一个期望的 `\$` 实际为 `_`，正则整体不匹配。结果：`seedSql.replace(...)` 不发生替换，`db.exec(seedSql)` 将字面量 `$2a$10$PLACEHOLDER_BCRYPT_HASH_GOES_HERE` 作为 admin 密码哈希写入数据库，admin 用户使用 `admin123` 无法登录。对照 `KingbaseAdapter.init()` 第 194 行采用 `seedSql.replace('__BCRYPT_HASH_PLACEHOLDER__', hash)` 字符串直接替换可正常工作，可见本处为 bug。迁移计划 §3.3 要求 `init()` 完成"替换占位符"语义，当前实现未达成。
- **建议**：改用与 KingbaseAdapter 一致的简单字符串替换，去掉正则。例如：
  ```javascript
  seedSql = seedSql.replace('PLACEHOLDER_BCRYPT_HASH_GOES_HERE', hash);
  ```
  或同步 seed.sql 占位符为 `__BCRYPT_HASH_PLACEHOLDER__` 与金仓侧统一，再调用 `.replace('__BCRYPT_HASH_PLACEHOLDER__', hash)`。

---

#### [严重] database.js 双导出 `db` 在 require 时为 null，破坏 Phase 0 过渡兼容性

- **位置**：`server/db/database.js:85`
- **描述**：模块加载时执行 `module.exports = { getAdapter, initDatabase, db: null };`，将 `db` 初始绑定为 `null`。`initDatabase()` 在第 67-72 行才通过 `module.exports.db = adapter.db`（SQLite 模式）更新导出值。但路由文件通常在文件顶部使用 `const { db } = require('../db/database')` 解构导入——解构在 `require` 时刻即捕获 `null`，之后 `module.exports.db` 的更新不会反映到已解构的 `db` 变量。这导致任何使用解构方式且尚未改造为 `getAdapter()` 的路由在 Phase 0 过渡期拿到 `db = null`，调用 `db.prepare(...)` 抛 `Cannot read property 'prepare' of null`。迁移计划 §3.5.2 步骤 2 明确要求"database.js 在步骤 2 中导出 `module.exports = { db: adapter.db, getAdapter: () => adapter, initDatabase }`，保证旧路由文件仍可通过 `require('../db/database').db` 获取原始 better-sqlite3 对象"，当前实现未达成该语义。
- **建议**：使用 getter 形式导出，使 `database.db` 在每次访问时返回当前 adapter 实例的 db：
  ```javascript
  module.exports = {
    getAdapter,
    initDatabase,
    get db() {
      return adapter && adapter.db ? adapter.db : null;
    }
  };
  ```
  或显式延迟访问模式（`const database = require('../db/database'); ... database.db.prepare(...)`），但需同步改造所有调用方。推荐 getter 方案，零侵入。

---

#### [严重] init_kingbase_ddl.sql 中 4 个 JSON 列使用 TEXT 而非 JSONB，违反迁移计划 §10.2 决策

- **位置**：`server/db/init_kingbase_ddl.sql:56`（`articles.tags`）、`:89`（`user_risk_info.result`、`user_risk_info.raw_input`）、`:115`（`life_advice.tags`）
- **描述**：迁移计划 §10.2"JSON 列类型决策"明确："4 个 JSON 文本列在 KingbaseES 中使用 **JSONB 类型**而非 TEXT"，并给出具体列表：`articles.tags`、`user_risk_info.result`、`user_risk_info.raw_input`、`life_advice.tags`。§10.2 翻译规则表亦载明"TEXT（存储 JSON 字符串）→ JSONB"。当前 DDL 均为 TEXT：
  - 第 56 行：`tags TEXT NOT NULL DEFAULT '[]'`
  - 第 89 行：`result TEXT`、`raw_input TEXT`
  - 第 115 行：`tags TEXT NOT NULL DEFAULT '[]'`
  
  影响：(1) `sql.jsonField()` 在金仓侧输出 `${col}::jsonb->>'${path}'`，对 TEXT 列需运行时 `::jsonb` 转换，无法利用 GIN 索引；(2) 与计划"原生 JSON 查询支持"目标矛盾；(3) 迁移脚本需额外 JSON 合法性校验逻辑。注意 §10.2 v16 修正明确 `admin_logs.operation_content/operation_result` 保持 TEXT（纯文本），当前实现正确，仅上述 4 列需改。
- **建议**：将上述 4 列类型改为 JSONB：
  ```sql
  tags JSONB NOT NULL DEFAULT '[]'        -- articles.tags, life_advice.tags
  result JSONB DEFAULT NULL               -- user_risk_info.result
  raw_input JSONB DEFAULT NULL            -- user_risk_info.raw_input
  ```
  注意 `DEFAULT '[]'` 对 JSONB 合法（`'[]'` 是合法 JSON 文本），可保留。

---

#### [严重] init_kingbase_ddl.sql 中 `idx_plans_user_plan` 缺少 UNIQUE 约束，违反迁移计划 §8.5 / §10.2

- **位置**：`server/db/init_kingbase_ddl.sql:160`
- **描述**：迁移计划 §8.5（v9 新增，v10 修正）和 §10.2 均要求将 `life_plans(user_id, plan_id)` 的索引从普通索引升格为 UNIQUE 索引，作为 `FOR UPDATE` 行级锁在"首次方案生成"场景失效时的数据库层最后防线——防止两个并发请求同时 INSERT 相同 `plan_id`。当前实现：
  ```sql
  CREATE INDEX IF NOT EXISTS idx_plans_user_plan ON life_plans(user_id, plan_id);
  ```
  应为 `CREATE UNIQUE INDEX IF NOT EXISTS`。同时 `init.sql:145` 也应同步修改（属于 R2 范围，此处仅指出金仓侧）。缺失此约束将导致并发首次方案生成时出现重复 `plan_id`，方案数据混乱。
- **建议**：
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_user_plan ON life_plans(user_id, plan_id);
  ```

---

#### [严重] init_kingbase_seed.sql 种子数据与 seed.sql 不一致，违反迁移计划 §10.2"种子数据对齐"

- **位置**：`server/db/init_kingbase_seed.sql:14-32`（医生）、`:35-63`（糖尿病类型）、`:66-173`（文章）
- **描述**：迁移计划 §10.2 明确要求："种子数据对齐：seed.sql 中的种子数据同步到 init_kingbase.sql，确保两套数据库初始化后状态一致……需统一为 seed.sql 的数据"。当前两文件内容严重不一致：

  **医生信息**：
  - seed.sql：张明远（内分泌科/主任医师）、李静怡（糖尿病专科/专科医师）、王建国（营养科/营养科专家）
  - init_kingbase_seed.sql：张明华（内分泌科/主任医师）、李雅文（营养科/副主任医师）、王志强（运动医学科/主治医师）
  - 姓名、科室、职称、描述、头像路径、chat_token 全部不同

  **糖尿病类型**：
  - seed.sql：`1型糖尿病` / 图片 `t1.jpg`
  - init_kingbase_seed.sql：`1 型糖尿病`（多空格）/ 图片 `type_1.jpg`
  - 类型名称、图片路径、科普内容文本均不同

  **文章**：
  - seed.sql：3 篇（饮食指南、运动建议、血糖监测），INSERT 列含 `cover`
  - init_kingbase_seed.sql：3 篇（饮食误区、运动处方、早期筛查），INSERT 列不含 `cover` 但含 `summary`/`tags`
  - 文章标题、内容、分类、列集合完全不同

  影响：(1) 双库初始化后状态不一致，违背 §5"同一套应用代码，两个数据库后端"的可移植性目标；(2) 前端图片路径不匹配将导致医生头像/类型图片 404；(3) `articles` 列集合不同导致 `cover` 列在金仓侧为 NULL（缺失封面）。

- **建议**：以 `seed.sql` 为基准重写 `init_kingbase_seed.sql`，仅将 SQLite 方言改为 PostgreSQL 方言（如占位符改为 `__BCRYPT_HASH_PLACEHOLDER__`），保持数据内容完全一致。`articles` INSERT 列集合需与 seed.sql 对齐（包含 `cover`，若需补充 `summary`/`tags` 则应同步更新 seed.sql）。

---

#### [一般] KingbaseAdapter.init() 种子数据分割未处理单引号字符串内的分号，违反迁移计划 §3.4.5 步骤 8

- **位置**：`server/db/adapter/KingbaseAdapter.js:200-204`
- **描述**：迁移计划 §3.4.5 步骤 8 明确："按 `;` 分割为独立 INSERT 语句（单引号字符串内的分号跳过处理同步骤 2）"。当前实现：
  ```javascript
  const seedStmts = seedSql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  ```
  仅移除单行注释后直接 `split(';')`，**未使用状态机跳过单引号字符串内的分号**，也未移除多行注释 `/* ... */`。对比同文件 DDL 分割（第 145-167 行）正确使用了状态机处理单引号字符串，两侧实现不一致。当前 `init_kingbase_seed.sql` 文章内容恰好不含分号，故暂未触发；但一旦种子数据更新（如文章内容出现分号、英文分号 `;`、或 SQL 函数调用），将导致语句被错误切断，产生语法错误或静默数据丢失。
- **建议**：复用 DDL 分割的状态机逻辑处理种子数据，或将分割逻辑抽取为私有方法 `_splitSqlStatements(sql)` 供 DDL 和种子数据共用。同时补充多行注释移除：`.replace(/\/\*[\s\S]*?\*\//g, '')`。

---

#### [一般] KingbaseAdapter._ensureReturningId 对含 `?` 占位符的 SQL 调用 node-sql-parser 解析易失败，大量依赖正则回退

- **位置**：`server/db/adapter/KingbaseAdapter.js:102-125`
- **描述**：迁移计划 §3.4.4 推荐使用 `node-sql-parser` 解析 AST 检测 INSERT。实现中调用 `parser.astify(sql, { database: 'PostgreSQL' })`，但传入的 SQL 仍是 `?` 占位符风格（占位符转换 `_convertPlaceholders` 在 `_ensureReturningId` 之后才执行，见第 255-256 行）。`?` 不是 PostgreSQL 合法占位符，node-sql-parser 在 PostgreSQL 方言下解析含 `?` 的 SQL 大概率失败，触发 catch 块的正则回退（第 116-122 行）。结果：计划期望"node-sql-parser 准确处理子查询/ON CONFLICT 等复杂场景"的优势无法发挥，几乎所有 INSERT 都走正则回退路径，并按 §3.4.4 v14 要求输出 `console.warn` 警告日志（第 118 行）——生产环境日志中会出现大量回退告警，违反计划"若频繁出现此日志需调查"的本意。
- **建议**：两种方案任选其一：
  1. 在 `_ensureReturningId` 内部先做 `?` → `$N` 转换再传给 parser，检测完成后保留原 SQL 仅追加 `RETURNING id`；
  2. 调整调用顺序：先 `_convertPlaceholders` 再 `_ensureReturningId`（需确认 `RETURNING id` 追加位置不受 `$N` 编号影响——由于 `RETURNING id` 不含 `?`，编号不变，安全）。

---

#### [一般] server.js 优雅关闭未先关闭 HTTP 服务器，进行中的请求被强制中断

- **位置**：`server.js:29-42`
- **描述**：迁移计划 §3.5.1（v11 新增）描述关闭流程时序为"`SIGTERM`/`SIGINT` → `adapter.close()` → `pool.end()` → `process.exit(0)`"，未显式要求关闭 HTTP server。但当前实现收到信号后直接调用 `adapter.close()` 再 `process.exit(0)`，未先停止 `app.listen()` 接收新连接、未等待在途请求完成。若 `adapter.close()`（`pool.end()`）阻塞或进行中请求仍在访问数据库，可能出现：在途请求拿到连接已关闭的错误、或 `pool.end()` 等待进行中查询但 HTTP 层已无新请求进入的死锁边缘场景。这是生产环境优雅关闭的常见遗漏。
- **建议**：保存 `const server = app.listen(PORT, ...)` 引用，在 `gracefulShutdown` 中先 `server.close(() => { adapter.close().then(() => process.exit(0)); })`（`server.close` 仅停止接收新连接，在途请求处理完成后回调）。可增加超时强制退出兜底。

---

#### [一般] sql.js 的 `jsonField`/`jsonFieldAs` 对 `col`/`path`/`type` 参数未做防护，存在潜在 SQL 注入面

- **位置**：`server/db/sql.js:57-74`
- **描述**：`jsonField(col, path)` 直接将 `col` 和 `path` 拼入 SQL：SQLite 侧 `` `json_extract(${col}, '$.${path}')` ``、金仓侧 `` `${col}::jsonb->>'${path}'` ``。`jsonFieldAs` 同样将 `type` 直接拼入 `CAST(... AS ${type})` / `(...)::${type}`。迁移计划 §4.2 给出的函数签名即如此设计，当前路由层调用均为硬编码列名/路径（如 `sql.jsonField('result', 'risk_level')`），不存在用户输入直达，故无现实漏洞。但：(1) 缺乏 JSDoc 警示"参数不可来自用户输入"；(2) 未来若某路由误将用户输入传入 `col`/`path`，将直接构成 SQL 注入。属防御性设计缺失。
- **建议**：在函数 JSDoc 中明确标注"`col`/`path`/`type` 必须为硬编码字面量，禁止来自用户输入"；可选增加白名单校验（如 `path` 仅允许 `[A-Za-z0-9_]+`，`type` 仅允许 `INTEGER|TEXT|REAL` 等）。

---

#### [一般] KingbaseAdapter.tableInfo() 返回的 `dflt_value` 是 PostgreSQL 表达式，与 SQLite PRAGMA 格式不一致

- **位置**：`server/db/adapter/KingbaseAdapter.js:316-340`
- **描述**：迁移计划 §3.2 规定 `tableInfo(tableName)` 返回值统一为 PRAGMA 格式，字段含 `dflt_value (string|null)`。实现中 `dflt_value` 直接取 `column_default`，但对于 `SERIAL` 列该值为 `nextval('users_id_seq'::regclass)`，对于 `DEFAULT CURRENT_TIMESTAMP` 列为 `CURRENT_TIMESTAMP`，对于 `DEFAULT 0` 列为 `0`。而 SQLite PRAGMA 对应列返回字面量 `0`、`(datetime('now','localtime'))` 等。两者在 admin.js `get_table_schema` 工具展示时格式不一致，Dify AI 解读 schema 时可能产生混淆。属轻微信息不一致，不阻断功能。
- **建议**：可在 `tableInfo()` 中对 `column_default` 做轻量归一化（如 `SERIAL` 列返回 `null`、去掉类型后缀 `::regclass` 等），或在文档中明确两侧差异。优先级低。

---

#### [轻微] SqliteAdapter.transaction() 手动 BEGIN/COMMIT/ROLLBACK 不支持嵌套事务（savepoint）

- **位置**：`server/db/adapter/SqliteAdapter.js:113-140`
- **描述**：迁移计划 §3.3 建议利用 better-sqlite3 原生事务支持。实现因 `fn` 为 async 无法使用 `db.transaction()` 同步包装，改为手动 `BEGIN`/`COMMIT`/`ROLLBACK`，注释说明了原因。代价是失去 better-sqlite3 原生的嵌套事务（savepoint）支持——若未来出现 `transaction()` 内部再调用 `transaction()` 的场景，内层 `BEGIN` 在 SQLite 中会报错"cannot start a transaction within a transaction"。当前路由层（plan.js/admin.js）不存在嵌套事务调用，故无现实影响。
- **建议**：如未来需要嵌套，可用 `SAVEPOINT tx_N` / `RELEASE tx_N` / `ROLLBACK TO tx_N` 模拟。当前可保留实现，在 JSDoc 中标注"不支持嵌套事务"。

---

#### [轻微] KingbaseAdapter.execute() 对非 INSERT 语句也调用 `_ensureReturningId`，存在轻微性能开销

- **位置**：`server/db/adapter/KingbaseAdapter.js:254-255`
- **描述**：`execute()` 无条件调用 `this._ensureReturningId(sql)`，该方法内部 `require('node-sql-parser')` + `parser.astify()` 对 UPDATE/DELETE 也会完整解析一次 AST，仅用于判断 `type === 'insert'`。对于高频 UPDATE/DELETE 场景（如 `punch.js` 打卡、`plan.js` 方案调整）产生不必要 CPU 开销。
- **建议**：在调用 `_ensureReturningId` 前用快速正则预判：`if (/^\s*INSERT\s+/i.test(sql)) { sql = this._ensureReturningId(sql); }`。或缓存 `Parser` 实例（当前每次调用都 `new Parser()`，第 105-106 行）。

---

#### [轻微] KingbaseAdapter.init() 中 `bcrypt.hashSync` 同步调用阻塞事件循环

- **位置**：`server/db/adapter/KingbaseAdapter.js:191-192`
- **描述**：`bcrypt.hashSync('admin123', 10)` 同步计算约耗时 50-150ms（取决于 cost factor），阻塞事件循环。仅在 `init()` 阶段执行一次（且 users 表为空时），对运行时无影响。但 `init()` 是 async 函数，可改用 `await bcrypt.hash(...)` 非阻塞版本。
- **建议**：改用 `const hash = await bcrypt.hash('admin123', 10);`（bcryptjs 支持 Promise API）。SqliteAdapter.init() 第 52-53 行同问题。

---

#### [轻微] package.json 中 `pg` 版本 ^8.22.0 高于迁移计划推荐的 ^8.12

- **位置**：`package.json:32`
- **描述**：迁移计划 §2 推荐 `pg` 版本 `^8.12`，实际为 `^8.22.0`。`^8.22.0` 与 `^8.12` 同 major 版本，API 兼容，且 8.22 包含 bug 修复和性能改进，版本选择合理。`node-sql-parser` ^5.4.0、`bcryptjs` ^2.4.3 均与计划一致。
- **建议**：无需调整，版本选择合理。仅作为与计划文档差异的记录。

---

### 本轮统计

| 严重程度 | 数量 |
|---------|------|
| 严重 | 5 |
| 一般 | 5 |
| 轻微 | 4 |

### 总评

适配层核心架构（DatabaseAdapter 抽象接口、SqliteAdapter/KingbaseAdapter 双实现、sql.js 方言辅助、database.js 工厂、server.js async 启动）整体设计符合迁移计划 §3-§4 的骨架，async 方法签名、`?`→`$N` 状态机转换、`pool.on('error')` 处理、`pg.types.setTypeParser` 四类 OID 拦截、SSL/TLS 配置、`transaction()` 的 `try/catch/finally` 连接释放、时区验证、DDL 拓扑排序与逐条事务外执行、种子数据事务内执行等关键点均按计划实现。

但存在 5 个严重问题必须在合入前修复：

1. **SqliteAdapter 占位符正则不匹配**（§3.3）——admin 用户无法登录，SQLite 路径功能性阻断；
2. **database.js 双导出 `db` 时序错误**（§3.5.2）——Phase 0 过渡期旧路由 `db` 为 null；
3. **init_kingbase_ddl.sql 4 个 JSON 列使用 TEXT 而非 JSONB**（§10.2）——失去 JSON 原生查询能力，与 DDL 翻译规则矛盾；
4. **`idx_plans_user_plan` 缺 UNIQUE 约束**（§8.5）——并发首次方案生成产生重复 plan_id；
5. **init_kingbase_seed.sql 种子数据与 seed.sql 不一致**（§10.2）——双库初始化状态分叉，前端图片 404。

其中 1、2 为运行时阻断性 bug，3、4、5 为与迁移计划核心要求的偏差。建议优先修复 1、2、5（直接影响功能），3、4 涉及 DDL 重写和迁移计划对齐。一般问题中，种子数据分号分割（#6）和 `_ensureReturningId` 调用顺序（#7）建议一并修复以避免潜在运行时故障和日志噪音。

代码质量方面，KingbaseAdapter 的占位符转换状态机、DDL 分割状态机、事务连接释放保护实现严谨；SqliteAdapter 的 async 包装思路正确；sql.js 方言函数齐全。主要问题集中在与迁移计划文档的精确对齐上，建议合入前对照本报告逐条修正。
