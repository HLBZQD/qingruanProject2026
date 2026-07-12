import { describe, it, expect } from '@ohos/hypium';
import { safeJsonParse, safeJsonStringify, formatDate, timeAgo, debounce, truncateText } from '../main/ets/utils/Helpers';

export default function helpersTest(): void {
  describe('HelpersTest', () => {
    it('J1_合法JSON返回解析结果', 0, () => {
      const result = safeJsonParse('{"a":1}', null);
      expect((result as Record<string, number>)['a']).assertEqual(1);
    });

    it('J2_非法JSON返回fallback', 0, () => {
      const result = safeJsonParse('{bad', { default: true });
      expect((result as Record<string, boolean>)['default']).assertTrue();
    });

    it('J3_空字符串返回fallback', 0, () => {
      const result = safeJsonParse('', 42);
      expect(result).assertEqual(42);
    });

    it('J4_JSON数组合法解析', 0, () => {
      const result = safeJsonParse('[1,2,3]', []);
      expect((result as number[]).length).assertEqual(3);
      expect((result as number[])[0]).assertEqual(1);
    });

    it('J5_fallback为null', 0, () => {
      const result = safeJsonParse('{', null);
      expect(result).assertNull();
    });

    it('S1_普通对象返回JSON字符串', 0, () => {
      const result = safeJsonStringify({ a: 1 });
      expect(result).assertEqual('{"a":1}');
    });

    it('S2_数组返回JSON字符串', 0, () => {
      const result = safeJsonStringify([1, 2, 3]);
      expect(result).assertEqual('[1,2,3]');
    });

    it('S3_循环引用返回空串', 0, () => {
      const o: Record<string, Object> = {};
      o['self'] = o;
      const result = safeJsonStringify(o);
      expect(result).assertEqual('');
    });

    it('S4_null值返回字符串null', 0, () => {
      const result = safeJsonStringify(null);
      expect(result).assertEqual('null');
    });

    it('S5_undefined值返回空串', 0, () => {
      const result = safeJsonStringify(undefined);
      expect(result).assertEqual('');
    });

    it('F1_标准格式yyyy-MM-dd', 0, () => {
      const ts = new Date(2026, 6, 1, 0, 0, 0).getTime();
      const result = formatDate(ts, 'yyyy-MM-dd');
      expect(result).assertEqual('2026-07-01');
    });

    it('F2_完整格式yyyy-MM-dd HH:mm:ss', 0, () => {
      const ts = new Date(2026, 0, 1, 0, 0, 0).getTime();
      const result = formatDate(ts, 'yyyy-MM-dd HH:mm:ss');
      expect(result).assertEqual('2026-01-01 00:00:00');
    });

    it('F3_单占位符yyyy', 0, () => {
      const ts = new Date(2026, 6, 1).getTime();
      const result = formatDate(ts, 'yyyy');
      expect(result).assertEqual('2026');
    });

    it('F4_时间戳0', 0, () => {
      const d = new Date(0);
      const result = formatDate(0, 'yyyy-MM-dd HH:mm:ss');
      const expectedYear = String(d.getFullYear());
      const expectedMonth = String(d.getMonth() + 1).padStart(2, '0');
      const expectedDay = String(d.getDate()).padStart(2, '0');
      const expectedHour = String(d.getHours()).padStart(2, '0');
      const expectedMin = String(d.getMinutes()).padStart(2, '0');
      const expectedSec = String(d.getSeconds()).padStart(2, '0');
      const expected = `${expectedYear}-${expectedMonth}-${expectedDay} ${expectedHour}:${expectedMin}:${expectedSec}`;
      expect(result).assertEqual(expected);
    });

    it('F5_无占位符模板保持原样', 0, () => {
      const ts = new Date(2026, 6, 1).getTime();
      const result = formatDate(ts, '日期');
      expect(result).assertEqual('日期');
    });

    it('F6_单字母M不匹配MM模板', 0, () => {
      const ts = new Date(2026, 6, 1).getTime();
      const result = formatDate(ts, 'M月');
      expect(result).assertEqual('M月');
    });

    it('T1_刚刚', 0, () => {
      const ts = Date.now() - 30000;
      const result = timeAgo(ts);
      expect(result).assertEqual('刚刚');
    });

    it('T2_X分钟前', 0, () => {
      const ts = Date.now() - 5 * 60000;
      const result = timeAgo(ts);
      expect(result).assertEqual('5分钟前');
    });

    it('T3_X小时前', 0, () => {
      const ts = Date.now() - 3 * 3600000;
      const result = timeAgo(ts);
      expect(result).assertEqual('3小时前');
    });

    it('T4_X天前', 0, () => {
      const ts = Date.now() - 7 * 86400000;
      const result = timeAgo(ts);
      expect(result).assertEqual('7天前');
    });

    it('T5_X月前', 0, () => {
      const ts = Date.now() - 60 * 86400000;
      const result = timeAgo(ts);
      expect(result.includes('月前')).assertTrue();
    });

    it('T6_超12月降级yyyy-MM-dd', 0, () => {
      const ts = new Date(2020, 0, 1).getTime();
      const result = timeAgo(ts);
      expect(result).assertEqual('2020-01-01');
    });

    it('T7_未来时间戳降级yyyy-MM-dd', 0, () => {
      const ts = Date.now() + 86400000;
      const result = timeAgo(ts);
      expect(result.includes('-')).assertTrue();
    });

    it('D1_单次调用在delay后执行', 0, (done: Function) => {
      let callCount = 0;
      const fn = (): void => {
        callCount++;
      };
      const debounced = debounce(fn, 50);
      debounced();
      setTimeout(() => {
        expect(callCount).assertEqual(1);
        done();
      }, 70);
    });

    it('D2_快速连续调用只执行最后一次', 0, (done: Function) => {
      let callCount = 0;
      const fn = (): void => {
        callCount++;
      };
      const debounced = debounce(fn, 50);
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          debounced();
        }, i * 10);
      }
      setTimeout(() => {
        expect(callCount).assertEqual(1);
        done();
      }, 120);
    });

    it('X1_短文本原样返回', 0, () => {
      const result = truncateText('Hi', 5, '...');
      expect(result).assertEqual('Hi');
    });

    it('X2_长文本截断默认后缀', 0, () => {
      const result = truncateText('Hello World', 5);
      expect(result).assertEqual('Hello...');
    });

    it('X3_自定义后缀', 0, () => {
      const result = truncateText('Hello World', 5, '…');
      expect(result).assertEqual('Hello…');
    });

    it('X4_maxLen为0', 0, () => {
      const result = truncateText('Hello', 0, '...');
      expect(result).assertEqual('...');
    });

    it('X5_空串maxLen为0', 0, () => {
      const result = truncateText('', 0, '...');
      expect(result).assertEqual('');
    });

    it('X6_刚好等于maxLen', 0, () => {
      const result = truncateText('Hello', 5, '...');
      expect(result).assertEqual('Hello');
    });

    it('X7_中文截断', 0, () => {
      const result = truncateText('你好世界！', 3, '...');
      expect(result).assertEqual('你好世...');
    });
  });
}
