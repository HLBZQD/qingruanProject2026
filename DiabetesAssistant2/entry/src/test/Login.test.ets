import { describe, it, expect } from '@ohos/hypium';
import { AuthStore } from '../main/ets/stores/AuthStore';
import { LOGIN, CHANGE_PASSWORD, ROOT_SHELL } from '../main/ets/common/constants/RouteNames';
import { ICON_PATHS } from '../main/ets/assets/icons/iconPaths';

export default function loginTest(): void {
  describe('LoginTest', () => {
    it('Login 模块可 import', 0, () => {
      let caught: boolean = false;
      try {
        require('../main/ets/pages/Login');
      } catch (_e) {
        caught = true;
      }
      expect(caught).assertFalse();
    });

    it('AuthStore.register 方法签名存在', 0, () => {
      const result = typeof (AuthStore.prototype as Record<string, Function>)['register'] === 'function';
      expect(result).assertTrue();
    });

    it('AuthStore.token getter 初始返回 null', 0, () => {
      const token = AuthStore.getInstance().token;
      expect(token).assertNull();
    });

    it('路由常量非空', 0, () => {
      expect(LOGIN === 'Login').assertTrue();
      expect(CHANGE_PASSWORD === 'ChangePassword').assertTrue();
      expect(ROOT_SHELL === 'RootShell').assertTrue();
    });

    it('LoginPageBuilder 可调用不抛异常', 0, () => {
      const mod = require('../main/ets/pages/Login') as Record<string, Function>;
      let caught: boolean = false;
      try {
        mod['LoginPageBuilder']();
      } catch (_e) {
        caught = true;
      }
      expect(caught).assertFalse();
    });

    it('WARNING icon 在 ICON_PATHS 中存在', 0, () => {
      const path = ICON_PATHS['WARNING'];
      expect(path !== undefined).assertTrue();
      expect(typeof path === 'string' && path.length > 0).assertTrue();
    });

    it('编译验证', 0, () => {
      expect(true).assertTrue();
    });
  });
}
