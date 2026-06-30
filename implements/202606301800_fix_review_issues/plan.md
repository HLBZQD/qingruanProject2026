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

## R5 PASSED 修复P1跨标签页认证同步（S10/S11）
结果：2个P1问题全部修复——authStore.ts S10三缺陷修复（+50行：onmessage去重守卫、syncFromStorage BC初始化、REQUEST_AUTH新标签页机制）；chatStore.ts S11 401跳转修复（+4行：await toast + router.push('/login')）。todo.md 更新 S10/S11 为已完成
测试：verify_v5.md 验证通过（5/5文件修改通过）

## R6 NEW 修复P2组件与DOM合规（S12/S15/S13/S14/S16/S17 + S3/S4）
任务：修复8个P2问题，拆分为两个子任务——子任务A（S12内存泄漏+S15 clearMessages+S13 JWT字段名+S14 Mock ID+S16 XSS+S17 Promise rejection）6个独立小修复；子任务B（S3 DisclaimerBar 6页面+S4 DOM属性 Risk+Punch）2个批量化修改
选择理由：P2批次5问题，均为独立代码层面的合规修复，无跨文件依赖。子任务A为高优先级小修复（内存泄漏/数据一致性/安全），子任务B为批量化设计合规对齐（组件统一+DOM锚点补充）。8个问题之间无先后依赖，可并行执行
上下文：验证报告 v5 PASSED。审查报告 todo.md 批次5（第472-481行）已列出所有8个问题的精确位置和修复建议。涉及文件：AiChatDialog.vue、chatStore.ts、DoctorChatView.vue、useAuth.ts、sseProxy.js、NewsView.vue、Home.vue、LifePlan.vue、Risk.vue、Punch.vue、Admin.vue、ArticleDetailView.vue

## R6 PASSED 修复P2组件与DOM合规（S12/S15/S13/S14/S16/S17 + S3/S4）
结果：15文件修改全部通过——AiChatDialog.vue onUnmounted、chatStore clearMessages、useAuth JWT字段名修正、sseProxy Mock唯一ID、NewsView XSS二次净化、Home try-catch、6页面DisclaimerBar统一、Risk/Punch DOM属性补充。todo.md 标记S3/S4/S12-S17已修复
测试：verify_v6.md PASSED (15/15通过)

---

## R7 PASSED 修复P3一般问题—注释与命名（G1 + G4）
结果：2个P3前端问题修复——main.ts 第12行注释 localStorage→sessionStorage，enumLabels.ts 常量 LABELS→ENUM_LABELS（定义+引用2处）。todo.md 标记 G1/G4 已修复。
测试：verify_v7.md PASSED (修改清单2/2通过)

---
## R8 NEW 修复P3后端日志缺失（G26 + G27）
任务：risk.js parseRiskOutputRegex 正则回退路径添加 console.warn + sseProxy.js timeout/error 回调添加 console.error
选择理由：批次7（13个P3后端问题）的首个任务。G26和G27均为纯日志添加（各+1行），无跨文件依赖，无运行时行为变更。作为后端批次破冰任务，风险最低。
上下文：todo.md 批次7（第506-534行）已列出全部13个后端问题。G26在 risk.js:11-29，G27在 sseProxy.js:89-98。两个文件独立无依赖。G6（admin.js表名白名单）未在S5中修复——get_table_schema（第421行）仍缺少白名单校验。
