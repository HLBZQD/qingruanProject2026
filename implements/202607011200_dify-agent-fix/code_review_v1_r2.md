# 代码审查报告（v1 r2）

## 审查结果
REJECTED

## 发现

### 发现1 [一般] — server/services/sseProxy.js:84-88

`upstreamRes.on('end', ...)` 处理器未检查 `aborted` 或 `res.writableEnded` 守卫条件，存在向已结束响应写入数据导致进程崩溃的风险。

**触发路径**：

1. 上游 Dify 服务器开始流式返回 SSE 数据，`buffer` 积累不完整的行片段（第 77-78 行：`buffer = lines.pop()`）
2. 上游在 120 秒后仍未完成，超时触发（第 92 行）
3. `writeErrorEvent` 写入错误事件并调用 `res.end()`（第 96 行 → 第 51-55 行），HTTP 响应结束
4. `upstreamReq` 在超时处理器中未被销毁（与客户端断开场景不同，第 106-111 行仅覆盖 `req.on('close')`），上游 TCP 连接仍然存活
5. Dify 服务器后续发送剩余数据并正常关闭连接，`upstreamRes` 触发 `data` 事件（被第 75 行守卫拦截，但 `buffer` 中此前积累的片段未被清空），随后触发 `end` 事件
6. 第 84-88 行的 `end` 处理器无守卫：`buffer.length > 0` 成立 → 对已结束的 `res` 调用 `res.write()` → Node.js 流抛出 `ERR_STREAM_WRITE_AFTER_END` → 无 `error` 监听器 → 未捕获异常 → 进程崩溃

**对比**：同一函数中 `data` 处理器（第 75 行）和 timeout/error 处理器（第 95、102 行）均正确检查了 `aborted || res.writableEnded`，唯独 `end` 处理器缺失此守卫，属于不一致的防御性编程缺陷。

**修复方向**：在第 84 行（`upstreamRes.on('end', () => {` 之后）添加：
```javascript
if (aborted || res.writableEnded) return;
```
与第 75 行、第 95 行、第 102 行的守卫模式保持一致。

**说明**：此缺陷为既存问题（非本轮第 22 行修改引入），设计文档将其所在代码块列为"不变部分"（第 49-115 行）时未发现此隐患。

---

### 正面确认项

以下各项经核查与设计规格一致：

- **第 22 行 URL 拼接**：`'/chat-messages'` 正确去除重复的 `/v1` 前缀，与 `difyService.js:95,142` 的拼接模式一致。给定 `DIFY_API_BASE=http://222.241.14.34:56487/v1`，拼接结果为 `http://222.241.14.34:56487/v1/chat-messages`，对应 Dify 官方 Chat Message API 端点。
- **r1 修订落实**：第 94 行和第 101 行已使用正确的 `url` 变量（原为未定义的 `upstreamUrl`），超时和连接错误日志可正常输出。
- **函数签名不变**：`proxyDifySSE({ apiKey, query, conversationId, userId, res, req })` 与原设计一致。
- **user 格式不变**：第 26 行 `user: 'user-${userId}'` 保持原样，符合需求约束"不修改共享的 sseProxy.js:26 的 user-{id} 格式"。
- **不变部分**：第 10 行（baseUrl 读取）、第 12-20 行（Mock 分支）、第 24-32 行（请求体构造）、第 34-48 行（URL 解析与 HTTP 选项）、第 57-70 行（非 2xx 错误处理）、第 72-89 行（SSE 透传）、第 92-97 行（超时处理）、第 99-104 行（连接错误处理）、第 106-111 行（客户端断开处理）均未发生意外变更。

## 修改要求

### 针对发现1

- **文件**：`server/services/sseProxy.js`
- **位置**：第 84 行，`upstreamRes.on('end', () => {` 回调函数体开头
- **问题**：`end` 事件处理器缺少 `aborted || res.writableEnded` 守卫，超时后上游响应完成时对已结束响应写入数据导致进程崩溃
- **原因**：与同函数内 `data`（第 75 行）、`timeout`（第 95 行）、`error`（第 102 行）处理器不一致；超时路径未销毁上游请求，上游后续 `end` 事件仍可触发
- **期望修正**：在 `end` 回调首行添加 `if (aborted || res.writableEnded) return;`
