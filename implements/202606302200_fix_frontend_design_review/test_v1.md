# 测试审查报告（v1 r1）

## 审查结果
APPROVED

## 发现

### [轻微] DesignSystemCss.spec.ts — G12 不变式 "Home.vue 的 `.page-enter.home-page` 覆盖不受影响" 未验证

行为契约 §G12 `.page-enter` 明确列出不变式：Home.vue 的 `.page-enter.home-page` 覆盖不受影响。当前测试仅覆盖 animations.css 文件内容（BC-G12-1、BC-G12-2），未读取 Home.vue 验证 `.page-enter.home-page` 选择器及其 `animation-name: pageEnterHome` 覆盖仍存在。G12 修改范围限于 animations.css，实际代码中该不变式确实保持（Home.vue:345-347），但缺乏自动化回归保护。若未来有人误删 Home.vue 中的该覆盖规则，当前测试不会察觉。

### [轻微] DesignSystemCss.spec.ts — G18 不变式 "文字白色 `color: #fff` 不受影响" 未验证

行为契约 §G18 不变式列明文字颜色不受本次修改影响。测试验证了渐变方向、色标位置、CSS 变量使用，但未检查 `.home-logo`、`.banner-grad-1/2/3` 规则块内或关联文本元素（如 `.banner-title`、`.home-logo-text`）的 `color` 属性保持为 `#fff` 或设计系统白色变量。G18 仅修改 `background` / `linear-gradient` 属性值，不影响 `color` 属性，实际风险为零。

### [轻微] DesignSystemCss.spec.ts — BC-G18-1 测试名称暗示范围大于实际检查范围

测试描述为 "banner/home-logo 渐变不含硬编码品牌色"，但仅对 4 个指定规则块（`.home-logo`、`.banner-grad-1/2/3`）做断言。Home.vue 中尚存在 `.type-grad-1`（行 750：`#3b82f6, #6366f1`）和 `.type-grad-2`（行 753：`#0ea5e9, #06b6d4`），均为糖尿病分类卡片渐变，也使用了硬编码品牌色但不在本次 G18 修改范围内。测试名称的 "banner" 措辞可能被误解为覆盖所有 banner 渐变，实现正确但命名有歧义。建议测试名称加限定词（如 "4 个目标 banner 渐变规则块"）或补充注释说明 `.type-grad-*` 不在本轮修改范围。

## 审查总结

测试文件 DesignSystemCss.spec.ts 覆盖了设计规格 detail_v1.md §行为契约中全部 7 条行为契约的后置条件（BC-G12-1、BC-G12-2、BC-G15-1、BC-G15-2、BC-G18-1、BC-G18-2、BC-G18-3）以及跨文件设计系统变量一致性验证。测试方法采用静态文件读取 + 正则/字符串匹配，对于纯 CSS 属性值替换类修改是适当且务实的策略。关键边界情况处理到位：`--color-text` 检测不会误杀 `--color-text-primary`；`extractBlock` 精确提取目标规则块避免跨规则干扰；collapse 归一化空白保证匹配可靠性。存在 3 项轻微不足——2 项为行为契约不变式缺少回归测试（风险受限于修改范围），1 项为测试命名歧义——均不影响测试正确性与可靠性。

整体评价：测试设计充分、断言精准、覆盖完整。审批通过。
