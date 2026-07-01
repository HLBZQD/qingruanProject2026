# 测试产出（v2）

## 概述

为 `server/routes/dify.js` 的 `proxyAgentSSE` 函数、`POST /agent/:agent_id` 路由、`AGENT_KEYS` 常量映射编写单元测试，基于详细设计 `detail_v2.md` 的行为契约验证 Agent 代理路由完整行为。同时验证 `assistant.js` 和 `index.js` 的配套修改与设计一致。

## 测试文件

`test/backend/difyAgent.spec.js`

## 实现与设计逐项验证

### 源码一致性检查

| 检查项 | 设计位置 | 实际代码 | 结果 |
|--------|---------|---------|------|
| AGENT_KEYS 双映射 | detail_v2.md:29-33 | dify.js:6-9 | 一致 |
| proxyAgentSSE 签名 | detail_v2.md:49-50 | dify.js:11 | 一致 |
| SSE 响应头 x4 | detail_v2.md:70 | dify.js:12-15 | 一致 |
| Mock 降级分支 | detail_v2.md:72 | dify.js:19-26 | 一致 |
| URL 拼接（去尾斜杠 + /chat-messages） | detail_v2.md:73 | dify.js:29 | 一致 |
| user 字段为 `String(userId)` | detail_v2.md:75 | dify.js:33 | 一致（差异点1） |
| 日志前缀 `[dify]` | detail_v2.md:85-86 | dify.js:100,106 | 一致（差异点2） |
| 请求体其余字段 | detail_v2.md:74,76-78 | dify.js:31-39 | 一致 |
| HTTP 选项构造 | detail_v2.md:79 | dify.js:41-54 | 一致 |
| aborted 守卫 | detail_v2.md:80 | dify.js:56 | 一致 |
| writeErrorEvent（含 writableEnded） | detail_v2.md:81 | dify.js:58-62 | 一致 |
| 非 2xx 处理 | detail_v2.md:82 | dify.js:64-77 | 一致 |
| SSE data 透传（含 aborted/writableEnded 守卫） | detail_v2.md:83 | dify.js:79-88 | 一致 |
| upstreamRes end + 缓冲刷新 | detail_v2.md:84 | dify.js:90-96 | 一致 |
| 超时 → UPSTREAM_ERROR | detail_v2.md:85 | dify.js:99-103 | 一致 |
| 连接错误 → UPSTREAM_ERROR | detail_v2.md:86 | dify.js:105-109 | 一致 |
| 客户端断开 → upstreamReq.destroy() | detail_v2.md:87 | dify.js:111-116 | 一致 |
| 路由处理器：agent_id 查表 → 400 INVALID_AGENT | detail_v2.md:127-131 | dify.js:126-131 | 一致 |
| 路由处理器：message 校验 → 422 VALIDATION_ERROR | detail_v2.md:134-139 | dify.js:134-139 | 一致 |
| 路由处理器：proxyAgentSSE 调用 | detail_v2.md:141-148 | dify.js:141-148 | 一致 |
| apiKey undefined 透传（路由层不拦截） | detail_v2.md:168-170 | dify.js:132（无 !apiKey 守卫）| 一致 |
| 导出方式：module.exports = router + 属性挂载 | detail_v2.md:104-114 | dify.js:154-157 | 一致 |
| assistant.js 第5行 require 替换 | detail_v2.md:183-191 | assistant.js:5 | 一致 |
| assistant.js 函数调用替换 + 同步注释 | detail_v2.md:208-221 | assistant.js:20-32 | 一致 |
| assistant.js /advice 不变 | detail_v2.md:233 | assistant.js:38-71 | 一致 |
| assistant.js /conversations 不变 | detail_v2.md:234 | assistant.js:73-83 | 一致 |
| index.js 第28行插入 | detail_v2.md:247-249 | index.js:28 | 一致 |

### 不变式验证

| 不变式 | 设计要求 | 实际代码 | 结果 |
|--------|---------|---------|------|
| sseProxy.js 不修改 | `user-{id}` 格式保留 | sseProxy.js:26 `` `user-${userId}` `` | 不变 |
| chat.js 继续使用 proxyDifySSE | 不改为 proxyAgentSSE | chat.js:5 `require('../services/sseProxy')` | 不变 |
| admin.js 继续使用 proxyDifySSE | 不改为 proxyAgentSSE | admin.js:11 `require('../services/sseProxy')` | 不变 |
| assistant /conversations 不变 | 继续使用 callDifyGetConversations | assistant.js:75-77 | 不变 |
| /api/assistant/chat 保留为前端入口 | 保留 POST /chat 路由 | assistant.js:10 | 不变 |

## 覆盖范围

| 分类 | 测试数 | 说明 |
|------|--------|------|
| Mock 降级（DIFY_API_BASE 未配置） | 4 | Mock message/message_end 事件、不发起 HTTP、res.end |
| SSE 响应头 | 4 | Content-Type、Cache-Control、Connection、X-Accel-Buffering |
| URL 构造（含双 /v1 回归验证） | 2 | /v1/chat-messages 路径、不出现 /v1/v1 |
| 请求体构造（含 user 字段格式） | 8 | query、user 纯数字、response_mode、inputs、conversation_id |
| Authorization 请求头 | 2 | Bearer 令牌、Content-Type |
| 上游成功响应 — SSE 流式透传 | 2 | data 转发、res.end |
| 上游错误响应（非 2xx） | 1 | 400 → DIFY_ERROR |
| 上游超时处理 | 2 | UPSTREAM_ERROR、res.end |
| 上游连接错误 | 1 | ECONNREFUSED → UPSTREAM_ERROR |
| 客户端断开 | 1 | close → upstreamReq.destroy() |
| env var 未配置的错误链（分支 e） | 5 | 路由层透传、Bearer undefined、401 → DIFY_ERROR、SSE 格式区分 |
| agent_id 到环境变量映射（分支 a） | 3 | 两个 agent_id 各自映射验证、user 纯数字验证 |
| 未知 agent_id 路由校验（分支 b） | 3 | 400 + INVALID_AGENT、错误消息、JSON 格式 |
| message 校验（分支 c） | 5 | 空字符串/缺失/纯空白 → 422、错误消息、JSON 格式 |
| AGENT_KEYS 常量验证 | 3 | 两个映射条目存在、未知返回 undefined |
| 模块导出方式验证 | 4 | Router 函数类型、proxyAgentSSE 属性、AGENT_KEYS 属性、解构 |
| **合计** | **50** | |

## 行为契约覆盖

### 正向路径
- 已知 agent_id（diabetes-assistant-agent / admin-manager-agent）→ SSE 流式代理，user 为纯数字 `String(userId)`
- DIFY_API_BASE 已配置 → 向上游发起 POST，Authorization 头含正确 Bearer token
- DIFY_API_BASE 未配置 → Mock SSE 降级（message + message_end 事件）
- URL 拼接：`/v1/chat-messages`（不出现双 `/v1`）
- 日志前缀 `[dify]` 与 `sseProxy.js` 的 `[sseProxy]` 分离

### 边界条件
- userId 为数字类型 → user 字段为纯数字字符串（如 `"1"`, `"42"`）
- userId 为字符串类型 → user 字段直接透传（如 `"99"`）
- conversationId 传入 → 请求体含 `conversation_id`
- conversationId 未传入 → 请求体不含 `conversation_id`
- inputs 固定为空对象 `{}`
- response_mode 固定为 `"streaming"`

### 错误路径
- 未知 agent_id → 400 + JSON `{error:{code:'INVALID_AGENT',message:'未知的 Agent 标识'}}`，不发起 HTTP 请求
- message 为空/缺失/纯空白 → 422 + JSON `{error:{code:'VALIDATION_ERROR',message:'消息不能为空'}}`，不发起 HTTP 请求
- 上游返回 400 → SSE `{event:'error',code:'DIFY_ERROR'}`
- 上游超时（120s）→ SSE `{event:'error',code:'UPSTREAM_ERROR'}`，日志前缀 `[dify]`
- 上游连接错误 → SSE `{event:'error',code:'UPSTREAM_ERROR'}`，日志前缀 `[dify]`
- env var 未配置（apiKey 为 undefined）→ 路由层透传 → 上游返回 401 → SSE `{event:'error',code:'DIFY_ERROR'}`（非 JSON 响应，与路由层校验错误区分）

### 状态交互
- 客户端断开（close 事件）→ aborted = true → upstreamReq.destroy()
- aborted 或 writableEnded 为 true 时不再写入 data/error 事件

## 与实现报告的偏差

实现报告 `code_v2.md` 声称"50 个测试用例"。实际测试文件包含 50 个 `it()` 块，vitest 运行输出确认为 50 tests passed。无偏差。

`code_review_v2_r1.md` 指出的"51 个 it() 块"计数偏差源于审查时对子 describe 块中 it() 数量的统计方式差异。vitest 运行时确认为 50 tests，与实现报告一致。

## 已知技术债务（测试已标注，非阻塞）

1. **chat 与 conversations 的 user 格式不一致**：`POST /api/assistant/chat` 使用 `String(userId)` 纯数字，`GET /api/assistant/conversations` 使用 `user-{id}` 格式。测试未覆盖此交互场景，需集成环境手动验证。
2. **Agent 类型 Dify 应用的 user 值假设**：`String(userId)` 纯数字格式未经 Dify 平台实际验证。若 Dify 平台要求 `user-{id}` 格式，需修改 `proxyAgentSSE` 中 `user` 字段。
3. **assistant.js 中 apiKey 硬编码与 AGENT_KEYS 的同步风险**：代码注释已标注，测试未覆盖此耦合的回归场景。

## 运行方式

```bash
npx vitest run test/backend/difyAgent.spec.js
```

## 运行结果

```
Test Files  1 passed (1)
Tests  50 passed (50)
```

## 回归验证

`sseProxy.spec.js` 全部通过，确认 `sseProxy.js` 不受 v2 修改影响：

```
Test Files  1 passed (1)
Tests  47 passed (47)
```
