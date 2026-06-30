# 详细设计（v6）

## 概述

修复P2批次5的8个组件与DOM合规问题，拆分为两个子任务。所有修改为现有文件的小范围精确编辑，不新建文件，不改变现有模块边界。目标状态：每个问题对应的文件修改精确到行，编码agent无需做任何类型决策或架构判断。

## 文件规划

| 文件路径 | 操作 | 职责 |
|---------|------|------|
| src/components/AiChatDialog.vue | 修改 | S12: 添加 onUnmounted 生命周期钩子 |
| src/stores/chatStore.ts | 修改 | S15: 新增 clearMessages() action + 导出 |
| src/views/DoctorChatView.vue | 修改 | S15: clearChat/selectHistorySession/watch 三处改用 clearMessages()；S3: 导入 DisclaimerBar + 替换内联免责标记 |
| src/composables/useAuth.ts | 修改 | S13: JwtPayload.user_id 字段名改为 id |
| server/services/sseProxy.js | 修改 | S14: Mock 模式生成唯一 conversation_id / message_id |
| src/views/NewsView.vue | 修改 | S16: 导入 sanitizeHtml，highlightKeyword 增加文本净化 |
| src/views/Home.vue | 修改 | S17: showDiabetesType 包裹 try-catch |
| src/views/LifePlan.vue | 修改 | S3: 导入 DisclaimerBar + 替换内联 lp-disclaimer |
| src/views/Risk.vue | 修改 | S3: 导入 DisclaimerBar + 替换内联 disclaimer-text；S4: 添加 9 个 DOM id/data-* |
| src/views/Punch.vue | 修改 | S3: 导入 DisclaimerBar + 替换内联 punch-disclaimer；S4: 添加 8 个 DOM id |
| src/views/Admin.vue | 修改 | S3: 导入 DisclaimerBar + 替换内联 disclaimer-bar |
| src/views/ArticleDetailView.vue | 修改 | S3: 导入 DisclaimerBar + 正文后添加免责声明 |

## 类型定义

本批次无新增类型。所有修改沿用现有类型体系。

### 已有类型引用（S15 依赖）

**ChatMessage[]**（`src/types/sse.ts`）
- 形态：interface
- 职责：单条对话消息
- chatStore.conversations 的类型参数，clearMessages() 将其重置为空数组

**JwtPayload**（`src/composables/useAuth.ts:10-27`）
- 形态：interface
- 职责：JWT payload 结构声明
- 变更：第16行 `user_id?: number` 改为 `id?: number`（对齐后端 JWT 实际字段名）

**DisclaimerBar Props**（`src/components/DisclaimerBar.vue`）
- 形态：组件 props
- 接口：
  - `text?: string` — 免责文本，默认值为通用医学免责文案
  - `fixed?: boolean` — 是否固定定位，默认 false
- S3 所有调用均使用默认 `fixed=false`，仅 `text` 按页面需求覆盖

## 修改规格

### S12. AiChatDialog.vue — 添加 onUnmounted 生命周期钩子

**目标文件**: `src/components/AiChatDialog.vue`

**修改点 1 — 导入补充（第2行）**

当前：
```
import { ref, computed, nextTick, onMounted, watch } from 'vue'
```
修改为：
```
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
```
变更类型：在解构导入列表中添加 `onUnmounted`，插入位置在 `onMounted` 之后、`watch` 之前（保持字母序）。

**修改点 2 — 新增 onUnmounted 块（第95行之后）**

在第95行 `onMounted` 块的闭合 `});` 之后、第96行 `</script>` 之前插入：
```
onUnmounted(() => {
  chatStore.abortActiveConnection()
})
```
变更类型：新增3行。`abortActiveConnection()` 已存在于 chatStore（第708行导出），无新增依赖。

**行为契约**：
- 前置条件：组件已挂载，chatStore 实例可用
- 后置条件：组件卸载时，活跃 SSE 连接被中止，AbortController 引用被清除
- 并行语义：与 watch(isOpen) 中第45行的 close 分支 `chatStore.abortActiveConnection()` 互补——watch 覆盖对话框关闭场景，onUnmounted 覆盖 Tab 导航/浏览器后退等硬卸载场景

---

### S15. chatStore — 新增 clearMessages() action + 4 处调用点替换

**目标文件 A**: `src/stores/chatStore.ts`

**修改点 1 — 函数定义（第624行之后，`clearAllConversations()` 函数体闭合 `}` 之后，`// ===== [G4] UI 辅助 =====` 注释之前）**

在 action 函数定义区（第605-624行 `clearAllConversations` 函数定义区域内可区分的位置），于第624行 `}` （`clearAllConversations` 闭合花括号）之后插入：

```
/** 清空当前消息列表（供外部组件调用，进入 Pinia action 追踪） */
function clearMessages(): void {
  conversations.value = []
}
```

变更类型：新增4行函数定义。`conversations` 为 store 内第19行定义的 `ref<ChatMessage[]>`，函数体内直接对其赋值。

**修改点 2 — 导出项（第741行 `navigate` 导出项之后）**

在 `return { ... }` 块内（第703-752行），于 `navigate,` 导出项（第741行）之后添加：

```
    clearMessages,
```

变更类型：新增1行导出项。插入位置与其余 action 导出项相邻。

**目标文件 B**: `src/components/AiChatDialog.vue`

**修改点 3 — 清空按钮（第121行）**

当前：
```
@click="chatStore.clearAssistantConversation(); chatStore.conversations.length = 0"
```
修改为：
```
@click="chatStore.clearAssistantConversation(); chatStore.clearMessages()"
```
变更类型：替换 `chatStore.conversations.length = 0` 为 `chatStore.clearMessages()`。`clearAssistantConversation()` 调用保留不变（负责清理 assistantConversationId）。

**目标文件 C**: `src/views/DoctorChatView.vue`

**修改点 4 — clearChat()（第101行）**

当前：
```
chatStore.conversations.length = 0
```
修改为：
```
chatStore.clearMessages()
```
变更类型：单行替换。

**修改点 5 — selectHistorySession()（第166行）**

当前：
```
chatStore.conversations.length = 0
```
修改为：
```
chatStore.clearMessages()
```
变更类型：单行替换。

**修改点 6 — watch route.params.id（第196行）**

当前：
```
chatStore.conversations.length = 0
```
修改为：
```
chatStore.clearMessages()
```
变更类型：单行替换。

**行为契约**：
- `clearMessages()` 仅清空消息列表（`conversations.value = []`），不触及 conversation_id Map、localStorage 持久化键、SSE 连接状态
- 与 `clearAllConversations()` 的区别：后者是完整清理（中止SSE + 清空Map + 清空localStorage + 清空消息 + 清空assistant/admin ID），`clearMessages()` 是轻量级仅清空消息列表
- 调用 `clearMessages()` 不改变 conversation_id 上下文——用户切换历史会话（S15 修改点5/6）或清空对话（修改点3/4）后，继续发送消息仍使用同一个 conversation_id 实现连续对话

---

### S13. useAuth.ts — JwtPayload 字段名对齐

**目标文件**: `src/composables/useAuth.ts`

**修改点 — 第16行**

当前：
```
  user_id?: number;
```
修改为：
```
  id?: number;
```
变更类型：单行字段名替换。注释行 `/** 用户 ID */`（第15行）保持不变。

**影响范围**：
- `parseToken()`（第38-62行）：返回类型为 `JwtPayload`，修改后 TypeScript 类型推导自动适配，`payload.id` 获得正确的 `number | undefined` 类型
- 所有调用 `parseToken()` 并通过 `payload.user_id` 访问的代码需同步检查——当前代码库中无直接访问 `payload.user_id` 的调用点（parseToken 结果主要用于 `isTokenExpired`/`getTokenRemainingTime`，两者仅访问 `exp` 字段）

---

### S14. sseProxy.js — Mock 模式动态唯一 ID

**目标文件**: `server/services/sseProxy.js`

**修改点 1 — 第13行（mockMessage 变量声明）**

当前：
```
const mockMessage = JSON.stringify({ event: 'message', answer: '您好，我是AI助手（Mock模式）。Dify服务未配置。', conversation_id: 'mock-001' });
```
修改为：
```
const mockConvId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const mockMessage = JSON.stringify({ event: 'message', answer: '您好，我是AI助手（Mock模式）。Dify服务未配置。', conversation_id: mockConvId });
```
变更类型：拆分为两行——首行声明 `mockConvId` 动态变量，次行 JSON.stringify 中引用该变量。

**修改点 2 — 第14行（mockEnd 变量声明）**

当前：
```
const mockEnd = JSON.stringify({ event: 'message_end', conversation_id: 'mock-001', message_id: 'mock-msg-001' });
```
修改为：
```
const mockEnd = JSON.stringify({ event: 'message_end', conversation_id: mockConvId, message_id: `mock-msg-${Date.now()}` });
```
变更类型：单行替换，`conversation_id` 改为引用 `mockConvId` 变量，`message_id` 改为模板字符串动态生成。

**行为契约**：
- 每次 Mock 请求生成独立唯一的 `conversation_id`（格式：`mock-{timestamp}-{6位随机字母数字}`）
- `message` 事件和 `message_end` 事件的 `conversation_id` 保持一致（共享 `mockConvId`）
- `message_id` 由时间戳派生（格式：`mock-msg-{timestamp}`）
- 不影响真实 Dify 代理路径（`if (!baseUrl)` 分支之后的所有逻辑不变）

---

### S16. NewsView.vue — 搜索高亮 XSS 边缘风险加固

**目标文件**: `src/views/NewsView.vue`

**修改点 1 — 导入补充（第11行 DisclaimerBar 导入之后）**

在第11行 `import DisclaimerBar from '@/components/DisclaimerBar.vue'` 之后添加：
```
import { sanitizeHtml } from '@/utils/sanitize'
```
变更类型：新增1行导入。`sanitizeHtml` 为 `src/utils/sanitize.ts` 的命名导出。

**修改点 2 — highlightKeyword 函数体（第218-222行）**

当前：
```
function highlightKeyword(text: string, kw: string): string {
  if (!text || !kw) return text
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="search-highlight">$1</mark>')
}
```
修改为：
```
function highlightKeyword(text: string, kw: string): string {
  if (!text || !kw) return text
  const safeText = sanitizeHtml(text)
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return safeText.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="search-highlight">$1</mark>')
}
```
变更类型：在正则转义之前新增一行 `const safeText = sanitizeHtml(text)`，将后续 `text` 引用替换为 `safeText`（第221行 `text.replace(...)` 改为 `safeText.replace(...)`）。

**行为契约**：
- `sanitizeHtml()` 通过 DOMPurify 白名单（ALLOWED_TAGS/ALLOWED_ATTR/ALLOWED_URI_REGEXP）净化原始 title 文本，移除任何潜在的 HTML 标签/事件处理器/危险协议
- 净化后的安全文本再执行关键词 `<mark>` 包裹——`<mark>` 标签在 DOMPurify 白名单内（whiteList 默认包含），不会被净化掉
- 第394行 `v-html="highlightKeyword(item.title, searchedKeyword)"` 的输出现经过双重防护：sanitizeHtml（移除恶意标签） + 正则转义（防止关键词含正则特殊字符）
- 调用点（第394行）语法不变，仅函数内部逻辑增强

---

### S17. Home.vue — showDiabetesType 未捕获 Promise rejection

**目标文件**: `src/views/Home.vue`

**修改点 — 第107-111行（showDiabetesType 函数体）**

当前：
```
async function showDiabetesType(t: DiabetesType): Promise<void> {
  const detail = await homeStore.fetchDiabetesTypeDetail(t.id)
  const data: DiabetesTypeDetail = detail ?? t
  openTypeSwal(data)
}
```
修改为：
```
async function showDiabetesType(t: DiabetesType): Promise<void> {
  try {
    const detail = await homeStore.fetchDiabetesTypeDetail(t.id)
    const data: DiabetesTypeDetail = detail ?? t
    openTypeSwal(data)
  } catch {
    // 接口失败回退到列表项数据（t 本身已含 pathogenesis/manifestation/treatment）
    openTypeSwal(t)
  }
}
```
变更类型：原3行函数体包裹 try-catch，catch 分支回退到列表项数据 `t`（`DiabetesType` 与 `DiabetesTypeDetail` 共享 `pathogenesis`/`manifestation`/`treatment` 三个展示字段）。无新增导入。

**行为契约**：
- 正常路径：`fetchDiabetesTypeDetail` 成功 → 返回详情数据（或 null）→ `data = detail ?? t` → 调用 `openTypeSwal(data)`
- 异常路径：网络错误/接口返回非 2xx/JSON 解析失败 → catch 分支忽略错误 → 使用列表项数据 `t` 作为回退 → 调用 `openTypeSwal(t)`
- `openTypeSwal()` 内部已做好 `escapeHtml` + `sanitizeHtml` 双防护，回退路径不受 XSS 影响
- catch 分支不显示 toast/错误提示——列表项数据已含足够信息，不中断用户体验

---

### S3. DisclaimerBar 组件统一 — 6个页面批量化修改

**组件接口**（`src/components/DisclaimerBar.vue`）：
- Props：
  - `text?: string` — 默认值：「本平台的 AI 健康建议、风险预测、方案生成等内容仅供健康参考，不能替代专业医疗诊断、治疗或建议。如有健康问题，请及时就医咨询专业医师。」
  - `fixed?: boolean` — 默认值：`false`
- 模板结构：`<div class="disclaimer-bar" :class="{ fixed }" role="note"><i> + <p>{{ text }}</p></div>`
- 样式：flex 行布局、琥珀色背景、固定/流式定位两种模式

**文件 1 — DoctorChatView.vue**

修改点 A（导入区，第3-13行）：在现有导入（第3-13行）之后添加：
```
import DisclaimerBar from '@/components/DisclaimerBar.vue'
```
注：需放在 `import type { ConversationHistoryItem } from '@/types/sse'` 之后、`const route = useRoute()` 之前。现有导入区最后一行是第13行 `import type { ConversationHistoryItem } from '@/types/sse'`。

修改点 B（模板，第305-307行）：
当前：
```
    <div class="disclaimer-bar">
      <p>本对话由AI虚拟医师提供，回复内容仅供参考</p>
    </div>
```
替换为：
```
    <DisclaimerBar text="本对话由AI虚拟医师提供，回复内容仅供参考，不能替代专业医疗诊断。" />
```
保留原自定义文案并补齐「不能替代专业医疗诊断」后缀。

修改点 C（样式，第445-457行）：删除 `.disclaimer-bar` 及其子选择器 `.disclaimer-bar p` 的 scoped 样式块（13行）。

**文件 2 — LifePlan.vue**

修改点 A（导入区，第1-19行）：在现有导入末尾（第19行 `const route = useRoute()` 之前）添加：
```
import DisclaimerBar from '@/components/DisclaimerBar.vue'
```

修改点 B（模板，第581-583行）：
当前：
```
      <div class="lp-disclaimer">
        AI 生成内容仅供参考，不能替代专业医疗诊断，如有不适请及时就医
      </div>
```
替换为：
```
      <DisclaimerBar />
```
使用默认文本（含义相近），不使用 `fixed` prop。当前内联实现为普通流式布局元素（随内容滚动），保持一致。其余5个页面均保持默认非固定定位。

修改点 C（样式，第1022-1031行）：删除 `.lp-disclaimer` scoped 样式块（10行）。

**文件 3 — Risk.vue**

修改点 A（导入区，第1-8行）：在现有导入末尾（`import type { RiskPredictRequest, RiskPredictResponse, RiskHistoryItem } from '@/types/api'` 之后）添加：
```
import DisclaimerBar from '@/components/DisclaimerBar.vue'
```

修改点 B（模板，第690-692行）：
当前：
```
          <p class="disclaimer-text">
            本评估基于《中国2型糖尿病防治指南（2020版）》评分体系，仅供参考，不能替代专业医疗诊断。如有疑虑请及时就医。
          </p>
```
替换为：
```
          <DisclaimerBar />
```
使用默认文本（含义相近）。

修改点 C（样式，第1516-1523行）：删除 `.disclaimer-text` scoped 样式块（8行）。

**文件 4 — Punch.vue**

修改点 A（导入区，第1-8行）：在现有导入末尾（`import type { PunchType } from '@/types/api'` 之后）添加：
```
import DisclaimerBar from '@/components/DisclaimerBar.vue'
```

修改点 B（模板，第395-397行）：
当前：
```
        <div class="punch-disclaimer">
          AI 分析内容仅供参考，不能替代专业医疗诊断，如有不适请及时就医
        </div>
```
替换为：
```
        <DisclaimerBar text="AI 分析内容仅供参考，不能替代专业医疗诊断，如有不适请及时就医。" />
```
保留原文案，末尾加句号。

修改点 C（样式，第796-805行）：删除 `.punch-disclaimer` scoped 样式块（10行）。

**文件 5 — Admin.vue**

修改点 A（导入区，第1-13行）：在现有导入末尾（`import EmptyState from '@/components/EmptyState.vue'` 之后）添加：
```
import DisclaimerBar from '@/components/DisclaimerBar.vue'
```

修改点 B（模板，第172-174行）：
当前：
```
      <div class="disclaimer-bar">
        <p>本管理助手由 AI 驱动，所有数据操作将被记录审计日志。</p>
      </div>
```
替换为：
```
      <DisclaimerBar text="本管理助手由 AI 驱动，所有数据操作将被记录审计日志。" />
```
保留原文案。

修改点 C（样式，第364-376行）：删除 `.disclaimer-bar` 及 `.disclaimer-bar p` scoped 样式块（13行）。

**文件 6 — ArticleDetailView.vue**

修改点 A（导入区，第1-9行）：在现有导入末尾（`import type { ArticleDetail } from '@/types/api'` 之后）添加：
```
import DisclaimerBar from '@/components/DisclaimerBar.vue'
```

修改点 B（模板，第235行 `</section>` 闭合之后、第236行 `</template>` 之前）：
在第235行 `</section>` 之后、第236行 `</template>` 之前添加：
```
      <DisclaimerBar />
```
使用默认文本（通用医学免责文案）。此页面当前完全缺失免责声明，为净新增。插入位置在正文渲染区之后、模板容器闭合之前，语义上作为文章内容的尾部附属信息。

---

### S4. DOM id/data-* 属性补充 — Risk.vue（13个属性） + Punch.vue（8个）

#### Risk.vue — 10 个目标元素（13 个 id/data-* 属性）

所有修改为在现有 HTML 元素上追加属性，不改变元素类型、不修改 class、不调整 DOM 结构（risk-level-text 除外——需新增 `<span>` 包裹文本插值）。

| # | 目标元素位置 | 添加属性 | 修改方式 |
|---|------------|---------|---------|
| 1 | 第388行 `<section v-show="currentStep === 1" class="step-panel">` | `id="step-1"` `data-step="1"` | 在现有属性后追加。设计文档 §4.1.7（L3239）指定此 id，与 `data-step` 共存 |
| 2 | 第451行 `<section v-show="currentStep === 2" class="step-panel">` | `id="step-2"` `data-step="2"` | 同上。设计文档 §4.1.7（L3263）指定此 id |
| 3 | 第624行 `<section v-show="currentStep === 3" class="step-panel result-panel">` | `id="step-3"` `data-step="3"` | 同上。设计文档 §4.1.7（L3300）指定此 id |
| 4 | 第437行 `<div v-if="fieldError" class="field-error" role="alert">` | `id="field-error-container-step1"` | 在现有属性后追加。该 div 位于步骤1（第388-448行 `v-show="currentStep===1"` 区域内），`v-if` 控制其存在于 DOM。因步骤用 `v-show` 切换（非 `v-if`），步骤2的同名 div（第602行）同时存在于 DOM，故步骤1使用带后缀的 id 避免 HTML id 唯一性违规 |
| 5 | 第602行 `<div v-if="fieldError" class="field-error" role="alert">` | `id="field-error-container"` | 在现有属性后追加。设计文档 §4.1.7（L3295）定义此 id 在步骤2。该 div 位于步骤2（第451-621行 `v-show="currentStep===2"` 区域内） |
| 6 | 第665行 `<span class="gauge-score">` | `id="risk-score"` | 在现有属性后追加 |
| 7 | 第670行 `<div class="risk-level-badge">` | `id="risk-level-badge"` | 在现有属性后追加 |
| 8 | 第672行 `{{ result.risk_level_label \|\| riskMeta.label }}` | `id="risk-level-text"` | 此为纯文本插值表达式，非独立 HTML 元素。需用 `<span id="risk-level-text">` 包裹：将第672行 `{{ result.risk_level_label \|\| riskMeta.label }}` 改为 `<span id="risk-level-text">{{ result.risk_level_label \|\| riskMeta.label }}</span>`。父元素 `<div class="risk-level-badge">` 已承载 `id="risk-level-badge"`，不可同时承载两个 id |
| 9 | 第687行 `<div class="markdown-body" v-html="safeAdviceHtml(result.advice)">` | `id="risk-detail-text"` | 在现有属性后追加。**与设计文档 §4.1.7（L3307）的 `<p id="risk-detail-text">` 偏差**：实际实现使用 markdown 渲染（v-html），无法使用 `<p>` 静态文本容器。在此 `<div>` 上添加此 id 作为语义等价替代 |
| 10 | 第682行 `<div class="advice-card">` | `id="suggestions-list"` | 在现有属性后追加。**与设计文档 §4.1.7（L3310）的 `<ul id="suggestions-list">` 偏差**：因 markdown 动态渲染（v-html），建议内容无法预先在 `<ul>` 子元素上预置 id。该 `<div>` 语义上包裹了建议标题和渲染内容，是距离动态渲染建议区最近的静态 DOM 容器 |

注：上表共10行（10个目标元素），合计13个 id/data-* 属性（3个 `data-step` + 10个 `id`）。其中第1-3行追加 `id` 和 `data-step` 双属性，第4/5行为成对的 `fieldError` 提示容器（步骤1/2 区分），第8行为新增 `<span>` 包裹文本插值，其余4行为在现有元素上追加单个属性。第9行（risk-detail-text）和第10行（suggestions-list）与设计文档的元素类型有偏差，原因已在说明栏标注。

#### Punch.vue — 8 个 id

所有修改为在现有 HTML 元素上追加 `id="..."` 属性，不改变元素类型、不修改 class、不调整 DOM 结构。

| # | 目标元素位置 | 添加属性 | 说明 |
|---|------------|---------|------|
| 1 | 第255行 `<section class="punch-analysis-section">` | `id="analysis-section"` | 该 `<section>` 包裹了加载中/失败/成功三态（第257-398行），是真实 DOM 节点。设计文档 §4.1.8 定义的 `<section id="analysis-section">` 的精确匹配。拒绝 `<template v-else-if="store.analysis">`（第275行）——`<template>` 是 Vue 虚拟容器不渲染为 DOM 节点 |
| 2 | 第280行 `<span class="punch-stat-value gradient-text">`（饮食完成率） | `id="diet-rate"` | 三个统计卡中的第一个。通过内容上下文（饮食完成率 `ratePercent(store.analysis.diet_completion_rate)`）与其余两个区分 |
| 3 | 第286行 `<span class="punch-stat-value gradient-text">`（运动完成率） | `id="exercise-rate"` | 通过内容上下文（运动完成率 `ratePercent(store.analysis.exercise_completion_rate)`）区分 |
| 4 | 第292行 `<span class="punch-stat-value">`（总打卡次数） | `id="total-punches"` | 统计卡中总次数元素，无 `gradient-text` class |
| 5 | 第340行 `<div class="punch-trend-chart">` | `id="trend-chart"` | 7天趋势柱状图容器 |
| 6 | 第505行 `<div class="punch-record-list">` | `id="punch-list"` | 打卡记录卡片 `v-for="record in store.records"` 的直接父容器，是「记录列表」的精确语义锚点。拒绝 `<section class="punch-list-section">`（第450行，包含标题+列表+分页，范围过宽）和 `<template v-else>`（第498行，Vue 虚拟容器不渲染为 DOM 节点） |
| 7 | 第479行 `<div v-else-if="store.records.length === 0" class="punch-empty">` | `id="empty-container"` | 无记录时的空态引导区域 |
| 8 | 第570行 `<button v-else-if="store.hasMore" class="punch-loadmore-btn press">` | `id="btn-load-more"` | 列表底部加载更多按钮 |

---

## 错误处理

本批次所有修改不引入新的错误处理路径。各修复的错误语义如下：

| 修复 | 错误场景 | 处理方式 |
|------|---------|---------|
| S12 | 组件卸载时 SSE 连接未中止 | onUnmounted 确保中止（与 DoctorChatView/Admin 行为一致） |
| S15 | 直接赋值绕过 Pinia action 追踪 | clearMessages() 封装为 store action |
| S13 | TypeScript 类型提示不准确（user_id 始终 undefined） | 字段名改为 id，类型提示正确 |
| S14 | Mock 模式共享同一 conversation_id | 每次请求动态生成唯一 ID |
| S16 | 后端存储含 HTML/脚本的标题通过 v-html 渲染 | highlightKeyword 内 sanitizeHtml 净化原始文本 |
| S17 | fetchDiabetesTypeDetail 网络异常 → Unhandled Promise Rejection | try-catch 回退到列表项数据（用户无感知） |
| S3 | 6页面内联硬编码免责标记 vs 统一组件 | 替换为 DisclaimerBar 组件，消除样式/文案碎片化 |
| S4 | 自动化测试缺少 DOM 锚点 | 追加 9+8=17 个 id/data-* 属性 |

---

## 行为契约

### S12 与现有 abort 调用的关系

AiChatDialog.vue 中 `abortActiveConnection()` 的调用点分布：
1. `watch(isOpen)` — isOpen 变为 false 时（关闭对话框）→ 中止
2. `closeDialog()` — 点击关闭按钮/遮罩 → 中止 + toggleFab
3. **新增** `onUnmounted()` — 组件卸载（Tab 导航/浏览器后退）→ 中止

三个调用点互补覆盖所有退出路径，无重复中止问题（`abortActiveConnection` 内部检查 `activeAbortController.value` 是否存在后再 abort，重复调用安全）。

### S15 clearMessages() 与 clearAllConversations() 的分工

- `clearMessages()`：轻量级，仅清空 `conversations.value = []`。适用于切换历史会话上下文、清空当前对话显示
- `clearAllConversations()`：完整清理，中止 SSE + 清空 Map + 清空 localStorage + 清空消息 + 清空 assistant/admin ID。适用于登出/clearAuth

两个 action 独立，调用方按语义选择。切换历史会话时不应中止 SSE 或清除 localStorage 持久化——仅需清空消息列表以便展示新会话内容。

### S4 id 唯一性保证

Risk.vue 步骤1 和步骤2 的 `fieldError` 提示元素因 `v-show` 切换同时存在于 DOM。使用 `id="field-error-container-step1"`（步骤1）和 `id="field-error-container"`（步骤2，匹配设计文档）确保 HTML id 全局唯一。两个 `v-if` 的 fieldError div 的显示/隐藏由各自的 `v-if="fieldError"` 表达式控制（两个步骤使用同一个 `fieldError` ref），与 `v-show` 切换步骤面板协同工作。

三个步骤面板的 `id="step-1"`/`id="step-2"`/`id="step-3"` 按设计文档 §4.1.7（L3239/L3263/L3300）规定添加，与 `data-step="1/2/3"` 共存。`id` 作为 DOM 唯一标识符供自动化测试/E2E 脚本的选择器定位（如 `#step-1`），`data-step` 作为步骤编号语义标注，两者角色不同、不可互相替代。

---

## 依赖关系

### 已有依赖（本批次不修改）

- `src/stores/chatStore.ts` — S12 依赖 `abortActiveConnection()`（已存在），S15 新增 `clearMessages()` 内部依赖 `conversations` ref（已存在）
- `src/composables/useAuth.ts` — S13 修改 `JwtPayload` 接口字段名，不影响 `parseToken()`/`isTokenExpired()`/`getTokenRemainingTime()` 的函数签名
- `src/utils/sanitize.ts` — S16 导入 `sanitizeHtml`（已存在，第50-106行）
- `src/components/DisclaimerBar.vue` — S3 所有6个页面导入此组件（已存在，52行）

### 暴露给后续任务的接口

- `chatStore.clearMessages()` — S15 新增的公开 action，供后续任何需要清空消息列表的组件调用
- `JwtPayload.id` — S13 修改后的字段名，供类型使用者通过 `payload.id` 访问用户ID

### 文件间依赖关系

```
S12 (AiChatDialog.vue) ──依赖──> chatStore.abortActiveConnection() (已有)
S15 (chatStore.ts)     ──提供──> chatStore.clearMessages() (新增)
S15 (AiChatDialog.vue) ──调用──> chatStore.clearMessages()
S15 (DoctorChatView.vue) ──调用──> chatStore.clearMessages()
S13 (useAuth.ts)       独立修改，无跨文件依赖
S14 (sseProxy.js)      独立修改，无跨文件依赖
S16 (NewsView.vue)     ──依赖──> sanitizeHtml from @/utils/sanitize (已有)
S17 (Home.vue)         独立修改，无跨文件依赖
S3  (6个views)         ──依赖──> DisclaimerBar from @/components/DisclaimerBar.vue (已有)
S4  (Risk.vue)         独立修改，无跨文件依赖
S4  (Punch.vue)        独立修改，无跨文件依赖
```

子任务内部无先后依赖。S15 涉及 chatStore.ts 和两个 .vue 文件，但三个文件的修改顺序不影响功能正确性（`clearMessages()` 函数定义和调用点可任意顺序应用，TypeScript 编译期统一检查）。

## 修订说明（v6 r3）
| 审查意见 | 修改措施 |
|---------|---------|
| **[一般] S4 Risk.vue 缺少设计文档 §4.1.7 指定的 id="step-1/2/3"**：v6 设计将三个步骤内容容器的 id 替换为 data-step，未提供对应的 id 属性。设计文档 §4.1.7（L3239/L3263/L3300）明确指定 `id="step-1"`、`id="step-2"`、`id="step-3"`，此为步骤内容容器的核心标识符。下游测试或脚本使用 `#step-1`/`#step-2`/`#step-3` 选择器将无法定位元素 | 在三个 `<section class="step-panel">` 元素上同时追加 `id="step-1"`/`id="step-2"`/`id="step-3"` 和 `data-step="1/2/3"` 双属性。`id` 作为 DOM 唯一标识符供自动化测试选择器定位，`data-step` 作为步骤编号语义标注，两者角色不同、不可互相替代。同步更新了行为契约章节的 id 唯一性保证说明 |
| **[轻微] S4 Risk.vue 修改条目计数不一致**：标题写"9 个 id/data-* 属性"，但表格包含 10 行条目 | 标题改为"10 个目标元素（13 个 id/data-* 属性）"，并更新表尾注释逐项说明：3 个 `data-step` + 10 个 `id`，合计 13 个属性 |
| **[轻微] S4 Risk.vue suggestions-list 与设计文档元素类型不符**：设计文档 §4.1.7（L3310）指定 `<ul id="suggestions-list">`，v6 设计将 id 放置在父级 `<div class="advice-card">` 上 | 在修改规格说明栏中显式标注偏差：因 markdown 动态渲染（v-html），建议内容无法预先在 `<ul>` 子元素上预置 id。`<div class="advice-card">` 是距离动态渲染区最近的静态 DOM 容器，标注为语义等价替代 |
| **[轻微] S4 Risk.vue risk-detail-text 与设计文档元素类型不符**：设计文档 §4.1.7（L3307）指定 `<p id="risk-detail-text">`，v6 设计将 id 放置在 `<div class="markdown-body">` 上 | 在修改规格说明栏中显式标注偏差：实际实现使用 markdown 渲染（v-html），无法使用 `<p>` 静态文本容器。`<div class="markdown-body">` 是 markdown 渲染内容的直接承载元素，标注为语义等价替代 |
