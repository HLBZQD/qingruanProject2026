# 计划审查报告（v2 r1）

## 审查结果
REJECTED

## 发现

### [一般] 计划缺失 todo.md 更新步骤

**问题描述**: task_v2.md 未包含更新 `reviews/202606291800_full_review/todo.md` 以标记 S1/S2 为已完成的步骤。

**为什么是问题**: 需求（requirement.md）明确要求"将所有50个问题转化为可勾选、可追踪的实现任务，更新 reviews/202606291800_full_review/todo.md 使其成为完整的可执行实现计划"。v1 已建立先例——detail_v1.md 修改4 明确规划了 todo.md 的更新（追加 `- **已修复**: ...` 行，含日期、批次、修改摘要）。若 v2 计划缺失此步骤，实施者将只修改 S1/S2 源代码而不更新 todo.md，导致：(1) S1/S2 在 todo.md 中仍显示为未修复状态；(2) 可追踪实现计划不完整；(3) 后续批次实施者无法获知 S1/S2 的完成状态。

**期望修正方向**: 在 task_v2.md 中增加一项任务步骤，明确要求在 `reviews/202606291800_full_review/todo.md` 的 S1 和 S2 条目末尾追加已修复标记行，格式与 v1 保持一致（`- **已修复**: 2026-06-30, 批次 v2 (P1 设计合规修复), <修改摘要>`）。S1 条目位于 todo.md 第17行末尾（`### S1. ...` 段落末），S2 条目位于第33行末尾。

### [轻微] S2 2c 使用直接 localStorage.setItem 而非 useUI 导出的 setDisclaimerAccepted

**问题描述**: 替换 `ensureDisclaimer()` 的内联逻辑中，使用 `localStorage.setItem('disclaimer_accepted', 'true')` 直接写入，而 `useUI` 已导出 `setDisclaimerAccepted(true)` 函数做同一件事。

**为什么是问题**: 已在 `@/composables/useUI` 中导入了 `hasAcceptedDisclaimer` 和 `showDisclaimer`，再额外导入 `setDisclaimerAccepted` 成本极低，使用统一封装可避免硬编码 key 字符串在调用处散落，提升可维护性。当前写法功能正确，不阻碍通过。

**期望修正方向**: 将内联代码中的 `localStorage.setItem('disclaimer_accepted', 'true')` 替换为 `setDisclaimerAccepted(true)`，并在导入语句中追加 `setDisclaimerAccepted`。

## 修改要求（仅 REJECTED 时）

### 针对 [一般] todo.md 更新步骤缺失

- **问题**: task_v2.md 未规划 todo.md 的更新，与需求"可追踪实现计划"目标和 v1 先例不一致。
- **期望修正**: 在 task_v2.md 末尾新增一个任务项（例如 "3. todo.md 更新"），明确：(1) 在 todo.md 的 S1 和 S2 条目末尾追加 `- **已修复**: 2026-06-30, 批次 v2 (P1 设计合规修复), ...` 行；(2) 提供修改摘要文本。格式参照 v1 在 todo.md 第68/76/84行的已有标记。

### 针对 [轻微] setDisclaimerAccepted 使用

- 可选修正：将内联 localStorage 写入替换为 `setDisclaimerAccepted(true)` 导入调用。
