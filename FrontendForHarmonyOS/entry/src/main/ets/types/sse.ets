declare type ESObject = Object;

export type ChatKind = 'doctor' | 'assistant' | 'admin';

export type SseEventType = 'message' | 'message_end' | 'error' | 'workflow_started' | 'workflow_finished' | 'agent_message' | 'agent_thought';

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
  event: 'workflow_started';
  workflow_run_id: string;
}

export interface SSEWorkflowFinishedEvent {
  event: 'workflow_finished';
  workflow_run_id: string;
}

export interface SSEAgentMessageEvent {
  event: 'agent_message';
  answer: string;
  conversation_id: string;
}

export interface SSEAgentThoughtEvent {
  event: 'agent_thought';
  thought: string;
  tool: string | null;
}

export interface SSEDispatchEvent {
  event: SseEventType;
  payload: Object;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  mode: ChatKind | null;
}

export interface ConversationHistoryItem {
  conversation_id: string;
  name: string;
  created_at: string;
}
