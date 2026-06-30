# 详细设计（v2）

## 概述

修复2个P1前端设计合规问题（S1/S2），消除v16迁移残留死代码，对齐AiChatDialog与项目共享composable（useMarkdown、useUI）和工具函数（helpers）。同步更新todo.md使修复状态可追踪。

### S1 — App.vue localStorage StorageEvent 死代码清理

v16 设计已将 token/role/user 全面迁移至 sessionStorage + BroadcastChannel。`StorageEvent` 接口规范明确仅对 localStorage 变更触发，而项目中不再有任何代码向 localStorage 写入 token/role/user，因此 `handleStorageChange` 监听器永不可达。`authStore.ts:22-28` 的 BroadcastChannel 已完全替代此跨标签页同步功能。

### S2 — AiChatDialog.vue 4项综合设计合规修复

1. **DOM id 缺失**：设计文档 §4.1.1 规定登录引导区和已登录欢迎区需绑定 `id="fab-login-prompt"` 和 `id="fab-welcome-logged-in"`
2. **绕过统一 XSS 管道**：内联 `renderContent()` 直接调用 `DOMPurify.sanitize()` 默认配置，未使用项目统一的 `sanitizeHtml()` 白名单加固
3. **免责声明逻辑重复**：三个内联函数（`hasAcceptedDisclaimer`/`showDisclaimer`/`ensureDisclaimer`）与 `useUI.ts` 导出版本完全重复，且绕过 `getSwal()` 懒加载单例
4. **formatTime 重复定义**：内联版本与 `helpers.ts` 存在功能差异（内联版含 `toLocaleTimeString` 逻辑，统一版使用 `formatDate` + `HH:mm` 格式）

### 本轮范围边界

v2 仅覆盖 **P1 本迭代（S1/S2）**——两个前端设计合规问题。本轮设计不覆盖其余 45 个未修复问题。

## 文件规划

| 文件路径 | 操作 | 职责 |
|---------|------|------|
| src/App.vue | 修改 | 删除 `handleStorageChange` 函数体、`onMounted`/`onUnmounted` 中的 storage 事件监听；精简 vue 导入 |
| src/components/AiChatDialog.vue | 修改 | 添加2个 DOM id、替换内联 `renderContent()`/`formatTime()`/免责声明函数为共享导入 |
| reviews/202606291800_full_review/todo.md | 修改 | 将 S1/S2 标记为已完成，添加实现批次和完成日期戳 |

## 类型定义

本任务不引入新类型，仅使用已有类型和函数签名。

### 已有函数签名（引用）

**源文件**：`src/composables/useMarkdown.ts`

```typescript
// 公开导出
export function renderMarkdown(markdown: unknown): string
  // 管道: marked.parse({ async: false }) → sanitizeHtml(白名单加固) → 安全 HTML 字符串
  // 前置: 无
  // 后置: 返回净化后的安全 HTML；输入为 null/undefined/非字符串/空字符串时返回 ''
```

**源文件**：`src/composables/useUI.ts`

```typescript
// 公开导出（独立函数，非 composable 内部）
export function hasAcceptedDisclaimer(): boolean
  // 检查 localStorage['disclaimer_accepted'] === 'true'

export async function showDisclaimer(): Promise<boolean>
  // 展示 SweetAlert2 医学免责声明弹窗
  // 返回: true=用户同意, false=用户拒绝

export function setDisclaimerAccepted(accepted: boolean): void
  // accepted=true → localStorage.setItem(DISCLAIMER_KEY, 'true')
  // accepted=false → localStorage.removeItem(DISCLAIMER_KEY)
```

**源文件**：`src/utils/helpers.ts`

```typescript
export function formatTime(timestamp: number): string
  // 将 Unix 时间戳（毫秒）格式化为 HH:mm
  // 内部调用 formatDate(timestamp, 'HH:mm')
  // 前置: timestamp 为有效毫秒时间戳
  // 后置: 返回 HH:mm 格式字符串；timestamp 为 0/falsy 返回 ''
```

## 修改规格

### 修改1：App.vue — 删除 localStorage StorageEvent 死代码

**文件**：`src/App.vue`
**操作**：修改（删除3处代码块 + 精简1行导入）

**现状**：
- 第2行：`import { computed, onMounted, onUnmounted } from 'vue'`
- 第32-43行：`function handleStorageChange(e: StorageEvent) { ... }` —— 监听 `window` 的 `storage` 事件，内部读取 `localStorage.getItem('token')` 和 `localStorage.getItem('role')`
- 第49-51行：`onMounted(() => { window.addEventListener('storage', handleStorageChange) })`
- 第53-55行：`onUnmounted(() => { window.removeEventListener('storage', handleStorageChange) })`
- `authStore.ts:22-28` 已正确实现 BroadcastChannel 跨标签页同步，`StorageEvent` 仅对 localStorage 变更触发，`handleStorageChange` 永不可达

**变更**：

1. **精简导入（第2行）**：
   ```
   改前: import { computed, onMounted, onUnmounted } from 'vue'
   改后: import { computed } from 'vue'
   ```

2. **删除 handleStorageChange 函数（第32-43行）**：整体删除函数定义及其函数体

3. **删除 onMounted 块（第49-51行）**：整体删除 `onMounted(() => { ... })` 调用

4. **删除 onUnmounted 块（第53-55行）**：整体删除 `onUnmounted(() => { ... })` 调用

> 注意：第32-43行为 `handleStorageChange` 函数定义（含闭合 `}`），第44-48行（`toggleFab` 函数定义和空行）保留不变。

**行为契约**：
- 前置：无（删除死代码，无运行时条件依赖）
- 后置：App.vue 不再监听 `window` 的 `storage` 事件；跨标签页认证同步完全由 `authStore.ts` 的 BroadcastChannel 机制承担
- 零风险：此代码路径永不可达（无任何代码向 localStorage 写入 token/role/user），删除不改变任何可达行为

### 修改2：AiChatDialog.vue — 4项综合设计合规修复

**文件**：`src/components/AiChatDialog.vue`
**操作**：修改（6处代码变更：2个DOM属性添加、导入替换、3个函数删除）

#### 2a. 添加设计文档规定的 DOM id

**变更**：

1. 第171行 `<div v-if="!isLoggedIn" class="login-prompt">` 改为：
   ```html
   <div v-if="!isLoggedIn" id="fab-login-prompt" class="login-prompt">
   ```

2. 第182行 `<div v-if="messages.length === 0" class="welcome-area">` 改为：
   ```html
   <div v-if="messages.length === 0" id="fab-welcome-logged-in" class="welcome-area">
   ```

**行为契约**：
- 前置：无
- 后置：两个关键 DOM 节点拥有 `id` 属性，可供 E2E 测试选择器和无障碍技术定位
- 无运行时副作用：仅为属性添加

#### 2b. 使用共享 renderMarkdown 替代内联 renderContent()

**变更**：

1. **删除第6行导入**：删除 `import { marked } from 'marked'`
2. **删除第7行导入**：删除 `import DOMPurify from 'dompurify'`
3. **新增导入**（在第8行 `import DisclaimerBar from './DisclaimerBar.vue'` 之后）：
   ```typescript
   import { renderMarkdown } from '@/composables/useMarkdown'
   ```
4. **删除第112-121行**：整体删除 `function renderContent(content: string): string { ... }` 函数定义
5. **第209行模板修改**：
   ```
   改前: <div class="msg-content" v-html="renderContent(msg.content)"></div>
   改后: <div class="msg-content" v-html="renderMarkdown(msg.content)"></div>
   ```

**行为契约**：
- 前置：`msg.content` 为字符串（Markdown 格式）
- 后置：内容经 `marked.parse` → `sanitizeHtml`（白名单加固：ALLOWED_TAGS/ALLOWED_ATTR/ALLOWED_URI_REGEXP）→ 安全 HTML 渲染
- 与旧版差异：
  - 外部链接自动附加 `rel="noopener noreferrer" target="_blank"`（旧版 `renderContent` 缺失）
  - XSS 净化从 DOMPurify 默认配置升级为项目统一白名单加固，安全性提升
  - `renderMarkdown` 入参类型为 `unknown`（更宽松的防御性类型），返回值语义一致（均为 `string`）

#### 2c. 使用共享 useUI 免责声明函数替代内联重复

**变更**：

1. **新增导入**（在 2b 新增的 import 之后追加）：
   ```typescript
   import { hasAcceptedDisclaimer, showDisclaimer, setDisclaimerAccepted } from '@/composables/useUI'
   ```

2. **删除第21-47行**：整体删除以下三个内联函数定义：
   - `function hasAcceptedDisclaimer(): boolean { ... }`（第21-23行）
   - `async function showDisclaimer(): Promise<boolean> { ... }`（第25-37行）
   - `async function ensureDisclaimer(): Promise<boolean> { ... }`（第39-47行）

3. **重构 watch(isOpen, ...) 内的免责声明调用**（第57-70行）：

   原代码（第59-65行）：
   ```typescript
       if (isLoggedIn.value) {
         const agreed = await ensureDisclaimer()
         if (!agreed) {
           chatStore.toggleFab()
           return
         }
       }
   ```

   改为：
   ```typescript
       if (isLoggedIn.value) {
         let agreed = hasAcceptedDisclaimer()
         if (!agreed) {
           agreed = await showDisclaimer()
           if (agreed) setDisclaimerAccepted(true)
         }
         if (!agreed) {
           chatStore.toggleFab()
           return
         }
       }
   ```

   > **设计决策**：`useUI.ts` 未导出 `ensureDisclaimer()` 函数（它是 AiChatDialog 特有的 `hasAcceptedDisclaimer` → `showDisclaimer` → `setDisclaimerAccepted` 逻辑包装）。本设计将其展开为三步内联调用，复用 useUI 的三个导出函数。`setDisclaimerAccepted(true)` 内部封装 `localStorage.setItem(DISCLAIMER_KEY, 'true')`，避免硬编码 key 字符串散落在调用处。

**行为契约**：
- 前置：`isOpen` 变为 `true` 且 `isLoggedIn` 为 `true`
- 后置：逻辑等价于原 `ensureDisclaimer()`——检查 localStorage → 未同意则弹窗 → 同意后持久化
- 与旧版差异：
  - SweetAlert2 通过 `getSwal()` 懒加载单例获取（旧版直接 `await import('sweetalert2')`，每次创建新动态导入）
  - `hasAcceptedDisclaimer` 检查的 localStorage key 统一为 `useUI` 的 `DISCLAIMER_KEY` 常量
  - 行为等价性已验证：旧版 `ensureDisclaimer()` 内联的 `localStorage.setItem('disclaimer_accepted', 'true')` 与新版的 `setDisclaimerAccepted(true)` 写入相同 key-value

#### 2d. 使用共享 formatTime 替代内联版本

**变更**：

1. **新增导入**（在 2c 新增的 import 之后追加）：
   ```typescript
   import { formatTime } from '@/utils/helpers'
   ```

2. **删除第105-110行**：整体删除 `function formatTime(timestamp: number): string { ... }` 内联定义

**行为契约**：
- 前置：`msg.timestamp` 为有效 Unix 毫秒时间戳
- 后置：返回 `HH:mm` 格式时间字符串
- 与旧版差异：
  - 旧版：`new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })`
  - 新版：`formatDate(timestamp, 'HH:mm')` 即手动 `getHours().padStart(2,'0') + ':' + getMinutes().padStart(2,'0')`
  - 输出格式均为 `HH:mm`，功能等价；新版不依赖浏览器 Intl API，服务器端渲染兼容性更好
  - 输入防御一致：旧版检查 `!timestamp` 和 `isNaN(d.getTime())` 返回 `''`；新版 `formatDate` 内部同样有 `isNaN` 检查

### 修改3：todo.md — 将已修复问题标记为已完成

**文件**：`reviews/202606291800_full_review/todo.md`
**操作**：修改（在 S1 和 S2 条目末尾追加完成记录行）

**现状**：
- S1 条目（第12-17行）：从 `### S1. App.vue 遗留死代码...` 到第17行 `- **建议修复**: ...`
- S2 条目（第19-33行）：从 `### S2. AiChatDialog.vue 综合设计合规缺陷...` 到第33行
- v1 已建立格式先例：S7/S8/S9 条目末尾追加了 `- **已修复**: 2026-06-30, 批次 v1 (P0 ...), ...` 行

**变更**：

1. **S1 条目**：在第17行（`- **建议修复**: 删除 handleStorageChange 函数...`）之后追加一行：
   ```markdown
   - **已修复**: 2026-06-30, 批次 v2 (P1 设计合规修复), 删除 handleStorageChange + storage 事件监听器（v16 迁移残留死代码清理）
   ```

2. **S2 条目**：在第33行（`4. \`formatTime\` 改为从 \`@/utils/helpers\` 导入统一版本`）之后追加一行：
   ```markdown
   - **已修复**: 2026-06-30, 批次 v2 (P1 设计合规修复), 4项综合修复：添加 DOM id(fab-login-prompt/fab-welcome-logged-in)、切换 renderMarkdown 统一 XSS 管道、删除内联免责声明改用 useUI 函数、切换 formatTime 统一版本
   ```

**行为契约**：
- 前置：S1/S2 的代码变更已实现并通过构建验证
- 后置：todo.md 成为可追踪的实现计划，S1/S2 清晰标注批次和日期；后续批次实现者可参考此格式继续标记

## 详细设计文档合规性交叉验证

依据审查依据 `docs/2_detailed_design_v4.md` 对本次设计的修改逐条验证：

| 设计条款 | 要求 | 本设计对应 | 状态 |
|---------|------|-----------|:--:|
| §4.1.1 AiChatDialog DOM 树 | `#fab-login-prompt`（未登录引导区）和 `#fab-welcome-logged-in`（已登录欢迎区）两个 id | 修改2a：在第171行和第182行分别添加两个 id | 一致 |
| §1.3 XSS 净化管道（技术选型表 + §7.5） | marked.js + DOMPurify 净化方案，项目统一 sanitizeHtml 白名单加固 | 修改2b：替换为 `renderMarkdown()`，管道为 marked.parse → sanitizeHtml（ALLOWED_TAGS/ALLOWED_ATTR/ALLOWED_URI_REGEXP） | 一致 |
| §7.4 可复用组件规范 + 决策7 | 免责声明函数统一在 useUI composable，避免内联重复 | 修改2c：删除三内联函数，改用 useUI 的 `hasAcceptedDisclaimer`/`showDisclaimer`/`setDisclaimerAccepted` | 一致 |
| §1.4 模块划分（composables/ 不依赖页面组件） | AiChatDialog 使用 composables 导入而非内联重复 | 修改2b/2c：从 useMarkdown、useUI 导入共享函数 | 一致 |
| 决策5 Markdown 渲染统一化 | 统一替换为 `useMarkdown.renderMarkdown()` | 修改2b：删除内联 `renderContent()`，改用 `renderMarkdown` | 一致 |

> 验证结论：本设计的修改与详细设计文档 `docs/2_detailed_design_v4.md` 完全一致，无偏离。

## 错误处理

- **S1 (App.vue)**：删除死代码，无错误路径。导入精简后 `onMounted`/`onUnmounted` 不再使用，Vite 编译期未使用导入警告自动消除。
- **S2 (AiChatDialog.vue)**：
  - **2a (DOM id)**：纯属性添加，无错误路径。
  - **2b (renderMarkdown)**：`renderMarkdown()` 内部有完整的防御链（null check → typeof check → trim check → marked.parse try → sanitizeHtml）。管道内的 marked 解析异常被 try-catch 包裹。与旧版 `renderContent()` 的 try-catch 行为一致。
  - **2c (免责声明)**：`showDisclaimer()` 为 async 函数，内部 SweetAlert2 弹窗失败时 Promise reject——此行为与旧版内联 `showDisclaimer()` 一致。调用处（`watch(isOpen, ...)`）使用 `await`，reject 将向上传播到 Vue 的异步 watcher 错误处理。
  - **2d (formatTime)**：`formatTime()` 内部 `formatDate()` 已处理 `isNaN(d.getTime())` 回退，无新增错误路径。

## 行为契约

### S1 删除前后对比

| 场景 | 删除前 | 删除后 |
|------|--------|--------|
| 用户在同一浏览器打开两个标签页，标签页A登出 | `handleStorageChange` 不触发（token 在 sessionStorage，`StorageEvent` 仅对 localStorage 变更触发） | 无变化。BroadcastChannel 机制（`authStore.ts:22-28`）处理跨标签页同步 |
| 其他标签页修改 localStorage token | `handleStorageChange` 触发 → 读取 localStorage → 同步 | 不监听。无代码向 localStorage 写入 token/role/user，此场景不存在 |

### S2 免责声明逻辑等价性验证

| 步骤 | 旧版 `ensureDisclaimer()` | 新版展开逻辑 |
|------|--------------------------|-------------|
| 1. 检查 localStorage | `hasAcceptedDisclaimer()` 内联 → `localStorage.getItem('disclaimer_accepted') === 'true'` | `hasAcceptedDisclaimer()` from useUI → 同 key 同逻辑 |
| 2. 弹窗 | `showDisclaimer()` 内联 → `await import('sweetalert2')` | `showDisclaimer()` from useUI → `getSwal()` 懒加载单例 |
| 3. 持久化 | `localStorage.setItem('disclaimer_accepted', 'true')` | `setDisclaimerAccepted(true)` → 同 key 同操作 |
| 4. 拒绝处理 | 返回 false → `chatStore.toggleFab(); return` | 同 |

> 结论：行为完全等价。新版使用懒加载单例避免重复动态导入。

## 依赖关系

### 已有类型/模块依赖

| 依赖项 | 使用方 | 用途 |
|--------|--------|------|
| `computed` (vue) | App.vue | 保留，仅 `onMounted`/`onUnmounted` 随删除移除 |
| `renderMarkdown` (src/composables/useMarkdown.ts) | AiChatDialog.vue | 新增导入，替代内联 `renderContent()` |
| `hasAcceptedDisclaimer` (src/composables/useUI.ts) | AiChatDialog.vue | 新增导入，替代内联版本 |
| `showDisclaimer` (src/composables/useUI.ts) | AiChatDialog.vue | 新增导入，替代内联版本 |
| `setDisclaimerAccepted` (src/composables/useUI.ts) | AiChatDialog.vue | 新增导入，替代内联 `localStorage.setItem()` |
| `formatTime` (src/utils/helpers.ts) | AiChatDialog.vue | 新增导入，替代内联版本 |
| `marked` (第三方) | AiChatDialog.vue | 删除导入（标记渲染由 useMarkdown 内部处理） |
| `DOMPurify` (第三方) | AiChatDialog.vue | 删除导入（XSS 净化由 useMarkdown 内部处理） |
| `todo.md` (reviews/202606291800_full_review/todo.md) | 本任务 | 将 S1/S2 标记为已完成，添加批次和日期 |

### 暴露给后续任务的公开接口

本任务不引入新的公开接口。三个修改均为内部修复或文档更新：

- App.vue: 仅删除死代码，无新增导出。`showTabBar`/`showFab` 计算属性、`toggleFab` 函数均保持不变
- AiChatDialog.vue: 无新增导出，内部实现从内联函数切换为 composable 导入。组件对外 Props/Emits 接口不变（本组件无 Props/Emits，依赖 Pinia Store 和 Router）
- todo.md: 提供可追踪的实现进度，后续批次实现者可参考标记格式

### 删除的依赖

| 依赖项 | 原使用方 | 原因 |
|--------|--------|------|
| `onMounted` (vue) | App.vue | 随 storage 事件监听器删除，不再使用 |
| `onUnmounted` (vue) | App.vue | 随 storage 事件监听器删除，不再使用 |

---

## 修订说明（v2 r1）

| 审查意见 | 修改措施 |
|---------|---------|
| **[一般] 计划缺失 todo.md 更新步骤**：task_v2.md r1 审查指出计划文件中未包含更新 `reviews/202606291800_full_review/todo.md` 以标记 S1/S2 为已完成的步骤。v1 已建立先例（detail_v1.md 修改4 明确规划了 todo.md 的更新），若缺失此步骤将导致 S1/S2 在 todo.md 中仍显示为未修复状态，可追踪实现计划不完整。 | **采纳**。在文件规划中新增第3行（`reviews/202606291800_full_review/todo.md \| 修改`），在修改规格中新增"修改3：todo.md — 将已修复问题标记为已完成"，明确要求在 S1 条目（第17行末尾）和 S2 条目（第33行末尾）追加 `- **已修复**: 2026-06-30, 批次 v2 (P1 设计合规修复), ...` 行，提供具体修改摘要文本。格式与 v1 的修改4 保持一致。同步更新了依赖关系表（已有类型/模块依赖新增 todo.md 行）和行为契约。 |
| **[轻微] S2 2c 使用直接 localStorage.setItem 而非 useUI 导出的 setDisclaimerAccepted**：task_v2.md r1 审查指出 `ensureDisclaimer()` 替换逻辑中使用 `localStorage.setItem('disclaimer_accepted', 'true')` 直接写入，而 `useUI` 已导出 `setDisclaimerAccepted(true)` 函数做同一件事。使用统一封装可避免硬编码 key 字符串在调用处散落，提升可维护性。 | **采纳**。修改2c 的免责声明调用重构中，将 `localStorage.setItem('disclaimer_accepted', 'true')` 替换为 `setDisclaimerAccepted(true)`。导入语句追加 `setDisclaimerAccepted`。同步更新了类型定义中 `useUI` 的函数签名列表（新增 `setDisclaimerAccepted` 条目），以及行为契约中的等价性验证表（步骤3从直接 `localStorage.setItem` 改为 `setDisclaimerAccepted(true)`），说明内部封装相同 key-value 操作。 |
