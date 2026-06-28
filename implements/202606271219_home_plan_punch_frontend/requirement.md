# 任务：系统首页 + 生活方案 + 打卡记录模块前端实现

## 任务来源
用户要求启用审议式实现，分阶段拆分完成三个模块的前端设计实现。

## 输入文档（子agent 自行阅读，路径绝对化）
- 需求分析：`docs/1_requirements_analysis_v2.md`
- 详细设计：`docs/2_detailed_design_v3.md`
- 前端原型：`docs/prototype.html`

## 项目技术栈（子agent 自行阅读 `package.json`、`vite.config.ts`、`tsconfig.json`、`src/` 现有代码确认）
- Vue 3.5 + TypeScript + Vite 8 + Pinia 3 + Vue Router 4
- UI：SweetAlert2（弹窗）、DOMPurify + marked（富文本净化）、axios（HTTP）
- 后端：Express + JWT + better-sqlite3 + Dify AI（前端通过 axios 调用）
- 已有视图：`src/views/` 下已有 Home.vue / LifePlan.vue / Punch.vue 等（需确认现状，可能为骨架）

## 实现范围（三个模块）

### 模块 1：系统首页（Home）
- 顶部导航 / 用户信息 / 登录态展示
- 功能入口卡片（风险评估、生活方案、智能助手、健康文章、打卡记录等）
- 首页数据概览（今日打卡、健康指标摘要）
- 响应式布局，贴合 prototype.html 视觉

### 模块 2：生活方案（LifePlan）
- 生活方案列表 / 详情展示
- 方案生成（调用后端 plan 接口，对接 Dify 工作流）
- 方案条目分类展示（饮食、运动、作息等）
- 方案保存 / 引用打卡

### 模块 3：打卡记录（Punch）
- 打卡日历 / 列表视图
- 新增打卡（选择方案条目、记录数值、备注）
- 打卡统计（连续天数、完成率）
- 历史记录查看 / 删除

## 硬性要求
1. **必须分阶段拆分实现任务** — Planner 应将三个模块拆为独立可交付任务，每个模块内部再拆分（视图/状态/接口/样式）
2. **贴合 prototype.html** — 视觉与交互以原型为准，不臆造设计
3. **复用现有约定** — `src/router/`、`src/stores/`、`src/utils/`、`src/composables/`、`src/types/`、`src/styles/` 既有结构必须遵守
4. **类型安全** — TypeScript strict，禁用 any（除非边界明确）
5. **API 调用** — 走 axios，路径 `/api/...`，JWT token 从 authStore 取；不硬编码 URL
6. **安全** — 任何富文本输出必经 DOMPurify.sanitize；v-html 仅用于已净化内容
7. **不破坏后端** — 仅前端实现，不改 `server/`

## 验收标准
- `npx vue-tsc --noEmit -p tsconfig.app.json` 零错误
- 三个模块路由可达、交互完整、视觉贴合原型
- Pinia store 状态管理清晰、API 调用集中
- 代码符合现有项目风格（中英混排注释、命名约定）

## 子agent 指令文件位置
- `docs/skill/deliberative-harness/deliberative-implementation/planner.md`
- `docs/skill/deliberative-harness/deliberative-implementation/plan_reviewer.md`
- `docs/skill/deliberative-harness/deliberative-implementation/designer.md`
- `docs/skill/deliberative-harness/deliberative-implementation/design_reviewer.md`
- `docs/skill/deliberative-harness/deliberative-implementation/coder.md`
- `docs/skill/deliberative-harness/deliberative-implementation/code_reviewer.md`
- `docs/skill/deliberative-harness/deliberative-implementation/verifier.md`
- `docs/skill/deliberative-harness/deliberative-implementation/test_reviewer.md`
- `docs/skill/deliberative-harness/deliberative-implementation/runner.md`

项目根目录：`C:\Users\DELL\Desktop\qingruanProject2026`
