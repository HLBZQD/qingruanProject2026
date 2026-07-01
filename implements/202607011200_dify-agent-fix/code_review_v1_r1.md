# 代码审查报告（v1 r1）

## 审查结果
REJECTED

## 发现

- **[一般]** `server/services/sseProxy.js` 第 94 行、第 101 行 — 未定义变量 `upstreamUrl` 导致错误处理路径崩溃。

  第 94 行 `console.error('[sseProxy] 上游请求超时:', upstreamUrl)` 和第 101 行 `console.error('[sseProxy] 上游连接错误:', upstreamUrl, err.message)` 引用了未在任何位置声明的变量 `upstreamUrl`。该变量既不是函数参数，也不是模块内局部变量或闭包捕获的外部变量。正确变量应为第 22 行定义的 `url`（即拼接后的完整请求 URL）。

  **影响**：当上游请求超时或发生连接错误时，`console.error` 调用会抛出 `ReferenceError: upstreamUrl is not defined`。该异常发生在事件回调中，`writeErrorEvent` 位于 `console.error` 之后（第 96 行、第 103 行），因此异常将阻止错误事件写入客户端响应，导致 SSE 连接挂起无响应。同时，注释中声明的 G27 日志需求（"记录超时/连接错误日志，便于运维定位"）无法达成——日志语句自身崩溃。

  **说明**：此 Bug 为既存问题，非本轮第 22 行修改引入。但在详细设计文档中被列为"不变部分"且声称"错误处理逻辑全部有效"，与代码实际状态不符。

- **[轻微]** `server/services/sseProxy.js` 第 22 行 — 修改正确，与设计完全一致。

  URL 拼接从 `'/v1/chat-messages'` 改为 `'/chat-messages'`，消除了与 `DIFY_API_BASE` 中已有 `/v1` 后缀的重复。拼接结果与 `difyService.js:95`（`/workflows/run`）和 `difyService.js:142`（`/conversations?...`）的模式一致。3 个调用方（`assistant.js:20`、`chat.js:28`、`admin.js:162`）无需修改，函数签名、请求体构造、SSE 透传逻辑均保持正确。

## 修改要求

### 发现 1（一般）：修复 `upstreamUrl` 未定义

**文件**：`server/services/sseProxy.js`

**位置**：第 94 行和第 101 行

**问题**：`upstreamUrl` 变量未定义，运行时抛出 `ReferenceError`。

**期望修正**：将 `upstreamUrl` 替换为 `url`（第 22 行定义），即：

- 第 94 行：`console.error('[sseProxy] 上游请求超时:', url);`
- 第 101 行：`console.error('[sseProxy] 上游连接错误:', url, err.message);`

（或替换为 `parsedUrl.href`，效果等价。）
