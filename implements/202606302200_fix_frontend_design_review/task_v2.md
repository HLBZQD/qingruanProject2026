# 任务指令（v2）

## 动作
NEW

## 任务描述

修复剩余 3 项前端设计审查问题（G3/G14/G19），均为模板或样式修改，互不依赖。

### G3. DoctorChatView 消息空态展示欢迎语
- **文件**: `src/views/DoctorChatView.vue`
- **类型**: 模板修改 + 样式追加
- **行为**: 当 `chatStore.conversations` 为空且非 loading/error 状态时，展示欢迎引导内容（医生名 + 欢迎文案 + 示例问题），替代当前空 `<div>` 直接进入输入框的体验
- **参考实现**: `src/views/Admin.vue:177-188`（chat-welcome 引导态）和 `src/components/AiChatDialog.vue:143-160`（welcome-area 欢迎态）

### G14. Risk.vue 风险评分数字 gradient-text 渐变
- **文件**: `src/views/Risk.vue`
- **类型**: 纯 CSS 单属性追加
- **行为**: 在 `.gauge-score` 选择器上叠加 `background: linear-gradient(135deg, var(--color-primary), #0EA5E9); background-clip: text; -webkit-background-clip: text; color: transparent;` 实现蓝→青渐变文字

### G19. 三视图 v-html Markdown 子元素 :deep() 排版穿透
- **文件**: `src/views/DoctorChatView.vue`（`.msg-content` 后追加）、`src/views/Admin.vue`（`.msg-content` 后追加）、`src/components/AiChatDialog.vue`（`.msg-content` 后追加）
- **类型**: 纯 CSS 规则块追加
- **行为**: 为三视图 `.msg-content` 补充 `:deep(p)`、`:deep(ul)`、`:deep(ol)`、`:deep(li)`、`:deep(code)`、`:deep(blockquote)`、`:deep(strong)` 排版规则
- **参考实现**: `src/views/Risk.vue:1488-1513`（`.markdown-body :deep(...)` 规则块）

## 选择理由

R1 已完成 G12/G15/G18 设计系统基线修正（全局动画、CSS 变量名、品牌色），测试全部通过（DesignSystemCss.spec.ts 118 passed）。本轮 G3/G14/G19 为剩余 3 项设计审查问题，G3（空态欢迎语）提升用户体验，G14（gradient-text）对齐原型视觉效果，G19（Markdown 穿透）确保三个聊天视图的 Markdown 排版一致。三者互不依赖，可并行实施。

## 任务上下文

### 需求（摘自 requirement.md）

**G3. DoctorChatView 消息为空时不展示欢迎语**
- 位置：`src/views/DoctorChatView.vue:326-354`
- 设计 4.3 流程图规定"初始化对话视图，展示免责声明栏与欢迎语"。chatStore.conversations 为空时，模板仅渲染空 `<div>` + 输入框
- 修复：在消息列表空态时展示欢迎引导内容（医生名 + 欢迎文案），参考 Admin.vue welcome 模式

**G14. Risk.vue 风险评分数字未复刻原型 gradient-text 渐变文字**
- 位置：`src/views/Risk.vue:1418-1423`（`.gauge-score`）
- 原型评分数字用 `.gradient-text { background: linear-gradient(135deg, #2563EB, #0EA5E9); -webkit-background-clip: text; }` 渲染蓝→青渐变。前端为纯色深灰 `color: var(--color-text-primary)`
- 修复：在 `.gauge-score` 上叠加 `background: linear-gradient(135deg, var(--color-primary), #0EA5E9); background-clip: text; -webkit-background-clip: text; color: transparent;`

**G19. DoctorChatView/Admin/AiChatDialog 三视图 v-html 渲染 Markdown 缺 :deep() 子元素样式穿透**
- 位置：`src/views/DoctorChatView.vue:351`、`src/views/Admin.vue:199`、`src/components/AiChatDialog.vue:172`
- 三聊天视图通过 v-html 渲染 Markdown，scoped CSS 仅定义 `.msg-content` 基础样式，未用 `:deep()` 为 Markdown 子元素提供排版规则
- 修复：为三视图 `.msg-content` 补充 `:deep(p)`、`:deep(ul)`、`:deep(ol)`、`:deep(li)`、`:deep(code)`、`:deep(blockquote)` 等排版规则

### 技术约束
- Vue 3 scoped CSS 中 v-html 渲染的子元素不受 scoped 属性选择器影响，必须用 `:deep()` 穿透
- 所有颜色/间距必须引用 `src/assets/variables.css` 中定义的设计系统 CSS 变量
- 不改动已有 JS/TS 逻辑，不新增接口或类型

## 已有代码上下文

### G3 参考：Admin.vue chat-welcome 模式
```html
<!-- src/views/Admin.vue:175-188 -->
<div v-if="isChatEmpty" class="chat-welcome">
  <div class="welcome-avatar">
    <i class="fas fa-shield-halved" aria-hidden="true"></i>
  </div>
  <h3>智能管理助手</h3>
  <p>您可以输入自然语言指令，例如：</p>
  <div class="example-list">
    <span class="example-chip">查询所有用户</span>
    <span class="example-chip">查看最近的风险评估记录</span>
    <span class="example-chip">统计今日打卡数量</span>
  </div>
</div>
```

### G3 参考：AiChatDialog.vue welcome-area 模式
```html
<!-- src/components/AiChatDialog.vue:143-160 -->
<div v-if="messages.length === 0" class="welcome-area">
  <div class="welcome-avatar">
    <i class="fas fa-robot" aria-hidden="true"></i>
  </div>
  <h3>您好，我是小糖</h3>
  <p>我可以帮您查询健康记录、生成饮食运动方案、分析糖尿病风险等。</p>
  <div class="quick-questions">
    <button v-for="(q, idx) in quickQuestions" :key="idx" class="quick-chip" @click="askQuick(q)">
      {{ q }}
    </button>
  </div>
</div>
```

### G3 当前 DoctorChatView 空态代码
```html
<!-- src/views/DoctorChatView.vue:326-354 — 当前实现 -->
<template v-else>
  <div
    v-for="msg in chatStore.conversations"
    :key="msg.id"
    ...
  >
    ...
  </div>
</template>
<!-- 消息为空时仅渲染空区域，无引导内容 -->
```

### G14 当前 Risk.vue .gauge-score
```css
/* src/views/Risk.vue:1418-1423 */
.gauge-score {
  font-size: 42px;
  font-weight: 800;
  color: var(--color-text-primary);
  line-height: 1;
}
```

### G19 参考：Risk.vue 正确的 :deep() 实现
```css
/* src/views/Risk.vue:1488-1513 */
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  color: var(--color-text-primary);
  margin: var(--spacing-md) 0 var(--spacing-xs);
  font-weight: 600;
}
.markdown-body :deep(p) {
  margin-bottom: var(--spacing-sm);
}
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: var(--spacing-lg);
  margin-bottom: var(--spacing-sm);
}
.markdown-body :deep(li) {
  margin-bottom: var(--spacing-xs);
}
.markdown-body :deep(strong) {
  color: var(--color-text-primary);
}
```

### G19 三视图当前 .msg-content 样式（仅有基础样式，缺 :deep() 排版规则）
- DoctorChatView.vue:507-513 — `.msg-content { padding: 8px 12px; font-size: var(--font-size-body); line-height: 1.5; word-break: break-word; grid-column: 2; }`
- Admin.vue — `.msg-content` 类似基础样式
- AiChatDialog.vue:441-447 — `.msg-content { padding: 10px 14px; font-size: var(--font-size-body); line-height: 1.5; word-break: break-word; border-radius: var(--radius-md); }`
