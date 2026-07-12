import { describe, it, expect } from '@ohos/hypium';
import { ICON_PATHS, ICON_STROKE_WIDTH, resolveIconPath } from '../main/ets/components/Icon';

// ---- helpers (pure, test-only) ----
const SVG_COMMAND_CHARS: string = 'MmLlCcQqAaHhVvZz';
const ICON_FALLBACK_PATH: string = 'M12 4 a8 8 0 1 1 0 16 a8 8 0 1 1 0 -16 Z';
const CORE_NAMES: string[] = [
  'HOME', 'CONSULT', 'LIFEPLAN', 'NEWS', 'PROFILE',
  'CHAT', 'CLOSE', 'BACK', 'CHEVRON_RIGHT',
  'INFO', 'WARNING', 'REFRESH', 'SEND',
];
const SUPPLEMENTARY_NAMES: string[] = ['ATTACH', 'SEARCH', 'USER', 'LOGOUT', 'EDIT', 'CHECK'];
// detail_v2 line 42-43 仅授权 BACK/CHEVRON_LEFT 同值别名
const AUTHORIZED_ALIASES: string[][] = [['BACK', 'CHEVRON_LEFT']];

function isAuthorizedAliasPair(a: string, b: string): boolean {
  return AUTHORIZED_ALIASES.some(pair =>
    (pair[0] === a && pair[1] === b) || (pair[0] === b && pair[1] === a));
}

export default function iconTest(): void {
  describe('IconTest', () => {

    // ==================== ICON_STROKE_WIDTH (Bible §2 第 2 条) ====================
    it('ICON_STROKE_WIDTH is 1.4 (Bible §2)', 0, () => {
      expect(ICON_STROKE_WIDTH).assertEqual(1.4);
    });
    // boundary: positive
    it('ICON_STROKE_WIDTH is positive number', 0, () => {
      expect(ICON_STROKE_WIDTH > 0).assertTrue();
    });

    // ==================== ICON_PATHS dictionary shape ====================
    it('ICON_PATHS every value is non-empty SVG path string', 0, () => {
      Object.keys(ICON_PATHS).forEach(k => {
        const v = ICON_PATHS[k];
        expect(v.length > 0).assertTrue();
        expect(SVG_COMMAND_CHARS.includes(v.charAt(0))).assertTrue();
      });
    });

    // ==================== baseline name presence ====================
    it('core 13 icon names present', 0, () => {
      CORE_NAMES.forEach(n => {
        expect(ICON_PATHS[n]).assertNotNull();
      });
    });
    it('supplementary 6 icon names present (16–20 fill)', 0, () => {
      SUPPLEMENTARY_NAMES.forEach(n => {
        expect(ICON_PATHS[n]).assertNotNull();
      });
    });

    // ==================== semantic alias + distinctness invariant ====================
    it('BACK and CHEVRON_LEFT share value (semantic alias)', 0, () => {
      expect(ICON_PATHS['BACK']).assertEqual(ICON_PATHS['CHEVRON_LEFT']);
    });
    // 通用不变式：除设计授权别名外，任意两个不同 key 不应同值
    // （替代 v1 针对单次修订行为的 CONSULT/CHAT、USER/PROFILE 具名 pair 断言）
    it('no two distinct keys share value except authorized alias', 0, () => {
      const keys = Object.keys(ICON_PATHS);
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          const a = keys[i];
          const b = keys[j];
          if (!isAuthorizedAliasPair(a, b)) {
            expect(ICON_PATHS[a]).assertNotEqual(ICON_PATHS[b]);
          }
        }
      }
    });

    // ==================== resolveIconPath: positive path ====================
    it('resolveIconPath returns known path unchanged (HOME)', 0, () => {
      expect(resolveIconPath('HOME')).assertEqual(ICON_PATHS['HOME']);
    });
    it('resolveIconPath returns known path unchanged for every key', 0, () => {
      Object.keys(ICON_PATHS).forEach(k => {
        expect(resolveIconPath(k)).assertEqual(ICON_PATHS[k]);
      });
    });
    it('resolveIconPath return first char is valid SVG command (known)', 0, () => {
      CORE_NAMES.forEach(n => {
        expect(SVG_COMMAND_CHARS.includes(resolveIconPath(n).charAt(0))).assertTrue();
      });
    });

    // ==================== resolveIconPath: error / fallback path ====================
    it('resolveIconPath unknown falls back + does not throw', 0, () => {
      let p: string = '';
      let threw: boolean = false;
      try {
        p = resolveIconPath('__unknown__');
      } catch (e) {
        threw = true;
      }
      expect(threw).assertFalse();
      expect(p).assertNotNull();
      expect(p.length > 0).assertTrue();
    });
    it('resolveIconPath unknown returns fallback ring path', 0, () => {
      expect(resolveIconPath('__unknown__')).assertEqual(ICON_FALLBACK_PATH);
    });
    it('resolveIconPath unknown return first char is valid SVG command', 0, () => {
      expect(SVG_COMMAND_CHARS.includes(resolveIconPath('__unknown__').charAt(0))).assertTrue();
    });

    // ==================== resolveIconPath: boundary ====================
    it('resolveIconPath empty string falls back (boundary)', 0, () => {
      expect(resolveIconPath('')).assertEqual(ICON_FALLBACK_PATH);
    });
    it('resolveIconPath is pure: same input same output across calls', 0, () => {
      const a = resolveIconPath('HOME');
      const b = resolveIconPath('HOME');
      const c = resolveIconPath('HOME');
      expect(a).assertEqual(b);
      expect(b).assertEqual(c);
    });
    it('resolveIconPath fallback is stable across different unknown names', 0, () => {
      const a = resolveIconPath('__a__');
      const b = resolveIconPath('__b__');
      const c = resolveIconPath('__c__');
      expect(a).assertEqual(b);
      expect(b).assertEqual(c);
    });
  });
}

// ---- 修订说明（v2 r2）----
// 1. [一般] 删除「no more than 40 keys (upper sanity bound)」用例。
//    detail_v2 line 165 明文「不限制 key 总数」，上限断言是对扩展契约的反向越权，后续页面累计
//    icon 超过 40 个时会误报失败。采纳审查意见，直接删除。
// 2. [轻微] 删除「at least 16 keys (baseline core)」用例。基线集合已由 core 13 + supplementary 6
//    name presence 用例覆盖，总数下限属冗余，且偏离「只校验基线集合 + 字典通用形态」的契约边界。采纳。
// 3. [轻微] 将 v1 的「CONSULT differs from CHAT」「USER differs from PROFILE」两条具名 pair 断言
//    重构为通用不变式「no two distinct keys share value except authorized alias」：遍历全字典 pair，
//    除 detail_v2 授权的 BACK/CHEVRON_LEFT 别名外，任意两个不同 key 不应同值。具名 pair 断言源自
//    code_v2 r2 修订记录而非稳定契约，通用不变式更稳定且对未来合法别名可扩展（仅需追加至
//    AUTHORIZED_ALIASES）。采纳审查建议方向。
// 4. [轻微] 删除「resolveIconPath whitespace-only name falls back」用例。detail_v2「前置」仅明文
//    「空串走未命中分支」，未授权 whitespace 作为独立契约分支；该用例描述实现当前行为而非契约明文
//    要求，属实现细节耦合。保留空串边界用例（契约明文）。采纳。
