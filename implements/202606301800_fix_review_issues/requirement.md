# 实现需求：批次7 — P3 后端一般问题

## 来源

审议式三轮代码审查报告 `reviews/202606291800_full_review/todo.md`

## 本批次任务（13个一般问题）

### 日志与监控
- **G26**: risk.js — 正则回退解析增加 console.warn
- **G27**: sseProxy.js — 超时/错误处理增加 console.error

### 安全与防御
- **G6**: admin.js — 表名白名单校验前置（可能已在 S5 中修复）
- **G29**: upload.js — filename 回调 req.user 防御性检查
- **G30**: app.js — CORS origin 白名单 + 速率限制
- **G31**: 多条路由 — :id 参数合法整数校验

### 架构与设计合规
- **G2**: server/routes/dify.js — 创建或标注废弃
- **G17**: 创建 useRiskApi.ts composable

### 数据一致性
- **G12**: plan.js — checkIdempotent 移至 callWorkflowBlocking 之前
- **G18**: plan.js — LifePlan 类型添加可选字段
- **G20**: chatStore.ts — readSSEStream AbortSignal 检查
- **G21**: sseProxy.js — data handler writableEnded 检查

### 文档修正
- **G14**: punch.js — 更新 JSDoc 移除"AI"标注

## 项目根目录

C:\Users\DELL\Desktop\qingruanProject2026
