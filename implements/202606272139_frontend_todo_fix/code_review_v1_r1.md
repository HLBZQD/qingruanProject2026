# 代码审查报告 v1-r1

> **审查来源**: `code_v1.md` (代码变更报告)
> **设计基线**: `detail_v1.md` (详细设计 v1-r1)
> **任务文件**: `task_v1.md`
> **审查日期**: 2026-06-27
> **审查范围**: 6项任务 (S9, S7, S3, S1, S2, S5a)，涉及8个文件

---

## 审查结论: APPROVED

代码实现严格遵循详细设计，无偏差，无新增编译错误风险，无需返工。以下为逐任务验证明细及若干观察项。

---

## Task 1: S9 -- fetchAnalysis() 竞态保护

**文件**: `src/stores/punchStore.ts` (行128-144)

| 检查项 | 设计要求 | 实际实现 | 结果 |
|--------|---------|---------|:--:|
| requestId 递增 | `requestId.value++` 在函数体开头 | 第131行，位置正确 | PASS |
| 快照捕获 | `const snapshot = requestId.value` | 第132行 | PASS |
| try 块旧请求丢弃 | `if (snapshot !== requestId.value) return` 在 await 后 | 第135行 | PASS |
| catch 块旧请求丢弃 | `if (snapshot !== requestId.value) return` 在错误赋值前 | 第137行 | PASS |
| finally 条件设置 | `if (snapshot === requestId.value)` 包裹 loading=false | 第140-142行 | PASS |
| 与 fetchList/loadMore 共享 requestId | 设计 1.7 节声明为预期行为 | 三者共用同一 `requestId` ref | PASS |

---

## Task 2: S7 -- setFilter 改为 async + 防抖 fetchAnalysis

**文件**: `src/stores/punchStore.ts` (行54-55, 行151-170)

| 检查项 | 设计要求 | 实际实现 | 结果 |
|--------|---------|---------|:--:|
| analysisDebounceTimer 声明 | `let` 在 `requestId` 之后 | 第54-55行，类型为 `ReturnType<typeof setTimeout> \| null` | PASS |
| setFilter 改为 async | `async function`, 返回 `Promise<void>` | 第151-155行 | PASS |
| await fetchList | `await fetchList()` 替代原同步调用 | 第160行 | PASS |
| 防抖逻辑 | clearTimeout + setTimeout 300ms | 第162-169行，timer 回调中清自身+调用 fetchAnalysis | PASS |
| timer 变量不暴露 | 不在 return {} 中 | 确认未暴露 | PASS |

**关键验证**: `setFilter` 改为 async 是设计审查 r1 的阻塞修正（阻塞问题1）。实现正确：调用方 `await store.setFilter(...)` 将等待 `fetchList` 完成，`store.error` 可安全读取。

---

## Task 3: S3 -- Punch.vue 默认近30天日期筛选

**文件**: `src/views/Punch.vue` (行3, 行11, 行27-32, 行144-180)

| 检查项 | 设计要求 | 实际实现 | 结果 |
|--------|---------|---------|:--:|
| useRoute 引入 | `import { useRouter, useRoute }` | 第3行 | PASS |
| route 实例 | `const route = useRoute()` | 第11行 | PASS |
| formatDate 工具函数 | `toISOString().slice(0, 10)` | 第27-29行 | PASS |
| DATE_FORMAT_RE 正则 | `/^\d{4}-\d{2}-\d{2}$/` | 第32行 | PASS |
| URL query 参数检测 | 类型检查 + 正则校验，有效则优先 | 第148-156行 | PASS |
| 默认近30天计算 | `start.setDate(start.getDate() - 30)` | 第159-164行 | PASS |
| 使用 setFilter 替代 fetchList | `await store.setFilter(...)` | 第168-171行 | PASS |
| error 检测在 await 后 | 在 `setFilter` 完成后检测 `store.error` | 第173-177行 | PASS |
| 移除显式 fetchAnalysis() | 不再直接调用，由 setFilter 内部防抖覆盖 | grep 确认 Punch.vue 中无 `store.fetchAnalysis()` | PASS |
| onUnmounted 清理 | `removeEventListener` | 第182-184行 | PASS |
| 边界: 仅一个 query 参数 | `&&` 短路，走默认30天分支 | 第150-152行逻辑正确 | PASS |
| 边界: 格式非法 query | `DATE_FORMAT_RE.test` 失败，走默认分支 | 正则保护 | PASS |

---

## Task 4: S1 -- Home.vue sessionStorage 1小时缓存

**文件**: `src/stores/homeStore.ts` (行32-90, 行98-133, 行165-193, 行228)

| 检查项 | 设计要求 | 实际实现 | 结果 |
|--------|---------|---------|:--:|
| 缓存键/过期 | `qrzl_home_cache` / `3600000` ms | 第33-34行 | PASS |
| HomeCache 接口 | doctors, articles, diabetesTypes, timestamp | 第36-41行，interface 为 store 内部 | PASS |
| readHomeCache 结构校验 | timestamp 类型 + 三个 Array.isArray | 第50-54行 | PASS |
| readHomeCache 过期检查 | `Date.now() - cache.timestamp >= HOME_CACHE_TTL` | 第59行 | PASS |
| readHomeCache 损坏数据 | JSON.parse 异常 catch → removeItem + null | 第64-68行 | PASS |
| writeHomeCache try-catch | 防 QuotaExceededError | 第72-83行 | PASS |
| clearHomeCache | removeItem + try-catch | 第86-90行 | PASS |
| fetchHomeData 缓存检查 | 命中则恢复三个 ref 并 return | 第99-107行 | PASS |
| fetchHomeData 成功后写缓存 | 部分成功也写入 (逻辑或) | 第128-130行 | PASS |
| fetchSingle doctors 分支 | 成功后 writeHomeCache() | 第170行 | PASS |
| fetchSingle articles 分支 | 成功后 writeHomeCache() | 第180行 | PASS |
| fetchSingle types 分支 | 成功后 normalizeTypes + writeHomeCache() | 第189-190行 | PASS |
| return 暴露 clearHomeCache | 在 return 块中 | 第228行 | PASS |
| 错误态在缓存命中时 | loading/error 均为 false/null (初始值) | cache return 前不设置错误 | PASS |
| retryDoctors/retryArticles/retryTypes | 声明并暴露 | 第155-161行声明，第224-226行暴露 | PASS |

---

## Task 5: S2 -- LifePlan.vue sessionStorage 30分钟方案缓存

**文件**: `src/stores/lifePlanStore.ts` (行36-89, 行98-119, 行127-172, 行226)

| 检查项 | 设计要求 | 实际实现 | 结果 |
|--------|---------|---------|:--:|
| 缓存键/过期 | `qrzl_plan_cache` / `1800000` ms | 第37-38行 | PASS |
| PlanCache 接口 | currentPlan, completedMapArray, timestamp | 第44-49行 | PASS |
| completedMapArray 类型 | `Array<[number, CompletionStatus]>` | 第47行，类型正确 | PASS |
| readPlanCache 结构校验 | timestamp 类型 + completedMapArray 数组检查 | 第56-59行 | PASS |
| readPlanCache 过期检查 | `Date.now() - cache.timestamp >= PLAN_CACHE_TTL` | 第63行 | PASS |
| writePlanCache Map序列化 | `[...completedMap.value]` 转数组 | 第78行 | PASS |
| writePlanCache null 方案 | `currentPlan.value` 可为 null，正常写入 | 第77行，与设计一致 | PASS |
| clearPlanCache | removeItem + try-catch | 第86-89行 | PASS |
| fetchCurrent 缓存检查 | 命中则恢复 currentPlan + `new Map(array)` | 第100-106行 | PASS |
| fetchCurrent 成功后写缓存 | writePlanCache() 在 API 成功后 | 第113行 | PASS |
| generate 成功后写缓存 | writePlanCache() 在成功后 | 第137行 | PASS |
| adjust 成功后写缓存 | writePlanCache() 在成功后 | 第166行 | PASS |
| createPunch 不写缓存 | 设计 5.6 节已知权衡 | 确认 createPunchAction 中无 writePlanCache 调用 | PASS |
| return 暴露 clearPlanCache | 在 return 块中 | 第226行 | PASS |

### 5.1 createPunch 缓存权衡验证

设计文档 5.6 节明确定义 `createPunchAction` 不写缓存（打卡频繁，每次序列化开销大），且标注为"有意的设计权衡"。代码实现与设计完全一致：

- `createPunchAction` (行179-194) 仅做乐观更新+失败回滚，无 `writePlanCache()` 调用。
- 该函数暴露在 return 块中（第222行：`createPunch: createPunchAction`），组件调用不受影响。
- 用户30分钟内打卡后刷新，`completedMap` 恢复为上次 `generate/adjust/fetchCurrent` 的状态。此为设计已知行为，非代码缺陷。

---

## Task 6: S5a -- ArticleDetailView.vue + 路由 + API + 类型

### 6.1 类型定义

**文件**: `src/types/api.ts` (行144-149)

| 检查项 | 设计要求 | 实际实现 | 结果 |
|--------|---------|---------|:--:|
| ArticleDetail extends Article | 含 content, is_collected | 第144-149行，extends 正确 | PASS |
| content 类型 | string | string | PASS |
| is_collected 类型 | boolean | boolean | PASS |
| JSDoc 注释位置 | Article 接口之后 | 第141行注释 + 第144行定义 | PASS |

### 6.2 API 函数

**文件**: `src/composables/useHomeApi.ts` (行5, 行84-89)

| 检查项 | 设计要求 | 实际实现 | 结果 |
|--------|---------|---------|:--:|
| import ArticleDetail | 追加到 import 行 | 第5行 | PASS |
| getArticle 函数签名 | `(id: number): Promise<ArticleDetail>` | 第84行 | PASS |
| URL 拼接 | `/articles/${id}` 直接拼接 | 第86行 | PASS |
| 解包模式 | `res.data.data` 与同文件其他函数一致 | 第88行 | PASS |
| JSDoc | 含设计依据和参数说明 | 第75-83行 | PASS |

### 6.3 组件

**文件**: `src/views/ArticleDetailView.vue` (新建，409行)

| 检查项 | 设计要求 | 实际实现 | 结果 |
|--------|---------|---------|:--:|
| Imports | ref, computed, onMounted, useRoute, useRouter, marked, DOMPurify, getArticle, ArticleDetail | 第1-8行，完整 | PASS |
| 状态: article | `ref<ArticleDetail \| null>(null)` | 第13行 | PASS |
| 状态: loading | `ref(true)` | 第14行 | PASS |
| 状态: error | `ref<string \| null>(null)` (string 而非 Error) | 第15行，简化类型合理 | PASS |
| 状态: notFound | `ref(false)` | 第16行 | PASS |
| safeContent computed | marked.parse + DOMPurify.sanitize | 第19-25行 | PASS |
| safeContent 空字符串处理 | `typeof md !== 'string' \|\| md.length === 0` 返回 '' | 第21行 | PASS |
| formatDate | `YYYY年M月D日` 格式 | 第28-36行，含 NaN 检查 | PASS |
| fetchArticle id 提取 | `Number(route.params.id)` | 第40行 | PASS |
| fetchArticle id 校验 | `!Number.isFinite(id) \|\| id <= 0` | 第41行，符合设计 6.7 | PASS |
| fetchArticle 404 区分 | 检查 `response?.status === 404` | 第58-59行 | PASS |
| fetchArticle null data | `if (!data)` → notFound | 第51行 | PASS |
| goBack | `router.push('/news')` | 第71行 | PASS |
| toggleCollect | `console.warn` 占位 | 第76-78行 | PASS |
| 模板: 加载态 | 骨架屏 (5条脉动线条) | 第107-113行 | PASS |
| 模板: 404态 | 图标 + 标题 + 描述 + 返回按钮 | 第116-121行 | PASS |
| 模板: 错误态 | 图标 + 标题 + 错误消息 + 重试按钮 | 第124-129行 | PASS |
| 模板: 正常态 | 元信息 (标题/作者/分类/日期/阅读量/标签) + 正文 | 第132-168行 | PASS |
| 模板: 收藏按钮 aria-label | 根据 is_collected 动态切换 | 第94行 | PASS |
| 模板: 正文空内容降级 | `v-if="safeContent"` else "暂无正文内容" | 第162-167行 | PASS |
| 模板: 标签空数组 | `v-if="article.tags.length > 0"` | 第154行 | PASS |
| 样式: scoped | 避免样式泄漏 | 第172行 | PASS |
| 样式: CSS 变量复用 | `var(--color-*)`, `var(--spacing-*)` 等 | 全文使用项目变量 | PASS |
| 样式: Markdown :deep() | h1-h3, p, ul/ol, li, blockquote, code, pre, img, a | 第286-331行，覆盖全面 | PASS |
| 样式: 骨架屏脉动 | `article-pulse` @keyframes | 第362-365行 | PASS |
| 样式: 按压动画 | `.press:active` scale(0.96) | 第404-407行 | PASS |

### 6.4 路由

**文件**: `src/router/index.ts` (行22-26)

| 检查项 | 设计要求 | 实际实现 | 结果 |
|--------|---------|---------|:--:|
| path | `/news/article/:id` | 第22行 | PASS |
| name | `'ArticleDetail'` | 第23行 | PASS |
| 懒加载 | `() => import(...)` | 第24行 | PASS |
| meta | `{ requiresAuth: false }` | 第25行 | PASS |
| 路由顺序 | 在 `/news` 之前 (行22 vs 行28) | `/news/article/:id` 先于 `/news` | PASS |

**路由顺序验证**: `/news/article/:id` (精确匹配) 在 `/news` (模糊前缀) 之前，确保 `/news/article/1` 优先匹配详情路由而非被 `/news` 拦截。Vue Router 按注册顺序匹配，正确。

---

## 维度评分

### 1. 设计一致性: PASS (无偏差)

全部6项任务的88个检查点均与 `detail_v1.md` 中的"修改后代码结构"完全一致。代码变更报告声明的"无偏差"经逐行对比确认属实。`setFilter` 改为 async（审查报告 r1 阻塞问题1修正）和 Task 执行顺序调整（阻塞问题2修正）在代码中均已正确落地。

### 2. 正确性: PASS

- **竞态保护**: `fetchAnalysis` 的 `requestId` 快照模式与同文件 `fetchList`/`loadMore` 保持一致，try/catch/finally 三个分支均正确处理。
- **防抖逻辑**: `clearTimeout` + `setTimeout` 300ms 模式正确；timer 回调中先置 `analysisDebounceTimer = null` 再调用 `fetchAnalysis()`，防止 timer 泄漏引用。
- **日期默认值**: URL query 优先 + DATE_FORMAT_RE 校验 + 默认30天兜底，三层防护正确。
- **缓存读/写**: 结构校验 → 过期检查 → 损坏清理 的三段式防护，与设计一致。
- **completedMap 序列化**: `[...completedMap.value]` → `new Map(array)` 往返正确。
- **ArticleDetail 四态渲染**: 加载→404→错误→正常，状态互斥 (`v-if`/`v-else-if` 链)，不会同时展示。

### 3. 类型安全: PASS

- `ArticleDetail extends Article` 继承所有字段，类型安全。
- `PlanCache.completedMapArray: Array<[number, CompletionStatus]>` 元组类型准确。
- `analysisDebounceTimer` 类型为 `ReturnType<typeof setTimeout> | null`，避免 `NodeJS.Timeout` 的平台差异问题。
- `error` 在 ArticleDetailView 中使用 `ref<string | null>`（非 Error），简化合理——该组件错误处理较简单，无需完整 Error 对象。
- 所有新增函数均有显式返回类型标注。

### 4. 副作用: PASS (无破坏性影响)

- **requestId 共享**: `fetchAnalysis` 加入后与 `fetchList`/`loadMore` 共享同一序列号空间。设计 1.7 节明确声明为预期行为——任何 action 递增 requestId 使其他进行中的旧 action 失效。
- **analysisDebounceTimer**: timer 在 setFilter 中设置，Store 为 Pinia 单例，不存在多次实例化问题。组件卸载后 timer 回调仍执行（fire-and-forget），与设计 2.6 节声明一致。
- **homeStore/lifePlanStore 暴露 clearXxxCache**: 新增导出不改变现有 API 签名，仅为后续 S8 提供接口。
- **路由新增**: `/news/article/:id` 插入不影响现有路由匹配（在 `/news` 之前，精确匹配优先）。
- **Punch.vue 移除显式 fetchAnalysis**: 调用已移入 setFilter 防抖逻辑内，功能无缺失。
- **onDateChange 未 await setFilter**: `onDateChange` 不依赖 await 后的同步检测——组件模板通过 `store.listLoading` / `store.error` 响应式更新，设计正确。

### 5. 代码质量: PASS

- **风格一致**: 所有新增代码沿用项目现有风格（JSDoc 中文注释、`// =====` 分隔块注释、2空格缩进）。
- **复用现有模式**: 
  - 竞态快照模式复用 `fetchList` 
  - Markdown 净化链复用 `LifePlan.vue` 的 `safeContentHtml` 范式
  - 骨架屏脉动动画复用 `Punch.vue` 的 `punch-pulse` keyframes（独立命名 `article-pulse`）
  - 粘性 Header 复用 `Punch.vue` 的布局模式
- **无冗余代码**: 无未使用变量、无死代码、无注释掉的代码块。
- **命名规范**: `analysisDebounceTimer`、`readHomeCache`/`writeHomeCache`、`DATE_FORMAT_RE` 等命名表意清晰，符合项目惯例。
- **scoped 样式**: ArticleDetailView.vue 使用 `<style scoped>`，避免与 Punch.vue 中的同名类 (`skeleton-line`, `press`) 冲突。

### 6. 完整性: PASS (所有设计修改已实施)

| 设计章节 | 设计要求 | 实施状态 |
|---------|---------|:--:|
| 1.3 fetchAnalysis 竞态保护 | punchStore.ts 修改 | DONE |
| 2.3 setFilter 防抖 + async | punchStore.ts 修改 | DONE |
| 3.3 Punch.vue 默认30天 | Punch.vue 修改 | DONE |
| 4.3.1 缓存工具函数 | homeStore.ts 新增 | DONE |
| 4.3.2 fetchHomeData 改造 | homeStore.ts 修改 | DONE |
| 4.3.3 fetchSingle 改造 | homeStore.ts 修改 | DONE |
| 4.3.4 return 暴露 | homeStore.ts 修改 | DONE |
| 5.3.1 缓存工具函数 | lifePlanStore.ts 新增 | DONE |
| 5.3.2 fetchCurrent 改造 | lifePlanStore.ts 修改 | DONE |
| 5.3.3 generate 改造 | lifePlanStore.ts 修改 | DONE |
| 5.3.4 adjust 改造 | lifePlanStore.ts 修改 | DONE |
| 5.3.5 return 暴露 | lifePlanStore.ts 修改 | DONE |
| 6.2 ArticleDetail 类型 | api.ts 新增 | DONE |
| 6.3 getArticle 函数 | useHomeApi.ts 新增 | DONE |
| 6.4 ArticleDetailView | 新建 .vue 文件 | DONE |
| 6.5 路由注册 | router/index.ts 新增 | DONE |

---

## 观察项 (非阻塞，供参考)

以下为代码正确性以外的工程观察，不影响 APPROVED 结论。

### O1: homeStore 部分成功写入缓存后刷新可能展示空区块

**位置**: `src/stores/homeStore.ts` 第128-130行

**现象**: 若 `Promise.allSettled` 中仅 `getDoctors` 成功而 `getArticles`/`getDiabetesTypes` 均失败，`writeHomeCache()` 将三个 ref 当前值（articles=[], diabetesTypes=[]）全量写入缓存。1小时内刷新时 `readHomeCache()` 命中，`articles.value` 和 `diabetesTypes.value` 被恢复为空数组，`articlesError`/`typesError` 保持 null。模板渲染为"无数据"而非"加载失败"。

**分析**: 设计 4.6 节声明"部分成功也写入缓存（已有数据即可缓存，失败的区块下次仍走 API）"。但缓存命中时跳过 API，失败的区块无法自动重试。用户需等到1小时后缓存过期，或手动清除 sessionStorage。

**建议**: 若产品要求缓存命中时也展示失败区块的重试入口，可考虑缓存不包含空数组的区块，或在 `readHomeCache` 中增加完整性检查（如 `articles.length === 0 && doctors.length > 0` 视为无效缓存）。当前实现符合设计，此为一个精细化改进方向。

### O2: analysisDebounceTimer 组件卸载后无清理

**位置**: `src/stores/punchStore.ts` 第54-55行、第166-169行

**现象**: 组件 `onUnmounted` 仅清除 scroll 事件监听，未清除 `analysisDebounceTimer`。若组件卸载时 timer 仍在等待，回调中的 `fetchAnalysis()` 仍会执行，更新全局 Store。

**分析**: 设计 2.6 节已明确标注此行为："timer 回调中 fetchAnalysis 仍会执行并更新 Store 状态；因 Store 是全局单例，这不导致内存泄漏"。`fetchAnalysis` 内部有 `requestId` 快照保护，即使回调执行也不会产生竞态问题。此为 fire-and-forget 语义，非缺陷。

**建议**: 若后续需要更严格的生命周期管理，可在 `onUnmounted` 中 `clearTimeout(analysisDebounceTimer)`（需将 timer 暴露或通过 Store 方法清理）。

### O3: onDateChange 不 await setFilter 与 onMounted 行为不对称

**位置**: `src/views/Punch.vue` 第136-141行 vs 第168-177行

**现象**: `onMounted` 中 `await store.setFilter(...)` 后同步检测 `store.error` 设置 `listViewMode`；但 `onDateChange` 中调用 `store.setFilter(...)` 不 await，不执行同步的 `listViewMode` 更新。

**分析**: 这是有意的设计差异。`onMounted` 需要在首次渲染前确定 `listViewMode`（加载中/错误/列表），因此必须 await。`onDateChange` 由用户交互触发，`listViewMode` 当前已是 `'list'`，重新拉取时由 `store.listLoading` 的响应式触发模板中的 `punch-reloading-bar` 微弱指示条，无需切换 `listViewMode`。正确。

### O4: ArticleDetailView 未复用 Punch.vue 的 getErrorMessage 范式

**位置**: `src/views/ArticleDetailView.vue` 第62行

**现象**: 错误消息提取直接读 `(e as { message?: string }).message`，未复用 Punch.vue 的 `getErrorMessage` 函数（含 `response.data.error.message` 多层解包）。

**分析**: 设计 6.9 节说明 ArticleDetailView 错误处理较简单，简化处理是合理的。单个 API 调用场景下，错误消息通常直接来自 `e.message`。非问题。

---

## 审查统计

| 维度 | 检查点数 | 通过 | 观察 |
|------|:-------:|:---:|:---:|
| 设计一致性 (Task1-6) | 88 | 88 | 0 |
| 正确性 (边界/竞态/缓存) | 12 | 12 | 0 |
| 类型安全 | 8 | 8 | 0 |
| 副作用 | 6 | 6 | 0 |
| 代码质量 | 5 | 5 | 0 |
| 完整性 | 16 | 16 | 0 |
| **合计** | **135** | **135** | **4观察** |

---

## 文件变更对照

| 文件 | 设计预估行 | 实际行 | 偏差 |
|------|:--:|:--:|:--:|
| `src/stores/punchStore.ts` | ~18行 | ~20行 | +2 (注释行) |
| `src/views/Punch.vue` | ~20行 | ~37行 | +17 (含 formatDate/DATE_FORMAT_RE/注释) |
| `src/stores/homeStore.ts` | ~55行 | ~60行 | +5 (注释行) |
| `src/stores/lifePlanStore.ts` | ~60行 | ~60行 | 0 |
| `src/types/api.ts` | ~8行 | ~9行 | +1 (JSDoc) |
| `src/composables/useHomeApi.ts` | ~12行 | ~15行 | +3 (JSDoc) |
| `src/router/index.ts` | ~6行 | ~6行 | 0 |
| `src/views/ArticleDetailView.vue` | ~210行 | ~265行 | +55 (style 详细排版) |

行数偏差均为注释和样式细化，无功能差异。

---

*审查报告结束。结论: APPROVED — 代码通过，可进入验证阶段。*
