# 再审议判定报告（v1）

## 判定结果

RETRY

## 判定理由

组件B诊断报告（`b_v1_diag_v2.md`）经两轮审查（实际轮次2/最大轮次12）识别出技术方案中存在**3个严重问题**、**8个一般问题**、**9个轻微问题**，共计20项质量问题。

质询报告（`b_v1_challenge_v2.md`）对诊断报告进行了独立质询，结果为 **LOCATED**——诊断报告的审查结论得到了质询过程的确认。质询过程中发现的3个"一般"等级问题（证据引用可增强、缺失-严重程度映射规则不明确、数据规模和兼容性测试维度未覆盖）属于对诊断报告本身完备性的改进建议，不影响诊断报告核心结论的有效性。实际轮次2小于最大轮次12，说明质询提前结束且确认了诊断结果。

根据判定标准，诊断报告包含严重和一般等级的问题（3严重+8一般），不满足以下任何PASS条件：
- 审查报告不含严重或一般等级的问题：不满足（存在3严重+8一般）
- 组件B达到最大轮次仍未LOCATED：不满足（实际轮次2<12，且已LOCATED）
- 发现的问题均为轻微等级：不满足（存在严重和一般问题）

满足RETRY条件：审查报告包含严重或一般等级的问题。组件A需根据诊断报告中的问题清单重新修订技术方案。

## 需要解决的问题

### 严重问题

- **问题描述**：`user_risk_info.result` 列在 `init.sql` 中存在但 `init_kingbase.sql` 中缺失，导致KingbaseES初始化后该表缺少列，`risk.js` 的路由逻辑依赖该列执行JSON解析，缺失将导致运行时错误或数据丢失。
- **所在位置**：init_kingbase.sql `user_risk_info` 表定义；v1诊断报告问题1
- **严重程度**：严重
- **改进建议**：在 `init_kingbase.sql` 的 `user_risk_info` 表中补充 `result TEXT` 列定义，与 `init.sql` 保持一致。

- **问题描述**：`init_kingbase.sql` 中 `DROP TABLE IF EXISTS` 语句在幂等初始化场景下会删除已有生产数据，与方案"支持幂等初始化"的设计意图冲突。
- **所在位置**：init_kingbase.sql 各DROP TABLE语句；v1诊断报告问题2
- **严重程度**：严重
- **改进建议**：区分"全新安装"和"幂等升级"两种场景的DDL执行策略；或使用 `CREATE TABLE IF NOT EXISTS` 配合 migration 机制替代 DROP TABLE。

- **问题描述**：`admin.js` 的 `/execute` 端点存在两种SQL输入模式——`tool_name` 模式（静态SQL，方案已覆盖改造）和 `sql` 模式（Dify AI动态生成SQLite方言SQL，方案完全未涉及）。切换至KingbaseES后，AI动态生成的SQLite方言SQL将执行失败；`node-sql-parser` 的AST级方言转换是可行路径但方案未提及。该问题严重性高于初步评估。
- **所在位置**：方案3.5节admin.js改动行；admin.js第65-112行；v1诊断报告问题3/问题12
- **严重程度**：严重
- **改进建议**：在方案中增加动态SQL方言处理策略——选项(a)修改Dify AI的prompt模板将SQL生成基准切换为PostgreSQL/KingbaseES语法；(b)利用`node-sql-parser`在KingbaseAdapter中实现SQLite→PostgreSQL的AST级方言转换；(c)在KingbaseES环境下禁用`sql`模式仅保留`tool_name`模式。在3.5节admin.js特殊改动点和13节风险表中补充此项。

### 一般问题

- **问题描述**：适配层文件结构描述前后矛盾——3.2节称SqliteAdapter路径为`db/sqlite_adapter.js`，3.3节称KingbaseAdapter路径为`db/kingbase_adapter.js`，但3.1节接口定义中使用了`db/adapters/`子目录结构，实现者无法确定实际文件位置。
- **所在位置**：方案3.1节、3.2节、3.3节；v1诊断报告问题4
- **严重程度**：一般
- **改进建议**：统一文件路径描述，明确最终的目录结构约定。

- **问题描述**：`DatabaseAdapter` 接口定义缺少 `init()` 方法——`adapter.init()` 在方案3.2/3.3节有实现描述但在3.1节的接口定义中未列出，接口契约不完整。
- **所在位置**：方案3.1节DatabaseAdapter接口定义；v1诊断报告问题5
- **严重程度**：一般
- **改进建议**：在3.1节接口定义中增加 `init(): Promise<void>` 方法签名。

- **问题描述**：迁移脚本未讨论SERIAL序列重置——从SQLite迁移数据到KingbaseES时，`AUTOINCREMENT` 列的自增序列（SERIAL）需要手动重置为 `MAX(id)+1`，否则新插入的记录可能与已有ID冲突（除非数据表中无现有数据需迁移）。
- **所在位置**：方案6节迁移路径；v1诊断报告问题6
- **严重程度**：一般
- **改进建议**：在迁移脚本中增加序列重置步骤：`SELECT setval('table_id_seq', COALESCE((SELECT MAX(id) FROM table), 0))`。

- **问题描述**：路由层async改造范围未显式说明——方案3.5节路由层改动范围描述了每个文件的改动模式但未明确哪些路由函数需要从同步改为async（因为`pg.Pool.query()`返回Promise而`better-sqlite3`的`stmt.get()`/`stmt.all()`是同步的），实现者需自行判断所有调用Adapter方法的位置是否已处于async上下文中。
- **所在位置**：方案3.5节路由层改动范围；v1诊断报告问题7
- **严重程度**：一般
- **改进建议**：在3.5节明确列出所有需要从同步改为async的函数位置，或声明原则"所有直接或间接调用adapter方法的路由处理函数均需标记为async并在await前加return或await"。

- **问题描述**：Phase 0时间戳语义变更与验收标准存在矛盾——方案4.2节决定`sql.now()`统一输出`CURRENT_TIMESTAMP`（UTC），替换原有的`datetime('now','localtime')`（UTC+8本地时间）。Phase 0验收标准要求"所有现有功能在SQLite下行为不变"，但时间存储值从UTC+8变为UTC是可观察的行为变更（数据库中所有新写入的timestamp字段相差8小时），与验收标准矛盾。
- **所在位置**：方案4.2节Timestamp时区决策、6节Phase 0验收标准；v2诊断报告问题13
- **严重程度**：一般
- **改进建议**：(1)在Phase 0验收标准中对时间戳变更加以说明，标注为预期变更非回归；(2)或暂缓Phase 0的时间戳修改，到Phase 1切换KingbaseES时一并迁移；(3)确认所有Dify AI工作流中无基于文字时间戳格式的硬编码逻辑。

- **问题描述**：事务内`SELECT MAX(plan_id)+1`的并发安全性未讨论——`plan.js`的`/generate`端点在事务内先用SELECT获取MAX(plan_id)+1再INSERT。SQLite的WAL模式下写事务串行化保证安全，但KingbaseES的READ COMMITTED隔离级别下两个并发事务可能读到相同的MAX(plan_id)导致plan_id重复。30秒幂等锁降低但未消除并发概率。
- **所在位置**：方案8.3节受影响的事务文件；plan.js第48-76行；v2诊断报告问题14
- **严重程度**：一般
- **改进建议**：(1)在KingbaseES事务中使用`SELECT ... FOR UPDATE`锁定匹配行；(2)使用PostgreSQL的`SERIAL`或`SEQUENCE`代替应用层生成plan_id；(3)为`(user_id, plan_id)`添加UNIQUE约束依赖数据库层防重复。在8.3节和13节风险表中补充此项。

- **问题描述**：KingbaseES连接SSL/TLS配置完全缺失——方案全文未提及数据库连接的传输加密配置。生产环境中数据库连接通常要求TLS加密，未配置可能导致数据传输被窃听或安全合规审计不通过。
- **所在位置**：方案7.2节KingbaseES连接池管理；v2诊断报告问题15
- **严重程度**：一般
- **改进建议**：在7.2节Pool配置示例中增加`ssl`选项（含注释），给出开发/生产环境的推荐配置。在`.env`中增加`DB_SSL_MODE`环境变量。

- **问题描述**：数据库访问层错误处理模式未统一说明——两个Adapter的`query()`/`execute()`在SQL执行失败时的错误传播方式（抛出异常 vs 返回错误对象）未约定，路由层的错误处理兼容性未确认。
- **所在位置**：方案3.2/3.3节Adapter实现；v2诊断报告问题2深度评估
- **严重程度**：一般
- **改进建议**：在Adapter接口定义或实现要点中明确错误处理约定——统一采用抛出异常模式，与Express的`next(e)`错误传播机制兼容。

- **问题描述**：CI测试方法和KingbaseES版本一致性未讨论——方案提到"CI中对两个后端各跑一遍测试"但未说明KingbaseES的CI部署方式、测试数据库初始化策略、目标版本范围。开发环境（可能Windows+SQLite）与生产环境（Linux+KingbaseES）的跨平台差异未讨论。
- **所在位置**：方案4节双数据库策略、5节CI配置；v2诊断报告问题4深度评估
- **严重程度**：一般
- **改进建议**：明确KingbaseES目标版本（如V8R3+）；补充CI中KingbaseES的容器化部署方案（如Docker镜像）；说明跨平台开发注意事项。
