# 实现计划

任务描述：修复全量代码审查发现的50个问题（17严重+33一般），按P0→P1→P2→P3优先级分批实现
项目根目录：C:\Users\DELL\Desktop\qingruanProject2026

---

## R1 NEW 修复P0功能性断裂问题（S7/S8/S9）
任务：修复3个导致应用无法正常运行的Critical缺陷——ArticleDetailView不加载、DoctorChatView缺少组件导入、authStore清理链不完整
选择理由：P0最高优先级，三个问题均为功能性断裂（页面白屏/运行时解析失败/状态泄露），阻断所有后续验证工作
上下文：审查报告 `reviews/202606291800_full_review/todo.md` 已提供精确位置和修复建议；需要读取的源文件：src/views/ArticleDetailView.vue、src/views/DoctorChatView.vue、src/stores/authStore.ts、src/stores/chatStore.ts、src/stores/riskFormStore.ts

## R1 PASSED 修复P0功能性断裂问题（S7/S8/S9）
结果：3个P0问题全部修复——ArticleDetailView.vue 添加 onMounted 调用（+1行），DoctorChatView.vue 补充4个导入（+4行），authStore.ts 补充2个store清理调用（+4行）；todo.md 更新S7/S8/S9为已完成
测试：verify_v1.md 验证通过（3/3 PASS）

---

## R2 NEW 修复P1前端设计合规问题（S1/S2）
任务：修复2个前端设计合规问题——App.vue 删除 localStorage StorageEvent 死代码（v16迁移残留），AiChatDialog.vue 修复4项综合设计合规缺陷（DOM id、XSS管道、免责声明复用、formatTime复用）
选择理由：P1优先级，S1为死代码清理无依赖，S2为共享工具复用可消除约25行内联重复代码。两问题均为前端文件修改，不涉及后端，可在一个任务中安全处理
上下文：审查报告已提供精确修复方案；S1仅需删除代码（12行），S2需对齐设计与实现：useMarkdown.ts 提供 renderMarkdown()，useUI.ts 提供 hasAcceptedDisclaimer()/showDisclaimer()/ensureDisclaimer()（但 ensureDisclaimer 仅在 AiChatDialog 中使用），helpers.ts 提供 formatTime()
