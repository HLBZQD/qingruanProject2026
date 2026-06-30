# 设计审查报告（v6 r1）

## 审查结果
REJECTED

## 发现

### [一般] S4 Risk.vue -- 缺少设计文档 §4.1.7 指定的 id="step-1/2/3"

详细设计文档 §4.1.7 明确为三个步骤内容容器指定了 `id="step-1"`、`id="step-2"`、`id="step-3"`（L3239, L3263, L3300）。v6 设计将这三个 id 替换为 `data-step="1/2/3"`，未提供对应的 id 属性。需求描述明确要求"按设计文档 §4.1 补充 id 和 data-* 属性"，而这三个 id 是 §4.1.7 中步骤内容容器的核心标识符。下游测试或脚本若使用 `#step-1` / `#step-2` / `#step-3` 选择器将无法定位元素。

期望修正方向：
- 在三个 `<section class="step-panel">` 上补充 `id="step-1"`、`id="step-2"`、`id="step-3"`（可同时保留 data-step），或
- 在修改规格中明确说明放弃这三个 id 的原因，并给出替代选择器方案（如 `[data-step="1"]`），使测试作者知晓。

### [轻微] S4 Risk.vue -- 修改条目计数不一致

设计小节标题写"9 个 id/data-* 属性"，但修改规格表格包含 10 行条目（3 个 data-step + 2 个 field-error 容器 + risk-score + risk-level-badge + risk-level-text + risk-detail-text + suggestions-list）。建议统一计数或注明第4/5行为一对。

### [轻微] S4 Risk.vue -- suggestions-list 与设计文档元素类型不符

设计文档 §4.1.7（L3310）指定 `<ul id="suggestions-list">`，v6 设计将 id 放置在父级 `<div class="advice-card">` 上。当前修改规格已说明原因（v-html 动态渲染导致无法在子元素上预置 id），但未说明与设计文档的偏差。建议在修改规格中显式标注"与设计文档 §4.1.7 的 `<ul>` 差异：因 markdown 动态渲染，id 置于静态容器 div.advice-card"。

### [轻微] S4 Risk.vue -- risk-detail-text 与设计文档元素类型不符

设计文档 §4.1.7（L3307）指定 `<p id="risk-detail-text">`，v6 设计将 id 放置在 `<div class="markdown-body">` 上。当前修改规格已部分说明差异来源，建议与上一条保持一致的偏差标注格式。

## 修改要求

仅列出严重和一般问题的修正要求。

### 问题 1：缺少 id="step-1/2/3"

- **问题**：风险预测三步向导的内容容器缺少设计文档指定的 id 属性。
- **为何是问题**：需求要求按 §4.1 补充 id 属性；自动化测试或 E2E 脚本可能依赖这些 id 选择器定位步骤面板；`data-step` 是不同语义的属性（标识步骤编号），不能完全替代 id 作为 DOM 唯一标识符的角色。
- **期望修正**：在三个 step-panel section 元素上追加 `id="step-1"`、`id="step-2"`、`id="step-3"`，与现有 `data-step` 属性共存，或补充说明放弃 id 的充分理由及替代选择器。
