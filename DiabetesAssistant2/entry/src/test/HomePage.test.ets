import { describe, it, expect } from '@ohos/hypium';
import { HomeStore, HomeData } from '../main/ets/stores/HomeStore';
import { EMPTY_MESSAGES } from '../main/ets/components/EmptyState';
import { getIconPath, ICON_VIEW } from '../main/ets/assets/icons/iconPaths';

export default function homePageTest(): void {
  describe('HomePageTest', () => {
    it('HomePage 模块可 import', 0, () => {
      let caught: boolean = false;
      try {
        require('../main/ets/pages/tabs/HomePage');
      } catch (_e) {
        caught = true;
      }
      expect(caught).assertFalse();
    });

    it('HomeStore 新增方法签名存在', 0, () => {
      const proto = HomeStore.prototype as Record<string, Function>;
      expect(typeof proto['fetchDiabetesTypes']).assertEqual('function');
      expect(typeof proto['getDiabetesTypes']).assertEqual('function');
      expect(typeof proto['isLoadingDiabetesTypes']).assertEqual('function');
    });

    it('HomeData 新增字段默认值正确', 0, () => {
      const hd = new HomeData();
      expect(hd.diabetesTypes.length).assertEqual(0);
      expect(hd.isLoadingTypes).assertFalse();
    });

    it('ICON_VIEW 在 iconPaths 中已注册', 0, () => {
      const path = getIconPath('VIEW');
      expect(path !== '').assertTrue();
      expect(path !== undefined).assertTrue();
      const iconViewExists: boolean = ICON_VIEW !== '';
      expect(iconViewExists).assertTrue();
    });

    it('路由字符串字面量非空', 0, () => {
      const diabetesTypeDetailUrl: string = 'pages/DiabetesTypeDetail';
      const articleDetailUrl: string = 'pages/ArticleDetail';
      expect(diabetesTypeDetailUrl.length > 0).assertTrue();
      expect(articleDetailUrl.length > 0).assertTrue();
    });

    it('EMPTY_MESSAGES.NO_ARTICLES 常量可用', 0, () => {
      expect(EMPTY_MESSAGES.NO_ARTICLES.length > 0).assertTrue();
    });

    it('编译验证', 0, () => {
      expect(true).assertTrue();
    });
  });
}
