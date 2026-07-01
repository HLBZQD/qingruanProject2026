# 设计审查报告（v2 r4）

## 审查结果
REJECTED

## 发现

### 发现1 [一般]：task_v2.md 导出指令与设计文件方案 B 矛盾，存在实现错误风险

**问题**：`task_v2.md` 第 14 行仍保留 `导出 { router, proxyAgentSSE, AGENT_KEYS }` 指令（导出普通 Object），而设计文件 `detail_v2.md` 第 96–117 行明确采用方案 B —— `module.exports = router` 作为主导出，`proxyAgentSSE` 和 `AGENT_KEYS` 挂载为 Router 属性。此矛盾在 r3 审查中已指出（r3 修订说明发现 1），但 `task_v2.md` 截至当前版本（v2 r1）仍未修正。

**影响**：若实现者遵循任务文件的导出指令，`require('./dify')` 将返回普通 Object 而非 Router 函数。`index.js` 中 `router.use('/dify', require('./dify'))` 会触发 Express 内部类型检查失败，抛出 `TypeError: fn is not a function`，导致应用启动即崩溃。虽为启动时硬错误（非静默失败），但会浪费调试时间并造成混淆。

**为什么是设计层面的问题**：设计文件本身采用方案 B 是正确的（与项目现有 13 个路由模块的 `module.exports = router` 约定一致），但设计与任务文件之间的导出方式矛盾构成了交付物之间的协调缺陷。任务文件是实现者的直接操作手册，其错误指令将导致正确的设计被错误实现。

**期望修正**：`task_v2.md` 第 14 行改为与设计文件方案 B 一致的描述，例如：

> 导出 Router 实例（`module.exports = router`），`proxyAgentSSE` 和 `AGENT_KEYS` 作为 Router 属性挂载（`router.proxyAgentSSE = proxyAgentSSE; router.AGENT_KEYS = AGENT_KEYS`）。

设计文件 `detail_v2.md` 可同步在"修订说明"中追加一条记录，注明任务文件已被要求修正。

---

### 发现2 [轻微]：测试规格未覆盖"agent_id 映射存在但环境变量未配置"的错误串联路径

**问题**：设计文件"关键分支"表（第 164–168 行）记录了 `apiKey` 为 `undefined` 时的行为 —— 不拦截于路由层，透传至 `proxyAgentSSE`，由 Dify 返回 401 后转写 `DIFY_ERROR` SSE 事件。但测试规格（第 413–420 行）的 4 个分支未包含此场景：(a) 仅测正常代理、(b) 测未知 agent_id、(c) 测空 message、(d) 测 Mock 降级。

**影响**：此错误路径涉及 4 个串联环节 —— (1) 路由层将 `undefined` apiKey 传入 `proxyAgentSSE`；(2) `proxyAgentSSE` 向 Dify 发送 `Authorization: Bearer undefined`；(3) Dify 返回 401 非 2xx 响应；(4) `proxyAgentSSE` 内部错误转发逻辑将 401 转为 `{event:'error', code:'DIFY_ERROR'}` SSE 事件。无测试覆盖时，未来对 `proxyAgentSSE` 错误处理逻辑的修改可能在不被察觉的情况下破坏此路径。

**期望修正**：在测试规格中新增分支，设定环境：`AGENT_KEYS` 中存在已知 agent_id 但对应的 `process.env[envKey]` 为 `undefined`。验证：(1) HTTP 请求仍发起至 Dify 上游（路由层不中止）；(2) 上游 Mock 返回 401 时，客户端收到 `{event:'error', code:'DIFY_ERROR'}` SSE 事件（非 JSON 错误响应）。此测试应属 `proxyAgentSSE` 函数直接测试层级（非 supertest 集成），因需通过 Mock `http.request` 控制上游返回 401。

---

## 修改要求

### 对发现1（task_v2.md 导出指令矛盾）

- **修改目标文件**：`task_v2.md` 第 14 行
- **问题本质**：任务文件导出指令与设计文件方案 B 不一致，导致实现者按任务文件操作将产出不可运行的代码
- **修正方向**：将第 14 行从 `导出 { router, proxyAgentSSE, AGENT_KEYS }` 改为与方案 B 一致的描述（`module.exports = router`，属性挂载 `proxyAgentSSE` 和 `AGENT_KEYS`）。`detail_v2.md` 可在修订说明中追加一条记录说明任务文件已被要求同步

### 对发现2（测试覆盖缺口）

- **修改目标文件**：`detail_v2.md` 测试规格章节（第 413–420 行及第 514–537 行）
- **问题本质**：部署配置错误（env var 未设）的降级路径无测试断言，未来重构可能破坏错误转发链路
- **修正方向**：在 `describe('proxyAgentSSE')` 块中新增测试用例，Mock `http.request` 返回 401，验证 `writeErrorEvent` 被调用且 SSE 事件包含 `code: 'DIFY_ERROR'`
