# 技术方案审查报告（v1）

## 审查结果

APPROVED

## 逐维度审查

### 1. 技术准确性

**[通过]** 驱动选型 `pg`(node-postgres) 真实存在，33k+ stars，内置 `pg.Pool` 连接池，与 KingbaseES PostgreSQL 兼容协议匹配。项目当前已有 `bcryptjs`(v2.4.3)、`node-sql-parser`(v5.4.0) 依赖，无需新增额外包。

**[通过]** SQL 方言差异清单（4.1 节）与项目实际代码一致：`risk.js:152-157` 确实使用 `json_extract(result, '$.risk_score')`；`plan.js:54-57` 确实使用 `SELECT COALESCE(MAX(plan_id), 0) + 1`（无 FOR UPDATE）；`admin.js:332` 确实使用 `PRAGMA table_info(${params.table})`；`punch.js:125` 确实使用 `datetime('now', 'localtime', '-7 days')`。

**[通过]** `init_kingbase.sql` 与 `init.sql` 的差异分析（10.1 节）逐表对比结果与两个实际文件完全吻合：`DROP TABLE IF EXISTS CASCADE`（第9-18行）、`user_risk_info` 缺少 `result` 列（第78-93行）、中文枚举值 `'饮食'/'运动'/'其他'`（第100/124-127行）、`admin_user_id` vs `operator_id` 列名差异（第136行）、硬编码 bcrypt 哈希（第150行）、索引完全缺失。18项差异逐条可验证。

**[通过]** 技术决策的核心依据均可验证：`CURRENT_TIMESTAMP` 在 SQLite 3.38+ 和 KingbaseES 均受支持；`CREATE TABLE IF NOT EXISTS` 为 PostgreSQL 标准语法；`SERIAL PRIMARY KEY` 为 PostgreSQL 自增主键标准；`SELECT ... FOR UPDATE` 在 SQLite 3.33+ 和 PostgreSQL 均有效；`pg.Pool.on('error')` 事件是 node-postgres 标准 API；`statement_timeout` 通过连接字符串 `options` 参数传递是 PostgreSQL 标准做法。

**[通过]** 项目实际架构验证：`server.js:3` 当前同步调用 `initDatabase()`，方案正确识别需改为 `await initDatabase()`；`database.js` 当前导出 `{ db, initDatabase }`，方案改为 `{ getAdapter, initDatabase }` 的路径合理；13 个路由文件中 11 个涉及数据库访问（`upload.js` 和 `index.js` 除外），方案对 async 改造范围的逐文件分析准确。

**[轻微]** `pg_dump` 工具名称：KingbaseES 官方逻辑备份工具为 `sys_dump` 而非 PostgreSQL 的 `pg_dump`。虽然 PostgreSQL 的 `pg_dump` 可能因协议兼容而可用，但生产运维应使用 KingbaseES 官方工具链。方案中第 12 节、13.3 节、16 节均引用 `pg_dump`。建议改为 `sys_dump`（或注明 `pg_dump` 兼容性前提）。

**[轻微]** `RETURNING id` 追加的 regex 回退路径：3.4.4 节描述 node-sql-parser 解析失败时回退到正则 `/^\s*INSERT\s+/i.test(sql)` 并追加 `RETURNING id`，但该回退分支未检查原始 SQL 是否已含 `RETURNING` 子句（主分支有此检查）。虽然路由层实际 INSERT 语句不大可能自带 `RETURNING`，但防御性不完整。建议回退分支同样增加 `RETURNING` 子句存在性检查。

### 2. 完备性

**[通过]** 用户需求 10 个技术问题逐项覆盖：驱动选型（第2节）、访问层改造（第3节）、方言差异（第4节）、双库策略（第5节）、渐进迁移（第6节）、连接池（第7节）、事务处理（第8节）、init_kingbase.sql 评估（第10节）、环境配置（第11节）、前端确认（第14节）。每个问题均有明确的决策结论和实施方向。

**[通过]** 上一轮诊断报告（b_v1_diag_v2.md）识别的全部 20 个问题（3 严重 + 8 一般 + 9 轻微）均在本版方案中有对应修订条目（R1-R20），修订说明与方案正文一致。7 个跨轮持续问题（问题1-7）均得到实质性处理。

**[通过]** 数据流闭环完整：适配层接口定义 → 具体适配器实现 → database.js 初始化 → 路由层改造 → 方言辅助函数 → 双 DDL 脚本 → 数据迁移 → 环境配置，全链路可追踪，无断点。

**[通过]** 非功能性维度（安全、监控、运维）从上一轮的"22 项检查 9 项完全缺失"改进为第 13 节的三维度完整覆盖（5+5+7 项），每项含决策和实现位置。

**[轻微]** "前端代码零变动"声明与 UTC 时区变更存在表面矛盾：第 1 节和第 14 节声明"前端代码零变动"，但第 4.2 节和 Phase 0 验收标准要求"前端负责将 UTC 转换为用户本地时区显示"。如果前端当前仅原样展示 API 返回的时间字符串（`"2025-06-28 14:30:00"`），切换到 UTC 格式（`"2025-06-28T06:30:00.000Z"`）后不做转换将显示错误时间（差 8 小时）。第 4.2 节和第 6 节 Phase 0 验收标准已足够详细地说明了此行为变更和前端职责，实现者应能据此确定是否需要前端改动。建议在第 14 节增加一句"前提：前端需确认/增加 UTC→本地时间的展示转换逻辑"，以消除两处"零变动"声明的字面矛盾。

### 3. 可操作性

**[通过]** 文件变更清单（第 16 节）细粒度到逐文件操作类型（新建/改造/重写/更新/不变），共 23 行条目，实现者可直接对照执行。

**[通过]** 路由层改造（3.6 节）提供逐文件 handler 的 async 标记清单（表格含文件、handler 名称、原因），并特殊标出 plan.js 的 FOR UPDATE 改动、admin.js 的 sql 模式禁用、punch.js 的应用层日期计算等例外处理。

**[通过]** Phase 0→1→2→3 渐进迁移路径每阶段有独立且可操作的验收标准。Phase 2 回滚方案包含 4 步具体操作（含数据回退注意事项）。

**[通过]** 接口定义（3.2 节）每个方法含完整的签名、职责、幂等要求、失败行为约定，实现者无需自行推断契约。

**[通过]** 关键实现细节有决策和备选方案：`statement_timeout` 配置提供三种方式并推荐方式一（连接字符串 options 参数）；`init()` 多语句分割提供状态机+备选拆分文件的降级方案；占位符转换提供状态机方案并分析为何不处理注释。

**[通过]** 风险表（第 15 节）从上一轮的 8 项扩展到 18 项，每项含影响描述和具体缓解措施，新增风险均对应方案中的决策章节。

## 修改要求

无。审查结论为 APPROVED，不含严重或一般问题。上述 3 条轻微建议不阻塞实现启动，可在实施过程中逐项确认。
