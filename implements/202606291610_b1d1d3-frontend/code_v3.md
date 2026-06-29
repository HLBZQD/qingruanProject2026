# 实现报告（v3）

## 概述
D3 — Admin.vue SSE 逻辑统一。将 Admin.vue 内联的 parseSSEBuffer/readSSEStream/dispatchSSEEvent（约 85 行）替换为 chatStore.sendAdminMessage 统一调用，为 ChatMessage 新增 mode 字段实现多模式隔离，移除 useAdminApi 中的 sendAdminChatMessage 死代码。

## 文件变更清单
| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 修改 | src/types/sse.ts | ChatMessage 新增 `mode?: 'doctor' \| 'assistant' \| 'admin'` |
| 修改 | src/stores/chatStore.ts | 8 处消息构造点写入 mode 字段（sendMessage×2 / sendAssistantMessage×2 / sendAdminMessage×2 / dispatchSSEEvent×2） |
| 修改 | src/views/Admin.vue | 移除内联 SSE 三件套（parseSSEBuffer/readSSEStream/dispatchSSEEvent），handleSend 简化为 chatStore.sendAdminMessage；新增 adminMessages computed 过滤 mode === 'admin'；移除 ChatMessage/SSEEvent/sendAdminChatMessage 导入 |
| 修改 | src/composables/useAdminApi.ts | 移除 sendAdminChatMessage 函数（28-49 行，与 useChatApi.ts:97-118 完全重复），保留注释说明去向 |

## 编译验证
- vue-tsc -b：0 类型错误
- vite build：172 modules，✓ built in 392ms
- Admin.js 减小：9.09 kB → 6.83 kB（-25%，移除内联 SSE 代码）

## 设计偏差说明
- 无偏差。完全按 design v3 规格实现。

## 修订说明（v3 r1）
| 审查意见 | 修改措施 |
|---------|---------|
| — | 首轮产出（Agent 不可用，手动执行） |
