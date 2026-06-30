# 任务指令（v8）

## 动作
NEW

## 任务描述
修复2个P3后端日志缺失问题：G26（risk.js 正则回退解析增加 console.warn）和 G27（sseProxy.js 超时/错误处理增加 console.error）。

| 问题 | 文件 | 修改位置 | 修改内容 |
|------|------|---------|---------|
| G26 | server/routes/risk.js | parseRiskOutputRegex 函数体内 | JSON.parse 失败后调用正则回退解析时输出 console.warn |
| G27 | server/services/sseProxy.js | upstreamReq timeout/error 回调 | 两个回调各添加 console.error 日志 |

## 选择理由
批次7（13个P3后端问题）的首个任务。G26和G27均为纯日志添加——每个文件+1~2行 console 语句，无跨文件依赖，无运行时行为变更，是整批次中风险最低的破冰任务。两个文件独立，修改不互相影响。

## 任务上下文

### G26 需求（来自 todo.md 第328-333行）
> risk.js 正则回退解析缺少日志记录。`parseRiskOutputRegex` 在 JSON 解析失败后作为回退，但无任何日志记录走了回退路径。运维无法排查 Dify 输出格式问题。在回退解析时增加 `console.warn` 日志。

### G27 需求（来自 todo.md 第335-340行）
> sseProxy.js 超时/错误处理缺少日志。`upstreamReq.on('timeout')` 和 `upstreamReq.on('error')` 回调均未记录日志。Dify SSE 代理超时或连接错误时运维无法定位根因。增加 `console.error` 日志。

## 已有代码上下文

### G26: server/routes/risk.js（第11-29行）

`parseRiskOutputRegex` 是模块级私有函数，在 `callWorkflowBlocking` 返回的 Dify 输出的 `JSON.parse` 失败时作为正则回退解析。当前实现无日志输出：

```js
function parseRiskOutputRegex(text) {
  const extract = (pattern, text) => {
    const m = text.match(pattern);
    return m ? m[1] : undefined;
  };
  // ... 正则提取逻辑 ...
  return { risk_score, risk_level, ... };
}
```

**修改**：在函数体开头添加 `console.warn('[risk] JSON解析失败，使用正则回退解析')` 或在调用方 catch 块中添加。建议在函数入口添加，因为此函数专用于回退场景。

调用位置需确认——搜索 risk.js 中对 `parseRiskOutputRegex` 的调用处（在 `/predict` 路由的 try-catch 中），确认 JSON.parse 失败后走回退的路径。

### G27: server/services/sseProxy.js（第90-98行）

`proxyDifySSE` 函数中两个回调当前无日志：

```js
upstreamReq.on('timeout', () => {
  if (aborted || res.writableEnded) return;
  writeErrorEvent('AI 服务响应超时，请稍后重试', 'UPSTREAM_ERROR');
});

upstreamReq.on('error', () => {
  if (aborted || res.writableEnded) return;
  writeErrorEvent('AI 服务连接失败，请稍后重试', 'UPSTREAM_ERROR');
});
```

**修改**：在两个回调的 `writeErrorEvent` 调用之前各添加一行 `console.error`：
- timeout: `console.error('[sseProxy] 上游请求超时:', upstreamReqOptions.hostname, upstreamReqOptions.path)`
- error: `console.error('[sseProxy] 上游请求错误:', upstreamReqOptions.hostname, upstreamReqOptions.path)`

## 前置依赖
无。G26和G27独立于批次7其他11个问题。

## 排除说明
G6（admin.js 表名白名单校验前置）经确认未在 S5 中修复——`get_table_schema`（admin.js 第421行）仍直接执行 `PRAGMA table_info(${params.table})` 无白名单校验，将在后续轮次处理。
