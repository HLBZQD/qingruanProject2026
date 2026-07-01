# 任务指令（v2）

## 动作
NEW

## 任务描述

实现设计文档 3.1.11 节缺失的 `/api/dify/agent/:agent_id` 代理路由，涉及 3 个类型/文件：

1. **新建** `server/routes/dify.js` — Agent 代理路由模块
   - 定义 `AGENT_KEYS` 常量：agent_id 到环境变量的映射（`diabetes-assistant-agent` → `DIFY_ASSISTANT_APP_KEY`，`admin-manager-agent` → `DIFY_ADMIN_AGENT_KEY`）
   - 实现 `proxyAgentSSE` 函数：SSE 流式代理，逻辑与 `sseProxy.js` 的 `proxyDifySSE` 一致，但 `user` 字段为纯数字 `String(userId)`（非 `user-{id}` 格式），适配 Agent 类型 Dify 应用
   - 实现 `POST /agent/:agent_id` 路由：authMiddleware → agent_id 查表（`AGENT_KEYS[req.params.agent_id]`）→ 若 agent_id 未知则返回 HTTP 400/404 + "未知的 Agent 标识" 错误消息 → 校验 message 非空 → 调用 `proxyAgentSSE`
   - 导出 Router 实例（`module.exports = router`），`proxyAgentSSE` 和 `AGENT_KEYS` 作为 Router 属性挂载（`router.proxyAgentSSE = proxyAgentSSE; router.AGENT_KEYS = AGENT_KEYS`）。此模式与项目现有 13 个路由模块的 `module.exports = router` 约定一致，`assistant.js` 通过解构 `const { proxyAgentSSE } = require('./dify')` 获取代理函数（JavaScript 函数对象支持属性解构）

2. **修改** `server/routes/assistant.js` — 内部转发至 agent 代理
   - 将 `const proxyDifySSE = require('../services/sseProxy')` 替换为 `const { proxyAgentSSE } = require('./dify')`
   - `POST /chat` 处理器中将 `proxyDifySSE({...})` 调用替换为 `proxyAgentSSE({...})`，参数不变
   - `/advice` 和 `/conversations` 路由保持不变

3. **修改** `server/routes/index.js` — 注册新路由前缀
   - 在第 28 行 `router.use('/assistant', require('./assistant'));` 之前插入 `router.use('/dify', require('./dify'));`

## 选择理由

问题 A（双/v1 路径拼接，R1）已修复且测试全部通过（47/47），SSE 调用通路已恢复。问题 B 是阻塞性缺失功能——设计文档定义的 `/api/dify/agent/:agent_id` 端点不存在，导致 Agent 类型应用无法通过正确的 user 标识调用。依赖 R1 已解除。

拆分策略：3 个紧密耦合的类型（新路由模块 + 调用方改造 + 路由注册）合并为一个任务——dify.js 是核心产出，assistant.js 是其第一个调用方，index.js 是路由注册。三者必须同步完成才能验证端到端通路。

## 任务上下文

### 需求摘要（来自 requirement.md 问题 B）

- 设计文档 3.1.11 节定义的 `/api/dify/agent/:agent_id` 路由不存在
- `server/routes/dify.js` 文件不存在
- `server/routes/index.js` 中无对应注册
- Assistant agent 实际走 `POST /api/assistant/chat` → `sseProxy.js` → Dify `/v1/chat-messages`
- Agent 类型 Dify 应用的 `user` 参数应传纯数字 userId（与设计文档 5.2.5 节一致）
- `/api/assistant/chat` 保留为前端入口，内部转发至 `/api/dify/agent/:agent_id`
- 不修改 `sseProxy.js:26` 的 `user-{id}` 格式（避免影响 chat 和 admin 路由）

### 约束

- 不修改共享的 `sseProxy.js:26` 的 `user-{id}` 格式
- `/api/assistant/chat` 保留为前端唯一入口
- 修复后 `/api/chat/doctor/:id` 和 `/api/admin/chat` 不受影响

### proxyAgentSSE 与 proxyDifySSE 的差异对照

| 方面 | proxyDifySSE (sseProxy.js) | proxyAgentSSE (dify.js 新增) |
|------|--------------------------|---------------------------|
| `user` 字段 | `` `user-${userId}` `` | `String(userId)` |
| URL 拼接 | `baseUrl + '/chat-messages'` | 相同 |
| SSE 透传逻辑 | data/end/超时/错误/断开处理 | 相同 |
| 错误处理 | DIFY_ERROR / UPSTREAM_ERROR | 相同 |
| Mock 降级 | DIFY_API_BASE 未配置时 | 相同 |
| 调用方 | chat.js、admin.js、~~assistant.js~~ | assistant.js、dify.js 自身路由 |

`proxyAgentSSE` 与 `proxyDifySSE` 的代码结构完全一致（约 100 行），差异仅在第 24-28 行的请求体构造中 `user` 字段的格式。刻意保留代码重复而非提取公共逻辑，以确保两类应用（Agent vs Chatbot/Chatflow）的 user 格式差异不会因未来修改 sseProxy.js 而被意外统一。

### 错误处理规格（审查补充 v2 r1）

`POST /agent/:agent_id` 路由中，当 `AGENT_KEYS[req.params.agent_id]` 为 `undefined` 时（即传入未知的 agent 标识），必须在调用 `proxyAgentSSE` **之前**返回错误响应。禁止将 `undefined` apiKey 透传至上游 Dify 导致 `Authorization: Bearer undefined`。

```javascript
// 伪代码：agent_id 查表 + 错误分支
const apiKey = AGENT_KEYS[req.params.agent_id];
if (!apiKey) {
  return res.status(400).json({
    error: { code: 'INVALID_AGENT', message: '未知的 Agent 标识' }
  });
}
```

### 测试规格（审查补充 v2 r1）

新建 `test/backend/difyAgent.spec.js`，至少覆盖以下 4 个分支：

| 编号 | 测试场景 | 预期行为 | 验证点 |
|------|---------|---------|--------|
| (a) | 已知 agent_id 正常代理 | SSE 流式透传 | Content-Type: text/event-stream、SSE 事件透传、`user` 字段为纯数字 `String(userId)` |
| (b) | 未知 agent_id 错误 | HTTP 400/404 | 响应体含 `error.code: 'INVALID_AGENT'`、明确错误消息 |
| (c) | message 为空/缺失 | HTTP 422 | 响应体含 `error.code: 'VALIDATION_ERROR'` |
| (d) | Mock 降级模式 | SSE 流，Mock 消息 | DIFY_API_BASE 未配置时返回 Mock SSE |

测试框架和运行方式与 R1 一致：`npx vitest run test/backend/difyAgent.spec.js`。

### 待验证假设（审查补充 v2 r1）

Agent 类型 Dify 应用使用纯数字 `user` 值（`String(userId)`）的假设**未经 Dify 平台实际验证**。`requirement.md` 问题 B 明确标注"{{user}} 透传假设未经 Dify 平台验证"。实现和验证环节需关注：若 Dify 平台实际行为与假设不符（例如 Agent 类型也要求 `user-{id}` 格式），需回退 `proxyAgentSSE` 中 `user` 字段为 `user-{id}` 格式。

## 已有代码上下文

### sseProxy.js（已修复，本次不修改）

```javascript
// server/services/sseProxy.js
function proxyDifySSE({ apiKey, query, conversationId, userId, res, req }) {
  // SSE headers ...
  const baseUrl = process.env.DIFY_API_BASE;
  // Mock 降级 ...
  const url = baseUrl.replace(/\/$/, '') + '/chat-messages';  // 第22行已修复，去除 /v1
  const body = {
    query,
    user: `user-${userId}`,   // 第26行：Chatbot/Chatflow 格式，本次不修改
    inputs: {},
    response_mode: 'streaming'
  };
  // ... HTTP 请求、SSE 透传、超时/错误/断开处理（第34-115行）
}
module.exports = proxyDifySSE;
```

### assistant.js（当前状态，待修改）

```javascript
// server/routes/assistant.js
const proxyDifySSE = require('../services/sseProxy');  // ← 替换为 proxyAgentSSE
const { callDifyGetConversations } = require('../services/difyService');

router.post('/chat', authMiddleware, (req, res, next) => {
  // message 校验不变
  proxyDifySSE({                          // ← 替换为 proxyAgentSSE
    apiKey: process.env.DIFY_ASSISTANT_APP_KEY,
    query: message,
    conversationId: conversation_id,
    userId: req.user.user_id,             // 纯数字 ID
    res,
    req
  });
});

router.get('/conversations', authMiddleware, async (req, res, next) => {
  // 保持不变：callDifyGetConversations 使用 user-{id} 格式
  // 注意：改为 proxyAgentSSE（纯数字 user）后，此处的 user 格式与 chat 不一致
  // 但这不影响本轮任务范围，Conversation 查询仍按 Dify 官方 API 格式执行
});
```

### index.js（当前状态，待追加一行）

```javascript
// server/routes/index.js 第28行附近
router.use('/assistant', require('./assistant'));
// ↑ 在此行之前插入: router.use('/dify', require('./dify'));
```

### auth.js 中间件

`authMiddleware` 验证 Bearer JWT，将 `{ user_id, username, role }` 挂载到 `req.user`。`req.user.user_id` 为数字类型。dify.js 的 agent 路由使用此中间件。

### difyService.js（不修改）

- `callDifyGetConversations(apiKey, userId)` 在 `difyService.js:142` 使用 `user-{id}` 格式查询会话列表
- `callWorkflowBlocking(apiKey, inputs, workflowType)` 使用 `user: 'api-user'` 固定值

## 预期产出

| 文件 | 操作 | 核心内容 |
|------|------|---------|
| `server/routes/dify.js` | 新建 | `AGENT_KEYS` 映射 + `proxyAgentSSE` 函数 + `POST /agent/:agent_id` 路由（含未知 agent_id 错误处理） |
| `server/routes/assistant.js` | 修改 | 第5行 require 替换 + 第20-27行函数调用替换 |
| `server/routes/index.js` | 修改 | 新增 `router.use('/dify', require('./dify'))` 一行 |
| `test/backend/difyAgent.spec.js` | 新建 | 4 个分支的单元测试（正常代理、未知 agent、空 message、Mock 降级） |

---

## 修订说明（v2 r1）

| 审查意见 | 修改措施 |
|---------|---------|
| 发现1 [一般]：缺失未知 agent_id 的错误处理规格。计划 R2 和 task_v2.md 均未指定当 `agent_id` 在 `AGENT_KEYS` 中不存在时的错误处理行为，传递 `/api/dify/agent/nonexistent` 将导致 `apiKey` 为 `undefined`，进而向上游 Dify 发送 `Authorization: Bearer undefined` 请求。 | 在 `POST /agent/:agent_id` 路由流程中补充 agent_id 查表失败分支：返回 HTTP 400/404 + "未知的 Agent 标识" 错误消息。在任务描述的"预期产出"表和新增的"错误处理规格"段落中详细描述此逻辑，含伪代码示例。 |
| 发现2 [一般]：缺失新模块的测试规格。R2 产出约 100 行新代码（新建 dify.js 含 SSE 代理函数+路由+常量映射，修改 assistant.js 和 index.js），但计划中无任何测试相关描述。新模块涉及 SSE 流式代理、agent_id 查表、message 校验、mock 降级等多个分支，缺乏测试规格意味着后续验证环节缺少判定基准。 | 新增"测试规格"段落，指定新建 `test/backend/difyAgent.spec.js`，覆盖 4 个分支：(a) 已知 agent_id 正常 SSE 代理通路 (b) 未知 agent_id 错误响应 (c) message 为空/缺失的校验错误 (d) Mock 降级模式。将测试文件加入预期产出表。 |
| 发现3 [轻微]：user 字段格式假设未标记为待验证。计划将"Agent 类型 Dify 应用需要纯数字 user 值"作为确定事实陈述，但 requirement.md 问题 B 明确标注"{{user}} 透传假设未经 Dify 平台验证"。 | 新增"待验证假设"段落，明确标记 Agent 类型使用纯数字 `user` 值的假设未经 Dify 平台实际验证，提醒实现和验证环节关注，若实际行为不符需回退。plan.md 同步补充相同段落。 |
| 发现4 [轻微]：计划全貌覆盖三轮但任务仅覆盖 R2。plan.md 包含 R1（PASSED）、R2（NEW）、R3（配置文档）三轮的概览与状态，但当前 task_v2.md 仅针对 R2，R3 悬而未决的状态可能让读者误解本次需一并处理 R3。 | 在 plan.md R2 段落末尾增加"轮次说明"小节，明确声明 R3（API Key 配置文档化）不属于本轮（R2）范围，将在后续轮次单独分配。task_v2.md 无需额外修改（其标题和内容始终仅针对 R2）。 |
