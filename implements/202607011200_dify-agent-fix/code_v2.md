# 实现报告（v2）

## 概述

实现了设计文档 3.1.11 节定义的 `/api/dify/agent/:agent_id` 代理路由，涉及 3 个源码文件和 1 个测试文件。核心产出是 `server/routes/dify.js`（Agent 代理路由模块，含 `AGENT_KEYS` 常量映射、`proxyAgentSSE` SSE 透传函数、`POST /agent/:agent_id` 路由），以及 `assistant.js` 和 `index.js` 的配套修改。

## 文件变更清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 新建 | server/routes/dify.js | Agent 代理路由模块：定义 AGENT_KEYS 常量、实现 proxyAgentSSE 函数、注册 POST /agent/:agent_id 路由，导出方式为 module.exports = router（proxyAgentSSE 和 AGENT_KEYS 作为 Router 属性挂载） |
| 修改 | server/routes/assistant.js | 第5行 require 替换：proxyDifySSE → proxyAgentSSE（通过解构从 ./dify 获取）；第20-32行函数调用替换：proxyDifySSE → proxyAgentSSE，参数不变，添加同步注释标注 AGENT_KEYS 硬编码耦合风险 |
| 修改 | server/routes/index.js | 第28行插入 router.use('/dify', require('./dify'))，位于 /chat 和 /assistant 之间 |
| 新建 | test/backend/difyAgent.spec.js | 50 个测试用例覆盖 5 个分支：(a) agent_id 到 env var 映射、(b) 未知 agent_id 错误、(c) message 校验、(d) Mock 降级、(e) env var 未配置的错误链，含模块导出方式验证和 AGENT_KEYS 常量验证 |

## 编译验证

未执行编译验证（Node.js 项目无编译步骤）。通过 vitest 执行测试验证：

- `npx vitest run test/backend/difyAgent.spec.js` — 50 tests passed
- `npx vitest run test/backend/sseProxy.spec.js` — 47 tests passed（回归验证，确认 sseProxy.js 不受影响）

## 设计偏差说明

无偏差。所有类型定义、接口签名、行为契约、错误处理均严格按详细设计实现：

- `AGENT_KEYS` 映射：diabetes-assistant-agent → DIFY_ASSISTANT_APP_KEY，admin-manager-agent → DIFY_ADMIN_AGENT_KEY
- `proxyAgentSSE` 函数：逻辑与 sseProxy.js 的 proxyDifySSE 完全一致，差异仅两处：(1) `user: String(userId)` 替代 `user-${userId}`；(2) 日志前缀 `[dify]` 替代 `[sseProxy]`
- `POST /agent/:agent_id` 路由：authMiddleware → agent_id 查表（未知返回 400 INVALID_AGENT）→ message 校验（空返回 422 VALIDATION_ERROR）→ proxyAgentSSE
- 导出方式：`module.exports = router`，proxyAgentSSE 和 AGENT_KEYS 作为 Router 属性挂载，与项目现有 13 个路由模块约定一致
- apiKey 为 undefined（env var 未配置但 agent_id 映射存在）时在路由层不拦截，透传至 proxyAgentSSE 内部处理

## 已知技术债务（设计文件中已标注，非本次实现引入）

1. **chat 与 conversations 的 user 格式不一致**：POST /api/assistant/chat 使用 `String(userId)` 纯数字格式，但 GET /api/assistant/conversations 仍使用 `user-{id}` 格式，可能导致会话列表查询为空。延后至后续轮次处理。
2. **Agent 类型 Dify 应用的 user 值假设**：纯数字 `String(userId)` 格式未经 Dify 平台实际验证。
3. **assistant.js 中 apiKey 硬编码与 AGENT_KEYS 的同步风险**：已在代码中添加注释标注。
