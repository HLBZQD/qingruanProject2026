# 详细设计（v1）

## 概述

修复全量代码审查发现的3个P0功能性断裂问题，使应用核心路径可正常运行。三个修复位于不同文件、彼此独立：

1. **S7**: ArticleDetailView.vue 添加 `onMounted` 调用，使页面加载时自动拉取文章数据
2. **S8**: DoctorChatView.vue 补充缺失的3个组件导入和1个类型导入，消除运行时解析失败
3. **S9**: authStore.ts `clearAuth()` 补充 chatStore 和 riskFormStore 清理，消除三条登出路径的状态泄露
4. **todo.md 更新**: 将已修复的 S7/S8/S9 在 `reviews/202606291800_full_review/todo.md` 中标记为已完成，使其成为可追踪的实现计划

### 本轮范围边界

v1 仅覆盖 **P0 立即修复（S7/S8/S9）**——三个导致功能性断裂的严重缺陷。本轮设计不覆盖其余 47 个问题。

### 后续迭代计划

| 版本 | 优先级 | 问题ID | 数量 | 预计覆盖内容 |
|------|:------:|--------|:---:|-------------|
| v2 | P1 本迭代 | S1, S2, S5, S6, S10, S11 | 6 | 死代码清理、AiChatDialog 设计合规修复、SQL 注入修复、加密密钥启动校验、BroadcastChannel 三缺陷修复、SSE 401 重定向 |
| v3 | P2 下迭代 | S3, S4, S12, S13, S14, S15, S16, S17 | 8 | DisclaimerBar 统一化、DOM id/data-* 属性补充、onUnmounted 补充、JWT 字段名对齐、Mock conversation_id 唯一化、Pinia action 封装、XSS 二次净化、未捕获 Promise rejection |
| v4 | P3 后续优化 | G1-G33 | 33 | 类型安全加固、日志补充、命名规范化、架构一致性修复、安全与运维增强 |

> 以上迭代计划为建议，实际分批由后续计划文件的 `requirement.md` 确定。

## 文件规划

| 文件路径 | 操作 | 职责 |
|---------|------|------|
| src/views/ArticleDetailView.vue | 修改 | 在 `<script setup>` 中添加 `onMounted(() => { fetchArticle() })` 调用 |
| src/views/DoctorChatView.vue | 修改 | 在 `<script setup>` 导入区补充3个组件导入和1个类型导入 |
| src/stores/authStore.ts | 修改 | 在 `clearAuth()` 中添加 chatStore 和 riskFormStore 清理调用；补充模块顶层 import |
| reviews/202606291800_full_review/todo.md | 修改 | 将 S7/S8/S9 标记为已完成（[x]），添加实现批次和完成日期戳 |

## 类型定义

本任务不引入新类型，仅使用已有类型。

### ConversationHistoryItem（已有，仅引用）

**形态**：interface
**包路径**：`@/types/sse`
**源文件**：`src/types/sse.ts:73-80`
**职责**：描述 Dify 会话历史列表项的结构

**公开接口**：
```typescript
export interface ConversationHistoryItem {
  conversation_id: string   // Dify 会话 UUID
  name: string              // 会话名称
  created_at: string        // 会话创建时间 ISO 8601 字符串
}
```

## 修改规格

### 修改1：ArticleDetailView.vue — 添加 onMounted 调用

**文件**：`src/views/ArticleDetailView.vue`
**操作**：修改（在 `<script setup>` 尾部追加一行）

**现状**：
- 第2行已导入 `onMounted`：`import { ref, computed, onMounted } from 'vue'`
- 第46-76行已定义 `async function fetchArticle(): Promise<void>`
- `fetchArticle()` 仅在模板错误重试按钮 `@click="fetchArticle"` 中引用
- 初始状态 `loading = ref(true)` 导致页面始终停留在骨架屏

**变更**：在 `<script setup>` 块末尾（第140行 `</script>` 之前，紧跟 `toggleCollect` 函数闭合之后）插入：

```typescript
onMounted(() => { fetchArticle() })
```

**行为契约**：
- 前置：组件挂载，`route.params.id` 可用
- 后置：`fetchArticle()` 被调用，异步拉取文章详情并更新 `article`/`loading`/`error`/`notFound` 状态
- 无副作用：`onMounted` 回调在组件卸载时自动清理

### 修改2：DoctorChatView.vue — 补充组件和类型导入

**文件**：`src/views/DoctorChatView.vue`
**操作**：修改（在 `<script setup>` 导入区追加4行）

**现状**：
- 模板第255行使用 `<SkeletonLoader>`，第262行使用 `<ErrorRetry>`，第269行使用 `<EmptyState>`
- 第158行函数签名使用 `ConversationHistoryItem` 类型：`function selectHistorySession(item: ConversationHistoryItem): void`
- `<script setup>` 导入区（第3-9行）未导入上述三个组件和类型
- Vue 3 `<script setup>` 要求模板中使用的所有组件显式导入，否则运行时解析失败

**变更**：

在第9行 `import type { Doctor } from '@/types/api'` 之后追加：

```typescript
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import ErrorRetry from '@/components/ErrorRetry.vue'
import EmptyState from '@/components/EmptyState.vue'
import type { ConversationHistoryItem } from '@/types/sse'
```

**依赖的已有类型/组件**：
| 符号 | 源文件 | 导出形式 |
|------|--------|---------|
| `SkeletonLoader` | `src/components/SkeletonLoader.vue` | default export，Props: `type?: 'card' \| 'list' \| 'text' \| 'avatar' \| 'article' \| 'custom'`, `rows?: number`, `avatar?: boolean` |
| `ErrorRetry` | `src/components/ErrorRetry.vue` | default export，Props: `message?: string`, `icon?: string`, `retryText?: string`；Emits: `retry` |
| `EmptyState` | `src/components/EmptyState.vue` | default export，Props: `icon?: string`, `title?: string`, `description?: string`, `actionText?: string` |
| `ConversationHistoryItem` | `src/types/sse.ts` | named type export，interface `{ conversation_id: string; name: string; created_at: string }` |

**行为契约**：
- 前置：组件编译/解析时，Vue SFC 编译器解析 `<script setup>` 导入
- 后置：模板中 `<SkeletonLoader>`、`<ErrorRetry>`、`<EmptyState>` 可被 Vue 运行时正确解析为对应组件；`ConversationHistoryItem` 类型在第158行函数签名中可用
- 无运行时副作用：仅为导入声明

### 修改3：authStore.ts — clearAuth() 补充 chatStore 和 riskFormStore 清理

**文件**：`src/stores/authStore.ts`
**操作**：修改（在模块顶层追加2个 import；在 `clearAuth()` 函数体内追加2组清理调用）

**现状**：
- `clearAuth()`（第106-129行）已清理 homeStore（`useHomeStore().clearHomeCache()`）和 lifePlanStore（`useLifePlanStore().clearPlanCache()`）
- chatStore 提供 `abortActiveConnection(): void`（中止活跃 SSE 连接）和 `clearAllConversations(): void`（清空所有对话会话、conversation_id Map、localStorage 持久化键、消息列表）
- riskFormStore 提供 `reset(): void`（重置 currentStep=1、清空 formData、清空 result、清除 sessionStorage）
- 三条登出路径（useApi 401 拦截器、BroadcastChannel 跨标签页同步、路由守卫 token 过期）均调用 `clearAuth()` 但遗漏 chatStore/riskFormStore 清理

**变更**：

1. 在文件顶部 import 区（第6行 `import { useLifePlanStore } from '@/stores/lifePlanStore'` 之后）追加：

```typescript
import { useChatStore } from '@/stores/chatStore'
import { useRiskFormStore } from '@/stores/riskFormStore'
```

2. 在 `clearAuth()` 函数体内，第119行 `try { useLifePlanStore().clearPlanCache() } catch { /* Store 未初始化时静默 */ }` 之后、第121行 BC 广播注释之前插入：

```typescript
    try { useChatStore().clearAllConversations() } catch { /* Store 未初始化时静默 */ }
    try { useRiskFormStore().reset() } catch { /* Store 未初始化时静默 */ }
```

> **设计决策**: `clearAllConversations()` 内部首行即调用 `abortActiveConnection()`（已验证 `src/stores/chatStore.ts:605`），故无需在 `clearAuth()` 中单独调用 `abortActiveConnection()`。仅调用 `clearAllConversations()` 即可同时完成 SSE 连接中止和对话数据清理。

**方法签名（已有，仅调用）**：

```typescript
// chatStore
clearAllConversations(): void
  // 登出时统一清理所有对话会话
  // 清理步骤（内部，已验证 src/stores/chatStore.ts:603-606）：
  //   1. abortActiveConnection() — 中止活跃 SSE 连接
  //   2. 清空 doctorConversations Map
  //   3. 清除 localStorage 所有 qrzl_conv_* 键
  //   4. 清空 conversations[] 消息列表
  //   5. 清空 assistantConversationId + adminConversationId
  // 前置：无（内部调用 abortActiveConnection，幂等）
  // 后置：所有对话状态归零，SSE 连接已中止

// riskFormStore
reset(): void
  // 重置风险表单所有状态
  // 清理内容：currentStep = 1, formData = {}, result = null
  //   + sessionStorage.removeItem('risk_form_data')
  // 前置：无
  // 后置：所有风险表单状态归零
```

**行为契约**：
- 前置：`clearAuth()` 被调用（来自 logout/401拦截/BC同步/路由守卫）
- 后置：
  - 所有对话数据被清空，SSE 连接被中止（`chatStore.clearAllConversations()`，内部先调用 `abortActiveConnection()` 再清理数据）
  - 风险表单数据被重置（`riskFormStore.reset()`）
  - homeStore 和 lifePlanStore 缓存已清空（原有逻辑不变）
  - token/role/user/mustChangePassword 状态已清空（原有逻辑不变）
  - BroadcastChannel 已广播登出消息（原有逻辑不变）
- 调用顺序：先清理对话（`clearAllConversations`，内部自动处理 SSE 中止），再重置表单（`reset`）。两个新调用均包裹在 try-catch 中，单个清理失败不影响其他清理和后续 BC 广播。
- 幂等性：chatStore 和 riskFormStore 的清理方法均为幂等操作，重复调用无副作用。

### 修改4：todo.md — 将已修复问题标记为已完成

**文件**：`reviews/202606291800_full_review/todo.md`
**操作**：修改（将 S7/S8/S9 条目标记为 `[x]`，添加完成信息）

**现状**：todo.md 以 Markdown 清单格式列出了全部 50 个审查发现的问题，条目格式为 `- [ ] **S7. ...**`。当前无任何条目被标记为完成，缺少实现批次和日期追踪。

**变更**：将 S7、S8、S9 三个条目的复选框从 `[ ]` 改为 `[x]`，并在每个条目描述末尾追加一行完成记录：

```markdown
- [x] **S7. ArticleDetailView.vue ...**
  > **已修复**: 2026-06-30, 批次 v1 (P0 功能性断裂修复), 在 onMounted 中调用 fetchArticle()

- [x] **S8. DoctorChatView.vue ...**
  > **已修复**: 2026-06-30, 批次 v1 (P0 功能性断裂修复), 补充 SkeletonLoader/ErrorRetry/EmptyState 组件导入和 ConversationHistoryItem 类型导入

- [x] **S9. authStore.clearAuth() ...**
  > **已修复**: 2026-06-30, 批次 v1 (P0 功能性断裂修复), clearAuth() 中补充 useChatStore().clearAllConversations() 和 useRiskFormStore().reset() 调用
```

**行为契约**：
- 前置：三个 P0 修复的代码变更已实现并通过构建验证
- 后置：todo.md 成为可追踪的实现计划，已完成的 3 个条目清晰标注批次和日期
- 后续批次（v2/v3/v4）的实现者可参考此格式继续标记

---

## 详细设计文档合规性交叉验证

依据审查依据 `docs/2_detailed_design_v4.md` 对本次设计的三个修改逐条验证：

| 设计条款 | 要求 | 本设计对应 | 状态 |
|---------|------|-----------|:--:|
| §3.2.3 行1578-1580 clearAuth() 清理步骤 | `abortActiveConnection` → `clearAllConversations` → `riskFormStore.reset` | 修改3：调用 `clearAllConversations()`（内部先 `abortActiveConnection`） + `riskFormStore.reset()` | 一致 |
| §4.3 行3814-3816 登出流程图 | 登出时需中止 SSE、清理对话、重置风险表单 | 修改3：chatStore + riskFormStore 清理覆盖全部三条登出路径（401/BC/路由守卫） | 一致 |
| §4.1.2 ArticleDetailView 页面设计 | 页面加载时自动拉取文章详情 | 修改1：`onMounted(() => { fetchArticle() })` | 一致 |
| §4.1.4 DoctorChatView 页面设计 | 使用 SkeletonLoader/ErrorRetry/EmptyState 通用组件 | 修改2：补充三个组件的显式导入 | 一致 |
| §7.4 可复用组件使用规范 | 模板中使用的组件需显式导入（Vue 3 `<script setup>` 要求） | 修改2：补充缺失导入 | 一致 |

> 验证结论：本设计的三项修改与详细设计文档 `docs/2_detailed_design_v4.md` 完全一致，无偏离。

## 错误处理

- **S7 (ArticleDetailView)**: `onMounted` 回调本身不抛异常。`fetchArticle()` 内部已有完整的 try-catch，错误通过 `error.value` 和 `notFound.value` 状态展示给用户。
- **S8 (DoctorChatView)**: 导入声明为编译期解析，不存在运行时错误路径。若组件文件不存在，构建阶段（Vite）即报错。
- **S9 (authStore)**: 两个新增的 store 清理调用均包裹在 try-catch 中，与已有 homeStore/lifePlanStore 清理模式一致。`clearAllConversations()` 内部已处理 SSE 中止（`abortActiveConnection()`），无需单独调用。任一 store 未初始化时静默忽略，不影响其他清理步骤和后续 BC 广播。

## 依赖关系

### 已有类型/模块依赖

| 依赖项 | 使用方 | 用途 |
|--------|--------|------|
| `onMounted` (vue) | ArticleDetailView.vue | 已导入，本次仅添加调用 |
| `fetchArticle()` | ArticleDetailView.vue | 已在同文件定义，本次在 onMounted 中调用 |
| `SkeletonLoader` (src/components/SkeletonLoader.vue) | DoctorChatView.vue | 新增导入，模板已使用 |
| `ErrorRetry` (src/components/ErrorRetry.vue) | DoctorChatView.vue | 新增导入，模板已使用 |
| `EmptyState` (src/components/EmptyState.vue) | DoctorChatView.vue | 新增导入，模板已使用 |
| `ConversationHistoryItem` (src/types/sse.ts) | DoctorChatView.vue | 新增导入，第158行函数签名已使用 |
| `useChatStore` (src/stores/chatStore.ts) | authStore.ts | 新增导入，在 clearAuth() 中调用 |
| `useRiskFormStore` (src/stores/riskFormStore.ts) | authStore.ts | 新增导入，在 clearAuth() 中调用 |
| `todo.md` (reviews/202606291800_full_review/todo.md) | 本任务 | 将 S7/S8/S9 标记为已完成，添加批次和日期 |

### 暴露给后续任务的公开接口

本任务不引入新的公开接口。四个修改均为内部修复或文档更新：

- ArticleDetailView.vue: 无新增导出，仅添加生命周期钩子调用
- DoctorChatView.vue: 无新增导出，仅补充导入声明
- authStore.ts: `clearAuth()` 的行为增强（清理范围扩大），调用签名不变
- todo.md: 提供可追踪的实现进度，后续批次实现者可参考标记格式

---

## 修订说明（v1 r2）

| 审查意见 | 修改措施 |
|---------|---------|
| **[严重] 设计覆盖范围与需求不匹配——仅覆盖3/50个问题** | **部分采纳**。本轮任务文件(task_v1.md)明确限定为P0 3个问题，设计范围与任务一致。补充了：(1) 概述中明确"v1仅覆盖P0(S7/S8/S9)"的范围边界；(2) 后续迭代计划表（v2 P1 6个 / v3 P2 8个 / v4 P3 33个）；(3) 将 todo.md 的更新纳入本设计（文件规划新增第4行、修改规格新增"修改4"）。**分歧说明**：不认同应将全部50个问题纳入单轮设计——任务粒度约束(1-3紧密相关类型)和迭代策略均要求分批实现。当前方案在保持合理粒度的同时，通过迭代计划表和 todo.md 更新解决了"可追踪实现计划"的需求。 |
| **[一般] 设计未与详细设计文档交叉验证合规性** | **采纳**。新增"详细设计文档合规性交叉验证"章节，逐条对照 `docs/2_detailed_design_v4.md` 的 §3.2.3、§4.3、§4.1.2、§4.1.4、§7.4 五个条款，验证结果均为"一致"。 |
| **[轻微] authStore.ts clearAuth() 中 abortActiveConnection() 冗余调用** | **采纳**。经查验 `src/stores/chatStore.ts:605`，`clearAllConversations()` 内部首行即调用 `abortActiveConnection()`。修改设计中移除单独的 `abortActiveConnection()` 调用，仅保留 `clearAllConversations()` + `riskFormStore.reset()` 两个清理步骤。同步更新了方法签名文档、行为契约和错误处理描述。 |
| **[轻微] ArticleDetailView.vue 行号引用偏差（139→140）** | **采纳**。将修改1中的 `</script>` 行号从 139 更正为 140。 |
