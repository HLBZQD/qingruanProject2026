# 批次 6 实现需求：AI 对话与 SSE 流式代理

## 批次目标
完成 Dify 流式响应代理能力，并实现医师对话和全局 AI 助手对话接口。

## 涉及文件
```
server/services/sseProxy.js
server/routes/chat.js
server/routes/assistant.js
server/services/difyService.js（已有）
```

## 实现内容

### SSE 代理工具 (server/services/sseProxy.js)
- proxyDifySSE({ apiKey, query, conversationId, userId, res })
- Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive
- 原样转发 Dify data: {...} 事件
- Dify 错误时返回 SSE error 事件
- 客户端断开时中止上游请求

### 医师对话 POST /api/chat/doctor/:id
- SSE 流式返回
- 根据医生 ID 查询 chat_token（Dify API key）
- 转发用户消息到 Dify
- 不暴露 chat_token 在前端响应中

### 历史会话 GET /api/chat/doctor/:id/conversations
- 第一版返回空数组

### AI 助手 POST /api/assistant/chat
- SSE 流式返回
- 使用 DIFY_ASSISTANT_APP_KEY

### 健康建议 GET /api/assistant/advice
- 分页查询 life_advice 表
- tags 字段 JSON 解析

### 历史会话 GET /api/assistant/conversations
- 第一版返回空数组

## 项目根目录
/home/derpyIsTheBest/qingruanProject2026

## 详细设计参考
/home/derpyIsTheBest/qingruanProject2026/docs/2_detailed_design_v3.md 第 3.2.11-3.2.12, 3.2.25-3.2.27, 3.3 节
/home/derpyIsTheBest/qingruanProject2026/docs/3_backend_implementation_batches_v2.md 第 6 批次章节
