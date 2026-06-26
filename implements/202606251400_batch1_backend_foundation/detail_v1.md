# Design v1: 项目初始化 — package.json 与环境变量

## 1. package.json 设计

### 1.1 字段值表

| 字段 | 值 | 说明 |
|------|-----|------|
| `name` | `"diabetes-assistant-backend"` | 项目名称，全小写 kebab-case |
| `version` | `"1.0.0"` | 语义化版本起始 |
| `description` | `"糖尿病预治智能助手后端服务"` | 项目一句话描述 |
| `main` | `"server.js"` | 入口文件，位于项目根目录 |
| `private` | `true` | 防止意外发布到 npm registry |
| `scripts` | (见第 1.3 节) | npm 命令脚本集合 |
| `dependencies` | (见第 1.2 节) | 运行时依赖 |
| `devDependencies` | (见第 1.2 节) | 开发依赖 |

### 1.2 dependencies 与 devDependencies 版本规范

> 所有版本号来自设计文档 1.3 节技术选型表，取各主版本号下的最新稳定版。使用 `^` 语义化版本范围前缀（兼容次版本和补丁版本更新）。

#### 1.2.1 运行时依赖 (dependencies)

| 包名 | 版本 | 选型理由 | 引用位置（设计文档） |
|------|------|---------|---------------------|
| `express` | `"^4.21.0"` | Web 框架，提供路由、中间件、静态文件服务。设计文档 1.3 节指定 4.x。 | `server/app.js`, `server/routes/*`, `server/middleware/*` |
| `better-sqlite3` | `"^9.6.0"` | Node.js 同步 SQLite 驱动，比异步驱动更简单直接。设计文档 1.3 节指定 9.x。 | `server/db/database.js` |
| `bcryptjs` | `"^2.4.3"` | 纯 JavaScript bcrypt 实现，无需编译 node-gyp，跨平台友好。设计文档 1.3 节指定 2.x。 | `server/db/database.js`, `server/routes/auth.js` |
| `jsonwebtoken` | `"^9.0.2"` | JWT 签发与验证，用于用户认证。设计文档 1.3 节指定 9.x。 | `server/middleware/auth.js`, `server/routes/auth.js` |
| `dotenv` | `"^16.4.5"` | 从 `.env` 文件加载环境变量到 `process.env`。设计文档 1.3 节指定 16.x。 | `server.js`（入口文件最先加载） |
| `cors` | `"^2.8.5"` | Express CORS 中间件，允许浏览器跨域请求。设计文档 1.3 节未列出版本号，取最新稳定版。 | `server/app.js` |
| `multer` | `"^1.4.5-lts.1"` | Express multipart/form-data 解析中间件，用于文件上传。设计文档 1.3 节指定 1.x。 | `server/routes/upload.js` |

#### 1.2.2 开发依赖 (devDependencies)

| 包名 | 版本 | 选型理由 |
|------|------|---------|
| `nodemon` | `"^3.1.4"` | 监听文件变更自动重启服务，开发热重载。设计文档 1.3 节未列出版本号，取最新 3.x 稳定版。 |

#### 1.2.3 不包含的常见字段

以下字段**不出现**在 package.json 中：
- `type: "module"` — 本项目使用 CommonJS (`require`) 而非 ESM (`import`)，因为 `better-sqlite3` 的同步 API 在 CommonJS 下最自然。
- `engines` — 不在 package.json 声明，服务器环境由运维保证 Node.js 18 LTS。
- `license` — 不声明，非 open-source 项目。
- `repository` — 不声明，非开源项目。

### 1.3 scripts 定义

| script 名 | 命令 | 用途 | 使用场景 |
|-----------|------|------|---------|
| `start` | `"node server.js"` | 生产环境启动 Express 服务 | 部署时执行 `npm start` |
| `dev` | `"nodemon server.js"` | 开发环境热重载启动 | 本地开发时执行 `npm run dev` |

> `nodemon` 不需要额外配置文件 (`nodemon.json`)，使用默认行为：监听当前目录所有 `.js`/`.json`/`.mjs` 文件变更后重启。

### 1.4 package.json 完整字段结构（顺序）

按 npm 惯例，字段写入顺序如下：

```text
name → version → description → main → private → scripts → dependencies → devDependencies
```

> 仅此 8 个顶级字段，不含任何其他字段。

---

## 2. .env 设计

### 2.1 完整环境变量清单

> 格式：每行一个 `KEY=VALUE`，不可有空行，不可有注释（`#` 行在 dotenv 中会被解析为键值对或忽略，为安全起见不使用注释）。

| 序号 | 变量名 | 默认值/占位符 | 必填 | 数据类型 | 用途说明 |
|------|--------|-------------|------|---------|---------|
| 1 | `PORT` | `3000` | 是 | integer | Express 服务器监听端口。Nginx 反向代理将 `/api/*` 请求转发至 `http://localhost:3000`。 |
| 2 | `JWT_SECRET` | `replace_with_random_secret` | 是 | string (>=256bit) | JWT 签名密钥。部署时使用 `openssl rand -hex 32` 生成 32 字节（256 bit）随机字符串替换此占位符。该密钥同时用于 doctor_information.chat_token 的 AES-256-GCM 加密密钥派生（设计文档 7.8 节）。 |
| 3 | `DB_PATH` | `./data/database.sqlite` | 是 | string (path) | SQLite 数据库文件相对路径。Express 启动时通过 `better-sqlite3` 在此路径创建/连接数据库文件。`data/` 目录如不存在，由 `server/db/database.js` 在首次连接时自动创建。 |
| 4 | `DIFY_API_BASE` | `http://182.92.74.224/v1` | 是 | string (URL) | Dify 平台 API 基础地址。所有 Dify API 请求（工作流、Agent、聊天助手）均以此为前缀拼接具体端点路径。末尾不含 `/`。 |
| 5 | `DIFY_RISK_WORKFLOW_KEY` | (留空) | 否（后续配置） | string | 风险预测工作流 API Key。Dify 平台 `diabetes-risk-predictor` 工作流的 API 密钥。此批次留空，待后续 Dify 平台配置完成后填充。未配置时，`POST /api/risk/predict` 返回 503 错误。 |
| 6 | `DIFY_PLAN_WORKFLOW_KEY` | (留空) | 否（后续配置） | string | 生活方案工作流 API Key。Dify 平台 `life-plan-generator` 工作流的 API 密钥。此批次留空，待后续 Dify 平台配置完成后填充。未配置时，`POST /api/plan/generate` 返回 503 错误。 |
| 7 | `DIFY_ARTICLE_WORKFLOW_KEY` | (留空) | 否（后续配置） | string | 文章生成工作流 API Key。Dify 平台 `health-article-generator` 工作流的 API 密钥。此批次留空，待后续 Dify 平台配置完成后填充。未配置时，`POST /api/articles/generate` 返回 503 错误。 |
| 8 | `DIFY_ASSISTANT_APP_KEY` | (留空) | 否（后续配置） | string | AI 助手应用 API Key。Dify 平台 `diabetes-assistant-agent` 应用的 API 密钥。此批次留空，待后续 Dify 平台配置完成后填充。未配置时，`POST /api/assistant/chat` 返回 503 错误。 |

### 2.2 .env 写入格式

```text
PORT=3000
JWT_SECRET=replace_with_random_secret
DB_PATH=./data/database.sqlite
DIFY_API_BASE=http://182.92.74.224/v1
DIFY_RISK_WORKFLOW_KEY=
DIFY_PLAN_WORKFLOW_KEY=
DIFY_ARTICLE_WORKFLOW_KEY=
DIFY_ASSISTANT_APP_KEY=
```

> 规则：
> - 每行一个 `KEY=VALUE`，无空格、无引号。
> - 空值字段写 `KEY=`（仅等号，右侧无任何字符，包括无空格）。
> - 文件末尾保留一个换行符（POSIX 标准）。
> - 不包含任何注释行。

---

## 3. .env.example 设计

### 3.1 设计原则

- `.env.example` 是 `.env` 的**模板副本**，结构完全一致。
- 所有密钥字段填写**示例值**或**空值**，不包含任何真实密钥。
- 唯一差异：`JWT_SECRET` 在 `.env.example` 中填写**带有说明的占位符**，帮助开发者理解如何生成。

### 3.2 .env.example 写入格式

```text
PORT=3000
JWT_SECRET=your_jwt_secret_here_replace_with_openssl_rand_hex_32
DB_PATH=./data/database.sqlite
DIFY_API_BASE=http://182.92.74.224/v1
DIFY_RISK_WORKFLOW_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
DIFY_PLAN_WORKFLOW_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
DIFY_ARTICLE_WORKFLOW_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
DIFY_ASSISTANT_APP_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
```

### 3.3 .env 与 .env.example 差异对照

| 变量 | .env 中的值 | .env.example 中的值 | 差异说明 |
|------|------------|-------------------|---------|
| `PORT` | `3000` | `3000` | 完全相同 |
| `JWT_SECRET` | `replace_with_random_secret` | `your_jwt_secret_here_replace_with_openssl_rand_hex_32` | `.env` 是简短占位符（用于 code review 时一眼识别为待替换），`.env.example` 是说明性占位符（告诉开发者用 `openssl rand -hex 32` 生成） |
| `DB_PATH` | `./data/database.sqlite` | `./data/database.sqlite` | 完全相同 |
| `DIFY_API_BASE` | `http://182.92.74.224/v1` | `http://182.92.74.224/v1` | 完全相同 |
| `DIFY_RISK_WORKFLOW_KEY` | (空) | `app-xxxxxxxxxxxxxxxxxxxxxxxx` | `.env` 留空（待配置），`.env.example` 用 `app-XXX` 格式的示例值指示密钥格式 |
| `DIFY_PLAN_WORKFLOW_KEY` | (空) | `app-xxxxxxxxxxxxxxxxxxxxxxxx` | 同上 |
| `DIFY_ARTICLE_WORKFLOW_KEY` | (空) | `app-xxxxxxxxxxxxxxxxxxxxxxxx` | 同上 |
| `DIFY_ASSISTANT_APP_KEY` | (空) | `app-xxxxxxxxxxxxxxxxxxxxxxxx` | 同上 |

### 3.4 .env.example 文件顶部说明

> `.env.example` 文件不包含注释（与 `.env` 保持一致），但 Coder 可在文件第一条变量前加一行空行，使文件以 `PORT=3000` 为第一有效行开始。

---

## 4. 文件写入顺序与注意事项

### 4.1 写入顺序

| 顺序 | 文件 | 路径 | 依赖 | 说明 |
|------|------|------|------|------|
| 1 | `package.json` | `/home/derpyIsTheBest/qingruanProject2026/package.json` | 无 | 项目根目录，最先创建 |
| 2 | `.env` | `/home/derpyIsTheBest/qingruanProject2026/.env` | 无文件依赖，但逻辑上依赖 package.json 中声明的 `dotenv` | 包含占位密钥 |
| 3 | `.env.example` | `/home/derpyIsTheBest/qingruanProject2026/.env.example` | 无，是 .env 的脱敏副本 | 模板文件 |

### 4.2 注意事项

1. **文件编码**：3 个文件均使用 **UTF-8 无 BOM** 编码。
2. **行尾符**：使用 **LF**（Unix 风格换行符），非 CRLF。
3. **文件末尾**：每个文件末尾保留**一个**空白行（即最后一行后跟一个 `\n`）。
4. **.gitignore**：`.env` 应添加到 `.gitignore`。如项目根目录已存在 `.gitignore`，追加一行 `.env`；如不存在则本批次暂不创建 `.gitignore`（由后续批次处理）。`.env.example` 需要纳入版本控制。
5. **不执行 `npm install`**：本任务仅创建 `package.json` 文件，不运行 `npm install`。依赖的实际安装由调用方在文件创建完成后手动执行，或由后续批次 CI/CD 流程处理。
6. **所有 Dify Key 留空**：4 个 Dify 相关环境变量（`DIFY_RISK_WORKFLOW_KEY`、`DIFY_PLAN_WORKFLOW_KEY`、`DIFY_ARTICLE_WORKFLOW_KEY`、`DIFY_ASSISTANT_APP_KEY`）在 `.env` 中均留空值。这些 Key 需在 Dify 平台完成工作流/Agent 创建后获取，届时手动填入 `.env`。
7. **`JWT_SECRET` 部署时替换**：`.env` 中的 `JWT_SECRET=replace_with_random_secret` 为占位符。生产部署前须使用 `openssl rand -hex 32` 生成 64 字符（32 字节十六进制）随机字符串替换之。
8. **`DB_PATH` 相对路径**：`./data/database.sqlite` 为相对于项目根目录的路径。Express 启动时 `process.cwd()` 即为项目根目录，`dotenv` 加载后 `process.env.DB_PATH` 可直接用于 `better-sqlite3` 的连接路径。

---

## 5. 设计依据追溯

| 设计决策 | 依据 |
|---------|------|
| 依赖包列表（7 个运行时 + 1 个开发） | task_v1.md 第 16-27 行 |
| 技术选型版本范围 | docs/2_detailed_design_v3.md 第 1.3 节技术选型详情表 |
| scripts（start、dev） | task_v1.md 第 28-29 行 |
| 入口文件为 server.js | task_v1.md 第 17 行、设计文档 1.4 节目录结构 |
| 环境变量名称与用途 | task_v1.md 第 35-42 行 |
| JWT_SECRET 占位符写法 | task_v1.md 第 36 行 + 第 57 行 |
| Dify Key 留空策略 | task_v1.md 第 39-42 行 + 第 56 行 |
| .env.example 脱敏原则 | task_v1.md 第 45-47 行 |
| .gitignore 处理策略 | task_v1.md 第 55 行 |
| AES-256-GCM 加密密钥派生依赖 JWT_SECRET | 设计文档 2.2 节 doctor_information 表 chat_token 注释（v15 修订）、设计文档 7.8 节 |
| Dify API Base 地址 | task_v1.md 第 38 行 = 设计文档 1.3 节 Dify 平台 SaaS |
