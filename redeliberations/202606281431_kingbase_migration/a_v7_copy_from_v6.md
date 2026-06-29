# 引入国产金仓数据库 KingbaseES —— 技术方案（v9）

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
- 内部 `better-sqlite3` 是同步的，但 `Promise.resolve(syncCall())` 中的 `syncCall()` 在 Promise 构造前执行，同步抛出的异常不会被 Promise 捕获。正确做法：SqliteAdapter 的 `query()`、`queryOne()`、`execute()` 等方法声明为 `async` 函数，`async` 函数体会自动将 better-sqlite3 的同步异常转换为 rejected Promise，与 KingbaseAdapter 的 async 方法在错误处理模型上完全一致
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

- **`transaction()` 连接释放保护（v4 新增）**：`client.release()` 必须在所有路径（正常 COMMIT、业务异常 ROLLBACK、ROLLBACK 自身失败）中执行，否则连接将永久泄漏直至数据库端 idle timeout 回收。实现必须使用 `try/catch/finally` 结构：

```javascript
// KingbaseAdapter.transaction() 实现轮廓
async transaction(fn) {
  const client = await this.pool.connect();
  try {
    await client.query('BEGIN');
    const txAdapter = new ClientAdapter(client);  // 绑定到 client 的轻量适配器
    const result = await fn(txAdapter);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (rollbackErr) {
      // ROLLBACK 失败（如连接已断开）时仅记录日志，不覆盖原始异常
      console.error('[KingbaseAdapter] ROLLBACK failed:', rollbackErr.message);
    }
    throw err;  // 仍抛出原始业务异常
  } finally {
    client.release();  // 确保所有路径下连接都被释放
  }
}
```

关键设计点：
- `finally` 块确保无论 COMMIT/ROLLBACK 成功或失败，`client.release()` 都被调用
- ROLLBACK 失败时仅记录日志，不覆盖原始业务异常（原始异常才是调用方需要处理的）
- `ClientAdapter` 是事务内使用的轻量适配器，其 `query/queryOne/execute` 方法调用 `client.query()` 而非 `pool.query()`，确保所有操作在同一事务连接上执行
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

**事务内 DDL 兼容性验证（v3 新增）**：

方案将 DDL（CREATE TABLE）包裹在事务（`BEGIN ... COMMIT`）中执行。虽然 PostgreSQL 协议支持事务内 DDL，但 KingbaseES V8R6 的具体行为需在实现前验证：

1. **验证目标**：确认 KingbaseES V8R6 在事务内执行 `CREATE TABLE IF NOT EXISTS` 是否会导致隐式提交（即 DDL 语句自动提交当前事务，使后续 DDL 脱离事务保护）
2. **验证方法**：在 KingbaseES V8R6 测试实例上执行：
   ```sql
   BEGIN;
   CREATE TABLE IF NOT EXISTS _test_ddl_tx (id SERIAL PRIMARY KEY);
   -- 此时不提交，另开会话检查 _test_ddl_tx 是否可见（若不可见则 DDL 在事务内）
   ROLLBACK;
   -- 检查 _test_ddl_tx 是否存在（应不存在，证明 ROLLBACK 有效）
   DROP TABLE IF EXISTS _test_ddl_tx;
   ```
3. **若 DDL 触发隐式提交**：则 DDL 包裹在事务中的方案不可行——部分表 CREATE 后若后续语句失败，已创建的 DDL 无法回滚，幂等初始化在部分失败后留下中间状态。此时**必须采用拆分方案**（将 `init_kingbase.sql` 拆为 DDL 和种子数据两个文件，DDL 部分不使用事务包裹，种子数据部分单独使用事务包裹）

**推荐**：在实现 KingbaseAdapter 之前完成此验证，将拆分 DDL/种子文件的方案从"备选"提升为"首推方案"——拆分后：
- DDL 文件（`init_kingbase_ddl.sql`）使用 `CREATE TABLE IF NOT EXISTS` 保证幂等，不在事务中执行
- 种子数据文件（`init_kingbase_seed.sql`）在事务中执行，保证种子数据插入的原子性
- 降低了分号分割复杂度和事务内 DDL 兼容性风险

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
const sql = require('./sql');  // v6 新增：方言辅助模块

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
    sql.setDialect(dbType);  // 设置方言模块的数据库类型（v6 新增，见 4.2 节方言感知机制）
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

### 3.5.1 server.js 启动流程改造（v3 新增）

当前 `server.js`（见项目根目录）的启动流程为同步调用：

```javascript
// 当前 server.js
require('dotenv').config();
const { initDatabase, db } = require('./server/db/database');
initDatabase();  // 同步调用，实际不等待初始化完成
const app = require('./server/app');
// ... 路由挂载 ...
app.listen(PORT, () => { ... });
```

由于 `initDatabase()` 改为 async 后返回 Promise，`server.js` 必须确保数据库初始化完成后再启动 HTTP 服务。改造轮廓如下：

```javascript
// 改造后 server.js（方式一：IIFE + async/await，推荐）
require('dotenv').config();
const { initDatabase, getAdapter } = require('./server/db/database');
const app = require('./server/app');

const PORT = process.env.PORT || 3000;

// 确保上传目录
const uploadRoutes = require('./server/routes/upload');
if (uploadRoutes.ensureUploadDir) {
  uploadRoutes.ensureUploadDir();
}

// 数据库初始化完成后再启动服务
(async () => {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('数据库初始化失败，应用无法启动:', err.message);
    process.exit(1);
  }
})();
```

**顶层 await 方案说明**：

| 方案 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| **方式一（推荐）**：IIFE + async/await | 将启动逻辑包裹在 `(async () => { ... })()` 中 | 不依赖 ESM；所有 Node.js 版本（含 12.x）均支持；语法直观、错误处理清晰 | 比顶层 await 多一层缩进 |
| 方式二：`.then()` 链式调用 | `initDatabase().then(() => { app.listen(...) }).catch(err => { ... })` | 无需 async 函数包裹 | 错误处理不如 async/await 直观；嵌套回调风格 |
| 方式三：顶层 await（ESM） | 将 `server.js` 改为 `.mjs` 或 `package.json` 设置 `"type": "module"` | 语法最简洁 | 需改变项目模块系统（当前为 CJS），影响面大（所有 `require` → `import`） |

**推荐方式一**（IIFE + async/await）：不改变项目模块系统，兼容所有 Node.js 版本，错误处理路径清晰。方式二作为备选。

**时序保证**：`app.listen()` 仅在 `await initDatabase()` 成功返回后执行。若数据库初始化失败（如 KingbaseES 不可达、DDL 执行异常），进程在 IIFE 的 catch 块中退出，HTTP 服务永不启动——避免应用在数据库不可用状态下接受请求导致运行时错误。

### 3.5.2 Phase 0 过渡策略：database.js 与路由文件的改动顺序（v6 新增）

**核心矛盾**：Phase 0 描述为"改造 database.js 导出 adapter"后"逐文件改造路由层并自测"，但 database.js 一旦改造完成、`db` 导出消失，所有尚未改造的 11 个路由文件因 `require('../db/database')` 中 `db` 为 `undefined` 而无法启动。database.js 与全部 11 个路由文件的改动必须原子性同时完成，不存在"逐文件改造后自测"的可能性。

**推荐方案：双导出过渡（6 步）**

Phase 0 采用以下顺序，确保每个步骤后应用均可正常启动和自测：

| 步骤 | 操作 | 此时 database.js 导出 | 路由文件状态 | 可启动 |
|------|------|----------------------|-------------|--------|
| 1 | 新建 `server/db/adapter/` 目录下全部 3 个文件（DatabaseAdapter.js、SqliteAdapter.js、KingbaseAdapter.js）和 `server/db/sql.js` | 旧接口 `db`（不变） | 全部使用旧 `db` | 是 |
| 2 | 改造 `database.js`：引入 SqliteAdapter，实例化 adapter，**同时导出旧接口 `db` 和新接口 `getAdapter()`**。`db` 通过 `SqliteAdapter` 内部暴露的 better-sqlite3 Database 实例提供（`adapter.db` 属性），保证旧路由文件仍可通过 `require('../db/database').db` 获取原始 better-sqlite3 对象 | `db` + `getAdapter()` | 全部使用旧 `db` | 是 |
| 3 | 新建 `server/db/sql.js` 方言辅助模块，设置初始方言为 `sqlite`（通过 `sql.setDialect('sqlite')` 或硬编码默认值） | `db` + `getAdapter()` | 全部使用旧 `db`（sql.js 可独立测试） | 是 |
| 4 | **逐文件改造路由层**：每改造完一个路由文件（将其中的 `db.prepare` 改为 `adapter.query/queryOne/execute`，handler 改为 async），立即重启应用并自测该文件对应的 API 端点。此时数据库访问是混合模式——部分路由走 adapter（通过 `getAdapter()`），部分路由仍走旧 `db`——两者操作同一个 SQLite 文件，不存在数据一致性风险 | `db` + `getAdapter()` | 逐步迁移中 | 是（每个文件改造后可立即验证） |
| 5 | **全部 11 个路由文件改造完成后**，移除 `database.js` 中的旧 `db` 导出 | 仅 `getAdapter()` | 全部使用 adapter | 是 |
| 6 | 运行 `scripts/phase0_utc_convert.sql`（若采用 Phase 0 UTC 转换策略，见 4.2 节），运行全量回归测试 | 仅 `getAdapter()` | 全部使用 adapter | 是 |

**关键设计点**：

1. **SqliteAdapter 暴露原始 db 实例**：SqliteAdapter 构造函数中 `this.db = new Database(dbPath)` 创建的 better-sqlite3 Database 实例通过 `adapter.db` 属性对外暴露。`database.js` 在步骤 2 中导出 `module.exports = { db: adapter.db, getAdapter: () => adapter, initDatabase }`，确保旧路由文件中的 `const { db } = require('../db/database')` 仍能获取到正确的 better-sqlite3 对象。

2. **步骤 4 的自测粒度**：每个路由文件改造后，手工测试该文件对应的 API 端点（而非全量回归），验证 adapter 调用链路正确。全量回归测试在步骤 5 后进行。

3. **备选方案：先建后切（原子提交）**：先创建 adapter 目录下所有新文件、改造 database.js（含双导出）、新建 sql.js，然后一次性改造全部 11 个路由文件作为单个 git commit。此方案避免了混合模式下的中间状态，但要求改造量较大时一次性完成。推荐采用双导出过渡方案（步骤 1-6），允许分批改造和逐文件验证。

4. **git 操作建议**：步骤 1-2（adapter 文件 + database.js 改造）作为一个 commit；步骤 3（sql.js）单独 commit；步骤 4（每个路由文件改造）各自一个 commit；步骤 5-6（移除旧导出 + UTC 转换 + 全量测试）作为一个 commit。

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

**INSERT 操作的返回值和 ID 获取**（v7 新增，明确调用约定）：

`adapter.execute()` 用于 INSERT/UPDATE/DELETE 操作，返回 `{ lastInsertId, changes }`。获取新插入行的 ID 直接从返回值中取 `result.lastInsertId`，**无需调用任何 sql.js 方言辅助函数**——adapter 层已在 `execute()` 内部自动处理 ID 获取（SqliteAdapter 利用 better-sqlite3 的 `lastInsertRowid`；KingbaseAdapter 通过自动追加 `RETURNING id` 子句获取）。改造代码模式：

```javascript
// INSERT 操作（旧代码）
const info = db.prepare('INSERT INTO ... VALUES (...)').run(...);
const newId = info.lastInsertRowid;

// INSERT 操作（改造后）
const result = await adapter.execute('INSERT INTO ... VALUES (...)', [...]);
const newId = result.lastInsertId;
```

`schema.adapter.js` 方言辅助函数表中不包含 `sql.insertId()`——ID 获取是 adapter 层的职责，不属于方言差异范畴。

**路由 handler 函数 async 改造清单（v2 明确列出）**：

以下 Express 路由 handler（`(req, res, next) => {}` 或 `(req, res) => {}`）需要改为 `async`：

| 文件 | 需标记 async 的 handler | 原因 |
|------|----------------------|------|
| `auth.js` | `/register`（POST）、`/login`（POST） | 包含 `adapter.execute()` 调用。**handler 需从 `(req, res) => {...}` 改为 `async (req, res, next) => { try { ... } catch (e) { next(e); } }`** |
| `user.js` | `/profile` 下的 GET/PUT、`/info` 下的 GET | 包含 `adapter.query()/queryOne()/execute()` 调用 |
| `risk.js` | `/predict`（POST，已经是 async）、`/history`（GET） | `/history` 需新增 async |
| `plan.js` | `/generate`（POST，已经是 async）、`/current`（GET）、`/adjust`（PUT，已经是 async） | `/current` 需新增 async；`/generate` 和 `/adjust` 的 `checkIdempotent()` 调用位置需调整（见 8.5 节 v4 补充） |
| `punch.js` | 全部 3 个 handler（1 POST + 2 GET） | 均包含数据库调用 |
| `articles.js` | 全部约 6 个 handler | 均包含数据库调用 |
| `admin.js` | `/logs`（GET）、`/execute`（POST，已是 sync 包装）、`/chat`（POST，已是 async） | `/logs` 需新增 async；`/execute` 内部逻辑需改为 async/await |
| `assistant.js` | 涉及 DB 的 handler | `adapter.query()/queryOne()` 调用 |
| `doctors.js` | 涉及 DB 的 handler | `adapter.query()/queryOne()` 调用 |
| `diabetes.js` | 涉及 DB 的 handler | `adapter.query()/queryOne()` 调用 |
| `chat.js` | 涉及 DB 的 handler | `adapter.query()/queryOne()` 调用 |
| `index.js` | `/health`（GET） | 需从静态 JSON 响应改为 `async (req, res) => { const ok = await adapter.healthCheck(); ... }`（详见第 13.2 节） |

**不变的文件**：`server/routes/upload.js` 不涉及数据库访问，无需修改。`server/routes/index.js` 的 `/health` 端点需改造以调用 `adapter.healthCheck()`（详见第 13.2 节），见下方 async 改造清单。

**Express async error handling（v4 明确）**：经核实，项目 `package.json` 中**未引入 `express-async-errors` 包**，且当前代码中 async handler（如 `plan.js` 的 `/generate`）已采用 `try/catch + next(e)` 模式。因此所有新改造为 async 的 handler **必须**遵循相同模式：`async (req, res, next) => { try { ... } catch (e) { next(e); } }`。不得依赖 Express 4.x 自动捕获 async 异常（Express 4.x 不具备此能力）。

**受影响的文件清单**（按改动量）：

| 文件 | 预估 DB 调用数 | 特殊改动点 |
|------|-------------|----------|
| `server/routes/admin.js` | 20+ | 含 `db.transaction()` 事务（改为 `await adapter.transaction()`）、`info.lastInsertRowid` 取值（改为 `result.lastInsertId`）、`PRAGMA table_info` → `adapter.tableInfo()`、`sql` 模式需特殊处理（见第 9 节） |
| `server/routes/plan.js` | 12+ | 含 2 个 `db.transaction()` 事务（改为 `await adapter.transaction()`）、`datetime()` → `sql.now()`、`SELECT MAX(plan_id)+1` 需在 KingbaseES 下加 `FOR UPDATE`（见第 8.5 节） |
| `server/routes/punch.js` | 8+ | 含 `SELECT last_insert_rowid()` 调用（改为 `adapter.execute()` 内部处理）、`datetime()` 带日期运算；`date(punch_time)` 列提取函数在两个数据库中均兼容，**无需改造**（v7 新增） |
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
| 日期列提取（GROUP BY） | `date(punch_time)` | `date(punch_time)`（**兼容**，无需方言函数包装） | punch.js:121,126 |
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

**v7 补充 —— `date(column)` 列提取函数兼容性确认**：`punch.js` 第 121、126 行使用 `date(punch_time)` 从 timestamp 列中提取日期部分用于 GROUP BY。`date(column)` 作为列提取函数在两个数据库中**均兼容**——SQLite 返回 `YYYY-MM-DD` 字符串，KingbaseES/PostgreSQL 的 `date(timestamp_expr)` 返回相同格式的日期值。**此用法无需方言函数包装，punch.js 第 121、126 行的 `date(punch_time)` 保持不变，不在改造范围内。** 已在差异清单中增加 `date(column)` 列提取行以明确兼容性。

### 4.2 方言统一策略

**决策**：编写 `server/db/sql.js` 方言辅助模块，路由层统一调用辅助函数，由适配层根据实际后端生成对应 SQL。

关键辅助函数：

| 函数 | 用途 | SQLite 输出 | KingbaseES 输出 |
|------|------|------------|----------------|
| `sql.now()` | 当前时间戳 | `CURRENT_TIMESTAMP` | `CURRENT_TIMESTAMP` |
| `sql.date()` | 当前日期（字符串） | `date('now','localtime')` | `CURRENT_DATE::text` |
| `sql.jsonField(col, path)` | JSON 字段提取（单层路径） | `json_extract(${col}, '$.${path}')` | `${col}::jsonb->>'${path}'` |
| `sql.jsonFieldAs(col, path, type)` | 带类型转换的 JSON 提取 | `CAST(json_extract(...) AS ${type})` | `(${col}::jsonb->>'${path}')::${type}` |
| `sql.formatDateParam(jsDate)` | JS Date 对象转为与 CURRENT_TIMESTAMP 兼容的日期参数字符串 | `YYYY-MM-DD HH:MM:SS` 格式字符串（如 `'2025-06-28 14:30:00'`） | `YYYY-MM-DD HH:MM:SS` 格式字符串（如 `'2025-06-28 14:30:00'`） |

**`sql.relativeDate(days)` 设计**（已废弃，见下方推荐替代方案）：

**推荐替代方案（更简单）**：对于日期范围查询，推荐在路由层用 JavaScript 计算日期后作为参数传入 SQL。使用 `sql.formatDateParam(jsDate)` 工具方法将 JS Date 对象格式化为与 `CURRENT_TIMESTAMP` 输出一致的 `YYYY-MM-DD HH:MM:SS` 格式（无 `T` 分隔符，无时区后缀），确保字符串比较行为正确。例如 `punch.js:125` 可改为：
```javascript
const sevenDaysAgo = sql.formatDateParam(new Date(Date.now() - 7 * 86400000));
// 七日前零点边界：sql.formatDateParam(new Date(new Date().setHours(0,0,0,0) - 7*86400000))
// 然后作为参数传入：WHERE user_id = ? AND punch_time >= ?
```
**`.toISOString()` 不兼容说明**：`.toISOString()` 输出 ISO 8601 格式（如 `'2025-06-21T06:30:00.000Z'`），含 `T` 分隔符和 `Z` 时区后缀，与 SQLite `CURRENT_TIMESTAMP` 输出格式（`'2025-06-21 14:30:00'`，空格分隔，无时区后缀）在字符串比较时产生错误结果——在纯字符串比较下 `'2025-06-21T06:30:00.000Z' > '2025-06-21 14:30:00'` 因 `T`（ASCII 84）> ` `（ASCII 32）而始终为 true，导致当天边界查询异常。**必须使用 `sql.formatDateParam()` 或等价格式化逻辑**。

`sql.formatDateParam()` 的实现逻辑（约 5 行）：使用 **UTC 方法** `Date.getUTCFullYear()`、`getUTCMonth()`、`getUTCDate()`、`getUTCHours()`、`getUTCMinutes()`、`getUTCSeconds()` 拼接 `YYYY-MM-DD HH:MM:SS` 字符串，各分量不足两位时左侧补零。**必须使用 UTC 方法而非本地时间方法**——方案决策 `CURRENT_TIMESTAMP` 统一输出 UTC 时间，若使用 `getHours()` 等本地时间方法，在 UTC+8 时区下格式化输出的字符串比数据库存储的 `CURRENT_TIMESTAMP` 值大 8 小时，导致日期范围查询（如 punch.js 近 7 天打卡）的边界比较结果错误。此方式无需方言函数，两个数据库行为完全一致，统一输出 UTC 格式字符串，消除本地时区依赖。此方案作为首选推荐，`sql.relativeDate()` 不做为必须实现的接口。

**关键简化决策**：`sql.now()` 统一输出 `CURRENT_TIMESTAMP`，SQLite 3.38+ 和 KingbaseES 均支持该函数。这意味着路由层只需把 `datetime('now','localtime')` 替换为 `sql.now()` 即可。对于 DDL 中的 `DEFAULT (datetime('now','localtime'))`，改为 `DEFAULT CURRENT_TIMESTAMP`。

**方言感知机制（v6 新增）**：`sql.js` 需要根据当前数据库类型（SQLite 或 KingbaseES）输出不同的 SQL 片段，但方案此前未定义 `sql.js` 如何获取当前数据库类型。推荐实现方式：

```javascript
// sql.js 模块内部
let currentDialect = null;  // 'sqlite' | 'kingbase'，模块级变量

function setDialect(dialect) {
  if (dialect !== 'sqlite' && dialect !== 'kingbase') {
    throw new Error(`sql.setDialect: 不支持的数据库类型 "${dialect}"，仅支持 "sqlite" 或 "kingbase"`);
  }
  currentDialect = dialect;
}

function getDialect() {
  if (!currentDialect) {
    throw new Error('sql 方言未初始化，请在 initDatabase() 实例化 adapter 后调用 sql.setDialect(dbType)');
  }
  return currentDialect;
}
```

**初始化时机**：`database.js` 的 `initDatabase()` 在实例化 adapter 后立即调用 `sql.setDialect(dbType)`：

```javascript
// database.js initDatabase() 内部
const dbType = process.env.DB_TYPE || 'sqlite';
sql.setDialect(dbType);  // 在实例化 adapter 后、任何路由使用前设置
if (dbType === 'kingbase') { /* ... */ } else { /* ... */ }
```

各辅助函数（`sql.now()`、`sql.jsonField()` 等）在函数体开头调用 `getDialect()` 获取当前方言，根据方言返回不同 SQL 片段。此机制：
- 避免每次函数调用时读取环境变量（性能）
- 方言变量为模块级私有，不会被外部意外修改
- 方言未初始化时的调用会立即抛出明确错误（fail-fast），而非静默返回错误 SQL

**`sql.now()` 与 UTC 存储决策**：`CURRENT_TIMESTAMP` 在 SQLite 返回 UTC，而 `datetime('now','localtime')` 返回本地时间。这是一个**有意的行为变更**：

- **Phase 0**（SQLite 阶段）：即切换到 `CURRENT_TIMESTAMP`（UTC 存储）。所有新写入的 timestamp 字段为 UTC。读取时前端负责将 UTC 转换为用户本地时区显示。
- **现有数据**：Phase 0 改造前已存储的本地时间数据不受影响（SQLite 存储的是文本 `"2025-06-28 14:30:00"`，不随函数变更而变化）。只有改造后新写入的数据为 UTC 格式。
- **数据迁移时**（Phase 1→Phase 2）：迁移脚本对 SQLite 中所有 datetime 字段进行时区转换（本地时间 → UTC），确保迁移到 KingbaseES 后的数据统一为 UTC。
- **Phase 0 验收标准调整**：从"行为不变"调整为"所有功能正常工作，新写入的 timestamp 为 UTC，前端展示的时间正确"。

**Phase 0 混合时间戳数据状态处理（v3 新增）**：

Phase 0 切换到 `CURRENT_TIMESTAMP`（UTC 存储）后，在 SQLite 中会出现旧数据（本地时间 UTC+8）与新数据（UTC）混合共存的问题，导致：

1. **时间戳语义不一致**：同一数据库内 `users.created_at` 字段部分为本地时间（改造前数据），部分为 UTC（改造后数据），前端无法区分
2. **时间范围查询出错**：`punch.js` 第 125 行等使用 `WHERE punch_time >= ?` 进行近 7 天查询时，新数据（UTC）会比旧数据晚 8 小时，导致查询边界不准
3. **Dify AI 工作流影响**：Dify AI 若通过 `admin /execute` 的 `sql` 模式或 `query_table` 读取数据库，可能拿到混合时间戳而产生错误判断

**推荐解决方案**：在 Phase 0 路由改造完成后、验收测试开始前，运行一次性 SQL 脚本 `scripts/phase0_utc_convert.sql` 将现有 SQLite 数据中所有 datetime 字段原地从本地时间转换为 UTC（减去 8 小时）：

```sql
-- scripts/phase0_utc_convert.sql（一次性脚本，Phase 0 改造完成后执行一次）
-- 对每张表的每个 datetime 字段执行
UPDATE users SET created_at = datetime(created_at, '-8 hours') WHERE created_at IS NOT NULL;
UPDATE users SET updated_at = datetime(updated_at, '-8 hours') WHERE updated_at IS NOT NULL;
UPDATE doctor_information SET created_at = datetime(created_at, '-8 hours') WHERE created_at IS NOT NULL;
UPDATE articles SET created_at = datetime(created_at, '-8 hours') WHERE created_at IS NOT NULL;
UPDATE article_collections SET created_at = datetime(created_at, '-8 hours') WHERE created_at IS NOT NULL;
UPDATE user_risk_info SET created_at = datetime(created_at, '-8 hours') WHERE created_at IS NOT NULL;
UPDATE life_plans SET created_at = datetime(created_at, '-8 hours') WHERE created_at IS NOT NULL;
UPDATE life_plans SET updated_at = datetime(updated_at, '-8 hours') WHERE updated_at IS NOT NULL;
UPDATE life_advice SET created_at = datetime(created_at, '-8 hours') WHERE created_at IS NOT NULL;
UPDATE punch_in SET punch_time = datetime(punch_time, '-8 hours') WHERE punch_time IS NOT NULL;
UPDATE admin_logs SET operation_time = datetime(operation_time, '-8 hours') WHERE operation_time IS NOT NULL;
```

**执行前提**：
- 在 Phase 0 改造 SQL 完成（所有 `datetime('now','localtime')` 替换为 `CURRENT_TIMESTAMP`）之后执行
- 执行前备份 `database.sqlite` 文件
- SQLite 的 `datetime(col, '-8 hours')` 对已经是 UTC 的数据会错误再减 8 小时，因此此脚本只能执行一次——必须在确认 Phase 0 改造生效且新数据尚未写入前执行

**此脚本的效果**：Phase 0 启动后数据库立即进入全 UTC 状态，消除混合时间戳语义不一致问题。所有时间范围查询、前端展示均基于统一 UTC 基准，无需区分"旧数据"和"新数据"。

**Phase 0 验收标准补充**：将此脚本作为 Phase 0 的前置步骤列入验收标准——Phase 0 验收测试必须在 UTC 转换脚本执行后进行。

**Phase 0 与 Phase 2 脚本互斥关系（v6 新增）**：`scripts/phase0_utc_convert.sql`（Phase 0）和 `scripts/migrate-to-kingbase.js`（Phase 2）均对 datetime 字段执行"-8 小时"时区转换（本地时间 → UTC）。若按 Phase 0 → Phase 2 顺序执行，所有时间数据将总共偏移 16 小时，产生严重数据错误。二者必须互斥：

**推荐决策：Phase 2 统一处理时区转换，Phase 0 不执行独立 UTC 脚本**

| 方案 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| **方案 A（推荐）**：Phase 2 统一转换 | Phase 0 不执行 `phase0_utc_convert.sql`；Phase 0 期间 SQLite 中旧数据保持本地时间，新数据为 UTC（混合状态）；Phase 2 迁移脚本统一对 SQLite 旧数据做时区转换后写入 KingbaseES | 无双重转换风险；Phase 2 迁移是唯一时区转换点，逻辑清晰 | Phase 0 期间 SQLite 内混合时间戳（旧数据本地时间 + 新数据 UTC），前端展示和范围查询可能不准（影响取决于 Phase 0 持续时间和数据量） |
| 方案 B：Phase 0 独立转换 + Phase 2 跳过 | Phase 0 执行 `phase0_utc_convert.sql`，SQLite 数据统一为 UTC；Phase 2 迁移脚本**检测到 SQLite 数据已是 UTC 后跳过后继续时区转换** | Phase 0 启动后 SQLite 立即进入全 UTC 状态 | 需在 Phase 2 迁移脚本中实现时区检测逻辑（见下方），增加实现复杂度和出错风险 |
| 方案 C：Phase 0 独立转换 + Phase 2 检测跳过 | 同方案 B，但 Phase 2 迁移脚本通过检测 SQLite 数据是否为 UTC（而非单纯跳过）来决定是否转换 | 安全 | 时区检测逻辑可能误判（边缘情况：若 SQLite 数据全为 00:00:00 时间戳，无法区分 UTC 和本地时间） |

**方案 A 的推荐理由**：
1. Phase 0 是开发/测试阶段，混合时间戳的影响可控（测试数据量小、phase 持续时间短）
2. Phase 2 迁移是唯一时区转换点，消除双重转换风险
3. 避免在 Phase 2 迁移脚本中实现复杂的时区检测逻辑

若团队偏好方案 B（Phase 0 全 UTC），必须在 Phase 2 迁移脚本中实现时区转换检测逻辑：对每张表的每条 datetime 记录，检查其值是否在合理 UTC 范围内（如小时部分 ≤ 23 且日期与记录创建时间相符），或检查是否存在"看起来像 UTC+8"的时间戳（小时部分 ≥ 8 的大量记录）。检测到全 UTC 数据后跳过时区转换。此检测逻辑有边缘误判风险，需在 dry-run 中充分验证。

**Phase 0 混合时间戳状态开发期实际影响评估（v7 新增）**：

方案 A（推荐）在 Phase 0 期间不执行独立 UTC 脚本，SQLite 中旧数据（本地时间 UTC+8）与新数据（UTC）混合共存。以下是对开发/自测各环节的具体影响量化评估：

| 影响维度 | 影响描述 | 严重程度 | Phase 0 期间可接受性 |
|---------|---------|---------|---------------------|
| **punch.js 7 天打卡查询**（`GET /api/punch?range=7d`） | 边界日期的旧数据（本地时间）比新数据（UTC）晚 8 小时。例如 6 月 28 日北京时间 00:00-08:00 的旧打卡记录在 UTC 下被归入 6 月 27 日，查询近 7 天（6 月 21 日 UTC 零点起）时会遗漏这些旧记录。**仅影响改造前已存在的打卡数据，新打卡数据不受影响。** 若 Phase 0 测试数据量小且改造后立即进行 end-to-end 验证，影响可控 | 中 | **有条件接受**：Phase 0 验收时明确声明时间范围查询的准确性在 Phase 0 期间不做严格要求；若需精确验证，手工确认旧打卡记录的日期归属 |
| **前端时间展示** | 前端直接展示数据库中的时间字符串。旧数据（本地时间如 `14:30:00`）和新数据（UTC 如 `06:30:00`）在无时区标识的情况下无法区分，同一页面可能同时显示两种语义的时间——用户可能看到"打卡时间 14:30"（实际是本地时间）和"打卡时间 06:30"（实际是 UTC），但前端均按相同格式渲染，产生歧义 | 中 | **有条件接受**：Phase 0 开发/测试阶段，前端时间展示不一致不影响核心功能验证（注册、登录、风险评估、方案生成、文章浏览等功能不依赖时间语义精确性）。Phase 0 验收标准中明确声明此限制 |
| **Dify AI 工作流** | Dify AI 通过 admin `/execute` 的 `tool_name` 模式（如 `query_punch_records`、`query_risk_history`）读取数据库。由于 `tool_name` 模式下 SQL 由应用层硬编码（含 `ORDER BY created_at DESC`），时间排序准确性受混合时间戳影响——UTC 时间的新记录可能排在本地时间的旧记录之前（因为旧记录的小时数值更大）。AI 对风险评估历史的时间序列分析可能产生轻微偏差 | 低 | **可接受**：Dify AI 工作流主要关注数据内容（risk_score、risk_level 等），时间排序偏差对 AI 判断的影响为边缘场景。Phase 0 期间 AI 对话功能以功能可用为验收目标，非精度验证 |
| **开发自测体验** | 开发者在 Phase 0 期间查看数据库（SQLite 命令行/DBeaver）时，同一张表中的时间戳语义不一致——无法直观判断某条记录是本地时间还是 UTC。调试时间相关 bug 时需额外判断 | 低 | **可接受**：Phase 0 持续时间短（预计数天），且开发者对此限制已知晓。可通过在数据库中增加临时标记列（如 `_utc_converted INTEGER DEFAULT 0`）辅助区分，但**不推荐**（增加 schema 变更并在 Phase 2 前需回滚） |

**开发期临时缓解措施**：

1. **`sql.setDevMode(true)` 开关（可选）**：在 `sql.js` 中增加开发模式标志。当 `DB_TYPE=sqlite` 且 `process.env.NODE_ENV !== 'production'` 时，`sql.now()` 仍输出 `datetime('now','localtime')`（保持本地时间行为），避免混合时间戳。此开关在 Phase 1 切换 KingbaseES 前关闭。**优点**：Phase 0 期间时间行为与改造前完全一致，消除所有混合时间戳影响。**缺点**：Phase 0 与 Phase 1 之间需额外一步"关闭开关、执行相位对齐"，增加操作步骤。**推荐作为可选措施**，由团队根据 Phase 0 持续时间决定是否采用。

2. **Phase 0 验收标准补充（v7 新增）**：在 Phase 0 验收标准中明确声明——"时间范围查询（如 punch.js 近 7 天打卡）的精确性在 Phase 0 期间不做严格要求，Phase 1 双库对比测试中统一验证"。此声明避免 Phase 0 验收时因时间查询偏差而误判为功能回归。

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
# CI 中的 KingbaseES 服务容器（待验证假设，见下方说明）
services:
  kingbase:
    image: kingbase/kingbasees:v8r6  # 待验证：此镜像可能不公开发布在 Docker Hub
    env:
      DB_USER: system
      DB_PASSWORD: test123
      DB_NAME: diabetes_test
```

**KingbaseES Docker 镜像可用性说明（v6 新增）**：`kingbase/kingbasees:v8r6` Docker 镜像名称引用自社区资料，但金仓数据库是商业产品，该镜像可能不公开发布在 Docker Hub 上、需要商业授权或通过金仓官方渠道获取。**此镜像名称为"待验证假设"**——实现前必须确认：

1. **验证渠道**：联系金仓技术支持或查阅金仓官方文档确认镜像获取方式
2. **替代方案 A（直接安装）**：在 CI 服务器或测试机器上直接安装 KingbaseES RPM/DEB 包，应用通过网络连接该实例
3. **替代方案 B（已有测试实例）**：使用团队内部已部署的 KingbaseES 测试实例（共享开发/测试库），通过内网 `DATABASE_URL` 连接
4. **最低保障**：若所有 KingbaseES 部署方式均不可行，CI 中至少保证 SQLite 后端全部测试通过，KingbaseES 功能验证在本地或预发环境手动执行

**最低要求**：即使在 CI 中无法部署 KingbaseES，至少保证 SQLite 后端的全部测试通过。KingbaseES 后端的功能验证在本地或预发环境手动执行，或在 Phase 1 中通过 Docker Compose 一键启动本地 KingbaseES + 应用进行验证。

### 5.1.1 Phase 0/Phase 1 手工回归测试策略（v6 新增）

当前项目 `package.json` 中**无 `"test"` 脚本**（无自动化测试套件），Phase 0/Phase 1 的验收依赖手工测试。为避免测试遗漏，定义以下最低测试策略：

**Phase 0 手工回归测试清单**（SQLite 后端，改造完成后执行）：

| 测试编号 | API 端点 | HTTP 方法 | 测试场景 | 验证点 |
|---------|---------|----------|---------|--------|
| T01 | `/api/auth/register` | POST | 新用户注册 | 返回 token + user 对象；`users` 表新增一行；密码 bcrypt 哈希存储 |
| T02 | `/api/auth/login` | POST | 已注册用户登录 | 返回 token；错误的密码返回 401 |
| T03 | `/api/user/profile` | GET | 获取用户信息 | 返回正确 user 对象，字段完整 |
| T04 | `/api/user/profile` | PUT | 更新用户信息 | 返回更新后的 user；数据库字段确实更新 |
| T05 | `/api/risk/predict` | POST | 提交风险评估表单 | 返回 risk_score + risk_level；`user_risk_info` 表新增行；`result` JSON 字段完整 |
| T06 | `/api/risk/history` | GET | 查询风险评估历史 | 返回数组，按时间倒序 |
| T07 | `/api/plan/generate` | POST | 生成生活方案 | 返回 plan 对象；`life_plans` 表和 `life_advice` 表新增行；plan_id 正确 |
| T08 | `/api/plan/current` | GET | 获取当前方案 | 返回最新 active 方案及关联项 |
| T09 | `/api/plan/adjust` | PUT | 调整方案 | `is_active` 状态正确切换；旧方案失活、新方案激活 |
| T10 | `/api/punch` | POST | 打卡 | `punch_in` 表新增行；`completion_status` 正确 |
| T11 | `/api/punch` | GET | 查询打卡记录 | 返回数组，含时间范围筛选 |
| T12 | `/api/articles` | GET | 获取文章列表 | 返回数组，分页正确 |
| T13 | `/api/articles/:id` | GET | 获取单篇文章 | 返回文章对象，字段完整 |
| T14 | `/api/admin/logs` | GET | 查询操作日志（admin 角色） | 返回日志数组 |
| T15 | `/api/admin/execute` | POST | tool_name 模式执行命名操作 | 各 tool_name 返回正确结果 |
| T16 | `/api/health` | GET | 健康检查 | 返回 `{ status: "ok", database: "connected" }` |
| T17 | `/api/assistant` | GET/POST | 智能助手相关 | 返回正确数据 |
| T18 | `/api/doctors` | GET | 医生列表 | 返回医生数组 |

**核心流程端到端测试**（至少 3 个）：

| 流程编号 | 流程描述 | 涉及端点 |
|---------|---------|---------|
| E2E-1 | **用户注册 → 风险评估 → 方案生成 → 打卡 → 查看历史** | `/register` → `/risk/predict` → `/plan/generate` → `/punch`（POST）→ `/punch`（GET）→ `/risk/history` |
| E2E-2 | **管理员登录 → 查询用户 → 查看日志 → 执行 tool_name 操作** | `/auth/login`（admin）→ `/api/admin/logs` → `/api/admin/execute`（query_user_profile）|
| E2E-3 | **文章浏览流程** | `/articles`（列表）→ `/articles/:id`（详情）|

**Phase 1 双库对比测试**：在 Phase 0 全量回归通过的基础上，切换 `DB_TYPE=kingbase` 后重新执行上述全部 18 个 API 端点测试和 3 个 E2E 流程，对比两个后端的响应一致性（时间戳字段除外，KingbaseES 统一 UTC）。

**CI 配置调整（v6 新增）**：将 CI 配置中的 `npm test` 替换为实际可执行的验证脚本：

```bash
# scripts/ci-smoke-test.sh（CI 冒烟验证脚本）
# 启动应用 → 等待就绪 → curl 关键端点 → 检查 HTTP 状态码
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health | grep -q 200
curl -s http://localhost:3000/api/health | grep -q '"database":"connected"'
```

此脚本验证应用启动成功、health check 返回正确，作为 CI 的最低自动化门禁。完整功能测试仍依赖上述手工清单。

### 5.2 版本一致性（v2 新增）

- **开发环境**：SQLite 版本由 `better-sqlite3` npm 包锁定，所有开发者一致
- **生产环境**：KingbaseES 版本通过生产环境基础设施管理，需在部署文档中声明目标版本
- **跨平台**：SQLite（better-sqlite3）在 Windows/macOS/Linux 上行为一致；KingbaseES 为 Linux 服务端，应用通过 TCP 连接，操作系统差异不影响

---

## 6. 渐进式迁移路径

### Phase 0：适配层构建 + SQLite 验证（不影响现有功能）

- **执行顺序**：严格遵循第 3.5.2 节"Phase 0 过渡策略"的 6 步顺序，确保每个步骤后应用均可正常启动和逐文件自测
- 新建 `server/db/adapter/` 目录，实现 `DatabaseAdapter.js`（接口契约）、`SqliteAdapter.js`、`KingbaseAdapter.js`
- 新建 `server/db/sql.js` 方言辅助模块（含 `setDialect()` 初始化）
- 改造 `server/db/database.js`：双导出过渡（同时导出旧接口 `db` 和新接口 `getAdapter()`），`initDatabase()` 改为 async，调用 `sql.setDialect(dbType)`
- 逐文件改造路由层（共 11 个文件），每个文件改造后自测验证对应 API 端点
- 全部路由改造完成后，移除 `database.js` 中旧 `db` 导出，运行全量回归测试
- **关键行为变更**：时间戳存储从本地时间（`datetime('now','localtime')`）切换到 UTC（`CURRENT_TIMESTAMP`）。新写入数据的 timestamp 字段值与原行为相差 8 小时。前端需负责时区转换显示。
- **Phase 0 UTC 转换策略**（v6 修订）：推荐 Phase 2 统一处理时区转换，Phase 0 不执行独立 UTC 脚本。Phase 0 期间 SQLite 中旧数据保持本地时间、新数据为 UTC（混合状态）。若团队偏好 Phase 0 全 UTC，详见 4.2 节方案 B/C。
- **验收标准**：
  1. 所有现有 API 端点返回的 HTTP 状态码和响应结构与改造前一致
  2. 用户注册/登录流程正常
  3. 风险预测 → 方案生成 → 打卡记录完整流程正常
  4. 管理员日志记录和查询正常
  5. 科普文章 CRUD 正常
  6. 前端页面中显示的时间正确（数据库存储为 UTC，前端展示应转换为本地时间）
  7. 无功能回归
  8. （v6 新增）手工回归测试清单 18 个端点全部通过（见 5.1.1 节）
  9. （v6 新增）3 个核心 E2E 流程全部通过（见 5.1.1 节）

### Phase 1：KingbaseES 适配层 + 双库并行验证

- 实现 `KingbaseAdapter`（含 `init()` 的多语句 SQL 执行、密码哈希占位符替换机制、`?` → `$1` 参数占位符转换、SSL/TLS 配置、`pool.on('error')` 事件处理）
- 对齐 `init_kingbase.sql` 与 `init.sql` 的 schema 差异（见第 10 节），并将硬编码的 bcrypt 哈希替换为 `__BCRYPT_HASH_PLACEHOLDER__` 占位符。**`init_kingbase.sql` 必须使用 `CREATE TABLE IF NOT EXISTS` 而非 `DROP TABLE IF EXISTS`**（见第 10 节）
- 本地或测试环境部署 KingbaseES 实例（推荐 Docker：`docker run -d -p 54321:54321 kingbase/kingbasees:v8r6`，**镜像名称待验证**，见 5.1 节 KingbaseES Docker 镜像可用性说明）
- 切换 `DB_TYPE=kingbase`，跑完整功能回归测试
- **admin `/execute` 动态 SQL 方言处理**（见第 9 节）：Phase 1 中 `sql` 模式在 KingbaseES 下受限，仅 `tool_name` 模式全功能可用
- **验收标准**：
  1. 所有 11 个路由文件的功能在 KingbaseES 下行为与 SQLite 一致（时间戳除外——KingbaseES 统一 UTC，SQLite 本地时间为历史数据）
  2. `tool_name` 模式下的 11 个命名操作全部正常（`query_user_profile`、`query_risk_history`、`write_health_advice` 等）
  3. 事务逻辑（plan.js 的方案生成/调整）正常，无并发 plan_id 冲突
  4. 连接池正常工作，连接失败后自动恢复
  5. **（v3 新增）性能基准对比**：记录关键端点的查询耗时（`POST /api/plan/generate`、`PUT /api/plan/adjust` 的 P50/P95/P99 响应时间，以及 `GET /api/risk/history`、`GET /api/admin/logs`），对比 SQLite vs KingbaseES 的性能差异。`plan.js` 的批量 INSERT 若使用多行 VALUES（见 8.2 节），KingbaseES 下的响应时间应在可接受范围内（建议 < 2 倍 SQLite 基准值）
  6. **（v4 新增）Dify admin 对话端到端测试**：通过 Dify admin 对话发送多条查询指令，验证 AI 在 KingbaseES 环境下不会尝试 `sql` 模式（所有查询均通过 `tool_name` 参数完成）。若 AI 越权尝试 `sql` 模式，服务端应返回 400 "暂不支持"而非 500 内部错误

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

**批量 INSERT 网络性能影响（v3 新增）**：

`plan.js` 的 `POST /generate` 和 `PUT /adjust` 在事务内使用 `for` 循环逐条 INSERT 方案项。SQLite 中是进程内函数调用（微秒级延迟），但在 KingbaseES 中每次都是网络往返（通常 0.1-1ms），事务耗时可能从毫秒级升至秒级：

| 维度 | SQLite（当前） | KingbaseES（改造后） | 影响 |
|------|-------------|-------------------|------|
| 单条 INSERT 延迟 | <0.01ms（进程内） | 0.1-1ms（网络往返） | 假设 20 个方案项，事务总延迟从 <1ms 升至 2-20ms |
| 事务锁持有时间 | 极短 | 增长 10-100 倍 | READ COMMITTED + FOR UPDATE 下，并发锁竞争略微增加 |
| 幂等锁保护 | 30 秒内存锁 + 数据库事务锁 | 同上，但事务持有时间更长 | 30 秒内存锁仍足矣，但边缘情况（同一用户高频重试）下事务时间变长 |

**缓解措施**：

1. **多行 INSERT 批量写入（推荐）**：将 `for` 循环逐条 INSERT 改为单条多行 VALUES 语句：
   ```sql
   INSERT INTO life_plans (user_id, plan_id, plan_type, order_num, time_desc, title, content, is_active)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8), ($1, $2, $9, $10, ...), ...
   ```
   此方式将 N 次网络往返合并为 1 次。注意 `pg` 的参数数量限制（`$N` 编号），但 `pg` 本身无硬性参数数量上限（仅受协议层 65535 参数限制，20个方案项 × 8 字段 = 160 参数，远低于上限）。

2. **性能基准对比**：在 Phase 1 双库对比测试中，将 `POST /generate` 和 `PUT /adjust` 的响应时间（P50/P95/P99）列为显式对比指标，识别网络延迟引入的性能退化。若多行 INSERT 后性能仍显著劣于 SQLite，可评估连接池预热或其他优化。

### 8.3 受影响的文件

仅 2 个文件使用显式事务：
- `server/routes/plan.js`：2 处事务（`/generate` 和 `/adjust`），每处包含 UPDATE + 批量 INSERT
- `server/routes/admin.js`：1 处事务（`/execute`），包含 SELECT/INSERT/UPDATE + 审计日志写入

改动量小，改写为 async/await 模式即可。

**admin.js `/execute` 事务内 `insertAdminLog` 适配（v4 新增）**：`admin.js` 的 `/execute` 端点在 `db.transaction()` 回调内调用 `insertAdminLog()` 函数（第 98 行），该函数是模块级闭包，内部使用模块级 `db` 变量执行 INSERT。迁移至 KingbaseAdapter 后，`adapter.transaction()` 会创建专用 client 并传递 `txAdapter` 给回调。若 `insertAdminLog` 仍使用全局 adapter（通过 `pool.query()` 走池中另一连接），其 INSERT 将在事务外独立提交，破坏事务原子性——即用户SQL执行成功但审计日志写入失败或反之。

**改造要求**：`insertAdminLog` 函数签名需从 `function insertAdminLog(operatorId, operationType, operationContent, operationResult)` 改为 `async function insertAdminLog(adapter, operatorId, operationType, operationContent, operationResult)`。调用方根据是否在事务内传入全局 adapter 或 txAdapter：事务内（第 98 行）传入 `txAdapter`，事务外（第 70、76 行的权限拒绝日志）传入全局 adapter。

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

**`FOR UPDATE` 首次方案生成场景的边缘问题（v9 新增）**：上述 `FOR UPDATE` 方案依赖"事务中先执行的 `UPDATE life_plans SET is_active = 0 WHERE user_id = ?` 已锁定该用户的行"这一前提，但在用户**首次生成方案**时——`life_plans` 表中尚无该用户的任何行——此前提不成立：

```
事务 A（首次生成）:
  UPDATE life_plans SET is_active = 0 WHERE user_id = ?  → 影响 0 行，不获取行级锁
  SELECT COALESCE(MAX(plan_id), 0) + 1 ... FOR UPDATE   → WHERE 条件匹配 0 行
  → FOR UPDATE 在 PostgreSQL/KingbaseES READ COMMITTED 下空结果集不获取任何行级锁
  → A 获取 plan_id = 1

事务 B（并发首次生成，同一用户）:
  UPDATE life_plans SET is_active = 0 WHERE user_id = ?  → 同样影响 0 行
  SELECT COALESCE(MAX(plan_id), 0) + 1 ... FOR UPDATE   → 同样不获取任何行级锁
  → B 同样获取 plan_id = 1
  → 两个事务均可成功 INSERT plan_id=1（life_plans 表无 UNIQUE(user_id, plan_id) 约束）
```

此场景在用户首次使用方案功能时极易触发（两个并发请求同时生成首个方案）。

**推荐解决方案：数据库层 UNIQUE 约束**

在 `life_plans` 表上增加 `UNIQUE(user_id, plan_id)` 约束：

```sql
-- SQLite (init.sql) 和 KingbaseES (init_kingbase.sql) 同步增加
CREATE UNIQUE INDEX IF NOT EXISTS idx_life_plans_user_plan ON life_plans(user_id, plan_id);
```

此约束是数据库层的最后防线——即使 `FOR UPDATE` 行级锁在首次生成场景失效，第二个事务的 INSERT 将因违反 UNIQUE 约束而失败（`code='23505'` unique_violation），应用层捕获此错误后返回 409 Conflict（与内存幂等锁的 409 响应保持一致），提示用户"方案正在生成中，请稍后重试"。

**备选方案**：使用 PostgreSQL advisory lock（`pg_advisory_lock(user_id)`）在应用层获取用户级别的排他锁，不依赖表中是否存在行。但此方案仅对 KingbaseES 有效（SQLite 不支持 advisory lock），且增加了 adapter 接口差异。**推荐 UNIQUE 约束方案**——简单、可靠、两个数据库均兼容。

**计划内首次生成与调整操作的区分**：`/adjust` 端点的并发场景中，`life_plans` 表中已有该用户的方案记录（调整操作的前提是已存在方案），因此不触发此边缘问题。`FOR UPDATE` 方案对 `/adjust` 始终有效。

**init.sql 和 init_kingbase.sql 同步变更**：在第 10.2 节的 DDL 对齐中，`life_plans` 表需新增 `UNIQUE(user_id, plan_id)` 约束的索引。已有的 `CREATE INDEX IF NOT EXISTS idx_life_plans_user_plan_id`（普通索引，`init.sql` 第 138 行）需升格为 `CREATE UNIQUE INDEX IF NOT EXISTS idx_life_plans_user_plan`。此变更在第 10.1 节差异分析表中标注。

**内存幂等锁与事务间的竞态窗口（v4 新增）**：当前 `plan.js` 的 `/generate` 流程为 `checkIdempotent()` → `await parsePlanOutput()`（Dify 网络调用，耗时数秒）→ `db.transaction()`。迁移后变为 `checkIdempotent()` → `await parsePlanOutput()` → `await adapter.transaction()`。在 KingbaseES READ COMMITTED 隔离级别下，`SELECT ... FOR UPDATE` 行级锁仅在事务开始（`BEGIN`）后才生效——在事务开始前的异步间隙内（含 `parsePlanOutput` 的 Dify 网络调用），另一个并发请求可同时通过内存锁检查。

**问题场景**：
```
请求 A: checkIdempotent() 通过 → parsePlanOutput() (等待 Dify，数秒)
请求 B: checkIdempotent() 通过（A 尚未进入事务，内存锁未更新？实际上 checkIdempotent 已设置）
```
确切地说，当前代码中 `checkIdempotent()` 在调用时即设置内存锁（`lastGenerateRequest.set(userId, now)`），因此严格意义上的"两个请求同时通过"不会发生。但真正的风险在于：`checkIdempotent()` 位于 `parsePlanOutput()` **之后**（见 plan.js 第 44 行），这意味着 Dify 调用完成后才检查幂等——如果用户在 30 秒内重复点击，两次请求都会走完耗时的 Dify 调用，仅第二次在 Dify 返回后被 409 拒绝，浪费了 Dify API 配额。

**建议改造**：
1. **将 `checkIdempotent()` 移至 Dify 调用之前**（在 `callWorkflowBlocking` 之前检查），尽早拒绝重复请求，节省 Dify 配额
2. **将 `checkIdempotent()` 调用移入事务内部**（作为事务的第一个操作），利用 `FOR UPDATE` 的阻塞特性替代内存锁的时序检查，从根本上消除竞态窗口。但注意此方案会延长事务持有时间（事务将覆盖整个 INSERT 过程），需评估对并发的影响
3. **最低改动方案**：保持现有内存锁位置（已在 Dify 调用后），但在 `checkIdempotent()` 通过后立即 `await adapter.transaction()`，不在两者之间插入其他异步操作

推荐方案 1（将幂等检查提前）+ 方案 3（检查通过后立即进入事务），兼顾性能（节省 Dify 配额）和安全（缩短竞态窗口）。

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

**Dify 端同步变更（v4 新增，v6 补充操作步骤）**：禁用 `sql` 模式是服务端的单向决策——若 Dify AI 工作流的 system prompt 未同步更新，LLM 可能在 KingbaseES 环境下仍选择 `sql` 模式，导致用户看到"暂不支持"错误而非有意义的操作建议。需在 Dify 工作流侧同步变更：

**1. `db_type` 变量传递方式**：在 `server/services/difyService.js` 的 `callWorkflowBlocking()` 调用中，增加 `inputs.db_type` 参数：

```javascript
// difyService.js callWorkflowBlocking 调用处改造
const response = await axios.post(difyApiUrl, {
  inputs: {
    ...existingInputs,
    db_type: process.env.DB_TYPE || 'sqlite',  // 新增：传递当前数据库类型
  },
  query: userMessage,
  user: userId,
  response_mode: 'blocking',
}, { headers });
```

Dify 工作流接收到 `db_type` 后，在 system prompt 中通过 Jinja2 模板变量 `{{db_type}}` 引用。

**2. Dify 管理后台修改位置**：
- 登录 Dify 管理后台 → 进入 admin chat 工作流的编辑页面
- 在"编排"（Orchestrate）页面的"系统提示词"（System Prompt）区域，增加或修改 `db_type` 条件判断段落
- 保存并发布工作流新版本

**3. 变更范围**：仅限 **admin chat 工作流**（`difyService.js` 中调用的工作流）。其他工作流（若有）不需要此变更，因为它们不涉及数据库动态 SQL 查询。

**4. 完整 prompt 片段示例**：

```
当前数据库类型：{{db_type}}。
{% if db_type == 'kingbase' %}
重要：当前使用 KingbaseES 数据库，仅支持通过 tool_name 参数调用预定义操作，不支持直接执行 SQL 语句。
当你需要查询或操作数据库时，必须使用 tool_name 参数调用以下预定义工具：
- query_user_profile：查询用户信息
- query_risk_history：查询风险评估历史
- query_punch_records：查询打卡记录
- query_life_plans：查询生活方案
- query_health_advice：查询健康建议
- write_health_advice：写入健康建议
- update_user_profile：更新用户信息
- query_table：通用表查询
- insert_record：通用插入
- update_record：通用更新
- delete_record：通用删除
- get_table_schema：获取表结构
请勿使用 sql 模式。
{% else %}
当前使用 SQLite 数据库，支持 tool_name 和 sql 两种模式。
{% endif %}
```

**5. 第 16 节文件变更清单更新**：`server/services/difyService.js` 需新增 `inputs.db_type` 参数传递改造（v6 补充）。

**6. `proxyDifySSE` SSE 代理的 `inputs` 参数传递（v9 新增）**：

上述 `difyService.js` 的 `callWorkflowBlocking` 改造覆盖了**方案生成**路径（plan.js 调用 Dify 工作流），但 **admin chat** 路径（`admin.js` 的 `/chat` 路由）走的是另一条代码路径——通过 `server/services/sseProxy.js` 中的 `proxyDifySSE` 函数转发 SSE 流式请求到 Dify。当前 `sseProxy.js` 第 26 行硬编码了 `inputs: {}`：

```javascript
// sseProxy.js 当前代码（问题代码）
const requestBody = {
  inputs: {},        // ← 硬编码空对象，db_type 变量永远无法传入 Dify admin chat 工作流
  query: query,
  user: user,
  response_mode: 'streaming',
};
```

这意味着即使 `difyService.js` 正确传递了 `inputs.db_type`，`admin.js` 的 `/chat` 路由也不会将该参数传递给 Dify——admin chat 工作流中的 Jinja2 `{{db_type}}` 变量始终为 `undefined`，Dify system prompt 中的条件判断永不生效。方案设计的 Dify 端同步变更策略对 admin chat 路径完全无效。

**改造方案**：

**(a) 扩展 `proxyDifySSE` 函数签名**：

`sseProxy.js` 的 `proxyDifySSE` 函数增加 `inputs` 参数：

```javascript
// sseProxy.js 改造后轮廓
async function proxyDifySSE({ apiKey, baseUrl, route }, query, user, inputs = {}, req, res) {
  // ...
  const requestBody = {
    inputs: inputs,  // ← 替换硬编码的 inputs: {}
    query: query,
    user: user,
    response_mode: 'streaming',
  };
  // ...
}

module.exports = { proxyDifySSE };
```

**(b) `admin.js` 的 `/chat` 路由传入 `inputs`**：

```javascript
// admin.js /chat 路由改造后轮廓
router.post('/chat', async (req, res) => {
  const { query, user } = req.body;
  await proxyDifySSE(difyConfig, query, user, {
    db_type: process.env.DB_TYPE || 'sqlite',  // 传入当前数据库类型
  }, req, res);
});
```

**(c) 其他 `proxyDifySSE` 调用处**：排查项目中所有调用 `proxyDifySSE` 的路由（如 `assistant.js`、`chat.js`），若这些路由对应的 Dify 工作流不涉及数据库动态 SQL 查询，可传入空对象 `{}` 保持现有行为。推荐统一传入 `{ db_type: process.env.DB_TYPE || 'sqlite' }` 作为最佳实践，确保所有 Dify 工作流均可感知数据库类型（即使当前不使用，也为将来扩展预留能力）。

**(d) 第 16 节文件变更清单更新**：新增 `server/services/sseProxy.js`（改造）条目；更新 `server/routes/admin.js` 条目补充 `/chat` 路由的 `inputs` 传递改造说明；更新 `server/routes/assistant.js` 和 `server/routes/chat.js` 条目补充（若适用）。

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

**`dispatchParameterizedQuery` 函数整体改造（v4 新增）**：`dispatchParameterizedQuery()` 函数（admin.js 第 158 行）需进行以下整体改造：

1. **函数签名**：从 `function dispatchParameterizedQuery(db, toolName, params, operatorId, operatorRole)` 改为 `async function dispatchParameterizedQuery(adapter, toolName, params, operatorId, operatorRole)`——参数从 `db`（better-sqlite3 实例）变为 `adapter`（DatabaseAdapter 实例），函数从同步变为 async
2. **内部调用改造**：所有 `db.prepare(sql).all(params)` → `await adapter.query(sql, params)`；所有 `db.prepare(sql).get(params)` → `await adapter.queryOne(sql, params)`；所有 `db.prepare(sql).run(params)` → `await adapter.execute(sql, params)`
3. **返回值调整**：`.run()` 返回的 `{ lastInsertRowid, changes }` 需从 `adapter.execute()` 的返回值中获取对应字段（`result.lastInsertId`、`result.changes`）
4. **调用处改造**：admin.js 中所有 `dispatchParameterizedQuery(db, ...)` 调用需改为 `const result = await dispatchParameterizedQuery(adapter, ...)`
5. **错误处理**：函数内部的 try/catch 需配合 `await` 才能正确捕获异步异常

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
| **函数整体** | 同步函数 + `db` 参数 + `db.prepare().all/get/run()` | 改为 `async function(adapter, ...)` + `await adapter.query/queryOne/execute()`（详见上方"函数整体改造"段落） |

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
| life_plans | 缺少 UNIQUE 约束（**v9 新增**） | 仅有普通索引 `idx_life_plans_user_plan_id`（`init.sql` 第 138 行），无 `UNIQUE(user_id, plan_id)` 约束 | 无 | 在两个文件中新增 `CREATE UNIQUE INDEX IF NOT EXISTS idx_life_plans_user_plan ON life_plans(user_id, plan_id)`，替代普通索引 `idx_life_plans_user_plan_id`。此为 `FOR UPDATE` 方案的配套防线——当首次方案生成场景下 FOR UPDATE 空结果集不获取行级锁时，UNIQUE 约束在数据库层阻止重复 plan_id 的 INSERT（见 8.5 节 v9 补充） |
| 全部表 | 索引缺失 | `init.sql` 定义 18 个索引（2 个 UNIQUE INDEX + 16 个普通 INDEX，行 134-151）。**v9 更新**：`life_plans` 表的 `idx_life_plans_user_plan_id`（普通索引）升格为 `idx_life_plans_user_plan`（UNIQUE 索引），UNIQUE INDEX 计数从 2 个增至 3 个 | `init_kingbase.sql` 无任何索引定义 | 重写时补充全部 18 个索引（PostgreSQL/KingbaseES 兼容语法），其中 `life_plans` 表的对应索引为 UNIQUE 索引 |
| 全部表 | JSON 列类型未决策（**v3 新增**） | `articles.tags`、`user_risk_info.result`、`user_risk_info.raw_input`、`admin_logs.operation_content`、`admin_logs.operation_result`、`life_advice.tags` 共 6 个 JSON 文本列，在 SQLite 中使用 TEXT 存储 | KingbaseES 中可用 TEXT 或 JSONB。使用 TEXT 需运行时 `::jsonb` 转换；使用 JSONB 查询更快、支持 GIN 索引，但需在迁移中验证 JSON 合法性 | **决策：生产环境使用 JSONB**（见 10.2 节） |
| 全部表 | DDL 幂等性（**v2 新增**） | 使用 `CREATE TABLE IF NOT EXISTS`（可安全重复执行） | 使用 `DROP TABLE IF EXISTS ... CASCADE` 后 `CREATE TABLE`（重复执行会删除已有生产数据，与幂等初始化目标冲突） | 改为 `CREATE TABLE IF NOT EXISTS`（见 10.2 节） |

### 10.2 对齐策略

**决策**：以 `init.sql`（SQLite 生产环境已验证的 schema）为基准，重写 `init_kingbase.sql`，仅将 SQLite 特有语法翻译为 PostgreSQL 兼容语法，不修改业务语义。

**幂等初始化修正（v2 重要变更）**：原 `init_kingbase.sql` 使用 `DROP TABLE IF EXISTS ... CASCADE` 作为建表前缀。此方式在 `init()` 方法的幂等保证下（已存在数据不重复初始化）会导致：每次应用重启时先删除所有表及其数据，再重新建表——已有生产数据全部丢失。修正为与 `init.sql` 一致的 `CREATE TABLE IF NOT EXISTS` 策略，确保脚本可安全地重复执行。

删除功能保留为独立的 `scripts/drop_kingbase_tables.sql` 脚本（仅开发/测试环境使用，生产环境不可执行）。

**CHECK 约束枚举值统一原则**：所有 CHECK 约束的枚举值以 `init.sql` 中的英文值为准（`'diet'`、`'exercise'`、`'other'`、`'completed'`、`'uncompleted'` 等），不使用 `init_kingbase.sql` 中的中文值（`'饮食'`、`'运动'`、`'其他'`、`'已完成'`、`'未完成'`）。原因：应用代码（`punch.js`、`plan.js`、`validators.js`、`planParser.js`）全程使用英文值进行查询、筛选和数据写入，使用中文枚举值将导致所有相关查询静默返回空结果，造成功能故障。

**JSON 列类型决策（v3 新增）**：`articles.tags`、`user_risk_info.result`、`user_risk_info.raw_input`、`admin_logs.operation_content`、`admin_logs.operation_result`、`life_advice.tags` 共 6 个 JSON 文本列，在 KingbaseES 中使用 **JSONB 类型**而非 TEXT：

| 方案 | 优点 | 缺点 |
|------|------|------|
| TEXT | 与 SQLite 行为一致，无需迁移校验 | `sql.jsonField()` 需运行时 `::jsonb` 转换；无索引支持；查询性能差 |
| **JSONB（推荐）** | 原生 JSON 查询支持；可建 GIN 索引加速 `->>` / `@>` 查询；存储压缩 | 需在迁移时校验 JSON 合法性 |

**推荐 JSONB**。具体：
- `init_kingbase.sql` 中将这些列的类型从 TEXT 改为 JSONB
- 迁移脚本中增加 JSON 合法性校验步骤（见 12 节第 8 条）
- 对高频 JSON 查询列（`user_risk_info.result`、`admin_logs.operation_content`）建立 GIN 索引以加速查询

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
| `TEXT`（存储 JSON 字符串） | `JSONB`（6 个 JSON 文本列：`articles.tags`、`user_risk_info.result`、`user_risk_info.raw_input`、`admin_logs.operation_content`、`admin_logs.operation_result`、`life_advice.tags`）。DDL 中 `DEFAULT NULL` 或 `DEFAULT ''` 保持为 `DEFAULT NULL`（JSONB 不接受空字符串作为默认值，原 `DEFAULT ''` 需改为 `DEFAULT NULL`） |

**JSONB 列默认值策略（v7 新增）**：SQLite 中部分 JSON 文本列定义 `DEFAULT ''`（空字符串），但 KingbaseES JSONB 类型不接受空字符串作为合法 JSON 值。在 `init_kingbase.sql` 中，这些列的默认值需调整为 `DEFAULT NULL`。应用层代码中读取 JSON 列时应做好 NULL 值防御（`JSON.parse(row.field || '{}')` 或等效的空值合并逻辑）。

**GIN 索引 DDL 示例（v7 新增）**：对高频 JSON 查询列建立 GIN 索引以加速 `->>` / `@>` 查询。以下为 `user_risk_info.result` 和 `admin_logs.operation_content` 的 GIN 索引 DDL：

```sql
-- user_risk_info.result：风险评估结果 JSON 查询（如按 risk_level 筛选）
CREATE INDEX IF NOT EXISTS idx_user_risk_info_result ON user_risk_info USING GIN (result);

-- admin_logs.operation_content：操作内容 JSON 查询
CREATE INDEX IF NOT EXISTS idx_admin_logs_operation_content ON admin_logs USING GIN (operation_content);

-- 可选：其余 4 个 JSONB 列的 GIN 索引（根据实际查询频率决定是否创建）
-- articles.tags、user_risk_info.raw_input、admin_logs.operation_result、life_advice.tags
```

GIN 索引适用于 `@>`（包含）、`?`（键存在）、`?|`（任意键存在）等 JSONB 运算符。对于本项目最常见的 `->>` 文本提取查询，GIN 索引通过 `USING GIN (col jsonb_path_ops)` 可进一步优化（仅支持 `@>` 但索引更小更快）。**推荐先创建默认 GIN 索引（如上），Phase 1 性能基准对比后根据实际查询模式优化索引策略。**

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

**序列名称获取方式（v6 补充）**：不硬编码序列名称（如 `users_id_seq`），而是使用 PostgreSQL/KingbaseES 内置函数 `pg_get_serial_sequence('table_name', 'column_name')` 动态获取序列名称。此函数根据表的主键列自动返回对应序列的完整标识符，避免了硬编码假设（若某表主键列名不是 `id`，自动生成的序列名会不同）。

```sql
-- 动态序列重置（推荐实现方式）
-- 迁移脚本中为每张表执行：
SELECT setval(
  pg_get_serial_sequence('users', 'id'),
  COALESCE((SELECT MAX(id) FROM users), 0) + 1,
  false
);
SELECT setval(
  pg_get_serial_sequence('doctor_information', 'id'),
  COALESCE((SELECT MAX(id) FROM doctor_information), 0) + 1,
  false
);
-- ... 对全部 10 张表重复
```

`setval` 的第三个参数 `false` 表示下一个 `nextval()` 返回的值是 `setval` 指定值（而非 +1），确保序列生成的下一个 ID 大于当前最大 ID。

**序列名称验证（v6 新增）**：在迁移 dry-run 阶段，应将 `pg_get_serial_sequence()` 的返回值记录到日志中，人工或自动检查所有 10 张表的序列名称是否正确返回（非 NULL）。若某表返回 NULL（如该表无 SERIAL 列），应在迁移日志中标注并手动处理。

7. **迁移前备份（v2 新增）**：执行迁移脚本前必须备份：
   - SQLite 数据库文件：直接复制 `database.sqlite` 到安全位置
   - KingbaseES 目标库（如已有数据）：使用 `pg_dump` 导出

8. **JSON 列合法性校验（v3 新增）**：`articles.tags`、`user_risk_info.result`、`user_risk_info.raw_input`、`admin_logs.operation_content`、`admin_logs.operation_result`、`life_advice.tags` 共 6 个 JSON 文本列，在迁移写入 KingbaseES 前必须验证每条记录的 JSON 合法性（`JSON.parse` 不抛异常即为合法）。不合法的记录记录到迁移日志中，不阻塞整体迁移，供人工处理。

### 12.1 迁移验证策略（v3 新增）

迁移完成后的验证不应仅依赖"行数一致"，需覆盖以下维度：

**验证维度清单**：

| 维度 | 检查方法 | 验收标准 |
|------|---------|---------|
| 行数对比 | 逐表 `SELECT COUNT(*)`，SQLite 与 KingbaseES 对比 | 全部 10 张表行数一致 |
| 抽样逐列对比 | 每表随机抽取 100 行（或全量若 <100 行），逐列对比值（时区转换字段除外——已在迁移中减去 8 小时） | 所有抽样行逐列一致 |
| 时区转换抽样验证 | 对每张有时区转换的表，抽样 10 条记录，验证 `目标值 ≈ 源值 - 8h` | 转换偏移正确（误差 < 1 秒） |
| FK 有效性检查 | 对每对有 FK 约束的表执行 `SELECT count(*) FROM child WHERE fk_col NOT IN (SELECT pk_col FROM parent)` | 无孤儿记录 |
| 非空约束检查 | 对 NOT NULL 列执行 `SELECT count(*) FROM t WHERE col IS NULL` | 返回 0 |
| JSON 字段有效性 | 对 6 个 JSON 文本列逐列 `JSON.parse` 尝试解析 | 全部有效（或无非法记录已记录到日志） |
| SERIAL 序列验证 | 对每张表执行 `SELECT nextval('seq_name')` 确认大于当前 MAX(id) | 不会产生主键冲突 |

**迁移 dry-run 说明**：正式迁移前，建议先对 SQLite 的副本文件执行一次 dry-run 迁移（目标为 KingbaseES 测试实例），验证迁移脚本的完整性和正确性。Dry-run 验证通过后再对生产数据执行正式迁移。

### 12.2 停机时间估算（v6 新增）

生产环境切换至 KingbaseES 的停机时间由三个部分组成：

| 阶段 | 操作 | 估算公式 | 说明 |
|------|------|---------|------|
| 1. 迁移前准备 | 备份 SQLite 文件 + KingbaseES 目标库（如已有数据） | **固定**：1-2 分钟 | 备份是必须的安全步骤 |
| 2. 数据迁移 | 从 SQLite 读取全量数据 → 时区转换 → 写入 KingbaseES → 重置 SERIAL 序列 | **与数据量正比**：`T_migrate ≈ 行数 / 写入速率` | 写入速率受网络延迟、KingbaseES 性能、事务批次大小影响 |
| 3. 迁移验证 | 逐表行数对比 + 抽样逐列对比 + FK/非空/JSON/序列验证 | **固定 + 与数据量正比**：2-5 分钟 | 验证脚本自动化执行 |
| 4. 切换 + 冒烟 | 修改 `DB_TYPE=kingbase` → 重启应用 → 冒烟测试 | **固定**：1-2 分钟 | 应用重启时间 |

**总停机时间估算公式**：

```
T_total = T_backup + T_migrate + T_verify + T_switch
        ≈ 4-9 分钟（固定部分）+ T_migrate（数据量相关部分）
```

**数据量相关部分参考值**：

| 数据规模 | 预估总行数（10 张表） | 预估迁移耗时（含验证） | 总停机时间 | 适用场景 |
|---------|---------------------|---------------------|-----------|---------|
| 小规模（开发/测试） | <1,000 行 | <10 秒 | **<5 分钟** | 开发环境、小团队试运行 |
| 中规模 | 1,000-10,000 行 | 10 秒 - 2 分钟 | **<10 分钟** | 中等用户量 |
| 大规模 | 10,000-100,000 行 | 2-20 分钟 | **<30 分钟** | 较大用户量 |
| 超大规模 | >100,000 行 | >20 分钟 | **数小时级别** 需提前规划维护窗口 | 大量历史数据 |

**降低停机时间的措施**：

1. **Dry-run 预演**：在正式迁移前对 SQLite 副本执行完整 dry-run，实测迁移耗时，据此确定正式维护窗口大小
2. **批量写入优化**：迁移脚本采用事务内批量 INSERT（每 500-1000 行一个事务），减少网络往返和事务开销
3. **并行迁移讨论（远期优化）**：对于超大规模数据，可考虑按表并行迁移（需处理 FK 依赖顺序）、或采用在线迁移策略（应用双写 SQLite + KingbaseES 一段时间后切换读取源）。当前项目规模预计无需此复杂度

**推荐做法**：
- Phase 1 阶段对 SQLite 副本执行 dry-run 迁移，实测耗时
- 根据实测数据确定 Phase 2 生产迁移的维护窗口（建议在实测耗时基础上加 50% 缓冲）
- 提前通知用户维护窗口时间

**逆向迁移脚本框架**：Phase 2 生产切换后如需回退到 SQLite，需将 KingbaseES 期间产生的新数据迁回 SQLite。应并行准备 `scripts/migrate-reverse-to-sqlite.js` 脚本框架（含时区反向转换：UTC → 本地时间 +8h），在 Phase 2 切换前完成脚本编写和 dry-run 验证。虽然 Phase 2 回退方案中提到"KingbaseES 期间产生的新数据不会自动同步回 SQLite"，但完整的回退预案应包含此逆向迁移能力。

### 12.3 迁移异常处理策略（v6 新增）

迁移过程中可能发生中途失败（如第 5 张表迁移完成后网络断开或 KingbaseES 服务重启），此时前 4 张表已有部分数据，需有明确的异常处理策略：

**策略：逐表迁移 + 即时验证 + 断点续传**

| 步骤 | 操作 | 失败处理 |
|------|------|---------|
| 1 | 对每张表执行：先 `SELECT COUNT(*)` 从 SQLite 获取源行数 | 若读取失败，终止迁移，KingbaseES 目标库保持迁移前状态 |
| 2 | 在事务内将当前表数据从 SQLite 写入 KingbaseES | 若 INSERT 失败，事务自动 ROLLBACK，当前表数据不残留 |
| 3 | 提交事务后，立即对当前表执行行数验证：`SELECT COUNT(*)` 对比源与目标 | 行数不一致 → 记录到异常日志，不自动终止（允许后续人工判断是否继续） |
| 4 | 记录当前已完成的表名到进度日志文件（如 `migration_progress.json`） | 进度文件损坏或写入失败 → 人工介入 |
| 5 | 继续下一张表 | — |

**断点续传支持**：若迁移在第 N 张表失败，重新执行迁移脚本时：
1. 读取 `migration_progress.json` 获取已完成表列表
2. 对已完成的表：跳过数据写入，但仍执行行数验证（确认数据完整）
3. 对未完成的表：重新写入（先 `DELETE FROM table_name` 清除可能的残留数据，再从 SQLite 重新读取写入）
4. 对所有表重新执行序列重置和最终全量验证

**迁移失败后的目标库状态清理**：若决定放弃本次迁移（不回退后重新迁移），应执行 `scripts/drop_kingbase_tables.sql` 清空 KingbaseES 目标库，恢复到"空库待初始化"状态。

**迁移日志要求**：迁移脚本必须输出结构化日志（JSON 格式，每行一条），包含：
- 每张表的迁移开始/结束时间戳
- 源行数、目标行数、耗时
- 时区转换记录数
- 异常和警告信息

### 12.4 回退决策触发条件（v6 新增）

Phase 2 生产切换至 KingbaseES 后，若发现数据正确性问题，需有明确的回退决策触发条件：

**立即回退触发条件**（满足任一即触发）：
1. 关键业务查询返回错误结果（如用户登录后看不到自己的方案数据）
2. 数据库连接池频繁泄漏或耗尽（`waitingCount` 持续 > 0 超过 5 分钟）
3. 数据写入丢失（INSERT/UPDATE 成功返回但数据未持久化）
4. 慢查询导致 API 超时率 > 5%（持续超过 10 分钟）

**评估性回退触发条件**（满足任一后团队讨论决定）：
1. 非关键查询性能退化 > 3 倍 SQLite 基准值
2. 偶发性连接错误（每小时 > 10 次）
3. 时区显示问题影响 > 5% 用户

**回退后数据丢失问题**：回退到 SQLite 后，在 KingbaseES 上运行期间产生的新数据不会自动同步回 SQLite。缓解措施：
1. **双写机制讨论**：若业务要求零数据丢失回退，需在 Phase 2 期间实现 SQLite+KingbaseES 双写（增加实现复杂度，当前项目规模不推荐）
2. **日志补偿**：回退后，从 KingbaseES 导出切换期间产生的新数据（通过 `scripts/migrate-reverse-to-sqlite.js`），手动或脚本化追加到 SQLite
3. **维护窗口策略**：选择低峰期（如凌晨）执行切换，最小化切换期间产生的数据量

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
| 健康检查 | `GET /health` 端点返回数据库连接状态（调用 `adapter.healthCheck()`） | `server/routes/index.js`（改造 `/health` 路由，v3 纳入变更范围） |
| 错误追踪 | 数据库异常通过 `console.error` 输出（含 SQLSTATE code、message），可被日志收集系统采集 | 路由层已有的 `catch` 块 |
| 错误重试（v7 新增，Phase 2+ 可选） | 运行时连接瞬断（如网络抖动导致单次 `pool.query()` 失败）的自动重试。**Phase 0/1 暂不实现**——`pg.Pool` 已内置连接池管理，瞬时连接错误为低概率事件。Phase 2+ 可在 `KingbaseAdapter` 中增加可配置的重试逻辑（仅对只读操作重试，最多 1 次，间隔 100ms） | 详见 15 节风险表 v7 新增行 |

**健康检查实现**：
- **SqliteAdapter.healthCheck()**：执行 `SELECT 1`，检查数据库连接是否打开
- **KingbaseAdapter.healthCheck()**：调用 `pool.query('SELECT 1')`，成功返回 `true`，失败返回 `false`

**健康检查 HTTP 响应格式（v7 新增）**：

`GET /health` 端点（`server/routes/index.js`）改造后需根据 `adapter.healthCheck()` 返回值返回不同的 HTTP 状态码和响应体：

- **数据库健康时**（HTTP 200）：
  ```json
  { "success": true, "message": "服务运行正常", "status": "ok", "database": "connected" }
  ```
- **数据库不健康时**（HTTP 503）：
  ```json
  { "success": false, "message": "数据库连接异常", "status": "error", "database": "disconnected" }
  ```

**向后兼容性说明（v9 新增）**：当前 `GET /health` 端点的响应格式为 `{ success: true, message: "..." }`。为保持向后兼容（前端代码、负载均衡器健康检查、监控脚本可能依赖 `success` 和 `message` 字段），改造后在原有 `success`/`message` 字段基础上新增 `status`/`database` 字段。`success` 字段与 `status` 字段保持语义一致（`true`/`false` 对应 `"ok"`/`"error"`）。`message` 字段在不健康时提供人类可读的异常描述。

**推荐 HTTP 503（Service Unavailable）而非 200**：当数据库不可用时，负载均衡器和监控系统应将该实例标记为不健康并停止路由流量。返回 200 会导致健康检查"假阳性"——监控系统认为服务正常，但实际所有数据库相关请求均会失败。

**可选扩展**：`healthCheck()` 可返回连接池指标（`pool.totalCount`、`pool.idleCount`、`pool.waitingCount`）作为响应体的 `metrics` 字段，供高级监控使用。此扩展为 Phase 2+ 可选项，Phase 0/1 仅返回数据库连通性状态。

### 13.3 运维

| 维度 | 决策 |
|------|------|
| 备份策略 | **SQLite**：定时复制 `database.sqlite` 文件（cron job，每小时）。**KingbaseES**：`pg_dump` 每日全量备份 + WAL 归档（依赖 KingbaseES DBA 配置）。备份脚本 `scripts/backup-kingbase.sh` 提供参考 |
| 停机时间 | 数据库切换（SQLite ↔ KingbaseES）通过修改 `.env` + 重启应用完成，预计停机时间 < 1 分钟。数据迁移期间需额外停机，详细估算见第 12.2 节"停机时间估算" |
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

**已知例外**：`GET /api/health` 端点在原有 `success`/`message` 字段基础上新增 `status`/`database` 字段（向后兼容，原字段不变）。若负载均衡器或监控脚本仅依赖 `success` 字段（而非响应体的完整结构），兼容性不受影响。详见第 13.2 节健康检查 HTTP 响应格式说明。

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
| **（v3 新增）Phase 0 混合时间戳数据一致性** | 旧数据（本地时间）与新数据（UTC）混合共存：时间范围查询出错、前端展示不一致、Dify AI 工作流误判 | 在 Phase 0 改造完成后运行一次性 UTC 转换脚本 `scripts/phase0_utc_convert.sql`，将现有数据所有 datetime 字段减去 8 小时（见 4.2 节） |
| **（v3 新增）plan.js 事务批量 INSERT 网络延迟** | KingbaseES 下逐条 INSERT 的网络往返使事务耗时从毫秒级升至秒级，锁持有时间延长 | 改为多行 VALUES 单条批量 INSERT（见 8.2 节）；Phase 1 性能基准对比中列为显式指标（见 6 节 Phase 1 验收标准） |
| **（v3 新增）KingbaseES 事务内 DDL 隐式提交** | 若 V8R6 对 DDL 隐式提交，部分表 CREATE 后无法回滚，幂等初始化在部分失败后留下中间状态 | 实现前在 V8R6 上验证事务内 DDL 行为（见 3.4.5 节验证方法）；推荐采用拆分 DDL/种子文件方案 |
| **（v3 新增）数据迁移验证不充分** | 仅验证行数一致无法保证数据完整性：内容错误、FK 断裂、NULL 违规、JSON 无效可能被遗漏 | 增加抽样逐列对比、FK 有效性检查、非空约束检查、JSON 合法性校验等多维度验证（见 12.1 节） |
| **（v4 新增）insertAdminLog 事务内上下文矛盾** | admin.js `/execute` 事务回调内 `insertAdminLog` 使用全局 adapter 而非 txAdapter，审计日志 INSERT 在事务外独立提交，破坏事务原子性 | `insertAdminLog` 增加 `adapter` 参数，调用方根据是否在事务内传入全局 adapter 或 txAdapter（见 8.3 节 v4 补充） |
| **（v4 新增）plan.js 内存幂等锁与异步事务间竞态窗口** | `checkIdempotent()` 位于 Dify 调用之后，重复请求会走完耗时的 Dify 调用后才被拒绝，浪费 API 配额；且内存锁到事务开始的异步间隙内存在竞态风险 | 将 `checkIdempotent()` 移至 Dify 调用之前；检查通过后立即进入事务，不在两者间插入其他异步操作（见 8.5 节 v4 补充） |
| **（v4 新增）Dify AI sql 模式禁用的跨系统协同缺失** | 服务端禁用 `sql` 模式，但 Dify 工作流 system prompt 未告知 AI 此限制，LLM 可能仍尝试 `sql` 模式导致用户看到"暂不支持"错误 | Dify system prompt 注入 `db_type` 变量，KingbaseES 下引导 LLM 优先 `tool_name`；Phase 1 验收增加端到端 Dify 对话测试（见 9.2 节 v4 补充） |
| **（v4 新增）dispatchParameterizedQuery async 改造遗漏** | 函数签名、参数类型、内部调用、返回值、错误处理均需改造，但原方案仅列出 11 个 tool_name 的 SQL 适配，未说明函数整体改造 | 在 9.2 节增加函数整体改造 5 个要点：签名改 async、参数 db→adapter、内部调用改 await adapter.*、返回值字段映射、错误处理（见 9.2 节 v4 补充） |
| **（v4 新增）KingbaseAdapter transaction() ROLLBACK 失败连接泄漏** | ROLLBACK 自身失败（如连接已断开）时若未调用 `client.release()`，连接永久泄漏直到数据库端 idle timeout 回收，长期运行后连接池耗尽 | `try/catch/finally` 结构确保 `client.release()` 在 finally 中执行，ROLLBACK 失败仅记录日志不覆盖原始异常（见 3.4.4 节 v4 补充） |
| **（v4 新增）auth.js async handler 缺少 error handling 包裹** | `/register` 和 `/login` 改为 async 后，adapter 方法的 rejected Promise 不被 Express 4.x 自动捕获（项目未引入 express-async-errors），导致未处理 Promise rejection | handler 改为 `async (req, res, next) => { try { ... } catch (e) { next(e); } }` 模式（见 3.6 节 v4 明确） |
| **（v6 新增）database.js 与路由文件改动顺序矛盾** | database.js 一旦改造完成、`db` 导出消失，所有尚未改造的 11 个路由文件因 `require('../db/database')` 中 `db` 为 `undefined` 而无法启动，不存在"逐文件改造后自测"的可能性 | 双导出过渡方案：Phase 0 期间 database.js 同时导出旧接口 `db` 和新接口 `getAdapter()`，SqliteAdapter 内部暴露原始 better-sqlite3 Database 实例作为 `db` 引用（见 3.5.2 节） |
| **（v6 新增）Phase 0 与 Phase 2 时区双重转换冲突** | Phase 0 的 `scripts/phase0_utc_convert.sql` 和 Phase 2 的 `scripts/migrate-to-kingbase.js` 均对 datetime 字段减 8 小时，若顺序执行导致总计 16 小时偏移 | 推荐 Phase 2 统一处理时区转换，Phase 0 不执行独立 UTC 脚本（见 4.2 节"Phase 0 与 Phase 2 脚本互斥关系"） |
| **（v6 新增）sql.js 方言感知机制缺失** | sql.js 需根据数据库类型输出不同 SQL 片段，但方案未定义如何获取当前数据库类型，实现者可能选择不合适方式 | `initDatabase()` 实例化 adapter 后调用 `sql.setDialect(dbType)` 设置模块级变量；各辅助函数通过 `getDialect()` 获取（见 4.2 节"方言感知机制"） |
| **（v6 新增）KingbaseES Docker 镜像不可用风险** | `kingbase/kingbasees:v8r6` 镜像可能不公开发布在 Docker Hub，金仓数据库为商业产品需授权 | 标注镜像名称为"待验证假设"；提供直接安装、使用现有测试实例等替代方案（见 5.1 节"KingbaseES Docker 镜像可用性说明"） |
| **（v6 新增）SqliteAdapter 同步异常转 Promise rejection 文字误导** | 方案描述"包裹 `Promise.resolve()` 即可"会导致同步异常不被 Promise 捕获，与 async/await 错误处理模型不一致 | 改为声明 `async` 函数，利用 `async` 函数体自动将同步异常转为 rejected Promise（见 3.3 节） |
| **（v6 新增）端到端测试策略缺失** | `npm test` 不存在（`package.json` 无 `"test"` 脚本），Phase 0/1 验收依赖未定义的手工测试 | 定义 18 个 API 端点手工回归测试清单 + 3 个核心 E2E 流程 + CI 冒烟验证脚本（见 5.1.1 节） |
| **（v6 新增）Phase 2 数据迁移停机时间未估算** | 方案未提供停机时间估算方法，无法确定维护窗口大小和评估用户影响 | 新增停机时间估算公式、数据量相关参考值表、降低停机措施（见 12.2 节） |
| **（v6 新增）迁移脚本 SERIAL 序列名称硬编码** | 硬编码假设序列名称为 `users_id_seq`，若某表主键列名不是 `id`，自动生成的序列名称会不同 | 使用 `pg_get_serial_sequence('table_name', 'column_name')` 动态获取序列名称；dry-run 中验证序列名称（见 12 节第 6 条） |
| **（v6 新增）Dify 工作流 prompt 修改操作步骤不完整** | 未说明 `db_type` 变量如何传入 Dify 工作流、在管理后台何处修改、变更范围是否覆盖所有工作流 | 补充 `difyService.js` 中 `inputs.db_type` 传递方式、Dify 管理后台修改位置、变更范围仅限 admin chat 工作流（见 9.2 节 v6 补充） |
| **（v6 新增）迁移异常场景数据一致性保障缺失** | 未覆盖迁移中途失败处理（部分表已有数据）和回退触发条件（KingbaseES 上产生新数据后回退的数据丢失问题） | 逐表迁移 + 即时验证 + 断点续传策略（见 12.3 节）；回退决策触发条件（见 12.4 节） |
| **（v7 新增）KingbaseES 运行时连接瞬断无自动重试** | 运行中某次 `pool.query()` 因网络瞬时抖动（TCP 断开、防火墙超时）抛出连接错误时，当前方案未定义自动重试策略——未被 `transaction()` 包裹的单语句操作（占绝大多数路由调用）将直接向用户返回 500 错误 | **Phase 0/1 暂不实现自动重试**（理由：`pg.Pool` 已内置连接池管理和错误事件处理，瞬时连接错误为低概率事件；实现通用重试需处理幂等性判断——SELECT 可重试但 INSERT/UPDATE 重试可能导致重复写入）。**Phase 2+ 可选增强**：在 `KingbaseAdapter.query/queryOne/execute` 中增加可配置的重试逻辑（仅对只读操作重试，最多 1 次，间隔 100ms）。在 13.2 节监控维度中增加"错误重试"条目，标注为 Phase 2+ 可选增强项 |
| **（v9 新增）`proxyDifySSE` 硬编码 `inputs: {}` 阻断 admin chat 的 `db_type` 变量传递** | `sseProxy.js` 第 26 行硬编码 `inputs: {}`，且 `admin.js` 的 `/chat` 路由调用 `proxyDifySSE` 时不传入 inputs 参数。Dify admin chat 工作流永远接收不到 `db_type` 变量，Jinja2 条件判断永不生效——方案设计的 Dify 端同步变更策略对 admin chat 路径完全无效 | 扩展 `proxyDifySSE` 函数签名增加 `inputs` 参数；`admin.js` 的 `/chat` 路由调用时传入 `{ db_type: process.env.DB_TYPE \|\| 'sqlite' }`；排查其他 `proxyDifySSE` 调用处（`assistant.js`、`chat.js`）按需传入 inputs（见 9.2 节 v9 新增） |
| **（v9 新增）`FOR UPDATE` 行级锁对"首次方案生成"场景失效** | 用户首次生成方案时 `life_plans` 表无该用户的任何行：事务内 `UPDATE ... SET is_active = 0` 影响零行（不获取行级锁），`SELECT MAX(plan_id) ... FOR UPDATE` 的 WHERE 条件匹配零行（空结果集的 FOR UPDATE 在 PostgreSQL/KingbaseES READ COMMITTED 下不获取任何行级锁）。两个并发请求均可成功 INSERT 相同 plan_id，因 life_plans 表无 UNIQUE(user_id, plan_id) 约束 | 在 `life_plans` 表上增加 `UNIQUE(user_id, plan_id)` 约束（数据库层最后防线）；同步更新 `init.sql` 和 `init_kingbase.sql` 的 DDL（将普通索引升格为 UNIQUE 索引）；/adjust 操作不触发此问题（调整前提是已存在方案）（见 8.5 节 v9 新增） |

---

## 16. 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `server/db/adapter/DatabaseAdapter.js` | 适配层接口契约（JSDoc 标注） |
| 新建 | `server/db/adapter/SqliteAdapter.js` | SqliteAdapter 实现（含 init、tableInfo、healthCheck 方法） |
| 新建 | `server/db/adapter/KingbaseAdapter.js` | KingbaseAdapter 实现（含 init 多语句执行、`?`→`$1` 占位符转换、RETURNING id 自动追加、tableInfo、healthCheck 方法、SSL/TLS 配置、pool.on('error') 事件处理） |
| 新建 | `server/db/sql.js` | SQL 方言辅助函数（含 now / date / jsonField / jsonFieldAs） |
| 改造 | `server/db/database.js` | 引入 adapter 子目录，导出 `getAdapter()`；`initDatabase()` 改为 async；增加启动环境变量校验 |
| 改造 | `server.js` | 启动流程改造：`initDatabase()` 改为 await（IIFE + async/await），确保数据库初始化完成后才启动 HTTP 服务（v3 纳入变更范围） |
| 改造 | `server/routes/auth.js` | `db.prepare` → `adapter.query/queryOne/execute`；handler 改为 `async (req, res, next) => { try { ... } catch (e) { next(e); } }` 模式 |
| 改造 | `server/routes/user.js` | 同上 + `datetime()` → `sql.now()`；handler 标记 async |
| 改造 | `server/routes/risk.js` | 同上 + `json_extract` → `sql.jsonField/sql.jsonFieldAs`；`/history` handler 标记 async |
| 改造 | `server/routes/plan.js` | 同上 + `db.transaction` → `adapter.transaction` + `datetime()` → `sql.now()` + `SELECT MAX(plan_id)` 加 `FOR UPDATE`；`/current` handler 标记 async；`checkIdempotent()` 移至 Dify 调用之前（见 8.5 节 v4 补充） |
| 改造 | `server/routes/punch.js` | 同上 + `last_insert_rowid()` → adapter.execute 内部处理 + `datetime()` 日期运算 → 应用层计算日期参数 |
| 改造 | `server/routes/articles.js` | 同上 + `datetime()` → `sql.now()`；handler 标记 async |
| 改造 | `server/routes/admin.js` | 同上 + `PRAGMA table_info` → `adapter.tableInfo()` + `db.transaction` → `adapter.transaction`；`/logs` handler 标记 async；`sql` 模式在 KingbaseES 下禁用；`insertAdminLog` 增加 `adapter` 参数（事务内传入 txAdapter）；`dispatchParameterizedQuery` 整体 async 改造（签名、内部调用、返回值）；`/chat` 路由调用 `proxyDifySSE` 时传入 `inputs: { db_type: process.env.DB_TYPE \|\| 'sqlite' }`（v9 新增） |
| 改造 | `server/routes/assistant.js` | `db.prepare` → `adapter.query/queryOne`；handler 标记 async |
| 改造 | `server/routes/doctors.js` | 同上 |
| 改造 | `server/routes/diabetes.js` | 同上 |
| 改造 | `server/routes/chat.js` | 同上 |
| 改造 | `server/db/init.sql` | 将 `idx_life_plans_user_plan_id` 普通索引升格为 `idx_life_plans_user_plan` UNIQUE 索引（`CREATE UNIQUE INDEX IF NOT EXISTS idx_life_plans_user_plan ON life_plans(user_id, plan_id)`），配合 `FOR UPDATE` 方案的首次生成场景保护（v9 新增，见 8.5 节） |
| 重写 | `server/db/init_kingbase.sql` | 对齐 init.sql schema（使用 `CREATE TABLE IF NOT EXISTS`，补充 `result`/`diabetes_history`/`diabetes_type` 字段、全部 18 个索引含 `idx_life_plans_user_plan` UNIQUE 索引、doctor_information 和 punch_in 约束修复、列名/枚举值统一）；种子数据使用 `__BCRYPT_HASH_PLACEHOLDER__` 占位符，内容对齐 seed.sql |
| 新建 | `scripts/migrate-to-kingbase.js` | 一次性数据迁移脚本（含时区转换 + SERIAL 序列重置 + 迁移前后备份提示 + 多维度验证 + JSON 合法性校验） |
| 新建 | `scripts/migrate-reverse-to-sqlite.js` | 逆向迁移脚本框架（KingbaseES → SQLite 数据回退，含时区反向转换，v3 新增） |
| 可选新建 | `scripts/phase0_utc_convert.sql` | Phase 0 一次性 UTC 转换脚本（现有 SQLite 数据 datetime 字段从本地时间转 UTC，v3 新增）。**备选工具：仅在采用方案 B/C（Phase 0 独立 UTC 转换，见 4.2 节）时使用。采用方案 A（推荐，Phase 2 统一转换）时不创建/执行此文件。** |
| 新建 | `scripts/drop_kingbase_tables.sql` | 独立的删表脚本（仅开发/测试环境使用，非 init 的一部分） |
| 新建 | `scripts/backup-kingbase.sh` | KingbaseES 备份脚本参考（pg_dump 每日全量） |
| 新建 | `scripts/ci-smoke-test.sh` | CI 冒烟验证脚本：启动应用 → 验证 `/health` 端点返回 200 + database:connected（v6 新增，见 5.1.1 节） |
| 更新 | `.env` | 增加 DB_TYPE、DATABASE_URL（含 `options` 参数示例）、连接池配置、SSL 配置 |
| 更新 | `.env.example` | 同步新增字段 |
| 更新 | `package.json` | 增加 `pg` 依赖 |
| 不变 | `src/`（前端） | 零改动 |
| 不变 | `server/middleware/` | 零改动 |
| 改造 | `server/services/difyService.js` | `callWorkflowBlocking` 调用处增加 `inputs.db_type` 参数传递（v6 新增，见 9.2 节 Dify 端同步变更） |
| 改造 | `server/services/sseProxy.js` | `proxyDifySSE` 函数签名扩展 `inputs` 参数，替换硬编码 `inputs: {}`（v9 新增，见 9.2 节 v9 补充） |
| 不变 | `server/services/`（其他文件，除上述两个文件外） | 零改动 |
| 不变 | `server/utils/` | 零改动（pagination/validators/response 等与数据库无关） |
| 不变 | `server/routes/upload.js` | 零改动（文件上传，不涉及数据库） |
| 改造 | `server/routes/index.js` | `/health` 端点改造：从静态 JSON 响应改为调用 `adapter.healthCheck()` 返回数据库连接状态（v3 纳入变更范围） |

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

---

## 修订说明（v2 → v3）

本轮修订基于第 2 轮诊断报告（`b_v2_diag_v1.md`）的审查反馈，共解决全部 7 个问题（2 个严重、5 个一般）。

### 一、严重问题修复（2 个）

**修订 R1：`server.js` 启动流程改造（问题 1）**

在 3.5.1 节新增"server.js 启动流程改造"子节，包含：
- 当前 `server.js` 的同步启动流程分析
- 改造后代码轮廓（IIFE + async/await 方案）
- 三种顶层 await 方案对比表（IIFE / `.then()` / ESM 顶层 await），推荐 IIFE 方案
- `app.listen()` 与 `await initDatabase()` 的时序保证说明
- 数据库初始化失败时的快速失败行为（进程退出，HTTP 服务不启动）

在第 16 节文件变更清单中新增 `server.js` 条目，标注为"改造"。

**修订 R2：Phase 0 混合时间戳数据状态处理（问题 2）**

在 4.2 节 `sql.now()` 与 UTC 存储决策段落新增"Phase 0 混合时间戳数据状态处理"子节，包含：
- 混合状态三种影响分析（时间戳语义不一致、时间范围查询出错、Dify AI 工作流影响）
- 推荐解决方案：一次性 SQL 脚本 `scripts/phase0_utc_convert.sql`（含全部 11 个 datetime 字段的完整 SQL）
- 脚本执行前提（Phase 0 改造完成后、执行前备份、仅执行一次）
- 脚本效果说明（数据库立即进入全 UTC 状态）

在 Phase 0 验收标准中新增"前置步骤"条目，明确 UTC 转换脚本的执行要求。

在第 15 节风险表中新增"Phase 0 混合时间戳数据一致性"风险项。

在第 16 节文件变更清单中新增 `scripts/phase0_utc_convert.sql` 文件。

### 二、一般问题修复（5 个）

**修订 R3：`/health` 端点改造与文件变更清单一致性（问题 3）**

确认将 `/health` 端点改造纳入范围。具体修改：
- 第 13.2 节监控维度中 `/health` 端点描述标注为"v3 纳入变更范围"
- 第 16 节文件变更清单中 `server/routes/index.js` 从"零改动"改为"改造"，标注 `/health` 端点增强内容

**修订 R4：plan.js 事务批量 INSERT 网络性能评估（问题 4）**

在第 8.2 节事务模式中新增"批量 INSERT 网络性能影响"子节，包含：
- SQLite vs KingbaseES 单条 INSERT 延迟对比表
- 事务锁持有时间分析
- 缓解措施：多行 VALUES 单条批量 INSERT（推荐，含代码轮廓和参数数量分析）
- 性能基准对比要求

在第 6 节 Phase 1 验收标准中新增第 5 条"性能基准对比"，将 `POST /api/plan/generate` 和 `PUT /api/plan/adjust` 的响应时间列为显式对比指标。

在第 15 节风险表中新增"plan.js 事务批量 INSERT 网络延迟"风险项。

**修订 R5：数据迁移验证策略深化（问题 5）**

在第 12 节新增"12.1 迁移验证策略"子节，包含：
- 7 维度验证清单（行数对比、抽样逐列对比、时区转换验证、FK 有效性、非空约束、JSON 字段有效性、SERIAL 序列验证），每个维度标注检查方法和验收标准
- 迁移 dry-run 说明（先对 SQLite 副本执行）
- 逆向迁移脚本框架说明（`scripts/migrate-reverse-to-sqlite.js`，含时区反向转换）

在第 16 节文件变更清单中新增 `scripts/migrate-reverse-to-sqlite.js` 文件，更新 `scripts/migrate-to-kingbase.js` 描述。

在第 15 节风险表中新增"数据迁移验证不充分"风险项。

**修订 R6：JSON 存储列类型决策（问题 6）**

在 10.1 节差异分析表中新增"JSON 列类型未决策"行，列出 6 个 JSON 文本列。

在 10.2 节对齐策略中新增"JSON 列类型决策"子段，包含：
- TEXT vs JSONB 方案对比表
- 决策：生产环境使用 JSONB（配合 GIN 索引）
- 具体措施：DDL 改 JSONB + 迁移 JSON 校验 + GIN 索引建议

在第 12 节新增第 8 条"JSON 列合法性校验"步骤。

**修订 R7：KingbaseES 事务内 DDL 执行兼容性验证（问题 7）**

在 3.4.5 节 `init()` 方法中新增"事务内 DDL 兼容性验证"子节，包含：
- 验证目标和背景说明
- 具体验证 SQL 脚本（CREATE + ROLLBACK 测试）
- 若 DDL 隐式提交的影响分析和对策
- 推荐将拆分 DDL/种子文件方案从"备选"提升为"首推方案"

在第 15 节风险表中新增"KingbaseES 事务内 DDL 隐式提交"风险项。

### 三、版本标记统一

- 文档标题从"（v2）"更新为"（v3）"
- 所有新增内容标注"v3 新增"标记，便于审阅者定位本轮变更

---

## 修订说明（v3 → v4）

本轮修订基于第 3 轮诊断报告（`b_v4_diag_v1.md`）的审查反馈及质询确认，共解决全部 6 个问题（1 个严重、3 个中等、2 个轻微），覆盖事务内嵌套函数上下文矛盾、异步化时序竞态、跨系统协同、代码改造显式化、异常路径保护、错误处理模式。

### 一、严重问题修复（1 个）

**修订 R1：`insertAdminLog` 事务内适配层调用上下文矛盾（问题 1）**

在 8.3 节事务受影响文件中新增"admin.js `/execute` 事务内 `insertAdminLog` 适配"子节，包含：
- 问题描述：`insertAdminLog` 是模块级闭包，内部使用模块级 `db` 变量。`adapter.transaction()` 创建专用 client 和 `txAdapter` 后，若 `insertAdminLog` 仍使用全局 adapter，其 INSERT 在事务外独立提交，破坏原子性
- 改造要求：`insertAdminLog` 签名改为 `async function insertAdminLog(adapter, operatorId, operationType, operationContent, operationResult)`，事务内传入 `txAdapter`，事务外传入全局 adapter

在第 15 节风险表中新增"insertAdminLog 事务内上下文矛盾"风险项。

在第 16 节文件变更清单中 `admin.js` 条目补充 `insertAdminLog` 参数改造说明。

### 二、一般问题修复（3 个）

**修订 R2：`plan.js` 内存幂等锁与异步事务间的竞态窗口（问题 2）**

在 8.5 节事务隔离级别与并发安全中新增"内存幂等锁与事务间的竞态窗口"子节，包含：
- 当前流程分析：`checkIdempotent()` 位于 `parsePlanOutput()`（Dify 网络调用）之后，重复请求会走完耗时的 Dify 调用后才被 409 拒绝，浪费 Dify API 配额
- 三种建议方案对比：(1) 将幂等检查移至 Dify 调用之前；(2) 将幂等检查移入事务内部利用 FOR UPDATE；(3) 检查通过后立即进入事务
- 推荐方案：方案 1（提前检查）+ 方案 3（检查后立即进入事务）

在第 3.6 节 plan.js 改造说明中标注 `checkIdempotent()` 调用位置需调整。

在第 15 节风险表中新增"plan.js 内存幂等锁与异步事务间竞态窗口"风险项。

在第 16 节文件变更清单中 `plan.js` 条目补充 `checkIdempotent()` 位置调整说明。

**修订 R3：Dify AI `sql` 模式禁用后的跨系统协同（问题 3）**

在 9.2 节 Phase 1 策略说明中新增"Dify 端同步变更"子节，包含：
- Dify system prompt 注入 `db_type` 变量方案，含示例 prompt 片段（Jinja2 模板语法）
- KingbaseES 环境下引导 LLM 优先使用 `tool_name` 模式

在第 6 节 Phase 1 验收标准中新增第 6 条"Dify admin 对话端到端测试"，覆盖"AI 在 KingbaseES 下不会尝试 sql 模式"的场景验证。

**修订 R4：`dispatchParameterizedQuery` 函数级别 async 改造显式化（问题 4）**

在 9.2 节 `tool_name` 模式适配中新增"`dispatchParameterizedQuery` 函数整体改造"子节，包含 5 个改造要点：
1. 函数签名从同步 `function(db, ...)` 改为 `async function(adapter, ...)`
2. 内部调用 `db.prepare(sql).all/get/run()` → `await adapter.query/queryOne/execute(sql, params)`
3. 返回值字段映射（`lastInsertRowid` → `lastInsertId`，`changes` → `changes`）
4. 调用处改为 `const result = await dispatchParameterizedQuery(adapter, ...)`
5. try/catch 需配合 `await` 才能正确捕获异步异常

在 9.2 节 tool_name 适配表末尾增加"函数整体"行。

在第 15 节风险表中新增"dispatchParameterizedQuery async 改造遗漏"风险项。

在第 16 节文件变更清单中 `admin.js` 条目补充 `dispatchParameterizedQuery` 整体改造说明。

### 三、轻微问题修复（2 个）

**修订 R5：KingbaseAdapter `transaction()` ROLLBACK 失败时的连接释放保护（问题 5）**

在 3.4.4 节 `transaction()` 描述中新增"`transaction()` 连接释放保护"子节，包含：
- 完整的 `try/catch/finally` 伪代码实现轮廓
- 三个关键设计点说明（finally 保证释放、ROLLBACK 失败仅记录日志、ClientAdapter 轻量对象）

在第 15 节风险表中新增"KingbaseAdapter transaction() ROLLBACK 失败连接泄漏"风险项。

**修订 R6：auth.js `/register` handler 缺少 error handling 包裹（问题 6）**

在 3.6 节 auth.js 改造清单中明确：`/register` 和 `/login` handler 需从 `(req, res) => {...}` 改为 `async (req, res, next) => { try { ... } catch (e) { next(e); } }`。

在 3.6 节 Express async error handling 注意中改写为明确声明：经核实，项目 `package.json` 未引入 `express-async-errors` 包，因此所有新改造为 async 的 handler 必须遵循 `try/catch + next(e)` 模式，不得依赖 Express 4.x 自动捕获 async 异常。

在第 15 节风险表中新增"auth.js async handler 缺少 error handling 包裹"风险项。

在第 16 节文件变更清单中 `auth.js` 条目明确 handler 改造模式。

### 四、版本标记更新

- 文档标题从"（v3）"更新为"（v4）"
- 所有新增内容标注"v4 新增"标记，便于审阅者定位本轮变更

---

## 修订说明（v4 → v5）

本轮修订基于技术方案审查报告（`a_v4_review_v1.md`）的反馈，解决 1 个问题：第 3.6 节 `index.js` 变更范围声明矛盾。

### 问题修复

**修订 R1：第 3.6 节 `index.js` 变更范围声明矛盾**

问题描述：第 3.6 节"不变的文件"中将 `server/routes/index.js` 列为"不涉及数据库访问，无需修改"，但第 13.2 节和第 16 节明确要求改造 `/health` 端点以调用 `adapter.healthCheck()`（涉及数据库访问），两处存在矛盾。实现者如果仅阅读第 3.6 节（路由层改动范围的核心章节），会遗漏 index.js 的 health 端点改造任务，导致生产环境 health check 无法反映数据库真实状态。

修改内容：
1. 第 3.6 节"不变的文件"描述中移除了 `index.js` 的"无需修改"定性，改为明确标注 `/health` 端点需改造以调用 `adapter.healthCheck()`，并指向第 13.2 节。
2. 第 3.6 节 async 改造清单表格中新增 `index.js` 行，标注 `/health`（GET）handler 需改造为 async 模式以调用 `adapter.healthCheck()`。

### 版本标记更新

- 文档标题从"（v4）"更新为"（v5）"
- 本轮修订标注"v5 修订"标记

---

## 修订说明（v5 → v6）

本轮修订基于第 4 轮诊断报告（`b_v4_diag_v1.md`）的审查反馈及质询确认，共解决全部 10 个问题（2 个严重、5 个一般、3 个轻微），覆盖增量改造工程可行性、脚本互斥关系、方言感知、镜像验证、实现细节精确性、测试策略、停机估算、序列验证、Dify 操作步骤、异常场景保障。

### 一、严重问题修复（2 个）

**修订 R1：Phase 0 增量改造的工程可行性 —— database.js 与路由文件改动顺序矛盾（问题 1）**

在 3.5.2 节新增"Phase 0 过渡策略"子节，包含：
- 核心矛盾分析：database.js 一旦改造完成、`db` 导出消失，所有尚未改造的路由文件无法启动
- 推荐方案：双导出过渡（6 步），按序执行：新建 adapter 文件 → database.js 双导出（`db` + `getAdapter()`）→ sql.js → 逐文件改造路由（每文件改造后自测）→ 全量改造完成后移除旧 `db` 导出 → UTC 转换/全量回归
- 关键设计点：SqliteAdapter 暴露原始 db 实例（`adapter.db`）、步骤 4 混合模式下两个访问路径操作同一 SQLite 文件无冲突
- 备选方案：先建后切（原子提交）
- git 操作建议：分 5 个阶段提交

在第 6 节 Phase 0 步骤描述中明确"严格遵循第 3.5.2 节 Phase 0 过渡策略的 6 步顺序"。

在第 15 节风险表中新增"database.js 与路由文件改动顺序矛盾"风险项。

**修订 R2：Phase 0 UTC 转换脚本与 Phase 2 迁移脚本的时区双重转换冲突（问题 2）**

在第 4.2 节新增"Phase 0 与 Phase 2 脚本互斥关系"子节，包含：
- 核心矛盾：两个脚本均对 datetime 字段减 8 小时，顺序执行导致 16 小时偏移
- 三种方案对比：方案 A（推荐）Phase 2 统一转换、方案 B Phase 0 独立转换 + Phase 2 跳过、方案 C Phase 0 独立转换 + Phase 2 检测跳过
- 推荐方案 A 的理由：无双重转换风险、Phase 2 迁移为唯一时区转换点、避免复杂检测逻辑
- 若采用方案 B/C，需实现的时区检测逻辑及边缘误判风险说明

在第 6 节 Phase 0 描述中修订 UTC 转换策略：推荐 Phase 2 统一处理，Phase 0 不执行独立 UTC 脚本；若团队偏好 Phase 0 全 UTC，详见 4.2 节方案 B/C。

在第 15 节风险表中新增"Phase 0 与 Phase 2 时区双重转换冲突"风险项。

### 二、一般问题修复（5 个）

**修订 R3：sql.js 方言辅助函数的数据库类型感知机制（问题 3）**

在第 4.2 节新增"方言感知机制"子节，包含：
- 推荐实现：模块级 `currentDialect` 变量 + `setDialect(dialect)` + `getDialect()` 函数
- 初始化时机：`database.js` 的 `initDatabase()` 在实例化 adapter 后调用 `sql.setDialect(dbType)`
- 防御性检查：`getDialect()` 在方言未初始化时抛出明确错误（fail-fast）
- 设计理由：避免每次函数调用时读取环境变量（性能）、模块级私有变量防止外部修改

在第 15 节风险表中新增"sql.js 方言感知机制缺失"风险项。

**修订 R4：KingbaseES Docker 镜像可用性未验证（问题 4）**

在第 5.1 节 CI 配置示例中将镜像标注为"待验证假设"，并新增"KingbaseES Docker 镜像可用性说明"子节，包含：
- 验证渠道建议
- 替代方案 A（直接安装 RPM/DEB 包）
- 替代方案 B（使用已有测试实例）
- 最低保障（SQLite CI 全部通过 + KingbaseES 手动验证）

在第 6 节 Phase 1 部署步骤中标注"镜像名称待验证"并指向 5.1 节说明。

在第 15 节风险表中新增"KingbaseES Docker 镜像不可用风险"风险项。

**修订 R5：SqliteAdapter 同步异常转 Promise rejection 的实现策略文字修正（问题 5）**

在第 3.3 节 SqliteAdapter 实现要点中，将原"对外包裹 `Promise.resolve()` 即可"改为正确的描述：SqliteAdapter 的 `query()`、`queryOne()`、`execute()` 等方法声明为 `async` 函数，利用 `async` 函数体自动将 better-sqlite3 的同步异常转换为 rejected Promise，与 KingbaseAdapter 的 async 方法在错误处理模型上完全一致。

在第 15 节风险表中新增"SqliteAdapter 同步异常转 Promise rejection 文字误导"风险项。

**修订 R6：端到端测试策略缺失具体定义（问题 6）**

在第 5.1 节新增"5.1.1 Phase 0/Phase 1 手工回归测试策略"子节，包含：
- 明确当前项目 `package.json` 无 `"test"` 脚本的现状
- Phase 0 手工回归测试清单：18 个 API 端点，逐端点的测试编号、API 路径、HTTP 方法、测试场景、验证点
- 核心流程 E2E 测试：3 个端到端流程（用户完整流程、管理员流程、文章浏览流程），含涉及端点
- Phase 1 双库对比测试要求
- CI 配置调整：`npm test` 替换为 `scripts/ci-smoke-test.sh` 冒烟验证脚本（含具体 curl 命令）

在第 6 节 Phase 0 验收标准中新增第 8、9 条（回归测试清单和 E2E 流程全部通过）。

在第 16 节文件变更清单中新增 `scripts/ci-smoke-test.sh` 文件。

在第 15 节风险表中新增"端到端测试策略缺失"风险项。

**修订 R7：Phase 2 数据迁移的停机时间估算缺失（问题 7）**

在第 12 节新增"12.2 停机时间估算"子节，包含：
- 停机时间四阶段分解：备份（1-2 分钟）、数据迁移（与数据量正比）、验证（2-5 分钟）、切换（1-2 分钟）
- 总停机时间公式：`T_total ≈ 4-9 分钟 + T_migrate`
- 数据量相关参考值表（4 个规模级别：<1k/1k-10k/10k-100k/>100k 行）
- 降低停机措施：dry-run 预演实测、批量写入优化、并行迁移远期讨论
- 推荐做法：Phase 1 dry-run 实测 → Phase 2 维护窗口 = 实测耗时 × 1.5

在第 13.3 节运维维度中更新"停机时间"条目，指向第 12.2 节。

在第 15 节风险表中新增"Phase 2 数据迁移停机时间未估算"风险项。

### 三、轻微问题修复（3 个）

**修订 R8：迁移脚本中 SERIAL 序列名称的隐含假设未验证（问题 8）**

在第 12 节第 6 条"SERIAL 序列重置"中补充：
- 推荐使用 `pg_get_serial_sequence('table_name', 'column_name')` 动态获取序列名称，替换硬编码的 `users_id_seq` 等假设
- 给出全部 10 张表的动态获取 SQL 示例
- 序列名称验证：dry-run 阶段记录 `pg_get_serial_sequence()` 返回值，检查是否为 NULL

在第 15 节风险表中新增"迁移脚本 SERIAL 序列名称硬编码"风险项。

**修订 R9：Dify 工作流 prompt 修改的具体操作步骤不完整（问题 9）**

在第 9.2 节"Dify 端同步变更"子节中补充：
- `db_type` 变量传递方式：在 `server/services/difyService.js` 的 `callWorkflowBlocking()` 中增加 `inputs.db_type` 参数
- Dify 管理后台修改位置：具体操作路径（编排页面 → 系统提示词区域）
- 变更范围明确：仅限 admin chat 工作流
- 完整 prompt 片段示例（含 Jinja2 条件判断和全部 12 个 tool_name 列表）

在第 16 节文件变更清单中新增 `server/services/difyService.js` 条目（`inputs.db_type` 参数传递改造）。

在第 15 节风险表中新增"Dify 工作流 prompt 修改操作步骤不完整"风险项。

**修订 R10：缺少异常场景下的数据一致性保障策略（问题 10）**

在第 12 节新增"12.3 迁移异常处理策略"子节，包含：
- 逐表迁移 + 即时验证 + 断点续传策略（5 步操作 + 失败处理）
- 断点续传支持：读取 `migration_progress.json`、跳过已完成表、清除残留数据后重新写入
- 迁移失败后目标库状态清理流程
- 迁移日志要求（结构化 JSON 日志）

在第 12 节新增"12.4 回退决策触发条件"子节，包含：
- 立即回退触发条件（4 条：关键查询错误、连接池泄漏、数据丢失、超时率超标）
- 评估性回退触发条件（3 条：性能退化、偶发连接错误、时区问题）
- 回退后数据丢失问题的 3 种缓解措施（双写讨论、日志补偿、维护窗口策略）

在第 15 节风险表中新增"迁移异常场景数据一致性保障缺失"风险项。

### 四、配套更新

- 第 3.6 节增加 Phase 0 过渡策略的引用
- 第 3.5 节 database.js 改造轮廓中补充 `sql.setDialect(dbType)` 调用
- 第 6 节 Phase 0 修订 UTC 转换策略和验收标准
- 第 13.3 节运维维度更新停机时间引用
- 第 15 节风险表新增 10 个风险项（v6 新增）
- 第 16 节文件变更清单新增 `difyService.js`（改造）、`scripts/ci-smoke-test.sh`（新建）

### 五、版本标记更新

- 文档标题从"（v5）"更新为"（v6）"
- 所有新增内容标注"v6 新增"或"v6 补充/修订"标记

---

## 修订说明（v6 → v7）

本轮修订基于第 5 轮诊断报告（`a_v6_iteration_requirement.md`）的审查反馈，共解决全部 8 个问题（2 个一般、6 个轻微），并处理 2 个持续性问题。覆盖日期参数格式化兼容性、Phase 0 混合时间戳影响评估、insertId 调用约定澄清、文件清单一致性、JSONB DDL 翻译细节、date(column) 兼容性确认、连接瞬断重试策略、health check 异常响应格式。

### 一、一般问题修复（2 个）

**修订 R1：punch.js 日期参数 JS 侧格式化方案与数据库存储格式不兼容（问题 1）**

此问题为持续性问题（Round 5 → Round 6），需重点解决。

在第 4.2 节方言统一策略中：
- 从方言辅助函数表中移除 `sql.insertId()` 行（其输出描述与 adapter 内部处理矛盾）
- 新增 `sql.formatDateParam(jsDate)` 行：将 JS Date 对象格式化为与 `CURRENT_TIMESTAMP` 输出一致的 `YYYY-MM-DD HH:MM:SS` 字符串
- 将日期范围查询示例中的 `.toISOString()` 替换为 `sql.formatDateParam(new Date(...))`
- 新增"`.toISOString()` 不兼容说明"段落：详细解释 ISO 8601 格式（含 `T` 分隔符和 `Z` 后缀）与 `CURRENT_TIMESTAMP` 输出格式在字符串比较时产生错误结果的原因
- 给出 `sql.formatDateParam()` 的 5 行实现逻辑概要

**修订 R2：Phase 0 混合时间戳状态的开发期实际影响评估不足（问题 2）**

此问题为持续性问题（Round 2 → Round 5 → Round 6），严重程度已从"严重"降为"一般"，焦点从架构缺陷转移至量化评估。

在第 4.2 节"Phase 0 与 Phase 2 脚本互斥关系"后新增"Phase 0 混合时间戳状态开发期实际影响评估"子节，包含：
- 4 维度影响量化评估表（punch.js 7 天打卡查询、前端时间展示、Dify AI 工作流、开发自测体验），每维度标注严重程度和 Phase 0 可接受性判断
- 开发期临时缓解措施：(1) `sql.setDevMode(true)` 开关（可选，保持本地时间行为）；(2) Phase 0 验收标准补充声明——时间范围查询精确性在 Phase 0 期间不做严格要求

### 二、轻微问题修复（6 个）

**修订 R3：`sql.insertId()` 辅助函数存在但无调用约定（问题 3）**

在第 3.6 节路由层改动范围中：
- 新增"INSERT 操作的返回值和 ID 获取"段落，明确 `adapter.execute()` 返回 `{ lastInsertId, changes }`，ID 直接从 `result.lastInsertId` 获取
- 给出改造前后代码模式对比（`info.lastInsertRowid` → `result.lastInsertId`）
- 明确声明"方言辅助函数表中不包含 `sql.insertId()`——ID 获取是 adapter 层的职责"

在第 4.2 节中已从方言辅助函数表移除 `sql.insertId()` 行（与 R1 合并处理）。

**修订 R4：`scripts/phase0_utc_convert.sql` 文件创建与执行策略不一致（问题 4）**

在第 16 节文件变更清单中：
- 将 `scripts/phase0_utc_convert.sql` 的操作从"新建"改为"可选新建"
- 在说明中增加注释：备选工具，仅在采用方案 B/C（Phase 0 独立 UTC 转换）时使用；采用方案 A（推荐）时不创建/执行此文件

**修订 R5：`init_kingbase.sql` 中 JSONB 列的具体 DDL 翻译未给出（问题 5）**

在第 10.2 节对齐策略中：
- 在翻译规则表中新增 `TEXT（存储 JSON 字符串）→ JSONB` 行，列出 6 个 JSON 文本列
- 新增"JSONB 列默认值策略"子节：SQLite 中 `DEFAULT ''` 需在 KingbaseES JSONB 中改为 `DEFAULT NULL`（JSONB 不接受空字符串），应用层需做好 NULL 值防御
- 新增"GIN 索引 DDL 示例"子节：给出 `user_risk_info.result` 和 `admin_logs.operation_content` 的 GIN 索引 DDL，及 `jsonb_path_ops` 优化建议

**修订 R6：`date()` 列提取函数的跨数据库兼容性未确认（问题 6）**

在第 4.1 节差异清单中：
- 新增"日期列提取（GROUP BY）"行，标注 `date(punch_time)` 在两个数据库中均兼容，无需方言函数包装
- 在补充说明中新增 v7 补充段落，明确 punch.js 第 121、126 行的 `date(punch_time)` 不在改造范围内

在第 3.6 节 punch.js 改动说明中标注 `date(punch_time)` 无需改造。

**修订 R7：缺少 KingbaseES 运行时连接瞬断的自动重试策略（问题 7）**

在第 15 节风险表中：
- 新增风险项"KingbaseES 运行时连接瞬断无自动重试"，明确 Phase 0/1 暂不实现（理由：`pg.Pool` 内置连接池管理、瞬时错误低概率、通用重试需处理幂等性），Phase 2+ 可选增强

在第 13.2 节监控维度表中：
- 新增"错误重试"条目，标注为 Phase 2+ 可选增强项，指向 15 节风险表

**修订 R8：health check 端点改造未指定数据库不健康时的 HTTP 响应格式（问题 8）**

在第 13.2 节健康检查实现中：
- 新增"健康检查 HTTP 响应格式"子节，明确健康时 HTTP 200 + `{ status: "ok", database: "connected" }`，不健康时 HTTP 503 + `{ status: "error", database: "disconnected", message: "数据库连接异常" }`
- 解释选择 503 而非 200 的理由（负载均衡器假阳性问题）
- 添加可选扩展说明（连接池指标字段）

### 三、配套更新

- 第 4.2 节方言辅助函数表：移除 `sql.insertId()`，新增 `sql.formatDateParam(jsDate)`
- 第 3.6 节路由层改动：新增 INSERT 操作返回值和 ID 获取说明；punch.js 条目标注 `date(punch_time)` 无需改造
- 第 4.1 节差异清单：新增 `date(column)` 列提取行
- 第 10.2 节翻译规则：新增 `TEXT → JSONB` 行 + JSONB 默认值策略 + GIN 索引 DDL
- 第 13.2 节监控维度：新增"错误重试"条目；新增健康检查 HTTP 响应格式
- 第 15 节风险表：新增"KingbaseES 运行时连接瞬断无自动重试"风险项
- 第 16 节文件变更清单：`phase0_utc_convert.sql` 从"新建"改为"可选新建"并标注适用场景

### 四、版本标记更新

- 文档标题从"（v6）"更新为"（v7）"
- 所有新增内容标注"v7 新增"或"v7 补充"标记

---

## 修订说明（v7 → v8）

本轮修订基于第 6 轮审查报告（`a_v6_review_v1.md`）的审查反馈，共解决 1 个一般问题。

### 一、一般问题修复（1 个）

**修订 R1：`sql.formatDateParam()` 实现逻辑描述使用本地时间方法，与 UTC 存储决策存在时区不一致（审查报告第 4.2 节）**

此问题影响 `punch.js` 打卡查询等所有使用日期参数比较的功能的正确性。若实现者严格按原文档描述使用本地时间方法（`getHours()` 等）编码，在 UTC+8 时区下格式化输出的字符串比数据库存储的 `CURRENT_TIMESTAMP` 值大 8 小时，导致日期范围查询边界错误。

在第 4.2 节 `sql.formatDateParam()` 实现逻辑描述中：
- 将实现方法从本地时间方法（`getFullYear()`、`getMonth()`、`getDate()`、`getHours()`、`getMinutes()`、`getSeconds()`）改为 **UTC 方法**（`getUTCFullYear()`、`getUTCMonth()`、`getUTCDate()`、`getUTCHours()`、`getUTCMinutes()`、`getUTCSeconds()`）
- 增加"必须使用 UTC 方法而非本地时间方法"的明确约束说明，解释使用本地时间方法在 UTC+8 时区下导致日期范围查询边界错误的具体机制
- 将"且避免了时区歧义"修正为"统一输出 UTC 格式字符串，消除本地时区依赖"，准确反映实际行为

### 二、版本标记更新

- 文档标题从"（v7）"更新为"（v8）"

---

## 修订说明（v8 → v9）

本轮修订基于第 6 轮组件 B 诊断报告（`b_v6_diag_v2.md`）的审查反馈，共解决 4 个问题（2 个严重、1 个一般、1 个轻微），并彻底解决了 /health 端点相关矛盾这一持续性问题。

### 一、严重问题修复（2 个）

**修订 R1：`proxyDifySSE` 硬编码 `inputs: {}` 阻断 admin chat 的 `db_type` 变量传递（问题 1）**

此问题为全新发现——前 6 轮均未触及 SSE 代理路径。`server/services/sseProxy.js` 第 26 行硬编码 `inputs: {}`，且 `admin.js` 的 `/chat` 路由调用 `proxyDifySSE` 时不传入 inputs 参数，导致 Dify admin chat 工作流永远接收不到 `db_type` 变量，Jinja2 条件判断永不生效。方案设计的 Dify 端同步变更策略对 admin chat 路径（SSE 流式路由）完全无效。

在第 9.2 节新增"`proxyDifySSE` SSE 代理的 `inputs` 参数传递"子节，包含：
- `proxyDifySSE` 函数签名扩展 `inputs` 参数，替换硬编码 `inputs: {}`
- `admin.js` 的 `/chat` 路由调用时传入 `{ db_type: process.env.DB_TYPE || 'sqlite' }`
- 排查其他 `proxyDifySSE` 调用处（`assistant.js`、`chat.js`）的指导
- 第 16 节文件变更清单新增 `sseProxy.js`（改造）、更新 `admin.js` 的 `/chat` 路由说明
- 第 15 节风险表新增对应风险项

**修订 R2：`FOR UPDATE` 行级锁方案对"首次方案生成"场景失效（问题 2）**

此问题为全新发现——前 6 轮对 FOR UPDATE 的讨论均假定用户已有方案记录。在用户首次生成方案时，`life_plans` 表中无该用户的任何行：事务内先执行的 `UPDATE ... SET is_active = 0` 影响零行（不获取行级锁），后续 `FOR UPDATE` 的 WHERE 条件匹配零行（空结果集在 READ COMMITTED 下不获取任何行级锁），两个并发请求均可成功 INSERT 相同 plan_id。

在第 8.5 节新增"`FOR UPDATE` 首次方案生成场景的边缘问题"子节，包含：
- 完整竞态场景分析（两并发请求的逐步执行轨迹）
- 推荐解决方案：在 `life_plans` 表上增加 `UNIQUE(user_id, plan_id)` 约束（数据库层最后防线）
- 备选方案：PostgreSQL advisory lock（仅 KingbaseES 有效，增加 adapter 接口差异）
- `/adjust` 操作不触发此问题的说明（调整前提是已存在方案）
- `init.sql` 和 `init_kingbase.sql` 的同步 DDL 变更（普通索引升格为 UNIQUE 索引）
- 在第 10.1 节差异分析表中新增 `life_plans` UNIQUE 约束行
- 在第 16 节文件变更清单中新增 `init.sql`（改造）条目，更新 `init_kingbase.sql` 条目
- 在第 15 节风险表中新增对应风险项

### 二、一般问题修复（1 个）

**修订 R3：Health 端点响应格式变更与"前端代码零变动"声明矛盾（问题 3 + 持续性问题）**

此问题为持续性问题——第 2 轮问题 3 指出 `/health` 端点改造与文件变更清单矛盾，本轮问题 3 进一步发现响应格式变更与"前端零变动"声明矛盾。该端点从"是否纳入范围"的边界问题演变为"纳入后兼容性不足"的实现问题，需在本次迭代中彻底解决。

在第 13.2 节健康检查 HTTP 响应格式中明确：改造后在原有 `success`/`message` 字段基础上新增 `status`/`database` 字段（向后兼容，不删除旧字段）。`success` 与 `status` 保持语义一致，`message` 在不健康时提供人类可读描述。

在第 14 节前端确认中新增"已知例外"段落，明确标注 `/health` 端点新增字段为已知例外，同时说明向后兼容性不受影响（负载均衡器和监控脚本若仅依赖 `success` 字段，兼容性不受影响）。

### 三、轻微问题修复（1 个）

**修订 R4：`punch.js` handler 数量统计不准确（问题 4）**

此问题为全新发现——前 6 轮均未核实 handler 实际数量。在第 3.6 节 async 改造清单中，将 punch.js 的描述从"全部 4 个 handler（GET/POST）"修正为"全部 3 个 handler（1 POST + 2 GET）"，消除计数偏差和方法分布歧义。

### 四、配套更新

- 第 8.5 节：新增 FOR UPDATE 首次生成场景边缘问题子节（含 UNIQUE 约束方案）
- 第 9.2 节：新增 proxyDifySSE inputs 参数传递子节
- 第 10.1 节差异分析表：新增 `life_plans` UNIQUE 约束行；更新"全部表 | 索引缺失"行（UNIQUE INDEX 计数更新）
- 第 13.2 节健康检查响应格式：补充向后兼容性说明（v9 新增）
- 第 14 节前端确认：新增"/health 端点已知例外"段落
- 第 15 节风险表：新增 2 个风险项（`proxyDifySSE` 阻断 `db_type` 传递、`FOR UPDATE` 首次生成场景失效）
- 第 16 节文件变更清单：新增 `init.sql`（改造）条目；更新 `init_kingbase.sql`（补充 UNIQUE 索引说明）、`sseProxy.js`（改造）、`admin.js`（补充 `/chat` inputs 传递）

### 五、版本标记更新

- 文档标题从"（v8）"更新为"（v9）"
- 所有新增内容标注"v9 新增"标记，便于审阅者定位本轮变更
