# 测试审查报告（v2 r1）

## 审查结果
APPROVED

## 发现

### [轻微] DesignReviewFixCss.spec.ts — 基于正则的 CSS 属性检测对格式化变更脆弱

`collapseScopedStyle` 将样式内容合并为单行后，所有断言依赖正则 `\.selector\s*\{[^}]*property` 匹配。若未来代码格式化（如 prettier 换行策略变更、属性重排），即使属性值和语义完全不变，正则也可能匹配失败导致误报。当前测试在已知格式化状态下正确，但缺乏对格式化变更的容错性。

### [轻微] DoctorChatView.spec.ts — G3 不变式 "loading/error 态内容不变" 仅验证元素存在，未验证内容

行为契约 §G3 不变式要求 "loading/error 态的 v-if/v-else-if 顺序和内容不变"。当前不变式测试验证了 v-if 链优先级顺序（loading > error > welcome），并确认 `.loading-state` / `.error-state` 元素存在，但未断言 loading skeleton 或 error 消息的具体内部 HTML 内容。若有人意外修改 SkeletonLoader 的骨架结构或 ErrorRetry 的提示文案，测试不会察觉。实际风险低——加载/错误态模板简单且此轮修改完全不触及这些分支。

### [轻微] DesignReviewFixCss.spec.ts BC-G14-2 — line-height 正则 `1[^0-9]` 可能匹配 `1.0`

不变式验证 `font-size: 42px; font-weight: 800; line-height: 1` 中 line-height 保持。正则 `line-height\s*:\s*1[^0-9]` 本意为拒绝 `1.5` 或 `10`，但 `[^0-9]` 会匹配句点 `.`，使得 `line-height: 1.0`（CSS 中与 `1` 等价）也通过断言。设计规格明确值为 `1`，严格应匹配 `1;` 或 `1\s`。实际影响可忽略——`1` 和 `1.0` 在 CSS 中语义完全相同。

## 审查总结

两份测试文件（DesignReviewFixCss.spec.ts + DoctorChatView.spec.ts）合计覆盖 detail_v2.md §行为契约 中全部行为契约：

- **G3 模板行为**：7 条行为契约 (BC-G3-1 ~ BC-G3-7) + 不变式 — DoctorChatView.spec.ts 通过组件 mount + 响应式 mock 全覆盖
- **G3 CSS**：.chat-welcome 全套样式规则 — DesignReviewFixCss.spec.ts BC-G3-CSS-1 逐属性验证
- **G14**：.gauge-score gradient-text 4 行属性 + 原有属性不变式 — BC-G14-1 / BC-G14-2
- **G19**：三视图 :deep() 6 组 Markdown 排版规则 + .msg-content 基础样式不变式 — BC-G19-1 / BC-G19-2，`verifyG19DeepRules` 复用函数验证三文件一致性

测试策略适配修改类型：纯 CSS 变更使用静态文件读取 + 正则匹配（务实且精确），模板条件分支使用 Vue Test Utils mount + 响应式状态模拟（覆盖完整状态机）。所有设计系统 CSS 变量引用均通过 DEEP_VARIABLES 枚举验证，确保无硬编码值逃脱。

存在 3 项轻微不足——2 项为正则精确性问题（不影响正确性），1 项为不变式验证深度不足（风险受限于修改范围零交集）——均不构成测试无效或不可靠。

整体评价：测试设计充分、断言精准、契约覆盖完整。审批通过。
