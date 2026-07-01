# 实现计划

任务描述：修复 Dify Assistant Agent 无法正常调用的 3 个问题（A: 双/v1路径拼接, B: 缺失Agent代理路由, C: API Key配置冲突）
项目根目录：C:\Users\DELL\Desktop\qingruanProject2026

---

## 整体策略

### 问题概览与依赖关系

| 问题 | 级别 | 文件 | 类型 | 依赖 |
|------|------|------|------|------|
| A: 双/v1路径拼接 | Critical | `server/services/sseProxy.js:22` | Bug修复 | 无 |
| B: 缺失Agent代理路由 | High | `server/routes/dify.js`（新建）+ `server/routes/index.js`（修改） | 新功能 | 依赖A（A不修则SSE调用均404，B无法验证） |
| C: API Key配置冲突 | High | `.env.example`（注释）+ 文档 | 配置/文档 | 无（可独立处理） |

### 拆分策略

**底层依赖优先，核心阻塞路径优先。**

1. **R1 — 问题 A（Critical Bug修复）**：双/v1路径拼接导致所有3个SSE流式端点404。这是底层阻塞性问题，不修复则后续任务均无法验证。修改仅1行，风险极低。
2. **R2 — 问题 B（Agent代理路由）**：新建 `server/routes/dify.js` 实现 `/api/dify/agent/:agent_id` 端点，在 `server/routes/index.js` 注册。`/api/assistant/chat` 保留为前端入口，内部转发至新端点。依赖A完成后才能验证SSE是否正常。
3. **R3 — 问题 C（API Key配置）**：代码层面在 `.env.example` 添加注释说明每个Key的应用类型要求。实际Key创建需在Dify平台操作，不在代码修复范围内。

### 轮次规划

- R1: 修复 `sseProxy.js` 双/v1 Bug → 验证3个SSE端点恢复正常
- R2: 实现 `/api/dify/agent/:agent_id` 代理路由 → 验证Agent类型应用调用路径
- R3: 更新 `.env.example` Key注释 → 标记配置问题已文档化

---

## R1 PASSED 修复sseProxy.js双/v1路径拼接Bug
结果：修改 `server/services/sseProxy.js` 第22行 `'/v1/chat-messages'` → `'/chat-messages'`，同时修复第94/101行 `upstreamUrl`→`url` 和第85行 `end` 事件缺失 `aborted||writableEnded` 守卫。URL 拼接与 `difyService.js` 一致。3个调用方（assistant/chat/admin）不受影响，`user-{id}` 格式不变。
测试：`test/backend/sseProxy.spec.js`，47 passed / 0 failed

## R2 NEW 实现Agent代理路由 /api/dify/agent/:agent_id
任务：新建 `server/routes/dify.js`（含 `proxyAgentSSE` 函数 + `POST /agent/:agent_id` 路由），修改 `server/routes/assistant.js`（内部转发至 `proxyAgentSSE`），修改 `server/routes/index.js`（注册 `/dify` 路由前缀）
选择理由：问题A（双/v1）已修复，SSE 调用通路恢复。问题B是实现设计文档 3.1.11 节定义的 Agent 代理路由——Agent 类型 Dify 应用需要纯数字 `user` 值（区别于 sseProxy 的 `user-{id}` 格式，后者服务于 Chatbot/Chatflow 类型）。`assistant/chat` 保留为前端入口并改为内部委托至新路由逻辑。
上下文：`sseProxy.js` 已修复且不能修改（约束）。Agent 代理需要独立的 SSE 透传函数 `proxyAgentSSE`，与 `proxyDifySSE` 共享相同的 URL 拼接/超时/错误处理模式，仅 `user` 字段格式不同（`String(userId)` vs `\`user-${userId}\``）。`callDifyGetConversations`（`difyService.js:142`）使用 `user-{id}` 格式，本次不修改。

### 错误处理规格（审查补充 v2 r1）
当 `AGENT_KEYS[agent_id]` 为 `undefined`（即传入未知的 agent 标识）时，路由必须在调用 `proxyAgentSSE` 之前返回 HTTP 400 或 404 响应，附带明确的错误消息（如"未知的 Agent 标识"），禁止将 `undefined` apiKey 透传至上游 Dify 导致 `Authorization: Bearer undefined`。

### 测试策略（审查补充 v2 r1）
新建 `test/backend/difyAgent.spec.js`，覆盖以下分支：
- (a) 已知 agent_id 的正常 SSE 代理通路
- (b) 未知 agent_id 的错误响应（HTTP 400/404 + 错误消息）
- (c) message 为空/缺失的校验错误（HTTP 422）
- (d) DIFY_API_BASE 未配置时的 Mock 降级模式

### 待验证假设（审查补充 v2 r1）
Agent 类型 Dify 应用使用纯数字 `user` 值（`String(userId)`）的假设未经 Dify 平台实际验证。requirement.md 问题 B 明确标注"{{user}} 透传假设未经 Dify 平台验证"。实现和验证环节需关注：若 Dify 平台实际行为与假设不符（例如 Agent 类型也要求 `user-{id}` 格式），需回退 `proxyAgentSSE` 中 `user` 字段为 `user-{id}` 格式。

### 轮次说明（审查补充 v2 r1）
plan.md 列出的 R3（API Key 配置文档化）不属于本轮（R2）范围。当前任务仅处理 R2，R3 将在后续轮次单独分配。

---

## R2 PASSED 实现Agent代理路由 /api/dify/agent/:agent_id
结果：新建 server/routes/dify.js（含 AGENT_KEYS 常量映射、proxyAgentSSE 函数、POST /agent/:agent_id 路由，导出方式为 module.exports = router + 属性挂载），修改 server/routes/assistant.js（/chat 路由内部委托至 proxyAgentSSE + 同步注释标注硬编码耦合风险），修改 server/routes/index.js（第28行注册 /dify 路由前缀）。sseProxy.js 不修改（user-{id} 格式保留），chat.js/admin.js 继续使用 proxyDifySSE 不受影响。Agent 代理路径使用纯数字 String(userId) 格式，区别于 Chatbot/Chatflow 类型的 user-{id} 格式。
测试：test/backend/difyAgent.spec.js (60 passed), test/backend/sseProxy.spec.js (47 passed，回归验证通过)

## R3 NEW 更新.env.example API Key注释文档
任务：在 .env.example 中为每个 Dify 相关环境变量添加行内注释，说明应用类型（Workflow/Agent/Service）和具体用途。在文件顶部添加醒目的多行注释块，解释不同 Dify 应用类型（Workflow vs Agent）需要独立 API Key 的原因以及当前 Key 共享现状的风险。
选择理由：问题A（双/v1路径拼接，R1）和问题B（Agent代理路由，R2）已修复并验证通过。问题C（API Key配置冲突）是配置层面的文档化修复——代码无法解决 Key 共享问题（需在 Dify 平台创建独立应用并分配独立 Key），但可通过完善的注释文档降低未来配置错误的风险、让运维人员明确每个 Key 的应用类型要求。R3 仅涉及 .env.example 一个文件的注释修改，无代码逻辑变更，可独立完成。
上下文：diag_v3.md 5.1-5.2 节记录了6个 Dify Key 的应用类型分布：DIFY_RISK_WORKFLOW_KEY（Workflow，独立Key值 app-hYnpvbv3WsrWtnlr3Mnv0vAu）、DIFY_PLAN_WORKFLOW_KEY（Workflow）、DIFY_ARTICLE_WORKFLOW_KEY（Workflow）、DIFY_ASSISTANT_APP_KEY（Agent）、DIFY_ADMIN_AGENT_KEY（Agent）、DIFY_SERVICE_API_KEY（服务端回调校验密钥）。后5个共享 app-tPGIaTY3opz7ycWL5YqI7B6s，但 Workflow 和 Agent 是 Dify 平台上互斥的应用类型，同一 Key 无法同时满足两类应用的需求。requirement.md 问题 C 明确"无法在代码层面修复"，修复方向为"在 .env.example 中添加注释说明每个 Key 的应用类型要求"。
