# R2: 路由层（12 个文件）— 金仓数据库迁移 Phase 0+1

审查时间：2026-06-30

### 审查范围

- `server/routes/admin.js` ⚠️（与 main 有冲突，已用 PR 版本）
- `server/routes/plan.js` ⚠️（与 main 有冲突，已用 PR 版本）
- `server/routes/articles.js`
- `server/routes/assistant.js`
- `server/routes/auth.js`
- `server/routes/chat.js`
- `server/routes/diabetes.js`
- `server/routes/doctors.js`
- `server/routes/index.js`
- `server/routes/punch.js`
- `server/routes/risk.js`
- `server/routes/user.js`

参照依据：`docs/5_kingbase_migration_plan.md`（v16，最高优先级）、`docs/2_detailed_design_v4.md`。

### 总体评价

12 个路由文件已基本完成从 `db.prepare` 同步模式到 `adapter.query/queryOne/execute` 异步模式的改造，绝大多数 handler 正确使用 `async/await + try/catch + next(e)` 模式，`sql.now()`、`sql.jsonField/jsonFieldAs`、`sql.formatDateParam()` 等方言辅助函数使用得当，`adapter.transaction()` 事务边界划分正确，`insertAdminLog` 改造为接收 `adapter` 参数符合 §8.3 要求。`punch.js`、`risk.js`、`auth.js`、`user.js`、`articles.js`、`doctors.js`、`diabetes.js`、`chat.js`、`assistant.js`、`index.js` 改造质量良好，未发现严重问题。

但 `admin.js` 和 `plan.js` 存在 2 个严重问题（与迁移计划核心要求不符）和若干一般问题（含 main 已有但 PR 遗漏的 PR#13 修复）。

### 发现

---

#### [严重] admin.js: `/execute` 的 `sql` 模式未在 KingbaseES 下禁用

- **位置**：`server/routes/admin.js:79-128`
- **描述**：迁移计划 §9.2 明确要求 Phase 1 在 KingbaseES 下禁用 `sql` 模式（仅保留 `tool_name` 模式），并在 `sql` 模式分支前增加判断：
  ```javascript
  if (!tool_name) {
    if (process.env.DB_TYPE === 'kingbase') {
      return error(res, 'UNSUPPORTED', 'KingbaseES 后端暂不支持动态 SQL 模式，请使用 tool_name 参数', 400);
    }
    // ...原有检查和执行逻辑
  }
  ```
  PR 版本未实现此判断（`grep "DB_TYPE.*kingbase" server/routes/admin.js` 无匹配）。当 `DB_TYPE=kingbase` 时，Dify AI 生成的 SQLite 方言 SQL（含 `datetime('now','localtime')`、`json_extract()`、`last_insert_rowid()` 等）将被直接传入 KingbaseES 执行，导致语法错误或静默失败。这是迁移计划 §9.2 的核心要求，未实现将使 admin `/execute` 的 `sql` 模式在 KingbaseES 环境下完全不可用。
- **建议**：在 `server/routes/admin.js:80`（`if (!sql)` 之前）插入 KingbaseES 下禁用 `sql` 模式的判断分支，返回 400 错误并提示使用 `tool_name` 参数。同时在 `dispatchParameterizedQuery` 的 `query_table` 分支中记录日志（§9.2 要求）。

---

#### [严重] plan.js: `SELECT MAX(plan_id)` 缺少 `FOR UPDATE` 行级锁

- **位置**：`server/routes/plan.js:42-45`（`/generate`）、`server/routes/plan.js:125-128`（`/adjust`）
- **描述**：迁移计划 §8.5 明确要求在 `SELECT COALESCE(MAX(plan_id), 0) + 1` 查询中追加 `FOR UPDATE`，以防止 KingbaseES READ COMMITTED 隔离级别下的并发重复 plan_id 问题：
  ```
  事务 A: SELECT MAX(plan_id) → 5 → 计算 plan_id = 6
  事务 B: SELECT MAX(plan_id) → 5 → 计算 plan_id = 6
  事务 A: INSERT plan_id=6 → COMMIT
  事务 B: INSERT plan_id=6 → 成功（plan_id 非唯一约束）→ 同一用户出现两个 plan_id=6
  ```
  PR 版本两处查询均为：
  ```javascript
  'SELECT COALESCE(MAX(plan_id), 0) + 1 AS maxId FROM life_plans WHERE user_id = ?'
  ```
  缺少 `FOR UPDATE`。同时核查 `server/db/init.sql:145` 和 `server/db/init_kingbase_ddl.sql:160`，索引均为普通索引 `CREATE INDEX IF NOT EXISTS idx_plans_user_plan ON life_plans(user_id, plan_id)`，未按 §8.5 v10 要求改为 `CREATE UNIQUE INDEX`，因此数据库层也无最后防线。在 KingbaseES 下并发首次生成方案时将产生数据完整性问题。
- **建议**：
  1. 将两处 SELECT 改为 `'SELECT COALESCE(MAX(plan_id), 0) + 1 AS maxId FROM life_plans WHERE user_id = ? FOR UPDATE'`（SQLite 3.33+ 语法兼容）
  2. 将 `init.sql` 和 `init_kingbase_ddl.sql` 中的 `idx_plans_user_plan` 改为 `CREATE UNIQUE INDEX IF NOT EXISTS`（DDL 文件不在本轮审查范围，但属于同一问题的配套修复）

---

#### [一般] admin.js: `query_table`/`update_record`/`delete_record` 的 WHERE 子句存在 SQL 注入风险

- **位置**：`server/routes/admin.js:269`（query_table）、`server/routes/admin.js:329`（update_record）、`server/routes/admin.js:348`（delete_record）
- **描述**：PR 版本直接通过字符串插值拼接 WHERE 子句：
  ```javascript
  if (params.where) sql += ` WHERE ${params.where}`;
  // update_record: `UPDATE ${params.table} SET ${setClause} WHERE ${params.where}`
  // delete_record: `DELETE FROM ${params.table} WHERE ${params.where}`
  ```
  main 分支（PR#13）已通过 `parseWhereClause` + `splitByAnd` 函数对 WHERE 子句进行白名单校验（仅允许 `column = value AND column = value` 模式），PR 基于较早 main（commit e202101）遗漏了此修复。同时迁移计划 §9.2 v16 新增要求 Phase 1 应使用 `node-sql-parser` 解析 WHERE 子句 AST 进行基础防护。当前实现下，若 Dify AI 被恶意 prompt 操纵生成含注入代码的 WHERE 子句（如 `1=1 UNION SELECT password FROM users`），将绕过参数化查询保护直接执行。scope.md T15 v16 安全测试用例（`where: "1=1; DROP TABLE users;--"`）将无法通过。
- **建议**：
  1. 近期：从 main 分支合并 `parseWhereClause`/`splitByAnd` 函数，恢复 WHERE 子句白名单校验
  2. Phase 1 完整实现：按 §9.2 v16 要求，引入 `node-sql-parser` AST 解析，拒绝含子查询/DML/函数调用（除已知安全函数外）的 WHERE 子句
  3. `update_record`/`delete_record` 的 WHERE 子句同样需要校验

---

#### [一般] plan.js: 缺少幂等检查机制（`checkIdempotent`）

- **位置**：`server/routes/plan.js:12-68`（`/generate` handler 全部）
- **描述**：main 分支（PR#13）通过 `lastGenerateRequest` Map + `checkIdempotent(userId)` 实现 30 秒内幂等保护，且 G12 修复将检查移至 Dify API 调用之前以节省配额。PR 版本完全没有此机制，用户快速重复点击将触发多次 Dify 调用，浪费 API 配额。迁移计划 §8.5 v4 进一步建议将 `checkIdempotent()` 移至 Dify 调用之前并配合 `FOR UPDATE` 缩短竞态窗口。`articles.js` 已实现类似机制（`recentGenerates` Map，第 14、85-89 行），`plan.js` 缺失不一致。
- **建议**：从 main 分支合并 `lastGenerateRequest` + `checkIdempotent` 机制，在 `validatePlanGenerate` 之后、`callWorkflowBlocking` 之前调用 `checkIdempotent()`。

---

#### [一般] plan.js: 缺少 `parsePlanOutput` 重试机制，方案解析鲁棒性不足

- **位置**：`server/routes/plan.js:24-33`（`/generate`）、`server/routes/plan.js:108-117`（`/adjust`）
- **描述**：PR 版本使用简单的 `JSON.parse` + `parsePlanOutput` 回退：
  ```javascript
  try { planItems = JSON.parse(outputsText); }
  catch (e) { planItems = parsePlanOutput(outputsText); }
  ```
  main 分支（PR#13）的 `parsePlanOutput` 接收 4 个参数 `(text, workflowKey, callWorkflowBlocking, inputs)`，内部实现 Dify 重试逻辑，解析失败时再次调用 Dify 获取规范 JSON。PR 版本的 `parsePlanOutput(outputsText)` 仅接收文本参数，无重试能力，解析失败时直接抛出 502 错误。在 Dify 输出格式不稳定时，PR 版本的方案生成成功率低于 main。
- **建议**：从 main 分支合并 `parsePlanOutput` 的完整实现及其调用方式。

---

#### [一般] plan.js: 响应格式缺少方案分类，与前端契约不一致

- **位置**：`server/routes/plan.js:64`（`/generate` 响应）、`server/routes/plan.js:146`（`/adjust` 响应）
- **描述**：PR 版本返回 `{ plan_id, items: newPlans }`，其中 `items` 为扁平数组。main 分支（PR#13）按 `plan_type` 分类返回：
  ```javascript
  { plan_id, diet_plans, exercise_plans, other_plans }
  ```
  这与前端期望的数据结构不一致（main 的格式是 PR#13 确立的前端契约），可能导致前端无法正确渲染分类方案。`/current` 端点同样存在此问题（PR 返回扁平 `rows`，main 返回分类结构）。
- **建议**：从 main 分支合并响应分类逻辑，统一返回 `{ plan_id, diet_plans, exercise_plans, other_plans }` 结构。

---

#### [一般] plan.js: `/current` 未处理空方案情况，响应格式与 main 不一致

- **位置**：`server/routes/plan.js:70-81`
- **描述**：当用户尚未生成方案时，PR 版本返回空数组 `[]`，而 main 分支（PR#13）返回：
  ```javascript
  res.status(200).json({ success: true, data: null, message: '尚未生成方案，请先完成风险预测或直接生成方案' });
  ```
  前端依赖 `data: null` 判断"无方案"状态，PR 版本返回空数组会导致前端逻辑异常。此外 main 版本响应包含 `generated_at` 字段，PR 版本缺失。
- **建议**：从 main 分支合并空方案处理逻辑和 `generated_at` 字段。

---

#### [一般] plan.js: `/adjust` 缺少健康信息存在性检查

- **位置**：`server/routes/plan.js:89-101`
- **描述**：PR 版本在查询 `user_risk_info` 后使用默认值（age:30, gender:'male', height:170, weight:65）：
  ```javascript
  const healthRow = await adapter.queryOne(...);
  // 直接使用 healthRow ? healthRow.age : 30
  ```
  main 分支（PR#13）在 `!latest` 时抛出 422 错误：
  ```javascript
  if (!latest) throw new AppError(422, 'VALIDATION_ERROR', '请先完成风险预测或提供健康信息');
  ```
  PR 版本允许未完成风险评估的用户直接调整方案，使用虚构的默认健康信息调用 Dify，生成的方案可能与用户实际情况不符。
- **建议**：从 main 分支合并健康信息存在性检查，未完成风险评估时返回 422 错误。

---

#### [一般] admin.js: `query_table` 的 `order_by` 字符串插值存在注入风险

- **位置**：`server/routes/admin.js:270`
- **描述**：`if (params.order_by) sql += \` ORDER BY ${params.order_by}\`;` 直接拼接 `order_by` 参数。虽然 `ORDER BY` 注入风险低于 `WHERE`（不易执行 DML），但恶意构造的 `order_by` 仍可能通过子查询泄露数据（如 `id; SELECT password FROM users` 在某些场景下可能生效）或导致查询错误。main 分支未对 `order_by` 做校验，属于 pre-existing 问题，但 PR 在缺少 `parseWhereClause` 的同时也没有 `order_by` 校验，风险叠加。
- **建议**：对 `order_by` 实现白名单校验（仅允许 `column_name ASC|DESC` 格式，列名限制为字母数字下划线）。

---

#### [轻微] plan.js: 事务内逐条 INSERT 未优化为多行 INSERT

- **位置**：`server/routes/plan.js:48-53`（`/generate`）、`server/routes/plan.js:131-136`（`/adjust`）
- **描述**：事务内通过 `for` 循环逐条 INSERT 方案项。迁移计划 §8.2 指出 SQLite 下此模式延迟可忽略（<1ms），但 KingbaseES 下每次 INSERT 为网络往返（0.1-1ms），20 个方案项的事务总延迟可能升至 2-20ms。迁移计划 §8.2 "推荐"（非强制）改为多行 VALUES 语句。
- **建议**：Phase 1 双库对比测试中将 `POST /generate` 和 `PUT /adjust` 的 P50/P95 响应时间列为对比指标，若性能退化明显则改为多行 INSERT。

---

#### [轻微] admin.js: `getOpType` 使用 `substring(0, 6)` 判断 SQL 类型，对 `DELETE` 脆弱

- **位置**：`server/routes/admin.js:107`、`server/routes/admin.js:161-168`
- **描述**：`sql.trim().substring(0, 6).toUpperCase()` 对 `DELETE`（6 字符）刚好返回 `DELETE`，但若 SQL 前缀有其他空白字符或 `DELETE` 后紧跟换行，行为可能不稳定。此为 pre-existing 问题，main 分支同样存在。
- **建议**：可改为正则匹配 `/^(SELECT|INSERT|UPDATE|DELETE)\b/i` 提高鲁棒性，优先级低。

---

#### [轻微] admin.js: `/execute` 事务错误处理使用通用 `next(e)` 而非特定 500 响应

- **位置**：`server/routes/admin.js:111-131`
- **描述**：main 分支在事务失败时返回特定错误：
  ```javascript
  catch (err) {
    console.error('admin execute transaction failed:', err.message);
    return error(res, 'INTERNAL_ERROR', 'SQL 执行失败，事务已回滚', 500);
  }
  ```
  PR 版本通过外层 `catch (e) { next(e); }` 传递给 Express 错误处理中间件，用户得到的是通用错误响应，缺少"事务已回滚"的明确提示。两种方式均可工作，PR 的方式更符合 Express 惯例，但用户体验略差。
- **建议**：可在事务 catch 中增加 `console.error` 日志便于排查，或保持现状（轻微优先级）。

---

### 本轮统计

| 严重程度 | 数量 |
|---------|------|
| 严重 | 2 |
| 一般 | 7 |
| 轻微 | 3 |

### 总评

**改造完成度良好的文件（10/12）**：`articles.js`、`assistant.js`、`auth.js`、`chat.js`、`diabetes.js`、`doctors.js`、`index.js`、`punch.js`、`risk.js`、`user.js` 均正确完成异步改造，`sql.now()`、`sql.jsonField/jsonFieldAs`、`sql.formatDateParam()` 等方言辅助函数使用正确，handler 遵循 `async (req, res, next) => { try { ... } catch (e) { next(e); } }` 模式，事务边界划分正确。其中 `punch.js` 的 `date(punch_time)` 兼容性处理（§4.1 v7）、`sql.formatDateParam()` UTC 计算（§4.2）、`risk.js` 的 `sql.jsonField/jsonFieldAs` 调用（§4.2）均符合迁移计划要求，值得肯定。

**需要修复的文件（2/12）**：

- `admin.js` 存在 2 个核心问题：① `sql` 模式未在 KingbaseES 下禁用（§9.2 核心要求，严重）；② `query_table`/`update_record`/`delete_record` 的 WHERE 子句缺少安全校验（§9.2 v16 + 遗漏 PR#13 `parseWhereClause`）。其中 ① 是迁移计划明文要求的 Phase 1 实现，必须修复；② 是 SQL 注入风险，应优先修复。

- `plan.js` 存在 1 个核心问题：`SELECT MAX(plan_id)` 缺少 `FOR UPDATE`（§8.5 核心要求，严重），在 KingbaseES READ COMMITTED 下可能导致并发重复 plan_id。配套地，`init.sql`/`init_kingbase_ddl.sql` 的 `idx_plans_user_plan` 也未改为 UNIQUE 索引（DDL 文件不在本轮范围，但属于同一问题的防线）。此外 `plan.js` 遗漏了 PR#13 的多项修复（幂等检查、`parsePlanOutput` 重试、响应分类、空方案处理、健康信息检查），按任务要求记录为一般问题，集成时需从 main 合并这些修复并与迁移改造协调。

**集成建议**：`admin.js` 和 `plan.js` 在集成阶段需同时完成两件事：① 从 main 合并 PR#13 的功能修复；② 在合并后的代码上叠加迁移改造（`FOR UPDATE`、KingbaseES `sql` 模式禁用、WHERE 子句安全校验）。建议先合并 main 修复得到功能完整版，再应用迁移改造，避免两类改动相互干扰。
