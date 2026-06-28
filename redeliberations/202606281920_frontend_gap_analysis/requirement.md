# 需求：前端模块实现差距分析与并行开发顺序规划

## 背景

项目是一个"糖尿病预治智能助手"系统，采用 Vue 3 + TypeScript + Vite 前端。现有详细设计文档（`docs/2_detailed_design_v3.md`）定义了完整的前端架构、13个页面组件、7个复用组件、6个Pinia Store、10个API服务模块。

## 任务目标

1. **对照设计文档和现阶段的代码**，逐模块确定哪些功能已经实现、哪些功能尚未实现或存在差距
2. **确定后续开发的并行实现顺序**，识别模块间依赖关系，规划可并行开发的分组

## 参考材料

- 详细设计文档：`/home/derpyIsTheBest/qingruanProject2026/docs/2_detailed_design_v3.md`
  - 第1章：系统架构（含模块划分、路由表、Store 接口、跨组件通信）
  - 第3章：API 接口设计（含完整端点清单、TypeScript 类型契约）
  - 第4章：前端模块详细设计（含各页面组件树、状态管理方案、流程图、CSS 设计系统、交互状态组件）
  - 第5章：Dify 工作流设计

- 现有前端代码：`/home/derpyIsTheBest/qingruanProject2026/src/`
  - `views/` — 13个页面组件（Home.vue, Consultation.vue, DoctorChatView.vue, LifePlan.vue, NewsView.vue, ArticleDetailView.vue, Profile.vue, Risk.vue, Punch.vue, HealthAdvice.vue, Admin.vue, ChangePassword.vue, Login.vue）
  - `components/` — 7个复用组件（TabBar.vue, FabButton.vue, AiChatDialog.vue, SkeletonLoader.vue, ErrorRetry.vue, EmptyState.vue, DisclaimerBar.vue）
  - `stores/` — 6个Pinia Store（authStore.ts, chatStore.ts, homeStore.ts, lifePlanStore.ts, punchStore.ts, riskFormStore.ts）
  - `composables/` — 10个API服务模块（useApi.ts, useAdminApi.ts, useAdviceApi.ts, useArticleApi.ts, useChatApi.ts, useHomeApi.ts, useLifePlanApi.ts, useMarkdown.ts, usePunchApi.ts, useUserApi.ts）
  - `router/index.ts` — Vue Router 4 路由配置（13条路由 + 全局导航守卫）
  - `types/` — TypeScript 类型定义（api.ts, sse.ts）
  - `utils/` — 工具函数（enumLabels.ts, errorMessage.ts, sanitize.ts）

## 设计要求

### 产出物 1：逐模块差距清单

对设计中定义的每个前端模块（页面、Store、组件、composable、utils、基础设施），列出：
- 设计文档要求的功能点
- 当前代码的实现状态（已实现/部分实现/未实现）
- 具体差距描述

### 产出物 2：并行开发分组

基于模块间依赖关系，将待实现的差距项分为可并行开发的组，给出：
- 每个分组包含的模块
- 分组间的依赖关系
- 估计工作量
- 推荐的执行顺序

### 约束

- 必须基于代码实际内容进行分析，而非假设
- 需要阅读对比设计文档和源代码文件
- 重点识别缺失功能、stub/占位实现、与设计文档不一致的偏离