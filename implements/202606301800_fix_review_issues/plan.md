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

## R2 PASSED 修复P1前端设计合规问题（S1/S2）
结果：2个P1问题全部修复——App.vue 删除 handleStorageChange + storage 事件监听器（死代码清理），AiChatDialog.vue 完成4项综合修复（DOM id添加、renderMarkdown统一XSS管道、useUI免责声明函数复用、formatTime共享版本复用）；todo.md 更新 S1/S2 为已完成
测试：test_v2.md 验证通过（13个测试用例全部真实逻辑，无占位断言）；verify_v2.md 确认 4 文件修改通过

---
## R3 NEW 修复P1后端安全缺陷（S5/S6）
任务：修复2个P1后端安全问题——admin.js Text2SQL功能SQL注入漏洞（S5），encryption.js 硬编码默认加密密钥（S6）
选择理由：P1最高剩余优先级，两个问题均为后端安全缺陷，共享 server/ 上下文。S5（SQL注入）为功能性安全漏洞可导致数据破坏，S6（硬编码密钥）导致加密保护静默失效。两问题均位于 server/ 路径，独立于前端修改，可在同一任务中安全处理
上下文：审查报告 todo.md 已提供精确位置和修复建议——S5 需修改 `server/routes/admin.js:241,301,320` 的 WHERE 子句拼接为参数化查询或语法校验；S6 需修改 `server/utils/encryption.js:22` 的密钥回退逻辑为启动时抛出错误
