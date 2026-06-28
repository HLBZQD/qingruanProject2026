# 技术方案审查报告（v1）

## 审查结果

APPROVED

## 逐维度审查

### 1. 技术准确性

**[通过]** 驱动选型：`pg`（node-postgres）连接 KingbaseES，社区成熟度最高（33k+ stars），`pg.Pool` 原生支持连接池，KingbaseES 官方推荐 PostgreSQL 兼容驱动。`pg` 是 `pg-promise` 的底层依赖，选 `pg` 无功能损失。

**[通过]** 方言统一策略：`sql.now()` 统一输出 `CURRENT_TIMESTAMP`，SQLite 3.38+ 和 KingbaseES（PostgreSQL 12 兼容内核）均原生支持。`sql.jsonField()` 映射 `json_extract` → `::jsonb->>` 语法正确。`sql.jsonFieldAs()` 的 PostgreSQL `(${col}::jsonb->>'${path}')::${type}` 写法有效。参数占位符 `?` → `$1` 转换的状态机方案可行，跳过字符串字面量内 `?` 的逻辑正确。经核实项目 `risk.js` 实际使用 `json_extract(result, '$.risk_score')` 等 4 处 JSON 提取，`articles.js`、`plan.js`、`user.js`、`punch.js` 使用 `datetime('now','localtime')`，`punch.js` 使用 `last_insert_rowid()`，方案覆盖所有方言差异点。

**[通过]** 适配层接口设计：`init()`、`query()`、`queryOne()`、`execute()`、`transaction()`、`tableInfo()`、`healthCheck()`、`close()` 方法签名覆盖了项目 `database.js` 当前暴露的能力（prepare/run/get/all/transaction/close）以及额外需要的跨数据库抽象（tableInfo 替换 PRAGMA，healthCheck 替换静态 JSON）。

**[通过]** `node-sql-parser`：项目 `package.json` 已安装 v5.4.0 依赖，用于 INSERT 检测并自动追加 `RETURNING id`，方案正确。该库支持 PostgreSQL 方言解析，正则回退方案合理。

**[通过]** `bcryptjs`：项目已安装 v2.4.3，用于运行时生成 `admin123` 哈希替换占位符，与 SQLite 种子机制一致。

**[通过]** `SELECT ... FOR UPDATE`：SQLite 3.33+ 语法兼容（no-op），KingbaseES READ COMMITTED 下行级锁有效。方案正确分析了两数据库的行为差异。

**[通过]** JSONB 决策：KingbaseES（PostgreSQL 兼容）原生支持 JSONB 类型和 GIN 索引，`->>` 和 `@>` 运算符。方案对比 TEXT vs JSONB 后选择 JSONB，理由充分（查询性能、索引支持）。

**[通过]** `information_schema.columns` PK 检测查询：SQL 语法正确，适用于本项目全部 10 张表单列主键场景。

**[通过]** `setval()` 序列重置：PostgreSQL 标准函数，语法和参数语义（第三个参数 `false`）正确。

**[通过]** IIFE + async/await 启动模式：不改变 CJS 模块系统，所有 Node.js 版本兼容（含 12.x）。方案对比了三种顶层 await 方案的优劣，推荐合理。

**[通过]** SSL/TLS `pg.Pool` 配置：`ssl` 参数结构正确（`rejectUnauthorized` 等字段均为 `pg` 支持的选项）。

**[通过]** `pool.on('error')` 事件处理：`pg.Pool` 在空闲连接异常断开时触发 `error` 事件，不监听会导致进程崩溃。方案给出的处理策略正确。

**[通过]** `statement_timeout` 通过连接字符串 `options` 参数传递：这是 PostgreSQL/KingbaseES 服务端参数的正确设置方式，直接写在 Pool 构造对象中会被静默忽略。方案的三种方式对比和 URL 编码说明准确。

**[通过]** 路由 handler async 改造范围：经核实项目当前 13 个路由文件中 11 个涉及数据库访问，`upload.js` 和 `index.js` 无数据库操作。方案清单与实际情况一致。

**[通过]** `init_kingbase.sql` 差异分析：经逐项核实 `init.sql`（SQLite 实际生产）与 `init_kingbase.sql`（当前文件），方案 10.1 节差异分析表中的所有差异项（`password_changed` 缺失、`created_at` vs `publish_time`、`views` vs `view_count`、中文枚举值、`DROP TABLE` 幂等问题、`result` 列缺失、索引缺失等）均准确。

**[通过]** Phase 0 UTC 转换脚本：`datetime(col, '-8 hours')` 是 SQLite 有效函数，脚本的 11 个 datetime 字段覆盖了全部含时间戳的表。脚本一次性执行的限制条件清晰。

**[轻微]** `sql.date()` 函数的时区语义：函数表中 SQLite 端输出 `date('now','localtime')`（本地日期），KingbaseES 端输出 `CURRENT_DATE::text`（服务器时区日期，通常 UTC）。在 Phase 0 全 UTC 迁移后，若有人使用 `sql.date()` 与 UTC 存储的字段比较，SQLite 端可能产生 8 小时偏差。不过方案已明确推荐 JS 端计算日期作为首选方案，`sql.date()` 的实际调用场景有限。建议在 `sql.date()` 文档中补充时区语义说明，或统一改为 UTC 语义与 `sql.now()` 保持一致。

**[轻微]** `node-sql-parser` 性能开销：每个 `execute()` 调用均需解析 SQL AST 判断是否为 INSERT，对写密集型操作有固定 CPU 开销。方案未讨论此开销的量级和可接受性。鉴于 `node-sql-parser` 已在项目依赖中且项目为中小型应用，此开销通常可忽略，但建议在 Phase 1 性能基准对比中增加关注。

### 2. 完备性

**[通过]** 原始需求 10 个技术问题的覆盖：驱动选型（第 2 节）、访问层改造（第 3 节）、SQL 方言差异（第 4 节）、双数据库支持（第 5 节）、渐进式迁移（第 6 节）、连接池管理（第 7 节）、事务处理适配（第 8 节）、init_kingbase.sql 评估与完善（第 10 节）、环境配置（第 11 节）、前端确认（第 14 节）。全部 10 个问题均有明确决策和实施方案。

**[通过]** 第 2 轮诊断报告 7 个问题的修复验证：

- **问题 1（server.js 启动流程）**：3.5.1 节新增完整改造轮廓，含 IIFE + async/await 代码、三种顶层 await 方案对比表、`app.listen()` 时序保证说明。16 节文件变更清单新增 `server.js` 行（标注"改造"）。**已修复。**

- **问题 2（Phase 0 混合时间戳）**：4.2 节新增"Phase 0 混合时间戳数据状态处理"子节，含一次性 UTC 转换脚本（11 个 datetime 字段完整 SQL）、执行前提（改造完成后/备份/仅一次）、Phase 0 验收标准补充前置步骤。15 节风险表新增对应风险项。**已修复。**

- **问题 3（/health 端点矛盾）**：13.2 节确认纳入范围，16 节 `server/routes/index.js` 从"不变"改为"改造"（标注 `/health` 端点增强）。**已修复。**

- **问题 4（plan.js 批量 INSERT 性能）**：8.2 节新增网络性能影响分析（含延迟对比表）、多行 VALUES 批量写入缓解方案、参数数量分析。6 节 Phase 1 验收标准新增性能基准对比第 5 条。15 节风险表新增对应风险项。**已修复。**

- **问题 5（迁移验证深度）**：12.1 节新增 7 维度验证清单（行数/抽样/FK/非空/JSON/SERIAL），每维度标注检查方法和验收标准。新增 dry-run 说明和逆向迁移脚本框架。16 节新增 `scripts/migrate-reverse-to-sqlite.js`。**已修复。**

- **问题 6（JSON 列类型决策）**：10.1 节差异分析表新增"JSON 列类型未决策"行。10.2 节新增 TEXT vs JSONB 对比表和决策（JSONB + GIN 索引）。12 节新增 JSON 合法性校验步骤。**已修复。**

- **问题 7（事务内 DDL 兼容性）**：3.4.5 节新增验证 SQL 脚本和影响分析。推荐拆分 DDL/种子文件为首推方案。15 节风险表新增对应风险项。**已修复。**

**[通过]** 第 1 轮诊断报告 12 个问题的修复持续有效：`user_risk_info.result` 列已补充、`DROP TABLE IF EXISTS` 已改为 `CREATE TABLE IF NOT EXISTS`、admin `/execute` 动态 SQL 方言讨论完整（第 9 节）、适配层文件结构已统一、`init()` 方法签名已补充、SERIAL 序列重置已涵盖、async 改造范围清单已明确、Phase 0 时间戳语义已标注、`FOR UPDATE` 并发安全已给出、SSL/TLS 配置已补充、连接池错误处理已完善、CI 测试和版本一致性已讨论。所有第 1 轮修复在 v3 中保持完整。

**[通过]** 数据流完整闭环：请求进入 → Express 路由（async handler）→ `getAdapter()` 获取当前 adapter → adapter 方法（query/queryOne/execute/transaction）→ 方言辅助函数（sql.js）→ 底层驱动（better-sqlite3 / pg.Pool）→ 数据库 → 结果返回 → 响应 JSON。双数据库路径的每步均有明确说明。

**[通过]** 非功能性需求覆盖：安全（传输加密、凭据管理、最小权限、SQL 注入防护、日志脱敏，第 13.1 节）、监控（连接池指标、慢查询日志、连接池事件日志、健康检查、错误追踪，第 13.2 节）、运维（备份、停机时间、版本升级、字符集、性能基准、N+1 查询、双 DDL 同步，第 13.3 节）。覆盖全面。

**[通过]** 风险识别与缓解：18 个风险项（含 4 个 v3 新增），每个风险项均标注影响和缓解措施。风险覆盖了启动失败、数据迁移、并发安全、方言兼容、DDL 幂等、SSL/TLS、连接池异常、序列重置、混合时间戳、批量 INSERT 延迟、验证不充分、DDL 隐式提交等关键领域。

### 3. 可操作性

**[通过]** 文件变更清单明确：16 节列出 5 个新建文件、13 个改造文件、4 个重写/更新文件、5 个不变目录，每项标注具体改动内容。实现者可据此直接开工。

**[通过]** 分阶段验收标准可验证：Phase 0 含 8 条验收标准（含 UTC 转换脚本执行、API 响应一致性、业务流程完整性、前端时间显示正确性）、Phase 1 含 5 条验收标准（含性能基准对比指标）、Phase 2 含 4 条验收标准。每条标准均可客观判断通过/不通过。

**[通过]** 代码轮廓充分：`database.js` 改造（3.5 节）、`server.js` 改造（3.5.1 节）、KingbaseAdapter 构造配置（3.4.1 节）、连接池错误处理（3.4.2 节）、SSL/TLS 配置（3.4.7 节）、事务模式（8.2 节）、admin `/execute` sql 模式禁用（9.2 节）、时区转换（12 节）均给出了可操作的代码轮廓。实现者明确知道"写什么"和"怎么写的大方向"。

**[通过]** 技术引用具体：适配层接口方法签名完整（3.2 节）、`information_schema` PK 检测 SQL 完整（3.2 节）、`pg.Pool` 构造参数枚举完整（3.4.1 节）、环境变量全量列出（11.1 节）、`setval()` 全表模板给出（12 节）、`init_kingbase.sql` 翻译规则表完整（10.2 节）、方言差异表逐项标注（4.1 节）。实现者无需自行推断缺失信息。

**[通过]** 回退方案明确：Phase 2 含 4 步具体回退操作（改 DB_TYPE → 重启 → 验证 → 注意事项），逆向迁移脚本框架（v3 新增），DROP TABLE 独立脚本，SQLite 代码和文件保留至 Phase 3。

**[通过]** 依赖声明完整：`pg` ^8.12（新增依赖），`node-sql-parser`（已有，v5.4.0），`bcryptjs`（已有，v2.4.3），均已在 16 节和相应章节标注。

## 修改要求

（无。审查结果为 APPROVED，不含严重或一般问题。）
