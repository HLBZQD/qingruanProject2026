# R1: 维度一（功能性遗漏）+ 维度二（页面缺失）

审查时间：2026-06-30

## 审查范围

逐条对照 `docs/2_detailed_design_v4.md`（4.1 组件树 / 4.2 状态管理 / 4.3 流程图 / 3.7 Store 接口 / 4.4 Composables / 1.5 跨模块通信 / 1.8 中英转换 / 1.6.1 路由映射表）与 `docs/prototype.html`，核查以下前端源码：

- `src/router/index.ts`、`src/App.vue`、`src/main.ts`
- `src/stores/`：authStore.ts、chatStore.ts、homeStore.ts、lifePlanStore.ts、punchStore.ts、riskFormStore.ts
- `src/composables/`：useApi.ts、useSSE.ts、useAuth.ts、useUI.ts（及其余 use*Api.ts）
- `src/views/`：Home、Consultation、DoctorChatView、LifePlan、NewsView、ArticleDetailView、CollectionsView、Profile、Risk、Punch、HealthAdvice、Admin、ChangePassword、Login
- `src/components/`：AiChatDialog、DisclaimerBar、EmptyState、ErrorRetry、FabButton、SkeletonLoader、TabBar
- `src/utils/enumLabels.ts`

## 发现

#### [一般] authStore 持久化使用 sessionStorage，违反设计文档「JWT Token / role 写入 localStorage」要求
- **位置**：`src/stores/authStore.ts:57-58`、`75-101`、`156-164`
- **描述**：设计文档 4.2 节明确「localStorage：仅用于跨会话持久化场景（JWT Token、conversation_id）」；3.7 节 authStore 接口注释亦要求「role 独立持久化到 localStorage key='role'」「login() 同时将 role 写入 localStorage('role')」。实际实现 token/role/user 三字段均写入 `sessionStorage`（`sessionStorage.setItem('token'/'role'/'user')`）。sessionStorage 在标签页关闭即清空，导致关闭浏览器/标签页后登录态丢失，违反「跨会话持久化」的设计意图（虽通过 BroadcastChannel 解决了跨标签页同步，但无法解决浏览器重启后恢复登录态）。
- **建议**：将 token/role/user 的持久化键由 sessionStorage 改为 localStorage（保留 BroadcastChannel 跨标签页同步机制），或在设计文档中修订该持久化策略并说明理由。

#### [一般] Home 医生卡片点击跳转未携带医生 ID，Consultation 未消费 query.id，首页直达医生对话链路断裂
- **位置**：`src/views/Home.vue:71-74`、`src/views/Consultation.vue:26-28`
- **描述**：设计文档 4.3 节 Home.vue 流程图明确「绑定'立即咨询'按钮事件 → router.push({path:'/consultation', query:{id: doctorId}})」。Home.vue 的 `goDoctor()` 仅 `router.push('/consultation')`，代码注释自述「不带 query，不臆造对话页」。同时 Consultation.vue 的 `goToChat(doctorId)` 仅由列表卡片触发，未读取 `route.query.id` 来预选/直达医生。原型 `goDoctor(id)` 直接 `router.push('/doctor-chat/' + id)` 直达对话。结果：用户在首页点击某医生卡片后仅到达咨询列表页，无法直达该医生对话，与设计流程图及原型交互不符。
- **建议**：Home.vue 医生卡片点击改为 `router.push({ path: '/consultation/doctor/' + doc.id })` 直达对话页（路由已存在），或在 Consultation.vue `onMounted` 中读取 `route.query.id` 存在时直接 `router.push('/consultation/doctor/'+id)`。

#### [一般] DoctorChatView 缺少初始欢迎语，空对话态无任何引导内容
- **位置**：`src/views/DoctorChatView.vue:326-354`
- **描述**：设计文档 4.3 节 DoctorChatView 流程图明确「初始化对话视图，展示免责声明栏与欢迎语」；原型 DoctorChat（prototype.html:591）在首次进入时插入 AI 欢迎气泡「您好，我是{医生名}医生，请问有什么可以帮您？...」。实际实现当 `loading`/`doctorError` 均为否且 `chatStore.conversations` 为空时，`<template v-else>` 不渲染任何内容，仅显示免责声明条与输入框，用户看到一片空白，缺乏引导。
- **建议**：在消息列表为空时渲染一条 AI 欢迎气泡（如「您好，我是{doctor.name}医生，可以描述您的症状、用药情况或血糖数据」），与 Admin.vue 的 `chat-welcome` 引导态保持一致。

#### [一般] chatStore SSE 401 处理强制跳转 /login 且未带 redirect，违反设计「保持对话窗口打开」契约
- **位置**：`src/stores/chatStore.ts:303-319`
- **描述**：设计文档 4.3 节 DoctorChatView/Admin.vue/AiChatDialog 流程图均规定 401 分支为「authStore.clearAuth + Toast 登录已过期 + 保持对话窗口打开 + 标记需要重新登录」，4.4.2 节 useSSE 401 说明亦明确「保持对话窗口打开（不关闭当前对话视图）」「直接返回不进入流式读取」。实际 `sendStreamRequest` 在 401 时执行 `router.push('/login')` 强制离开当前对话页，且未携带 redirect 参数（与 useApi.ts:44-47 的 axios 401 拦截器带 redirect 跳转不一致）。导致用户在医生对话/AI 助手/管理员对话中遭遇 401 时被强制踢出当前视图，且登录后无法回跳原对话页。
- **建议**：401 分支仅 `clearAuth()` + Toast 提示，不调用 `router.push('/login')`；由用户再次发送消息时引导登录（或通过 `showLoginRequired()` 带 redirect 跳转），保持对话窗口打开以保留已接收文本。

#### [一般] 原型「糖尿病类型详情」独立页面未实现，Home「全部」链接为静态不可点
- **位置**：`src/views/Home.vue:296-298`、`107-138`
- **描述**：原型（prototype.html:1447）存在独立路由 `/diabetes-type/:id`（DiabetesTypeDetail 组件），Home 糖尿病类型卡片点击 `router.push('/diabetes-type/' + type.id)` 进入详情页。实际实现改为 SweetAlert2 弹窗展示详情（`showDiabetesType`），且「全部」链接为 `<span class="section-link-static">` 静态文本不可点击（代码注释「待后续迭代实现糖尿病类型列表页」）。scope.md 维度二明确要求核查原型「糖尿病类型详情/列表」是否有对应实现。当前以弹窗替代独立页面，且无列表入口，「全部」按钮失效。
- **建议**：如保留弹窗方案，应在设计文档中明确说明以弹窗替代原型独立页面的决策；或将「全部」链接接入糖尿病类型列表路由。当前为设计与原型交互的不一致。

#### [一般] chatStore 接口字段与方法签名与设计 3.7 节定义不一致
- **位置**：`src/stores/chatStore.ts:19`（conversations）、`358-401`（sendMessage）
- **描述**：设计文档 3.7 节 ChatState 定义 `messages: Message[]`，实际实现命名为 `conversations`（组件均改读 `chatStore.conversations`）；设计 `sendMessage(text: string, mode: 'assistant' | 'admin'): Promise<void>` 统一入口，实际拆分为 `sendMessage(doctorId, text, token)`、`sendAssistantMessage(text, token)`、`sendAdminMessage(text, token)` 三个方法且签名包含 doctorId/token 参数。功能链路已覆盖（DoctorChatView 调 sendMessageWithRetry、AiChatDialog 调 sendAssistantMessage、Admin 调 sendAdminMessage），但 Store 契约与 3.7 节定义的字段名/方法签名不一致，影响「Store action/state 字段是否与定义一致」的对照核查。
- **建议**：统一命名（或将 `conversations` 在设计文档中修订为正式字段名）；评估是否回归 3.7 节的统一 `sendMessage(text, mode)` 入口，或在设计文档中固化当前三分支签名。

#### [一般] NewsView 重复实现免责声明逻辑，未复用 useUI 已抽象的 hasAcceptedDisclaimer/showDisclaimer
- **位置**：`src/views/NewsView.vue:111-127`、`143-147`
- **描述**：useUI.ts 已抽象 `hasAcceptedDisclaimer`/`showDisclaimer`/`setDisclaimerAccepted`（4.4.4 节设计意图即为「统一封装到本 composable，便于复用」），router/index.ts 与 AiChatDialog.vue 均从 useUI 导入复用。NewsView.vue 却在组件内重新定义本地 `hasAcceptedDisclaimer()` 与 `showDisclaimer()`（含重复的 Swal.fire 免责声明配置），并在 `handleGenerate` 中直接 `localStorage.setItem('disclaimer_accepted','true')` 而非调用 `setDisclaimerAccepted`。逻辑重复且易与 useUI 实现漂移。
- **建议**：删除 NewsView 本地实现，改为 `import { hasAcceptedDisclaimer, showDisclaimer, setDisclaimerAccepted } from '@/composables/useUI'`，调用 `setDisclaimerAccepted(true)` 写入。

#### [一般] useApi 导出结构与设计 4.4.1 节 Composable 契约不一致
- **位置**：`src/composables/useApi.ts:53-62`
- **描述**：设计文档 4.4.1 节定义 `useApi()` 返回 `{ get, post, put, del, upload }` 五个方法（组件通过 `useApi().get(url, params)` 调用）。实际实现导出顶层 `api`（axios 实例）与 `useApi()` 返回 `{ api, createCancelToken }`，全项目组件改为直接 `import { api } from '@/composables/useApi'` 后 `api.get/api.post`。功能完整（请求拦截、401 处理、upload 通过 api.post 传递 FormData 实现），但 Composable 函数签名与 4.4.1 节设计不一致，且 `upload` 未作为独立方法导出。
- **建议**：在设计文档中修订 4.4.1 节导出形式以对齐实际实现（顶层 `api` + `createCancelToken`），或补齐 `useApi().get/post/put/del/upload` 包装。

#### [轻微] useUI.showToast 签名与设计 4.4.4 不一致，且各视图均未使用 useUI toast 工具
- **位置**：`src/composables/useUI.ts:36`、`157-174`
- **描述**：设计 4.4.4 节 `showToast(message: string, type, duration)` 三参数签名；实际为 `showToast(options: ToastOptions)` 对象参数。更主要的是全项目 14 个 view 组件均未调用 useUI 的 `showToast/showSuccess/showError/showWarning/showInfo`，而是各自内联 `Swal.fire({ toast:true, ... })` 重复实现 toast（见 LifePlan.vue:292-300、DoctorChatView.vue:72-80、Admin.vue:54-56 等）。useUI 的 toast 抽象形同虚设，违反 4.4.4 节「统一封装便于复用」的设计意图。
- **建议**：各视图 toast 调用改为复用 useUI 的 `showSuccess/showError/showInfo`；或承认当前内联实现并在设计文档中移除 useUI toast 抽象。

#### [轻微] Login 注册成功后未展示设计流程图要求的「注册成功」SweetAlert2 提示
- **位置**：`src/views/Login.vue:72-90`
- **描述**：设计文档 4.3 节 Login.vue 流程图注册分支明确「成功 201 → setAuth 自动登录 → SweetAlert2 提示'注册成功' → router.push」。实际 `handleRegister` 仅 `authStore.setAuth(...)` 后 `router.replace(safeRedirect(...))`，未弹出「注册成功」提示即跳转，用户无注册成功反馈。
- **建议**：在 setAuth 成功后、跳转前调用 `showSuccess('注册成功')`（或 Swal.fire success toast）。

#### [轻微] Home 医生卡片缺少设计 4.1.2 组件树指定的独立「立即咨询」按钮
- **位置**：`src/views/Home.vue:233-249`
- **描述**：设计文档 4.1.2 节 Home 组件树明确医生卡片结构含 `<button class="consult-btn" data-doctor="id">立即咨询</button>`。实际实现医生卡片仅整体 `@click="goDoctor"`，无独立「立即咨询」按钮，与组件树定义存在偏差（功能上整卡可点可达，影响轻微）。
- **建议**：在医生卡片内补齐「立即咨询」按钮元素以对齐组件树，或在设计文档中修订组件树移除该按钮。

## 本轮统计

| 严重程度 | 数量 |
|---------|------|
| 严重 | 0 |
| 一般 | 8 |
| 轻微 | 3 |

## 总评

本轮覆盖维度一（功能性遗漏）与维度二（页面缺失）。整体而言，14 个页面 .vue 文件、13+1 条路由（含新增 /news/collections）、6 个 Store、7 个公共组件、13 个 Composables 均已齐备，4.6 节交互状态组件（骨架屏/空态/错误重试/免责条）均有对应实现并实际投入使用，1.8 节 enumLabels 中英转换字典与 enumLabel 函数已实现且在 LifePlan/Punch 等页面正确调用，3.7 节三个核心 Store 的关键 action（registerAbortController/abortActiveConnection/clearAllConversations/navigate/toggleFab 等）与 sessionStorage 缓存策略（Home 1h / LifePlan 30min / News 5min / riskForm sessionStorage）均已落实，路由守卫的 requiresAuth/requiresAdmin/requiresDisclaimer 拦截与设计 1.6.2 节一致。未发现页面完全缺失或核心链路断裂的「严重」问题。

主要问题集中在「实现与设计文档契约的细节偏差」：authStore 持久化介质（sessionStorage vs localStorage）违反 4.2 节明确要求；Home→医生对话的快捷直达链路因未携带 doctorId 而断裂；DoctorChatView 缺少设计/原型均要求的初始欢迎语；chatStore 的 401 处理强制跳转而非保持对话窗口；原型糖尿病类型详情独立页未实现；chatStore/useApi 的接口签名与 3.7/4.4.1 节定义不一致；NewsView 重复实现 useUI 已抽象的免责声明逻辑。建议优先处理前 4 项（影响用户实际交互链路），后 4 项为契约一致性问题，可通过修订设计文档或重构对齐。
