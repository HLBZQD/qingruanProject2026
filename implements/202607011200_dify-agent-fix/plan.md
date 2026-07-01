# 实现计划

任务描述：修复 Dify Assistant Agent 无法正常调用的 3 个问题（A: 双/v1路径拼接, B: 缺失Agent代理路由, C: API Key配置冲突）
项目根目录：C:\Users\DELL\Desktop\qingruanProject2026

---

## 整体策略

### 问题概览与依赖关系

| 问题 | 级别 | 文件 | 类型 | 依赖 |
|------|------|------|------|------|
| A: 双/v1路径拼接 | Critical | `server/services/sseProxy.js:22` | Bug修复 | 无 |
| B: 缺失Agent代理路由 | High | `server/routes/dify.js`（新建）+ `server/routes/index.js`（修改） | 新功能 | 依赖A（A不修则SSE调用均404，B无法验证） |
| C: API Key配置冲突 | High | `.env.example`（注释）+ 文档 | 配置/文档 | 无（可独立处理） |

### 拆分策略

**底层依赖优先，核心阻塞路径优先。**

1. **R1 — 问题 A（Critical Bug修复）**：双/v1路径拼接导致所有3个SSE流式端点404。这是底层阻塞性问题，不修复则后续任务均无法验证。修改仅1行，风险极低。
2. **R2 — 问题 B（Agent代理路由）**：新建 `server/routes/dify.js` 实现 `/api/dify/agent/:agent_id` 端点，在 `server/routes/index.js` 注册。`/api/assistant/chat` 保留为前端入口，内部转发至新端点。依赖A完成后才能验证SSE是否正常。
3. **R3 — 问题 C（API Key配置）**：代码层面在 `.env.example` 添加注释说明每个Key的应用类型要求。实际Key创建需在Dify平台操作，不在代码修复范围内。

### 轮次规划

- R1: 修复 `sseProxy.js` 双/v1 Bug → 验证3个SSE端点恢复正常
- R2: 实现 `/api/dify/agent/:agent_id` 代理路由 → 验证Agent类型应用调用路径
- R3: 更新 `.env.example` Key注释 → 标记配置问题已文档化

---

## R1 NEW 修复sseProxy.js双/v1路径拼接Bug
任务：修改 `server/services/sseProxy.js:22`，移除硬编码的 `/v1` 前缀，使 URL 拼接结果与 `difyService.js:95` 一致
选择理由：Critical 阻塞性 Bug，影响所有 3 个 SSE 流式端点（assistant/chat/admin）。底层依赖优先——不修复则所有 SSE 调用均失败，后续任务（R2、R3）无法验证。
上下文：`difyService.js:95` 使用 `'/workflows/run'`（不含 `/v1`），`difyService.js:142` 使用 `'/conversations'`（不含 `/v1`），唯独 `sseProxy.js:22` 使用 `'/v1/chat-messages'`（含 `/v1`）。`.env` 中 `DIFY_API_BASE` 已含 `/v1` 后缀。
