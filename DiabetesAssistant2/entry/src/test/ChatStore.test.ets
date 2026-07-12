import { describe, it, expect } from '@ohos/hypium';
import { ChatStore } from '../main/ets/stores/ChatStore';
import { AuthStore } from '../main/ets/stores/AuthStore';
import { PreferencesManager } from '../main/ets/common/persistence/PreferencesManager';
import { ChatKind } from '../main/ets/types/sse';
import { SseClient } from '../main/ets/network/SseClient';

function getOrCreatePreferencesManager(): PreferencesManager {
  const existing = PreferencesManager.getInstance();
  if (existing !== null) {
    return existing;
  }
  const mockContext: Object = {
    area: 0,
    eventHub: {},
    resourceManager: {},
  };
  const inst = PreferencesManager.getInstance(mockContext as
    import('@kit.AbilityKit').common.Context);
  return inst!;
}

function initializeChatStore(): ChatStore {
  const mgr = getOrCreatePreferencesManager();
  const authStore = AuthStore.getInstance();
  return ChatStore.getInstance(authStore, mgr);
}

export default function chatStoreTest(): void {
  describe('ChatStoreTest', () => {
    it('getInstance 首次不传参抛出 Error', 0, () => {
      let caught = false;
      try {
        ChatStore.getInstance();
      } catch (_e) {
        caught = true;
      }
      expect(caught).assertTrue();
    });

    it('getInstance 首次传参返回非 null', 0, () => {
      const mgr = getOrCreatePreferencesManager();
      const authStore = AuthStore.getInstance();
      const inst = ChatStore.getInstance(authStore, mgr);
      expect(inst).assertNotNull();
    });

    it('getInstance 再次调用返回同一引用', 0, () => {
      const mgr = getOrCreatePreferencesManager();
      const authStore = AuthStore.getInstance();
      const inst1 = ChatStore.getInstance(authStore, mgr);
      const inst2 = ChatStore.getInstance();
      expect(inst1 === inst2).assertTrue();
    });

    it('sendMessage 方法签名存在', 0, () => {
      expect(typeof (ChatStore.prototype as Record<string, Function>)['sendMessage'])
        .assertEqual('function');
    });

    it('registerRequest 方法签名存在', 0, () => {
      expect(typeof (ChatStore.prototype as Record<string, Function>)['registerRequest'])
        .assertEqual('function');
    });

    it('abortActiveConnection 方法签名存在', 0, () => {
      expect(typeof (ChatStore.prototype as Record<string, Function>)['abortActiveConnection'])
        .assertEqual('function');
    });

    it('clearMessages 方法签名存在', 0, () => {
      expect(typeof (ChatStore.prototype as Record<string, Function>)['clearMessages'])
        .assertEqual('function');
    });

    it('clearAll 方法签名存在', 0, () => {
      expect(typeof (ChatStore.prototype as Record<string, Function>)['clearAll'])
        .assertEqual('function');
    });

    it('syncConversationIds 方法签名存在', 0, () => {
      expect(typeof (ChatStore.prototype as Record<string, Function>)['syncConversationIds'])
        .assertEqual('function');
    });

    it('parseNavigateIntent("[NAVIGATE:Risk]") 返回 "Risk"', 0, () => {
      expect(ChatStore.parseNavigateIntent('[NAVIGATE:Risk]')).assertEqual('Risk');
    });

    it('parseNavigateIntent("普通文本") 返回 null', 0, () => {
      expect(ChatStore.parseNavigateIntent('普通文本')).assertNull();
    });

    it('parseNavigateIntent("") 返回 null', 0, () => {
      expect(ChatStore.parseNavigateIntent('')).assertNull();
    });

    it('parseNavigateIntent("[NAVIGATE]") 返回 null', 0, () => {
      expect(ChatStore.parseNavigateIntent('[NAVIGATE]')).assertNull();
    });

    it('parseNavigateIntent("[NAVIGATE:Risk] 其他文本") 返回 "Risk"', 0, () => {
      expect(ChatStore.parseNavigateIntent('[NAVIGATE:Risk] 其他文本')).assertEqual('Risk');
    });

    it('getMessages 初始返回空数组', 0, () => {
      const inst = ChatStore.getInstance();
      expect(inst.getMessages('doctor').length).assertEqual(0);
    });

    it('ChatKind 类型可正常 import', 0, () => {
      const kind: ChatKind = 'doctor';
      expect(kind).assertEqual('doctor');
    });

    it('generateId 原型链上存在且返回非空字符串', 0, () => {
      expect(typeof (ChatStore.prototype as Record<string, Function>)['generateId'])
        .assertEqual('function');
      const inst = initializeChatStore();
      const id = (inst as Record<string, Function>)['generateId']();
      expect(typeof id === 'string' && (id as string).length > 0).assertTrue();
    });

    it('SseClient 依赖 tokenProvider 闭包可正常创建', 0, () => {
      const authStore = AuthStore.getInstance();
      const client = new SseClient({
        tokenProvider: () => authStore.token,
        callbacks: {}
      });
      expect(client).assertNotNull();
      client.destroy();
    });
  });
}
