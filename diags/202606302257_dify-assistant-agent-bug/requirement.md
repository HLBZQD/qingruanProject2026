# 问题描述

## 现象

用户在 `.env` 中配置了正确的 Dify API Key（`DIFY_ASSISTANT_APP_KEY`），但调用 AI 智能助手（assistant agent）时无法正常工作。

## 涉及文件

1. **server/services/sseProxy.js** — SSE 流式代理，负责将前端 assistant/chat 请求转发至 Dify `/v1/chat-messages` 端点
2. **server/services/difyService.js** — Dify API 调用封装，包含 `callWorkflowBlocking()` 和 `callDifyGetConversations()`
3. **server/routes/assistant.js** — AI 助手路由，`POST /api/assistant/chat` 调用 `proxyDifySSE()`
4. **server/routes/chat.js** — 医师对话路由，`POST /api/chat/doctor/:id` 也调用 `proxyDifySSE()`
5. **.env** — 环境变量配置，含 `DIFY_API_BASE=http://222.241.14.34:56487/v1` 和 `DIFY_ASSISTANT_APP_KEY`
6. **docs/2_detailed_design_v4.md** — 详细设计文档 v4，包含 Dify Agent 代理的完整设计规格

## 已知条件

- `.env` 中 `DIFY_API_BASE=http://222.241.14.34:56487/v1`（已包含 `/v1` 后缀）
- `DIFY_ASSISTANT_APP_KEY=app-tPGIaTY3opz7ycWL5YqI7B6s`
- 设计文档 5.2.5 节定义 `diabetes-assistant-agent` 为 **Agent** 类型应用
- 设计文档 5.5.2 节定义了 `proxyAgentRequest()` 函数（位于 difyService.js），用于注入 session_id 映射
- 设计文档 3.1.10 节定义了 `POST /api/dify/agent/:agent_id` 端点，但路由文件 `server/routes/dify.js` **不存在**
- 当前 `difyService.js` 中没有 `proxyAgentRequest()` 函数

## 需要诊断的问题

1. 输入正确的 Dify API Key 后，assistant agent 为什么无法正常调用？
2. 是代码 bug（已实现但有问题）还是功能尚未实现？
3. 如果有多重原因，逐层分析。
