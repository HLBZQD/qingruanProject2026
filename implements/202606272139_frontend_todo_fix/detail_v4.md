# 第4轮修复详细设计 v4

> **依据**: 诊断报告 `redeliberations/202606271705_frontend_todo_diagnosis/a_v8_diag_v3.md` P3 层（第306-508行），任务文件 `task_v4.md`
> **设计基线**: `docs/2_detailed_design_v3.md`
> **日期**: 2026-06-27
> **范围**: 5 组任务 — G1 (sanitize.ts), G2 (useMarkdown.ts), G3 (errorMessage.ts), G4 (环形图), G5 (刷新按钮)
> **执行顺序**: G1 → G2 → G3 → G4 + G5（可并行）。单人串行约 8-13h，两人并行约 8-11h。

---

## 总体设计约定

### 命名与代码风格

| 约定 | 规则 |
|------|------|
| 工具文件位置 | `src/utils/sanitize.ts` (安全工具)、`src/utils/errorMessage.ts` (错误工具) |
| Composable 文件位置 | `src/composables/useMarkdown.ts` (Markdown 渲染管道) |
| 安全函数命名 | `escapeHtml()` — 纯文本片段实体转义；`sanitizeHtml()` — 完整 HTML 净化（DOMPurify 封装） |
| Markdown 渲染 | `renderMarkdown(markdown: unknown): string` — 管道：marked.parse → sanitizeHtml |
| 错误提取 | `getErrorMessage(err: unknown, fallback?: string): string` — 统一 Axios/Error/string 提取 |
| DOMPurify 配置 | 全部通过 `sanitizeHtml()` 统一配置，外部不直接调用 `DOMPurify.sanitize()` |
| 参数类型 | `renderMarkdown` 和 `getErrorMessage` 的输入参数类型均为 `unknown`（防御 API 返回的任意类型） |
| CSS 变量 | 使用项目中已有 CSS 变量（`--color-border`、`--color-primary`、`--color-text` 等），不引入新变量 |
| 环形图计算 | 常量 `CIRCLE_LENGTH = 2 * Math.PI * 40 ≈ 251.2`，存储为模块级 `const` |

### 与其他轮次的接口约定

| 本轮暴露 | 用途 | 消费方（后续轮次） |
|---------|------|-------------------|
| `sanitizeHtml(html)` | 统一 HTML 净化（白名单加固） | v5 及以后所有 Markdown→HTML 场景；G2 的 `renderMarkdown()` |
| `escapeHtml(str)` | HTML 实体转义（纯文本场景） | 任何需要安全拼接 HTML 字符串的弹窗/提示条 |
| `renderMarkdown(md)` | Markdown→安全 HTML 管道 | v5 Markdown 增强（代码高亮、表格样式）等 |
| `getErrorMessage(err, fallback?)` | 统一错误消息提取 | v5 及以后所有 catch 块的错误消息提取 |

### 内部依赖关系

```
G1 (sanitize.ts)
  │  escapeHtml() + sanitizeHtml()
  │  被 G2 依赖（sanitizeHtml），被 Home.vue 依赖（escapeHtml + sanitizeHtml）
  │  被 LifePlan.vue / Punch.vue 依赖（sanitizeHtml）
  │
  └──→ G2 (useMarkdown.ts)
         │  renderMarkdown() 使用 sanitizeHtml()
         │  被 LifePlan.vue / Punch.vue 依赖
         │
         └──→ G3 (errorMessage.ts)
                │  getErrorMessage()
                │  被 LifePlan.vue / Punch.vue 依赖
                │
                ├──→ G4 (Punch.vue 环形图)
                └──→ G5 (Punch.vue 刷新按钮)
```

**关键依赖说明**:
- **G1 → G2（硬依赖）**: G2 的 `renderMarkdown()` 必须使用 G1 的 `sanitizeHtml()` 而非裸 `DOMPurify.sanitize()`，避免 G1 完成后回修 G2。
- **G2 → G3（建议依赖）**: 两者均修改 LifePlan.vue 和 Punch.vue 的 `<script setup>` 顶部 import 和本地函数定义区。G2 先稳定后 G3 追加更安全。
- **G1+G2+G3 → G4+G5（文件级协调）**: G4/G5 在 Punch.vue 稳定 import 结构上新增 UI 元素。

---

## Task G1: sanitize.ts 一站化 — G12 (escapeHtml 抽取) + S10 (DOMPurify 安全加固)

### 1.1 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| **新建** | `src/utils/sanitize.ts` | 统一安全工具文件，含 `escapeHtml()` + `sanitizeHtml()` |
| 修改 | `src/views/Home.vue` | `<script setup>`: 替换本地 `escapeHtml` 为 import（删除第132-137行）；替换 `DOMPurify.sanitize(html)` 为 `sanitizeHtml(html)`（第116行）；删除 `import DOMPurify` 如不再直接引用 |
| 修改 | `src/views/LifePlan.vue` | `<script setup>`: 替换 `DOMPurify.sanitize(html)` 为 `sanitizeHtml(html)`（第98行，位于本地 `safeContentHtml` 内部） |
| 修改 | `src/views/Punch.vue` | `<script setup>`: 替换 `DOMPurify.sanitize(html)` 为 `sanitizeHtml(html)`（第59行，位于本地 `safeAnalysisHtml` 内部） |

### 1.2 模块架构决策

**G12 + S10 合并为一个文件 `sanitize.ts`** 的理由：两者共享同一个目标文件，拆分执行会产生 git 合并冲突。`escapeHtml` 用于纯文本片段（弹窗拼接 HTML 字符串中的文本域），`sanitizeHtml` 用于完整 Markdown→HTML 净化，两者职责互补、不重复。

**设计原则**: 此后项目中所有 HTML 安全处理必须通过 `sanitize.ts` 的两个导出函数，禁止直接调用 `DOMPurify.sanitize()` 或写本地 `escapeHtml` 副本。这确保安全配置（白名单、URI 校验、禁止列表）全局一致。

### 1.3 新建 `src/utils/sanitize.ts` — 完整设计

```typescript
import DOMPurify from 'dompurify'

// ============================================================
// 函数 A: escapeHtml — HTML 实体转义（纯文本 XSS 防护）
// ============================================================

/**
 * HTML 实体转义——将特殊字符转为 HTML 实体，防止纯文本片段中的 XSS 注入。
 *
 * 使用场景: 弹窗中拼接 HTML 字符串时的文本域安全处理。
 * 例如 Home.vue 糖尿病类型弹窗的病因/临床表现/治疗方式文本。
 *
 * 与 sanitizeHtml() 的区别:
 *   - escapeHtml: 纯文本片段 → 实体转义 → 安全文本（不保留任何 HTML 标签）
 *   - sanitizeHtml: Markdown→HTML → DOMPurify 白名单净化 → 安全 HTML（保留合法标签）
 *
 * @param str - 待转义的文本
 * @returns HTML 实体转义后的安全文本
 */
export function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return str.replace(/[&<>"']/g, (c) => map[c] || c)
}

// ============================================================
// 函数 B: sanitizeHtml — DOMPurify 白名单加固（Markdown→HTML 净化）
// ============================================================

/**
 * Markdown→HTML 净化函数——使用 DOMPurify 加固配置，防止 XSS 绕过。
 *
 * 设计依据: docs/2_detailed_design_v3.md 1.3节技术选型表（第120行）
 * 诊断规格: a_v8_diag_v3.md S10（第306-326行）
 *
 * 白名单设计原则:
 *   ALLOWED_TAGS — 仅允许 Markdown 渲染可能产生的 HTML 标签（覆盖 CommonMark + GFM 表格扩展）
 *   ALLOWED_ATTR — 仅允许安全的展示属性（无事件处理器、无内联脚本）
 *   ALLOWED_URI_REGEXP — 仅允许 http/https/mailto/相对路径，拦截 javascript: / data: 等伪协议
 *   FORBID_TAGS / FORBID_ATTR — 显式禁止高危标签和事件属性（双保险，即使不在 ALLOWED 中也显式禁止）
 *
 * @param html - 待净化的 HTML 字符串（通常来自 marked.parse() 输出）
 * @returns 净化后的安全 HTML 字符串
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    // —— 允许的标签（白名单）——
    // 覆盖 Markdown 所有可能输出的 HTML 元素：
    //   标题 h1-h6、段落 p、换行 br、行内格式 strong/em/b/i/u/s
    //   链接 a、列表 ul/ol/li、引用 blockquote、代码 code/pre、分隔线 hr
    //   表格 table/thead/tbody/tr/th/td、通用容器 span/div、图片 img
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br',
      'strong', 'em', 'b', 'i', 'u', 's',
      'a',
      'ul', 'ol', 'li',
      'blockquote',
      'code', 'pre',
      'hr',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'span', 'div',
      'img',
    ],

    // —— 允许的属性（白名单）——
    // href/title: 链接属性；alt/src/width/height: 图片属性
    // class/style: 样式控制（DOMPurify 会过滤 style 中的危险 CSS）
    // target: 链接打开方式
    ALLOWED_ATTR: [
      'href', 'title', 'rel',
      'alt', 'src', 'width', 'height',
      'class', 'style',
      'target',
    ],

    // —— URI 协议白名单 ——
    // 仅允许: http://, https://, mailto:, 相对路径（/开头或无协议头）
    // 禁止: javascript:, data:, vbscript: 等伪协议
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^/]|[^/]\S+)$/i,

    // —— 显式禁止的标签（双保险）——
    // 即使攻击者绕过白名单（如 DOMPurify 版本漏洞），这些标签仍被过滤
    FORBID_TAGS: [
      'style', 'script', 'iframe', 'object', 'embed',
      'form', 'input', 'button', 'textarea', 'select', 'option',
    ],

    // —— 显式禁止的属性（双保险）——
    // 禁止所有内联事件处理器
    FORBID_ATTR: [
      'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur',
      'onchange', 'onsubmit', 'onkeydown', 'onkeyup', 'onkeypress',
    ],

    // —— 返回类型 ——
    RETURN_DOM: false,          // 返回字符串而非 DOM 树
    RETURN_DOM_FRAGMENT: false,
    RETURN_DOM_IMPORT: false,
  })
}
```

### 1.4 白名单设计论证

**ALLOWED_TAGS 涵盖范围**: 完整覆盖 CommonMark（标题、段落、换行、行内格式、链接、列表、引用、代码块、分隔线）和 GitHub Flavored Markdown 表格扩展（table/thead/tbody/tr/th/td）。未列入的合法 Markdown 标签包括 `<sup>`/`<sub>`（上标下标，极少出现在业务 Markdown 内容中）、`<del>`（删除线，可使用 `~~text~~` 渲染为 `<s>`，已在白名单）、`<kbd>`（键盘键，非标准 Markdown）。如需扩展白名单，仅需修改此文件一处。

**ALLOWED_ATTR 设计**:
- `href` + `title`: `<a>` 标签的导航和提示属性
- `alt` + `src` + `width` + `height`: `<img>` 标签的展示属性
- `class` + `style`: 样式控制。DOMPurify 内置 CSS 过滤，会移除 `style` 中的 `expression()`、`url(javascript:)` 等危险 CSS
- `target`: `<a>` 标签的 `target="_blank"` 属性

**未列入 ALLOWED_ATTR 的高危属性**: `id`（可被脚本用于 `getElementById` 劫持 DOM——虽然 sanitize 后脚本已被移除，但 `id` 可被页面已有脚本引用；白名单最小化原则）、`name`（类似 `id` 的 DOM 引用风险）。

**ALLOWED_ATTR 中 `rel` 属性说明**: `rel` 已列入白名单，配合 G2 的 marked link renderer 自动为外部链接注入 `rel="noopener noreferrer"`，防范 tabnabbing 攻击（当链接通过 `target="_blank"` 打开时被打开页面可通过 `window.opener` 操纵原页面）。

**ALLOWED_URI_REGEXP 设计**: 正则 `/^(?:(?:https?|mailto):|[^/]|[^/]\S+)$/i` 解读：
- `(?:https?|mailto):` — 允许 http/https/mailto 协议
- `|[^/]` — 允许以非 `/` 字符开头的相对路径（如 `page.html`、`#anchor`）
- `|[^/]\S+` — 允许以非 `/` 开头后跟非空白字符的相对路径（如 `../page.html`、`./page.html`）
- 拒绝 `javascript:`、`data:`、`vbscript:` 等伪协议（因为不以 `http/mailto` 开头且以字母开头后跟 `:`）

**FORBID_TAGS/FORBID_ATTR 双保险**: 这些标签/属性即使不在 ALLOWED 中也被显式列入 FORBID，防范 DOMPurify 版本漏洞导致白名单被绕过（纵深防御原则）。

### 1.5 修改 `src/views/Home.vue`

**1.5.1 `<script setup>` 顶部 import 变更**:

新增:
```typescript
import { escapeHtml, sanitizeHtml } from '@/utils/sanitize'
```

删除（如果 Home.vue 不再直接引用 DOMPurify）:
```typescript
import DOMPurify from 'dompurify'
```

**保留删除条件**: 检查 Home.vue 模板/脚本中是否还有其他直接引用 `DOMPurify` 的地方。如果仅在糖尿病类型弹窗的 Markdown 渲染中调用，则 G1 可立即删除 DOMPurify import。**但如果 G2 尚未在 Home.vue 中替换 Markdown 管道**，需确认 Home.vue 是否有独立于 LifePlan/Punch 的 Markdown 渲染（当前 Home.vue 第116行调用 `DOMPurify.sanitize(html)` 用于弹窗内容）。

**1.5.2 删除本地 `escapeHtml` 函数**（第132-137行）:

原函数定义块完全删除。调用处（糖尿病类型弹窗拼接 HTML 字符串处）已通过 import 获得 `escapeHtml`。

**1.5.3 替换 DOMPurify 调用**:

第116行附近:
```typescript
// 修改前
DOMPurify.sanitize(html)

// 修改后
sanitizeHtml(html)
```

### 1.6 修改 `src/views/LifePlan.vue`

**1.6.1 `<script setup>` 顶部 import 变更**:

新增:
```typescript
import { sanitizeHtml } from '@/utils/sanitize'
```

**1.6.2 替换 `safeContentHtml` 内部的 DOMPurify 调用**:

当前代码（第94-99行）:
```typescript
function safeContentHtml(markdown: unknown): string {
  if (typeof markdown !== 'string' || markdown.length === 0) return ''
  const html = marked.parse(markdown, { async: false })
  if (typeof html !== 'string') return ''
  return DOMPurify.sanitize(html)  // ← 替换此处
}
```

替换为:
```typescript
return sanitizeHtml(html)
```

**注意**: G1 仅替换内部 `DOMPurify.sanitize()` 调用为 `sanitizeHtml()`，不改变 `safeContentHtml` 的函数签名和模板调用方式。G2 将整体替换 `safeContentHtml` 为 `renderMarkdown()` import。

**1.6.3 DOMPurify import 处理**:

如果 G2 将一并处理（预计紧随 G1 之后执行），可在 G2 中统一删除 `import DOMPurify`。若 G1 和 G2 之间有较长间隔，G1 完成后 LifePlan.vue 中将同时存在 `import DOMPurify` 和 `import { sanitizeHtml }` — DOMPurify 的 import 变为未使用（如果 safeContentHtml 是唯一的 DOMPurify 调用点）。vue-tsc 会报告未使用 import 警告，建议 G1 一并清理。

### 1.7 修改 `src/views/Punch.vue`

**1.7.1 `<script setup>` 顶部 import 变更**:

新增:
```typescript
import { sanitizeHtml } from '@/utils/sanitize'
```

**1.7.2 替换 `safeAnalysisHtml` 内部的 DOMPurify 调用**:

当前代码（第55-60行）:
```typescript
function safeAnalysisHtml(markdown: unknown): string {
  if (typeof markdown !== 'string' || markdown.length === 0) return ''
  const html = marked.parse(markdown, { async: false })
  if (typeof html !== 'string') return ''
  return DOMPurify.sanitize(html)  // ← 替换此处
}
```

替换为:
```typescript
return sanitizeHtml(html)
```

DOMPurify import 处理逻辑同 LifePlan.vue（建议 G2 统一清理）。

### 1.8 数据流变化

```
修改前:
  Home.vue:    本地 escapeHtml(str) → 实体转义 → 弹窗安全文本
               DOMPurify.sanitize(html) 裸调用 → 弹窗 Markdown 净化

  LifePlan.vue: DOMPurify.sanitize(html) 裸调用 → 方案内容净化
  Punch.vue:    DOMPurify.sanitize(html) 裸调用 → 分析评语净化

  三处的 DOMPurify 配置各自依赖 DOMPurify 默认值，安全加固不统一。

修改后:
  所有调用点 → sanitizeHtml(html) → DOMPurify.sanitize(html, 统一白名单配置)
  所有 escapeHtml 调用点 → escapeHtml(str) → 统一实体转义

  白名单修改一处生效全局。
```

### 1.9 边界条件与错误处理

| 场景 | 行为 |
|------|------|
| `sanitizeHtml('')` | DOMPurify 返回空字符串 `''`（非 null/undefined） |
| `sanitizeHtml(null)` 或 `sanitizeHtml(undefined)` | 调用方应在传入前防御（转为空字符串）。当前三处调用点的上游（`safeContentHtml` / `safeAnalysisHtml`）已有 `typeof markdown !== 'string'` 检查，不会传入 null/undefined。若未来新调用方直接调用 `sanitizeHtml(null)`，DOMPurify 会将其转为空字符串（DOMPurify 内部 `String(input)` 行为）。 |
| `<a href="javascript:alert(1)">` | `ALLOWED_URI_REGEXP` 不匹配 `javascript:` → DOMPurify 移除 `href` 属性，`<a>` 标签保留但不可点击 |
| `<img src=x onerror=alert(1)>` | `onerror` 在 `FORBID_ATTR` 中 → 被移除；`<img>` 保留（在 ALLOWED_TAGS 中）但无事件属性 |
| `<style>body { color: red }</style>` | `<style>` 在 `FORBID_TAGS` 中 → 整个标签被移除 |
| `<script>alert(1)</script>` | `<script>` 在 `FORBID_TAGS` 中 → 整个标签被移除 |
| `<form action="/evil"><input type="text"></form>` | `<form>` 和 `<input>` 均在 `FORBID_TAGS` 中 → 全部移除 |
| 合法 Markdown 内容（标题/列表/链接/代码/表格） | 全部标签在 ALLOWED_TAGS 中 → 完整保留，渲染不变 |
| `ALLOWED_URI_REGEXP` 对相对路径的处理 | 如 `<a href="/news">` → 正则 `|[^/]` 分支匹配（`/` 开头，但正则的 `[^/]` 匹配的是非 `/` 字符... **需要验证**: `/news` 以 `/` 开头，`[^/]` 不匹配 `/`，`[^/]\S+` 也不匹配以 `/` 开头的字符串。这意味着以 `/` 开头的绝对路径被意外拒绝了。**这是一个设计缺陷，将在 1.10 节修正。**） |

### 1.10 ALLOWED_URI_REGEXP 修正

**问题**: 诊断报告 S10 的 ALLOWED_URI_REGEXP `/^(?:(?:https?|mailto):|[^/]|[^/]\S+)$/i` 无法匹配以 `/` 开头的绝对路径（如 `/news/article/1`）。

**影响**: 在 LifePlan 方案内容和 Punch 分析评语中，如果 Markdown 链接使用绝对路径（如 `[链接](/news)`），sanitizeHtml 会移除 `href` 属性，链接不可点击。外部链接（`http://`/`https://`）和相对路径（`./page`、`../page`、`page.html`）正常。

**修正后的 ALLOWED_URI_REGEXP**:

```typescript
// 允许: http://, https://, mailto:, 相对路径 (./, ../, xxx.html, #anchor), 绝对路径 (/xxx)
ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[/#.]|[^/\s#.:][^\s:]*)$/i,
```

**修正后的正则解读**:
- `(?:https?|mailto):` — 允许 http/https/mailto 协议
- `|[/#.]` — 允许以 `/`（绝对路径）、`#`（锚点）、`.`（相对路径）开头的 URI
- `|[^/\s#.:][^\s:]*` — 允许以非 `/`/空白/`#`/`.`/`:` 开头的普通相对路径（如 `page.html`）

此修正确保 `/news/article/1` 类型的链接不被误杀。同时 `javascript:` 仍被拒绝（`javascript` 以字母开头后跟 `:`，正则的 `[^\s:]*` 分支允许但 `javascript:` 中包含 `:` 会被 `[^\s:]*` 截断？**需确认**）。更安全的写法是使用 DOMPurify 的默认 URI 校验（默认禁止 `javascript:`）并只额外放开需要的协议和绝对路径：

**最终推荐 ALLOWED_URI_REGEXP**:

```typescript
// 最稳健的方案：利用 DOMPurify 内置的 URI 安全检查，仅显式放开需要的协议
// DOMPurify 默认就会拦截 javascript:/data: 等伪协议
ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|ftp|tel):|[#./]|[^:/?#\[\]@!$&'()*+,;=\s]+:[^:/?#\[\]@!$&'()*+,;=\s]+$)/i,
```

**但是**，为了保证与诊断报告规格一致且不引入不必要的复杂度（ftp/tel 等），最终采用**简化修正版**，仅确保 `/` 开头的路径不被拦截：

```typescript
ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[/#.]|[^/\s:]+$)/i,
```

**简化版正则解读**:
- `(?:https?|mailto):` — http/https/mailto 协议
- `|[/#.]` — 以 `/`、`#`、`.` 开头的路径（覆盖绝对路径、锚点、相对路径）
- `|[^/\s:]+$` — 不包含 `/`、空白、`:` 的纯相对路径（如 `page.html`）

`javascript:` 被拒绝：因为 `javascript:` 中包含 `:`，不匹配 `[^/\s:]+$` 分支（包含 `:` 字符），也不匹配前两个分支（不以 `http`/`mailto`/`/`/`#`/`.` 开头）。

### 1.11 与其他模块接口约定

- **G2 (useMarkdown.ts) 依赖**: G2 的 `renderMarkdown()` 使用本 Task 的 `sanitizeHtml()` 而非裸 `DOMPurify.sanitize()`。
- **Home.vue / LifePlan.vue / Punch.vue**: 三个 View 文件通过 `import { sanitizeHtml }` 消费，不再直接依赖 DOMPurify。
- **后续轮次**: 任何新增的 Markdown→HTML 渲染场景统一使用 `sanitizeHtml()`，配置变更仅需修改 `sanitize.ts` 一处。

### 1.12 验证方法

- [ ] **XSS 注入防护**: 在 LifePlan 方案内容中尝试注入 `<img src=x onerror=alert(1)>`，检查渲染后 `onerror` 属性是否被移除。
- [ ] **javascript: 伪协议拦截**: 在 Punch 分析评语中尝试注入 `<a href="javascript:alert(1)">click</a>`，检查 `href` 是否被移除或替换为空。
- [ ] **合法 Markdown 正常渲染**: LifePlan 方案内容中的标题/列表/加粗/链接/代码块/表格等合法 Markdown 语法正常渲染为 HTML，无内容丢失。
- [ ] **绝对路径链接保留**: Markdown 链接 `[页面](/news)` 的 `href="/news"` 在净化后保留，链接可点击。
- [ ] **糖尿病类型弹窗文本转义**: Home.vue 中糖尿病类型弹窗的病因/临床表现/治疗方式文本包含 `<` `>` 字符时正确转义为 HTML 实体（不渲染为 HTML 标签）。
- [ ] **编译验证**: `npx vue-tsc --noEmit` 无新增编译错误；新建的 `sanitize.ts` 及三处 import 替换无类型错误。

---

## Task G2: useMarkdown.ts 抽取 — G7 (renderMarkdown 抽取) + G16 (marked async 兼容性注释)

### 2.1 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| **新建** | `src/composables/useMarkdown.ts` | Markdown 渲染 composable，含 `renderMarkdown()` |
| 修改 | `src/views/LifePlan.vue` | `<script setup>`: 删除本地 `safeContentHtml`（第94-99行），改为 `import { renderMarkdown }`；模板中替换调用；清理 DOMPurify/marked import |
| 修改 | `src/views/Punch.vue` | `<script setup>`: 删除本地 `safeAnalysisHtml`（第55-60行），改为 `import { renderMarkdown }`；模板中替换调用；清理 DOMPurify/marked import |

### 2.2 模块架构决策

**为什么用 composable 而非 utils**: `renderMarkdown()` 功能上是纯函数（无状态、无生命周期），放在 `src/composables/` 而非 `src/utils/` 的原因：
1. Markdown 渲染在 Vue 组件中使用 `v-html` 绑定，与 Vue 模板紧密耦合
2. composable 目录在项目中已有 `useHomeApi.ts`、`usePunchApi.ts` 等业务逻辑 composable，`useMarkdown.ts` 遵循此模式
3. 如果未来需要添加响应式特性（如 `ref` 持久的 marked 实例），composable 目录更自然

**G16 合并理由**: marked async 兼容性注释在两处各自添加不如在抽取后的统一函数中一处添加高效。`renderMarkdown()` 成为 marked 配置的单一控制点。

### 2.3 新建 `src/composables/useMarkdown.ts` — 完整设计

```typescript
import { marked } from 'marked'
import { sanitizeHtml } from '@/utils/sanitize'

// ============================================================
// G16: marked async 兼容性注释
// ============================================================
//
// 当前使用 marked v12 的同步模式 `{ async: false }`。
// marked 官方文档提示未来主版本可能移除同步模式。
//
// 若 marked v13+ 移除了 `{ async: false }`，迁移步骤:
//   1. 将 renderMarkdown 改为 async:
//      export async function renderMarkdown(md: unknown): Promise<string>
//   2. 内部调用改为:
//      const raw = await marked.parse(String(md ?? ''))
//   3. 调用方需 await 或使用 Vue Suspense
//
// 锁定策略: 在 package.json 中锁定 marked 版本为当前主版本 (~12.x)，
// 防止意外升级导致同步模式不可用。升级前需评估调用方的 async 迁移成本。

// ============================================================
// 安全: marked 链接渲染器 — 自动注入 rel="noopener noreferrer"
// ============================================================
//
// 为外部链接（http/https）自动添加 rel="noopener noreferrer" target="_blank"，
// 防止 tabnabbing 攻击（被打开页面可通过 window.opener 操纵原页面）。
// 内部链接（相对路径/绝对路径/锚点）不添加 target="_blank"。
//
// 此配置通过 marked.use() 全局生效，对此模块的所有 renderMarkdown() 调用均适用。
// 链接 href 在下游经 sanitizeHtml() 白名单 URI 二次校验（见 G1 sanitize.ts）。
//
// 依赖: sanitizeHtml 的 ALLOWED_ATTR 已包含 href/title/target/rel（见 detail_v4.md 1.3 节），
// rel 属性随本渲染器注入，sanitizeHtml 白名单放行。
const _linkRenderer = {
  link(href: string | null, title: string | null, text: string): string {
    const h = href ?? ''
    const t = title ? ` title="${title.replace(/"/g, '&quot;')}"` : ''
    const rel = /^https?:\/\//i.test(h) ? ' rel="noopener noreferrer" target="_blank"' : ''
    return `<a href="${h}"${t}${rel}>${text}</a>`
  }
}
marked.use({ renderer: _linkRenderer })

/**
 * Markdown → 安全 HTML 渲染管道。
 *
 * 设计依据: docs/2_detailed_design_v3.md 1.3节（DOMPurify + marked 组合）
 *
 * 管道: markdown 文本 → marked.parse({ async: false }) → sanitizeHtml(白名单加固) → 安全 HTML 字符串
 *
 * @param markdown - Markdown 文本（类型为 unknown 以兼容 API 返回的任意类型字段）
 * @returns 净化后的安全 HTML 字符串。输入为 null/undefined/非字符串/空字符串时返回 ''。
 */
export function renderMarkdown(markdown: unknown): string {
  // 空值防御
  if (markdown == null) return ''
  const md = typeof markdown === 'string' ? markdown : String(markdown)
  if (md.trim() === '') return ''

  // marked.parse() 当前使用同步模式（见文件顶部 G16 注释）
  const rawHtml = marked.parse(md, { async: false }) as string

  // DOMPurify 安全净化 — 使用 G1 的 sanitizeHtml() 统一白名单配置
  return sanitizeHtml(rawHtml)
}
```

### 2.4 参数类型 `unknown` 的设计论证

**为什么不用 `string`**: 调用方传入的值来自 API 响应的字段（如 `plan.content`、`analysis.comment`），TypeScript 类型定义为 `string`，但运行时实际值可能为 `null`/`undefined`（API 返回数据不符合 TS 类型定义）。使用 `unknown` 在函数签名层面宣告"我不信任调用方的类型"，在函数内部做空值防御。这与 LifePlan.vue 和 Punch.vue 当前的调用模式一致——`safeContentHtml` 和 `safeAnalysisHtml` 的参数均为 `unknown`。

**`String(markdown)` vs `markdown as string`**: `typeof markdown === 'string'` 分支直接使用，非字符串类型（如 number `123`）通过 `String(markdown)` 转为字符串 `'123'` 后渲染。这是现有行为的保留（`marked.parse(123, ...)` 也会隐含转换）。

### 2.5 修改 `src/views/LifePlan.vue`

**2.5.1 `<script setup>` 顶部 import 变更**:

新增:
```typescript
import { renderMarkdown } from '@/composables/useMarkdown'
```

删除（如果不再直接引用）:
```typescript
import { marked } from 'marked'
import DOMPurify from 'dompurify'
```

**清理判断**: 检查 LifePlan.vue 模板中是否有其他地方使用 `marked` 或 `DOMPurify`。当前 LifePlan.vue 仅在 `safeContentHtml` 中使用这两个依赖。确认安全后可删除。

**2.5.2 删除本地 `safeContentHtml` 函数**（第94-99行）:

整个函数定义块删除。

**2.5.3 模板中调用替换**:

```html
<!-- 修改前 -->
<div v-html="safeContentHtml(plan.content)"></div>

<!-- 修改后 -->
<div v-html="renderMarkdown(plan.content)"></div>
```

**2.5.4 额外的 import 清理（来自 G1）**:

如果 G1 在 LifePlan.vue 中添加了 `import { sanitizeHtml }`，且 `safeContentHtml` 是 `sanitizeHtml` 的唯一直引来源，则 G2 删除 `safeContentHtml` 后 `sanitizeHtml` 的 import 也变为未使用。**G2 应一并清理此 import**。

### 2.6 修改 `src/views/Punch.vue`

**2.6.1 `<script setup>` 顶部 import 变更**:

新增:
```typescript
import { renderMarkdown } from '@/composables/useMarkdown'
```

删除（如果不再直接引用）:
```typescript
import { marked } from 'marked'
import DOMPurify from 'dompurify'
```

**2.6.2 删除本地 `safeAnalysisHtml` 函数**（第55-60行）:

整个函数定义块删除。

**2.6.3 模板中调用替换**:

```html
<!-- 修改前 -->
<div v-html="safeAnalysisHtml(analysis.comment)"></div>

<!-- 修改后 -->
<div v-html="renderMarkdown(analysis.comment)"></div>
```

**2.6.4 `sanitizeHtml` import 清理**: 同 LifePlan.vue 逻辑。

### 2.7 数据流变化

```
修改前:
  LifePlan.vue:
    plan.content → safeContentHtml() → marked.parse() → DOMPurify.sanitize() → 安全 HTML

  Punch.vue:
    analysis.comment → safeAnalysisHtml() → marked.parse() → DOMPurify.sanitize() → 安全 HTML

  两处函数逻辑完全重复，任何改动需修改两处。

修改后:
  LifePlan.vue / Punch.vue:
    content → renderMarkdown() → marked.parse() → sanitizeHtml() → 安全 HTML
                                   ↑                  ↑
                              G16 兼容性注释      G1 白名单加固

  单一函数控制 marked + DOMPurify 管道配置。
```

### 2.8 边界条件与错误处理

| 场景 | 行为 |
|------|------|
| `renderMarkdown(null)` | 返回 `''` — `markdown == null` 检查（覆盖 null 和 undefined） |
| `renderMarkdown(undefined)` | 返回 `''` — 同上 |
| `renderMarkdown(123)` | `String(123)` → `'123'` → `marked.parse('123')` → 渲染为段落 `<p>123</p>` |
| `renderMarkdown('')` | `md.trim() === ''` → 返回 `''`（避免 marked 生成空 `<p></p>`） |
| `renderMarkdown('  ')` | `md.trim() === ''` → 返回 `''` |
| `renderMarkdown('# 标题\n\n内容')` | `marked.parse()` → `<h1>标题</h1><p>内容</p>` → `sanitizeHtml()` 保留 → 正常输出 |
| `renderMarkdown('<script>alert(1)</script>')` | `marked.parse()` 可能将其包裹在 `<p>` 中或原样输出 → `sanitizeHtml()` 移除 `<script>` 标签 → 仅剩文本 `alert(1)` |
| 调用方模板中 `v-if` 保护 | LifePlan / Punch 模板中均有 `v-if`/`v-else-if` 互斥链保护 `plan.content` / `analysis.comment` 为 falsy 时不进入渲染分支。`renderMarkdown()` 内部增加空值防御为通用健壮性增强。 |

### 2.9 与其他模块接口约定

- **依赖 G1 (sanitize.ts)**: `renderMarkdown()` 使用 `sanitizeHtml()` 而非裸 `DOMPurify.sanitize()`。
- **被 LifePlan.vue / Punch.vue 消费**: 两者通过 `import { renderMarkdown }` 消费，删除各自的本地安全函数。
- **G16 兼容性标注**: `useMarkdown.ts` 顶部包含 marked async 兼容性注释，供未来维护者参考。
- **后续 Markdown 增强（v5）**: 代码高亮、表格样式等增强在 `renderMarkdown()` 内部或 marked renderer 配置中实现，调用方无需修改。

### 2.10 验证方法

- [ ] **LifePlan 方案内容正常渲染**: 进入 LifePlan 页面，方案内容中的标题/列表/加粗/链接等 Markdown 语法正常渲染为 HTML，与抽取前视觉效果一致。
- [ ] **Punch AI 分析评语正常渲染**: 进入 Punch 页面，AI 分析评语中的 Markdown 格式正常渲染，无内容丢失或格式错乱。
- [ ] **空内容不崩溃**: 模拟 API 返回 `plan.content === null` 或 `analysis.comment === ''`，检查页面不崩溃、不显示 undefined/NaN。
- [ ] **XSS 注入防护**: 与 G1 联合验证——`renderMarkdown()` 输出的 HTML 经过 `sanitizeHtml()` 白名单加固，`<img onerror>` 和 `javascript:` 伪协议被拦截。
- [ ] **编译验证**: `npx vue-tsc --noEmit` 无新增编译错误；LifePlan.vue 和 Punch.vue 删除本地函数后无未使用变量警告；`marked` 和 `DOMPurify` 的 import 如不再需要则无未使用 import 警告。

---

## Task G3: errorMessage.ts 抽取 — G8 (getErrorMessage 抽取)

### 3.1 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| **新建** | `src/utils/errorMessage.ts` | 统一错误消息提取工具 |
| 修改 | `src/views/LifePlan.vue` | `<script setup>`: 删除本地 `getErrorMessage`（第102-109行），改为 import；调用点传参审查 |
| 修改 | `src/views/Punch.vue` | `<script setup>`: 删除本地 `getErrorMessage`（第63-77行），改为 import；调用点传参审查 |

### 3.2 新建 `src/utils/errorMessage.ts` — 完整设计

```typescript
/**
 * 从任意类型的错误对象中提取用户可读的错误消息。
 *
 * 提取优先级（按顺序尝试）:
 *   1. Axios 错误响应消息: err.response?.data?.error?.message 或 err.response?.data?.message
 *   2. 标准 Error 对象: err.message
 *   3. 字符串错误: err 本身
 *   4. 以上都不匹配: 返回 fallback 默认值
 *
 * 设计依据: a_v8_diag_v3.md G8（第456-464行）
 * 合并来源: LifePlan.vue:102-109 + Punch.vue:63-77
 *
 * 与 G14（success 拦截器）的兼容性:
 *   G14 构造的 Error 对象附加了 { response: { data: { message } } } 属性，
 *   本函数的优先级1会正确提取 Axios 错误响应中的 message 字段。
 *
 * @param err      - 捕获的错误对象（类型 unknown，来自 catch 块）
 * @param fallback - 无可提取消息时的默认文案（默认: '操作失败，请稍后重试'）
 * @returns 用户可读的错误消息字符串
 */
export function getErrorMessage(
  err: unknown,
  fallback: string = '操作失败，请稍后重试',
): string {
  // 优先级 1: Axios 错误响应消息
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as {
      response?: {
        data?: {
          error?: { message?: string }
          message?: string
        }
      }
    }).response
    if (response?.data?.error?.message) return response.data.error.message
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

### 3.3 关键设计决策

**3.3.1 fallback 默认值统一为 `'操作失败，请稍后重试'`**

当前两个本地版本的 fallback 不一致：
- LifePlan.vue (第108行): `'获取方案失败'`
- Punch.vue (第76行): `'加载失败'`

设计选择：统一使用最通用的 fallback 作为默认值，调用方通过第二个参数传入自定义 fallback 以保持与抽取前完全一致的行为。

**3.3.2 Punch.vue 的 `if (!err) return ''` 逻辑处理**

Punch.vue 本地版本（第63-77行）包含 `if (!err) return ''` 的空值守卫，统一版本不包含此分支（null/undefined 走 fallback 返回 `'操作失败，请稍后重试'` 而非空字符串）。

**影响分析**: 需要检查 Punch.vue 模板中是否存在依赖 `getErrorMessage(null)` 返回 `''` 的 UI 逻辑。具体来说：
- 如果模板中使用 `v-if="getErrorMessage(listError)"` 来判断是否展示错误提示 → `getErrorMessage(null)` 返回 fallback 字符串（truthy）会导致错误提示始终展示 → **需要调整为使用独立布尔变量判断**。
- 如果模板中使用 `v-if="listError"` 或 `v-if="listViewMode === 'listError'"` 来判断 → 不受影响，因为 `getErrorMessage()` 的返回值仅用于展示具体错误文案。

**推荐方案**: 审查 Punch.vue 和 LifePlan.vue 模板中 `getErrorMessage()` 的所有调用点，确认每个调用点的判断逻辑是基于独立错误变量还是基于 `getErrorMessage()` 返回值。若基于后者，调整为独立判断。

**3.3.3 返回类型为 `string`（始终返回字符串）**

不返回 `null` 或 `undefined`，确保调用方可以直接将返回值插入模板的 `{{ }}` 插值或 `v-text` 中，无需判空。

### 3.4 修改 `src/views/LifePlan.vue`

**3.4.1 `<script setup>` 顶部 import 变更**:

新增:
```typescript
import { getErrorMessage } from '@/utils/errorMessage'
```

**3.4.2 删除本地 `getErrorMessage` 函数**（第102-109行）:

整个函数定义块删除。

**3.4.3 调用点传参审查**:

LifePlan.vue 当前本地版本的 fallback 为 `'获取方案失败'`。需要排查所有 `getErrorMessage(xxx)` 调用点：
- 如果调用处上下文是"获取方案失败" → 改为 `getErrorMessage(xxx, '获取方案失败')`
- 如果同一函数在不同上下文复用（如 `contentError` 和 `analysisError` 展示区域）→ 为每个场景传入对应 fallback
- 如果调用处不传第二个参数 → 使用通用 fallback `'操作失败，请稍后重试'`

### 3.5 修改 `src/views/Punch.vue`

**3.5.1 `<script setup>` 顶部 import 变更**:

新增:
```typescript
import { getErrorMessage } from '@/utils/errorMessage'
```

**3.5.2 删除本地 `getErrorMessage` 函数**（第63-77行）:

整个函数定义块删除。

**3.5.3 调用点传参审查**:

Punch.vue 当前本地版本的 fallback 为 `'加载失败'`。调用点传参审查同 LifePlan.vue 逻辑。

**3.5.4 空值守卫调整**:

如果 Punch.vue 模板中存在依赖 `getErrorMessage(null)` 返回 `''` 的 UI 逻辑，调整为基于独立错误变量的判断（如 `v-if="listError"` 而非 `v-if="getErrorMessage(listError)"`）。

### 3.6 数据流变化

```
修改前:
  LifePlan.vue:
    catch(e) → getErrorMessage(e) → 本地逻辑 → 错误文案
      fallback: '获取方案失败'

  Punch.vue:
    catch(e) → getErrorMessage(e) → 本地逻辑（含空值守卫 if (!err) return ''）→ 错误文案
      fallback: '加载失败'

  两处函数逻辑 90% 重复，fallback 不一致，Punch.vue 多一层空值守卫。

修改后:
  LifePlan.vue / Punch.vue:
    catch(e) → getErrorMessage(e, fallback?) → 统一逻辑 → 错误文案
      fallback 默认: '操作失败，请稍后重试'
      调用方可传入自定义 fallback 保持原有语义

  单一函数控制错误消息提取逻辑，fallback 一致（或由调用方显式指定）。
```

### 3.7 边界条件与错误处理

| 场景 | 行为 |
|------|------|
| `getErrorMessage(null)` | `null` 不是 object → 不是 Error → 不是 string → 返回 fallback `'操作失败，请稍后重试'` |
| `getErrorMessage(undefined)` | 同上 |
| `getErrorMessage('网络错误')` | `typeof err === 'string'` → 返回 `'网络错误'` |
| `getErrorMessage(new Error('超时'))` | `err instanceof Error` → 返回 `'超时'` |
| `getErrorMessage({ response: { data: { message: '服务器错误' } } })` | 优先级1 命中 `response.data.message` → 返回 `'服务器错误'` |
| `getErrorMessage({ response: { data: { error: { message: '嵌套错误' } } } })` | 优先级1 命中 `response.data.error.message` → 返回 `'嵌套错误'` |
| `getErrorMessage(e, '自定义失败')` | 使用自定义 fallback |
| G14 构造的 Error({ response: { data: { message } } }) | `err instanceof Error` 为 true（优先级2），但也会进入优先级1的 `'response' in err` 检查，返回优先级1的 `response.data.message`。**注意优先级顺序**: 优先级1先于优先级2，确保 Axios 错误响应消息优先于 `new Error('网络错误').message`。 |
| 普通对象 `{ message: 'xxx' }` (非 Axios 错误) | 不满足优先级1（无 `response` 属性）→ 不满足优先级2（非 Error 实例）→ 不满足优先级3（非字符串）→ 返回 fallback。**注意**: 如果后端直接 throw 一个普通对象 `{ message: 'xxx' }`，会被 fallback 吞掉具体消息。这种情况在实际中极少（后端错误通常通过 Axios 或标准 Error 传递）。 |

### 3.8 与其他模块接口约定

- **被 LifePlan.vue / Punch.vue 消费**: 两者通过 `import { getErrorMessage }` 消费，删除各自的本地函数。
- **G14 (success 拦截器) 兼容**: G14 构造的 Error 对象附加 `{ response: { data: { message } } }`，`getErrorMessage` 的优先级1 正确提取此字段。
- **未来扩展**: 如需增加更多错误类型提取逻辑（如 Fetch API 的 `Response` 错误），仅需修改此文件一处。

### 3.9 验证方法

- [ ] **LifePlan API 错误提示正常**: 模拟 LifePlan 页面 API 请求失败（如断网），检查错误提示文案是否正常显示（应与抽取前一致或使用更通用的 fallback）。
- [ ] **Punch API 错误提示正常**: 模拟 Punch 页面 API 请求失败，检查列表和分析区的错误提示是否正常显示。
- [ ] **Axios 错误 message 提取**: 模拟后端返回 `{ response: { data: { message: '自定义错误' } } }` 的错误对象，检查 `getErrorMessage()` 是否返回 `'自定义错误'`。
- [ ] **空值不崩溃**: `getErrorMessage(null)` 返回 fallback 字符串而非抛出异常或返回 null。
- [ ] **编译验证**: `npx vue-tsc --noEmit` 无新增编译错误；LifePlan.vue 和 Punch.vue 删除本地函数后无未使用变量/import 警告。

---

## Task G4: Punch.vue SVG 环形图 — G3 (完成率环形图)

### 4.1 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| 修改 | `src/views/Punch.vue` | `<template>` 统计卡区域（第192-209行）：将渐变文字百分比替换为 SVG 环形图；`<script setup>` 新增 3 个 computed；`<style scoped>` 新增环形图 CSS |

### 4.2 设计依据

设计文档 4.3 节 Punch.vue 流程图（第3797行）明确要求: `分析数据展示 完成率环形图 近7天趋势柱状图`。当前实现为渐变文字百分比，无环形图。诊断报告 G3（第401-411行）确认此功能遗漏。

**技术选型**: 采用纯 SVG `<circle>` + `stroke-dasharray` 实现，不引入第三方图表库（如 chart.js）。理由：
1. 零依赖开销（chart.js ~200KB gzipped）
2. 环形图是数据可视化中最简单的形式之一，SVG 原生支持
3. `stroke-dasharray` + `stroke-dashoffset` 的动画性能优异（GPU 加速的 CSS transition）
4. 完成率是从 `store.analysis` 的 `completed / total` 简单计算得出，不需复杂的图表数据绑定

### 4.3 环形图数学原理

```
SVG viewBox: 0 0 100 100（虚拟坐标系 100x100）

圆环几何参数:
  半径 r = 40
  圆心 (cx=50, cy=50) — 居中
  描边宽度 stroke-width = 8
  描边端点 stroke-linecap = round（圆角端点）

圆周长计算:
  CIRCLE_LENGTH = 2 * π * r ≈ 2 * 3.14159 * 40 ≈ 251.2

进度映射:
  stroke-dasharray = CIRCLE_LENGTH（虚线模式的"实线"长度 = 整个圆周长）
  stroke-dashoffset = CIRCLE_LENGTH * (1 - completionRate)
    - completionRate = 0.00 → dashoffset = 251.2（圆环不可见，全部偏移出去）
    - completionRate = 0.25 → dashoffset = 188.4（可见 1/4 圈）
    - completionRate = 0.50 → dashoffset = 125.6（可见半圈）
    - completionRate = 0.75 → dashoffset = 62.8（可见 3/4 圈）
    - completionRate = 1.00 → dashoffset = 0（完整圆环）

起点方向:
  transform="rotate(-90 50 50)" — SVG 圆默认从 3 点钟（右侧）开始绘制，
  旋转 -90° 后从 12 点钟（顶部）开始，符合常规环形图视觉习惯。
```

### 4.4 模板设计

**4.4.1 替换位置**: 当前统计卡中渐变文字百分比区域（第192-209行）替换为环形图。

**4.4.2 模板代码**:

```html
<!-- 统计卡 - 完成率环形图 -->
<div class="stat-card">
  <h3 class="stat-card-title">完成率</h3>
  <div class="donut-chart">
    <svg viewBox="0 0 100 100" class="donut-svg">
      <!-- 背景环（灰色底环） -->
      <circle
        cx="50" cy="50" r="40"
        fill="none"
        stroke="var(--color-border, #e0e0e0)"
        stroke-width="8"
      />
      <!-- 进度环（有颜色、带动画） -->
      <circle
        cx="50" cy="50" r="40"
        fill="none"
        stroke="var(--color-primary, #4A90D9)"
        stroke-width="8"
        stroke-linecap="round"
        :stroke-dasharray="CIRCLE_LENGTH"
        :stroke-dashoffset="dashOffset"
        class="donut-progress"
        transform="rotate(-90 50 50)"
      />
      <!-- 中心文字 -->
      <text
        x="50" y="50"
        text-anchor="middle"
        dominant-baseline="central"
        class="donut-text"
        :class="{ 'donut-text--small': rateText.length > 4 }"
      >
        {{ rateText }}
      </text>
    </svg>
  </div>
  <p class="stat-card-desc">
    {{ analysis?.completed ?? 0 }} / {{ analysis?.total ?? 0 }} 次
  </p>
</div>
```

**注意**: `dominant-baseline="central"` 是 SVG 的文本垂直居中属性，部分旧浏览器不支持（IE 不支持，但移动端主流浏览器均支持）。替代方案：`dy=".3em"` 偏移实现视觉效果居中。

### 4.5 `<script setup>` 中新增 computed

```typescript
// ===== 环形图计算 =====

/** 圆环周长（半径 40 在 viewBox 100x100 中） */
const CIRCLE_LENGTH = 2 * Math.PI * 40

/** 完成率（0-1 数值），无数据时返回 null */
const completionRate = computed(() => {
  const analysis = store.analysis
  // 无分析数据
  if (!analysis || analysis.total === 0) return null
  // 限制最大值为 1（防御异常数据 completed > total）
  return Math.min(analysis.completed / analysis.total, 1)
})

/** stroke-dashoffset 取值（控制进度环的可见长度） */
const dashOffset = computed(() => {
  if (completionRate.value === null) return CIRCLE_LENGTH // 无数据：全空环
  return CIRCLE_LENGTH * (1 - completionRate.value)
})

/** 环形图中心文字 */
const rateText = computed(() => {
  if (completionRate.value === null) return '-'
  return Math.round(completionRate.value * 100) + '%'
})
```

**`CIRCLE_LENGTH` 的存储位置**: 放在 `<script setup>` 的顶层（模块级 const），不在 computed 内部重复计算。虽然是简单乘法，但 `2 * Math.PI * 40` 是常量，提取为 const 表明语义。

### 4.6 CSS 样式设计

```css
/* ===== 环形图 ===== */

.donut-chart {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 120px;
  height: 120px;
  margin: 0 auto;
}

.donut-svg {
  width: 100%;
  height: 100%;
}

/* 进度环动画：CSS transition 驱动 stroke-dashoffset 变化 */
.donut-progress {
  transition: stroke-dashoffset 0.8s ease-out;
}

/* 中心文字 */
.donut-text {
  font-size: 14px;
  font-weight: 600;
  fill: var(--color-text, #333);
}

/* 小字号变体（如 "100%" 4字符以上时缩小字号避免溢出） */
.donut-text--small {
  font-size: 12px;
}
```

**动画说明**:
- `transition: stroke-dashoffset 0.8s ease-out` — 当 `dashOffset` computed 变化时（如筛选条件切换触发的数据更新），进度环从旧值平滑过渡到新值，持续 0.8 秒，缓出（ease-out）。
- 首次渲染动画：Vue 挂载时 `dashOffset` 从 `CIRCLE_LENGTH`（全空）过渡到目标值（如 75% → `62.8`），视觉上呈现从空到满的填充效果。
- `transform="rotate(-90 50 50)"` 使绘制起点从 12 点钟方向开始，符合常规环形图习惯。

### 4.7 保留现有趋势图

趋势图（第210-266行）保持当前 CSS 叠柱实现 — 诊断报告第406行已确认 "CSS 叠柱在数据可视化效果上可接受"。不修改趋势图部分。

### 4.8 边界条件与错误处理

| 场景 | `completionRate` | `dashOffset` | `rateText` | 视觉效果 |
|------|:---:|:---:|:---:|------|
| 无分析数据 (`analysis === null`) | `null` | `CIRCLE_LENGTH` (251.2) | `'-'` | 全空灰色底环 + 中心 `-` |
| `total === 0`（除零保护） | `null` | `CIRCLE_LENGTH` (251.2) | `'-'` | 同上 |
| `completed > total`（异常） | `Math.min(x, 1)` = `1` | `0` | `'100%'` | 满环（防御溢出） |
| `completed = 0, total > 0` | `0` | `CIRCLE_LENGTH` (251.2) | `'0%'` | 全空环 + `0%` — 与无数据态 `-` 区分 |
| `completed = 3, total = 4` | `0.75` | `62.8` | `'75%'` | 3/4 环填充 |
| `completed = total`（全部完成）| `1` | `0` | `'100%'` | 完整满环 |
| 响应式缩放 | — | — | — | SVG `viewBox="0 0 100 100"` 保证矢量缩放，`.donut-chart: 120px` 控制显示尺寸 |

### 4.9 与现有代码的集成

环形图替换现有渐变文字百分比区域后，统计卡的布局可能需要微调。当前统计卡布局为：

```
统计卡区域
├── 饮食完成率 (渐变文字)
├── 运动完成率 (渐变文字)
├── 血糖完成率 (渐变文字)
├── 总体完成率 (渐变文字) ← 替换此处
└── 趋势图 (CSS 叠柱，保持不变)
```

替换后：
```
├── 总体完成率 (SVG 环形图) ← 替换
```

具体替换位置取决于当前模板中渐变文字的准确行号（设计为第192-209行，实际需在执行时确认）。

### 4.10 验证方法

- [ ] **有数据分析时展示环形图**: 进入 Punch 页面（有打卡记录），统计卡区域展示 SVG 环形图而非纯文字百分比。
- [ ] **完成率比例正确**: 验证 `completed=3, total=4` 时环形图填充约 3/4 圈，中心文字显示 `'75%'`。
- [ ] **无数据时展示空态**: 无打卡记录时，环形图展示为灰色空环 + 中心 `-`。
- [ ] **环形图填充动画**: 进入页面时环形图有约 0.8 秒的填充动画（从空到目标比例），切换筛选条件后重新动画。
- [ ] **编译验证**: `npx vue-tsc --noEmit` 无新增编译错误；`completionRate`/`dashOffset`/`rateText` computed 类型正确。
- [ ] **视觉还原**: 环形图在 120px 容器中居中展示，进度环颜色使用 `--color-primary`，背景环使用 `--color-border`。

---

## Task G5: Punch.vue 刷新按钮 — G6 (fa-rotate + fetchList/fetchAnalysis)

### 5.1 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| 修改 | `src/views/Punch.vue` | `<template>` 筛选区：新增刷新按钮；`<script setup>` 新增 `onRefresh` + 防双击逻辑 + `isRefreshing` + `refreshTitle`；`<style scoped>` 新增按钮样式 + 旋转动画 |

### 5.2 设计依据

设计文档 4.1.8 节 Punch.vue 组件 DOM 树（第3298行）明确要求: `<button class="btn-icon" id="btn-refresh"> <i class="fas fa-sync">`。当前筛选区仅包含日期输入和类型 chip 按钮，无刷新按钮 — 属于组件树元素遗漏。

### 5.3 模板设计

在筛选区日期行右侧新增刷新按钮：

```html
<!-- 筛选区 — 日期行 -->
<div class="filter-row">
  <div class="filter-dates">
    <!-- 现有日期输入框保持不变 -->
    <input type="date" v-model="dateStart" @change="onDateChange" />
    <span class="date-separator">-</span>
    <input type="date" v-model="dateEnd" @change="onDateChange" />
  </div>

  <!-- [新增] 刷新按钮 -->
  <button
    class="btn-icon press"
    id="btn-refresh"
    @click="onRefresh"
    :disabled="store.listLoading || store.analysisLoading"
    :title="refreshTitle"
    aria-label="刷新打卡数据"
  >
    <i class="fa-solid fa-rotate" :class="{ 'fa-spin': isRefreshing }"></i>
  </button>
</div>
```

**布局说明**:
- 刷新按钮放在日期行右侧，与日期输入框同行
- 使用 `fa-rotate` 图标（FontAwesome 6 的旋转箭头图标），替代设计文档中的 `fa-sync`（两者语义相同，`fa-rotate` 更现代）
- `press` class 复用项目中已有的按压动画

### 5.4 `<script setup>` 中新增

```typescript
import { ref, computed } from 'vue'

// ===== 刷新按钮 =====

/** 刷新动画延迟（ms）— 避免快速刷新时图标闪烁 */
const REFRESH_ANIM_DELAY = 500

/** 是否展示旋转动画 */
const isRefreshing = ref(false)

/** 旋转动画的延迟启动 timer */
let refreshAnimTimer: ReturnType<typeof setTimeout> | null = null

/** 刷新按钮的 title 提示文案 */
const refreshTitle = computed(() => {
  if (store.listLoading || store.analysisLoading) return '刷新中...'
  return '刷新打卡数据'
})

/** 刷新：并发拉取列表和分析 */
async function onRefresh(): Promise<void> {
  // 防双击/防重复刷新：正在加载时直接返回
  if (store.listLoading || store.analysisLoading) return

  try {
    // 启动旋转视觉状态（延迟启动避免快速刷新时的闪烁）
    isRefreshing.value = true
    refreshAnimTimer = setTimeout(() => {
      // 注意：延迟到后才设置（但如果 500ms 内刷新已完成，finally 会清理此 timer 并还原状态）
    }, REFRESH_ANIM_DELAY)

    // 并发刷新列表和分析（利用 Store 已有的竞态保护）
    await Promise.all([store.fetchList(), store.fetchAnalysis()])

  } catch {
    // 错误由各自 Store 的 error ref 处理，onRefresh 层面不重复提示
    // fetchList() 和 fetchAnalysis() 内部已有 try/catch 回填 listError/analysisError
  } finally {
    // 清理 timer 并恢复视觉状态
    if (refreshAnimTimer !== null) {
      clearTimeout(refreshAnimTimer)
      refreshAnimTimer = null
    }
    isRefreshing.value = false
  }
}
```

**注意**: 需要在 `onUnmounted` 中清理定时器，防止组件卸载后 timer 回调触发已销毁响应式状态：

```typescript
// 在现有的 onUnmounted 中追加（或新增）
onUnmounted(() => {
  // ... 现有清理逻辑 ...
  if (refreshAnimTimer !== null) {
    clearTimeout(refreshAnimTimer)
    refreshAnimTimer = null
  }
})
```

### 5.5 防双击机制设计

采用双层防护策略：

1. **UI 层（按钮 `:disabled`）**: `:disabled="store.listLoading || store.analysisLoading"` — 加载中时按钮灰显且不可点击。
2. **逻辑层（函数入口守卫）**: `if (store.listLoading || store.analysisLoading) return` — 即使 UI 层被绕过（如 JS 直接调用 `onRefresh()`），函数入口仍做状态检查。

**时序分析**:
```
用户点击刷新
  → onRefresh()
    → store.listLoading || store.analysisLoading 检查 (false) → 通过
    → store.fetchList() 触发 → store.listLoading = true（在 fetchList 内部第一行设置）
    → store.fetchAnalysis() 触发 → store.analysisLoading = true
    → Promise.all 等待中...

  用户快速再次点击（<100ms）
    → onRefresh()
      → store.listLoading = true → return ← 被拦截
      → 按钮 :disabled="true" → 视觉上不可点击 ← UI 层也拦截

  Promise.all 完成后
    → finally: store.listLoading = false, store.analysisLoading = false
    → 按钮恢复可点击
```

### 5.6 旋转动画延迟机制

**为什么需要 500ms 延迟**: 如果 `isRefreshing` 在 `onRefresh` 开始时立即设为 `true`，当 API 响应极快（如命中 Service Worker 缓存，<50ms）时，图标会快速闪一下（旋转→立即停止），造成视觉抖动。

**延迟机制工作流程**:
```
onRefresh() 开始
  → isRefreshing = true（但还没启动旋转动画？）
  → refreshAnimTimer = setTimeout(() => { ... }, 500)

问题：代码中 isRefreshing 在开头就设为 true，那延迟 timer 有什么用？

修正：应该延迟设置 isRefreshing 而非立即设置。
```

**修正后的延迟逻辑**:

```typescript
async function onRefresh(): Promise<void> {
  if (store.listLoading || store.analysisLoading) return

  try {
    // 延迟启动旋转动画（避免快速刷新时闪烁）
    refreshAnimTimer = setTimeout(() => {
      isRefreshing.value = true
    }, REFRESH_ANIM_DELAY)

    await Promise.all([store.fetchList(), store.fetchAnalysis()])
  } catch {
    // Store 内部处理错误
  } finally {
    if (refreshAnimTimer !== null) {
      clearTimeout(refreshAnimTimer)
      refreshAnimTimer = null
    }
    isRefreshing.value = false
  }
}
```

**时序**:
```
场景 A: 刷新耗时 200ms（< 500ms）
  t=0:    onRefresh() 开始，刷新按钮 :disabled=true
  t=0:    启动 500ms timer
  t=200:  Promise.all 完成
  t=200:  finally → clearTimeout(timer) → isRefreshing = false
  结果: 图标不旋转（刷新太快），用户体验流畅

场景 B: 刷新耗时 2000ms（> 500ms）
  t=0:    onRefresh() 开始，刷新按钮 :disabled=true
  t=0:    启动 500ms timer
  t=500:  timer 触发 → isRefreshing = true → fa-spin 旋转动画开始
  t=2000: Promise.all 完成
  t=2000: finally → clearTimeout(timer, 但已触发) → isRefreshing = false
  结果: 图标旋转约 1.5 秒，用户明确感知到"正在刷新"
```

### 5.7 CSS 样式设计

```css
/* ===== 刷新按钮 ===== */

#btn-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--color-border, #ddd);
  background: var(--color-bg, #fff);
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  font-size: 16px;
}

#btn-refresh:hover:not(:disabled) {
  background: var(--color-bg-hover, #f5f5f5);
  color: var(--color-primary, #4A90D9);
}

#btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 旋转动画 class */
#btn-refresh .fa-spin {
  animation: refresh-spin 1s linear infinite;
}

/* FontAwesome 风格旋转关键帧 */
@keyframes refresh-spin {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
```

**样式设计要点**:
- 圆形按钮（`border-radius: 50%`），36px x 36px — 与日期输入框高度对齐
- `border: 1px solid` 使按钮有视觉边界（不会淹没在背景中）
- hover 时背景微变 + 图标变为主色，提供交互反馈
- disabled 时半透明 + 禁用手型光标
- 旋转动画 1s/圈，线性匀速（`linear`），与 FontAwesome `fa-spin` 标准一致

### 5.8 数据流

```
用户点击刷新
  → onRefresh()
    → store.fetchList() → GET /api/punch/list?startDate=...&endDate=...&punch_type=...
      → 内部: listLoading=true, requestId++, await getPunchList()
      → 成功: list=... , listLoading=false
      → 失败: listError=... , listLoading=false
    → 同时: store.fetchAnalysis() → GET /api/punch/analysis?...
      → 内部: analysisLoading=true, requestId++, await getPunchAnalysis()
      → 成功: analysis=... , analysisLoading=false
      → 失败: analysisError=... , analysisLoading=false
    → Promise.all 完成
    → isRefreshing = false

  刷新保持当前筛选条件:
    fetchList() 和 fetchAnalysis() 均从 store.filter 读取 startDate/endDate/punch_type
    不重置筛选条件
```

**与已完成任务的集成**:
- S9 (fetchAnalysis 竞态保护): `store.fetchAnalysis()` 内部已有 `requestId` 快照保护，`onRefresh` 中调用安全
- S7 (setFilter 中 fetchAnalysis 防抖): `onRefresh` 直接调用 `fetchAnalysis()` 而非走 `setFilter()`（刷新不需要修改 filter），防抖 timer 不影响此路径

### 5.9 边界条件与错误处理

| 场景 | 行为 |
|------|------|
| 单击刷新 | `onRefresh()` 调用 → `Promise.all([fetchList, fetchAnalysis])` → 完成后按钮恢复 |
| 快速双击（<100ms） | 第二次点击被 `store.listLoading === true` 守卫拦截 → return（无第二个请求） |
| 加载中再次点击 | `:disabled` 使按钮不可点击 + 函数入口守卫 `if (loading) return` |
| 刷新时 fetchList 失败 | `listError` 被 Store 内部设置 → UI 展示错误提示；`fetchAnalysis` 仍继续（Promise.all 不因单个 reject 中止——**但 fetchList/fetchAnalysis 内部 catch 已吞掉错误，Promise.all 不会收到 reject**） |
| 刷新时 fetchAnalysis 失败 | `analysisError` 被 Store 内部设置 → 分析区展示降级提示 |
| 两者均失败 | `listError` + `analysisError` 均被设置 → 列表和分析区各自展示错误态 |
| 组件卸载时刷新仍在进行 | `onUnmounted` 中清理 `refreshAnimTimer` → 防止定时器操作已销毁的响应式状态；`fetchList/fetchAnalysis` 的请求本身不被取消（已在网络层发出），但其响应写入 Store 状态不影响已卸载组件（Store 更新不会触发已卸载组件的重渲染，Vue 内部自动处理） |
| 刷新保持筛选条件 | `fetchList()` 和 `fetchAnalysis()` 均读取 `store.filter`（当前日期和类型），刷新不重置 |
| 用户修改日期后立即刷新 | 如果用户在 `onDateChange` → `setFilter` 过程中点击刷新（时间窗口 < 300ms），`store.listLoading` 可能已为 true → 刷新按钮的守卫正确拦截 |

### 5.10 与其他模块接口约定

- **依赖 `punchStore.fetchList()` / `punchStore.fetchAnalysis()`**: 两者为 Store 公开 Action（已在 `return {}` 块中暴露），`onRefresh` 直接调用。
- **依赖 S9 (竞态保护)**: `fetchAnalysis()` 内部已有 `requestId` 快照保护，多路并发调用安全。
- **不依赖 `setFilter()`**: `onRefresh` 直接调用 `fetchList/fetchAnalysis` 而非走 `setFilter()`——刷新不需要修改 filter 状态。
- **被 Punch.vue 模板消费**: 刷新按钮位于筛选区，与 `onDateChange`/`onTypeFilter` 并列。

### 5.11 验证方法

- [ ] **刷新按钮存在且有旋转动画**: 筛选区可见刷新型图标按钮（`fa-rotate`）。点击后图标旋转（`fa-spin`），完成后旋转停止。
- [ ] **刷新触发数据重载**: DevTools Network 面板检查：点击刷新后 `/api/punch/list` 和 `/api/punch/analysis` 各发出 1 次新请求。
- [ ] **防双击**: 快速双击刷新按钮，Network 面板仅显示 1 次 `/api/punch/list` + 1 次 `/api/punch/analysis` 请求（第二次点击被 `loading` 守卫拦截）。
- [ ] **刷新保持筛选条件**: 选择特定日期范围和打卡类型后点击刷新，Network 请求参数包含当前筛选条件不变。
- [ ] **编译验证**: `npx vue-tsc --noEmit` 无新增编译错误；`onRefresh` / `isRefreshing` / `refreshTitle` 类型正确。

---

## 跨组依赖验证矩阵

```
执行顺序（单人串行）: G1 → G2 → G3 → G4 + G5
执行顺序（二人并行）:
  开发者A: G1 → G2 → G3        (sanitize → useMarkdown → errorMessage, ~5-8h)
  开发者B: 等待 G3 完成后 → G4 + G5  (环形图 + 刷新按钮, ~3-5h)
```

```
G1 (sanitize.ts)  ──┬──→ G2 (useMarkdown.ts)     [renderMarkdown 使用 sanitizeHtml()]
                    ├──→ Home.vue import 替换      [escapeHtml + sanitizeHtml]
                    ├──→ LifePlan.vue import 替换  [sanitizeHtml]
                    └──→ Punch.vue import 替换     [sanitizeHtml]

G2 (useMarkdown.ts) ──┬──→ LifePlan.vue 函数删除  [safeContentHtml → renderMarkdown]
                      └──→ Punch.vue 函数删除     [safeAnalysisHtml → renderMarkdown]

G3 (errorMessage.ts) ──┬──→ LifePlan.vue 函数删除 [本地 getErrorMessage → import]
                       └──→ Punch.vue 函数删除    [本地 getErrorMessage → import]

G4 (环形图) ───────────── Punch.vue 模板 + script + style（统计卡区）
G5 (刷新按钮) ─────────── Punch.vue 模板 + script + style（筛选区）

G4 和 G5 修改 Punch.vue 的不同模板区域，无冲突，可并行。
```

### 文件级修改协调（Punch.vue 被 5 个任务组修改）

```
Punch.vue 修改区域分布:

<script setup>:
  import 区     ← G1 (新增 sanitizeHtml import)
                ← G2 (新增 renderMarkdown import, 删除 marked/DOMPurify import)
                ← G3 (新增 getErrorMessage import)
  函数定义区   ← G2 (删除 safeAnalysisHtml 函数)
                ← G3 (删除本地 getErrorMessage 函数)
  新增代码区   ← G4 (CIRCLE_LENGTH + completionRate/dashOffset/rateText computed)
                ← G5 (REFRESH_ANIM_DELAY + isRefreshing/refreshTitle + onRefresh + onUnmounted 清理)

<template>:
  统计卡区     ← G4 (SVG 环形图替换渐变文字)
  筛选区       ← G5 (刷新按钮)

<style scoped>:
  新增区       ← G4 (环形图 CSS)
  新增区       ← G5 (刷新按钮 CSS + @keyframes)
```

**修改区域不重叠，但建议按 G1→G2→G3→(G4+G5) 顺序执行：先稳定 `<script setup>` 的 import 结构，再在新结构上新增 UI 元素。**

---

## 文件修改汇总

| 文件 | G1 | G2 | G3 | G4 | G5 | 操作 | 预估净增行数 |
|------|:--:|:--:|:--:|:--:|:--:|------|:------:|
| `src/utils/sanitize.ts` | ++ | | | | | **新建** | ~80行 |
| `src/composables/useMarkdown.ts` | | ++ | | | | **新建** | ~45行 |
| `src/utils/errorMessage.ts` | | | ++ | | | **新建** | ~35行 |
| `src/views/Home.vue` | + | | | | | 修改（import 替换 + 删除本地函数） | ~4行净增 |
| `src/views/LifePlan.vue` | + | + | + | | | 修改（import 替换 + 删除本地函数 x2） | ~4行净增 |
| `src/views/Punch.vue` | + | + | + | ++ | ++ | 修改（import 替换 + 删除本地函数 x2 + 环形图 + 刷新按钮） | ~100行净增 |
| **合计** | ~80 | ~45 | ~35 | ~50 | ~50 | — | **~260行** |

---

## 风险与缓解

### 风险 1: sanitize.ts ALLOWED_TAGS 白名单过严导致合法内容被截断

- **概率**: 低（白名单已覆盖 CommonMark + GFM 表格的全部标签）
- **影响**: 高（用户看到的方案内容/分析评语可能缺失部分格式）
- **缓解**:
  1. G1 完成后立即在三个页面进行渲染回归验证（对比替换前后的 HTML 输出）
  2. 如果发现合法标签被移除（如 `<sup>`/`<sub>`/`<del>`），评估是否扩展 ALLOWED_TAGS
  3. 白名单修改仅需改 `sanitize.ts` 一处，修复成本低

### 风险 2: G1 → G2 鸡-蛋依赖导致回修

- **概率**: 中（如果执行顺序打乱，G2 先于 G1 执行）
- **影响**: 低（G2 中仅 1 行调用需从 `DOMPurify.sanitize()` 改为 `sanitizeHtml()`）
- **缓解**: 严格按 G1→G2 顺序执行，或 G1/G2 由同一开发者连续完成

### 风险 3: Punch.vue 被 5 个任务组共同修改的合并冲突

- **概率**: 中（如果并行执行且多人在同一文件上工作）
- **影响**: 中（合并冲突解决耗时，但区域不重叠降低了冲突概率）
- **缓解**: 建议单人串行（G1→G2→G3→G4+G5），或 A 做 G1+G2+G3，B 在 A 提交后做 G4+G5

### 风险 4: ALLOWED_URI_REGEXP 误杀合法链接

- **概率**: 低-中（取决于方案内容和分析评语中的链接格式）
- **影响**: 中（链接不可点击，影响用户体验）
- **缓解**: 本设计已在 1.10 节修正诊断报告原始正则无法匹配绝对路径（`/xxx`）的问题。G1 完成后重点验证绝对路径、相对路径、外部链接三种格式的链接

### 风险 5: Punch.vue 空值守卫变更导致 UI 异常

- **概率**: 低
- **影响**: 中（如果模板中 `getErrorMessage(null)` 返回 fallback 而非 `''`，可能导致错误提示常驻）
- **缓解**: G3 执行时审查 Punch.vue 模板中所有 `getErrorMessage()` 调用点，确认判断逻辑基于独立错误变量

---

## 补充设计决策（来自审查报告）

| 编号 | 决策 | 来源 | 本设计采纳情况 |
|:--:|------|------|:------------:|
| D1 | G12+S10 合并为 G1（共享 sanitize.ts） | 审查报告维度二 | **已采纳** — G1 一站化完成 |
| D2 | G7 的 renderMarkdown 使用 G1 的 sanitizeHtml | 审查报告维度二 | **已采纳** — G2 依赖 G1 |
| D3 | G16 (marked async 注释) 随 G2 一并处理 | 审查报告维度二/三 | **已采纳** — 统一函数中一处添加 |
| D4 | 执行顺序 G1→G2 优于诊断报告 S10 依赖 G7 | 审查报告维度二 | **已采纳** — 避免回修循环 |
| D5 | 环形图使用纯 SVG 而非 chart.js | 本设计技术选型 | **已采纳** — 零依赖、零包体积增加 |
| D6 | 刷新按钮使用 500ms 动画延迟 | 本设计 UX 优化 | **已采纳** — 避免快速刷新时图标闪烁 |
| D7 | `sanitizeHtml` 统一白名单配置，外部不直接调 DOMPurify | 本设计安全架构 | **已采纳** — 全局安全配置一条线 |
| B1 | `getErrorMessage` 补回 `response.data.error.message` 提取路径 | 审查报告 v4-r1 维度3阻断 | **已修复** — 3.2 节新增嵌套 error.message 检查 + 类型 + 边界条件 |
| S1 | G2 marked link renderer 自动注入 `rel="noopener noreferrer"` | 审查报告 v4-r1 维度1建议 | **已采纳** — 2.3 节新增 link renderer + G1 ALLOWED_ATTR 追加 `rel` |
| S2 | SVG `stroke-dasharray` 绑定 computed 常量 `CIRCLE_LENGTH` | 审查报告 v4-r1 维度4建议 | **已采纳** — 4.4.2 节模板改为 `:stroke-dasharray="CIRCLE_LENGTH"` |

---

*详细设计文件结束（v4）。下一轮 v5 将处理：P4 层任务（G24/G25 + G1/G2 + G9-G29 剩余 ~15 项）及 v3 可推迟项（~8h）。*
