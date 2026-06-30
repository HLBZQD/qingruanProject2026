# 测试审查报告（v2 r1）

## 审查结果
REJECTED

## 发现

- **[严重]** `test/frontend/AiChatDialog.spec.ts` — 全部 13 个测试用例仅包含 `expect(true).toBe(true)` 占位断言，无任何实际验证逻辑。文件中定义了 `createMockStores()` 和 `makeRouter()` 辅助函数，但从未被任何测试体调用。未挂载组件、未调用被测函数、未查询 DOM 节点。测试报告（test_v2.md）声称"17个测试用例，覆盖所有行为契约"，但此文件中的 13/17 个用例为无效测试（no-op），8 个行为契约（BC-S2a-1/2、BC-S2b-1-a/b、BC-S2c-1、BC-S2c-2-a/b、BC-S2d-1-a/b）实际上零覆盖。

- **[一般]** `test/frontend/App.spec.ts` (BC-S1-1-b) — "卸载时不调用 removeEventListener 移除 storage 监听" 用例从未挂载或卸载 App 组件，仅检查未经任何操作的 spy。测试注释自认"实际卸载测试需完整 Pinia mock，此处验证 mock 未被污染"。该测试未能验证其声称的行为契约。

## 修改要求（仅 REJECTED 时）

### 1. `test/frontend/AiChatDialog.spec.ts` — 全部 13 个测试用例为占位实现，零覆盖率

**位置**：文件全部 `it()` 块（第112-224行），共 13 个 `describe`/`it` 块。

**问题**：每个测试体仅包含 `expect(true).toBe(true)`，不挂载组件、不调用函数、不查询 DOM。`createMockStores()` 和 `makeRouter()` 辅助函数定义后从未在测试体中调用。Vitest 运行时这 13 个用例全部通过，但未验证任何行为契约。

**为什么是问题**：测试报告声称覆盖 S2 全部 8 个行为契约。若这些用例通过审查并合并，后续开发者将误以为 AiChatDialog.vue 的 S2 修复已有自动化测试保护，实际完全裸露。任何回退或误改将无法被检测。

**期望修正方向**：
- BC-S2a-1/2（DOM id）：使用 `mount()` 挂载 AiChatDialog 组件，通过 Pinia mock 控制 `authStore.token` 状态，用 `wrapper.find('#fab-login-prompt')` 和 `wrapper.find('#fab-welcome-logged-in')` 验证 DOM id 存在。
- BC-S2b-1（renderMarkdown）：实测 `renderMarkdown(markdown)` 调用，验证外部链接输出含 `rel="noopener noreferrer" target="_blank"`。
- BC-S2c-1/2（免责声明）：通过 `vi.mock` Mock `useUI` 模块的 `hasAcceptedDisclaimer`/`showDisclaimer`/`setDisclaimerAccepted`，控制 localStorage 状态，验证不同路径下调用的函数及参数。
- BC-S2d-1（formatTime）：导入 `formatTime` 并实测 `formatTime(1700000000000)` → `"14:30"` 格式、`formatTime(0)` → `""`。

### 2. `test/frontend/App.spec.ts` (BC-S1-1-b) — 卸载测试未执行组件生命周期

**位置**：第64-75行 `it('卸载时不调用 removeEventListener 移除 storage 监听', ...)`。

**问题**：测试创建了 `removeEventListener` spy 但从未 mount/unmount App 组件。spy 的 filter 结果始终为空（因 spy 从未被调用），测试结论"初始状态下不应有 storage 相关调用"成立但无意义——任何未使用的 spy 都会通过此检查。

**为什么是问题**：行为契约 BC-S1-1 要求验证"卸载时不调用 removeEventListener('storage', ...)"。当前测试无法区分"因为代码正确所以未调用"与"因为组件根本没挂载所以未调用"。

**期望修正方向**：mount App 组件后再 unmount，然后在 spy 上验证 `removeEventListener` 未被以 `'storage'` 作为第一个参数调用。与 BC-S1-1-a 的测试结构对称。
