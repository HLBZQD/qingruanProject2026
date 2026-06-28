# v5 代码审查报告 (Round 1)

> 审查日期: 2026-06-28
> 审查范围: G1-G7 (G8 推迟至 v6)
> 审查维度: 6 项交叉验证

---

## 1. G2: CSS 提取 + View 清理完整性

**结论: PASS**

| 检查项 | 预期 | 实际 | 结果 |
|--------|------|------|:--:|
| 新建 `src/styles/animations.css` | 全局 `.page-enter` (fadeIn 0.4s) + `.press:active` (scale 0.96) | L1-16: `@keyframes pageEnterFadeIn`, `.page-enter { animation: pageEnterFadeIn 0.4s ease-out }`, `.press:active { transform: scale(0.96); transition: transform 0.1s }` | PASS |
| `src/main.ts` 新增 import | `import './styles/animations.css'` | L6: 已添加 | PASS |
| `Home.vue` 删除旧 scoped 动画 | 删除 `page-enter`/`@keyframes pageEnter` | 已删除 (不在文件中) | PASS |
| `Home.vue` 新增覆盖动画 | `.page-enter.home-page` + `@keyframes pageEnterHome` (fadeIn + translateY 8px) | L330-345: 完全匹配 | PASS |
| `LifePlan.vue` 删除 scoped 动画 | 删除 `page-enter`/`@keyframes fadeIn` + `.press:active` | L894: "按压动画（已迁移至全局 animations.css）" 注释保留; L1082-1083: "页面进入动画（已迁移至全局 animations.css）" 注释保留 | PASS |
| `Punch.vue` 删除 scoped `.press` | `Punch.vue` 不再定义 `.press:active` | L1157: "按压动画（已迁移至全局 animations.css）" 注释保留; 模板 L240 已有 `class="page-enter"`，全局样式自动生效 | PASS |
| Punch 首次获得入场动画 | template 中 `class="page-enter"` 已被全局 CSS 匹配 | L240: `class="punch-page page-enter"` — 全局 `.page-enter` 匹配生效 | PASS |

**总评**: CSS 全局提取完整，三组件 scoped 重复定义全部清理。Home 页面通过 `.page-enter.home-page` 组合选择器 (scoped 优先级 + 复合选择器优先级高于全局 `.page-enter`) 正确叠加 translateY 上滑效果。Punch 页面首次获得淡入动画。全局样式不依赖 CSS 变量 (`var(--*)`)，使用硬编码 `0.1s`，避免跨文件 CSS 变量失效风险。

---

## 2. G5: punchStore filter reactive->ref 模板兼容性

**结论: PASS**

| 检查项 | 预期 | 实际 | 结果 |
|--------|------|------|:--:|
| `filter` 改为 `ref` | `ref<{...}>({})` | `punchStore.ts` L19-23: `const filter = ref<{...}>({})` | PASS |
| 移除 `reactive` import | 不再 import reactive | `punchStore.ts` L2: `import { ref, computed } from 'vue'` — 无 reactive | PASS |
| `setFilter` 不可变更新 | `filter.value = { ...filter.value, ...partial }` | L156: `filter.value = { ...filter.value, ...partial }` | PASS |
| `fetchList` 参数构建 | `filter.value.startDate` 等 | L71-73: 全部使用 `filter.value.xxx` | PASS |
| `loadMore` 参数构建 | `filter.value.startDate` 等 | L106-108: 全部使用 `filter.value.xxx` | PASS |
| 模板引用兼容性 | `store.filter.startDate` 等保持不变 | Pinia setup store 对返回的 ref 自动解包: `store.filter` 返回 `filter.value` (即 unwrapped 对象)。模板中 `store.filter.startDate` 读取正确 | PASS |
| `<script setup>` 引用兼容性 | 设计文档声明无直接 `store.filter.xxx` 访问 | **注意**: `Punch.vue` L36 `typeFilter` computed getter 访问了 `store.filter.punch_type`。经研判: Pinia 对 setup store 返回的 ref 在 store 对象层面自动解包，`store.filter` 等价于 `filter.value` (unwrapped 对象)，因此 `store.filter.punch_type` 在 `<script setup>` 中可正确读取。此行为与设计文档的"无直接访问"声明有轻微描述偏差，但运行时正确 | PASS (行为正确) |

**总评**: `reactive` -> `ref` 迁移完整且正确。Pinia setup store 的 ref 自动解包机制确保模板和 script 中的 `store.filter.xxx` 访问均正常工作。需注意设计文档 §3.5.1(d) 关于"<script setup> 中无直接访问"的声明与实际有轻微偏差 (computed getter 确实访问了 `store.filter.punch_type`)，但运行时行为完全正确。

---

## 3. G5: typeFilter computed 正确性

**结论: PASS**

| 检查项 | 预期 | 实际 | 结果 |
|--------|------|------|:--:|
| `typeFilter` 改为 `computed` | getter/setter 模式 | `Punch.vue` L35-38: `computed<PunchType \| undefined>({ get, set })` | PASS |
| getter 读取 store | `() => store.filter.punch_type` | L36: `get: () => store.filter.punch_type` | PASS |
| setter 调用 store | `(val) => store.setFilter({ punch_type: val })` | L37: `set: (val) => store.setFilter({ punch_type: val })` | PASS |
| 删除 `onTypeFilter` 函数 | 函数已删除 | 全文件搜索无 `onTypeFilter` | PASS |
| chip `@click` 改为赋值 | `typeFilter = opt.value` | L442: `@click="typeFilter = opt.value"` | PASS |
| "全部" chip 行为 | `typeFilter = undefined` -> `setFilter({ punch_type: undefined })` | `opt.value = undefined` 时 setter 传入 `undefined`，`setFilter` 清除 screening | PASS |
| 双向同步: store -> chip | `store.setFilter` 更新 `filter.value` -> computed 自动重算 -> chip 高亮更新 | Pinia ref 响应式系统保证此链路 | PASS |
| 类型兼容 | `PunchType \| undefined` vs `punch_type?: PunchType \| undefined` | 类型完全兼容 | PASS |

**总评**: `ref` -> `computed` 迁移正确。getter/setter 双工绑定消除了一致性风险 (此前 ref 和 store.filter 是两个独立数据源，需要 `onTypeFilter` 手动同步)。切换至 computed 后数据源唯一 (store.filter.punch_type)，chip 高亮与筛选值始终一致。Template 中 `@click="typeFilter = opt.value"` 利用了 computed setter 的赋值语法，Vue 编译正确。

---

## 4. G6: riskFormStore 类型守卫正确性

**结论: PASS**

| 检查项 | 预期 | 实际 | 结果 |
|--------|------|------|:--:|
| `NUMBER_FIELDS` 常量 | `['age', 'height', 'weight', 'waist', 'systolic_bp']` | `riskFormStore.ts` L8: 完全匹配 | PASS |
| `ENUM_FIELDS` 常量 | 4 个枚举字段 + 各自允许值 Set | L11-16: 完全匹配 | PASS |
| 数字字段校验 | `Number()` + `Number.isFinite()` | L71-77: `const num = Number(value); if (Number.isFinite(num)) { fd[key] = num }` | PASS |
| 枚举字段校验 | `typeof === 'string' && Set.has()` | L81-86: `typeof value === 'string' && ENUM_FIELDS[key].has(value)` | PASS |
| 其他字段 | 直接赋值 | L89-90: `fd[key] = value` | PASS |
| 脏数据丢弃 | 静默丢弃，不阻断整体恢复 | `continue` 而非 `return false` | PASS |

**边界行为验证:**

| 场景 | 输入 | 预期 | 实际逻辑 | 结果 |
|------|------|------|---------|:--:|
| 字符串年龄 | `age: "25"` | 恢复为数字 25 | `Number("25")=25`, `isFinite(25)=true` -> pass | PASS |
| 非法年龄 | `age: "abc"` | 丢弃 | `Number("abc")=NaN`, `isFinite(NaN)=false` -> discard | PASS |
| 年龄 0 | `age: 0` | 恢复为 0 (表单层后续拦截) | `isFinite(0)=true` -> restore as 0 | PASS |
| 非法枚举 | `gender: "invalid"` | 丢弃 | `ENUM_FIELDS.gender.has("invalid")=false` -> discard | PASS |
| 合法枚举 | `gender: "male"` | 恢复 | `ENUM_FIELDS.gender.has("male")=true` -> restore | PASS |
| pregnancy 字段 | `pregnancy: true` | 直接赋值 | 不在 NUMBER/ENUM_FIELDS -> direct | PASS |

**总评**: 三层类型校验 (数字/枚举/其他) 实现完整且正确。`Number.isFinite()` 覆盖了 `null`/`''`/`NaN`/`Infinity` 边界。`ENUM_FIELDS` 使用 `Set.has()` O(1) 校验效率高。脏数据字段设为 `undefined` (静默丢弃) 而非抛出错误，符合"局部污染不阻断整体恢复"的设计原则。`isValidResult()` 类型守卫函数逻辑正确。

---

## 5. G7: 类型清理安全性

**结论: PASS**

| 检查项 | 预期 | 实际 | 结果 |
|--------|------|------|:--:|
| 删除 `ApiResponse<T>` | 从 `api.ts` 移除 | 已删除 (不在文件中) | PASS |
| 删除 `PaginatedResponse<T>` | 从 `api.ts` 移除 | 已删除 (不在文件中) | PASS |
| 保留 `ApiError` | 保留 | `api.ts` L10-15: 保留 | PASS |
| 保留 `PaginationInfo` | 保留 (被 `PunchListParams` 继承) | `api.ts` L22-27: 保留; L278: `PunchListParams extends PaginationParams` 正常 | PASS |
| 保留 `PaginationParams` | 保留 | `api.ts` L17-20: 保留 | PASS |
| 新增类型策略注释 | 文件顶部 | `api.ts` L1-6: 已添加 | PASS |
| `enumLabels.ts` 类型收紧 | `as const satisfies Record<string, Record<string, string>>` | L1-39: 完全匹配 | PASS |
| `as const satisfies` 编译 | TS 5.x 兼容 | vue-tsc PASS | PASS |

**安全性分析:**

- **`ApiResponse<T>` / `PaginatedResponse<T>` 引用检查**: 全局搜索 `src/` 目录，仅在两处 JSDoc 注释中出现: `useHomeApi.ts` L15-16 (注释描述内联等价类型) 和 `useLifePlanApi.ts` L13 (注释描述响应结构)。**不存在实际类型引用**，删除安全。建议后续清理这两处注释中的过时引用 (不影响编译)。
- **`ApiError`**: 当前仅在 `api.ts` 中定义，无外部引用。保留为预留类型，符合设计意图。
- **`PaginationParams`**: 被 `PunchListParams extends PaginationParams` 继承 (L278)，不能删除。已正确保留。
- **`as const satisfies` 双保险**: `as const` 提供深度只读 + 字面量类型收紧; `satisfies` 提供编译时结构兼容性检查。`enumLabel()` 函数仅读取 LABELS，无写入操作，不受只读限制影响。

**总评**: 死代码删除安全，无外部引用断裂。类型收紧使用 TS 5.x 原生语法，兼容性无问题。

---

## 6. 整体 vue-tsc 验证

**结论: PASS**

```
npx vue-tsc --noEmit  ->  无输出 (零错误)
```

无新增编译错误、类型错误或未使用变量警告。

---

## 补充发现 (非阻塞)

### 6.1 JSDoc 注释中的过时类型引用

**文件**: `src/composables/useHomeApi.ts` L15-16, `src/composables/useLifePlanApi.ts` L13

**内容**: JSDoc 注释中仍提及已删除的 `ApiResponse<T>` 和 `PaginatedResponse<T>` 类型名。

**影响**: 仅影响注释可读性，不影响编译、类型检查或运行时行为。

**建议**: 后续迭代中更新注释文案以反映新的内联类型策略。例如 `useLifePlanApi.ts` L13:
```
// 当前 (过时引用)
解包：res.data 是 ApiResponse<PlanCurrentResponse|null>，data = res.data.data。

// 建议
解包：res.data 是 { success: boolean; data: PlanCurrentResponse | null; message?: string }，
data = res.data.data。
```

### 6.2 `ApiError` 无外部引用

**状态**: `ApiError` 在 `api.ts` L10-15 定义，但全项目无实际使用。设计文档明确要求保留此类型作为预留接口定义。当前无功能影响。

### 6.3 S13 设计文档格式轻微偏差

**位置**: `docs/2_detailed_design_v3.md` L502-506

**偏差**: S13 决策记录使用了 `//` 代码注释格式，而 S12 (L3509-3513) 使用了 `>` blockquote 格式。两者表达的信息完整性一致，仅为格式风格差异。不影响信息传达。

### 6.4 设计文档 §3.5.1(d) 声明与实际代码偏差

**位置**: 详细设计文档 §3.5.1(d)

**偏差**: 设计文档声明 "Punch.vue 的 `<script setup>` 中无直接访问 `store.filter.xxx` 的代码"。实际代码中，`typeFilter` computed getter (L36) 访问了 `store.filter.punch_type`。基于 Pinia ref 自动解包机制，此访问行为正确，仅为文档描述偏差。

---

## 最终裁决

**APPROVED**

所有 6 个审查维度均通过。G1-G7 核心交付完整，设计文档更新准确，CSS 全局提取彻底，Store 接口变更兼容，类型守卫正确，死代码删除安全，vue-tsc 零错误通过。

4 项补充发现均为非阻塞级别（注释清理、格式风格、文档描述偏差），不阻碍合入。
