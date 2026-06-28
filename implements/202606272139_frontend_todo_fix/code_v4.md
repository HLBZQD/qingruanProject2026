# 第4轮代码变更报告 v4

> **日期**: 2026-06-28
> **执行顺序**: G1 → G2 → G3 → G4 → G5
> **编译验证**: `npx vue-tsc --noEmit` 通过 (exit code 0)

---

## 变更概览

| 任务组 | 操作 | 涉及文件 |
|:------:|------|---------|
| G1 | 新建 `sanitize.ts` + 修改 3 个 View | 4 文件 |
| G2 | 新建 `useMarkdown.ts` + 修改 2 个 View | 3 文件 |
| G3 | 新建 `errorMessage.ts` + 修改 2 个 View | 3 文件 |
| G4 | 环形图 (Punch.vue) | 1 文件 |
| G5 | 刷新按钮 (Punch.vue) | 1 文件 |

**新建文件**: 3
**修改文件**: 3
**净增行数**: ~310 行

---

## G1: sanitize.ts 一站化

### 新建 `src/utils/sanitize.ts` (~90行)

- **`escapeHtml(str)`**: HTML 实体转义（`& < > " '` → 实体），迁移自 Home.vue 原本地函数
- **`sanitizeHtml(html)`**: DOMPurify 白名单加固封装，包含:
  - ALLOWED_TAGS: h1-h6, p, br, strong/em/b/i/u/s, a, ul/ol/li, blockquote, code/pre, hr, table/thead/tbody/tr/th/td, span/div, img
  - ALLOWED_ATTR: href, title, rel, alt, src, width, height, class, style, target
  - ALLOWED_URI_REGEXP: `/^(?:(?:https?|mailto):|[/#.]|[^/\s:]+$)/i` (修正版，支持绝对路径 `/xxx`)
  - FORBID_TAGS: style, script, iframe, object, embed, form, input, button, textarea, select, option
  - FORBID_ATTR: onerror, onload, onclick, onmouseover, onfocus, onblur, onchange, onsubmit, onkeydown, onkeyup, onkeypress

### 修改 `src/views/Home.vue`

- 移除 `import DOMPurify from 'dompurify'`
- 新增 `import { escapeHtml, sanitizeHtml } from '@/utils/sanitize'`
- `DOMPurify.sanitize(html)` → `sanitizeHtml(html)` (糖尿病类型弹窗 Markdown 净化)
- 删除本地 `escapeHtml()` 函数定义（6行）

### 修改 `src/views/LifePlan.vue`

- 配合 G2 一并完成 import 替换（见 G2 节）

### 修改 `src/views/Punch.vue`

- 配合 G2 一并完成 import 替换（见 G2 节）

---

## G2: useMarkdown.ts 抽取

### 新建 `src/composables/useMarkdown.ts` (~55行)

- **`renderMarkdown(markdown: unknown): string`**: Markdown → 安全 HTML 管道
  - 空值防御: `null`/`undefined`/空字符串 → `''`
  - 非字符串: `String(markdown)` 转换后渲染
  - 管道: `marked.parse({ async: false })` → `sanitizeHtml()` (G1)
- **marked link renderer**: 外部链接自动注入 `rel="noopener noreferrer" target="_blank"`，内部链接不添加
- **G16 异步兼容性注释**: 文件顶部标记了 marked v13+ 可能的同步模式移除及迁移步骤

### 修改 `src/views/LifePlan.vue`

- 移除 `import { marked } from 'marked'` 和 `import DOMPurify from 'dompurify'`
- 新增 `import { renderMarkdown } from '@/composables/useMarkdown'`
- 删除本地 `safeContentHtml()` 函数（7行）
- 模板: `safeContentHtml(item.content)` → `renderMarkdown(item.content)` (3处)

### 修改 `src/views/Punch.vue`

- 移除 `import { marked } from 'marked'` 和 `import DOMPurify from 'dompurify'`
- 新增 `import { renderMarkdown } from '@/composables/useMarkdown'`
- 删除本地 `safeAnalysisHtml()` 函数（7行）
- 模板: `safeAnalysisHtml(store.analysis.adherence_comment)` → `renderMarkdown(store.analysis.adherence_comment)` (1处)

---

## G3: errorMessage.ts 抽取

### 新建 `src/utils/errorMessage.ts` (~40行)

- **`getErrorMessage(err: unknown, fallback?: string): string`**: 统一错误消息提取
  - 优先级1: `err.response?.data?.error?.message` (嵌套) → `err.response?.data?.message` (浅层)
  - 优先级2: `err.message` (标准 Error)
  - 优先级3: `err` 本身 (字符串)
  - 优先级4: `fallback` 默认 `'操作失败，请稍后重试'`
- 类型定义包含嵌套 `error.message` 路径（审查报告 B1 修复）

### 修改 `src/views/LifePlan.vue`

- 新增 `import { getErrorMessage } from '@/utils/errorMessage'`
- 删除本地 `getErrorMessage()` 函数（8行）
- 所有模板调用 `getErrorMessage(xxx, '自定义fallback')` 保持不变（调用方已传自定义 fallback）

### 修改 `src/views/Punch.vue`

- 新增 `import { getErrorMessage } from '@/utils/errorMessage'`
- 删除本地 `getErrorMessage()` 函数（12行）
- 所有模板调用点保持不变（调用方已传自定义 fallback: `'AI 分析暂不可用'`、`'打卡记录加载失败'`、`'加载失败'`）

---

## G4: Punch.vue SVG 环形图

### 修改 `src/views/Punch.vue`

**`<script setup>` 新增** (~30行):
- `CIRCLE_LENGTH = 2 * Math.PI * 40` (模块级常量)
- `completionRate` computed: 综合完成率 = 饮食+运动完成率平均值，无数据/null/total=0 → `null`
- `dashOffset` computed: `CIRCLE_LENGTH * (1 - completionRate)`，无数据 → `CIRCLE_LENGTH`
- `rateText` computed: 百分比字符串或 `'-'`

**`<template>` 新增** (~28行):
- SVG 环形图卡片（统计卡区的第4张卡片"综合完成率"）
  - 背景环 (灰色，stroke=--color-border)
  - 进度环 (主色，stroke=--color-primary，:stroke-dasharray="CIRCLE_LENGTH"，:stroke-dashoffset="dashOffset")
  - 中心文字 (rateText，4字符以上缩小字号)
  - 描述行 `总打卡 X 次`

**`<style scoped>` 新增** (~35行):
- `.punch-donut-card`, `.donut-chart`, `.donut-svg`, `.donut-progress`, `.donut-text`, `.donut-text--small`, `.punch-stat-desc`
- 进度环动画: `transition: stroke-dashoffset 0.8s ease-out`
- 圆环起点: `transform="rotate(-90 50 50)"` (从12点钟方向开始)

**API适配说明**: 由于 API `PunchAnalysisResponse` 无 `completed`/`total` 字段，综合完成率改为饮食+运动完成率的平均值，描述文字使用 `total_punches` 字段。

---

## G5: Punch.vue 刷新按钮

### 修改 `src/views/Punch.vue`

**`<script setup>` 新增** (~42行):
- `REFRESH_ANIM_DELAY = 500` (旋转动画延迟 ms)
- `isRefreshing` ref (控制 `fa-spin` class)
- `refreshAnimTimer` (setTimeout handle)
- `refreshTitle` computed (加载中 → '刷新中...'，否则 → '刷新打卡数据')
- `onRefresh()` async (防双击守卫 → 延迟启动旋转 → `Promise.all([fetchList, fetchAnalysis])` → finally 清理)
- `onUnmounted` 中追加 `refreshAnimTimer` 清理

**`<template>` 新增** (~12行):
- 刷新按钮 (#btn-refresh)，位于筛选区日期行右侧
  - 按钮 disabled 绑定 `store.listLoading || store.analysisLoading`
  - title 绑定 `refreshTitle`
  - 图标 `fa-solid fa-rotate`，条件 class `fa-spin` on `isRefreshing`

**`<style scoped>` 新增** (~35行):
- `#btn-refresh`: 圆形36px按钮，border+过渡
- hover: 背景微变 + 图标变主色
- disabled: 半透明 + 禁用手型
- `@keyframes refresh-spin`: 1s linear infinite 旋转动画

**防双击机制**: 双层防护 — UI层 `:disabled` + 逻辑层入口 `if (loading) return`
**动画延迟**: `isRefreshing` 仅在 `setTimeout 500ms` 后设为 true，避免 <500ms 的快速刷新导致图标闪烁

---

## 文件级修改协调说明

Punch.vue 被 5 个任务组修改，各修改区域不重叠:

| 区域 | G1 | G2 | G3 | G4 | G5 |
|------|:--:|:--:|:--:|:--:|:--:|
| `<script setup>` import 区 | — | ++ | ++ | — | — |
| `<script setup>` 函数删除 | — | ++ | ++ | — | — |
| `<script setup>` 新增代码 | — | — | — | ++ | ++ |
| `<template>` 统计卡区 | — | — | — | ++ | — |
| `<template>` 筛选区 | — | — | — | — | ++ |
| `<style scoped>` 新增区 | — | — | — | ++ | ++ |

由于按 G1→G2→G3→G4→G5 顺序单人串行执行，各 View 文件在每步均处于一致状态，无合并冲突。

---

## 编译验证

```
$ npx vue-tsc --noEmit
EXIT_CODE=0
```

无编译错误、无类型错误、无未使用 import 警告。

---

*代码变更报告结束。*
