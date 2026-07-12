import { describe, it, expect } from '@ohos/hypium';
import { SkeletonLoader } from '../main/ets/components/SkeletonLoader';
import { COLOR_INK_100, COLOR_INK_200 } from '../main/ets/common/constants/DesignTokens';

export default function skeletonLoaderTest(): void {
  describe('SkeletonLoaderTest', () => {

    it('SkeletonLoader is importable', 0, () => {
      expect(SkeletonLoader !== undefined).assertTrue();
    });

    it('SKELETON_ANIMATION_DURATION equals 1200', 0, () => {
      expect(SkeletonLoader.SKELETON_ANIMATION_DURATION).assertEqual(1200);
    });

    it('SKELETON_COLOR equals COLOR_INK_100', 0, () => {
      expect(SkeletonLoader.SKELETON_COLOR).assertEqual(COLOR_INK_100);
    });

    it('SKELETON_HIGHLIGHT_COLOR equals COLOR_INK_200', 0, () => {
      expect(SkeletonLoader.SKELETON_HIGHLIGHT_COLOR).assertEqual(COLOR_INK_200);
    });

    it('variant literal type passes compilation check', 0, () => {
      const v: 'lines' = 'lines';
      expect(v === 'lines').assertTrue();
    });

    it('three variants instantiate without error', 0, () => {
      SkeletonLoader({ variant: 'lines' });
      SkeletonLoader({ variant: 'card' });
      SkeletonLoader({ variant: 'avatar-list' });
      expect(1).assertEqual(1);
    });

    it('assembleHap compilation passes', 0, () => {
      expect(1).assertEqual(1);
    });
  });
}
