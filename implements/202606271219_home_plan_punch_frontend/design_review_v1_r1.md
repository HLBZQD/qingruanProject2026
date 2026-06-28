# Design Review v1 Round 1 — 审查意见（REJECTED）

> 审查对象：`implements/202606271219_home_plan_punch_frontend/detail_v1.md`
> 审查依据：`task_v1.md` 第 7 节 8 要点、`docs/2_detailed_design_v3.md` 第 6 节、`docs/prototype.html`、项目范式（`src/types/api.ts`、`src/composables/useApi.ts`、`src/stores/authStore.ts`、`src/views/Risk.vue`、`src/App.vue`、`package.json`、`vite.config.ts`、`src/assets/variables.css`）
> 决议：**REJECTED**（存在 2 个阻断问题 + 若干一般问题，需 Designer 修订后重审）

---

## 一、阻断问题（Critical，必须修复才能落地）

### C1. `/api/doctors` 与 `/api/articles` 解包路径错误，且无法通过 vue-tsc

`detail_v1.md` §0 表格与 §3 将两个分页端点的外壳声明为 `ApiResponse<PaginatedResponse<T>>`，并让 `getDoctors`/`getArticles` 返回 `res.data.data.data`（数组）、`res.data.data.pagination` 取分页。这与权威的详细设计 v3 与项目既有范式均矛盾：

1. **`docs/2_detailed_design_v3.md` 3.2.9（`/api/doctors`）与 3.2.19（`/api/articles`）的响应体**结构为：
   ```json
   { "success": true, "data": [ ... ], "pagination": { ... } }
   ```
   `pagination` 与 `data` 平级在最外层（HTTP body），并非嵌套在 `data` 内。
2. **`docs/2_detailed_design_v3.md` 3.8.1 的 `PaginatedResponse<T>` 类型**：`{ success: true; data: T[]; pagination: {...} }`——`pagination` 在对象顶层，不在内层 `data`。即 HTTP body 本身就是 `PaginatedResponse<T>`，不是 `ApiResponse<PaginatedResponse<T>>`。
3. **项目范式 `src/views/Risk.vue` 第 282-287 行**对同形态分页端点 `/risk/history` 的写法是决定性反证：
   ```ts
   api.get<{ success: boolean; data: RiskHistoryItem[]; pagination: unknown }>('/risk/history', ...)
   if (historyRes.data.data?.length > 0) result.value = toFallbackRiskResponse(historyRes.data.data[0])
   ```
   数组是 `res.data.data`，分页是 `res.data.pagination`。

因此正确解包应是：
- `api.get<PaginatedResponse<Doctor>>('/doctors', ...)` → `res.data.data` 是 `Doctor[]`，`res.data.pagination` 是分页。

而 §3 代码 `const res = await api.get<PaginatedResponse<Doctor>>('/doctors', { params }); return res.data.data.data` 中：`res.data` 类型是 `PaginatedResponse<Doctor>` = `{success, data: Doctor[], pagination}`，`res.data.data` 类型是 `Doctor[]`，再 `.data` 属性访问在 `Doctor` 上不存在——**`vue-tsc --noEmit` 必报 TS 错误（Property 'data' does not exist on type Doctor[]）**，直接违反验收标准第 1 条。`getArticles` 同病同因。

**修复要求**：
- `getDoctors`/`getArticles` 改为 `return res.data.data`（数组）；
- 类型标注对齐 `{ success: boolean; data: T[]; pagination: PaginationInfo }`（即 `PaginatedResponse<T>`，不要套一层 `ApiResponse<>`）；
- §0 表格解包列改为 `res.data.data`（数组）/ `res.data.pagination`，外壳列改为 `PaginatedResponse<T>`；
- §8 未决项 1 的描述同步修正（只涉及 `diabetes-types` 是否分页，与 `doctors`/`articles` 无关，后者确为分页）。

### C2. 项目根本未安装 Tailwind，detail_v1 整套样式方案无法落地

核对 `package.json`：依赖中无 `tailwindcss`、无 `postcss`、无 `autoprefixer`；`vite.config.ts` 无 `@tailwindcss/vite`；仓库内不存在 `tailwind.config.*`（Glob 全仓搜索零命中）。`src/main.ts` 仅引入 `./assets/variables.css`（纯 CSS 变量）。既有视图 `Risk.vue`、`App.vue` 全部使用 scoped CSS 原生类 + `style="color:#4A90D9"` 内联，**不依赖任何 Tailwind 工具类**。

而 `detail_v1.md` §4.3、§7.1、§7.2 把 Home.vue 整套模板与样式建立在 Tailwind 工具类之上：`bg-white px-4 pt-12 pb-3 flex items-center justify-between sticky top-0 z-30 shadow-sm`、`bg-gradient-to-br from-blue-600 to-sky-500 rounded-xl`、`text-slate-800`、`text-[10px]`、`overflow-x-auto hide-scrollbar`、`bg-white/20 backdrop-blur-sm`、`line-clamp-2`、`shadow-card`、`min-w-[140px]` 等。这些工具类在无 Tailwind 编译管线时**全部不生效**，页面会无布局、无间距、无颜色、无响应式，直接违反验收标准第 6 条（视觉对齐 prototype）与第 7 条约束。

更严重的是 `detail_v1.md` §7.2 明文「整体容器 `max-w-md mx-auto`（App.vue 已限定）」——**这是事实错误**：`src/App.vue` 模板仅为 `<div class="app-root"><router-view />…<nav class="tab-bar fixed bottom-0…">`，没有任何 `max-w-md mx-auto` 包裹（且该类同样依赖 Tailwind 才生效）。原型 `prototype.html` 移动端居中（TabBar 中可见 `max-w-md`）依赖的是 prototype 自身内联的 Tailwind CDN，并未迁移到本项目。§375 无横向滚动条这一验收点因此实际上无任何机制保证。

§8 未决项 9 仅把 `text-primary` 是否在 `tailwind.config` 已配置列为未决——**漏发现了 Tailwind 本身根本未安装这一更上游事实**。

**修复要求（二选一，需在 detail 中明确选定并给出去除歧义后的完整方案）**：
- 方案 A（推荐，对齐项目现状）：Home.vue 全部改用 scoped CSS + CSS 变量（`--color-primary` 等，见 `src/assets/variables.css`），参照 `Risk.vue` 的类名风格（`.risk-container .top-bar .btn-primary`）重写模板类名；375px 移动容器通过 `app-root`/新增包裹 `max-width: 24rem; margin: 0 auto;`（或与 `App.vue` 约束保持一致）实现，并补回 §7.2 误称「App.vue 已限定」的事实更正；或
- 方案 B：在 detail 中显式新增「引入 Tailwind（devDep + tailwind.config + PostCSS/Vite 插件 + content globs）」作为本任务前置子任务，并相应修订 `task_v1.md` 第 5 节「不引入新依赖」的约束（需回 Planner 决策，超出 Designer 单方变更范围）。鉴于 `task_v1.md` 第 2 节明确「不引入新依赖」，**优先采用方案 A**。

任一方案确定后，§7（主色/字号映射、关键帧、视觉细节）与 §4.3（DOM 层级与类名）必须同步重写为非 Tailwind 表达。

---

## 二、一般问题（Major/Minor，建议一并修复）

### M1. `DiabetesType.id` 与权威契约不一致，且 `id` 取值链路存在隐患
`docs/2_detailed_design_v3.md` 3.2.24 / 3.8.3 中 `DiabetesType.id: number`（必需，主键）。detail_v1.md §1.3 放宽为 `id: number | string` 并以「原型用 'type1' 等字符串」为兼容理由。但本任务首页列表数据来自**后端 `/api/diabetes-types`**（返回 `id: number`），原型 mock 的字符串 `id` 不会进入真实数据流。把 `id` 设为联合类型会让 `showDiabetesType` 中 `homeStore.fetchDiabetesTypeDetail(t.id)`、`encodeURIComponent(id)`、`String(t.id)` 比较等路径多处引入 `number | string` 的收窄噪音，并掩盖「后端 id 一定是 number」这一已知契约。
**修复要求**：`id: number`；若需保留兼容，请改为「以权威契约为准，仅在后端字段缺失时回退」并在 §8 移除该条「未决」（已决）。

### M2. `Article` 类型字段与契约偏差，过度放宽
权威契约（3.8.3）：`cover: string | null`（必填，可空但可定义为字段）、`author: string`、`category: string`、`tags: string[]`、`summary: string`、`views: number`、`created_at: string`。detail_v1.md §1.2 把 `cover`/`author`/`category`/`tags`/`summary`/`read_count`/`views` 全部设为可选（`?:`），并额外引入 `publish_time`/`read_count` 作为「需求层别名」字段。
- 后端字段名已在文档 3.2.19 注释中明确：`created_at`↔`publish_time`、`views`↔`read_count` 为**语义映射，不是双字段同时返回**。在 TS interface 上同时声明 `views?` 与 `read_count?`、`created_at?` 与 `publish_time?` 会让“一个对象里两种都该出现”成为类型允许但其实不可能的状态，增大误读。
**修复要求**：按契约把 `cover: string | null`、`author: string`、`category: string`、`tags: string[]`、`summary: string`、`views: number`、`created_at: string` 设为**必填**（`cover` 是 `string | null`，不是 `?:`）；删除 `read_count?`/`publish_time?` 双字段，改为在展示层用单一 `created_at`/`views`（与契约一致），若确需展示「中文别名字段」概念，请在注释里说明而非引入冗余可选字段。同时更新 §6 展示口径（`a.read_count ?? a.views` 等改为直接 `a.views`、时间用 `a.created_at`）。

### M3. `getDiabetesTypes` 兼容分支过度防御 + 类型断言清单
`§3` 中 `getDiabetesTypes` 在已经按 §0/§8 确认为「非分页数组直返」（契约 3.2.24 明确无 `pagination`）后，仍保留 `Array.isArray((payload as unknown as PaginatedResponse<DiabetesType>)?.data)` 的二次兼容分支。这违背 §0「已确认形态」的结论，与 C1 修复后的统一风格相反，且引入不必要的 `as unknown as` 断言。
**修复要求**：契约已明确非分页，`getDiabetesTypes` 直接 `return res.data.data`（数组）；将该「是否分页」从 §8 未决项移除（已决）。

### M4. `Swal.fire` 在 `showDiabetesType` 内的“先弹后补再重弹”模式易产生闪烁/双弹窗
§4.2 `showDiabetesType` 先 `openTypeSwal(t)` 弹一次，再异步 `fetchDiabetesTypeDetail` 拿到 detail 后又 `openTypeSwal(detail)` 再弹一次。SweetAlert2 默认单例模式下连续 `Swal.fire` 会先 close 旧的再弹新的，导致列表数据与详情数据不一致时弹窗闪烁、用户体验割裂。§4.2 自身注释里也给了“先拉详情再弹”的单次方案二选一，但未在 detail 中定调。
**修复要求**：detail 中应明确选定一种（推荐：先用列表已有字段立即 `Swal.fire` 并在按钮加 loading 文案，详情返回后用 `Swal.update({ html })` 原地刷新而非再次 `fire`；或明确“先 await detail 再弹”）。消除“二选一”遗留分歧。

### M5. DOMPurify 双重净化冗余但无害，缺一致性指导
§4.2 `buildSection` 对每段 `body` 做 `DOMPurify.sanitize(body)` 嵌入拼接，外层 `html = DOMPurify.sanitize(<div>…拼接…</div>)` 又整体净化一次。两次净化对纯文本/白名单 HTML 等价且安全，但 detail 未说明净化的**输入来源假设**：后端三段文本（`pathogenesis`/`manifestation`/`treatment`）是纯文本还是 HTML 还是 Markdown？3.2.24 示例为纯文本（`"...1型糖尿病是一种自身免疫性疾病..."`），无 HTML/Markdown 标记。Risk.vue 范式对 Markdown 用 `marked.parse` 再 `DOMPurify.sanitize`。detail §5 说“不引入 marked”，但又留有余地“若后端为 Markdown 则升级为 marked+净化”。
**修复要求**：明确本任务弹层按**纯文本**处理即可（对齐契约示例），DOMPurify 作为防御性兜底单次净化即可，无需双重；保留“后端若返回 Markdown 需升级 marked”作为 §8 显式未决交后端确认，但不在本任务实现。

### M6. `initialized` state 未在 actions 中被消费，遗留字段
§2.2 注释说「避免每次 onMounted 重拉，可视情况启用」，但 `fetchHomeData` 每次都重置 `initialized=true` 且未在组件 onMounted 中被 gate。若不启用，应从 store 中删除以保持接口最小；若启用，应在 `Home.vue` `onMounted` 中加 `if (!homeStore.initialized) fetchHomeData()`。现状为悬空字段，违反“可直接落地编码”要求。
**修复要求**：明确选用——推荐删除 `initialized`（首页每次进入即拉，逻辑最简且符合 prototype 体验）；若保留则给出 gate 用法。

### M7. `goDoctor(_id: number)` 参数与 `Doctor.id` 一致但用不到，应明确“不带 query”而不是留 `_id`
§5 与 §8 未决项 6 已决定医师卡跳 `/consultation` 不带 `?doc=`。但 §4.2 `function goDoctor(_id: number)` 仍保留入参 `_id`，模板里 `@click="goDoctor(doc.id)"` 多此一举。建议直接 `function goDoctor() { router.push('/consultation') }`，模板 `@click="goDoctor"`，避免“看起来要带 id 但其实不带”的误导，也便于 §8 未决项 6 明确收敛“本任务不带 id，待 Consultation 落地后再议”。

### M8. `<script setup>` 缺 `import type { Article }`
§4.2 注释已指出需补 `Article` 导入，但 §4.2 顶部 import 块只列了 `DiabetesType, DiabetesTypeDetail`，`articleCover(a: Article)`、`articleViews(a: Article)`、`articleSummary(a: Article)` 会命名不到 `Article`。需补 `import type { Article, DiabetesType, DiabetesTypeDetail } from '@/types/api'`。`OmitType` 内部 `Article` 同样依赖此导入。

---

## 三、task_v1.md 第 7 节 8 要点核对

| # | 要点 | 核对结论 |
|---|---|---|
| 1 | 类型清单 + 字段可空标注 + 后端返回形态确认 | 形态确认（§0）**错**（见 C1）；字段过度放宽（见 M2）；`DiabetesType.id` 联合偏差（M1） |
| 2 | homeStore 接口、allSettled 处理与错误回填 | 基本齐，但 `initialized` 悬空（M6） |
| 3 | useHomeApi 接口签名+端点+解包方式 | **错**（C1：doctors/articles 解包）；diabetes-types 过度兼容（M3） |
| 4 | Home.vue 结构、生命周期、轮播定时器 | 齐备；弹层双弹未定调（M4）；import 缺 `Article`（M8） |
| 5 | 跳转策略 + 糖尿病弹层净化方式 | 跳转齐（贴合 prototype，受 task 约束合理降级）；净化一致性指导缺（M5） |
| 6 | 降级/空态/加载态完备 | 齐备（§6 设计合理，骨架屏+空态+重试） |
| 7 | 样式细节（banner-glow/avatar-ring/等+主色字号） | **失败**（C2：Tailwind 未安装且误称 App.vue 已限定 max-w-md） |
| 8 | 未决问题清单 + 容错 | 9 项齐备且多数已容错，但误把“diabetes-types 分页”列为未决（实已决，M3）、误把“tailwind primary”列为未决而漏 Tailwind 未安装（C2）；`online` 字段容错选不渲染，合理 |

## 四、结论

阻断问题 C1（API 解包路径与契约/范式矛盾且不过 vue-tsc）与 C2（Tailwind 未安装，整套样式方案无法落地 + 误称 App.vue 已限宽）使 `detail_v1.md` **不能直接进入编码**。请 Designer 修复 C1、C2 后，并酌情修复 M1–M8，产出 `detail_v1_r1.md` 或覆盖 `detail_v1.md`，提交 R2 重审。