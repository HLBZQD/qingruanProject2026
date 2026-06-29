# 任务指令（v1）

## 动作
NEW

## 任务描述
修复3个P0功能性断裂问题，使应用核心路径可正常运行：

1. **S7 - ArticleDetailView.vue 添加 onMounted 调用** (`src/views/ArticleDetailView.vue`)
   - `onMounted` 已从 Vue 导入但从未被调用，`fetchArticle()` 仅在错误重试按钮中引用
   - 修复：添加 `onMounted(() => { fetchArticle() })` 使页面加载时自动拉取文章数据

2. **S8 - DoctorChatView.vue 补充缺失的组件导入和类型导入** (`src/views/DoctorChatView.vue`)
   - 模板中使用了 `<SkeletonLoader>`、`<ErrorRetry>`、`<EmptyState>` 三个组件但未在 `<script setup>` 中导入
   - `ConversationHistoryItem` 类型在第158行使用但未导入
   - 修复：添加 `import SkeletonLoader from '@/components/SkeletonLoader.vue'`、`import ErrorRetry from '@/components/ErrorRetry.vue'`、`import EmptyState from '@/components/EmptyState.vue'` 以及 `import type { ConversationHistoryItem } from '@/types/...'`（根据项目中该类型的实际定义路径）

3. **S9 - authStore.ts clearAuth() 补充 chatStore 和 riskFormStore 清理** (`src/stores/authStore.ts`)
   - `clearAuth()` 清理了 homeStore 和 lifePlanStore 缓存，但遗漏了 chatStore 和 riskFormStore
   - 修复：在 `clearAuth()` 中添加 `useChatStore().abortActiveConnection()` + `useChatStore().clearAllConversations()` 以及 `useRiskFormStore().reset()`

## 选择理由
P0最高优先级——三个问题均导致功能性断裂（页面白屏/运行时组件解析失败/认证清理链不完整导致状态泄露），是应用无法正常工作的根因。必须最先修复，否则后续验证均无意义。三个问题位于不同文件、彼此独立，可在一个任务中并行修复（符合1-3个紧密相关类型的粒度约束）。

## 任务上下文
- 来源：审议式三轮代码审查 Round 3 集成一致性检查
- 审查报告：`reviews/202606291800_full_review/todo.md`
- 设计依据：`docs/2_detailed_design_v4.md`
- S7: 文章详情页完全无法工作——初始loading=true且fetchArticle永不触发
- S8: Vue 3 `<script setup>` 要求所有模板使用的组件显式导入，缺失导入导致运行时解析失败
- S9: 三条登出路径（useApi 401拦截器、BroadcastChannel跨标签页、路由守卫token过期）均调用clearAuth()但行为不一致——Profile.vue手动登出正确清理了chatStore，而三条自动路径遗漏

## 已有代码上下文
- `src/views/ArticleDetailView.vue`: 已有完整的 `fetchArticle()` 函数和 `onMounted` 导入（第2行），仅缺少 `onMounted(() => { fetchArticle() })` 调用
- `src/views/DoctorChatView.vue`: 模板第255行 `<SkeletonLoader>`、第262行 `<ErrorRetry>`、第269行 `<EmptyState>`，第158行使用 `ConversationHistoryItem` 类型；组件文件位于 `src/components/SkeletonLoader.vue`、`src/components/ErrorRetry.vue`、`src/components/EmptyState.vue`
- `src/stores/authStore.ts`: `clearAuth()` 位于第106-129行，已清理 homeStore/lifePlanStore；chatStore 的 `abortActiveConnection()`/`clearAllConversations()` 和 riskFormStore 的 `reset()` 需要在此处添加调用
- `src/stores/chatStore.ts`: 提供 `abortActiveConnection()` 和 `clearAllConversations()` 方法
- `src/stores/riskFormStore.ts`: 提供 `reset()` 方法
