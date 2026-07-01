# 详细设计（v3）

## 概述

为 `.env.example` 文件中的 6 个 Dify 相关环境变量添加结构化文档注释。目标：让运维人员在不查阅其他文档的情况下，仅通过 `.env.example` 就能理解每个 Key 的应用类型（Workflow / Agent / Service）、API 端点差异、调用方代码位置，以及当前 Key 共享现状的风险。

此为纯文档变更，不修改任何代码逻辑、环境变量名称或 `.env` 实际文件。影响范围仅限 `.env.example` 一个模板文件。

## 文件规划

| 文件路径 | 操作 | 职责 |
|---------|------|------|
| `.env.example` | 修改 | 在 Dify 相关行添加注释文档 |

无新建或删除文件。

## 注释结构设计

### 顶层多行注释块

**位置**：`DIFY_API_BASE` 行之前（紧跟 `DB_PATH` 行之后）

**结构**：符合 Shell 注释风格的 `#` 前缀多行块，以 `=…=` 分隔线包围。包含以下信息层次：

1. **平台概念说明**：Dify 平台两种互斥应用类型 — Workflow（预定义 DAG 流程编排，调用 `/workflows/run`）与 Agent（Function Calling 自主推理，调用 `/chat-messages`）
2. **互斥性约束**：同一应用不能同时是 Workflow 和 Agent，因此不同 Key 必须对应正确类型的应用
3. **当前风险声明**：指出 5 个 Key 共享 `app-tPGIaTY3opz7ycWL5YqI7B6s` 的功能性矛盾——该值在 Dify 平台只能指向一种类型
4. **分场景影响说明**：若共享 Key 为 Workflow，则 Agent 类型（assistant/admin）无法 Function Calling；若为 Agent，则 Workflow 类型（plan/article）的 `/workflows/run` 调用失败
5. **修复建议**：列出 4+1 类功能各自独立创建 Dify 应用并分配独立 API Key

**约束**：
- 注释以 `#` 开头（Shell 风格），不引入任何非注释行
- 不引用特定代码版本或 commit
- 不提及具体 Key 值（`app-xxx` 模板值除外）

### 逐变量行内注释

每个 Dify 环境变量应包含前后两行注释：

1. **变量上方**：用途描述行，包含应用类型标签（**加粗**标识）、调用的 Dify API 端点路径
2. **变量下方**：消费者说明行，标注调用方文件路径及函数名

**6 个变量的精确规格**：

#### `DIFY_API_BASE`
```
# Dify 服务基础 URL（含 /v1 后缀，代码会自动拼接具体路径）
DIFY_API_BASE=http://222.241.14.34:56487/v1
```
- 无消费者行（非 Key 变量）

#### `DIFY_RISK_WORKFLOW_KEY`
```
# 风险评估（Workflow 类型，调用 /workflows/run）
# 消费者：server/services/difyService.js → callWorkflowBlocking('risk')
DIFY_RISK_WORKFLOW_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
```
- 独立 Key 值（`app-hYnpvbv3WsrWtnlr3Mnv0vAu`），注释中无需标注共享状态

#### `DIFY_PLAN_WORKFLOW_KEY`
```
# 生活方案生成（Workflow 类型，调用 /workflows/run）
# 消费者：server/services/difyService.js → callWorkflowBlocking('plan')
DIFY_PLAN_WORKFLOW_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
```
- 共享 Key 之一，但注释中不标注（统一在顶层块中说明）

#### `DIFY_ARTICLE_WORKFLOW_KEY`
```
# 健康文章生成（Workflow 类型，调用 /workflows/run）
# 消费者：server/services/difyService.js → callWorkflowBlocking('article')
DIFY_ARTICLE_WORKFLOW_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
```
- 共享 Key 之一

#### `DIFY_ASSISTANT_APP_KEY`
```
# AI 智能助手（Agent 类型，Function Calling 模式，调用 /chat-messages）
# 消费者：server/routes/assistant.js → proxyAgentSSE()
# 工具回调验证用 DIFY_SERVICE_API_KEY
DIFY_ASSISTANT_APP_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
```
- 第二行消费者标注 proxyAgentSSE()，第三行注明工具回调依赖 DIFY_SERVICE_API_KEY

#### `DIFY_SERVICE_API_KEY`
```
# Dify Agent 工具回调验证密钥（与 Agent 应用的 API Key 比对）
# 消费者：server/middleware/difyAuth.js（SHA-256 + timingSafeEqual）
# 注意：当前与 DIFY_ASSISTANT_APP_KEY / DIFY_ADMIN_AGENT_KEY 共享同一值，
#       若更换任一 Agent Key，此处也需同步更新。
DIFY_SERVICE_API_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
```
- 第三/四行为共享风险的警戒提示，特定于此变量

#### `DIFY_ADMIN_AGENT_KEY`
```
# 管理对话（Agent 类型，Function Calling 模式，调用 /chat-messages）
# 消费者：server/routes/admin.js → proxyDifySSE()
DIFY_ADMIN_AGENT_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
```
- 共享 Key 之一

### 变量排列顺序

保持与当前 `.env.example` 一致的顺序，即按功能域分组：

1. 基础配置（PORT, JWT_SECRET, DB_PATH）
2. **注释分隔块**
3. `DIFY_API_BASE`
4. Workflow 类型 Key（RISK, PLAN, ARTICLE）— 按实际调用位置排序
5. Agent 类型 Key（ASSISTANT, SERVICE, ADMIN）— ASSISTANT 放前面因它是主要用户入口
6. 其他配置（AES_SALT, JWT_EXPIRES_IN）

### 注释信息完整性校验清单

每个变量的注释需回答以下 5 个问题：

| 信息项 | 示例 | 来源 |
|-------|------|------|
| 应用类型 | Workflow / Agent / Service | requirement.md 问题C |
| Dify API 端点 | `/workflows/run` 或 `/chat-messages` | task_v3.md 6.2 节 |
| 调用方文件 | `server/routes/risk.js` | task_v3.md 5.1 节 |
| 调用方函数 | `callWorkflowBlocking('risk')` | 实际代码 |
| 共享风险提示（仅适用时） | "共享同一值" | diag_v3.md 5.1 节 |

## 错误处理

不适用。此任务为纯注释文档变更，无运行时错误路径。若实现者意外引入语法错误（如缺少 `#` 前缀），`.env.example` 作为模板不会导致运行时故障，但需在实现后人工复查注释格式。

## 行为契约

- **前置条件**：`.env.example` 文件存在且可写
- **后置条件**：
  1. 文件中每个 Dify 环境变量均附带至少一行注释说明其应用类型和用途
  2. 文件顶部存在多行注释块描述 Workflow vs Agent 互斥概念及共享 Key 风险
  3. 所有注释以 `#` 开头，可被 Shell 正确忽略
  4. 非 Dify 相关的现有行（PORT, JWT_SECRET, DB_PATH, AES_SALT, JWT_EXPIRES_IN）内容不变
  5. 不修改 `.env` 文件本身
- **不变量**：环境变量名、示例值（`app-xxx...`）、非注释行内容在修改前后完全一致

## 依赖关系

**无代码依赖**。此任务不依赖任何代码模块、类型定义或运行时状态。

**信息依赖**（实现者需了解的上下文，但不在本次任务范围内修改）：

| 依赖项 | 文件 | 用途 |
|-------|------|------|
| Agent 代理路由实现 | `server/routes/dify.js` | 确认 `AGENT_KEYS` 映射中使用 `DIFY_ASSISTANT_APP_KEY` 和 `DIFY_ADMIN_AGENT_KEY` 环境变量名 |
| SSE 代理函数 | `server/services/sseProxy.js` | 确认 `proxyDifySSE` 使用 `user-{id}` 格式（区别于 Agent 的纯数字格式） |
| Workflow 阻塞调用 | `server/services/difyService.js` | 确认 `callWorkflowBlocking` 调用 `/workflows/run` 端点 |
| 回调验证中间件 | `server/middleware/difyAuth.js` | 确认 `DIFY_SERVICE_API_KEY` 用于 SHA-256 哈希比对 |
