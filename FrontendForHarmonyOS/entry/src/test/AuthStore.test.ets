import { describe, it, expect } from '@ohos/hypium';
import { AuthStore } from '../main/ets/stores/AuthStore';
import { PreferencesManager } from '../main/ets/common/persistence/PreferencesManager';

function createUninitializedManager(): PreferencesManager {
  return new (PreferencesManager as unknown as { new(): PreferencesManager })();
}

export default function authStoreTest(): void {
  describe('AuthStoreTest', () => {
    it('getInstance 首次不传参抛出 Error', 0, () => {
      let caught: boolean = false;
      try {
        AuthStore.getInstance();
      } catch (_e) {
        caught = true;
      }
      expect(caught).assertTrue();
    });

    it('getInstance 首次传 PreferencesManager 返回非 null', 0, () => {
      const mgr = createUninitializedManager();
      const inst = AuthStore.getInstance(mgr);
      expect(inst).assertNotNull();
    });

    it('getInstance 再次调用返回同一引用', 0, () => {
      const inst1 = AuthStore.getInstance();
      const inst2 = AuthStore.getInstance();
      expect(inst1 === inst2).assertTrue();
    });

    it('getToken 闭包可创建且返回类型为 string | null', 0, () => {
      const inst = AuthStore.getInstance();
      const token = inst.token;
      expect(token === null || typeof token === 'string').assertTrue();
    });

    it('handleUnauthorized 闭包可调用不抛异常', 0, () => {
      const inst = AuthStore.getInstance();
      try {
        (inst as Record<string, Function>)['handleUnauthorized']();
      } catch (_e) {
        expect(false).assertTrue();
      }
    });

    it('getHttpClient 返回 HttpClient 实例', 0, () => {
      const inst = AuthStore.getInstance();
      expect(inst.getHttpClient()).assertNotNull();
    });

    it('isAdmin 初始状态返回 false', 0, () => {
      const inst = AuthStore.getInstance();
      expect(inst.isAdmin()).assertFalse();
    });

    it('token getter 初始返回 null', 0, () => {
      const inst = AuthStore.getInstance();
      expect(inst.token).assertNull();
    });

    it('role getter 初始返回 null', 0, () => {
      const inst = AuthStore.getInstance();
      expect(inst.role).assertNull();
    });

    it('user getter 初始返回 null', 0, () => {
      const inst = AuthStore.getInstance();
      expect(inst.user).assertNull();
    });

    it('mustChangePassword getter 初始返回 false', 0, () => {
      const inst = AuthStore.getInstance();
      expect(inst.mustChangePassword).assertFalse();
    });

    it('prototype 存在 login 方法', 0, () => {
      expect(typeof (AuthStore.prototype as Record<string, Function>)['login'])
        .assertEqual('function');
    });

    it('prototype 存在 clearAuth 方法', 0, () => {
      expect(typeof (AuthStore.prototype as Record<string, Function>)['clearAuth'])
        .assertEqual('function');
    });

    it('prototype 存在 syncFromPersist 方法', 0, () => {
      expect(typeof (AuthStore.prototype as Record<string, Function>)['syncFromPersist'])
        .assertEqual('function');
    });

    it('prototype 存在 isAdmin 方法', 0, () => {
      expect(typeof (AuthStore.prototype as Record<string, Function>)['isAdmin'])
        .assertEqual('function');
    });

    it('prototype 存在 getHttpClient 方法', 0, () => {
      expect(typeof (AuthStore.prototype as Record<string, Function>)['getHttpClient'])
        .assertEqual('function');
    });

    it('clearAuth 后 AppStorage 四键重置', 0, async (done: Function) => {
      const inst = AuthStore.getInstance();
      AppStorage.set('AUTH_TOKEN', 'fake-token');
      AppStorage.set('AUTH_ROLE', 'admin');
      AppStorage.set('AUTH_USER', { id: 1 } as Record<string, Object>);
      AppStorage.set('AUTH_MUST_CHANGE_PASSWORD', true);

      await inst.clearAuth();

      expect(inst.token).assertNull();
      expect(inst.role).assertNull();
      expect(inst.user).assertNull();
      expect(inst.mustChangePassword).assertFalse();
      done();
    });

    it('isAdmin role 为 admin 时返回 true', 0, () => {
      const inst = AuthStore.getInstance();
      AppStorage.set('AUTH_ROLE', 'admin');
      expect(inst.isAdmin()).assertTrue();
      AppStorage.set('AUTH_ROLE', null);
    });
  });
}
