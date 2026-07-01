# 详细设计（v1）

## 概述

修复 `server/services/sseProxy.js` 第 22 行的双 `/v1` 路径拼接 Bug。`.env` 中 `DIFY_API_BASE` 已包含 `/v1` 后缀，`sseProxy.js` 第 22 行再次追加 `/v1/chat-messages`，导致实际请求 URL 为 `/v1/v1/chat-messages`（无效端点）。修改为与项目中 `difyService.js` 一致的拼接模式——仅追加 `/chat-messages`，不重复 `/v1` 前缀。

修改仅涉及第 22 行一个字符串字面量，不改变函数签名、调用方、SSE 透传逻辑、错误处理或任何其他行为。

**范围声明**：本轮（R1）仅修复问题 A（双 `/v1` 路径拼接），问题 B（缺失 Agent 代理路由）和问题 C（API Key 配置冲突）分别延后至 R2、R3 处理。详见 `task_v1.md` 修订说明及 `plan.md` 轮次规划。

## 文件规划

| 文件路径 | 操作 | 职责 |
|---------|------|------|
| server/services/sseProxy.js | 修改（第 22 行） | SSE 流式代理，封装 Dify Chat Message API 的请求构造、上游转发和事件流透传 |

## 函数签名（不变）

### proxyDifySSE

**形态**：普通函数（CommonJS 模块导出）
**文件路径**：`server/services/sseProxy.js`
**职责**：构造 Dify `/chat-messages` 请求，将上游 SSE 事件流逐行透传至客户端

**签名**：
```javascript
function proxyDifySSE({ apiKey, query, conversationId, userId, res, req })
```

**参数**：
| 参数名 | 类型 | 说明 |
|--------|------|------|
| apiKey | `string` | Dify 应用 API Key（Bearer 令牌） |
| query | `string` | 用户消息文本 |
| conversationId | `string \| undefined` | 可选，续接已有会话 |
| userId | `number \| string` | 当前登录用户 ID |
| res | `express.Response` | Express 响应对象，用于写入 SSE 事件流 |
| req | `express.Request` | Express 请求对象，用于监听客户端断开事件 |

**返回值**：无（`void`）。通过 `res` 对象写入 SSE 事件流并最终调用 `res.end()`。

## 修改内容

### 第 22 行：URL 拼接字符串

**当前代码**：
```javascript
const url = baseUrl.replace(/\/$/, '') + '/v1/chat-messages';
```

**修改为**：
```javascript
const url = baseUrl.replace(/\/$/, '') + '/chat-messages';
```

**URL 拼接结果对比**：

| 场景 | 修改前 | 修改后 |
|------|--------|--------|
| `DIFY_API_BASE=http://222.241.14.34:56487/v1` | `http://222.241.14.34:56487/v1/v1/chat-messages` (404) | `http://222.241.14.34:56487/v1/chat-messages` (正常) |
| `DIFY_API_BASE=http://example.com/v1/` | `http://example.com/v1/v1/chat-messages` (404) | `http://example.com/v1/chat-messages` (正常) |
| `DIFY_API_BASE` 未配置 | 走 Mock 分支，不执行此行 | 同修改前 |

**一致性对齐**：

| 文件 | 行号 | URL 拼接 | 是否含 `/v1` |
|------|------|----------|-------------|
| `difyService.js` | 95 | `baseUrl.replace(/\/$/, '') + '/workflows/run'` | 否 |
| `difyService.js` | 142 | `baseUrl.replace(/\/$/, '') + '/conversations?user=...'` | 否 |
| `sseProxy.js`（修改后） | 22 | `baseUrl.replace(/\/$/, '') + '/chat-messages'` | 否 |

### 不变部分

以下代码行**不受此次修改影响**：

| 行号 | 内容 | 说明 |
|------|------|------|
| 10 | `const baseUrl = process.env.DIFY_API_BASE;` | 读取环境变量，不变 |
| 12-20 | Mock 模式分支 | 未配置 `DIFY_API_BASE` 时的降级逻辑 |
| 24-32 | 请求体构造 | `query`, `user: \`user-${userId}\``, `inputs`, `response_mode`, `conversation_id` — 全部不变 |
| 34-48 | URL 解析与 HTTP 选项构造 | `new URL(url)` 解析拼接结果，构造 `hostname/port/path/headers` — 使用修改后的 `url` 变量，逻辑不变 |
| 49-115 | 上游请求发送与 SSE 透传 | 发起 `http.request`，逐行转发 SSE 事件，超时/错误/断连处理 — 全部不变 |

## 错误处理

无需变更。现有的错误处理逻辑覆盖以下场景，修改后均保持有效：

- **Dify 返回非 2xx**（第 58-70 行）：捕获状态码 ≥300 的响应，读取错误体并写入 `{event: 'error', code: 'DIFY_ERROR'}` 事件
- **上游超时**（第 92-97 行）：120s 超时后记录日志，写入 `{event: 'error', code: 'UPSTREAM_ERROR'}` 事件
- **上游连接错误**（第 99-104 行）：网络层面错误时记录日志，写入 `{event: 'error', code: 'UPSTREAM_ERROR'}` 事件
- **客户端断开**（第 106-111 行）：`req.on('close')` 中止上游请求

修改后的 URL 正确指向 Dify `/v1/chat-messages` 端点，HTTP 404 错误不再发生，Dify 返回正常 200 响应，SSE 事件流转发正常进行。

## 行为契约

### 前置条件

1. `.env` 中已配置 `DIFY_API_BASE`（**必须包含 `/v1` 后缀**，如 `http://222.241.14.34:56487/v1`）。修改后 URL 拼接结果为 `{base}/chat-messages`，实际请求路径为 `/v1/chat-messages`（与 Dify 官方 Chat Message API 端点一致）。若 `DIFY_API_BASE` 不含 `/v1` 后缀，则拼接结果为 `{base}/chat-messages`，缺少必要的 `/v1` 路径段，请求将无法到达正确端点（同项目中 `difyService.js:95` 和 `difyService.js:142` 的拼接模式依赖相同前提）
2. 调用方传入有效的 `apiKey`、`query`、`userId`、`res`、`req`
3. `res` 对象尚未调用 `end()` 或 `destroy()`

### 后置条件

1. 成功路径：`res` 写入 SSE 事件流（`message`、`message_end`、`agent_message`、`agent_thought` 等事件），最终 `res.end()`
2. 错误路径：`res` 写入 `{event: 'error', ...}` 事件后 `res.end()`
3. 客户端断开时：上游请求被销毁（`upstreamReq.destroy()`）

### 不变式

- `proxyDifySSE` 的函数签名不变
- 请求体中 `user` 字段始终为 `'user-' + userId` 格式（不影响 chat 和 admin 路由）
- 3 个调用方（`assistant.js:20-27`、`chat.js:28-36`、`admin.js:162-170`）无需任何修改
- `.env` 文件中 `DIFY_API_BASE` 无需修改
- `server/routes/index.js` 无需修改

## 依赖关系

### 依赖的已有模块

| 模块 | 用途 |
|------|------|
| `http` (Node.js 内置) | 发起 HTTP 请求至 Dify 上游 |
| `https` (Node.js 内置) | 发起 HTTPS 请求至 Dify 上游 |
| `process.env.DIFY_API_BASE` | 环境变量，提供 Dify 服务基础 URL |

### 被依赖方（调用者，均不变）

| 调用方 | 文件 | 行号 | 使用的 API Key |
|--------|------|------|---------------|
| `POST /api/assistant/chat` | `server/routes/assistant.js` | 20-27 | `DIFY_ASSISTANT_APP_KEY` |
| `POST /api/chat/doctor/:id` | `server/routes/chat.js` | 28-36 | 医生 chat_token（AES 解密） |
| `POST /api/admin/chat` | `server/routes/admin.js` | 162-170 | `DIFY_ADMIN_AGENT_KEY` |

### 依赖的后端服务

| 服务 | 端点 | 说明 |
|------|------|------|
| Dify 平台 | `{DIFY_API_BASE}/chat-messages` | 修改后正确拼接为 `/v1/chat-messages`（与 Dify 官方 Chat Message API 一致），支持 Chatbot、Agent、Chatflow 三种应用类型 |

---

## 修订说明（v1 r1）

| 审查意见 | 修改措施 |
|---------|---------|
| 发现1 [一般]：前置条件声明错误——声称"含 `/v1` 后缀或不含均可，修改后两种写法均正确"，但实际上若 `DIFY_API_BASE` 不含 `/v1` 后缀，拼接结果将缺少必要的 `/v1` 路径段，请求同样无法到达正确端点（Dify 官方 Chat Message API 端点为 `/v1/chat-messages`）。该错误声明可能误导未来维护者在修改 `.env` 时去掉 `/v1` 后缀，导致回归故障。 | 将前置条件修改为准确表述：`DIFY_API_BASE` **必须包含 `/v1` 后缀**。补充说明修改后拼接结果为 `{base}/chat-messages`，实际路径为 `/v1/chat-messages`，并指出同项目中 `difyService.js:95` 和 `difyService.js:142` 的拼接模式依赖相同前提。 |
| 发现2 [轻微]：设计文档未声明本轮范围边界——需求文档列出 3 个待修复问题（A/B/C），但本设计仅覆盖问题 A，未说明问题 B/C 延后至后续轮次。独立阅读时可能造成"设计未覆盖全部需求"的困惑。 | 在概述末尾增加**范围声明**段落，明确本轮（R1）仅修复问题 A，问题 B 和 C 分别延后至 R2、R3 处理，并引用 `task_v1.md` 修订说明及 `plan.md` 轮次规划。 |
