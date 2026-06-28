# Task v1：系统首页 Home 前端实现（第 1 轮）

> 分支：`202606271219_home_plan_punch_frontend`（禁止切分支）
> 产出方：Planner 指派给 Designer → Coder → Verifier
> 上游计划：`plan.md`（同目录）
> 范围：仅 Task 1 = 系统首页 Home，不含 LifePlan / Punch。

## 1. 输入文档（绝对路径，子 agent 自行阅读）

- 任务完整描述：`C:\Users\DELL\Desktop\qingruanProject2026\implements\202606271219_home_plan_punch_frontend\requirement.md`
- 总计划：`C:\Users\DELL\Desktop\qingruanProject2026\implements\202606271219_home_plan_punch_frontend\plan.md`
- 需求分析：`C:\Users\DELL\Desktop\qingruanProject2026\docs\1_requirements_analysis_v2.md`（4.1 系统首页、6.4/6.7/6.8 节 API、7.1 设计系统）
- 详细设计：`C:\Users\DELL\Desktop\qingruanProject2026\docs\2_detailed_design_v3.md`（第 6 节 API 规格）
- 前端原型（视觉与交互的唯一基准）：`C:\Users\DELL\Desktop\qingruanProject2026\docs\prototype.html`
  - 首页模板：约 408-523 行（`const Home = { template: ... }`）
  - Mock 数据：约 144-203 行（banners / doctors / diabetesTypes / articles）
  - 全局状态/路由：约 205-295 行（store、tabs、路由表）
- 项目现状：
  - `C:\Users\DELL\Desktop\qingruanProject2026\package.json`、`vite.config.ts`、`tsconfig.app.json`
  - `C:\Users\DELL\Desktop\qingruanProject2026\src\router\index.ts`（`/home` 已存在，requiresAuth:false）
  - `C:\Users\DELL\Desktop\qingruanProject2026\src\stores\authStore.ts`（`isLoggedIn`/`user`/`isAdmin`）
  - `C:\Users\DELL\Desktop\qingruanProject2026\src\composables\useApi.ts`（`api` 实例，baseURL `/api`，自带 JWT + 401 拦截）
  - `C:\Users\DELL\Desktop\qingruanProject2026\src\types\api.ts`（含 `ApiResponse<T>`/`PaginatedResponse<T>`/`Doctor` 等已有类型）
  - `C:\Users\DELL\Desktop\qingruanProject2026\src\utils\enumLabels.ts`（`enumLabel`，首页可能用到 category 中文——已有则复用）
  - `C:\Users\DELL\Desktop\qingruanProject2026\src\App.vue`（底部 tab 栏已有，勿改）
  - `C:\Users\DELL\Desktop\qingruanProject2026\src\views\Home.vue`（当前为骨架占位，需完整重写）

## 2. 范围与不做的事

**本任务做**：
- 完整重写 `src/views/Home.vue`，实现 prototype 首页四个区块：顶部 logo+搜索、轮播 Banner、专业医师团队、健康科普、糖尿病类型科普网格。
- 落地首页所需前端类型、store、api 封装。
- 未登录态与登录态均能正常渲染。
- 三个公开接口（`/api/doctors`、`/api/articles`、`/api/diabetes-types`）失败时对应区块独立降级。

**本任务不做**：
- 不实现 LifePlan、Punch（第 2、3 轮）。
- 不改 `src/router/index.ts` 路由表、不改 `App.vue`、不改 `server/`。
- 不实现医生对话页（`/consultation`）、文章详情页（`/news/:id`）、糖尿病类型详情——首页仅做跳转目标路由（若目标未实现，点击跳对应 tab 路由即可，不臆造不存在的页面内部逻辑）。
- 不引入新依赖（marked/DOMPurify 首页科普为列表摘要，无 Markdown 正文渲染需求；若糖尿病类型弹层需展示长文本，已是纯文本/HTML 白名单，按需用 DOMPurify）。

## 3. 子任务拆分（Coder 据此实现，Designer 据此出 detail_v1.md）

### 3.1 types 子任务（`src/types/api.ts` 增补）
- `Article`：`id: number; title: string; cover: string; author: string; publish_time: string; category: string; tags: string[]; read_count: number; summary: string`（列表摘要，不含 content）。
- `DiabetesType`：`id: number | string; name: string; cover: string; pathogenesis: string; manifestation: string; treatment: string`（+ 可选 `brief` 展示用）。
- `DiabetesTypeDetail`：与 `DiabetesType` 一致或为超集（弹层详情用）。
- 复用已有 `Doctor`（`id/name/department/title/description/avatar`）。
- 列表响应复用 `PaginatedResponse<Doctor>`、`PaginatedResponse<Article>`；`GET /api/diabetes-types` 若后端非分页则按 `data: DiabetesType[]` 处理（Designer 需在 detail 中确认后端返回形态并选择正确的解包路径——优先兼容 `ApiResponse<DiabetesType[]>`）。
- 禁用 `any`；不确定字段用 `unknown` 收窄或可选 `?` 并注释。

### 3.2 store 子任务（新增 `src/stores/homeStore.ts`）
- setup-store 风格（参见 `authStore.ts`）。
- state：`doctors: Ref<Doctor[]>`、`articles: Ref<Article[]>`（首页取前 3 条）、`diabetesTypes: Ref<DiabetesType[]>`；`loading: Ref<boolean>`、`doctorsError/articlesError/typesError: Ref<Error|null>`（分区块错误，支持独立降级）。
- action：`fetchHomeData()`——`Promise.allSettled` 并行拉三接口（首页不能因一个失败而全白）；按 result 状态回填数据/错误。
- 可选 `fetchDiabetesTypeDetail(id)`（弹层按需拉取 `/api/diabetes-types/:id`）。
- 不可在 store 内直接读 localStorage token——由 axios 拦截器处理。

### 3.3 api 子任务（新增 `src/composables/useHomeApi.ts`）
- `getDoctors(params?: Partial<PaginationParams>)` → `api.get('/doctors', { params })` 返回 `res.data.data`。
- `getArticles(params?: { category?: string } & Partial<PaginationParams>)` → `/articles`。
- `getDiabetesTypes()` → `/diabetes-types`。
- `getDiabetesType(id: number | string)` → `/diabetes-types/${id}`。
- 统一从 `ApiResponse<T>`/`PaginatedResponse<T>` 解包；类型严格，禁 `any`。

### 3.4 视图子任务（完整重写 `src/views/Home.vue`）
- `<script setup lang="ts">`，`onMounted` 调 `homeStore.fetchHomeData()`。
- 顶部 header：logo + 标题「糖尿病预治智能助手」+ 副标题「科学控糖 · 智慧生活」+ 搜索按钮（点击可弹 SweetAlert2 提示「搜索功能开发中」或跳 `/news`，按 prototype 仅占位）。
- 轮播 Banner：复刻 prototype `banners`（3 条），4s 自动轮播，可点击切换、圆点指示器；`onMounted` 启动定时器，`onUnmounted` 清理。
- 专业医师团队：横向滚动卡片（`overflow-x-auto hide-scrollbar`），头像 + 在线点 + 姓名 + 科室 + 职称；点击 → `router.push('/consultation')`（如需带 doc id，确认 Consultation 是否接受 query，若不接受则只跳 tab）。
- 健康科普：取 `homeStore.articles` 前 3 条，封面 + 分类标签 + 标题 + 阅读量/点赞；点击 → `router.push('/news')`（文章详情页不在本任务）。
- 糖尿病类型：2 列网格，封面渐变叠层 + 名称 + 简介；点击 → SweetAlert2 弹层展示病因/表现/治疗（文本经 DOMPurify 净化后以 html 传入 Swal），或跳预留详情路由（本任务选弹层方案，避免臆造路由）。
- 未登录可见内容与登录态区块：首页 `requiresAuth:false`，全部区块对未登录可见；登录态额外区块（如「今日打卡概览」）若 prototype 首页无则不臆造——以 prototype 为准，prototype 首页未含登录态专属卡，故本任务不强行增加。
- 各区块错误态：区块内显示空状态/重试按钮（SweetAlert2 toast 或内嵌文案），不阻断其他区块。
- 加载态：首页级可使用骨架屏（条状骨架），或区块内 Spinner；选择骨架屏以减少抖动（prototype 用 page-enter 动画，可保留）。

### 3.5 样式子任务
- 移动端 375px 基准，无横向滚动条（横向滚动的医师卡片用 `overflow-x-auto`，整体页面不溢出）。
- 复刻 prototype 视觉：banner-glow 渐变、avatar-ring 头像环、hide-scrollbar、press-card 按压反馈、shadow-card 卡片阴影；用 Tailwind 工具类实现，必要时在 `<style scoped>` 补少量 CSS（avatar-ring / banner-glow 关键帧）。
- 主色 `#4A90D9`（已在 variables/App.vue 中用 inline，可在 Home scoped 内复用或抽到 `variables.css`）。
- 字体栈、字号层级遵循 7.1 节设计系统。

## 4. 要新增 / 修改的文件清单

新增：
- `C:\Users\DELL\Desktop\qingruanProject2026\src\stores\homeStore.ts`
- `C:\Users\DELL\Desktop\qingruanProject2026\src\composables\useHomeApi.ts`

修改：
- `C:\Users\DELL\Desktop\qingruanProject2026\src\types\api.ts`（增补 `Article`、`DiabetesType`/`DiabetesTypeDetail`；勿动既有类型）
- `C:\Users\DELL\Desktop\qingruanProject2026\src\views\Home.vue`（完整重写）

不修改（约束）：`router/index.ts`、`App.vue`、`composables/useApi.ts`、`utils/enumLabels.ts`、`server/**`。

## 5. 技术约束（承自 plan.md，Coder 必须遵守）

- Vue 3.5 `<script setup lang="ts">` + Composition API；TS strict 禁 `any`。
- HTTP 仅用 `useApi.ts` 的 `api`；JWT 由拦截器注入，组件不读 token、不拼 URL。
- 任何后端字符串若需 `v-html`，必经 `DOMPurify.sanitize`（糖尿病类型弹层文本若含 HTML 则净化；纯文本则 `Swal.fire({ text })`）。
- 路由跳转用 `useRouter().push`，不硬编码 host。
- 复用 `enumLabel` 与既有类型，不重复定义。
- 不改后端、不改路由表。

## 6. 验收标准（Verifier 依据）

1. `npx vue-tsc --noEmit -p tsconfig.app.json` 零错误。
2. `/home` 在未登录与登录两态下均完整渲染，四区块齐全，375px 宽无横向滚动条。
3. 故意让 `/api/doctors` 失败（mock 断网）时，医师区块降级空状态/重试，其余区块不受影响（`Promise.allSettled` 验证）。
4. 轮播 4s 自动切换、点击圆点切换、离开页面定时器清理（无内存泄漏/console 报错）。
5. 糖尿病类型点击弹层正确展示病因/表现/治疗。
6. 视觉与 `docs/prototype.html` 首页一致（抠图对比：banner、医师卡、文章卡、类型网格）。
7. 无新增 `any`；无 `v-html` 未净化内容；无硬编码后端 URL。

## 7. Designer 应产出的 detail_v1.md 要点

Designer 在审议后产出 `detail_v1.md`（同目录），需覆盖：
1. **类型清单**：最终在 `types/api.ts` 落地的字段表（含可空字段标注与后端返回形态确认：分页 vs 数组）。
2. **homeStore 接口**：state/action 签名、`fetchHomeData` 的 allSettled 处理与错误回填策略。
3. **useHomeApi 接口**：每个函数签名 + 对应端点 + 解包方式。
4. **Home.vue 组件结构**：template 区块拆分、子组件是否抽取（推荐内联）、onMounted/onUnmounted 生命周期、轮播定时器管理。
5. **跳转策略**：医师卡 / 文章卡 / 糖尿病类型的点击目标路由与弹层方案（糖尿病类型用 SweetAlert2 弹层的具体文案与净化方式）。
6. **降级/空态/加载态**：每区块的具体 UI（骨架屏形状、空态文案、重试按钮行为）。
7. **样式细节**：banner-glow / avatar-ring / hide-scrollbar / press-card 的 Tailwind + scoped CSS 实现方案，主色与字号映射。
8. **未决问题清单**：如 `/api/diabetes-types` 是否分页、文章列表 `summary` 字段是否后端返回、医师在线态字段 `online` 后端是否提供（若否，首页在线点按 mock 隐藏或固定态）——交回 Planner 或留待 Coder 与后端确认。

## 8. 完成标志

本任务（Task 1）完成后，Verifier 输出验证证据，Planning 进入第 2 轮：Task 2 = LifePlan（产出 `task_v2.md` 由 Planner 撰写）。