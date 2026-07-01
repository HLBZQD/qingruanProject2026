# 任务指令（v1）

## 动作
NEW

## 任务描述
修改 `server/services/sseProxy.js` 第 22 行，移除硬编码的 `/v1` 前缀，将 `'/v1/chat-messages'` 改为 `'/chat-messages'`。

当前代码（第 22 行）：
```javascript
const url = baseUrl.replace(/\/$/, '') + '/v1/chat-messages';
```

修改为：
```javascript
const url = baseUrl.replace(/\/$/, '') + '/chat-messages';
```

此修改使 `sseProxy.js` 的 URL 拼接逻辑与同项目中 `difyService.js` 的其他 Dify API 调用保持一致：
- `difyService.js:95`: `baseUrl.replace(/\/$/, '') + '/workflows/run'` — 不含 `/v1`
- `difyService.js:142`: `baseUrl.replace(/\/$/, '') + '/conversations?user=...'` — 不含 `/v1`

## 选择理由
底层依赖优先。此 Bug 为 Critical 级别阻塞性故障——`.env` 中 `DIFY_API_BASE=http://222.241.14.34:56487/v1` 已含 `/v1` 后缀，`sseProxy.js` 再次追加 `/v1/chat-messages` 导致实际请求 URL 为 `/v1/v1/chat-messages`（无效端点），Dify 返回 404。此 Bug 影响 `sseProxy.js` 的全部 3 个调用方：
- `POST /api/assistant/chat`（AI 智能助手）
- `POST /api/chat/doctor/:id`（医生对话）
- `POST /api/admin/chat`（管理员对话）

不修复此 Bug，后续任何 Dify SSE 流式调用均无法到达 Dify 服务，问题 B 和问题 C 的修复也无法验证。

## 任务上下文
- `.env` 第 4 行：`DIFY_API_BASE=http://222.241.14.34:56487/v1`（已含 `/v1` 后缀）
- `sseProxy.js` 第 10 行从环境变量读取 `baseUrl`，第 22 行拼接完整 URL
- `sseProxy.js` 第 34 行使用 `new URL(url)` 解析拼接后的 URL，然后拆分为 `hostname`、`port`、`path` 发起原生 `http.request`
- 修改仅涉及第 22 行一个字面量字符串，不影响其他逻辑（user 格式 `user-{id}` 在第 26 行保持不变）
- 不需要修改 `.env` 文件

## 已有代码上下文

### sseProxy.js 核心逻辑
- 第 10 行：`const baseUrl = process.env.DIFY_API_BASE;` — 读取环境变量
- 第 12-20 行：未配置 `DIFY_API_BASE` 时的 Mock 模式
- 第 22 行：**Bug 所在** — `const url = baseUrl.replace(/\/$/, '') + '/v1/chat-messages';`
- 第 24-32 行：构造请求体（`query`, `user`, `inputs`, `response_mode`, `conversation_id`）
- 第 34-48 行：解析 URL，创建 HTTP/HTTPS 请求选项
- 第 49-115 行：发起上游请求，转发 SSE 事件流至客户端，处理超时/错误/客户端断开

### difyService.js 参考（正确的 URL 拼接模式）
- 第 95 行：`const url = baseUrl.replace(/\/$/, '') + '/workflows/run';` — 不追加 `/v1`
- 第 142 行：`const url = baseUrl.replace(/\/$/, '') + '/conversations?user=user-' + userId;` — 不追加 `/v1`

### 受影响的路由
- `server/routes/assistant.js:20-27` — `POST /api/assistant/chat`，使用 `DIFY_ASSISTANT_APP_KEY`
- `server/routes/chat.js:28-36` — `POST /api/chat/doctor/:id`，使用医生 chat_token
- `server/routes/admin.js:162-170` — `POST /api/admin/chat`，使用 `DIFY_ADMIN_AGENT_KEY`

---

## 修订说明（v1 r1）

| 审查意见 | 修改措施 |
|---------|---------|
| 计划未覆盖全部需求——缺失问题 B（缺失Agent代理路由）和问题 C（API Key配置冲突） | 在 `plan.md` 中新增"整体策略"节，明确列出 3 个问题的依赖关系与轮次规划：R1 修复问题 A（底层阻塞Bug），R2 实现问题 B（Agent代理路由），R3 处理问题 C（配置文档化）。问题 B 依赖问题 A（A不修则SSE均404，B无法验证），问题 C 可独立处理。 |
| 计划缺少整体架构说明——无依赖关系、轮次划分理由、后续预期范围 | 在 `plan.md` 中新增依赖关系表、拆分策略说明（底层依赖优先 + 核心阻塞路径优先）、3 轮轮次规划概述。明确各问题之间的顺序依赖：A → B（验证依赖），C 独立。 |
| 任务描述与实际代码一致，Bug 定位准确（正面反馈） | 无需修改。`task_v1.md` 对 `sseProxy.js:22` 的问题描述、修复方向、修改范围均保持原样。 |
