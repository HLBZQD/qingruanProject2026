# 设计审查报告（v2 r1）

## 审查结果
APPROVED

## 发现

### 修改1（App.vue 死代码清理）验证

- 源代码行号全部匹配：导入行（第2行）、`handleStorageChange`（第32-43行）、`onMounted`（第49-51行）、`onUnmounted`（第53-55行）。
- authStore.ts 确认：token/role/user 全部写入 sessionStorage（第61/75-77/113-115行），BroadcastChannel 位于第16-38行。设计关于"StorageEvent 仅对 localStorage 触发，此 handler 永不可达"的结论正确。
- `toggleFab`（第45-47行）保留不变，与设计一致。
- 删除后 `computed` 是唯一保留的 vue 导入，App.vue 无其他 `onMounted`/`onUnmounted` 用法。

### 修改2（AiChatDialog.vue 四项合规修复）验证

**2a DOM id：** 源代码行号（第171行、第182行）匹配。`fab-login-prompt` 和 `fab-welcome-logged-in` 均在详细设计文档 §4.1.1（第3000-3003行）中明确规定。

**2b renderMarkdown 替换：** 源代码行号全部匹配（导入第6/7/8行，函数定义第112-121行，模板第209行）。`useMarkdown.ts` 导出 `renderMarkdown(markdown: unknown): string`（第54行），内部管道为 marked.parse → sanitizeHtml（白名单加固），与设计描述一致。`sanitizeUtils/sanitize.ts` 确认白名单配置（ALLOWED_TAGS/ALLOWED_ATTR/ALLOWED_URI_REGEXP/FORBID_TAGS/FORBID_ATTR）。marked 自定义 link renderer（第34-41行）为外部链接注入 `rel="noopener noreferrer" target="_blank"`。

**2c 免责声明函数替换：** 源代码行号全部匹配（内联函数第21-47行，watch 块第57-70行）。`useUI.ts` 确认导出 `hasAcceptedDisclaimer`（第109行）、`showDisclaimer`（第118行）、`setDisclaimerAccepted`（第135行）。展开后的三步逻辑与原始 `ensureDisclaimer()` 行为等价——已逐路径验证（已同意、首次同意、拒绝三条路径）。

**2d formatTime 替换：** 源代码行号匹配（第105-110行）。`helpers.ts` 第51-54行确认 `formatTime(timestamp: number): string` 存在。

### 修改3（todo.md 更新）验证

- S1 条目位于 todo.md 第12-17行，S2 条目位于第19-33行，与设计一致。
- v1 先例格式（S7/S8/S9 的"已修复"行）已建立，v2 格式与之保持一致。
- 设计正确声明前置条件："S1/S2 的代码变更已实现并通过构建验证"。

### 详细设计合规性交叉验证

| 设计条款 | 验证结果 |
|---------|---------|
| §4.1.1 DOM id（fab-login-prompt / fab-welcome-logged-in） | 在详细设计文档第3000-3003行确认存在 |
| §1.3 XSS 净化管道（sanitizeHtml 白名单） | sanitize.ts 第50-106行确认完整配置 |
| §7.4 可复用组件规范（useUI 免责声明） | useUI.ts 第109/118/135行确认三个导出 |
| §1.4 模块划分（composables 不依赖页面组件） | 导入方向正确，无循环依赖 |
| 决策5 Markdown 渲染统一化（renderMarkdown） | useMarkdown.ts 第54行确认 |

### [轻微] formatTime 边缘情况行为差异

设计声明输出格式"功能等价"，但存在一个极其罕见的数学边缘情况：若传入 `Infinity` 作为时间戳（truthy number 但 `new Date(Infinity)` 为 Invalid Date），旧版 `formatTime` 返回 `''`（经 `isNaN` 检查），而新版 `formatTime` 经 `formatDate` 返回 `String(Infinity)` 即 `"Infinity"`。`!timestamp` 守卫已拦截 `0`、`NaN`、`null`、`undefined`，TypeScript 类型系统阻止非 number 输入，`Infinity` 作为消息时间戳在真实场景中不会出现。不影响正确性。
