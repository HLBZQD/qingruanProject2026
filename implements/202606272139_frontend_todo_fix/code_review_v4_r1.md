# 第4轮代码审查报告 v4-r1

> **审查日期**: 2026-06-28
> **审查基线**: `detail_v4.md` + `code_v4.md`
> **编译验证**: `npx vue-tsc --noEmit` exit code 0, 0 errors

---

## 审查结论: APPROVED

所有 7 个审查维度均通过。

---

## 维度 1: sanitize.ts DOMPurify 白名单与设计一致性 -- PASS

| 配置项 | 设计规格 (detail_v4.md) | 实际代码 (sanitize.ts) | 状态 |
|--------|------------------------|----------------------|:----:|
| ALLOWED_TAGS | 28 个标签 (h1-h6, p, br, strong/em/b/i/u/s, a, ul/ol/li, blockquote, code/pre, hr, table/thead/tbody/tr/th/td, span/div, img) | 28 个标签, 逐一匹配 | OK |
| ALLOWED_ATTR | 10 个属性 (href, title, rel, alt, src, width, height, class, style, target) | 10 个属性, 逐一匹配, 含 S1 新增的 `rel` | OK |
| ALLOWED_URI_REGEXP | 修正版 (detail 1.10): `/^(?:(?:https?\|mailto):\|[/#.]\|[^/\s:]+$)/i` | 一致, 支持绝对路径 `/xxx`, 拦截 `javascript:`/`data:` 伪协议 | OK |
| FORBID_TAGS | 11 个 (style, script, iframe, object, embed, form, input, button, textarea, select, option) | 11 个, 逐一匹配 | OK |
| FORBID_ATTR | 12 个 (onerror, onload, onclick, onmouseover, onfocus, onblur, onchange, onsubmit, onkeydown, onkeyup, onkeypress) | 12 个, 逐一匹配 | OK |
| RETURN_DOM* | 3 项均为 false | 3 项均为 false | OK |

**白名单论证验证**: ALLOWED_TAGS 完整覆盖 CommonMark + GFM 表格扩展。ALLOWED_ATTR 包含 `rel` 以配合 G2 的 marked link renderer 注入 `rel="noopener noreferrer"`。FORBID_TAGS/FORBID_ATTR 双保险机制正确实现。ALLOWED_URI_REGEXP 使用 detail 1.10 修正版, 不会误杀 `/xxx` 绝对路径。

## 维度 2: useMarkdown.ts 对 G1 sanitizeHtml 的引用 -- PASS

| 检查项 | 设计规格 (detail_v4.md 2.3) | 实际代码 (useMarkdown.ts) | 状态 |
|--------|---------------------------|-------------------------|:----:|
| import 路径 | `import { sanitizeHtml } from '@/utils/sanitize'` | 第 2 行, 完全一致 | OK |
| 管道调用 | `sanitizeHtml(rawHtml)` 作为管道末级 | 第 64 行, 完全一致 | OK |
| marked link renderer | 注入 `rel="noopener noreferrer" target="_blank"` 仅对外部链接 | 第 34-42 行, 逻辑正确 | OK |
| G16 async 兼容注释 | 文件顶部标注 marked v13+ 迁移步骤 | 第 4-19 行, 内容完整 | OK |
| 空值防御 | null/undefined/空字符串返回 `''` | 第 56-58 行, 逻辑正确 | OK |
| marked.use() 注册 | renderer 通过 `marked.use({ renderer })` 全局生效 | 第 42 行 | OK |

**依赖方向验证**: G2 → G1 依赖正确: `useMarkdown.ts` 导入 `sanitizeHtml` 而非裸 `DOMPurify.sanitize()`, 符合设计 2.9 节"依赖 G1 (sanitize.ts)"约定。

## 维度 3: errorMessage.ts 含 response.data.error.message 路径 -- PASS

| 检查项 | 设计规格 (detail_v4.md 3.2) | 实际代码 (errorMessage.ts) | 状态 |
|--------|---------------------------|--------------------------|:----:|
| 嵌套路径类型 | `error?: { message?: string }` | 第 30 行, 类型定义完整 | OK |
| 优先级1 嵌套提取 | `response?.data?.error?.message` | 第 35 行, 逻辑正确 | OK |
| 优先级1 浅层提取 | `response?.data?.message` | 第 36 行, 逻辑正确 | OK |
| 优先级2 Error | `err instanceof Error` → `err.message` | 第 40 行 | OK |
| 优先级3 字符串 | `typeof err === 'string'` → `err` | 第 43 行 | OK |
| 优先级4 fallback | 默认 `'操作失败, 请稍后重试'` | 第 23 行, 第 46 行 | OK |
| B1 修复验证 | 嵌套 `error.message` 路径已补回 | 第 30/35 行 | OK |

**空值行为验证**: `getErrorMessage(null)` → 不匹配优先级1 (null 不可 `'response' in err`), 不匹配优先级2 (非 Error), 不匹配优先级3 (非字符串), 返回 fallback `'操作失败, 请稍后重试'`。三处调用点均传入自定义 fallback (LifePlan: `'方案加载失败'`, Punch: `'AI 分析暂不可用'`/`'打卡记录加载失败'`/`'加载失败'`), 语义无损。

## 维度 4: Punch.vue SVG 环形图正确性 -- PASS

### 数学验证

| 参数 | 公式/值 | 验证 |
|------|---------|:----:|
| CIRCLE_LENGTH | `2 * Math.PI * 40 ≈ 251.33` | OK (运行时精确, 非 hardcode) |
| completionRate=null | `dashOffset = CIRCLE_LENGTH` | OK (全空环) |
| completionRate=0 | `dashOffset = CIRCLE_LENGTH` | OK (全空环) |
| completionRate=0.50 | `dashOffset = CIRCLE_LENGTH * 0.5 ≈ 125.66` | OK (半环) |
| completionRate=0.75 | `dashOffset = CIRCLE_LENGTH * 0.25 ≈ 62.83` | OK (3/4 环) |
| completionRate=1.00 | `dashOffset = 0` | OK (满环) |

### SVG 结构验证

| 元素 | 属性 | 验证 |
|------|------|:----:|
| 背景环 | `cx=50 cy=50 r=40 fill=none stroke=var(--color-border) stroke-width=8` | OK |
| 进度环 | `:stroke-dasharray="CIRCLE_LENGTH" :stroke-dashoffset="dashOffset"` | OK |
| 起点方向 | `transform="rotate(-90 50 50)"` (12点钟) | OK |
| 圆角端点 | `stroke-linecap="round"` | OK |
| 中心文字 | `text-anchor="middle" dominant-baseline="central"` | OK |
| 小字号变体 | `:class="{ 'donut-text--small': rateText.length > 4 }"` | OK |
| 动画过渡 | `transition: stroke-dashoffset 0.8s ease-out` | OK |

### API 适配说明 (有意偏离设计)

设计 detail 4.5 使用 `completed/total` 计算完成率, 但 `PunchAnalysisResponse` 无此字段。代码改为 `(diet_completion_rate + exercise_completion_rate) / 2`, 描述文字使用 `total_punches`。此偏离已在 code_v4.md "API适配说明" 中记录, 为合理适配。

## 维度 5: Punch.vue 刷新按钮防双击正确性 -- PASS

### 双层防护验证

| 层级 | 实现 | 位置 | 验证 |
|------|------|------|:----:|
| UI 层 | `:disabled="store.listLoading \|\| store.analysisLoading"` | Punch.vue 第 419 行 | OK |
| 逻辑层 | `if (store.listLoading \|\| store.analysisLoading) return` | Punch.vue 第 166 行 | OK |

### 时序分析

```
场景 A: 快速双击 (<100ms)
  click#1 → onRefresh() → loading=false → 通过
          → fetchList() 内部设置 listLoading=true
  click#2 → onRefresh() → listLoading=true → return (被拦截)
          → 按钮 :disabled=true (被拦截)
  结果: 仅 1 次请求

场景 B: 加载中点击
  loading=true → :disabled=true (按钮灰显, 不可点击)
  → 即使用 JS 调用 onRefresh(), 入口守卫 return
  结果: 0 次请求
```

### 动画延迟验证

| 检查项 | 设计 | 实际 | 状态 |
|--------|------|------|:----:|
| 延迟 ms | 500ms (REFRESH_ANIM_DELAY) | 第 149 行, 500ms | OK |
| 延迟启动 | `setTimeout(() => { isRefreshing.value = true }, 500)` | 第 170-172 行 | OK |
| 快速刷新抑制 | <500ms 完成 → clearTimeout → 图标不旋转 | finally 块第 181-184 行 | OK |
| 慢速刷新展示 | >500ms → timer 触发 → fa-spin 旋转 | 逻辑正确 | OK |
| onUnmounted 清理 | `clearTimeout(refreshAnimTimer)` | 第 231-234 行 | OK |

## 维度 6: 三个 View 文件 import 替换完整性 -- PASS

### Home.vue

| 操作 | 设计要求 | 验证结果 |
|------|---------|:--------:|
| 移除 `import DOMPurify from 'dompurify'` | 不再直接引用 | 第 1-8 行无此 import | OK |
| 新增 `import { escapeHtml, sanitizeHtml }` | 从 `@/utils/sanitize` | 第 5 行 | OK |
| 删除本地 `escapeHtml()` | 函数定义删除 | 文件中无此函数定义 | OK |
| `DOMPurify.sanitize(html)` → `sanitizeHtml(html)` | 第 116 行附近 | 第 116 行 `sanitizeHtml(...)` | OK |
| `escapeHtml(body)` 调用保持 | 第 114 行 | 第 114 行 `escapeHtml(body)` | OK |

### LifePlan.vue

| 操作 | 设计要求 | 验证结果 |
|------|---------|:--------:|
| 移除 `import { marked } from 'marked'` | 不再直接引用 | 第 1-15 行无此 import | OK |
| 移除 `import DOMPurify from 'dompurify'` | 不再直接引用 | 第 1-15 行无此 import | OK |
| 新增 `import { renderMarkdown }` | 从 `@/composables/useMarkdown` | 第 4 行 | OK |
| 新增 `import { getErrorMessage }` | 从 `@/utils/errorMessage` | 第 5 行 | OK |
| 删除本地 `safeContentHtml()` | 函数定义删除 | 文件中无此函数定义 | OK |
| 删除本地 `getErrorMessage()` | 函数定义删除 | 文件中无此函数定义 | OK |
| 模板 `safeContentHtml(...)` → `renderMarkdown(...)` | 3 处调用 | 第 500/530/555 行 | OK |
| 模板 `getErrorMessage(...)` 调用 | 2 处, 均传自定义 fallback | 第 245/587 行 | OK |

### Punch.vue

| 操作 | 设计要求 | 验证结果 |
|------|---------|:--------:|
| 移除 `import { marked } from 'marked'` | 不再直接引用 | 第 1-8 行无此 import | OK |
| 移除 `import DOMPurify from 'dompurify'` | 不再直接引用 | 第 1-8 行无此 import | OK |
| 新增 `import { renderMarkdown }` | 从 `@/composables/useMarkdown` | 第 4 行 | OK |
| 新增 `import { getErrorMessage }` | 从 `@/utils/errorMessage` | 第 5 行 | OK |
| 删除本地 `safeAnalysisHtml()` | 函数定义删除 | 文件中无此函数定义 | OK |
| 删除本地 `getErrorMessage()` | 函数定义删除 | 文件中无此函数定义 | OK |
| 模板 `safeAnalysisHtml(...)` → `renderMarkdown(...)` | 1 处调用 | 第 371 行 | OK |
| 模板 `getErrorMessage(...)` 调用 | 3 处, 均传自定义 fallback | 第 268/465/552 行 | OK |

## 维度 7: vue-tsc 类型安全 -- PASS

### 编译结果

```
npx vue-tsc --noEmit
EXIT_CODE = 0
0 errors, 0 warnings
```

### 类型链验证

| 类型路径 | 验证 |
|---------|:----:|
| `sanitize.ts`: `escapeHtml(str: string): string` | 类型签名正确 |
| `sanitize.ts`: `sanitizeHtml(html: string): string` | 类型签名正确 |
| `useMarkdown.ts`: `renderMarkdown(markdown: unknown): string` | 类型签名正确, `import { sanitizeHtml }` 路径解析正确 |
| `errorMessage.ts`: `getErrorMessage(err: unknown, fallback?: string): string` | 类型签名正确, 内联类型 `{ error?: { message?: string } }` 正确 |
| `Home.vue`: `import { escapeHtml, sanitizeHtml }` | 路径解析正确, 函数签名匹配调用 |
| `LifePlan.vue`: `import { renderMarkdown, getErrorMessage }` | 路径解析正确, v-html 绑定返回 string |
| `Punch.vue`: `CIRCLE_LENGTH: number` (inferred) | 类型正确 |
| `Punch.vue`: `completionRate: ComputedRef<number \| null>` | 类型正确 |
| `Punch.vue`: `dashOffset: ComputedRef<number>` | 类型正确 (null 分支早返回) |
| `Punch.vue`: `rateText: ComputedRef<string>` | 类型正确 |
| `Punch.vue`: `isRefreshing: Ref<boolean>` | 类型正确 |
| `Punch.vue`: template `:stroke-dasharray="CIRCLE_LENGTH"` | SVG 属性接受 number |
| `Punch.vue`: template `:stroke-dashoffset="dashOffset"` | SVG 属性接受 number |
| `Punch.vue`: template `:disabled="store.listLoading \|\| store.analysisLoading"` | boolean 表达式 |
| Store: `analysis: Ref<PunchAnalysisResponse \| null>` | 类型定义在 punchStore.ts:25 |
| API: `PunchAnalysisResponse` | diet_completion_rate/exercise_completion_rate/total_punches/adherence_comment/improvement_suggestions/last_7_days_trend 字段齐全 |

---

## 跨维度一致性检查

| 检查项 | 描述 | 状态 |
|--------|------|:----:|
| G1→G2 依赖链 | sanitizeHtml() 白名单含 `rel` → useMarkdown.ts marked renderer 注入 `rel` → sanitizeHtml 放行 | OK |
| G1→Views 调用 | 三个 View 均不直接 import DOMPurify, 统一经 sanitize.ts | OK |
| G2→Views 调用 | LifePlan + Punch 均使用 renderMarkdown, 已删除本地函数 | OK |
| G3→Views 调用 | LifePlan + Punch 均使用 getErrorMessage, 已删除本地函数, 自定义 fallback 保留 | OK |
| G4/G5 区域隔离 | 环形图在统计卡区, 刷新按钮在筛选区, 互不重叠 | OK |
| 文件修改协调 | Punch.vue 各区域 (import/函数删除/新增 computed/模板/样式) 修改不重叠, 最终文件一致 | OK |
| G16 兼容注释 | useMarkdown.ts 顶部, 一处添加, 全局可见 | OK |
| S1 rel 属性 | sanitize.ts ALLOWED_ATTR + useMarkdown.ts renderer 双向配合 | OK |

---

## 审查统计

| 指标 | 数值 |
|------|:---:|
| 审查维度 | 7 |
| 通过维度 | 7 |
| 阻断问题 | 0 |
| 建议问题 | 0 |
| 新建文件审查 | 3 (sanitize.ts, useMarkdown.ts, errorMessage.ts) |
| 修改文件审查 | 3 (Home.vue, LifePlan.vue, Punch.vue) |
| vue-tsc 错误 | 0 |

---

*审查报告结束。结论: APPROVED*
