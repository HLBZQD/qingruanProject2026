# 审查范围界定 — 前端代码 vs 详细设计/原型

## 流程信息

- 时间戳：202606301429
- workdir：`C:\Users\DELL\Desktop\qingruanProject2026\reviews\202606301429_frontend_design_review\`
- project_root：`C:\Users\DELL\Desktop\qingruanProject2026`
- 审查依据：`docs/2_detailed_design_v4.md`（详细设计 v4）、`docs/prototype.html`（界面交互原型）
- 审查边界：**只关注前端代码与设计文档/原型的对照**，不涉及后端、不涉及纯代码风格偏好

## 审查对象

前端代码全部位于项目根 `src/`：

| 类别 | 范围 |
|------|------|
| 页面组件 (14) | `src/views/`：Home、Consultation、DoctorChatView、LifePlan、NewsView、ArticleDetailView、CollectionsView、Profile、Risk、Punch、HealthAdvice、Admin、ChangePassword、Login |
| 公共组件 (7) | `src/components/`：AiChatDialog、DisclaimerBar、EmptyState、ErrorRetry、FabButton、SkeletonLoader、TabBar |
| Store (6) | `src/stores/`：authStore、chatStore、homeStore、lifePlanStore、punchStore、riskFormStore |
| Composables (13) | `src/composables/`：useApi、useSSE、useAuth、useUI、useMarkdown、useHomeApi、useLifePlanApi、usePunchApi、useArticleApi、useChatApi、useAdminApi、useAdviceApi、useUserApi |
| 路由/入口 | `src/router/index.ts`、`src/App.vue`、`src/main.ts` |
| 类型/工具 | `src/types/`、`src/utils/`、`src/assets/variables.css`、`src/styles/animations.css` |

## 审查维度（用户指定三个）

### 维度一：功能性遗漏
对照设计文档 4.1（组件树）、4.2（状态管理方案）、4.3（JS 逻辑流程图）、3.7（Store 接口定义）、3.8（TypeScript 类型契约）、4.4（Composables 设计），检查：
- 各页面是否实现了设计文档流程图要求的完整交互链路（如缓存读写、默认筛选值、联动请求、状态共享、错误降级）
- Store action / state 字段是否与 3.7 节定义一致，是否有遗漏的 action
- Composable 函数是否与 4.4 节设计一致（useApi/useSSE/useAuth/useUI）
- 跨模块通信机制（1.5 节 Store 共享 / 事件总线替代 postMessage）是否落实
- 数据字段映射与中英转换（1.8 节）是否实现
- 与原型交互行为是否一致（点击/跳转/弹窗/分页/无限滚动/SSE 流式）

### 维度二：页面缺失
对照设计文档 1.6.1 路由映射表 + 4.1 组件树 + 原型页面清单，检查：
- 路由表是否包含设计文档要求的全部路由（13 条 + 404 兜底）
- 每个设计文档描述的页面/视图是否都有对应的 .vue 文件实现
- 原型中出现的独立页面（如"我的收藏""糖尿病类型详情""AI助手对话弹窗"）是否有对应实现
- 页面内的子区块/引导态/空态/错误态是否齐全（对照 4.6 交互状态组件）
- 嵌套路由的 `<router-view />` 是否正确挂载

### 维度三：修饰样式不生效
对照设计文档 4.5（CSS 设计系统：变量定义 variables.css、组件样式规范）、4.6（交互状态组件样式）、原型视觉，检查：
- `<style scoped>` 中定义的样式是否被跨组件引用（如动画 keyframes、`.press`、`.page-enter` 在使用方未定义导致失效）
- CSS 变量（4.5.1 定义）是否被实际使用 / 是否有变量名拼写不一致导致失效
- 全局样式（`src/assets/variables.css`、`src/styles/animations.css`）是否在 main.ts 正确导入，未被 scoped 隔离
- Tailwind 类名与原型对照是否有遗漏或视觉降级（如渐变文字、环形图、阴影、圆角）
- 动画 class（page-enter 等）的 keyframes 定义位置与使用位置是否匹配
- 公共组件（EmptyState/ErrorRetry/SkeletonLoader 等）样式是否与 4.6 设计一致且生效

## 严重程度

- **严重**：逻辑错误、功能性遗漏导致核心链路断裂、页面完全缺失、样式不生效导致页面不可用/布局错乱、安全风险
- **一般**：设计不合理、违反设计文档但可绕过、部分样式/交互与原型偏差但不阻断使用、错误处理不完善
- **轻微**：可读性改进、性能优化、更好实践方式（本轮不作为重点，可少量记录）

## 审查编排

- **2 轮评审**，每轮启动 2 个子 Agent 并行（共 4 份 review_v*.md）
- Round 1：Agent A 负责维度一+二（功能性遗漏/页面缺失），Agent B 负责维度三（修饰样式不生效）
- Round 2：两 Agent 交换维度再各做一轮，形成交叉覆盖与去重校验
- 全部完成后，主 Agent 将 review_v1~v4 中**严重和一般**问题去重整理到 `todo.md`，保留字段：题目、位置、描述、忽略建议

## 排除范围

- 后端 server/ 代码（本次仅前端）
- 已在前序审查（reviews/202606271219_frontend_review 等）中修复并 commit 的问题，若仍存在则需重新记录，但可标注历史来源
- 纯个人代码风格偏好（命名风格、注释密度等），除非与设计文档冲突
