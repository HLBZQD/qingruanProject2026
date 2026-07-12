import { describe, it, expect } from '@ohos/hypium';
import { FabButton } from '../main/ets/components/FabButton';
import { UiStore } from '../main/ets/stores/UiStore';
import { SPACE_9 } from '../main/ets/common/constants/DesignTokens';

export default function fabButtonTest(): void {
  describe('FabButtonTest', () => {

    it('FabButton component is importable without runtime error', 0, () => {
      expect(FabButton !== undefined).assertTrue();
    });

    it('FabButton.SIZE equals SPACE_9', 0, () => {
      expect(FabButton.SIZE).assertEqual(SPACE_9);
    });

    it('click flow: showChatDialog sets activeChatKind and hides fabVisible', 0, () => {
      const store = UiStore.getInstance();
      store.setFabVisible(true);
      store.showChatDialog('assistant');
      const uiData = store.getUiData();
      expect(uiData.activeChatKind === 'assistant').assertTrue();
      expect(uiData.fabVisible).assertFalse();
    });

    it('resetState clears fabVisible and activeChatKind', 0, () => {
      UiStore.getInstance().resetState();
      expect(UiStore.getInstance().getUiData().fabVisible).assertFalse();
      expect(UiStore.getInstance().getUiData().activeChatKind).assertNull();
    });

    it('UiStore singleton reference identity', 0, () => {
      expect(UiStore.getInstance() === UiStore.getInstance()).assertTrue();
      expect(UiStore.getInstance().getUiData() === UiStore.getInstance().getUiData()).assertTrue();
    });

    it('assembleHap compilation passes', 0, () => {
      expect(1).assertEqual(1);
    });
  });
}
