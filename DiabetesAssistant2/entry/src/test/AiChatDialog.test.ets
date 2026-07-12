import { describe, it, expect } from '@ohos/hypium';
import { AiChatDialog } from '../main/ets/components/AiChatDialog';
import { ChatStore } from '../main/ets/stores/ChatStore';
import { UiStore } from '../main/ets/stores/UiStore';

export default function aiChatDialogTest(): void {
  describe('AiChatDialogTest', () => {

    it('组件可导入', 0, () => {
      expect(AiChatDialog !== undefined).assertTrue();
    });

    it('MODE_TITLES 值正确', 0, () => {
      expect(typeof AiChatDialog.MODE_TITLES['assistant'] === 'string').assertTrue();
      expect(AiChatDialog.MODE_TITLES['assistant'].length > 0).assertTrue();
      expect(typeof AiChatDialog.MODE_TITLES['doctor'] === 'string').assertTrue();
      expect(AiChatDialog.MODE_TITLES['doctor'].length > 0).assertTrue();
      expect(typeof AiChatDialog.MODE_TITLES['admin'] === 'string').assertTrue();
      expect(AiChatDialog.MODE_TITLES['admin'].length > 0).assertTrue();
    });

    it('MODE_WELCOME 值正确', 0, () => {
      expect(typeof AiChatDialog.MODE_WELCOME['assistant'] === 'string').assertTrue();
      expect((AiChatDialog.MODE_WELCOME['assistant'] as string).length > 0).assertTrue();
      expect(AiChatDialog.MODE_WELCOME['doctor']).assertNull();
      expect(AiChatDialog.MODE_WELCOME['admin']).assertNull();
    });

    it('模拟发送流程——用户消息写入并验证', 0, () => {
      const store = ChatStore.getInstance();
      try {
        store.sendMessage('assistant', '测试消息');
      } catch (_e) {
      }
      const msgs = store.getMessages('assistant');
      expect(msgs.length > 0).assertTrue();
      expect(msgs[msgs.length - 1].role === 'user').assertTrue();
    });

    it('parseNavigateIntent 正确', 0, () => {
      expect(ChatStore.parseNavigateIntent('[NAVIGATE:Risk]') === 'Risk').assertTrue();
    });

    it('UiStore 状态流转——activeChatKind 初始/显示/关闭', 0, () => {
      const store = UiStore.getInstance();
      store.resetState();
      expect(store.getUiData().activeChatKind).assertNull();

      store.showChatDialog('assistant');
      expect(store.getUiData().activeChatKind === 'assistant').assertTrue();

      store.closeChatDialog();
      expect(store.getUiData().activeChatKind).assertNull();
    });
  });
}
