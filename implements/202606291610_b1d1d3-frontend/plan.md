# 实现计划

任务描述：B1（Login.vue 注册表单）+ D1（会话历史加载）+ D3（Admin.vue SSE 统一）前端差距补完
项目根目录：C:\Users\DELL\Desktop\qingruanProject2026

---

## R1 NEW B1 — Login.vue 注册表单
任务：在 src/views/Login.vue 新增注册视图（用户名/密码/确认密码 + 校验 + POST /api/auth/register），保留现有登录功能不变
选择理由：完全独立，仅修改 1 个文件，无文件冲突；优先推进隔离任务可降低后续 D1/D3 共享文件时的并发风险
上下文：authStore.login 调用模式（api.post → res.data.data 取 token/role/user）、safeRedirect 开放重定向防护、Tailwind 样式风格（#4A90D9 主色）

## R1 PASSED B1 — Login.vue 注册表单
结果：Login.vue 新增注册视图（本地 view ref 切换，不走路由），含用户名/密码/确认密码校验、POST /api/auth/register 自动登录、safeRedirect 跳转；登录表单功能完全不变
测试：vue-tsc 0 错误 + vite build 0 编译错误，dist/ 正常产出（389ms）

---

## R2 NEW D1 — 会话历史加载
任务：扩展 useChatApi.ts (2个历史会话 API 函数) + chatStore.ts (历史 state/actions + return 导出) + types/sse.ts (ConversationHistoryItem) + DoctorChatView.vue (历史会话入口按钮 + 弹层列表 UI)
选择理由：D1 无前置依赖，底层 API/Store 优先于 UI；D1 的 chatStore.ts 修改是 D3 的前置——先完成 D1 的 store 增量可避免 D3 回改 chatStore.ts 冲突
上下文：chatStore 已有 getDoctorConversation/setDoctorConversation(Map+localStorage)、fetch+SSE 鉴权模式 (sendChatMessage)、Shared 骨架/空态/错误组件已落地
