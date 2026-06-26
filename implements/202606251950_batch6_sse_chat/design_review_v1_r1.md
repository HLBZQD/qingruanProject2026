# 批次 6 设计审查 v1 r1

## 审查范围

- `detail_v1.md` 全部内容
- 对照文档：`docs/2_detailed_design_v3.md` §3.2.11-3.2.12, §3.2.25-3.2.27, §3.3
- 对照文件：`server/services/difyService.js`, `server/middleware/auth.js`, `server/routes/index.js`, `server/utils/response.js`, `server/utils/pagination.js`

---

## 审查清单

### 1. SSE 格式与设计文档 3.3 节一致性

| 检查项 | 设计文档 3.3 节 | detail_v1.md | 结果 |
|--------|----------------|-------------|------|
| 事件类型 `message` | `{"event": "message", "answer": "...", "conversation_id": "xxx", "message_id": "xxx", "created_at": ...}` | 1.3 节表格一致 | **PASS** |
| 事件类型 `message_end` | `{"event": "message_end", "conversation_id": "xxx", "message_id": "xxx", "created_at": ...}` | 1.3 节表格一致 | **PASS** |
| 事件类型 `error` | `{"event": "error", "message": "...", "code": "..."}` | 1.3 节表格一致 | **PASS** |
| 事件类型 `workflow_started` | `{"event": "workflow_started", "workflow_run_id": "xxx"}` | 1.3 节表格一致 | **PASS** |
| 事件类型 `workflow_finished` | `{"event": "workflow_finished", "workflow_run_id": "xxx"}` | 1.3 节表格一致 | **PASS** |
| 事件类型 `agent_message` | `{"event": "agent_message", "answer": "...", "conversation_id": "xxx"}` | 1.3 节表格一致 | **PASS** |
| 事件类型 `agent_thought` | `{"event": "agent_thought", "thought": "...", "tool": "..."}` | 1.3 节表格一致 | **PASS** |
| `created_at` 字段 | `message`/`message_end` 需含 | mock 模式省略，已注明前端容错 | **PASS** |
| 前端解析方式 | `\n\n` 分隔事件块 | 4.2 节已说明 | **PASS** |

**结论**: SSE 事件格式与设计文档 3.3 节完全一致。七种事件类型均覆盖，透传策略正确。

---

### 2. chat_token 不泄露

| 检查项 | 说明 | 结果 |
|--------|------|------|
| chat.js 不将 token 写入响应 | 仅传入 `proxyDifySSE` 的 `apiKey` 参数，不导出到 res | **PASS** |
| sseProxy.js 仅用于 Authorization Header | `apiKey` 在 `Bearer {apiKey}` 中使用，不写入 data 行 | **PASS** |
| 错误消息不含 token | `chat_token 为空` 时返回固定中文 "医生未配置对话服务" | **PASS** |
| 全局 errorHandler 不泄露 | `AppError.message` 为固定中文文本 | **PASS** |

**结论**: `chat_token` 在整条调用链中不会出现在任何客户端可见位置。符合安全要求。

---

### 3. streaming 正确转发

| 检查项 | 说明 | 结果 |
|--------|------|------|
| 行缓冲机制 | `\n` 分割，残片保留到下次 chunk | **PASS** |
| 残留缓冲刷新 | `upstreamRes.on('end')` 时 `buffer.length > 0` 写入最后一行 | **PASS** |
| 客户端断连 | `req.on('close')` → `upstreamReq.destroy()` | **PASS** |
| 上游错误 | 非 2xx → SSE error 事件后 `res.end()` | **PASS** |
| 上游网络错误 | SSE `UPSTREAM_ERROR` 事件后 `res.end()` | **PASS** |
| 响应头正确 | `text/event-stream`, `no-cache`, `keep-alive`, `X-Accel-Buffering: no` | **PASS** |
| 与 difyService.js 风格一致 | 使用 `http`/`https` 内置模块，不引入 axios | **PASS** |

---

### 4. 路由设计审查

| 检查项 | 说明 | 结果 |
|--------|------|------|
| 所有端点均用 `authMiddleware` | plan.md §6 全部要求认证 | **PASS** |
| 路由前缀正确 | `/api/chat/...`, `/api/assistant/...` | **PASS** |
| 错误码匹配 | `NOT_FOUND`(404), `DIFY_ERROR`(502), `VALIDATION_ERROR`(422) 均在设计文档 3.4 节错误码表内 | **PASS** |
| 分页参数 | 使用已有 `parsePagination`/`buildPagination`，与现有路由一致 | **PASS** |
| conversations 空数组 | plan.md §5.6 明确 v1 返回空数组 | **PASS** |
| tags 反序列化 | `JSON.parse` + fallback `[]`，含 `Array.isArray` 防御 | **PASS** |

---

### 5. 实现可行性

| 检查项 | 说明 | 结果 |
|--------|------|------|
| 无新增 npm 依赖 | 仅使用 `http`/`https`/`express` 等已有模块 | **PASS** |
| 数据库表存在 | `doctor_information.chat_token` 在建表 SQL 中已有；`life_advice.tags` 为 `TEXT NOT NULL DEFAULT '[]'` | **PASS** |
| 环境变量 | `DIFY_API_BASE_URL` 已有；`DIFY_ASSISTANT_APP_KEY` 为新增（需运维补充） | **INFO** |
| 与已有 routes/index.js 兼容 | `router.use('/chat', ...)` 和 `router.use('/assistant', ...)` 插入点位于 `punch` 之后、404 兜底之前 | **PASS** |

---

## 审查结论

| 类别 | 结果 |
|------|------|
| SSE 格式与设计文档 3.3 节一致性 | **PASS** |
| chat_token 不泄露 | **PASS** |
| streaming 正确转发 | **PASS** |
| 路由设计正确性 | **PASS** |
| 实现可行性 | **PASS** |

---

**裁决: APPROVED**

> 备注：`DIFY_ASSISTANT_APP_KEY` 为新增环境变量，需在部署时补充到 `.env` 文件。Mock 降级逻辑已覆盖该变量未设置时的安全回退。
