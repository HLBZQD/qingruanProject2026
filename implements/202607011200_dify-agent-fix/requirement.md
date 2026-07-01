# 需求：修复 Dify Assistant Agent 无法正常调用

## 来源

诊断报告：`diags/202606302257_dify-assistant-agent-bug/diag_v3.md`

## 问题概述

`.env` 中配置了 `DIFY_ASSISTANT_APP_KEY=app-tPGIaTY3opz7ycWL5YqI7B6s`，前端通过 `POST /api/assistant/chat` 调用 AI 智能助手时无法正常工作。

## 待修复问题

### 问题 A（Critical）：双 `/v1` 路径拼接导致 URL 无效

**文件**：`server/services/sseProxy.js:22`

根因：`.env` 中 `DIFY_API_BASE=http://222.241.14.34:56487/v1` 已含 `/v1` 后缀，但 `sseProxy.js:22` 硬编码追加 `/v1/chat-messages`，导致实际请求 URL 为 `/v1/v1/chat-messages`（无效端点）。

影响范围：`sseProxy.js` 被 3 个路由共享（`/api/assistant/chat`、`/api/chat/doctor/:id`、`/api/admin/chat`），均受影响。

修复方向：URL 拼接逻辑需与 `difyService.js:95` 对齐——去掉 `/v1` 前缀后仅追加 `/chat-messages`，或 `.env` 中去掉 `/v1` 后缀由代码统一追加。

### 问题 B（High）：未实现 `/api/dify/agent/:agent_id` 端点

**缺失**：设计文档 3.1.11 节定义的路由 `/api/dify/agent/:agent_id` 不存在。

- `server/routes/dify.js` 文件不存在
- `server/routes/index.js` 中无对应注册
- Assistant agent 实际走 `POST /api/assistant/chat` → `sseProxy.js` → Dify `/v1/chat-messages`

修复方向：
1. 新建 `server/routes/dify.js`，实现 `/api/dify/agent/:agent_id` 端点
2. 在 `server/routes/index.js` 注册新路由
3. Assistant agent 的 `user` 参数传纯数字 userId（与设计文档 5.2.5 节一致）
4. `/api/assistant/chat` 保留为前端入口，内部转发至 `/api/dify/agent/:agent_id`
5. 注意不修改 `sseProxy.js:26` 的 `user-{id}` 格式（避免影响 chat 和 admin 路由）

### 问题 C（High）：API Key 配置冲突

5 个 Key 共享 `app-tPGIaTY3opz7ycWL5YqI7B6s`，但该 Key 在 Dify 平台只能对应一种应用类型（Workflow 或 Agent），无法同时满足 Workflow 类型应用（life-plan-generator、health-article-generator）和 Agent 类型应用（diabetes-assistant-agent、admin-manager-agent）的需求。

修复方向：无法在代码层面修复。诊断报告建议在 Dify 平台创建独立应用并为每个应用分配独立 API Key。代码层面可在 `.env.example` 中添加注释说明每个 Key 的应用类型要求。

## 项目根目录

`C:\Users\DELL\Desktop\qingruanProject2026`

## 约束

- 不修改共享的 `sseProxy.js:26` 的 `user-{id}` 格式
- `/api/assistant/chat` 保留为前端唯一入口
- 修复后 `/api/chat/doctor/:id` 和 `/api/admin/chat` 不受影响
- 问题 B 中 `{{user}}` 透传假设未经 Dify 平台验证，Agent 代理路径传纯数字 user 值
