# 详细设计（v2）

## 概述

实现设计文档 3.1.11 节定义的 `/api/dify/agent/:agent_id` 代理路由。新建 `server/routes/dify.js` 模块（含 `AGENT_KEYS` 常量映射、`proxyAgentSSE` SSE 透传函数、`POST /agent/:agent_id` 路由），修改 `server/routes/assistant.js` 将 `/chat` 路由内部委托至新代理函数，在 `server/routes/index.js` 注册 `/dify` 路由前缀。

核心动机：Agent 类型 Dify 应用的 `user` 参数需传纯数字 `String(userId)`，区别于 `sseProxy.js` 中 Chatbot/Chatflow 类型使用的 `user-{id}` 格式。通过独立的代理函数保留两类格式差异，防止未来对 `sseProxy.js` 的修改意外统一格式。

**范围声明**：本轮（R2）仅处理问题 B（Agent 代理路由）。问题 C（API Key 配置文档化）延后至 R3 处理。

## 文件规划

| 文件路径 | 操作 | 职责 |
|---------|------|------|
| server/routes/dify.js | 新建 | Agent 代理路由模块：定义 `AGENT_KEYS` 常量、实现 `proxyAgentSSE` 函数、注册 `POST /agent/:agent_id` 路由 |
| server/routes/assistant.js | 修改（2 处） | 将 `/chat` 路由从直接调用 `sseProxy` 改为内部委托至 `proxyAgentSSE`；`/advice` 和 `/conversations` 路由不变 |
| server/routes/index.js | 修改（1 行新增） | 在第 28 行 `router.use('/assistant', ...)` 之前插入 `router.use('/dify', require('./dify'))` |
| test/backend/difyAgent.spec.js | 新建 | 4 个分支的单元测试：正常代理、未知 agent_id、空 message、Mock 降级 |

## 类型定义

### AGENT_KEYS（常量映射）

**形态**：普通 Object 常量（CommonJS 模块内定义）
**文件路径**：`server/routes/dify.js`
**职责**：将 URL 路径参数 `:agent_id` 映射到对应的环境变量名，供路由查找 apiKey

**定义**：
```javascript
const AGENT_KEYS = {
  'diabetes-assistant-agent': 'DIFY_ASSISTANT_APP_KEY',
  'admin-manager-agent': 'DIFY_ADMIN_AGENT_KEY'
};
```

**类型关系**：无继承/实现。被 `POST /agent/:agent_id` 路由处理器引用。通过挂载为 Router 的属性（`router.AGENT_KEYS`）暴露给测试访问。

**扩展性**：新增 Agent 类型应用时在此对象追加一条映射记录。

---

### proxyAgentSSE（函数）

**形态**：普通函数（CommonJS 模块内定义，挂载为 Router 的属性 `router.proxyAgentSSE` 供外部调用）
**文件路径**：`server/routes/dify.js`
**职责**：构造 Dify `/chat-messages` 请求，将上游 SSE 事件流逐行透传至客户端。逻辑与 `server/services/sseProxy.js` 的 `proxyDifySSE` 完全一致，唯一差异是请求体中 `user` 字段为纯数字 `String(userId)`（非 `user-{id}` 格式）。

**签名**：
```javascript
function proxyAgentSSE({ apiKey, query, conversationId, userId, res, req })
```

**参数**：

| 参数名 | 类型 | 说明 |
|--------|------|------|
| apiKey | `string` | Dify Agent 应用 API Key（Bearer 令牌） |
| query | `string` | 用户消息文本 |
| conversationId | `string \| undefined` | 可选，续接已有会话 |
| userId | `number \| string` | 当前登录用户 ID（来自 `req.user.user_id`） |
| res | `express.Response` | Express 响应对象，用于写入 SSE 事件流 |
| req | `express.Request` | Express 请求对象，用于监听客户端断开事件 |

**返回值**：无（`void`）。通过 `res` 对象写入 SSE 事件流并最终调用 `res.end()`。

**与 `proxyDifySSE` 的逐行对照**：

| 行号范围 | 内容 | proxyDifySSE (sseProxy.js) | proxyAgentSSE (dify.js) |
|---------|------|--------------------------|------------------------|
| SSE 响应头设置 | `res.setHeader(...)` x4 | 相同 | 相同 |
| `DIFY_API_BASE` 读取 | `process.env.DIFY_API_BASE` | 相同 | 相同 |
| Mock 降级分支 | `if (!baseUrl)` → 返回 Mock SSE | 相同 | 相同 |
| URL 拼接 | `baseUrl.replace(/\/$/, '') + '/chat-messages'` | 相同 | 相同 |
| 请求体 `query` | `query` | 相同 | 相同 |
| **请求体 `user`** | **差异点** | **`` `user-${userId}` ``** | **`String(userId)`** |
| 请求体 `inputs` | `{}` | 相同 | 相同 |
| 请求体 `response_mode` | `'streaming'` | 相同 | 相同 |
| 请求体 `conversation_id` | 条件添加 | 相同 | 相同 |
| URL 解析 + HTTP 选项构造 | `new URL(url)` + `mod.request(...)` | 相同 | 相同 |
| `aborted` 守卫变量 | `let aborted = false` | 相同 | 相同 |
| `writeErrorEvent` 辅助函数 | 含 `writableEnded` 守卫 | 相同 | 相同 |
| 上游响应非 2xx 处理 | 读取错误体 → `writeErrorEvent` | 相同 | 相同 |
| SSE data 透传 | 逐行拆分、含 `aborted \|\| writableEnded` 守卫 | 相同 | 相同 |
| `upstreamRes.on('end')` | 刷新缓冲区 + `res.end()`，含守卫 | 相同 | 相同 |
| `upstreamReq.on('timeout')` | `writeErrorEvent('UPSTREAM_ERROR')`，含守卫 | 相同 | **日志前缀改为 `[dify]`** |
| `upstreamReq.on('error')` | `writeErrorEvent('UPSTREAM_ERROR')`，含守卫 | 相同 | **日志前缀改为 `[dify]`** |
| `req.on('close')` | `aborted = true` + `upstreamReq.destroy()` | 相同 | 相同 |
| 请求发送 | `upstreamReq.write(JSON.stringify(body))` + `.end()` | 相同 | 相同 |

**代码结构（约 115 行）**：完整复制 `sseProxy.js` 的 `proxyDifySSE` 函数体，做两处修改：(1) 将第 26 行（R1 修复后的行号）的 `` `user-${userId}` `` 替换为 `String(userId)`；(2) 将超时和错误日志前缀从 `[sseProxy]` 改为 `[dify]`，以便运维区分 Agent 代理和 Chatbot/Chatflow 代理的日志来源。不提取公共逻辑——刻意保留代码重复以确保两类应用（Agent vs Chatbot/Chatflow）的 user 格式差异不会因未来修改 `sseProxy.js` 而被意外统一。

**公开接口**：函数通过挂载为 Router 的属性（`router.proxyAgentSSE = proxyAgentSSE`）暴露。调用方通过解构 `const { proxyAgentSSE } = require('./dify')` 获取——`require('./dify')` 返回 Router 实例（函数对象），其上挂载 `proxyAgentSSE` 和 `AGENT_KEYS` 属性，解构语法自然生效。此模式与项目现有 13 个路由模块的 `module.exports = router` 约定完全一致，所有 `require('./dify')` 调用处（`index.js`、`assistant.js`、测试文件）无需 `.router` 解引用。

---

### router（Express Router）

**形态**：`express.Router()` 实例
**文件路径**：`server/routes/dify.js`
**职责**：承载 `/api/dify/agent/:agent_id` 路由，同时作为模块的主导出，`proxyAgentSSE` 和 `AGENT_KEYS` 作为其属性挂载。

**导出方式（方案 B —— 与项目现有 13 个路由模块约定一致）**：

```javascript
const router = express.Router();

// ... 函数定义、路由注册 ...

// 将 proxyAgentSSE 和 AGENT_KEYS 挂载为 Router 属性
router.proxyAgentSSE = proxyAgentSSE;
router.AGENT_KEYS = AGENT_KEYS;

// 以 Router 为主导出（保持与 assistant.js:80、chat.js:57、admin.js:493 等一致）
module.exports = router;
```

**选择理由**：项目现有所有 13 个 `server/routes/*.js` 模块均使用 `module.exports = router` 直接导出 Router 实例。若导出 `{ router, proxyAgentSSE, AGENT_KEYS }` 对象，则 `index.js` 中 `router.use('/dify', require('./dify'))` 会将普通 Object 而非 Router 函数传给 Express，导致 `TypeError: fn is not a function`。方案 B 将额外导出挂载为 Router 属性，既保持了注册路由时 `require('./dify')` 直接可用的约定（Router 是函数），又让 `assistant.js` 通过解构 `const { proxyAgentSSE } = require('./dify')` 获取代理函数（JavaScript 函数对象支持属性访问和解构）。

**路由定义**：

| 方法 | 路径 | 中间件 | 处理器 |
|------|------|--------|--------|
| POST | `/agent/:agent_id` | `authMiddleware` | agent_id 查表 → message 校验 → `proxyAgentSSE` |

**路由处理器流程（伪代码）**：

```javascript
router.post('/agent/:agent_id', authMiddleware, (req, res, next) => {
  try {
    // 步骤 1：agent_id 查表
    const envKey = AGENT_KEYS[req.params.agent_id];
    if (!envKey) {
      return res.status(400).json({
        error: { code: 'INVALID_AGENT', message: '未知的 Agent 标识' }
      });
    }
    const apiKey = process.env[envKey];

    // 步骤 2：message 校验
    const { message, conversation_id } = req.body || {};
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(422).json({
        error: { code: 'VALIDATION_ERROR', message: '消息不能为空' }
      });
    }

    // 步骤 3：SSE 代理
    proxyAgentSSE({
      apiKey,
      query: message,
      conversationId: conversation_id,
      userId: req.user.user_id,
      res,
      req
    });
  } catch (e) {
    next(e);
  }
});
```

**关键分支**：

| 条件 | HTTP 状态码 | 错误代码 | 说明 |
|------|-----------|---------|------|
| `AGENT_KEYS[agent_id]` 为 `undefined` | 400 | `INVALID_AGENT` | 传入未知 agent 标识，在调用 `proxyAgentSSE` **之前**返回 |
| `message` 为空/非字符串/纯空白 | 422 | `VALIDATION_ERROR` | 参数校验，在调用 `proxyAgentSSE` **之前**返回 |
| `apiKey` 为 `undefined`（env var 未配置，但 agent_id 已知） | 不拦截 | — | 透传至 `proxyAgentSSE`，由其内部 `Bearer undefined` 请求至 Dify，Dify 返回 401 → proxyAgentSSE 写回 `DIFY_ERROR` |

**注意**：`apiKey` 为 `undefined`（即环境变量未配置但 agent_id 映射存在）的情形不在路由层拦截。理由：(a) 环境变量缺失属于部署配置问题，不属于输入校验范畴；(b) `proxyAgentSSE` 内部的非 2xx 响应处理已覆盖 Dify 401 错误场景，会写回 `{event:'error', code:'DIFY_ERROR'}` 事件；(c) 在路由层额外拦截 `!apiKey` 会增加与 `sseProxy.js` 的偏差，违背"仅差异 user 字段"的设计意图。

**构造方式**：通过 `express.Router()` 创建，添加路由和属性挂载后导出。在 `index.js` 中以 `/dify` 前缀挂载，最终暴露为 `POST /api/dify/agent/:agent_id`。

---

### assistant.js 修改（内部转发）

**形态**：现有 Express Router 模块的部分行修改
**文件路径**：`server/routes/assistant.js`

**修改点 1 — 第 5 行 require 替换**：

当前：
```javascript
const proxyDifySSE = require('../services/sseProxy');
```

修改为：
```javascript
const { proxyAgentSSE } = require('./dify');
```

**修改点 2 — 第 20-27 行函数调用替换**：

当前：
```javascript
    proxyDifySSE({
      apiKey: process.env.DIFY_ASSISTANT_APP_KEY,
      query: message,
      conversationId: conversation_id,
      userId: req.user.user_id,
      res,
      req
    });
```

修改为：
```javascript
    // 注意：此处的 DIFY_ASSISTANT_APP_KEY 必须与 dify.js 中
    // AGENT_KEYS['diabetes-assistant-agent'] 指向同一个环境变量。
    // 若 AGENT_KEYS 的映射值变更（如改为 DIFY_NEW_KEY），
    // 此处硬编码必须同步修改，否则 /chat 和 /agent/diabetes-assistant-agent
    // 将使用不同的 API Key，产生行为分裂。
    proxyAgentSSE({
      apiKey: process.env.DIFY_ASSISTANT_APP_KEY,
      query: message,
      conversationId: conversation_id,
      userId: req.user.user_id,
      res,
      req
    });
```

**不变部分**：

| 行号 | 内容 | 说明 |
|------|------|------|
| 1-4 | `require(...)` 导入（express、getAdapter、authMiddleware、parsePagination/buildPagination） | 不变 |
| 6 | `const { callDifyGetConversations } = require('../services/difyService')` | 不变 |
| 8 | `const router = express.Router()` | 不变 |
| 10-31 | `POST /chat` 路由（message 校验逻辑完全不变） | 仅函数引用名和调用名变更 |
| 33-66 | `GET /advice` 路由 | 完全不变 |
| 68-78 | `GET /conversations` 路由（使用 `callDifyGetConversations`，其 `user-{id}` 格式不变） | 完全不变 |
| 80 | `module.exports = router` | 不变 |

**行为变化**：此前 `POST /api/assistant/chat` 调用 `proxyDifySSE`（发送 `user: 'user-{id}'`），修改后调用 `proxyAgentSSE`（发送 `user: String(userId)`）。`/chat` 端点作为前端唯一入口的地位不变。

---

### index.js 修改（路由注册）

**形态**：现有路由聚合模块的 1 行插入
**文件路径**：`server/routes/index.js`

**修改**：在第 28 行 `router.use('/assistant', require('./assistant'));` 之前插入：

```javascript
router.use('/dify', require('./dify'));
```

**插入后上下文**（第 27-29 行）：
```javascript
router.use('/chat', require('./chat'));
router.use('/dify', require('./dify'));        // ← 新增
router.use('/assistant', require('./assistant'));
router.use('/admin', require('./admin'));
```

**兼容性说明**：`require('./dify')` 返回 Router 实例（函数），符合 Express `router.use([path], fn)` 对第二个参数为函数的要求。因为 `dify.js` 采用方案 B 导出（`module.exports = router`，与项目所有路由模块一致），此处无需 `.router` 解引用。

**选择理由**：插入位置不影响已有序号的稳定性（第 27 行是 `/chat`、第 28 行原是 `/assistant`），将 `/dify` 放在 `/assistant` 之前体现"底层服务路由先于业务入口路由"的逻辑顺序。也可放在 `/assistant` 之后（不影响功能），但放在之前更清晰地表达 `/assistant` 委托至 `/dify` 的依赖关系。

## 错误处理

### 路由层错误

| 场景 | 检测时机 | HTTP 状态码 | 错误代码 | 错误消息 |
|------|---------|-----------|---------|---------|
| agent_id 不在 `AGENT_KEYS` 中 | 步骤 1（在调用 `proxyAgentSSE` 之前） | 400 | `INVALID_AGENT` | "未知的 Agent 标识" |
| message 为空/非字符串/纯空白 | 步骤 2（在调用 `proxyAgentSSE` 之前） | 422 | `VALIDATION_ERROR` | "消息不能为空" |

### 代理函数层错误

`proxyAgentSSE` 内部的错误处理与 `sseProxy.js` 的 `proxyDifySSE` 完全一致：

- **Dify 返回非 2xx**：读取错误体，写入 `{event: 'error', code: 'DIFY_ERROR'}` SSSe 事件
- **上游超时**（120s）：写入 `{event: 'error', code: 'UPSTREAM_ERROR'}` 事件
- **上游连接错误**：写入 `{event: 'error', code: 'UPSTREAM_ERROR'}` 事件
- **客户端断开**：`req.on('close')` 设置 `aborted = true` 并销毁上游请求
- **Mock 降级**（`DIFY_API_BASE` 未配置）：返回 Mock SSE 消息，不发起 HTTP 请求

### 错误传播

- 路由处理器中 `try/catch` 捕获同步异常，通过 `next(e)` 传递给 Express 全局错误处理中间件（`server/middleware/errorHandler.js`）
- `proxyAgentSSE` 内部所有异步错误（超时、连接错误、上游错误响应）均通过 SSE 事件流写回客户端，不抛出异常

## 行为契约

### 前置条件

1. `.env` 中已配置 `DIFY_API_BASE`（必须包含 `/v1` 后缀，与 R1 修复后的约定一致）
2. `.env` 中已配置 `DIFY_ASSISTANT_APP_KEY` 和 `DIFY_ADMIN_AGENT_KEY`（对应 `AGENT_KEYS` 中的环境变量名）
3. 调用方传入有效的 JWT Bearer Token（`authMiddleware` 验证通过，`req.user` 已挂载 `{ user_id, username, role }`）
4. `req.user.user_id` 为数字类型（`auth.js` 中 `jwt.verify` 解码出的 `decoded.id` 即为数字）
5. `res` 对象尚未调用 `end()` 或 `destroy()`

### 后置条件

1. 成功路径：`res` 写入 SSE 事件流（`message`、`message_end`、`agent_message`、`agent_thought` 等事件），最终 `res.end()`
2. 校验失败路径：`res` 返回 JSON 错误响应（`res.status(4xx).json(...)`）
3. 上游错误路径：`res` 通过 SSE 事件流写入 `{event: 'error', ...}` 后 `res.end()`
4. 客户端断开时：上游请求被销毁（`upstreamReq.destroy()`）

### 方法调用顺序（`POST /agent/:agent_id` 路由）

```
authMiddleware 验证 JWT
  → agent_id 查表（AGENT_KEYS[req.params.agent_id]）
    → 未找到 → return 400 INVALID_AGENT
    → 找到 → 获取 apiKey = process.env[envKey]
  → message 校验（非空、类型为 string、trim 后非空）
    → 校验失败 → return 422 VALIDATION_ERROR
    → 校验通过 → proxyAgentSSE({ apiKey, query, conversationId, userId, res, req })
```

### 不变式

- `sseProxy.js` 的 `proxyDifySSE` 函数不修改（`user-{id}` 格式保留，Chatbot/Chatflow 类型应用不受影响）
- `POST /api/chat/doctor/:id` 和 `POST /api/admin/chat` 路由行为不变（继续使用 `proxyDifySSE`）
- `GET /api/assistant/conversations` 路由不变（继续使用 `callDifyGetConversations`，其 `user-{id}` 格式不变）
- `GET /api/assistant/advice` 路由不变
- `.env` 文件中 `DIFY_API_BASE` 无需修改
- `authMiddleware` 中间件不变
- `POST /api/assistant/chat` 保留为前端唯一入口

### 已知风险：chat 与 conversations 的 user 格式不一致

**风险描述**：`POST /api/assistant/chat` 迁移至 `proxyAgentSSE`（发送 `user: String(userId)` 纯数字格式），但 `GET /api/assistant/conversations` 仍使用 `callDifyGetConversations`（`difyService.js:142` 硬编码 `user=user-${userId}` 格式）。两个端点面向同一 Agent 应用（`DIFY_ASSISTANT_APP_KEY`），但对 Dify 平台使用不同的 `user` 标识。

Dify 官方 API 约定 conversations 接口使用 `user` 参数进行会话隔离。若 Dify 平台按 `user` 值分区会话，则通过 chat 创建的会话（`user="1"`）在 conversations 查询时（`user="user-1"`）将匹配不到，导致前端会话列表为空。

**缓解措施**：

1. **验证策略**：实现完成后，需手动或集成测试确认 conversations 能否返回 chat 创建的会话。具体步骤：(a) 通过 `POST /api/assistant/chat` 发起会话；(b) 记录返回的 `conversation_id`；(c) 通过 `GET /api/assistant/conversations` 查询会话列表；(d) 确认步骤 (b) 的 `conversation_id` 出现在列表中。
2. **回退方案**：若不一致导致 conversations 不可用，需创建 Agent 专用的 conversation 查询函数 `callDifyGetAgentConversations`，在 `difyService.js` 中使用纯数字 `user` 值（`?user=${userId}`）替代当前的 `` `user-${userId}` `` 格式。注意不修改现有 `callDifyGetConversations` 以保持 Chatbot/Chatflow 类型的兼容性。
3. **范围声明**：此不一致是已知技术债务。当前轮次（R2）仅修复 Agent 代理路由的 user 格式，conversations 的 user 格式对齐延后至后续轮次处理。`task_v2.md` 第 135-137 行注释已标记此问题。

### 待验证假设

Agent 类型 Dify 应用使用纯数字 `user` 值（`String(userId)`）的假设**未经 Dify 平台实际验证**。`requirement.md` 问题 B 明确标注"{{user}} 透传假设未经 Dify 平台验证"。实现和验证环节需关注：

- 若 Dify 平台实际要求 Agent 类型也使用 `user-{id}` 格式，需将 `proxyAgentSSE` 中 `user` 字段回退为 `` `user-${userId}` ``
- 回退时无需修改 `sseProxy.js`（其 `user-{id}` 格式不变），只需在 `proxyAgentSSE` 中将 `String(userId)` 改为 `` `user-${userId}` ``

### 已知耦合：assistant.js 中 apiKey 硬编码与 AGENT_KEYS 的同步风险

**风险描述**：`assistant.js` 的 `/chat` 路由直接使用 `apiKey: process.env.DIFY_ASSISTANT_APP_KEY`（硬编码环境变量名），而新增的 `POST /agent/diabetes-assistant-agent` 路由通过 `AGENT_KEYS['diabetes-assistant-agent']` → `process.env[envKey]` 间接读取同一个环境变量。两者读取同一配置值但路径不同——若未来有人修改 `AGENT_KEYS` 的映射值（例如将 diabetes-assistant-agent 的 env var 名改为 `DIFY_NEW_KEY`），`/chat` 路由的硬编码不会同步更新，导致两个入口使用不同的 API Key，产生行为分裂。

**缓解措施**：在 `assistant.js` 修改点 2 的代码中添加同步注释（见上文"修改点 2"），明确标注 `DIFY_ASSISTANT_APP_KEY` 必须与 `AGENT_KEYS['diabetes-assistant-agent']` 指向同一个环境变量。此注释在代码层面可见，降低未来维护时的遗漏风险。当前设计将 `/chat` 视为便利入口（简化前端调用），硬编码是其有意设计，不引入额外的运行时查表逻辑以保持代码简洁。

## 依赖关系

### 依赖的已有模块

| 模块 | 用途 |
|------|------|
| `http` (Node.js 内置) | 发起 HTTP 请求至 Dify 上游（`proxyAgentSSE` 内部） |
| `https` (Node.js 内置) | 发起 HTTPS 请求至 Dify 上游（`proxyAgentSSE` 内部） |
| `express` (npm) | 创建 Router 实例、定义路由 |
| `../middleware/auth` | JWT 验证中间件，挂载 `req.user` |
| `process.env.DIFY_API_BASE` | 环境变量，Dify 服务基础 URL |
| `process.env.DIFY_ASSISTANT_APP_KEY` | 环境变量，糖尿病助手 Agent 的 API Key |
| `process.env.DIFY_ADMIN_AGENT_KEY` | 环境变量，管理员 Agent 的 API Key |

### 被依赖方

| 调用方 | 文件 | 使用方式 |
|--------|------|---------|
| `router.use('/dify', ...)` | `server/routes/index.js:28` 前 | 挂载 `dify.js` 导出的 Router，暴露 `POST /api/dify/agent/:agent_id` |
| `POST /api/assistant/chat` | `server/routes/assistant.js:20-27` | 调用 `proxyAgentSSE` 函数（通过解构 `const { proxyAgentSSE } = require('./dify')` 获取），内部委托至 Agent 代理逻辑 |

### 依赖的外部服务

| 服务 | 端点 | 说明 |
|------|------|------|
| Dify 平台 | `{DIFY_API_BASE}/chat-messages` | 实际请求路径为 `/v1/chat-messages`（URL 拼接方式与 R1 修复后的 `sseProxy.js` 一致） |

### 模块导出关系图

```
server/routes/dify.js
  module.exports = router（Express Router 实例，函数）
  ├── router 本身 ──────────→ server/routes/index.js（挂载为 /dify 路由前缀）
  │                            require('./dify') → Router 函数 → router.use('/dify', ...)
  ├── router.proxyAgentSSE ──→ server/routes/assistant.js（POST /chat 内部调用）
  │                            const { proxyAgentSSE } = require('./dify')
  │                            → 解构自 Router 对象属性
  └── router.AGENT_KEYS ────→ test/backend/difyAgent.spec.js（测试断言用）
                               const { AGENT_KEYS } = require('../../server/routes/dify')
                               → 解构自 Router 对象属性

server/routes/assistant.js
  └── 导入 { proxyAgentSSE } from './dify'
       └── 替代原有的 proxyDifySSE from '../services/sseProxy'

server/services/sseProxy.js
  └── 不被本次修改涉及。继续被 chat.js 和 admin.js 使用。
```

## 测试规格

### 测试文件

`test/backend/difyAgent.spec.js`（新建）

### 测试框架与运行方式

与 R1 一致：`npx vitest run test/backend/difyAgent.spec.js`
- 使用 vitest globals（`describe`/`it`/`expect`/`vi`/`beforeEach`/`afterEach` 无需显式导入）
- 后端 CommonJS 文件，非 `.ts`，无 Vue 组件依赖
- 复用 R1 测试的 Mock 模式（`installMocks` / `loadModule` / `makeRes` / `makeReq` / `nextTick` / `setBaseUrl`）

### 测试分支覆盖

| 编号 | 测试场景 | describe 分组 | 预期行为 | 关键验证点 |
|------|---------|-------------|---------|-----------|
| (a) | 已知 agent_id 正常代理 | `POST /agent/:agent_id — 已知 agent_id 正常代理` | SSE 流式透传 | `Content-Type: text/event-stream`、SSE 事件透传、`user` 字段为纯数字 `String(userId)`（非 `user-{id}`）、**两个 agent_id（`diabetes-assistant-agent` 和 `admin-manager-agent`）各自映射到正确的环境变量**（通过 `Authorization` 头中的 Bearer token 值验证） |
| (b) | 未知 agent_id 错误 | `POST /agent/:agent_id — 未知 agent_id 错误响应` | HTTP 400 | 响应体为 JSON（非 SSE）、`error.code: 'INVALID_AGENT'`、明确错误消息、不发起 HTTP 请求 |
| (c) | message 为空/缺失 | `POST /agent/:agent_id — message 校验` | HTTP 422 | 响应体为 JSON（非 SSE）、`error.code: 'VALIDATION_ERROR'`、不发起 HTTP 请求 |
| (d) | Mock 降级模式 | `proxyAgentSSE — Mock 降级` | SSE 流，Mock 消息 | `DIFY_API_BASE` 未配置时返回 Mock SSE（含 `event: message` 和 `event: message_end`）、不发起 HTTP 请求 |
| (e) | 环境变量未配置（agent_id 映射存在） | `proxyAgentSSE — env var 未配置时的错误链` | SSE 事件 `{event:'error', code:'DIFY_ERROR'}` | (1) 路由层不拦截（`apiKey` 为 `undefined` 透传）；(2) `proxyAgentSSE` 向 Dify 发送 `Authorization: Bearer undefined`；(3) Mock `http.request` 返回 401；(4) `writeErrorEvent` 被调用且 SSE 事件包含 `code: 'DIFY_ERROR'`；(5) 响应仍为 SSE 格式（非 JSON），与路由层校验错误（400/422 JSON 响应）区分 |

### 辅助函数复用

从 `test/backend/sseProxy.spec.js` 中可复用的 Mock 辅助函数：

| 函数 | 用途 | 是否需要修改 |
|------|------|------------|
| `makeRes()` | 创建模拟 Express Response，捕获 `write`/`end`/`setHeader` 调用 | 不需修改 |
| `makeReq()` | 创建模拟 Express Request（EventEmitter，监听 `close`） | 不需修改 |
| `nextTick()` | 等待 `setImmediate` 回调执行 | 不需修改 |
| `setBaseUrl(url)` | 设置 `process.env.DIFY_API_BASE` | 不需修改 |
| `installMocks()` | 安装 `http.request` / `https.request` 的 `vi.fn()` mock | 不需修改 |
| `loadModule(path)` | 清除 require 缓存并重新加载指定模块 | 适配：改为加载 `../../server/routes/dify` |

### 测试模块加载策略

`test/backend/difyAgent.spec.js` 需分别测试两个层级：

1. **`proxyAgentSSE` 函数直接测试**（分支 d、以及分支 a 的正详细验证）：清除缓存后 `require('../../server/routes/dify')`，通过解构 `const { proxyAgentSSE } = require(...)` 获取函数（`dify.js` 采用方案 B 导出，`proxyAgentSSE` 挂载为 Router 属性，解构自然生效）。直接调用 `proxyAgentSSE({...})`，验证 Mock 降级、SSE 透传、`user` 字段格式。Mock `http.request` / `https.request` 以控制上游行为。辅助函数（`makeRes`/`makeReq`/`installMocks`/`nextTick`/`setBaseUrl`/`loadModule`）直接从 `sseProxy.spec.js` 模式复用。

2. **路由集成测试**（分支 a 集成、b、c）：采用 **supertest** 方案（已安装于项目 devDependencies）。

**supertest 集成测试实现指南**：

```javascript
const request = require('supertest');
const express = require('express');

// 创建独立的 Express app 实例并挂载 dify 路由器
function createApp() {
  const app = express();
  app.use(express.json());
  // 直接挂载 dify router（不含 /api 前缀，由 index.js 负责）
  // require('./dify') 返回 Router 实例（函数），Express 直接接受
  app.use(require('../../server/routes/dify'));
  // 错误处理中间件：捕获路由处理器中 next(e) 传递的同步异常，
  // 防止测试中未捕获异常导致 supertest 请求挂起直至超时（默认 5s）
  app.use((err, req, res, next) => {
    res.status(500).json({ error: { message: err.message } });
  });
  return app;
}

// 测试用例示例：
it('未知 agent_id 返回 400', async () => {
  const app = createApp();
  const res = await request(app)
    .post('/agent/nonexistent-agent')
    .send({ message: '你好' })
    .expect(400);
  expect(res.body.error.code).toBe('INVALID_AGENT');
});

it('空 message 返回 422', async () => {
  const app = createApp();
  const res = await request(app)
    .post('/agent/diabetes-assistant-agent')
    .send({ message: '' })
    .expect(422);
  expect(res.body.error.code).toBe('VALIDATION_ERROR');
});
```

**注意**：
- 路由处理器中 `try/catch` 的同步异常通过 `next(e)` 传递给 Express 默认错误处理，在测试 app 中需显式添加 `(err, req, res, next) => res.status(500).json({ error: { message: err.message } })` 错误处理中间件以防超时。`createApp()` 示例代码中已包含此中间件。
- `vi.mock('../../server/middleware/auth', ...)` 必须在 `require('../../server/routes/dify')` 之前调用，否则 `dify.js` 加载时会缓存原始的 `auth.js`。Vitest 的 `vi.mock` 调用会被提升（hoisted），自动先于所有 `require` 执行，因此顺序自然正确。
- 跨 describe 块的 mock req/res 对象（`mockReq`/`mockRes`）需在 `beforeEach` 中调用 `removeAllListeners()` 重置（参见 `sseProxy.spec.js` 第 24-26 行）。

### 测试文件结构（概要）

```javascript
// test/backend/difyAgent.spec.js

// ── Mock authMiddleware（绕过 JWT 验证）──
// auth.js 使用 CommonJS module.exports = authMiddleware（直接导出函数），
// vi.mock 工厂返回值直接成为模块的 module.exports，故工厂返回函数本身，
// 无需包装为 { default: fn }。
vi.mock('../../server/middleware/auth', () => (req, res, next) => {
  req.user = { user_id: 1, username: 'test', role: 'user' };
  next();
});

// ── 共享 Mock 对象（http.request / https.request）──
// ... 与 sseProxy.spec.js 相同的 installMocks / makeRes / makeReq / nextTick / setBaseUrl ...

// 加载 dify 模块（方案 B 导出：module.exports = router，
// proxyAgentSSE / AGENT_KEYS 挂载为 router 属性）
function loadDifyModule() {
  const modPath = require.resolve('../../server/routes/dify');
  delete require.cache[modPath];
  return require('../../server/routes/dify');
}

describe('proxyAgentSSE', () => {
  // 分支 (d): Mock 降级模式
  // - DIFY_API_BASE 未配置时返回 Mock SSE
  // - user 字段为 String(userId) 而非 user-{id}
  // - SSE 响应头正确设置
  // - 不发起 HTTP 请求

  // 分支 (a) 子场景: 正常 SSE 代理通路（直接调用 proxyAgentSSE）
  // - URL 拼接正确（/v1/chat-messages，无双 /v1）
  // - user 字段为纯数字 String(userId)
  // - Authorization 头包含 Bearer token
  // - SSE data 透传
  // - 超时/错误/断连处理

  // 分支 (e): 环境变量未配置（agent_id 映射存在但 env var 为 undefined）
  // - 前置条件：process.env.DIFY_ASSISTANT_APP_KEY 设为 undefined，
  //   AGENT_KEYS['diabetes-assistant-agent'] 仍为 'DIFY_ASSISTANT_APP_KEY'
  // - Mock http.request 返回 401（statusCode: 401），响应体含 {"message":"Invalid token"}
  // - 直接调用 proxyAgentSSE({ apiKey: undefined, ... })
  // - 验证：(1) HTTP 请求仍发起到 upstreamReqOptions.hostname（路由层不中止）；
  //   (2) upstreamReq 的 Authorization 头为 'Bearer undefined'；
  //   (3) res.write 最终被调用且写入的 SSE data 解析后含 event:'error' 和 code:'DIFY_ERROR'；
  //   (4) res.end 被调用
  // - 此测试属 proxyAgentSSE 函数直接测试层级（非 supertest 集成），
  //   因需通过 Mock http.request 精确控制上游返回 401
  // - 测试位置：放在 describe('proxyAgentSSE') 块中，与其他函数直接测试一起
  // - 复用 installMocks() 安装的 http.request mock，在 it 用例内通过
  //   mockReqCallback 控制上游响应（statusCode: 401 + error body）
});

describe('POST /agent/:agent_id', () => {
  // 分支 (a) 集成: agent_id 查表 → 路由处理器调用 proxyAgentSSE
  //   子场景 (a1): diabetes-assistant-agent → 映射到 DIFY_ASSISTANT_APP_KEY
  //   子场景 (a2): admin-manager-agent → 映射到 DIFY_ADMIN_AGENT_KEY
  //   （通过检查 Authorization 头中的 Bearer token 值验证映射正确性，
  //     防止两个条目写反的回归问题）
  // 分支 (b): 未知 agent_id → 400 + INVALID_AGENT
  // 分支 (c): 空 message → 422 + VALIDATION_ERROR
});
```

## 修订说明（v2 r1）

| 审查意见 | 修改措施 |
|---------|---------|
| 发现1 [一般]：`vi.mock` 工厂返回 `{ default: fn }` 与 `auth.js` 的 CommonJS `module.exports = authMiddleware` 不兼容，会导致 TypeError。 | 修正 `vi.mock` 工厂函数：从 `() => ({ default: (req, res, next) => { ... } })` 改为 `() => (req, res, next) => { ... }`（直接返回中间件函数）。补充注释说明 `auth.js` 使用 CommonJS 直接导出函数，`vi.mock` 工厂返回值即为 `module.exports`。 |
| 发现2 [一般]：`POST /chat` 与 `GET /conversations` 的 user 格式不一致，存在会话隔离失效风险。 | 新增"已知风险：chat 与 conversations 的 user 格式不一致"小节，包含：(1) 风险描述——chat 使用 `String(userId)` 纯数字，conversations 使用 `user-{id}` 格式；(2) 验证策略——实现后手动确认 conversations 能否查到 chat 创建的会话；(3) 回退方案——若不一致导致 conversations 不可用，创建 Agent 专用查询函数；(4) 范围声明——明确此为已知技术债务，conversations 对齐延后处理。 |
| 发现3 [一般]：路由集成测试方案未定义，supertest 与直接调用二选一未决定，缺少具体实现指引。 | 选定 **supertest** 方案。在"测试模块加载策略"第 2 节中提供：(1) `createApp()` 辅助函数（创建独立 Express app 并挂载 dify router）；(2) 完整测试示例代码（未知 agent_id 400 + 空 message 422）；(3) 3 条注意事项（错误处理中间件、vi.mock 提升顺序、mockReq/mockRes 生命周期重置）。 |
| 发现4 [轻微]：`proxyAgentSSE` 函数体内日志标签照搬 `[sseProxy]`，运维时无法区分日志来源。 | 在逐行对照表中将超时/错误处理行的 `proxyAgentSSE` 列从"相同"改为"日志前缀改为 `[dify]`"。在代码结构描述中增加第 (2) 处修改说明。 |
| 发现5 [轻微]：测试仅覆盖 `AGENT_KEYS` 中的一个映射条目（`diabetes-assistant-agent`），未验证两个条目均正确映射。 | 扩展测试分支 (a)：明确要求验证两个 agent_id 各自映射到正确的环境变量（通过 `Authorization` 头中的 Bearer token 值验证）。在测试分支表的关键验证点列和测试文件结构的对应 describe 块中增加子场景 (a1)(a2) 说明。 |

## 修订说明（v2 r2）

| 审查意见 | 修改措施 |
|---------|---------|
| 发现1 [严重]：`dify.js` 导出 `{ router, proxyAgentSSE, AGENT_KEYS }`（普通 Object），但 `index.js` 和测试 `createApp()` 中 `require('./dify')` 直接作为 Express 中间件挂载（`router.use('/dify', require('./dify'))`），Express 要求第二个参数为函数，传入 Object 导致 `TypeError: fn is not a function`。项目现有 13 个路由模块均使用 `module.exports = router` 直接导出 Router 实例。 | 采用审查者推荐的**方案 B**：将 `dify.js` 的导出方式从 `module.exports = { router, proxyAgentSSE, AGENT_KEYS }` 改为 `module.exports = router`（以 Router 为主导出），同时将 `proxyAgentSSE` 和 `AGENT_KEYS` 作为 Router 的属性挂载（`router.proxyAgentSSE = proxyAgentSSE; router.AGENT_KEYS = AGENT_KEYS`）。此方案：(a) 保持与项目所有路由模块的导出约定一致；(b) `index.js` 的 `require('./dify')` 无需修改（Router 是函数）；(c) `assistant.js` 的 `const { proxyAgentSSE } = require('./dify')` 同样有效（JavaScript 函数对象支持属性解构）。更新了所有相关章节：router 类型定义的导出方式描述、proxyAgentSSE 公开接口描述、模块导出关系图、测试模块加载策略（`loadDifyModule` 函数和 `require` 注释）。 |
| 发现2 [轻微]：测试 `createApp()` 示例代码未包含错误处理中间件，与注意事项矛盾——路由处理器中 `try/catch` 的同步异常通过 `next(e)` 传递，若测试 app 无错误处理中间件，supertest 请求将挂起直至超时。 | 在 `createApp()` 示例代码中 `app.use(require(...))` 之后、`return app` 之前添加了 Express 错误处理中间件 `(err, req, res, next) => res.status(500).json({ error: { message: err.message } })`，并更新注意事项第一条为"`createApp()` 示例代码中已包含此中间件"。 |
| 发现3 [轻微]：`assistant.js` 中 `apiKey: process.env.DIFY_ASSISTANT_APP_KEY` 硬编码绕过了 `AGENT_KEYS` 映射，存在配置漂移风险——若 `AGENT_KEYS['diabetes-assistant-agent']` 的环境变量名被修改，`/chat` 路由的硬编码不会同步更新。 | 在 `assistant.js` 修改点 2 的代码中添加同步注释（`// 注意：此处的 DIFY_ASSISTANT_APP_KEY 必须与 dify.js 中 AGENT_KEYS['diabetes-assistant-agent'] 指向同一个环境变量...`）。新增"已知耦合"小节，描述硬编码与 AGENT_KEYS 的同步风险及缓解措施，明确当前设计将此视为便利入口的有意设计，不引入运行时查表逻辑。 |

## 修订说明（v2 r3）

| 审查意见 | 修改措施 |
|---------|---------|
| 发现1 [一般]：`task_v2.md` 第 14 行导出指令 `导出 { router, proxyAgentSSE, AGENT_KEYS }` 与设计文件的方案 B（`module.exports = router` + 属性挂载）矛盾。若实现者遵循任务文件指令，`router.use('/dify', require('./dify'))` 将收到普通 Object 而非 Router 函数，导致 `TypeError`。 | **设计文件无需修改。** 设计文件在 r2 修订中已采用方案 B（第 96-117 行），`module.exports = router` 为主导出，`proxyAgentSSE` 和 `AGENT_KEYS` 作为 Router 属性挂载。此方案与项目现有 13 个路由模块的导出约定一致。问题根源在 `task_v2.md` 未随设计 r2 同步更新，应由任务文件作者修正。 |
| 发现2 [一般]：`task_v2.md` 第 67-73 行错误处理伪代码将环境变量名 `AGENT_KEYS[agent_id]` 赋值给名为 `apiKey` 的变量，缺少 `process.env[envKey]` 查值步骤，导致 `Authorization: Bearer DIFY_ASSISTANT_APP_KEY`（环境变量名作为令牌）。 | **设计文件无需修改。** 设计文件的路由处理器伪代码（第 127-137 行）已使用正确的两步形式：`const envKey = AGENT_KEYS[...]`（环境变量名）→ `if (!envKey) return 400` → `const apiKey = process.env[envKey]`（实际 API Key 值）。变量命名（`envKey` vs `apiKey`）语义清晰，不存在混淆。问题在 `task_v2.md` 的伪代码片段截断了处理流程且变量命名有误导性，应由任务文件作者修正。 |

**r3 审查结论**：本次审查的两条发现均指向 `task_v2.md` 中的表述问题，与 `detail_v2.md` 设计文件无关。设计文件在 r2 修订后已正确体现方案 B 导出方式和正确的环境变量两步查值逻辑。设计文件本版本（v2 r3）内容与前版（v2 r2）一致，仅追加本修订说明段落以记录审查轨迹。

## 修订说明（v2 r4）

| 审查意见 | 修改措施 |
|---------|---------|
| 发现1 [一般]：`task_v2.md` 第 14 行导出指令 `导出 { router, proxyAgentSSE, AGENT_KEYS }` 与设计文件的方案 B（`module.exports = router` + 属性挂载）矛盾。此问题在 r3 审查中已被指出但任务文件截至当前版本仍未修正。 | **设计文件本身无需修改**（方案 B 自 r2 起正确）。已同步修正 `task_v2.md` 第 14 行：将 `导出 { router, proxyAgentSSE, AGENT_KEYS }` 改为与方案 B 一致的完整描述（`module.exports = router`，`proxyAgentSSE` 和 `AGENT_KEYS` 作为 Router 属性挂载，附带项目约定说明）。此修正消除了设计与任务文件之间的导出方式矛盾，实现者按修正后的任务文件操作将产出与设计一致的代码。 |
| 发现2 [轻微]：测试规格未覆盖"agent_id 映射存在但环境变量未配置"的错误串联路径。此路径涉及 4 个串联环节（路由层透传 undefined apiKey → proxyAgentSSE 发送 Bearer undefined → Dify 返回 401 → writeErrorEvent 写回 DIFY_ERROR），无测试覆盖时未来重构可能破坏错误转发链路。 | 在测试规格中新增分支 (e)：**环境变量未配置（agent_id 映射存在但 env var 为 undefined）**。测试属 `proxyAgentSSE` 函数直接测试层级（非 supertest 集成），通过 Mock `http.request` 精确控制上游返回 401。验证点：(1) HTTP 请求仍发起到上游（路由层不中止）；(2) `Authorization` 头为 `Bearer undefined`；(3) `res.write` 写入的 SSE data 含 `event:'error'` 和 `code:'DIFY_ERROR'`；(4) `res.end` 被调用。已在测试分支覆盖表（新增行）、测试文件结构 `describe('proxyAgentSSE')` 块（新增注释段落）中完整描述此测试用例。 |
