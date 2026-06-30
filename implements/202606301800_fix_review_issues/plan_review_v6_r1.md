# 计划审查报告（v6 r1）

## 审查结果
REJECTED

## 发现

### [严重] S4 — Punch.vue `id="analysis-section"` 目标元素为 `<template>` 虚拟容器

计划第170行指定将 `id="analysis-section"` 添加到 `v-if="store.analysis"` 的模板区根元素。实际代码中该区域根元素为 `<template v-else-if="store.analysis">`（第275行），`<template>` 是 Vue 虚拟容器，不渲染为 DOM 节点，无法携带 `id` 属性。执行者按计划操作将得到一个不会出现在 DOM 中的 id，或需自行猜测替代方案。

**期望修正**: 明确指定替代目标元素。最合理的方案是将 `id="analysis-section"` 放置在父级 `<section class="punch-analysis-section">`（第255行）上——该元素包裹了加载中/失败/成功三态，且是真实的 DOM 节点。

### [一般] S4 — Risk.vue `id="field-error-container"` 重复

Risk.vue 步骤1（第437行）和步骤2（第602行）各有一个 `v-if="fieldError"` 的 `<div class="field-error">` 提示元素。三个步骤使用 `v-show` 切换，步骤容器同时存在于 DOM 中（仅 CSS 显示/隐藏）。当 `fieldError` 为真时，两个 `v-if` 条件同时满足，DOM 中会出现两个 `id="field-error-container"` 元素，违反 HTML id 唯一性约束。

**期望修正**: 指定不同 id（如 `field-error-container-step1` / `field-error-container-step2`），或说明仅步骤2保留该 id（步骤2是表单提交前的最终校验步骤）。

### [一般] S4 — Risk.vue id 数量与需求不一致

需求 `requirement.md` 规定 Risk.vue 有 9 个 id，但计划仅列出 8 个具体项（3个 data-step + 5个 id）。计划注明"设计文档规定9个id，实际模板结构以代码为准"，但未说明缺少的1个 id 是什么、为何缺失。这可能在后续验证环节引发争议（需求方期望9个，产出只有8个）。

**期望修正**: 核实设计文档中第9个 id 的具体定义，确认是否因模板结构与设计不符而被合理省略，在计划中明确记录差异及理由。

### [一般] S15 — `clearMessages()` 函数定义位置指引不精确

计划第39行说在 `clearAllConversations()` 函数附近"约第734行之前"添加 `clearMessages()` 函数定义。但第734行位于 store 导出区（`return { ... }` 块内），函数定义不应放在此处。`clearAllConversations()` 的函数定义在第605行，位于 action 函数定义区。

**期望修正**: 区分函数定义位置和导出项位置。函数定义应添加在 action 函数区（约第605-700行，`clearAllConversations()` 函数定义之后），导出项应添加在导出区（第703-752行，`clearAllConversations` 导出项附近）。

### [轻微] S3 — LifePlan.vue `fixed` prop 使用缺乏论证

计划为 LifePlan.vue 指定 `<DisclaimerBar fixed />`（第136行），但需求仅要求使用 DisclaimerBar 组件，未指定 `fixed`。当前 `lp-disclaimer` 是内联滚动元素，`fixed` 会改变布局行为（固定于视口底部）。其他5个页面均未使用 `fixed`。计划未解释 LifePlan 为何需要不同于其他页面的定位方式。

### [轻微] S4 — Risk.vue 代码行号指引不完整

计划提示"需阅读 Risk.vue 模板（约第600-700行）确认各元素精确位置"（第163行），该范围仅覆盖步骤3/结果展示区域。但 `data-step="1"` 在第388行、`data-step="2"` 在第451行，均不在 600-700 行范围内。计划正文中的表格已给出正确说明，但行号指引可能误导执行者仅关注步骤3区域而遗漏步骤1/2的修改。

## 修改要求

1. **S4 Punch.vue `id="analysis-section"`**: 改为指定 `<section class="punch-analysis-section">`（第255行）作为目标元素。
2. **S4 Risk.vue `id="field-error-container"`**: 明确处理两个步骤中同名 id 的冲突——采用不同 id 名称或仅保留一个。
3. **S4 Risk.vue id 数量**: 核实设计文档中第9个 id，明确记录差异原因（合理省略或有遗漏）。
4. **S15 clearMessages 函数位置**: 区分函数定义位置（action 函数区，第605行附近）和导出项位置（导出区，第734行附近），分别给出精确指引。
