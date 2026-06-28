# 引入国产金仓数据库 KingbaseES —— 技术方案（v4）

## 1. 总体方案概览

**核心决策**：构建一个轻量级数据库适配层（`DatabaseAdapter`），同时支撑 SQLite 和 KingbaseES 两种后端，路由层通过适配层访问数据库而非直接依赖具体驱动。

```
┌─────────────────────────────────────────────┐
│  routes/ (auth, user, risk, plan, punch,   │
│           articles, admin, assistant, ...)  │
├─────────────────────────────────────────────┤
│  server/db/sql.js   (方言辅助函数)          │
├─────────────────────────────────────────────┤
│  server/db/adapter.js                       │
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

### 3.1 适配层接口定义

新增文件 `server/db/adapter.js`，导出 `DatabaseAdapter` 抽象和两个具体实现。

```typescript
// 接口轮廓（决策层，非最终代码）
class DatabaseAdapter {
  async query(sql, params)      → rows: Array<object>
  async queryOne(sql, params)   → row: object | null
  async execute(sql, params)    → { lastInsertId: number, changes: number }
  async transaction(fn)         → fn(db) 的返回值（自动 commit/rollback）
  async tableInfo(tableName)    → Array<{ cid, name, type, notnull, dflt_value, pk }>
  async healthCheck()           → boolean
  async close()                 → void
}
```

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
    WHERE tc.table_name = ? AND tc.constraint_type = 'PRIMARY KEY'
  ) THEN 1 ELSE 0 END AS pk
FROM information_schema.columns
WHERE table_name = ?
ORDER BY ordinal_position
```

### 3.2 SqliteAdapter 实现要点

- 基于现有 `better-sqlite3`，但封装为 Promise 接口
- 内部 `better-sqlite3` 是同步的，对外包裹 `Promise.resolve()` 即可
- `execute()` 利用 `stmt.run()` 返回的 `{ lastInsertRowid, changes }` 映射到 `{ lastInsertId, changes }`
- `transaction()` 利用 `better-sqlite3` 原生事务支持，包裹为 async 返回
- `tableInfo()` 直接调用 `db.prepare('PRAGMA table_info(?)').all(tableName)`

### 3.3 KingbaseAdapter 实现要点

- 基于 `pg.Pool`
- `query()` / `queryOne()` / `execute()` 调用 `pool.query()`
- **参数占位符转换（重要）**：`pg`（node-postgres）仅支持 `$1, $2, ...` 格式的参数占位符，而当前项目全部使用 `?` 占位符。为保持路由层最小改动（继续使用 `?` 风格），KingbaseAdapter 的 `query()`、`queryOne()`、`execute()` 等方法必须在将 SQL 传递给 `pool.query()` 之前，将 SQL 中的 `?` 占位符转换为 `$1, $2, ...` 格式。转换策略：
  - 在适配层内部（如 `_convertPlaceholders(sql)` 私有方法），使用简单状态机扫描 SQL 字符串：维护计数器 `n = 1`，遍历 SQL 字符，当遇到 `?` 时替换为 `$n` 并将 `n` 递增
  - 状态机需跳过单引号字符串字面量内的 `?`（这些是 SQL 文本内容，不是参数占位符）。具体：维护 `inString` 布尔标志，遇到 `'` 时翻转（需要处理转义单引号 `''` 的情况，连续两个单引号不翻转状态）
  - **SQL 注释处理说明**：状态机无需处理 SQL 注释（`--`、`/* */`）。原因：路由层运行时的 SQL 语句不包含注释——注释仅出现在 DDL 初始化脚本（`init.sql`/`init_kingbase.sql`）中，而这些脚本通过独立的 `init()` 多语句执行流程处理（其分号分割步骤已包含注释移除逻辑，见 3.3 节 init 方法第 4 步）。路由层动态 SQL 中不存在注释内的 `?` 被误转换的风险。
  - 简单场景（本项目 SQL 中无嵌套引号或多行字符串）可用正则实现，但状态机更可靠且实现成本低（约 20 行代码）
  - 转换后的 SQL 携带 `$1, $2, ...` 占位符后，原 params 数组直接传给 `pool.query()`，无需调整顺序（`?` 的出现顺序与 `$N` 的编号顺序一致）
  - 备选方案：改用 `pg` 的 `$1` 风格直接修改所有路由层 SQL，但这会增加路由层改动量（约 50+ 处 SQL 语句），与"路由层最小改动"原则冲突。当前方案推荐转换方案
- `execute()` 的 INSERT ID 获取策略：
  - 利用项目已有依赖 `node-sql-parser`（v5.4.0，package.json 已安装）解析 SQL AST
  - 判断 SQL 是否为 INSERT 语句（检查 AST type 是否为 `insert`）
  - 若为 INSERT 且原始 SQL 中不含 `RETURNING` 子句，则在 SQL 末尾自动追加 ` RETURNING id`
  - `node-sql-parser` 支持 PostgreSQL 方言解析，可准确处理子查询中的 INSERT、ON CONFLICT 等复杂场景，比正则匹配更可靠
  - 解析失败时（例如极特殊的 SQL 语法），回退到正则匹配 `/^\s*INSERT\s+/i.test(sql)` 检测，并追加 `RETURNING id`
- `transaction()` 从 pool 获取一个 client，执行 `BEGIN` → fn(client) → `COMMIT`/`ROLLBACK` → `client.release()`
- `tableInfo()` 查询 `information_schema.columns` 并映射到 PRAGMA 统一格式（见 3.1 节 SQL）
- **`init()` 方法（多语句 SQL 脚本执行）**：
  - `pg.Pool.query()` 单次只执行一条 SQL 语句，不支持 `db.exec()` 式的多语句批量执行
  - KingbaseAdapter.init() 的执行策略：
    1. 使用 `fs.readFileSync` 读取 `init_kingbase.sql` 文件内容
    2. 使用 `bcryptjs`（项目已依赖）运行时生成 `admin123` 的 bcrypt 哈希，替换 SQL 文本中的占位符 `__BCRYPT_HASH_PLACEHOLDER__`（保持与 SQLite 种子数据相同的动态密码机制）
    3. 按 `;` 分割 SQL 文本为独立语句
    4. **分号分割注意事项**：需处理字符串字面量和注释中的分号。推荐策略：先移除单行注释（`--` 开头行）和多行注释（`/* ... */`），再用简单状态机跳过单引号字符串内的分号后分割
    5. 过滤空语句（纯空白行、仅含注释的行）
    6. 在一个事务内（`BEGIN` → 逐条执行 → `COMMIT`）顺序执行所有语句
    7. 执行前先检查 `users` 表是否存在数据，避免重复初始化（与 SQLite 的幂等逻辑一致）
  - 备选方案（如分割复杂度在实现中过高）：将 `init_kingbase.sql` 拆分为 `init_kingbase_ddl.sql`（DDL）和 `init_kingbase_seed.sql`（种子数据）两个文件，每个文件内语句更简单，降低分割风险。当前推荐方案 (a) 分号分割，因为文件已经存在且结构清晰。

### 3.4 database.js 改造

现有 `server/db/database.js` 改造为：

```javascript
// 改造后轮廓
const { SqliteAdapter } = require('./adapter/sqlite');
const { KingbaseAdapter } = require('./adapter/kingbase');

let adapter;

function initDatabase() {
  const dbType = process.env.DB_TYPE || 'sqlite';
  if (dbType === 'kingbase') {
    adapter = new KingbaseAdapter({ /* pool config */ });
  } else {
    adapter = new SqliteAdapter({ dbPath: process.env.DB_PATH });
  }
  return adapter.init(); // 执行建表/种子数据
}

module.exports = { getAdapter: () => adapter, initDatabase };
```

### 3.5 路由层改动范围

所有路由文件（约 13 个文件，其中 11 个涉及数据库访问）的改动模式一致：将 `db.prepare(sql).run/get/all()` 替换为 `adapter.query/queryOne/execute()`。

**改动前**（同步）：
```javascript
const user = db.prepare('SELECT ... WHERE id = ?').get(userId);
```

**改动后**（async/await）：
```javascript
const user = await adapter.queryOne('SELECT ... WHERE id = ?', [userId]);
```

**受影响的文件清单**（按改动量）：

| 文件 | 预估 DB 调用数 | 特殊改动点 |
|------|-------------|----------|
| `server/routes/admin.js` | 20+ | 含 `db.transaction()` 事务、`info.lastInsertRowid` 取值、`PRAGMA table_info` → `adapter.tableInfo()` |
| `server/routes/plan.js` | 12+ | 含 2 个 `db.transaction()` 事务、`datetime()` |
| `server/routes/punch.js` | 8+ | 含 `SELECT last_insert_rowid()` 调用、`datetime()` 带日期运算 |
| `server/routes/risk.js` | 6+ | 含 `json_extract()` SQL 函数、`info.lastInsertRowid` |
| `server/routes/articles.js` | 10+ | 含 `result.lastInsertRowid`、`datetime()` |
| `server/routes/auth.js` | 4 | 含 `result.lastInsertRowid` |
| `server/routes/user.js` | 6 | 含 `datetime()` |
| `server/routes/assistant.js` | 2 | 无特殊语法 |
| `server/routes/doctors.js` | 3 | 无特殊语法 |
| `server/routes/diabetes.js` | 2 | 无特殊语法 |
| `server/routes/chat.js` | 2 | 无特殊语法 |

**不变的文件**：`server/routes/upload.js` 和 `server/routes/index.js` 不涉及数据库访问，无需修改。

---

## 4. SQL 方言差异处理

### 4.1 差异清单

| SQL 特性 | SQLite 写法 | PostgreSQL/KingbaseES 写法 | 出现位置 |
|---------|-----------|--------------------------|---------|
| 当前时间戳 | `datetime('now','localtime')` | `NOW()` 或 `CURRENT_TIMESTAMP` | articles.js, plan.js, user.js, punch.js |
| 日期运算 | `datetime('now','localtime','-7 days')` | `CURRENT_TIMESTAMP - INTERVAL '7 days'` | punch.js:125 |
| JSON 字段提取 | `json_extract(col, '$.path')` | `col::jsonb->>'path'` | risk.js |
| 获取最后插入ID | `SELECT last_insert_rowid()` | `RETURNING id` | punch.js |
| 自增主键 | `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` | init.sql |
| 布尔值 | `INTEGER CHECK(... IN (0,1))` | `BOOLEAN` | init.sql |
| PRAGMA 查询 | `PRAGMA table_info(tbl)` | `information_schema.columns` | admin.js |

### 4.2 方言统一策略

**决策**：编写 `server/db/sql.js` 方言辅助模块，路由层统一调用辅助函数，由适配层根据实际后端生成对应 SQL。

关键辅助函数：

| 函数 | 用途 | SQLite 输出 | KingbaseES 输出 |
|------|------|------------|----------------|
| `sql.now()` | 当前时间戳 | `CURRENT_TIMESTAMP` | `CURRENT_TIMESTAMP` |
| `sql.jsonField(col, path)` | JSON 字段提取 | `json_extract(${col}, '$.${path}')` | `${col}::jsonb->>'${path}'` |
| `sql.jsonFieldAs(col, path, type)` | 带类型转换的 JSON 提取 | `CAST(json_extract(...) AS ${type})` | `(${col}::jsonb->>'${path}')::${type}` |
| `sql.insertId()` | INSERT 后获取 ID | 由 `adapter.execute()` 内部处理 | 由 `adapter.execute()` 内部 `RETURNING id` |
| `sql.relativeDate(days)` | 相对日期偏移 | `datetime('now', 'localtime', '${days} days')` | `CURRENT_TIMESTAMP + INTERVAL '${days} days'` |

**`sql.relativeDate(days)` 说明**：
- 用途：替代 `datetime('now', 'localtime', '-7 days')` 这类带日期运算的 SQL 表达式（出现在 `punch.js:125`）
- `days` 为正数表示未来日期，负数为过去日期
- 使用示例：`sql.relativeDate(-7)` 在 SQLite 端输出 `datetime('now', 'localtime', '-7 days')`，在 KingbaseES 端输出 `CURRENT_TIMESTAMP + INTERVAL '-7 days'`

**推荐替代方案（更简单）**：对于简单的日期范围查询，推荐在路由层用 JavaScript 计算日期后作为参数传入 SQL。例如 `punch.js:125` 可改为：
```javascript
const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
// 然后作为参数传入：WHERE user_id = ? AND punch_time >= ?
```
这种方式无需方言函数，两个数据库行为完全一致，且避免了时区歧义。如果选择此方案，`sql.relativeDate()` 可以省略。

**关键简化决策**：`sql.now()` 统一输出 `CURRENT_TIMESTAMP`，SQLite 3.38+ 和 KingbaseES 均支持该函数。这意味着路由层只需把 `datetime('now','localtime')` 替换为 `sql.now()` 即可。对于 DDL 中的 `DEFAULT (datetime('now','localtime'))`，改为 `DEFAULT CURRENT_TIMESTAMP`。

**风险点**：`CURRENT_TIMESTAMP` 在 SQLite 返回 UTC，而 `datetime('now','localtime')` 返回本地时间。需要在适配层初始化时显式设置 timezone 或应用层统一使用 UTC 存储（推荐方案，更规范）。

**Timestamp 时区决策**：统一使用 UTC 存储，展示层（前端）负责时区转换。这消除了 SQLite 和 KingbaseES 之间的时区语义差异。

### 4.3 DDL 层面差异

DDL 通过两套独立的初始化脚本管理，不在应用 SQL 中处理：
- `server/db/init.sql` — SQLite DDL（保持现有）
- `server/db/init_kingbase.sql` — KingbaseES DDL（需对齐，见第 9 节）

---

## 5. 双数据库支持策略

**决策**：开发/测试环境使用 SQLite，生产环境使用 KingbaseES，通过环境变量切换。

**理由**：
1. SQLite 零配置、零依赖，适合本地开发和 CI 测试
2. 开发阶段不需要部署 KingbaseES 服务，降低环境搭建成本
3. 同一套应用代码，两个数据库后端，确保代码的可移植性
4. 可以在 CI 中对两个后端各跑一遍测试，验证兼容性

**切换机制**：

```
.env 配置:
  DB_TYPE=sqlite              # sqlite | kingbase
  DB_PATH=./data/database.sqlite  # SQLite 时使用
  DATABASE_URL=postgresql://user:pass@host:5432/dbname  # KingbaseES 时使用
```

适配层在 `initDatabase()` 阶段读取 `DB_TYPE` 并实例化对应 adapter。所有路由层通过 `getAdapter()` 获取当前 adapter，不感知底层是哪个数据库。

---

## 6. 渐进式迁移路径

### Phase 0：适配层构建 + SQLite 验证（不影响现有功能）

- 新建 `server/db/adapter/` 目录，实现 `SqliteAdapter`
- 新建 `server/db/sql.js` 方言辅助模块
- 改造 `server/db/database.js`，导出 adapter 实例
- 逐文件改造路由层，每个文件改造后自测验证
- **验收标准**：所有现有功能在 SQLite 下行为不变，无回归

### Phase 1：KingbaseES 适配层 + 双库并行验证

- 实现 `KingbaseAdapter`（含 `init()` 的多语句 SQL 执行、密码哈希占位符替换机制、以及 `?` → `$1` 参数占位符转换）
- 对齐 `init_kingbase.sql` 与 `init.sql` 的 schema 差异（见第 9 节），并将硬编码的 bcrypt 哈希替换为 `__BCRYPT_HASH_PLACEHOLDER__` 占位符
- 本地或测试环境部署 KingbaseES 实例
- 切换 `DB_TYPE=kingbase`，跑完整功能回归测试
- **验收标准**：所有功能在 KingbaseES 下行为与 SQLite 一致

### Phase 2：生产环境灰度切换

- 生产环境部署 KingbaseES，执行 `init_kingbase.sql` 初始化
- 从 SQLite 导出数据迁移到 KingbaseES（编写一次性数据迁移脚本，含时区转换，见第 11 节）
- 通过 `DB_TYPE=kingbase` 切换生产环境数据库
- 保留 SQLite 数据库文件和代码支持作为回退方案
- **验收标准**：生产环境稳定运行 >= 1 周，无数据库相关故障

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
  max, min, idleTimeoutMillis, connectionTimeoutMillis
});
```

**方式三（连接后 SET）**：不推荐。每次从 pool 获取连接后执行 `SET statement_timeout = 30000` 增加额外网络往返，且在 `pg.Pool` 的连接生命周期管理中难以保证每个新连接都被正确设置。

**推荐方式一**：连接字符串携带 `options` 参数最简单，所有通过该连接字符串建立的连接自动继承 `statement_timeout` 设置，无需额外代码。

**环境变量设计**：

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

---

## 9. init_kingbase.sql 与 init.sql 对齐方案

### 9.1 当前差异分析

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
| user_risk_info | 缺失字段 | 有 `diabetes_history`, `diabetes_type` | 无，但有 `disease_type` | 补充2个字段 |
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

### 9.2 对齐策略

**决策**：以 `init.sql`（SQLite 生产环境已验证的 schema）为基准，重写 `init_kingbase.sql`，仅将 SQLite 特有语法翻译为 PostgreSQL 兼容语法，不修改业务语义。

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

**种子数据对齐**：`seed.sql` 中的种子数据同步到 `init_kingbase.sql`，确保两套数据库初始化后状态一致。当前 `init_kingbase.sql` 中的种子数据（管理员、医生、文章）与 `seed.sql` 内容不同（不同医生姓名、不同文章内容），需统一为 `seed.sql` 的数据。

**种子数据密码哈希处理**：
- SQLite 的 `seed.sql` 使用 `$2a$10$PLACEHOLDER_BCRYPT_HASH_GOES_HERE` 占位符，由 `database.js` 在运行时用 `bcryptjs` 实时生成 `admin123` 的哈希替换
- 当前 `init_kingbase.sql` 中硬编码了一个固定的 bcrypt 哈希值（`$2b$10$/4lVVaDbYlfHAZAJrkELX...`），这失去了灵活性
- **决策**：`init_kingbase.sql` 中的管理员密码同样使用占位符 `__BCRYPT_HASH_PLACEHOLDER__`，由 `KingbaseAdapter.init()` 在运行时用 `bcryptjs`（项目已依赖）生成哈希并替换。这与 SQLite 种子机制保持一致，方便更换默认密码（只需修改一处 `admin123` 字面量）
- 注意：占位符使用 `__BCRYPT_HASH_PLACEHOLDER__` 而非 `$2a$10$...` 格式，避免被误认为有效的 bcrypt 哈希

---

## 10. 环境配置设计

### 10.1 .env 文件新增字段

```bash
# ========== 数据库类型切换 ==========
DB_TYPE=sqlite                           # sqlite（默认）| kingbase

# ========== SQLite 配置（DB_TYPE=sqlite 时生效）==========
DB_PATH=./data/database.sqlite

# ========== KingbaseES 配置（DB_TYPE=kingbase 时生效）==========
# 方式一：完整连接字符串（含 statement_timeout）
DATABASE_URL=postgresql://system:password@localhost:54321/diabetes_db?options=-c%20statement_timeout%3D30000
# 方式二：分离参数（需在代码中拼接 options 参数，见 7.2 节）
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
```

### 10.2 .env.example 同步更新

`.env.example` 中补充上述字段（敏感值为空），供新开发者参考配置格式。

### 10.3 数据库初始化流程

```
应用启动
  → initDatabase()
    → 读取 DB_TYPE
    → 实例化对应 Adapter
    → adapter.init()
      → SQLite:
        → 读取 init.sql → db.exec(initSql)
        → 检查 users 表是否有数据
        → 无数据时：读取 seed.sql → 用 bcryptjs 生成 admin123 哈希 → 替换占位符 → db.exec(seedSql)
      → KingbaseES:
        → 读取 init_kingbase.sql
        → 用 bcryptjs 生成 admin123 哈希 → 替换 __BCRYPT_HASH_PLACEHOLDER__ 占位符
        → 按 ; 分割为语句数组（跳过字符串字面量和注释中的分号）
        → BEGIN 事务 → 逐条 pool.query() → COMMIT
        → 检查 users 表是否有数据，避免重复初始化
    → 导出 adapter 实例供路由使用
```

---

## 11. 数据迁移（SQLite → KingbaseES）

生产环境切换时需一次性迁移现有数据。方案概要：

1. 编写 `scripts/migrate-to-kingbase.js` 一次性脚本
2. 脚本流程：连接 SQLite → 读取所有表数据 → 连接 KingbaseES → 按依赖顺序写入（先 users，后关联表）→ 验证行数一致
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

**时区转换方法**：读取 SQLite 中存储的本地时间字符串（格式如 `2025-06-28 14:30:00`），使用 `dayjs` 或原生 `Date` 解析后减去 8 小时偏移，再以 UTC ISO 格式写入 KingbaseES。示例逻辑：
```javascript
// 迁移脚本中的时区转换（伪代码）
const localTime = row.created_at; // "2025-06-28 14:30:00"
const utcTime = new Date(localTime + '+08:00').toISOString(); // "2025-06-28T06:30:00.000Z"
```

**迁移顺序**（FK 依赖约束）：
```
users → doctor_information → diabetes_types → articles
→ article_collections → user_risk_info → life_plans
→ life_advice → punch_in → admin_logs
```

---

## 12. 前端确认

**确认**：前端代码无需任何修改。原因：
1. 所有 API 接口的请求/响应格式不变（JSON）
2. 路由路径不变
3. 字段名在 schema 对齐后保持一致
4. 前端不直接访问数据库

---

## 13. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 同步→异步改造引入竞态条件 | 路由逻辑错误 | 每个路由文件改造后单独自测；`plan.js` 事务逻辑重点回归 |
| SQLite 与 KingbaseES 行为差异 | 查询结果不同 | Phase 1 双库并行验证，跑全量功能测试 |
| `CURRENT_TIMESTAMP` 时区语义差异 | 时间字段值偏移 | 统一 UTC 存储，前端转换；适配层初始化时显式设置 timezone |
| KingbaseES 连接不可用 | 生产故障 | 保留 `DB_TYPE=sqlite` 快速回退路径；连接池失败重试机制 |
| 迁移脚本数据丢失 | 生产数据损坏 | 先备份 SQLite 文件；逐表迁移并验证行数；事务内执行 |
| init_kingbase.sql 分号分割误判 | 初始化失败 | 实现时使用状态机处理字符串字面量；备选方案为拆分为 DDL/种子两个文件 |
| KingbaseAdapter 占位符转换覆盖不全 | 参数化查询失败 | 状态机实现时覆盖单引号字符串内 `?` 的跳过逻辑；单元测试覆盖含字符串字面量的 SQL 语句 |
| `statement_timeout` 配置被静默忽略 | 生产查询无超时保护 | 通过连接字符串 `options` 参数传递（见 7.2 节），启动后验证 |

---

## 14. 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `server/db/adapter/sqlite.js` | SqliteAdapter 实现（含 tableInfo 方法） |
| 新建 | `server/db/adapter/kingbase.js` | KingbaseAdapter 实现（含 init 多语句执行、`?`→`$1` 占位符转换、RETURNING id 自动追加、tableInfo 方法） |
| 新建 | `server/db/sql.js` | SQL 方言辅助函数（含 now / jsonField / jsonFieldAs / relativeDate） |
| 改造 | `server/db/database.js` | 引入 adapter，导出 `getAdapter()` |
| 改造 | `server/routes/auth.js` | `db.prepare` → `adapter.query/queryOne/execute` |
| 改造 | `server/routes/user.js` | 同上 + `datetime()` → `sql.now()` |
| 改造 | `server/routes/risk.js` | 同上 + `json_extract` → `sql.jsonField/sql.jsonFieldAs` |
| 改造 | `server/routes/plan.js` | 同上 + `db.transaction` → `adapter.transaction` + `datetime()` → `sql.now()` |
| 改造 | `server/routes/punch.js` | 同上 + `last_insert_rowid()` → adapter.execute 内部处理 + `datetime()` 日期运算 → 应用层计算或 `sql.relativeDate()` |
| 改造 | `server/routes/articles.js` | 同上 + `datetime()` → `sql.now()` |
| 改造 | `server/routes/admin.js` | 同上 + `PRAGMA table_info` → `adapter.tableInfo()` + `db.transaction` → `adapter.transaction` |
| 改造 | `server/routes/assistant.js` | `db.prepare` → `adapter.query/queryOne` |
| 改造 | `server/routes/doctors.js` | 同上 |
| 改造 | `server/routes/diabetes.js` | 同上 |
| 改造 | `server/routes/chat.js` | 同上 |
| 重写 | `server/db/init_kingbase.sql` | 对齐 init.sql schema（含 doctor_information 和 punch_in 的约束修复）；种子数据使用 `__BCRYPT_HASH_PLACEHOLDER__` 占位符 |
| 新建 | `scripts/migrate-to-kingbase.js` | 一次性数据迁移脚本（含时区转换） |
| 更新 | `.env` | 增加 DB_TYPE、DATABASE_URL（含 `options` 参数示例）、连接池配置 |
| 更新 | `.env.example` | 同步新增字段 |
| 更新 | `package.json` | 增加 `pg` 依赖 |
| 不变 | `src/`（前端） | 零改动 |
| 不变 | `server/middleware/` | 零改动 |
| 不变 | `server/services/` | 零改动 |
| 不变 | `server/utils/` | 零改动（pagination/validators/response 等与数据库无关） |
| 不变 | `server/routes/upload.js` | 零改动（文件上传，不涉及数据库） |
| 不变 | `server/routes/index.js` | 零改动（路由索引，不涉及数据库） |

---

## 修订说明（v1 → v2）

本轮修订基于技术方案审查报告（`a_v1_review_v1.md`）的反馈，共解决 2 个严重问题、4 个一般问题。

### 修订 1：init_kingbase.sql 多语句执行方案（严重）

**审查意见**：`pg.Pool.query()` 不支持单次调用执行多条 SQL 语句，方案在 10.3 节仅说"执行 init_kingbase.sql"，未说明 KingbaseAdapter 如何解析和执行多语句 SQL 脚本。

**修订内容**：
- 在 3.3 节 KingbaseAdapter 实现要点中新增 `init()` 方法的完整执行策略：
  - 读取 SQL 文件 → 替换占位符 → 按 `;` 分割 → 过滤空语句 → 事务内逐条执行
  - 明确了分号分割的注意事项（需处理字符串字面量和注释中的分号，使用状态机跳过单引号字符串）
  - 提供了备选方案（拆分为 DDL 和种子两个文件）
- 在 10.3 节初始化流程中细化了 KingbaseES 分支的执行步骤
- 在 13 节风险表中新增"分号分割误判"风险及缓解措施

### 修订 2：PRAGMA table_info 替换方案内部不一致（严重）

**审查意见**：方案多处提到 admin.js 的 PRAGMA table_info 需转换为 adapter 方法，但 DatabaseAdapter 接口中未定义对应方法。

**修订内容**：
- 在 3.1 节 DatabaseAdapter 接口中新增 `tableInfo(tableName)` 方法，明确定义了返回值格式（与 PRAGMA 格式一致：`{ cid, name, type, notnull, dflt_value, pk }`）
- 给出了 SqliteAdapter 和 KingbaseAdapter 各自的具体实现方案（SQLite 直接调用 PRAGMA，KingbaseES 查询 information_schema.columns 并映射）
- 提供了 KingbaseES 端完整的 information_schema 查询 SQL
- 在 3.5 节路由改动表中将 admin.js 的改动点从模糊的"adapter 方法"明确为 `adapter.tableInfo()`
- 在 14 节文件变更清单中同步更新

### 修订 3：datetime() 带修饰符的日期运算覆盖（一般）

**审查意见**：punch.js:125 使用了 `datetime('now', 'localtime', '-7 days')` 日期运算，方案仅提供 `sql.now()` 处理简单时间戳，未覆盖日期加减场景。

**修订内容**：
- 在 4.2 节方言辅助函数表中新增 `sql.relativeDate(days)` 函数，分别给出 SQLite 端和 KingbaseES 端的输出
- 同时提供了更简单的替代方案说明：在路由层用 JavaScript 计算日期后作为参数传入，无需方言函数
- 在 4.1 节差异清单中补充了"日期运算"行，明确了出现位置

### 修订 4：时区数据迁移纳入迁移计划（一般）

**审查意见**：现有数据使用 `datetime('now','localtime')` 存储为本地时间（UTC+8），方案决定统一 UTC 存储，但迁移方案未提及时区转换。

**修订内容**：
- 在 11 节数据迁移方案中新增第 5 条"时区转换"，列出了所有涉及 datetime 字段的 9 张表及其字段名
- 给出了具体的时区转换方法：读取本地时间字符串 → 附加 `+08:00` 时区信息 → 转为 UTC ISO 格式 → 写入 KingbaseES
- 提供了伪代码示例说明转换逻辑

### 修订 5：KingbaseES 种子数据密码哈希生成机制（一般）

**审查意见**：init_kingbase.sql 中种子数据以静态 SQL 形式存在，密码哈希硬编码，无法像 SQLite 那样运行时替换。

**修订内容**：
- 在 9.2 节对齐策略中新增"种子数据密码哈希处理"段落，明确决策：使用 `__BCRYPT_HASH_PLACEHOLDER__` 占位符替代硬编码哈希
- 在 3.3 节 KingbaseAdapter.init() 的执行策略中明确了第 2 步：用 `bcryptjs` 运行时生成哈希并替换占位符
- 在 10.3 节初始化流程中的 KingbaseES 分支明确了"替换占位符"步骤
- 在 14 节文件变更清单的 init_kingbase.sql 条目中注明了占位符机制

### 修订 6：RETURNING id 自动追加实现机制明确化（一般）

**审查意见**：KingbaseAdapter.execute() 需要判断 INSERT 和 RETURNING 子句，但未说明解析策略。项目已有 `node-sql-parser` 依赖但方案未提及。

**修订内容**：
- 在 3.3 节 KingbaseAdapter 实现要点中重写了 `execute()` 的 INSERT ID 获取策略：
  - 明确使用项目已有依赖 `node-sql-parser`（v5.4.0）进行 SQL AST 解析
  - 说明了判断逻辑：检查 AST type 是否为 `insert` → 检查是否已有 RETURNING 子句 → 若需要则追加 ` RETURNING id`
  - 提供了解析失败时的回退策略（正则匹配）
  - 解释了选择 `node-sql-parser` 而非正则的原因：可准确处理子查询中的 INSERT、ON CONFLICT 等复杂场景

### 其他细节修正

- 在 3.5 节修正了路由文件计数：从"约 11 个"改为"约 13 个文件，其中 11 个涉及数据库访问"，并明确列出了不受影响的 `upload.js` 和 `index.js`
- 在 14 节文件变更清单中补充了 `upload.js` 和 `index.js` 的不变说明

---

## 修订说明（v2 → v3）

本轮修订基于技术方案审查报告（`a_v1_review_v2.md`）的反馈，共解决 2 个一般问题、2 个轻微问题。

### 修订 7：KingbaseAdapter 参数占位符转换机制（一般）

**审查意见**：`pg`（node-postgres）仅支持 `$1, $2, ...` 格式的参数占位符，而当前项目全部使用 `?` 占位符。方案在 3.1 节定义了 `DatabaseAdapter` 接口，路由层改造示例（3.5 节）保持 `?` 占位符不变，但 KingbaseAdapter 实现要点（3.3 节）未说明如何将 `?` 转换为 `$1, $2, ...`。若不处理此转换，所有参数化查询在 KingbaseES 上将因语法错误而失败。

**修订内容**：
- 在 3.3 节 KingbaseAdapter 实现要点中新增"参数占位符转换"段落，明确说明 `?` vs `$1` 的差异及转换需求
- 给出具体转换策略：使用简单状态机扫描 SQL 字符串，将第 N 个 `?` 替换为 `$N`，同时跳过单引号字符串字面量内的 `?`（需处理转义单引号 `''`）
- 说明转换后的 params 数组无需调整顺序，直接传给 `pool.query()`
- 讨论了备选方案（路由层统一改为 `$1` 风格）并解释为何不推荐（增加约 50+ 处改动，与"路由层最小改动"原则冲突）
- 在 6 节 Phase 1 的 KingbaseAdapter 描述中补充"以及 `?` → `$1` 参数占位符转换"
- 在 13 节风险表中新增"占位符转换覆盖不全"风险及缓解措施
- 在 14 节文件变更清单的 kingbase.js 条目中补充"`?`→`$1` 占位符转换"说明

### 修订 8：statement_timeout 配置方式修正（一般）

**审查意见**：方案在 7.2 节将 `statement_timeout: 30000` 作为 `pg.Pool` 构造函数的顶层属性列出。`pg` 不将 `statement_timeout` 识别为 Pool 配置键——它是 PostgreSQL 服务端参数，必须通过连接字符串的 `options` 参数传递或通过连接后 `SET` 命令设置。按方案当前写法，该超时配置会被 `pg` 静默忽略，查询将无超时保护。

**修订内容**：
- 修正 7.2 节的 Pool 配置示例：从 Pool 配置对象中移除 `statement_timeout` 属性
- 新增"`statement_timeout` 配置说明"段落，提供三种正确设置方式：
  - **方式一（推荐）**：在连接字符串中通过 `options` 参数传递（`?options=-c%20statement_timeout%3D30000`）
  - **方式二**：在分离参数配置时，代码中动态拼接 `options` 参数
  - **方式三**：连接后执行 `SET` 命令（不推荐，需额外网络往返且连接池生命周期管理复杂）
- 明确三种方式的优缺点，推荐方式一
- 在 10.1 节的 `.env` 示例中更新 `DATABASE_URL` 格式，给出带 `options` 参数的完整连接字符串示例，并补充分离参数方式下需在代码中拼接 `options` 的说明
- 在 13 节风险表中新增"`statement_timeout` 配置被静默忽略"风险及缓解措施

### 修订 9：doctor_information 表 schema 差异补充（轻微）

**审查意见**：`doctor_information` 表的两个细微差异未在 9.1 节 schema 对比表中显式列出：(1) `chat_token` 的可空差异（init.sql 中 `TEXT NOT NULL`，init_kingbase.sql 中为可空 `VARCHAR(255)`）；(2) `description` 的默认值差异（init.sql 中 `TEXT DEFAULT ''`，init_kingbase.sql 中无默认值）。

**修订内容**：
- 在 9.1 节对比表中新增两行：
  - `doctor_information` | 可空差异 | `chat_token TEXT NOT NULL` | `chat_token VARCHAR(255)`（可空） → 以 init.sql 为准，统一为 NOT NULL
  - `doctor_information` | 默认值差异 | `description TEXT DEFAULT ''` | `description TEXT` 无默认值 → 以 init.sql 为准，补充 `DEFAULT ''`

### 修订 10：punch_in 表外键约束差异补充（轻微）

**审查意见**：`punch_in` 表外键约束差异未在 9.1 节对比表中提及：init.sql 中 `FOREIGN KEY (plan_item_id) REFERENCES life_plans(id) ON DELETE SET NULL`，init_kingbase.sql 中 `FOREIGN KEY (plan_id) REFERENCES life_plans(id)` 无 `ON DELETE` 子句。

**修订内容**：
- 在 9.1 节对比表中 `punch_in` 表新增"外键约束差异"行，明确两端的差异及处理策略（以 init.sql 为准，补充 `ON DELETE SET NULL`）
- 在 9.2 节翻译规则表中补充 `FOREIGN KEY ... ON DELETE SET NULL` 行，明确它在 KingbaseES 中保持兼容
- 在 14 节文件变更清单的 init_kingbase.sql 条目中补充"含 doctor_information 和 punch_in 的约束修复"说明

---

## 修订说明（v3 → v4）

本轮修订基于技术方案审查报告（`a_v1_review_v3.md`）的反馈，共解决 1 个一般问题、2 个轻微问题。

### 修订 11：punch_type 和 plan_type 枚举值中文/英文差异补充（一般）

**审查意见**：`punch_in.punch_type` 列和 `life_plans.type`（即 `plan_type`）列的中文/英文枚举值差异未被 9.1 节对比表覆盖。`init.sql` 使用英文值（`'diet'/'exercise'` 和 `'diet'/'exercise'/'other'`），`init_kingbase.sql` 使用中文值（`'饮食'/'运动'` 和 `'饮食'/'运动'/'其他'`），而应用代码（`punch.js`、`plan.js`、`validators.js`、`planParser.js`）全程使用英文值进行查询和筛选。若实现者仅按 9.1 节对比表修正差异（此前仅列出 `completion_status` 的同类差异），`punch_type` 和 `plan_type` 的 CHECK 约束将被保留为中文值，导致所有相关查询因值不匹配而静默返回空结果。

**修订内容**：
- 在 9.1 节对比表中新增两行：
  - `punch_in` | 枚举值差异（punch_type） | `CHECK(punch_type IN ('diet', 'exercise'))` | `CHECK(punch_type IN ('饮食', '运动'))` | 统一为英文值
  - `life_plans` | 枚举值差异（plan_type） | `CHECK(plan_type IN ('diet', 'exercise', 'other'))` | `CHECK(type IN ('饮食', '运动', '其他'))` | 统一为英文值
- 将原有 `punch_in` 的"枚举值差异"行明确标注为 `completion_status` 列，与新增的 `punch_type` 行区分
- 在 9.2 节对齐策略中新增"CHECK 约束枚举值统一原则"段落，统一声明所有 CHECK 约束的枚举值以 `init.sql` 英文值为准，并说明原因（应用代码全程使用英文值进行查询和筛选）

### 修订 12：init_kingbase.sql 缺失索引补充（轻微）

**审查意见**：`init_kingbase.sql` 缺少全部 18 个索引（2 个 UNIQUE INDEX + 16 个普通 INDEX）未在 9.1 节对比表中显式标记。9.2 节翻译规则表已包含 `UNIQUE INDEX` 作为"保持（兼容）"项，且设计决策是"重写 init_kingbase.sql"，完整实现时会补上索引。但 9.1 差异清单未显式标记此项缺失，实现者可能因对比表无相关行而遗漏部分普通索引。

**修订内容**：
- 在 9.1 节对比表末尾新增一行：
  - `全部表` | 索引缺失 | `init.sql` 定义 18 个索引（2 个 UNIQUE INDEX + 16 个普通 INDEX，行 134-151） | `init_kingbase.sql` 无任何索引定义 | 重写时补充全部 18 个索引（PostgreSQL/KingbaseES 兼容语法）

### 修订 13：参数占位符转换状态机补充注释处理说明（轻微）

**审查意见**：参数占位符 `?` 到 `$N` 转换的状态机描述（3.3 节）仅处理了单引号字符串字面量和转义单引号，未说明 SQL 注释（`--`、`/* */`）中出现的 `?` 是否会被误转换。实际影响较小——路由层代码中 SQL 字符串不包含注释，且 `init_kingbase.sql` 的多语句分割步骤已独立处理了注释移除。

**修订内容**：
- 在 3.3 节参数占位符转换的状态机描述中新增"SQL 注释处理说明"段落，明确说明状态机无需处理 SQL 注释的原因：路由层运行时的 SQL 语句不包含注释，注释仅出现在 DDL 初始化脚本中，而初始化脚本通过独立的 `init()` 多语句执行流程处理（其分号分割步骤已包含注释移除逻辑）
