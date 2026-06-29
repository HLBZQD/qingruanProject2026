# 全量代码审查范围

> 审查日期：2026-06-29
> 审查依据：`docs/2_detailed_design_v4.md` + `docs/prototype.html`
> 审查原则：仅关注代码与设计文档的一致性，不涉及性能优化、架构重构等超出设计文档范围的内容

## 审查对象（全部已实现模块）

### 前端 Vue 视图层（src/views/）
- Home.vue — 系统首页
- Consultation.vue — 医师咨询列表
- DoctorChatView.vue — 医师对话
- LifePlan.vue — 生活方案
- NewsView.vue — 健康资讯列表
- ArticleDetailView.vue — 文章详情
- Profile.vue — 个人中心
- Risk.vue — 风险预测
- Punch.vue — 打卡记录
- HealthAdvice.vue — 健康建议
- Admin.vue — 智能管理
- ChangePassword.vue — 强制密码修改
- Login.vue — 登录/注册
- CollectionsView.vue — 收藏列表

### 前端组件层（src/components/）
- TabBar.vue — 底部导航栏
- FabButton.vue — FAB悬浮按钮
- AiChatDialog.vue — AI助手对话弹窗
- SkeletonLoader.vue — 骨架屏
- ErrorRetry.vue — 错误重试
- EmptyState.vue — 空数据引导
- DisclaimerBar.vue — 医学免责标识条

### 前端状态管理（src/stores/）
- authStore.ts — 登录态管理
- chatStore.ts — AI对话状态
- riskFormStore.ts — 风险预测表单
- homeStore.ts — 首页数据缓存
- lifePlanStore.ts — 生活方案管理
- punchStore.ts — 打卡记录与分析

### 前端组合式函数（src/composables/）
- useApi.ts — API请求封装
- useAuth.ts — JWT认证工具
- useSSE.ts — SSE流式请求
- useUI.ts — UI工具
- useMarkdown.ts — Markdown渲染
- useHomeApi.ts — 首页API
- useLifePlanApi.ts — 方案API
- usePunchApi.ts — 打卡API
- useChatApi.ts — 对话API
- useArticleApi.ts — 文章API
- useAdviceApi.ts — 建议API
- useAdminApi.ts — 管理API
- useUserApi.ts — 用户API

### 前端类型/工具/路由/样式
- src/types/api.ts, models.ts, sse.ts — 类型定义
- src/utils/enumLabels.ts, sanitize.ts, helpers.ts, errorMessage.ts
- src/router/index.ts — 路由配置
- src/assets/variables.css, src/styles/animations.css
- src/main.ts, src/App.vue

### 后端 Express（server/）
- server.js — 启动入口
- server/app.js — Express配置
- server/routes/*.js — 14个路由模块
- server/middleware/*.js — 3个中间件
- server/services/*.js — Dify服务/SSE代理
- server/db/*.js — 数据库层

### 配置文件
- package.json, vite.config.ts, tsconfig*.json, vitest.config.ts
- .env, .env.example, index.html

## 设计文档关键章节索引

| 章节 | 内容 | 审审重点 |
|------|------|---------|
| 1.1-1.3 | 系统架构、技术选型 | 架构一致性 |
| 1.4 | 模块划分与依赖 | 文件结构一致性 |
| 1.5 | 跨模块通信机制 | Store/通信模式 |
| 1.6 | 前端路由详细设计 | 路由表、守卫逻辑 |
| 1.8 | 数据字段映射与枚举转换 | enumLabels 映射 |
| 2 | 数据库详细设计 | DDL/ER图一致性 |
| 3 | API接口详细设计 | 端点/请求响应格式 |
| 4 | 前端模块详细设计 | 组件树/流程/U型图 |
| 5 | Dify工作流配置 | 字段映射契约 |
| 6 | 部署详细设计 | 部署配置 |
| 7 | 安全详细设计 | 安全措施实现 |
| 8 | 验收标准清单 | 功能完整性 |

## 审查轮次

共3轮审查，由2个子Agent分2个批次并行执行：

| 批次 | 轮次 | 审查维度 | 执行Agent | 输出文件 |
|------|------|---------|----------|---------|
| Batch 1 | Round 1 | 设计合规性 — 代码实现是否与设计文档一致 | Agent A | `review_v1.md` |
| Batch 1 | Round 2 | 代码质量与类型安全 — TypeScript/Vue3最佳实践 | Agent B | `review_v2.md` |
| Batch 2 | Round 3 | 集成一致性 — 跨模块通信、路由、API契约、端到端数据流 | Agent A | `review_v3.md` |

## 输出规范

每个 review_v*.md 需包含：
1. 审查维度说明
2. 按模块组织的问题列表，每个问题含：
   - 问题编号（如 R1-S1, R2-G3）
   - 严重程度（严重/一般）
   - 位置（文件:行号）
   - 设计文档依据（章节号）
   - 问题描述
   - 建议修复

3. 审查结论与统计
