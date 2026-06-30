# 实现报告（v6）

## 概述
修复P2批次5的8个组件与DOM合规问题。涉及13个文件，共17个id/data-*属性追加、4处clearMessages()调用替换、6页DisclaimerBar统一、4个独立安全/类型修复。

## 文件变更清单
| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 修改 | src/components/AiChatDialog.vue | S12: 导入onUnmounted + 添加onUnmounted钩子; S15: 替换clearMessages()调用 |
| 修改 | src/stores/chatStore.ts | S15: 新增clearMessages() action函数定义 + return导出 |
| 修改 | src/views/DoctorChatView.vue | S15: 3处替换clearMessages(); S3: 导入DisclaimerBar + 替换内联免责标记 + 删除旧样式 |
| 修改 | src/composables/useAuth.ts | S13: JwtPayload.user_id字段名改为id |
| 修改 | server/services/sseProxy.js | S14: Mock模式动态生成唯一conversation_id/message_id |
| 修改 | src/views/NewsView.vue | S16: 导入sanitizeHtml + highlightKeyword增加文本净化 |
| 修改 | src/views/Home.vue | S17: showDiabetesType包裹try-catch |
| 修改 | src/views/LifePlan.vue | S3: 导入DisclaimerBar + 替换lp-disclaimer + 删除旧样式 |
| 修改 | src/views/Risk.vue | S3: 导入DisclaimerBar + 替换disclaimer-text + 删除旧样式; S4: 添加9个id + 3个data-step + 1个span包裹(risk-level-text) |
| 修改 | src/views/Punch.vue | S3: 导入DisclaimerBar + 替换punch-disclaimer + 删除旧样式; S4: 添加8个id |
| 修改 | src/views/Admin.vue | S3: 导入DisclaimerBar + 替换disclaimer-bar + 删除旧样式 |
| 修改 | src/views/ArticleDetailView.vue | S3: 导入DisclaimerBar + 正文后添加免责声明 |
| 修改 | reviews/202606291800_full_review/todo.md | 标记批次5全部8项为已完成 |

## 编译验证
未执行编译验证（前端Vue项目需浏览器运行时验证）。

## 设计偏差说明
无偏差。所有修改严格按详细设计v6规格执行。

### S4 Risk.vue id与设计文档元素类型偏差（设计已确认）
- **risk-detail-text**: 设计文档指定`<p>`，实际代码使用markdown渲染`<div class="markdown-body">`，id已添加至该div作为语义等价替代。
- **suggestions-list**: 设计文档指定`<ul>`，因markdown v-html动态渲染无法预置id，id已添加至父级`<div class="advice-card">`作为语义等价替代。
- **risk-level-text**: 设计文档定义`<p>`，实际为文本插值表达式，新增`<span id="risk-level-text">`包裹。

### S4 Risk.vue step面板双属性
三个步骤面板同时携带`id="step-N"`和`data-step="N"`双属性。id作为DOM唯一标识符供自动化测试选择器定位，data-step作为步骤编号语义标注，两者角色不同。

## 修订说明（v6 r1）
| 审查意见 | 修改措施 |
|---------|---------|
| S12: 缺少onUnmounted导致SSE泄漏 | 添加onUnmounted(() => chatStore.abortActiveConnection()) |
| S15: 绕过Pinia action追踪 | chatStore新增clearMessages() action，4处调用点替换 |
| S13: JWT Payload字段名不一致 | user_id?: number → id?: number |
| S14: Mock模式固定ID | 动态生成mock-{timestamp}-{random} |
| S16: v-html XSS边缘风险 | highlightKeyword内先sanitizeHtml(text)再正则替换 |
| S17: Unhandled Promise Rejection | showDiabetesType包裹try-catch，catch回退列表项数据 |
| S3: 6页面内联免责标记 | 全部替换为DisclaimerBar组件，删除对应旧scoped样式 |
| S4: Risk+Punch缺DOM锚点 | Risk: 10个目标元素13个属性; Punch: 8个id |
