# 测试产出（v1）

## 概述

为 `server/services/sseProxy.js` 的 `proxyDifySSE` 函数编写单元测试，基于行为契约验证第 22 行双 `/v1` 路径拼接修复及函数整体行为。

## 测试文件

`test/backend/sseProxy.spec.js`

## 覆盖范围

| 分类 | 测试数 | 说明 |
|------|--------|------|
| Mock 模式 | 4 | DIFY_API_BASE 未配置时的降级逻辑 |
| SSE 响应头 | 5 | Content-Type、Cache-Control、Connection、X-Accel-Buffering |
| URL 构造（修复验证） | 5 | 路径不再包含双 /v1、hostname/port 正确解析 |
| 请求体构造 | 8 | query、user、response_mode、inputs、conversation_id |
| Authorization 请求头 | 2 | Bearer 令牌、Content-Type |
| SSE 流式透传 | 4 | 数据转发、end 处理、缓冲刷新、跨 chunk 重组 |
| 上游错误响应 | 5 | 4xx/5xx、JSON 解析、默认消息、res.end |
| 上游超时处理 | 3 | UPSTREAM_ERROR、res.end、aborted 守卫 |
| 上游连接错误 | 3 | UPSTREAM_ERROR、res.end、aborted 守卫 |
| 客户端断开 | 1 | upstreamReq.destroy() |
| 防御性守卫 | 4 | writableEnded + aborted 的 data/end 拦截 |
| HTTP 方法 | 1 | POST 方法验证 |
| 请求超时配置 | 1 | 120s 超时验证 |
| 行为不变式 | 2 | user-{id} 格式、无附加字段 |
| **合计** | **47** | |

## 行为契约覆盖

### 正向路径
- Mock 模式：未配置 DIFY_API_BASE 时返回 Mock SSE 消息（message + message_end）
- 正常代理：已配置 DIFY_API_BASE 时向上游发起 POST，将 SSE 流透传至客户端
- URL 修复验证：`/v1/chat-messages`（不再出现 `/v1/v1/`）
- 请求体：`user-{userId}` 格式不变

### 边界条件
- DIFY_API_BASE 尾部斜杠处理
- conversationId 为 undefined/未传入时不含该字段
- userId 为数字或字符串
- 跨 chunk 的行拆分缓冲
- 上游结束时的缓冲区刷新

### 错误路径
- 上游返回 400/500/502 → DIFY_ERROR
- 错误体非 JSON → 默认错误消息
- 上游超时 → UPSTREAM_ERROR
- 上游连接错误 → UPSTREAM_ERROR

### 状态交互
- 客户端断开（close）后不写入 data/end/error
- res.writableEnded 为 true 时守卫拦截
- aborted 标志跨事件处理器一致作用

## 运行方式

```bash
npx vitest run test/backend/sseProxy.spec.js
```

## 运行结果

```
Test Files  1 passed (1)
Tests  47 passed (47)
```
