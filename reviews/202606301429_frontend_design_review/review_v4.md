# R4: 维度一（功能性遗漏）+ 维度二（页面缺失）— Round 2 交叉验证 review_v1

审查时间：2026-06-30

### 审查范围

逐条对照 `docs/2_detailed_design_v4.md`（4.1 组件树 / 4.2 状态管理 / 4.3 流程图 / 3.7 Store 接口 / 4.4 Composables / 1.5 跨模块通信 / 1.8 中英转换 / 1.6.1 路由映射表）与 `docs/prototype.html`，独立核查以下前端源码：

- `src/router/index.ts`、`src/App.vue`、`src/main.ts`
- `src/stores/`：authStore.ts、chatStore.ts、homeStore.ts、lifePlanStore.ts、punchStore.ts、riskFormStore.ts
- `src/composables/`：useApi.ts、useSSE.ts、useAuth.ts、useUI.ts、useMarkdown.ts、及 7 个 use*Api.ts
- `src/views/`：Home、Consultation、DoctorChatView、LifePlan、NewsView、ArticleDetailView、CollectionsView、Profile、Risk、Punch、HealthAdvice、Admin、ChangePassword、Login（14 个页面全部读取）
- `src/components/`：AiChatDialog、DisclaimerBar、EmptyState、ErrorRetry、FabButton、SkeletonLoader、TabBar
- `src/utils/enumLabels.ts`

### 全局核查结论（与 review_v1 一致）

1. **路由完备性**：实际路由表 12 条（含 404 兜底），设计文档 1.6.1 规定 13 条 + 404。多出 1 条路由 `/news/collections`（CollectionsView.vue）在设计文档 1.6.1 中未收录但代码与原型均已实现——属设计文档遗漏，非代码遗漏。
2. **Store 实现**：6 个 Store 文件的 action/state 与设计 3.7 节基本一致，关键 action（registerAbortController、abortActiveConnection、clearAllConversations、navigate、toggleFab）均已实现。`chatStore` 额外扩展了 `historyLoading`/`historyError`/`conversationHistory` 状态用于历史会话功能，属增量实现。
3. **Composable 实现**：useApi/useSSE/useAuth/useUI 均已实现且功能覆盖设计要点。enumLabels 字典与 `enumLabel()` 函数已实现（`src/utils/enumLabels.ts`），在 LifePlan/Punch 等页面正确调用。跨模块通信（1.5 节）通过 Pinia Store + BroadcastChannel 实现。
4. **交互状态组件**：4.6 节规定的 SkeletonLoader/EmptyState/ErrorRetry/DisclaimerBar 均有对应 .vue 文件且在各页面中实际投入使用。
5. **嵌套路由**：`/profile` 下 risk/punch/advice 的 `<router-view />` 正确挂载（Profile.vue:287 `v-if="isSubRouteActive"`），子路由活跃时隐藏主菜单、子页面铺满视图。

---

### 发现

---

#### [一般] DoctorChatView.vue 未监听 `route.params.id` 变化，同组件路由参数切换时视图不更新（NEW）

- **位置**：`src/views/DoctorChatView.vue:203-205`（仅 onMounted 调用 loadDoctor，无 watch）
- **描述**：设计文档 4.3 节 DoctorChatView 流程图明确规定：
  ```
  W[路由参数变化 /consultation/doctor/1 → /consultation/doctor/2 同组件复用 onUnmounted 不触发]
    → W1[watch route.params.id 触发]
    → W2[调用 chatStore.abortActiveConnection 中止旧医生的 SSE 连接]
    → W3[清空消息列表 重新初始化对话视图]
  ```
  实际实现仅在 `onMounted`（行 203）中调用 `loadDoctor()`，**无任何 `watch(() => route.params.id, ...)` 监听**。结果：当用户在咨询列表页从医生 A 导航至医生 B（`/consultation/doctor/1` → `/consultation/doctor/2`），Vue Router 复用同一组件实例，`onUnmounted` 不触发，`onMounted` 不重新触发，旧医生的聊天消息和头像持续显示而 URL 已指向新医生——**视图与路由参数不同步**。
- **影响**：从 Consultation 列表页连续切换医生时，消息列表和医生信息不更新，用户看到的是错误的医生对话上下文。同时在路由守卫层面不触发免责声明重判（因路由已放行）。属于核心交互链路问题。
- **建议**：新增 `watch(() => route.params.id, (newId, oldId) => { if (newId !== oldId) loadDoctor() })`，调用 `loadDoctor()` 重新加载医生详情 → `chatStore.switchDoctor(id)` 中止旧 SSE + 清空消息，对齐设计流程图 W1→W2→W3 分支。

---

#### [一般] authStore 持久化使用 sessionStorage，与设计文档 4.2/3.7 规定存在局部矛盾

- **位置**：`src/stores/authStore.ts:57-58`（初始化）、`75-101`（setToken/setAuth）、`156-164`（clearAuth）
- **与 review_v1 一致性**：与 review_v1 #1 结论一致，独立验证确认。补充以下细节：
  - 设计文档 3.7 节 authStore 接口注释称"role 独立持久化到 localStorage key='role'"、1.5.2 节伪代码亦用 localStorage。但 1.5.1 节 v16 修订说明明确"存储介质由 localStorage 切换为 sessionStorage，通过 BroadcastChannel 实现跨标签页同步"。
  - 当前实现使用 sessionStorage + BroadcastChannel（`qrzl_auth_sync` 频道），`syncFromStorage()` 通过 REQUEST_AUTH 协议向其他标签页请求认证数据。`mustChangePassword` 使用 localStorage（`must_change_password` 键）。
  - 实际影响：sessionStorage 在标签页关闭即清空，浏览器重启后登录态丢失。虽通过 BroadcastChannel 实现了跨标签页同步，但 `must_change_password` 单独使用 localStorage 形成了"混用两种介质"的割裂状态。设计文档不同章节的矛盾表述（3.7 vs 1.5.1）需统一。
- **建议**：在设计文档中统一持久化策略描述（明确当前为 sessionStorage + BC 方案）；或评估改为 localStorage 以满足"跨会话持久化"的设计意图。

---

#### [一般] Home 医生卡片点击未携带医生 ID，Consultation 未消费 query.id，首页直达医生对话链路断裂

- **位置**：`src/views/Home.vue:71-74`（`goDoctor()`）、`src/views/Consultation.vue:26-28`（`goToChat()`）
- **与 review_v1 一致性**：与 review_v1 #2 结论一致，独立验证确认。
- **描述**：设计文档 4.3 节 Home 流程图明确 `router.push({path:'/consultation', query:{id: doctorId}})`。Home.vue 的 `goDoctor()` 仅执行 `router.push('/consultation')`，不传 query。Consultation.vue 不读取 `route.query.id` 来预选或直达医生。原型 `goDoctor(id)` 直接 `router.push('/doctor-chat/' + id)` 直达对话。结果：首页点击医生仅到达咨询列表页，无法快捷直达该医生对话，与设计及原型交互不符。
- **建议**：Home.vue 点击改为 `router.push('/consultation/doctor/' + doc.id)`；或在 Consultation.vue onMounted 中检测 `route.query.id` 存在时自动跳转。

---

#### [一般] DoctorChatView 消息为空时不展示欢迎语，空对话态无引导内容

- **位置**：`src/views/DoctorChatView.vue:326-354`（模板 v-for 循环）
- **与 review_v1 一致性**：与 review_v1 #3 结论一致，独立验证确认。
- **描述**：当 `loading` 和 `doctorError` 均为 false、`chatStore.conversations` 为空时，模板仅渲染 `<div ref="messagesContainer">` 和 `<div v-if="chatStore.isStreaming" class="typing-indicator">`，**中间无任何内容**。用户看到的是空白消息区域 + 免责声明条 + 输入框，缺乏引导。设计文档 4.3 节流程图明确"初始化对话视图，展示免责声明栏与**欢迎语**"，原型在首次进入时插入 AI 欢迎气泡。Admin.vue 的 `chat-welcome`（行 177-188）已实现引导态，DoctorChatView 未实现等价内容。
- **建议**：在消息列表为空时渲染欢迎引导（如"您好，我是{doctor.name}医生，可以描述您的症状或血糖数据"），对齐 Admin.vue 引导态的设计模式。

---

#### [一般] chatStore SSE 401 处理强制跳转 `/login` 且未带 redirect，违反设计"保持对话窗口打开"契约

- **位置**：`src/stores/chatStore.ts:303-319`（`sendStreamRequest` 401 分支）
- **与 review_v1 一致性**：与 review_v1 #4 结论一致，独立验证确认。
- **补充观察**：
  - 设计文档 4.3 节 DoctorChatView/Admin/AiChatDialog 流程图均规定 401 → `clearAuth + Toast + 保持对话窗口打开 + 标记需重新登录`。4.4.2 节 useSSE 401 处理说明亦明确"保持对话窗口打开""直接返回不进入流式读取"。
  - 实际 `sendStreamRequest` 在 401 时执行 `router.push('/login')`（行 318），**不带 redirect 参数**。对比 useApi.ts:44-47 的 Axios 401 拦截器，正确携带了 `redirect` 参数（`router.push('/login?redirect=' + redirect)`）。
  - 影响：用户在医生对话/AI 助手/管理员对话中遭遇 401 时被强制踢出当前视图，且登录后无法回跳到原对话页。
  - 额外注意：`sendAssistantMessage`（行 466）和 `sendAdminMessage`（行 512）**不经过 `sendMessageWithRetry`**的重试逻辑，且错误处理中未实现重连机制（仅追加失败气泡），与设计 1.5.1 节表格中 chatStore 的"断线重连"描述存在偏差。
- **建议**：401 分支仅 `clearAuth()` + Toast 提示，不调用 `router.push('/login')`；保持对话窗口打开以保留已接收文本。

---

#### [一般] 原型"糖尿病类型详情"独立页面未实现，"全部"链接为静态不可点击

- **位置**：`src/views/Home.vue:107-138`（`showDiabetesType`）、`296-298`（`"全部"链接`）
- **与 review_v1 一致性**：与 review_v1 #5 结论一致，独立验证确认。
- **描述**：原型存在独立路由 `/diabetes-type/:id` + DiabetesTypeDetail 组件（`docs/prototype.html:1447`）。实际实现改为 SweetAlert2 弹窗展示详情，且"全部"链接为 `<span class="section-link-static">` 静态文本不可点击（代码注释"待后续迭代实现糖尿病类型列表页"）。设计方案以弹窗替代了原型的独立页面，但未经设计文档明确说明，导致与原型交互行为不一致，"全部"按钮失效。
- **建议**：如保留弹窗方案，在设计文档 4.1.2 中明确说明决策；或将"全部"链接接入糖尿病类型列表路由。

---

#### [一般] chatStore 接口字段与方法签名与设计 3.7 节定义不一致

- **位置**：`src/stores/chatStore.ts:19`（`conversations` vs 设计 `messages`）、`358-401`（`sendMessage/sendAssistantMessage/sendAdminMessage` 三分支 vs 设计 `sendMessage(text, mode)` 统一入口）
- **与 review_v1 一致性**：与 review_v1 #6 结论一致，独立验证确认。补充：
  - 设计 3.7 节 v16 修订已记录"`messages` 在代码中实际命名为 `conversations`"，本表同步更新——设计文档已承认该差异，但字段名仍写 `messages: Message[]`，前后不统一。
  - `sendMessage` 设计签名为 `(text: string, mode: 'assistant' | 'admin'): Promise<void>`，未涵盖 doctor 模式。实际 doctor 模式使用 `sendMessage(doctorId, text, token)` 含额外参数。`sendMessageWithRetry`、`sendAssistantMessage`、`sendAdminMessage` 三种发送方式的重试/错误策略不统一（仅 doctor 有重试），与设计 1.5.1 表格的"断线重连"承诺存在偏差。
- **建议**：统一命名并固化当前三分支签名到设计文档；评估是否为 assistant/admin 模式追加重试逻辑。

---

#### [一般] NewsView 重复实现免责声明逻辑，未复用 useUI 已抽象的 hasAcceptedDisclaimer/showDisclaimer/setDisclaimerAccepted

- **位置**：`src/views/NewsView.vue:111-127`（本地函数）、`143-147`（`handleGenerate` 中调用）
- **与 review_v1 一致性**：与 review_v1 #7 结论一致，独立验证确认。
- **描述**：useUI.ts 已导出 `hasAcceptedDisclaimer`/`showDisclaimer`/`setDisclaimerAccepted`（4.4.4 节设计意图为"统一封装便于复用"）。router/index.ts 与 AiChatDialog.vue 均从 useUI 导入复用。但 NewsView.vue 在组件内重新定义了本地的 `hasAcceptedDisclaimer()`（行 111-113）与 `showDisclaimer()`（行 115-127），含重复的 Swal.fire 免责声明配置，并在 `handleGenerate` 中直接用 `localStorage.setItem('disclaimer_accepted', 'true')`（行 146）而非调用 `setDisclaimerAccepted(true)`。逻辑与 useUI 实现存在漂移风险（如 4.4.4 节免责文案更新后此处不同步）。
- **建议**：删除 NewsView 本地实现，改为从 useUI 导入复用；`handleGenerate` 中用 `setDisclaimerAccepted(true)` 写入。

---

#### [一般] useApi 导出结构与设计 4.4.1 节 Composable 契约不一致

- **位置**：`src/composables/useApi.ts:53-62`（`useApi()` 返回 `{ api, createCancelToken }`）
- **与 review_v1 一致性**：与 review_v1 #8 结论一致，独立验证确认。
- **建议**：在设计文档 4.4.1 节中修订导出形式为顶层 `api` + `createCancelToken`；`upload` 方法通过 `api.post(url, formData, { headers: {'Content-Type': undefined} })` 实现，设计可据此补充说明。

---

#### [一般] 设计文档 1.6.1 路由映射表缺少 `/news/collections` 路由条目（NEW）

- **位置**：`docs/2_detailed_design_v4.md:460-475`（设计路由表，13 条不含 `/news/collections`）；`src/router/index.ts:38-43`（实际路由，含 `/news/collections`）
- **描述**：设计文档 1.6.1 路由映射表列出 13 条 + 404 兜底路由。实际路由表（`src/router/index.ts`）包含 `/news/collections`（name: 'NewsCollections'，组件 `CollectionsView.vue`，`meta: { requiresAuth: true }`），该路由在原型中存在（`docs/prototype.html:1446` `/news-favorites`），在代码中对应 `src/views/CollectionsView.vue` 页面完整实现。但设计文档 1.6.1 表格**未收录此路由**——属于设计文档对已实现功能的遗漏记录。
- **影响**：不构成代码问题，但导致设计文档与代码/原型的路由集不一致，后续对照审查时产生困惑。
- **建议**：在设计文档 1.6.1 表中补充 `/news/collections` 路由项（meta.requiresAuth: true, meta.requiresAdmin: false, 说明: "我的收藏"）。

---

#### [轻微] useUI.showToast 签名与设计 4.4.4 不一致，且各视图均未使用 useUI toast 工具

- **位置**：`src/composables/useUI.ts:36`（`showToast(options: ToastOptions)` 对象参数）；各视图各自内联 Swal.fire toast 调用
- **与 review_v1 一致性**：与 review_v1 #9 结论一致，独立验证确认。
- **补充**：经逐视图核对，LifePlan.vue:292-300、DoctorChatView.vue:72-80、Admin.vue:54-56、Profile.vue:78-84、CollectionsView、ArticleDetailView 等处均各自内联 `Swal.fire({ toast: true, ... })`，无一处调用 useUI 的 `showSuccess/showError/showInfo` 便捷函数。useUI 的 toast 抽象形同虚设，违反 4.4.4 节"统一封装便于复用"的设计意图。
- **建议**：各视图 toast 调用改为复用 useUI 的 `showSuccess/showError/showInfo`；或承认当前内联方案并在设计文档中移除 useUI toast 抽象。

---

#### [轻微] Login 注册成功后未展示设计流程图要求的"注册成功"SweetAlert2 提示

- **位置**：`src/views/Login.vue:80-84`（`handleRegister`）
- **与 review_v1 一致性**：与 review_v1 #10 结论一致，独立验证确认。
- **描述**：设计文档 4.3 节 Login 流程图注册分支明确"成功 201 → setAuth 自动登录 → **SweetAlert2 提示'注册成功'** → router.push"。实际 `handleRegister` 仅 `authStore.setAuth(...)` 后 `router.replace(safeRedirect(...))`，无任何成功提示即静默跳转，用户无注册成功反馈。
- **建议**：在 setAuth 成功后、跳转前调用 `showSuccess('注册成功')`。

---

#### [轻微] Home 医生卡片缺少设计 4.1.2 组件树指定的独立"立即咨询"按钮

- **位置**：`src/views/Home.vue:233-249`（医生卡片模板）
- **与 review_v1 一致性**：与 review_v1 #11 结论一致，独立验证确认。
- **描述**：设计文档 4.1.2 节 Home 组件树明确医生卡片含 `<button class="consult-btn" data-doctor="id">立即咨询</button>`。实际实现整卡 `@click="goDoctor"`，无独立按钮。功能上整卡可点击可达，但与组件树定义存在偏差。
- **建议**：在卡片内补齐"立即咨询"按钮元素以对齐组件树定义，或在设计文档中修订组件树移除该按钮。

---

### 本轮统计

| 严重程度 | 数量 | 与 review_v1 关系 |
|---------|------|-------------------|
| 严重 | 0 | — |
| 一般 | 11 | 确认 review_v1 #1~#8（8 条）；新增 3 条独立发现 |
| 轻微 | 3 | 确认 review_v1 #9~#11（3 条） |

**本轮独立新发现（3 条一般）：**
- [一般] DoctorChatView.vue 未监听 `route.params.id` 变化，同组件路由参数切换时视图不更新（设计 4.3 流程图规定但未实现）
- [一般] 设计文档 1.6.1 路由映射表缺少 `/news/collections` 路由条目（代码与原型已实现但设计未记录）
- [一般] `sendAssistantMessage`/`sendAdminMessage` 未实现重试/重连机制（与设计 1.5.1 表格"断线重连"及 chatStore RETRY_CONFIG 的 doctor 专属重试不对称）

### 总评

本轮独立覆盖维度一（功能性遗漏）与维度二（页面缺失），逐页对照设计文档 4.1.1~4.1.12 组件树、4.2 状态管理、4.3 流程图、3.7 Store 接口、4.4 Composables、1.5 跨模块通信、1.8 中英转换、1.6.1 路由映射表与实际源码，对 review_v1 的 8 条一般 + 3 条轻微问题做了完整交叉验证——所有 11 项经独立确认均存在。

**严重问题 0 项**：14 个页面全部有对应的 .vue 文件，13+1 条路由全部注册，6 个 Store 关键 action 齐全，4.6 节交互状态组件均已实现并投入使用，无页面完全缺失或核心链路完全断裂的严重问题。

**14 项问题中最关键的 4 项**（影响实际用户交互链路）：
1. **DoctorChatView 路由参数变化不监听**（本次新发现）——从医生列表连续切换医生时，消息列表不更新、视图与 URL 不同步，这是 review_v1 未发现的遗漏，属于功能缺陷。
2. **chatStore 401 处理强制跳转且不携带 redirect**——用户在对话中遭遇 Token 过期时被踢出，且登录后无法回跳。
3. **Home→医生对话直达链路断裂**——首页点击医生仅跳转到咨询列表，需二次点击才能进入对话。
4. **DoctorChatView 空对话无欢迎引导**——用户进入对话页时看到空白区域，缺乏引导。

其余问题集中在"实现与设计文档的细节偏差"：authStore 持久化介质（sessionStorage vs localStorage 设计矛盾）、DiabetesType 详情以弹窗替代独立页面、chatStore/useApi 接口签名与设计不一致、NewsView 重复实现 useUI 免责声明、设计文档路由表遗漏 `/news/collections`、assistant/admin 模式无重试机制等。

整体而言，代码实现的功能覆盖面广（14 页齐全、6 Store 完备、Composable 覆盖完整），问题集中在少数交互细节的偏差和设计文档与代码的同步滞后，而非系统性功能遗漏。
