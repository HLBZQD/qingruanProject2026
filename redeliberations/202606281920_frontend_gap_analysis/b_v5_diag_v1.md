# 质量审查报告 v5

## 审查概要

**审查对象**：`a_v5_diag_v1.md`（前端模块实现差距诊断报告 v5）

**审查范围**：由于内部审议已覆盖诊断报告的因果链条、根因定位、依赖关系一致性、人力工期计算、后端 API 验证、优先级排序等维度，本审查侧重以下三个维度：
1. 产出是否充分响应了用户需求
2. 产出中是否存在事实错误或逻辑矛盾
3. 产出的深度和完整性（特别是可操作性）是否满足后续使用需要

**整体评价**：报告逐模块对照设计文档与源代码进行了详尽的差距分析，覆盖了需求中列出的全部 13 个页面组件、7 个复用组件、6 个 Pinia Store、10 个 composable 以及路由/类型/工具层，产出物 1（逐模块差距清单）和产出物 2（并行开发分组）均达到了需求要求。总体质量较高，但存在以下若干影响后续执行可操作性的问题。

---

## 发现的问题

### 问题 1：D3 Admin.vue SSE 迁移任务过度简化，遗漏关键重构步骤

- **问题描述**：§12 D3（第 765 行）将 Admin.vue SSE 统一描述为"仅需切换调用入口并丢弃内联实现"，但经代码验证，chatStore.sendAdminMessage（`chatStore.ts:597-636`）将消息推入 `chatStore.conversations`（Store 级共享 state），而 Admin.vue 当前使用本地 `const messages = ref<ChatMessage[]>([])`（`Admin.vue:22`）渲染消息列表。迁移不仅涉及调用入口切换，还必然涉及：**(a)** Admin.vue 模板中消息数据源从本地 `messages` 切换为 `chatStore.conversations`；**(b)** Admin.vue 本地 `isStreaming` ref 切换为 `chatStore.isStreaming`。此外，`chatStore.conversations` 被 doctor/assistant/admin 三种对话模式共享（chatStore 不按 mode 隔离消息列表），Admin.vue 切换后将在同一列表中看到所有模式的对话历史（混入 doctor/assistant 消息），这是一个非平凡的语义变化。
- **所在位置**：§12 Group D，D3 第 765 行；§11.2 第 673 行（"Admin.vue 仅需切换调用入口"）
- **严重程度**：中
- **改进建议**：
  1. 补充 D3 任务的完整迁移 checklist：切换 `messages` → `chatStore.conversations`、切换 `isStreaming` → `chatStore.isStreaming`、移除本地 SSE 函数、移除本地 sendAdminChatMessage 导入
  2. 评估 chatStore.conversations 多模式共享对 Admin.vue 的影响：Admin 视图是否需过滤非 admin 消息？若需过滤，应补充过滤逻辑说明或讨论 chatStore 是否应按模式维护独立消息列表
  3. 将 D3 工作量从 0.3d 重新评估（当前 0.3d 已含"行为等价性分析 + 冒烟测试"，但未含模板绑定改造）

### 问题 2：C1 文章收藏方案A 未明确跨组件状态共享机制

- **问题描述**：§11.2 第 662 行及 §12 C1 第 754 行推荐方案A——在 useArticleApi.ts 内建 reactive `collectedMap: Ref<Record<number, boolean>>` 实现乐观更新和跨页面状态同步。但 Vue 3 composable 在 `<script setup>` 中调用时默认创建**每组件实例独立状态**（即 ArticleDetailView 和 NewsView 各自持有的 `collectedMap` 是不同引用）。若不明确指定模块级共享状态（export 的 ref 定义在 `export function` 外部），跨页面 `is_collected` 同步将无法工作：用户在某页面收藏文章后，其他已打开的页面不会感知状态变化，即使通过 BroadcastChannel/API 主动刷新也会因各自独立的 `collectedMap` 而无法体现。第 662 行提到"方案A（扩展 useArticleApi 为带 reactive state 的 stateful composable）"使用了"stateful composable"这个术语，但该模式在 Vue 3 社区中有多种实现方式（模块级单例 vs provide/inject），当前描述不足以让执行者选择正确实现。
- **所在位置**：§11.2 第 662 行（C1 方案描述）、§12 C1 第 754 行
- **严重程度**：中
- **改进建议**：明确方案A 的实现模式：
  1. 指定使用**模块级单例**模式（`collectedMap` 定义在 `export function` 外部、模块顶层），确保所有 import 方共享同一引用
  2. 或改用方案B（新建 articleStore），利用 Pinia 天然的全局单例特性
  3. 若保留方案A，补充模块级单例实现的关键代码骨架（如 `const collectedMap = ref<Record<number, boolean>>({})` 置于 composable 函数体外，确认 Pinia 外的模块级 ref 在 Vue 3 中的响应性保障）

### 问题 3：C2 搜索方案前端全量拉取边界条件分析与实际技术约束不匹配

- **问题描述**：§11.3 推荐方案采用"直接调用 `GET /api/articles`（取 pageSize=100），在本地进行标题/标签关键词匹配"。经代码验证，后端 `parsePagination`（`server/utils/pagination.js:9`）已将 `pageSize` 上限钳制为 100（`if (pageSize > 100) pageSize = 100`），即单次 API 调用最多返回 100 条。报告将"适用条件"设为"文章总量 < 200 条"（第 698 行），但当文章量为 150 条时，单次 pageSize=100 的调用将漏掉 50 条文章，搜索结果为不全集。实际安全阈值为 ≤ 100 条（单页全覆盖），100-200 条区间需至少 2 次分页拉取。此外，第 688 行将文章量级预估为"上线初期 < 100 条"，此预估值与后端容量限制刚好相同，但未在"适用条件"中与上限形成显式关联。
- **所在位置**：§11.3 第 690-698 行（搜索方案 API 策略与适用条件）、§12 C2 第 755 行
- **严重程度**：低
- **改进建议**：
  1. 将适用条件修正为：≤ 100 条文章时单页全覆盖；100-200 条时需 2 页分页拉取（pageSize=100, page=1+2）；> 200 条时升级为后端搜索
  2. 在 C2 工作量的 1.0d 估算中明确是否已包含分页拉取逻辑（当前描述"取 pageSize=100"暗示单页，若需 2 页拉取应追加 0.1-0.2d）

### 问题 4：A7 Markdown 渲染统一化未验证 DOMPurify 配置一致性

- **问题描述**：§12 A7（第 734 行）要求将 5 个页面的内联 `marked.parse() + DOMPurify.sanitize()` 替换为 `useMarkdown.ts` 的 `renderMarkdown()` 调用。报告仅提及 `renderMarkdown()` 额外注入链接安全属性（`rel="noopener noreferrer"`），但未验证 `useMarkdown.ts` 使用的 `sanitizeHtml()` 白名单配置（`utils/sanitize.ts` 的 `ALLOWED_TAGS` / `ALLOWED_ATTR` / `FORBID_TAGS` / `FORBID_ATTR`）与各页面内联 DOMPurify 调用的配置是否一致。若白名单存在差异，替换后可能导致：**(a)** 某些标签/属性被意外剥离（内容缺失）；**(b)** 某些被页面额外允许的标签/属性被拒绝（之前正常渲染的内容损坏）。LifePlan.vue 的现有成功案例不足以证明其他 5 个页面的 DOMPurify 配置完全等价。
- **所在位置**：§12 Group A，A7 第 734 行
- **严重程度**：低
- **改进建议**：
  1. 逐页对比 5 个页面内联 DOMPurify 调用与 `sanitizeHtml()` 的配置差异
  2. 在 A7 任务说明中补充配置对比 checklist，或建议替换前在每个页面执行一次冒烟测试（当前已提及冒烟测试但未具体到 DOMPurify 配置验证）
  3. 若发现差异，在任务中列出需同步更新的 sanitize.ts 白名单项

### 问题 5：B1 注册任务 authStore 集成描述不精确，可能导致实现歧义

- **问题描述**：§11.2 第 661 行 B1 行描述为"注册操作仅需存储后端返回的 token/role/user，不涉及 JWT 解析"，但在同一段的方案描述中使用"authStore.login 兼容该响应结构"作为辅助说明。经代码验证，`authStore.login()`（`authStore.ts:131-140`）执行 `const data = res.data.data; setAuth(data.token, data.role, data.user)` 完整登录流程；而注册的正确实现应为：调用 `api.post('/auth/register', ...)` → 提取 `res.data.data` → 调用 `authStore.setAuth(data.token, data.role, data.user)`（不调用 `login()`，因为注册无需提交用户名密码到 `/auth/login`）。两种路径的最终状态（token/role/user 被写入 sessionStorage + BroadcastChannel 广播）相同，但若执行者按字面理解"兼容 login 的响应结构即为可直接调用 login()"会走错误路径。§12 B1 第 744 行已正确描述为"注册成功自动登录（authStore.setAuth）"，与 §11.2 的措辞差异可能造成跨节引用时的混淆。
- **所在位置**：§11.2 第 661 行 vs §12 B1 第 744 行（两处描述一致但"authStore.login 兼容该响应结构"的表述可能产生歧义）
- **严重程度**：低
- **改进建议**：将 §11.2 中"authStore.login 兼容该响应结构"替换为更精确的表述，如"注册响应结构与登录一致（均为 `{token, role, user}`），注册成功后直接调用 `authStore.setAuth()` 完成登录态初始化"，消除"login"一词可能导致的歧义。§12 B1 的描述已经准确，可保留不动。

### 问题 6：并行分组中 B1（注册）与 Phase 1 的时序关系未明确

- **问题描述**：§12 第 847 行将 B1 放在 Phase 2，但 B1 任务说明（第 744 行）明确标注"不依赖 A2/A4/A5"，即不依赖任何 Phase 1（Group A）的产出。从依赖图看，B1 完全可以在 Phase 1 期间并行启动，理论上可将 Phase 2 最长时间路径从 2.4d（人2 路径）缩短（若将 B1 挪至 Phase 1 与人同做，Phase 2 的最长路径将降为 max(1.5, 1.4, 2.0) = 2.0d，总工期从 3.0d 降至 2.6d）。当然，报告将 B1 放在 Phase 2 可能是基于组织清晰度（"Phase 1 = 基础设施，Phase 2 = 功能"），但作为并行开发规划，未提及此优化可能和执行者自行优化的方向。
- **所在位置**：§12 第 847 行（Phase 划分）、第 744 行（B1 依赖声明）
- **严重程度**：低
- **改进建议**：在 §12 调度说明中增加一句：B1 不依赖 Group A，若有人力富余可在 Phase 1 期间并行启动以缩短总工期（工期优化约 0.4d）。具体是否执行由团队根据实际人力情况决定。注意 B1 若提前完成，Login.vue 文件改动需在 Phase 2 其他修改 Login.vue 的任务（如注册功能后续迭代）启动前合并，避免冲突。

---

## 需求响应充分度评价

- **产出物 1（逐模块差距清单）**：覆盖了需求列出的全部 13 个页面组件、7 个复用组件、6 个 Pinia Store（含 3 个设计外扩展）、10 个 composable（含 8 个设计外扩展）、路由、类型、工具层。每个模块列出了设计要求的完整功能点、当前实现状态、具体差距描述。响应充分。
- **产出物 2（并行开发分组）**：提供了基于文件级依赖分析的分组方案（A/B/C/D/E 五组）、分组间依赖链、逐任务工作量估算、人力分配方案、总工期估算。响应充分。
- **约束遵循**：全部差距分析均基于源代码实际内容（有行号引用），非假设性描述。缺失功能、stub/占位实现、设计偏离均已识别。约束满足。

## 深度与完整性评价

- 报告在各模块的功能点级别进行了逐项对比，粒度适中。后端 API 就绪状态经过代码验证（§10.1），为前端开发提供了可靠的前提确认。
- 依赖关系图（§11.1）和待实现功能前置依赖表（§11.2）覆盖全面，为并行分组提供了清晰的架构依据。
- 架构偏离汇总表（§13）给出了每个偏离项的建议决策方向，有助于团队在"对齐设计"与"更新设计"之间选择。
- 除上述问题 1-6 所涉及的可操作性不足外，其余任务描述均已达到"执行者可据此直接开工"的可操作性水平。

