# 任务指令（v6）

## 动作
NEW

## 任务描述

修复P2批次5的8个组件与DOM合规问题，拆分为两个子任务：

### 子任务A（高优先级）— 6个独立小修复

#### S12. AiChatDialog.vue 缺少 onUnmounted（内存泄漏）

**位置**: `src/components/AiChatDialog.vue`

**问题**: 组件已有 `onMounted`（第93-95行）但缺少 `onUnmounted`。组件卸载时活跃的 SSE 连接未被中止，造成内存泄漏和后台网络请求浪费。

**修复**:
1. 在第2行导入中添加 `onUnmounted`：`import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'`
2. 在 `onMounted` 块之后（第95行之后）添加：
```typescript
onUnmounted(() => {
  chatStore.abortActiveConnection()
})
```

#### S15. chatStore 添加 clearMessages() action（数据一致性）

**位置**: `src/stores/chatStore.ts`、`src/components/AiChatDialog.vue`、`src/views/DoctorChatView.vue`

**问题**: 清空对话操作直接修改 `chatStore.conversations.length = 0`，绕过 Pinia DevTools action 追踪。`clearAssistantConversation()`/`clearDoctorConversation()` 仅清理 conversation_id 不清空消息列表。共有4处直接赋值：
- `AiChatDialog.vue:121` — 清空按钮 click
- `DoctorChatView.vue:101` — clearChat()
- `DoctorChatView.vue:166` — selectHistorySession()
- `DoctorChatView.vue:196` — watch route.params.id

**修复**:

1. 在 `chatStore.ts` 中，**函数定义**添加在 `clearAllConversations()` 函数定义之后（约第625行，即 `clearAllConversations` 函数体末尾花括号 `}` 之后、`// ===== [G4] UI 辅助 =====` 注释之前，位于 action 函数定义区）：
```typescript
/** 清空当前消息列表（供外部组件调用，进入 Pinia action 追踪） */
function clearMessages(): void {
  conversations.value = []
}
```

2. 在 store **导出区**（`return { ... }` 块内，约第741行，`navigate` 导出项之后或与其余 action 导出项相邻位置）添加：
```typescript
clearMessages,
```

注意：函数定义和导出项是两个独立位置。函数定义在 action 函数区（第605-700行），导出项在 `return` 块内（第703-752行）。原计划将两者合并到"约第734行"为错误——第734行位于 `return` 块内的导出区，不可放置函数定义。

3. 替换4处直接赋值为 `chatStore.clearMessages()`：
   - `AiChatDialog.vue:121`: `@click="chatStore.clearAssistantConversation(); chatStore.clearMessages()"`
   - `DoctorChatView.vue:101`: `chatStore.clearMessages()`
   - `DoctorChatView.vue:166`: `chatStore.clearMessages()`
   - `DoctorChatView.vue:196`: `chatStore.clearMessages()`

#### S13. JWT Payload 字段名前后端不一致

**位置**: `src/composables/useAuth.ts:16`

**问题**: `JwtPayload` 接口声明 `user_id?: number`，但后端 JWT 实际使用 `id` 字段。导致 `parseToken()` 解析出的 payload 中 `user_id` 始终为 `undefined`，`id` 字段通过索引签名 `[key: string]: any` 保留但 TypeScript 类型提示不准确。

**修复**: 第16行 `user_id?: number;` 改为 `id?: number;`

#### S14. sseProxy.js Mock 模式固定 conversation_id

**位置**: `server/services/sseProxy.js:13-15`

**问题**: Mock 模式下 `conversation_id` 硬编码为 `'mock-001'`，`message_id` 硬编码为 `'mock-msg-001'`。连续 Mock 请求共享同一 conversation_id，导致前端对话历史混乱。

**修复**: 第13-14行改为使用动态生成：
```javascript
const mockConvId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const mockMessage = JSON.stringify({ event: 'message', answer: '您好，我是AI助手（Mock模式）。Dify服务未配置。', conversation_id: mockConvId });
const mockEnd = JSON.stringify({ event: 'message_end', conversation_id: mockConvId, message_id: `mock-msg-${Date.now()}` });
```

#### S16. NewsView.vue 搜索高亮 XSS 边缘风险

**位置**: `src/views/NewsView.vue:218-222`（函数定义）、`src/views/NewsView.vue:394`（v-html 调用点）

**问题**: `highlightKeyword()` 返回的 HTML 直接通过 `v-html` 渲染。虽然函数内对关键词做了正则转义（`escape`），但原始 `text` 参数（文章标题）来自后端数据库，若后端存储了含 HTML/脚本的标题，`<mark>` 标签外的原始文本仍通过 `v-html` 原样输出。

**修复**:
1. 在文件顶部导入区（第5行 `import { escapeHtml, sanitizeHtml } from '@/utils/sanitize'`）— 实际上需要确认导入是否存在。检查 NewsView.vue 当前导入——没有导入 sanitize。需要新增导入：
```typescript
import { sanitizeHtml } from '@/utils/sanitize'
```

2. 修改 `highlightKeyword` 函数（第218-222行），在返回前对 text 做净化：
```typescript
function highlightKeyword(text: string, kw: string): string {
  if (!text || !kw) return text
  const safeText = sanitizeHtml(text)
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return safeText.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="search-highlight">$1</mark>')
}
```

#### S17. Home.vue 未捕获的 Promise rejection

**位置**: `src/views/Home.vue:107-111`

**问题**: `showDiabetesType()` 调用 `homeStore.fetchDiabetesTypeDetail(t.id)` 未包裹 try-catch。`fetchDiabetesTypeDetail` 是异步 API 调用，若网络异常或接口返回错误，Promise rejection 未被捕获，在浏览器控制台出现 `Unhandled Promise Rejection` 警告。

**修复**: 将第107-111行包裹 try-catch：
```typescript
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

### 子任务B（批量化）— 2个批量化修改

#### S3. DisclaimerBar 组件系统性未使用（6个页面）

**问题**: 项目定义了统一的 `<DisclaimerBar>` 可复用组件（`src/components/DisclaimerBar.vue`，props: `text?: string`, `fixed?: boolean`），但6个展示AI内容的页面中仅 `NewsView.vue` 和 `HealthAdvice.vue` 正确引用。其余4个使用内联硬编码 `<div>`/`<p>` 渲染免责文本，ArticleDetailView.vue 完全缺失免责声明。

**DisclaimerBar 组件接口**:
- Props: `text` (默认: `'本平台的 AI 健康建议、风险预测、方案生成等内容仅供健康参考，不能替代专业医疗诊断、治疗或建议。如有健康问题，请及时就医咨询专业医师。'`), `fixed` (默认: `false`)
- `fixed` 为 `true` 时使用 `position: fixed; bottom: calc(var(--tab-bar-height) + ...)` 固定在页面底部

**修复清单**（6个文件，每个文件2处修改：导入 + 模板替换）：

| 文件 | 当前内联 | 替换为 | 文本 |
|------|---------|--------|------|
| **DoctorChatView.vue** | `<div class="disclaimer-bar"><p>本对话由AI虚拟医师提供，回复内容仅供参考</p></div>` (L305-307) + 对应scoped样式L445-454 | `<DisclaimerBar text="本对话由AI虚拟医师提供，回复内容仅供参考，不能替代专业医疗诊断。" />` | 自定义（补齐"不能替代专业医疗诊断"） |
| **LifePlan.vue** | `<div class="lp-disclaimer">AI 生成内容仅供参考，不能替代专业医疗诊断，如有不适请及时就医</div>` (L581-583) + 对应scoped样式L1022+ | `<DisclaimerBar />` | 默认文本（含义相近）。不使用 `fixed` prop——当前内联实现为普通流式布局元素（随内容滚动），`fixed` 会将其固定在视口底部改变页面布局行为；其余5个页面均保持默认非固定定位，保持一致 |
| **Risk.vue** | `<p class="disclaimer-text">本评估基于《中国2型糖尿病防治指南（2020版）》评分体系，仅供参考，不能替代专业医疗诊断。如有疑虑请及时就医。</p>` (L690-692) + 对应scoped样式L1516+ | `<DisclaimerBar />` | 默认文本（含义相近） |
| **Punch.vue** | `<div class="punch-disclaimer">AI 分析内容仅供参考，不能替代专业医疗诊断，如有不适请及时就医</div>` (L395-397) + 对应scoped样式L796+ | `<DisclaimerBar text="AI 分析内容仅供参考，不能替代专业医疗诊断，如有不适请及时就医。" />` | 保留原文案 |
| **Admin.vue** | `<div class="disclaimer-bar"><p>本管理助手由 AI 驱动，所有数据操作将被记录审计日志。</p></div>` (L172-174) + 对应scoped样式L364+ | `<DisclaimerBar text="本管理助手由 AI 驱动，所有数据操作将被记录审计日志。" />` | 保留原文案 |
| **ArticleDetailView.vue** | 无（完全缺失） | 在正文渲染区之后（`</section>` L235之后）、`</div>` L237之前添加 `<DisclaimerBar />` | 默认文本 |

**附加操作**: 每个文件替换后，删除对应的旧内联 scoped 样式块（`<style scoped>` 中的 disclaimer-bar/lp-disclaimer/disclaimer-text/punch-disclaimer 样式定义）。

#### S4. 前端视图 DOM id/data-* 属性补充（优先 Risk.vue + Punch.vue）

**问题**: 设计文档 §4.1 为关键 DOM 节点规定了 `id` 和 `data-*` 属性，实际代码大量使用 CSS class 替代。这些属性是自动化测试（E2E）和辅助技术（无障碍访问）的重要锚点。

**本批次范围**: 仅 Risk.vue (9个id) 和 Punch.vue (8个id)。其余视图（Home/Profile/Admin/Login/Consultation/ArticleDetailView）延后至后续批次。

**Risk.vue — 9个 id/data-* 属性**:

| 设计 id/属性 | 添加到元素 | 说明 |
|-------------|-----------|------|
| `data-step="1"` | 步骤1容器根元素 | 当前为 `v-if="currentStep === 1"` 的 div |
| `data-step="2"` | 步骤2容器根元素 | 当前为 `v-if="currentStep === 2"` 的 div |
| `data-step="3"` | 步骤3容器根元素 | 当前为 `v-if="currentStep === 3"` 的结果 div |
| `id="field-error-container-step1"` | 步骤1字段错误提示 | 步骤1 `v-if="fieldError"` 提示元素（第437行）。步骤用 `v-show` 切换，两个步骤的 `fieldError` 提示同时存在于 DOM，需区分 id 避免 HTML id 唯一性违规 |
| `id="field-error-container"` | 步骤2字段错误提示容器 | 步骤2 `v-if="fieldError"` 提示元素（第602行）。设计文档 §4.1.7（L3295）定义此 id 在步骤2，步骤2是表单提交前的最终校验步骤 |
| `id="risk-level-badge"` | 风险等级徽章 | 结果展示中的风险等级标签 |
| `id="risk-level-text"` | 风险等级文字描述 | 用 `<span id="risk-level-text">` 包裹第672行文本插值 `{{ result.risk_level_label \|\| riskMeta.label }}`。该行位于 `<div class="risk-level-badge">`（第670行）内部，为文本插值表达式，不可直接附加 id，需用 span 包裹 |
| `id="risk-score"` | 风险评分数字 | 结果展示中的分数 |
| `id="suggestions-list"` | 建议列表容器 | 添加到 `<div class="advice-card">`（第682行）。该 div 语义上包裹了建议标题（advice-header）和 markdown 渲染的建议内容（`v-html`），是距离动态渲染建议区最近的静态 DOM 容器。不可放在 `markdown-body` div 内部——该 div 内容为 v-html 动态渲染，无法预先在渲染内容中插入 id |
| `id="risk-detail-text"` | 风险分析详情文本 | 设计文档 §4.1.7（L3307）规定此 id。实际代码中对应 `<div class="markdown-body" v-html="safeAdviceHtml(result.advice)">`（第687行）。设计文档原定义为 `<p>` 静态文本，实际实现使用 markdown 渲染——差异来源为渲染方式不同，在该 div 上添加此 id 作为语义等价替代 |

注：设计文档 §4.1.7 规定 9 个 id/data-* 属性（3个 `data-step` + 6个 `id`），上表已全部列出。精确行号——`data-step` 属性：步骤1 第388行、步骤2 第451行、步骤3 第624行，放在各步骤的 `<section v-show="currentStep === N" class="step-panel">` 容器上。结果区 id：`risk-score` 第665行（`<span class="gauge-score">`）、`risk-level-badge` 第670行（`<div class="risk-level-badge">`）、`risk-level-text` 用 `<span>` 包裹第672行文本插值、`risk-detail-text` 第687行（`<div class="markdown-body">`）、`suggestions-list` 第682行（`<div class="advice-card">`）。`risk-detail-text` 从设计文档的静态 `<p>` 变为实际代码的 markdown 渲染 `<div>`，差异已在表内说明。两个步骤的 `fieldError` 提示同时存在于 DOM（v-show 切换），步骤1 使用 `id="field-error-container-step1"`（第437行）、步骤2 使用 `id="field-error-container"`（第602行），避免 HTML id 唯一性违规。

**Punch.vue — 8个 id**:

| 设计 id | 添加到元素 | 说明 |
|---------|-----------|------|
| `id="analysis-section"` | AI分析结果区域容器 | `<section class="punch-analysis-section">`（第255行）。注意：原指定 `v-if="store.analysis"` 的模板区根元素为 `<template v-else-if="store.analysis">`（第275行），`<template>` 是 Vue 虚拟容器不渲染为 DOM 节点，无法携带 id。改为放置在包裹了加载中/失败/成功三态的父级 `<section>` 上，该元素为真实 DOM 节点且语义匹配设计文档 §4.1.8 的 `<section id="analysis-section">` |
| `id="diet-rate"` | 饮食完成率显示 | 统计卡中饮食完成率元素 |
| `id="exercise-rate"` | 运动完成率显示 | 统计卡中运动完成率元素 |
| `id="total-punches"` | 总打卡次数显示 | 统计卡中总次数元素 |
| `id="trend-chart"` | 趋势柱状图容器 | 7天趋势图容器 |
| `id="punch-list"` | 打卡记录列表容器 | 添加到 `<div class="punch-record-list">`（第505行）。该 div 为打卡记录卡片（`v-for="record in store.records"`）的直接父容器，是"记录列表"的精确语义锚点。拒绝 `<section class="punch-list-section">`（第450行，包含标题+列表+分页，范围过宽）和 `<template v-else>`（第498行，Vue 虚拟容器不渲染为 DOM 节点） |
| `id="empty-container"` | 空记录引导容器 | 无记录时的空态区域 |
| `id="btn-load-more"` | 加载更多按钮 | 列表底部加载更多按钮 |

注：Punch.vue 模板中 8 个 id 目标的精确行号——`analysis-section` 第255行（`<section class="punch-analysis-section">`）、`diet-rate` 第280行（饮食完成率 `<span class="punch-stat-value">`）、`exercise-rate` 第286行（运动完成率 `<span class="punch-stat-value">`）、`total-punches` 第292行（总打卡 `<span class="punch-stat-value">`）、`trend-chart` 第340行（`<div class="punch-trend-chart">`）、`punch-list` 第505行（`<div class="punch-record-list">`）、`empty-container` 第479行（`<div v-else-if="...punch-empty">`）、`btn-load-more` 第570行（`<button v-else-if="store.hasMore" class="punch-loadmore-btn">`）。保持现有 class 不变，仅追加 `id="..."` 属性。

## 选择理由

P2批次5问题，均为独立代码层面的合规修复：
- **子任务A (S12/S15/S13/S14/S16/S17)**: 6个独立小修复，分别处理内存泄漏（S12）、数据一致性（S15）、类型系统（S13）、Mock数据质量（S14）、XSS安全（S16）、异常处理（S17）。各修复互不依赖，仅S15涉及chatStore.ts共性文件。
- **子任务B (S3/S4)**: 2个批量化设计合规对齐。S3统一6页面DisclaimerBar引用消除内联硬编码，S4为Risk+Punch补充DOM锚点支撑自动化测试。
- 8个问题之间无先后依赖，可并行执行。
- 前序批次 v1-v5 全部 PASSED，无阻塞问题。

## 任务上下文

### 审查报告摘要

来源：`reviews/202606291800_full_review/todo.md` 批次5（第472-481行）

- **S12**: AiChatDialog.vue 缺少 `onUnmounted(() => { chatStore.abortActiveConnection() })`
- **S15**: chatStore 添加 `clearMessages()` action，替换各处 `conversations.length = 0`
- **S13**: `useAuth.ts:16` JwtPayload `user_id?: number` → `id?: number`（后端JWT实际字段名为`id`）
- **S14**: `sseProxy.js:13-15` Mock模式 `conversation_id: 'mock-001'` → 动态生成唯一ID
- **S16**: `NewsView.vue:394` highlightKeyword输出经v-html渲染，需额外sanitizeHtml()净化原始标题文本
- **S17**: `Home.vue:107-111` showDiabetesType未包裹try-catch，fetchDiabetesTypeDetail失败时产生Unhandled Promise Rejection
- **S3**: 6页面（DoctorChatView/LifePlan/Risk/Punch/Admin/ArticleDetailView）统一使用DisclaimerBar组件替换内联免责标记
- **S4**: Risk.vue(9id) + Punch.vue(8id) 补充设计文档§4.1规定的DOM id/data-*属性

### 设计文档约束

- §4.1 组件树：各页面关键DOM节点须有 `id` 和 `data-*` 属性（自动化测试锚点）
- §7.4 合规要求：所有AI内容页面展示固定免责提示
- DisclaimerBar组件（`src/components/DisclaimerBar.vue`）：props `text`(默认医学免责文案)、`fixed`(底部固定定位)

## 已有代码上下文

### 已完成批次
- **v1 (R1)**: P0 功能性断裂修复（S7/S8/S9）— 3/3 PASSED
- **v2 (R2)**: P1 前端设计合规修复（S1/S2）— 13/13 测试PASSED
- **v3 (R3)**: P1 后端安全缺陷修复（S5/S6）— 4/4 PASSED
- **v4 (R4)**: ALL_DONE（计划里程碑，无代码修改）
- **v5 (R5)**: P1 跨标签页认证修复（S10/S11）— 5/5 PASSED

### 关键文件现状

**S12 — AiChatDialog.vue**（567行）:
- 第2行导入：`ref, computed, nextTick, onMounted, watch`（缺 `onUnmounted`）
- 第12行：`const chatStore = useChatStore()` — abortActiveConnection 可用
- 第93-95行：已有 `onMounted` 钩子
- 第44-46行：watch isOpen 中 `chatStore.abortActiveConnection()` — 关闭对话框时中止，但组件卸载时不触发

**S15 — chatStore.ts**（753行）:
- 第19行：`const conversations = ref<ChatMessage[]>([])` — 响应式消息数组
- 第167-168行：`clearDoctorConversation()` — 仅清理 conversation_id Map
- 第186-188行：`clearAssistantConversation()` — 仅清空 assistantConversationId
- 第605-624行：`clearAllConversations()` 函数定义 — `clearMessages()` 函数定义应添加在此之后（action 函数定义区）
- 第703-752行：store `return { ... }` 导出区 — `clearMessages` 导出项应添加在此块内（约第741行）
- 直接赋值位置：AiChatDialog.vue:121, DoctorChatView.vue:101/166/196

**S13 — useAuth.ts**（117行）:
- 第10-27行：`JwtPayload` 接口定义
- 第16行：`user_id?: number` — 需改为 `id?: number`
- 第38-62行：`parseToken()` — 使用该接口类型

**S14 — sseProxy.js**（111行）:
- 第10-19行：Mock 模式分支（`if (!baseUrl)`）
- 第13行：`conversation_id: 'mock-001'` — 硬编码
- 第14行：`message_id: 'mock-msg-001'` — 硬编码

**S16 — NewsView.vue**（810行）:
- 第5行：`import { escapeHtml, sanitizeHtml } from '@/utils/sanitize'` — 检查发现当前导入无 sanitize，实际导入为 `import { getArticles } from '@/composables/useHomeApi'` 等，sanitize未导入
- 第218-222行：`highlightKeyword()` — 仅正则转义关键词，未净化原文
- 第394行：`v-html="highlightKeyword(item.title, searchedKeyword)"` — XSS注入点

**S17 — Home.vue**（837行）:
- 第107-111行：`showDiabetesType()` 调用 `homeStore.fetchDiabetesTypeDetail(t.id)` 无 try-catch
- 第113-133行：`openTypeSwal()` — 接收 `DiabetesTypeDetail` 参数，已做好 escapeHtml + sanitizeHtml 防御
- `DiabetesType` 接口（list item）包含 `pathogenesis/manifestation/treatment` 三段文本，可作为 catch 回退数据

**S3 — DisclaimerBar 组件**（`src/components/DisclaimerBar.vue`，52行）:
- Props: `text?: string` (默认长医学免责文案), `fixed?: boolean` (默认 false)
- 模板: `<div class="disclaimer-bar" :class="{ fixed }" role="note">` + 图标 + 文本
- 当前仅被 `NewsView.vue`(L484) 和 `HealthAdvice.vue`(L144) 和 `AiChatDialog.vue`(L178) 引用
- 6个待修复页面的内联免责标记位置已在上方修复清单中列出

**S4 — Risk.vue 和 Punch.vue**:
- Risk.vue: 约700行模板，三步表单+结果展示结构。需阅读模板确认 `currentStep` 分支结构后添加 id/data-step
- Punch.vue: 约400行模板，列表/分析/空态三视图。需阅读模板确认各区域后添加 id
- 两个文件当前无任何 DOM id 属性（仅有 Vue ref 和 CSS class）

## 修订说明（v6 r1）
| 审查意见 | 修改措施 |
|---------|---------|
| **[严重] S4 Punch.vue `id="analysis-section"` 目标为 `<template>` 虚拟容器**：元素 `<template v-else-if="store.analysis">`（第275行）不渲染为 DOM 节点，无法携带 id | 改为指定 `<section class="punch-analysis-section">`（第255行）作为目标元素。该 `<section>` 包裹了加载中/失败/成功三态，为真实 DOM 节点且匹配设计文档 §4.1.8 的 `<section id="analysis-section">` |
| **[一般] S4 Risk.vue `id="field-error-container"` 重复**：步骤1（第437行）和步骤2（第602行）各有一个 `v-if="fieldError"` 提示元素，因 `v-show` 切换两者同时存在于 DOM，同名 id 违反 HTML 唯一性约束 | 拆分为 `id="field-error-container-step1"`（步骤1）和 `id="field-error-container"`（步骤2，匹配设计文档 §4.1.7 L3295） |
| **[一般] S4 Risk.vue id 数量与需求不一致**：设计文档规定 9 个 id，计划仅列出 8 个。缺少的为 `id="risk-detail-text"`（设计文档 L3307），对应实际代码中 `<div class="markdown-body" v-html="safeAdviceHtml(result.advice)">`（第687行） | 补充 `id="risk-detail-text"` 条目，说明设计文档的静态 `<p>` 与实际代码的 markdown 渲染 `<div>` 的差异来源，确认该 div 为语义等价替代目标 |
| **[一般] S15 `clearMessages()` 函数定义位置指引不精确**：原计划将函数定义和导出项合并指向"约第734行"，但第734行位于 `return { ... }` 导出区，不可放置函数定义 | 区分为两个独立位置：（1）函数定义在 action 函数区，`clearAllConversations()` 之后约第625行；（2）导出项在 `return` 块内，约第741行。同步更新了"已有代码上下文"中 S15 的行号引用 |
| **[轻微] S3 LifePlan.vue `fixed` prop 缺乏论证**：计划指定 `fixed` 但未说明 LifePlan 为何需要不同于其他5个页面的固定定位 | 移除 `fixed` prop，改为 `<DisclaimerBar />` 使用默认非固定定位。理由：当前内联实现为普通流式布局，`fixed` 会改变页面行为；其余5个页面均保持默认定位，应保持一致 |
| **[轻微] S4 Risk.vue 代码行号指引不完整**：原指引"约第600-700行"仅覆盖步骤3/结果展示区，但 `data-step="1"` 在第388行、`data-step="2"` 在第451行，均不在该范围内 | 在 S4 Risk.vue 表格注释中补充了精确行号：`data-step` 在 388/451/624 行，结果区 id 在 665/670/672/687 行，覆盖全部三个步骤 |

## 修订说明（v6 r2）
| 审查意见 | 修改措施 |
|---------|---------|
| **[一般] S4 Risk.vue `risk-level-text` 第672行为文本插值不可添加 id**：`{{ result.risk_level_label \|\| riskMeta.label }}` 是纯文本插值表达式，不是独立 HTML 元素，id 属性无法附着。父元素 `<div class="risk-level-badge">`（第670行）已承载 `id="risk-level-badge"`，不可同时承载两个 id | 明确要求用 `<span id="risk-level-text">` 包裹第672行文本插值。这是最小侵入方案，保留现有 DOM 结构，不改变 `<p class="result-hint">`（语义为"条件提示文案"而非"等级标签"） |
| **[轻微] S4 Punch.vue 行号范围"约第260-400行"不准确**：`punch-list`（第505行）、`empty-container`（第479行）、`btn-load-more`（第570行）均位于第450-581行，不在所述范围内 | 更新 Punch.vue 注释，逐项给出 8 个 id 的精确行号：analysis-section 第255行、diet-rate 第280行、exercise-rate 第286行、total-punches 第292行、trend-chart 第340行、empty-container 第479行、punch-list 第505行、btn-load-more 第570行 |
| **[轻微] S4 Punch.vue `punch-list` 目标元素未指定**：原描述"记录列表根元素"未明确是 `<section class="punch-list-section">`（第450行）、`<div class="punch-record-list">`（第505行）还是 `<template v-else>`（第498行） | 明确指定 `<div class="punch-record-list">`（第505行）为目标元素，给出拒绝其余两个候选的技术理由（section 范围过宽、template 不渲染为 DOM 节点） |
| **[轻微] S4 Risk.vue `suggestions-list` 位置"内部或附近"描述模糊**：`markdown-body` div 内容为 `v-html` 动态渲染，无法预先在渲染内容中插入 id，"内部"需 post-render DOM 操作 | 改为指定 `<div class="advice-card">`（第682行）为目标元素，说明其语义上包裹了建议标题和渲染内容，是距离动态渲染区最近的静态 DOM 容器。放弃"内部"方案——避免引入不必要的 post-render DOM 操作复杂度 |
