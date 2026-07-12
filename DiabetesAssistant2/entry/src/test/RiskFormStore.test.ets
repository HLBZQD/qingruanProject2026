import { describe, it, expect } from '@ohos/hypium';
import { RiskFormStore, RiskFormData, RiskFormBackup } from '../main/ets/stores/RiskFormStore';
import { AuthStore } from '../main/ets/stores/AuthStore';
import { PreferencesManager } from '../main/ets/common/persistence/PreferencesManager';

function getOrCreatePreferencesManager(): PreferencesManager {
  const existing = PreferencesManager.getInstance();
  if (existing !== null) {
    return existing;
  }
  const mockContext: Object = {
    area: 0,
    eventHub: {},
    resourceManager: {},
  };
  const inst = PreferencesManager.getInstance(mockContext as
    import('@kit.AbilityKit').common.Context);
  return inst!;
}

function initializeRiskFormStore(): RiskFormStore {
  const mgr = getOrCreatePreferencesManager();
  const authStore = AuthStore.getInstance();
  return RiskFormStore.getInstance(authStore, mgr);
}

export default function riskFormStoreTest(): void {
  describe('RiskFormStoreTest', () => {
    it('getInstance 首次不传参抛出 Error', 0, () => {
      let caught: boolean = false;
      try {
        RiskFormStore.getInstance();
      } catch (_e) {
        caught = true;
      }
      expect(caught).assertTrue();
    });

    it('getInstance 首次传参返回非 null', 0, () => {
      const inst = initializeRiskFormStore();
      expect(inst).assertNotNull();
    });

    it('getInstance 再次调用返回同一引用', 0, () => {
      const inst1 = initializeRiskFormStore();
      const inst2 = RiskFormStore.getInstance();
      expect(inst1 === inst2).assertTrue();
    });

    it('getFormData 返回非 null 的 RiskFormData 实例', 0, () => {
      const inst = initializeRiskFormStore();
      expect(inst.getFormData()).assertNotNull();
    });

    it('getCurrentStep 初始返回 0', 0, () => {
      const inst = initializeRiskFormStore();
      expect(inst.getCurrentStep()).assertEqual(0);
    });

    it('getSubmitResult 初始返回 null', 0, () => {
      const inst = initializeRiskFormStore();
      expect(inst.getSubmitResult()).assertNull();
    });

    it('getHistory 初始返回空数组', 0, () => {
      const inst = initializeRiskFormStore();
      expect(inst.getHistory().length).assertEqual(0);
    });

    it('getErrorMessage 初始返回 null', 0, () => {
      const inst = initializeRiskFormStore();
      expect(inst.getErrorMessage()).assertNull();
    });

    it('saveStep 方法签名存在', 0, () => {
      expect(typeof (RiskFormStore.prototype as Record<string, Function>)['saveStep'])
        .assertEqual('function');
    });

    it('submit 方法签名存在', 0, () => {
      expect(typeof (RiskFormStore.prototype as Record<string, Function>)['submit'])
        .assertEqual('function');
    });

    it('loadHistory 方法签名存在', 0, () => {
      expect(typeof (RiskFormStore.prototype as Record<string, Function>)['loadHistory'])
        .assertEqual('function');
    });

    it('clearFormData 方法签名存在', 0, () => {
      expect(typeof (RiskFormStore.prototype as Record<string, Function>)['clearFormData'])
        .assertEqual('function');
    });

    it('restoreFromBackup 方法签名存在', 0, () => {
      expect(typeof (RiskFormStore.prototype as Record<string, Function>)['restoreFromBackup'])
        .assertEqual('function');
    });

    it('saveStep 更新字段值', 0, () => {
      const inst = initializeRiskFormStore();
      inst.saveStep(1, { age: 30 } as RiskFormBackup);
      expect(inst.getFormData().age).assertEqual(30);
    });

    it('saveStep 更新 currentStep', 0, () => {
      const inst = initializeRiskFormStore();
      inst.saveStep(2, {} as RiskFormBackup);
      expect(inst.getCurrentStep()).assertEqual(2);
    });

    it('clearFormData 复位 age 为 0', 0, async (done: Function) => {
      const inst = initializeRiskFormStore();
      inst.saveStep(1, { age: 30 } as RiskFormBackup);
      await inst.clearFormData();
      expect(inst.getFormData().age).assertEqual(0);
      done();
    });

    it('clearFormData 复位 errorMessage 为 null', 0, async (done: Function) => {
      const inst = initializeRiskFormStore();
      inst.getFormData().errorMessage = 'err';
      await inst.clearFormData();
      expect(inst.getErrorMessage()).assertNull();
      done();
    });

    it('getFormData 同一引用', 0, () => {
      const inst = initializeRiskFormStore();
      const d1 = inst.getFormData();
      const d2 = inst.getFormData();
      expect(d1 === d2).assertTrue();
    });

    it('RiskFormData 实例字段初始值完整', 0, () => {
      const fd = new RiskFormData();
      expect(fd.isSubmitting).assertFalse();
      expect(fd.submitResult).assertNull();
      expect(fd.history.length).assertEqual(0);
      expect(fd.isLoadingHistory).assertFalse();
      expect(fd.errorMessage).assertNull();
    });
  });
}
