import { describe, it, expect } from '@ohos/hypium';
import { LifePlanStore } from '../main/ets/stores/LifePlanStore';
import { LifePlanData } from '../main/ets/stores/LifePlanStore';
import { HttpClient } from '../main/ets/network/HttpClient';

function initializeLifePlanStore(): LifePlanStore {
  const httpClient = new HttpClient();
  return LifePlanStore.getInstance(httpClient);
}

export default function lifePlanStoreTest(): void {
  describe('LifePlanStoreTest', () => {
    it('getInstance 不传参抛出 Error', 0, () => {
      let caught: boolean = false;
      let errorMsg: string = '';
      try {
        LifePlanStore.getInstance();
      } catch (_e) {
        caught = true;
        errorMsg = (_e as Error).message;
      }
      expect(caught).assertTrue();
      expect(errorMsg.indexOf('HttpClient required') !== -1).assertTrue();
    });

    it('getInstance 传参返回同一引用', 0, () => {
      const inst1 = initializeLifePlanStore();
      const inst2 = LifePlanStore.getInstance();
      expect(inst1 === inst2).assertTrue();
    });

    it('LifePlanData plan_id 初始为 null', 0, () => {
      const ld = new LifePlanData();
      expect(ld.plan_id).assertNull();
    });

    it('LifePlanData diet_plans 初始为 []', 0, () => {
      const ld = new LifePlanData();
      expect(ld.diet_plans.length).assertEqual(0);
    });

    it('LifePlanData exercise_plans 初始为 []', 0, () => {
      const ld = new LifePlanData();
      expect(ld.exercise_plans.length).assertEqual(0);
    });

    it('LifePlanData other_plans 初始为 []', 0, () => {
      const ld = new LifePlanData();
      expect(ld.other_plans.length).assertEqual(0);
    });

    it('LifePlanData generated_at 初始为 null', 0, () => {
      const ld = new LifePlanData();
      expect(ld.generated_at).assertNull();
    });

    it('LifePlanData isLoading 初始为 false', 0, () => {
      const ld = new LifePlanData();
      expect(ld.isLoading).assertFalse();
    });

    it('LifePlanData isGenerating 初始为 false', 0, () => {
      const ld = new LifePlanData();
      expect(ld.isGenerating).assertFalse();
    });

    it('LifePlanData isAdjusting 初始为 false', 0, () => {
      const ld = new LifePlanData();
      expect(ld.isAdjusting).assertFalse();
    });

    it('LifePlanData errorMessage 初始为 null', 0, () => {
      const ld = new LifePlanData();
      expect(ld.errorMessage).assertNull();
    });

    it('fetchCurrentPlan 方法签名存在', 0, () => {
      expect(typeof (LifePlanStore.prototype as Record<string, Function>)['fetchCurrentPlan'])
        .assertEqual('function');
    });

    it('generatePlan 方法签名存在', 0, () => {
      expect(typeof (LifePlanStore.prototype as Record<string, Function>)['generatePlan'])
        .assertEqual('function');
    });

    it('adjustPlan 方法签名存在', 0, () => {
      expect(typeof (LifePlanStore.prototype as Record<string, Function>)['adjustPlan'])
        .assertEqual('function');
    });

    it('clearPlanData 方法签名存在', 0, () => {
      expect(typeof (LifePlanStore.prototype as Record<string, Function>)['clearPlanData'])
        .assertEqual('function');
    });

    it('getPlanId 方法签名存在', 0, () => {
      expect(typeof (LifePlanStore.prototype as Record<string, Function>)['getPlanId'])
        .assertEqual('function');
    });

    it('getDietPlans 方法签名存在', 0, () => {
      expect(typeof (LifePlanStore.prototype as Record<string, Function>)['getDietPlans'])
        .assertEqual('function');
    });

    it('getExercisePlans 方法签名存在', 0, () => {
      expect(typeof (LifePlanStore.prototype as Record<string, Function>)['getExercisePlans'])
        .assertEqual('function');
    });

    it('getOtherPlans 方法签名存在', 0, () => {
      expect(typeof (LifePlanStore.prototype as Record<string, Function>)['getOtherPlans'])
        .assertEqual('function');
    });

    it('getGeneratedAt 方法签名存在', 0, () => {
      expect(typeof (LifePlanStore.prototype as Record<string, Function>)['getGeneratedAt'])
        .assertEqual('function');
    });

    it('getErrorMessage 方法签名存在', 0, () => {
      expect(typeof (LifePlanStore.prototype as Record<string, Function>)['getErrorMessage'])
        .assertEqual('function');
    });

    it('isLoading 方法签名存在', 0, () => {
      expect(typeof (LifePlanStore.prototype as Record<string, Function>)['isLoading'])
        .assertEqual('function');
    });

    it('isGenerating 方法签名存在', 0, () => {
      expect(typeof (LifePlanStore.prototype as Record<string, Function>)['isGenerating'])
        .assertEqual('function');
    });

    it('isAdjusting 方法签名存在', 0, () => {
      expect(typeof (LifePlanStore.prototype as Record<string, Function>)['isAdjusting'])
        .assertEqual('function');
    });

    it('hasPlan 方法签名存在', 0, () => {
      expect(typeof (LifePlanStore.prototype as Record<string, Function>)['hasPlan'])
        .assertEqual('function');
    });

    it('isEmpty 方法签名存在', 0, () => {
      expect(typeof (LifePlanStore.prototype as Record<string, Function>)['isEmpty'])
        .assertEqual('function');
    });

    it('hasPlan 初始返回 false', 0, () => {
      const inst = initializeLifePlanStore();
      expect(inst.hasPlan()).assertFalse();
    });

    it('isEmpty 初始返回 true', 0, () => {
      const inst = initializeLifePlanStore();
      expect(inst.isEmpty()).assertTrue();
    });

    it('clearPlanData 复位全部字段', 0, () => {
      const inst = initializeLifePlanStore();
      const data = inst.getLifePlanData();
      data.plan_id = 1;
      data.diet_plans = [{ id: 1, plan_type: 'diet', order_num: 1, time_desc: 'morning', title: 'test', content: 'test' }];
      data.exercise_plans = [{ id: 2, plan_type: 'exercise', order_num: 1, time_desc: 'morning', title: 'test', content: 'test' }];
      data.other_plans = [{ id: 3, plan_type: 'other', order_num: 1, time_desc: 'morning', title: 'test', content: 'test' }];
      data.generated_at = '2025-01-01';
      data.isLoading = true;
      data.isGenerating = true;
      data.isAdjusting = true;
      data.errorMessage = 'test error';

      inst.clearPlanData();

      expect(data.plan_id).assertNull();
      expect(data.diet_plans.length).assertEqual(0);
      expect(data.exercise_plans.length).assertEqual(0);
      expect(data.other_plans.length).assertEqual(0);
      expect(data.generated_at).assertNull();
      expect(data.isLoading).assertFalse();
      expect(data.isGenerating).assertFalse();
      expect(data.isAdjusting).assertFalse();
      expect(data.errorMessage).assertNull();
    });

    it('getLifePlanData 返回同一引用', 0, () => {
      const inst = initializeLifePlanStore();
      const d1 = inst.getLifePlanData();
      const d2 = inst.getLifePlanData();
      expect(d1 === d2).assertTrue();
    });
  });
}
