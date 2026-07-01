# 设计审查报告（v2 r1）

## 审查结果
REJECTED

## 发现

### [一般] 发现1：测试中 authMiddleware 的 vi.mock 返回值模式与 CommonJS 导出不兼容

**位置**：测试规格（第 397-403 行）

**问题**：测试文件设计中使用 `vi.mock('../../server/middleware/auth', () => ({ default: (req, res, next) => { ... } }))` 来 Mock auth 中间件。但 `auth.js` 使用 CommonJS 导出模式 `module.exports = authMiddleware`（直接导出函数），而非 ESM `export default`。

在 Vitest `globals: true` 且无特殊 CJS interop 配置的当前工程中（vitest.config.ts 未配置 `deps.interopDefault`），`vi.mock` 的工厂函数返回值直接成为模块的 `module.exports`。返回 `{ default: fn }` 意味着 `require('../middleware/auth')` 在 `dify.js` 中将获得 `{ default: [Function] }` 对象，而非可调用的中间件函数。Express 调用 `authMiddleware(req, res, next)` 时会对对象执行函数调用，导致 TypeError。

**影响**：所有依赖路由处理器的集成测试（分支 a/b/c）将因中间件调用失败而无法执行，阻塞测试验证环节。

**已验证的代码证据**：
- `server/middleware/auth.js:33` — `module.exports = authMiddleware;`（导出函数本身）
- `vitest.config.ts` — 无 `deps.interopDefault` 或 CJS 特殊处理配置
- 现有 5 个后端测试文件均未使用 `vi.mock` 模式，无历史惯例可参考

**修正方向**：将 Mock 工厂函数改为直接返回中间件函数：

```javascript
vi.mock('../../server/middleware/auth', () => (req, res, next) => {
  req.user = { user_id: 1, username: 'test', role: 'user' };
  next();
})
```

---

### [一般] 发现2：conversations 端点与 chat 端点的 user 格式不一致，存在功能风险

**位置**：设计文档 assistant.js 修改节的"不变部分"表格 + task_v2.md 第 135-137 行注释

**问题**：设计将 `POST /api/assistant/chat` 迁移至 `proxyAgentSSE`（发送 `user: String(userId)` 纯数字格式），但 `GET /api/assistant/conversations` 仍使用 `callDifyGetConversations`（`difyService.js:142` 硬编码 `user=user-${userId}` 格式）。两个端点面向同一 Agent 应用（`DIFY_ASSISTANT_APP_KEY`），但对 Dify 平台使用不同的 `user` 标识。

Dify 官方 API 文档约定 conversations 接口使用 `user` 参数进行会话隔离。若 Dify 平台按 `user` 值分区会话，则通过 chat 创建的会话（user="1"）在 conversations 查询时（user="user-1"）将匹配不到，导致前端会话列表为空。

**影响**：Agent 应用的会话管理功能可能完全失效。即使两个端点的 Dify 调用本身各自成功，用户在前端也看不到历史会话。

**已知状态**：任务文件第 135-137 行注释已标记此不一致，但标记为"不影响本轮任务范围"。设计文档未提出任何缓解方案（如验证策略、回退方案）。

**修正方向**：至少应补充以下内容之一：
- 验证策略：在实现后明确测试 conversations 是否能查到 chat 创建的会话
- 回退方案：若 conversations 不可用，指明需要同步修改 `callDifyGetConversations` 的 user 格式或创建 Agent 专用的 conversation 查询函数
- 范围声明更明确：标注此为已知技术债务及其触发条件

---

### [一般] 发现3：路由集成测试的 req 构造方式未定义，测试方案缺失关键细节

**位置**：测试规格 — "路由集成测试（分支 a/b/c）" 段落（第 392-393 行）

**问题**：设计提出两种测试路由的备选方案——"使用 `supertest` 或直接调用路由处理器"，但二者均未给出具体实现指引：

1. **supertest 路径**：需创建 Express app 实例并挂载 dify router，但设计未说明 app 创建方式、是否复用 `index.js` 的 Router 聚合、supertest 的安装和导入方式。
2. **直接调用路径**：路由处理器签名 `(req, res, next)` 要求 `req` 对象具备 `.params`（含 `agent_id`）、`.body`（含 `message`）、`.user`（含 `user_id`）等属性，且需继承 EventEmitter 以支持 `req.on('close', ...)`。现有 `makeReq()` 仅返回裸 EventEmitter，完全不满足路由处理器对 req 对象的需求。

此外，跨 describe 块共享的 mock req/res 对象需要 `removeAllListeners()` 重置（参见 `sseProxy.spec.js` 第 24-26 行），但路由测试的 req 构造比单纯的 EventEmitter 复杂，设计未描述其生命周期管理。

**影响**：实现者可能花费大量时间在测试基础设施的试错上，或编写出无法正确验证路由行为的测试。

**修正方向**：二选一明确方案：
- **supertest 方案（推荐）**：安装 supertest，创建 app 实例挂载路由器，使用 `request(app).post('/agent/diabetes-assistant-agent').send({...})` 发起测试请求，supertest 自动处理 req/res 构造
- **直接调用方案**：定义 `makeRouteReq(params)` 辅助函数，构造同时具备 Express 属性和 EventEmitter 能力的 req 对象

---

### [轻微] 发现4：proxyAgentSSE 函数体内日志标签不应照搬 [sseProxy]

**位置**：proxyAgentSSE 与 proxyDifySSE 逐行对照表（第 85-86 行，"相同"行）

**问题**：`sseProxy.js` 在 timeout 和 error 处理器中使用 `console.error('[sseProxy] ...')` 作为日志前缀。设计指定 `proxyAgentSSE` 完整复制 `proxyDifySSE` 的函数体（仅改 `user` 字段），但未提及需修改日志标签。若保留 `[sseProxy]` 标签，运维人员看到超时/错误日志时无法区分来源是 Agent 代理还是 Chatbot/Chatflow 代理，增加排查难度。

**影响**：运维时可观测性降低，日志源混淆。

**修正方向**：在逐行对照表中标注超时和错误处理器的日志前缀应改为 `[dify]` 或 `[proxyAgentSSE]`。

---

### [轻微] 发现5：测试仅覆盖 AGENT_KEYS 中的一个映射条目

**位置**：测试规格 — 测试分支表（第 367 行）

**问题**：`AGENT_KEYS` 常量包含两个映射条目：`diabetes-assistant-agent → DIFY_ASSISTANT_APP_KEY` 和 `admin-manager-agent → DIFY_ADMIN_AGENT_KEY`。但测试分支 (a) 仅描述"已知 agent_id 正常代理"，未指定需验证两个条目各自正确映射到对应的环境变量。若实现时两个映射条目写反（例如 `diabetes-assistant-agent` 映射到 `DIFY_ADMIN_AGENT_KEY`），现有测试无法捕获。

`AGENT_KEYS` 作为静态查找表，其正确性完全依赖条目级别的准确性。测试应覆盖所有条目以确保查表逻辑无误。

**修正方向**：测试分支 (a) 扩展为验证两个 agent_id 各自映射到正确的环境变量（如通过检查 HTTP 请求中的 Authorization 头携带的 apiKey 值）。

---

## 修改要求

### 针对发现1（一般）
在测试规格中修正 `vi.mock` 的工厂函数返回值，从 `() => ({ default: fn })` 改为 `() => fn`（直接返回中间件函数）。补充说明：由于 `auth.js` 使用 CommonJS `module.exports = fn` 导出，`vi.mock` 工厂返回的对象即为模块导出值。

### 针对发现2（一般）
在 assistant.js 修改节或行为契约节中补充：
1. `POST /chat` 与 `GET /conversations` 的 user 格式不一致是一个已知风险
2. 验证策略：实现完成后需人工或集成测试确认 conversations 能否返回 chat 创建的会话
3. 若不一致导致 conversations 不可用，后续需创建 Agent 专用的 conversation 查询函数（使用纯数字 user 值）

### 针对发现3（一般）
在测试规格的"路由集成测试"段落中，明确选定一种方案并提供具体实现步骤：
- 推荐 supertest 方案：列出依赖安装（`npm install -D supertest`）、app 创建方式（`const app = express(); app.use(require('../../server/routes/dify'))`）、请求构造示例
- 或直接调用方案：定义 `makeRouteReq({ params, body, user })` 辅助函数的完整签名和实现概要
