# 技术方案审查报告（v1）

## 审查结果

REJECTED

## 逐维度审查

### 1. 技术准确性

**[通过]** `pg`（node-postgres）驱动选型准确。KingbaseES V8R6 基于 PostgreSQL 12 兼容内核，`pg.Pool` 可正常连接。方案中 `pg-promise` 对比分析正确——`pg-promise` 依赖 `pg`，选 `pg` 无功能损失。

**[通过]** `node-sql-parser`（v5.4.0）已存在于项目 `package.json` 依赖中，方案提出利用其 AST 解析能力判断 INSERT 语句并自动追加 `RETURNING id` 的方案可行。方案同时给出了正则回退策略，覆盖解析失败的边缘情况。

**[通过]** `bcryptjs`（v2.4.3）已存在于项目依赖中，方案提出在 `KingbaseAdapter.init()` 中运行时生成密码哈希替换占位符的方案与现有 SQLite 种子机制一致，技术可行。

**[通过]** 项目未引入 `express-async-errors` 包——已核实 `package.json` 中无此依赖。方案 3.6 节明确指出"所有新改造为 async 的 handler 必须遵循 try/catch + next(e) 模式"，此结论与项目实际状态一致。

**[通过]** `admin.js` 中 `insertAdminLog` 函数（第 147 行）确为模块级闭包，内部使用模块级 `db` 变量执行 INSERT。方案 8.3 节正确识别了此函数在 `db.transaction()` 回调内被调用（第 98 行）时的事务上下文矛盾，并在事务外调用处（第 70、76 行）也做了区分。

**[通过]** `plan.js` 中 `checkIdempotent()` 调用位置（第 44 行）确实位于 `callWorkflowBlocking()`（第 28 行）和 `parsePlanOutput()`（第 37 行）之后。方案 8.5 节的定位准确。

**[通过]** `auth.js` 中 `/register` 和 `/login` handler（第 11、49 行）当前均为同步函数 `(req, res) => {...}`，无 `async` 标记、无 `try/catch` 包裹数据库操作、无 `next` 参数。方案 3.6 节正确识别了此问题并给出了明确的改造模式。

**[通过]** `plan.js` 的 `/adjust` 端点（第 140 行）使用 `db.transaction()` 同步调用，方案正确将其列为需改造的事务端点。`/adjust` 不包含 `checkIdempotent()` 调用，方案未错误地对其提出幂等锁改造要求。

**[通过]** `init_kingbase.sql` 当前使用 `DROP TABLE IF EXISTS ... CASCADE` 前缀（第 9-18 行），与方案要求的 `CREATE TABLE IF NOT EXISTS` 幂等策略矛盾。方案 10.2 节正确识别并要求修正。

**[通过]** `init.sql` 使用 `datetime('now','localtime')` 作为默认值（第 9-10 行），方案提出统一改为 `CURRENT_TIMESTAMP`（UTC 存储），并明示此为有意的行为变更，附带完整的 UTC 转换脚本和时区迁移策略。SQLite 3.38+ 确实支持 `CURRENT_TIMESTAMP`。

**[通过]** SQLite 的 `SELECT ... FOR UPDATE` 语法兼容性声明准确——SQLite 接受该语法（作为 no-op），不会导致 SQLite 端报错。

### 2. 完备性

**[通过]** 原始需求（`requirement.md`）中列出的全部 10 个技术问题均有对应的方案章节：驱动选型（第 2 节）、访问层改造（第 3 节）、SQL 方言（第 4 节）、双库策略（第 5 节）、迁移路径（第 6 节）、连接池（第 7 节）、事务处理（第 8 节）、init_kingbase.sql 评估（第 10 节）、环境配置（第 11 节）、前端确认（第 14 节）。

**[通过]** 迭代需求（`a_v4_iteration_requirement.md`）中列出的全部 6 个问题均在 v4 方案中有对应的专项处理：
- 问题 1（insertAdminLog 事务上下文）：第 8.3 节 v4 新增子节 + 第 15 节风险项 + 第 16 节变更清单
- 问题 2（plan.js 幂等锁竞态窗口）：第 8.5 节 v4 新增子节 + 第 15 节风险项
- 问题 3（Dify sql 模式跨系统协同）：第 9.2 节 v4 新增子节 + 第 6 节验收标准补充
- 问题 4（dispatchParameterizedQuery async 改造）：第 9.2 节 v4 新增子节 + tool_name 适配表"函数整体"行
- 问题 5（ROLLBACK 连接释放）：第 3.4.4 节 v4 新增子节含伪代码
- 问题 6（auth.js error handling）：第 3.6 节 handler 模式和 Express async error handling 明确声明

**[通过]** 每个问题不仅给出了文字描述，还在第 15 节风险表、第 16 节文件变更清单、修订说明（v3→v4）中同步更新，形成了三层覆盖。

**[一般]** 第 3.6 节"不变的文件"中列出 `server/routes/index.js` 为"不涉及数据库访问，无需修改"，但方案第 13.2 节和第 16 节明确要求改造 `/health` 端点以调用 `adapter.healthCheck()`——该改造涉及数据库访问。两处说法矛盾：如果实现者仅阅读第 3.6 节，将遗漏 index.js 的改造任务；如果阅读第 16 节，会执行该改造。需统一为：index.js 的 `/health` 端点需改造。

### 3. 可操作性

**[通过]** DatabaseAdapter 接口定义（第 3.2 节）给出了完整的方法签名、参数类型、返回值类型和契约说明（`init()` 幂等保证、`transaction(fn)` 的 txAdapter 契约、`tableInfo()` 的统一格式），实现者可以据此编写两个适配器。

**[通过]** 关键实现路径提供了伪代码级别的指引：`KingbaseAdapter.transaction()` 的 try/catch/finally 结构（第 3.4.4 节）、`init()` 的多语句分割与执行策略（第 3.4.5 节）、`?` → `$1` 占位符转换状态机（第 3.4.4 节）、`server.js` IIFE + async/await 改造轮廓（第 3.5.1 节）、SSL/TLS 配置构造（第 3.4.7 节）。

**[通过]** 路由层改动范围（第 3.6 节）以表格形式逐文件列出了需改造的 handler 函数、预估 DB 调用数、特殊改动点，实现者可以按表逐项执行。

**[通过]** 数据迁移方案（第 12 节）给出了迁移脚本步骤、时区转换示例代码、SERIAL 序列重置的具体 SQL、7 维度验证清单、迁移顺序依赖图、dry-run 建议，操作人员可以据此编写迁移脚本。

**[通过]** admin `/execute` 端点的 `sql` 模式禁用逻辑（第 9.2 节）给出了具体的条件判断代码片段，Dify system prompt 模板也给出了 Jinja2 语法的示例片段。

**[轻微]** 第 8.5 节推荐将 `checkIdempotent()` 移至 Dify 调用之前（方案 1），但未讨论此变更的负面效应：若 Dify 调用或 `parsePlanOutput` 后续失败（非事务层面），30 秒内存锁仍然生效，用户无法立即重试。虽然节省 Dify 配额是正确的权衡，但方案应明确标注此取舍，让实现者知晓重试被阻塞的场景。

## 修改要求

- **问题**：第 3.6 节"不变的文件"中声称 `server/routes/index.js` "不涉及数据库访问，无需修改"，但第 13.2 节和第 16 节明确要求改造 `/health` 端点以调用 `adapter.healthCheck()`（涉及数据库访问），两处存在矛盾。
- **原因**：实现者如果仅阅读第 3.6 节（路由层改动范围的核心章节），会遗漏 index.js 的 health 端点改造任务，导致生产环境 health check 无法反映数据库真实状态。这直接影响运维可观测性。
- **建议方向**：在第 3.6 节"不变的文件"中将 `index.js` 移除，或改为标注"index.js 的 `/health` 端点需改造以调用 adapter.healthCheck()（详见第 13.2 节）"。同时在第 3.6 节 async 改造清单表格中增加 index.js 行（标注 `/health` GET handler 需改造）。
