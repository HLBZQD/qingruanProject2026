# 诊断报告：Dify Assistant Agent 无法正常调用

## 1. 问题现象

`.env` 中配置了 `DIFY_ASSISTANT_APP_KEY=app-tPGIaTY3opz7ycWL5YqI7B6s`，前端通过 `POST /api/assistant/chat` 调用 AI 智能助手时，无法正常工作。

## 2. 诊断结论摘要

**共发现 3 个问题，按根因层级排列：问题 A（URL 拼装 bug）为直接阻塞性故障，问题 B（路由/API 端点错配）为架构偏差，问题 C（API Key 配置事实与设计意图冲突）为配置问题。**

| 问题 | 性质 | 严重度 | 位置 |
|------|------|--------|------|
| A: 双 `/v1` 路径拼接 | 代码 Bug | **Critical** — 直接阻断所有 SSE 流式 Dify 调用 | `server/services/sseProxy.js:22` |
| B: 未实现 `/api/dify/agent/:agent_id` 路由，user 字段格式与设计偏差 | 功能缺失 + 格式错配 | **High** — Agent 工具回调因 user 格式错配而失败 | `server/routes/index.js:28`（缺失路由注册）、`sseProxy.js:26`（user 格式） |
| C: API Key 配置：同一 Key 值对应 Workflow 与 Agent 两种不兼容应用类型 | 配置矛盾 | **High** — 若 Dify 平台侧该 Key 对应的应用是 Workflow 类型，则 Agent Function Calling 能力完全不可用 | `.env:6-10` |

---

## 3. 问题 A（Critical）：双 `/v1` 路径拼接导致 URL 无效

### 3.1 根因代码位置

**文件**: `server/services/sseProxy.js`
**行号**: 10, 22

```javascript
// 行 10: 从环境变量读取，注意已包含 /v1 后缀
const baseUrl = process.env.DIFY_API_BASE;
// .env 中: DIFY_API_BASE=http://222.241.14.34:56487/v1

// 行 22: 拼接 URL 时追加了 /v1/chat-messages
const url = baseUrl.replace(/\/$/, '') + '/v1/chat-messages';
// 结果: http://222.241.14.34:56487/v1/v1/chat-messages
// 正确应为: http://222.241.14.34:56487/v1/chat-messages
```

### 3.2 因果链

```
DIFY_API_BASE 已含 /v1 后缀
         +
sseProxy.js 硬编码追加 /v1/chat-messages
         =
实际请求 URL: {baseUrl}/v1/v1/chat-messages  ← 无效端点
         +
Dify 返回 404（端点不存在）或上游网络不可达
         =
sseProxy.js:58-70 捕获非 2xx 状态码 → writeErrorEvent → 前端收到 {event: 'error', code: 'DIFY_ERROR'}
```

### 3.3 影响范围

`sseProxy.js` 被以下 3 个路由共享调用。**这意味着不仅 assistant agent，医生对话和管理员对话也受同一 bug 影响**：

| 调用方 | 文件 | 行号 | 使用的 API Key |
|--------|------|------|---------------|
| `POST /api/assistant/chat` | `server/routes/assistant.js` | 20-27 | `DIFY_ASSISTANT_APP_KEY` |
| `POST /api/chat/doctor/:id` | `server/routes/chat.js` | 28-36 | 医生 chat_token（AES 解密） |
| `POST /api/admin/chat` | `server/routes/admin.js` | 162-170 | `DIFY_ADMIN_AGENT_KEY` |

所有 3 个 SSE 流式端点在当前 `.env` 配置下均会构造错误的 Dify URL。

### 3.4 证据

- `.env` 第 4 行: `DIFY_API_BASE=http://222.241.14.34:56487/v1`（含 `/v1` 后缀）
- `sseProxy.js` 第 22 行: `baseUrl.replace(/\/$/, '') + '/v1/chat-messages'`
- `difyService.js` 第 95 行 `callWorkflowBlocking()`: `baseUrl.replace(/\/$/, '') + '/workflows/run'` — 不产生双 `/v1`，因为追加的 `/workflows/run` 不含 `/v1` 前缀
- `difyService.js` 第 142 行 `callDifyGetConversations()`: `baseUrl.replace(/\/$/, '') + '/conversations?user=...'` — 也不产生双 `/v1`
- **对比**: `sseProxy.js` 的 `'/v1/chat-messages'` 是唯一在拼接路径中再次包含 `/v1` 前缀的调用

### 3.5 复现条件

- `.env` 中 `DIFY_API_BASE` 以 `/v1` 结尾（当前配置）
- 任意 SSE 流式端点被调用（`/api/assistant/chat`、`/api/chat/doctor/:id`、`/api/admin/chat`）
- 结果：Dify 服务返回 404 或连接错误

---

## 4. 问题 B（High）：未实现 `/api/dify/agent/:agent_id` 端点，assistant 路由架构与设计偏差

### 4.1 设计文档的规定

详细设计文档 v4 在以下位置定义了两级 Dify 代理架构：

**3.1.11 节 — Dify 代理（内部）**:
| 方法 | 端点 | 说明 | 认证 |
|------|------|------|------|
| POST | /api/dify/agent/:agent_id | Dify Agent代理 | 是 |

**5.2.5 节 — diabetes-assistant-agent**: 定义为 **Agent** 类型应用，使用 Function Calling 模式，配置 8 个专用工具 + 1 个兜底工具。输入变量 `user` 类型为 `string`，示例值 `"1"`（纯数字 userId，不含 `"user-"` 前缀）。

**5.5.2 节（备选方案）**: 定义了 `proxyAgentRequest()` 函数（位于 `difyService.js`），负责在转发至 Dify Agent 时注入 `session_id` 并维护映射表。

### 4.2 当前代码的实际情况

| 事项 | 设计文档 | 代码现实 |
|------|---------|---------|
| `/api/dify/agent/:agent_id` 路由 | 已定义（3.1.11 节） | **不存在** — `server/routes/dify.js` 文件不存在，`server/routes/index.js` 中无对应注册 |
| `proxyAgentRequest()` 函数 | 在 5.5.2 节给出伪代码 | **不存在** — `difyService.js` 中仅有 `callWorkflowBlocking` 和 `callDifyGetConversations` |
| `user` 字段格式 | 设计文档 5.2.5 节：`"1"`（纯数字 userId） | `sseProxy.js:26`：`user: \`user-${userId}\`` — 实际发送 `"user-1"` 格式 |
| Assistant Agent 的实际调用路径 | 应走 `/api/dify/agent/:agent_id` | 实际走 `POST /api/assistant/chat` → `sseProxy.js` → Dify `/v1/chat-messages` |

### 4.3 `/v1/chat-messages` 端点对 Agent 类型的兼容性分析

`sseProxy.js` 调用的是 Dify 的 **Chat Message API** (`/v1/chat-messages`)。从 Dify API 规范来看，`/v1/chat-messages` 是 Chatbot、Chatflow、Agent 三种发布类型的**统一对话入口**。因此，对 Agent 类型应用调用 `/v1/chat-messages` 本身不是错误。

`sseProxy.js` 的 SSE 透传机制（第 72-82 行）逐行转发上游 SSE 事件，不做事件类型过滤。Dify Agent 类型应用返回的 SSE 流可能包含额外的 `agent_thought` 事件（展示 Agent 思考链），当前透传逻辑不做类型判断，直接写入响应流，因此**对 Agent 类型应用的事件流是兼容的**。

### 4.4 user 字段格式与 Agent 工具回调的冲突

这是问题 B 的核心。`sseProxy.js:26` 构造 `user: \`user-${userId}\``，实际发送至 Dify 的 `user` 值为 `"user-1"` 格式。该值在 Dify 侧承担两个角色：

1. **会话归属标识**（Dify 平台内部用于隔离 conversation）
2. **Agent 输入变量的值**（设计文档 5.2.5 节 Agent 系统提示词中 `{{user}}` 引用的值）

Dify Agent 的 8 个专用工具回调请求体模板中均使用 `{{user}}` 填充 `user_id` 字段（例如 `{"tool_name":"query_user_profile","user_id":"{{user}}",...}`）。Dify 平台会将对话请求中的 `user` 字段值填入模板，因此回调到 `/api/admin/execute` 的 `user_id` 为 `"user-1"` 格式。

**因果链**：

```
sseProxy.js:26 → user = "user-1"（非纯数字 "1"）
         ↓
Dify Agent 工具回调 → req.body.user_id = "user-1"
         ↓
difyAuth.js:41 → req.difyAuth.userId = "user-1"
         ↓
admin.js:67 → SELECT role FROM users WHERE id = 'user-1'
         ↓
users 表 id 列为整数类型，"user-1" 无法匹配任何行
         ↓
admin.js:68-69 → 返回 "操作者用户不存在" (403)
         ↓
Agent 工具调用失败 → Dify 返回错误 → 前端展示错误
```

**需要注意的是**：此分析基于 Dify 平台的 5.5.1 节所述 `{{user}}` 变量透传假设。若 Dify 不支持 `{{user}}` 透传，则 `user_id` 会以其他形式传递（或根本不传递），Agent 工具回调将面临不同但同样严重的身份关联失败。该验证任务（设计文档 5.5.1 节）在设计文档完成时标记为"尚未执行"。

### 4.5 影响分析

如果仅修复问题 A，assistant agent 能连通 Dify，但**Agent 内部的 Function Calling 工具回调将因 user 格式错配而失败**：

- Agent 调用 `query_user_profile` / `query_risk_history` / `query_punch_records` / `query_life_plans` / `query_health_advice` / `write_health_advice` / `update_user_profile` 任一工具时，回调 `/api/admin/execute` 携带 `user_id = "user-1"`，`difyAuth.js` 中间件将 `user_id` 原样赋给 `req.difyAuth.userId`，admin.js 的 `SELECT role FROM users WHERE id = ?` 因类型不匹配返回空结果，工具调用全部失败。
- 即使用户手动配置了 `DIFY_SERVICE_API_KEY`，该 Key 仅用于回调请求的 API Key 校验（`difyAuth.js:10-32`），不参与 user_id 格式转换。

---

## 5. 问题 C（High）：API Key 配置与设计意图的冲突

### 5.1 `.env` 中所有 Dify 相关 Key 的实际值

经代码核对，`.env` 中共有 6 个 Dify 相关环境变量，分布如下：

| 环境变量 | `.env` 行号 | 实际值 | 设计文档中的应用类型 |
|---------|-----------|--------|-------------------|
| `DIFY_RISK_WORKFLOW_KEY` | 5 | `app-hYnpvbv3WsrWtnlr3Mnv0vAu` | **Workflow**（5.2.1 节 risk-prediction） |
| `DIFY_PLAN_WORKFLOW_KEY` | 6 | `app-tPGIaTY3opz7ycWL5YqI7B6s` | **Workflow**（5.2.2 节 life-plan-generator） |
| `DIFY_ARTICLE_WORKFLOW_KEY` | 7 | `app-tPGIaTY3opz7ycWL5YqI7B6s` | **Workflow**（5.2.3 节 health-article-generator） |
| `DIFY_ASSISTANT_APP_KEY` | 8 | `app-tPGIaTY3opz7ycWL5YqI7B6s` | **Agent**（5.2.5 节 diabetes-assistant-agent） |
| `DIFY_SERVICE_API_KEY` | 9 | `app-tPGIaTY3opz7ycWL5YqI7B6s` | **服务端回调校验密钥**（difyAuth.js） |
| `DIFY_ADMIN_AGENT_KEY` | 10 | `app-tPGIaTY3opz7ycWL5YqI7B6s` | **Agent**（5.2.6 节 admin-manager-agent） |

**关键事实**：6 个 Key 中使用了两组不同的值：
- `app-hYnpvbv3WsrWtnlr3Mnv0vAu` — 仅 `DIFY_RISK_WORKFLOW_KEY`（1 个）
- `app-tPGIaTY3opz7ycWL5YqI7B6s` — 其余 5 个 Key 共享

### 5.2 Key 共享的配置矛盾

`DIFY_PLAN_WORKFLOW_KEY` 和 `DIFY_ARTICLE_WORKFLOW_KEY` 在设计文档中分别对应 **Workflow** 类型应用（life-plan-generator、health-article-generator），而 `DIFY_ASSISTANT_APP_KEY` 对应 **Agent** 类型应用（diabetes-assistant-agent，Function Calling 模式）。

Dify 平台上，Workflow 和 Agent 是两种**互斥的应用类型**——同一应用不能同时是 Workflow 又是 Agent。因此，`app-tPGIaTY3opz7ycWL5YqI7B6s` 这个 Key 值在 Dify 平台上**只能指向一种应用类型**。这意味着存在以下两种可能之一：

**可能 1**：该 Key 对应的 Dify 应用是 **Workflow 类型**（供 `DIFY_PLAN_WORKFLOW_KEY` / `DIFY_ARTICLE_WORKFLOW_KEY` 正常使用），则 `DIFY_ASSISTANT_APP_KEY` 和 `DIFY_ADMIN_AGENT_KEY` 指向的并非 Agent 类型应用。Assistant agent 将**无法使用 Function Calling 模式**（无法调用 8 个专用工具），退化为普通的聊天助手。

**可能 2**：该 Key 对应的 Dify 应用是 **Agent 类型**（供 `DIFY_ASSISTANT_APP_KEY` / `DIFY_ADMIN_AGENT_KEY` 正常使用），则 `DIFY_PLAN_WORKFLOW_KEY` 和 `DIFY_ARTICLE_WORKFLOW_KEY` 指向的并非 Workflow 类型应用。但 Workflow 类型的应用（life-plan-generator、health-article-generator）通过 `difyService.js:callWorkflowBlocking` 调用的是 Dify 的 `/workflows/run` 端点——该端点是 Workflow 类型专用，Agent 类型应用没有此端点。因此这两个 Workflow 功能也将失效。

**无论哪种可能，均构成功能性矛盾**。具体的失效模式取决于 `app-tPGIaTY3opz7ycWL5YqI7B6s` 在 Dify 平台上的实际应用类型，该确认需要访问 Dify 平台管理后台。

### 5.3 `DIFY_SERVICE_API_KEY` 的角色

`DIFY_SERVICE_API_KEY`（`app-tPGIaTY3opz7ycWL5YqI7B6s`）是 Dify Agent 工具回调 `/api/admin/execute` 的验证密钥。`difyAuth.js:10-32` 通过 SHA-256 哈希比对（`timingSafeEqual`）验证回调请求中的 `api_key` 字段。

该 Key 与 `DIFY_ASSISTANT_APP_KEY` 和 `DIFY_ADMIN_AGENT_KEY` 共享同一值，意味着 Dify Agent 工具回调请求体中的 `api_key` 字段值与调用 Dify `/v1/chat-messages` 时使用的 `Authorization: Bearer` 令牌值相同。此共享**并非安全漏洞**（API Key 和回调验证密钥可以相同），但在以下场景可能产生混淆：

- 若未来需要区分不同 Agent 的回调来源（assistant agent vs admin agent），共享同一值将无法区分
- 若某天 `DIFY_ASSISTANT_APP_KEY` 需要更换（如密钥泄露），`DIFY_SERVICE_API_KEY` 也需同步更换

### 5.4 `DIFY_RISK_WORKFLOW_KEY` 使用独立 Key 值的意义

`DIFY_RISK_WORKFLOW_KEY`（`app-hYnpvbv3WsrWtnlr3Mnv0vAu`）是 6 个 Key 中唯一使用独立值的，说明团队在配置时并非"全部混用"，而是存在部分隔离。这削弱了"开发环境临时配置"的解释——如果是临时配置，更大可能是全部 Key 使用同一值。独立配置 `DIFY_RISK_WORKFLOW_KEY` 暗示该 Key 对应的 Dify 应用**可能是独立创建且经过验证可正常工作的**。

---

## 6. 综合因果链

```
用户点击 AI 助手发送消息
    ↓
前端 POST /api/assistant/chat
    ↓
server/routes/assistant.js:20-27 调用 proxyDifySSE()
    ↓
server/services/sseProxy.js:22
    URL = DIFY_API_BASE(/v1) + "/v1/chat-messages"
    = http://222.241.14.34:56487/v1/v1/chat-messages  ← 问题 A: 无效 URL
    ↓
Dify 返回 404（或连接被拒绝）
    ↓
sseProxy.js:58-70 → writeErrorEvent("AI 服务返回错误", "DIFY_ERROR")
    ↓
前端收到 {event: 'error', code: 'DIFY_ERROR'} → 用户看到错误

--- 即使修复问题 A，请求到达 Dify ---

Dify /v1/chat-messages 收到请求
    ↓
请求体中 user = "user-1"（sseProxy.js:26）
    ↓
Dify 以此 user 值作为 {{user}} 模板变量值注入 Agent 工具回调请求体
    ↓
Agent 通过 Function Calling 调用工具（如 query_user_profile）
    ↓
工具回调请求体中的 user_id = "user-1"（非设计预期的 "1"）
    ↓
POST /api/admin/execute 收到 user_id = "user-1"
    ↓
difyAuth.js:41 → req.difyAuth.userId = "user-1"
    ↓
admin.js:67 → SELECT role FROM users WHERE id = 'user-1'
    ↓
users.id 为整数列，'user-1' 无法匹配 → 返回空结果
    ↓
admin.js:68-69 → 返回 '操作者用户不存在' (403)  ← 问题 B: user 格式错配
    ↓
Agent 工具调用失败 → Dify 返回错误 → 前端展示错误

--- 同时，问题 A 还影响另外 2 个路由 ---

POST /api/chat/doctor/:id → 同一 sseProxy.js → 同一双 /v1 错误
POST /api/admin/chat → 同一 sseProxy.js → 同一双 /v1 错误

--- 问题 C 的两种可能 ---

可能 1: 共享 Key 指向 Workflow 应用
    → assistant/admin agent 无法使用 Function Calling，退化为普通聊天
    → 8 个专用工具（query_user_profile 等）不可用
    → 即使修复了 A+B，AI 助手仍无法查询/写入用户数据

可能 2: 共享 Key 指向 Agent 应用
    → life-plan-generator / health-article-generator 的 /workflows/run 调用失败
    → 方案生成和文章生成功能不可用
```

---

## 7. 修复方向（非修复方案，仅指示修复者应关注的方向）

| 问题 | 修复位置 | 方向 |
|------|---------|------|
| A | `sseProxy.js:22` | URL 拼接逻辑需与 `difyService.js:95` 对齐 — 要么 `.env` 中 `DIFY_API_BASE` 去掉 `/v1` 后缀由代码统一追加，要么 `sseProxy.js` 去除非 `/v1` 前缀后仅追加 `/chat-messages`。注意此修复同时影响 `assistant`、`chat`、`admin` 三个路由。 |
| B | `sseProxy.js:26` | user 字段格式从 `"user-{userId}"` 改为纯数字 `"{userId}"`（与设计文档 5.2.5 节 `"1"` 一致），使 Dify Agent 工具回调中的 `{{user}}` 变量值为纯数字，可正确匹配 `users.id` 列。**注意潜在影响**：`difyService.js:callDifyGetConversations()` 第 142 行也使用 `'user-' + userId` 格式构造 `?user=` 查询参数，两者应保持一致。 |
| B | 新建 `server/routes/dify.js` + `difyService.js` 新增函数 | 实现 `/api/dify/agent/:agent_id` 端点；实现 `proxyAgentRequest()` 以支持 session_id 映射备选方案（设计文档 5.5.2 节）。在实现前，应优先执行设计文档 5.5.1 节的前置验证任务（确认 Dify 是否支持 `{{user}}` 透传）。 |
| B | `server/routes/assistant.js:20-27` | 决定是保留 `/api/assistant/chat` 并内部转发至新 Agent 端点，还是直接重构为调用新端点 |
| C | Dify 平台 | 确认 `app-tPGIaTY3opz7ycWL5YqI7B6s` 对应的 Dify 应用的实际类型（Workflow 还是 Agent）；根据确认结果：为 4 类应用（risk-prediction、life-plan-generator、health-article-generator、diabetes-assistant-agent、admin-manager-agent）各自独立创建 Dify 应用并分配独立 API Key；将各 Key 填入对应的环境变量 |

---

## 8. 诊断范围说明

以下事项不在本次诊断范围内：

- Dify 平台是否支持 `{{user}}` 变量在工具回调请求体模板中的动态透传（设计文档 5.5.1 节标记为"前置验证需求，尚未执行"）
- Dify 平台上 `app-tPGIaTY3opz7ycWL5YqI7B6s` 对应的实际应用类型和创建状态
- `DIFY_API_BASE=http://222.241.14.34:56487/v1` 对应 Dify 服务的运行状态和网络可达性
- `DIFY_RISK_WORKFLOW_KEY`（`app-hYnpvbv3WsrWtnlr3Mnv0vAu`）对应 Dify 应用的配置验证

---

## 修订说明（v2）

| 质询意见 | 回应 |
|---------|------|
| 诊断报告 5.1 节声称 `DIFY_RISK_WORKFLOW_KEY` 值为 `app-tPGIaTY3opz7ycWL5YqI7B6s`，与实际 `.env:5` 中的 `app-hYnpvbv3WsrWtnlr3Mnv0vAu` 不符；遗漏了 `DIFY_SERVICE_API_KEY` | **采纳**。重新核对 `.env` 中全部 6 个 Dify 相关 Key 的实际值。修正 5.1 节表格：`DIFY_RISK_WORKFLOW_KEY` 实际值为 `app-hYnpvbv3WsrWtnlr3Mnv0vAu`（独立值），新增 `DIFY_SERVICE_API_KEY` 行（角色：服务端回调校验密钥，值：`app-tPGIaTY3opz7ycWL5YqI7B6s`）。结论从"5 个 Key 使用同一值"修正为"5 个 Key 共享同一值 + 1 个 Key 使用独立值"。 |
| "5 个 Dify 相关 Key 使用同一值"前提不成立，问题 C 关于"API Key 混用"的严重度和风险判断需重新评估 | **采纳**。修正后的事实为：`DIFY_RISK_WORKFLOW_KEY` 使用独立值（`app-hYnpvbv3WsrWtnlr3Mnv0vAu`），其余 5 个 Key 共享 `app-tPGIaTY3opz7ycWL5YqI7B6s`。新增 5.4 节分析 `DIFY_RISK_WORKFLOW_KEY` 独立值的意义——说明团队并非"全部混用"，问题 C 的严重度判断从 Medium 调整为 High，因为同组 Key 值跨 Workflow 和 Agent 两种不兼容的应用类型构成功能性矛盾。 |
| 问题 C 使用假设性语言（"可能"、"如果"），未排除共享 Key 实际对应非 Agent 类型的可能 | **采纳**。问题 C 5.2 节重写为"Key 共享的配置矛盾"分析，将两种可能明确列为互斥选项：共享 Key 指向 Workflow 则 Agent 无法 Function Calling（可能 1），指向 Agent 则 Workflow 的 `/workflows/run` 端点不可用（可能 2）。两种可能均构成功能性矛盾，不再以"可能不是 bug 而是临时配置"模糊处理。严重度从 Medium 上调至 High。同时移除了"这可能是开发环境的临时配置"等弱判断语言。 |
| 诊断报告未说明 `sseProxy.js` 的 SSE 透传机制对 Agent 类型应用的事件流兼容性 | **采纳**。4.3 节补充说明：`sseProxy.js` 第 72-82 行逐行转发上游 SSE 事件，不做事件类型过滤，因此对 Dify Agent 类型应用返回的额外 `agent_thought` 等事件也兼容。 |
| 综合因果链仅以 assistant agent 为主线展开，未提及 admin agent 也受问题 A 影响 | **采纳**。3.3 节影响范围表已列出 3 个受影响路由，综合因果链（第 6 节）末尾新增"同时，问题 A 还影响另外 2 个路由"分支，显式描述 `POST /api/chat/doctor/:id` 和 `POST /api/admin/chat` 同样受双 `/v1` 影响的二级效应。 |
| 未提及 `DIFY_SERVICE_API_KEY` 与 assistant agent 的关系 | **采纳**。5.1 节表格新增 `DIFY_SERVICE_API_KEY` 行，5.3 节分析其作为 Dify Agent 回调验证密钥的角色、与 `DIFY_ASSISTANT_APP_KEY` 共享同一值的影响（非安全漏洞但存在混淆风险）。 |
