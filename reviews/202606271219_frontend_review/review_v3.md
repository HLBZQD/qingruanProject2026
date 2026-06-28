# Round 3: 集成一致性审查报告

**审查日期**: 2026-06-27
**审查范围**: Home / LifePlan / Punch 三个前端模块的跨模块集成、数据流、路由导航、Store/API/类型一致性
**审查方法**: 逐文件完整阅读 15 个源文件 + 交叉引用 grep 验证

---

## 严重问题（影响跨模块功能）

### 1. `diabetesType` query 参数在 LifePlan 中完全丢失

- **位置**: `src/views/Risk.vue:331` → `src/views/LifePlan.vue:88-91`
- **涉及模块**: Risk (风险预测) → LifePlan (生活方案)
- **问题描述**:
  - Risk.vue `goToLifePlan()` 传递了两个 query 参数：`riskLevel` 和 `diabetesType`
  - LifePlan.vue 的 `riskLevelHint` computed 仅读取 `route.query.riskLevel`，完全忽略 `route.query.diabetesType`
  - `diabetesType` 参数被静默丢弃，未参与任何 UI 渲染或逻辑
- **影响**: 用户在风险评估页点击"去生成生活方案"后，方案定制页无法获知用户的糖尿病类型匹配结果，可能影响方案个性化定制的上下文提示
- **建议修复**: 要么（1）在 LifePlan.vue 中增加 `diabetesTypeHint` 展示条目，与 `riskLevel` 一并呈现在 `lp-query-hint` 条中；要么（2）如果 `diabetesType` 无需使用，则从 Risk.vue 的 `goToLifePlan` 中移除该 query 参数，消除死数据

### 2. LifePlan → Punch 打卡联动路径不一致

- **位置**: `src/views/LifePlan.vue:236-273` / `src/views/Punch.vue:348` / `src/router/index.ts:37-40`
- **涉及模块**: LifePlan (生活方案) → Punch (打卡记录)
- **问题描述**:
  - 存在两条从 LifePlan 到达 Punch 的路径：
    1. **路径 A**：LifePlan 内直接打卡 (`handlePunch()` 调用 `store.createPunch()`)，打卡结果写入 `lifePlanStore.completedMap`——不走 Punch 页面
    2. **路径 B**：底部 TabBar 切到 Profile (/profile) → 子路由 punch (`/profile/punch`)，渲染 Punch.vue
  - LifePlan 的"打卡"按钮在页面内完成打卡并更新本地 `completedMap`，但 Punch.vue 完全不知道 LifePlan 的 `completedMap` 的存在
  - Punch.vue 的"去打卡"按钮导航到 `/life-plan`（即 LifePlan.vue），但未传递任何上下文——用户已离开 Punch 页面
- **影响**:
  - 用户从 LifePlan 页面打卡后，再导航到 `/profile/punch` 查看记录列表，列表由 punchStore 独立管理，不会反映 LifePlan 页面中已完成的打卡（除非 punchStore 重新拉取后端数据）
  - 两套打卡状态 (`completedMap` vs `records.completion_status`) 独立存在，可能导致用户混淆
- **建议修复**: 这是架构决策问题，非单纯 bug。建议：
  - 在 Punch.vue `onMounted` 中已调用 `store.fetchList()`，后端应返回 LifePlan 提交的打卡记录——需确认后端 API 的一致性
  - 在 LifePlan.vue `handlePunch` 成功后，可选择性 emit 事件或更新 punchStore，但需权衡耦合度
  - 在文档中明确两条路径的数据一致性保障机制

### 3. 路由守卫规则不一致：三个模块的 `requiresAuth` 设置差异

- **位置**: `src/router/index.ts:8-47`
- **涉及模块**: Home, LifePlan, Punch, Risk
- **问题描述**:
  | 路由 | `requiresAuth` | `requiresDisclaimer` |
  |------|:---:|:---:|
  | `/home` (Home) | `false` | 无 |
  | `/life-plan` (LifePlan) | `true` | `true` |
  | `/profile/punch` (Punch) | `true` | 无 |
  | `/profile/risk` (Risk) | `true` | `true` |
  | `/consultation` | `false` | 无 |
  | `/news` | `false` | 无 |

  - LifePlan 要求 `requiresDisclaimer: true`，但 Risk 中"去生成生活方案"按钮显示在 Risk 结果页——Risk 本身已过免责声明，导航到 LifePlan 时不会二次弹窗，这是合理的
  - 但 Punch (打卡记录) **不要求免责声明**，而 LifePlan **要求**——用户可通过 TabBar "我的"→"打卡记录"进入 Punch，无需同意免责声明；但进入 LifePlan 需要。这存在策略不一致。
- **影响**: 用户进入 LifePlan 须同意免责声明，但 Punch 页面展示 AI 分析内容（同样含 `punch-disclaimer` 免责提示条），却无需同意。防护策略不统一。
- **建议修复**: 考虑将 Punch 也加入 `requiresDisclaimer: true`，或在设计文档中明确区分两类页面的免责策略理由

---

## 一般问题（一致性/风格问题）

### 4. Store 中 action 命名不一致：fetch/get 前缀混用

- **位置**:
  - `src/stores/homeStore.ts` — `fetchHomeData()`, `fetchDiabetesTypeDetail()`, `retryDoctors()`
  - `src/stores/lifePlanStore.ts` — `fetchCurrent()`, `generate()`, `adjust()`
  - `src/stores/punchStore.ts` — `fetchList()`, `fetchAnalysis()`, `loadMore()`
- **涉及模块**: 三个 Store
- **问题描述**: homeStore 的入口方法 `fetchHomeData()` 可用 `fetchData()` 更短；lifePlanStore 使用 `fetchCurrent()` 而非 `fetchPlan()`；punchStore 使用 `loadMore()` 而非 `fetchMore()`。前缀混用降低可预测性。
- **建议修复**: 统一为 `fetch*` 前缀用于 HTTP 拉取类操作，`load*` 仅用于非网络操作

### 5. Store 中 error 字段粒度不一致

- **位置**:
  - `homeStore.ts` — `doctorsError`, `articlesError`, `typesError`（三个独立 error，粒度细）
  - `lifePlanStore.ts` — `error`（fetch 错误）, `generateError`, `adjustError`（三个独立 error，按操作分）
  - `punchStore.ts` — `error`（列表错误）, `analysisError`（分析错误，两个独立 error，按资源分）
- **涉及模块**: 三个 Store
- **问题描述**:
  - homeStore 按数据区块分 error（doctors / articles / types）
  - lifePlanStore 按操作分 error（fetch / generate / adjust）
  - punchStore 按资源分 error（list / analysis）
  - 无统一 pattern，模块间切换心智负担高
- **建议修复**: 在项目编码规范中明确定义 error 拆分策略（建议按资源分，因为每个资源最多一个拉取操作）

### 6. Store 中 loading 字段粒度与 error 不对称

- **位置**: `src/stores/homeStore.ts:23` vs `src/stores/lifePlanStore.ts:20,23` vs `src/stores/punchStore.ts:30-33`
- **涉及模块**: 三个 Store
- **问题描述**:
  - homeStore: 单个 `loading` 覆盖三个接口并行加载（粒度粗），但 error 拆三个（粒度细）
  - lifePlanStore: `loading` 仅覆盖 `fetchCurrent`, `generating` 单独覆盖 `generate`
  - punchStore: `listLoading`, `listLoadingMore`, `analysisLoading` 三个 loading 状态
  - 组件端 `homeStore.loading` 再派生三个 `xxxLoading` computed——分层不一致
- **建议修复**: 统一策略——要么 loading 始终乐观汇总（punchStore 模式），要么始终按资源拆分。混合模式使新成员难以理解何时用哪种

### 7. Store 中 `retry*` 方法实现模式不统一

- **位置**: `homeStore.ts:80-115`, `lifePlanStore.ts:129-137`, `punchStore.ts:155-163`
- **涉及模块**: 三个 Store
- **问题描述**:
  - homeStore: `retryDoctors()`, `retryArticles()`, `retryTypes()` 各自独立实现，调用内部 `fetchSingle()`
  - lifePlanStore: `retryGenerate(req)` 接受参数，`retryFetchCurrent()` 不接受
  - punchStore: `retryFetchList()` 重新调用 `fetchList()` 无参，`retryFetchAnalysis()` 同理
  - 不一致点：(1) 前缀 `retry` vs `retryFetch`；(2) 部分 retry 需要参数，部分不需要
- **建议修复**: 统一为 `<retryXxx>(): Promise<void>` 模式（重置错误后重新拉取），不带参数（重试用当前筛选/参数）

### 8. `createPunch` 方法在 lifePlanStore 中被重导出为 `createPunch` 但函数体内名称是 `createPunchAction`

- **位置**: `src/stores/lifePlanStore.ts:111,154`
- **涉及模块**: LifePlan (内部一致性)
- **问题描述**: store 内部函数名为 `createPunchAction`（避免与导入的 API 函数 `createPunch` 冲突），对外暴露为 `createPunch`。这会导致 store 源码阅读时需跳转理解——读者看到 `store.createPunch` 需要回溯到 return 语句查找实际名为 `createPunchAction` 的实现。
- **建议修复**: 将 API 导入手动命名避免冲突：`import { createPunch as createPunchApi } ...`，store 内部直接使用 `createPunch` 函数名

### 9. LifePlan.vue 中存在未被使用的 `useRoute` 导入（已使用，仅口头确认）

- **位置**: `src/views/LifePlan.vue:3` — `import { useRoute } from 'vue-router'`
- **涉及模块**: LifePlan
- **问题描述**: 经确认，`route` 在 LifePlan.vue 中仅用于读取 `route.query.riskLevel`（L88-91），这是有效的使用。无未使用导入——此项标记为已确认无问题。

### 10. `enumLabel` 映射表缺少严格类型约束

- **位置**: `src/utils/enumLabels.ts:1` — `const LABELS: Record<string, Record<string, string>>`
- **涉及模块**: 三个模块均依赖此工具函数
- **问题描述**: `LABELS` 类型为 `Record<string, Record<string, string>>`，过于宽泛。如果某模块传入不存在的 category（如拼写错误 `'puch_type'`），会静默回退到 raw value 而不会产生编译期报错。
- **建议修复**: 使用模板字面量类型或 const assertion + satisfies 收紧类型。例如：
  ```ts
  const LABELS = { ... } as const satisfies Record<Category, Record<string, string>>
  type Category = keyof typeof LABELS
  export function enumLabel(category: Category, value: string): string { ... }
  ```

### 11. `api.ts` 定义了 `ApiResponse<T>` 等类型但 API composable 中未使用

- **位置**: `src/types/api.ts:2-6` vs `src/composables/useHomeApi.ts`, `useLifePlanApi.ts`, `usePunchApi.ts`
- **涉及模块**: 类型定义 vs API 层
- **问题描述**:
  - `api.ts` 定义了 `ApiResponse<T>` 和 `ApiError`，但三个 API composable 中的请求/响应泛型均为内联类型（如 `{ success: boolean; data: T; message?: string }`）
  - `PaginatedResponse<T>` 也未在 API composable 中使用——`usePunchApi.ts` 的 `getPunchList` 返回值是自定义的 `{ records, pagination }`
  - 类型定义与实际使用脱节，`ApiResponse<T>` 成为死代码
- **建议修复**: 两种方案：
  1. 删除 `api.ts` 中未使用的 `ApiResponse<T>`, `ApiError`, `PaginatedResponse<T>`
  2. 统一 API composable 使用 `ApiResponse<T>` 泛型——但 `getPunchList` 的扁平解包与 `ApiResponse<PaginatedResponse<T>>` 嵌套不匹配，需设计兼容方案

### 12. 三个模块的 "页面容器 max-width" 和 `page-enter` 类名一致但动画关键帧不一致

- **位置**: `Home.vue:333`, `LifePlan.vue:567-568`, `Punch.vue:446-449`
- **涉及模块**: Home, LifePlan, Punch
- **问题描述**:
  - Home.vue 的 `page-enter` 动画: `opacity: 0 + translateY(8px)` → `opacity: 1 + translateY(0)`
  - LifePlan.vue 的 `page-enter` 动画: `opacity: 0` → `opacity: 1`（仅 `fadeIn`，无 translateY）
  - Punch.vue 自身未定义 `page-enter` 动画——依赖全局 CSS 或 home/lifeplan 的 scoped 样式不会穿透
  - **Punch.vue 第 155 行使用了 `page-enter` class，但该 class 的 keyframes 定义在 Home.vue 和 LifePlan.vue 的 `<style scoped>` 中，scoped 样式不会应用到不同组件的元素上**
- **影响**: Punch 页面的 `page-enter` class 无对应动画效果——这是一个视觉一致性 bug（虽然非功能阻断）
- **建议修复**: 将 `page-enter` 动画提取到 `variables.css` 全局样式中，三个模块统一引用

### 13. 通用 CSS class `press` 的按压动画在三模块中重复定义

- **位置**: `LifePlan.vue:866-869`, `Punch.vue:1008-1011`
- **涉及模块**: LifePlan, Punch（Home 未使用 `press` class）
- **问题描述**:
  - `.press:active { transform: scale(0.96); transition: var(--transition-fast); }` 在 LifePlan.vue 和 Punch.vue 中分别定义
  - Home.vue 使用内联 `transition: transform 0.12s ease` 等价效果
  - 重复定义导致后续调整需在两处修改
- **建议修复**: 提取到 `variables.css` 全局样式

### 14. Punch.vue 的 `router.back()` 返回路径不确定

- **位置**: `src/views/Punch.vue:160`
- **涉及模块**: Punch
- **问题描述**: Punch 页面仅通过返回箭头 `router.back()` 退出。用户可能的进入路径：
  1. TabBar `/profile` → 子路由 `/profile/punch`
  2. Punch 页面内点击"去打卡" → LifePlan → (用户可能想回到 Punch)
  3. 其他页面直接 `router.push('/profile/punch')`
  - `router.back()` 在场景 2 中会返回 LifePlan（预期），场景 1 中会返回 `/profile`（预期），场景 3 中可能返回到非预期页面
  - 缺少明确的"返回上级"导航语义
- **影响**: 一般——当前 App 结构下行为基本符合预期，但边界情况可能混乱
- **建议修复**: 考虑在 TabBar 子路由中添加"返回我的"按钮替代 `router.back()`，或使用命名路由

### 15. Home 页面的 `goDoctor()` 导航到 `/consultation`，但 Consultation 页是否需要医生 ID 不明确

- **位置**: `src/views/Home.vue:78`
- **涉及模块**: Home → Consultation
- **问题描述**: 点击医生卡片 (`doctor-card`) 不传递医生 ID（注释 `本任务仅跳 tab，不带 query`），但 Consultation 页面完全未在本审查范围内——无法验证 Consultation 是否期望 query 参数
- **影响**: 暂时无——当前行为符合注释声明，但若 Consultation 页后续需要参数来筛选/预选医生，此处为待办项

---

## 集成亮点

1. **跨模块数据预填设计优秀**：LifePlan.vue 通过 `riskFormStore.loadFromStorage()` 预填表单字段（age/gender/height/weight），实现了 Risk → LifePlan 的无缝数据传递，避免了重复输入。`prefillFromRiskForm()` 在 `onMounted` 和 `showForm()` 中均被调用，确保表单首次进入和重新定制时都能获取最新数据。

2. **已打卡状态在 LifePlan 内本地缓存合理**：`completedMap`（Map<number, CompletionStatus>）在 LifePlan 页面生命周期内维护打卡状态，避免每次切换视图都请求后端。生成/调整方案时自动重置 `completedMap`，确保新旧方案不串数据。

3. **防竞态请求序列号（requestId）机制**：punchStore 使用 requestId 快照模式防止快速切换筛选条件时旧响应覆盖新响应——这是此类分页列表中的最佳实践，与 `fetchList` 和 `loadMore` 均兼容。

4. **错误状态分层独立**：三个 Store 均采用独立错误字段（homeStore 分区块、lifePlanStore 分操作、punchStore 分资源），支持 UI 部分降级而非全页崩溃——这是正确的弹性设计。

5. **`variables.css` 设计 Token 统一**：三个模块共享颜色、间距、圆角、阴影、字体大小等全局变量，保证了 UI 一致性。`--tab-bar-height` 的使用确保所有页面底部 padding 一致。

6. **免责声明提示条在 LifePlan 和 Punch 中保持一致**：两个 AI 生成内容的页面底部均有相似的免责声明文案和样式（`lp-disclaimer` / `punch-disclaimer`），使用了相同的 `--color-primary-light` 背景色和 `--font-size-caption` 字号。

---

## 跨模块数据流检查清单

| 数据流路径 | 状态 | 说明 |
|-----------|:---:|------|
| riskFormStore.formData → LifePlan 预填 | 正常 | `prefillFromRiskForm()` 正确读取 age/gender/height/weight |
| riskFormStore.loadFromStorage → LifePlan | 正常 | LifePlan onMounted 时调用 `riskForm.loadFromStorage()` 水合 sessionStorage |
| Risk → LifePlan query (riskLevel) | 正常 | Risk 传参，LifePlan 读取并展示提示条 |
| Risk → LifePlan query (diabetesType) | **丢失** | Risk 传参但 LifePlan 未读取——严重问题 #1 |
| LifePlan.completedMap → Punch 页面 | **无直接共享** | completedMap 仅为 LifePlan 本地缓存；Punch 通过 punchStore 独立管理状态——严重问题 #2 |
| Home → LifePlan 导航 | **缺失** | Home 页面**没有**到 LifePlan 的导航入口；用户只能通过 TabBar 或 Risk 结果页进入 LifePlan |
| Home → Consultation 导航 | 正常 | 医生卡片和"查看全部"均导航到 `/consultation` |
| LifePlan → Punch 打卡（路由层面） | **不适用** | Punch 是 Profile 子路由 `/profile/punch`，非独立页面；LifePlan 无直接路由导航到 Punch 页面 |
| Punch → LifePlan 导航 | 正常 | "去打卡"按钮 router.push('/life-plan')，但未传递上下文 |
| Profile → Punch 子路由 | 正常 | TabBar 点击"我的"→ Profile 组件渲染 → 内部导航到子路由 `/profile/punch` |
| TabBar 与三个模块的路由映射 | 正常但非直接 | Home('/home'), LifePlan('/life-plan'), Punch 通过 Profile('/profile')→子路由，Punch 非 TabBar 直接入口 |
| API 超时配置一致性 | 正常 | 三个 API composable 默认超时 15s（`useApi.ts`），`generatePlan` 例外设为 20s（Dify blocking）——合理 |
| 错误处理模式：ApiError vs 内联 | 不一致 | API composable 不处理业务错误（抛给 store），store 统一 try-catch 包装——模式一致。但 `generatePlan` 409 处理仅在 lifePlanStore，非 API 层 |

---

## 总结

- **严重问题**: 3 个（1 个数据丢失 + 1 个状态同步路径 + 1 个路由守卫策略不一致）
- **一般问题**: 9 个（命名不一致 / loading/error 粒度 / 重复代码 / 死类型 / CSS 跨文件问题）
- **集成亮点**: 6 个

### 优先级建议

1. **立即修复**：diabetesType query 参数丢失（严重问题 #1）——一锤子修复，无副作用
2. **近期修复**：page-enter 动画在 Punch.vue 中失效（一般问题 #12）——提取全局 CSS
3. **讨论后修复**：Punch 路由的 requiresDisclaimer 策略（严重问题 #3）——需产品确认
4. **架构讨论**：LifePlan completedMap 与 Punch records 的状态同步机制（严重问题 #2）——需设计决策

### 与 Round 1/2 的关系

本次审查未重复 Round 1（设计合规性）和 Round 2（代码质量）中已覆盖的单模块问题，仅聚焦于跨模块集成缺陷。三个模块的独立代码质量已在 Round 1/2 中验证通过。
