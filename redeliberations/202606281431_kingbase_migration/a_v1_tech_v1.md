# 引入国产金仓数据库 KingbaseES —— 技术方案

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
  async healthCheck()           → boolean
  async close()                 → void
}
```

### 3.2 SqliteAdapter 实现要点

- 基于现有 `better-sqlite3`，但封装为 Promise 接口
- 内部 `better-sqlite3` 是同步的，对外包裹 `Promise.resolve()` 即可
- `execute()` 利用 `stmt.run()` 返回的 `{ lastInsertRowid, changes }` 映射到 `{ lastInsertId, changes }`
- `transaction()` 利用 `better-sqlite3` 原生事务支持，包裹为 async 返回

### 3.3 KingbaseAdapter 实现要点

- 基于 `pg.Pool`
- `query()` / `queryOne()` / `execute()` 调用 `pool.query()`
- `execute()` 在 INSERT 语句后自动追加 `RETURNING id` 获取自增ID（如果SQL中未包含），保证返回 `{ lastInsertId }`
- `transaction()` 从 pool 获取一个 client，执行 `BEGIN` → fn(client) → `COMMIT`/`ROLLBACK` → `client.release()`

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

所有路由文件（约 11 个文件）的改动模式一致：将 `db.prepare(sql).run/get/all()` 替换为 `adapter.query/queryOne/execute()`。

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
| `server/routes/admin.js` | 20+ | 含 `db.transaction()` 事务、`info.lastInsertRowid` 取值 |
| `server/routes/plan.js` | 12+ | 含 2 个 `db.transaction()` 事务 |
| `server/routes/punch.js` | 8+ | 含 `SELECT last_insert_rowid()` 调用 |
| `server/routes/risk.js` | 6+ | 含 `json_extract()` SQL 函数、`info.lastInsertRowid` |
| `server/routes/articles.js` | 10+ | 含 `result.lastInsertRowid`、`datetime()` |
| `server/routes/auth.js` | 4 | 含 `result.lastInsertRowid` |
| `server/routes/user.js` | 6 | 含 `datetime()` |
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

**关键简化决策**：`sql.now()` 统一输出 `CURRENT_TIMESTAMP`，SQLite 3.38+ 和 KingbaseES 均支持该函数。这意味着路由层只需把 `datetime('now','localtime')` 替换为 `sql.now()` 即可。对于 DDL 中的 `DEFAULT (datetime('now','localtime'))`，改为 `DEFAULT CURRENT_TIMESTAMP`。

**风险点**：`CURRENT_TIMESTAMP` 在 SQLite 返回 UTC，而 `datetime('now','localtime')` 返回本地时间。需要在适配层初始化时执行 `PRAGMA ... SET timezone` 或应用层统一使用 UTC 存储（推荐方案，更规范）。

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

- 实现 `KingbaseAdapter`
- 对齐 `init_kingbase.sql` 与 `init.sql` 的 schema 差异（见第 9 节）
- 本地或测试环境部署 KingbaseES 实例
- 切换 `DB_TYPE=kingbase`，跑完整功能回归测试
- **验收标准**：所有功能在 KingbaseES 下行为与 SQLite 一致

### Phase 2：生产环境灰度切换

- 生产环境部署 KingbaseES，执行 `init_kingbase.sql` 初始化
- 从 SQLite 导出数据迁移到 KingbaseES（编写一次性数据迁移脚本）
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
  // KingbaseES 兼容性关键配置
  statement_timeout: 30000,                           // 语句执行超时（通过 options 或连接参数设置）
}
```

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
| life_advice | 缺失字段 | 有 `created_at` | 无 | 补充 |
| punch_in | 列名差异 | `plan_item_id` | `plan_id` | 统一为 `plan_item_id` |
| punch_in | 枚举值差异 | `'completed'/'uncompleted'` | `'已完成'/'未完成'` | 统一为英文值 |
| admin_logs | 列名差异 | `operator_id` | `admin_user_id` | 统一为 `operator_id` |
| admin_logs | 类型差异 | `operation_content TEXT NOT NULL` | `TEXT`（可空） | 统一为 NOT NULL |

### 9.2 对齐策略

**决策**：以 `init.sql`（SQLite 生产环境已验证的 schema）为基准，重写 `init_kingbase.sql`，仅将 SQLite 特有语法翻译为 PostgreSQL 兼容语法，不修改业务语义。

**翻译规则**：

| SQLite | KingbaseES |
|--------|-----------|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` |
| `TEXT` | `VARCHAR(N)` 或 `TEXT` |
| `INTEGER NOT NULL DEFAULT 0` | `INTEGER NOT NULL DEFAULT 0` |
| `CHECK(role IN ('user','admin'))` | 保持（兼容） |
| `DEFAULT (datetime('now','localtime'))` | `DEFAULT CURRENT_TIMESTAMP` |
| `FOREIGN KEY ... ON DELETE CASCADE` | 保持（兼容） |
| `UNIQUE INDEX` | 保持（兼容） |
| `CREATE TABLE IF NOT EXISTS` | 保持（兼容） |

**种子数据对齐**：`seed.sql` 中的种子数据同步到 `init_kingbase.sql`，确保两套数据库初始化后状态一致。当前 `init_kingbase.sql` 中的种子数据（管理员、医生、文章）与 `seed.sql` 内容不同（不同医生姓名、不同文章内容），需统一为 `seed.sql` 的数据。

---

## 10. 环境配置设计

### 10.1 .env 文件新增字段

```bash
# ========== 数据库类型切换 ==========
DB_TYPE=sqlite                           # sqlite（默认）| kingbase

# ========== SQLite 配置（DB_TYPE=sqlite 时生效）==========
DB_PATH=./data/database.sqlite

# ========== KingbaseES 配置（DB_TYPE=kingbase 时生效）==========
DATABASE_URL=postgresql://system:password@localhost:54321/diabetes_db
# 或分别指定：
DB_HOST=localhost
DB_PORT=54321
DB_NAME=diabetes_db
DB_USER=system
DB_PASSWORD=your_password

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
      → SQLite: 执行 init.sql → 检查 users 表 → 按需执行 seed.sql
      → KingbaseES: 执行 init_kingbase.sql → 检查 users 表 → 按需执行种子 INSERT
    → 导出 adapter 实例供路由使用
```

---

## 11. 数据迁移（SQLite → KingbaseES）

生产环境切换时需一次性迁移现有数据。方案概要：

1. 编写 `scripts/migrate-to-kingbase.js` 一次性脚本
2. 脚本流程：连接 SQLite → 读取所有表数据 → 连接 KingbaseES → 按依赖顺序写入（先 users，后关联表）→ 验证行数一致
3. 密码哈希（bcrypt）直接迁移，KingbaseES 存储的同样是 bcrypt 字符串
4. JSON 字段（`tags`、`result`）在 SQLite 中存储为 TEXT，迁移到 KingbaseES 后继续存为 TEXT 或 JSONB（推荐 JSONB，支持索引和查询优化）

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

---

## 14. 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `server/db/adapter/sqlite.js` | SqliteAdapter 实现 |
| 新建 | `server/db/adapter/kingbase.js` | KingbaseAdapter 实现 |
| 新建 | `server/db/sql.js` | SQL 方言辅助函数 |
| 改造 | `server/db/database.js` | 引入 adapter，导出 `getAdapter()` |
| 改造 | `server/routes/auth.js` | `db.prepare` → `adapter.query/queryOne/execute` |
| 改造 | `server/routes/user.js` | 同上 |
| 改造 | `server/routes/risk.js` | 同上 + json_extract → sql.jsonField |
| 改造 | `server/routes/plan.js` | 同上 + db.transaction → adapter.transaction |
| 改造 | `server/routes/punch.js` | 同上 + last_insert_rowid → adapter.execute 内部处理 |
| 改造 | `server/routes/articles.js` | 同上 + datetime → sql.now |
| 改造 | `server/routes/admin.js` | 同上 + PRAGMA table_info → adapter 方法 |
| 改造 | `server/routes/assistant.js` | `db.prepare` → `adapter.query/queryOne` |
| 改造 | `server/routes/doctors.js` | 同上 |
| 改造 | `server/routes/diabetes.js` | 同上 |
| 改造 | `server/routes/chat.js` | 同上 |
| 重写 | `server/db/init_kingbase.sql` | 对齐 init.sql schema |
| 新建 | `scripts/migrate-to-kingbase.js` | 一次性数据迁移脚本 |
| 更新 | `.env` | 增加 DB_TYPE、DATABASE_URL、连接池配置 |
| 更新 | `.env.example` | 同步新增字段 |
| 更新 | `package.json` | 增加 `pg` 依赖 |
| 不变 | `src/`（前端） | 零改动 |
| 不变 | `server/middleware/` | 零改动 |
| 不变 | `server/services/` | 零改动 |
| 不变 | `server/utils/` | 零改动（pagination/validators/response 等与数据库无关） |
