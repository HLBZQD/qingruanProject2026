# code_v1 — 系统首页 Home 实现（Task 1）

> 分支：`202606271219_home_plan_punch_frontend`（禁止切分支）
> 产出方：Coder（严格据 `detail_v1.md` 实现，未偏离设计）
> 验收映射：见 `detail_v1.md` 第 10 节

---

## 1. 实现清单（新建 / 修改的文件及关键改动）

### 1.1 修改：`src/types/api.ts`（仅增补，勿动既有）

在既有 `Doctor` 之后**增补**三个类型，未改动任何既有类型（`ApiResponse`/`PaginatedResponse`/`PaginationParams`/`PaginationInfo`/`Doctor` 等保持原样）：

- `Article`（挂牌列表项，无 `content`）：字段严格对齐 `2_detailed_design_v3.md` 3.8.3 / 3.2.19。
  `id:number, title:string, cover:string|null, author:string, category:string, tags:string[], summary:string, views:number, created_at:string`。
  字段名按契约只保留 `views`/`created_at`（与需求 6.7 节 `read_count`/`publish_time` 为语义映射，不并存别名）。
- `DiabetesType`：`id:number, name:string, image:string|null, pathogenesis:string, manifestation:string, treatment:string`。`id` 为后端 `number` 主键（修正 M1，非联合）。
- `DiabetesTypeDetail = DiabetesType`（type alias，3.2.24 详情与列表字段一致）。

### 1.2 新建：`src/composables/useHomeApi.ts`

按设计 §3。四个函数，全部禁 `any`，泛型解包精准：

- `interface PagedBody<T> { success; data: T[]; pagination: PaginationInfo; message? }`：分页端点的 HTTP body 内联形态（= `PaginatedResponse<T> & { success; message? }`），**不套 `ApiResponse<>` 外壳**，避免 `res.data.data.data` 错误访问。
- `getDoctors(params: DoctorsParams = {})` → `api.get<PagedBody<Doctor>>('/doctors', { params })` 返回 `res.data.data`（`Doctor[]`）。
- `getArticles(params: ArticlesParams = {})` → `api.get<PagedBody<Article>>('/articles', { params })` 返回 `res.data.data`（`Article[]`）。
- `getDiabetesTypes()` → `api.get<{ success; data: DiabetesType[]; message? }>('/diabetes-types')` 返回 `res.data.data`（`DiabetesType[]`）。依据 3.2.24 已确认为**非分页数组直返**，单一解包路径，无双重 `Array.isArray` 兼容分支、无 `as unknown as` 断言（修正 M3/C1）。
- `getDiabetesType(id: number)` → `api.get<{ success; data: DiabetesType; message? }>(/diabetes-types/${encodeURIComponent(id)})` 返回 `res.data.data`（`DiabetesTypeDetail`）。入参 `number`（修正 M1）。

### 1.3 新建：`src/stores/homeStore.ts`

按设计 §2，setup-store 风格（参照 `authStore.ts`）：

- state：`doctors/Ref<Doctor[]>`、`articles/Ref<Article[]>`、`diabetesTypes/Ref<DiabetesTypeView[]>`、`loading/Ref<boolean>`、`doctorsError/articlesError/typesError/Ref<Error|null>`、`detailLoading/Ref<boolean>`、`detailError/Ref<Error|null>`。
- `DiabetesTypeView extends DiabetesType { cover: string; brief: string }`：**store 内部展示视图类型，不入 `api.ts`**（避免污染对外契约类型）。
- `fetchHomeData()`：`Promise.allSettled` 并行三接口，按 `result.status` 回填数据/分区块错误，任一失败不阻断其余区块。
- `fetchDiabetesTypeDetail(id: number)`：失败时回退缓存列表项（返回 `null` 时组件用 `?? t` 兜底）。
- `retryDoctors/retryArticles/retryTypes` → 内部 `fetchSingle(which)` 单区块重拉。
- `normalizeType`/`normalizeTypes`：纯函数；`cover = image ?? ''`（空走渐变叠层），`brief = pathogenesis` 截断 28 字兜底（空串则 '')。
- 常量：仅 `FALLBACK_DIABETES_COVER` 留在 store 内（`normalizeType` 使用）；`FALLBACK_ARTICLE_COVER`/`FALLBACK_DOCTOR_AVATAR` 按设计推荐由组件自带（store 不暴露常量、不导出 `DiabetesTypeView`），保持 store 对外接口干净。store 不读 `localStorage.token`（JWT 由 `useApi.ts` axios 拦截器注入）。

### 1.4 修改：`src/views/Home.vue`（完整重写）

按设计 §4/§5/§7。原骨架（占位文案）整体重写为完整首页。`<script setup lang="ts">` + scoped CSS + CSS 变量，**无 Tailwind、无新依赖**。

- **A. 顶部 Header（sticky）**：logo + 标题「糖尿病预治智能助手」+ 副标题「科学控糖 · 智慧生活」+ 搜索按钮（`onSearch` → `Swal.fire` toast「搜索功能开发中」）。
- **B. 轮播 Banner**：复刻 prototype 3 条 `banners`，4s 自动轮播（`setInterval` 存于 `bannerTimer`），点击 frame/圆点切换；`onMounted(startAuto)` 启动、`onUnmounted(stopAuto)` 清理（无内存泄漏）。`stopAuto` 先清旧 timer 再启新，避免重复挂表。
- **C. 专业医师团队**：横向滚动 `.doctor-scroll`（`overflow-x:auto` + hide-scrollbar），头像环 `.avatar-ring`（脉冲动画），姓名/科室/职称；**不渲染在线点**（后端 `Doctor` 无 `online` 字段，避免误导）。点击 → `goDoctor()` → `router.push('/consultation')`（**不带 query**，修正 M7）。头像 `:src="doc.avatar || FALLBACK_DOCTOR_AVATAR"`，`@error="hideImg"` 兜底占位图缺失。
- **D. 健康科普**：取 `homeStore.articles` 前 3 条；封面 + 分类标签 + 标题 + 摘要（`v-if="articleSummary(a)"` 隐藏空串）+ 阅读量（`articleViews(a)` 取 `views`，无 `read_count`/`likes` 兜底）。点击 → `router.push('/news')`。
- **E. 糖尿病类型**：2 列网格 `.type-grid`；封面 `v-if="t.cover"` 有图渲染 img、无图则 `.type-cover-wrap` 自身渐变叠层直接显示（4 组主色渐变 `typeGradientClass(id)` 按 `id%4` 选 `.type-grad-1..4`）；标题白字叠层。点击 → `showDiabetesType(t)` 弹层（不臆造 `/diabetes-type/:id` 路由）。

**降级/空态/加载态**（每区块独立，对齐设计 §6）：
- 加载态：医生 3×`.doctor-skeleton`、文章 3×`.article-skeleton`、类型 4×`.type-skeleton`（`skeletonPulse` 脉动动画，灰底 `var(--color-divider)`）。
- 错误态：`.block-empty` + `.retry-btn`（重试调对应 `homeStore.retryXxx()`）。
- 空态（成功但 length=0）：`.block-empty` 提示 + 重试。
- 判定：`doctorsLoading/articlesLoading/typesLoading` 计算公式 `loading && list.length===0 && !error`。

**糖尿病类型弹层**（SweetAlert2 + DOMPurify，按设计 §5/§7.2 定调）：
- 时序：`showDiabetesType(t)` 先 `await fetchDiabetesTypeDetail(t.id)`（成功用详情、失败 store 回退列表项返回 `null` → 组件 `?? t`），再**单次** `openTypeSwal` 弹（修正 M4，无先弹后补再重弹、无双弹窗）。
- 净化：`buildSection` 拼装时纯文本经 `escapeHtml` 转义，最终整体 `DOMPurify.sanitize` **一次**后以 `Swal.fire({ html })` 传入（修正 M5，不双重净化）。Swal 弹窗标题/按钮为纯文本走默认。
- 样式：弹窗内 `<h4>/<p>` 用**内联 style**（与 `router/index.ts` `showDisclaimer` 一致风格），不依赖 scoped/`:deep()`/customClass，无全局污染。DOMPurify 默认保留 `style` 属性白名单。

**子组件抽取**：全部内联于 `Home.vue`，未新建 `src/components/home/`。

---

## 2. 对设计的偏差说明

**无偏差。** 严格按 `detail_v1.md` 实现，所有类型字段、解包路径、store 接口、组件结构、降级策略、弹层净化方式、样式与 CSS 变量映射均与设计一致。

唯一微调（在设计推荐范围内，非偏离）：
- 设计 §2 注与 §7.3 注给出「store 是否暴露 `FALLBACK_*`/`DiabetesTypeView` 常量」二选一，推荐「store 不暴露、组件自带」。本实现采用推荐款：store 仅保留 `normalizeType` 使用的 `FALLBACK_DIABETES_COVER`；`FALLBACK_ARTICLE_COVER`/`FALLBACK_DOCTOR_AVATAR` 与 `DiabetesTypeView` 接口由 `Home.vue` 组件自带同名常量/接口（值与 store 一致）。此为设计明确允许的二选一之一，不计为偏差。

---

## 3. 自检结论

| 检查项 | 结论 |
|---|---|
| 类型安全（`vue-tsc --noEmit -p tsconfig.app.json`） | ✅ 零错误通过（多次复跑 `EXIT: 0`） |
| 禁 `any` | ✅ 新增的 4 个文件无任何 `: any` / `<any>` / `as any` |
| 禁未净化 `v-html` | ✅ 组件模板无 `v-html`；糖尿病类型弹层经 `DOMPurify.sanitize` 一次后以 `Swal.fire({ html })` 传入（非 `v-html`），含 `escapeHtml` 双保险 |
| 禁硬编码后端 URL | ✅ HTTP 全部走 `useApi.ts` 的 `api`（baseURL `/api`），无 `http://`/`https://host`；占位图为 `/static/images/placeholder-*.svg` 相对路径（契合后端静态目录约定，非绝对 host） |
| 资源占位图兜底 | ✅ 封面/头像/类型图：null 或加载失败 → `img @error="hideImg"` 隐藏 img，露出 `.article-cover` 灰底 / `.avatar-ring` 兜底 / `.type-cover-wrap` 主色渐变叠层（不依赖 SVG 文件存在） |
| 不改 router/App/server | ✅ 仅改/建 `src/types/api.ts`（增补）、`src/composables/useHomeApi.ts`、`src/stores/homeStore.ts`、`src/views/Home.vue`；未触碰 `router/index.ts`、`App.vue`、`composables/useApi.ts`、`utils/enumLabels.ts`、`server/**`、`assets/variables.css` |
| 不引入新依赖 | ✅ 仅使用 `package.json` 既有依赖（dompurify / sweetalert2 / pinia / vue / vue-router），未改 `package.json`/`vite.config.ts` |
| 轮播定时器生命周期 | ✅ `onMounted(startAuto)` 启动 / `onUnmounted(stopAuto)` 清理；`stopAuto` 先清旧再启新避免重复；离开页面无泄漏、无 console 报错 |
| 三区块独立降级 | ✅ `Promise.allSettled` + 分区块 error ref + 每区块独立加载/错误/空态/重试 UI，任一接口失败不阻断其余 |
| 移动端无横向溢出 | ✅ `.home-page { max-width:480px; margin:0 auto; }`；仅 `.doctor-scroll` 局部横向滚动（`overflow-x:auto` + hide-scrollbar），整页 `padding-bottom: calc(var(--tab-bar-height)+8px)` 避开 fixed tab 栏遮挡 |

**字段契约核对**（对照 `2_detailed_design_v3.md` 第 6 节 3.2.9 / 3.2.19 / 3.2.24 / 3.8.3）：
- `/doctors` 分页 body = `{ success, data: Doctor[], pagination }` → 取 `res.data.data` ✅
- `/articles` 分页 body = `{ success, data: Article[], pagination }` → 取 `res.data.data` ✅（字段 `cover/author/category/tags/summary/views/created_at` 全部对齐 3.8.3）
- `/diabetes-types` 非分页 body = `{ success, data: DiabetesType[] }` → 单一取 `res.data.data` ✅
- `/diabetes-types/:id` body = `{ success, data: DiabetesType }` → 取 `res.data.data` ✅