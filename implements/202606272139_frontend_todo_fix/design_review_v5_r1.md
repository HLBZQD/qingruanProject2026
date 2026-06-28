# 第5轮详细设计审查报告 — design_review_v5_r1

> **审查依据**: 详细设计 `detail_v5.md` + 任务文件 `task_v5.md`
> **审查维度**: G2 (CSS提取) + G5 (punchStore filter迁移) + G11 (表单验证) + G9 (接口去重) + G8 (Store一致性)
> **审查日期**: 2026-06-28

---

## 审查结论: APPROVED

所有5个审查维度均通过。以下为逐维度分析及发现。

---

## 维度1: G2 CSS 提取方案正确性 — PASS

**方案概要**: 新建 `src/styles/animations.css` 作为全局样式，提取 `page-enter` 淡入动画和 `.press:active` 按钮按压缩放，三组件 `<style scoped>` 中删除重复定义。Home.vue 通过 scoped 覆盖 `.page-enter.home-page` 保留 translateY(8px) 上滑效果。

### 审查分析

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| 全局样式文件职责分离 | PASS | `animations.css` 与 `variables.css` (CSS变量) 分离，职责清晰 |
| 关键帧命名防冲突 | PASS | detail_v5.md 使用 `pageEnterFadeIn` 全局关键帧 + Home 独立 `pageEnterHome`，避免命名冲突 |
| scoped 覆盖优先级 | PASS | Vue scoped 样式通过 `[data-v-xxx]` 属性选择器 + 组合选择器 `.page-enter.home-page` 提升优先级，正确覆盖全局 `.page-enter` |
| 模板兼容性 | PASS | Home/LifePlan/Punch 三组件根元素已含 `page-enter` class，无需模板修改 |
| Punch 动画正向改进 | PASS | Punch.vue 的 `page-enter` class 此前无对应CSS，引入全局样式后首个获得淡入效果 |
| CSS 变量隔离 | PASS | 全局样式使用硬编码值 (0.1s, 0.4s, scale(0.96))，不依赖 `var(--*)` 避免加载顺序问题 |
| 动画时长统一 | PASS | 0.3s → 0.4s，三页面统一，视觉差异极小 |

### 发现的差异

**detail_v5.md 与 task_v5.md 关键帧命名不一致**:

| 文件 | 全局关键帧名 |
|------|------------|
| `detail_v5.md` L183 | `pageEnterFadeIn` (新名称，避免冲突) |
| `task_v5.md` L250 | `pageEnter` (旧名称) |

**裁决**: detail_v5.md 作为技术基准，`pageEnterFadeIn` 命名更安全——避免与 Home.vue 原有 `@keyframes pageEnter` (含 translateY) 发生全局命名冲突。task_v5.md 应同步更新，但不阻塞实施。

### 维度结论: 方案正确，无阻塞问题。

---

## 维度2: G5 punchStore filter reactive→ref 迁移安全性 — PASS

**方案概要**: punchStore.ts 中 `filter` 从 `reactive({})` 改为 `ref({})`，`setFilter()` 使用不可变更新 `filter.value = { ...filter.value, ...partial }`。内部函数 (`fetchList`/`loadMore`) 使用 `filter.value.xxx`，模板保持 `store.filter.xxx` (Pinia 自动解包)。

### 审查分析

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| Pinia ref 模板解包 | PASS | Pinia store 中的 `ref` 在 Vue 模板中自动解包 `.value`，`store.filter.startDate` 保持不变 |
| Store 内部 .value 访问 | PASS | `fetchList()`/`loadMore()` 内部正确使用 `filter.value.startDate` |
| 不可变更新触发响应式 | PASS | `filter.value = { ...filter.value, ...partial }` 替换整个对象，Vue ref 正确追踪 |
| Punch.vue `<script setup>` 影响面 | PASS | 经代码审查确认无直接访问 `store.filter.xxx` 的代码，仅通过 `store.setFilter({...})` 调用 |
| G27→G17 硬依赖正确 | PASS | G27 (filter ref) 必须先于 G17 (typeFilter computed getter 依赖 `store.filter.punch_type`) |
| filter 可选字段语义 | PASS | `undefined` 字段表示"不筛选"，`ref({})` + 展开操作符正确保留未设置字段为 undefined |

### 风险评估

| 风险 | 等级 | 缓解 |
|------|:----:|------|
| Pinia ref 模板解包未经实际验证 | 中 | detail_v5.md 6.1节 明确要求 G27 完成后立即启动应用验证筛选功能 |
| Punch.vue 可能有遗漏的直接 `store.filter.xxx` 引用 | 低 | 设计阶段代码审查已确认无此类引用 |

### 维度结论: 迁移方案安全，影响面受控，风险已识别并缓解。

---

## 维度3: G11 表单验证 Number.isFinite 正确性 — PASS

**方案概要**: LifePlan.vue `validateForm()` 中年龄/身高/体重的空值检查从 `== null` 改为 `!Number.isFinite()`。

### 审查分析

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| null 值处理 | PASS | `Number.isFinite(null)` → `false`，正确拒绝 |
| undefined 处理 | PASS | `Number.isFinite(undefined)` → `false`，正确拒绝 |
| NaN 处理 | PASS | `Number.isFinite(NaN)` → `false`，正确拒绝 |
| 空字符串处理 | PASS (运行时) | `v-model.number` 使用 `parseFloat('')` → `NaN`，`Number.isFinite(NaN)` → `false`，正确拒绝 |
| 零值处理 | PASS | `Number.isFinite(0)` → `true`，但后续 `age < 1` 拒绝 |
| 合法值处理 | PASS | `Number.isFinite(35)` → `true`，通过范围检查 |
| 字符串数值处理 | PASS | `v-model.number` 已做 `parseFloat('35')` → 35，`Number.isFinite(35)` → `true` |

### 发现的文档不精确

**detail_v5.md L345 边界表声明**:
> `Number.isFinite('')` 返回 `false`

**技术事实**: `Number.isFinite('')` 在 ECMAScript 规范中返回 `true` (因为 `ToNumber('')` = `+0`，`Number.isFinite(0)` = `true`)。

**评估**: 这不影响运行时正确性。原因：
1. Vue `v-model.number` 对空输入调用 `parseFloat('')` → `NaN`，`form.age` 得到的是 `NaN` 而非 `''`
2. `Number.isFinite(NaN)` → `false`，校验正确拦截
3. 仅当代码路径绕过 `v-model.number` 直接设置 `form.age = ''` 时才会暴露，但当前不存在此路径

**裁决**: 边界表标注不精确但不影响功能。建议实施时在代码注释中标注 `v-model.number` → `NaN` 的路径依赖，或使用 `typeof form.age === 'number' && Number.isFinite(form.age)` 双重守卫以消除理论盲区。

### 改进分析

旧方案 `== null` 的盲区：
- 空字符串 `''`：`'' == null` → `false` → **漏过**（实际 `v-model.number` 产生 NaN 不受影响）
- `NaN`：`NaN == null` → `false` → **漏过**

新方案 `!Number.isFinite()` 覆盖了这两个盲区，严格优于旧方案。

### 维度结论: 方案正确，运行时行为严格优于旧方案。文档不精确不影响功能但建议标注。

---

## 维度4: G9 DiabetesTypeView 接口去重正确性 — PASS

**方案概要**: homeStore.ts 中 `interface DiabetesTypeView` 增加 `export`，Home.vue 删除本地重复定义，改为 `import type { DiabetesTypeView } from '@/stores/homeStore'`。

### 审查分析

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| 字段一致性 | PASS | detail_v5.md L428 确认两处定义字段完全相同 (`cover: string; brief: string`) |
| 单一数据源 | PASS | Store 层作为类型定义源，与 Store 负责数据转换的职责一致 |
| import type 无运行时 | PASS | `import type` 纯编译时，无运行时依赖 |
| computed 类型标注兼容 | PASS | `computed<DiabetesTypeView[]>(() => homeStore.diabetesTypes)` 在替换 import 后不变 |
| 类型归属合理性 | PASS | `DiabetesTypeView extends DiabetesType` 带有视图层字段 (`cover`, `brief`)，Store 层作为 API 类型到视图类型的转换层，归属合理 |

### 潜在关注点

**类型文件分散**: `DiabetesTypeView` 定义在 `homeStore.ts` 而非 `api.ts`。随着接口数量增长，类型可能分散在多个 Store 文件中。建议在后续迭代中评估是否需要统一的 `types/views.ts` 视图类型文件。`import type` 的无运行时特性使得重构成本极低，当前方案可接受。

### 维度结论: 接口去重正确，字段一致性已验证，类型归属合理。

---

## 维度5: G8 Store 一致性（可选）— PASS

**方案概要**: 5个子任务 — G18 (竞态保护) + G19 (action命名) + G20 (error粒度) + G21 (loading粒度) + G22 (retry签名)。lifePlanStore.ts 被4个子任务同时修改，建议同一开发者一站式重构。

### 审查分析

#### G18: 竞态保护扩展

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| homeStore pageInstanceId 模式 | PASS | `let pageInstanceId = 0` 在 store 函数体内，store 单例不销毁，持续递增。`fetchHomeData()` 入口递增，`Promise.allSettled` 后统一检查 — 正确 |
| 缓存路径不递增 | PASS | `readHomeCache()` 命中后同步返回，不触发竞态 — 正确 |
| lifePlanStore requestId 模式 | PASS | 复用 punchStore (S9) 的 `requestId` 快照模式，在 try/catch/finally 各分支检查 — 正确 |
| punchStore 已有保护 | PASS | S9 已实现，G18 不涉及 |

#### G19: Action 命名统一

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| generate → createPlan | PASS | `create` 比 `generate` 更精确表达 POST 创建语义 |
| adjust → updatePlan | PASS | `update` 为标准 CRUD 动词 |
| 类型名不变 | PASS | `PlanGenerateRequest`/`PlanAdjustRequest` 保持原名，不造成混淆 |
| 调用点更新 | PASS | 全文搜索 `\.generate`/`\.adjust` 确保无遗漏 |

#### G20: Error 字段粒度统一

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| generateError + adjustError → mutationError | PASS | 两者同为 mutation 操作，共享 error 槽位合理 |
| fetchError 保持独立 | PASS | 读取与写入操作 error 分离 |
| 模板适配 | PASS | `store.generateError` → `store.mutationError`，`store.adjustError` → `store.mutationError` |

#### G21: Loading 字段粒度对齐

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| 三独立 loading ref | PASS | `doctorsLoading` / `articlesLoading` / `typesLoading` + 聚合 `loading` computed |
| 向后兼容 | PASS | `loading` computed 聚合三个独立 loading，首屏骨架屏行为不变 |
| 重试独立 loading | PASS | `retryDoctors()` 仅设置 `doctorsLoading`，其他区块不受影响 |

#### G22: Retry 签名标准化

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| 无参统一签名 | PASS | `retryXxx(): Promise<void>` 无需调用方传参 |
| 参数缓存 | PASS | `lastCreateReq` / `lastUpdateReq` 缓存最近参数 |
| 生命周期一致 | PASS | 不持久化，页面刷新后丢失，与表单数据生命周期一致 |

### G8 整体风险评估

| 风险 | 等级 | 缓解 |
|------|:----:|------|
| lifePlanStore.ts 4维度并发修改冲突 | 中 | 同一开发者一站式重构，顺序 G18→G19→G20→G22 |
| 工时膨胀挤压核心交付 | 中 | 明确标记为可选，v5核心(G1-G7)优先，G8可推迟至v6 |
| 重命名遗漏调用点 | 低 | 全文搜索 + 编译验证 (vue-tsc --noEmit) |

### 维度结论: 5个子任务设计正确，风险已识别并缓解，推迟机制合理。

---

## 综合发现与建议

### 发现 (非阻塞)

| 编号 | 发现 | 影响维度 | 严重程度 |
|:----:|------|:--------:|:------:|
| F1 | detail_v5.md 与 task_v5.md 全局关键帧命名不一致 (`pageEnterFadeIn` vs `pageEnter`) | G2 | 低 |
| F2 | detail_v5.md `Number.isFinite('')` 边界表标注不精确 (实际返回 true) | G11 | 低 (不影响运行时) |
| F3 | `DiabetesTypeView` 归属 Store 文件而非独立视图类型文件，后续可能分散 | G9 | 低 |

### 建议 (实施时参考)

| 编号 | 建议 |
|:----:|------|
| S1 | G2 实施时以 detail_v5.md 的 `pageEnterFadeIn` 命名为准；task_v5.md 同步更新 |
| S2 | G11 实施时在 `validateForm()` 注释中标注 `v-model.number` → `NaN` → `Number.isFinite()` 的路径依赖 |
| S3 | G9 实施后在后续迭代中评估是否需要 `types/views.ts` 集中管理视图层类型 |
| S4 | G8 纳入决策在 v5 执行开始时做出 (纳入 or 推迟)，避免执行中途犹豫 |

---

## 审查裁决汇总

| 维度 | 内容 | 结论 |
|:----:|------|:----:|
| G2 | CSS 提取方案 | **PASS** |
| G5 | punchStore filter reactive→ref 迁移 | **PASS** |
| G11 | 表单验证 Number.isFinite | **PASS** |
| G9 | DiabetesTypeView 接口去重 | **PASS** |
| G8 | Store 一致性 (可选) | **PASS** |

**最终裁决: APPROVED**

所有5个审查维度均通过。3个非阻塞发现问题不影响实施，在"综合发现与建议"中记录供实施时参考。无阻塞性问题，详细设计可以进入实施阶段。

---

*审查报告结束。*
