# 测试审查报告（v2 r1）

## 审查结果
REJECTED

## 发现

### 发现1 [一般] — test/backend/difyAgent.spec.js

**缺失 supertest 路由集成测试（分支 a 正常代理成功路径）。**

详细设计 `detail_v2.md` 第 442 行明确要求"路由集成测试（分支 a 集成、b、c）：采用 supertest 方案"。但实际 `difyAgent.spec.js` 的 `describe('POST /agent/:agent_id 路由校验')` 块仅覆盖错误路径：
- 分支 (b)：未知 agent_id → 400（3 个测试）
- 分支 (c)：message 校验 → 422（5 个测试）

**缺失**：分支 (a) 的成功路径集成测试——通过 supertest 发送有效 agent_id + 有效 message，验证路由处理器正确执行 agent_id 查表 → message 校验通过 → 调用 `proxyAgentSSE` 的完整请求生命周期。

当前 `proxyAgentSSE` 函数直接测试（第 546-607 行 `describe('agent_id 到环境变量的映射')` 块）能够验证代理函数本身的行为，但以下路由层的集成逻辑在成功路径上完全未被测试覆盖：
- `req.params.agent_id` 参数提取与 `AGENT_KEYS` 查表的组合
- `process.env[envKey]` 环境变量读取
- `req.body.message` / `req.body.conversation_id` 提取
- `req.user.user_id` 传递至 `proxyAgentSSE` 的 `userId` 参数
- 完整参数的构造与转发

此外，同一 describe 块中第 588 行测试命名为"通过路由集成：diabetes-assistant-agent 消息透传时 user 为纯数字"，但其实际实现是 `difyRouter.proxyAgentSSE({...})` 直接函数调用（第 595 行），并非通过 Express 路由调用。命名与实际行为不一致，容易造成已覆盖路由集成测试的误解。

**影响**：若路由处理器中参数提取或构造逻辑在未来重构中出错，当前测试集将无法捕获——错误路径的 supertest 测试只能验证校验逻辑本身，无法验证校验通过后的参数转发是否正确。

### 发现2 [轻微] — test_v2.md / test/backend/difyAgent.spec.js

**aborted / writableEnded 守卫行为声称已覆盖但实际未验证。**

测试产出文档 `test_v2.md` 第 103-104 行在"行为契约覆盖 > 状态交互"下列出：

> aborted 或 writableEnded 为 true 时不再写入 data/error 事件

暗示该行为已被测试覆盖。但实际 `difyAgent.spec.js` 中无任何测试验证此守卫逻辑：

- 第 463-475 行（客户端断开测试）仅验证 `close` 事件触发后 `mockReq.destroyed === true`，**未**验证 close 之后再发送 data 事件时 `res.write` 不被调用（aborted 守卫）。
- 无测试验证 `res.end()` 后调用 `writeErrorEvent` 时 `res.write` 不被再次调用（writableEnded 守卫）。
- 无测试验证 close 后 timeout/error 事件不触发写入（aborted 守卫在 timeout/error handler 中）。

源码 `dify.js` 中此守卫分布在 5 处（第 59、81、91、101、107 行），是防止向已关闭连接写入数据的关键安全机制。缺少对此类并发竞态场景的测试，未来重构可能无意中移除守卫而不被发现。

### 发现3 [轻微] — test_v2.md

**"不变式验证"与"源码一致性检查"为人工检查，与自动化测试指标混排。**

`test_v2.md` 第 15-54 行的"源码一致性检查"表和"不变式验证"表描述的是对源代码的人工比对结果（如 sseProxy.js 未修改、chat.js 继续使用 proxyDifySSE 等），但文档将它们与自动化测试的覆盖率表格（第 57-74 行）并列呈现，未明确区分哪些是自动化测试覆盖、哪些是人工验证。测试覆盖汇总表声称"合计 50"个测试，但不变式检查并非这 50 个测试的一部分。文档结构可能让读者误以为这些不变式有自动化回归测试保护。

### 发现4 [轻微] — test/backend/difyAgent.spec.js

**路由处理器 try/catch → next(e) 异常传播路径未测试。**

详细设计 `detail_v2.md` 第 283-284 行描述了路由处理器中 `try/catch` 捕获同步异常并通过 `next(e)` 传递给 Express 全局错误处理中间件的错误传播机制。`createApp()` 辅助函数（第 96-117 行）已包含 `(err, req, res, next) => res.status(500).json(...)` 错误处理中间件，但无任何测试触发此路径——没有 supertest 用例构造会导致路由处理器内部抛出同步异常的场景并验证返回 500 响应。虽然此路径为 Express 标准模式且出错概率低，但缺少覆盖意味着错误处理中间件本身未被验证。

## 修改要求

### 对发现1（必须修正）

**文件**：`test/backend/difyAgent.spec.js` 的 `describe('POST /agent/:agent_id 路由校验')` 块

**问题**：缺少 supertest 集成测试覆盖分支 (a) 的成功代理路径。设计文件明确要求路由集成测试覆盖分支 (a)。

**期望修正**：
1. 在 `describe('POST /agent/:agent_id 路由校验')` 块中新增子 describe 块 `describe('已知 agent_id 正常代理')`，使用 supertest 发送有效请求，通过 mock `http.request` 控制上游响应，验证：
   - 路由处理器成功查表（`AGENT_KEYS[agent_id]` 命中）
   - 请求体包含正确的 `user: String(userId)` 字段（非 `user-{id}` 格式）
   - SSE 响应头正确设置（`Content-Type: text/event-stream` 等）
2. 将第 588 行测试的命名从"通过路由集成：…"改为如实反映其实现方式的名称（如"diabetes-assistant-agent 映射后直接调用 proxyAgentSSE 时 user 为纯数字"），或将其重构为真正的 supertest 路由集成测试。

### 对发现2（应当修正）

**文件**：`test/backend/difyAgent.spec.js` 的 `describe('proxyAgentSSE')` 块

**问题**：aborted / writableEnded 守卫行为未验证。

**期望修正**：增加测试用例验证：
- 客户端 close 事件触发后，再通过 `mockRes.emit('data', ...)` 发送上游数据时，`res.write` 不被调用（验证 aborted 守卫在 `upstreamRes.on('data')` 中生效）。
- `res.end()` 被调用后（writableEnded = true），再触发 timeout/error 事件时，`writeErrorEvent` 不执行写入（验证 writableEnded 守卫在 `writeErrorEvent` 函数和 timeout/error handler 中生效）。

同时修正 `test_v2.md` 第 103-104 行——若暂不补充测试，则不应在"行为契约覆盖"中列出未覆盖的行为。

### 对发现3（值得改进）

**文件**：`test_v2.md`

**问题**：人工检查与自动化测试指标混排，未做区分。

**期望修正**：在"源码一致性检查"表和"不变式验证"表之前添加明确说明（如"以下为源码人工比对结果，非自动化测试"），或在测试覆盖汇总表中添加备注列标注哪些覆盖项来源于自动化测试、哪些来源于人工检查。

### 对发现4（值得改进）

**文件**：`test/backend/difyAgent.spec.js` 的 `describe('POST /agent/:agent_id 路由校验')` 块

**问题**：`try/catch → next(e)` 异常传播路径未测试。

**期望修正**：增加一个 supertest 测试用例——通过 mock 手段（如临时替换 `AGENT_KEYS` 为会触发异常的 getter）使路由处理器内部抛出同步异常，验证返回 500 状态码且错误消息被正确传递。若实现成本过高，也可在测试文档中标注为已知未覆盖路径。
