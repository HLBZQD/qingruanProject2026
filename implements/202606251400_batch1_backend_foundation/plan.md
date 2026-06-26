# Batch 1 实现计划

## 概述
完成 Express 后端最小启动能力，并完成 SQLite 数据库初始化。该批次是后续所有接口开发的基础。

## 当前项目状态
- `server/` 目录仅含空的 `README.md`
- `package.json` 不存在（需新建）
- 无 `.env` / `.env.example`
- 无任何数据库文件

## 任务清单

### 1. 初始化 npm 依赖和 package.json
- **目标**: 创建项目根目录的 `package.json`，安装所有基础依赖
- **涉及文件**: `package.json`（新建）
- **依赖**: 无
- **依赖项**:
  - `express` — Web 框架
  - `better-sqlite3` — SQLite 同步驱动
  - `bcryptjs` — 密码哈希
  - `jsonwebtoken` — JWT 生成与验证
  - `dotenv` — 环境变量加载
  - `cors` — 跨域支持
  - `multer` — 文件上传中间件
  - `nodemon` (devDependencies) — 开发热重载

### 2. 创建环境配置文件
- **目标**: 创建 `.env` 和 `.env.example` 环境变量配置文件
- **涉及文件**: `.env`（新建，含占位密钥）、`.env.example`（新建，模板文件）
- **依赖**: 任务 1（需 `dotenv` 已安装）

### 3. 创建数据库 DDL 脚本
- **目标**: 编写完整的 `server/db/init.sql`，包含 10 张核心表的 DDL + 18 条索引
- **涉及文件**: `server/db/init.sql`（新建）
- **依赖**: 无
- **关键设计要点**:
  - 所有枚举字段使用英文小写值（与 CHECK 约束一致）
  - `articles.tags` 为 TEXT 存储 JSON 数组，默认值 `'[]'`
  - `life_plans` 有 `plan_id` 用于方案组标识
  - `punch_in.punch_type` CHECK 为 `diet/exercise`
  - `pregnancy` 字段为 `INTEGER(0/1/NULL)`

### 4. 创建初始数据 seed 脚本
- **目标**: 编写 `server/db/seed.sql`，包含管理员、医生、糖尿病类型、示例文章初始数据
- **涉及文件**: `server/db/seed.sql`（新建）
- **依赖**: 任务 3（依赖 init.sql 中定义的表结构）
- **关键设计要点**:
  - 管理员密码使用 bcrypt 占位符 `PLACEHOLDER_BCRYPT_HASH_GOES_HERE`
  - 医生 chat_token 使用占位符 `app-PLACEHOLDER_DOC[N]`
  - seed.sql 中的管理员密码需由 database.js 在初始化时自动替换为真实 bcrypt 哈希

### 5. 创建数据库连接管理模块
- **目标**: 实现 `server/db/database.js`，负责 SQLite 连接创建、外键约束开启、自动执行 init.sql 和 seed.sql、seed 中 bcrypt 占位符替换
- **涉及文件**: `server/db/database.js`（新建）
- **依赖**: 任务 1（需 `better-sqlite3`、`bcryptjs` 已安装）、任务 3、任务 4

### 6. 创建统一错误处理中间件
- **目标**: 实现 `server/middleware/errorHandler.js`，统一捕获和处理 Express 错误
- **涉及文件**: `server/middleware/errorHandler.js`（新建）
- **依赖**: 无

### 7. 创建路由挂载模块
- **目标**: 实现 `server/routes/index.js`，挂载 `/api/*` 下所有路由，提供 `/api/health` 健康检查
- **涉及文件**: `server/routes/index.js`（新建）
- **依赖**: 无（后续批次的路由模块暂未创建，先以占位方式挂载）

### 8. 创建 Express 应用配置模块
- **目标**: 实现 `server/app.js`，注册中间件（JSON 解析、CORS、静态资源、路由、错误处理）
- **涉及文件**: `server/app.js`（新建）
- **依赖**: 任务 6、任务 7

### 9. 创建 Express 入口文件
- **目标**: 实现根目录 `server.js`，加载 dotenv、初始化数据库、启动 Express 服务
- **涉及文件**: `server.js`（新建）
- **依赖**: 任务 2、任务 5、任务 8

## 文件创建顺序与依赖图

```
package.json (任务1) ──────────────────────────────────────────────┐
                                                                     │
.env / .env.example (任务2) ────────────────────────────────────────┤
                                                                     │
server/db/init.sql (任务3) ─────────────────────────┐                │
                                                     ├──► database.js (任务5) ──► server.js (任务9)
server/db/seed.sql (任务4) ──────────────────────────┘                │
                                                                      │
server/middleware/errorHandler.js (任务6) ─┐                          │
                                            ├──► app.js (任务8) ──────┘
server/routes/index.js (任务7) ─────────────┘
```

- 任务 3、4 可并行
- 任务 6、7 可并行
- 任务 5 依赖 1、3、4
- 任务 8 依赖 6、7
- 任务 9 依赖 2、5、8
- 任务 1 是所有依赖安装的前提
