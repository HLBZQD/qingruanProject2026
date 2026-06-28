# 引入国产金仓数据库 KingbaseES —— 技术方案（v2）

## 1. 总体方案概览

**核心决策**：构建一个轻量级数据库适配层（`DatabaseAdapter`），同时支撑 SQLite 和 KingbaseES 两种后端，路由层通过适配层访问数据库而非直接依赖具体驱动。

```
┌─────────────────────────────────────────────┐
│  routes/ (auth, user, risk, plan, punch,   │
│           articles, admin, assistant, ...)  │
├─────────────────────────────────────────────┤
│  server/db/sql.js   (方言辅助函数)          │
├─────────────────────────────────────────────┤
│  server/db/adapter/DatabaseAdapter.js       │
│  ├── SqliteAdapter   (better-sqlite3)       │
│  └── KingbaseAdapter (pg Pool)             │
├─────────────────────────────────────────────┤
│  SQLite file  │  KingbaseES server          │
└─────────────────────────────────────────────┘
```

**关键原则**：
- 不引入 ORM（TypeORM/Sequelize/Prisma），保持原始 SQL 的灵活性和可控性
- 不引入 Knex 等查询构建器，避免增加一层翻译间接层——当前项目 SQL 复杂度低，直接适配性价比更高
- 前端代码零变动，仅后端数据库层改造
- 渐进式迁移，每个阶段可独立验证、随时回退

**目标 KingbaseES 版本**：KingbaseES V8R6 及以上（基于 PostgreSQL 12 兼容内核）。V8R6 是 KingbaseES 当前主流生产版本，完整支持 PostgreSQL 12 的 SQL 语法、information_schema、pg.Pool 兼容连接。

---

## 2. 数据库驱动选型

**决策**：选用 `pg`（node-postgres）作为 KingbaseES 驱动。

| 对比维度 | `pg` | `pg-promise` |
|---------|------|-------------|
| 维护方 | `node-postgres` 社区 | Vitaly Tomilov |
| Stars | 33k+ | 3.5k+ |
| API 风格 | 回调/Promise/async-await | Promise-first, 增强查询方法 |
| 连接池 | 内置 `pg.Pool` | 基于 `pg.Pool` 封装 |
| 依赖 | 无额外依赖 | 依赖 `pg` |

**选择 `pg` 的理由**：
1. `pg` 是 `pg-promise` 的底层依赖，选 `pg` 没有功能损失
2. 本项目自行构建适配层，不需要 `pg-promise` 的高阶查询封装
3. `pg.Pool` 原生支持连接池，API 干净直接
4. KingbaseES 官方文档推荐的 PostgreSQL 兼容驱动即为 `pg`

**npm 包**：`pg`（版本建议 ^8.12）

---

## 3. 数据库访问层改造方案

### 3.1 文件结构

适配层代码组织在 `server/db/adapter/` 目录下：

```
server/db/adapter/
├── DatabaseAdapter.js   # 抽象基类，定义统一接口（JSDoc 注释标注契约）
├── SqliteAdapter.js     # SQLite 实现（基于 better-sqlite3）
└── KingbaseAdapter.js   # KingbaseES 实现（基于 pg.Pool）
```

`server/db/database.js` 中通过 `require('./adapter/SqliteAdapter')` 或 `require('./adapter/KingbaseAdapter')` 按需加载。`DatabaseAdapter.js` 不导出可实例化的类，仅作为接口契约参考（或使用 JSDoc `@interface` 标注）。

**说明**：此结构统一了方案各处中的文件路径引用（此前 v4 的 3.1 节写为 `server/db/adapter.js` 单文件，3.4 节写为 `adapter/sqlite` 子目录，存在矛盾）。以本节的子目录结构为准。

### 3.2 适配层接口定义

```typescript
// 接口轮廓（决策层，非最终代码）
class DatabaseAdapter {
  async init()                  → void（执行建表/种子数据初始化，幂等安全）
  async query(sql, params)      → rows: Array<object>
  async queryOne(sql, params)   → row: object | null
  async execute(sql, params)    → { lastInsertId: number, changes: number }
  async transaction(fn)         → fn(txAdapter) 的返回值（自动 commit/rollback）
  async tableInfo(tableName)    → Array<{ cid, name, type, notnull, dflt_value, pk }>
  async healthCheck()           → boolean
  async close()                 → void
}
```

**`init()` 方法说明**（v2 新增）：
- 职责：执行 DDL 建表 + 种子数据初始化。调用方（`database.js` 的 `initDatabase()`）在构造函数完成后立即调用 `await adapter.init()`。
- 幂等保证：`init()` 实现必须可安全地重复执行——已存在的表不重建，已存在的种子数据不重复插入。具体：DDL 使用 `CREATE TABLE IF NOT EXISTS`，种子数据插入前检查 `users` 表行数。
- 返回值：无返回值（`void`），初始化失败则抛出异常。

**`transaction(fn)` 契约**：
- `fn` 签名为 `async (txAdapter) => R`，其中 `txAdapter` 是一个与当前 adapter 同接口但绑定到事务连接的对象，支持 `query()`、`queryOne()`、`execute()` 方法。`fn` 的返回值 `R` 作为 `transaction()` 的返回值。
- 若 `fn` 抛出异常，自动 `ROLLBACK`；若 `fn` 正常返回，自动 `COMMIT`。

**`tableInfo(tableName)` 方法说明**：
- 用途：替代 SQLite 的 `PRAGMA table_info(table)`，供 admin.js 的 `get_table_schema` 操作使用
- 返回值：统一为 PRAGMA 格式的字段列表：
  - `cid` (number)：列序号
  - `name` (string)：列名
  - `type` (string)：数据类型
  - `notnull` (number)：是否非空（0/1）
  - `dflt_value` (string|null)：默认值
  - `pk` (number)：是否主键（0/1）
- **SqliteAdapter 实现**：调用 `db.prepare('PRAGMA table_info(?)').all(tableName)` 直接返回
- **KingbaseAdapter 实现**：查询 `information_schema.columns`，映射到统一格式：

```sql
SELECT
  ordinal_position - 1 AS cid,
  column_name AS name,
  CASE
    WHEN udt_name = 'varchar' THEN 'VARCHAR(' || character_maximum_length || ')'
    WHEN udt_name = 'int4' THEN 'INTEGER'
    ELSE udt_name
  END AS type,
  CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull,
  column_default AS dflt_value,
  CASE WHEN column_name IN (
    SELECT kcu.column_name FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
  ) THEN 1 ELSE 0 END AS pk
FROM information_schema.columns
WHERE table_name = $1
ORDER BY ordinal_position
```

### 3.3 SqliteAdapter 实现要点

- 基于现有 `better-sqlite3`，但封装为 Promise 接口
- 内部 `better-sqlite3` 是同步的，对外包裹 `Promise.resolve()` 即可
- `execute()` 利用 `stmt.run()` 返回的 `{ lastInsertRowid, changes }` 映射到 `{ lastInsertId, changes }`
- `transaction()` 利用 `better-sqlite3` 原生事务支持，包裹为 async 返回。传入 `fn` 的 `txAdapter` 是绑定到事务数据库连接的同接口对象
- `tableInfo()` 直接调用 `db.prepare('PRAGMA table_info(?)').all(tableName)`
- `init()`：读取 `init.sql` → `db.exec(initSql)` → 检查 `users` 表是否为空 → 若空则读取 `seed.sql`、用 bcryptjs 生成 admin123 哈希、替换占位符、`db.exec(seedSql)`
- `healthCheck()`：执行 `SELECT 1` 并检查数据库连接是否打开
- `close()`：调用 `db.close()`

### 3.4 KingbaseAdapter 实现要点

- 基于 `pg.Pool`

#### 3.4.1 构造与连接配置

构造参数从环境变量组装：

```javascript
// KingbaseAdapter 构造参数
{
  connectionString: process.env.DATABASE_URL,  // 或拼接分离参数
  max: parseInt(process.env.DB_POOL_MAX) || 10,
  min: parseInt(process.env.DB_POOL_MIN) || 2,
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT) || 5000,
  // SSL/TLS 配置（见 3.4.7 节）
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : false,
}
```

#### 3.4.2 连接池错误处理（重要）

`pg.Pool` 在底层连接异常断开时会触发 `'error'` 事件。若不监听该事件，Node.js 会将错误作为未捕获异常抛出并导致进程崩溃。

**必须实现的处理策略**：

```javascript
// KingbaseAdapter 内部
this.pool.on('error', (err, client) => {
  console.error('[KingbaseAdapter] Pool idle client error:', err.message);
  // 不主动退出进程：pg.Pool 会自动创建新连接替换失效连接
  // 仅记录日志，供监控系统采集
});
```

**连接池耗尽行为**：当所有连接都在使用中且达到 `max` 限制时，新的 `pool.query()` 调用将排队等待。排队超时由 `connectionTimeoutMillis` 控制——这不是"等待连接变为可用"的超时，而是"建立新 TCP 连接"的超时。`pg` 对等待队列没有内置超时机制。根据项目并发量级（中小型应用），`max=10` 在正常负载下足够，连接池耗尽风险低。如未来需要队列超时，可通过应用层 `Promise.race()` 实现。

#### 3.4.3 KingbaseES 服务不可用时的启动行为

应用启动时若 KingbaseES 不可达，`pool.query()` 将失败并抛出连接错误。`database.js` 中的 `initDatabase()` 应捕获此异常并：

1. 输出明确错误信息（含 `DATABASE_URL` 脱敏后的主机和端口）
2. 终止进程（`process.exit(1)`）——数据库不可用时应用无法正常运行
3. 不进入降级模式（不存在自动回退到 SQLite 的机制，切换数据库类型是显式运维操作）

**启动时环境变量校验**（v2 新增）：`initDatabase()` 在实例化 adapter 之前执行：

```
若 DB_TYPE === 'kingbase':
  检查 DATABASE_URL（或 DB_HOST+DB_NAME）是否存在且非空
  若缺失 → 输出 "DB_TYPE=kingbase 但未配置 DATABASE_URL" → process.exit(1)
若 DB_TYPE === 'sqlite':
  检查 DB_PATH 是否可访问（目录存在或可创建）
  若不可访问 → 输出警告并尝试创建
```

#### 3.4.4 核心查询方法

- `query()` / `queryOne()` / `execute()` 调用 `pool.query()`
- **参数占位符转换（重要）**：`pg`（node-postgres）仅支持 `$1, $2, ...` 格式的参数占位符，而当前项目全部使用 `?` 占位符。为保持路由层最小改动（继续使用 `?` 风格），KingbaseAdapter 的 `query()`、`queryOne()`、`execute()` 等方法必须在将 SQL 传递给 `pool.query()` 之前，将 SQL 中的 `?` 占位符转换为 `$1, $2, ...` 格式。转换策略：
  - 在适配层内部（如 `_convertPlaceholders(sql)` 私有方法），使用简单状态机扫描 SQL 字符串：维护计数器 `n = 1`，遍历 SQL 字符，当遇到 `?` 时替换为 `$n` 并将 `n` 递增
  - 状态机需跳过单引号字符串字面量内的 `?`（这些是 SQL 文本内容，不是参数占位符）。具体：维护 `inString` 布尔标志，遇到 `'` 时翻转（需要处理转义单引号 `''` 的情况，连续两个单引号不翻转状态）
  - **SQL 注释处理说明**：状态机无需处理 SQL 注释（`--`、`/* */`）。原因：路由层运行时的 SQL 语句不包含注释——注释仅出现在 DDL 初始化脚本（`init.sql`/`init_kingbase.sql`）中，而这些脚本通过独立的 `init()` 多语句执行流程处理（其分号分割步骤已包含注释移除逻辑，见 3.4.5 节 init 方法第 4 步）。路由层动态 SQL 中不存在注释内的 `?` 被误转换的风险。
  - 简单场景可用正则实现，但状态机更可靠且实现成本低（约 20 行代码）
  - 转换后的 SQL 携带 `$1, $2, ...` 占位符后，原 params 数组直接传给 `pool.query()`，无需调整顺序（`?` 的出现顺序与 `$N` 的编号顺序一致）
  - 备选方案：改用 `pg` 的 `$1` 风格直接修改所有路由层 SQL，但这会增加路由层改动量（约 50+ 处 SQL 语句），与"路由层最小改动"原则冲突。当前方案推荐转换方案

- `execute()` 的 INSERT ID 获取策略：
  - 利用项目已有依赖 `node-sql-parser`（v5.4.0，package.json 已安装）解析 SQL AST
  - 判断 SQL 是否为 INSERT 语句（检查 AST type 是否为 `insert`）
  - 若为 INSERT 且原始 SQL 中不含 `RETURNING` 子句，则在 SQL 末尾自动追加 ` RETURNING id`
  - **适用边界**：本项目所有 10 张表的主键列名均为 `id`。此策略假定主键列名为 `id`，若将来新增表使用不同主键列名（如 `user_id`、`order_no`），需扩展此策略以支持主键列名检测（可通过 `information_schema` 查询主键列名或使用 `tableInfo()` 方法的 `pk` 字段）。当前项目范围内此假定成立
  - `node-sql-parser` 支持 PostgreSQL 方言解析，可准确处理子查询中的 INSERT、ON CONFLICT 等复杂场景，比正则匹配更可靠
  - 解析失败时（例如极特殊的 SQL 语法），回退到正则匹配 `/^\s*INSERT\s+/i.test(sql)` 检测，并追加 `RETURNING id`
  - 对于非 INSERT 语句（UPDATE/DELETE），通过 `result.rowCount` 获取 `changes`

- `transaction()` 从 pool 获取一个 client，执行 `BEGIN` → fn(clientAdapter) → `COMMIT`/`ROLLBACK` → `client.release()`。传入 `fn` 的 `clientAdapter` 是绑定到专属 client 的轻量对象，支持 `query()`、`queryOne()`、`execute()` 方法
- `tableInfo()` 查询 `information_schema.columns` 并映射到 PRAGMA 统一格式（见 3.2 节 SQL）

#### 3.4.5 `init()` 方法（多语句 SQL 脚本执行）

- `pg.Pool.query()` 单次只执行一条 SQL 语句，不支持 `db.exec()` 式的多语句批量执行
- KingbaseAdapter.init() 的执行策略：
  1. 使用 `fs.readFileSync` 读取 `init_kingbase.sql` 文件内容
  2. 使用 `bcryptjs`（项目已依赖）运行时生成 `admin123` 的 bcrypt 哈希，替换 SQL 文本中的占位符 `__BCRYPT_HASH_PLACEHOLDER__`
  3. 按 `;` 分割 SQL 文本为独立语句
  4. **分号分割注意事项**：需处理字符串字面量和注释中的分号。推荐策略：先移除单行注释（`--` 开头行）和多行注释（`/* ... */`），再用简单状态机跳过单引号字符串内的分号后分割
  5. 过滤空语句（纯空白行、仅含注释的行）
  6. 在一个事务内（`BEGIN` → 逐条执行 → `COMMIT`）顺序执行所有语句
  7. **幂等检查顺序（v2 修正）**：在事务提交后、返回前，查询 `SELECT COUNT(*) FROM users` 判断是否需要插入种子数据。`init_kingbase.sql` 中的 DDL 使用 `CREATE TABLE IF NOT EXISTS`（而非 `DROP TABLE IF EXISTS`），确保已有数据不会在初始化阶段被删除。种子数据若已存在（users 表非空）则跳过 INSERT
- 备选方案（如分割复杂度在实现中过高）：将 `init_kingbase.sql` 拆分为 `init_kingbase_ddl.sql`（DDL）和 `init_kingbase_seed.sql`（种子数据）两个文件，每个文件内语句更简单，降低分割风险

#### 3.4.6 SQL 执行错误传播模式

KingbaseAdapter 所有查询方法在 `pool.query()` 抛出异常时，**不做包装或转换**，直接将 `pg` 的原始错误对象向上抛出让调用方（路由层）处理。原因：

1. 路由层已有 `try/catch` 和统一错误处理中间件（`next(e)`）
2. `pg` 的错误对象包含 `code`（SQLSTATE）、`message`、`detail`、`where` 等字段，信息完整
3. 包装会丢失原始错误的诊断信息，不利于问题排查

路由层已有的错误处理逻辑（如 admin.js `/execute` 中的 `catch (err) { console.error(...); return error(res, 'INTERNAL_ERROR', ...) }`）继续工作。

**`statement_timeout` 超时错误**：当查询超过 `statement_timeout` 限制时，`pg` 抛出 `code='57014'`（query_canceled）错误。此错误与其他 SQL 错误一样向上传播。

#### 3.4.7 SSL/TLS 配置（v2 新增）

生产环境中 KingbaseES 连接应启用 SSL/TLS 加密。配置方式：

**环境变量**：

```bash
# SSL/TLS 配置（DB_TYPE=kingbase 时生效）
DB_SSL=true                           # 是否启用 SSL
DB_SSL_REJECT_UNAUTHORIZED=true       # 是否验证服务器证书（生产环境必须为 true）
# DB_SSL_CA=/path/to/ca.crt           # CA 证书路径（可选，需要时配置）
```

**实现**：在 KingbaseAdapter 构造时读取环境变量，传递给 `pg.Pool` 的 `ssl` 参数：

```javascript
ssl: process.env.DB_SSL === 'true'
  ? {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      // ca: process.env.DB_SSL_CA ? fs.readFileSync(process.env.DB_SSL_CA) : undefined,
    }
  : false
```

**安全分级**：
- **开发环境**：`DB_SSL=false`（本地 KingbaseES 无需 SSL）
- **测试/预发环境**：`DB_SSL=true, DB_SSL_REJECT_UNAUTHORIZED=false`（允许自签名证书）
- **生产环境**：`DB_SSL=true, DB_SSL_REJECT_UNAUTHORIZED=true`（严格验证证书）

### 3.5 database.js 改造

现有 `server/db/database.js` 改造为：

```javascript
// 改造后轮廓
const { SqliteAdapter } = require('./adapter/SqliteAdapter');
const { KingbaseAdapter } = require('./adapter/KingbaseAdapter');

let adapter;

async function initDatabase() {
  // 启动校验
  const dbType = process.env.DB_TYPE || 'sqlite';
  if (dbType === 'kingbase') {
    const url = process.env.DATABASE_URL;
    if (!url) {
      console.error('[initDatabase] DB_TYPE=kingbase 但未配置 DATABASE_URL，应用无法启动');
      process.exit(1);
    }
    adapter = new KingbaseAdapter({ /* pool config from env */ });
  } else {
    adapter = new SqliteAdapter({ dbPath: process.env.DB_PATH || './data/database.sqlite' });
  }
  try {
    await adapter.init(); // 执行建表/种子数据，初始化失败则抛出异常
  } catch (err) {
    console.error('[initDatabase] 数据库初始化失败:', err.message);
    process.exit(1);
  }
  return adapter;
}

module.exports = { getAdapter: () => adapter, initDatabase };
```

**关键变更**：
- `initDatabase()` 变为 `async` 函数，`server.js` 中调用处改为 `await initDatabase()`
- 启动时增加环境变量校验：KingbaseES 模式下缺少 `DATABASE_URL` 时立即失败
- 初始化失败（如 KingbaseES 不可达）时输出明确错误并退出进程

### 3.6 路由层改动范围

所有路由文件（约 13 个文件，其中 11 个涉及数据库访问）的改动模式一致：将 `db.prepare(sql).run/get/all()` 替换为 `adapter.query/queryOne/execute()`。

**改动前**（同步）：
```javascript
const user = db.prepare('SELECT ... WHERE id = ?').get(userId);
```

**改动后**（async/await）：
```javascript
const user = await adapter.queryOne('SELECT ... WHERE id = ?', [userId]);
```

**路由 handler 函数 async 改造清单（v2 明确列出）**：

以下 Express 路由 handler（`(req, res, next) => {}` 或 `(req, res) => {}`）需要改为 `async`：

| 文件 | 需标记 async 的 handler | 原因 |
|------|----------------------|------|
| `auth.js` | `/register`（POST）、`/login`（POST） | 包含 `adapter.execute()` 调用 |
| `user.js` | `/profile` 下的 GET/PUT、`/info` 下的 GET | 包含 `adapter.query()/queryOne()/execute()` 调用 |
| `risk.js` | `/predict`（POST，已经是 async）、`/history`（GET） | `/history` 需新增 async |
| `plan.js` | `/generate`（POST，已经是 async）、`/current`（GET）、`/adjust`（PUT，已经是 async） | `/current` 需新增 async |
| `punch.js` | 全部 4 个 handler（GET/POST） | 均包含数据库调用 |
| `articles.js` | 全部约 6 个 handler | 均包含数据库调用 |
| `admin.js` | `/logs`（GET）、`/execute`（POST，已是 sync 包装）、`/chat`（POST，已是 async） | `/logs` 需新增 async；`/execute` 内部逻辑需改为 async/await |
| `assistant.js` | 涉及 DB 的 handler | `adapter.query()/queryOne()` 调用 |
| `doctors.js` | 涉及 DB 的 handler | `adapter.query()/queryOne()` 调用 |
| `diabetes.js` | 涉及 DB 的 handler | `adapter.query()/queryOne()` 调用 |
| `chat.js` | 涉及 DB 的 handler | `adapter.query()/queryOne()` 调用 |

**不变的文件**：`server/routes/upload.js` 和 `server/routes/index.js` 不涉及数据库访问，无需修改。

**Express async error handling 注意**：Express 4.x 不会自动捕获 async handler 中的异常。项目若已有 `express-async-errors` 中间件或全局错误处理 `next(e)` 模式则无需额外处理。否则需在 async handler 内部使用 `try/catch` 并调用 `next(e)`。

**受影响的文件清单**（按改动量）：

| 文件 | 预估 DB 调用数 | 特殊改动点 |
|------|-------------|----------|
| `server/routes/admin.js` | 20+ | 含 `db.transaction()` 事务（改为 `await adapter.transaction()`）、`info.lastInsertRowid` 取值（改为 `result.lastInsertId`）、`PRAGMA table_info` → `adapter.tableInfo()`、`sql` 模式需特殊处理（见第 9 节） |
| `server/routes/plan.js` | 12+ | 含 2 个 `db.transaction()` 事务（改为 `await adapter.transaction()`）、`datetime()` → `sql.now()`、`SELECT MAX(plan_id)+1` 需在 KingbaseES 下加 `FOR UPDATE`（见第 8.5 节） |
| `server/routes/punch.js` | 8+ | 含 `SELECT last_insert_rowid()` 调用（改为 `adapter.execute()` 内部处理）、`datetime()` 带日期运算 |
| `server/routes/risk.js` | 6+ | 含 `json_extract()` SQL 函数（改为 `sql.jsonField()`）、`info.lastInsertRowid` |
| `server/routes/articles.js` | 10+ | 含 `result.lastInsertRowid`、`datetime()` → `sql.now()` |
| `server/routes/auth.js` | 4 | 含 `result.lastInsertRowid` |
| `server/routes/user.js` | 6 | 含 `datetime()` → `sql.now()` |
| `server/routes/assistant.js` | 2 | 无特殊语法 |
| `server/routes/doctors.js` | 3 | 无特殊语法 |
| `server/routes/diabetes.js` | 2 | 无特殊语法 |
| `server/routes/chat.js` | 2 | 无特殊语法 |

---

## 4. SQL 方言差异处理

### 4.1 差异清单

| SQL 特性 | SQLite 写法 | PostgreSQL/KingbaseES 写法 | 出现位置 |
|---------|-----------|--------------------------|---------|
| 当前时间戳 | `datetime('now','localtime')` | `NOW()` 或 `CURRENT_TIMESTAMP` | articles.js, plan.js, user.js, punch.js |
| 日期运算 | `datetime('now','localtime','-7 days')` | `CURRENT_TIMESTAMP - INTERVAL '7 days'` | punch.js:125 |
| 日期提取为字符串 | `date('now','localtime')` | `CURRENT_DATE::text` | punch.js（可能位置） |
| JSON 字段提取 | `json_extract(col, '$.path')` | `col::jsonb->>'path'` | risk.js:154-156 |
| JSON 多路径提取 | `json_extract(col, '$.a.b')` | `col::jsonb#>>'{a,b}'` | 风险：路径含数组索引时语法不同 |
| 获取最后插入ID | `SELECT last_insert_rowid()` | `RETURNING id` | punch.js |
| 自增主键 | `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` | init.sql |
| 布尔值 | `INTEGER CHECK(... IN (0,1))` | `BOOLEAN` | init.sql |
| PRAGMA 查询 | `PRAGMA table_info(tbl)` | `information_schema.columns` | admin.js |
| 字符串连接 | `'a' \|\| 'b'` | `'a' \|\| 'b'`（兼容）或 `CONCAT('a','b')` | — |

**v2 补充**：
- 新增 `date()` 函数行：`date('now','localtime')` → `CURRENT_DATE::text`。在 punch.js 日期比较场景中可能出现。
- 新增 JSON 多路径提取行：`json_extract` 的路径语法与 PostgreSQL `#>>` 运算符路径语法不完全兼容（嵌套数组索引表示方式不同），需在 `sql.jsonField()` 中使用 `->>` 逐级提取而非单次路径表达式。

### 4.2 方言统一策略

**决策**：编写 `server/db/sql.js` 方言辅助模块，路由层统一调用辅助函数，由适配层根据实际后端生成对应 SQL。

关键辅助函数：

| 函数 | 用途 | SQLite 输出 | KingbaseES 输出 |
|------|------|------------|----------------|
| `sql.now()` | 当前时间戳 | `CURRENT_TIMESTAMP` | `CURRENT_TIMESTAMP` |
| `sql.date()` | 当前日期（字符串） | `date('now','localtime')` | `CURRENT_DATE::text` |
| `sql.jsonField(col, path)` | JSON 字段提取（单层路径） | `json_extract(${col}, '$.${path}')` | `${col}::jsonb->>'${path}'` |
| `sql.jsonFieldAs(col, path, type)` | 带类型转换的 JSON 提取 | `CAST(json_extract(...) AS ${type})` | `(${col}::jsonb->>'${path}')::${type}` |
| `sql.insertId()` | INSERT 后获取 ID | 由 `adapter.execute()` 内部处理 | 由 `adapter.execute()` 内部 `RETURNING id` |

**`sql.relativeDate(days)` 设计**（已废弃，见下方推荐替代方案）：

**推荐替代方案（更简单）**：对于日期范围查询，推荐在路由层用 JavaScript 计算日期后作为参数传入 SQL。例如 `punch.js:125` 可改为：
```javascript
const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
// 然后作为参数传入：WHERE user_id = ? AND punch_time >= ?
```
这种方式无需方言函数，两个数据库行为完全一致，且避免了时区歧义。此方案作为首选推荐，`sql.relativeDate()` 不做为必须实现的接口。

**关键简化决策**：`sql.now()` 统一输出 `CURRENT_TIMESTAMP`，SQLite 3.38+ 和 KingbaseES 均支持该函数。这意味着路由层只需把 `datetime('now','localtime')` 替换为 `sql.now()` 即可。对于 DDL 中的 `DEFAULT (datetime('now','localtime'))`，改为 `DEFAULT CURRENT_TIMESTAMP`。

**`sql.now()` 与 UTC 存储决策**：`CURRENT_TIMESTAMP` 在 SQLite 返回 UTC，而 `datetime('now','localtime')` 返回本地时间。这是一个**有意的行为变更**：

- **Phase 0**（SQLite 阶段）：即切换到 `CURRENT_TIMESTAMP`（UTC 存储）。所有新写入的 timestamp 字段为 UTC。读取时前端负责将 UTC 转换为用户本地时区显示。
- **现有数据**：Phase 0 改造前已存储的本地时间数据不受影响（SQLite 存储的是文本 `"2025-06-28 14:30:00"`，不随函数变更而变化）。只有改造后新写入的数据为 UTC 格式。
- **数据迁移时**（Phase 1→Phase 2）：迁移脚本对 SQLite 中所有 datetime 字段进行时区转换（本地时间 → UTC），确保迁移到 KingbaseES 后的数据统一为 UTC。
- **Phase 0 验收标准调整**：从"行为不变"调整为"所有功能正常工作，新写入的 timestamp 为 UTC，前端展示的时间正确"。

### 4.3 DDL 层面差异

DDL 通过两套独立的初始化脚本管理，不在应用 SQL 中处理：
- `server/db/init.sql` — SQLite DDL（保持现有）
- `server/db/init_kingbase.sql` — KingbaseES DDL（见第 10 节）

---

## 5. 双数据库支持策略

**决策**：开发/测试环境使用 SQLite，生产环境使用 KingbaseES，通过环境变量切换。

**理由**：
1. SQLite 零配置、零依赖，适合本地开发和 CI 测试
2. 开发阶段不需要部署 KingbaseES 服务，降低环境搭建成本
3. 同一套应用代码，两个数据库后端，确保代码的可移植性

**切换机制**：

```
.env 配置:
  DB_TYPE=sqlite              # sqlite | kingbase
  DB_PATH=./data/database.sqlite  # SQLite 时使用
  DATABASE_URL=postgresql://user:pass@host:5432/dbname  # KingbaseES 时使用
```

适配层在 `initDatabase()` 阶段读取 `DB_TYPE` 并实例化对应 adapter。所有路由层通过 `getAdapter()` 获取当前 adapter，不感知底层是哪个数据库。

### 5.1 CI 测试策略（v2 新增）

**双后端 CI 测试**：

```
CI Pipeline:
  ├── Job 1: SQLite 后端测试（DB_TYPE=sqlite）
  │   └── npm test（现有测试套件）
  └── Job 2: KingbaseES 后端测试（DB_TYPE=kingbase）
      └── 需要 CI 环境部署 KingbaseES 实例（Docker 容器或远程测试实例）
```

**推荐方案**：使用 Docker 部署 KingbaseES 测试实例：

```yaml
# CI 中的 KingbaseES 服务容器
services:
  kingbase:
    image: kingbase/kingbasees:v8r6
    env:
      DB_USER: system
      DB_PASSWORD: test123
      DB_NAME: diabetes_test
```

**最低要求**：即使在 CI 中无法部署 KingbaseES，至少保证 SQLite 后端的全部测试通过。KingbaseES 后端的功能验证在本地或预发环境手动执行，或在 Phase 1 中通过 Docker Compose 一键启动本地 KingbaseES + 应用进行验证。

### 5.2 版本一致性（v2 新增）

- **开发环境**：SQLite 版本由 `better-sqlite3` npm 包锁定，所有开发者一致
- **生产环境**：KingbaseES 版本通过生产环境基础设施管理，需在部署文档中声明目标版本
- **跨平台**：SQLite（better-sqlite3）在 Windows/macOS/Linux 上行为一致；KingbaseES 为 Linux 服务端，应用通过 TCP 连接，操作系统差异不影响

---

## 6. 渐进式迁移路径

### Phase 0：适配层构建 + SQLite 验证（不影响现有功能）

- 新建 `server/db/adapter/` 目录，实现 `DatabaseAdapter.js`（接口契约）、`SqliteAdapter.js`
- 新建 `server/db/sql.js` 方言辅助模块
- 改造 `server/db/database.js`，导出 adapter 实例（`initDatabase()` 改为 async）
- 逐文件改造路由层，每个文件改造后自测验证
- **关键行为变更**：时间戳存储从本地时间（`datetime('now','localtime')`）切换到 UTC（`CURRENT_TIMESTAMP`）。新写入数据的 timestamp 字段值与原行为相差 8 小时。前端需负责时区转换显示。
- **验收标准**：
  1. 所有现有 API 端点返回的 HTTP 状态码和响应结构与改造前一致
  2. 用户注册/登录流程正常
  3. 风险预测 → 方案生成 → 打卡记录完整流程正常
  4. 管理员日志记录和查询正常
  5. 科普文章 CRUD 正常
  6. 前端页面中显示的时间正确（虽然数据库存储变为 UTC，前端展示应转换为本地时间）
  7. 无功能回归

### Phase 1：KingbaseES 适配层 + 双库并行验证

- 实现 `KingbaseAdapter`（含 `init()` 的多语句 SQL 执行、密码哈希占位符替换机制、`?` → `$1` 参数占位符转换、SSL/TLS 配置、`pool.on('error')` 事件处理）
- 对齐 `init_kingbase.sql` 与 `init.sql` 的 schema 差异（见第 10 节），并将硬编码的 bcrypt 哈希替换为 `__BCRYPT_HASH_PLACEHOLDER__` 占位符。**`init_kingbase.sql` 必须使用 `CREATE TABLE IF NOT EXISTS` 而非 `DROP TABLE IF EXISTS`**（见第 10 节）
- 本地或测试环境部署 KingbaseES 实例（推荐 Docker：`docker run -d -p 54321:54321 kingbase/kingbasees:v8r6`）
- 切换 `DB_TYPE=kingbase`，跑完整功能回归测试
- **admin `/execute` 动态 SQL 方言处理**（见第 9 节）：Phase 1 中 `sql` 模式在 KingbaseES 下受限，仅 `tool_name` 模式全功能可用
- **验收标准**：
  1. 所有 11 个路由文件的功能在 KingbaseES 下行为与 SQLite 一致（时间戳除外——KingbaseES 统一 UTC，SQLite 本地时间为历史数据）
  2. `tool_name` 模式下的 11 个命名操作全部正常（`query_user_profile`、`query_risk_history`、`write_health_advice` 等）
  3. 事务逻辑（plan.js 的方案生成/调整）正常，无并发 plan_id 冲突
  4. 连接池正常工作，连接失败后自动恢复

### Phase 2：生产环境灰度切换

- 生产环境部署 KingbaseES（V8R6 或更高），执行 `init_kingbase.sql` 初始化
- 从 SQLite 导出数据迁移到 KingbaseES（编写一次性数据迁移脚本，含时区转换和 SERIAL 序列重置，见第 12 节）
- 通过 `DB_TYPE=kingbase` 切换生产环境数据库
- 保留 SQLite 数据库文件和代码支持作为回退方案
- **回滚步骤（v2 明确）**：
  1. 将 `DB_TYPE` 改回 `sqlite`
  2. 重启应用
  3. 验证功能正常（回退到迁移前的 SQLite 数据库）
  4. 注意：KingbaseES 期间产生的新数据不会自动同步回 SQLite。如需数据回退，需反向迁移脚本（KingbaseES → SQLite）
- **验收标准**：
  1. 生产环境在 KingbaseES 后端下稳定运行 >= 1 周
  2. 无数据库相关的 P0/P1 故障
  3. 连接池指标正常（无泄漏、无耗尽告警）
  4. 慢查询监控无异常

### Phase 3（可选）：移除 SQLite 支持

- 删除 `SqliteAdapter`、`init.sql`、`seed.sql`
- 删除 `.env` 中的 `DB_TYPE` 和 `DB_PATH`
- 仅保留 KingbaseES 作为唯一数据库
- **触发条件**：Phase 2 稳定运行 >= 1 个月

---

## 7. 连接池管理

### 7.1 SQLite（开发环境）

- 保持单连接模式（better-sqlite3 的原生模式）
- 无连接池概念，无需配置
- 现有 `busy_timeout = 5000` 和 `WAL` 模式继续保留

### 7.2 KingbaseES（生产环境）

使用 `pg.Pool` 配置连接池：

```javascript
// KingbaseAdapter 构造参数
{
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX) || 10,      // 最大连接数
  min: parseInt(process.env.DB_POOL_MIN) || 2,       // 最小保持连接数
  idleTimeoutMillis: 30000,                           // 空闲连接回收时间
  connectionTimeoutMillis: 5000,                      // 连接超时
}
```

#### 7.2.1 connectionTimeoutMillis 与 query_timeout 概念区分（v2 新增）

| 概念 | 配置位置 | 含义 | 本项目配置 |
|------|---------|------|-----------|
| `connectionTimeoutMillis` | `pg.Pool` 构造参数 | 建立新 TCP 连接 + 认证的最大等待时间 | `DB_CONNECT_TIMEOUT`（默认 5000ms） |
| `statement_timeout` | KingbaseES 服务端参数 | 单条 SQL 语句的最大执行时间 | 30000ms（通过连接字符串 `options` 传递） |
| `idleTimeoutMillis` | `pg.Pool` 构造参数 | 空闲连接在被回收前的最大空闲时间 | `DB_IDLE_TIMEOUT`（默认 30000ms） |
| 查询级超时 | 无（pg 不提供） | 从发起查询到收到完整结果的总时间 | —（暂不实现，如需要可通过 `Promise.race()` 在应用层实现） |

**`statement_timeout` 配置说明（重要）**：`statement_timeout` 是 PostgreSQL/KingbaseES 服务端参数，不是 `pg.Pool` 构造函数的配置键——直接写在 Pool 配置对象中会被 `pg` 静默忽略。正确设置方式为在连接字符串中通过 `options` 参数传递：

**方式一（连接字符串）**：在 `DATABASE_URL` 中追加 `options` 查询参数：

```
DATABASE_URL=postgresql://system:password@localhost:54321/diabetes_db?options=-c%20statement_timeout%3D30000
```

其中 `statement_timeout%3D30000` 为 URL 编码后的 `statement_timeout=30000`（单位为毫秒）。

**方式二（分离参数配置）**：如果使用分离参数（DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME）而非 DATABASE_URL 连接字符串，则在 KingbaseAdapter 构造函数中组装连接字符串时拼接 `options` 参数：

```javascript
// 在 KingbaseAdapter 构造时动态拼接连接字符串
const connStr = `postgresql://${user}:${password}@${host}:${port}/${dbName}`;
const options = 'statement_timeout=30000';
this.pool = new pg.Pool({
  connectionString: `${connStr}?options=-c${encodeURIComponent(options)}`,
  max, min, idleTimeoutMillis, connectionTimeoutMillis,
  ssl: sslConfig,  // 见 3.4.7 节
});
```

**方式三（连接后 SET）**：不推荐。每次从 pool 获取连接后执行 `SET statement_timeout = 30000` 增加额外网络往返，且在 `pg.Pool` 的连接生命周期管理中难以保证每个新连接都被正确设置。

**推荐方式一**：连接字符串携带 `options` 参数最简单，所有通过该连接字符串建立的连接自动继承 `statement_timeout` 设置，无需额外代码。

#### 7.2.2 环境变量设计

```
# .env 新增
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_IDLE_TIMEOUT=30000
DB_CONNECT_TIMEOUT=5000
```

**连接池大小建议**：Node.js 单进程，Express 为单线程事件循环。对于本项目的并发量级（中小型应用），`max=10` 足够。如需精确值，可在压测后调整。

---

## 8. 事务处理适配

### 8.1 当前事务模式（SQLite）

```javascript
// plan.js 中的典型事务用法
const result = db.transaction(() => {
  db.prepare('UPDATE ...').run(...);
  db.prepare('INSERT ...').run(...);
  return someValue;
})();
```

特点：同步、函数作用域内自动 commit/rollback、嵌套函数返回值为事务结果。

### 8.2 适配后的事务模式

```javascript
// adapter.transaction() 统一为 async
const result = await adapter.transaction(async (tx) => {
  await tx.execute('UPDATE ...', [...]);
  await tx.execute('INSERT ...', [...]);
  return someValue;
});
```

**实现差异**：
- **SqliteAdapter**：`transaction()` 包裹 `better-sqlite3` 的原生事务，返回 Promise
- **KingbaseAdapter**：`transaction()` 从 pool 获取专属 client，执行 `BEGIN`/`COMMIT`/`ROLLBACK`，完毕后 `client.release()`

### 8.3 受影响的文件

仅 2 个文件使用显式事务：
- `server/routes/plan.js`：2 处事务（`/generate` 和 `/adjust`），每处包含 UPDATE + 批量 INSERT
- `server/routes/admin.js`：1 处事务（`/execute`），包含 SELECT/INSERT/UPDATE + 审计日志写入

改动量小，改写为 async/await 模式即可。

### 8.4 隐式事务说明

当前路由中大量单语句操作（`db.prepare().run()`）在 SQLite 中默认每条语句自动提交。KingbaseES 的 `pg` 驱动中 `pool.query()` 同样每条查询自动提交。行为一致，无需额外处理。

### 8.5 事务隔离级别与并发安全（v2 新增）

**背景**：KingbaseES 默认隔离级别为 READ COMMITTED（PostgreSQL 兼容默认值），而 SQLite WAL 模式下写事务为串行化。`plan.js` 中 `SELECT MAX(plan_id) + 1` 在 READ COMMITTED 下存在并发重复风险：

**问题场景**：
```
事务 A: SELECT MAX(plan_id) → 5  → 计算 plan_id = 6
事务 B: SELECT MAX(plan_id) → 5  → 计算 plan_id = 6
事务 A: INSERT plan_id=6 → COMMIT
事务 B: INSERT plan_id=6 → 成功（因为 plan_id 非唯一约束）→ 同一用户出现两个 plan_id=6!
```

**解决方案：使用 `SELECT ... FOR UPDATE` 锁定行**

```sql
-- plan.js /generate 和 /adjust 中的事务需改为：
SELECT COALESCE(MAX(plan_id), 0) + 1 AS maxId
FROM life_plans WHERE user_id = ? FOR UPDATE
```

`FOR UPDATE` 在 KingbaseES READ COMMITTED 下对匹配的行加行级排他锁。由于事务中首先执行了 `UPDATE life_plans SET is_active = 0 WHERE user_id = ?`，该用户的 life_plans 行已被锁定，后续的 `SELECT MAX(plan_id) ... FOR UPDATE` 将：
- 在同一事务内看到已锁定的行，正常返回
- 在并发事务中，第二个事务的 `FOR UPDATE` 将等待第一个事务提交后才能读取

**SQLite 兼容性**：SQLite 3.33+ 支持 `SELECT ... FOR UPDATE` 语法（虽然 SQLite 在 WAL 模式下已提供写串行化，但语法兼容）。因此此 SQL 变更对两个数据库都有效，且不破坏 SQLite 下的正确性。

**隔离级别建议**：保持 KingbaseES 默认的 READ COMMITTED 级别。对于本项目的事务场景（单用户范围内的方案管理），通过 `FOR UPDATE` 行级锁已足够。无需升级到 SERIALIZABLE（会增加性能开销和序列化冲突重试复杂度）。

---

## 9. admin `/execute` 端点动态 SQL 方言处理（v2 新增）

### 9.1 问题分析

admin.js 的 `/execute` 端点有两种执行模式：

1. **`tool_name` 模式**：`dispatchParameterizedQuery()` 中包含 11 个命名操作的硬编码 SQL。这些 SQL 走适配层改造（`db.prepare` → `adapter.query/queryOne/execute`），方言差异由 `sql.js` 辅助函数处理。**可完全适配**。

2. **`sql` 模式**（第 65-107 行）：接收 Dify AI 动态生成的原始 SQL 字符串，直接传入数据库执行。Dify AI 的工作流 prompt 当前生成的是 SQLite 方言 SQL（含 `json_extract()`、`datetime('now','localtime')`、`last_insert_rowid()` 等）。切换 KingbaseES 后，此 SQL 将因方言不兼容而静默失败。

### 9.2 处理方案

**Phase 1 策略：KingbaseES 下禁用 `sql` 模式，仅保留 `tool_name` 模式**

理由：
1. `sql` 模式是 Dify AI 工具调用的 fallback 路径，其生成的 SQL 无法预知
2. 实现完整的 SQLite→PostgreSQL 方言自动转换（基于 `node-sql-parser` AST 级翻译）复杂性高、边缘情况多，风险不可控
3. `tool_name` 模式已覆盖主要的 CRUD 操作（`query_user_profile`、`query_risk_history`、`query_punch_records`、`query_life_plans`、`query_health_advice`、`write_health_advice`、`update_user_profile`、`query_table`、`insert_record`、`update_record`、`delete_record`、`get_table_schema`）
4. 禁用 `sql` 模式不会导致功能降级——Dify AI 应优先使用 `tool_name` 模式调用

**实现**：在 `admin.js` 的 `/execute` handler 中，`sql` 模式分支前增加判断：

```javascript
// sql 模式分支前
if (!tool_name) {
  // KingbaseES 下禁用 sql 模式
  if (process.env.DB_TYPE === 'kingbase') {
    return error(res, 'UNSUPPORTED', 'KingbaseES 后端暂不支持动态 SQL 模式，请使用 tool_name 参数', 400);
  }
  // SQLite 下保持原有逻辑
  if (!sql) { ... }
  // ... 原有检查和执行逻辑
}
```

**Phase 2+（远期）**：评估以下方案后启用 KingbaseES 下的 `sql` 模式：

- **方案 A（推荐）**：修改 Dify AI 工作流的 system prompt，根据 `DB_TYPE` 环境变量指示 Dify 生成对应方言的 SQL。Dify 工作流支持变量注入——可在调用工作流时传入 `db_type` 参数，prompt 中根据参数切换 SQL 方言。
- **方案 B**：使用 `node-sql-parser` 实现 AST 级方言转换。`node-sql-parser` 的 PostgreSQL 方言支持 `CREATE`/`SELECT`/`INSERT`/`UPDATE`/`DELETE`，但不完全覆盖所有 SQLite 特有函数。可作为方案 A 的补充：对 Dify 输出做已知 SQLite-ism 的检测和告警，不自动转换（避免静默错误）。
- **方案 C**：在 KingbaseES 中安装 `pg_sqlite` 兼容扩展（如果 KingbaseES 支持）。此方案依赖 KingbaseES 特定版本的扩展支持，不推荐作为通用方案。

**`tool_name` 模式的适配**：`dispatchParameterizedQuery()` 函数中的硬编码 SQL 需逐一改造：

| tool_name | SQLite-ism | 适配方式 |
|-----------|-----------|---------|
| `query_risk_history` | 无 SQLite 特有函数 | 直接改造（`db.prepare` → `adapter.query`） |
| `query_punch_records` | 无 SQLite 特有函数 | 直接改造 |
| `query_life_plans` | 无 SQLite 特有函数 | 直接改造 |
| `query_health_advice` | 无 SQLite 特有函数 | 直接改造 |
| `write_health_advice` | `info.lastInsertRowid` | 改为 `result.lastInsertId` |
| `update_user_profile` | `info.changes` | 改为 `result.changes` |
| `query_table` | 无 SQLite 特有函数 | 直接改造（注意：`WHERE ${params.where}` 中的 SQL 片段仍为 SQLite 方言——但这是 Dify 生成的 WHERE 子句，需评估） |
| `insert_record` | `info.lastInsertRowid` | 改为 `result.lastInsertId` |
| `update_record` | `info.changes` | 改为 `result.changes` |
| `delete_record` | `info.changes` | 改为 `result.changes` |
| `get_table_schema` | `PRAGMA table_info(...)` | 改为 `adapter.tableInfo(...)` |

**`query_table` 的风险说明**：`query_table` 操作中 `params.where` 和 `params.order_by` 由 Dify AI 生成，可能包含 SQLite 方言表达式（如 `datetime('now','localtime')` 用于日期比较）。Phase 1 对此做日志记录（在 KingbaseES 下执行 `query_table` 时记录原始 WHERE 子句），但不做自动转换。如果出现问题，通过 Dify prompt 调整解决。

---

## 10. init_kingbase.sql 与 init.sql 对齐方案

### 10.1 当前差异分析

通过比对两个 SQL 文件，发现以下 schema 不一致：

| 表 | 差异项 | init.sql (SQLite 生产) | init_kingbase.sql (KingbaseES 目标) | 处理策略 |
|---|--------|----------------------|----------------------------------|--------|
| users | 缺失字段 | 有 `password_changed`, `created_at`, `updated_at` | 无 | 在 init_kingbase.sql 中补充 |
| users | 默认值 | `password_changed DEFAULT 0` | 无对应列 | 补充列和默认值 |
| articles | 缺失字段 | 有 `user_id`, `tags`, `summary` | 无 | 补充3个字段 |
| articles | 列名差异 | `created_at` | `publish_time` | 统一为 `created_at` |
| articles | 缺失字段 | 有 `views`（INTEGER） | 有 `view_count`（INTEGER） | 统一为 `views` |
| diabetes_types | 列名差异 | `pathogenesis`, `manifestation` | `etiology`, `symptoms` | 统一为 `etiology`, `symptoms` |
| article_collections | 缺失字段 | 有 `created_at` | 无 | 补充 |
| user_risk_info | 缺失字段 | 有 `diabetes_history`, `diabetes_type`, **`result`** | 无（仅有 `disease_type` 作为 `diabetes_type` 的别名） | 补充 3 个字段 |
| user_risk_info | 缺失列 `result`（**v2 新增**） | `result TEXT DEFAULT NULL` | **完全缺失** — risk.js 依赖此列存储 JSON 风险评估结果（`risk_score`, `risk_level`, `risk_level_label`, `matched_diabetes_type`, `advice`），缺失会导致 risk.js 路由 INSERT 失败 | 在 init_kingbase.sql 中补充 `result TEXT DEFAULT NULL` |
| user_risk_info | 类型差异 | `gender CHECK(... male/female)` | `gender VARCHAR(10)` | 统一为 CHECK 约束 |
| life_plans | 列名差异 | `plan_id`, `plan_type`, `order_num`, `time_desc`, `is_active`, `created_at`, `updated_at` | `type`, `sort_order`, `time` | 统一使用 SQLite 命名 |
| life_plans | 枚举值差异（plan_type） | `CHECK(plan_type IN ('diet', 'exercise', 'other'))` | `CHECK(type IN ('饮食', '运动', '其他'))` | 统一为英文值 |
| life_advice | 缺失字段 | 有 `created_at` | 无 | 补充 |
| punch_in | 列名差异 | `plan_item_id` | `plan_id` | 统一为 `plan_item_id` |
| punch_in | 枚举值差异（completion_status） | `'completed'/'uncompleted'` | `'已完成'/'未完成'` | 统一为英文值 |
| punch_in | 枚举值差异（punch_type） | `CHECK(punch_type IN ('diet', 'exercise'))` | `CHECK(punch_type IN ('饮食', '运动'))` | 统一为英文值 |
| punch_in | 外键约束差异 | `FOREIGN KEY (plan_item_id) REFERENCES life_plans(id) ON DELETE SET NULL` | `FOREIGN KEY (plan_id) REFERENCES life_plans(id)` 无 `ON DELETE` 子句 | 以 init.sql 为准，补充 `ON DELETE SET NULL` |
| admin_logs | 列名差异 | `operator_id` | `admin_user_id` | 统一为 `operator_id` |
| admin_logs | 类型差异 | `operation_content TEXT NOT NULL` | `TEXT`（可空） | 统一为 NOT NULL |
| doctor_information | 可空差异 | `chat_token TEXT NOT NULL` | `chat_token VARCHAR(255)`（可空） | 以 init.sql 为准，统一为 NOT NULL |
| doctor_information | 默认值差异 | `description TEXT DEFAULT ''` | `description TEXT` 无默认值 | 以 init.sql 为准，补充 `DEFAULT ''` |
| 全部表 | 索引缺失 | `init.sql` 定义 18 个索引（2 个 UNIQUE INDEX + 16 个普通 INDEX，行 134-151） | `init_kingbase.sql` 无任何索引定义 | 重写时补充全部 18 个索引（PostgreSQL/KingbaseES 兼容语法） |
| 全部表 | DDL 幂等性（**v2 新增**） | 使用 `CREATE TABLE IF NOT EXISTS`（可安全重复执行） | 使用 `DROP TABLE IF EXISTS ... CASCADE` 后 `CREATE TABLE`（重复执行会删除已有生产数据，与幂等初始化目标冲突） | 改为 `CREATE TABLE IF NOT EXISTS`（见 10.2 节） |

### 10.2 对齐策略

**决策**：以 `init.sql`（SQLite 生产环境已验证的 schema）为基准，重写 `init_kingbase.sql`，仅将 SQLite 特有语法翻译为 PostgreSQL 兼容语法，不修改业务语义。

**幂等初始化修正（v2 重要变更）**：原 `init_kingbase.sql` 使用 `DROP TABLE IF EXISTS ... CASCADE` 作为建表前缀。此方式在 `init()` 方法的幂等保证下（已存在数据不重复初始化）会导致：每次应用重启时先删除所有表及其数据，再重新建表——已有生产数据全部丢失。修正为与 `init.sql` 一致的 `CREATE TABLE IF NOT EXISTS` 策略，确保脚本可安全地重复执行。

删除功能保留为独立的 `scripts/drop_kingbase_tables.sql` 脚本（仅开发/测试环境使用，生产环境不可执行）。

**CHECK 约束枚举值统一原则**：所有 CHECK 约束的枚举值以 `init.sql` 中的英文值为准（`'diet'`、`'exercise'`、`'other'`、`'completed'`、`'uncompleted'` 等），不使用 `init_kingbase.sql` 中的中文值（`'饮食'`、`'运动'`、`'其他'`、`'已完成'`、`'未完成'`）。原因：应用代码（`punch.js`、`plan.js`、`validators.js`、`planParser.js`）全程使用英文值进行查询、筛选和数据写入，使用中文枚举值将导致所有相关查询静默返回空结果，造成功能故障。

**翻译规则**：

| SQLite | KingbaseES |
|--------|-----------|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` |
| `TEXT` | `VARCHAR(N)` 或 `TEXT` |
| `INTEGER NOT NULL DEFAULT 0` | `INTEGER NOT NULL DEFAULT 0` |
| `CHECK(role IN ('user','admin'))` | 保持（兼容） |
| `DEFAULT (datetime('now','localtime'))` | `DEFAULT CURRENT_TIMESTAMP` |
| `FOREIGN KEY ... ON DELETE CASCADE` | 保持（兼容） |
| `FOREIGN KEY ... ON DELETE SET NULL` | 保持（兼容） |
| `UNIQUE INDEX` | 保持（兼容） |
| `CREATE TABLE IF NOT EXISTS` | 保持（兼容） |
| `CREATE INDEX IF NOT EXISTS` | 保持（兼容） |

**种子数据对齐**：`seed.sql` 中的种子数据同步到 `init_kingbase.sql`，确保两套数据库初始化后状态一致。当前 `init_kingbase.sql` 中的种子数据（管理员、医生、文章）与 `seed.sql` 内容不同（不同医生姓名、不同文章内容），需统一为 `seed.sql` 的数据。

**种子数据密码哈希处理**：
- SQLite 的 `seed.sql` 使用 `$2a$10$PLACEHOLDER_BCRYPT_HASH_GOES_HERE` 占位符，由 `database.js` 在运行时用 `bcryptjs` 实时生成 `admin123` 的哈希替换
- 当前 `init_kingbase.sql` 中硬编码了一个固定的 bcrypt 哈希值，失去了灵活性
- **决策**：`init_kingbase.sql` 中的管理员密码同样使用占位符 `__BCRYPT_HASH_PLACEHOLDER__`，由 `KingbaseAdapter.init()` 在运行时用 `bcryptjs`（项目已依赖）生成哈希并替换。这与 SQLite 种子机制保持一致

### 10.3 长期双 DDL 维护策略（v2 新增）

在 Phase 0~2 的双数据库支持期间，任何 schema 变更需同时更新 `init.sql` 和 `init_kingbase.sql`。维护策略：

1. **变更流程**：开发者修改 `init.sql`（主要维护对象）→ 对照翻译规则同步修改 `init_kingbase.sql`
2. **一致性检查**：在 CI 中增加 schema diff 检查脚本——读取两个文件，解析出表名、列名、列类型、约束，比较差异并报告不一致
3. **Phase 3 后**：若移除 SQLite 支持，仅维护 `init_kingbase.sql`
4. **风险**：两文件手动同步存在遗漏风险。通过 CI 检查脚本（约 100 行 Node.js 代码，解析 SQL DDL 并逐表比较）可及时发现不一致

---

## 11. 环境配置设计

### 11.1 .env 文件新增字段

```bash
# ========== 数据库类型切换 ==========
DB_TYPE=sqlite                           # sqlite（默认）| kingbase

# ========== SQLite 配置（DB_TYPE=sqlite 时生效）==========
DB_PATH=./data/database.sqlite

# ========== KingbaseES 配置（DB_TYPE=kingbase 时生效）==========
# 方式一：完整连接字符串（含 statement_timeout）
DATABASE_URL=postgresql://system:password@localhost:54321/diabetes_db?options=-c%20statement_timeout%3D30000
# 方式二：分离参数（需在代码中拼接 options 参数，见 7.2.1 节）
# DB_HOST=localhost
# DB_PORT=54321
# DB_NAME=diabetes_db
# DB_USER=system
# DB_PASSWORD=your_password

# ========== 连接池（DB_TYPE=kingbase 时生效）==========
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_IDLE_TIMEOUT=30000
DB_CONNECT_TIMEOUT=5000

# ========== SSL/TLS（DB_TYPE=kingbase 时生效）==========
DB_SSL=false                            # 是否启用 SSL
DB_SSL_REJECT_UNAUTHORIZED=true         # 是否验证服务器证书
# DB_SSL_CA=/path/to/ca.crt             # CA 证书路径（可选）
```

### 11.2 .env.example 同步更新

`.env.example` 中补充上述字段（敏感值为空），供新开发者参考配置格式。

### 11.3 凭据安全（v2 新增）

- **开发环境**：数据库凭据通过 `.env` 文件管理，`.env` 已在 `.gitignore` 中排除
- **生产环境**：数据库凭据通过生产环境的环境变量注入（如 Docker secrets、K8s Secret、云平台环境变量管理），禁止将凭据写入 `.env` 文件或代码仓库
- **最小权限原则**：KingbaseES 应用账户仅授予必要权限：`CONNECT`、对业务表的 `SELECT/INSERT/UPDATE/DELETE`、对序列的 `USAGE`。不授予 DDL 权限（`CREATE/ALTER/DROP`）——DDL 变更通过运维脚本和独立的高权限账户执行
- **连接字符串日志脱敏**：启动失败时输出的错误信息中，`DATABASE_URL` 需脱敏处理（隐藏密码部分），避免凭据泄露到日志系统

### 11.4 数据库初始化流程

```
应用启动
  → initDatabase()
    → 启动校验（DB_TYPE=kingbase 时检查 DATABASE_URL 是否存在）
    → 实例化对应 Adapter
    → adapter.init()
      → SQLite:
        → 读取 init.sql → db.exec(initSql)
        → 检查 users 表是否有数据
        → 无数据时：读取 seed.sql → 用 bcryptjs 生成 admin123 哈希 → 替换占位符 → db.exec(seedSql)
      → KingbaseES:
        → 读取 init_kingbase.sql（使用 CREATE TABLE IF NOT EXISTS，幂等安全）
        → 用 bcryptjs 生成 admin123 哈希 → 替换 __BCRYPT_HASH_PLACEHOLDER__ 占位符
        → 按 ; 分割为语句数组（跳过字符串字面量和注释中的分号）
        → BEGIN 事务 → 逐条 pool.query() → COMMIT
        → 检查 users 表是否有数据 → 无数据时插入种子数据
    → 导出 adapter 实例供路由使用
```

---

## 12. 数据迁移（SQLite → KingbaseES）

生产环境切换时需一次性迁移现有数据。方案概要：

1. 编写 `scripts/migrate-to-kingbase.js` 一次性脚本
2. 脚本流程：连接 SQLite → 读取所有表数据 → 连接 KingbaseES → 按依赖顺序写入（先 users，后关联表）→ 验证行数一致 → 重置所有 SERIAL 序列
3. 密码哈希（bcrypt）直接迁移，KingbaseES 存储的同样是 bcrypt 字符串
4. JSON 字段（`tags`、`result`）在 SQLite 中存储为 TEXT，迁移到 KingbaseES 后继续存为 TEXT 或 JSONB（推荐 JSONB，支持索引和查询优化）
5. **时区转换（重要）**：现有 SQLite 数据中的 datetime 字段使用 `datetime('now','localtime')` 存储为本地时间（UTC+8），而技术方案决定统一使用 UTC 存储。迁移脚本必须对以下表中所有 datetime 字段进行时区转换（减去 8 小时）：

| 表 | datetime 字段 | 说明 |
|---|-------------|------|
| users | `created_at`, `updated_at` | 用户创建/更新时间 |
| doctor_information | `created_at` | 医生记录创建时间 |
| articles | `created_at` | 文章发布时间 |
| article_collections | `created_at` | 收藏时间 |
| user_risk_info | `created_at` | 风险评估时间 |
| life_plans | `created_at`, `updated_at` | 方案创建/更新时间 |
| life_advice | `created_at` | 建议创建时间 |
| punch_in | `punch_time` | 打卡时间 |
| admin_logs | `operation_time` | 操作日志时间 |

**时区转换方法**：读取 SQLite 中存储的本地时间字符串（格式如 `2025-06-28 14:30:00`），使用原生 `Date` 解析后减去 8 小时偏移，再以 UTC ISO 格式写入 KingbaseES。示例逻辑：
```javascript
// 迁移脚本中的时区转换
const localTime = row.created_at; // "2025-06-28 14:30:00"
const utcTime = new Date(localTime + '+08:00').toISOString(); // "2025-06-28T06:30:00.000Z"
```

6. **SERIAL 序列重置（v2 新增）**：迁移数据后，每张表的 SERIAL 序列需要重置为当前最大 `id` 值 + 1，否则后续 INSERT 可能因主键冲突而失败。迁移脚本在所有数据写入完成后执行：

```sql
-- 对每张有 SERIAL 主键的表
SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 0) + 1, false);
SELECT setval('doctor_information_id_seq', COALESCE((SELECT MAX(id) FROM doctor_information), 0) + 1, false);
SELECT setval('articles_id_seq', COALESCE((SELECT MAX(id) FROM articles), 0) + 1, false);
-- ... 对全部 10 张表重复
```

`setval` 的第三个参数 `false` 表示下一个 `nextval()` 返回的值是 `setval` 指定值（而非 +1），确保序列生成的下一个 ID 大于当前最大 ID。

7. **迁移前备份（v2 新增）**：执行迁移脚本前必须备份：
   - SQLite 数据库文件：直接复制 `database.sqlite` 到安全位置
   - KingbaseES 目标库（如已有数据）：使用 `pg_dump` 导出

**迁移顺序**（FK 依赖约束）：
```
users → doctor_information → diabetes_types → articles
→ article_collections → user_risk_info → life_plans
→ life_advice → punch_in → admin_logs
```

---

## 13. 非功能性需求（v2 新增）

### 13.1 安全

| 维度 | 决策 | 实现位置 |
|------|------|---------|
| 传输加密 | KingbaseES 生产连接启用 SSL/TLS | KingbaseAdapter 构造函数（`ssl` 参数），见 3.4.7 节 |
| 凭据管理 | 通过环境变量注入，禁止硬编码 | `.env` 文件（开发）/ 生产环境变量注入（生产），见 11.3 节 |
| 最小权限 | 应用账户仅授予 CONNECT + DML 权限 | KingbaseES 数据库管理员操作手册，不在代码中体现 |
| SQL 注入防护 | 继续使用参数化查询（`$1, $2, ...`），不拼接用户输入到 SQL 字符串 | 适配层的 `query()`/`execute()` 方法 |
| 日志脱敏 | 连接错误日志中隐藏密码 | KingbaseAdapter 错误处理，见 3.4.6 节 |

### 13.2 监控与可观测性

| 维度 | 决策 | 实现位置 |
|------|------|---------|
| 连接池指标 | 暴露 `pool.totalCount`、`pool.idleCount`、`pool.waitingCount` | 可在 `healthCheck()` 中返回，或通过独立的 `/health` 端点暴露 |
| 慢查询日志 | 在 `KingbaseAdapter.query()` 中包裹计时逻辑，超过阈值（如 1000ms）输出 warn 日志（含 SQL 摘要和参数数量） | KingbaseAdapter.query() 内部 |
| 连接池事件日志 | `pool.on('connect')`、`pool.on('acquire')`、`pool.on('remove')` 记录 DEBUG 级别日志 | KingbaseAdapter 构造函数，见 3.4.2 节 |
| 健康检查 | `GET /health` 端点返回数据库连接状态（调用 `adapter.healthCheck()`） | `server/routes/index.js` 或独立路由 |
| 错误追踪 | 数据库异常通过 `console.error` 输出（含 SQLSTATE code、message），可被日志收集系统采集 | 路由层已有的 `catch` 块 |

**健康检查实现**：
- **SqliteAdapter.healthCheck()**：执行 `SELECT 1`，检查数据库连接是否打开
- **KingbaseAdapter.healthCheck()**：调用 `pool.query('SELECT 1')`，成功返回 `true`，失败返回 `false`

### 13.3 运维

| 维度 | 决策 |
|------|------|
| 备份策略 | **SQLite**：定时复制 `database.sqlite` 文件（cron job，每小时）。**KingbaseES**：`pg_dump` 每日全量备份 + WAL 归档（依赖 KingbaseES DBA 配置）。备份脚本 `scripts/backup-kingbase.sh` 提供参考 |
| 停机时间 | 数据库切换（SQLite ↔ KingbaseES）通过修改 `.env` + 重启应用完成，预计停机时间 < 1 分钟。数据迁移期间需额外停机（取决于数据量） |
| 版本升级路径 | KingbaseES V8R6 → 更高版本的升级通过 pg_dump/restore 或 pg_upgrade 完成。应用层面（`pg` 驱动）无需变更 |
| 字符集 | KingbaseES 默认 UTF-8，与 SQLite 一致，无需额外配置 |
| 查询性能基准 | Phase 1 双库对比测试中记录关键端点的查询耗时（`/api/risk/history`、`/api/plan/current`、`/api/admin/logs`），对比 SQLite vs KingbaseES 的性能差异，识别慢查询 |
| N+1 查询风险 | 当前代码中路由层查询模式为单次查询获取列表（如 `SELECT ... WHERE user_id = ? ORDER BY ...`），不存在 N+1 问题。但 admin.js `dispatchParameterizedQuery` 中的 `get_table_schema` 对每个字段执行独立查询需关注——当前仅查询一次 PRAGMA，无循环 |
| 双 DDL 同步 | 见 10.3 节 |

---

## 14. 前端确认

**确认**：前端代码无需任何修改。原因：
1. 所有 API 接口的请求/响应格式不变（JSON）
2. 路由路径不变
3. 字段名在 schema 对齐后保持一致
4. 前端不直接访问数据库

---

## 15. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 同步→异步改造引入竞态条件 | 路由逻辑错误 | 每个路由文件改造后单独自测；`plan.js` 事务逻辑重点回归 |
| SQLite 与 KingbaseES 行为差异 | 查询结果不同 | Phase 1 双库并行验证，跑全量功能测试 |
| `CURRENT_TIMESTAMP` 时区语义差异 | 时间字段值偏移（UTC vs 本地时间） | 统一 UTC 存储，前端转换；Phase 0 明示此为有意行为变更 |
| KingbaseES 连接不可用 | 生产故障 | 保留 `DB_TYPE=sqlite` 快速回退路径；启动时快速失败（非静默降级） |
| 迁移脚本数据丢失 | 生产数据损坏 | 先备份 SQLite 文件；逐表迁移并验证行数；事务内执行 |
| init_kingbase.sql 分号分割误判 | 初始化失败 | 实现时使用状态机处理字符串字面量；备选方案为拆分为 DDL/种子两个文件 |
| KingbaseAdapter 占位符转换覆盖不全 | 参数化查询失败 | 状态机实现时覆盖单引号字符串内 `?` 的跳过逻辑；单元测试覆盖含字符串字面量的 SQL 语句 |
| `statement_timeout` 配置被静默忽略 | 生产查询无超时保护 | 通过连接字符串 `options` 参数传递（见 7.2.1 节），启动后验证 |
| **（v2 新增）admin /execute sql 模式动态 SQL 方言不兼容** | Dify AI 生成的 SQLite SQL 在 KingbaseES 上失败 | Phase 1 禁用 sql 模式（仅 tool_name 模式可用）；Phase 2+ 通过 Dify prompt 引导 PostgreSQL 语法 |
| **（v2 新增）plan_id 并发重复** | 同一用户出现重复 plan_id，方案数据混乱 | `SELECT MAX(plan_id) ... FOR UPDATE` 行级锁（见 8.5 节） |
| **（v2 新增）SSL/TLS 未配置** | 生产环境数据库通信明文传输，安全合规风险 | 生产环境强制 `DB_SSL=true` + `DB_SSL_REJECT_UNAUTHORIZED=true`（见 3.4.7 节） |
| **（v2 新增）连接池 idle 连接断开未处理** | Node.js 进程因未捕获异常崩溃 | `pool.on('error', ...)` 事件监听器（见 3.4.2 节） |
| **（v2 新增）SERIAL 序列未重置** | 数据迁移后新 INSERT 因主键冲突失败 | 迁移脚本最后执行 `SELECT setval()` 对所有表（见 12 节） |
| **（v2 新增）启动时环境变量缺失** | `DB_TYPE=kingbase` 但无 `DATABASE_URL`，应用静默使用空连接字符串导致诡异错误 | `initDatabase()` 启动校验，缺失时立即 `process.exit(1)` 并输出明确错误（见 3.5 节） |
| **（v2 新增）双 DDL 文件不一致** | init.sql 与 init_kingbase.sql schema 不同步，导致两个后端行为差异 | CI schema diff 检查脚本（见 10.3 节） |
| **（v2 新增）init_kingbase.sql DROP TABLE 误删生产数据** | 应用重启导致生产数据全部丢失 | 改为 `CREATE TABLE IF NOT EXISTS`（见 10.2 节） |
| **（v2 新增）user_risk_info.result 列缺失** | risk.js 路由 INSERT 和 SELECT（json_extract）失败 | init_kingbase.sql 补充 `result TEXT DEFAULT NULL` 列（见 10.1 节） |
| **（v2 新增）KingbaseES 目标版本未声明** | 开发/测试/生产环境使用不同版本导致行为差异 | 声明目标版本为 V8R6+（见第 1 节） |
| **（v2 新增）RETURNING id 假定主键名** | 若将来新增表的主键名不是 `id`，自动追加的 `RETURNING id` 将失败 | 当前所有表主键均为 `id`，假定成立。在方案中声明此适用边界（见 3.4.4 节） |

---

## 16. 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `server/db/adapter/DatabaseAdapter.js` | 适配层接口契约（JSDoc 标注） |
| 新建 | `server/db/adapter/SqliteAdapter.js` | SqliteAdapter 实现（含 init、tableInfo、healthCheck 方法） |
| 新建 | `server/db/adapter/KingbaseAdapter.js` | KingbaseAdapter 实现（含 init 多语句执行、`?`→`$1` 占位符转换、RETURNING id 自动追加、tableInfo、healthCheck 方法、SSL/TLS 配置、pool.on('error') 事件处理） |
| 新建 | `server/db/sql.js` | SQL 方言辅助函数（含 now / date / jsonField / jsonFieldAs） |
| 改造 | `server/db/database.js` | 引入 adapter 子目录，导出 `getAdapter()`；`initDatabase()` 改为 async；增加启动环境变量校验 |
| 改造 | `server/routes/auth.js` | `db.prepare` → `adapter.query/queryOne/execute`；handler 标记 async |
| 改造 | `server/routes/user.js` | 同上 + `datetime()` → `sql.now()`；handler 标记 async |
| 改造 | `server/routes/risk.js` | 同上 + `json_extract` → `sql.jsonField/sql.jsonFieldAs`；`/history` handler 标记 async |
| 改造 | `server/routes/plan.js` | 同上 + `db.transaction` → `adapter.transaction` + `datetime()` → `sql.now()` + `SELECT MAX(plan_id)` 加 `FOR UPDATE`；`/current` handler 标记 async |
| 改造 | `server/routes/punch.js` | 同上 + `last_insert_rowid()` → adapter.execute 内部处理 + `datetime()` 日期运算 → 应用层计算日期参数 |
| 改造 | `server/routes/articles.js` | 同上 + `datetime()` → `sql.now()`；handler 标记 async |
| 改造 | `server/routes/admin.js` | 同上 + `PRAGMA table_info` → `adapter.tableInfo()` + `db.transaction` → `adapter.transaction`；`/logs` handler 标记 async；`sql` 模式在 KingbaseES 下禁用 |
| 改造 | `server/routes/assistant.js` | `db.prepare` → `adapter.query/queryOne`；handler 标记 async |
| 改造 | `server/routes/doctors.js` | 同上 |
| 改造 | `server/routes/diabetes.js` | 同上 |
| 改造 | `server/routes/chat.js` | 同上 |
| 重写 | `server/db/init_kingbase.sql` | 对齐 init.sql schema（使用 `CREATE TABLE IF NOT EXISTS`，补充 `result`/`diabetes_history`/`diabetes_type` 字段、全部 18 个索引、doctor_information 和 punch_in 约束修复、列名/枚举值统一）；种子数据使用 `__BCRYPT_HASH_PLACEHOLDER__` 占位符，内容对齐 seed.sql |
| 新建 | `scripts/migrate-to-kingbase.js` | 一次性数据迁移脚本（含时区转换 + SERIAL 序列重置 + 迁移前后备份提示） |
| 新建 | `scripts/drop_kingbase_tables.sql` | 独立的删表脚本（仅开发/测试环境使用，非 init 的一部分） |
| 新建 | `scripts/backup-kingbase.sh` | KingbaseES 备份脚本参考（pg_dump 每日全量） |
| 更新 | `.env` | 增加 DB_TYPE、DATABASE_URL（含 `options` 参数示例）、连接池配置、SSL 配置 |
| 更新 | `.env.example` | 同步新增字段 |
| 更新 | `package.json` | 增加 `pg` 依赖 |
| 不变 | `src/`（前端） | 零改动 |
| 不变 | `server/middleware/` | 零改动 |
| 不变 | `server/services/` | 零改动 |
| 不变 | `server/utils/` | 零改动（pagination/validators/response 等与数据库无关） |
| 不变 | `server/routes/upload.js` | 零改动（文件上传，不涉及数据库） |
| 不变 | `server/routes/index.js` | 零改动（路由索引，不涉及数据库） |

---

## 修订说明（v4 → v2-v1）

本轮修订基于技术方案诊断报告（`b_v1_diag_v2.md`）的反馈，共解决全部 20 个问题（3 个严重、8 个一般、9 个轻微），并补充了非功能性维度（安全、监控、运维）。

### 一、严重问题修复（3 个）

**修订 R1：`user_risk_info.result` 列缺失（问题 1）**

在 10.1 节差异分析表中显式新增 `user_risk_info.result` 行的缺失标记。原 init_kingbase.sql 的 user_risk_info 表缺少 `result TEXT DEFAULT NULL` 列——risk.js 依赖此列存储 JSON 风险评估结果（`risk_score`、`risk_level`、`risk_level_label`、`matched_diabetes_type`、`advice`），缺失会导致 risk.js 路由的 INSERT 和 `json_extract` SELECT 在 KingbaseES 下失败。已在 15 节风险表中新增对应风险项。

**修订 R2：`init_kingbase.sql` `DROP TABLE IF EXISTS` 冲突（问题 2）**

修正了 `init_kingbase.sql` 的幂等初始化策略。原方案在 3.3 节和 10.3 节描述的"执行 init_kingbase.sql 后检查 users 表"存在逻辑缺陷：`DROP TABLE IF EXISTS ... CASCADE` 在检查之前执行，已有生产数据已被删除。修正为：
- `init_kingbase.sql` 使用 `CREATE TABLE IF NOT EXISTS`（与 init.sql 一致），可安全重复执行
- 删除功能移至独立的 `scripts/drop_kingbase_tables.sql` 脚本（仅开发/测试环境使用）
- 在 10.1 节差异表中新增"DDL 幂等性"行；在 16 节文件变更清单中新增 `drop_kingbase_tables.sql` 文件

**修订 R3：admin `/execute` 动态 SQL 方言（问题 3/问题 12）**

新增第 9 节完整讨论此问题。决策为：
- Phase 1：KingbaseES 下禁用 `sql` 模式（返回明确错误提示 `tool_name` 参数），仅 `tool_name` 模式全功能可用
- Phase 2+：通过修改 Dify AI prompt（方案 A）、node-sql-parser 检测（方案 B）、或 KingbaseES 扩展（方案 C）逐步启用
- `tool_name` 模式中 11 个命名操作的适配方式已逐项列出
- `query_table` 操作中 Dify 生成的 WHERE 子句风险已识别
- 在 6 节 Phase 1 验收标准中明确此项限制；在 15 节风险表中新增对应风险项

### 二、一般问题修复（8 个）

**修订 R4：适配层文件结构统一（问题 4）**

将全文中所有不一致的适配层文件路径引用统一为 `server/db/adapter/` 子目录结构：
- `server/db/adapter/DatabaseAdapter.js`（接口契约）
- `server/db/adapter/SqliteAdapter.js`
- `server/db/adapter/KingbaseAdapter.js`
在 3.1 节新增"文件结构"子节，明确声明此为标准结构，并在 16 节文件变更清单中同步更新。修正了 3.4 节 database.js 中的 require 路径示例。

**修订 R5：`init()` 方法补充（问题 5）**

在 3.2 节 DatabaseAdapter 接口中新增 `init()` 方法，包含：
- 完整的方法签名 `async init() → void`
- 职责说明（执行 DDL 建表 + 种子数据初始化）
- 幂等保证要求
- 失败行为（抛出异常）

**修订 R6：SERIAL 序列重置（问题 6）**

在 12 节数据迁移方案中新增第 6 条"SERIAL 序列重置"，给出全部 10 张表的 `SELECT setval()` 语句模板，说明 `setval` 第三个参数 `false` 的含义。在 15 节风险表中新增对应风险项。

**修订 R7：async 改造范围显式说明（问题 7）**

在 3.6 节新增"路由 handler 函数 async 改造清单"表格，逐文件列出需要标记 `async` 的具体 handler 函数。同时补充了 Express 4.x async error handling 的注意事项（`express-async-errors` 或 `try/catch + next(e)`）。

**修订 R8：Phase 0 时间戳语义变更明示（问题 13）**

修正了 Phase 0 验收标准中"行为不变"与 UTC 存储决策的矛盾：
- 在 4.2 节 `sql.now()` 说明中新增"`sql.now()` 与 UTC 存储决策"段落，明确标注此为**有意的行为变更**
- 在 6 节 Phase 0 验收标准中明确列出了时间相关验收条目
- 现有数据不受影响（改造前已存储的数据保持原样），仅新写入数据为 UTC
- 增加了前端时区转换的明确要求

**修订 R9：事务并发安全——`FOR UPDATE` 行级锁（问题 14）**

在 8.5 节新增"事务隔离级别与并发安全"子节：
- 分析 `plan.js` 中 `SELECT MAX(plan_id) + 1` 在 KingbaseES READ COMMITTED 下的并发重复风险场景
- 给出具体解决方案：`SELECT ... FOR UPDATE`
- 验证 SQLite 3.33+ 的兼容性
- 给出隔离级别建议（保持 READ COMMITTED，不升级到 SERIALIZABLE）

**修订 R10：SSL/TLS 配置（问题 15）**

在 3.4.7 节新增"SSL/TLS 配置"子节，包含：
- 环境变量设计（`DB_SSL`、`DB_SSL_REJECT_UNAUTHORIZED`、`DB_SSL_CA`）
- `pg.Pool` 的 `ssl` 参数构造
- 安全分级（开发/测试/生产环境的差异配置）
在 11.1 节 `.env` 设计、13.1 节安全维度中同步补充

**修订 R11：连接池错误处理和重连机制（问题 9）**

在 3.4.2 节新增"连接池错误处理"子节，包含：
- `pool.on('error', ...)` 的必要性说明和实现
- 连接池耗尽行为分析
- KingbaseES 服务不可用时的启动行为（快速失败、明确错误信息）
在 3.4.3 节新增"KingbaseES 服务不可用时的启动行为"子节

### 三、轻微问题修复（9 个）

**修订 R12：3.3/10.3 节幂等检查位置一致性（问题 8）**

此问题本质上是问题 2 的一部分。在 3.4.5 节 init() 方法的第 7 步中明确了幂等检查顺序（事务提交后 → 检查 users 表 → 插入种子数据），与 11.4 节初始化流程图保持一致。

**修订 R13：healthCheck() KingbaseES 端实现（问题 10）**

在 13.2 节监控维度中明确了两端的 `healthCheck()` 实现方式（SQLite 检查连接是否打开，KingbaseES 执行 `SELECT 1`）。

**修订 R14：connectionTimeoutMillis 与 query_timeout 区分（问题 11）**

在 7.2.1 节新增"connectionTimeoutMillis 与 query_timeout 概念区分"表格，明确区分了 `connectionTimeoutMillis`、`statement_timeout`、`idleTimeoutMillis` 和查询级超时的概念和配置位置。

**修订 R15：KingbaseES 目标版本声明（问题 16）**

在第 1 节"总体方案概览"中新增"目标 KingbaseES 版本"段落，明确目标为 V8R6 及以上（基于 PostgreSQL 12 兼容内核），并说明选择依据。

**修订 R16：长期双 DDL 同步维护策略（问题 17）**

在 10.3 节新增"长期双 DDL 维护策略"子节，给出变更流程、CI 一致性检查脚本思路、Phase 3 后的简化路径。

**修订 R17：数据库备份策略（问题 18）**

在 13.3 节运维维度中新增备份策略行（SQLite 文件复制 + KingbaseES pg_dump/WAL），并在 16 节文件变更清单中新增 `scripts/backup-kingbase.sh` 参考脚本。

**修订 R18：RETURNING id 适用边界声明（问题 19）**

在 3.4.4 节 `execute()` 的 INSERT ID 获取策略中新增"适用边界"段落，明确声明当前假定（所有表主键列名为 `id`）及其适用范围，并给出将来扩展的方向。

**修订 R19：启动时环境变量校验（问题 20）**

在 3.5 节 database.js 改造中新增启动校验逻辑（`DB_TYPE=kingbase` 但无 `DATABASE_URL` 时快速失败），在 11.4 节初始化流程图中明确校验步骤，在 15 节风险表中新增对应风险项。

**修订 R20：非功能性维度补充（安全、监控、运维）**

新增第 13 节"非功能性需求"，覆盖：
- 安全（5 个维度：传输加密、凭据管理、最小权限、SQL 注入防护、日志脱敏）
- 监控（5 个维度：连接池指标、慢查询日志、连接池事件日志、健康检查、错误追踪）
- 运维（7 个维度：备份、停机、版本升级、字符集、性能基准、N+1 查询、双 DDL 同步）

### 四、其他改进

- **4.1 节差异清单补充**：新增 `date()` 函数行和 JSON 多路径提取行
- **5.1 节 CI 测试策略**：新增 CI 双后端测试方案（含 Docker KingbaseES 服务容器示例）
- **5.2 节版本一致性**：新增开发/生产环境版本一致性讨论
- **6 节回滚方案**：Phase 2 回滚步骤从"保留 SQLite 回退"扩展为具体 4 步操作（含数据回退注意事项）
- **8.5 节隔离级别**：新增 KingbaseES READ COMMITTED 默认隔离级别的说明和与 SQLite WAL 的对比
- **11.3 节凭据安全**：新增凭据管理、最小权限原则、连接字符串日志脱敏的讨论
- **13.1 节安全维度**：新增传输加密、SQL 注入防护、日志脱敏的确认条目
- **15 节风险表**：新增 10 个风险项（覆盖所有 v2 新增问题），风险总数从 8 个扩展到 18 个
- **16 节文件变更清单**：新增 `DatabaseAdapter.js`、`drop_kingbase_tables.sql`、`backup-kingbase.sh` 条目
