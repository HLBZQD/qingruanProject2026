# 技术方案质量审查报告（v1）

**审查对象**：`a_v1_tech_v4.md` — 引入国产金仓数据库 KingbaseES 技术方案
**审查视角**：工程实施可行性、需求响应充分度、整体深度与完整性
**审查轮次**：第1轮（首次审查）

---

## 问题清单

### 问题 1（严重）：`user_risk_info.result` 列遗漏未在 9.1 节对比表中记录

**问题描述**：`init.sql` 中 `user_risk_info` 表定义了 `result TEXT DEFAULT NULL` 列，该列在 `risk.js`（第122行）中用于存储 JSON 格式的风险预测结果。但 `init_kingbase.sql` 中 `user_risk_info` 表完全没有 `result` 列（仅有 `disease_type`）。9.1 节对比表已记录了 `diabetes_history` 和 `diabetes_type` 的缺失，但遗漏了 `result` 列的缺失。

**所在位置**：9.1 节对比表（user_risk_info 行）

**严重程度**：严重

**改进建议**：在 9.1 节对比表的 `user_risk_info` 行中补充一条：`user_risk_info` | 缺失字段 | 有 `result`（TEXT DEFAULT NULL） | 无 `result` 列 | 在 init_kingbase.sql 中补充 `result TEXT DEFAULT NULL`。同时检查 9.2 节对齐策略中是否需要额外处理该 JSON 字段的类型映射（在 KingbaseES 中可考虑 `JSONB` 类型）。

**验证依据**：
- `server/db/init.sql` 第77行：`result TEXT DEFAULT NULL`
- `server/db/init_kingbase.sql` 第78-93行：`user_risk_info` 建表语句中无 `result` 列
- `server/routes/risk.js` 第122行：`resultJSON` 通过 INSERT 写入 `result` 列
- `server/routes/risk.js` 第153-156行：查询时使用 `json_extract(result, ...)` 读取该列

---

### 问题 2（严重）：KingbaseAdapter.init() 幂等性逻辑与 init_kingbase.sql 的 DROP TABLE 指令冲突

**问题描述**：`init_kingbase.sql` 文件以 `DROP TABLE IF EXISTS ... CASCADE` 开头（第9-18行），随后执行 `CREATE TABLE`。但方案的初始化逻辑（3.3 节步骤7、10.3 节）是"执行前先检查 users 表是否存在数据，避免重复初始化"。这个检查只能阻止"重复插入种子数据"，但无法阻止 DROP TABLE 的执行——因为 DROP TABLE 在 init_kingbase.sql 文件的第一部分，只要 `KingbaseAdapter.init()` 被调用就会执行。

实际影响：应用每次重启时，`initDatabase()` 都会被调用（参考当前 `server/db/database.js`）。当前 SQLite 版本使用 `CREATE TABLE IF NOT EXISTS`（init.sql 全部建表语句均含 `IF NOT EXISTS`），可安全在每次启动时执行。但 KingbaseES 版本若直接执行 init_kingbase.sql，每次重启都会删除所有表和数据。

**所在位置**：3.3 节 KingbaseAdapter.init() 执行策略（步骤7）、10.3 节数据库初始化流程

**严重程度**：严重

**改进建议**：
1. 方案应明确：`init_kingbase.sql` 需要采用与 `init.sql` 一致的幂等策略，将 `DROP TABLE IF EXISTS` 改为 `CREATE TABLE IF NOT EXISTS`（PostgreSQL/KingbaseES 兼容此语法）
2. 或在 KingbaseAdapter.init() 内部将幂等检查逻辑提前：先在事务外执行 `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')`，若表已存在则完全跳过 SQL 脚本执行
3. 明确 KingbaseAdapter.init() 不应每次启动都全量执行 init_kingbase.sql

---

### 问题 3（严重）：admin.js `/execute` 端点的 SQL 方言兼容性未处理

**问题描述**：`admin.js` 的 `/execute` 端点（第80-113行）允许管理员或 Dify AI 直接执行 SQL 语句。这些 SQL 语句在 SQLite 环境下由 Dify AI 生成，语法为 SQLite 方言（使用 `json_extract()`、`datetime()`、SQLite 特有的字符串函数等）。方案在 3.5 节路由改动表中列出了 admin.js 的改动（`db.transaction` → `adapter.transaction`、`PRAGMA table_info` → `adapter.tableInfo()`），但未提及通过该端点动态执行的 SQL 语句本身的方言转换问题。

切换到 KingbaseES 后，Dify AI 生成的 SQLite 方言 SQL 将直接发送到 KingbaseES 执行，大概率因语法不兼容而失败。路由层其他地方的 SQL 是代码中静态编写的（可通过手动改造解决），但 admin `/execute` 端点的 SQL 是运行时动态生成的，无法通过代码改造解决。

**所在位置**：3.5 节 admin.js 改动行（"含 `db.transaction()` 事务、`info.lastInsertRowid` 取值、`PRAGMA table_info` → `adapter.tableInfo()`"）

**严重程度**：严重

**改进建议**：
1. 方案需增加专门章节讨论 admin `/execute` 端点的 SQL 方言处理策略。可选方案包括：(a) 在 Dify AI prompt 中指定使用 PostgreSQL 方言生成 SQL；(b) 在发送到 KingbaseES 前对动态 SQL 进行方言转换（利用 `node-sql-parser` 进行 AST 级别的方言转换，将 SQLite 语法转为 PostgreSQL 语法）；(c) 仅允许 PostgreSQL 标准 SQL 通过该端点执行
2. 在 13 节风险表中新增相关风险项："admin /execute 动态 SQL 方言不兼容"
3. 在 14 节文件变更清单的 admin.js 条目中补充此项改动说明

---

### 问题 4（一般）：适配层文件结构描述前后矛盾

**问题描述**：方案在第 1 节架构图中将适配层表示为单一文件 `server/db/adapter.js`，第 3.1 节也写"新增文件 `server/db/adapter.js`"。但第 3.4 节的代码示例使用 `require('./adapter/sqlite')` 和 `require('./adapter/kingbase')`，第 14 节文件变更清单中列为两个新建文件 `server/db/adapter/sqlite.js` 和 `server/db/adapter/kingbase.js`。前者暗示 `adapter.js` 是大类文件（内含两个 class），后者暗示 `adapter/` 是目录（内含两个模块文件）。两种结构均可实现，但不一致的描述会让实现者困惑该采用哪种组织方式。

**所在位置**：第 1 节架构图（第8行 `server/db/adapter.js`）、第 3.1 节（第56行 "新增文件 `server/db/adapter.js`"）、第 3.4 节（第149-150行）、第 14 节（第602-603行）

**严重程度**：一般

**改进建议**：统一为一种文件结构。推荐采用 `server/db/adapter/` 目录方案（`sqlite.js` + `kingbase.js`），因为两个适配器的实现体量较大（各约 100-200 行），分文件管理更清晰。同时将第 1 节架构图和 3.1 节的文字更新为一致的结构描述。

---

### 问题 5（一般）：DatabaseAdapter 接口缺少 `init()` 方法定义

**问题描述**：3.1 节 `DatabaseAdapter` 接口定义（第60-68行）列出了 7 个方法：`query`、`queryOne`、`execute`、`transaction`、`tableInfo`、`healthCheck`、`close`，但未包含 `init()` 方法。然而 `init()` 在整个方案中承担核心初始化职责：(1) SqliteAdapter.init() 执行建表+种子数据（10.3 节），(2) KingbaseAdapter.init() 执行多语句 SQL 脚本+密码哈希替换（3.3 节），(3) database.js 调用 `adapter.init()`（3.4 节）。接口定义与实际使用不匹配。

**所在位置**：3.1 节第60-68行（DatabaseAdapter 接口轮廓）

**严重程度**：一般

**改进建议**：在 DatabaseAdapter 接口中补充 `init()` 方法签名，如 `async init() → void`。同时明确该方法的行为契约：负责创建表结构（幂等）和填充初始种子数据（仅在数据库为空时），成功后在 adapter 实例上标记初始化完成状态。

---

### 问题 6（一般）：数据迁移脚本未讨论 SERIAL 序列重置

**问题描述**：11 节数据迁移方案讨论了迁移顺序、时区转换、JSON 字段类型，但遗漏了一个关键技术点：KingbaseES 使用 `SERIAL`（等效于 PostgreSQL `SERIAL`，底层为 SEQUENCE）作为自增主键。当迁移脚本通过 `INSERT INTO ... (id, ...) VALUES (1, ...)` 显式指定 id 值时，SEQUENCE 不会自动更新。迁移完成后，下一条不指定 id 的 INSERT 将从序列的起始值（通常是 1）开始生成 id，与已存在的 id 冲突。

**所在位置**：11 节"数据迁移（SQLite → KingbaseES）"

**严重程度**：一般

**改进建议**：在 11 节迁移方案中补充序列重置步骤。迁移脚本在每个表的 INSERT 完成后执行 `SELECT setval('表名_id_seq', (SELECT COALESCE(MAX(id), 0) FROM 表名))`，使序列从现有最大 id+1 开始。或在迁移脚本末尾统一对所有含 SERIAL 列的表执行此操作。

---

### 问题 7（一般）：路由层 async 改造的范围和必要性未显式说明

**问题描述**：方案在 3.5 节展示了同步改异步的代码示例，并在 8.2 节说明了事务的异步改造。但方案未明确声明：**所有**涉及数据库访问的路由处理器（11 个文件中的路由）都必须将 `(req, res, next) => { ... }` 改为 `async (req, res, next) => { ... }`，否则 `await adapter.xxx()` 会因缺少 await 而将 Promise 对象而非实际数据传递给后续代码。

当前路由代码中，`plan.js` 已是 async（因为调用 Dify），`risk.js` 的 `/predict` 已是 async，但其他路由（如 `punch.js`、`user.js`、`articles.js`、`auth.js` 等）都是同步函数。这些文件的改造不仅是替换数据库调用 API——函数签名本身也需要修改。对于实现者而言，这是一个重要的全局性改动，应在方案中显式声明。

**所在位置**：3.5 节"路由层改动范围"

**严重程度**：一般

**改进建议**：在 3.5 节开头增加一段声明："由于 adapter 所有方法均为 async（返回 Promise），所有涉及数据库访问的路由处理器函数签名必须从同步改为 async（添加 `async` 关键字），Express 原生支持 async 路由处理器。此改动为机械性修改，不改变业务逻辑。"并在 14 节文件变更清单中对每个路由文件标注"函数签名加 async"。

---

### 问题 8（轻微）：3.3 节与 10.3 节的 KingbaseES 初始化幂等检查位置描述不一致

**问题描述**：3.3 节 init() 步骤7 写明"执行前先检查 users 表是否存在数据，避免重复初始化"，即将检查放在事务执行之前——这是正确的。但 10.3 节的初始化流程图中，步骤6 描述"BEGIN 事务 → 逐条 pool.query() → COMMIT"，步骤9 才描述"检查 users 表是否有数据，避免重复初始化"——这在流程图上暗示检查在事务执行之后。虽然 10.3 节也可能被解读为检查独立于事务执行，但流程图的线性排列容易使实现者误解执行顺序。

**所在位置**：10.3 节第528-529行

**严重程度**：轻微

**改进建议**：调整 10.3 节 KingbaseES 分支流程图的顺序，将"检查 users 表是否存在数据 → 若已有数据则跳过初始化"明确放在"读取 init_kingbase.sql → 替换占位符 → 分割 → 事务执行"之前。确保两处描述的幂等逻辑完全一致。

---

### 问题 9（轻微）：缺乏 `pg` 连接池错误处理和重连机制的实现指导

**问题描述**：13 节风险表中将"KingbaseES 连接不可用"列为风险，缓解措施包括"连接池失败重试机制"。但方案全文未给出连接池错误处理或重连机制的任何实现指导。`pg.Pool` 在连接失败时默认行为是抛出错误而非自动重连；`pg.Pool` 的 `error` 事件（当空闲客户端遇到错误时触发）若不监听会导致进程崩溃。这些是实现时必须处理的技术细节，但方案未涉及。

**所在位置**：7.2 节（连接池管理）、13 节（风险表）

**严重程度**：轻微

**改进建议**：
1. 在 7.2 节补充：KingbaseAdapter 构造函数中应注册 `pool.on('error', handler)` 监听器，避免未捕获的连接异常导致进程退出
2. 建议实现简单的查询重试逻辑（如失败后等待 1 秒重试 1-2 次），或说明不实现重试的原因（如交由上游负载均衡处理）
3. 在 3.3 节 KingbaseAdapter 实现要点中增加连接错误处理的简要说明

---

### 问题 10（轻微）：`healthCheck()` 方法的 KingbaseES 端实现未说明

**问题描述**：3.1 节 `DatabaseAdapter` 接口定义了 `healthCheck() → boolean` 方法，但全文没有任何地方说明 KingbaseAdapter 如何实现此方法。SqliteAdapter 可以简单地检查文件是否存在和数据库是否打开，但 KingbaseAdapter 需要执行网络查询。实现者需要知道：是执行 `SELECT 1`？是否需要考虑连接池耗尽的情况（无法获取连接时健康检查如何返回？）？是否需要超时设置？

**所在位置**：3.1 节第66行（`async healthCheck() → boolean`）

**严重程度**：轻微

**改进建议**：在 3.3 节 KingbaseAdapter 实现要点中补充 `healthCheck()` 的实现说明，建议执行 `SELECT 1` 并设置较短的超时（如 2 秒），捕获连接错误返回 `false`。同时说明健康检查的实现复杂度低（约 5 行代码），不需要独立的小节。

---

### 问题 11（轻微）：`connectionTimeoutMillis` 与 `query_timeout` 概念未区分

**问题描述**：7.2 节 Pool 配置中设置了 `connectionTimeoutMillis: 5000`（TCP 连接建立超时）。方案还通过连接字符串设置了 `statement_timeout`（服务端单语句执行超时）。但 `pg` 还支持客户端的 `query_timeout` 配置（Pool 构造参数），用于在客户端侧限制单次查询的总时长。`statement_timeout` 仅限制服务端语句执行时间，不包括网络传输时间。未配置 `query_timeout` 意味着如果查询结果很大或网络很慢，客户端可能无限等待。方案未区分这三个超时概念（连接超时、服务端语句超时、客户端查询超时）及其各自的作用域。

**所在位置**：7.2 节（连接池管理）

**严重程度**：轻微

**改进建议**：在 7.2 节补充 `query_timeout` 配置（如 `query_timeout: 30000`）并简要说明三种超时的区别：(1) `connectionTimeoutMillis` — 建立 TCP 连接的超时；(2) `statement_timeout` — PostgreSQL 服务端限制单条 SQL 执行时间的参数；(3) `query_timeout` — `pg` 客户端侧限制单次查询总耗时的选项。建议三者都配置，提供完整保护。

---

## 整体评价

方案经过 4 轮迭代修订（v1→v4），已覆盖了需求中提出的全部 10 个技术问题，技术路线明确（适配层 + 方言辅助 + 渐进式迁移），大部分关键决策有充分的技术论证。前序内部审议已解决了多数严重问题（PRAGMA 替代、RETURNING id、参数占位符转换、statement_timeout 配置等），当前版本在技术可行性维度已达到较高质量。

但在工程实施可行性维度仍存在若干待解决问题：(1) `user_risk_info.result` 列缺失和 init_kingbase.sql DROP TABLE 幂等性问题是两个**阻塞性缺陷**——若按当前方案实现，会导致功能故障或生产数据丢失；(2) admin `/execute` 动态 SQL 方言问题是一个**需要提前决策的架构问题**——涉及 AI 系统的 prompt 设计或 SQL 转换策略，不应留到实现阶段才发现；(3) 文件结构不一致、接口方法遗漏、序列重置、async 改造范围等问题虽不阻塞实现，但会导致返工或隐式依赖实现者的经验。

建议方案作者优先修复问题 1、2、3（三个严重问题），随后处理问题 4-7（四个一般问题），问题 8-11 可在实现过程中自然解决。

---

## 问题严重程度汇总

| 编号 | 问题 | 严重程度 |
|------|------|---------|
| 1 | `user_risk_info.result` 列缺失未记录 | 严重 |
| 2 | init_kingbase.sql DROP TABLE 与幂等初始化冲突 | 严重 |
| 3 | admin /execute 动态 SQL 方言兼容性未处理 | 严重 |
| 4 | 适配层文件结构描述前后矛盾 | 一般 |
| 5 | DatabaseAdapter 接口缺少 init() 方法 | 一般 |
| 6 | 迁移脚本未讨论 SERIAL 序列重置 | 一般 |
| 7 | 路由层 async 改造范围未显式说明 | 一般 |
| 8 | 3.3 节与 10.3 节幂等检查位置描述不一致 | 轻微 |
| 9 | 连接池错误处理和重连机制缺乏实现指导 | 轻微 |
| 10 | healthCheck() KingbaseES 端实现未说明 | 轻微 |
| 11 | connectionTimeoutMillis 与 query_timeout 概念未区分 | 轻微 |
