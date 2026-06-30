# 实现需求：批次5 — P2 组件与DOM合规

## 来源

审议式三轮代码审查报告 `reviews/202606291800_full_review/todo.md`

## 本批次任务（8个问题，按依赖关系和影响范围排序）

### S12. AiChatDialog.vue 缺少 onUnmounted（优先：内存泄漏）

- **文件**: `src/components/AiChatDialog.vue`
- **修复**: 添加 `onUnmounted(() => { chatStore.abortActiveConnection() })`

### S15. chatStore 添加 clearMessages() action（优先：数据一致性）

- **文件**: `src/stores/chatStore.ts`
- **修复**: 添加 `clearMessages()` action，DoctorChatView.vue 和 AiChatDialog.vue 统一调用，替换直接修改 `conversations.length = 0`

### S13. JWT Payload 字段名前后端不一致

- **文件**: `src/composables/useAuth.ts:16`
- **修复**: JwtPayload 接口 `user_id?: number` → `id?: number`

### S14. sseProxy.js Mock 模式固定 conversation_id

- **文件**: `server/services/sseProxy.js:13-15`
- **修复**: 生成唯一 ID `` `mock-${Date.now()}-${Math.random().toString(36).slice(2,8)}` ``

### S16. NewsView.vue 搜索高亮 XSS 边缘风险

- **文件**: `src/views/NewsView.vue:394`
- **修复**: highlightKeyword 输出额外调用 sanitizeHtml()

### S17. Home.vue 未捕获的 Promise rejection

- **文件**: `src/views/Home.vue:107-111`
- **修复**: showDiabetesType 内部包裹 try-catch

### S3. DisclaimerBar 组件系统性未使用（6个页面）

- **文件**: DoctorChatView / LifePlan / Risk / Punch / Admin → `<DisclaimerBar>`, ArticleDetailView → 正文后添加 `<DisclaimerBar />`

### S4. 前端视图 DOM id/data-* 属性（优先级：Risk.vue + Punch.vue 优先）

- **文件**: 按优先级 Risk.vue(9个id) → Punch.vue(8个id) → Home.vue(3个section) → Profile.vue(7个id)
- **修复**: 按设计文档 §4.1 补充 id 和 data-* 属性

## 项目根目录

C:\Users\DELL\Desktop\qingruanProject2026
