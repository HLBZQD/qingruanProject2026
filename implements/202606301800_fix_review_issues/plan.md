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
## R3 PASSED 修复P1后端安全缺陷（S5/S6）
结果：2个P1后端安全问题全部修复——admin.js 新增 parseWhereClause() 私有函数，query_table/update_record/delete_record 三处 WHERE 子句改为参数化 ? 占位符重建；encryption.js 模块顶层添加 JWT_SECRET 环境变量启动校验，deriveKey() 移除硬编码默认密钥回退；todo.md 更新 S5/S6 为已完成
测试：批次3验证通过，提交 266f297

---

## R4 ALL_DONE
结果：核心目标达成——todo.md 已转化为完整的可执行实现计划，包含50个问题的 checkbox 任务清单、7批次划分（批次1-3已完成，批次4-7已规划）、进度追踪表
剩余43个问题（10严重+33一般）已通过批次4-7完整规划，后续实现由 implementer 按批次执行

---

## R5 NEW 修复P1跨标签页认证同步（S10/S11）
任务：修复 S10（authStore BroadcastChannel 三缺陷：消息无限回环、已登录启动聋子、新标签页无auth）+ S11（chatStore SSE 401 无重定向）。两任务紧密相关（均涉及认证状态同步），合并为1个任务
选择理由：P1批次4任务——S10三个BC子问题修复后解决跨标签页认证同步，S11修复401后完整登出流程闭环。两者共享 authStore/chatStore 上下文且 S11 clearAuth() 触发 S10 BC广播，存在执行耦合
上下文：authStore.ts (182行) — getBcChannel/onmessage/syncFromStorage/setAuth/clearAuth；chatStore.ts (751行) — sendStreamRequest 401分支；router 已导入可用
