# v5 代码变更报告

> 日期: 2026-06-28
> 范围: G1-G7 (22个条目), G8 推迟至 v6
> 编译: `npx vue-tsc --noEmit` PASS (无新增错误)

---

## G1: 设计文档更新 (4处)

**文件**: `docs/2_detailed_design_v3.md`

| 条目 | 位置 | 变更 |
|:----:|------|------|
| S12 | §4.2 状态管理表与 §4.3 之间 | 新增间接一致性模型注释 (LifePlan POST→Punch GET via backend API, HTTP 201 契约保证) |
| S13 | §1.6.2 路由守卫 Punch 路由后 | 新增 Punch 路由免责声明决策记录 (不需要免责声明，统计性分析非生成式AI) |
| G4 | §1.3 技术选型表后 | 新增 marked v12 同步/v13+ 异步双模式标注 (有意并存策略) |
| G5 | §4.3 LifePlan.vue 流程图 | 打卡交互步骤重排: 先弹窗后API → 乐观更新 completedMap (对齐代码实现) |

---

## G2: 全局 CSS 提取 (G24 + G25)

| 文件 | 操作 | 变更 |
|------|:----:|------|
| `src/styles/animations.css` | **新建** | 全局 `.page-enter` (0.4s fadeIn) + `.press:active` (scale 0.96) |
| `src/main.ts` | +1行 | 新增 `import './styles/animations.css'` |
| `src/views/Home.vue` | 修改 | 删除 scoped `page-enter`/`@keyframes pageEnter`；新增 `.page-enter.home-page` 覆盖 (translateY 8px) |
| `src/views/LifePlan.vue` | 修改 | 删除 scoped `page-enter`/`@keyframes fadeIn` + `.press:active` |
| `src/views/Punch.vue` | 修改 | 删除 scoped `.press:active` (Punch 模板已有 `class="page-enter"`，全局样式自动生效) |

**效果**: Punch 首次获得入场淡入动画；Home 保持 fadeIn+上滑；LifePlan 保持纯淡入；按钮按下态统一。

---

## G3: LifePlan 修复 (G1 + G11)

**文件**: `src/views/LifePlan.vue`

| 条目 | 位置 | 变更 |
|:----:|------|------|
| G1 | 模板 L364 | 空态区域 `lp-empty` 增加注释 `<!-- 对应设计文档 4.1.4节 -->` |
| G1 | 模板 L369 | 按钮文案 `立即定制方案` → `生成我的生活方案` |
| G11 | `validateForm()` | `== null` 判空 → `Number.isFinite()` (覆盖 null/''/NaN 边界) |

---

## G4: Home 修复 (G2 + G9 + G28)

| 文件 | 条目 | 变更 |
|------|:----:|------|
| `src/stores/homeStore.ts` | G9 | `interface DiabetesTypeView` → `export interface DiabetesTypeView` |
| `src/views/Home.vue` | G9 | 删除本地 `DiabetesTypeView` 定义；新增 `import type { DiabetesTypeView } from '@/stores/homeStore'` |
| `src/views/Home.vue` | G2 | "全部" `<span>` 前增加注释标注预留入口 |
| `src/views/Home.vue` | G28 | 搜索按钮前增加注释标注功能占位 |

---

## G5: Punch 修复 (G27 前置 → G13 + G15 + G17 + G29)

| 文件 | 条目 | 变更 |
|------|:----:|------|
| `src/stores/punchStore.ts` | G27 | `filter` 从 `reactive` 改为 `ref`；`setFilter` 改用不可变更新 `filter.value = { ...filter.value, ...partial }`；`fetchList`/`loadMore` 参数构建 `filter.xxx` → `filter.value.xxx`；移除 `reactive` import |
| `src/views/Punch.vue` | G13 | 根元素增加 `data-scroll-container="punch"`；`onScroll` 增加 `document.querySelector` 可见性检查 |
| `src/views/Punch.vue` | G15 | 分析区新增 `<p class="analysis-range-hint">` + scoped CSS |
| `src/views/Punch.vue` | G17 | `typeFilter` 从 `ref` 改为 `computed` (get→store.filter.punch_type, set→store.setFilter)；删除 `onTypeFilter` 函数；chip `@click` 改为 `typeFilter = opt.value` |
| `src/views/Punch.vue` | G29 | 返回按钮 `router.back()` → `router.push('/profile')` |

---

## G6: Store 安全 (G10)

**文件**: `src/stores/riskFormStore.ts`

| 变更 | 详情 |
|------|------|
| 新增常量 | `NUMBER_FIELDS` (age/height/weight/waist/systolic_bp) + `ENUM_FIELDS` (diabetes_history/diabetes_type/gender/family_history 各允许值 Set) |
| `loadFromStorage()` 改造 | 字段恢复循环增加三层类型校验: 数字字段→`Number()`+`isFinite()`; 枚举字段→`Set.has()`; 其他字段→直接赋值。脏数据静默丢弃 |

---

## G7: 类型清理 (G23 + G26)

| 文件 | 变更 |
|------|------|
| `src/types/api.ts` | 删除 `ApiResponse<T>` 和 `PaginatedResponse<T>` 死代码；保留 `ApiError`/`PaginationInfo`/`PaginationParams`；新增类型策略注释 |
| `src/utils/enumLabels.ts` | `LABELS` 从 `Record<string, Record<string, string>>` 改为 `as const satisfies Record<string, Record<string, string>>` |

---

## 文件变更汇总

| 文件 | 新增 | 删除 | 净增 |
|------|:---:|:---:|:---:|
| `docs/2_detailed_design_v3.md` | ~30行 | 0 | +30 |
| `src/styles/animations.css` (新建) | ~20行 | 0 | +20 |
| `src/main.ts` | 1行 | 0 | +1 |
| `src/views/Home.vue` | ~12行 | ~8行 | +4 |
| `src/views/LifePlan.vue` | ~8行 | ~12行 | -4 |
| `src/views/Punch.vue` | ~25行 | ~10行 | +15 |
| `src/stores/punchStore.ts` | ~5行 | ~8行 | -3 |
| `src/stores/homeStore.ts` | 1行 | 0 | +1 |
| `src/stores/riskFormStore.ts` | ~25行 | ~8行 | +17 |
| `src/types/api.ts` | ~6行 | ~10行 | -4 |
| `src/utils/enumLabels.ts` | ~30行 | ~2行 | +28 |
| **合计** | ~163行 | ~58行 | **~105行** |

---

## 编译验证

```
npx vue-tsc --noEmit  →  PASS (无错误)
```

---

## G8 推迟说明

G8 (Store一致性: G18-G22，2.7-5h) 按详细设计文档 §3.8 推迟至 v6。涉及 homeStore.ts 竞态保护+loading拆分、lifePlanStore.ts 一站式重构 (竞态+命名+error合并+retry签名)。当前 G1-G7 核心交付已完整覆盖 P4 层所有代码修复项。
