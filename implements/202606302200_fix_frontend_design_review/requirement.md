# 需求：修复前端设计审查问题

## 来源

审议式2轮×2Agent平行审查发现的前端问题汇总，详见 `reviews/202606301429_frontend_design_review/todo.md`。

## 审查依据

- 详细设计文档：`docs/2_detailed_design_v4.md`
- 页面原型：`docs/prototype.html`

## 已完成修复（4项，本轮无需处理）

- **S1**：Login.vue 整页依赖 Tailwind → 已改写为 scoped CSS
- **G4**：chatStore SSE 401 处理强制跳转 /login → 已移除 router.push('/login')
- **G2**：Home 医生卡片点击未携带 doctorId → 已改为 router.push('/consultation/doctor/' + doc.id)
- **G17**：NewsView 搜索高亮 scoped + v-html 隔离 → 已改为 :global(.search-highlight)

## 待修复问题（6项 P2 本迭代修复）

### G3. DoctorChatView 消息为空时不展示欢迎语
- **位置**：`src/views/DoctorChatView.vue:326-354`
- **描述**：设计 4.3 流程图规定"初始化对话视图，展示免责声明栏与欢迎语"。chatStore.conversations 为空时，模板仅渲染空 `<div>` + 输入框。Admin.vue 的 `chat-welcome`（行 177-188）已有引导态实现模式可参考。
- **修复**：在消息列表空态时展示欢迎引导内容（医生名 + 欢迎文案），参考 Admin.vue welcome 模式。

### G12. 全局 .page-enter 动画与原型不一致
- **位置**：`src/styles/animations.css:2-9`
- **描述**：原型 `.page-enter` 为 `animation: pageEnter .28s cubic-bezier(0.22, 0.61, 0.36, 1)` + `translateY(10px)` 上滑位移。前端全局动画仅 `pageEnterFadeIn` 纯淡入无位移。
- **修复**：将 `@keyframes pageEnterFadeIn` 改为包含 `translateY(10px)→0` 位移 + `cubic-bezier` 缓动。

### G14. Risk.vue 风险评分数字未复刻原型 gradient-text 渐变文字
- **位置**：`src/views/Risk.vue:1418-1423`（`.gauge-score`）
- **描述**：原型评分数字用 `.gradient-text { background: linear-gradient(135deg, #2563EB, #0EA5E9); -webkit-background-clip: text; }` 渲染蓝→青渐变。前端为纯色深灰 `color: var(--color-text-primary)`。
- **修复**：在 `.gauge-score` 上叠加 `background: linear-gradient(135deg, var(--color-primary), #0EA5E9); background-clip: text; -webkit-background-clip: text; color: transparent;`。

### G15. Punch.vue 使用未定义的 CSS 变量名
- **位置**：`src/views/Punch.vue:306`（`--color-border`）、`:1180`（`--color-text`）、`:1203`（`--color-border`）、`:1213`（`--color-bg-hover`）
- **描述**：`variables.css` 中无 `--color-border`、`--color-text`、`--color-bg-hover`。均带 fallback 不致布局错乱，但与设计系统变量有偏差。
- **修复**：映射为 `--color-border` → `var(--color-divider)`、`--color-text` → `var(--color-text-primary)`、`--color-bg-hover` → `var(--color-bg)`。

### G18. Home.vue 品牌色与设计系统不一致
- **位置**：`src/views/Home.vue:381`（`.home-logo` 渐变）、`:484-492`（`.banner-grad-1/2/3`）
- **描述**：设计系统 `--color-primary: #4A90D9`，其余 13 页面均引用该变量。但 Home.vue 的 logo 渐变和 Banner 使用硬编码蓝色（`#2563eb`、`#0ea5e9`、`#3b82f6` 等）。
- **修复**：将 Home.vue 的 `.home-logo` 渐变和 `.banner-grad-1/2/3` 改为使用 `var(--color-primary)` 及其衍生色系。

### G19. DoctorChatView/Admin/AiChatDialog 三视图 v-html 渲染 Markdown 缺 :deep() 子元素样式穿透
- **位置**：`src/views/DoctorChatView.vue:351`、`src/views/Admin.vue:199`、`src/components/AiChatDialog.vue:172`
- **描述**：三聊天视图通过 v-html 渲染 Markdown，scoped CSS 仅定义 `.msg-content` 基础样式，未用 `:deep()` 为 Markdown 子元素提供排版规则。ArticleDetailView、HealthAdvice、Punch、LifePlan、Risk 均正确使用 `:deep()`。
- **修复**：为三视图 `.msg-content` 补充 `:deep(p)`、`:deep(ul)`、`:deep(ol)`、`:deep(li)`、`:deep(code)`、`:deep(blockquote)` 等排版规则。

## 技术栈

- Vue 3 + TypeScript + Pinia
- 构建工具：Vite
- CSS：scoped CSS + CSS 变量设计系统（`src/assets/variables.css`）
- 图标：Font Awesome 6
