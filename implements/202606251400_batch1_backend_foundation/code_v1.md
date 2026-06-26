# Batch 1 Backend Foundation — Code Implementation Summary

## Created Files

| # | File | Description |
|---|------|-------------|
| 1 | `package.json` | 项目配置: 7 dependencies + 1 devDependency, CommonJS |
| 2 | `.env` | 环境变量配置 (含占位密钥) |
| 3 | `.env.example` | 环境变量模板 (脱敏副本) |
| 4 | `server/db/init.sql` | 10 张表的完整 DDL + 18 条索引 |
| 5 | `server/db/seed.sql` | 初始数据: 管理员 + 3 医生 + 4 糖尿病类型 + 3 篇文章 |
| 6 | `server/db/database.js` | SQLite 连接管理: 自动建目录、执行 init/seed、bcrypt 占位符替换 |
| 7 | `server/middleware/errorHandler.js` | 统一错误处理中间件 (AppError + catch-all) |
| 8 | `server/routes/index.js` | API 路由挂载 + `/api/health` 健康检查 |
| 9 | `server/app.js` | Express 应用配置: CORS、JSON 解析、路由、静态资源、错误处理 |
| 10 | `server.js` | Express 入口: dotenv 加载、数据库初始化、服务启动 |

## Directories Created

- `server/db/`
- `server/middleware/`
- `server/routes/`
- `server/services/`
- `server/utils/`
- `data/`
- `static/uploads/avatars/`

## Key Design Decisions

- **CommonJS** (require/module.exports), no ESM
- **`database.js`**: Creates data/ directory automatically, enables foreign_keys pragma, replaces `PLACEHOLDER_BCRYPT_HASH_GOES_HERE` with bcryptjs hash of "admin123" on first run
- **`seed.sql`**: Admin password uses placeholder (replaced at runtime), doctor chat_tokens use `app-PLACEHOLDER_DOC1/2/3`
- **All DDL**: Enum CHECK constraints in English lowercase, `tags TEXT NOT NULL DEFAULT '[]'`, `life_plans` has `plan_id`, `punch_in.punch_type CHECK IN ('diet', 'exercise')`, `pregnancy INTEGER CHECK(pregnancy IN (0, 1) OR pregnancy IS NULL)`, `admin_logs` uses `operator_id`
- **Error format**: `{ error: { code: "...", message: "..." } }`
