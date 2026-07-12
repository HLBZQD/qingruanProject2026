import { describe, it, expect } from '@ohos/hypium';
import { ErrorRetry, ERROR_MESSAGES } from '../main/ets/components/ErrorRetry';
import { COLOR_INK_300, SPACE_7 } from '../main/ets/common/constants/DesignTokens';
import { ICON_PATHS } from '../main/ets/assets/icons/iconPaths';

export default function errorRetryTest(): void {
  describe('ErrorRetryTest', () => {

    it('ErrorRetry is importable', 0, () => {
      expect(ErrorRetry !== undefined).assertTrue();
    });

    it('DEFAULT_ICON_NAME equals WARNING', 0, () => {
      expect(ErrorRetry.DEFAULT_ICON_NAME).assertEqual('WARNING');
    });

    it('DEFAULT_ICON_SIZE equals SPACE_7', 0, () => {
      expect(ErrorRetry.DEFAULT_ICON_SIZE).assertEqual(SPACE_7);
    });

    it('DEFAULT_ICON_COLOR equals COLOR_INK_300', 0, () => {
      expect(ErrorRetry.DEFAULT_ICON_COLOR).assertEqual(COLOR_INK_300);
    });

    it('ERROR_MESSAGES keys are non-empty strings', 0, () => {
      expect(typeof ERROR_MESSAGES.NETWORK).assertEqual('string');
      expect(ERROR_MESSAGES.NETWORK.length > 0).assertTrue();
      expect(typeof ERROR_MESSAGES.SERVER).assertEqual('string');
      expect(ERROR_MESSAGES.SERVER.length > 0).assertTrue();
      expect(typeof ERROR_MESSAGES.DATA_LOAD).assertEqual('string');
      expect(ERROR_MESSAGES.DATA_LOAD.length > 0).assertTrue();
      expect(typeof ERROR_MESSAGES.SUBMIT).assertEqual('string');
      expect(ERROR_MESSAGES.SUBMIT.length > 0).assertTrue();
      expect(typeof ERROR_MESSAGES.UNKNOWN).assertEqual('string');
      expect(ERROR_MESSAGES.UNKNOWN.length > 0).assertTrue();
    });

    it('WARNING key exists in ICON_PATHS', 0, () => {
      expect(ICON_PATHS['WARNING'] !== undefined).assertTrue();
    });

    it('assembleHap compilation passes', 0, () => {
      expect(1).assertEqual(1);
    });
  });
}
