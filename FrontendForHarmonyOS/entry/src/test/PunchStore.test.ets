import { describe, it, expect } from '@ohos/hypium';
import { PunchStore, PunchData } from '../main/ets/stores/PunchStore';
import { HttpClient } from '../main/ets/network/HttpClient';
import { PunchRecord } from '../main/ets/types/models';

function initializePunchStore(): PunchStore {
  const httpClient = new HttpClient();
  return PunchStore.getInstance(httpClient);
}

export default function punchStoreTest(): void {
  describe('PunchStoreTest', () => {
    it('getInstance 不传参抛出 Error', 0, () => {
      let caught: boolean = false;
      let errorMsg: string = '';
      try {
        PunchStore.getInstance();
      } catch (_e) {
        caught = true;
        errorMsg = (_e as Error).message;
      }
      expect(caught).assertTrue();
      expect(errorMsg.indexOf('required') !== -1).assertTrue();
    });

    it('getInstance 传参返回同一引用', 0, () => {
      const inst1 = initializePunchStore();
      const inst2 = PunchStore.getInstance();
      expect(inst1 === inst2).assertTrue();
    });

    it('PunchData punchRecords 初始为 []', 0, () => {
      const pd = new PunchData();
      expect(pd.punchRecords.length).assertEqual(0);
    });

    it('PunchData analysis 初始为 null', 0, () => {
      const pd = new PunchData();
      expect(pd.analysis).assertNull();
    });

    it('PunchData isSubmitting 初始为 false', 0, () => {
      const pd = new PunchData();
      expect(pd.isSubmitting).assertFalse();
    });

    it('PunchData isLoadingList 初始为 false', 0, () => {
      const pd = new PunchData();
      expect(pd.isLoadingList).assertFalse();
    });

    it('PunchData isLoadingAnalysis 初始为 false', 0, () => {
      const pd = new PunchData();
      expect(pd.isLoadingAnalysis).assertFalse();
    });

    it('PunchData listPage 初始为 1', 0, () => {
      const pd = new PunchData();
      expect(pd.listPage).assertEqual(1);
    });

    it('PunchData listHasMore 初始为 false', 0, () => {
      const pd = new PunchData();
      expect(pd.listHasMore).assertFalse();
    });

    it('PunchData errorMessage 初始为 null', 0, () => {
      const pd = new PunchData();
      expect(pd.errorMessage).assertNull();
    });

    it('createPunch 方法签名存在', 0, () => {
      expect(typeof (PunchStore.prototype as Record<string, Function>)['createPunch'])
        .assertEqual('function');
    });

    it('fetchPunchList 方法签名存在', 0, () => {
      expect(typeof (PunchStore.prototype as Record<string, Function>)['fetchPunchList'])
        .assertEqual('function');
    });

    it('fetchPunchAnalysis 方法签名存在', 0, () => {
      expect(typeof (PunchStore.prototype as Record<string, Function>)['fetchPunchAnalysis'])
        .assertEqual('function');
    });

    it('clearPunchData 方法签名存在', 0, () => {
      expect(typeof (PunchStore.prototype as Record<string, Function>)['clearPunchData'])
        .assertEqual('function');
    });

    it('getPunchData 方法签名存在', 0, () => {
      expect(typeof (PunchStore.prototype as Record<string, Function>)['getPunchData'])
        .assertEqual('function');
    });

    it('getPunchRecords 方法签名存在', 0, () => {
      expect(typeof (PunchStore.prototype as Record<string, Function>)['getPunchRecords'])
        .assertEqual('function');
    });

    it('getAnalysis 方法签名存在', 0, () => {
      expect(typeof (PunchStore.prototype as Record<string, Function>)['getAnalysis'])
        .assertEqual('function');
    });

    it('getTodayPunches 方法签名存在', 0, () => {
      expect(typeof (PunchStore.prototype as Record<string, Function>)['getTodayPunches'])
        .assertEqual('function');
    });

    it('isTodayPunched 方法签名存在', 0, () => {
      expect(typeof (PunchStore.prototype as Record<string, Function>)['isTodayPunched'])
        .assertEqual('function');
    });

    it('getPunchRecords 初始返回 []', 0, () => {
      const inst = initializePunchStore();
      expect(inst.getPunchRecords().length).assertEqual(0);
    });

    it('getAnalysis 初始返回 null', 0, () => {
      const inst = initializePunchStore();
      expect(inst.getAnalysis()).assertNull();
    });

    it('getTodayPunches 初始返回 []', 0, () => {
      const inst = initializePunchStore();
      expect(inst.getTodayPunches().length).assertEqual(0);
    });

    it('isTodayPunched 初始返回 false', 0, () => {
      const inst = initializePunchStore();
      expect(inst.isTodayPunched(1, 'diet')).assertFalse();
    });

    it('clearPunchData 复位全部字段', 0, () => {
      const inst = initializePunchStore();
      const data = inst.getPunchData();
      data.punchRecords = [{
        id: 1,
        plan_id: 1,
        plan_title: 'test',
        punch_type: 'diet',
        completion_status: 'completed',
        remarks: 'test',
        punch_time: '2025-01-01T10:00:00'
      }];
      data.analysis = {
        diet_completion_rate: 0.8,
        exercise_completion_rate: 0.6,
        total_punches: 10,
        last_7_days_trend: [],
        adherence_comment: 'good',
        improvement_suggestions: ['suggestion']
      };
      data.isSubmitting = true;
      data.isLoadingList = true;
      data.isLoadingAnalysis = true;
      data.listPage = 5;
      data.listHasMore = true;
      data.errorMessage = 'test error';

      inst.clearPunchData();

      expect(data.punchRecords.length).assertEqual(0);
      expect(data.analysis).assertNull();
      expect(data.isSubmitting).assertFalse();
      expect(data.isLoadingList).assertFalse();
      expect(data.isLoadingAnalysis).assertFalse();
      expect(data.listPage).assertEqual(1);
      expect(data.listHasMore).assertFalse();
      expect(data.errorMessage).assertNull();
    });

    it('getPunchData 返回同一引用', 0, () => {
      const inst = initializePunchStore();
      const d1 = inst.getPunchData();
      const d2 = inst.getPunchData();
      expect(d1 === d2).assertTrue();
    });
  });
}
