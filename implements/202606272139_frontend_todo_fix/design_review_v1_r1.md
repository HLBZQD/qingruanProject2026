# 设计审查报告 v1-r1

> **审查对象**: `implements/202606272139_frontend_todo_fix/detail_v1.md`（首轮修复详细设计 v1）
> **审查基线**: 诊断报告 `a_v8_diag_v3.md`、详细设计文档 `2_detailed_design_v3.md`、任务文件 `task_v1.md`、计划文件 `plan.md`
> **审查日期**: 2026-06-27
> **审查结论**: **REJECTED** — 存在 2 个阻塞级问题需修订后重新审查

---

## 审查概述

对 6 项任务（S9/S3/S7/S1/S2/S5a）的详细设计进行了逐项审查，对照诊断报告的问题描述、实际源代码结构、详细设计文档 v3 的设计意图进行交叉验证。

总体而言，Task 1（S9 竞态保护）、Task 4（S1 首页缓存）、Task 5（S2 方案缓存）、Task 6（S5a 文章详情）的设计正确且可直接编码。**Task 2（S3）和 Task 3（S7）存在设计缺陷**——主要涉及异步执行顺序和状态机正确性问题。

---

## 逐任务审查

### Task 1: S9 — fetchAnalysis() 竞态保护

**结论**: PASS（无问题）

- 修改方案与诊断报告 S9 完全一致：复用同文件 `fetchList()` 已有的 `requestId` 快照模式
- 经验证 `punchStore.ts` 第52行确实已有 `const requestId = ref(0)`，无需新增变量
- 代码变更具体、有明确的改前/改后对比
- 竞态场景枚举完整（连续重入、fire-and-forget、异常路径均已覆盖）
- `finally` 块中条件设置 `analysisLoading.value = false` 与 `fetchList` 模式一致

### Task 2: S3 — Punch.vue 默认近30天日期筛选

**结论**: FAIL（2 个阻塞问题 + 1 个依赖问题）

#### 问题 2-1 [阻塞]：`setFilter` 为同步函数，`await store.setFilter(...)` 立即返回，`store.error` 检测逻辑失效

**根因**: `punchStore.ts` 的 `setFilter()` 函数（第142行）是同步函数，返回类型为 `void`。其内部调用 `fetchList()` 但不 `await` 它。当前 `onMounted` 代码：

```typescript
// 当前（正确）: 直接 await async 函数
await store.fetchList()
if (store.error) { ... }  // fetchList 已完成，error 已回填

// 设计修改后（问题）: setFilter 同步，await 立即返回
await store.setFilter({...})  // setFilter 返回 void，立即 resolve
if (store.error) { ... }      // fetchList 尚未完成，error 为 null（刚被清除）
```

**影响**: `listViewMode` 始终被设为 `'list'`（非 `'listError'`）。在 fetchList 异步执行期间，用户看到空白列表而非骨架屏。如果 fetchList 最终失败，错误态不会显示（`listViewMode` 已在同步路径中设为 `'list'`）。

**建议修复方案（3选1）**:
1. **推荐**: 使 `setFilter` 异步化 — 改为 `async function setFilter(...)` 并在函数体内 `await fetchList()`，保持 `onMounted` 中 `await store.setFilter(...)` 的语义不变
2. **备选**: 不在 `onMounted` 中依赖 `store.error` 判断，改用 `watch(store.error, (e) => { if (e) listViewMode.value = 'listError' })` 和 `watch(store.listLoading, (v) => { if (!v) listViewMode.value = store.error ? 'listError' : 'list' })` 模式
3. **备选**: 回退到直接 `await store.fetchList()`，日期设置和 setFilter 调用分离

#### 问题 2-2 [阻塞]：Task 2 删除了 `store.fetchAnalysis()` 但 Task 3 尚未执行，分析加载丢失

**根因**: 设计在 onMounted 中删除了 `store.fetchAnalysis()` 直接调用，注释说明"已由 setFilter → fetchList + fetchAnalysis (Task3 S7) 覆盖"。但 `task_v1.md` 的执行顺序为 `Task1 → Task2 → Task3`，Task 2 在 Task 3 之前执行。

详细设计自己的依赖矩阵也标注 `Task2 → Task3`（Task2 依赖 Task3），但任务文件的串行顺序与此矛盾。

**影响**: 在 Task 2 完成但 Task 3 未应用的时间窗口内，进入 Punch 页面不会触发 AI 分析加载（分析区为空）。

**建议修复方案**:
1. **推荐**: 调整执行顺序为 `Task1 → Task3 → Task2`（Task 3 先于 Task 2），确保 setFilter 先增强再被调用
2. **备选**: 在 Task 2 的 onMounted 中保留 `store.fetchAnalysis()` 调用（不删除这行），待 Task 3 完成后再移除（但需另行记录此清理项）

#### 问题 2-3 [轻微]：URL query 参数校验可以更严格

设计中使用 `typeof qStart === 'string' && qStart` 检查 URL 参数。空字符串 `''` 通过 `typeof === 'string'` 检查但 `&& qStart` 会拒绝。这是合理的。但设计未校验日期格式（如 `2026-01-01` 符合格式但 `abc` 不符合）。虽然文档在边界条件表中声明"值传递给后端；后端参数校验失败由 fetchList catch 处理"，但建议在此处增加简单的格式校验（`/^\d{4}-\d{2}-\d{2}$/.test(qStart)` 或类似），减少无效请求。

### Task 3: S7 — 日期筛选变更同步触发 AI 分析重拉取

**结论**: PASS（设计正确，但受 Task 2 的问题 2-1 间接影响）

- 修改方案与诊断报告 S7 完全一致：在 `setFilter` 中追加 `fetchAnalysis()` 调用
- 防抖实现（300ms debounce）设计正确，`clearTimeout` + `setTimeout` 模式标准
- 快速连续变更的竞态场景已正确分析
- 边界条件覆盖全面（fetchAnalysis 失败不阻断列表、防抖窗口内多次变更仅最后一次生效）
- **注意事项**: 此 Task 也涉及 `setFilter` 函数。若按问题 2-1 的建议将 `setFilter` 改为 async（`await fetchList()`），则 `fetchAnalysis()` 的防抖调用无需改变（仍通过 setTimeout fire-and-forget）。`setFilter` 只需等待 `fetchList` 完成，分析的重拉取可保持防抖异步模式。
- **依赖协调**: 请确保 Task 3 **先于** Task 2 执行（参见问题 2-2），或确认问题 2-2 的其他解决方案。

### Task 4: S1 — Home.vue sessionStorage 1小时缓存

**结论**: PASS（无问题）

- 修改方案与诊断报告 S1 完全一致
- 缓存结构（`HomeCache` interface）、读写工具函数（`readHomeCache`/`writeHomeCache`）、清理函数（`clearHomeCache`）定义完整
- 边界条件考虑周全：`QuotaExceededError` try-catch、JSON 损坏降级、结构校验、部分 API 成功仍写缓存
- 缓存 TTL（1小时/3600000ms）与设计文档 v3 第3474行一致
- 缓存键前缀 `qrzl_` 与总体设计约定一致
- `clearHomeCache()` 暴露在 return 块中，为后续 S8 提供接口
- 代码变更具体，有明确的改前/改后对比

### Task 5: S2 — LifePlan.vue sessionStorage 30分钟方案缓存

**结论**: PASS（无问题）

- 修改方案与诊断报告 S2 完全一致
- `completedMap`（`Map<number, CompletionStatus>`）的 JSON 序列化方案正确：`[...map]` 转数组，`new Map(array)` 恢复
- `currentPlan === null`（空方案）也写入缓存的设计决策合理——区分"未请求过"和"已请求过但无数据"
- 缓存 TTL（30分钟/1800000ms）与设计文档 v3 第3482行一致
- `generate()` 和 `adjust()` 成功后写入缓存的逻辑完整
- **已知权衡（设计已标注）**: `createPunchAction` 不写缓存，打卡后刷新页面 `completedMap` 恢复为上次缓存状态。设计文档将此标注为"由修复者根据产品需求决定"——此为合理的设计决策记录，不阻塞通过，但建议 Product Owner 确认此行为是否可接受。

### Task 6: S5a — ArticleDetailView.vue + /news/article/:id 路由 + API

**结论**: PASS（无问题）

- 修改方案与诊断报告 S5a 完全一致
- `ArticleDetail` 类型定义与设计文档 v3 第2672-2675行完全一致：`extends Article` 增加 `content: string` 和 `is_collected: boolean`
- `getArticle(id: number)` API 函数与 `useHomeApi.ts` 现有模式一致（`res.data.data` 解包）
- 路由注册顺序正确：`/news/article/:id` 在 `/news` 之前，确保精确匹配优先
- 组件状态机完整（加载→正常/404/错误），所有状态分支均有模板对应
- Markdown 净化链（`marked.parse` + `DOMPurify.sanitize`）复用现有范式
- 降级方案（后端 API 未就绪时用 `getArticles()` 客户端筛选）已提供且限制已明确标注
- 边界条件覆盖全面：非数字 ID、内容为空、XSS 注入、空标签数组等
- `marked` 版本为 `^18.0.5`，已确认支持 `{ async: false }` 选项
- `page-enter` 类为项目现有约定（Home/LifePlan/Punch 均使用），一致性良好
- 样式变量（`--color-*`、`--spacing-*`、`--font-size-*`、`--radius-*`）均为设计文档 4.5.1 节定义的 CSS 变量

---

## 跨任务依赖验证

```
设计依赖矩阵:

Task1 (S9)  ———┬——→ Task2 (S3)   [S9 竞态保护 → S3 调用 setFilter 安全]
               └——→ Task3 (S7)   [S9 竞态保护 → S7 的 fetchAnalysis 安全]

Task2 (S3)  ———┬——→ Task3 (S7)   [S3 依赖 S7 增强 setFilter]  ← 问题 2-2
```

**发现的矛盾**: 详细设计自身标注 Task2 依赖 Task3，但 `task_v1.md` 的执行顺序为 Task1→Task2→Task3（串行）或 ABCD 四组并行（无 Task2→Task3 顺序约束）。**Task 3 必须在 Task 2 之前执行**，或 Task 2 需要回退假设。

**其他依赖链验证正确**:
- Task 4/5/6 均独立，无交叉依赖问题
- S1/S2 → S8 的接口暴露（`clearHomeCache`/`clearPlanCache`）已就位
- S5a → S6 的路由基础已就位

---

## 与设计文档 v3 的一致性检查

| 设计文档要求 | 对应 Task | 一致性 |
|------------|----------|:------:|
| 4.2节 sessionStorage 首页缓存 (第3474行) | Task 4 (S1) | OK |
| 4.2节 sessionStorage 方案缓存 (第3482行) | Task 5 (S2) | OK |
| 4.3节 Home 流程图"检查 sessionStorage 缓存" (第3504行) | Task 4 (S1) | OK |
| 4.3节 Punch 流程图"默认近30天" (第3779行) | Task 2 (S3) | OK（逻辑正确，但有执行问题） |
| 4.3节 Punch 流程图"重新请求 list+analysis" (第3793行) | Task 3 (S7) | OK |
| 1.6.1节 /news/article/:id 路由 (第432行) | Task 6 (S5a) | OK |
| 3.2.20节 GET /api/articles/:id 响应 (第2051-2071行) | Task 6 (S5a) | OK |
| 3.8.3节 ArticleDetail 类型 (第2672-2675行) | Task 6 (S5a) | OK |

所有 6 项任务的设计意图与设计文档 v3 一致。无设计偏离。

---

## 代码具体性评估

| Task | 改前/改后对比 | 文件路径 | 行号 | 类型定义 |
|:----:|:-----------:|---------|:----:|:-------:|
| S9 | 明确 | `punchStore.ts:125-135` | 明确 | N/A |
| S3 | 明确 | `Punch.vue:135-147`, 新增 `useRoute` | 明确 | `formatDate(d: Date): string` |
| S7 | 明确 | `punchStore.ts:142-152`, 新增变量 | 明确 | 无公开类型变更 |
| S1 | 明确 | `homeStore.ts:38-149` 多个函数 | 明确 | `HomeCache` (私有 interface) |
| S2 | 明确 | `lifePlanStore.ts:42-157` 多个函数 | 明确 | `PlanCache` (私有 interface) |
| S5a | 明确 | 新建 `ArticleDetailView.vue` + 4文件修改 | 明确 | `ArticleDetail extends Article` |

---

## 风险提示

1. **S2 打卡缓存不一致**: `createPunchAction` 不写 sessionStorage，导致用户打卡后刷新页面看到旧状态。建议在产品验收时明确此行为是否接受，或增加 `writePlanCache()` 调用（约 1-2ms 序列化开销）。

2. **Punch.vue 的 `listViewMode` 状态机**: 当前依赖 `await store.fetchList()` 的完成来决定视图模式。如果改为依赖 `setFilter`（同步）的返回，需要配套调整视图模式切换逻辑。建议在解决阻塞问题 2-1 时一并重新评估 `listViewMode` 状态机的设计。

3. **S5a 降级方案的 pagination 依赖**: 如果后端 API 未就绪需走降级方案，需先通过 `curl` 验证 `GET /api/articles` 无参请求的返回数量。如仅返回首页10条，降级方案不可用。

4. **mark.js 版本兼容**: 已确认 `marked@^18.0.5` 支持 `{ async: false }` 选项。无风险。

---

## 问题清单（修订要求）

### 阻塞级（必须修订后重新审查）

| # | 任务 | 问题 | 建议 |
|:-:|:----:|------|------|
| 1 | Task 2 (S3) | `await store.setFilter(...)` 无效——setFilter 是同步函数，立即返回。`store.error` 检测在 fetchList 完成前执行，错误态逻辑失效 | 将 setFilter 改为 async（内部 await fetchList），或使用 reactive watch 驱动 viewMode，或回退到直接 await store.fetchList() |
| 2 | Task 2 (S3) & Task 3 (S7) | 执行顺序矛盾：Task 2 删除 fetchAnalysis 依赖 Task 3 的 setFilter 增强，但 Task 2 排在 Task 3 之前 | 调整执行为 Task1→Task3→Task2，或 Task 2 保留 fetchAnalysis 调用待 Task 3 完成后移除 |

### 建议级（非阻塞，建议修订）

| # | 任务 | 问题 | 建议 |
|:-:|:----:|------|------|
| 3 | Task 2 (S3) | URL query 日期参数未做格式校验 | 添加 `/^\d{4}-\d{2}-\d{2}$/.test()` 校验，拒绝非法格式走默认分支 |
| 4 | Task 5 (S2) | createPunch 不写缓存导致打卡后刷新状态回退 | 与 Product Owner 确认此行为是否可接受；如不可接受，在 createPunchAction 成功后追加 writePlanCache() |

---

## 审查统计

| 维度 | 通过 | 阻塞 | 建议 |
|------|:---:|:---:|:---:|
| Task 1 (S9) | PASS | 0 | 0 |
| Task 2 (S3) | — | 2 | 1 |
| Task 3 (S7) | PASS* | 0 | 0 |
| Task 4 (S1) | PASS | 0 | 0 |
| Task 5 (S2) | PASS | 0 | 1 |
| Task 6 (S5a) | PASS | 0 | 0 |
| **合计** | **4 PASS** | **2 阻塞** | **2 建议** |

\* Task 3 设计本身正确，但其与 Task 2 的执行顺序依赖需协调（间接影响）

---

*设计审查报告结束。修订后将重新审查。*
