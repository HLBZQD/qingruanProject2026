# 批次 6 实现计划：AI 对话与 SSE 流式代理

## 1. 目标

完成 Dify 流式响应代理能力，并实现医师对话和全局 AI 助手对话接口。

## 2. 架构概览

```
客户端 SSE EventSource
        │
        ▼
┌──────────────────────┐
│ server/routes/index.js│  ← 挂载 /chat、/assistant
└──────┬───────────────┘
       ├── server/routes/chat.js       (2 端点)
       │       ├── POST /chat/doctor/:id       → SSE 流
       │       └── GET  /chat/doctor/:id/conversations → 空数组
       │
       └── server/routes/assistant.js  (3 端点)
               ├── POST /assistant/chat        → SSE 流
               ├── GET  /assistant/advice      → life_advice 分页
               └── GET  /assistant/conversations → 空数组
                        │
                        ▼
               server/services/sseProxy.js
               proxyDifySSE({ apiKey, query, conversationId, userId, res })
                        │
                        ▼
               Dify API: POST /v1/chat-messages (streaming)
```

## 3. 实现顺序

```
sseProxy.js  →  chat.js  →  assistant.js  →  index.js 挂载
```

sseProxy 是 chat 和 assistant 的共享依赖，所以必须最先实现。chat 和 assistant 互不依赖，但 chat 先做因为它的模式更简单（查 DB 取 token）。index.js 挂载最后做。

## 4. 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/services/sseProxy.js` | **新建** | Dify SSE 流式代理核心 |
| `server/routes/chat.js` | **新建** | 医师对话路由 (2 端点) |
| `server/routes/assistant.js` | **新建** | AI 助手路由 (3 端点) |
| `server/routes/index.js` | **修改** | 新增 chat、assistant 挂载 |
| `server/services/difyService.js` | **不改** | 已有，无需修改 |

## 5. 设计决策

### 5.1 SSE 代理使用原生 http/https 模块
沿用 `difyService.js` 中对 `httpRequest` 的模式 — 使用 Node.js 内置 `http`/`https` 模块发起流式请求，不引入额外依赖（如 `axios` 对 SSE 支持有限）。

### 5.2 Dify streaming API 端点
调用 `POST {DIFY_API_BASE_URL}/v1/chat-messages`，`response_mode: "streaming"`。请求体：
```json
{
  "query": "用户消息",
  "user": "user-{userId}",
  "inputs": {},
  "response_mode": "streaming",
  "conversation_id": "..."  // 可选
}
```

### 5.3 流式转发策略 — 原样透传
Dify 返回的每一行 `data: {...}` 原样写入 `res.write()`，不解析、不修改。错误事件也保持原样转发。

### 5.4 客户端断连处理
监听 `req.on('close')`，客户端断开时调用 `upstreamReq.destroy()` 中止到 Dify 的请求。

### 5.5 环境变量
- `DIFY_API_BASE_URL` — 已有，用于 Dify 基础 URL
- `DIFY_ASSISTANT_APP_KEY` — 用于 AI 助手对话
- 医师对话的 `chat_token` 从 `doctor_information` 表读取，不用环境变量

### 5.6 conversations 返回空数组（v1）
第 6 批次不实现会话历史。两个 conversations 端点均返回 `{ success: true, data: [] }`。后续版本可从 Dify API 查询或本地存储。

## 6. 认证策略

| 端点 | 认证 |
|------|------|
| `POST /api/chat/doctor/:id` | `authMiddleware`（必须登录） |
| `GET /api/chat/doctor/:id/conversations` | `authMiddleware` |
| `POST /api/assistant/chat` | `authMiddleware` |
| `GET /api/assistant/advice` | `authMiddleware` |
| `GET /api/assistant/conversations` | `authMiddleware` |

全部需要登录，因为对话功能属于用户个人功能。

## 7. 错误处理

| 场景 | 行为 |
|------|------|
| 医生 ID 不存在 | `AppError(404, 'NOT_FOUND', '医生不存在')` |
| 医生缺少 chat_token | `AppError(502, 'DIFY_ERROR', '医生未配置对话服务')` |
| Dify 上游错误 | SSE `{"event": "error", ...}` 事件 |
| Dify 连接超时 | SSE `{"event": "error", ...}` 事件 |
| 客户端断连 | 中止上游请求，不做额外处理 |
| 未登录访问 | authMiddleware 自动返回 401 |

## 8. 验收标准

- [x] curl 能接收 `data: {...}` 流式事件
- [ ] 客户端断开不会造成后端请求悬挂
- [ ] Dify 错误能以 SSE error 形式返回
- [ ] 医师对话按 ID 查询 `chat_token`，不泄露在前端
- [ ] AI 助手使用 `DIFY_ASSISTANT_APP_KEY`
- [ ] `/api/assistant/advice` 返回分页数据，tags 为数组
- [ ] conversations 端点返回空数组
- [ ] 所有路由在 `/api` 下正常挂载
