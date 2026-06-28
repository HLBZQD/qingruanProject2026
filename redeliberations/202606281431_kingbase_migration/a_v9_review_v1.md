# 技术方案审查报告（v1）

## 审查结果

**REJECTED**

## 逐维度审查

### 1. 技术准确性

**[通过]** `pg` (node-postgres) 作为 KingbaseES 驱动选型合理，`pg` 是 `pg-promise` 的底层依赖，连接池 `pg.Pool` 原生可用，技术方案对其能力的描述与官方文档一致。

**[通过]** `bcryptjs`（v2.4.3）和 `node-sql-parser`（v5.4.0）均为项目 `package.json` 中已存在的依赖，方案对这两个库的使用方式（bcryptjs 运行时生成哈希、node-sql-parser 解析 SQL AST 检测 INSERT 语句）在库的能力范围内。

**[通过]** SSL/TLS 配置（`pg.Pool` 的 `ssl` 参数含 `rejectUnauthorized`）、连接池配置（`max/min/idleTimeoutMillis/connectionTimeoutMillis`）、`statement_timeout` 通过连接字符串 `options` 参数传递等技术手段均与 `pg` 驱动文档一致。

**[通过]** `dateRange.js` 工具模块输出的 `YYYY-MM-DDTHH:MM:SS` 格式（含 T 分隔符）在 PostgreSQL/KingbaseES 中的兼容性评估结论正确——ISO 8601 格式是 PostgreSQL TIMESTAMP 解析的标准输入格式，方案声明 `dateRange.js` 无需改造是合理的。

**[通过]** SQLite `AUTOINCREMENT` 与 PostgreSQL `SERIAL` 的语义差异分析（4.1 节 v11 补充）全面且准确：三个维度的对比（ID 重用策略、严格单调递增、回滚行为）符合两个数据库的实际行为；关键相似点分析和三点结论（ID 排序推断时间、无间隙假设、业务语义安全声明）逻辑严谨。

**[通过]** `FOR UPDATE` 行级锁方案的并发安全分析（8.5 节）正确——包括首次方案生成场景的边缘问题识别、UNIQUE 约束的数据库层防线方案、与 `/adjust` 操作的区分。

**[一般]** **`pg.types.setTypeParser` 中 timestamptz 的 OID 值错误。** 方案 3.4.8 节提供的代码示例使用 `pg.types.setTypeParser(1182, val => String(val))` 处理 timestamptz 类型，并标注注释"实际 KingbaseES 通常使用 1184"。

- **事实**：在标准 PostgreSQL 12（KingbaseES V8R6 的内核基础）中，`timestamptz` 的 OID 为 **1184**。OID 1182 不是标准 PostgreSQL 中任何常用类型的 OID。方案 3.4.8 节注意事项中声称"KingbaseES V8R6 基于 PostgreSQL 12 内核，OID 定义与 PostgreSQL 一致，上述 OID 值可安全使用"——这与代码示例中使用的 1182 自相矛盾：若 OID 与 PostgreSQL 一致，则 1182 必然不是 timestamptz 的正确 OID。
- **影响**：若实现者按代码示例使用 OID 1182，`setTypeParser` 将注册到一个不存在或不正确的类型上，timestamptz 列（如 `users.created_at`、`punch_in.punch_time` 等）仍会被 `pg` 驱动默认解析为 JavaScript Date 对象，JSON 序列化后变为 ISO 8601 格式，timestamp 格式一致性修复对 timestamptz 列无效。这直接违背方案第 14 节"前端代码零变动"的核心承诺（该节明确声称此措施是"关键保障"）。
- **说明**：方案已提供启动验证 SQL（`SELECT oid, typname FROM pg_type WHERE typname IN ('timestamp','timestamptz')`），若实现者执行此验证会发现正确 OID。但代码示例是方案的核心技术指导，其错误值构成对实现者的误导。修正方式：将代码示例中的 `1182` 改为 `1184`，或同时注册两个 OID、或明确说明实际 OID 必须通过启动验证动态获取（而非在示例中给出一个明知可能错误的值）。

**[通过]** 方案其余部分的技术性描述（适配层接口设计、`?` → `$N` 占位符转换的状态机方案、`init()` 多语句执行策略、`transaction()` 的 `try/catch/finally` 连接释放保护、`server.js` IIFE + async/await 启动流程、Phase 0 双导出过渡策略等）均技术合理。

### 2. 决策完备性

**[通过]** 原始用户需求（`requirement.md`）中列出的全部 10 个技术问题均得到明确决策和方案说明：
1. 驱动选型 → `pg`（第 2 节）
2. 数据库访问层改造 → 自定义适配层，不引入 ORM/Knex（第 3 节）
3. SQL 方言差异 → `sql.js` 方言辅助模块 + 两套 DDL 脚本（第 4 节、第 10 节）
4. 双数据库支持策略 → 开发 SQLite + 生产 KingbaseES（第 5 节）
5. 渐进式迁移路径 → Phase 0/1/2/3 四阶段（第 6 节）
6. 连接池管理 → `pg.Pool` 配置 + 大小确定方法（第 7 节）
7. 事务处理差异 → adapter.transaction() 统一 async 接口 + FOR UPDATE 并发安全（第 8 节）
8. `init_kingbase.sql` 评估与完善 → 10.1 节差异分析 + 10.2 节对齐策略（第 10 节）
9. 环境配置 → `.env` 字段设计 + 启动校验（第 11 节）
10. 前端无变动 → 确认声明 + 已知例外标注（第 14 节）

**[通过]** 数据流形成了完整闭环：前端 → Express 路由 → adapter 接口 → 具体数据库驱动（better-sqlite3 / pg.Pool）。适配层的 `query/queryOne/execute/transaction/tableInfo/healthCheck/close` 接口覆盖了项目所有数据库操作模式。

**[通过]** 不存在需要实现者自行探索但方案未提及的技术方向性问题。方案覆盖了数据迁移（第 12 节）、非功能性需求（第 13 节）、风险表（第 15 节）、文件变更清单（第 16 节）等完整维度。

### 3. 路径清晰性

**[通过]** 技术方案的每项决策均有明确结论。不存在"可选A或B，由实现者自行决定"的模糊表述——所有关键决策点（驱动选型、适配层架构、方言策略、事务模式、迁移路径、JSON 列类型等）均给出了明确选择及理由。

**[通过]** 实现者能从方案中明确知道"做什么"和"怎么做的大方向"。方案提供了大量代码轮廓（适配层接口定义、KingbaseAdapter 构造参数、transaction 实现轮廓、优雅关闭处理、Phase 0 双导出过渡 6 步顺序、server.js 改造轮廓等），且关键实现路径有足够的操作级指引。

**[通过]** 技术引用足够具体：npm 包版本（`pg` ^8.12）、目标数据库版本（KingbaseES V8R6+）、OID 值（1114）、文件路径、SQL 示例、环境变量名等均明确给出。

**[轻微]** 方案文档极其详细（2784 行），在保证了完备性的同时，对实现者快速定位核心任务构成信息检索负担。建议在文档开头增加"实现者快速导航"段落，按 Phase 列出各阶段的核心文件清单和关键决策摘要。此为非阻塞建议。

## 修改要求

- **问题**：3.4.8 节 `pg.types.setTypeParser` 代码示例中对 timestamptz 类型使用了错误的 OID 值 1182。标准 PostgreSQL 12 中 timestamptz 的 OID 为 1184。代码示例应使用 1184，而非 1182。

- **原因**：此错误会导致 timestamptz 列的类型解析器实际上未被正确注册，timestamp 格式一致性修复仅对 `timestamp` 类型生效，`timestamptz` 列仍会被 pg 驱动自动解析为 Date 对象。这直接违背方案第 14 节"前端代码零变动"的核心承诺——该节明确将 `setTypeParser` 配置称为此承诺的"关键保障"。

- **建议方向**：
  1. 将代码示例中的 `pg.types.setTypeParser(1182, val => String(val))` 改为 `pg.types.setTypeParser(1184, val => String(val))`。
  2. 考虑同时注册 1182 和 1184 两个 OID（以兼容可能的 KingbaseES 特定差异），并在启动验证中记录实际生效的 OID。
  3. 删除或修正 3.4.8 节注意事项中"上述 OID 值可安全使用"的声明（该声明与代码示例中使用的 1182 以及 PostgreSQL 标准 OID 事实不一致）。
  4. 第 15 节风险表"pg 驱动 timestamp 类型自动解析"行的"缓解措施"列及第 2689 行修订说明中同样使用了 1182，需同步修正。
