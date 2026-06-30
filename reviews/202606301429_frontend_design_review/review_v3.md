# R3: 维度三 — 修饰样式不生效（Round 2 交叉覆盖 review_v2）

审查时间：2026-06-30

### 审查范围

依据 `docs/2_detailed_design_v4.md` 4.5（CSS 设计系统）、4.6（交互状态组件设计）与 `docs/prototype.html` 视觉实现，独立逐文件核查以下前端源码：

- `src/main.ts`、`src/App.vue`、`index.html`
- `src/assets/variables.css`、`src/styles/animations.css`
- `src/views/`：Home、Punch、LifePlan、ArticleDetailView、Risk、Profile、NewsView、Consultation、DoctorChatView、HealthAdvice、CollectionsView、Login、ChangePassword、Admin（14 页）
- `src/components/`：AiChatDialog、DisclaimerBar、EmptyState、ErrorRetry、FabButton、SkeletonLoader、TabBar（7 个）
- 配置：`package.json`、`vite.config.ts`

### 全局样式导入链独立复核

1. `src/main.ts:5-6` 正确全局导入 `./assets/variables.css` 与 `./styles/animations.css`，导入在组件挂载之前，未被 scoped 隔离。
2. `variables.css` 中 `:root` 变量定义在全局作用域，各组件 scoped 内 `var(--xxx)` 正常解析（scoped 不隔离 CSS 变量）。
3. `animations.css` 定义全局 `.page-enter`、`.press:active` 规则，凡模板引用对应类的组件均可命中。
4. 无 `tailwind.config.*`、无 `postcss.config.*`，`package.json` 无 `tailwindcss` 依赖，`vite.config.ts` 仅注册 `@vitejs/plugin-vue`。全项目仅 `Login.vue` 使用 Tailwind 工具类。

### 发现

---

#### [严重] Login.vue 全量依赖 Tailwind 工具类但项目未配置 Tailwind，整页样式不生效

- **位置**：`src/views/Login.vue:94-179`（template 全部）；缺失 `<style>` 块
- **与 review_v2 一致性**：与 review_v2 #1 完全一致，独立验证确认。
- **描述**：Login.vue 模板全部使用 Tailwind 工具类构建布局与视觉（如根容器 `class="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center px-6"`、输入框 `class="w-full bg-gray-100 rounded-full px-4 py-3 outline-none text-sm"`、按钮 `class="w-full bg-[#4A90D9] text-white py-3 rounded-xl font-medium"` 等）。但项目完全未接入 Tailwind——`package.json` 无 `tailwindcss`、无 tailwind/postcss 配置、`vite.config.ts` 仅注册 `@vitejs/plugin-vue`、`index.html` 未引入 Tailwind CDN。该文件以 `</template>`（第 180 行）结束，共 181 行，**完全无 `<style scoped>` 或 `<style>` 块**。结果：所有 Tailwind 类名无 CSS 规则匹配，页面渲染为浏览器默认无样式状态——容器不居中、无最小高度、表单不限宽、输入框为默认灰色边框、按钮为默认系统按钮。虽然全局 `body { background: var(--color-bg); font-family: ...; }` 可提供基础背景色与字体，但所有布局/间距/尺寸/组件样式全部真空，**页面布局错乱、不可正常使用**。其余 13 个视图均使用 `<style scoped>` + 自定义类名覆盖，唯独 Login.vue 保留了原型阶段的 Tailwind 内联类且无 scoped 兜底。
- **使用位置**：`src/views/Login.vue:94`（及 95/100/101/104/110/117/119/123/129/130/137/138/141/147/154/161/163/167/173/174）
- **定义位置**：未定义（Tailwind 未安装/未配置，无对应 CSS 规则）
- **失效原因**：Tailwind 类名无匹配 CSS，且无 scoped CSS 兜底。
- **建议**：为 Login.vue 补充 `<style scoped>` 块，用自定义类名 + CSS 变量复制设计 4.5.2 的登录/注册页视觉，对齐其余 13 个视图的 scoped CSS 范式。

---

#### [一般] 全局 .page-enter 动画与原型不一致：缺位移与定制缓动

- **位置**：`src/styles/animations.css:2-9`（定义）；使用方 `src/views/Punch.vue:241`、`src/views/LifePlan.vue:337`、`src/views/ArticleDetailView.vue:146`、`src/views/Home.vue:167`
- **与 review_v2 一致性**：与 review_v2 #2 完全一致。
- **描述**：原型 `.page-enter` 为 `animation: pageEnter .28s cubic-bezier(0.22, 0.61, 0.36, 1)` + `translateY(10px)` 上滑（`docs/prototype.html:45-46`）。前端 `@keyframes pageEnterFadeIn` 仅 `from { opacity: 0; } to { opacity: 1; }`（纯淡入、无位移、普通 ease-out）。Home.vue 通过本地 `@keyframes pageEnterHome`（行 350-359）补充了 `translateY(8px)` 上滑，Punch/LifePlan/ArticleDetailView 未补充，入场动画仅淡入无上滑。
- **建议**：将 `@keyframes pageEnterFadeIn` 改为包含 `translateY(10px)→0` 位移，并将计时改为 `0.28s cubic-bezier(0.22, 0.61, 0.36, 1)` 对齐原型。

---

#### [一般] 9 个页面根容器缺失 page-enter 入场动画（原型 16 页均应用，前端仅 4 页）

- **位置**：缺失页：`src/views/NewsView.vue:303`、`src/views/Consultation.vue:36`、`src/views/DoctorChatView.vue:213`、`src/views/HealthAdvice.vue:87`、`src/views/CollectionsView.vue:114`、`src/views/ChangePassword.vue:69`、`src/views/Admin.vue:151`、`src/views/Risk.vue:364`、`src/views/Login.vue:94`；已应用：Home/Punch/LifePlan/ArticleDetailView（4 个）；Profile.vue 使用本地 `profileEnter` 等价动画（行 430-443）不计入缺失。
- **与 review_v2 一致性**：与 review_v2 #3 完全一致。
- **建议**：为上述 9 个视图根容器追加 `page-enter` 类。

---

#### [一般] Risk.vue 风险评分数字未复刻原型 gradient-text 渐变文字

- **位置**：`src/views/Risk.vue:666`（`<span class="gauge-score">`）；样式 `src/views/Risk.vue:1418-1423`
- **与 review_v2 一致性**：与 review_v2 #4 完全一致。
- **描述**：原型评分数字使用 `gradient-text` 渲染蓝→青渐变（`docs/prototype.html:1202`）。Risk.vue `.gauge-score` 为 `color: var(--color-text-primary)`（纯色深灰，行 1418-1423）。Risk.vue scoped 内无 `.gradient-text` 定义，模板未引用该类。渐变效果丢失。
- **建议**：在 `.gauge-score` 上叠加渐变效果，或将 `.gradient-text` 提取为全局工具类供 Risk/Punch/LifePlan 复用。

---

#### [一般] Punch.vue 使用未定义的 CSS 变量名（--color-border / --color-text / --color-bg-hover）

- **位置**：`src/views/Punch.vue:306`（`stroke="var(--color-border, #e0e0e0)"`）、`1180`（`fill: var(--color-text, #333)`）、`1203`（`border: 1px solid var(--color-border, #ddd)`）、`1213`（`background: var(--color-bg-hover, #f5f5f5)`）
- **与 review_v2 一致性**：与 review_v2 #5 完全一致。
- **额外细节**：同文件 line 790 `color: var(--color-text-secondary, #999)` 的后备值 `#999` 与定义值 `#666666` 不一致，属回退值偏差。
- **建议**：`--color-border` → `var(--color-divider)`，`--color-text` → `var(--color-text-primary)`，`--color-bg-hover` → 纳入设计系统变量；line 790 回退值修正为 `#666`。

---

#### [一般] 前端未接入设计 4.5.1 要求的 Vant 4，Vant 组件与 `--van-*` 变量映射均未实现

- **位置**：`package.json`（无 `vant` 依赖）；`src/assets/variables.css`（无 `--van-*` 变量定义）
- **与 review_v2 差异说明**：review_v2 #6 称"`variables.css:4294-4316` 定义了 20 个 `--van-*` 变量"。经实际 Read 验证：**当前 `src/assets/variables.css` 共 71 行，以 `body { ... }` 规则结束，不包含任何 `--van-*` 或 van 相关变量**。review_v2 的行号 4294-4316 对应的是设计文档中的行号，非 variables.css 实际行号。`--van-*` 变量仅在设计文档 4.5.1 节中规定，从未落实到代码。
- **实际状态**：`package.json` 无 `vant`（确认）；全 `src/` 无 `from 'vant'` 导入（确认）；`variables.css` 无 `--van-*` 定义（确认）。TabBar 为手写 `<nav>`（`src/components/TabBar.vue`），Punch 日期用原生 `<input type="date">`（`Punch.vue:404-418`），Toast 用 SweetAlert2（`useUI.ts`）。替代方案 scoped 样式均自包含且生效。
- **建议**：若维持当前方案，在设计中移除 Vant 接入要求。若对齐设计，安装 Vant 4 并按 4.5.1 迁移组件。

---

#### [一般] NewsView.vue 搜索高亮 .search-highlight 因 v-html + scoped 隔离完全不生效（NEW）

- **位置**：`src/views/NewsView.vue:223`（`highlightKeyword` 函数注入 `<mark class="search-highlight">`）、`791-795`（`.search-highlight` 定义在 `<style scoped>` 内）、`396`（`v-html` 渲染）
- **描述**：`highlightKeyword` 将搜索关键词包装为 `<mark class="search-highlight">` 标签，通过 `v-html` 渲染（行 396）。`.search-highlight` 样式定义在 `<style scoped>` 内（`background: #fff3b0; padding: 0 2px; border-radius: 2px`，行 791-795）。但 **Vue scoped CSS 不会为 v-html 注入的内容添加 data-v-* 属性**，导致 `.search-highlight` 规则完全无法命中 v-html 渲染出的 `<mark>` 元素。实际效果：仅浏览器默认 `<mark>` 样式（原生黄色背景、无圆角、无 padding）生效，自定义高亮样式（淡黄色背景、圆角、内边距）丢失。
- **使用位置**：`src/views/NewsView.vue:396`（v-html 注入）
- **定义位置**：`src/views/NewsView.vue:791-795`（scoped 内）
- **失效原因**：Vue scoped CSS 不穿透 v-html 内容。
- **建议**：将 `.search-highlight` 样式提取到全局样式文件（`src/styles/animations.css`），或使用 `:global(.search-highlight) { ... }` 语法。

---

#### [一般] Home.vue 品牌色使用原型蓝（#2563eb），与设计系统 `--color-primary: #4A90D9` 不一致（NEW）

- **位置**：`src/views/Home.vue:381`（`.home-logo`）、`484-492`（banner 渐变）、`750/753`（section-header 装饰）；对照组 `src/assets/variables.css:2`（`--color-primary: #4A90D9`）
- **描述**：Home.vue 的 `.home-logo` 使用 `linear-gradient(135deg, #2563eb, #0ea5e9)`，banner-grad-1/2/3 使用 `#2563eb`/`#3b82f6`/`#0ea5e9`/`#4f46e5`/`#06b6d4` 等原型蓝。但设计系统定义品牌主色为 `#4A90D9`（偏灰蓝），其余 13 个页面均引用 `var(--color-primary)`。原型使用 `#2563EB` 作为主色（`docs/prototype.html:13-18`），前端设计文档 4.5.1 改用 `#4A90D9`，但 Home.vue 保留了原型色值，导致首页蓝色（亮蓝）与其他页面蓝色（灰蓝）视觉色调显著不一致。
- **建议**：统一品牌色决策——要么将 `--color-primary` 改为 `#2563EB`（对齐原型），要么将 Home.vue 的 logo/banner/section-header 渐变色改为基于 `--color-primary` 的色调。

---

#### [一般] DoctorChatView/Admin/AiChatDialog 三视图 v-html 渲染 Markdown 缺少 :deep() 子元素排版穿透（NEW）

- **位置**：`src/views/DoctorChatView.vue:351`（v-html）、`src/views/Admin.vue:199`（v-html）、`src/components/AiChatDialog.vue:172`（v-html）
- **描述**：三个聊天视图通过 `v-html` 渲染 Markdown 消息内容，但 `<style scoped>` 中仅定义了 `.msg-content` 自身基础样式（padding、border-radius），未使用 `:deep()` 为 Markdown 子元素（`<p>`、`<ul>`、`<ol>`、`<code>`、`<blockquote>`）提供排版样式。对比：ArticleDetailView.vue（行 360-402）、HealthAdvice.vue（行 289-306）、Punch.vue（行 766-773）、LifePlan.vue（行 957-963）、Risk.vue（行 1488-1513）均正确使用了 `:deep()` 为 Markdown 子元素提供段落间距、列表缩进、代码块样式等排版支持。Chat 页面的 Markdown 子元素仅依赖浏览器默认样式（p 默认 margin:1em、ul 默认 padding-left:40px），段落间距与行高与设计预期偏差，影响可读性。
- **使用位置**：`src/views/DoctorChatView.vue:351`、`src/views/Admin.vue:199`、`src/components/AiChatDialog.vue:172`
- **失效原因**：v-html 子元素不被 scoped CSS 穿透，且未提供 :deep() 规则。
- **建议**：为三视图的 `.msg-content` 补充 `:deep(p)`、`:deep(ul)`、`:deep(ol)`、`:deep(li)`、`:deep(code)`、`:deep(blockquote)` 等排版规则。

---

#### [一般] variables.css 与设计文档 4.5.1 的 CSS 变量集合不匹配：缺 8 个 + 多 2 个（NEW）

- **位置**：`docs/2_detailed_design_v4.md:4248-4291`（设计规定）；`src/assets/variables.css`（实际定义）
- **描述**：逐项比对设计文档 4.5.1 节要求与实际 variables.css 的变量定义，发现：

  **设计规定但未实现（8 个）**：
  | 缺失变量 | 设计值 | 影响 |
  |---------|--------|------|
  | `--line-height-h1` | 28px | 各视图 h1 行高用硬编码（如 1.3） |
  | `--line-height-h2` | 25px | 各视图 h2 行高用硬编码（如 1.4） |
  | `--line-height-h3` | 22px | 各视图 h3 行高用硬编码 |
  | `--line-height-body` | 20px | 正文用硬编码（1.5/1.6/1.8） |
  | `--line-height-caption` | 17px | 辅助文字行高用硬编码 |
  | `--page-margin` | 16px | 页面边距用 `var(--spacing-lg)` 替代 |
  | `--shadow-lg` | 0 4px 16px rgba(0,0,0,0.15) | 无大阴影变量，部分卡片用硬编码 |
  | `--max-content-width` | 375px | 各视图用 480px/768px 硬编码 |

  **代码中有但设计未收录（2 个）**：
  | 额外变量 | 实际值 | 引用分布 |
  |---------|--------|---------|
  | `--color-text-tertiary` | #999999 | 约 30+ 处（Punch/Admin/NewsView/HealthAdvice 等） |
  | `--font-size-h4` | 15px | 多处（HealthAdvice 等） |

  这些 `--color-text-tertiary` 和 `--font-size-h4` 在实现中正常生效，属于代码已扩展但设计未同步的一致性问题。缺失的 8 个变量不直接导致样式"失效"，但迫使组件使用硬编码值，偏离设计系统的 token 化理念。

- **建议**：在 `variables.css` 中补齐 8 个缺失变量；在设计文档 4.5.1 中补充 `--color-text-tertiary` 和 `--font-size-h4`。

---

#### [轻微] NewsView.vue 搜索栏 sticky top:0 与顶部导航栏同 z-index 覆盖（NEW）

- **位置**：`src/views/NewsView.vue:500-510`（`.top-bar`）、`725-735`（`.search-bar`）
- **描述**：`.top-bar`（行 500）和 `.search-bar`（行 725）均设置了 `position: sticky; top: 0; z-index: 30`。两者同时渲染，DOM 中 `.search-bar` 在 `.top-bar` 之后，相同的 sticky top 值和 z-index 导致搜索栏遮挡导航栏。参照 `.category-tabs`（行 543 `top: 49px`）的正确做法，`.search-bar` 的 `top` 值应改为 49px（对齐导航栏高度），使搜索栏粘在导航栏下方。
- **建议**：将 `.search-bar` 的 `top` 改为 `49px`。

---

#### [轻微] .gradient-text 在 Punch.vue 与 LifePlan.vue 重复定义（scoped 各自生效，维护重复）

- **位置**：`src/views/Punch.vue:674-679`、`src/views/LifePlan.vue:766-773`
- **与 review_v2 一致性**：与 review_v2 #7 完全一致。
- **建议**：提取到全局样式文件统一维护。

---

#### [轻微] ArticleDetailView.vue 与 Risk.vue 在 scoped 内重复定义 .press:active（全局已定义，冗余且 Risk 值不一致）

- **位置**：`src/views/ArticleDetailView.vue:478-481`、`src/views/Risk.vue:1210-1212`
- **与 review_v2 一致性**：与 review_v2 #8 完全一致。
- **建议**：删除 scoped 重复定义，统一依赖全局 `animations.css`；Risk 的 `scale(0.97)` 与全局 `0.96` 不一致需统一。

---

### 本轮统计

| 严重程度 | 数量 | 与 review_v2 关系 |
|---------|------|-------------------|
| 严重 | 1 | 确认 review_v2 #1 |
| 一般 | 10 | 确认 review_v2 #2/#3/#4/#5/#6（修正#6细节）；新增 4 条独立发现 |
| 轻微 | 4 | 确认 review_v2 #7/#8；新增 2 条独立发现 |

**本轮独立新发现（4 条一般 + 2 条轻微）：**
- [一般] NewsView `.search-highlight` 因 v-html + scoped 隔离不生效
- [一般] Home.vue 品牌色与设计系统不一致（原型 `#2563eb` vs 设计 `#4A90D9`）
- [一般] DoctorChatView/Admin/AiChatDialog v-html Markdown 缺 `:deep()` 子元素排版
- [一般] variables.css 与设计文档变量集不匹配（缺 8 个 + 多 2 个）
- [轻微] NewsView 搜索栏 sticky top:0 与导航栏同层覆盖
- [轻微] Punch.vue:790 fallback 值 #999 与 --color-text-secondary 定义值 #666 不符（已在发现 #5 中补充记录）

### 总评

全局样式导入链经独立复核确认正确。公共组件均为自包含 scoped 样式且与设计 4.6 节一致，无跨组件引用失效。

review_v2 的 8 项发现中 7 项经独立验证完全确认。1 项（#6 Vant 4）结论正确（Vant 未接入）但细节需修正——`--van-*` 变量在代码中从未定义（仅存在于设计文档中），review_v2 误将设计文档行号当作 variables.css 行号。

**严重问题 1 项**：Login.vue 整页 Tailwind 类名无匹配 CSS，页面不可用，需最优先修复。

**一般问题 10 项**，突出类型为：
- **v-html + scoped 隔离陷阱**（2 项）：NewsView `.search-highlight` 高亮完全失效，三个聊天视图 Markdown 子元素排版穿透缺失——这是 Vue scoped CSS 的经典问题，需系统性排查所有 v-html 使用点。
- **动画与视觉降级**（3 项）：`page-enter` 缺位移、9 页缺入场动画、Risk 评分缺渐变文字。
- **设计系统一致性偏差**（5 项）：Home 品牌色不一致、Punch 未定义变量、Vant 未接入、variables.css 变量集与设计文档不匹配（缺失 8 个设计变量 + 多出 2 个未文档化变量）。

建议修复顺序：Login.vue scoped CSS（严重）→ v-html + scoped 隔离问题（NewsView 高亮 + 三 ChatView :deep()）→ page-enter 动画统一 + 品牌色统一 → variables.css 变量补齐 → Punch 变量修正 → Risk 渐变文字 → Sticky 重叠 → 重复定义清理。
