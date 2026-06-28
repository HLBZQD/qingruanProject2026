# 技术方案审查报告（v3）

## 审查结果

REJECTED

## 逐维度审查

### 1. 技术准确性

**[通过]** 驱动选型准确：`pg`（node-postgres）是 KingbaseES（PostgreSQL 兼容）的标准驱动，`pg.Pool` 原生支持连接池，技术参数（stars、API 风格）与实际情况一致。

**[通过]** 项目依赖验证：`bcryptjs`（v2.4.3）、`node-sql-parser`（v5.4.0）、`better-sqlite3`（v12.11.1）均在 package.json 中存在，与方案描述一致。

**[通过]** SQLite 配置验证：`database.js` 确实使用 WAL 模式、外键约束、busy_timeout=5000，与方案 7.1 节描述一致。

**[通过]** `CURRENT_TIMESTAMP` 兼容性：SQLite 3.38+（better-sqlite3 v12 内嵌 SQLite 3.46+）确实支持 `CURRENT_TIMESTAMP`，与方案 4.2 节决策一致。

**[通过]** `pg.Pool.query()` 单语句限制：`pg` 驱动单次 `query()` 确实只执行一条 SQL，方案对此进行了正确识别和处理（3.3 节 init 方法）。

**[通过]** `statement_timeout` 配置方式：方案正确识别了 `statement_timeout` 是 PostgreSQL 服务端参数而非 `pg.Pool` 构造函数配置键，并给出了三种正确设置方式（7.2 节）。

**[通过]** `information_schema.columns` 表存在性：PostgreSQL/KingbaseES 确实提供该系统视图，方案中的查询 SQL 语法合理。

**[通过]** 路由层代码验证：
- `admin.js:332` 确实使用 `PRAGMA table_info(${params.table})`，方案已将其映射为 `adapter.tableInfo()`
- `plan.js:48,176` 确实使用 2 处 `db.transaction()`，`datetime('now','localtime')` 使用于第 50、178 行
- `punch.js:32` 确实使用 `SELECT last_insert_rowid()`，第 125 行使用 `datetime('now', 'localtime', '-7 days')`
- `risk.js:153-156` 确实使用 `json_extract(result, '$.xxx')` 和 `CAST(json_extract(...) AS INTEGER)`
- 上述模式均被方案准确覆盖

**[一般]** `punch_type` 和 `life_plans.plan_type` 列的中文/英文枚举值差异未被方案 9.1 节对比表覆盖。具体如下：

- **`punch_in.punch_type` 列**：`init.sql` 中 CHECK 约束为 `IN ('diet', 'exercise')`（英文），而 `init_kingbase.sql` 中为 `IN ('饮食', '运动')`（中文）。方案 9.1 节仅列出了 `completion_status` 列的同类中文/英文差异（行 439），漏掉了 `punch_type` 列。
- **`life_plans.type`（即 `plan_type`）列**：`init.sql` 中 CHECK 约束为 `IN ('diet', 'exercise', 'other')`（英文），而 `init_kingbase.sql` 中为 `IN ('饮食', '运动', '其他')`（中文）。方案 9.1 节仅列出了列名差异（`plan_type` vs `type`，行 436），未覆盖 CHECK 约束内枚举值的中文/英文差异。

应用代码中 `punch.js:50` 筛选 `['diet', 'exercise']`，`plan.js` 全程使用 `'diet'/'exercise'/'other'` 等英文值。若 init_kingbase.sql 按当前中文枚举值建表，所有 punch_type / plan_type 相关查询将因值不匹配而静默返回空结果，造成功能故障。方案 9.2 节虽声明"以 init.sql 为基准，重写 init_kingbase.sql"，但 9.1 对比表已显式列出了 `completion_status` 的中文/英文差异作为需修正项——漏列 `punch_type` 和 `plan_type` 的同类差异会误导实现者认为仅 `completion_status` 需要处理。

**[轻微]** `init_kingbase.sql` 缺少 16 个索引未在 9.1 节对比表中显式列出。`init.sql` 第 134-152 行定义了 16 个索引（含 UNIQUE INDEX 和普通 INDEX），而 `init_kingbase.sql` 中无任何索引定义。方案 9.2 节翻译规则表已包含 `UNIQUE INDEX` 作为"保持（兼容）"项，且设计决策是"重写 init_kingbase.sql"，因此完整实现时会补上索引。但 9.1 差异清单未显式标记此项缺失，实现者可能因对比表无相关行而遗漏部分普通索引。

### 2. 完备性

**[通过]** 需求覆盖度：`requirement.md` 列出的 10 个技术问题均有对应章节回应：
1. 驱动选型（第 2 节）
2. 数据库访问层改造（第 3 节）
3. SQL 方言差异（第 4 节）
4. 双数据库支持策略（第 5 节）
5. 渐进式迁移路径（第 6 节）
6. 连接池管理（第 7 节）
7. 事务处理（第 8 节）
8. init_kingbase.sql 评估（第 9 节）
9. 环境配置（第 10 节）
10. 前端无变动（第 12 节）

**[通过]** 数据流闭环完整：从环境变量配置（第 10 节）到 adapter 实例化（3.4 节）、初始化（10.3 节流程图）、路由层调用（3.5 节）到方言翻译（4.2 节），形成了完整的数据访问链路。

**[通过]** 风险覆盖：第 13 节风险表列出了 8 项风险及缓解措施，覆盖了同步转异步、时区语义、连接不可用、数据迁移、分号分割、占位符转换、statement_timeout 静默忽略等关键风险点。

**[通过]** 迁移路径完备：第 11 节数据迁移方案包含了迁移顺序（FK 约束依赖）、时区转换（9 个表的 datetime 字段）、密码哈希迁移策略。

### 3. 可操作性

**[通过]** 适配层接口定义清晰：3.1 节 `DatabaseAdapter` 接口的 7 个方法（query/queryOne/execute/transaction/tableInfo/healthCheck/close）均有明确签名和返回值说明，实现者可直接编码。

**[通过]** 具体实现要点充分：
- SqliteAdapter（3.2 节）：明确了 Promise 包裹策略、execute() 映射关系、transaction() 实现方向
- KingbaseAdapter（3.3 节）：明确了参数占位符转换（状态机方案含字符串跳过逻辑）、INSERT ID 获取（node-sql-parser AST 解析+正则回退）、init() 多语句执行（分号分割含注释/字符串处理）、transaction() 实现（pool client 生命周期）、tableInfo() 实现（完整 information_schema 查询 SQL）

**[通过]** SQL 方言翻译规则具体：4.2 节方言辅助函数表给出了每个函数的 SQLite 端输出和 KingbaseES 端输出的具体 SQL 片段，实现者无需自行推导。

**[通过]** 文件变更清单详尽：第 14 节按操作类型（新建/改造/重写/更新/不变）列出了所有受影响的文件及每文件的改动要点，实现者可按清单逐项推进。

**[通过]** 分阶段验收标准明确：Phase 0-3 每个阶段都有具体的验收标准（如 Phase 0"所有现有功能在 SQLite 下行为不变，无回归"），可据此判断阶段完成情况。

**[轻微]** 参数占位符 `?` 到 `$N` 转换的状态机描述未提及 SQL 注释（`--`、`/* */`）处理。方案 3.3 节状态机仅处理了单引号字符串字面量和转义单引号，但未说明注释中出现的 `?` 是否会被误转换。实际影响较小——路由层代码中 SQL 字符串不包含注释，且 init_kingbase.sql 的多语句分割步骤（3.3 节第 136 行）已独立处理了注释移除。此处建议补充一句"运行时路由层 SQL 不含注释，无需额外处理"以消除歧义。

## 修改要求（仅 REJECTED 时存在）

- **问题**：`punch_in.punch_type` 列和 `life_plans.type`（plan_type）列的中文/英文枚举值差异未在 9.1 节 schema 对比表中列出。`init.sql` 使用英文值（`'diet'/'exercise'` 和 `'diet'/'exercise'/'other'`），`init_kingbase.sql` 使用中文值（`'饮食'/'运动'` 和 `'饮食'/'运动'/'其他'`），而应用代码（punch.js、plan.js）全程使用英文值进行查询和筛选。

- **原因**：若实现者仅按 9.1 节对比表修正差异（当前仅列出 `completion_status` 的中文/英文差异），`punch_type` 和 `plan_type` 的 CHECK 约束将保留中文值。应用代码查询 `punch_type = 'diet'` 时，数据库存储的是 `'饮食'`，导致匹配失败、功能静默故障。由于 `completion_status` 的同类问题已被列出，遗漏另外两个列会形成误导。

- **建议方向**：在 9.1 节对比表中为 `punch_in` 表新增一行"枚举值差异 | `punch_type CHECK IN ('diet', 'exercise')` | `CHECK IN ('饮食', '运动')` | 统一为英文值"，为 `life_plans` 表新增一行"枚举值差异 | `plan_type CHECK IN ('diet', 'exercise', 'other')` | `type CHECK IN ('饮食', '运动', '其他')` | 统一为英文值"。同时可在 9.2 节对齐策略中统一声明"所有 CHECK 约束的枚举值以 init.sql 英文值为准"。
