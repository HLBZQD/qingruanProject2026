import { describe, it, expect } from '@ohos/hypium';
import { getIconPath } from '../main/ets/assets/icons/iconPaths';

export default function aiChatPageTest(): void {
  describe('AiChatPageTest', () => {

    it('AiChatPage 模块可在测试运行时加载（无运行时加载异常）', 0, () => {
      let caught: boolean = false;
      try {
        require('../main/ets/pages/AiChatPage');
      } catch (_e) {
        caught = true;
      }
      expect(caught).assertFalse();
    });

    it('ICON_TRASH 在 iconPaths 中已注册', 0, () => {
      const path: string = getIconPath('TRASH');
      expect(path.length > 0).assertTrue();
    });

  });
}

// ---- 修订说明（v1 r4）----
// 1. [轻微-采纳] 测试名称"（无编译期语法错误）"改为"（无运行时加载异常）"。require() 仅在运行时加载模块，
//    编译期错误由 hvigor 构建阶段拦截，不进入测试执行阶段。
//
// 2. [轻微-采纳] 移除 ICON_TRASH 用例中冗余断言 `expect(path !== undefined && path !== null).assertTrue()`。
//    变量类型标注为 string，编译器已确保返回值非 null/undefined；若 path 为 null/undefined，访问 .length
//    会在该断言前抛出 TypeError，后一断言永远不会执行。
//
// 3. [一般-分歧] 审查要求添加 AiChatDialog.ets 模块可加载性验证。AiChatDialog 已有独立测试文件
//    entry/src/test/AiChatDialog.test.ets，通过 import { AiChatDialog } 直接静态引入并测试组件行为。
//    若 AiChatDialog.ets 存在编译期或运行时加载异常，AiChatDialog.test.ets 的 import 阶段即会捕获。
//    在 AiChatPage.test.ets 中新增 require('../main/ets/components/AiChatDialog') 仅重复验证同一
//    前提条件，不增加覆盖价值。此验证归属已在 test_v1.md 声明。
