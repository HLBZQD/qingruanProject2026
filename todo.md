# 前端待办任务清单

> 依据：`docs/2_detailed_design_v3.md` §1.4 模块划分，于 2026-06-28 对比实际代码生成。

---

## P1 — 占位页面（4 个）

| # | 文件 | 设计描述 | 当前状态 |
|:--:|------|---------|:---:|
| V1 | `src/views/NewsView.vue` | 健康资讯列表（文章卡片流 + 分页加载） | 6 行空壳 |
| V2 | `src/views/HealthAdvice.vue` | 健康建议列表 | 6 行空壳 |
| V3 | `src/views/ChangePassword.vue` | 管理员强制密码修改页（表单 + 新旧密码校验） | 6 行空壳 |
| V4 | `src/views/Admin.vue` | 智能管理后台（SQL 控制台 + 用户管理） | 6 行空壳 |

## P2 — 公共组件（7 个）

| # | 文件 | 设计描述 | 备注 |
|:--:|------|---------|------|
| C1 | `src/components/TabBar.vue` | 底部 5 Tab 导航栏（首页/咨询/生活方案/资讯/我的） | 当前内嵌在 App.vue 中，需抽取 |
| C2 | `src/components/FabButton.vue` | FAB 悬浮按钮（position: fixed，触发 AI 弹窗） | 全局 AI 助手入口 |
| C3 | `src/components/AiChatDialog.vue` | AI 助手对话弹窗（遮罩覆盖 + SSE 流式 + Markdown） | 依赖 chatStore |
| C4 | `src/components/SkeletonLoader.vue` | 骨架屏组件（通用 loading 占位） | Consultation.vue 等场景已自实现，需统一 |
| C5 | `src/components/ErrorRetry.vue` | 错误重试组件（错误消息 + 重试按钮） | 统一各页面的错误态 |
| C6 | `src/components/EmptyState.vue` | 空数据引导组件（图标 + 提示文案 + 操作按钮） | 统一各页面的空态 |
| C7 | `src/components/DisclaimerBar.vue` | 医学免责标识条（页面底部固定提示） | 当前免责仅在路由守卫弹窗 |

## P3 — 基础设施（6 个）

| # | 文件 | 设计描述 | 备注 |
|:--:|------|---------|------|
| I1 | `src/composables/useAuth.ts` | JWT 认证工具（Token 读写、解析、过期检测） | 当前逻辑分散在 authStore + useApi 中 |
| I2 | `src/composables/useSSE.ts` | SSE 流式请求封装（通用，非业务特定） | 当前 SSE 逻辑内嵌在 chatStore 中 |
| I3 | `src/composables/useUI.ts` | UI 工具（Toast 提示、Loading 状态） | |
| I4 | `src/utils/helpers.ts` | 日期格式化、防抖节流等通用工具函数 | 当前散落在各 View 中 |
| I5 | `src/types/models.ts` | 业务实体类型定义（User, Doctor, Article, LifePlan, PunchRecord 等） | 当前类型分散在 api.ts / sse.ts |
| I6 | `src/styles/variables.css` + `src/styles/common.css` | CSS 变量定义（设计系统）+ 公共组件样式 | 当前仅有 animations.css |

## 汇总

| 优先级 | 类别 | 数量 | 预估工时 |
|:---:|------|:---:|:---:|
| P1 | 占位页面 | 4 | 12-20h |
| P2 | 公共组件 | 7 | 14-24h |
| P3 | 基础设施 | 6 | 4-8h |
| **合计** | | **17** | **30-52h** |
