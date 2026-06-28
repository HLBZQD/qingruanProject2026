# 第4轮详细设计审查报告 v4-r1

> **审查对象**: `detail_v4.md`（详细设计）、`task_v4.md`（任务文件）
> **依据**: `a_v8_diag_v3.md` P3 层（S10/G7/G8/G3/G6/G12/G16）
> **审查维度**: 5 维度逐项审查
> **审查日期**: 2026-06-27

---

## 总体裁决: REJECTED

**原因**: 维度3（G3 getErrorMessage）存在兼容性缺陷——设计遗漏 `response.data.error.message` 提取路径，会导致现有调用点错误消息丢失。维度1（G1）存在 `stroke-dasharray` 硬编码精度不一致问题，属于可修复但需标记。其余3个维度通过。

需修复 **1 个阻断项** 后重新提交审查。其余发现为建议级。

---

## 维度1: G1 DOMPurify 白名单安全完整性

**审查方法**: 逐项比对 detail_v4.md 1.3节白名单配置与实际 Markdown 渲染需求，交叉验证诊断报告 S10 规格。

### 1.1 ALLOWED_TAGS 覆盖率

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| CommonMark 核心标签 (h1-h6, p, br, strong, em, a, ul, ol, li, blockquote, code, pre, hr, img) | PASS | 全部覆盖 |
| GFM 表格扩展 (table, thead, tbody, tr, th, td) | PASS | 全部覆盖 |
| 行内格式扩展 (b, i, u, s) | PASS | `<s>` 覆盖 `~~strikethrough~~` |
| 通用容器 (span, div) | PASS | Markdown 可能产生包装 span/div |
| `<del>` (删除线，~~text~~ 的另一种渲染) | NOTE | 不在白名单。诊断报告和设计文档均未要求。`<s>` 已覆盖 `~~` 语义。若后端 marked 配置产生 `<del>` 而非 `<s>`，需补入。低风险。 |
| `<sup>` / `<sub>` (上/下标) | NOTE | 不在白名单。业务 Markdown 极少使用。设计 1.4 节已说明。低风险。 |
| GFM 任务列表 (`<input type="checkbox">`) | NOTE | `<input>` 在 FORBID_TAGS 中。若 Markdown 使用 `- [ ]` 任务列表语法，复选框会被移除（仅保留文本）。业务方案内容通常不使用任务列表。低风险。 |

**结论**: ALLOWED_TAGS 白名单完整覆盖 Markdown 渲染所需的全部标准标签。PASS。

### 1.2 ALLOWED_ATTR 安全性

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| 链接属性 (href, title, target) | PASS | 覆盖 `<a>` 全部安全属性 |
| 图片属性 (alt, src, width, height) | PASS | 覆盖 `<img>` 展示属性 |
| 样式属性 (class, style) | PASS | DOMPurify 内置 CSS 过滤拦截 expression()/url(javascript:) |
| 事件属性 | PASS | 全部在 FORBID_ATTR 中显式禁止 |
| `id` / `name` (DOM 引用风险) | PASS | 有意排除。设计 1.4 节论证充分（白名单最小化，sanitize 后无脚本可劫持） |
| `rel` (链接关系) | NOTE | 不在白名单。`target="_blank"` 需配合 `rel="noopener noreferrer"` 防范 tabnabbing。设计将此责任归于 marked link renderer（G2 的 marked 配置）。**建议**: 在 G2 的 `renderMarkdown()` 中配置 marked 的 `renderer.link` 自动添加 `rel="noopener noreferrer"`，或在 `sanitizeHtml` 中通过 DOMPurify hooks 自动补全。当前设计将责任外移，存在遗漏风险。 |

### 1.3 FORBID_TAGS / FORBID_ATTR 双保险

**detail_v4.md vs task_v4.md 差异**:

| 配置项 | task_v4.md | detail_v4.md | 判定 |
|--------|-----------|-------------|:----:|
| FORBID_TAGS | 8 项 (style, script, iframe, object, embed, form, input, button) | 11 项 (+ textarea, select, option) | detail_v4 更完整，采纳 detail_v4 |
| FORBID_ATTR | 6 项 (onerror, onload, onclick, onmouseover, onfocus, onblur) | 11 项 (+ onchange, onsubmit, onkeydown, onkeyup, onkeypress) | detail_v4 更完整，采纳 detail_v4 |

detail_v4.md 的双保险覆盖更全面，优于 task_v4.md。PASS。

### 1.4 ALLOWED_URI_REGEXP 修正

**问题识别**: 设计 1.10 节正确识别了诊断报告原始正则 `/^(?:(?:https?|mailto):|[^/]|[^/]\S+)$/i` 无法匹配绝对路径 `/xxx` 的缺陷。

**修正后正则**: `/^(?:(?:https?|mailto):|[/#.]|[^/\s:]+$)/i`

**逐项验证**:

| URI | 预期 | 实际匹配 | 判定 |
|-----|:----:|:----:|:----:|
| `https://example.com` | 允许 | 匹配 alt 1 | PASS |
| `http://example.com` | 允许 | 匹配 alt 1 | PASS |
| `mailto:a@b.com` | 允许 | 匹配 alt 1 | PASS |
| `/news/article/1` | 允许 | 匹配 alt 2 (`/`) | PASS |
| `#section` | 允许 | 匹配 alt 2 (`#`) | PASS |
| `./page.html` | 允许 | 匹配 alt 2 (`.`) | PASS |
| `../page.html` | 允许 | 匹配 alt 2 (`.`) | PASS |
| `page.html` | 允许 | 匹配 alt 3 | PASS |
| `javascript:alert(1)` | 拒绝 | alt 3 遇 `:` 失败 | PASS |
| `JavaScript:alert(1)` | 拒绝 | `/i` 不影响 `[^/\s:]+`，同上 | PASS |
| `data:text/html,<script>` | 拒绝 | alt 3 遇 `:` 失败 | PASS |
| `vbscript:msgbox(1)` | 拒绝 | alt 3 遇 `:` 失败 | PASS |

**PASS — 正则修正正确。**

### 1.5 维度1小结

**PASS** (1 个建议) — 白名单配置安全完整。建议: G2 marked link renderer 需补充 `rel="noopener noreferrer"`。

---

## 维度2: G2 是否正确引用 G1 的 sanitizeHtml()

**审查方法**: 检查 useMarkdown.ts 设计中的 import 路径和调用链。

### 2.1 引用链验证

**detail_v4.md 2.3 节代码**:
```typescript
import { sanitizeHtml } from '@/utils/sanitize'

export function renderMarkdown(markdown: unknown): string {
  // ...
  return sanitizeHtml(rawHtml)
}
```

| 检查项 | 状态 |
|--------|:----:|
| import 路径 `@/utils/sanitize` 正确 | PASS |
| 导入函数名 `sanitizeHtml` 与 G1 export 一致 | PASS |
| 调用方式 `sanitizeHtml(rawHtml)` — 单参数调用，依赖 G1 统一白名单 | PASS |
| 不直接调用 `DOMPurify.sanitize()` | PASS |
| 不使用本地 DOMPurify import | PASS |

### 2.2 LifePlan.vue / Punch.vue 修改后的 import 清理

设计 2.5.4 和 2.6.4 节正确识别了 G1 在 LifePlan/Punch 中添加的 `import { sanitizeHtml }` 可能在 G2 删除本地函数后变为未使用 import 的问题，并明确要求清理。PASS。

### 2.3 维度2小结

**PASS** — G2 正确引用 G1 的 `sanitizeHtml()`，无裸 `DOMPurify.sanitize()` 调用。import 清理逻辑完整。

---

## 维度3: G3 getErrorMessage 对各调用点的兼容性

**审查方法**: 实际读取 LifePlan.vue 和 Punch.vue 当前代码，比对 detail_v4.md 设计的 `getErrorMessage()` 签名和行为。

### 3.1 实际代码现状（已偏离诊断报告描述）

经实际文件读取，LifePlan.vue 和 Punch.vue 的当前 `getErrorMessage` 已被前序轮次（v1/v2/v3）修改为**完全相同**的实现：

```typescript
// LifePlan.vue:134-141 与 Punch.vue:72-86 — 完全一致
function getErrorMessage(err: unknown, fallback = '操作失败，请稍后重试'): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const axiosErr = err as {
      response?: {
        data?: { error?: { message?: string }; message?: string }
        status?: number
      }
    }
    if (axiosErr.response?.data?.error?.message)    // ← 关键：嵌套 error.message 路径
      return axiosErr.response.data.error.message
    if (axiosErr.response?.data?.message)
      return axiosErr.response.data.message
  }
  return fallback
}
```

**与诊断报告描述的关键差异**:
- 诊断报告称 LifePlan fallback 为 `'获取方案失败'`，实际代码为 `'操作失败，请稍后重试'` — 已统一
- 诊断报告称 Punch 有 `if (!err) return ''` 守卫，实际代码**无此守卫** — 已移除
- 两者均**无** `instanceof Error` 检查
- 两者均**无** `typeof err === 'string'` 检查

### 3.2 阻断缺陷: 遗漏 `response.data.error.message` 提取路径

**detail_v4.md G3 设计（第620-633行）**:
```typescript
export function getErrorMessage(err: unknown, fallback = '操作失败，请稍后重试'): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { data?: { message?: string } } }).response
    if (response?.data?.message) return response.data.message
    // ❌ 缺少: response.data.error.message 提取
  }
  if (err instanceof Error) return err.message        // ← 实际代码无此分支（增强，非回归）
  if (typeof err === 'string') return err              // ← 实际代码无此分支（增强，非回归）
  return fallback
}
```

**类型定义差异**:
- 实际代码: `{ response?: { data?: { error?: { message?: string }; message?: string } } }`
- 设计代码: `{ response?: { data?: { message?: string } } }`

**影响**: 如果后端 API 返回错误格式为 `{ data: { error: { message: "具体错误" } } }`（常见于某些后端框架的错误响应格式），当前实际代码可通过 `response.data.error.message` 正确提取，但设计的统一函数会跳过此路径，退回到 `instanceof Error` / `typeof string` / fallback 链。**如果后端恰好使用此格式，G3 部署后会导致错误消息丢失，用户看到通用 fallback 而非具体错误信息。**

**严重程度**: 阻断（功能回归风险）。虽然 `detail_v4.md` 的 `instanceof Error` 和 `typeof err === 'string'` 分支是增强（使函数更通用），但删除 `response.data.error.message` 路径是**净回归**。

**修复方案**: 在 G3 设计的 Axios 提取分支中追加 `response.data.error.message` 检查:

```typescript
if (err && typeof err === 'object' && 'response' in err) {
  const response = (err as {
    response?: {
      data?: {
        error?: { message?: string }
        message?: string
      }
    }
  }).response
  if (response?.data?.error?.message) return response.data.error.message  // ← 补回
  if (response?.data?.message) return response.data.message
}
```

### 3.3 非阻断观察: fallback 默认值已自然统一

实际代码中 LifePlan 和 Punch 的 fallback 均已为 `'操作失败，请稍后重试'`。设计 3.3.1 节关于"两者 fallback 不一致需要审查调用点传参"的讨论在实际代码中已无必要——两者已统一。设计文档此处信息已过时但不影响编码。

### 3.4 非阻断观察: `if (!err) return ''` 守卫已不存在

设计 3.3.2 节讨论的"Punch.vue 空值守卫"在实际代码中已不存在（前序轮次已移除）。设计的兼容性顾虑不再适用。但设计的 `getErrorMessage(null)` 返回 `'操作失败，请稍后重试'`（而非 `''`）的行为正确——因为调用方使用独立错误变量（`listError`/`analysisError`）控制 UI 显示，不依赖 `getErrorMessage()` 返回值判空。

### 3.5 维度3小结

**FAIL** (1 个阻断) — 设计的 `getErrorMessage` 缺少 `response.data.error.message` 提取路径，与现有调用点不兼容。**必须修复后重新审查。** `instanceof Error` 和 `typeof string` 的增设是健壮性增强（非回归），可保留。

---

## 维度4: G4 SVG 环形图边界条件

**审查方法**: 验证数学计算、模板绑定、CSS 动画、边界状态处理。

### 4.1 数学验证

| 参数 | 值 | 验证 |
|------|-----|:----:|
| 半径 r | 40 (在 viewBox 100x100 中) | PASS — 40+8=48 < 50，不溢出 |
| 圆周长 | 2 * Math.PI * 40 ≈ 251.3274 | PASS |
| stroke-width | 8 | PASS |
| 圆心 | (50, 50) — 居中 | PASS |
| 起绘方向 | rotate(-90 50 50) — 12点钟 | PASS |

### 4.2 边界条件矩阵

| 场景 | completionRate | dashOffset | rateText | 验证 |
|------|:---:|:---:|:---:|:----:|
| `analysis === null` | `null` | `CIRCLE_LENGTH` (251.3) | `'-'` | PASS — 除零保护 |
| `total === 0` | `null` | `CIRCLE_LENGTH` | `'-'` | PASS — 除零保护 |
| `completed > total` | `Math.min(x,1)` = 1 | 0 | `'100%'` | PASS — 溢出防御 |
| `completed = 0, total > 0` | 0 | `CIRCLE_LENGTH` | `'0%'` | PASS — 与无数据态区分 |
| `completed = 3, total = 4` | 0.75 | `CIRCLE_LENGTH * 0.25` ≈ 62.83 | `'75%'` | PASS |
| `completed = total` | 1 | 0 | `'100%'` | PASS |

### 4.3 建议: `stroke-dasharray` 精度不一致

**问题**: 模板中硬编码 `stroke-dasharray="251.2"`，但 JS 中 `CIRCLE_LENGTH = 2 * Math.PI * 40 ≈ 251.3274`。两者差约 0.127（0.05%）。

**实际影响**: 视觉上不可见（0.05% 的圆周长差异在 120px 显示尺寸下约 0.06px）。但作为精确性改进，建议模板绑定 computed 值：

```html
<!-- 当前设计 -->
stroke-dasharray="251.2"

<!-- 建议 -->
:stroke-dasharray="CIRCLE_LENGTH"
```

此为非阻断建议。若选择保持硬编码，建议将 JS 常量也改为 `251.2` 或注释说明近似值。

### 4.4 SVG 文本居中

`dominant-baseline="central"` 在主流浏览器（Chrome/Firefox/Safari/Edge）和移动端 WebView 均支持。项目为移动端 H5，无兼容性风险。PASS。

### 4.5 维度4小结

**PASS** (1 个建议) — 边界条件完整，数学正确。建议统一 `stroke-dasharray` 的精度来源。

---

## 维度5: 5 组设计可直接编码性

**审查方法**: 检查每组设计的完整性（文件路径、代码片段、边界条件、验收标准）、跨组依赖清晰度、task_v4.md 与 detail_v4.md 的一致性。

### 5.1 G1 (sanitize.ts)

| 检查项 | 状态 |
|--------|:----:|
| 新建文件路径明确 (`src/utils/sanitize.ts`) | PASS |
| 两函数完整代码提供 | PASS |
| 三处 View 修改步骤具体（import 增/删 + 调用替换） | PASS |
| 边界条件表完整（1.9 节，7 个场景） | PASS |
| ALLOWED_URI_REGEXP 修正（1.10 节） | PASS |
| 验收标准可执行（1.12 节，6 项 AC） | PASS |

**可编码**: YES。设计自包含，可直接按步骤实现。

### 5.2 G2 (useMarkdown.ts)

| 检查项 | 状态 |
|--------|:----:|
| 新建文件路径明确 (`src/composables/useMarkdown.ts`) | PASS |
| renderMarkdown 完整代码提供 | PASS |
| G16 marked async 兼容性注释已包含 | PASS |
| 两处 View 修改步骤具体（import + 删除本地函数 + 模板替换） | PASS |
| sanitizeHtml import 清理逻辑完整（2.5.4 / 2.6.4） | PASS |
| 边界条件表完整（2.8 节，8 个场景） | PASS |
| 验收标准可执行（2.10 节，5 项 AC） | PASS |

**可编码**: YES。前提是 G1 已完成（`sanitizeHtml` 可用）。若无 G1 前置，需临时用裸 DOMPurify + TODO 标记。

### 5.3 G3 (errorMessage.ts) — 需修复后重新判定

| 检查项 | 状态 |
|--------|:----:|
| 新建文件路径明确 (`src/utils/errorMessage.ts`) | PASS |
| getErrorMessage 代码提供 | FAIL — 缺少 `error.message` 路径（见维度3.2） |
| 调用点传参审查逻辑 | PASS (但基于过时的 fallback 差异假设) |
| 边界条件表完整（3.7 节，8 个场景） | PASS |
| 验收标准可执行（3.9 节，5 项 AC） | PASS |

**可编码**: **NO** — 需先修复维度3阻断缺陷。

### 5.4 G4 (环形图)

| 检查项 | 状态 |
|--------|:----:|
| 模板代码完整（SVG + Vue 绑定） | PASS |
| 3 个 computed 完整（completionRate / dashOffset / rateText） | PASS |
| CSS 完整（含动画 transition） | PASS |
| 边界条件表完整（4.8 节，8 个场景） | PASS |
| 替换位置明确（统计卡渐变文字区） | PASS |
| 验收标准可执行（4.10 节，6 项 AC） | PASS |

**可编码**: YES。设计自包含，可直接按步骤实现。

### 5.5 G5 (刷新按钮)

| 检查项 | 状态 |
|--------|:----:|
| 模板代码完整（按钮 + 图标 + 绑定） | PASS |
| onRefresh + 防双击逻辑完整 | PASS |
| 旋转动画延迟机制（500ms）已修正 task_v4.md bug | PASS |
| onUnmounted 清理 timer | PASS |
| CSS 完整（含 @keyframes） | PASS |
| 边界条件表完整（5.9 节，8 个场景） | PASS |
| 验收标准可执行（5.11 节，5 项 AC） | PASS |

**可编码**: YES。detail_v4.md 已修正 task_v4.md 中 `isRefreshing` 立即设 true + 延迟 timer 内再设 true 的冗余 bug。

### 5.6 detail_v4.md vs task_v4.md 一致性

| 差异点 | task_v4.md | detail_v4.md | 判定 |
|--------|-----------|-------------|:----:|
| FORBID_TAGS 数量 | 8 项 | 11 项 | 采纳 detail_v4 |
| FORBID_ATTR 数量 | 6 项 | 11 项 | 采纳 detail_v4 |
| ALLOWED_URI_REGEXP | 原始（有 `/xxx` 缺陷） | 修正版 | 采纳 detail_v4 |
| G5 isRefreshing 设置 | 冗余（两次设 true） | 修正（仅 timer 内设置） | 采纳 detail_v4 |
| ALLOWED_URI_REGEXP 论证 | 无 | 1.10 节完整论证 | detail_v4 更完整 |
| sanitizeHtml 参数类型防御 | `sanitizeHtml(html: string)` | `sanitizeHtml(html: string)` + 1.9 节 null 防御 | 一致，detail_v4 边界更清晰 |

**结论**: detail_v4.md 在所有差异点上优于 task_v4.md。编码时应以 detail_v4.md 为准。

### 5.7 跨组依赖与文件级协调

| 检查项 | 状态 |
|--------|:----:|
| G1→G2 硬依赖链清晰 | PASS |
| G2→G3 建议依赖说明充分 | PASS |
| G4+G5 可并行说明 | PASS |
| Punch.vue 5 处修改区域不重叠 | PASS |
| 跨组依赖验证矩阵完整 | PASS |
| 文件修改汇总表准确 | PASS |

**可编码**: YES。依赖关系清晰，文件修改区域不重叠。

### 5.8 维度5小结

**PASS** (G3 除外) — G1/G2/G4/G5 四组设计可直接编码。G3 待修复维度3阻断缺陷后也可编码。

---

## 审查发现汇总

### 阻断项 (必须修复)

| 编号 | 维度 | 严重程度 | 描述 | 修复位置 |
|:----:|:----:|:----:|------|------|
| **B1** | 3 | 阻断 | `getErrorMessage` 缺少 `response.data.error.message` 提取路径 — 现有代码依赖此路径，丢失后导致错误消息回退到通用 fallback | detail_v4.md 3.2 节 / task_v4.md 3.1 节 |

### 建议项 (非阻断)

| 编号 | 维度 | 严重程度 | 描述 |
|:----:|:----:|:----:|------|
| S1 | 1 | 低 | G2 marked link renderer 建议补充 `rel="noopener noreferrer"`（当前设计将责任外移，存在遗漏风险） |
| S2 | 4 | 极低 | SVG `stroke-dasharray` 建议绑定 computed 常量而非硬编码 `251.2`（精度一致性） |
| S3 | 3 | 极低 | 设计 3.3.1/3.3.2 节关于 fallback 差异和空值守卫的讨论基于过时信息（实际代码已统一），可标注"已完成"而非保持为待审查项 |
| S4 | 5 | 极低 | task_v4.md 中的 FORBID_TAGS/FORBID_ATTR/ALLOWED_URI_REGEXP/G5 onRefresh 应以 detail_v4.md 为准（detail_v4 更完整且修正了已知缺陷） |

---

## 维度裁决汇总

| 维度 | 内容 | 裁决 |
|:----:|------|:----:|
| 1 | G1 DOMPurify 白名单安全完整性 | **PASS** (1建议) |
| 2 | G2 正确引用 G1 sanitizeHtml() | **PASS** |
| 3 | G3 getErrorMessage 调用点兼容性 | **FAIL** (1阻断 B1) |
| 4 | G4 SVG 环形图边界条件 | **PASS** (1建议) |
| 5 | 5 组设计可直接编码性 | **PASS** (G3除外) |

**总裁决: REJECTED** — 修复阻断项 B1 后可 APPROVE。

---

## 修复指导

### B1 修复: 补回 `response.data.error.message` 路径

**修改文件**: `detail_v4.md` 第620-633行 和 `task_v4.md` 第353-360行

**修改内容**: 在 Axios 提取分支中追加 `error.message` 检查和对应的 TypeScript 类型定义:

```typescript
export function getErrorMessage(
  err: unknown,
  fallback: string = '操作失败，请稍后重试',
): string {
  // 优先级 1: Axios 错误响应消息
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as {
      response?: {
        data?: {
          error?: { message?: string }       // ← 新增类型
          message?: string
        }
      }
    }).response
    if (response?.data?.error?.message) return response.data.error.message  // ← 新增提取
    if (response?.data?.message) return response.data.message
  }

  // 优先级 2: 标准 Error 对象
  if (err instanceof Error) return err.message

  // 优先级 3: 字符串错误
  if (typeof err === 'string') return err

  // 优先级 4: 默认 fallback
  return fallback
}
```

**同步更新**: 边界条件表 (detail_v4.md 3.7 节) 增加一条: `{ response: { data: { error: { message: '嵌套错误' } } } }` → 返回 `'嵌套错误'`。

---

*审查报告结束。请修复 B1 后重新提交审查。*
