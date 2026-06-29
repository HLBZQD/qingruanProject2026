# 技术方案审查报告（v1）

## 审查结果

APPROVED

## 逐维度审查

### 1. 技术准确性

**[通过]** pg (node-postgres) 作为 KingbaseES 驱动选型正确。pg 是 PostgreSQL 生态标准驱动，KingbaseES V8R6 基于 PostgreSQL 12 兼容内核，pg.Pool 原生支持连接池。项目已有依赖 node-sql-parser (v5.4.0) 可用于 SQL 方言解析。

**[通过]** SQL 方言差异清单（第4.1节）覆盖了所有项目实际使用的 SQLite-ism：`datetime('now','localtime')`、`json_extract()`、`last_insert_rowid()`、`PRAGMA table_info()`、`INTEGER PRIMARY KEY AUTOINCREMENT` 等，且对应的 PostgreSQL/KingbaseES 替代写法准确。`date(column)` 列提取函数的跨数据库兼容性确认（第4.1节 v7 补充）经核实正确——SQLite 和 PostgreSQL 的 `date(timestamp_expr)` 均返回 `YYYY-MM-DD` 格式。

**[通过]** `sql.formatDateParam()` 使用 UTC 方法（`getUTCFullYear()` 等）的实现逻辑（第4.2节 v8 修订）与 `CURRENT_TIMESTAMP` 的 UTC 输出语义一致，消除了本地时区依赖。`.toISOString()` 不兼容性分析（ISO 8601 `T` 分隔符与 SQLite/KingbaseES `CURRENT_TIMESTAMP` 输出格式在字符串比较时的不兼容）分析准确。

**[通过]** `FOR UPDATE` 行级锁方案（第8.5节）对 PostgreSQL/KingbaseES READ COMMITTED 隔离级别下的行为描述准确。v9 新增的首次方案生成边缘场景分析——`UPDATE` 影响零行不获取行级锁、`FOR UPDATE` 空结果集不获取行级锁——与 PostgreSQL 文档行为一致。

**[通过]** UNIQUE 约束方案（`CREATE UNIQUE INDEX IF NOT EXISTS idx_life_plans_user_plan ON life_plans(user_id, plan_id)`）在 SQLite 和 KingbaseES 中均兼容，作为 FOR UPDATE 的数据库层补充防线，技术正确。

**[通过]** SSL/TLS 配置（第3.4.7节）中 pg.Pool 的 `ssl` 参数结构准确。连接池 `pool.on('error')` 事件监听（第3.4.2节）是 pg.Pool 的已知必要配置，不监听会导致未捕获异常和进程崩溃。

**[通过]** `statement_timeout` 通过连接字符串 `options` 参数传递（第7.2.1节）是 PostgreSQL 协议的标准做法，配置方式正确。三种方式的对比分析准确（方式一连接字符串最简单可靠）。

**[通过]** `proxyDifySSE` 硬编码 `inputs: {}` 的问题诊断（第9.2节 v9 新增）准确——经核实项目代码 `server/services/sseProxy.js` 第26行确为 `inputs: {},`。修复方案（扩展函数签名增加 `inputs` 参数，admin.js `/chat` 路由传入 `db_type`）技术正确且向后兼容（默认值 `{}` 保证现有调用方不受影响）。

**[通过]** 整体技术选型（不引入 ORM/Knex、构建轻量适配层、保持原始 SQL、渐进式三阶段迁移）与项目当前技术栈（Express.js + better-sqlite3 + 原始 SQL）匹配度高，技术路径可行。

### 2. 完备性

**[通过]** 原始用户需求（`requirement.md`）中的10个技术问题全部有明确决策和方案说明：
1. 驱动选型 → 第2节（pg）
2. 数据库访问层改造 → 第3节（适配层）
3. SQL 方言差异 → 第4节（sql.js 方言辅助模块）
4. 双数据库支持策略 → 第5节（环境变量切换）
5. 渐进式迁移路径 → 第6节（Phase 0/1/2/3 四阶段）
6. 连接池管理 → 第7节（pg.Pool 配置）
7. 事务处理差异 → 第8节（adapter.transaction()）
8. init_kingbase.sql 评估与完善 → 第10节（完整差异分析与对齐策略）
9. 环境配置 → 第11节（.env 字段设计、凭据安全、启动校验）
10. 前端无变动 → 第14节（前端确认）

**[通过]** 本轮迭代要求（`a_v7_iteration_requirement.md`）中提出的4个问题全部在 v9 方案中得到解决：
1. `proxyDifySSE` 硬编码 `inputs: {}` → 第9.2节新增修复子节，第15节新增风险项，第16节新增文件变更条目
2. `FOR UPDATE` 首次方案生成场景失效 → 第8.5节新增边缘场景分析，UNIQUE 约束方案，第10.1节、第15节、第16节同步更新
3. Health 端点响应格式兼容性矛盾 → 第13.2节明确向后兼容格式（保留 `success`/`message`，新增 `status`/`database`），第14节新增"已知例外"声明
4. punch.js handler 数量统计偏差 → 第3.6节修正为"全部3个handler（1 POST + 2 GET）"，经核实项目代码确认

**[通过]** 持续性问题 `/health` 端点相关矛盾在三轮迭代中逐步演化并最终解决：从"是否纳入范围"的边界问题（第2轮）→ 响应格式兼容性（第6轮/本轮）→ v9 彻底解决（保留旧字段 + 新增字段 + 已知例外声明）。

**[通过]** 数据流形成完整闭环：路由层 → adapter 统一接口 → 方言辅助模块(sql.js) → 适配层(SqliteAdapter/KingbaseAdapter) → 数据库。事务、健康检查、表结构查询、init() 初始化等横切关注点均有覆盖。

**[通过]** 非功能性维度覆盖全面：安全（第13.1节，5个维度）、监控与可观测性（第13.2节，6个维度）、运维（第13.3节，8个维度）、风险与缓解（第15节，45+个风险项）。

**[通过]** 工程可行性得到保障：Phase 0 双导出过渡策略（第3.5.2节）解决了 database.js 改造与路由文件逐文件自测的原子性矛盾；Phase 0/Phase 2 互斥关系（第4.2节）解决了双重时区转换冲突；手工回归测试清单（第5.1.1节）弥补了缺少自动化测试的空白。

### 3. 可操作性

**[通过]** 每一项技术决策都有明确结论，不存在"待定"或"需进一步讨论"的未决项。所有选型（pg vs pg-promise、ORM vs 适配层 vs Knex、TEXT vs JSONB、Phase 0 是否执行 UTC 脚本、ddl/种子文件是否拆分）均给出了推荐方案及理由。

**[通过]** 实现者可以明确知道"做什么"和"怎么做的大方向"：
- 适配层接口定义（第3.2节）给出了完整的方法签名和契约
- KingbaseAdapter 实现要点（第3.4节）覆盖了构造配置、连接池错误处理、启动行为、参数占位符转换状态机、INSERT ID 获取策略、事务连接释放保护、init() 多语句执行、SSL/TLS 配置
- SqliteAdapter 实现要点（第3.3节）明确了 async 函数体声明策略
- 方言辅助函数表（第4.2节）列出了每个函数的 SQLite/KingbaseES 输出对照
- 文件变更清单（第16节）逐文件标注了操作类型（新建/改造/重写/不变）和具体变更说明，共覆盖33个文件条目
- Phase 0 过渡策略（第3.5.2节）给出了6步执行顺序和 git 操作建议

**[通过]** 技术引用具体：npm 包名（pg ^8.12）、KingbaseES 目标版本（V8R6+）、环境变量名称、SQL 语句示例、代码轮廓均有提供。

**[通过]** 风险表的45+个风险项均标注了影响和缓解措施，实现者可在遇到问题时快速定位对应风险项和处理方案。

**[轻微]** `sql.formatDateParam()` 的实现逻辑描述使用了 UTC 方法，但实现者需注意 `Date.getUTCMonth()` 返回 0-based 月份（0=1月），拼接时需 +1。此细节在方案中未显式提醒，但属于 JavaScript 标准 API 常识，不构成实现障碍。

**[轻微]** UNIQUE 约束方案的错误处理（捕获 SQLSTATE 23505 unique_violation 返回 409）在第8.5节有文字描述，但未在第16节文件变更清单的 plan.js 条目中显式标注需要新增此错误处理逻辑。实现者可自行推断，不构成路径不清。

## 修改要求

无。本方案通过审查，不含严重或一般问题。
