# 批次 1 实现需求：后端基础工程与数据库初始化

## 批次目标
完成 Express 后端最小启动能力，并完成 SQLite 数据库初始化。该批次是后续所有接口开发的基础。

## 涉及文件
```
server.js
server/app.js
server/db/database.js
server/db/init.sql
server/db/seed.sql
server/routes/index.js
server/middleware/errorHandler.js
.env
.env.example
```

## 实现内容

### 1.3.1 初始化后端依赖
安装基础依赖：
```bash
npm install express better-sqlite3 bcryptjs jsonwebtoken dotenv cors multer
npm install -D nodemon
```

### 1.3.2 配置环境变量
`.env` 至少包含：
```env
PORT=3000
JWT_SECRET=replace_with_random_secret
DB_PATH=./data/database.sqlite

DIFY_API_BASE=http://182.92.74.224/v1
DIFY_RISK_WORKFLOW_KEY=
DIFY_PLAN_WORKFLOW_KEY=
DIFY_ARTICLE_WORKFLOW_KEY=
DIFY_ASSISTANT_APP_KEY=
```

### 1.3.3 实现 Express 应用入口
要求：
- 支持 JSON 请求体解析
- 支持 CORS
- 支持 `/api/*` 路由挂载
- 支持 `/static/*` 静态资源访问
- 注册统一错误处理中间件
- 提供 `/api/health` 健康检查接口

### 1.3.4 实现数据库初始化
要求：
- 自动创建 `data/` 目录
- 自动创建 `database.sqlite`
- 开启 SQLite 外键约束
- 自动执行 `init.sql`
- 首次启动执行 `seed.sql`
- 导出统一 `db` 实例

关键配置：`db.pragma('foreign_keys = ON');`

### 1.3.5 建立核心数据表
至少建立以下表：
```
users
doctor_information
articles
diabetes_types
article_collections
user_risk_info
life_plans
life_advice
punch_in
admin_logs
```

## 完整 DDL（来自详细设计文档）

详见 `/home/derpyIsTheBest/qingruanProject2026/docs/2_detailed_design_v3.md` 第 2 章，包含所有 10 张表的完整 DDL、索引、seed 数据。

关键设计要点：
- 所有枚举字段使用英文小写值（与 CHECK 约束一致）
- `articles.tags` 为 TEXT 存储 JSON 数组，默认值 '[]'
- `life_plans` 有 `plan_id` 用于方案组标识
- `punch_in.punch_type` CHECK 为 diet/exercise
- `pregnancy` 字段为 INTEGER(0/1/NULL)
- seed.sql 中的管理员密码需用 bcrypt 哈希占位符，由 database.js 在初始化时自动替换

## 交付物
| 交付物 | 说明 |
|---|---|
| Express 服务 | 后端可正常启动 |
| SQLite 数据库文件 | `data/database.sqlite` 自动生成 |
| 初始化表结构 | 核心数据表存在 |
| 初始数据 | 管理员、医生、糖尿病类型、示例文章 |
| 健康检查接口 | `/api/health` 可访问 |

## 验收标准
- 后端服务启动无报错
- `/api/health` 返回正常状态
- 数据库文件自动生成
- SQLite 中能查询到核心表
- 初始医生、糖尿病类型、示例文章数据存在

## 项目根目录
/home/derpyIsTheBest/qingruanProject2026

## 详细设计文档参考
/home/derpyIsTheBest/qingruanProject2026/docs/2_detailed_design_v3.md
