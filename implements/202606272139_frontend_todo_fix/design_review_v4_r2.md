# 第4轮详细设计审查报告 v4-r2 (修订后复审)

> **审查对象**: `detail_v4.md` (修订后的详细设计)
> **上次审查**: `design_review_v4_r1.md` (REJECTED, 1阻断 B1 + 4建议 S1-S4)
> **本次重点**: 验证 B1 / S1 / S2 修复 + 审查修订是否引入新问题
> **审查日期**: 2026-06-28

---

## 总体裁决: APPROVED

**原因**: 阻断项 B1 已修复，建议项 S1/S2 已采纳。修订未引入新的阻断/高危问题。发现 3 个极低严重度观察项（均非阻断）。

---

## 重点验证 1: B1 — getErrorMessage 是否已增加 response.data.error.message 路径

### 验证方法

对比 v4-r1 阻断描述与 detail_v4.md 3.2 节当前代码。

### 验证结果: PASS (已修复)

**类型定义 (第646-653行)**:

```typescript
const response = (err as {
  response?: {
    data?: {
      error?: { message?: string }    // ← 已新增
      message?: string
    }
  }
}).response
```

**提取逻辑 (第654行)**:

```typescript
if (response?.data?.error?.message) return response.data.error.message  // ← 已新增
if (response?.data?.message) return response.data.message
```

**提取优先级确认**: `error.message` (更深层、更具体) 先于 `message` (浅层、通用)。与现有代码 (LifePlan.vue:134-141, Punch.vue:72-86) 的提取顺序一致。

**边界条件表更新 (第766行)**: 已增加条目 `{ response: { data: { error: { message: '嵌套错误' } } } }` → 返回 `'嵌套错误'`。

**补充决策表 (第1419行)**: B1 标记为"已修复"。

**结论**: 阻断项 B1 完全修复。类型定义、提取逻辑、边界条件、补充决策四个层面均已覆盖。

---

## 重点验证 2: S1 — marked link renderer 是否已补充 rel="noopener noreferrer"

### 验证方法

比对 detail_v4.md 2.3 节 link renderer 代码与 G1 ALLOWED_ATTR 白名单。

### 验证结果: PASS (已采纳)

**G2 link renderer (第450-458行)**:

```typescript
const _linkRenderer = {
  link(href: string | null, title: string | null, text: string): string {
    const h = href ?? ''
    const t = title ? ` title="${title.replace(/"/g, '&quot;')}"` : ''
    const rel = /^https?:\/\//i.test(h) ? ' rel="noopener noreferrer" target="_blank"' : ''
    return `<a href="${h}"${t}${rel}>${text}</a>`
  }
}
marked.use({ renderer: _linkRenderer })
```

**验证要点**:

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| 外部链接 (http/https) 自动注入 `rel="noopener noreferrer"` | PASS | 正则 `/^https?:\/\//i` 精确匹配外部协议 |
| 外部链接同时注入 `target="_blank"` | PASS | 符合 tabnabbing 防护最佳实践 |
| 内部链接不注入 `target="_blank"` | PASS | 相对路径/绝对路径/锚点不触发条件 |
| G1 ALLOWED_ATTR 已追加 `rel` (第158行) | PASS | 渲染器注入的属性可通过白名单 |
| marked.use() 全局生效 | PASS | 所有 `renderMarkdown()` 调用均受益 |
| 下游 sanitizeHtml() 二次校验 | PASS | 2.3 节注释明确标注防护链 |

**补充决策表 (第1420行)**: S1 标记为"已采纳"。

**结论**: S1 完全采纳。link renderer + ALLOWED_ATTR 协同形成完整的 tabnabbing 防护链。

---

## 重点验证 3: S2 — SVG stroke-dasharray 是否已改为绑定 CIRCLE_LENGTH

### 验证方法

比对 detail_v4.md 4.4.2 节模板代码与 4.5 节 computed 定义。

### 验证结果: PASS (已采纳)

**模板代码 (第859行)**:

```html
:stroke-dasharray="CIRCLE_LENGTH"
```

**替换前**: `stroke-dasharray="251.2"` (硬编码)
**替换后**: `:stroke-dasharray="CIRCLE_LENGTH"` (Vue 绑定 computed 常量)

**JS 常量定义 (第890行)**:

```typescript
const CIRCLE_LENGTH = 2 * Math.PI * 40
```

**精度验证**:

| 来源 | 值 | 说明 |
|------|-----|------|
| JS `2 * Math.PI * 40` | ~251.3274 | computed 精确值 |
| 旧硬编码 `251.2` | 251.2 | 偏差 ~0.127 (0.05%) |
| 新绑定 `:stroke-dasharray` | ~251.3274 | 与 JS 完全一致 |

**补充决策表 (第1421行)**: S2 标记为"已采纳"。

**结论**: S2 完全采纳。JS 常量与 SVG 属性使用同一来源，精度一致性问题已消除。

---

## 重点验证 4: 修订是否引入新问题

### 4.1 G2 marked.use() 全局副作用

- **发现**: `marked.use({ renderer: _linkRenderer })` (第458行) 在模块加载时修改全局 marked 实例。
- **影响**: 如果项目中有其他模块绕过 `renderMarkdown()` 直接使用 `marked.parse()`，这些调用也会应用此 renderer。
- **缓解**: 设计约定所有 Markdown 渲染均应通过 `renderMarkdown()` 单一入口 (G2/G1 联合替代了所有裸 marked/DOMPurify 调用点)。
- **严重程度**: 极低 (OBS-1)。非新引入问题——任何全局配置方式均有此外溢风险。后续 marked v13+ 迁移时需注意此耦合。

### 4.2 ALLOWED_URI_REGEXP 分支1缺少 `://` 后缀

- **发现**: 正则 `^(?:(?:https?|mailto):` 只检查协议前缀，不要求后续的 `://` 分隔符。理论上 `https:malicious-string` 可通过此分支。
- **影响**: DOMPurify 内置 URI 校验 (协议白名单、`//` 检测) 提供第二层防护，且 marked 从合法 Markdown 不可能生成此类畸形 URI。
- **缓解**: 如需加固，将分支1改为 `(?:https?|mailto):\/\/`。
- **严重程度**: 极低 (OBS-2)。v4-r1 审查已确认正则安全性——此观察项为防御深度讨论，不影响 APPROVED 裁决。

### 4.3 Link renderer title 属性转义不完整

- **发现**: `title.replace(/"/g, '&quot;')` 仅转义双引号，不转义 `<`、`>`、`&` 等。
- **影响**: marked 处理后的 title 文本通常为纯文本（Markdown 链接语法 `[text](url "title")` 中 title 不含 HTML），且下游 `sanitizeHtml()` 会净化整体输出。
- **缓解**: 下游 DOMPurify 白名单净化提供安全网。
- **严重程度**: 极低 (OBS-3)。防御深度建议，不影响当前设计安全性。

### 4.4 G5 动画逻辑 bug 已修正

- **验证**: task_v4.md 中 `isRefreshing` 在 `onRefresh` 开头立即设为 `true` 且 timer 内再次设置 (冗余 bug，导致快速刷新时闪烁)。detail_v4.md 第1157-1178行将 `isRefreshing = true` 移入 timer 回调内部，仅在 `>= 500ms` 后才启动旋转动画。
- **状态**: 修正正确。时序分析 (第1180-1196行) 覆盖场景A（<500ms，不旋转）和场景B（>=500ms，旋转约1.5s）。

### 4.5 其他跨组一致性检查

| 检查项 | 状态 |
|--------|:----:|
| G1 ALLOWED_ATTR 含 `rel` 与 G2 link renderer 匹配 | PASS |
| G2 `renderMarkdown()` 调用 G1 `sanitizeHtml()` | PASS |
| G3 `getErrorMessage` 类型与边界条件表一致 | PASS |
| G4 `CIRCLE_LENGTH` 在模板和 JS 中使用同一来源 | PASS |
| G5 `refreshAnimTimer` 在 `onUnmounted` 中清理 | PASS |
| 补充决策表 (第1409-1421行) 完整记录 11 项决策 | PASS |
| detail_v4.md 与 task_v4.md 差异均已收敛到 detail_v4 | PASS |

**结论**: 修订未引入阻断或高危新问题。3 个极低严重度观察项均为防御深度建议。

---

## 维度裁决汇总

| 维度 | 内容 | 上次裁决 | 本次裁决 |
|:----:|------|:----:|:----:|
| 1 | G1 DOMPurify 白名单安全完整性 | PASS (1建议 S1) | **PASS** (S1已采纳) |
| 2 | G2 正确引用 G1 sanitizeHtml() | PASS | **PASS** (无变化) |
| 3 | G3 getErrorMessage 调用点兼容性 | FAIL (1阻断 B1) | **PASS** (B1已修复) |
| 4 | G4 SVG 环形图边界条件 | PASS (1建议 S2) | **PASS** (S2已采纳) |
| 5 | 5 组设计可直接编码性 | PASS (G3除外) | **PASS** (全部可通过) |

---

## 审查发现汇总

### 阻断项: 0

上次阻断 B1 已修复。

### 本次新发现 (非阻断)

| 编号 | 类型 | 严重程度 | 描述 |
|:----:|:----:|:----:|------|
| OBS-1 | 观察 | 极低 | `marked.use()` 模块级全局副作用 — 有外溢风险，但当前所有 Markdown 渲染已收敛到 `renderMarkdown()` 单一入口 |
| OBS-2 | 观察 | 极低 | ALLOWED_URI_REGEXP 分支1不要求 `://` 后缀 — DOMPurify 内置校验提供第二层防护 |
| OBS-3 | 观察 | 极低 | Link renderer title 仅转义 `"` — 下游 DOMPurify 净化提供安全网 |

---

## 编码就绪声明

5 组设计 (G1/G2/G3/G4/G5) 均可直接编码。编码时应以 `detail_v4.md` 为准 (优于 `task_v4.md`)，参考以下优先级：

1. **G1** (sanitize.ts): 编码时注意 ALLOWED_URI_REGEXP 采用 1.10 节修正版
2. **G2** (useMarkdown.ts): 编码注意 `marked.use()` 仅在 `renderMarkdown()` 所在模块中调用
3. **G3** (errorMessage.ts): 编码注意提取优先级 `error.message > message > Error.message > string > fallback`
4. **G4** (环形图): 编码注意 `:stroke-dasharray="CIRCLE_LENGTH"` 使用 Vue 绑定语法
5. **G5** (刷新按钮): 编码注意 `isRefreshing = true` 仅在 setTimeout 回调内设置

---

*复审报告结束。总裁决: APPROVED。*
