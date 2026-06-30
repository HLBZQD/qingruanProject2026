# 审查范围界定 — PR #12 金仓数据库迁移 Phase 0+1

## 审查目标

审查 GitHub PR #12（https://github.com/HLBZQD/qingruanProject2026/pull/12）
- 标题：feat: 金仓数据库迁移 Phase 0+1 —— 适配层构建 + 双库验证通过
- 源分支：`feature/kingbase-migration`（来自 fork JOLO681/qingruanProject2026）
- 目标分支：`main`
- PR 性质：国产数据库 KingbaseES 适配迁移，构建数据库适配层并完成 SQLite/KingbaseES 双库验证

## 审查依据（按优先级）

1. **`docs/5_kingbase_migration_plan.md`**（迁移计划 v16）—— **最高优先级，冲突时以此为准**
2. **`docs/2_detailed_design_v4.md`**（详细设计书）—— 参照其 API 接口设计（第3章）、数据库设计（第2章）、安全设计（第7章）

两文档冲突时，一律以迁移计划为准。

## PR 变更范围（22 文件，+1969/-856）

### 新增文件（适配层核心）
- `server/db/adapter/DatabaseAdapter.js` — 抽象接口
- `server/db/adapter/SqliteAdapter.js` — SQLite 适配器（Promise API 封装 better-sqlite3）
- `server/db/adapter/KingbaseAdapter.js` — 金仓适配器（pg.Pool, ?->$N, INSERT RETURNING id）
- `server/db/sql.js` — SQL 方言辅助（json_extract/::jsonb->> 等）
- `server/db/init_kingbase_ddl.sql` — 金仓 DDL（10 表 PostgreSQL DDL）
- `server/db/init_kingbase_seed.sql` — 金仓种子数据

### 修改文件（基础设施）
- `server.js` — async 启动 + 优雅关闭
- `server/db/database.js` — 双导出 async 模式（db + getAdapter）
- `package.json` / `package-lock.json` — 依赖（pg 等）

### 修改文件（路由层，12 个）
- `server/routes/admin.js` ⚠️ 与 main 有冲突
- `server/routes/plan.js` ⚠️ 与 main 有冲突
- `server/routes/articles.js`
- `server/routes/assistant.js`
- `server/routes/auth.js`
- `server/routes/chat.js`
- `server/routes/diabetes.js`
- `server/routes/doctors.js`
- `server/routes/index.js`
- `server/routes/punch.js`
- `server/routes/risk.js`
- `server/routes/user.js`

## 审查重点

依据迁移计划，重点核查以下方面是否符合方案：

### 1. 适配层设计（迁移计划 §3）
- 文件结构是否符合 §3.1（server/db/adapter/ 下 DatabaseAdapter/SqliteAdapter/KingbaseAdapter）
- 接口定义是否符合 §3.2（query/queryOne/execute/transaction 等方法签名与语义）
- SqliteAdapter 实现是否符合 §3.3（better-sqlite3 Promise 封装、事务模式）
- KingbaseAdapter 实现是否符合 §3.4（pg.Pool、?->$N 参数转换、INSERT RETURNING id、时区 UTC、连接池配置、SSL/TLS）
- database.js 改造是否符合 §3.5（双导出、getAdapter 工厂、DB_TYPE 切换）
- server.js 启动流程是否符合 §3.5.1（async 启动、优雅关闭、adapter 初始化）
- 路由层改动是否符合 §3.6（db.prepare → adapter.query/queryOne/execute）

### 2. SQL 方言差异（迁移计划 §4）
- 方言差异清单 §4.1 是否全部覆盖（?占位符、json_extract、INSERT RETURNING、布尔值、日期函数、AUTOINCREMENT/SEQUENCE、LIMIT OFFSET、双引号、PRAGMA、GROUP_CONCAT/STRING_AGG 等）
- 方言统一策略 §4.2 是否正确实现（sql.js 辅助模块）
- dateRange.js 兼容性 §4.2.1
- DDL 层面差异 §4.3

### 3. 双数据库支持（迁移计划 §5）
- Phase 0/1 实现是否符合 §6（Phase 0 适配层+SQLite验证，Phase 1 金仓双库验证）
- 版本一致性 §5.2

### 4. 连接池管理（迁移计划 §7）
- SQLite 连接池 §7.1
- KingbaseES 连接池 §7.2（max、idleTimeoutMillis、statement_timeout 等）

### 5. 事务处理适配（迁移计划 §8）
- 事务模式改造 §8.2（adapter.transaction(callback)）
- 受影响文件 §8.3
- 事务隔离级别与并发安全 §8.5

### 6. admin /execute 动态 SQL 方言（迁移计划 §9）
- 动态 SQL 在金仓下的方言处理 §9.2

### 7. init_kingbase 与 init.sql 对齐（迁移计划 §10）
- DDL 对齐 §10.2
- 种子数据一致性

### 8. 环境配置（迁移计划 §11）
- .env 字段 §11.1（DB_TYPE、DATABASE_URL、连接池、SSL）
- 凭据安全 §11.3

## 审查维度

| 维度 | 关注点 |
|------|--------|
| 正确性 | 逻辑、边界、异常路径、类型使用、错误处理、Promise/async 正确性 |
| 设计合理性 | 职责划分、抽象层次、依赖关系、与迁移计划符合性 |
| SQL 方言 | 占位符转换、方言差异处理、DDL 对齐、种子数据一致性 |
| 事务 | 事务模式、隔离级别、并发安全、回滚 |
| 安全性 | 注入、SQL 拼接、凭据处理、SSL/TLS |
| 性能 | 连接池、不必要拷贝、资源管理 |
| 可读性/可维护性 | 命名、结构、必要注释 |

## 问题严重程度

- **严重**：逻辑错误、数据丢失风险、安全漏洞、崩溃风险、与迁移计划核心要求不符
- **一般**：设计不合理、违反规范、错误处理不完善、与迁移计划部分要求不符
- **轻微**：可读性改进、性能优化、更好实践方式

## 冲突说明

PR 与 main 在 `server/routes/admin.js` 和 `server/routes/plan.js` 存在冲突。
- 原因：PR 基于较早的 main（commit e202101），之后 main 合并了 PR #13（fix review issues）和批次8修复（commit ff4619c, fc167e7），这些修复也改动了这两个文件。
- 审查阶段：暂存区中这两个文件已采用 PR 版本（审查 PR 作者实际提交的代码）。
- 冲突的集成解决（如何合并 main 的修复与 PR 的迁移改造）在审查完成后单独处理。

## 排除范围

- `package-lock.json` 不做内容审查（仅确认依赖添加合理）
- 前端代码（本次 PR 未涉及）
- 金仓实际运行验证（无金仓环境，仅静态审查）
