# 前端待办修复 -- 第4轮任务 v4

> **依据**: 诊断报告 `redeliberations/202606271705_frontend_todo_diagnosis/a_v8_diag_v3.md` P3 层详细规格（第306-508行）
> **计划文件**: `plan.md` 第4.1节 v4行
> **审查报告**: `plan_review_v4_r1.md`（5组分解 + 内部依赖 + 范围裁决）
> **上一轮**: v1 已完成 S9/S7/S3/S1/S2/S5a (6项)，v2 已完成 S6/G14/S4/S11/S8 (5项)，v3 已完成 S5b-1/S5b-2 (chatStore SSE核心 + DoctorChatView + 路由)
> **范围**: P3 层 6 项 — G12/S10 (安全 + XSS 加固) + G7/G16 (Markdown 工具抽取) + G8 (错误消息抽取) + G3 (环形图) + G6 (刷新按钮)
> **日期**: 2026-06-27
> **总工时**: 8-13h（单人串行）

---

## 范围裁定: v3 可推迟项推迟至 v5

task_v3.md 第1248-1260行列出了6项可推迟至后续轮次的任务。经审查报告 `plan_review_v4_r1.md` 第4.3-4.4节分析，v4 采用方案A（严格按 plan.md P3 范围），v3 可推迟项全部推迟至 v5。裁决理由:

1. **工时膨胀风险**: 若纳入 v3 推迟的4项实际需交付任务（断线重连指数退避 ~2h + 多医生路由 ~4h + fabOpen ~1h + Markdown增强 ~1h = ~8h），v4 总工时将从 8-13h 膨胀至 16-21h，接近 v3 简化版（28-40h）的单轮规模。
2. **文件冲突隔离**: 断线重连指数退避和多医生路由涉及 chatStore.ts 架构级变更，与 P3 层（sanitize.ts / useMarkdown.ts / errorMessage.ts / Punch.vue）无共享文件，独立轮次更安全。
3. **v5 已有容量**: v5 当前为 P4 层约15项（7-12h），叠加 v3 推迟项 ~8h 后约 15-20h，仍在可控范围内。

**推迟至 v5 的完整清单**:

| 推迟项 | 来源 | v3 简化交付 | v5 完整交付 | 工时 |
|-------|:----:|-----------|-----------|:---:|
| 断线重连指数退避 | G4 | 固定间隔3次重试 | 指数退避 1s→30s，最大5次 | ~2h |
| 多医生独立会话路由 | G4 | 仅单医生对话 | Map<number,string> 完整多医生切换 | ~4h |
| fabOpen 悬浮按钮状态 | G4 | 移除或留空 | 完整展开/收起动画 | ~1h |
| Consultation 在线标识 | G5 | 模板占位 | 后端 is_online 就绪后激活 | 0h |
| DoctorChatView 免责声明弹窗 | G6 | 路由守卫已覆盖 | 如产品要求双重确认 | 0h |
| 消息内容 Markdown 渲染增强 | G6 | marked.parse() 基础渲染 | 代码高亮、表格样式 | ~1h |

> **注**: 上述6项中前4项（~8h）为实际需交付的代码修改任务，后2项（0h）为占位项。plan.md 需同步更新以反映此范围变更。**G16（marked async 兼容性注释）已纳入 v4 的 T2 任务组中一并处理——G16 属于"在抽取后的 useMarkdown.ts 中统一添加比在两处各自添加更高效"的自然合并项，不增加额外工时。**

---

## 执行顺序与依赖图

```
[G1] sanitize.ts 一站化 (G12+S10)
  │  新建 src/utils/sanitize.ts: escapeHtml() + sanitizeHtml()
  │  修改 Home.vue / LifePlan.vue / Punch.vue 的 import 和调用
  │
  └─→ [G2] useMarkdown.ts 抽取 (G7+G16)
        │  新建 src/composables/useMarkdown.ts: renderMarkdown()
        │  使用 G1 的 sanitizeHtml() 替代裸 DOMPurify.sanitize()
        │  添加 marked async 兼容性注释 (G16)
        │  修改 LifePlan.vue / Punch.vue 的 import 和调用
        │
        └─→ [G3] errorMessage.ts 抽取 (G8)
              │  新建 src/utils/errorMessage.ts: getErrorMessage()
              │  修改 LifePlan.vue / Punch.vue 的 import 和调用
              │
              └─→ [G4] + [G5] 可并行
                    [G4] Punch.vue 环形图 (G3)
                    [G5] Punch.vue 刷新按钮 (G6)
```

**关键依赖说明**:

| 依赖 | 方向 | 性质 | 说明 |
|------|:----:|------|------|
| **G12 → S10** | G12 先于 S10 | **硬依赖（同一文件）** | 两者共享 `src/utils/sanitize.ts`。G12 先建立文件骨架（含 `escapeHtml`），S10 在同一文件中追加 `sanitizeHtml()`。若拆分执行会产生 git 合并冲突。本任务文件将 G12+S10 合并为 G1 一站化完成。 |
| **G1 → G2** | G1 先于 G2 | **建议依赖（避免回修）** | G2 的 `renderMarkdown()` 应使用 G1 的 `sanitizeHtml()` 而非裸 `DOMPurify.sanitize()`。若 G2 先于 G1 执行，S10 完成后需回修 `useMarkdown.ts` 中的 1-2 行调用。按 G1→G2 顺序执行则无需回修。 |
| **G1+G2+G3 → G4+G5** | 工具抽取先于 UI 新增 | **建议依赖（文件级协调）** | G2/G3 的 import 替换改变了 Punch.vue `<script setup>` 顶部的 import 结构。G4/G5 在其稳定的 import 结构上添加 UI 元素更安全，降低合并冲突风险。 |

**四人修改 Punch.vue 的区域不重叠**: G2/G3 修改 `<script setup>` 的 import 和本地函数定义区，G4 修改统计卡 `<template>` 区，G5 修改筛选区 `<template>` 区。修改区域不重叠意味着理论上可并行，但建议工具抽取先完成以稳定 import 结构。

**推荐执行顺序（单人串行）**: G1 → G2 → G3 → G4 → G5

**推荐执行顺序（二人并行）**:
```
开发者A: G1 → G2 → G3        (sanitize → useMarkdown → errorMessage, 共 ~5-8h)
开发者B: 等待 G3 完成后 → G4 + G5  (环形图 + 刷新按钮, 共 ~3-5h)
```

---

## 任务组 G1: sanitize.ts 一站化 -- G12 (escapeHtml 抽取) + S10 (DOMPurify 安全加固)

- **问题编号**: G12 + S10
- **严重程度**: G12 低（代码组织）/ S10 中（安全加固）
- **预估工时**: 3-4h
- **前置依赖**: 无
- **批处理理由**: 两者共享同一个目标文件 `src/utils/sanitize.ts`，拆分执行会产生 git 合并冲突。一站式完成 `escapeHtml()` + `sanitizeHtml()` 避免文件拆分。

### 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| **新建** | `src/utils/sanitize.ts` | 统一安全工具文件，含 `escapeHtml()` + `sanitizeHtml()` |
| 修改 | `src/views/Home.vue` | 替换本地 `escapeHtml` 为 import (第132-137行)；替换 `DOMPurify.sanitize(html)` 为 `sanitizeHtml(html)` (第116行) |
| 修改 | `src/views/LifePlan.vue` | 替换 `DOMPurify.sanitize(html)` 为 `sanitizeHtml(html)` (第98行) |
| 修改 | `src/views/Punch.vue` | 替换 `DOMPurify.sanitize(html)` 为 `sanitizeHtml(html)` (第59行) |

### 具体修改描述

#### 1.1 新建 `src/utils/sanitize.ts`

创建统一安全工具文件，包含两个导出函数:

**函数 A: `escapeHtml(str: string): string`** — 从 Home.vue 第132-137行迁移

HTML 实体转义函数，用于纯文本片段的 XSS 防护（如弹窗中拼接 HTML 字符串中的文本域）。与 `DOMPurify.sanitize` 的区别：`escapeHtml` 用于纯文本片段，`sanitizeHtml` 用于完整 HTML 片段净化，两者不重复。

```typescript
/**
 * HTML 实体转义——将特殊字符转为 HTML 实体，防止纯文本片段中的 XSS 注入。
 * 用于弹窗中拼接 HTML 字符串时的文本域安全处理。
 * 区别于 sanitizeHtml()：前者用于纯文本片段，后者用于完整 Markdown→HTML 净化。
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
```

**函数 B: `sanitizeHtml(html: string): string`** — S10 安全加固

带白名单配置的 DOMPurify 封装函数。诊断报告第306-326行提供了完整的白名单规格。

```typescript
import DOMPurify from 'dompurify'

/**
 * Markdown→HTML 净化函数——使用 DOMPurify 加固配置，防止 XSS 绕过。
 * 设计依据: docs/2_detailed_design_v3.md 1.3节技术选型表（第120行）
 *
 * ALLOWED_TAGS: 仅允许 Markdown 渲染可能产生的 HTML 标签
 * ALLOWED_ATTR: 仅允许安全属性
 * FORBID_TAGS / FORBID_ATTR: 显式禁止高危标签和事件属性
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's',
      'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'span', 'div', 'img',
    ],
    ALLOWED_ATTR: [
      'href', 'title', 'alt', 'src', 'width', 'height', 'class', 'style', 'target',
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^/]|[^/]\S+)$/i,
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  })
}
```

#### 1.2 修改 `src/views/Home.vue`

(a) 在 `<script setup>` 顶部增加 import:
```typescript
import { escapeHtml, sanitizeHtml } from '@/utils/sanitize'
```

(b) 删除第132-137行的本地 `escapeHtml` 函数定义。

(c) 第116行: `DOMPurify.sanitize(html)` 替换为 `sanitizeHtml(html)`。

(d) 删除 `import DOMPurify from 'dompurify'`（如果 Home.vue 不再直接引用 DOMPurify）。

#### 1.3 修改 `src/views/LifePlan.vue`

(a) 在 `<script setup>` 顶部增加 import:
```typescript
import { sanitizeHtml } from '@/utils/sanitize'
```

(b) 第98行: `DOMPurify.sanitize(html)` 替换为 `sanitizeHtml(html)`。
   - **注意**: LifePlan.vue 的安全函数名是 `safeContentHtml`（第94-99行），其内部调用 `DOMPurify.sanitize()`。G2 (useMarkdown.ts) 的 import 替换会一并处理此处的安全函数。G1 仅需确保 `DOMPurify.sanitize()` 调用被替换为 `sanitizeHtml()`。若 G2 尚未执行，此处暂时保留本地 safeContentHtml 但替换其内部调用；若 G2 已抽取 `renderMarkdown()`，则直接使用 `renderMarkdown()`。

(c) 检查是否需要保留 `import DOMPurify from 'dompurify'`。

#### 1.4 修改 `src/views/Punch.vue`

(a) 在 `<script setup>` 顶部增加 import:
```typescript
import { sanitizeHtml } from '@/utils/sanitize'
```

(b) 第59行: `DOMPurify.sanitize(html)` 替换为 `sanitizeHtml(html)`。
   - **注意**: Punch.vue 的安全函数是 `safeAnalysisHtml`（第55-60行），替换逻辑同 LifePlan.vue。

(c) 检查是否需要保留 `import DOMPurify from 'dompurify'`。

### 边界条件

- `<a>` 标签的 `href` 需确保 `target="_blank"` 和 `rel="noopener noreferrer"` 以防范 tabnabbing。此为 Markdown 渲染层 (`marked`) 的配置问题，非 sanitize.ts 的责任边界——marked 可在 parse options 中配置 `renderer.link` 自动添加。若 marked 未配置，sanitizeHtml 不会主动添加——建议在 G2 (useMarkdown.ts) 的 `renderMarkdown()` 中配置 marked 的 link renderer。
- `<img>` 标签需保留 `alt` 和 `src` 属性（已在 ALLOWED_ATTR 中）。
- `<code>` 和 `<pre>` 标签需保留（已在 ALLOWED_TAGS 中）——Markdown 代码块常用。
- ALLOWED_URI_REGEXP 限制了 `href` 和 `src` 的协议白名单（仅 http/https/mailto/相对路径），防止 `javascript:` 伪协议注入。
- `sanitizeHtml('')` 应返回空字符串而非 null/undefined。
- `sanitizeHtml(null)` 或 `sanitizeHtml(undefined)` 应在函数内部防御——转为空字符串后净化。

### 验收标准

- [ ] **AC-1: XSS 注入防护验证** — 在 LifePlan 方案内容中尝试注入 `<img src=x onerror=alert(1)>`，检查渲染后 `onerror` 属性是否被移除。
- [ ] **AC-2: javascript: 伪协议拦截** — 在 Punch 分析评语中尝试注入 `<a href="javascript:alert(1)">click</a>`，检查 `href` 是否被移除或替换为 `#`。
- [ ] **AC-3: 合法 Markdown 正常渲染** — LifePlan 方案内容中的标题/列表/加粗/链接等合法 Markdown 语法正常渲染为 HTML，无内容丢失。
- [ ] **AC-4: 糖尿病类型弹窗文本转义** — Home.vue 中糖尿病类型弹窗的病因/临床表现/治疗方式文本包含 `<` `>` 字符时正确转义为 HTML 实体（不渲染为 HTML 标签）。
- [ ] **AC-5: 编译验证** — `npx vue-tsc --noEmit` 无新增编译错误；新建的 `sanitize.ts` 及三处 import 替换无类型错误。

---

## 任务组 G2: useMarkdown.ts 抽取 -- G7 (renderMarkdown 抽取) + G16 (marked async 兼容性注释)

- **问题编号**: G7 + G16
- **严重程度**: G7 低（代码组织）/ G16 低（技术债务）
- **预估工时**: 1.5-2.5h
- **前置依赖**: G1（sanitize.ts 就绪 — 建议依赖。若 G1 未完成则可先行抽取使用裸 `DOMPurify.sanitize()`，后续回修 1-2 行。）
- **合并理由**: G16（marked async 兼容性注释）在两处各自添加不如在抽取后的统一函数中一处添加高效。

### 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| **新建** | `src/composables/useMarkdown.ts` | Markdown 渲染 composable，含 `renderMarkdown()` |
| 修改 | `src/views/LifePlan.vue` | 删除本地 `safeContentHtml` (第94-99行)，改为 `import { renderMarkdown }` |
| 修改 | `src/views/Punch.vue` | 删除本地 `safeAnalysisHtml` (第55-60行)，改为 `import { renderMarkdown }` |

### 具体修改描述

#### 2.1 新建 `src/composables/useMarkdown.ts`

```typescript
import { marked } from 'marked'
import { sanitizeHtml } from '@/utils/sanitize'

/**
 * Markdown → 安全 HTML 渲染管道。
 * 设计依据: docs/2_detailed_design_v3.md 1.3节（DOMPurify + marked 组合）
 *
 * 管道: markdown 文本 → marked.parse() → DOMPurify.sanitize()（白名单加固）→ 安全 HTML 字符串
 *
 * 【G16 兼容性注释】当前使用 marked v12 的同步模式 `{ async: false }`。
 * marked 官方文档提示未来主版本可能移除同步模式。
 * 若 marked v13+ 移除了 `{ async: false }`，迁移步骤:
 *   1. 将 renderMarkdown 改为 async: `export async function renderMarkdown(md: unknown): Promise<string>`
 *   2. 内部调用: `const raw = await marked.parse(String(md ?? ''))`
 *   3. 调用方需 await 或使用 Vue Suspense
 * 为防止意外升级: 在 package.json 中锁定 marked 版本为当前主版本。
 *
 * @param markdown - Markdown 文本（允许 unknown 以兼容 API 返回的任意类型字段）
 * @returns 净化后的安全 HTML 字符串。输入为 null/undefined/非字符串时返回空字符串。
 */
export function renderMarkdown(markdown: unknown): string {
  if (markdown == null) return ''
  const md = typeof markdown === 'string' ? markdown : String(markdown)
  if (md.trim() === '') return ''

  // marked.parse() 当前使用同步模式
  const rawHtml = marked.parse(md, { async: false }) as string
  // DOMPurify 安全净化（白名单加固，来自 G1/sanitize.ts）
  return sanitizeHtml(rawHtml)
}
```

**关键设计决策**:
- 使用 G1 的 `sanitizeHtml()` 而非裸 `DOMPurify.sanitize()`——这是审查报告方案 B（更优顺序）的核心要求。如果 G1 未完成，临时使用 `DOMPurify.sanitize()` 并在注释中标注 TODO。
- `renderMarkdown` 的 `markdown` 参数类型为 `unknown`——来自 `plan.content`（API 返回的 Markdown 文本字段可能为 `string | null | undefined`），在函数内部做空值防御而非要求调用方每次判空。这与 LifePlan.vue 和 Punch.vue 当前的调用模式一致（第96行和第57行传入 `plan.content` 前未判空，但后续的 `v-if/v-else-if` 互斥链保护了模板渲染路径——参见诊断报告 [†C] 脚注的分析）。

#### 2.2 修改 `src/views/LifePlan.vue`

(a) 在 `<script setup>` 顶部增加 import:
```typescript
import { renderMarkdown } from '@/composables/useMarkdown'
```

(b) 删除第94-99行的本地 `safeContentHtml` 函数定义。

(c) 模板中 `safeContentHtml(plan.content)` 调用替换为 `renderMarkdown(plan.content)`。

(d) 检查 LifePlan.vue 是否还需要 `import { marked }` 和 `import DOMPurify from 'dompurify'`——若不再直接引用，删除这两个 import。
   - **注意**: 如果 G1 已在 LifePlan.vue 中添加了 `import { sanitizeHtml }`，且此处不再使用原始 `DOMPurify.sanitize()`，则可清除 DOMPurify 的 import。但需确认模板中是否有其它直接调用 DOMPurify 的地方。

#### 2.3 修改 `src/views/Punch.vue`

(a) 在 `<script setup>` 顶部增加 import:
```typescript
import { renderMarkdown } from '@/composables/useMarkdown'
```

(b) 删除第55-60行的本地 `safeAnalysisHtml` 函数定义。

(c) 模板中 `safeAnalysisHtml(analysis.comment)` 调用替换为 `renderMarkdown(analysis.comment)`。

(d) 检查 Punch.vue 是否还需要 `import { marked }` 和 `import DOMPurify from 'dompurify'`。

### 边界条件

- `renderMarkdown(null)` 返回 `''`（空字符串）——不抛出异常。
- `renderMarkdown(undefined)` 返回 `''`。
- `renderMarkdown(123)`（number 类型）自动转为字符串 `'123'` 后渲染——这是当前调用模式 `marked.parse(markdown, { async: false })` 的已有行为，不改变。
- `renderMarkdown('')` 返回 `''`（空字符串，非空 HTML）。
- 当前 LifePlan.vue 和 Punch.vue 的模板中均有 `v-if`/`v-else-if` 互斥链保护——`plan.content` 或 `analysis.comment` 为 falsy 时不进入 Markdown 渲染分支。抽取后的 `renderMarkdown()` 增加内部空值防御作为通用健壮性增强。

### 验收标准

- [ ] **AC-1: LifePlan 方案内容正常渲染** — 进入 LifePlan 页面，方案内容中的标题/列表/加粗/链接等 Markdown 语法正常渲染为 HTML，与抽取前视觉效果一致。
- [ ] **AC-2: Punch AI 分析评语正常渲染** — 进入 Punch 页面，AI 分析评语中的 Markdown 格式正常渲染，无内容丢失或格式错乱。
- [ ] **AC-3: 空内容不崩溃** — 模拟 API 返回 `plan.content === null` 或 `analysis.comment === ''`，检查页面不崩溃、不显示 undefined/NaN。
- [ ] **AC-4: XSS 注入防护** — 与 G1 AC-1/AC-2 联合验证——`renderMarkdown()` 输出的 HTML 经过 `sanitizeHtml()` 白名单加固，`<img onerror>` 和 `javascript:` 伪协议被拦截。
- [ ] **AC-5: 编译验证** — `npx vue-tsc --noEmit` 无新增编译错误；LifePlan.vue 和 Punch.vue 删除本地函数后无未使用变量警告；` marked` 和 `DOMPurify` 的 import 如不再需要则无未使用 import 警告。

---

## 任务组 G3: errorMessage.ts 抽取 -- G8 (getErrorMessage 抽取)

- **问题编号**: G8
- **严重程度**: 低（代码组织）
- **预估工时**: 1-1.5h
- **前置依赖**: 无硬依赖。建议 G2 之后执行——G2 完成后 Punch.vue 和 LifePlan.vue 的 `<script setup>` 顶部 import 结构已稳定，追加 `import { getErrorMessage }` 更自然。
- **与 G2 的文件级协调**: G2 和 G3 均修改 LifePlan.vue 和 Punch.vue 的 `<script setup>` 顶部 import 区和本地函数定义区。建议同一开发者或按 G2→G3 顺序执行，避免对同一区域的并行编辑冲突。

### 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| **新建** | `src/utils/errorMessage.ts` | 统一错误消息提取工具 |
| 修改 | `src/views/LifePlan.vue` | 删除本地 `getErrorMessage` (第102-109行)，改为 import |
| 修改 | `src/views/Punch.vue` | 删除本地 `getErrorMessage` (第63-77行)，改为 import |

### 具体修改描述

#### 3.1 新建 `src/utils/errorMessage.ts`

```typescript
/**
 * 从任意类型的错误对象中提取用户可读的错误消息。
 *
 * 提取优先级:
 *   1. Axios 错误: err.response?.data?.message
 *   2. 标准 Error: err.message
 *   3. 字符串错误: err 本身
 *   4. 其它类型: fallback 默认值
 *
 * @param err      - 捕获的错误对象（类型 unknown，来自 catch 块）
 * @param fallback - 无可提取消息时的默认文案
 * @returns 用户可读的错误消息字符串
 */
export function getErrorMessage(
  err: unknown,
  fallback: string = '操作失败，请稍后重试',
): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { data?: { message?: string } } }).response
    if (response?.data?.message) return response.data.message
  }
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return fallback
}
```

**关键设计决策**:
- `fallback` 默认值统一为 `'操作失败，请稍后重试'`。LifePlan.vue 当前本地版本的 fallback 为 `'获取方案失败'`（第108行），Punch.vue 当前本地版本为 `'加载失败'`（第76行）。抽取后统一使用最通用的 fallback，调用方可通过传参自定义——如 LifePlan 调用 `getErrorMessage(err, '获取方案失败')`。
- LifePlan.vue 本地版本（第102-109行）的 fallback 是 `'获取方案失败'`，在模板中的具体使用场景（`contentError` / `analysisError` / 通用错误提示）需确认是否传入自定义 fallback——保持与抽取前行为一致。
- Punch.vue 本地版本（第63-77行）额外包含了 `if (!err) return ''` 的空值判断。统一版本中 `if (typeof err === 'string') return err` 已在最后 return fallback，空值 null/undefined 会走到 fallback 返回 `'操作失败，请稍后重试'`。如果 Punch.vue 中存在依赖 `getErrorMessage(null)` 返回 `''` 的 UI 逻辑，需检查对应模板中的 `v-if` 条件是否用独立变量（如 `listError`）而非 `getErrorMessage(listError)` 的返回值来判断是否展示错误提示。

#### 3.2 修改 `src/views/LifePlan.vue`

(a) 在 `<script setup>` 顶部增加 import:
```typescript
import { getErrorMessage } from '@/utils/errorMessage'
```

(b) 删除第102-109行的本地 `getErrorMessage` 函数定义。

(c) 调用处传参审查:
   - 当前本地版本的 fallback 为 `'获取方案失败'`。
   - 检查 LifePlan.vue 模板中所有 `getErrorMessage(xxx)` 调用——如果调用处的上下文明确是"获取方案失败"，改为 `getErrorMessage(xxx, '获取方案失败')`；如果同一函数在不同上下文复用（如 contentError 和 analysisError），为每个使用场景传入对应的 fallback。

#### 3.3 修改 `src/views/Punch.vue`

(a) 在 `<script setup>` 顶部增加 import:
```typescript
import { getErrorMessage } from '@/utils/errorMessage'
```

(b) 删除第63-77行的本地 `getErrorMessage` 函数定义。

(c) 调用处传参审查:
   - 当前本地版本的 fallback 为 `'加载失败'`。
   - 检查 Punch.vue 模板中所有 `getErrorMessage(xxx)` 调用，确认是否传入 `'加载失败'` 作为自定义 fallback。

### 边界条件

- `getErrorMessage(null)` 返回 `'操作失败，请稍后重试'`（走 fallback 分支）。
- `getErrorMessage(undefined)` 返回 fallback。
- `getErrorMessage('网络错误')` 返回 `'网络错误'`（字符串 err 直接返回）。
- `getErrorMessage(new Error('超时'))` 返回 `'超时'`。
- 构造的 Error 对象附加 `{ response: { data: { message: '服务器错误' } } }` → 返回 `'服务器错误'`。这与 G14（success 拦截器）中构造的 `Promise.reject(err)` 兼容——G14 构造的 Error 对象附带了 `response` 属性。
- Punch.vue 本地版本中的 `if (!err) return ''` 逻辑：统一版本不包含此分支（null/undefined 走 fallback）。如果 Punch.vue 中存在依赖此行为的模板逻辑，需在调用处调整。

### 验收标准

- [ ] **AC-1: LifePlan API 错误提示正常** — 模拟 LifePlan 页面 API 请求失败（如断网），检查错误提示文案是否正常显示（应与抽取前一致或使用更通用的 fallback）。
- [ ] **AC-2: Punch API 错误提示正常** — 模拟 Punch 页面 API 请求失败，检查列表和分析区的错误提示是否正常显示。
- [ ] **AC-3: Axios 错误 message 提取** — 模拟后端返回 `{ response: { data: { message: '自定义错误' } } }` 的错误对象，检查 `getErrorMessage()` 是否返回 `'自定义错误'`。
- [ ] **AC-4: 空值不崩溃** — `getErrorMessage(null)` 返回 fallback 字符串而非抛出异常或返回 null。
- [ ] **AC-5: 编译验证** — `npx vue-tsc --noEmit` 无新增编译错误；LifePlan.vue 和 Punch.vue 删除本地函数后无未使用变量/import 警告。

---

## 任务组 G4: Punch.vue 环形图实现 -- G3 (完成率 SVG 环形图)

- **问题编号**: G3
- **严重程度**: 中/低（UI 完善）
- **预估工时**: 2-3h
- **前置依赖**: 无功能依赖。建议 G2+G3 (工具抽取) 之后执行——此时 Punch.vue 的 `<script setup>` import 结构已稳定。
- **与 G5 的关系**: G4 和 G5 修改 Punch.vue 的不同模板区域（统计卡区 vs 筛选区），无冲突，可并行。

### 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| 修改 | `src/views/Punch.vue` | 统计卡区域（第192-209行）：将渐变文字百分比替换为 SVG 环形图 |

### 具体修改描述

#### 4.1 设计依据

设计文档 4.3 节 Punch.vue 流程图（第3797行）明确要求: `分析数据展示 完成率环形图 近7天趋势柱状图`。当前实现为渐变文字百分比，无环形图。

#### 4.2 环形图实现方案

采用纯 SVG `<circle>` + `stroke-dasharray` 实现，避免引入第三方图表库（如 chart.js）增加包体积。

**SVG 环形图核心计算**:
```
圆环半径 r = 40, 圆心 (cx=50, cy=50)
圆周长 = 2 * π * r ≈ 251.2
stroke-dasharray = 圆周长（251.2）
stroke-dashoffset = 圆周长 * (1 - 完成率) = 251.2 * (1 - rate)
  - rate = 0.0 → dashoffset = 251.2（空环）
  - rate = 0.5 → dashoffset = 125.6（半环）
  - rate = 1.0 → dashoffset = 0（满环）
```

**模板代码**:
```html
<!-- 替换当前渐变文字区域 (第192-209行) -->
<div class="donut-chart">
  <svg viewBox="0 0 100 100" class="donut-svg">
    <!-- 背景环（灰色底） -->
    <circle
      cx="50" cy="50" r="40"
      fill="none"
      stroke="var(--color-border, #e0e0e0)"
      stroke-width="8"
    />
    <!-- 进度环（有颜色） -->
    <circle
      cx="50" cy="50" r="40"
      fill="none"
      stroke="var(--color-primary, #4A90D9)"
      stroke-width="8"
      stroke-linecap="round"
      stroke-dasharray="251.2"
      :stroke-dashoffset="dashOffset"
      class="donut-progress"
      transform="rotate(-90 50 50)"
    />
    <!-- 中心文字 -->
    <text x="50" y="50" text-anchor="middle" dominant-baseline="central"
          class="donut-text" :class="{ 'donut-text--small': rateText.length > 4 }">
      {{ rateText }}
    </text>
  </svg>
</div>
```

**`<script setup>` 中新增 computed**:
```typescript
// 计算完成率（0-1），基于 store.analysis 数据
const completionRate = computed(() => {
  const analysis = store.analysis
  if (!analysis || analysis.total === 0) return null
  return Math.min(analysis.completed / analysis.total, 1)
})

// 环形图 stroke-dashoffset
const CIRCLE_LENGTH = 2 * Math.PI * 40 // ≈ 251.2
const dashOffset = computed(() => {
  if (completionRate.value === null) return CIRCLE_LENGTH
  return CIRCLE_LENGTH * (1 - completionRate.value)
})

// 环形图中心文字
const rateText = computed(() => {
  if (completionRate.value === null) return '-'
  return Math.round(completionRate.value * 100) + '%'
})
```

**CSS 样式**:
```css
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

.donut-progress {
  transition: stroke-dashoffset 0.8s ease-out;
}

.donut-text {
  font-size: 14px;
  font-weight: 600;
  fill: var(--color-text, #333);
}

.donut-text--small {
  font-size: 12px;
}
```

**动画说明**: `stroke-dashoffset` 变化时使用 CSS `transition: stroke-dashoffset 0.8s ease-out` 实现环形图填充动画（约 0.8 秒从旧值过渡到新值）。`transform="rotate(-90 50 50)"` 使环形图从 12 点钟方向开始绘制（SVG 默认从 3 点钟方向开始）。

#### 4.3 保留现有趋势图

趋势图（第210-266行）保持当前 CSS 叠柱实现——诊断报告第406行已确认"CSS 叠柱在数据可视化效果上可接受"。不修改趋势图部分。

### 边界条件

- **完成率为 null/undefined（无分析数据）**: `completionRate` computed 返回 `null` → `dashOffset` 返回 `CIRCLE_LENGTH`（全空环）→ `rateText` 返回 `'-'`。环形图展示为灰色空环 + 中心 `-`。
- **total === 0（除零保护）**: `completionRate` computed 中的 `analysis.total === 0` 检查返回 `null`，避免 NaN。
- **completed > total（异常数据）**: `Math.min(analysis.completed / analysis.total, 1)` 限制最大为 1（满环），防止进度环溢出。
- **完成率为 0%（有数据但全部未完成）**: `dashOffset` = `CIRCLE_LENGTH`（全空环），`rateText` = `'0%'`——与无数据态 `'-'` 区分。
- **环形图动画**: 使用 CSS transition 而非 JS animation，降低运行时开销。首次渲染时 `dashOffset` 从 `CIRCLE_LENGTH` 过渡到目标值，视觉上呈现从空到满的填充动画。
- **响应式**: SVG `viewBox="0 0 100 100"` 保证矢量缩放，容器 `.donut-chart` 的 `width: 120px` 控制显示尺寸。在不同屏幕宽度下等比缩放无锯齿。

### 验收标准

- [ ] **AC-1: 有数据分析时展示环形图** — 进入 Punch 页面（有打卡记录），统计卡区域展示 SVG 环形图而非纯文字百分比。
- [ ] **AC-2: 完成率比例正确** — 验证 `completed=3, total=4` 时环形图填充约 3/4 圈，中心文字显示 `'75%'`。
- [ ] **AC-3: 无数据时展示空态** — 无打卡记录时，环形图展示为灰色空环 + 中心 `-`。
- [ ] **AC-4: 环形图填充动画** — 进入页面时环形图有约 0.8 秒的填充动画（从空到目标比例），切换筛选条件后重新动画。
- [ ] **AC-5: 编译验证** — `npx vue-tsc --noEmit` 无新增编译错误；`completionRate`/`dashOffset`/`rateText` computed 类型正确。

---

## 任务组 G5: Punch.vue 刷新按钮 -- G6 (fa-rotate + fetchList/fetchAnalysis)

- **问题编号**: G6
- **严重程度**: 中/低（UI 完善）
- **预估工时**: 1-2h
- **前置依赖**: 无功能依赖。建议 G2+G3 (工具抽取) 之后执行——此时 Punch.vue 的 `<script setup>` import 结构已稳定。
- **与 G4 的关系**: G4 和 G5 修改 Punch.vue 的不同模板区域（统计卡区 vs 筛选区），无冲突，可并行。

### 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| 修改 | `src/views/Punch.vue` | 筛选区模板（第270-304行之间）：新增刷新按钮 |

### 具体修改描述

#### 5.1 设计依据

设计文档 4.1.8 节 Punch.vue 组件 DOM 树（第3298行）明确要求: `<button class="btn-icon" id="btn-refresh"> <i class="fas fa-sync">`。当前筛选区仅包含日期输入和类型 chip 按钮，无刷新按钮——属于组件树元素遗漏。

#### 5.2 模板新增

在筛选区日期行内或 chip 行内增加刷新按钮。建议放在日期行右侧（与日期输入框同行），布局紧凑:

```html
<!-- 在日期筛选行内 (第270行附近) -->
<div class="filter-row">
  <div class="filter-dates">
    <!-- 现有日期输入框 -->
    <input type="date" v-model="dateStart" @change="onDateChange" />
    <span class="date-separator">-</span>
    <input type="date" v-model="dateEnd" @change="onDateChange" />
  </div>
  <!-- 新增刷新按钮 -->
  <button
    class="btn-icon press"
    id="btn-refresh"
    @click="onRefresh"
    :disabled="store.listLoading || store.analysisLoading"
    :title="refreshTitle"
  >
    <i class="fa-solid fa-rotate" :class="{ 'fa-spin': isRefreshing }"></i>
  </button>
</div>
```

#### 5.3 `<script setup>` 中新增

```typescript
import { ref, computed } from 'vue'

// 刷新中的视觉状态（延迟500ms后展示旋转动画，避免快速刷新时闪烁）
const REFRESH_ANIM_DELAY = 500
const isRefreshing = ref(false)
let refreshAnimTimer: ReturnType<typeof setTimeout> | null = null

const refreshTitle = computed(() => {
  if (store.listLoading || store.analysisLoading) return '刷新中...'
  return '刷新打卡数据'
})

async function onRefresh() {
  if (store.listLoading || store.analysisLoading) return

  try {
    isRefreshing.value = true
    // 延迟启动旋转动画（避免快速返回时闪烁）
    refreshAnimTimer = setTimeout(() => {
      isRefreshing.value = true
    }, REFRESH_ANIM_DELAY)

    // 并发刷新列表和分析
    await Promise.all([store.fetchList(), store.fetchAnalysis()])
  } catch {
    // 错误由各自 Store 的 error ref 处理，onRefresh 层面不重复提示
  } finally {
    if (refreshAnimTimer) {
      clearTimeout(refreshAnimTimer)
      refreshAnimTimer = null
    }
    isRefreshing.value = false
  }
}
```

**注意**: `onRefresh` 在 `onUnmounted` 中需清理定时器:
```typescript
// 在 onUnmounted 中追加
if (refreshAnimTimer) {
  clearTimeout(refreshAnimTimer)
  refreshAnimTimer = null
}
```

#### 5.4 CSS 样式

```css
#btn-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--color-border, #ddd);
  background: var(--color-bg, #fff);
  cursor: pointer;
  transition: background 0.2s;
}

#btn-refresh:hover:not(:disabled) {
  background: var(--color-bg-hover, #f5f5f5);
}

#btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

#btn-refresh .fa-spin {
  animation: fa-spin 1s linear infinite;
}

/* FontAwesome 旋转动画（若项目未引入 FontAwesome 动画 CSS） */
@keyframes fa-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
```

### 边界条件

- **防双击/防重复刷新**: `onRefresh` 函数入口检查 `store.listLoading || store.analysisLoading`，正在加载时 return 不执行。按钮的 `:disabled` 属性也绑定到相同条件。
- **加载中视觉反馈**: 刷新按钮 `:class="{ 'fa-spin': isRefreshing }"` — 加载中时图标旋转。为避免快速刷新时旋转闪烁，`isRefreshing` 使用 500ms 延迟后才设为 `true`（如果刷新在 500ms 内完成，图标不旋转直接恢复）。
- **刷新保持当前筛选**: `fetchList()` 和 `fetchAnalysis()` 均读取 `store.filter` 中的当前日期和类型，刷新不重置筛选条件。
- **错误处理**: `fetchList()` 和 `fetchAnalysis()` 各自在 Store 层面有 try/catch 和 error ref，`onRefresh` 不额外处理错误提示——由 Store 的 error ref 驱动 UI 错误展示。
- **组件卸载清理**: `onUnmounted` 中清除 `refreshAnimTimer`，避免已卸载组件上的定时器回调操作已销毁的响应式状态。

### 验收标准

- [ ] **AC-1: 刷新按钮存在且有旋转动画** — 筛选区可见刷新型图标按钮（`fa-rotate`）。点击后图标旋转（`fa-spin`），完成后旋转停止。
- [ ] **AC-2: 刷新触发数据重载** — DevTools Network 面板检查：点击刷新后 `/api/punch/list` 和 `/api/punch/analysis` 各发出 1 次新请求。
- [ ] **AC-3: 防双击** — 快速双击刷新按钮，Network 面板仅显示 1 次 `/api/punch/list` + 1 次 `/api/punch/analysis` 请求（第二次点击被 `loading` 守卫拦截）。
- [ ] **AC-4: 刷新保持筛选条件** — 选择特定日期范围和打卡类型后点击刷新，Network 请求参数包含当前筛选条件不变。
- [ ] **AC-5: 编译验证** — `npx vue-tsc --noEmit` 无新增编译错误；`onRefresh` / `isRefreshing` / `refreshTitle` 类型正确。

---

## 跨轮次依赖就绪确认

| 前置依赖 | 来自轮次 | 状态 | 对 v4 的影响 |
|---------|:------:|:----:|------------|
| S9 (fetchAnalysis 竞态保护) | v1 | **已完成** | G5 (刷新按钮) 调用 `store.fetchAnalysis()` 自动受益于已完成的竞态保护。 |
| S3 (默认近30天筛选) | v1 | **已完成** | G5 (刷新按钮) 的 `fetchList()` 调用自动受益于已设置的默认日期筛选。 |
| G14 (success 拦截器) | v2 | **已完成 (phase1 console.warn)** | sanitize.ts / useMarkdown.ts / errorMessage.ts 均不直接调用 API，不受 G14 影响。G5 的 `fetchList()`/`fetchAnalysis()` 走 punchStore → usePunchApi → axios，自动受益于 G14 的统一错误拦截。 |
| S5b-1/S5b-2 (chatStore SSE) | v3 | **已完成** | 无交叉依赖。chatStore 与 P3 层工具文件（sanitize/useMarkdown/errorMessage）完全独立。 |
| marked v12 版本 | — | 已安装 | G2 的 `renderMarkdown()` 使用 `marked.parse(md, { async: false })`，已验证当前项目安装的 marked 版本支持此 API。 |

**结论**: 所有跨轮次硬性依赖已满足。v4 可以立即开始。

---

## 文件修改清单

| 文件 | G1 | G2 | G3 | G4 | G5 | 操作 | 预估行数 |
|------|:--:|:--:|:--:|:--:|:--:|------|:------:|
| `src/utils/sanitize.ts` | ++ | | | | | **新建** | ~60行 |
| `src/composables/useMarkdown.ts` | | ++ | | | | **新建** | ~40行 |
| `src/utils/errorMessage.ts` | | | ++ | | | **新建** | ~30行 |
| `src/views/Home.vue` | + | | | | | 修改（import 替换 + 删除本地函数） | ~4行净增 |
| `src/views/LifePlan.vue` | + | + | + | | | 修改（import 替换 + 删除本地函数 x2） | ~4行净增 |
| `src/views/Punch.vue` | + | + | + | ++ | ++ | 修改（import 替换 + 删除本地函数 x2 + 环形图 + 刷新按钮） | ~100行净增 |
| **合计** | ~60 | ~40 | ~30 | ~50 | ~50 | — | **~230行** |

> **Punch.vue 修改协调说明**: Punch.vue 被 5 个任务组共同修改（G1 替换 DOMPurify import、G2 删除 safeAnalysisHtml、G3 删除 getErrorMessage、G4 新增环形图模板+computed、G5 新增刷新按钮+onRefresh）。5 处修改在文件的不同区域：
> - `<script setup>` import 区: G1/G2/G3（新增 3 个 import，删除 DOMPurify/marked import）
> - `<script setup>` 函数定义区: G2/G3（删除本地函数）、G5（新增 onRefresh + computed）
> - `<template>` 统计卡区: G4（SVG 环形图）
> - `<template>` 筛选区: G5（刷新按钮）
>
> 修改区域不重叠，理论上可并行。建议工具抽取先完成（G1+G2+G3 一次性稳定 import 结构），UI 新增在此基础上执行（G4+G5）。

---

## 风险提示

1. **G12+S10 共享 sanitize.ts 的首次提交质量**（概率: 低，影响: 中）: G1 是 v4 的基石任务——sanitize.ts 的 `sanitizeHtml()` 被 G2 (useMarkdown.ts) 直接引用，也被 Home/LifePlan/Punch 三个 View 文件 import。如果 sanitize.ts 的 ALLOWED_TAGS/ATTR 白名单配置过严，可能导致合法 Markdown 内容被截断。缓解措施: G1 完成后先在 LifePlan 页面验证方案内容的 Markdown 渲染完整性（标题/列表/代码块/链接/图片），再继续 G2。

2. **G2 (useMarkdown.ts) 与 G1 (sanitize.ts) 的鸡-蛋依赖**（概率: 中，影响: 低）: 审查报告维度二发现——G2 的 `renderMarkdown()` 应使用 G1 的 `sanitizeHtml()` 而非裸 `DOMPurify.sanitize()`。如果 G2 先于 G1 执行，G1 完成后需回修 useMarkdown.ts 的 1-2 行代码。缓解措施: 严格按 G1→G2 顺序执行，或 G1/G2 由同一开发者连续完成。

3. **Punch.vue 被 5 个任务组共同修改的合并冲突**（概率: 中，影响: 中）: 虽然 5 处修改在文件不同区域，但如果拆分给不同开发者在不同分支上并行，任何一方的修改位置估算偏差都可能导致合并冲突。缓解措施: 建议同一开发者按 G1→G2→G3→G4→G5 顺序完成所有 Punch.vue 修改，或 G1+G2+G3 由开发者 A 完成（稳定 import 结构），G4+G5 由开发者 B 在 A 之后执行。

4. **DOMPurify 白名单过严导致已有合法内容被截断**（概率: 低，影响: 高）: 当前 LifePlan 方案内容和 Punch 分析评语中如果包含不在 ALLOWED_TAGS 中的合法标签（如 `<sup>`/`<sub>` 上标下标、`<del>` 删除线、`<kbd>` 键盘键等），sanitizeHtml 会移除这些标签。缓解措施: G1 完成后先在三个页面进行渲染回归验证（对比替换前后的 HTML 输出），如果发现合法标签被移除，评估是否扩展 ALLOWED_TAGS 白名单。

5. **G14-phase2 (console.warn→Promise.reject) 切换时机**（概率: 低，影响: 低）: v2-r1 审查建议 R3 和 v3-r2 建议 S4 均跟踪了 G14 的两阶段部署状态。v4 不涉及 G14 的切换（non-blocking），但建议在 v4 开始前确认 G14 当前仍为 console.warn 阶段。若后端 `success: false` 语义已确认无误报，可在 v5 中安排切换为 `Promise.reject`。

---

## 补充建议（来自审查报告，非阻塞）

| 编号 | 建议 | 来源 | 本文件采纳情况 |
|:--:|------|------|:------------:|
| S1 | G12+S10 合并为一个任务组（共享 sanitize.ts） | 审查报告维度二 | **已采纳** — G1 一站化完成 |
| S2 | G7 的 renderMarkdown 直接使用 S10 的 sanitizeHtml | 审查报告维度二 | **已采纳** — G2 依赖 G1，使用 `sanitizeHtml()` 而非裸 DOMPurify |
| S3 | G14-phase2 切换状态在 v4 开始前确认 | v2-r1 建议 R3 跟踪 | 标注在风险提示第5项，建议 v5 安排 |
| S4 | Punch.vue 修改由同一开发者按序执行 | 审查报告维度三 | 标注在风险提示第3项 |
| S5 | G12+S10→G7 顺序优于诊断报告的 S10 依赖 G7 顺序 | 审查报告维度二 | **已采纳** — 执行顺序为 G1→G2，与诊断报告偏差已在 G2 前置依赖中注明 |

---

*第4轮任务文件结束。下一轮 v5 将处理: P4 层任务（G24/G25 + G1/G2 + G9-G29 剩余 ~15 项）及 v3 可推迟项（断线重连指数退避 + 多医生路由 + fabOpen + Markdown 增强，约 8h）。*
