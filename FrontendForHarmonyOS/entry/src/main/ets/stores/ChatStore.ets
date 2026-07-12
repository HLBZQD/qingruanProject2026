import { ChatMessage, ChatKind, SSEMessageEvent, SSEMessageEndEvent, SSEErrorEvent } from '../types/sse';
import { SseClient, SseCallbacks } from '../network/SseClient';
import { AuthStore } from './AuthStore';
import { STORAGE_KEYS, PreferencesManager } from '../common/persistence/PreferencesManager';
import { API_CHAT_DOCTOR_ID, API_ASSISTANT_CHAT, API_ADMIN_CHAT } from '../common/constants/ApiEndpoints';

declare type ESObject = Object;

const CONVERSATION_ID_PREFIX = 'chat_conversation_id_';

export interface SendMessageOptions {
  doctorId?: number;
  redirect?: string;
}

interface ChatRequestBody {
  message: string;
  conversation_id?: string;
}

@ObservedV2
export class ChatSession {
  @Trace messages: ChatMessage[];
  @Trace conversationId: string;
  @Trace isLoading: boolean;
  @Trace errorMessage: string | null;
  @Trace errorCode: string | null;

  constructor() {
    this.messages = [];
    this.conversationId = '';
    this.isLoading = false;
    this.errorMessage = null;
    this.errorCode = null;
  }
}

class ChatStore {
  private static instance: ChatStore | null = null;
  private authStore: AuthStore;
  private prefsManager: PreferencesManager;
  private sessions: Map<ChatKind, ChatSession>;
  private activeKind: ChatKind | null;
  private activeClient: SseClient | null;
  private listeners: Array<(kind: ChatKind) => void>;
  private streamBuffers: Map<ChatKind, string>;

  private constructor(authStore: AuthStore, prefsManager: PreferencesManager) {
    this.authStore = authStore;
    this.prefsManager = prefsManager;
    this.activeKind = null;
    this.activeClient = null;
    this.listeners = [];
    this.streamBuffers = new Map<ChatKind, string>();
    this.sessions = new Map<ChatKind, ChatSession>();
    this.sessions.set('doctor', new ChatSession());
    this.sessions.set('assistant', new ChatSession());
    this.sessions.set('admin', new ChatSession());
  }

  static getInstance(authStore?: AuthStore, prefsManager?: PreferencesManager): ChatStore {
    if (ChatStore.instance !== null) {
      return ChatStore.instance;
    }
    if (authStore === undefined || prefsManager === undefined) {
      throw new Error('ChatStore: AuthStore and PreferencesManager required for first initialization');
    }
    ChatStore.instance = new ChatStore(authStore, prefsManager);
    return ChatStore.instance;
  }

  getMessages(kind: ChatKind): ChatMessage[] {
    return this.sessions.get(kind)!.messages;
  }

  getConversationId(kind: ChatKind): string {
    return this.sessions.get(kind)!.conversationId;
  }

  isLoading(kind: ChatKind): boolean {
    return this.sessions.get(kind)!.isLoading;
  }

  getError(kind: ChatKind): string | null {
    return this.sessions.get(kind)!.errorMessage;
  }

  getErrorCode(kind: ChatKind): string | null {
    return this.sessions.get(kind)!.errorCode;
  }

  isAuthError(kind: ChatKind): boolean {
    const code = this.sessions.get(kind)!.errorCode;
    return code === 'AUTH_EXPIRED' || code === 'AUTH_INVALID';
  }

  getSession(kind: ChatKind): ChatSession {
    return this.sessions.get(kind)!;
  }

  subscribe(listener: (kind: ChatKind) => void): void {
    this.listeners.push(listener);
  }

  unsubscribe(listener: (kind: ChatKind) => void): void {
    const idx = this.listeners.indexOf(listener);
    if (idx >= 0) {
      this.listeners.splice(idx, 1);
    }
  }

  private notifyListeners(kind: ChatKind): void {
    const arr = this.listeners;
    for (let i = 0; i < arr.length; i++) {
      arr[i](kind);
    }
  }

  sendMessage(kind: ChatKind, text: string, opts?: SendMessageOptions): void {
    if (kind === 'doctor' && (!opts || opts.doctorId === undefined || opts.doctorId === null)) {
      throw new Error('ChatStore: doctorId is required for doctor chat');
    }

    const session = this.getSession(kind);
    session.errorMessage = null;
    session.errorCode = null;
    this.streamBuffers.set(kind, '');
    const newMsgs: ChatMessage[] = [...session.messages];
    newMsgs.push({
      id: this.generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      mode: kind
    });
    session.messages = newMsgs;

    if (this.activeKind !== null) {
      this.abortActiveConnection();
    }

    let client: SseClient;
    if (kind === 'doctor') {
      client = this.sendDoctorMessage(text, opts!.doctorId!);
    } else if (kind === 'assistant') {
      client = this.sendAssistantMessage(text, opts?.redirect);
    } else {
      client = this.sendAdminMessage(text);
    }

    this.registerRequest(kind, client);

    this.notifyListeners(kind);

    let endpoint: string;
    let body: ChatRequestBody;
    if (kind === 'doctor') {
      endpoint = API_CHAT_DOCTOR_ID(opts!.doctorId!);
      body = { message: text } as ChatRequestBody;
    } else if (kind === 'assistant') {
      endpoint = API_ASSISTANT_CHAT;
      const cid: string = this.getConversationId(kind);
      body = cid !== '' ? { message: text, conversation_id: cid } as ChatRequestBody
        : { message: text } as ChatRequestBody;
    } else {
      endpoint = API_ADMIN_CHAT;
      body = { message: text } as ChatRequestBody;
    }

    client.start(endpoint, body);
  }

  abortActiveConnection(): void {
    if (this.activeKind !== null) {
      this.activeClient?.destroy();
      this.activeClient = null;
      const session = this.sessions.get(this.activeKind);
      if (session !== undefined) {
        session.isLoading = false;
      }
      this.activeKind = null;
    }
  }

  clearMessages(kind: ChatKind): void {
    const session = this.sessions.get(kind);
    if (session !== undefined) {
      session.messages = [];
      session.errorMessage = null;
    }
    this.notifyListeners(kind);
  }

  clearAll(): void {
    this.sessions.forEach((session: ChatSession) => {
      session.messages = [];
      session.conversationId = '';
      session.errorMessage = null;
    });
    this.abortActiveConnection();
  }

  async syncConversationIds(): Promise<void> {
    const kinds: ChatKind[] = ['doctor', 'assistant', 'admin'];
    for (let i = 0; i < kinds.length; i++) {
      const kind = kinds[i];
      const id = await this.prefsManager.getString(STORAGE_KEYS.NAME_CHAT, CONVERSATION_ID_PREFIX + kind, '');
      const session = this.sessions.get(kind);
      if (session !== undefined) {
        session.conversationId = id;
      }
    }
  }

  static parseNavigateIntent(content: string): string | null {
    const match = content.match(/\[NAVIGATE:([^\]]+)\]/);
    if (match !== null && match.length >= 2) {
      return match[1];
    }
    return null;
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
  }

  private createSseCallbacks(kind: ChatKind): SseCallbacks {
    return {
      onMessage: (ev: SSEMessageEvent) => {
        const session = this.sessions.get(kind);
        if (session === undefined) {
          return;
        }
        const prevRaw: string = this.streamBuffers.get(kind) ?? '';
        const raw: string = prevRaw + (ev.answer ?? '');
        this.streamBuffers.set(kind, raw);
        const cleanContent = SseClient.stripThinkTag(raw);
        console.info('[ChatStore] 收到 answer 增量: "' + (ev.answer ?? '') + '" | 累计内容: ' + cleanContent);
        const lastIdx = session.messages.length - 1;
        const newMsg: ChatMessage = {
          id: ev.message_id,
          role: 'assistant',
          content: cleanContent,
          timestamp: ev.created_at,
          mode: kind
        };
        if (lastIdx >= 0 && session.messages[lastIdx].role === 'assistant') {
          const updated: ChatMessage[] = [...session.messages];
          updated[lastIdx] = newMsg;
          session.messages = updated;
        } else {
          session.messages = [...session.messages, newMsg];
        }
        this.notifyListeners(kind);
      },
      onMessageEnd: (ev: SSEMessageEndEvent) => {
        const session = this.sessions.get(kind);
        if (session === undefined) {
          return;
        }
        console.info('[ChatStore] 回复结束 message_end, 最终内容: ' + SseClient.stripThinkTag(this.streamBuffers.get(kind) ?? ''));
        this.streamBuffers.set(kind, '');
        session.conversationId = ev.conversation_id;
        this.prefsManager.putString(STORAGE_KEYS.NAME_CHAT, CONVERSATION_ID_PREFIX + kind, ev.conversation_id);
        session.isLoading = false;
        this.notifyListeners(kind);
      },
      onError: (ev: SSEErrorEvent) => {
        const session = this.sessions.get(kind);
        if (session === undefined) {
          return;
        }
        console.info('[ChatStore] 收到 error 事件: ' + (ev.message ?? ''));
        this.streamBuffers.set(kind, '');
        session.errorMessage = ev.message ?? '连接中断，请手动重试';
        session.errorCode = ev.code ?? null;
        session.isLoading = false;
        this.notifyListeners(kind);
      },
      onComplete: () => {
        const session = this.sessions.get(kind);
        if (session !== undefined) {
          session.isLoading = false;
        }
        this.notifyListeners(kind);
      }
    };
  }

  private registerRequest(kind: ChatKind, client: SseClient): void {
    if (this.activeKind !== null && this.activeKind !== kind) {
      this.activeClient?.destroy();
    }
    this.activeClient = client;
    this.activeKind = kind;
    const session = this.sessions.get(kind);
    if (session !== undefined) {
      session.isLoading = true;
    }
  }

  private sendDoctorMessage(text: string, doctorId: number): SseClient {
    return new SseClient({
      tokenProvider: () => this.authStore.token,
      callbacks: this.createSseCallbacks('doctor')
    });
  }

  private sendAssistantMessage(text: string, redirect?: string): SseClient {
    return new SseClient({
      tokenProvider: () => this.authStore.token,
      callbacks: this.createSseCallbacks('assistant')
    });
  }

  private sendAdminMessage(text: string): SseClient {
    return new SseClient({
      tokenProvider: () => this.authStore.token,
      callbacks: this.createSseCallbacks('admin')
    });
  }
}

export { ChatStore };
