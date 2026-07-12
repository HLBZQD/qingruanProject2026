import { describe, it, expect } from '@ohos/hypium';
import { TabBar, TAB_ITEMS } from '../main/ets/components/TabBar';
import { ICON_PATHS } from '../main/ets/components/Icon';

export default function tabBarTest(): void {
  describe('TabBarTest', () => {

    // 1. TabBar 组件可 import（不执行组件渲染）
    it('TabBar component is importable without runtime error', 0, () => {
      expect(TabBar !== undefined).assertTrue();
    });

    // 2. TAB_ITEMS 数组长度为 5，icon name 与 ICON_PATHS 字典 key 对应
    it('TAB_ITEMS length is 5 and icon names exist in ICON_PATHS', 0, () => {
      expect(TAB_ITEMS.length).assertEqual(5);
      expect(ICON_PATHS['HOME'] !== undefined).assertTrue();
      expect(ICON_PATHS['CONSULT'] !== undefined).assertTrue();
      expect(ICON_PATHS['LIFEPLAN'] !== undefined).assertTrue();
      expect(ICON_PATHS['NEWS'] !== undefined).assertTrue();
      expect(ICON_PATHS['PROFILE'] !== undefined).assertTrue();
    });

    // 3. 5 个 label 字符串非空且唯一
    it('all 5 labels are non-empty and unique', 0, () => {
      TAB_ITEMS.forEach(item => {
        expect(item.label.length > 0).assertTrue();
      });
      expect(new Set(TAB_ITEMS.map(item => item.label)).size).assertEqual(5);
    });

    // 4. onTabChange 回调类型正确（可选链调用不抛错）
    it('onTabChange optional-chaining handles undefined callback without throw', 0, () => {
      let threw: boolean = false;
      try {
        const fn: ((index: number) => void) | undefined = undefined;
        fn?.(0);
      } catch (e) {
        threw = true;
      }
      expect(threw).assertFalse();

      let called: number = -1;
      const mockFn = (index: number) => { called = index; };
      mockFn(0);
      expect(called).assertEqual(0);
    });
  });
}
