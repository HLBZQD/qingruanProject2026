# 任务指令（v3）

## 动作
NEW

## 任务描述
更新 `.env.example` 文件的 Dify 相关环境变量注释文档。在文件顶部添加一个醒目的多行注释块，说明 Dify 平台 Workflow 和 Agent 两种应用类型互斥、每个应用需要独立的 API Key、以及当前配置中 Key 共享的风险。然后为每个 Dify 环境变量添加行内注释，标注其应用类型（Workflow / Agent / Service）和具体用途。

预期修改文件：`C:\Users\DELL\Desktop\qingruanProject2026\.env.example`

## 选择理由
- R1（双/v1路径拼接）和 R2（Agent代理路由）已修复并验证通过（107 tests passed）。
- 问题 C（API Key 配置冲突）是最后一个待修复问题。代码层面无法解决 Key 共享问题——需在 Dify 平台创建独立应用并分配独立 Key。但完善的注释文档能降低未来配置错误的风险，让运维人员明确每个 Key 的应用类型要求。
- 仅涉及 1 个文件（`.env.example`），注释修改不涉及代码逻辑，独立可完成，无依赖。

## 任务上下文

### 问题描述（requirement.md 问题 C）

`.env` 中 5 个 Dify API Key 共享同一值 `app-tPGIaTY3opz7ycWL5YqI7B6s`，但该 Key 在 Dify 平台只能对应一种应用类型（Workflow 或 Agent），无法同时满足 Workflow 类型应用（life-plan-generator、health-article-generator）和 Agent 类型应用（diabetes-assistant-agent、admin-manager-agent）的需求。

### 修复方向（requirement.md 问题 C）

> 无法在代码层面修复。诊断报告建议在 Dify 平台创建独立应用并为每个应用分配独立 API Key。代码层面可在 `.env.example` 中添加注释说明每个 Key 的应用类型要求。

### 6 个 Dify 环境变量的应用类型分布（diag_v3.md 5.1 节）

| 环境变量 | 设计文档中的应用类型 | 说明 |
|---------|-------------------|------|
| `DIFY_RISK_WORKFLOW_KEY` | **Workflow** (5.2.1 节 risk-prediction) | 糖尿病风险评估工作流 |
| `DIFY_PLAN_WORKFLOW_KEY` | **Workflow** (5.2.2 节 life-plan-generator) | 生活方案生成工作流 |
| `DIFY_ARTICLE_WORKFLOW_KEY` | **Workflow** (5.2.3 节 health-article-generator) | 健康文章生成工作流 |
| `DIFY_ASSISTANT_APP_KEY` | **Agent** (5.2.5 节 diabetes-assistant-agent) | 糖尿病助手 Agent（Function Calling 模式，8个专用工具） |
| `DIFY_ADMIN_AGENT_KEY` | **Agent** (5.2.6 节 admin-manager-agent) | 管理员 Agent |
| `DIFY_SERVICE_API_KEY` | **Service** (difyAuth.js 回调校验) | Dify Agent 工具回调 `/api/admin/execute` 的验证密钥 |

### 当前 .env 中的 Key 共享情况（diag_v3.md 5.1-5.2 节）

- `DIFY_RISK_WORKFLOW_KEY` 使用独立 Key 值（`app-hYnpvbv3WsrWtnlr3Mnv0vAu`）
- 其余 5 个 Key 共享 `app-tPGIaTY3opz7ycWL5YqI7B6s`

共享 Key 的 5 个变量横跨 Workflow（DIFY_PLAN_WORKFLOW_KEY、DIFY_ARTICLE_WORKFLOW_KEY）和 Agent（DIFY_ASSISTANT_APP_KEY、DIFY_ADMIN_AGENT_KEY）两种互斥应用类型，构成功能性矛盾。

### 约束（requirement.md）

- 不修改 `.env` 文件本身（仅修改 `.env.example` 模板）
- 注释不影响现有代码运行（纯文档化）

## 已有代码上下文

### 被注释的 Key 的调用方

| 环境变量 | 调用文件 | 调用方式 |
|---------|---------|---------|
| `DIFY_RISK_WORKFLOW_KEY` | `server/routes/risk.js` | `callWorkflowBlocking(apiKey, inputs, 'risk')` — 调用 `/workflows/run` |
| `DIFY_PLAN_WORKFLOW_KEY` | `server/routes/plan.js` | `callWorkflowBlocking(apiKey, inputs, 'plan')` — 调用 `/workflows/run` |
| `DIFY_ARTICLE_WORKFLOW_KEY` | `server/routes/articles.js` | `callWorkflowBlocking(apiKey, inputs, 'article')` — 调用 `/workflows/run` |
| `DIFY_ASSISTANT_APP_KEY` | `server/routes/assistant.js:26` | `proxyAgentSSE({ apiKey: process.env.DIFY_ASSISTANT_APP_KEY, ... })` — 调用 `/chat-messages` |
| `DIFY_ASSISTANT_APP_KEY` | `server/routes/assistant.js:76` | `callDifyGetConversations(process.env.DIFY_ASSISTANT_APP_KEY, ...)` — 调用 `/conversations` |
| `DIFY_ADMIN_AGENT_KEY` | `server/routes/admin.js` | `proxyDifySSE({ apiKey: process.env.DIFY_ADMIN_AGENT_KEY, ... })` — 调用 `/chat-messages` |
| `DIFY_SERVICE_API_KEY` | `server/middleware/difyAuth.js` | SHA-256 哈希比对验证回调请求中的 `api_key` 字段 |

### 调用端的 Dify API 端点差异

- **Workflow 类型**（RISK/PLAN/ARTICLE）：通过 `difyService.js:callWorkflowBlocking()` 调用 `POST /workflows/run`（阻塞模式）
- **Agent 类型**（ASSISTANT）：通过 `dify.js:proxyAgentSSE()` 调用 `POST /chat-messages`（SSE 流式模式）
- **Chatbot/Chatflow 类型**（ADMIN）：通过 `sseProxy.js:proxyDifySSE()` 调用 `POST /chat-messages`（SSE 流式模式）

### 当前 .env.example 文件内容（需修改的原始文件）

```
PORT=3000
JWT_SECRET=your_jwt_secret_here_replace_with_openssl_rand_hex_32
DB_PATH=./data/database.sqlite
DIFY_API_BASE=http://222.241.14.34:56487/v1
DIFY_RISK_WORKFLOW_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
DIFY_PLAN_WORKFLOW_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
DIFY_ARTICLE_WORKFLOW_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
DIFY_ASSISTANT_APP_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
DIFY_SERVICE_API_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
DIFY_ADMIN_AGENT_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
AES_SALT=
JWT_EXPIRES_IN=24h
```

### R2 已实现的相关代码（本次任务不修改）

- `server/routes/dify.js:6-9` — `AGENT_KEYS` 常量映射：`diabetes-assistant-agent` → `DIFY_ASSISTANT_APP_KEY`，`admin-manager-agent` → `DIFY_ADMIN_AGENT_KEY`
- `server/routes/assistant.js:5` — `const { proxyAgentSSE } = require('./dify')`
- `server/routes/assistant.js:26` — `apiKey: process.env.DIFY_ASSISTANT_APP_KEY`（硬编码，含同步注释标注耦合风险）

## RETRY 说明
不适用（首次分配 R3）。
