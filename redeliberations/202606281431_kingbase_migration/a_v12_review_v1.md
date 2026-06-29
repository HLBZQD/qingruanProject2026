# 技术方案审查报告（v1）

## 审查结果

**APPROVED**

## 逐维度审查

### 1. 技术准确性

**[通过]** 方案中所有关键技术选型和代码引用均经与项目实际代码库交叉验证，确认准确：

- **驱动选型**：`pg` (node-postgres) 是真实存在的主流 PostgreSQL 驱动（33k+ stars），KingbaseES V8R6 基于 PostgreSQL 12 兼容内核，驱动适用性成立。
- **OID 值**：1114 (timestamp)、1184 (timestamptz)、3802 (jsonb)、114 (json) 均为 PostgreSQL 12 标准 OID 值，经核实无误。OID 1182（`_date` 数组类型）已被正确移除。
- **代码行号引用**：经逐一核实以下引用均准确匹配实际代码：
  - `server.js` 第 2 行 `{ initDatabase, db }` 解构导入（实际 17 行文件）
  - `sseProxy.js` 第 4 行函数签名、第 26 行 `inputs: {}` 硬编码
  - `admin.js` 第 147-156 行 `insertAdminLog` 函数（operation_content/operation_result 均为纯文本参数）
  - `init.sql` 第 145 行 `idx_plans_user_plan` 为普通索引（非 UNIQUE）
  - `punch.js` 第 121/125/126 行 `date(punch_time)` / `datetime('now','localtime','-7 days')` 模式
- **`node-sql-parser` v5.4.0**：确认已在 `package.json` 第 26 行为项目现有依赖，方案中将其用于 INSERT ID 检测和 WHERE 子句 AST 校验的前提条件成立。
- **JSONB 静默数据丢失风险**：经核实 `parseTags()`（`server/utils/jsonFields.js` 第 4 行）和 `assistant.js` 第 48 行均使用 `JSON.parse()` ——若 pg 驱动将 JSONB 自动解析为 JS 对象，`JSON.parse(object)` 将抛 TypeError 被 catch 返回空数组。方案在 3.4.8 节注册 OID 3802/114 解析器的措施正确且必要。
- **`raw_input` 列现状**：该列在 `init.sql` 第 74 行定义为 `TEXT DEFAULT NULL`，但当前项目代码中无任何 JS/TS/Vue 文件引用此列。方案将其归类为 JSONB 列属于基于列名语义的前瞻性判断，当前无代码级风险。
- **`CURRENT_TIMESTAMP` 时区语义**：方案在第 4.2 节正确指出了 PostgreSQL/KingbaseES 的 `CURRENT_TIMESTAMP` 返回服务器时区时间（非始终 UTC 如 SQLite），并在 3.4.10 节增加了启动时区验证，在第 15 节风险表中列为独立风险项。此分析技术准确。

**[轻微]** `KingbaseES Docker` 镜像可用性声明：方案在第 5.1 节将 `kingbase/kingbasees:v8r6` 标注为"待验证假设"并提供三个替代方案，处理方式恰当。此标注本身不构成准确性问题——属于对商业产品分发限制的正确预判。

### 2. 完备性

**[通过]** 对照原始用户需求（requirement.md）的 10 个技术问题要点，逐项检查确认全部覆盖：

| # | 需求要点 | 对应章节 | 覆盖状态 |
|---|---------|---------|---------|
| 1 | 驱动选型 | 第 2 节"数据库驱动选型" | 完整 |
| 2 | 数据库访问层改造 | 第 3 节"数据库访问层改造方案" | 完整 |
| 3 | SQL 方言差异处理 | 第 4 节"SQL 方言差异处理" | 完整 |
| 4 | 双数据库支持策略 | 第 5 节"双数据库支持策略" | 完整 |
| 5 | 渐进式迁移路径 | 第 6 节"渐进式迁移路径" | 完整 |
| 6 | 连接池管理 | 第 7 节"连接池管理" | 完整 |
| 7 | 事务处理差异适配 | 第 8 节"事务处理适配" | 完整 |
| 8 | init_kingbase.sql 评估与完善 | 第 10 节"init_kingbase.sql 与 init.sql 对齐方案" | 完整 |
| 9 | 环境配置设计 | 第 11 节"环境配置设计" | 完整 |
| 10 | 前端无变动 | 第 14 节"前端确认"（修正为 API 调用代码不变，时间显示层需改造） | 完整 |

**[通过]** 对照本次迭代需求（a_v12_iteration_requirement.md）的 10 个编号问题，逐一核实全部已修复：

| # | 严重程度 | 问题 | 修复位置 | 修复状态 |
|---|---------|------|---------|---------|
| 1 | 严重 | JSONB/JSON 类型解析器遗漏（OID 3802/114） | 第 3.4.8 节第 338-339 行 | 已修复 |
| 2 | 严重 | operation_content/operation_result 被错误归类为 JSONB | 第 10.1/10.2 节多处（6→4 列） | 已修复 |
| 3 | 一般 | 版本声明元数据与文件名不一致 | 第 1-3 行版本声明 | 已修复 |
| 4 | 一般 | OID 1182 缺乏来源依据 | 第 3.4.8 节第 342 行，已删除 | 已修复 |
| 5 | 一般 | dateRange.js 验证口吻修饰 | 第 4.2.1 节第 897 行 | 已修复 |
| 6 | 一般 | DDL 失败后继续策略未考虑 FK 级联失败 | 第 3.4.5 节第 261-265 行 | 已修复 |
| 7 | 一般 | query_table WHERE 安全防护不足 | 第 9.2 节第 1551-1558 行 | 已修复 |
| 8 | 一般 | GIN 索引写入性能未评估，operation_content 的 GIN 建议错误 | 第 10.2 节第 1649-1654 行 | 已修复 |
| 9 | 轻微 | sql.formatDateParam 缺少完整代码 | 第 4.2 节第 720-731 行 | 已修复 |
| 10 | 轻微 | index.js 在"不变的文件"中歧义 | 第 3.6 节第 622 行 | 已修复 |

**[通过]** 横切关注点（BOOLEAN 类型差异）已在第 3.4.8 节第 356 行处理，DDL 保持 INTEGER/SMALLINT 类型。

**[通过]** 数据流闭环完整：路由层 → adapter.query/queryOne/execute() → 驱动层 → 数据库，seed 数据初始化、数据迁移、逆向回退的路径均已覆盖。SIGTERM/SIGINT 优雅关闭流程完整（server.js → adapter.close() → pool.end()）。

### 3. 可操作性

**[通过]** 方案中每项技术决策均有明确结论，实现者可明确知道"做什么"和"怎么做的大方向"：

- **文件变更清单**：第 16 节提供了 30+ 条目的完整文件级操作清单（新建/改造/删除/不变），每条含具体操作说明。
- **关键代码轮廓**：适配层接口（3.2 节）、KingbaseAdapter 构造（3.4.1 节）、事务处理（3.4.4 节）、DDL 执行（3.4.5 节）、占位符转换（3.4.4 节）、类型解析器（3.4.8 节）、优雅关闭（3.5.1 节）、formatDateParam（4.2 节）、双导出过渡（3.5.2 节）、server.js 改造（3.5.1 节）、健康检查（13.2 节）等均给出了实现层面的代码轮廓。
- **DDL 产出物**：第 10.2 节提供了 4 张关键表的完整 KingbaseES DDL 示例 + 27 项可逐项勾选的 DDL 实现清单。
- **手工测试清单**：第 5.1.1 节提供了 18 个 API 端点测试清单 + 3 个核心 E2E 流程，含具体测试场景、验证点和安全测试用例。
- **Phase 0 过渡策略**：第 3.5.2 节提供了 6 步可执行的双导出过渡方案，每步后均可独立验证和启动。
- **前置验证脚本**：第 6 节 Phase 1 前置条件定义了 7 项 `pg` 兼容性验证用例，阻塞 KingbaseAdapter 实现直到验证通过。

**[轻微]** 工程规模提醒：文档整体约 3500 行，对首次接触方案的实现者有阅读负担。建议在现场实施时，实现者可按"第 16 节文件变更清单 → 第 3 节适配层 → 第 6 节 Phase 0 → 第 10 节 DDL"的顺序优先阅读核心实施章节，其余章节作为参考查阅。此建议不影响方案通过。

## 修改要求

无。本次审查未发现严重或一般性问题。

---

## 附录：代码交叉验证记录

以下为审查过程中对方案关键代码引用的实际代码库验证结果：

| 方案引用 | 实际文件/行号 | 验证结果 |
|---------|-------------|---------|
| `server.js` 第 2 行 `{ initDatabase, db }` | `server.js:2` | 匹配 |
| `server.js` 共 17 行 | `server.js` 共 17 行 | 匹配 |
| `sseProxy.js` 第 4 行函数签名 | `sseProxy.js:4` | 匹配 |
| `sseProxy.js` 第 26 行 `inputs: {}` | `sseProxy.js:26` | 匹配 |
| `admin.js` 第 147-156 行 `insertAdminLog` | `admin.js:147-156` | 匹配 |
| `init.sql` 第 145 行 `idx_plans_user_plan`（普通索引） | `init.sql:145` | 匹配 |
| `punch.js` 第 121/125/126 行 | `punch.js:121,125,126` | 匹配 |
| `dateRange.js` 第 18 行 `T23:59:59` | `dateRange.js:18` | 匹配 |
| `parseTags` 使用 `JSON.parse` | `jsonFields.js:4` | 匹配 |
| `assistant.js` 第 48 行 `JSON.parse(row.tags)` | `assistant.js:48` | 匹配 |
| `node-sql-parser` v5.4.0 已安装 | `package.json:26` | 匹配 |
| `raw_input` 列存在于 DDL 但代码中无引用 | `init.sql:74` + 全项目搜索 | 匹配 |
| `database.js` 当前为同步 init | `database.js:9-37` | 匹配 |
| `life_advice.tags` 在 `assistant.js` 中使用 `JSON.parse` | `assistant.js:48` | 匹配（life_advice 表通过 join 或独立查询读取 tags） |
