# Batch 6 SSE Chat — 代码文档 v1

---

## 1. server/services/sseProxy.js

### 函数签名

```js
function proxyDifySSE({ apiKey, query, conversationId, userId, res, req })
```

### 流程

1. **设置响应头**: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`
2. **Mock 降级**: 若 `process.env.DIFY_API_BASE_URL` 未设置，直接向 `res` 写入 mock SSE 事件（`message` + `message_end`），然后 `res.end()`
3. **构造 Dify 请求体**: `{ query, user: "user-<userId>", inputs: {}, response_mode: "streaming" }`，仅在 `conversationId` 存在时追加 `conversation_id`
4. **发起 HTTPS 请求**: POST 到 `{DIFY_API_BASE_URL}/v1/chat-messages`，携带 `Authorization: Bearer {apiKey}` 和 `Content-Type: application/json`
5. **流式转发**: 行缓冲模式，按 `\n` 分割 chunk 后原样透传 SSE 行到客户端
6. **流结束**: 上行 `end` 事件时刷新 `buffer` 残留内容后 `res.end()`
7. **错误处理**: 非 2xx → `DIFY_ERROR`；网络/超时 → `UPSTREAM_ERROR`
8. **客户端断连**: 监听 `req.on('close')` 销毁上行请求

### 依赖

- Node.js 内置 `http` / `https` 模块

---

## 2. server/routes/chat.js

| 端点 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/api/chat/doctor/:id` | POST | authMiddleware | SSE 医师对话。校验 message → 查 doctor_information 获取 chat_token → 调用 proxyDifySSE |
| `/api/chat/doctor/:id/conversations` | GET | authMiddleware | v1 返回空数组 `{ success: true, data: [] }` |

### chat_token 防泄露

- `chat_token` 从 DB 查询 → 直接传入 `proxyDifySSE.apiKey` → 仅用于 Dify `Authorization` Header
- 不写入响应体 / SSE data / HTTP Header

---

## 3. server/routes/assistant.js

| 端点 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/api/assistant/chat` | POST | authMiddleware | SSE AI 助手对话。使用 `DIFY_ASSISTANT_APP_KEY` |
| `/api/assistant/advice` | GET | authMiddleware | 分页查询 life_advice 表，tags 反序列化防御 |
| `/api/assistant/conversations` | GET | authMiddleware | v1 返回空数组 |

### advice 分页

- `parsePagination(req.query)` 解析 page/pageSize
- 查询 `life_advice WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
- `tags` 字段 JSON.parse 防崩溃：非数组 → `[]`，解析失败 → `[]`

---

## 4. server/routes/index.js

新增两行路由挂载：

```js
router.use('/chat', require('./chat'));
router.use('/assistant', require('./assistant'));
```

置于 `/punch` 之后、404 fallback 之前。
