# 引入国产金仓数据库 KingbaseES 技术方案

## 背景

本项目「糖尿病预治智能助手」当前使用 SQLite (better-sqlite3) 作为数据库，无 ORM 层，所有数据库访问通过原始 SQL 语句配合 prepared statements 实现。项目已有 `server/db/init_kingbase.sql` 迁移脚本。

## 核心要求

在不影响现有项目功能的前提下，讨论如何渐进式引入国产金仓数据库 KingbaseES。

## 项目当前技术栈

- **前端**：Vue 3 + TypeScript + Vite（`src/`）
- **后端**：Express.js（`server/`）
- **数据库**：SQLite via better-sqlite3，无 ORM，原始 SQL
- **数据库文件**：`server/db/database.js` 初始化连接，`server/db/init.sql` DDL，`server/db/seed.sql` 种子数据
- **已有迁移脚本**：`server/db/init_kingbase.sql`

## 当前数据库架构

- 10 张表：users, doctor_information, articles, diabetes_types, article_collections, user_risk_info, life_plans, life_advice, punch_in, admin_logs
- 数据库访问方式：各路由模块直接使用 `db.prepare('SQL').run/get/all()` 模式
- 连接初始化在 `server/db/database.js`，通过 `initDatabase()` 函数统一管理
- 使用 WAL 模式、外键约束、busy timeout
- 种子数据：1 个管理员、3 个医生、4 种糖尿病类型、3 篇示例文章

## KingbaseES 背景

金仓数据库（KingbaseES）是国产 PostgreSQL 兼容数据库，语法、驱动与 PostgreSQL 基本一致。

## 需讨论的技术问题

1. 驱动选型：使用 `pg` 还是 `pg-promise` 等 PostgreSQL 驱动连接 KingbaseES
2. 数据库访问层改造：是否需要引入 ORM/Knex/抽象层，还是继续保持原始 SQL
3. SQL 方言差异：SQLite SQL 与 PostgreSQL/KingbaseES SQL 的语法差异处理
4. 双数据库支持策略：开发环境 SQLite + 生产环境 KingbaseES，还是统一迁移
5. 渐进式迁移路径：如何逐步替换而不影响现有功能
6. 连接池管理：KingbaseES 的连接池配置
7. 事务处理差异：SQLite 同步 vs PostgreSQL 异步的事务模型适配
8. 已有 `init_kingbase.sql` 脚本的评估与完善
9. 环境配置：`.env` 中数据库类型切换开关设计
10. 前端无变动：前端代码无需修改
