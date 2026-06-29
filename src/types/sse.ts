export interface SSEMessageEvent {
  event: 'message';
  answer: string;
  conversation_id: string;
  message_id: string;
  created_at: number;
}

export interface SSEMessageEndEvent {
  event: 'message_end';
  conversation_id: string;
  message_id: string;
  created_at: number;
}

export interface SSEErrorEvent {
  event: 'error';
  message: string;
  code: string;
}

export interface SSEWorkflowStartedEvent {
  event: 'workflow_started'
  workflow_run_id: string
}

export interface SSEWorkflowFinishedEvent {
  event: 'workflow_finished'
  workflow_run_id: string
}

export interface SSEAgentMessageEvent {
  event: 'agent_message'
  answer: string
  conversation_id: string
}

export interface SSEAgentThoughtEvent {
  event: 'agent_thought'
  thought: string
  tool?: string
}

export type SSEEvent =
  | SSEMessageEvent
  | SSEMessageEndEvent
  | SSEErrorEvent
  | SSEWorkflowStartedEvent
  | SSEWorkflowFinishedEvent
  | SSEAgentMessageEvent
  | SSEAgentThoughtEvent

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/**
 * Dify 历史会话列表项。
 *
 * 来源：后端 GET /api/chat/doctor/:id/conversations 和
 *       GET /api/assistant/conversations 响应 data 数组元素。
 *
 * 字段对齐 callDifyGetConversations 映射（server/services/difyService.js:134-166）：
 *   conversation_id ← item.id（Dify 返回的 UUID）
 *   name            ← item.name（用户输入的第一条消息摘要作为会话名称）
 *   created_at      ← 映射为 ISO 字符串（new Date(item.created_at * 1000).toISOString()）
 */
export interface ConversationHistoryItem {
  /** Dify 会话 UUID（恢复会话时作为 conversation_id 参数传入 sendChatMessage） */
  conversation_id: string
  /** 会话名称（Dify 自动生成，通常为用户第一条消息摘要） */
  name: string
  /** 会话创建时间 ISO 8601 字符串（如 "2026-06-29T10:30:00.000Z"） */
  created_at: string
}
