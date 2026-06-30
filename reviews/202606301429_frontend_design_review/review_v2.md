# R2: 维度三 — 修饰样式不生效

审查时间：2026-06-30

### 审查范围

依据 `docs/2_detailed_design_v4.md` 4.5（CSS 设计系统）、4.6（交互状态组件设计）与 `docs/prototype.html` 视觉实现，对照检查以下前端源码：

- `src/main.ts`、`src/App.vue`
- `src/assets/variables.css`、`src/styles/animations.css`
- `src/views/`：Home.vue、Punch.vue、LifePlan.vue、ArticleDetailView.vue、Risk.vue、Profile.vue、NewsView.vue、Consultation.vue、DoctorChatView.vue、HealthAdvice.vue、CollectionsView.vue、Login.vue、ChangePassword.vue、Admin.vue
- `src/components/`：AiChatDialog.vue、DisclaimerBar.vue、EmptyState.vue、ErrorRetry.vue、FabButton.vue、SkeletonLoader.vue、TabBar.vue
- 配置：`package.json`、`vite.config.ts`、`index.html`（全局样式导入链 / Tailwind / Vant 配置核查）

### 全局样式导入链核查结论（无问题项，先予说明）

1. `src/main.ts:5-6` 正确全局导入 `./assets/variables.css` 与 `./styles/animations.css`，且在 `createApp(App)` 之前、组件挂载之前导入，导入顺序正确，未被 scoped 隔离。
2. `variables.css` 中 `:root` 变量定义在全局，各组件 `<style scoped>` 内 `var(--xxx)` 可正常解析（scoped 不隔离 CSS 变量）。
3. `animations.css` 定义全局 `.page-enter`、`.press:active`，在 `main.ts` 全局导入，凡模板使用 `class="...press"` / `class="...page-enter"` 的组件均可命中全局规则（已逐文件核对，无"定义在使用方 scoped 内导致失效"的跨组件隔离问题）。
4. `variables.css` 定义的 `--van-*` Vant 主题映射变量（4.5.1 节）虽存在，但项目未安装 Vant（见下文发现 1），这些变量属于定义未使用，不影响既有样式生效。

### 发现

#### [严重] Login.vue 全量依赖 Tailwind 工具类但项目未配置 Tailwind，整页样式不生效
- **位置**：`src/views/Login.vue:94-179`（template 全部）；缺失 `<style>` 块
- **描述**：Login.vue 模板整页使用 Tailwind 工具类构建布局与视觉，如根容器 `class="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center px-6"`（行 94）、`class="w-full max-w-sm"`（行 95）、标题 `class="text-2xl font-bold text-[#4A90D9]"`（行 100）、输入框 `class="w-full bg-gray-100 rounded-full px-4 py-3 outline-none text-sm focus:ring-2 focus:ring-[#4A90D9]"`（行 110/117/147/154/161）、按钮 `class="w-full bg-[#4A90D9] text-white py-3 rounded-xl font-medium hover:bg-[#3A7BC8] transition disabled:opacity-50"`（行 123/167）等。但 `package.json` 的 dependencies/devDependencies 均无 `tailwindcss`，项目根无 `tailwind.config.*`、无 `postcss.config.*`（已 Glob 确认），`vite.config.ts` 仅注册 `@vitejs/plugin-vue`，`index.html` 也未引入 Tailwind CDN（原型 `docs/prototype.html:9` 用 `cdn.tailwindcss.com`，前端未沿用）。该文件无 `<style scoped>` 块兜底。结果：这些类名无任何 CSS 规则匹配，登录/注册页渲染为浏览器默认无样式状态——容器不居中、无最小高度、表单不限宽、输入框为默认灰色边框、按钮为默认系统按钮、标题为默认黑色文本，**页面布局错乱、不可正常使用**。
- **使用位置**：`src/views/Login.vue:94`（及 95/100/101/104/110/117/119/123/129/130/137/138/141/147/154/161/163/167/173/174）
- **定义位置**：未定义（Tailwind 未安装/未配置，无对应规则）
- **失效原因**：设计文档 4.5.2 组件样式规范以 Tailwind 类名组合描述（主按钮 `bg-primary text-white px-6 py-2 rounded-xl ...`、输入框 `w-full bg-gray-100 rounded-full ...`），但前端工程未接入 Tailwind；其余 13 个视图均改用 `<style scoped>` + 自定义类名复刻视觉，唯独 Login.vue 仍保留原型式 Tailwind 内联类且无 scoped 兜底，导致整页样式真空。
- **建议**：为 Login.vue 补充 `<style scoped>` 块，用自定义类名 + CSS 变量（`var(--color-primary)` 等）复刻设计 4.5.2 的登录页视觉（全屏居中容器、max-w-sm 卡片、圆角输入框、品牌色按钮），与其它视图保持一致的 scoped CSS 范式；或在工程层面接入 Tailwind（安装 `tailwindcss` + 配置 `tailwind.config`/`postcss.config` 并在入口引入），但前者改动更小、与现有架构更一致。

#### [一般] 全局 .page-enter 动画与原型不一致，多页面入场动画视觉降级
- **位置**：`src/styles/animations.css:7-9`（定义）；使用方 `src/views/Punch.vue:241`、`src/views/LifePlan.vue:337`、`src/views/ArticleDetailView.vue:146`
- **描述**：原型 `.page-enter` 为 `animation: pageEnter .28s cubic-bezier(0.22, 0.61, 0.36, 1)`，关键帧 `from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); }`（`docs/prototype.html:45` 及关键帧定义），即 280ms 淡入 + 10px 上滑 + 定制缓动。前端全局 `animations.css` 的 `.page-enter` 为 `animation: pageEnterFadeIn 0.4s ease-out`，关键帧仅 `from { opacity: 0; } to { opacity: 1; }`（纯淡入、无位移、普通缓动）。Punch/LifePlan/ArticleDetailView 直接用全局类，丢失原型的上滑与缓动效果，入场动画视觉与原型存在偏差（仅淡入、无上滑）。Home.vue 通过 `.page-enter.home-page { animation-name: pageEnterHome }` + `@keyframes pageEnterHome`（行 345-359）本地追加 `translateY(8px)` 上滑，保留了位移效果，其余三页未保留。
- **使用位置**：`src/views/Punch.vue:241`、`src/views/LifePlan.vue:337`、`src/views/ArticleDetailView.vue:146`
- **定义位置**：`src/styles/animations.css:2-9`
- **失效原因**：全局关键帧 `pageEnterFadeIn` 未复刻原型 `pageEnter` 的 `translateY` 位移与 `cubic-bezier` 缓动。
- **建议**：将 `animations.css` 的 `@keyframes pageEnterFadeIn` 改为包含 `translateY(10px)→0` 的位移，并将 `.page-enter` 的 `animation` 计时改为 `0.28s cubic-bezier(0.22, 0.61, 0.36, 1)` 以对齐原型；或为 Punch/LifePlan/ArticleDetailView 各自追加类似 Home.vue 的本地关键帧覆盖。

#### [一般] 多个页面缺失 page-enter 入场动画（原型 16 页均应用，前端仅 4 页应用）
- **位置**：缺失页：`src/views/NewsView.vue:303`（`<div class="news-list-container">`）、`src/views/Consultation.vue:36`、`src/views/DoctorChatView.vue:213`、`src/views/HealthAdvice.vue:87`、`src/views/CollectionsView.vue:114`、`src/views/ChangePassword.vue:69`、`src/views/Admin.vue:151`、`src/views/Risk.vue:364`（`<div class="risk-page">`）、`src/views/Login.vue:94`；对比已应用页：Home/Punch/LifePlan/ArticleDetailView
- **描述**：原型对全部 16 个页面根容器均加 `class="page-enter ..."`（`docs/prototype.html:411/528/561/622/766/812/861/893/935/982/1055/1107/1249/1311/1336/1403`）。前端仅 Home/Punch/LifePlan/ArticleDetailView 4 个视图根容器带 `page-enter`。NewsView/Consultation/DoctorChatView/HealthAdvice/CollectionsView/ChangePassword/Admin/Risk/Login 共 9 个视图根容器无 `page-enter` 类，且其 `<style scoped>` 内也无任何页面入场动画（已核对：这些文件仅含内部元素动画如 `pulse`/`msg-enter`/`typing-bounce`/`expand-enter`，无页面级 enter 关键帧）。Profile.vue 根容器虽无 `page-enter`，但用本地 `animation: profileEnter 0.35s ease-out`（行 430）提供了等价入场动画，不计入缺失。结果：上述 9 页切换时无入场过渡，与原型存在视觉偏差（不阻断使用）。
- **使用位置**：上述 9 个视图根容器（未使用 `page-enter`）
- **定义位置**：`src/styles/animations.css:7`（全局已定义，未被这些页面引用）
- **失效原因**：页面根容器未加 `page-enter` 类，全局动画未触发。
- **建议**：为上述 9 个视图根容器追加 `page-enter` 类（并按发现 2 对齐原型位移/缓动后效果更佳）。

#### [一般] Risk.vue 风险评分数字未复刻原型 gradient-text 渐变文字
- **位置**：`src/views/Risk.vue:666`（`<span id="risk-score" class="gauge-score">`）；样式 `src/views/Risk.vue:1418-1423`
- **描述**：原型风险结果页评分数字使用 `<span class="font-bold gradient-text">{{result.score}}</span>`（`docs/prototype.html:1202`），通过全局 `.gradient-text { background: linear-gradient(135deg, #2563EB, #0EA5E9); -webkit-background-clip: text; ... -webkit-text-fill-color: transparent; }`（`docs/prototype.html:69`）渲染为蓝→青渐变文字。前端 Risk.vue 的评分用 `.gauge-score { color: var(--color-text-primary); }`（行 1418-1423），为纯色深灰文字，未应用渐变。Risk.vue 的 `<style scoped>` 内未定义 `.gradient-text`，模板也未使用该类，渐变文字效果丢失。
- **使用位置**：`src/views/Risk.vue:666`
- **定义位置**：未定义（Risk.vue 未定义 `.gradient-text`，亦未引用全局/他处定义）
- **失效原因**：Risk.vue 评分元素使用 `.gauge-score` 纯色样式，未引入渐变文字类。
- **建议**：在 Risk.vue 的 `.gauge-score` 上叠加渐变文字效果（`background: linear-gradient(135deg, var(--color-primary), #38BDF8); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;`），或在 scoped 内定义 `.gradient-text` 并加到该元素，对齐原型视觉。

#### [一般] Punch.vue 使用未定义的 CSS 变量名（--color-border / --color-text / --color-bg-hover），偏离设计系统命名
- **位置**：`src/views/Punch.vue:306`（`stroke="var(--color-border, #e0e0e0)"`）、`src/views/Punch.vue:1203`（`border: 1px solid var(--color-border, #ddd)`）、`src/views/Punch.vue:1180`（`fill: var(--color-text, #333)`）、`src/views/Punch.vue:1213`（`background: var(--color-bg-hover, #f5f5f5)`）
- **描述**：`variables.css`（4.5.1）定义的变量集中无 `--color-border`、`--color-text`、`--color-bg-hover`（已比对全部 `var(--*)` 引用与 `variables.css` 定义集，仅这 3 个属"使用未定义"且非局部自定义属性）。这 3 个变量均带内联 fallback 值（`#e0e0e0`/`#ddd`/`#333`/`#f5f5f5`），故不会导致布局错乱，但 fallback 硬编码值与设计系统变量（`--color-divider`=#E8E8E8、`--color-text-primary`=#333、`--color-bg`=#F5F5F5）存在色值偏差（如 `--color-border` fallback `#e0e0e0`/`#ddd` ≠ `--color-divider` #E8E8E8），且命名不在设计系统内，破坏变量一致性。其中 `#btn-refresh` 的 `:hover` 态用 `--color-bg-hover`（行 1213）实际回退到 `#f5f5f5`（与 `--color-bg` 同值），hover 视觉几乎无变化。
- **使用位置**：`src/views/Punch.vue:306/1180/1203/1213`
- **定义位置**：未定义（`src/assets/variables.css` 无此 3 个变量）
- **失效原因**：变量名拼写与设计系统 4.5.1 不一致，未命中已定义变量，依赖 fallback 渲染。
- **建议**：将 `--color-border` 改为 `var(--color-divider)`、`--color-text` 改为 `var(--color-text-primary)`、`--color-bg-hover` 改为一个新增设计变量或直接用 `var(--color-bg)`/定制 hover 色，统一纳入 `variables.css` 命名体系。

#### [一般] 前端未接入设计 4.5.1 要求的 Vant 4，--van-* 主题映射变量与 Vant 组件均未生效
- **位置**：`src/assets/variables.css:4294-4316`（`--van-*` 映射定义）；`package.json`（无 `vant` 依赖）
- **描述**：设计文档 4.5.1 节明确"Vant 4 主题变量映射（需求 7.1 节要求，v13 修订新增）"，并在 4.5.1 备注、4.5.2 说明中要求 TabBar 改用 `<van-tabbar>`、Punch 日期筛选改用 `<van-datetime-picker>`、Toast 改用 `showToast` from 'vant'、下拉刷新改用 `<van-pull-refresh>`+`<van-list>` 等。但 `package.json` 无 `vant` 依赖，全 `src/` 无 `from 'vant'` 导入（已 grep 确认），`variables.css` 定义的 20 个 `--van-*` 变量无消费者，属于定义未使用。实际实现：TabBar 为手写 `<nav>`+`<router-link>`（`src/components/TabBar.vue`）、Punch 日期用原生 `<input type="date">`（`src/views/Punch.vue:404-418`）、Toast 用 SweetAlert2（`src/composables/useUI.ts:38-50`）。这些替代实现本身样式生效（scoped CSS 自包含），不构成"样式不生效"，但与设计 4.5.1/4.5.2 的 Vant 接入要求存在偏差，`--van-*` 变量映射全部无效。
- **使用位置**：无（无组件消费 `--van-*`）
- **定义位置**：`src/assets/variables.css:4294-4316`
- **失效原因**：未安装/引入 Vant 4，`--van-*` 变量无对应 Vant 组件消费，映射恒不生效。
- **建议**：若维持当前 SweetAlert2 + 手写组件方案，应从 `variables.css` 移除 `--van-*` 死代码块，并在设计文档中修订 4.5.1/4.5.2 的 Vant 接入要求以对齐实现；若需对齐设计，则安装 Vant 4 并按 4.5.1 备注迁移 TabBar/日期选择器/Toast 等组件。注：此条属设计一致性偏差，非布局级样式失效。

#### [轻微] .gradient-text 在 Punch.vue 与 LifePlan.vue 重复定义（scoped 各自生效，但维护重复）
- **位置**：`src/views/Punch.vue:674-679`、`src/views/LifePlan.vue:766-773`
- **描述**：`.gradient-text` 类在 Punch.vue 与 LifePlan.vue 的 `<style scoped>` 内各定义一份（渐变 `linear-gradient(135deg, #4A90D9, #38BDF8)`、`background-clip: text`、`color: transparent`）。因 scoped 隔离，两份定义各自仅对本组件生效，使用方（Punch 行 281/287、LifePlan 行 461/466/471）均能命中本组件定义，**不存在跨组件失效**。但同一视觉规则在两文件重复维护，且与原型全局 `.gradient-text`（`docs/prototype.html:69`）的渐变色（`#2563EB→#0EA5E9`）不一致（前端用 `#4A90D9→#38BDF8`，属整体品牌色调差异，非本类失效）。另：原型用 `-webkit-text-fill-color: transparent`，前端用 `color: transparent`，后者在 background-clip:text 下可生效，但 `-webkit-text-fill-color` 优先级更高、兼容性更稳。
- **使用位置**：`src/views/Punch.vue:281/287`、`src/views/LifePlan.vue:461/466/471`
- **定义位置**：`src/views/Punch.vue:674`、`src/views/LifePlan.vue:766`（各组件 scoped 内）
- **失效原因**：无失效；属重复定义 + 与原型色值/写法偏差。
- **建议**：将 `.gradient-text` 提取到 `src/styles/animations.css`（或新建 `src/styles/utilities.css`）作为全局工具类，统一渐变色与 `-webkit-text-fill-color: transparent` 写法，两视图改为引用全局类，消除重复。

#### [轻微] ArticleDetailView.vue 与 Risk.vue 在 scoped 内重复定义 .press:active（全局已定义，冗余）
- **位置**：`src/views/ArticleDetailView.vue:478-481`、`src/views/Risk.vue:1210-1212`
- **描述**：全局 `animations.css:12-15` 已定义 `.press:active { transform: scale(0.96); transition: transform 0.1s; }`，凡使用 `class="...press"` 的组件均可命中。ArticleDetailView.vue 与 Risk.vue 又在各自 `<style scoped>` 内重复定义 `.press:active`（ArticleDetail 为 `scale(0.96)`+`var(--transition-fast)`，Risk 为 `scale(0.97)`）。Punch.vue 与 LifePlan.vue 已注释"按压动画已迁移至全局 animations.css"且未重复定义。重复定义不致失效（scoped 版本特异性更高、覆盖全局，但效果一致或微差），属冗余代码，且 Risk 的 `scale(0.97)` 与全局 `0.96` 不一致，按压反馈不统一。
- **使用位置**：`src/views/ArticleDetailView.vue:149/156/189/197`、`src/views/Risk.vue:366/400/444/483/570/585/592/609/614/647/694/698`
- **定义位置**：`src/styles/animations.css:12`（全局，已生效）；`src/views/ArticleDetailView.vue:478`、`src/views/Risk.vue:1210`（scoped 冗余重复）
- **失效原因**：无失效；属冗余 + Risk 缩放值与全局不一致。
- **建议**：删除 ArticleDetailView.vue:478-481 与 Risk.vue:1210-1212 的 scoped `.press:active` 重复定义，统一依赖全局 `animations.css`；若需 Risk 按压为 0.97，则统一调整全局值。

### 本轮统计

| 严重程度 | 数量 |
|---------|------|
| 严重 | 1 |
| 一般 | 5 |
| 轻微 | 2 |

### 总评

全局样式导入链正确：`variables.css` 与 `animations.css` 在 `main.ts` 全局导入且顺序正确，CSS 变量与 `.page-enter`/`.press` 全局类未被 scoped 误隔离，公共组件（EmptyState/ErrorRetry/SkeletonLoader/DisclaimerBar/FabButton/TabBar/AiChatDialog）均为自包含 scoped 样式、无跨组件引用失效，`.gradient-text` 虽在 Punch/LifePlan 重复定义但各自在本组件内生效，整体未发现"scoped keyframes/class 被另一组件引用导致失效"的典型跨组件隔离缺陷。

但存在一处严重样式失效：**Login.vue 整页依赖 Tailwind 工具类而工程未配置 Tailwind，且无 `<style>` 兜底，导致登录/注册页布局错乱、不可用**——这是设计 4.5.2 以 Tailwind 类名描述组件样式、而前端仅 Login.vue 未改写为 scoped CSS 所遗留的硬伤，需优先修复。其余为一般级视觉降级：全局 `.page-enter` 动画未复刻原型的位移与缓动（Punch/LifePlan/ArticleDetail 仅淡入）、9 个页面缺失入场动画、Risk 评分未用渐变文字、Punch 使用 3 个未定义 CSS 变量名（靠 fallback 不致错乱但偏离设计系统）、Vant 4 未接入致 `--van-*` 映射全部无效。轻微级为 `.gradient-text` 与 `.press:active` 的重复定义/值不一致。建议优先修复 Login.vue，其次统一 `page-enter` 动画与变量命名，并清理 `--van-*` 死代码或按设计接入 Vant。
