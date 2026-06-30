# 设计审查报告（v6 r2）

## 审查结果
APPROVED

## 发现

### **[轻微] LifePlan.vue 导入插入点行号偏差**

设计"修改点 A"声称"第19行 `const route = useRoute()` 之前"添加 DisclaimerBar 导入。实际源文件中 `const route = useRoute()` 位于第17行（第19行为 `const riskForm = useRiskFormStore()`）。语义描述"在现有导入末尾...之前"足够清晰，实施Agent可以通过搜索 `const route = useRoute()` 定位正确插入点。不影响实施正确性。

### **[轻微] S16 sanitizeHtml 白名单中无 `<mark>` 标签，与设计声明矛盾**

设计 §S16 行为契约声明"`<mark>` 标签在 DOMPurify 白名单内（whiteList 默认包含），不会被净化掉"。但实际 `src/utils/sanitize.ts` 的 `sanitizeHtml()` 函数使用自定义 `ALLOWED_TAGS` 白名单覆盖了 DOMPurify 默认值，该自定义白名单不包含 `mark` 标签。**功能层面无实际影响**：`sanitizeHtml(text)` 在 `<mark>` 标签添加之前调用（净化→regex替换的顺序正确），`<mark>` 标签不经过净化器。此事实性偏差需在设计文档中修正陈述，但不影响实施正确性。
