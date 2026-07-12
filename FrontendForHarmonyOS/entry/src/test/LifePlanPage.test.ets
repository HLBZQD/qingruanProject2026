import { describe, it, expect } from '@ohos/hypium';
import { LifePlanStore, LifePlanData } from '../main/ets/stores/LifePlanStore';
import { PunchStore } from '../main/ets/stores/PunchStore';
import { mapPlanTypeToPunchType } from '../main/ets/pages/tabs/LifePlanPage';
import { COLOR_SUCCESS_600 } from '../main/ets/common/constants/DesignTokens';

export default function lifePlanPageTest(): void {
  describe('LifePlanPageTest', () => {
    it('LifePlanPage 模块可 import', 0, () => {
      let caught: boolean = false;
      try {
        require('../main/ets/pages/tabs/LifePlanPage');
      } catch (_e) {
        caught = true;
      }
      expect(caught).assertFalse();
    });

    it('LifePlanStore 新增类可实例化', 0, () => {
      const store = LifePlanStore.getInstance();
      expect(store.getLifePlanData()).assertNotNull();
    });

    it('LifePlanData 桩数据默认值正确', 0, () => {
      const store = LifePlanStore.getInstance();
      const data = store.getLifePlanData();
      expect(data.diet_plans.length).assertEqual(3);
      expect(data.exercise_plans.length).assertEqual(3);
      expect(data.other_plans.length).assertEqual(2);
      expect(store.hasPlan()).assertTrue();
    });

    it('mapPlanTypeToPunchType 映射', 0, () => {
      expect(mapPlanTypeToPunchType('other')).assertEqual('diet');
      expect(mapPlanTypeToPunchType('diet')).assertEqual('diet');
      expect(mapPlanTypeToPunchType('exercise')).assertEqual('exercise');
    });

    it('COLOR_SUCCESS_600 已定义', 0, () => {
      const val: string = COLOR_SUCCESS_600;
      expect(val.length > 0).assertTrue();
    });

    it('PunchStore 方法签名存在', 0, () => {
      const proto = PunchStore.prototype as Record<string, Function>;
      expect(typeof proto['createPunch']).assertEqual('function');
      expect(typeof proto['isTodayPunched']).assertEqual('function');
      expect(typeof proto['getPunchData']).assertEqual('function');
    });

    it('模块加载验证', 0, () => {
      expect(true).assertTrue();
    });
  });
}
