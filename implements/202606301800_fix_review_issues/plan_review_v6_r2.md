# 计划审查报告（v6 r2）

## 审查结果
REJECTED

## 发现

### [一般] S4 Risk.vue `id="risk-level-text"` 目标行号不可添加 id

任务计划指定在 Risk.vue 第672行添加 `id="risk-level-text"`，但该行实际代码为：

```html
{{ result.risk_level_label || riskMeta.label }}
```

这是 `<div class="risk-level-badge">`（第670-673行）内部的纯文本插值表达式，不是独立的 HTML 元素，无法附加 `id` 属性。父元素 `<div class="risk-level-badge">`（第670行）已计划添加 `id="risk-level-badge"`，同一个元素不能同时承载两个不同的 `id`。

实现者无法按计划执行此条指令，将面临歧义：
- (a) 用 `<span id="risk-level-text">` 包裹第672行文本插值
- (b) 将 `id="risk-level-text"` 添加到 `<p class="result-hint">`（第675行）——该元素语义上更接近"风险等级文字描述"
- (c) 放弃添加此 id

不同实现者可能做出不同选择，导致 DOM 锚点不一致，背离设计文档 §4.1 的规定意图。

### [轻微] S4 Punch.vue 行号范围指引不准确

计划称"需阅读 Punch.vue 模板（约第260-400行）确认各元素精确位置后添加 id 属性"，但 `punch-list`（~第505行）、`empty-container`（~第479行）、`btn-load-more`（~第569行）均位于第450-581行，不在所述范围内。虽然计划已提示实现者自行确认位置，但错误的范围指引可能造成困惑和查找耗时。

### [轻微] S4 Punch.vue `id="punch-list"` 目标元素未指定

计划仅描述为"记录列表根元素"，未明确是以下哪个候选：
- `<section class="punch-list-section">`（第450行）—— 列表区段容器
- `<div class="punch-record-list">`（第505行）—— 记录卡片直接父容器
- `<template v-else>`（第498行）—— Vue 虚拟容器，不渲染为 DOM 节点，不可加 id

实现者需自行判断，存在选错目标元素的风险。

### [轻微] S4 Risk.vue `id="suggestions-list"` 位置描述模糊

计划称该 id 应放在 markdown-body div 的"内部或附近"。由于该 div 的内容（`v-html="safeAdviceHtml(result.advice)"`）为动态渲染的 markdown HTML，"内部"意味着需要 post-render DOM 操作或额外包裹元素。计划未明确实现方式，实现者需自行设计。

## 修改要求

### 对 [一般] S4 `risk-level-text` 行号问题

**问题是什么**：第672行是文本插值表达式而非 HTML 元素，`id` 属性无法附着。

**为什么是问题**：实现者无法按计划执行，必须自行判断替代方案。不同判断导致 DOM 锚点不一致，破坏设计文档 §4.1 规定的测试锚点语义。

**期望的修正方向**：明确 `id="risk-level-text"` 应添加到哪个具体 HTML 元素。建议：
- 用 `<span id="risk-level-text">` 包裹第672行文本插值（最小侵入，保留现有 DOM 结构）
- 或将 id 添加到 `<p class="result-hint">`（第675行），说明该元素语义为"风险等级对应的文字建议描述"，与设计文档 §4.1.7 的"风险等级文字描述"语义匹配
