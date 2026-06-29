# 技术方案质量审查报告（v2 — 第 2 轮迭代）

## 审查概要

- **审查对象**：`a_v2_tech_v1.md`（引入国产金仓数据库 KingbaseES 技术方案 v2）
- **审查视角**：工程实施可行性、需求响应充分度、整体深度与完整性、关键技术决策遗漏
- **审查范围说明**：内部审议已覆盖技术可行性维度（SQL 方言映射、Schema 对齐、事务适配等），本报告侧重工程落地层面的遗漏与深度不足问题

**整体评价**：该方案经过 v1→v2 修订后，技术方向正确、决策清晰、对上一轮反馈响应全面。但在工程实施直接指导层面，存在 2 个严重遗漏和 5 个一般性问题，主要集中在启动流程完整性、混合状态数据处理、性能影响及部分决策缺失。以下问题需在进入实现阶段前解决。

---

## 严重问题

### 问题 1：`server.js` 未列入文件变更清单，且异步启动流程未给出完整代码轮廓

- **所在位置**：方案第 3.5 节（database.js 改造）、第 16 节（文件变更清单）
- **严重程度**：严重

**问题描述**：

方案 3.5 节明确要求 `initDatabase()` 改为 async 函数，并指出 `server.js` 中调用处改为 `await initDatabase()`。然而第 16 节"文件变更清单"中完全遗漏了 `server.js`。当前 `server.js` 的实际代码为：

```javascript
const { initDatabase, db } = require('./server/db/database');
initDatabase();           // 同步调用，不等待
const app = require('./server/app');
// ...
app.listen(PORT, () => { ... });
```

改为 `await initDatabase()` 后，必须同时调整启动时序：`app.listen()` 必须在数据库初始化完成后才执行，否则应用会在数据库就绪前开始接受请求。方案未提供改造后的 `server.js` 代码轮廓（哪怕伪代码），也未讨论 `await` 在顶层（CJS 模块根作用域）是否可用、是否需要包裹在 IIFE 中等问题。

**改进建议**：

(1) 在第 16 节文件变更清单中增加 `server.js`，标注为"改造"；(2) 在第 3.5 节补充 `server.js` 的改造代码轮廓，明确 `await initDatabase()` 与 `app.listen()` 的时序关系；(3) 说明顶层 `await` 方案（若目标 Node.js 版本支持）或 `initDatabase().then(() => app.listen(...))` 替代方案。

---

### 问题 2：Phase 0 混合时间戳数据状态的处理策略缺失

- **所在位置**：方案第 4.2 节（`sql.now()` 与 UTC 存储决策）、第 6 节 Phase 0 验收标准
- **严重程度**：严重

**问题描述**：

方案决定 Phase 0（SQLite 阶段）即切换到 `CURRENT_TIMESTAMP`（UTC 存储），是一个"有意的行为变更"。方案指出改造后的新写入数据为 UTC，改造前已有数据保持本地时间不变。但方案未分析以下关键问题：

1. **同一数据库内时间戳语义不一致**：Phase 0 之后，SQLite 数据库中 `users.created_at`、`articles.created_at`、`punch_in.punch_time` 等字段同时存在两种时间语义的记录——旧记录为 UTC+8 本地时间，新记录为 UTC。前端无法从数据本身区分二者。
2. **时间范围查询在 Phase 0 期间将出错**：例如 `punch.js` 第 125 行的 `punch_time >= datetime('now', 'localtime', '-7 days')` 替换为 `CURRENT_TIMESTAMP - INTERVAL '7 days'` 后，旧数据（UTC+8）会比新数据（UTC）早 8 小时，导致近 7 天查询结果包含/排除错误记录。
3. **Dify AI 工作流影响未评估**：方案 4.2 节仅提及"确认所有 Dify AI 工作流中无基于文字时间戳格式的硬编码逻辑"作为建议，但未实际分析。`admin.js` 中 `query_table` 操作的 `WHERE` 子句由 Dify 生成，可能包含基于文字时间戳的比较。

这一混合状态将贯穿整个 Phase 0 和 Phase 1，直到 Phase 2 数据迁移时统一转换。在此期间，时间相关功能存在数据层面的正确性风险。

**改进建议**：

(1) 在方案中明确 Phase 0 的混合状态处理方法：推荐方案为在 Phase 0 改造 SQL 的同时，运行一次性 SQL 脚本将现有 SQLite 数据中所有 datetime 字段原地从本地时间转换为 UTC（减去 8 小时），使得 Phase 0 启动后数据库立即进入全 UTC 状态，消除混合期。(2) 将此脚本作为 Phase 0 的前置步骤列入验收标准。(3) 在风险表中新增"Phase 0 混合时间戳数据一致性风险"条目。

---

## 一般问题

### 问题 3：`/health` 端点改造与文件变更清单矛盾

- **所在位置**：方案第 13.2 节（监控与可观测性）与第 16 节（文件变更清单）
- **严重程度**：一般

**问题描述**：

方案 13.2 节建议"GET /health 端点返回数据库连接状态（调用 `adapter.healthCheck()`）"，但第 16 节明确标注 `server/routes/index.js` 为"零改动"。当前 `/health` 端点（`server/routes/index.js` 第 4-6 行）仅返回静态 JSON `{ success: true, message: '服务运行正常' }`，未检查数据库连接。这是方案内部的直接矛盾：要么 health 端点需要改造，要么 13.2 节的建议需要删除或标注为可选项。

**改进建议**：

(1) 确认是否将 `/health` 改造纳入范围；(2) 若纳入，在第 16 节中将 `server/routes/index.js` 标注为"改造"，说明改造内容（引入 `getAdapter()` 并调用 `healthCheck()`）；若暂不纳入，删除 13.2 节相应描述或标注为"Phase 2 可选增强"。

---

### 问题 4：`plan.js` 事务中批量 INSERT 的网络性能影响未评估

- **所在位置**：方案第 8.2 节（适配后的事务模式）、第 6 节 Phase 1 验收标准
- **严重程度**：一般

**问题描述**：

`plan.js` 中 `POST /generate` 端点（当前第 60-74 行）在事务内使用 `for` 循环逐条 `INSERT` 健康方案明细项。每条 `insertStmt.run()` 在 SQLite 中是进程内调用，但在 KingbaseES 中通过 `txAdapter.execute()` 执行时，每次调用都是一次网络往返。Dify AI 生成的方案可能包含数十条明细项，在 KingbaseES 下事务耗时将显著增加（可能从毫秒级升至秒级），可能导致：

1. 事务持有锁时间延长，增加并发冲突概率
2. 30 秒幂等锁（`lastGenerateRequest` Map）可能不够
3. 前端请求超时（若 HTTP 超时设置较低）

方案 8.5 节已讨论并发安全（`FOR UPDATE`），但未讨论事务内的网络 I/O 性能影响。

**改进建议**：

(1) 在 Phase 1 性能基准测试中明确将"方案生成事务耗时"列为对比指标；(2) 若实测性能不达标，考虑在事务内使用多行 INSERT（`INSERT INTO ... VALUES (...), (...), (...)`）批量写入；(3) 在风险表中新增"KingbaseES 事务内逐条 INSERT 延迟升高"风险项。

---

### 问题 5：数据迁移验证策略深度不足

- **所在位置**：方案第 12 节（数据迁移）
- **严重程度**：一般

**问题描述**：

方案第 12 节对迁移验证的描述仅为"验证行数一致"。对于生产环境数据迁移，行数相同不能保证数据完整性和正确性。缺失的验证维度包括：

1. **内容正确性**：时区转换逻辑是否正确执行（抽样比较源和目标的时间戳值）
2. **约束完整性**：外键关系是否保持（迁移后 FK 引用是否全部有效）
3. **非空约束**：迁移后各列的 NULL 比例是否与源一致（排除预期差异）
4. **JSON 字段有效性**：`tags`、`result` 等 JSON 文本字段是否可正确解析
5. **迁移回滚演练**：逆向迁移脚本（KingbaseES→SQLite）是否经过测试

**改进建议**：

(1) 在迁移脚本中增加验证步骤：逐表行数对比、抽样 100 行逐列对比、FK 有效性检查、NULL 比例检查；(2) 在 12 节增加"迁移前 dry-run"说明（对 SQLite 副本执行迁移脚本，验证输出）；(3) 提供逆向迁移脚本的框架（即使不完整实现）。

---

### 问题 6：JSON 存储列类型在 `init_kingbase.sql` 中未明确决策

- **所在位置**：方案第 10.1 节（差异分析表）、第 10.2 节（对齐策略）、第 4.1 节（方言差异清单）
- **严重程度**：一般

**问题描述**：

方案 4.1 节使用 `col::jsonb->>'path'` 作为 KingbaseES 的 JSON 提取语法，12 节提到"推荐 JSONB，支持索引和查询优化"。但第 10 节的重写 `init_kingbase.sql` 讨论中，以下列的最终类型未被明确决策：

| 表 | 列 | SQLite 类型 | KingbaseES 推荐类型 |
|---|-----|-----------|------------------|
| articles | `tags` | TEXT (存 JSON 字符串) | TEXT 还是 JSONB？ |
| user_risk_info | `result` | TEXT | TEXT 还是 JSONB？ |
| user_risk_info | `raw_input` | TEXT | TEXT 还是 JSONB？ |
| admin_logs | `operation_content` | TEXT | TEXT 还是 JSONB？ |
| admin_logs | `operation_result` | TEXT | TEXT 还是 JSONB？ |
| life_advice | `tags` | TEXT | TEXT 还是 JSONB？ |

使用 TEXT 则 `::jsonb` 是运行时转换（每次查询需解析，但无需修改迁移逻辑），使用 JSONB 则存储已解析的二进制格式（查询更快，但需在迁移脚本中验证 JSON 合法性）。这是一个影响查询性能和索引策略的技术决策，方案未做出选择。

**改进建议**：

(1) 在第 10.2 节对齐策略中增加 JSON 列类型决策：推荐生产环境使用 JSONB（配合 GIN 索引），开发环境可保留 TEXT；(2) 在迁移脚本中增加 JSON 合法性校验步骤（对每个 JSON 文本列执行 `json_typeof(col::jsonb)`），失败则报错并输出问题行号。

---

### 问题 7：KingbaseES 事务内 DDL 执行兼容性未验证

- **所在位置**：方案第 3.4.5 节（`init()` 方法）
- **严重程度**：一般

**问题描述**：

方案 3.4.5 节第 6 步"在一个事务内（BEGIN → 逐条执行 → COMMIT）顺序执行所有语句"，将 DDL（CREATE TABLE）包裹在事务中执行。虽然 PostgreSQL 支持事务内 DDL（DDL 失败可整体回滚），但 KingbaseES V8R6 的事务内 DDL 行为是否与 PostgreSQL 完全一致需确认。若 KingbaseES V8R6 在事务内执行某些 DDL 时隐式提交（autocommit DDL），则部分表的 CREATE 可能无法回滚，导致幂等初始化在部分失败后留下中间状态。

此外，方案提到的备选方案（拆分为 DDL/种子两个文件）值得正面推荐，因为它天然规避了此风险，且更易于调试。

**改进建议**：

(1) 补充说明：在开发/测试环境 KingbaseES V8R6 上验证事务内 DDL 的 COMMIT/ROLLBACK 行为；(2) 将备选方案（拆分 DDL 和种子为独立文件，DDL 不回滚、种子数据在事务内）提升为推荐方案，降低实现风险和调试难度；(3) 在风险表中新增对应条目。

---

## 修订说明（v1）

本轮为首轮审查，无历史质询意见。

---

*审查完成时间：2026-06-28*
*审查轮次：第 2 轮迭代，v1 诊断报告*
