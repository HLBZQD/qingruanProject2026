# Task v1: 项目初始化 — package.json 与环境变量

## 任务目标
创建项目根目录的 `package.json`、`.env`、`.env.example` 文件，为整个批次奠定依赖和环境基础。

## 涉及文件

| 文件 | 操作 | 职责说明 |
|------|------|---------|
| `package.json` | 新建 | Node.js 项目配置，声明所有运行时和开发依赖，定义 npm scripts（`start`、`dev`） |
| `.env` | 新建 | 环境变量配置文件，含 PORT、JWT_SECRET、DB_PATH、Dify 平台各 Key 等（含占位值） |
| `.env.example` | 新建 | 环境变量模板文件（.env 的脱敏副本），供其他开发者参考 |

## 文件职责详述

### package.json
- 声明项目名称、版本、描述、入口脚本 `server.js`
- **dependencies**（运行时依赖）:
  - `express` — Web 框架，提供路由、中间件、静态文件服务
  - `better-sqlite3` — Node.js 同步 SQLite 驱动，比异步驱动更简单直接
  - `bcryptjs` — 纯 JavaScript bcrypt 实现，无需编译 node-gyp，跨平台友好
  - `jsonwebtoken` — JWT 签发与验证，用于用户认证
  - `dotenv` — 从 `.env` 文件加载环境变量到 `process.env`
  - `cors` — Express CORS 中间件，允许浏览器跨域请求
  - `multer` — Express multipart/form-data 解析中间件，用于文件上传
- **devDependencies**（开发依赖）:
  - `nodemon` — 监听文件变更自动重启服务
- **scripts**:
  - `start` — `node server.js`（生产启动）
  - `dev` — `nodemon server.js`（开发热重载）

### .env
- 格式为 `KEY=VALUE`，每行一个变量
- 包含变量：
  - `PORT=3000` — Express 监听端口
  - `JWT_SECRET=replace_with_random_secret` — JWT 签名密钥（部署时替换为随机字符串）
  - `DB_PATH=./data/database.sqlite` — SQLite 数据库文件路径
  - `DIFY_API_BASE=http://182.92.74.224/v1` — Dify 平台 API 基础地址
  - `DIFY_RISK_WORKFLOW_KEY=` — 风险预测工作流 API Key（后续配置）
  - `DIFY_PLAN_WORKFLOW_KEY=` — 生活方案工作流 API Key（后续配置）
  - `DIFY_ARTICLE_WORKFLOW_KEY=` — 文章生成工作流 API Key（后续配置）
  - `DIFY_ASSISTANT_APP_KEY=` — AI 助手应用 API Key（后续配置）

### .env.example
- 与 `.env` 结构完全一致，但所有密钥字段留空或填写示例值
- 不包含任何真实密钥或敏感信息
- 供代码仓库提交，其他开发者复制为 `.env` 后填入真实配置

## 文件依赖关系
- `package.json` → 无依赖（最先创建）
- `.env` → 无文件依赖，但声明了后续 `server.js` 将通过 `dotenv` 加载的变量名
- `.env.example` → 无依赖，是 `.env` 的模板副本

## 注意事项
1. `.env` 应添加到 `.gitignore`（如项目已有 `.gitignore` 则追加此行；如不存在则本 batch 暂不创建 `.gitignore`，由后续批处理）
2. 所有 Dify 相关 Key 在此批次留空，待 Dify 平台配置完成后填充
3. `JWT_SECRET` 使用占位符 `replace_with_random_secret`，部署时替换为 `openssl rand -hex 32` 生成的随机字符串
4. 本任务完成后，后续任务 3-9 才能在已安装依赖的基础上进行
