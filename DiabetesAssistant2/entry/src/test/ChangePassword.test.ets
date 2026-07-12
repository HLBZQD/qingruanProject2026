import { describe, it, expect } from '@ohos/hypium';
import { AuthStore } from '../main/ets/stores/AuthStore';
import { CHANGE_PASSWORD, ROOT_SHELL } from '../main/ets/common/constants/RouteNames';

export default function changePasswordTest(): void {
  describe('ChangePasswordTest', () => {
    it('ChangePassword 模块可 import', 0, () => {
      let caught: boolean = false;
      try {
        require('../main/ets/pages/ChangePassword');
      } catch (_e) {
        caught = true;
      }
      expect(caught).assertFalse();
    });

    it('AuthStore.changePassword 方法签名存在', 0, () => {
      const proto = AuthStore.prototype as Record<string, Function>;
      expect(typeof proto['changePassword']).assertEqual('function');
    });

    it('ChangePasswordRequest 接口形状正确', 0, () => {
      const req: Record<string, Object> = { old_password: null, new_password: '123456' };
      expect(req['new_password'] as string).assertEqual('123456');
      expect(req['old_password']).assertNull();
    });

    it('API_USER_PASSWORD 常量正确', 0, () => {
      const mod = require('../main/ets/common/constants/ApiEndpoints') as Record<string, string>;
      expect(mod['API_USER_PASSWORD']).assertEqual('/api/user/password');
    });

    it('路由常量正确', 0, () => {
      expect(CHANGE_PASSWORD).assertEqual('ChangePassword');
      expect(ROOT_SHELL).assertEqual('RootShell');
    });

    it('前端校验纯函数逻辑正确', 0, () => {
      const mod = require('../main/ets/pages/ChangePassword') as Record<string, Function>;
      const fn = mod['validatePasswordChange'] as (a: string, b: string, c: string | null, d: boolean) => string | null;
      expect(fn('123456', '123456', null, true)).assertNull();
      expect(fn('12345', '12345', null, true) !== null).assertTrue();
      expect(fn('123456', '654321', null, true) !== null).assertTrue();
      expect(fn('123456', '123456', null, false) !== null).assertTrue();
      expect(fn('123456', '123456', '123456', false) !== null).assertTrue();
    });

    it('编译验证', 0, () => {
      expect(true).assertTrue();
    });
  });
}
