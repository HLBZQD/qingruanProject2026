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

export type SSEEvent = SSEMessageEvent | SSEMessageEndEvent | SSEErrorEvent;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
