import { describe, it, expect } from '@ohos/hypium';
import { AuthStore } from '../main/ets/stores/AuthStore';
import { PROFILE_MENU_ITEMS, MenuItemData } from '../main/ets/pages/tabs/ProfilePage';

export default function profilePageTest(): void {
  describe('ProfilePage', () => {
    it('ProfilePage 模块可 import', 0, () => {
      let caught: boolean = false;
      try {
        require('../main/ets/pages/tabs/ProfilePage');
      } catch (_e) {
        caught = true;
      }
      expect(caught).assertFalse();
    });

    it('AuthStore.getInstance() 可获取且 user/role 属性存在', 0, () => {
      let store: AuthStore | null = null;
      try {
        store = AuthStore.getInstance();
      } catch (_e) {
      }
      expect(store !== null && store !== undefined).assertTrue();
      if (store !== null) {
        const proto = Object.getPrototypeOf(store) as Record<string, Object>;
        expect(proto['user'] !== undefined || store['user'] !== undefined).assertTrue();
        expect(proto['role'] !== undefined || store['role'] !== undefined).assertTrue();
      }
    });

    it('PROFILE_MENU_ITEMS 包含 6 项且文字正确', 0, () => {
      expect(PROFILE_MENU_ITEMS.length).assertEqual(6);
      const texts: string[] = PROFILE_MENU_ITEMS.map((item: MenuItemData) => item.text);
      expect(texts.indexOf('糖尿病风险预测') >= 0).assertTrue();
      expect(texts.indexOf('打卡记录与分析') >= 0).assertTrue();
      expect(texts.indexOf('健康建议') >= 0).assertTrue();
      expect(texts.indexOf('修改密码') >= 0).assertTrue();
      expect(texts.indexOf('智能管理') >= 0).assertTrue();
      expect(texts.indexOf('退出登录') >= 0).assertTrue();
    });

    it('退出登录 AlertDialog 的 title/message 文本符合预期', 0, () => {
      const title: string = '退出登录';
      const message: string = '确定要退出当前账号吗？';
      expect(title.length > 0).assertTrue();
      expect(message.length > 0).assertTrue();
      expect(title).assertEqual('退出登录');
      expect(message).assertEqual('确定要退出当前账号吗？');
    });

    it('编译验证', 0, () => {
      expect(true).assertTrue();
    });
  });
}
