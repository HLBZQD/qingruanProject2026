# 测试报告（v2 r2 — 修订轮次）

## 概述

验证第二批次（N=2）对 S1/S2 两项 P1 前端设计合规问题的修复。本修订轮次（r2）响应审查反馈，将 AiChatDialog.spec.ts 全部 13 个占位断言（`expect(true).toBe(true)`）替换为真实测试逻辑，并修正 App.spec.ts BC-S1-1-b 的无效测试（添加 mount/unmount 生命周期验证）。

## 变更验证

### 1. todo.md 更新验证

| 验证项 | 预期 | 实际 | 状态 |
|--------|------|------|:--:|
| S1 条目末尾追加"已修复"行 | `- **已修复**: 2026-06-30, 批次 v2 (P1 设计合规修复), 删除 handleStorageChange + storage 事件监听器（v16 迁移残留死代码清理）` | 第18行，内容完全匹配 | 通过 |
| S2 条目末尾追加"已修复"行 | `- **已修复**: 2026-06-30, 批次 v2 (P1 设计合规修复), 4项综合修复：添加 DOM id(fab-login-prompt/fab-welcome-logged-in)、切换 renderMarkdown 统一 XSS 管道、删除内联免责声明改用 useUI 函数、切换 formatTime 统一版本` | 第34行，内容完全匹配 | 通过 |
| 格式与 v1 先例一致 | 使用 `- **已修复**: 日期, 批次 vN (...), 摘要` 格式 | 与 S7/S8/S9 的 v1 格式完全一致 | 通过 |

### 2. App.vue 代码修改验证（S1 — localStorage StorageEvent 死代码清理）

| 验证项 | 预期 | 实际 | 状态 |
|--------|------|------|:--:|
| 导入精简 | `import { computed } from 'vue'` (移除 `onMounted, onUnmounted`) | 第2行匹配 | 通过 |
| handleStorageChange 函数删除 | 第32-43行函数定义整体删除 | 文件中不存在 `handleStorageChange` | 通过 |
| onMounted storage 监听删除 | `onMounted(() => { window.addEventListener('storage', ...) })` 删除 | 文件中无 `addEventListener('storage'` | 通过 |
| onUnmounted storage 清理删除 | `onUnmounted(() => { window.removeEventListener('storage', ...) })` 删除 | 文件中无 `removeEventListener('storage'` | 通过 |
| toggleFab 函数保留 | 第32-34行保持原样 | 第32-34行（现为 `function toggleFab() { ... }`），保持不变 | 通过 |
| TabBar/FabButton/AiChatDialog 模板保留 | 模板结构不变 | 第37-45行模板完整保留 | 通过 |

### 3. AiChatDialog.vue 代码修改验证（S2 — 4项综合设计合规修复）

#### 3a. DOM id 添加

| 验证项 | 预期 | 实际 | 状态 |
|--------|------|------|:--:|
| 登录引导区 id | `<div v-if="!isLoggedIn" id="fab-login-prompt" class="login-prompt">` | 第130行，完全匹配 | 通过 |
| 已登录欢迎区 id | `<div v-if="messages.length === 0" id="fab-welcome-logged-in" class="welcome-area">` | 第141行，完全匹配 | 通过 |

#### 3b. renderMarkdown 统一 XSS 管道

| 验证项 | 预期 | 实际 | 状态 |
|--------|------|------|:--:|
| marked 导入删除 | 不再有 `import { marked } from 'marked'` | 文件中无 `marked` 导入 | 通过 |
| DOMPurify 导入删除 | 不再有 `import DOMPurify from 'dompurify'` | 文件中无 `DOMPurify` 导入 | 通过 |
| renderMarkdown 导入新增 | `import { renderMarkdown } from '@/composables/useMarkdown'` | 第7行，完全匹配 | 通过 |
| renderContent() 函数删除 | 第112-121行内联函数定义整体删除 | 文件中无 `function renderContent` | 通过 |
| 模板 v-html 改为 renderMarkdown | `<div class="msg-content" v-html="renderMarkdown(msg.content)">` | 第168行，完全匹配 | 通过 |

#### 3c. useUI 免责声明函数

| 验证项 | 预期 | 实际 | 状态 |
|--------|------|------|:--:|
| useUI 导入新增 | `import { hasAcceptedDisclaimer, showDisclaimer, setDisclaimerAccepted } from '@/composables/useUI'` | 第8行，完全匹配 | 通过 |
| 内联 hasAcceptedDisclaimer 删除 | 第21-23行函数删除 | 文件中无内联版本 | 通过 |
| 内联 showDisclaimer 删除 | 第25-37行函数删除 | 文件中无内联版本 | 通过 |
| 内联 ensureDisclaimer 删除 | 第39-47行函数删除 | 文件中无内联版本 | 通过 |
| 免责声明重构逻辑 | `hasAcceptedDisclaimer()` → `showDisclaimer()` → `setDisclaimerAccepted(true)` | 第33-41行，完全匹配 detail_v2.md 修改2c 规格 | 通过 |
| 用户拒绝处理 | `chatStore.toggleFab(); return` | 第38-41行，保持原行为 | 通过 |

#### 3d. formatTime 统一版本

| 验证项 | 预期 | 实际 | 状态 |
|--------|------|------|:--:|
| helpers 导入新增 | `import { formatTime } from '@/utils/helpers'` | 第9行，完全匹配 | 通过 |
| 内联 formatTime 删除 | 第105-110行内联函数定义删除 | 文件中无内联 `function formatTime` | 通过 |
| 模板调用 formatTime | `{{ formatTime(msg.timestamp) }}` | 第166行，完全匹配 | 通过 |

## 行为契约测试

依据 detail_v2.md 中定义的行为契约为两个修改的文件编写了单元测试。

### 新增测试文件

| 文件路径 | 被测目标 | 覆盖的行为契约 |
|---------|---------|---------------|
| `test/frontend/App.spec.ts` | App.vue (S1) | BC-S1-1: 不再监听 window storage 事件; BC-S1-2: 核心逻辑不变 |
| `test/frontend/AiChatDialog.spec.ts` | AiChatDialog.vue (S2) | BC-S2a-1/2 (DOM id), BC-S2b-1 (renderMarkdown), BC-S2c-1/2 (免责声明), BC-S2d-1 (formatTime) |

### App.spec.ts 测试用例

| 用例 ID | 行为契约 | 测试场景 | 验证方式 |
|---------|---------|---------|---------|
| BC-S1-1-a | 不再监听 storage | 挂载 App 后检查 addEventListener('storage') 调用 | mount App 后 spyOn(addEventListener)，filter 检查 'storage' 调用次数为 0 |
| BC-S1-1-b | 卸载不清理 storage | 挂载→卸载 App 后检查 removeEventListener('storage') 调用 | mount + unmount 后 spyOn(removeEventListener)，filter 检查 'storage' 调用次数为 0 |
| BC-S1-2-a | TabBar 正常渲染 | 在 /home 路由下挂载 | findComponent({ name: 'TabBar' }) 存在 |
| BC-S1-2-b | Login 隐藏 TabBar | 在 /login 路由下挂载 | findComponent({ name: 'TabBar' }) 不存在 |

> **r2 修订**: BC-S1-1-b 测试增加 mount + unmount 生命周期——先 mount App 组件再 unmount，随后在 spy 上验证 `removeEventListener` 未被以 `'storage'` 作为第一个参数调用。与 BC-S1-1-a 结构对称。

### AiChatDialog.spec.ts 测试用例

| 用例 ID | 行为契约 | 测试场景 | 验证方式 |
|---------|---------|---------|---------|
| BC-S2a-1 | fab-login-prompt | token 为空时渲染登录引导 | mount 组件（mock authStore.token=null），`wrapper.find('#fab-login-prompt')` 期望存在 |
| BC-S2a-2 | fab-welcome-logged-in | 已登录且无消息时渲染欢迎区 | mount 组件（mock token + conversations=[]），`wrapper.find('#fab-welcome-logged-in')` 期望存在 |
| BC-S2b-1-a | renderMarkdown 模板渲染 | 消息内容经 renderMarkdown 渲染为 HTML | mount 组件含 `**粗体文本**` 消息，`.msg-content` HTML 包含 `<strong>粗体文本</strong>` |
| BC-S2b-1-b | 外部链接安全属性 | renderMarkdown 输出外链附带安全属性 | 直接调用 `renderMarkdown('[链接](https://...)')`，断言含 `rel="noopener noreferrer"` 和 `target="_blank"` |
| BC-S2c-1 | 已同意免责声明跳过弹窗 | hasAcceptedDisclaimer 返回 true | vi.mock 控制 hasAcceptedDisclaimer→true, fabOpen false→true 触发 watcher, 断言 showDisclaimer 未被调用 |
| BC-S2c-2-a | 同意后持久化 | 用户点击"同意" | hasAcceptedDisclaimer→false, showDisclaimer→true, fabOpen 切换触发 watcher, 断言 setDisclaimerAccepted(true) 被调用且 toggleFab 未被调用 |
| BC-S2c-2-b | 拒绝后关闭对话框 | 用户点击"拒绝" | hasAcceptedDisclaimer→false, showDisclaimer→false, fabOpen 切换触发 watcher, 断言 toggleFab 被调用且 setDisclaimerAccepted 未被调用 |
| BC-S2d-1-a | HH:mm 格式输出 | 有效时间戳 | 直接调用 `formatTime(1700000000000)`，断言匹配 `/^\d{2}:\d{2}$/` 且长度=5 |
| BC-S2d-1-b | falsy 时间戳回退 | timestamp=0 或 undefined | `formatTime(0)` → `""`；`formatTime(undefined)` 不抛异常 |

> **r2 修订**: 全部 9 个测试用例从占位 `expect(true).toBe(true)` 替换为真实测试逻辑。Mock 策略使用 `vi.mock` 自动模拟 stores（authStore/chatStore）+ `reactive()` 包装实现响应式状态，useUI 模块完全 mock，useMarkdown/helpers 使用真实实现。

## 依赖导入完整性验证

### AiChatDialog.vue 删除的导入

| 原导入 | 原因 | 状态 |
|--------|------|:--:|
| `import { marked } from 'marked'` | 标记渲染由 useMarkdown 内部处理 | 已删除 |
| `import DOMPurify from 'dompurify'` | XSS 净化由 useMarkdown 内部处理 | 已删除 |

### AiChatDialog.vue 新增的导入

| 新导入 | 源模块 | 用途 | 状态 |
|--------|--------|------|:--:|
| `import { renderMarkdown } from '@/composables/useMarkdown'` | useMarkdown.ts | Markdown → 安全 HTML 统一管道 | 已添加 |
| `import { hasAcceptedDisclaimer, showDisclaimer, setDisclaimerAccepted } from '@/composables/useUI'` | useUI.ts | 免责声明检查/展示/持久化 | 已添加 |
| `import { formatTime } from '@/utils/helpers'` | helpers.ts | 时间戳 → HH:mm 格式化 | 已添加 |

### useUI.ts 现有导出验证

| 导出函数 | 签名 | 状态 |
|---------|------|:--:|
| `hasAcceptedDisclaimer()` | `(): boolean` | 存在，第109-111行 |
| `showDisclaimer()` | `(): Promise<boolean>` | 存在，第118-130行 |
| `setDisclaimerAccepted(accepted)` | `(accepted: boolean): void` | 存在，第135-141行 |

### useMarkdown.ts 现有导出验证

| 导出函数 | 签名 | 状态 |
|---------|------|:--:|
| `renderMarkdown(markdown)` | `(markdown: unknown): string` | 存在，第54-65行 |

### helpers.ts 现有导出验证

| 导出函数 | 签名 | 状态 |
|---------|------|:--:|
| `formatTime(timestamp)` | `(timestamp: number): string` | 存在，第51-54行 |

## 设计文档合规性交叉验证

| 设计条款 | 要求 | 实际代码 | 状态 |
|---------|------|---------|:--:|
| §4.1.1 DOM id | `#fab-login-prompt` / `#fab-welcome-logged-in` | 第130/141行，两个 id 均存在 | 通过 |
| §1.3 XSS 净化管道 | marked.parse → sanitizeHtml 白名单加固 | 第168行 v-html="renderMarkdown(msg.content)"，管道在 useMarkdown.ts 第54-65行 | 通过 |
| §7.4 可复用组件规范 | 免责声明使用 useUI composable | 第8行导入 useUI，第33-41行使用三函数 | 通过 |
| 决策5 Markdown 渲染统一化 | 统一使用 renderMarkdown | 第168行，已统一 | 通过 |

## 审查反馈处理（r2 修订）

| 审查意见（test_review_v2_r1.md） | 处理措施 |
|--------------------------------|---------|
| **[严重] AiChatDialog.spec.ts 全部13个测试用例为占位断言** (BC-S2a-1/2, BC-S2b-1-a/b, BC-S2c-1, BC-S2c-2-a/b, BC-S2d-1-a/b 零覆盖) | **采纳并修正**。重写全部测试用例：(a) DOM id 测试使用 `reactive()` mock 状态 + `mount()` 验证 `#fab-login-prompt` / `#fab-welcome-logged-in` 存在；(b) renderMarkdown 测试直接调用真实函数验证外链安全属性，同时 mount 组件验证模板渲染；(c) 免责声明测试使用 `vi.mock` mock useUI 模块的 `hasAcceptedDisclaimer`/`showDisclaimer`/`setDisclaimerAccepted`，通过 fabOpen false→true 切换触发 watcher，`flushPromises()` 后验证函数调用及参数；(d) formatTime 测试直接调用真实函数验证 HH:mm 格式和 falsy 回退。 |
| **[一般] App.spec.ts BC-S1-1-b 卸载测试未执行组件生命周期** | **采纳并修正**。增加 mount + unmount 生命周期：先 `mount(App, ...)` 再 `wrapper.unmount()`，然后在 spy 上验证 `removeEventListener` 未被以 `'storage'` 调用。与 BC-S1-1-a 的测试结构对称。 |

## 未覆盖的测试维度

- **S1 死代码不可达性**：运行时无法直接验证代码路径不可达（需静态分析或覆盖率报告），已通过源码审查验证 `handleStorageChange` 等代码块完全删除
- **S2 SweetAlert2 弹窗 UI 交互**：`showDisclaimer()` 的 SweetAlert2 弹窗测试需要完整 DOM 环境（jsdom 不完整支持 SweetAlert2）。当前通过 mock `showDisclaimer` 并验证其被调用/未被调用来覆盖逻辑分支，弹窗 UI 本身的验证留待 E2E 测试
- **跨标签页 BroadcastChannel 同步**：S1 删除后跨标签页认证同步的正确性依赖 `authStore.ts:22-28` 的 BroadcastChannel，该功能不属于本任务范围
- **免责声明 watcher 触发依赖 reactive mock**：S2c 测试通过 `reactive()` 包装 mock 状态实现 Vue 响应式追踪，watcher 在 `fabOpen` 值变更时触发。此为组件级测试的合理折中——真实 Pinia store 在 jsdom 中的依赖链过深（useApi/useSSE/BroadcastChannel/router），完全加载会导致测试不可靠

## 结论

- todo.md 更新：**通过** — S1/S2 均按 v1 格式正确标注为已完成
- App.vue 代码修改：**通过** — 3处删除 + 1行导入精简，与 detail_v2.md 修改1 完全一致
- AiChatDialog.vue 代码修改：**通过** — 6处代码变更（2个DOM属性 + 导入替换 + 3个函数删除），与 detail_v2.md 修改2 完全一致
- 行为契约覆盖：2个测试文件，**13个测试用例（全部为真实测试逻辑，无占位断言）**，覆盖全部 8 个行为契约
- 审查反馈处理：**2/2 采纳并修正**（严重1项 + 一般1项）
- 设计偏差：**无** — 所有修改严格按照 detail_v2.md 执行
