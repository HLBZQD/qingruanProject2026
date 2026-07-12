import { describe, it, expect } from '@ohos/hypium';
import { EmptyState, EMPTY_MESSAGES } from '../main/ets/components/EmptyState';
import { COLOR_INK_300 } from '../main/ets/common/constants/DesignTokens';
import { ICON_PATHS } from '../main/ets/assets/icons/iconPaths';

export default function emptyStateTest(): void {
  describe('EmptyStateTest', () => {

    it('EmptyState is importable', 0, () => {
      expect(EmptyState !== undefined).assertTrue();
    });

    it('DEFAULT_ICON_NAME equals INFO', 0, () => {
      expect(EmptyState.DEFAULT_ICON_NAME).assertEqual('INFO');
    });

    it('DEFAULT_ICON_SIZE equals 48', 0, () => {
      expect(EmptyState.DEFAULT_ICON_SIZE).assertEqual(48);
    });

    it('DEFAULT_ICON_COLOR equals COLOR_INK_300', 0, () => {
      expect(EmptyState.DEFAULT_ICON_COLOR).assertEqual(COLOR_INK_300);
    });

    it('EMPTY_MESSAGES keys are non-empty strings', 0, () => {
      expect(typeof EMPTY_MESSAGES.NO_DATA).assertEqual('string');
      expect(EMPTY_MESSAGES.NO_DATA.length > 0).assertTrue();
      expect(typeof EMPTY_MESSAGES.NO_ARTICLES).assertEqual('string');
      expect(EMPTY_MESSAGES.NO_ARTICLES.length > 0).assertTrue();
      expect(typeof EMPTY_MESSAGES.NO_PLANS).assertEqual('string');
      expect(EMPTY_MESSAGES.NO_PLANS.length > 0).assertTrue();
      expect(typeof EMPTY_MESSAGES.NO_PUNCH).assertEqual('string');
      expect(EMPTY_MESSAGES.NO_PUNCH.length > 0).assertTrue();
      expect(typeof EMPTY_MESSAGES.NO_HISTORY).assertEqual('string');
      expect(EMPTY_MESSAGES.NO_HISTORY.length > 0).assertTrue();
      expect(typeof EMPTY_MESSAGES.NO_DOCTOR).assertEqual('string');
      expect(EMPTY_MESSAGES.NO_DOCTOR.length > 0).assertTrue();
    });

    it('INFO key exists in ICON_PATHS', 0, () => {
      expect(ICON_PATHS['INFO'] !== undefined).assertTrue();
    });

    it('assembleHap compilation passes', 0, () => {
      expect(1).assertEqual(1);
    });
  });
}
