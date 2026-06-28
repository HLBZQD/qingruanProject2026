# test_v1 — 系统首页 Home 验证计划（Task 1）

> 分支：`202606271219_home_plan_punch_frontend`（禁止切分支）
> 产出方：Verifier
> 上游：`task_v1.md`（第 6 节验收标准）/ `detail_v1.md` / `code_v1.md`
> 验证对象：`src/types/api.ts`、`src/composables/useHomeApi.ts`、`src/stores/homeStore.ts`、`src/views/Home.vue`

---

## 0. 验证方法总览

本仓库 `package.json` 仅含 `vue-tsc -b && vite build`，**无 vitest/jest 等单测框架**，无 E2E 工具。因此本轮验证采用「**类型零错误为主判据 + 构建冒烟 + 静态审查清单 + 代码审查降级确认 + 人工视觉比对**」组合方案，不依赖运行期断言。

### 0.1 主判据：类型编译零错误

```
命令：npx vue-tsc --noEmit -p tsconfig.app.json
期望：退出码 0，无任何输出（无 error，无未解析类型）。
通过判据：EXIT=0；且无 "Property 'data' does not exist on type Doctor[]"（C1 修正证据），无 `any` 隐式 any 报错。
```

> 用 `--noEmit -p tsconfig.app.json`（指定仅前端项目 tsconfig）避免触碰 server/tsconfig.json。`tsconfig.app.json` 已开 strict，能捕获未净化 any、字段缺失等。

### 0.2 构建冒烟

```
命令：npx vite build
期望：成功产出 dist/，无 Rollup 报错、无模块解析失败、无 circular export 阻断。
通过判据：EXIT=0 且出现 dist/index.html + dist/assets/*.js；体积合理（Home 为单页，无新依赖，bundle 无突增）。
说明：vite build 不跑 vue-tsc（由 0.1 单独覆盖类型），仅验证打包链路、模板编译、scoped CSS 提取、import 解析。
```

### 0.3 静态审查清单（grep / 人工阅读）

| # | 检查项 | 工具 / 命令 | 期望命中数 |
|---|---|---|---|
| S1 | 新增 4 文件无 `any` | `Grep ":\s*any\b\|<any>\|as any"` 于该项目 4 文件 | 0 |
| S2 | 模板无未净化 `v-html` | `Grep "v-html"` 于 `Home.vue` | 0（弹层经 `DOMPurify.sanitize` + `Swal.fire({html})`，非 `v-html`） |
| S3 | 无硬编码后端 URL | `Grep "https?://.*(:\d{2,})?\b"` 于 4 文件 | 0（HTTP 全走 `api`，baseURL `/api`；仅 `/static/images/placeholder-*.svg` 相对路径） |
| S4 | 未改 router/App/useApi/server/variables | `git status` 与 `git diff --stat` | 仅 4 个目标文件 + implements 内 md；`src/router/index.ts`、`src/App.vue`、`src/composables/useApi.ts`、`src/server/**`、`src/assets/variables.css`、`package.json`、`vite.config.ts` 均不在变更集 |
| S5 | 未引入新依赖 | `git diff package.json package-lock.json` | 无输出（既无新 deps 也无版本变更） |
| S6 | 弹层净化一次（不双重） | 阅读 `openTypeSwal` | `DOMPurify.sanitize` 调用 1 处；`buildSection` 内不调 DOMPurify；`escapeHtml` 仅转义纯文本 |

### 0.4 降级策略说明（因无运行期单测）

部分验收标准需运行期行为，无单测框架时**改以代码审查 + 结构证据确认**，并在本计划中明确判定来源：

- **第 3 条（医师区块独立降级）**：以代码审查 `homeStore.fetchHomeData` 是否用 `Promise.allSettled` + 分区块 error ref + 模板各区块独立 `v-if="homeStore.doctorsError"` / `block-empty` 判定（无法运行期 mock 断网）。
- **第 4 条（轮播定时器清理）**：以审查 `Home.vue` `onUnmounted(stopAuto)` + `startAuto` 先 `stopAuto` 防重复 + `bannerTimer` 单一引用 + `clearInterval` 存在判定（无定时器单测）。
- **第 6 条（视觉贴合原型）**：以区块 DOM 类名 + scoped CSS 类名比对 `docs/prototype.html` 首页模板（无自动截图/像素 diff 工具，记录为**人工项**，由 Verifier 抽查类名清单逐项勾对）。

---

## 1. 逐条验收映射（task_v1.md 第 6.1–6.7）

### 6.1 `npx vue-tsc --noEmit -p tsconfig.app.json` 零错误

- **命令**：`npx vue-tsc --noEmit -p tsconfig.app.json`
- **期望**：EXIT=0，无 stdout/stderr 错误。
- **额外抽查**：
  - 解包路径类型合法：`useHomeApi.ts` 中 `getDoctors/getArticles` 取 `res.data.data`，泛型 `PagedBody<Doctor>`/`PagedBody<Article>` 含 `data: T[]`，不应再触发 `Property 'data' does not exist on type Doctor[]`（C1 修正证据）。
  - `getDiabetesType(id: number)` 入参 number，调用处 `fetchDiabetesTypeDetail(id: number)` 与 `showDiabetesType(t: DiabetesType)` 传 `t.id`（number）类型匹配（M1 修正证据）。
- **通过判据**：EXIT=0 且上述抽查无类型错误。

### 6.2 未登录/登录两态渲染 + 四区块齐全 + 375px 无横向滚动

- **类型层**：6.1 通过即覆盖「store 不读 token」「三接口公开」的类型面。
- **静态审查**：
  - `router/index.ts` 未改，`/home` 仍 `requiresAuth:false`（S4 证未碰 router）。
  - `homeStore.ts` 不出现 `localStorage` / `authStore` 引用（grep 命中 0）。
  - Home.vue template 含四个区块顶层容器：`.home-header` / `.home-banner-wrap` / `.home-section`（医师）/ `.home-section`（文章）/ `.home-section`（类型），即 4 区块齐全。
- **375px 无横向滚动**（审查 CSS）：
  - `.home-page { max-width: 480px; margin: 0 auto; }`（整体居中且限宽）。
  - 仅 `.doctor-scroll` 用 `overflow-x: auto`（局部横向滚动，非整页）。
  - 其余区块无 `width > 100%` / 无 `vw` 超界。
- **降级**：无浏览器运行项时，以上 CSS 类名与原型比对一致即认定通过；若后续接入浏览器冒烟（`npx vite` + 手工 375px DevTools），记录为人工项。
- **通过判据**：template 四区块容器存在 + `.home-page` 限宽 + 仅 `.doctor-scroll` 横向滚动；6.1 类型通过。

### 6.3 `/api/doctors` 失败时医师区块降级、其余不受影响（降级确认）

- **降级方式**：代码审查（无运行期 mock）。
- **审查证据**（`homeStore.ts`）：
  - `fetchHomeData` 使用 `Promise.allSettled([getDoctors, getArticles, getDiabetesTypes])`（第 44 行）——三调用并行且 reject 不抛出。
  - 按 `docRes.status === 'fulfilled'` 分支：fulfilled 填 `doctors.value`；rejected 填 `doctorsError.value`（第 50–51 行），**不触及** `articles`/`diabetesTypes`。
  - `articles.artRes`、`types.typeRes` 同理独立回填（第 52–55 行）。任一 reject 不阻断其余两 fulfilled 分支。
- **模板降级 UI**：审查 `Home.vue` 医师区 `v-if="homeStore.doctorsError"` → `.block-empty` + `.retry-btn` 调 `retryDoctors()`；其余两区块无论医师是否失败，各自按自身 error/空/loading 状态独立渲染。
- **通过判据**：`Promise.allSettled` 存在 + 三 error ref 各自独立回填 + 模板三区块互不影响 + 重试按钮仅重拉自身区块 (`fetchSingle(which)` 第 90–115 行)。

### 6.4 轮播 4s 自动 + 点击/圆点切换 + 离页清理（降级确认）

- **降级方式**：代码审查（无定时器单测）。
- **审查证据**（`Home.vue`）：
  - `nextBanner()` 切下一张；`startAuto()` 内先 `stopAuto()` 再 `setInterval(nextBanner, 4000)`（4s）赋值 `bannerTimer`。
  - `stopAuto()`：`if (bannerTimer) { clearInterval(bannerTimer); bannerTimer = null }`。
  - `onMounted(startAuto)`；`onUnmounted(stopAuto)`（生命周期配对）。
  - 模板：`.banner-frame[@click="nextBanner"]`（卡片切换）；`.swiper-dot[@click.stop="current=i"]`（圆点直切 + `.stop` 阻止冒穿到 frame）。
- **通过判据**：`setInterval` 间隔为 `4000`；`onMounted`/`onUnmounted` 配对存在；`startAuto` 先 `stopAuto` 防重复挂表；`bannerTimer` 单引用且 `clearInterval` 后置空。

### 6.5 糖尿病类型点击弹层正确展示病因/表现/治疗

- **降级方式**：代码审查 + DOMPurify 单次净化确认（无运行期点击单测）。
- **审查证据**（`Home.vue`）：
  - 模板：`.type-card[@click="showDiabetesType(t)"]`。
  - `showDiabetesType(t)`：`await homeStore.fetchDiabetesTypeDetail(t.id)` 后 `const data = detail ?? t`，**单次** `openTypeSwal(data)`（M4：无先弹后补再重弹、无双弹窗）。
  - `openTypeSwal`：`buildSection('病因', t.pathogenesis)` / `buildSection('临床表现', t.manifestation)` / `buildSection('治疗方式', t.treatment)` 三段拼装；整体 `DOMPurify.sanitize(html)` **一次**后传入 `Swal.fire({ html, title: t.name, width: 340 })`（M5：不双重净化，`escapeHtml` 仅转义纯文本）。
  - `buildSection` 在 body 为空时返回空串，缺字段则省略对应段，不显示空标题。
- **通过判据**：三段文本（病因/表现/治疗）均进入 `buildSection`；`Swal.fire` 调用 1 次；`DOMPurify.sanitize` 调用 1 次（S6）；标题取 `t.name`。

### 6.6 视觉与 `docs/prototype.html` 首页一致（人工项）

- **降级方式**：区块 DOM 类名 + scoped CSS 比对（无像素 diff 工具），**记录为人工项**。
- **比对清单**（逐项在 prototype.html 408–523 行与 Home.vue 之间勾对）：

| 区块 | prototype.html 含义 | Home.vue 类名（应存在） |
|---|---|---|
| 顶部 header | logo + 标题 + 副标题 + 搜索按钮 | `.home-header` / `.home-logo` / `.home-title` / `.home-subtitle` / `.home-search-btn` |
| Banner | 3 条渐变 + glow + 圆点 + CTA | `.home-banner-wrap` / `.banner-frame` / `.banner-slide` / `.banner-glow` / `.swiper-dot` |
| 医师 | 横滚卡 + avatar-ring + 姓名/科室/职称 | `.doctor-scroll` / `.doctor-card` / `.avatar-ring` / `.doctor-name` / `.doctor-dept` / `.doctor-title` |
| 文章 | 封面 + 分类标签 + 标题 + 摘要 + 阅读量 | `.article-card` / `.article-cover` / `.article-category` / `.article-title` / `.article-summary` / `.article-meta` |
| 糖尿病类型 | 2 列网格 + 渐变叠层 + 名称 + 简介 | `.type-grid` / `.type-card` / `.type-cover-wrap` / `.type-grad-1..4` / `.type-name` / `.type-brief` |

- **主色核对**：`var(--color-primary)` `#4A90D9` 用于 `.section-link`、`.doctor-title`、`.article-category`、`.retry-btn`，与原型主色一致。
- **若环境具备浏览器**：可 `npx vite` 启动 + DevTools 375px 视图截图人工对比；否则仅以类名清单勾对通过。
- **通过判据**：上表类名逐项命中；4 组类型渐变 `.type-grad-1..4` 齐全；banner 3 组渐变 `.banner-grad-1..3` 齐全。

### 6.7 无 `any` + 无 `v-html` 未净化 + 无硬编码 URL

- 直接对 4 文件执行 0.3 表中 S1/S2/S3：
  - S1 新增文件 grep `any`：期望 0 命中。
  - S2 `Home.vue` grep `v-html`：期望 0 命中。
  - S3 4 文件 grep `https?://host` 绝对 URL：期望 0 命中（占位图为 `/static/images/...` 相对路径，非 host）。
- **通过判据**：S1=0、S2=0、S3=0、S5 未引入新依赖。

---

## 2. 执行顺序

1. `git status` / `git diff --stat` → S4/S5 变更集合规核查（只动 4 文件 + implements/md）。
2. `npx vue-tsc --noEmit -p tsconfig.app.json` → 6.1 主判据。
3. `npx vite build` → 构建冒烟。
4. 静态 grep S1/S2/S3 → 6.7。
5. 代码审查 6.3（allSettled）、6.4（定时器）、6.5（弹层净化）。
6. 人工类名比对 6.6。
7. 汇总「通过/降级确认/人工项」三类结论，填入验证执行记录。

---

## 3. 结论分类口径

- **PASS**：命令 EXIT=0 / grep 命中数符合期望 / 代码审查证据齐备。
- **PASS（降级确认）**：6.3 / 6.4 / 6.5 因无运行期单测，以代码审查证据通过，结论标注「降级确认」。
- **PASS（人工项）**：6.6 视觉以类名清单比对通过，结论标注「人工项」；若需像素级则待浏览器冒烟。
- **FAIL**：任一主判据（6.1 类型零错误、6.7 净化/any/URL、S4 变更集）不满足即 FAIL，回退 Coder。

---

## 4. 备注

- 本计划不实际执行命令（Verifier 仅产计划）；命令执行与证据收集由后续验证执行环节承担，执行结果写入同目录验证记录文件。
- 此分支禁止切换，所有命令须在该分支 `202606271219_home_plan_punch_frontend` 下运行。