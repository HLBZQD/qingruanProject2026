import { describe, it, expect } from '@ohos/hypium';
import { UiStore, UiData, ToastItem } from '../main/ets/stores/UiStore';

export default function uiStoreTest(): void {
  describe('UiStoreTest', () => {

    it('getInstance 返回同一引用', 0, () => {
      const inst1 = UiStore.getInstance();
      const inst2 = UiStore.getInstance();
      expect(inst1 === inst2).assertTrue();
    });

    it('UiData fabVisible 初始为 false', 0, () => {
      const ud = new UiData();
      expect(ud.fabVisible).assertFalse();
    });

    it('UiData activeChatKind 初始为 null', 0, () => {
      const ud = new UiData();
      expect(ud.activeChatKind).assertNull();
    });

    it('UiData isLoadingGlobal 初始为 false', 0, () => {
      const ud = new UiData();
      expect(ud.isLoadingGlobal).assertFalse();
    });

    it('UiData toastQueue 初始为 []', 0, () => {
      const ud = new UiData();
      expect(ud.toastQueue.length).assertEqual(0);
    });

    it('UiData disclaimerAccepted 初始为 false', 0, () => {
      const ud = new UiData();
      expect(ud.disclaimerAccepted).assertFalse();
    });

    it('UiData forceChangePasswordVisible 初始为 false', 0, () => {
      const ud = new UiData();
      expect(ud.forceChangePasswordVisible).assertFalse();
    });

    it('UiData setFabVisibleCallback 初始为 null', 0, () => {
      const ud = new UiData();
      expect(ud.setFabVisibleCallback).assertNull();
    });

    it('UiData errorMessage 初始为 null', 0, () => {
      const ud = new UiData();
      expect(ud.errorMessage).assertNull();
    });

    it('getUiData 返回 UiData 实例', 0, () => {
      const store = UiStore.getInstance();
      const uiData = store.getUiData();
      expect(uiData instanceof UiData).assertTrue();
    });

    it('setFabVisible 更新 fabVisible 为 true', 0, () => {
      const store = UiStore.getInstance();
      store.setFabVisible(true);
      expect(store.getUiData().fabVisible).assertTrue();
      store.setFabVisible(false);
    });

    it('showChatDialog 设置 activeChatKind 且 fabVisible 为 false', 0, () => {
      const store = UiStore.getInstance();
      store.setFabVisible(true);
      store.showChatDialog('assistant');
      expect(store.getUiData().activeChatKind === 'assistant').assertTrue();
      expect(store.getUiData().fabVisible).assertFalse();
    });

    it('showChatDialog 切换 kind 从 assistant 到 doctor', 0, () => {
      const store = UiStore.getInstance();
      store.showChatDialog('assistant');
      store.showChatDialog('doctor');
      expect(store.getUiData().activeChatKind === 'doctor').assertTrue();
      expect(store.getUiData().fabVisible).assertFalse();
    });

    it('closeChatDialog 置 activeChatKind 为 null', 0, () => {
      const store = UiStore.getInstance();
      store.showChatDialog('assistant');
      store.closeChatDialog();
      expect(store.getUiData().activeChatKind).assertNull();
    });

    it('showGlobalLoading / hideGlobalLoading 状态切换', 0, () => {
      const store = UiStore.getInstance();
      store.showGlobalLoading();
      expect(store.getUiData().isLoadingGlobal).assertTrue();
      store.hideGlobalLoading();
      expect(store.getUiData().isLoadingGlobal).assertFalse();
    });

    it('showToast / dismissToast 队列断言', 0, () => {
      const store = UiStore.getInstance();
      store.showToast('msg1', 'info');
      expect(store.getUiData().toastQueue.length).assertEqual(1);
      expect(store.getUiData().toastQueue[0].message === 'msg1').assertTrue();
      expect(store.getUiData().toastQueue[0].type === 'info').assertTrue();

      store.showToast('msg2', 'error');
      expect(store.getUiData().toastQueue.length).assertEqual(2);
      expect(store.getUiData().toastQueue[0].message === 'msg1').assertTrue();
      expect(store.getUiData().toastQueue[1].message === 'msg2').assertTrue();

      const firstId: string = store.getUiData().toastQueue[0].id;
      store.dismissToast(firstId);
      expect(store.getUiData().toastQueue.length).assertEqual(1);
      expect(store.getUiData().toastQueue[0].message === 'msg2').assertTrue();
    });

    it('showToast 队列上限 5', 0, () => {
      const store = UiStore.getInstance();
      for (let i = 0; i < 7; i++) {
        store.showToast('msg' + String(i));
      }
      expect(store.getUiData().toastQueue.length).assertEqual(5);
    });

    it('acceptDisclaimer / resetDisclaimer 状态切换', 0, () => {
      const store = UiStore.getInstance();
      store.acceptDisclaimer();
      expect(store.getUiData().disclaimerAccepted).assertTrue();
      store.resetDisclaimer();
      expect(store.getUiData().disclaimerAccepted).assertFalse();
    });

    it('showChangePasswordDialog / hideChangePasswordDialog 状态切换', 0, () => {
      const store = UiStore.getInstance();
      store.showChangePasswordDialog();
      expect(store.getUiData().forceChangePasswordVisible).assertTrue();
      store.hideChangePasswordDialog();
      expect(store.getUiData().forceChangePasswordVisible).assertFalse();
    });

    it('setErrorMessage 写入与清除', 0, () => {
      const store = UiStore.getInstance();
      store.setErrorMessage('err');
      expect(store.getUiData().errorMessage === 'err').assertTrue();
      store.setErrorMessage(null);
      expect(store.getUiData().errorMessage).assertNull();
    });

    it('registerFabCallback 回调在 setFabVisible 时被调用', 0, () => {
      const store = UiStore.getInstance();
      let called: number = 0;
      let calledWith: boolean | null = null;
      store.registerFabCallback((visible: boolean) => {
        called++;
        calledWith = visible;
      });
      store.setFabVisible(true);
      expect(called).assertEqual(1);
      expect(calledWith === true).assertTrue();
    });

    it('resetState 全部复位', 0, () => {
      const store = UiStore.getInstance();
      store.setFabVisible(true);
      store.showChatDialog('assistant');
      store.showGlobalLoading();
      store.showToast('test');
      store.acceptDisclaimer();
      store.showChangePasswordDialog();
      store.setErrorMessage('err');
      store.registerFabCallback((_visible: boolean) => {});
      store.resetState();

      expect(store.getUiData().fabVisible).assertFalse();
      expect(store.getUiData().activeChatKind).assertNull();
      expect(store.getUiData().isLoadingGlobal).assertFalse();
      expect(store.getUiData().toastQueue.length).assertEqual(0);
      expect(store.getUiData().disclaimerAccepted).assertFalse();
      expect(store.getUiData().forceChangePasswordVisible).assertFalse();
      expect(store.getUiData().errorMessage).assertNull();
      expect(store.getUiData().setFabVisibleCallback).assertNull();
    });
  });
}
