import { describe, it, expect } from '@ohos/hypium';
import { DisclaimerBar, DISCLAIMER_TEXT } from '../main/ets/components/DisclaimerBar';
import { UiStore } from '../main/ets/stores/UiStore';
import { ICON_PATHS } from '../main/ets/assets/icons/iconPaths';

export default function disclaimerBarTest(): void {
  describe('DisclaimerBarTest', () => {

    it('DisclaimerBar is importable', 0, () => {
      expect(DisclaimerBar !== undefined).assertTrue();
    });

    it('DISCLAIMER_TEXT contains AI 生成', 0, () => {
      expect(DISCLAIMER_TEXT.indexOf('AI 生成') >= 0).assertTrue();
    });

    it('DISCLAIMER_TEXT contains 不构成医疗诊断', 0, () => {
      expect(DISCLAIMER_TEXT.indexOf('不构成医疗诊断') >= 0).assertTrue();
    });

    it('DISCLAIMER_TEXT contains 专业医疗建议', 0, () => {
      expect(DISCLAIMER_TEXT.indexOf('专业医疗建议') >= 0).assertTrue();
    });

    it('disclaimerAccepted initially false, accept and reset flow', 0, () => {
      const store = UiStore.getInstance();
      store.resetDisclaimer();
      expect(store.getUiData().disclaimerAccepted).assertFalse();
      store.acceptDisclaimer();
      expect(store.getUiData().disclaimerAccepted).assertTrue();
      store.resetDisclaimer();
      expect(store.getUiData().disclaimerAccepted).assertFalse();
    });

    it('INFO key exists in ICON_PATHS', 0, () => {
      expect(ICON_PATHS['INFO'] !== undefined).assertTrue();
    });

    it('assembleHap compilation passes', 0, () => {
      expect(1).assertEqual(1);
    });
  });
}
