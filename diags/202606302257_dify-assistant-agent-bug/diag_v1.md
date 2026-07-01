# 诊断报告：Dify Assistant Agent 无法正常调用

## 1. 问题现象

`.env` 中配置了 `DIFY_ASSISTANT_APP_KEY=app-tPGIaTY3opz7ycWL5YqI7B6s`，前端通过 `POST /api/assistant/chat` 调用 AI 智能助手时，无法正常工作。

## 2. 诊断结论摘要

**共发现 3 个问题，按根因层级排列：问题 A（URL 拼装 bug）为直接阻塞性故障，问题 B（路由/API 端点错配）为架构偏差，问题 C（API Key 混用）为配置风险。**

| 问题 | 性质 | 严重度 | 位置 |
|------|------|--------|------|
| A: 双 `/v1` 路径拼接 | 代码 Bug | **Critical** — 直接阻断所有 Dify 调用 | `server/services/sseProxy.js:22` |
| B: 未实现 `/api/dify/agent/:agent_id` 路由 | 功能缺失 | **High** — 当前用 Chat API 而非 Agent API | `server/routes/index.js:28`（缺失路由注册） |
| C: API Key 与其他功能混用 | 配置问题 | **Medium** — 可能影响功能隔离 | `.env:8` |

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
Dify 返回 404（端点不存在）or 上游网络不可达
         =
sseProxy.js:58-70 捕获非 2xx 状态码 → writeErrorEvent → 前端收到 `{event: 'error', code: 'DIFY_ERROR'}`
```

### 3.3 影响范围

`sseProxy.js` 被以下路由共享调用：

| 调用方 | 文件 | 行号 |
|--------|------|------|
| `POST /api/assistant/chat` | `server/routes/assistant.js` | 20-27 |
| `POST /api/chat/doctor/:id` | `server/routes/chat.js` | 28-36 |
| `POST /api/admin/chat` | `server/routes/admin.js` | 162-170 |

这意味着不仅 assistant agent，**医生对话和管理员对话也受同一 bug 影响**，所有 SSE 流式代理均会构造错误的 Dify URL。

### 3.4 证据

- `.env` 第 4 行: `DIFY_API_BASE=http://222.241.14.34:56487/v1`（含 `/v1` 后缀）
- `sseProxy.js` 第 22 行: `baseUrl.replace(/\/$/, '') + '/v1/chat-messages'`
- `difyService.js` 第 95 行 `callWorkflowBlocking()`: `baseUrl.replace(/\/$/, '') + '/workflows/run'` — 同样的模式，不会产生双 `/v1`，因为追加的 `/workflows/run` 不包含 `/v1` 前缀。但 `callDifyGetConversations()`（第 142 行）追加 `/conversations?user=...`，也不会产生双 `/v1`。
- **对比**: `sseProxy.js` 的 `'/v1/chat-messages'` 是唯一在拼接路径中再次包含 `/v1` 前缀的调用，与 `.env` 中 `DIFY_API_BASE` 已含 `/v1` 形成冲突。

### 3.5 复现条件

- `.env` 中 `DIFY_API_BASE` 以 `/v1` 结尾（当前配置）
- 任意 SSE 流式端点被调用（assistant/chat、chat/doctor/:id、admin/chat）
- 结果：Dify 服务返回 404 或连接错误（取决于 Dify 服务端是否有双 `/v1/v1/` 的路由匹配规则）

---

## 4. 问题 B（High）：未实现 `/api/dify/agent/:agent_id` 端点，assistant 路由架构与设计偏差

### 4.1 设计文档的规定

详细设计文档 v4 在以下位置定义了两级 Dify 代理架构：

**3.1.11 节 — Dify 代理（内部）**:
| 方法 | 端点 | 说明 | 认证 |
|------|------|------|------|
| POST | /api/dify/workflow/:workflow_id | Dify工作流代理 | 是 |
| POST | /api/dify/agent/:agent_id | Dify Agent代理 | 是 |

**5.2.5 节 — diabetes-assistant-agent**: 定义为 **Agent** 类型应用，使用 Function Calling 模式，配置 8 个专用工具 + 1 个兜底工具。

**5.5.2 节（备选方案）**: 定义了 `proxyAgentRequest()` 函数（位于 `difyService.js`），负责在转发至 Dify Agent 时注入 `session_id` 并维护映射表。

### 4.2 当前代码的实际情况

| 事项 | 设计文档 | 代码现实 |
|------|---------|---------|
| `/api/dify/agent/:agent_id` 路由 | 已定义（3.1.11 节） | **不存在** — `server/routes/dify.js` 文件不存在 |
| `proxyAgentRequest()` 函数 | 在 5.5.2 节给出伪代码 | **不存在** — `difyService.js` 中仅有 `callWorkflowBlocking` 和 `callDifyGetConversations` |
| Assistant Agent 的实际调用路径 | 应走 `/api/dify/agent/:agent_id` | 实际走 `POST /api/assistant/chat` → `sseProxy.js` → Dify `/v1/chat-messages` |

### 4.3 Dify Chat Message API vs Agent API 的关键差异

当前 `sseProxy.js` 调用的是 Dify 的 **Chat Message API** (`/v1/chat-messages`)，该端点是面向 Chatflow / 聊天助手 / Agent 三种发布类型的**统一对话端点**。从 Dify API 规范来看：

- `/v1/chat-messages` — 通用对话端点，支持 `response_mode: 'streaming'`，适用于 Chatbot、Chatflow、Agent 三种应用类型。请求体中的 `inputs` 参数可用于向 Agent 传递上下文变量。
- Agent 类型应用通过 `/v1/chat-messages` 调用时，Agent 内部的 Function Calling 工具回调会由 Dify 平台自动管理，回调 URL 是在 Dify 平台配置工具时预设的。

**关键判断**：Dify 的 `/v1/chat-messages` 端点对于 Agent 类型应用**理论上是正确的 API 端点**——三种应用类型（Chatbot/Chatflow/Agent）共享同一个对话入口。因此问题 B 的性质不是"调了错误的 API"，而是：

1. **设计文档定义的间接层 `/api/dify/agent/:agent_id` 未实现**，导致无法在代理层注入 Dify Agent 需要的 `user` 变量（当前 `sseProxy.js` 第 26 行以 `user-{userId}` 格式传递 `user` 字段，而设计文档 5.2.5 节要求 `user` 字段为纯数字 `userId`，供 Agent 工具回调请求体中的 `{{user}}` 模板变量引用）。
2. **缺少 `proxyAgentRequest()` 中定义的 `session_id→user_id` 映射机制**（5.5.2 备选方案），若 Dify 不支持 `{{user}}` 透传，则无法回退到备选方案。

### 4.4 影响分析

如果仅修复问题 A（URL 拼接），assistant agent 能连通 Dify 对话，但 Agent 内部的 Function Calling 工具回调（如 `query_user_profile`、`write_health_advice` 等）可能因 `user` 变量传递方式不正确而无法正确执行行级权限约束。具体表现为：

- Agent 工具回调请求体中的 `{{user}}` 模板变量如果取到的是 `"user-1"` 格式而非 `"1"` 格式，回调到 `/api/admin/execute` 后 `operatorId` 解析将出错。
- 若 Dify 不支持 `{{user}}` 透传（设计文档 5.5.1 节所述待验证事项），当前代码无任何备选方案支持，Agent 工具回调将完全失效。

---

## 5. 问题 C（Medium）：API Key 混用

### 5.1 现状

`.env` 中 5 个 Dify 相关 Key 使用同一值：

| 环境变量 | 用途 | 值 |
|---------|------|-----|
| `DIFY_RISK_WORKFLOW_KEY` | 风险预测工作流 | `app-tPGIaTY3opz7ycWL5YqI7B6s` |
| `DIFY_PLAN_WORKFLOW_KEY` | 方案生成工作流 | `app-tPGIaTY3opz7ycWL5YqI7B6s` |
| `DIFY_ARTICLE_WORKFLOW_KEY` | 文章生成工作流 | `app-tPGIaTY3opz7ycWL5YqI7B6s` |
| `DIFY_ASSISTANT_APP_KEY` | AI 助手 Agent | `app-tPGIaTY3opz7ycWL5YqI7B6s` |
| `DIFY_ADMIN_AGENT_KEY` | 管理员 Agent | `app-tPGIaTY3opz7ycWL5YqI7B6s` |

### 5.2 风险

如果这确实是同一个 Key 对应同一个 Dify 应用（而非 5 个独立应用各自恰好共享相同 Key），则：

- `DIFY_ASSISTANT_APP_KEY` 可能指向的是一个 Chatflow 类型应用，而非设计文档 5.2.5 节定义的 `diabetes-assistant-agent`（Agent 类型、Function Calling 模式）
- 5 个功能共享同一应用会导致对话上下文混乱（所有对话共享同一个 `conversation_id` 命名空间）
- 无法对各功能进行独立的用量监控和限流

### 5.3 诊断判断

这**可能**不是 bug 而是开发环境的临时配置（组员共用测试 Key）。但如果 Dify 平台上确实只创建了一个应用却期望它同时充当风险预测工作流、方案生成工作流、文章生成工作流、AI 助手 Agent 四种角色，这就是配置错误——不同类型应用在 Dify 中的后端模型、系统提示词、工具配置完全不同，不可互换。

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
前端收到 `{event: 'error', code: 'DIFY_ERROR'}` → 用户看到错误

--- 即使修复问题 A ---

请求到达 Dify /v1/chat-messages
    ↓
Dify 以 Agent 类型处理对话
    ↓
Agent 通过 Function Calling 调用工具（如 query_user_profile）
    ↓
工具回调请求体中的 {{user}} 变量 = "user-1"（非预期 "1"）
    ↓
POST /api/admin/execute 收到 user_id = "user-1"
    ↓
difyAuth 中间件提取 userId = "user-1"，数据库查询失败  ← 问题 B: user 格式错配
    ↓
Agent 工具调用失败 → Dify 返回错误 → 前端展示失败

--- 且 ---

问题 B 的备选方案（session_id 映射表）完全未实现
    ↓
若 Dify 不支持 {{user}} 透传 → Agent 工具回调无法关联用户  ← 问题 B: 无备选路径
```

---

## 7. 修复方向（非修复方案，仅指示修复者应关注的方向）

以下是修复者需要关注的根因位置和修复方向，不包含具体代码补丁：

| 问题 | 修复位置 | 方向 |
|------|---------|------|
| A | `sseProxy.js:22` | URL 拼接逻辑需与 `difyService.js:95` 对齐 — 要么 `.env` 中 `DIFY_API_BASE` 去掉 `/v1` 后缀由代码统一追加，要么 `sseProxy.js` 去除非 `/v1` 前缀后仅追加 `/chat-messages` |
| B | 新建 `server/routes/dify.js` + `difyService.js` 新增函数 | 实现 `/api/dify/agent/:agent_id` 端点，在代理层将 JWT `user_id`（纯数字）注入 Dify 请求体的 `user` 字段（非 `"user-N"` 格式）；同时实现 `proxyAgentRequest()` 以支持 session_id 映射备选方案 |
| B | `server/routes/assistant.js:20-27` | 决定是保留 `/api/assistant/chat` 并内部转发至新 Agent 端点，还是直接重构为调用新端点 |
| C | `.env` + Dify 平台 | 确认 Dify 平台上 5 个应用各自独立创建并分配独立 API Key；将各 Key 配置到对应环境变量 |

---

## 8. 诊断范围说明

以下事项不在本次诊断范围内（属于 Dify 平台侧验证或设计文档中明确标记为待验证的项）：

- Dify 平台是否支持 `{{user}}` 变量在工具回调请求体模板中的动态透传（设计文档 5.5.1 节标记为"前置验证需求，尚未执行"）
- Dify 平台上 diabetes-assistant-agent 的实际创建状态和应用类型
- `DIFY_API_BASE=http://222.241.14.34:56487/v1` 对应 Dify 服务的运行状态和网络可达性
