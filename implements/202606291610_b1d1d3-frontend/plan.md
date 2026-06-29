# 实现计划

任务描述：B1（Login.vue 注册表单）+ D1（会话历史加载）+ D3（Admin.vue SSE 统一）前端差距补完
项目根目录：C:\Users\DELL\Desktop\qingruanProject2026

---

## R1 NEW B1 — Login.vue 注册表单
任务：在 src/views/Login.vue 新增注册视图（用户名/密码/确认密码 + 校验 + POST /api/auth/register），保留现有登录功能不变
选择理由：完全独立，仅修改 1 个文件，无文件冲突；优先推进隔离任务可降低后续 D1/D3 共享文件时的并发风险
上下文：authStore.login 调用模式（api.post → res.data.data 取 token/role/user）、safeRedirect 开放重定向防护、Tailwind 样式风格（#4A90D9 主色）
