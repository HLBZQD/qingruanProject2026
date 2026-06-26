# 批次 6 任务分解 v1

## 任务依赖图

```
Task-1 (sseProxy.js)  ──┬──→ Task-2 (chat.js)
                        │
                        └──→ Task-3 (assistant.js)
                                     │
                        Task-4 (index.js 挂载) ← 依赖 Task-2, Task-3
```

---

## Task-1: SSE 代理工具

**文件**: `server/services/sseProxy.js` (新建)

### 1.1 函数签名

```js
function proxyDifySSE({ apiKey, query, conversationId, userId, res, req }) {
```

参数：
- `apiKey` — Dify 应用的 API Key
- `query` — 用户消息文本
- `conversationId` — Dify conversation_id（可选，首次对话不传）
- `userId` — 当前用户 ID
- `res` — Express Response 对象（用于写 SSE 流）
- `req` — Express Request 对象（用于监听 close 事件）

### 1.2 实现步骤

1. **设置响应头**
   ```
   Content-Type: text/event-stream
   Cache-Control: no-cache
   Connection: keep-alive
   X-Accel-Buffering: no     (禁用 Nginx 缓冲)
   ```

2. **构造 Dify 请求体**
   ```json
   {
     "query": "<用户消息>",
     "user": "user-<userId>",
     "inputs": {},
     "response_mode": "streaming",
     "conversation_id": "<conversationId>"  // 仅当传入时
   }
   ```

3. **发起到 Dify 的 HTTP 请求**
   - URL: `{DIFY_API_BASE_URL}/v1/chat-messages`
   - Method: POST
   - Headers: `Authorization: Bearer {apiKey}`, `Content-Type: application/json`
   - 使用 Node.js 内置 `http`/`https` 模块（与 `difyService.js` 风格一致）

4. **流式转发 Dify 响应**
   - 监听 `upstreamRes.on('data')`，将每个 chunk 转为字符串
   - 使用行缓冲：按 `\n` 分割，每行原样 `res.write(line + '\n')`
   - **注意**: chunk 可能是不完整的行，需要保留残片拼接到下一个 chunk

5. **Dify 错误处理**
   - 若上游返回非 2xx 状态码，收集完整 body 后发送 SSE error：
     ```
     data: {"event": "error", "message": "...", "code": "DIFY_ERROR"}
     ```
     然后 `res.end()`
   - 若上游请求失败（网络错误、超时），发送 SSE error：
     ```
     data: {"event": "error", "message": "AI 服务连接失败，请稍后重试", "code": "UPSTREAM_ERROR"}
     ```
     然后 `res.end()`

6. **客户端断连处理**
   ```js
   req.on('close', () => {
     upstreamReq.destroy();
   });
   ```
   判断条件：`req.socket.destroyed` 或监听 `close` 事件均可。

7. **流结束处理**
   - `upstreamRes.on('end')` → 刷新残留缓冲 → `res.end()`

### 1.3 行缓冲伪代码

```js
let buffer = '';
upstreamRes.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop(); // 保留不完整的最后一行
  for (const line of lines) {
    res.write(line + '\n');
  }
});
```

### 1.4 环境变量依赖
- `DIFY_API_BASE_URL` — 已有，来自 `difyService.js` 同款使用

### 1.5 Mock 降级
若 `DIFY_API_BASE_URL` 未设置（Mock 模式），直接返回 SSE mock 响应：
```
data: {"event": "message", "answer": "您好，我是AI助手（Mock模式）。Dify服务未配置。", "conversation_id": "mock-001"}
data: {"event": "message_end", "conversation_id": "mock-001"}
```

### 1.6 验收
- curl 请求应收到 `Content-Type: text/event-stream`
- 模拟 Dify 返回多行 data 事件，前端能逐条接收
- 中途断开 curl (Ctrl+C)，后端日志无异常，上游请求被销毁

---

## Task-2: 医师对话路由

**文件**: `server/routes/chat.js` (新建)

### 2.1 POST /api/chat/doctor/:id

**中间件**: `authMiddleware`

**请求体**:
```json
{
  "message": "string (必填)",
  "conversation_id": "string (可选)"
}
```

**处理流程**:
1. 校验 `req.body.message` 非空，否则返回 422
2. 从 `doctor_information` 表查询 `WHERE id = ?`：
   ```sql
   SELECT id, chat_token FROM doctor_information WHERE id = ?
   ```
3. 若医生不存在 → `throw new AppError(404, 'NOT_FOUND', '医生不存在')`
4. 若 `chat_token` 为空/null → `throw new AppError(502, 'DIFY_ERROR', '医生未配置对话服务')`
5. 调用 `proxyDifySSE({ apiKey: row.chat_token, query: req.body.message, conversationId: req.body.conversation_id, userId: req.user.id, res, req })`
6. **注意**: 不将 `chat_token` 写入任何响应

**try/catch**: 非 SSE 阶段的同步错误（如医生不存在）需要 `next(e)` 处理。SSE 阶段的错误由 `proxyDifySSE` 内部处理。

### 2.2 GET /api/chat/doctor/:id/conversations

**中间件**: `authMiddleware`

**响应**:
```json
{
  "success": true,
  "message": "查询成功",
  "data": []
}
```

无需查询数据库。后续版本实现。

### 2.3 验收
- 传入有效医生 ID + message，收到 SSE 流式事件
- 传入无效医生 ID，收到 404 JSON 错误
- 检查响应中不包含 `chat_token` 字段
- conversations 返回空数组

---

## Task-3: AI 助手路由

**文件**: `server/routes/assistant.js` (新建)

### 3.1 POST /api/assistant/chat

**中间件**: `authMiddleware`

**请求体**:
```json
{
  "message": "string (必填)",
  "conversation_id": "string (可选)"
}
```

**处理流程**:
1. 校验 `req.body.message` 非空，否则返回 422
2. 调用 `proxyDifySSE({ apiKey: process.env.DIFY_ASSISTANT_APP_KEY, query: req.body.message, conversationId: req.body.conversation_id, userId: req.user.id, res, req })`

### 3.2 GET /api/assistant/advice

**中间件**: `authMiddleware`

**查询参数**: `?page=1&pageSize=20`

**处理流程**:
1. 使用 `parsePagination(req.query)` 获取分页参数
2. 查询 `life_advice` 表：
   ```sql
   SELECT id, title, tags, content, created_at
   FROM life_advice
   WHERE user_id = ?
   ORDER BY created_at DESC
   LIMIT ? OFFSET ?
   ```
3. 查询总数：
   ```sql
   SELECT COUNT(*) AS total FROM life_advice WHERE user_id = ?
   ```
4. 对每一行执行 `JSON.parse(row.tags)` 将 tags 从 JSON 字符串转为数组。如果解析失败，fallback 为 `[]`：
   ```js
   let tags = [];
   try { tags = JSON.parse(row.tags); } catch (e) { /* keep [] */ }
   ```
5. 使用 `buildPagination(page, pageSize, total)` 构造分页信息
6. 返回：
   ```json
   {
     "success": true,
     "message": "查询成功",
     "data": [...],
     "pagination": { "page": 1, "pageSize": 20, "total": 5, "totalPages": 1 }
   }
   ```

### 3.3 GET /api/assistant/conversations

**中间件**: `authMiddleware`

**响应**:
```json
{
  "success": true,
  "message": "查询成功",
  "data": []
}
```

### 3.4 验收
- `/api/assistant/chat` 返回 SSE 流式事件
- `/api/assistant/advice` 返回分页数据，tags 为解析后的数组
- `/api/assistant/conversations` 返回空数组

---

## Task-4: 路由挂载

**文件**: `server/routes/index.js` (修改)

### 4.1 修改内容

在现有挂载后添加两行（插入在 `router.use('/punch', ...)` 之后，404 兜底之前）：

```js
router.use('/chat', require('./chat'));
router.use('/assistant', require('./assistant'));
```

### 4.2 挂载后完整路由表

```
/api/chat/doctor/:id              POST   → chat.js
/api/chat/doctor/:id/conversations GET   → chat.js
/api/assistant/chat                POST   → assistant.js
/api/assistant/advice              GET    → assistant.js
/api/assistant/conversations       GET    → assistant.js
```

### 4.3 验收
- `node -e "require('./server/routes/index')"` 不报错（无循环依赖）
- 启动服务后访问 `/api/chat/doctor/1` 路由匹配（虽然会 401，但不 404）
