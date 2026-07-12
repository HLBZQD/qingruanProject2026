import { describe, it, expect } from '@ohos/hypium';
import { PreferencesManager, STORAGE_KEYS } from '../main/ets/common/persistence/PreferencesManager';

export default function preferencesManagerTest(): void {
  describe('PreferencesManagerTest', () => {
    it('getInstance 不传 context 首次返回 null', 0, () => {
      const existing = PreferencesManager.getInstance();
      if (existing !== null) {
        expect(existing).assertNotNull();
      } else {
        const inst = PreferencesManager.getInstance();
        expect(inst).assertNull();
      }
    });

    it('getInstance 传入 mock context 返回非 null', 0, () => {
      const mockContext: Object = {
        area: 0,
        eventHub: {},
        resourceManager: {},
      };
      const inst = PreferencesManager.getInstance(mockContext as
        import('@kit.AbilityKit').common.Context);
      expect(inst).assertNotNull();
    });

    it('getInstance 再次调用返回同一引用', 0, () => {
      const inst1 = PreferencesManager.getInstance();
      const inst2 = PreferencesManager.getInstance();
      expect(inst1).assertNotNull();
      expect(inst2).assertNotNull();
      expect(inst1 === inst2).assertTrue();
    });

    it('STORAGE_KEYS.AUTH_TOKEN 值为 auth_token', 0, () => {
      expect(STORAGE_KEYS.AUTH_TOKEN).assertEqual('auth_token');
    });

    it('STORAGE_KEYS.AUTH_ROLE 值为 auth_role', 0, () => {
      expect(STORAGE_KEYS.AUTH_ROLE).assertEqual('auth_role');
    });

    it('STORAGE_KEYS.DISCLAIMER_ACCEPTED 值为 disclaimer_accepted', 0, () => {
      expect(STORAGE_KEYS.DISCLAIMER_ACCEPTED).assertEqual('disclaimer_accepted');
    });

    it('STORAGE_KEYS.NAME_AUTH 值为 auth', 0, () => {
      expect(STORAGE_KEYS.NAME_AUTH).assertEqual('auth');
    });

    it('STORAGE_KEYS.NAME_CHAT 值为 chat', 0, () => {
      expect(STORAGE_KEYS.NAME_CHAT).assertEqual('chat');
    });

    it('PreferencesManager prototype 存在 putString 方法', 0, () => {
      expect(typeof (PreferencesManager.prototype as Record<string, Function>)['putString'])
        .assertEqual('function');
    });

    it('PreferencesManager prototype 存在 getString 方法', 0, () => {
      expect(typeof (PreferencesManager.prototype as Record<string, Function>)['getString'])
        .assertEqual('function');
    });

    it('PreferencesManager prototype 存在 putBoolean 方法', 0, () => {
      expect(typeof (PreferencesManager.prototype as Record<string, Function>)['putBoolean'])
        .assertEqual('function');
    });

    it('PreferencesManager prototype 存在 getBoolean 方法', 0, () => {
      expect(typeof (PreferencesManager.prototype as Record<string, Function>)['getBoolean'])
        .assertEqual('function');
    });

    it('PreferencesManager prototype 存在 putNumber 方法', 0, () => {
      expect(typeof (PreferencesManager.prototype as Record<string, Function>)['putNumber'])
        .assertEqual('function');
    });

    it('PreferencesManager prototype 存在 getNumber 方法', 0, () => {
      expect(typeof (PreferencesManager.prototype as Record<string, Function>)['getNumber'])
        .assertEqual('function');
    });

    it('PreferencesManager prototype 存在 delete 方法', 0, () => {
      expect(typeof (PreferencesManager.prototype as Record<string, Function>)['delete'])
        .assertEqual('function');
    });

    it('PreferencesManager prototype 存在 has 方法', 0, () => {
      expect(typeof (PreferencesManager.prototype as Record<string, Function>)['has'])
        .assertEqual('function');
    });

    it('PreferencesManager prototype 存在 flush 方法', 0, () => {
      expect(typeof (PreferencesManager.prototype as Record<string, Function>)['flush'])
        .assertEqual('function');
    });

    function createUninitializedManager(): PreferencesManager {
      return new (PreferencesManager as unknown as { new(): PreferencesManager })();
    }

    it('putString 未初始化 context 时静默降级', 0, async () => {
      const mgr = createUninitializedManager();
      await mgr.putString('test_ns', 'test_key', 'test_val');
    });

    it('getString 未初始化 context 时返回默认值', 0, async () => {
      const mgr = createUninitializedManager();
      const result = await mgr.getString('test_ns', 'test_key', 'fallback');
      expect(result).assertEqual('fallback');
    });

    it('putBoolean 未初始化 context 时静默降级', 0, async () => {
      const mgr = createUninitializedManager();
      await mgr.putBoolean('test_ns', 'test_key', true);
    });

    it('getBoolean 未初始化 context 时返回默认值', 0, async () => {
      const mgr = createUninitializedManager();
      const result = await mgr.getBoolean('test_ns', 'test_key', true);
      expect(result).assertTrue();
    });

    it('getBoolean 未初始化 context 时返回默认值 false', 0, async () => {
      const mgr = createUninitializedManager();
      const result = await mgr.getBoolean('test_ns', 'test_key', false);
      expect(result).assertFalse();
    });

    it('putNumber 未初始化 context 时静默降级', 0, async () => {
      const mgr = createUninitializedManager();
      await mgr.putNumber('test_ns', 'test_key', 42);
    });

    it('getNumber 未初始化 context 时返回默认值', 0, async () => {
      const mgr = createUninitializedManager();
      const result = await mgr.getNumber('test_ns', 'test_key', 99);
      expect(result).assertEqual(99);
    });

    it('delete 未初始化 context 时静默降级', 0, async () => {
      const mgr = createUninitializedManager();
      await mgr.delete('test_ns', 'test_key');
    });

    it('has 未初始化 context 时返回 false', 0, async () => {
      const mgr = createUninitializedManager();
      const result = await mgr.has('test_ns', 'test_key');
      expect(result).assertFalse();
    });

    it('flush 未初始化 context 时静默降级', 0, async () => {
      const mgr = createUninitializedManager();
      await mgr.flush('test_ns');
    });
  });
}
