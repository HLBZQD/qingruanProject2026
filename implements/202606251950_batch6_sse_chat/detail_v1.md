# 批次 6 详细设计 v1

---

## 1. server/services/sseProxy.js（新建）

### 1.1 proxyDifySSE 函数签名

```js
function proxyDifySSE({ apiKey, query, conversationId, userId, res, req })
```

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `apiKey` | `string` | 是 | Dify 应用的 API Key（医师 `chat_token` 或 `DIFY_ASSISTANT_APP_KEY`） |
| `query` | `string` | 是 | 用户消息文本 |
| `conversationId` | `string` | 否 | Dify conversation_id，首次对话不传（`undefined`） |
| `userId` | `number` | 是 | 当前用户 ID，用于构造 Dify user 标识 |
| `res` | `express.Response` | 是 | Express 响应对象，向客户端写入 SSE 流 |
| `req` | `express.Request` | 是 | Express 请求对象，用于监听 `close` 事件断连检测 |

**返回值**: 无（通过 `res` 流式写入，函数不返回 Promise）

---

### 1.2 实现流程

#### 步骤 1：设置响应头

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no          (禁用 Nginx 缓冲)
```

#### 步骤 2：Mock 模式降级

若 `process.env.DIFY_API_BASE_URL` 未设置：

1. 直接 `res.write()` 以下 mock 事件：
   ```
   data: {"event": "message", "answer": "您好，我是AI助手（Mock模式）。Dify服务未配置。", "conversation_id": "mock-001"}
   data: {"event": "message_end", "conversation_id": "mock-001", "message_id": "mock-msg-001"}
   ```
2. `res.end()`
3. `return`（不再执行后续逻辑）

#### 步骤 3：构造 Dify 请求体

```json
{
  "query": "<用户消息>",
  "user": "user-<userId>",
  "inputs": {},
  "response_mode": "streaming",
  "conversation_id": "<conversationId>"
}
```

- `conversation_id` 仅在 `conversationId` 非空时加入请求体

#### 步骤 4：发起 HTTPS 请求到 Dify

- URL: `{DIFY_API_BASE_URL}/v1/chat-messages`
- Method: `POST`
- Headers: `Authorization: Bearer {apiKey}`, `Content-Type: application/json`
- 使用与 `difyService.js` 一致的 `httpRequest` 模式（内置 `http`/`https` 模块）

#### 步骤 5：流式转发 — 行缓冲

```js
let buffer = '';
upstreamRes.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop();            // 保留不完整的最后一行
  for (const line of lines) {
    res.write(line + '\n');
  }
});
```

- Dify SSE 每行以 `data: ...` 格式返回，按 `\n` 分割后**原样透传**，不解析 JSON 内容
- chunk 可能包含不完整的行，残片保留到 `buffer` 拼接到下一个 chunk

#### 步骤 6：流结束处理

```js
upstreamRes.on('end', () => {
  if (buffer.length > 0) {
    res.write(buffer + '\n');      // 刷新残留缓冲
  }
  res.end();
});
```

#### 步骤 7：Dify 上游错误处理

- 若 Dify 返回非 2xx 状态码：收集完整 response body 后写 SSE error 事件：
  ```
  data: {"event": "error", "message": "<Dify 错误消息>", "code": "DIFY_ERROR"}
  ```
  然后 `res.end()`
- 若请求失败（网络错误、超时、DNS 解析失败）：写 SSE error 事件：
  ```
  data: {"event": "error", "message": "AI 服务连接失败，请稍后重试", "code": "UPSTREAM_ERROR"}
  ```
  然后 `res.end()`

#### 步骤 8：客户端断连处理

```js
req.on('close', () => {
  if (upstreamReq && !upstreamReq.destroyed) {
    upstreamReq.destroy();
  }
});
```

- 客户端断开连接时立即销毁到 Dify 的上游请求，避免资源悬挂

---

### 1.3 SSE 事件格式规范

严格遵守设计文档 3.3 节 Dify 原始事件格式，**原样透传，不解析、不修改**：

| 事件类型 | data 字段结构 | 说明 |
|----------|--------------|------|
| `message` | `{"event": "message", "answer": "...", "conversation_id": "xxx", "message_id": "xxx", "created_at": 1719139200}` | AI 逐 token 生成 |
| `message_end` | `{"event": "message_end", "conversation_id": "xxx", "message_id": "xxx", "created_at": 1719139200}` | AI 回复结束 |
| `error` | `{"event": "error", "message": "...", "code": "..."}` | 流内逻辑错误 |
| `workflow_started` | `{"event": "workflow_started", "workflow_run_id": "xxx"}` | 工作流开始 |
| `workflow_finished` | `{"event": "workflow_finished", "workflow_run_id": "xxx"}` | 工作流结束 |
| `agent_message` | `{"event": "agent_message", "answer": "...", "conversation_id": "xxx"}` | Agent 中间消息 |
| `agent_thought` | `{"event": "agent_thought", "thought": "...", "tool": "..."}` | Agent 推理过程 |

**降级/Mock 模式下**使用最小事件集：
```
data: {"event": "message", "answer": "...(mock text)...", "conversation_id": "mock-001"}
data: {"event": "message_end", "conversation_id": "mock-001", "message_id": "mock-msg-001"}
```

> **不包含 `created_at`** — mock 模式省略 Unix 时间戳，与生产环境 Dify 返回格式的差异由前端容错处理（前端 `useSSE.ts` 按字段可选解析）。

**连接层错误事件**（由 sseProxy 自身产生，非 Dify 透传）：
```
data: {"event": "error", "message": "<人类可读错误描述>", "code": "UPSTREAM_ERROR"}
data: {"event": "error", "message": "<Dify 返回的错误信息>", "code": "DIFY_ERROR"}
```

> **注意**：连接层错误事件的 code 使用 `UPSTREAM_ERROR`（代理自身错误）或 `DIFY_ERROR`（Dify 上游非 2xx），与 Dify 流内 error 事件的 `code`（如 `knowledge_base_error`、`tool_call_error`）含义不同。前端 `useSSE.ts` 的 `SSEErrorEvent` 类型定义 `code` 为 `string`，可兼容所有错误码。

---

### 1.4 AbortSignal 策略

当前设计**不使用 `AbortSignal` 或 `AbortController`**，原因：
- `proxyDifySSE` 不返回 Promise，接收 `req` 参数用于 `close` 事件监听
- 断连检测通过 `req.on('close', ...)` 实现，这是 Express/Node.js 标准模式
- `AbortController` 仅在*前端* `useSSE.ts` 中使用（如 `chatStore.registerAbortController`），用于前端主动中断连接

后端中断 `upstreamReq` 的场景：
1. 客户端主动断开 TCP 连接 → `req.on('close')` 触发
2. `upstreamReq` 超时 → 上游 `timeout` 事件触发（写 SSE error 事件后 `res.end()`）
3. `upstreamReq` 错误 → 上游 `error` 事件触发（写 SSE error 事件后 `res.end()`）

---

### 1.5 安全要求

- `apiKey` 参数（即医师 `chat_token` 或 `DIFY_ASSISTANT_APP_KEY`）**仅作为 Dify API 请求的 `Authorization` Header，不写入任何 SSE data 行或 HTTP 响应头**

---

## 2. server/routes/chat.js（新建）

### 2.1 路由定义

```js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
```

所有端点均应用 `authMiddleware`。

---

### 2.2 POST /api/chat/doctor/:id

**中间件**: `authMiddleware`

**请求体**:
```json
{
  "message": "string (必填)",
  "conversation_id": "string (可选)"
}
```

**处理流程**:

1. **校验 `message`**：若 `!req.body.message` 或 `typeof req.body.message !== 'string'` 或 `req.body.message.trim().length === 0`，返回：
   ```json
   { "error": { "code": "VALIDATION_ERROR", "message": "消息不能为空" } }
   ```
   HTTP 422

2. **查医生表**：
   ```sql
   SELECT id, chat_token FROM doctor_information WHERE id = ?
   ```
   - 不存在 → `throw new AppError(404, 'NOT_FOUND', '医生不存在')`
   - `chat_token` 为空或 `null` → `throw new AppError(502, 'DIFY_ERROR', '医生未配置对话服务')`

3. **调用 proxyDifySSE**：
   ```js
   proxyDifySSE({
     apiKey: row.chat_token,
     query: req.body.message,
     conversationId: req.body.conversation_id,
     userId: req.user.id,
     res,
     req
   });
   ```

   > **chat_token 防护**：`chat_token` 从 DB 查询后直接传入 `proxyDifySSE` 的 `apiKey` 参数，不作为响应体返回，不写入 SSE data 行。

4. **错误处理**：
   - 步骤 1-2 的同步错误 → 由 `try/catch` 捕获，`next(e)` 交给全局 errorHandler
   - SSE 阶段的错误 → 由 `proxyDifySSE` 内部处理（写入 SSE error 事件后 `res.end()`）

---

### 2.3 GET /api/chat/doctor/:id/conversations

**中间件**: `authMiddleware`

**请求头**: `Authorization: Bearer <JWT_TOKEN>`

**响应 (200)**:
```json
{
  "success": true,
  "message": "查询成功",
  "data": []
}
```

**说明**: v1 版本不实现会话历史查询，直接返回空数组。后续版本将从本地存储或 Dify API 查询。

---

## 3. server/routes/assistant.js（新建）

### 3.1 路由定义

```js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { db } = require('../db/database');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { success } = require('../utils/response');
const proxyDifySSE = require('../services/sseProxy');
```

所有端点均应用 `authMiddleware`。

---

### 3.2 POST /api/assistant/chat

**中间件**: `authMiddleware`

**请求体**:
```json
{
  "message": "string (必填)",
  "conversation_id": "string (可选)"
}
```

**处理流程**:

1. **校验 `message`**：若为空，返回 422 `VALIDATION_ERROR`

2. **调用 `proxyDifySSE`**：
   ```js
   proxyDifySSE({
     apiKey: process.env.DIFY_ASSISTANT_APP_KEY,
     query: req.body.message,
     conversationId: req.body.conversation_id,
     userId: req.user.id,
     res,
     req
   });
   ```

3. **SSE 事件格式**与医师对话完全一致（透传 Dify 原始格式）

---

### 3.3 GET /api/assistant/advice

**中间件**: `authMiddleware`

**URL 查询参数**: `?page=1&pageSize=20`

**处理流程**:

1. **分页解析**：`const { page, pageSize, offset, limit } = parsePagination(req.query);`

2. **查询 life_advice 表**：
   ```sql
   SELECT id, title, tags, content, created_at
   FROM life_advice
   WHERE user_id = ?
   ORDER BY created_at DESC
   LIMIT ? OFFSET ?
   ```
   参数：`[req.user.id, limit, offset]`

3. **查询总数**：
   ```sql
   SELECT COUNT(*) AS total FROM life_advice WHERE user_id = ?
   ```
   参数：`[req.user.id]`

4. **tags 字段反序列化**：对每行执行：
   ```js
   let tags = [];
   try {
     tags = JSON.parse(row.tags);
     if (!Array.isArray(tags)) tags = [];    // v1 防御：tags 非数组时 fallback
   } catch (e) {
     // tags 保持 []
   }
   ```
   - 若 `row.tags` 为 `null` 或非 JSON 字符串，`JSON.parse` 抛出异常，回退为 `[]`
   - 若解析结果为非数组（如 boolean `true`、字符串），也回退为 `[]`

5. **构造分页信息**：`const pagination = buildPagination(page, pageSize, total);`

6. **返回响应**:
   ```json
   {
     "success": true,
     "message": "查询成功",
     "data": [
       {
         "id": 1,
         "title": "改善饮食习惯的建议",
         "tags": ["饮食", "血糖管理"],
         "content": "根据您的打卡数据，建议...",
         "created_at": "2026-06-23T16:00:00"
       }
     ],
     "pagination": {
       "page": 1,
       "pageSize": 20,
       "total": 5,
       "totalPages": 1
     }
   }
   ```

---

### 3.4 GET /api/assistant/conversations

**中间件**: `authMiddleware`

**响应 (200)**:
```json
{
  "success": true,
  "message": "查询成功",
  "data": []
}
```

**说明**: 与 `GET /api/chat/doctor/:id/conversations` 行为一致，v1 返回空数组。

---

## 4. 跨切面约定

### 4.1 chat_token 防泄露

- `chat_token` 从 `doctor_information` 表读取后**仅**传入 `proxyDifySSE` 的 `apiKey` 参数
- `proxyDifySSE` 内部将 `apiKey` **仅**用于 `Authorization: Bearer {apiKey}` 请求头
- 不写入 SSE `data:` 行内容、不写入 HTTP 响应头、不写入 JSON error message 正文
- 全局 errorHandler 捕获的 `AppError` 消息为固定中文描述，不含 token

### 4.2 SSE 流正确性

- `proxyDifySSE` 使用行缓冲（line buffer）确保每个 `\n` 分隔的 Dify SSE 行完整透传
- 流结束前刷新残留缓冲 `buffer`（最后一个不完整行的可能性为 Dify 未以 `\n` 结尾的边缘场景）
- Dify 返回的 SSE 格式为 `data: {"event": ..., ...}\n`，前端 `useSSE.ts` 按 `\n\n` 分隔事件块后再解析

### 4.3 认证覆盖

| 端点 | 认证中间件 | 用户身份 |
|------|-----------|---------|
| `POST /api/chat/doctor/:id` | `authMiddleware` | `req.user.id` |
| `GET /api/chat/doctor/:id/conversations` | `authMiddleware` | `req.user.id` |
| `POST /api/assistant/chat` | `authMiddleware` | `req.user.id` |
| `GET /api/assistant/advice` | `authMiddleware` | `req.user.id` |
| `GET /api/assistant/conversations` | `authMiddleware` | `req.user.id` |

### 4.4 依赖关系

```
sseProxy.js ──┬──→ chat.js
              └──→ assistant.js
                        │
              index.js 挂载 ←── chat.js, assistant.js
```
