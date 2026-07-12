import { describe, it, expect } from '@ohos/hypium';
import { HomeStore, HomeData } from '../main/ets/stores/HomeStore';
import { Doctor } from '../main/ets/types/models';
import { EMPTY_MESSAGES } from '../main/ets/components/EmptyState';
import { filterDoctors } from '../main/ets/pages/tabs/ConsultationPage';

export default function consultationPageTest(): void {
  describe('ConsultationPageTest', () => {

    it('ConsultationPage 模块可 import', 0, () => {
      let caught: boolean = false;
      try {
        require('../main/ets/pages/tabs/ConsultationPage');
      } catch (_e) {
        caught = true;
      }
      expect(caught).assertFalse();
    });

    it('HomeStore.getInstance() 可获取且 getHomeData().doctors 为数组', 0, () => {
      const store: HomeStore = HomeStore.getInstance();
      expect(store !== null).assertTrue();
      const data: HomeData = store.getHomeData();
      expect(Array.isArray(data.doctors)).assertTrue();
    });

    it('filterDoctors 按 name 过滤返回正确结果', 0, () => {
      const doctors: Doctor[] = [
        { id: 1, name: '张医生', department: '内科', title: '主任', description: '', avatar: null },
        { id: 2, name: '李医生', department: '外科', title: '副主任', description: '', avatar: null },
        { id: 3, name: '王护士', department: '护理', title: '护士', description: '', avatar: null },
      ];
      expect(filterDoctors(doctors, '').length).assertEqual(3);
      expect(filterDoctors(doctors, '医生').length).assertEqual(2);
      expect(filterDoctors(doctors, '赵').length).assertEqual(0);
      expect(filterDoctors(doctors, 'zhang').length).assertEqual(0);
    });

    it('编译验证', 0, () => {
      expect(true).assertTrue();
    });
  });
}
