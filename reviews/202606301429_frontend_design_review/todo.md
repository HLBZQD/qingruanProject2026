# 前端代码审查问题汇总 (2026-06-30)

> 来源：审议式2轮×2Agent平行审查（Round 1 功能性遗漏+页面缺失 & 修饰样式不生效 / Round 2 交叉覆盖）
> 审查范围：全部 14 views + 7 components + 6 stores + 13 composables + router/main
> 依据：`docs/2_detailed_design_v4.md` + `docs/prototype.html`
> 审查日期：2026-06-30

---

## 严重问题

### S1. Login.vue 整页依赖 Tailwind，项目未配置 Tailwind 导致登录/注册页样式完全真空

- **位置**：`src/views/Login.vue:94-179`（template 全部）；缺失 `<style scoped>` 块
- **来源**：Round 1 → review_v2 #1；Round 2 → review_v3 #1（独立复核确认）
- **描述**：Login.vue 模板整页使用 Tailwind 工具类构建布局（`min-h-screen bg-[#F5F5F5] flex items-center justify-center`、`w-full bg-gray-100 rounded-full` 等），但项目完全未安装/配置 Tailwind（`package.json` 无 `tailwindcss`、无 `tailwind.config.*`/`postcss.config.*`、`vite.config.ts` 仅 `@vitejs/plugin-vue`）。文件无 `<style scoped>` 兜底块。其余 13 个视图均已改写为 scoped CSS + 自定义类名，唯独 Login.vue 保留原型式 Tailwind 内联类。整页渲染为浏览器默认无样式状态，布局错乱（容器不居中、表单不限宽、按钮无品牌色）、页面不可正常使用。
- **忽略建议**：❌ **不可忽略**。登录/注册为核心入口，样式真空直接影响新用户体验和注册转化。建议优先修复——为 Login.vue 补充 `<style scoped>` 块，用自定义类名 + `var(--color-primary)` 等 CSS 变量复刻设计文档 4.5.2 登录页视觉。

---

## 一般问题

### 功能性遗漏 & 页面缺失（维度一+二，来源：review_v1 & review_v4）

### G1. authStore 持久化使用 sessionStorage，与设计文档「跨会话持久化 localStorage」要求存在矛盾

- **位置**：`src/stores/authStore.ts:57-58`（初始化）、`75-101`（setToken/setAuth）、`156-164`（clearAuth）
- **来源**：Round 1 → review_v1 #1；Round 2 → review_v4 确认
- **描述**：设计文档 4.2 节明确「localStorage：用于跨会话持久化场景（JWT Token、conversation_id）」；3.7 节 authStore 接口注释要求「role 独立持久化到 localStorage key='role'」。但实际实现 token/role/user 均写入 `sessionStorage`（`sessionStorage.setItem('token'/'role'/'user')`）。标签页关闭即清空登录态。设计文档 1.5.1 节 v16 修订说明虽提"切换到 sessionStorage + BroadcastChannel"，但与其他章节矛盾，且 `mustChangePassword` 单独用了 localStorage 形成混用割裂。
- **忽略建议**：⚠️ **可暂缓**，但需在设计文档统一持久化策略描述（明确当前方案为 sessionStorage + BroadcastChannel），或评估改为 localStorage。当前不阻断功能（页面内导航正常），但浏览器重启后用户体验差。

### G2. Home 医生卡片点击未携带 doctorId，首页直达医生对话链路断裂

- **位置**：`src/views/Home.vue:71-74`（`goDoctor()`）、`src/views/Consultation.vue:26-28`
- **来源**：Round 1 → review_v1 #2；Round 2 → review_v4 确认
- **描述**：设计文档 4.3 节 Home 流程图明确 `router.push({path:'/consultation', query:{id: doctorId}})`。Home.vue 的 `goDoctor()` 仅 `router.push('/consultation')`，不传 query。Consultation.vue 不读取 `route.query.id` 来直达医生。原型直接 `router.push('/doctor-chat/'+id)` 跳转对话页。结果：首页点击医生后需在咨询列表页二次点击才能进入对话，快捷链路断裂。
- **忽略建议**：⚠️ **建议修复**。改动小且影响用户常用路径。改为 `router.push('/consultation/doctor/' + doc.id)` 直达对话页（路由 `/consultation/doctor/:id` 已存在）。

### G3. DoctorChatView 消息为空时不展示欢迎语，空对话态无引导内容

- **位置**：`src/views/DoctorChatView.vue:326-354`（模板 v-for 循环间无空态占位）
- **来源**：Round 1 → review_v1 #3；Round 2 → review_v4 确认
- **描述**：设计 4.3 流程图明确"初始化对话视图，展示免责声明栏与欢迎语"，原型展示「您好，我是{医生名}医生」的 AI 欢迎气泡。实际 `chatStore.conversations` 为空时，模板仅渲染空 `<div>` + 输入框，用户看到空白区域无引导。Admin.vue 的 `chat-welcome`（行 177-188）已有引导态实现模式。
- **忽略建议**：⚠️ **建议修复**。改动小且提升引导体验，可参考 Admin.vue 欢迎模板复用。

### G4. chatStore SSE 401 处理强制跳转 `/login` 且不携带 redirect，违反设计"保持对话窗口打开"契约

- **位置**：`src/stores/chatStore.ts:303-319`（`sendStreamRequest` 401 分支）
- **来源**：Round 1 → review_v1 #4；Round 2 → review_v4 确认+补充
- **描述**：设计 4.3 节三个对话流程图均规定 401 → `clearAuth + Toast + 保持对话窗口打开 + 标记需重新登录`。4.4.2 节 useSSE 401 说明明确"保持对话窗口打开""直接返回不进入流式读取"。实际 `sendStreamRequest` 在 401 时执行 `router.push('/login')` 强制离开对话页，且不带 redirect 参数（与 useApi.ts axios 401 拦截器带 redirect 跳转不一致）。补充发现：`sendAssistantMessage`（行 466）和 `sendAdminMessage`（行 512）不经过 `sendMessageWithRetry` 的重试逻辑，与设计 1.5.1 表"断线重连"描述存在偏差。
- **忽略建议**：⚠️ **建议修复**。401 分支仅 `clearAuth()` + Toast，不跳转；为 assistant/admin 模式追加重试逻辑或统一三种模式的错误处理策略。

### G5. 原型"糖尿病类型详情"独立页面未实现，Home"全部"链接为静态不可点击

- **位置**：`src/views/Home.vue:107-138`（`showDiabetesType` 弹窗）、`296-298`（`"全部"` 静态 span）
- **来源**：Round 1 → review_v1 #5；Round 2 → review_v4 确认
- **描述**：原型有独立路由 `/diabetes-type/:id` + `DiabetesTypeDetail` 组件。实际实现改为 SweetAlert2 弹窗展示详情，"全部"链接为 `<span class="section-link-static">` 无点击事件（代码注释"待后续迭代实现糖尿病类型列表页"）。交互行为与原型不一致，"全部"按钮完全失效。
- **忽略建议**：⚠️ **可暂缓**。当前弹窗方案功能可用，但在设计文档 4.1.2 中应明确说明该决策。后续迭代可将"全部"链接接入糖尿病类型列表路由。

### G6. chatStore 接口字段与方法签名与设计 3.7 节定义不一致

- **位置**：`src/stores/chatStore.ts:19`（`conversations` vs 设计 `messages`）、`358-401`（三分支签名 vs 设计统一入口 `sendMessage(text, mode)`）
- **来源**：Round 1 → review_v1 #6；Round 2 → review_v4 确认+补充
- **描述**：设计 ChatState 字段名 `messages`，代码用 `conversations`（设计 v16 修订已承认但未完全统一）。设计 `sendMessage(text: string, mode: 'assistant'|'admin'): Promise<void>` 统一入口，代码拆为 `sendMessage(doctorId, text, token)`/`sendAssistantMessage(text, token)`/`sendAdminMessage(text, token)` 三个方法，签名含 doctorId/token 额外参数。功能链路已全覆盖，但 Store 契约与设计不一致，且三种发送方式的重试/错误策略不统一（仅 doctor 模式有 `sendMessageWithRetry`）。
- **忽略建议**：⚠️ **可暂缓**（不阻断功能）。在设计文档 3.7 节固化当前三分支签名为正式设计，并评估为 assistant/admin 追加重试逻辑。

### G7. NewsView 重复实现免责声明逻辑，未复用 useUI 已抽象的 hasAcceptedDisclaimer/showDisclaimer

- **位置**：`src/views/NewsView.vue:111-127`（本地函数）、`143-147`（直接写 localStorage）
- **来源**：Round 1 → review_v1 #7；Round 2 → review_v4 确认
- **描述**：useUI.ts 已导出 `hasAcceptedDisclaimer`/`showDisclaimer`/`setDisclaimerAccepted`（4.4.4 节设计意图为"统一封装便于复用"）。router/index.ts 与 AiChatDialog.vue 均从 useUI 复用。但 NewsView.vue 在组件内重新定义本地实现（含重复的 Swal.fire 配置），并用 `localStorage.setItem('disclaimer_accepted','true')` 绕过了 `setDisclaimerAccepted`。存在与 useUI 实现漂移的风险。
- **忽略建议**：⚠️ **建议修复**。改动小（删除 16 行本地代码改为 import），消除重复逻辑和漂移风险。

### G8. useApi 导出结构与设计 4.4.1 节 Composable 契约不一致

- **位置**：`src/composables/useApi.ts:53-62`（`useApi()` 返回 `{ api, createCancelToken }`）
- **来源**：Round 1 → review_v1 #8；Round 2 → review_v4 确认
- **描述**：设计 4.4.1 定义 `useApi()` 返回 `{ get, post, put, del, upload }` 五个方法。实际实现导出顶层 `api`（axios 实例）与 `useApi()` 返回 `{ api, createCancelToken }`。所有组件改为 `import { api } from '@/composables/useApi'` 直接调 `api.get/api.post`。功能完整，但 Composable 签名与设计不一致，`upload` 未作为独立方法导出。
- **忽略建议**：✅ **可忽略**。在设计文档 4.4.1 节修订导出形式为顶层 `api` + `createCancelToken` 以对齐实现即可，无需改代码。

### G9. DoctorChatView.vue 未监听 route.params.id 变化，同组件路由参数切换时视图不更新 {NEW}

- **位置**：`src/views/DoctorChatView.vue:203-205`（仅 `onMounted` 调用 `loadDoctor`，无 `watch`）
- **来源**：Round 2 → review_v4 NEW（review_v1 未发现）
- **描述**：设计 4.3 流程图明确规定路由参数变化时需「watch route.params.id 触发 → 调用 abortActiveConnection 中止旧 SSE → 清空消息列表 → 重新初始化对话视图」。实际仅在 `onMounted` 加载医生，无 `watch(() => route.params.id, ...)`。效果：从咨询列表连续切换医生时，Vue Router 复用同一组件实例，消息列表与医生信息不更新——**视图与 URL 不同步**，核心交互链路缺陷。
- **忽略建议**：❌ **不建议忽略**。影响核心对话体验。新增 `watch(() => route.params.id, async (newId) => { loadDoctor(newId) })`，调用 `chatStore.abortActiveConnection()` + 清空消息后重新加载。

### G10. sendAssistantMessage / sendAdminMessage 未实现重试/重连机制

- **位置**：`src/stores/chatStore.ts:458-466`（`sendAssistantMessage`）、`502-512`（`sendAdminMessage`）
- **来源**：Round 2 → review_v4 NEW
- **描述**：设计 1.5.1 表格中 chatStore 描述含"断线重连"能力，chatStore 定义了 `RETRY_CONFIG { maxRetries: 3, delayMs: 1000 }`，但实际仅 doctor 模式的 `sendMessageWithRetry` 使用了重试机制（行 358-401）。`sendAssistantMessage` 和 `sendAdminMessage` 不经过重试逻辑，SSE 连接失败时仅追加错误气泡、无自动重连。三种对话模式的重试策略不对称，与设计"断线重连"承诺偏差。
- **忽略建议**：⚠️ **可暂缓**。当前 assistant/admin 模式失败后有手动重发（用户再点发送）作为容错。后续迭代可统一三种模式的重试逻辑。

### G11. 设计文档 1.6.1 路由映射表缺少 `/news/collections` 路由条目

- **位置**：`docs/2_detailed_design_v4.md:460-475`（设计路由表 13 条不含该路由）；`src/router/index.ts:38-43`（代码已实现）
- **来源**：Round 2 → review_v4 NEW
- **描述**：代码路由表含 `/news/collections`（name: 'NewsCollections'，组件 `CollectionsView.vue`，`meta: { requiresAuth: true }`），在原型中也存在（`/news-favorites`），`.vue` 文件完整实现。但设计文档 1.6.1 路由表未收录此条目——属于**设计文档对已实现功能的遗漏记录**，非代码缺陷。
- **忽略建议**：✅ **可忽略**（设计文档问题，非代码问题）。在文档 1.6.1 表补充该路由项即可。

---

### 修饰样式不生效（维度三，来源：review_v2 & review_v3）

### G12. 全局 .page-enter 动画与原型不一致：缺位移与定制缓动，多页面入场动画视觉降级

- **位置**：定义 `src/styles/animations.css:2-9`（`@keyframes pageEnterFadeIn` 仅淡入无位移）；使用方 `src/views/Punch.vue:241`、`LifePlan.vue:337`、`ArticleDetailView.vue:146`
- **来源**：Round 1 → review_v2 #1；Round 2 → review_v3 确认
- **描述**：原型 `.page-enter` 为 `animation: pageEnter .28s cubic-bezier(0.22, 0.61, 0.36, 1)` + `translateY(10px)` 上滑位移。前端全局动画仅定义了纯淡入 `pageEnterFadeIn`（`from { opacity: 0 }`，无位移、普通 `ease-out`）。Punch/LifePlan/ArticleDetailView 三页入场动画丢失原型的上滑与缓动。Home.vue 通过本地 keyframe `pageEnterHome` 补充了 `translateY(8px)` 上滑，其余三页未补充。
- **忽略建议**：⚠️ **建议修复**。将 `animations.css` 的 `@keyframes pageEnterFadeIn` 改为包含 `translateY(10px)→0` 位移 + `cubic-bezier` 缓动，对齐原型视觉。

### G13. 9 个页面根容器缺失 page-enter 入场动画（原型 16 页均应用，前端仅 4 页应用）

- **位置**：缺失页：`NewsView.vue:303`、`Consultation.vue:36`、`DoctorChatView.vue:213`、`HealthAdvice.vue:87`、`CollectionsView.vue:114`、`ChangePassword.vue:69`、`Admin.vue:151`、`Risk.vue:364`、`Login.vue:94`
- **来源**：Round 1 → review_v2 #2；Round 2 → review_v3 确认
- **描述**：原型全部 16 个页面根容器均加 `class="page-enter"`，前端仅 Home/Punch/LifePlan/ArticleDetailView 4 个使用了该 class。NewsView/Consultation/DoctorChatView 等 9 个视图根容器无 `page-enter` 类也 scoped 内无等价入场动画（Profile 有本地 `profileEnter` 等价替代不计）。9 页页面切换无入场过渡。
- **忽略建议**：⚠️ **可分期修复**。为上述视图根容器逐一追加 `page-enter` 类（G12 动画修复后效果更佳）。

### G14. Risk.vue 风险评分数字未复刻原型 gradient-text 渐变文字

- **位置**：`src/views/Risk.vue:666`（`<span class="gauge-score">` 纯色深灰）；样式 `Risk.vue:1418-1423`
- **来源**：Round 1 → review_v2 #3；Round 2 → review_v3 确认
- **描述**：原型评分数字用 `.gradient-text { background: linear-gradient(135deg, #2563EB, #0EA5E9); -webkit-background-clip: text; }` 渲染蓝→青渐变。前端 Risk.vue 评分用 `.gauge-score { color: var(--color-text-primary) }` 为纯色深灰文字，Risk.vue scoped 内未定义渐变文字类。
- **忽略建议**：⚠️ **建议修复**。在 `.gauge-score` 上叠加 `background: linear-gradient(...); background-clip: text; color: transparent;` 渐变效果。

### G15. Punch.vue 使用未定义的 CSS 变量名（--color-border / --color-text / --color-bg-hover）

- **位置**：`src/views/Punch.vue:306`（`--color-border`）、`:1180`（`--color-text`）、`:1203`（`--color-border`）、`:1213`（`--color-bg-hover`）
- **来源**：Round 1 → review_v2 #4；Round 2 → review_v3 确认
- **描述**：`variables.css`（4.5.1）定义的变量集中无 `--color-border`、`--color-text`、`--color-bg-hover`。均带 fallback 不致布局错乱，但 fallback 硬编码值（`#e0e0e0`/`#ddd`）与设计系统变量（`--color-divider: #E8E8E8`）存在色值偏差，命名不在设计系统内，`#btn-refresh` hover 态 `--color-bg-hover` 回退值与背景色几乎一致（hover 无反馈）。
- **忽略建议**：⚠️ **建议修复**。映射为：`--color-border` → `var(--color-divider)`、`--color-text` → `var(--color-text-primary)`、新增设计系统变量或直接使用已有变量。

### G16. Vant 4 未接入，--van-* 主题映射变量全部无效

- **位置**：`src/assets/variables.css:4294-4316`（20 个 `--van-*` 映射定义）；`package.json`（无 `vant` 依赖）
- **来源**：Round 1 → review_v2 #5；Round 2 → review_v3 确认
- **描述**：设计 4.5.1 节要求安装 Vant 4 用于 TabBar/Punch 日期选择器/Toast/下拉刷新等移动端组件，并定义 20 个 `--van-*` 主题变量映射。实际 `package.json` 无 `vant`，全 `src/` 无 `from 'vant'` 导入。替代方案（手写 `<nav>` TabBar、原生 `<input type="date">`、SweetAlert2 Toast）本身样式生效，但 `--van-*` 映射全部为死代码。
- **忽略建议**：✅ **可忽略**（设计决策偏差，非样式失效）。若维持当前方案，从 `variables.css` 移除 `--van-*` 死代码块；若对齐设计，安装 Vant 4 并迁移相关组件。建议在设计文档中明确最终选型。

### G17. NewsView.vue 搜索高亮 .search-highlight 因 v-html + scoped 隔离完全不生效 {NEW}

- **位置**：定义 `src/views/NewsView.vue:791-795`（scoped 内 `.search-highlight`）；使用 `NewsView.vue:223`（`highlightKeyword` 函数注入 `<mark class="search-highlight">`）、`NewsView.vue:396`（`v-html` 渲染）
- **来源**：Round 2 → review_v3 NEW（review_v2 未发现）
- **描述**：`highlightKeyword()` 将搜索关键词包装为 `<mark class="search-highlight">`，通过 `v-html` 渲染到 `.card-title` 中。`.search-highlight` 定义在 `<style scoped>` 内（`background: #fff3b0; padding: 0 2px; border-radius: 2px`）。但 Vue scoped CSS **不对 v-html 注入的内容添加 data-v-* 属性**，导致 `.search-highlight` 规则完全无法命中 `<mark>` 元素。实际效果：仅浏览器默认 `<mark>` 样式（原生黄色、无圆角、无 padding）生效，自定义高亮样式彻底丢失。
- **忽略建议**：❌ **不建议忽略**。scoped + v-html 隔离是 Vue 经典陷阱。将 `.search-highlight` 改为全局样式（移入 `src/styles/animations.css` 或用 `:global()` 包装）。

### G18. Home.vue 品牌色与设计系统不一致：首页用原型蓝 #2563eb，其余页面用设计 #4A90D9 {NEW}

- **位置**：`src/views/Home.vue:381`（`.home-logo` 渐变）、`:484-492`（`.banner-grad-1/2/3`）；`src/assets/variables.css:2`（`--color-primary: #4A90D9`）
- **来源**：Round 2 → review_v3 NEW
- **描述**：设计系统 `variables.css` 定义品牌主色为 `#4A90D9`（蓝灰调），其余 13 个页面均引用该变量。但 Home.vue 的 logo 渐变和三个 Banner 使用了原型的硬编码蓝色（`#2563eb`、`#0ea5e9`、`#3b82f6` 等），与其余页面视觉色调存在显著偏差。原型主色为 `#2563EB`，设计文档 4.5.1 定义为 `#4A90D9`——两者本就不同，前端在实现时 Home 保留了原型色调，其余页面采纳了设计系统色调，导致不一致。
- **忽略建议**：⚠️ **建议统一**。需做出决策：将 `variables.css` 的 `--color-primary` 改为 `#2563EB`（对齐原型），或将 Home.vue 所有硬编码蓝色改为 `var(--color-primary)` 及其衍生色。

### G19. DoctorChatView/Admin/AiChatDialog 三视图 v-html 渲染 Markdown 但 scoped 缺 :deep() 子元素样式穿透 {NEW}

- **位置**：`src/views/DoctorChatView.vue:351`（v-html 无 :deep()）、`src/views/Admin.vue:199`（v-html 无 :deep()）、`src/components/AiChatDialog.vue:172`（v-html 无 :deep()）
- **来源**：Round 2 → review_v3 NEW
- **描述**：三个聊天视图均通过 v-html 渲染 Markdown 消息内容，scoped CSS 中仅定义了 `.msg-content` 自身的基础样式（padding/border-radius），未使用 `:deep()` 为 Markdown 生成的子元素（`<p>`、`<ul>`、`<ol>`、`<code>`、`<blockquote>`）提供排版规则。对比：ArticleDetailView（364-404 行）、HealthAdvice（289-306 行）、Punch（768-773 行）、LifePlan（957-963 行）、Risk（1488-1513 行）均正确使用了 `:deep()` 为 Markdown 内容提供段落间距/列表缩进。Chat 页 Markdown 将依赖浏览器默认样式（`<p>` margin:1em、`<ul>` padding-left:40px），段落间距与行高与设计预期偏差，影响消息可读性。
- **忽略建议**：⚠️ **建议修复**。为三视图 `.msg-content` 补充 `:deep(p)`、`:deep(ul)`、`:deep(ol)`、`:deep(li)`、`:deep(code)` 等排版规则，对齐其他页面的 Markdown 渲染标准。

---

## 统计

| 来源 | 严重 | 一般 |
|------|:---:|:---:|
| Round 1 — review_v1（功能遗漏+页面缺失） | 0 | 8 |
| Round 1 — review_v2（修饰样式不生效） | 1 | 5 |
| Round 2 — review_v3（样式交叉覆盖） | 1（同 v2） | 9（4 确认 + 5 新） |
| Round 2 — review_v4（功能/页面交叉覆盖） | 0 | 11（8 确认 + 3 新） |
| 去重合并后 | **1** | **19** |

**严重 1 项**（样式真空导致登录页布局错乱不可用）  
**一般 19 项**（功能链路偏差/交互遗漏 11 项 + 样式不生效/降级 8 项）  
**总计 20 个问题**

### 优先级建议

| 优先级 | 问题编号 | 原因 |
|--------|----------|------|
| P0 立即修复 | S1 | 登录页样式完全真空，新用户无法正常使用注册/登录 |
| P1 尽快修复 | G9, G4, G2, G17 | 核心交互链路影响（路由参数不同步、401 踢出、医生直达断裂、搜索高亮失效） |
| P2 本迭代修复 | G3, G14, G12, G15, G18, G19 | 用户体验/视觉质量影响（欢迎引导、渐变文字、动画降级、变量命名、品牌色、Markdown 排版） |
| P3 可后续迭代 | G1, G5, G6, G7, G8, G10, G11, G13, G16 | 设计偏差/文档同步/非功能阻断（持久化策略、类型详情页、Store 契约、免责声明复用 Vant 选型等） |
