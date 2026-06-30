# 任务指令（v2）

## 动作
NEW

## 任务描述
修复2个P1前端设计合规问题（S1/S2），并更新 todo.md 使其成为可追踪的实现计划：

### 1. S1 — App.vue 删除 localStorage StorageEvent 死代码 (`src/App.vue`)

v16 设计已将 token/role/user 全面迁移至 sessionStorage + BroadcastChannel。`StorageEvent` 仅对 localStorage 变更触发，`handleStorageChange` 监听 `window` 的 `storage` 事件但内部读取 `localStorage.getItem('token')` 和 `localStorage.getItem('role')` — 此 handler 永不会被触发。`authStore.ts:22-28` 已正确实现 BroadcastChannel 跨标签页同步。

**修复步骤**：
- 删除 `handleStorageChange` 函数（第32-43行）
- 删除 `onMounted` 调用块（第49-51行，内含 `addEventListener('storage', ...)`）
- 删除 `onUnmounted` 调用块（第53-55行，内含 `removeEventListener`）
- 将第2行导入从 `import { computed, onMounted, onUnmounted } from 'vue'` 改为 `import { computed } from 'vue'`（`onMounted` 和 `onUnmounted` 随上述删除变为未使用）

### 2. S2 — AiChatDialog.vue 修复4项综合设计合规缺陷 (`src/components/AiChatDialog.vue`)

**2a. 添加设计文档规定的 DOM id**
- 第171行 `<div v-if="!isLoggedIn" class="login-prompt">` 添加 `id="fab-login-prompt"`
- 第182行 `<div v-if="messages.length === 0" class="welcome-area">` 添加 `id="fab-welcome-logged-in"`

**2b. 使用共享 renderMarkdown 替代内联 renderContent()**
- 将第112-121行的 `renderContent()` 函数整体删除
- 将第6行 `import { marked } from 'marked'` 和第7行 `import DOMPurify from 'dompurify'` 删除（markdown 渲染和 XSS 净化均由 `useMarkdown` 提供）
- 新增导入：`import { renderMarkdown } from '@/composables/useMarkdown'`
- 第209行 `v-html="renderContent(msg.content)"` 改为 `v-html="renderMarkdown(msg.content)"`

**2c. 使用共享 useUI 免责声明函数替代内联重复**
- 将第21-47行的三个内联函数 `hasAcceptedDisclaimer()`（21-23）、`showDisclaimer()`（25-37）、`ensureDisclaimer()`（39-47）整体删除
- 新增导入：`import { hasAcceptedDisclaimer, showDisclaimer, setDisclaimerAccepted } from '@/composables/useUI'`
- 重构内联 `ensureDisclaimer()` 逻辑：在 `watch(isOpen, ...)` 第60行附近，原 `ensureDisclaimer()` 内联调用改为直接使用 `hasAcceptedDisclaimer()` + `showDisclaimer()`：
  ```
  const agreed = await ensureDisclaimer()
  ```
  改为：
  ```
  let agreed = hasAcceptedDisclaimer()
  if (!agreed) {
    agreed = await showDisclaimer()
    if (agreed) setDisclaimerAccepted(true)
  }
  ```
  > 注意：`useUI.ts` 导出 `setDisclaimerAccepted(true)`（内部封装 `localStorage.setItem(DISCLAIMER_KEY, 'true')`），使用统一封装避免硬编码 key 字符串散落在调用处。`useUI.ts` 未导出 `ensureDisclaimer`（它是 AiChatDialog 特有的逻辑包装），但导出了 `hasAcceptedDisclaimer()`、`showDisclaimer()` 和 `setDisclaimerAccepted()`。

**2d. 使用共享 formatTime 替代内联版本**
- 将第105-110行的 `formatTime()` 函数整体删除
- 新增导入：`import { formatTime } from '@/utils/helpers'`

### 3. todo.md 更新 — 将 S1/S2 标记为已完成 (`reviews/202606291800_full_review/todo.md`)

将已修复的两个问题在 todo.md 中标记为已完成，使其成为可追踪的实现计划。格式与 v1 先例保持一致。

**修复步骤**：
- **S1 条目**（todo.md 第17行末尾，`### S1. ...` 段落末）：在建议修复行后追加一行：
  ```
  - **已修复**: 2026-06-30, 批次 v2 (P1 设计合规修复), 删除 handleStorageChange + storage 事件监听器（v16 迁移残留死代码清理）
  ```
- **S2 条目**（todo.md 第33行末尾，`### S2. ...` 段落末）：在建议修复行后追加一行：
  ```
  - **已修复**: 2026-06-30, 批次 v2 (P1 设计合规修复), 4项综合修复：添加 DOM id(fab-login-prompt/fab-welcome-logged-in)、切换 renderMarkdown 统一 XSS 管道、删除内联免责声明改用 useUI 函数、切换 formatTime 统一版本
  ```

## 选择理由
P1优先级——S1为纯粹死代码（v16 sessionStorage 迁移残留），删除即可零风险。S2的4项修复消除约35行内联重复代码，对齐项目共享 composable（useMarkdown、useUI）和工具函数（helpers），提升代码复用性和XSS安全性（`renderMarkdown` 使用统一的 `sanitizeHtml` 白名单加固，比直接 `DOMPurify.sanitize()` 更安全）。两问题仅涉及2个前端文件，彼此独立，可在一个任务中安全并行处理。todo.md 更新确保修复状态可追踪，满足需求"可勾选、可追踪的实现任务"目标。

## 任务上下文
- 来源：审议式三轮代码审查 Round 1 #S1/#S2 + Round 2 #S1/#S2/#S3（合并后的综合问题）
- 审查报告：`reviews/202606291800_full_review/todo.md`
- 设计依据：`docs/2_detailed_design_v4.md` §4.1.1（DOM id）、§1.3（XSS 净化管道）、§7.4（可复用组件规范）
- S1：`StorageEvent` 接口规范明确仅对 localStorage 变更触发，v16 已全局迁移至 sessionStorage + BroadcastChannel，此代码路径永不可达
- S2：AiChatDialog 是唯二使用 `renderContent()` 内联管道的组件（另一为 DoctorChatView），统一到 `renderMarkdown` 后可确保 XSS 白名单全项目一致

## 已有代码上下文
- `src/App.vue`: 第32-43行 `handleStorageChange`，第49-51行 `onMounted` 中监听 storage，第53-55行 `onUnmounted` 中移除监听。`authStore.ts:22-28` 的 BroadcastChannel 已完全替代此功能
- `src/components/AiChatDialog.vue`: 
  - 第6行 `import { marked } from 'marked'`，第7行 `import DOMPurify from 'dompurify'`（将移除）
  - 第21-23行内联 `hasAcceptedDisclaimer()`，第25-37行内联 `showDisclaimer()`，第39-47行内联 `ensureDisclaimer()`
  - 第105-110行内联 `formatTime()`，第112-121行内联 `renderContent()`
  - 第171行 `<div v-if="!isLoggedIn" class="login-prompt">`（需加 id="fab-login-prompt"）
  - 第182行 `<div v-if="messages.length === 0" class="welcome-area">`（需加 id="fab-welcome-logged-in"）
- `src/composables/useMarkdown.ts`: 导出 `renderMarkdown(markdown: unknown): string`，管道为 marked.parse → sanitizeHtml（白名单加固，ALLOWED_TAGS/ALLOWED_ATTR/ALLOWED_URI_REGEXP）
- `src/composables/useUI.ts`: 导出 `hasAcceptedDisclaimer(): boolean`、`showDisclaimer(): Promise<boolean>`、`setDisclaimerAccepted(accepted: boolean): void`（内部封装 `localStorage.setItem(DISCLAIMER_KEY, 'true')`），复用 `getSwal()` 懒加载单例
- `src/utils/helpers.ts`: 导出 `formatTime(timestamp: number): string`，内部调用 `formatDate(timestamp, 'HH:mm')`

---

## 修订说明（v2 r1）

| 审查意见 | 修改措施 |
|---------|---------|
| **[一般] 计划缺失 todo.md 更新步骤**：task_v2.md 未包含更新 `reviews/202606291800_full_review/todo.md` 以标记 S1/S2 为已完成的步骤。v1 已建立先例（detail_v1.md 修改4 明确规划了 todo.md 的更新），若缺失此步骤将导致 S1/S2 在 todo.md 中仍显示为未修复状态，可追踪实现计划不完整。 | **采纳**。在任务描述中新增"3. todo.md 更新"章节（第58-69行），明确要求在 todo.md 的 S1 条目（第17行末尾）和 S2 条目（第33行末尾）追加 `- **已修复**: 2026-06-30, 批次 v2 (P1 设计合规修复), ...` 行，提供具体修改摘要文本。同步更新了"选择理由"，说明 todo.md 更新确保修复状态可追踪。 |
| **[轻微] S2 2c 使用直接 localStorage.setItem 而非 useUI 导出的 setDisclaimerAccepted**：替换 `ensureDisclaimer()` 的内联逻辑中使用 `localStorage.setItem('disclaimer_accepted', 'true')` 直接写入，而 `useUI` 已导出 `setDisclaimerAccepted(true)` 函数做同一件事。使用统一封装可避免硬编码 key 字符串在调用处散落，提升可维护性。 | **采纳**。将 S2 2c 中 `localStorage.setItem('disclaimer_accepted', 'true')` 替换为 `setDisclaimerAccepted(true)`，导入语句追加 `setDisclaimerAccepted`。同步更新了"已有代码上下文"中 useUI.ts 的描述，注明 `setDisclaimerAccepted(accepted: boolean): void` 的签名和内部封装说明。 |
