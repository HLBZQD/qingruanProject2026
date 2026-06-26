# 计划审查报告 v1 r1

## 审查对象

- `plan.md` — 实现计划
- `task_v1.md` — 任务分解

## 审查维度

### 1. 完整性 — PASS

| 检查项 | 结果 |
|--------|------|
| sseProxy.js 设计覆盖 | PASS — 包含签名、请求/响应头、行缓冲、错误处理、断连处理、Mock 降级 |
| chat.js 全部 2 端点 | PASS — POST /doctor/:id + GET /doctor/:id/conversations |
| assistant.js 全部 3 端点 | PASS — POST /chat + GET /advice + GET /conversations |
| index.js 挂载 | PASS — chat 和 assistant 挂载位置明确 |
| 认证策略 | PASS — 5 个端点均 authMiddleware |
| 错误场景 | PASS — 医生不存在、无 token、Dify 错误、超时、断连 |

### 2. 与设计文档一致性 — PASS

| 设计要求 (v3 §3.2.11-3.2.27 + batches §6) | plan/task | 一致？ |
|-------------------------------------------|-----------|--------|
| POST /api/chat/doctor/:id SSE 流 | Task-2.1 | ✓ |
| GET /api/chat/doctor/:id/conversations 空数组 v1 | Task-2.2 | ✓ |
| POST /api/assistant/chat SSE 流 | Task-3.1 | ✓ |
| GET /api/assistant/advice 分页 + tags 解析 | Task-3.2 | ✓ |
| GET /api/assistant/conversations 空数组 v1 | Task-3.3 | ✓ |
| proxyDifySSE 签名 | plan §5.2 + Task-1.1 | ✓ |
| Content-Type text/event-stream | Task-1.2 步骤1 | ✓ |
| 不暴露 chat_token | Task-2.1 步骤6 | ✓ |
| 客户端断开中止上游 | Task-1.2 步骤6 | ✓ |
| Dify 错误返回 SSE error | Task-1.2 步骤5 | ✓ |
| DIFY_ASSISTANT_APP_KEY | Task-3.1 | ✓ |

### 3. 与现有代码兼容性 — PASS

| 检查项 | 结果 |
|--------|------|
| 使用 `require('../db/database')` 模式 | PASS — chat.js 沿用现有 DB 访问方式 |
| 使用 `require('../utils/response')` 的 `success`/`AppError` | PASS — 沿用现有错误处理 |
| 使用 `require('../utils/pagination')` | PASS — assistant.js advice 端点使用 |
| 使用 `require('../middleware/auth')` 中间件 | PASS — 5 个端点均使用 |
| 与现有 `difyService.js` 风格一致 | PASS — SSE 代理沿用原生 http/https 模块 |
| `index.js` 挂载格式一致 | PASS — 与其他 `router.use(...)` 格式相同 |
| 不修改 `difyService.js` | PASS — 已确认无需修改 |
| 不修改 `errorHandler.js` | PASS — SSE 端点不使用 errorHandler（流式响应） |
| `req.on('close')` 用 req 参数 | PASS — Task-1.1 签名包含 req 参数 |

### 4. 实现顺序合理性 — PASS

```
sseProxy.js → chat.js → assistant.js → index.js
```

依赖正确：chat.js 和 assistant.js 都依赖 sseProxy.js（共享），两者之间无依赖。index.js 依赖 chat.js 和 assistant.js 文件存在。顺序合理。

### 5. 潜在风险识别

| 风险 | 严重度 | 缓解措施 |
|------|--------|----------|
| Dify chat-messages API 格式可能有变 | 低 | 任务中有 mock 降级，不依赖 Dify 可用 |
| 行缓冲处理 chunk 边界问题 | 低 | Task-1.3 给出了明确的行缓冲伪代码 |
| SSE 流式路由中 throw 的 AppError 会被 errorHandler 误处理 | 中 | Task-2.1 明确区分：同步阶段 next(e)，SSE 阶段由 proxyDifySSE 内部处理 |
| 上游 chunk 过大导致内存 | 低 | SSE 按行转发，每行通常 < 数 KB |

#### 需要额外注意的问题：

**SSE 端点的错误处理边界**：`proxyDifySSE` 已经设置了 `res.writeHead`（或隐式通过第一个 write），此时 errorHandler 中间件不能再修改响应头。因此：
- 在调用 `proxyDifySSE` **之前**的所有错误（校验、查库）必须通过 `throw new AppError()` + `next(e)` 交给 errorHandler
- 调用 `proxyDifySSE` **之后**的错误全部由 sseProxy 内部处理

task_v1.md 中 Task-2.1 已注意到这一点（"非 SSE 阶段的同步错误需要 next(e) 处理。SSE 阶段的错误由 proxyDifySSE 内部处理"），设计正确。

### 6. 环境变量检查

| 变量 | 使用位置 | 已有？ |
|------|---------|--------|
| `DIFY_API_BASE_URL` | sseProxy.js | 是 — difyService.js 已使用 |
| `DIFY_ASSISTANT_APP_KEY` | assistant.js | 需新增 |
| `JWT_SECRET` | authMiddleware | 是 |

`DIFY_ASSISTANT_APP_KEY` 为新增环境变量，需提醒运维在部署时设置。Mock 模式下（`DIFY_API_BASE_URL` 未设置）所有接口可正常工作，无需此变量。

### 7. 审查结论

**APPROVED**

计划覆盖了所有 5 个端点 + 1 个服务模块 + 1 个路由挂载修改。与设计文档 §3.2.11-3.2.27 和 §6 批次章节完全对齐。与现有代码风格和工具链一致（better-sqlite3、express、http/https 原生模块、AppError）。任务分解粒度合理，依赖关系明确，每个任务有具体验收标准。

唯一需要实现时注意的点：SSE 端点中 `proxyDifySSE` 调用前后的错误处理边界，task_v1.md 已明确标注。
