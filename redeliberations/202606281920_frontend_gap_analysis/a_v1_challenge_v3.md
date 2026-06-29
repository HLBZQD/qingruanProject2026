# 诊断质询报告（v3）

## 质询结果

LOCATED

## 逐维度审查

### 1. 证据充分性

**[通过]** 核心诊断结论的代码证据均经逐一核实：
- `main.ts` 仅调用 `createPinia()` 无 `pinia-plugin-persistedstate` 注册，`setupAxiosInterceptors()` 未调用，样式导入路径为 `./assets/variables.css` 而非 `./styles/variables.css`——与诊断描述一致
- `authStore.ts` 全程使用 `sessionStorage`（`getItem/setItem/removeItem`）而非 `localStorage`，`BroadcastChannel` 跨标签页同步为实际实现——与诊断描述一致
- `chatStore.ts:716-718` `navigate()` 为 `// v3 留空，v4 实现` 占位——与诊断描述一致
- `Login.vue:76` `<router-link to="/login">立即注册</router-link>` 为自环链接——与诊断描述一致
- `ArticleDetailView.vue:75-78` `toggleCollect()` 为 `console.warn('[ArticleDetailView] 收藏功能待实现 (S5a 占位)')` 占位——与诊断描述一致
- `Profile.vue:108-109` `onEditProfile()` 弹出 "编辑资料功能开发中" Toast——与诊断描述一致
- `Home.vue:82-88` `onSearch()` 弹出 "搜索功能开发中" Toast——与诊断描述一致
- `router/index.ts:118` 仅检查 `!authStore.token` 存在性，无 JWT exp 过期检测——与诊断描述一致
- `router/index.ts:137` 免责声明拒绝后重定向 `/home` 而非 `next(false)`——与诊断描述一致
- `env.d.ts`、`helpers.ts`、`models.ts`、`useAuth.ts`、`useSSE.ts`、`useUI.ts` 文件均不存在——与诊断描述一致
- Markdown 渲染：`LifePlan.vue` 和 `Punch.vue` 使用 `renderMarkdown()`（useMarkdown composable），`DoctorChatView`、`ArticleDetailView`、`HealthAdvice`、`Admin`、`Risk`、`AiChatDialog` 使用内联 `marked.parse() + DOMPurify.sanitize()`——与诊断描述一致
- `Admin.vue:36-78` 自行实现 `parseSSEBuffer`/`readSSEStream`/`dispatchSSEEvent`，与 chatStore 逻辑重复——与诊断描述一致

**[问题-轻微]** §5.2（useAuth.ts）表述"JWT 相关逻辑全部整合在 authStore.ts 中"不够精确：authStore 仅做 Token 的 sessionStorage 读写（`getItem/setItem/removeItem`），并未实现 JWT Payload 解析和 exp 过期检测，实际上这三个功能在代码库中完全缺失。该句后续的三个缺失功能点（JWT 解析、过期检测、独立工具函数）描述正确，不影响整体结论方向。

**[通过]** 设计文档引用均准确：§1.4（main.ts/vite.config/env.d.ts）、§1.5（Pinia Store 接口表）、§1.6（路由表与导航守卫）、§3.1（API 端点清单）、§4.4.2（useSSE composable 设计）的引用与设计文档实际内容一致。

### 2. 逻辑完整性

**[通过]** 从问题现象到根因的因果链完整：
- 路由守卫 JWT 过期检测缺失 → 根因为 `useAuth` composable 未实现 → 仅能检查 token 存在性
- 多个功能占位（收藏/注册/编辑资料/搜索/AI导航）→ 根因为对应 composable 层/API 调用层未实现
- SSE 逻辑分散（chatStore + Admin.vue 重复）→ 根因为 `useSSE` composable 缺失
- Markdown 渲染不一致 → 根因为开发时序（LifePlan.vue 开发较晚，useMarkdown 已存在时被采用；其余页面在 useMarkdown 创建前完成开发）

**[通过]** 诊断正确处理了"实现超出设计"和"偏离设计"的区分：3 个新增 Store（homeStore/lifePlanStore/punchStore）和 6 个新增 composable 被识别为合理扩展而非问题；sessionStorage+BroadcastChannel 替代 localStorage+pinia-plugin-persistedstate 被识别为实现层面的有意选择。

**[通过]** 架构偏离汇总（§13）将每组偏离的设计/实际/影响范围/建议完整列出，逻辑清晰。

**[通知-轻微]** 设计文档 §4.4.2 定义 `useSSE()` 为独立 composable，Admin.vue 和 AiChatDialog.vue 应直接调用 useSSE()（设计文档第 617、626 行）。诊断 §12 D3 建议 Admin.vue 统一走 `chatStore.sendAdminMessage`（经 chatStore 间接触达 useSSE），与设计原意（页面组件直调 useSSE）略有差异。两端介入方式在功能上层等价（chatStore.sendAdminMessage 内部调用 useSSE 即可），不影响实现可行性。如随 A6（useSSE 创建）实施时，可灵活选择 Admin.vue 直调 useSSE 或经 chatStore 间接调用。

**[通过]** 依赖关系分析（§11）自洽：优先级排序与依赖链一致，A 组基础设施补完 → B/C/D 组功能增强 → E 组持久化迁移的顺序合理。

### 3. 覆盖完备性

**[通过]** 任务描述要求的两项产出物均已覆盖：
- 产出物 1（逐模块差距清单）：覆盖全部 13 个页面（§8）、7 个复用组件（§9）、6 个 Store（§4）、10 个 composable（§5）、路由（§6）、类型（§3）、工具（§7）、基础设施（§2），无遗漏模块。
- 产出物 2（并行开发分组）：§12 给出 4 个分组（A/B/C/D）+ 1 个可选分组（E），含模块编号、工作量估计、依赖链、推荐执行顺序和最低人力配置。

**[通过]** 所有已识别的差距项（占位实现/缺失文件/API 未覆盖/架构偏离）均有明确的根因位置（文件路径+行号）和影响页面说明。

**[通过]** §10 API 覆盖率表覆盖设计文档 §3.1 全部 35 个端点（含 3 个 N/A 后端内部端点），覆盖率统计准确（25/32 ≈ 78.1%，7 个未覆盖端点逐项列出），已修正 v1 中的统计误差。

**[通知-轻微]** Markdown 渲染统一化（A7）的诊断范围涵盖 5 个页面组件（DoctorChatView/ArticleDetailView/HealthAdvice/Admin/Risk），但遗漏了同样使用内联 `marked.parse() + DOMPurify.sanitize()` 的 `AiChatDialog.vue`（`AiChatDialog.vue:115-119`）。该组件同为复用组件层，统一化时建议一并纳入。此遗漏不影响差距识别的完整性，仅影响 A7 工作量估计的精确度（当前 0.3d 估计偏乐观，纳入 AiChatDialog.vue 及相应回归测试后合理区间为 0.4d–0.5d）。

**[通过]** 诊断报告末尾含修订记录（§修订说明 v2/v3），完整追溯了此前轮次质询意见的修正，体现迭代闭环。
