# PR #12 审查待办 — 严重与一般问题清单

- **审查对象**：PR #12（金仓数据库迁移 Phase 0+1，分支 `feature/kingbase-migration` → `main`）
- **审查依据**：`docs/5_kingbase_migration_plan.md`（v16，最高优先级）、`docs/2_detailed_design_v4.md`；冲突以迁移计划为准
- **审查时间**：2026-06-30
- **审查轮次**：2 轮并行（R1 适配层核心+基础设施 9 文件、R2 路由层 12 文件）
- **问题统计**：严重 7 项、一般 12 项，共 19 项

> 仅保留题目、位置、描述，忽略建议。编号格式 `[R{轮次}-{等级}-{序号}]`。

---

## 严重问题（7 项）

### [R1-严重-1] SqliteAdapter.init() 中 seed.sql 占位符替换正则与实际占位符格式不匹配，admin 密码无法正确设置
- **位置**：`server/db/adapter/SqliteAdapter.js:55-58`
- **描述**：实际 `seed.sql` 第 3 行的占位符为字面量 `$2a$10$PLACEHOLDER_BCRYPT_HASH_GOES_HERE`（共 3 个 `$`）。但实现使用的正则 `/\$2[ab]\$\d+\$[A-Za-z0-9./]+\$PLACEHOLDER_BCRYPT_HASH_GOES_HERE[A-Za-z0-9./]+/` 要求在 `PLACEHOLDER` 之前出现第 4 个 `$`，且字符类 `[A-Za-z0-9./]` 不包含下划线 `_`，导致 `[A-Za-z0-9./]+` 匹配到 `PLACEHOLDER` 后遇到 `_` 即停止，下一个期望的 `\$` 实际为 `_`，正则整体不匹配。结果：`seedSql.replace(...)` 不发生替换，`db.exec(seedSql)` 将字面量 `$2a$10$PLACEHOLDER_BCRYPT_HASH_GOES_HERE` 作为 admin 密码哈希写入数据库，admin 用户使用 `admin123` 无法登录。对照 `KingbaseAdapter.init()` 第 194 行采用 `seedSql.replace('__BCRYPT_HASH_PLACEHOLDER__', hash)` 字符串直接替换可正常工作。迁移计划 §3.3 要求 `init()` 完成"替换占位符"语义，当前实现未达成。

### [R1-严重-2] database.js 双导出 `db` 在 require 时为 null，破坏 Phase 0 过渡兼容性
- **位置**：`server/db/database.js:85`
- **描述**：模块加载时执行 `module.exports = { getAdapter, initDatabase, db: null };`，将 `db` 初始绑定为 `null`。`initDatabase()` 在第 67-72 行才通过 `module.exports.db = adapter.db`（SQLite 模式）更新导出值。但路由文件通常在文件顶部使用 `const { db } = require('../db/database')` 解构导入——解构在 `require` 时刻即捕获 `null`，之后 `module.exports.db` 的更新不会反映到已解构的 `db` 变量。这导致任何使用解构方式且尚未改造为 `getAdapter()` 的路由在 Phase 0 过渡期拿到 `db = null`，调用 `db.prepare(...)` 抛 `Cannot read property 'prepare' of null`。迁移计划 §3.5.2 步骤 2 明确要求"database.js 导出 `module.exports = { db: adapter.db, getAdapter: () => adapter, initDatabase }`，保证旧路由文件仍可通过 `require('../db/database').db` 获取原始 better-sqlite3 对象"，当前实现未达成该语义。

### [R1-严重-3] init_kingbase_ddl.sql 中 4 个 JSON 列使用 TEXT 而非 JSONB，违反迁移计划 §10.2 决策
- **位置**：`server/db/init_kingbase_ddl.sql:56`（`articles.tags`）、`:89`（`user_risk_info.result`、`user_risk_info.raw_input`）、`:115`（`life_advice.tags`）
- **描述**：迁移计划 §10.2"JSON 列类型决策"明确："4 个 JSON 文本列在 KingbaseES 中使用 JSONB 类型而非 TEXT"，并给出具体列表：`articles.tags`、`user_risk_info.result`、`user_risk_info.raw_input`、`life_advice.tags`。§10.2 翻译规则表亦载明"TEXT（存储 JSON 字符串）→ JSONB"。当前 DDL 均为 TEXT：第 56 行 `tags TEXT NOT NULL DEFAULT '[]'`；第 89 行 `result TEXT`、`raw_input TEXT`；第 115 行 `tags TEXT NOT NULL DEFAULT '[]'`。影响：(1) `sql.jsonField()` 在金仓侧输出 `${col}::jsonb->>'${path}'`，对 TEXT 列需运行时 `::jsonb` 转换，无法利用 GIN 索引；(2) 与计划"原生 JSON 查询支持"目标矛盾；(3) 迁移脚本需额外 JSON 合法性校验逻辑。§10.2 v16 修正明确 `admin_logs.operation_content/operation_result` 保持 TEXT（纯文本），当前实现正确，仅上述 4 列需改。

### [R1-严重-4] init_kingbase_ddl.sql 中 `idx_plans_user_plan` 缺少 UNIQUE 约束，违反迁移计划 §8.5 / §10.2
- **位置**：`server/db/init_kingbase_ddl.sql:160`
- **描述**：迁移计划 §8.5（v9 新增，v10 修正）和 §10.2 均要求将 `life_plans(user_id, plan_id)` 的索引从普通索引升格为 UNIQUE 索引，作为 `FOR UPDATE` 行级锁在"首次方案生成"场景失效时的数据库层最后防线——防止两个并发请求同时 INSERT 相同 `plan_id`。当前实现为 `CREATE INDEX IF NOT EXISTS idx_plans_user_plan ON life_plans(user_id, plan_id);`，应为 `CREATE UNIQUE INDEX IF NOT EXISTS`。缺失此约束将导致并发首次方案生成时出现重复 `plan_id`，方案数据混乱。同时 `init.sql:145` 也应同步修改。

### [R1-严重-5] init_kingbase_seed.sql 种子数据与 seed.sql 不一致，违反迁移计划 §10.2"种子数据对齐"
- **位置**：`server/db/init_kingbase_seed.sql:14-32`（医生）、`:35-63`（糖尿病类型）、`:66-173`（文章）
- **描述**：迁移计划 §10.2 明确要求："种子数据对齐：seed.sql 中的种子数据同步到 init_kingbase.sql，确保两套数据库初始化后状态一致……需统一为 seed.sql 的数据"。当前两文件内容严重不一致。**医生信息**：seed.sql 为张明远（内分泌科/主任医师）、李静怡（糖尿病专科/专科医师）、王建国（营养科/营养科专家）；init_kingbase_seed.sql 为张明华（内分泌科/主任医师）、李雅文（营养科/副主任医师）、王志强（运动医学科/主治医师）——姓名、科室、职称、描述、头像路径、chat_token 全部不同。**糖尿病类型**：seed.sql 为 `1型糖尿病`/图片 `t1.jpg`；init_kingbase_seed.sql 为 `1 型糖尿病`（多空格）/图片 `type_1.jpg`——类型名称、图片路径、科普内容文本均不同。**文章**：seed.sql 为 3 篇（饮食指南、运动建议、血糖监测），INSERT 列含 `cover`；init_kingbase_seed.sql 为 3 篇（饮食误区、运动处方、早期筛查），INSERT 列不含 `cover` 但含 `summary`/`tags`——文章标题、内容、分类、列集合完全不同。影响：(1) 双库初始化后状态不一致，违背 §5"同一套应用代码，两个数据库后端"的可移植性目标；(2) 前端图片路径不匹配将导致医生头像/类型图片 404；(3) `articles` 列集合不同导致 `cover` 列在金仓侧为 NULL（缺失封面）。

### [R2-严重-1] admin.js: `/execute` 的 `sql` 模式未在 KingbaseES 下禁用
- **位置**：`server/routes/admin.js:79-128`
- **描述**：迁移计划 §9.2 明确要求 Phase 1 在 KingbaseES 下禁用 `sql` 模式（仅保留 `tool_name` 模式），并在 `sql` 模式分支前增加判断：当 `process.env.DB_TYPE === 'kingbase'` 时返回 400 错误并提示使用 `tool_name` 参数。PR 版本未实现此判断（`grep "DB_TYPE.*kingbase" server/routes/admin.js` 无匹配）。当 `DB_TYPE=kingbase` 时，Dify AI 生成的 SQLite 方言 SQL（含 `datetime('now','localtime')`、`json_extract()`、`last_insert_rowid()` 等）将被直接传入 KingbaseES 执行，导致语法错误或静默失败。这是迁移计划 §9.2 的核心要求，未实现将使 admin `/execute` 的 `sql` 模式在 KingbaseES 环境下完全不可用。

### [R2-严重-2] plan.js: `SELECT MAX(plan_id)` 缺少 `FOR UPDATE` 行级锁
- **位置**：`server/routes/plan.js:42-45`（`/generate`）、`server/routes/plan.js:125-128`（`/adjust`）
- **描述**：迁移计划 §8.5 明确要求在 `SELECT COALESCE(MAX(plan_id), 0) + 1` 查询中追加 `FOR UPDATE`，以防止 KingbaseES READ COMMITTED 隔离级别下的并发重复 plan_id 问题：事务 A 与事务 B 同时 SELECT MAX(plan_id)→5→计算 plan_id=6，事务 A INSERT plan_id=6 并 COMMIT，事务 B INSERT plan_id=6 也成功（plan_id 非唯一约束），导致同一用户出现两个 plan_id=6。PR 版本两处查询均为 `'SELECT COALESCE(MAX(plan_id), 0) + 1 AS maxId FROM life_plans WHERE user_id = ?'`，缺少 `FOR UPDATE`。同时 `init.sql:145` 和 `init_kingbase_ddl.sql:160` 的索引均为普通索引未改为 `CREATE UNIQUE INDEX`（见 R1-严重-4），数据库层也无最后防线。在 KingbaseES 下并发首次生成方案时将产生数据完整性问题。

---

## 一般问题（12 项）

### [R1-一般-1] KingbaseAdapter.init() 种子数据分割未处理单引号字符串内的分号，违反迁移计划 §3.4.5 步骤 8
- **位置**：`server/db/adapter/KingbaseAdapter.js:200-204`
- **描述**：迁移计划 §3.4.5 步骤 8 明确："按 `;` 分割为独立 INSERT 语句（单引号字符串内的分号跳过处理同步骤 2）"。当前实现仅移除单行注释后直接 `split(';')`，未使用状态机跳过单引号字符串内的分号，也未移除多行注释 `/* ... */`。对比同文件 DDL 分割（第 145-167 行）正确使用了状态机处理单引号字符串，两侧实现不一致。当前 `init_kingbase_seed.sql` 文章内容恰好不含分号，故暂未触发；但一旦种子数据更新（如文章内容出现分号、英文分号、或 SQL 函数调用），将导致语句被错误切断，产生语法错误或静默数据丢失。

### [R1-一般-2] KingbaseAdapter._ensureReturningId 对含 `?` 占位符的 SQL 调用 node-sql-parser 解析易失败，大量依赖正则回退
- **位置**：`server/db/adapter/KingbaseAdapter.js:102-125`
- **描述**：迁移计划 §3.4.4 推荐使用 `node-sql-parser` 解析 AST 检测 INSERT。实现中调用 `parser.astify(sql, { database: 'PostgreSQL' })`，但传入的 SQL 仍是 `?` 占位符风格（占位符转换 `_convertPlaceholders` 在 `_ensureReturningId` 之后才执行，见第 255-256 行）。`?` 不是 PostgreSQL 合法占位符，node-sql-parser 在 PostgreSQL 方言下解析含 `?` 的 SQL 大概率失败，触发 catch 块的正则回退（第 116-122 行）。结果：计划期望"node-sql-parser 准确处理子查询/ON CONFLICT 等复杂场景"的优势无法发挥，几乎所有 INSERT 都走正则回退路径，并按 §3.4.4 v14 要求输出 `console.warn` 警告日志——生产环境日志中会出现大量回退告警，违反计划"若频繁出现此日志需调查"的本意。

### [R1-一般-3] server.js 优雅关闭未先关闭 HTTP 服务器，进行中的请求被强制中断
- **位置**：`server.js:29-42`
- **描述**：迁移计划 §3.5.1 描述关闭流程时序为"`SIGTERM`/`SIGINT` → `adapter.close()` → `pool.end()` → `process.exit(0)`"，未显式要求关闭 HTTP server。但当前实现收到信号后直接调用 `adapter.close()` 再 `process.exit(0)`，未先停止 `app.listen()` 接收新连接、未等待在途请求完成。若 `adapter.close()`（`pool.end()`）阻塞或进行中请求仍在访问数据库，可能出现：在途请求拿到连接已关闭的错误、或 `pool.end()` 等待进行中查询但 HTTP 层已无新请求进入的死锁边缘场景。这是生产环境优雅关闭的常见遗漏。

### [R1-一般-4] sql.js 的 `jsonField`/`jsonFieldAs` 对 `col`/`path`/`type` 参数未做防护，存在潜在 SQL 注入面
- **位置**：`server/db/sql.js:57-74`
- **描述**：`jsonField(col, path)` 直接将 `col` 和 `path` 拼入 SQL：SQLite 侧 `json_extract(${col}, '$.${path}')`、金仓侧 `${col}::jsonb->>'${path}'`。`jsonFieldAs` 同样将 `type` 直接拼入 `CAST(... AS ${type})` / `(...)::${type}`。当前路由层调用均为硬编码列名/路径（如 `sql.jsonField('result', 'risk_level')`），不存在用户输入直达，故无现实漏洞。但：(1) 缺乏 JSDoc 警示"参数不可来自用户输入"；(2) 未来若某路由误将用户输入传入 `col`/`path`，将直接构成 SQL 注入。属防御性设计缺失。

### [R1-一般-5] KingbaseAdapter.tableInfo() 返回的 `dflt_value` 是 PostgreSQL 表达式，与 SQLite PRAGMA 格式不一致
- **位置**：`server/db/adapter/KingbaseAdapter.js:316-340`
- **描述**：迁移计划 §3.2 规定 `tableInfo(tableName)` 返回值统一为 PRAGMA 格式，字段含 `dflt_value (string|null)`。实现中 `dflt_value` 直接取 `column_default`，但对于 `SERIAL` 列该值为 `nextval('users_id_seq'::regclass)`，对于 `DEFAULT CURRENT_TIMESTAMP` 列为 `CURRENT_TIMESTAMP`，对于 `DEFAULT 0` 列为 `0`。而 SQLite PRAGMA 对应列返回字面量 `0`、`(datetime('now','localtime'))` 等。两者在 admin.js `get_table_schema` 工具展示时格式不一致，Dify AI 解读 schema 时可能产生混淆。属轻微信息不一致，不阻断功能。

### [R2-一般-1] admin.js: `query_table`/`update_record`/`delete_record` 的 WHERE 子句存在 SQL 注入风险
- **位置**：`server/routes/admin.js:269`（query_table）、`server/routes/admin.js:329`（update_record）、`server/routes/admin.js:348`（delete_record）
- **描述**：PR 版本直接通过字符串插值拼接 WHERE 子句：`if (params.where) sql += \` WHERE ${params.where}\`;`（update_record 为 `UPDATE ${params.table} SET ${setClause} WHERE ${params.where}`，delete_record 为 `DELETE FROM ${params.table} WHERE ${params.where}`）。main 分支（PR#13）已通过 `parseWhereClause` + `splitByAnd` 函数对 WHERE 子句进行白名单校验（仅允许 `column = value AND column = value` 模式），PR 基于较早 main（commit e202101）遗漏了此修复。同时迁移计划 §9.2 v16 新增要求 Phase 1 应使用 `node-sql-parser` 解析 WHERE 子句 AST 进行基础防护。当前实现下，若 Dify AI 被恶意 prompt 操纵生成含注入代码的 WHERE 子句（如 `1=1 UNION SELECT password FROM users`），将绕过参数化查询保护直接执行。scope.md T15 v16 安全测试用例（`where: "1=1; DROP TABLE users;--"`）将无法通过。

### [R2-一般-2] plan.js: 缺少幂等检查机制（`checkIdempotent`）
- **位置**：`server/routes/plan.js:12-68`（`/generate` handler 全部）
- **描述**：main 分支（PR#13）通过 `lastGenerateRequest` Map + `checkIdempotent(userId)` 实现 30 秒内幂等保护，且 G12 修复将检查移至 Dify API 调用之前以节省配额。PR 版本完全没有此机制，用户快速重复点击将触发多次 Dify 调用，浪费 API 配额。迁移计划 §8.5 v4 进一步建议将 `checkIdempotent()` 移至 Dify 调用之前并配合 `FOR UPDATE` 缩短竞态窗口。`articles.js` 已实现类似机制（`recentGenerates` Map，第 14、85-89 行），`plan.js` 缺失不一致。

### [R2-一般-3] plan.js: 缺少 `parsePlanOutput` 重试机制，方案解析鲁棒性不足
- **位置**：`server/routes/plan.js:24-33`（`/generate`）、`server/routes/plan.js:108-117`（`/adjust`）
- **描述**：PR 版本使用简单的 `JSON.parse` + `parsePlanOutput` 回退：`try { planItems = JSON.parse(outputsText); } catch (e) { planItems = parsePlanOutput(outputsText); }`。main 分支（PR#13）的 `parsePlanOutput` 接收 4 个参数 `(text, workflowKey, callWorkflowBlocking, inputs)`，内部实现 Dify 重试逻辑，解析失败时再次调用 Dify 获取规范 JSON。PR 版本的 `parsePlanOutput(outputsText)` 仅接收文本参数，无重试能力，解析失败时直接抛出 502 错误。在 Dify 输出格式不稳定时，PR 版本的方案生成成功率低于 main。

### [R2-一般-4] plan.js: 响应格式缺少方案分类，与前端契约不一致
- **位置**：`server/routes/plan.js:64`（`/generate` 响应）、`server/routes/plan.js:146`（`/adjust` 响应）
- **描述**：PR 版本返回 `{ plan_id, items: newPlans }`，其中 `items` 为扁平数组。main 分支（PR#13）按 `plan_type` 分类返回 `{ plan_id, diet_plans, exercise_plans, other_plans }`，这是 PR#13 确立的前端契约，可能导致前端无法正确渲染分类方案。`/current` 端点同样存在此问题（PR 返回扁平 `rows`，main 返回分类结构）。

### [R2-一般-5] plan.js: `/current` 未处理空方案情况，响应格式与 main 不一致
- **位置**：`server/routes/plan.js:70-81`
- **描述**：当用户尚未生成方案时，PR 版本返回空数组 `[]`，而 main 分支（PR#13）返回 `{ success: true, data: null, message: '尚未生成方案，请先完成风险预测或直接生成方案' }`。前端依赖 `data: null` 判断"无方案"状态，PR 版本返回空数组会导致前端逻辑异常。此外 main 版本响应包含 `generated_at` 字段，PR 版本缺失。

### [R2-一般-6] plan.js: `/adjust` 缺少健康信息存在性检查
- **位置**：`server/routes/plan.js:89-101`
- **描述**：PR 版本在查询 `user_risk_info` 后使用默认值（age:30, gender:'male', height:170, weight:65）：`const healthRow = await adapter.queryOne(...);` 后直接使用 `healthRow ? healthRow.age : 30`。main 分支（PR#13）在 `!latest` 时抛出 422 错误：`if (!latest) throw new AppError(422, 'VALIDATION_ERROR', '请先完成风险预测或提供健康信息');`。PR 版本允许未完成风险评估的用户直接调整方案，使用虚构的默认健康信息调用 Dify，生成的方案可能与用户实际情况不符。

### [R2-一般-7] admin.js: `query_table` 的 `order_by` 字符串插值存在注入风险
- **位置**：`server/routes/admin.js:270`
- **描述**：`if (params.order_by) sql += \` ORDER BY ${params.order_by}\`;` 直接拼接 `order_by` 参数。虽然 `ORDER BY` 注入风险低于 `WHERE`（不易执行 DML），但恶意构造的 `order_by` 仍可能通过子查询泄露数据（如 `id; SELECT password FROM users` 在某些场景下可能生效）或导致查询错误。main 分支未对 `order_by` 做校验，属于 pre-existing 问题，但 PR 在缺少 `parseWhereClause` 的同时也没有 `order_by` 校验，风险叠加。

---

## 附：admin.js / plan.js 冲突解决说明

`server/routes/admin.js` 与 `server/routes/plan.js` 存在与 main 的合并冲突，根因是 PR 基于较早 main（commit `e202101`），之后 main 合并了 PR #13（fix review issues）与批次8修复（commit `ff4619c`、`fc167e7`），这些修复也改动了这两个文件。

冲突解决需同时完成两类改动：
1. **保留 main 的 PR#13 功能修复**：`plan.js` 的幂等检查（`checkIdempotent`）、`parsePlanOutput` 重试机制、响应分类结构（`diet_plans/exercise_plans/other_plans`）、`/current` 空方案处理、`/adjust` 健康信息检查；`admin.js` 的 `parseWhereClause`/`splitByAnd` WHERE 子句白名单校验。
2. **叠加 PR 的金仓迁移改造**：`db.prepare` → `adapter.query/queryOne/execute` 异步化、`FOR UPDATE` 行级锁、KingbaseES 下禁用 `sql` 模式、`insertAdminLog` 接收 adapter 参数等。

推荐顺序：先以 main 当前版本为基础，再在其上应用金仓迁移改造，确保 PR#13 的修复不丢失，同时修复本清单中的严重/一般问题。
