# 实现计划

任务描述：修复全量代码审查发现的50个问题（17严重+33一般），按P0→P1→P2→P3优先级分批实现
项目根目录：C:\Users\DELL\Desktop\qingruanProject2026

---

## R1 NEW 修复P0功能性断裂问题（S7/S8/S9）
任务：修复3个导致应用无法正常运行的Critical缺陷——ArticleDetailView不加载、DoctorChatView缺少组件导入、authStore清理链不完整
选择理由：P0最高优先级，三个问题均为功能性断裂（页面白屏/运行时解析失败/状态泄露），阻断所有后续验证工作
上下文：审查报告 `reviews/202606291800_full_review/todo.md` 已提供精确位置和修复建议；需要读取的源文件：src/views/ArticleDetailView.vue、src/views/DoctorChatView.vue、src/stores/authStore.ts、src/stores/chatStore.ts、src/stores/riskFormStore.ts
