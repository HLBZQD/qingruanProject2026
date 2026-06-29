# 详细设计（v3）

## 概述
D3 — Admin.vue SSE 逻辑统一，将 Admin.vue 内联 SSE 三件套（parseSSEBuffer/readSSEStream/dispatchSSEEvent）替换为 chatStore.sendAdminMessage 统一调用，新增 ChatMessage.mode 字段实现多模式消息隔离。

## 文件规划
| 文件路径 | 操作 | 职责 |
|---------|------|------|
| src/types/sse.ts | 修改 | ChatMessage 新增可选 mode 字段 |
| src/stores/chatStore.ts | 修改 | 所有消息构造点写入 mode 字段 |
| src/views/Admin.vue | 修改 | 移除内联 SSE，改调 chatStore.sendAdminMessage |
| src/composables/useAdminApi.ts | 修改 | 移除 sendAdminChatMessage 死代码 |

## 类型定义

### ChatMessage.mode（新增字段）
**形态**：可选属性  
**职责**：区分 doctor/assistant/admin 三种对话场景，用于 Admin.vue 多模式消息过滤  
**类型签名**：`mode?: 'doctor' | 'assistant' | 'admin'`

## 行为契约

1. sendMessage/sendMessageWithRetry 构造的 userMessage / failMsg → mode = 'doctor'
2. sendAssistantMessage 构造的 userMessage / failMsg → mode = 'assistant'  
3. sendAdminMessage 构造的 userMessage / failMsg → mode = 'admin'
4. dispatchSSEEvent 中创建的 assistant/error 消息 → mode = activeChatMode.value
5. Admin.vue adminMessages computed 过滤 mode === 'admin' 的消息
6. Admin.vue handleSend 简化为调用 chatStore.sendAdminMessage(text, token)，取消内联 SSE/401/错误处理
7. useAdminApi.sendAdminChatMessage 移除（死代码），已有 useChatApi.sendAdminChatMessage 供 chatStore 使用

## 修订说明（v3 r1）
| 审查意见 | 修改措施 |
|---------|---------|
| — | 首轮产出，无审查反馈 |
