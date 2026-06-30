# 详细设计（v2）

## 概述

本轮修复 3 项前端设计审查问题（G3/G14/G19），均为模板或样式修改，互不依赖。修改范围：模板修改+样式追加 1 处（DoctorChatView.vue），纯 CSS 单属性追加 1 处（Risk.vue），纯 CSS 规则块追加 3 处（DoctorChatView.vue / Admin.vue / AiChatDialog.vue）。

R1（G12/G15/G18）已完成并通过验证（DesignSystemCss.spec.ts 118 passed），为本轮提供了正确的设计系统 CSS 变量基线和全局动画参数。

## 文件规划

| 文件路径 | 操作 | 职责 |
|---------|------|------|
| `src/views/DoctorChatView.vue` | 修改 | G3：模板添加空态欢迎语 + 样式追加欢迎布局；G19：`.msg-content` 后追加 `:deep()` Markdown 排版规则 |
| `src/views/Risk.vue` | 修改 | G14：`.gauge-score` 追加 gradient-text 渐变属性 |
| `src/views/Admin.vue` | 修改 | G19：`.msg-content` 后追加 `:deep()` Markdown 排版规则 |
| `src/components/AiChatDialog.vue` | 修改 | G19：`.msg-content` 后追加 `:deep()` Markdown 排版规则 |

## 类型定义

无。本轮为模板+CSS 修改，不新增或修改任何 TypeScript 类型或接口。

## 设计规格

### G3：DoctorChatView 消息空态展示欢迎语（`src/views/DoctorChatView.vue`）

**背景**：详细设计 4.3 节规定"初始化对话视图，展示免责声明栏与欢迎语"。当前实现中，`chatStore.conversations` 为空且非 loading/error 状态时，消息区域仅渲染空内容，用户直接面对输入框，缺少引导体验。

**参考模式**：
- `Admin.vue:177-188` — `v-if="isChatEmpty"` 控制的 `chat-welcome` 引导区（头像 + 标题 + 文案 + 示例 chip）
- `AiChatDialog.vue:145-161` — `v-if="messages.length === 0"` 控制的 `welcome-area` 欢迎区（头像 + 标题 + 文案 + 快捷提问按钮）
- 原型 DoctorChat 组件 591 行 — 初始消息预置 `'您好，我是' + doctor.name + '医生，请问有什么可以帮您？'`

**设计决策**：采用 Admin.vue 的 `.chat-welcome` 模式（展示型 chip，非交互按钮），原因：(1) 医师对话场景的示例问题应作为内容引导而非快捷提问入口，避免与输入框功能重叠；(2) 与 Admin.vue 一致的模式降低认知负荷。

#### 模板修改

**定位**：`src/views/DoctorChatView.vue` 第 326-354 行区域（`<!-- 消息列表 -->` 注释及 `<template v-else>` 块）

**当前结构**：
```html
      <!-- 消息列表 -->
      <template v-else>
        <div
          v-for="msg in chatStore.conversations"
          ...
        >
          ...
        </div>
      </template>
```

**修正后结构**（在 `v-else` 模板之前插入 `v-else-if` 分支）：

```html
      <!-- 空态欢迎 -->
      <div
        v-else-if="chatStore.conversations.length === 0 && !chatStore.isStreaming"
        class="chat-welcome"
      >
        <div class="welcome-avatar">
          <i class="fas fa-user-doctor" aria-hidden="true"></i>
        </div>
        <h3>{{ doctor?.name ? '您好，我是' + doctor.name + '医生' : '您好，我是您的AI医生' }}</h3>
        <p>请问有什么可以帮您？您可以描述症状、用药情况或血糖数据。</p>
        <div class="example-list">
          <span class="example-chip">最近血糖控制得怎么样？</span>
          <span class="example-chip">我的用药方案需要调整吗？</span>
          <span class="example-chip">饮食上有什么建议？</span>
        </div>
      </div>

      <!-- 消息列表 -->
      <template v-else>
        <div
          v-for="msg in chatStore.conversations"
          ...
        >
```

**v-if 链完整性**（修改后）：
1. `v-if="loading"` → 加载态（SkeletonLoader）
2. `v-else-if="doctorError"` → 错误态（ErrorRetry）
3. `v-else-if="chatStore.conversations.length === 0 && !chatStore.isStreaming"` → 欢迎态（**新增**）
4. `v-else` → 消息列表

**条件语义**：
- `chatStore.conversations.length === 0`：无历史消息
- `!chatStore.isStreaming`：非 SSE 流式传输中（确保发送首条消息后立即切换为消息列表视图，避免欢迎语与"对方正在输入..."并存）

**doctor 为 null 的兜底**：`doctor?.name` 可选链确保医生信息未加载完毕时（此时 loading 为 false 但 doctor 可能未赋值，属于极边缘情况）显示通用文案。

#### 样式追加

**定位**：`src/views/DoctorChatView.vue` `<style scoped>` 末尾，`</style>` 之前追加。

**新增规则**：

```css
/* ===== 空态欢迎（G3） ===== */
.chat-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--spacing-2xl) 0;
}

.chat-welcome .welcome-avatar {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-primary), #0EA5E9);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  margin-bottom: var(--spacing-md);
}

.chat-welcome h3 {
  font-size: var(--font-size-h3);
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-sm);
}

.chat-welcome > p {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-md);
  max-width: 280px;
  line-height: 1.5;
}

.example-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.example-chip {
  padding: 8px 16px;
  border-radius: var(--radius-full);
  background: var(--color-card);
  border: 1px solid var(--color-divider);
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
}
```

**样式设计意图**：
- `.welcome-avatar` 渐变 `var(--color-primary)` → `#0EA5E9` 与 G14 Risk 评分渐变同源，视觉一致
- `.example-chip` 为非交互展示型 chip（`<span>`），与 Admin.vue 一致
- `.chat-welcome > p` 使用子选择器限制范围，避免影响未来可能在欢迎区内部嵌套的其他 `<p>`
- 所有颜色/间距/字号均引用 `src/assets/variables.css` 设计系统变量

---

### G14：Risk.vue 风险评分数字 gradient-text 渐变（`src/views/Risk.vue`）

**背景**：原型 `.gradient-text` 类定义 `background: linear-gradient(135deg, #2563EB, #0EA5E9); -webkit-background-clip: text;` 实现蓝→青渐变文字。当前 `.gauge-score` 使用纯色 `color: var(--color-text-primary)`（深灰 #333333），未复刻原型视觉效果。

**参考**：原型 `prototype.html:69` 定义 `.gradient-text { background: linear-gradient(135deg, #2563EB, #0EA5E9); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }`；原型 `prototype.html:1202` 在评分数字上使用 `class="gradient-text"`。

#### CSS 属性追加

**定位**：`src/views/Risk.vue` `.gauge-score` 规则块内（当前 1418-1423 行），现有属性之后追加 4 行。

**当前代码**：
```css
.gauge-score {
  font-size: 42px;
  font-weight: 800;
  color: var(--color-text-primary);
  line-height: 1;
}
```

**修正代码**（追加属性，保留现有属性不变）：
```css
.gauge-score {
  font-size: 42px;
  font-weight: 800;
  color: var(--color-text-primary);
  line-height: 1;
  /* G14: gradient text */
  background: linear-gradient(135deg, var(--color-primary), #0EA5E9);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
```

**变更明细**：

| 属性 | 值 | 说明 |
|------|-----|------|
| `background` | `linear-gradient(135deg, var(--color-primary), #0EA5E9)` | 左→右蓝→青渐变，`#0EA5E9` 在设计系统无对应变量，作为特例保留字面值 |
| `-webkit-background-clip: text` | — | WebKit 内核裁剪文字区域 |
| `background-clip: text` | — | 标准属性裁剪文字区域 |
| `color: transparent` | — | 覆盖前面的 `color: var(--color-text-primary)`，使渐变背景透过文字显示 |

**级联说明**：`color: transparent` 通过后置覆盖原 `color: var(--color-text-primary)`（第 4 行 vs 第 3 行），此为预期行为——gradient text 必须将文字颜色设为 `transparent` 才能让背景渐变可见。无需移除原有 `color` 属性以保证降级兼容（不支持 `background-clip: text` 的旧浏览器会忽略新增属性、回退到 `color: var(--color-text-primary)`）。

---

### G19：三视图 v-html Markdown 子元素 :deep() 排版穿透

**背景**：DoctorChatView.vue / Admin.vue / AiChatDialog.vue 三个聊天视图均通过 `v-html="renderContent(msg.content)"` 渲染 Markdown 内容（使用 `marked` 解析为 HTML）。由于 Vue 3 `<style scoped>` 的 scoped 属性选择器（`data-v-xxx`）不会附加到 v-html 动态渲染的 DOM 子元素上，当前 `.msg-content` 仅定义了容器级基础样式（padding、font-size、line-height、word-break），Markdown 生成的 `<p>`、`<ul>`、`<code>` 等子元素缺乏排版规则，表现为段落间无边距、列表无缩进、代码块无背景区分等问题。

**参考**：`src/views/Risk.vue:1488-1513` — 正确的 `.markdown-body :deep(...)` 实现，为 h1-h4、p、ul、ol、li、strong 提供排版规则。

**技术原理**：Vue 3 的 `:deep()` 伪类选择器告诉编译器"将括号内选择器的 scoped 属性移除"，使样式能穿透到 v-html 渲染的子元素。`scoped` 下 `.msg-content :deep(p)` 编译为 `.msg-content[data-v-xxx] p`，而非 `.msg-content p[data-v-xxx]`。

#### 修改 1：DoctorChatView.vue（`.msg-content` 后追加）

**定位**：`src/views/DoctorChatView.vue` 第 513 行（`.msg-content` 规则块闭合 `}` 之后），在 `/* ===== 对方正在输入... ===== */` 注释之前插入。

**当前 `.msg-content` 上下文（507-513 行）**：
```css
.msg-content {
  padding: 8px 12px;
  font-size: var(--font-size-body);
  line-height: 1.5;
  word-break: break-word;
  grid-column: 2;
}
```

**追加规则**（直接插入在 `}` 之后）：

```css
/* G19: Markdown 子元素排版穿透 */
.msg-content :deep(p) {
  margin-bottom: var(--spacing-sm);
}
.msg-content :deep(ul),
.msg-content :deep(ol) {
  padding-left: var(--spacing-lg);
  margin-bottom: var(--spacing-sm);
}
.msg-content :deep(li) {
  margin-bottom: var(--spacing-xs);
}
.msg-content :deep(code) {
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  font-family: var(--font-family);
  font-size: 13px;
}
.msg-content :deep(blockquote) {
  border-left: 3px solid var(--color-primary-light);
  padding-left: var(--spacing-md);
  margin: var(--spacing-sm) 0;
  color: var(--color-text-secondary);
}
.msg-content :deep(strong) {
  color: var(--color-text-primary);
  font-weight: 600;
}
```

#### 修改 2：Admin.vue（`.msg-content` 后追加）

**定位**：`src/views/Admin.vue` 第 467 行（`.msg-content` 规则块闭合 `}` 之后），在 `.message-bubble.sent .msg-content` 规则之前插入。

**当前 `.msg-content` 上下文（461-467 行）**：
```css
.msg-content {
  padding: 10px 14px;
  font-size: var(--font-size-body);
  line-height: 1.5;
  word-break: break-word;
  border-radius: var(--radius-md);
}
```

**追加规则**：与修改 1 完全相同的 6 组 `:deep()` 规则块。

#### 修改 3：AiChatDialog.vue（`.msg-content` 后追加）

**定位**：`src/components/AiChatDialog.vue` 第 447 行（`.msg-content` 规则块闭合 `}` 之后），在 `.message-bubble.sent .msg-content` 规则之前插入。

**当前 `.msg-content` 上下文（441-447 行）**：
```css
.msg-content {
  padding: 10px 14px;
  font-size: var(--font-size-body);
  line-height: 1.5;
  word-break: break-word;
  border-radius: var(--radius-md);
}
```

**追加规则**：与修改 1 完全相同的 6 组 `:deep()` 规则块。

#### :deep() 规则设计说明

| 子元素 | 规则 | 设计意图 |
|--------|------|---------|
| `:deep(p)` | `margin-bottom: var(--spacing-sm)` | 段落间距 8px，保持可读节奏 |
| `:deep(ul)`, `:deep(ol)` | `padding-left: var(--spacing-lg); margin-bottom: var(--spacing-sm)` | 列表缩进 16px，底部留白 |
| `:deep(li)` | `margin-bottom: var(--spacing-xs)` | 列表项间距 4px |
| `:deep(code)` | 灰色背景 + 内边距 + 圆角 + 等宽字体 | 行内代码视觉区分，背景 `#F5F5F5`（`var(--color-bg)`） |
| `:deep(blockquote)` | 左边框 3px + 浅蓝主色 + 缩进 + 灰色文字 | 引用块视觉区分，左边框色 `#E8F1FB`（`var(--color-primary-light)`） |
| `:deep(strong)` | `color: var(--color-text-primary); font-weight: 600` | 加粗文字主色强调 |

**与 Risk.vue `.markdown-body :deep()` 的差异**：
- Risk.vue 额外包含 `h1-h4` 标题规则（`.markdown-body :deep(h1), ...`），本轮三视图不追加——聊天消息场景中 Markdown 标题极少出现（用户/AI 短消息交互），且标题字号在气泡内可能挤压布局。
- Risk.vue 无 `:deep(code)` / `:deep(blockquote)` 规则，本轮按 G19 任务明确要求追加。
- 三视图规则值（spacing/layout）与 Risk.vue 保持同源引用，确保视觉一致性。

**三文件追加内容完全相同**的原因：(1) G19 任务指令要求三视图统一补充；(2) 三个 `.msg-content` 承担相同的语义角色（聊天消息 Markdown 内容容器）；(3) 维护便利性——相同规则块便于后续全局提取。

## 错误处理

无。本轮为纯模板/CSS 修改，不涉及运行时错误路径。

- G3 `v-if`/`v-else-if`/`v-else` 条件链中的 `doctor?.name` 使用可选链，doctor 为 null 时优雅降级为通用文案
- G14 CSS `background-clip: text` 在 <1% 的不兼容浏览器上自动回退为 `color: var(--color-text-primary)`（前面的 color 声明未被删除）
- G19 `:deep()` 在不支持 Vue 3 scoped 穿透的极端环境（非 Vue 编译）下，规则仅对 v-html 子元素无效，不影响 `.msg-content` 基础样式

## 行为契约

| 修改项 | 前置条件 | 后置条件 | 不变式 |
|--------|---------|---------|--------|
| G3 模板 `v-else-if` 分支 | `loading=false` 且 `doctorError=''` | `conversations` 为空时渲染欢迎语，非空时渲染消息列表 | loading/error 态的 `v-if`/`v-else-if` 顺序和内容不变 |
| G3 `!chatStore.isStreaming` 守卫 | `chatStore.isStreaming` 为响应式 boolean | 流式传输开始后欢迎语消失、消息列表出现 | SSE 生命周期不受影响 |
| G3 样式 `.chat-welcome` 规则 | `<style scoped>` 上下文 | 欢迎区居中布局、头像 64px 圆渐变、chip 列表竖排 | 已有消息气泡样式不变 |
| G14 `.gauge-score` 追加 4 行 | `.gauge-score` 选择器存在 | 风险评分数字渲染为蓝→青渐变文字 | `font-size: 42px; font-weight: 800; line-height: 1` 不变 |
| G19 `.msg-content :deep(p)` 等 | `.msg-content` 规则块存在 | v-html 渲染的子元素获得排版间距 | `.msg-content` 基础样式（padding/font-size/line-height/word-break）不变 |

## 依赖关系

### 依赖的已有资源

| 资源 | 路径 | 用途 |
|------|------|------|
| 设计系统 CSS 变量 | `src/assets/variables.css` | G3/G14/G19 全部颜色/间距/字号变量来源 |
| DoctorChatView.vue | `src/views/DoctorChatView.vue` | G3 + G19 修改目标 |
| Risk.vue | `src/views/Risk.vue` | G14 修改目标 |
| Admin.vue | `src/views/Admin.vue` | G19 修改目标（:deep() 规则追加） |
| AiChatDialog.vue | `src/components/AiChatDialog.vue` | G19 修改目标（:deep() 规则追加） |

### 任务间依赖

- G3、G14、G19 互不依赖，涉及不同文件的非重叠代码区域，可并行实施
- G3 和 G19 共同修改 DoctorChatView.vue，但分别操作模板区和样式区的不同位置，无冲突
- 依赖 R1（G12/G15/G18）已完成的 CSS 变量基线：G14 `var(--color-primary)` 和 G3 `linear-gradient(135deg, var(--color-primary), #0EA5E9)` 依赖 R1-G18 正确映射的品牌色变量

### 暴露给后续任务的接口

- G3 引入 `.chat-welcome` 类和 `chatStore.conversations.length === 0` + `!chatStore.isStreaming` 空态条件模式，为后续其他视图（如 HealthAdvice、LifePlan）统一空态设计提供参考
- G19 为三个聊天视图建立统一的 Markdown 排版规则基线，后续新增的 `marked` 解析参数（如 table、image 支持）可在此基础上扩展 `:deep()` 规则
- G14 在 `.gauge-score` 建立的 gradient-text 样式模式（`linear-gradient` + `background-clip: text` + `color: transparent`）可作为其他数据数字（如打卡进度、血糖值）渐变化的参考

## 修订说明（v2 R2）

| 审查意见 | 修改措施 |
|---------|---------|
| G3: DoctorChatView 空态无欢迎语，不符合设计 4.3 流程规范 | 模板插入 `v-else-if="chatStore.conversations.length === 0 && !chatStore.isStreaming"` 分支，渲染医生头像+名称+欢迎文案+3 个示例 chip；样式追加 `.chat-welcome` 全套规则（参考 Admin.vue 模式） |
| G14: Risk.vue `.gauge-score` 缺原型 gradient-text 渐变 | `.gauge-score` 追加 `background: linear-gradient(...); background-clip: text; -webkit-background-clip: text; color: transparent` 4 行 |
| G19: 三视图 `.msg-content` 缺 v-html Markdown 子元素 :deep() 排版规则 | 为 DoctorChatView/Admin/AiChatDialog 的 `.msg-content` 后各追加 6 组 `:deep(p|ul|ol|li|code|blockquote|strong)` 规则（参考 Risk.vue `.markdown-body :deep()` 模式，略去 h1-h4，新增 code/blockquote） |
