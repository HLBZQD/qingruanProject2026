# 第5轮详细设计: 前端待办修复 (P4层代码质量迭代)

> **依据**: 任务文件 `task_v5.md` + 诊断报告 `a_v8_diag_v3.md` P4层 (第996-1004行)
> **范围**: 8组24问题 (18代码修复 + 4设计文档更新 + 2仅确认 / v4已标记)
> **日期**: 2026-06-28
> **总工时**: 9-13.5h (G1-G7核心); 含G8则 11.7-18.5h

---

## 1. 设计概述

### 1.1 本轮目标

本轮为P4层低危代码质量迭代，聚焦于:
- **设计文档补充** (G1): 4处章节更新，消除设计文档与代码实现、技术决策之间的文档缺口
- **全局CSS提取** (G2): 消除 `page-enter` 动画和 `.press` 按钮类的三处重复定义
- **代码对齐修复** (G3-G5): LifePlan/Home/Punch 三页面的 CSS/文案/校验/接口/行为修正
- **Store安全加固** (G6): riskFormStore sessionStorage 恢复增加运行时类型校验
- **类型系统清理** (G7): 删除死代码 `ApiResponse<T>`/`PaginatedResponse<T>`，收紧 `enumLabel` 类型约束
- **Store一致性重构** (G8, 可选): 竞态保护扩展 + 命名统一 + error/loading粒度对齐 + retry签名标准化

### 1.2 范围裁决

v3 推迟项 (6项，约8h) 全部推迟至 v6。G3/G6 已在 v4 完成，v5 排除。最终范围: P4层22个核心条目 + 5个可选G8条目。

### 1.3 设计原则

| 原则 | 说明 |
|------|------|
| **最小变更** | 每项修复仅改必要代码，不引入新功能 |
| **Store优先** | Store层修改先于模板层，避免接口变更导致模板返工 |
| **全局提取** | CSS全局提取遵循 `全局基础类 + 组件级覆盖` 模式 |
| **类型收紧** | 使用 `as const satisfies` / `import type` / `Number.isFinite()` 消除类型宽松 |
| **安全纵深** | sessionStorage恢复增加类型守卫，防止 JSON 反序列化类型污染 |

---

## 2. 当前代码基线

### 2.1 项目结构

```
src/
├── assets/
│   └── variables.css          ← 全局CSS变量 (--color-*, --font-*, --spacing-*)
├── composables/
│   ├── useApi.ts              ← Axios实例+拦截器
│   ├── useHomeApi.ts          ← 首页API (getDoctors/getArticles/getDiabetesTypes/getDiabetesType)
│   ├── useLifePlanApi.ts      ← 方案API (getCurrentPlan/generatePlan/adjustPlan/createPunch)
│   ├── usePunchApi.ts         ← 打卡API (getPunchList/getPunchAnalysis)
│   ├── useMarkdown.ts         ← Markdown渲染 (marked.parse + DOMPurify.sanitize)
│   └── useChatApi.ts          ← 聊天API (S5b-1新建，v5不涉及)
├── stores/
│   ├── homeStore.ts           ← 首页数据+缓存 (S1已完成)
│   ├── lifePlanStore.ts       ← 方案数据+缓存 (S2已完成)
│   ├── punchStore.ts          ← 打卡数据 (S9竞态已完成)
│   ├── riskFormStore.ts       ← 风险表单 (G10类型守卫待修复)
│   ├── authStore.ts           ← 认证
│   └── chatStore.ts           ← 聊天 (S5b-1已完成SSE核心)
├── types/
│   └── api.ts                 ← 全部API类型 (G23死代码待删除)
├── utils/
│   ├── enumLabels.ts          ← 枚举标签映射 (G26类型约束待收紧)
│   ├── sanitize.ts            ← DOMPurify封装
│   └── errorMessage.ts        ← 错误信息提取
├── views/
│   ├── Home.vue               ← 首页 (G2/G9/G28 待修复)
│   ├── LifePlan.vue           ← 方案页 (G1/G11 待修复)
│   ├── Punch.vue              ← 打卡页 (G27/G13/G15/G17/G29 待修复)
│   └── ...其他页面
└── main.ts                    ← 入口: import './assets/variables.css'
```

### 2.2 关键现状速查

| 文件 | 行号 | 当前状态 | 问题编号 |
|------|------|---------|:------:|
| `Home.vue:17-20` | L17-20 | `interface DiabetesTypeView` 本地定义 | G9 |
| `Home.vue:285` | L285 | `<span class="section-link-static">全部</span>` 静态文本 | G2 |
| `Home.vue:87-98` | L87-98 | 搜索图标 `@click="onSearch"` Toast占位 | G28 |
| `Home.vue:334-346` | L334-346 | scoped `page-enter` + `@keyframes pageEnter` (translateY 8px) | G24 |
| `LifePlan.vue:337-342` | L337-342 | `lp-empty` 类名 + "立即定制方案" 按钮 | G1 |
| `LifePlan.vue:171-177` | L171-177 | `validateForm()` 用 `== null` 判空 | G11 |
| `LifePlan.vue:894-896` | L894-896 | scoped `.press:active { scale(0.96) }` | G25 |
| `LifePlan.vue:1086-1096` | L1086-1096 | scoped `page-enter` + `@keyframes fadeIn` (纯淡入) | G24 |
| `Punch.vue:35` | L35 | `typeFilter = ref<PunchType\|undefined>(undefined)` | G17 |
| `Punch.vue:111` | L111 | `onScroll` 用 `document.documentElement` | G13 |
| `Punch.vue:160` | L160 | `router.back()` 返回按钮 | G29 |
| `Punch.vue:1144-1147` | L1144-1147 | scoped `.press:active { scale(0.96) }` | G25 |
| `punchStore.ts:19-23` | L19-23 | `filter = reactive<...>({})` | G27 |
| `homeStore.ts:7-12` | L7-12 | `interface DiabetesTypeView` (无 export) | G9 |
| `riskFormStore.ts:45-70` | L45-70 | `loadFromStorage()` 仅 allowedKeys 白名单 | G10 |
| `api.ts:2-30` | L2-30 | `ApiResponse<T>`/`PaginatedResponse<T>` 无引用 | G23 |
| `enumLabels.ts:1` | L1 | `Record<string, Record<string, string>>` 类型过宽 | G26 |

---

## 3. 任务组详细设计

### 3.1 G1: 设计文档更新 (S12 + S13 + G4 + G5)

**目标文件**: `docs/2_detailed_design_v3.md` (4处章节更新，无代码变更)

**工时**: ~2h (4项各~0.5h)

#### 3.1.1 S12: LifePlan->Punch 打卡联动路径一致性注释

- **插入位置**: 设计文档 4.2节 状态管理/数据流章节 (查找 "LifePlan" 与 "Punch" 数据流描述)
- **插入内容**:
  ```
  > **设计说明——间接一致性模型**: LifePlan 内打卡与 Punch 列表展示采用间接一致性模型
  > (consistency = eventual, via backend API)。LifePlan 打卡通过 `POST /api/punch` 写入后端，
  > Punch 列表通过 `GET /api/punch/list` 从后端读取，两套独立状态通过后端 API 串联。
  > 后端 `POST /api/punch` 的 HTTP 201 契约保证写入在响应返回前已持久化，
  > 前端从 LifePlan 打卡后立即跳转 Punch 页面时，`GET /api/punch/list` 可读取到最新记录。
  ```

#### 3.1.2 S13: 路由守卫 requiresDisclaimer 策略决策记录

- **插入位置**: 设计文档 1.6.2节 免责声明拦截流程，路由列表旁
- **插入内容**:
  ```
  > **Punch 路由免责声明决策**: Punch 页面展示 AI 生成的分析内容（依从性评语、改进建议）。
  > 当前 Punch 路由仅设置 `meta: { requiresAuth: true }`，不要求免责声明。
  > **决策**: Punch 不需要免责声明——Punch 页面展示的是统计性分析（基于用户打卡数据计算
  > 完成率/趋势），而非生成式 AI 内容。AI 依从性评语是对统计结果的文字化陈述，不触发
  > 免责声明要求。若产品后续将此判定为需要免责声明，需同步修改路由 meta 和 `src/router/index.ts`。
  ```

#### 3.1.3 G4: marked 同步/异步双模式标注

- **插入位置**: 设计文档 1.3节 技术选型章节 (Markdown 渲染相关)
- **插入内容**:
  ```
  > **Markdown 渲染模式**: 当前 marked v12 同步模式 (`marked.parse(md, { async: false })`)
  > 与未来 v13+ 异步模式 (`marked.parse(md, { async: true })`) 为有意并存的双模式策略。
  > - 同步模式: 用于当前所有 Markdown 渲染场景（LifePlan 方案内容、Punch AI 分析评语）
  > - 异步迁移路径: 已在 `useMarkdown.ts` 中以 G16 注释标注 (`// G16: marked v13+ 异步模式`)
  > - 当前 marked v12 同步模式稳定可用，无迁移紧迫性
  ```

#### 3.1.4 G5: LifePlan 打卡弹窗交互顺序更新

- **修改位置**: 设计文档 4.3节 LifePlan.vue 流程图中的打卡交互步骤
- **修改内容**: 将步骤从 `点击打卡按钮 -> POST /api/punch -> SweetAlert2 确认弹窗 -> 乐观更新` 改为:
  ```
  点击打卡按钮 -> SweetAlert2 确认弹窗 (收集完成/未完成状态 + 备注) -> POST /api/punch -> 乐观更新 completedMap
  ```
- **附注**: 代码实现顺序 (先弹窗后API) 优于原设计 (先API后弹窗)，避免用户取消后的无效请求。

#### 验收标准

- [ ] AC-1: S12 注释已添加，注明 HTTP 201 契约保证
- [ ] AC-2: S13 决策已记录 (Punch 不需要免责声明)
- [ ] AC-3: G4 双模式已标注为有意并存
- [ ] AC-4: G5 流程图打卡弹窗顺序已调整为"先弹窗后API"
- [ ] AC-5: `git diff` 仅显示 `docs/2_detailed_design_v3.md` 变更

---

### 3.2 G2: 全局 CSS 提取 (G24 + G25)

**目标文件**: `src/styles/animations.css` (新建) + 三组件 `<style scoped>` 清理

**工时**: 1-2h

**前置依赖**: 无

#### 3.2.1 全局动画差异分析

| 页面 | 当前效果 | 关键帧 |
|------|---------|--------|
| Home.vue | fadeIn + translateY(8px) (淡入+上滑) | `@keyframes pageEnter { opacity + transform: translateY }` 0.3s |
| LifePlan.vue | 纯 fadeIn (仅 opacity) | `@keyframes fadeIn { opacity }` 0.3s |
| Punch.vue | 无动画 (class `page-enter` 已在模板，但无对应CSS) | -- |

**设计方案C (推荐)**: 全局基础 `fadeIn` + Home 组件级 `translateY` 覆盖。

#### 3.2.2 新建 `src/styles/animations.css`

```css
/* ===== 页面入场动画（全局基础: 纯淡入） ===== */
@keyframes pageEnterFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.page-enter {
  animation: pageEnterFadeIn 0.4s ease-out;
}

/* ===== 按钮按下态交互（全局） ===== */
.press:active {
  transform: scale(0.96);
  transition: transform 0.1s;
}
```

- `pageEnterFadeIn` (新名称) 避免与 Home.vue 原有 `@keyframes pageEnter` (含 translateY) 冲突
- Punch.vue 因模板中已有 `class="page-enter"`，引入全局样式后自动获得淡入效果
- 动画时长统一为 0.4s (原 Home 0.3s / LifePlan 0.3s -> 统一 0.4s，视觉更平滑)

#### 3.2.3 全局样式引入

在 `src/main.ts` 中增加导入:

```typescript
import './assets/variables.css'
import './styles/animations.css'  // 新增: 全局动画 + 交互类
```

置于 `createApp(App)` 之前，确保全局样式优先于 scoped 样式加载。

#### 3.2.4 修改 `src/views/Home.vue`

(a) `<style scoped>`: 删除以下块 (L333-L346):
```css
/* 删除 */
.page-enter {
  animation: pageEnter 0.3s ease;
}
@keyframes pageEnter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: none; }
}
```

(b) `<style scoped>`: 新增 Home 专属上滑覆盖:
```css
/* Home.vue scoped — 在全局 fadeIn 基础上追加 translateY 上滑效果 */
.page-enter.home-page {
  animation-name: pageEnterHome;
  animation-duration: 0.4s;
}

@keyframes pageEnterHome {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

(c) 模板无需修改 — 根元素已有 `class="home-page page-enter"` (L158).

#### 3.2.5 修改 `src/views/LifePlan.vue`

(a) `<style scoped>`: 删除 `page-enter` / `@keyframes fadeIn` 定义 (L1085-L1096):
```css
/* 删除 */
.page-enter { animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
```

(b) `<style scoped>`: 删除 `.press:active` 定义 (L893-L896):
```css
/* 删除 */
.press:active { transform: scale(0.96); transition: var(--transition-fast); }
```

#### 3.2.6 修改 `src/views/Punch.vue`

(a) `<style scoped>`: 删除 `.press:active` 定义 (L1144-L1147):
```css
/* 删除 */
.press:active { transform: scale(0.96); transition: var(--transition-fast); }
```

(b) 模板无需修改 — 根元素已有 `class="punch-page page-enter"` (L239).

#### 边界条件

| 条件 | 处理 |
|------|------|
| CSS 变量依赖 | 全局样式不引用 `var(--transition-fast)` 等变量 (未 import variables.css 时失效)。使用硬编码 `0.1s` |
| Home 覆盖优先级 | scoped 样式通过 `[data-v-xxx]` 提升优先级，`.page-enter.home-page` 组合选择器优先级高于全局 `.page-enter` |
| 动画时长差异 | Home 原 0.3s → 新 0.4s (与全局统一)；LifePlan 原 0.3s → 新 0.4s。视觉差异极小 |
| Punch 现有动画 | Punch.vue 的 `page-enter` class 当前无动画效果，引入全局后首次获得淡入效果 — 属正向改进 |

#### 验收标准

- [ ] AC-1: Punch 入场有淡入动画 (此前不生效)
- [ ] AC-2: Home 保持 fadeIn + translateY(8px) 上滑效果
- [ ] AC-3: LifePlan 保持纯 fadeIn (无位移)
- [ ] AC-4: LifePlan/Punch 按钮 `scale(0.96)` 按下态正常
- [ ] AC-5: `npx vue-tsc --noEmit` 无新增错误

---

### 3.3 G3: LifePlan 修复 (G1 + G11)

**目标文件**: `src/views/LifePlan.vue` (仅此文件)

**工时**: 1-2.5h (G1 1-2h + G11 0.3-0.5h)

**前置依赖**: 建议 G2 之后执行 (CSS定义已稳定)

#### 3.3.1 G1: CSS 类名注释 + 按钮文案对齐

**修改位置**: `src/views/LifePlan.vue` 模板 (L364-370)

(a) 空态区域 `lp-empty` 增加注释 (L364):
```html
<!-- 对应设计文档 4.1.4节 empty-state；项目使用 lp- 前缀作为统一命名空间 -->
<div v-else-if="viewMode === 'empty'" class="lp-empty">
```

(b) 按钮文案修改 (L369):
```html
<!-- 修改前 -->
<button class="lp-cta press" @click="showForm">立即定制方案</button>
<!-- 修改后 -->
<button class="lp-cta press" @click="showForm">生成我的生活方案</button>
```

设计依据: 设计文档 4.1.4 节规定按钮文案为"开始风险预测 / 生成我的生活方案"。

#### 3.3.2 G11: 表单校验空字符串边界

**修改位置**: `src/views/LifePlan.vue` `validateForm()` 函数 (L171-177)

```typescript
// 修改前
function validateForm(): boolean {
  if (form.age == null || form.age < 1 || form.age > 120) return false
  if (form.gender !== 'male' && form.gender !== 'female') return false
  if (form.height == null || form.height <= 0) return false
  if (form.weight == null || form.weight <= 0) return false
  return true
}

// 修改后
function validateForm(): boolean {
  if (!Number.isFinite(form.age) || form.age < 1 || form.age > 120) return false
  if (form.gender !== 'male' && form.gender !== 'female') return false
  if (!Number.isFinite(form.height) || form.height <= 0) return false
  if (!Number.isFinite(form.weight) || form.weight <= 0) return false
  return true
}
```

**`Number.isFinite()` 边界行为验证**:

| 输入 | Number.isFinite(x) | 后续范围检查 | 结果 |
|------|-------------------|-------------|:--:|
| `null` | `false` | -- | 拒绝 |
| `''` | `false` | -- | 拒绝 |
| `NaN` | `false` | -- | 拒绝 |
| `0` | `true` | `0 < 1` → 拒绝 | 拒绝 |
| `35` | `true` | `35 >= 1 && 35 <= 120` → 通过 | 通过 |
| `'35'` | `true` (Number('35')=35) | 同 35 | 通过 |

所有边界均正确。`Number.isFinite()` 对 `null`/`''`/`NaN` 均返回 `false`，弥补了 `== null` 宽松判等的盲区。

#### 边界条件

- G1 仅涉及 `viewMode === 'empty'` 引导态，不影响方案展示态
- G11 校验结果用于按钮 `:disabled` 和 `@click` 门控，修复后输入框清空时按钮保持 disabled

#### 验收标准

- [ ] AC-1: 空态按钮文案为"生成我的生活方案"
- [ ] AC-2: `lp-empty` 处有注释标注设计文档对应位置
- [ ] AC-3: 清空年龄输入框后提交，校验提示触发 (非静默通过)
- [ ] AC-4: 输入 `0` 作为年龄，被 `age < 1` 拒绝
- [ ] AC-5: 输入合法值 (35/170/70)，校验通过
- [ ] AC-6: `npx vue-tsc --noEmit` 无新增错误

---

### 3.4 G4: Home 修复 (G2 + G9 + G28)

**目标文件**: `src/views/Home.vue` + `src/stores/homeStore.ts`

**工时**: 0.9-1.5h

**前置依赖**: 建议 G2 之后执行 (CSS定义已稳定)。G9 应在 G23 (删除 api.ts 死代码) 之前执行。

#### 3.4.1 G2: 糖尿病类型区"全部"链接

**修改位置**: `src/views/Home.vue` L285

```html
<!-- 修改前 -->
<span class="section-link-static">
  全部 <i class="fa-solid fa-chevron-right"></i>
</span>

<!-- 修改后 -->
<!-- 全部链接为预留入口，待后续迭代实现糖尿病类型列表页 -->
<span class="section-link-static">
  全部 <i class="fa-solid fa-chevron-right"></i>
</span>
```

**设计决策**: 保持 `<span>` 占位。设计文档未定义"全部"的跳转目标 (无糖尿病类型列表路由)，改为可点击链接需要确认路由是否存在。

#### 3.4.2 G9: DiabetesTypeView 接口合并

**(a) `src/stores/homeStore.ts` L7**: 增加 `export`:

```typescript
// 修改前
interface DiabetesTypeView extends DiabetesType { ... }
// 修改后
export interface DiabetesTypeView extends DiabetesType { ... }
```

**(b) `src/views/Home.vue` L17-20**: 删除本地接口定义，改为 import:

```typescript
// 删除 (L17-20)
interface DiabetesTypeView extends DiabetesType {
  cover: string
  brief: string
}

// 新增 import (在现有 import 块中追加)
import type { Article, DiabetesType, DiabetesTypeDetail, DiabetesTypeView } from '@/types/api'
// ... 同时从 homeStore import (在 useHomeStore 行附近):
import type { DiabetesTypeView } from '@/stores/homeStore'
```

**注意**: `Home.vue` 中 `DiabetesTypeView` 在 L54 的 computed 类型标注中使用:
```typescript
const diabetesTypes = computed<DiabetesTypeView[]>(() => homeStore.diabetesTypes)
```
此引用在改为 import type 后保持不变。

**合并前验证**: 确认 homeStore.ts 中 `DiabetesTypeView` 的 `cover`/`brief` 字段定义与 Home.vue 中本地定义一致。经代码审查，两者字段完全相同 (`cover: string; brief: string`)，无差异。

#### 3.4.3 G28: 搜索图标行为

**修改位置**: `src/views/Home.vue` L168

```html
<!-- 修改前 -->
<button class="home-search-btn" aria-label="搜索" @click="onSearch">

<!-- 修改后 -->
<!-- 搜索图标——功能占位（待后续迭代实现完整搜索），当前弹出 Toast 提示 -->
<button class="home-search-btn" aria-label="搜索" @click="onSearch">
```

**设计决策 (方案a)**: 保留功能占位。搜索是常见用户预期功能，保留 Toast 提示比空白图标更好。设计文档组件树中"装饰性"标注改为"功能占位 (待实现)" — 此项在 G1 (S13附近) 同步完成。

#### 边界条件

- G2: 若后续实现跳转，需确认存在糖尿病类型列表路由
- G9: `import type` 仅类型标注，无运行时依赖
- G28: Toast 文案"搜索功能开发中"保持不变

#### 验收标准

- [ ] AC-1: "全部"为 `<span>` 静态文本，旁有注释标注预留入口
- [ ] AC-2: 删除 Home.vue 本地 `DiabetesTypeView` 定义后编译通过
- [ ] AC-3: 搜索图标弹出 "搜索功能开发中" Toast
- [ ] AC-4: `npx vue-tsc --noEmit` 无新增错误

---

### 3.5 G5: Punch 修复 (G27 前置 → G13 + G15 + G17 + G29)

**目标文件**: `src/stores/punchStore.ts` + `src/views/Punch.vue`

**工时**: 1.7-3h

**前置依赖**: G27 → G17 为**硬依赖** (Store接口变更影响模板访问路径)。G27 → G13/G15/G29 为**建议依赖** (避免回修)。

**执行顺序**: G27 必须最先执行。

#### 3.5.1 G27 (前置): punchStore.filter reactive -> ref

**修改文件**: `src/stores/punchStore.ts`

**(a)** L19-23: 将 `reactive` 改为 `ref`:
```typescript
// 修改前
const filter = reactive<{ startDate?: string; endDate?: string; punch_type?: PunchType }>({})

// 修改后
const filter = ref<{ startDate?: string; endDate?: string; punch_type?: PunchType }>({})
```

**(b)** `setFilter()` L151-169: 使用不可变更新:
```typescript
async function setFilter(partial: { ... }): Promise<void> {
  // 修改前 (L156-158)
  if ('startDate' in partial) filter.startDate = partial.startDate
  if ('endDate' in partial) filter.endDate = partial.endDate
  if ('punch_type' in partial) filter.punch_type = partial.punch_type

  // 修改后
  filter.value = { ...filter.value, ...partial }

  await fetchList()
  // ... 防抖 fetchAnalysis 保持不变
}
```

**(c)** `fetchList()` L68-74 和 `loadMore()` L103-109: 参数构建中 `filter.startDate` -> `filter.value.startDate`:
```typescript
// fetchList L68-74
const params: PunchListParams = {
  page: 1,
  pageSize: 20,
  ...(filter.value.startDate ? { startDate: filter.value.startDate } : {}),
  ...(filter.value.endDate ? { endDate: filter.value.endDate } : {}),
  ...(filter.value.punch_type ? { punch_type: filter.value.punch_type } : {}),
}
// loadMore L103-109 同理
```

**(d)** 模板兼容性说明:
- Pinia store 中的 `ref` 在 Vue 模板中自动解包 `.value`
- `src/views/Punch.vue` 模板中 `store.filter.startDate` 等访问方式**保持不变**
- `<script setup>` 中直接访问 `store.filter` 的代码需检查:
  - L133-136 `onTypeFilter`: `store.setFilter({ punch_type: val })` — 不访问 filter 属性，无影响
  - L139-143 `onDateChange`: `store.setFilter({ startDate: ... })` — 同上
  - L214 `store.setFilter({ ... })` — onMounted 中调用，同上
  - **结论**: Punch.vue 的 `<script setup>` 中无直接访问 `store.filter.xxx` 的代码，G27 对 Punch.vue 的影响面为零

#### 3.5.2 G13: onScroll 容器绑定

**修改位置**: `src/views/Punch.vue` 模板 L239 + `<script setup>` L119-129

(a) 模板根元素增加 `data-scroll-container` 属性:
```html
<!-- L239 修改前 -->
<div class="punch-page page-enter">
<!-- 修改后 -->
<div class="punch-page page-enter" data-scroll-container="punch">
```

(b) `onScroll` 增加可见性检查:
```typescript
// L119-129 修改
function onScroll() {
  if (scrollTicking) return
  // 仅在当前页面可见时处理滚动逻辑
  const container = document.querySelector('[data-scroll-container="punch"]')
  if (!container) return

  scrollTicking = true
  requestAnimationFrame(() => {
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement
    if (scrollHeight - scrollTop - clientHeight < 120) {
      store.loadMore()
    }
    scrollTicking = false
  })
}
```

**设计理由**: 方案A (保持文档级滚动 + 可见性检查) 不改动CSS布局和滚动模型，仅降低对 `document.documentElement` 作为唯一滚动容器的隐式假设。`data-scroll-container` 属性仅用于标识，不引入新CSS语义，不影响现有布局。

不采用方案B (局部滚动) 的理由: 方案B 要求 `.punch-page` 设置 `height: 100vh; overflow-y: auto`，此CSS变更会影响 G15 (分析区提示文案的DOM定位基准)，增加协调成本。

#### 3.5.3 G15: loadMore 分析范围提示

**修改位置**: `src/views/Punch.vue` 模板 L274 (分析区附近) + `<style scoped>`

(a) 模板: 在 AI 免责提示条之前 (L388前) 增加:
```html
<!-- 分析范围提示 -->
<p class="analysis-range-hint" v-if="store.analysis">
  分析基于当前筛选范围内的打卡记录
</p>
```

(b) `<style scoped>` 追加:
```css
.analysis-range-hint {
  font-size: 12px;
  color: var(--color-text-secondary, #999);
  text-align: center;
  margin: 8px 0;
}
```

**设计前提**: 需确认后端 `GET /api/punch/analysis` 始终返回全量统计 (不受分页参数影响)。若后端按分页范围返回分析数据，提示文案需调整为"分析基于当前显示的打卡记录"。

#### 3.5.4 G17: typeFilter ref -> computed

**前提**: G27 完成后 `store.filter` 为 ref，接口稳定。

**修改位置**: `src/views/Punch.vue` L35 + L133-136 + L431-439

```typescript
// 删除 L35
const typeFilter = ref<PunchType | undefined>(undefined)

// 删除 L133-136
function onTypeFilter(val: PunchType | undefined) {
  typeFilter.value = val
  store.setFilter({ punch_type: val })
}

// 新增 (L35 附近)
const typeFilter = computed<PunchType | undefined>({
  get: () => store.filter.punch_type,
  set: (val: PunchType | undefined) => store.setFilter({ punch_type: val }),
})
```

模板 L431-439 chip 按钮绑定:
```html
<!-- 修改前 -->
@click="onTypeFilter(opt.value)"

<!-- 修改后 -->
@click="typeFilter = opt.value"
```

**行为等价验证**: `computed` setter 在 `typeFilter = undefined` (点击"全部"chip)时，`store.setFilter({ punch_type: undefined })` 清除类型筛选，与当前 `onTypeFilter(undefined)` 行为完全一致。

#### 3.5.5 G29: router.back() 返回路径修复

**修改位置**: `src/views/Punch.vue` 模板 L242-244

```html
<!-- 修改前 -->
<button class="punch-back press" @click="router.back()" aria-label="返回">

<!-- 修改后 -->
<button class="punch-back press" @click="router.push('/profile')" aria-label="返回">
```

**设计理由**: `router.push('/profile')` 始终返回 Profile 页面，提供一致的导航体验。`router.back()` 在用户直接访问 `/profile/punch` (历史栈长度为1)时可能退出应用。若需保留从 LifePlan 跳转后返回 LifePlan 的便利性，可在后续迭代中通过 query 参数 `?from=lifeplan` 实现来源感知。

#### 边界条件

| 条件 | 处理 |
|------|------|
| Pinia ref 解包 | Punch.vue `<script setup>` 中无直接访问 `store.filter.xxx` 的代码，G27 变更仅影响 punchStore.ts 内部 |
| G17 computed setter 与 G27 交互 | `store.filter.punch_type` 在 G27 后仍可在模板中自动解包，computed getter 正常工作 |
| G13 滚动节流 | 保持现有 `requestAnimationFrame` 节流逻辑不变 |
| G15 分析提示条件 | 仅 `store.analysis` 存在时展示 (避免空态误导) |

#### 验收标准

- [ ] AC-1: 修改日期/类型筛选后 `filter` 值正确更新，`fetchList()` 参数包含正确筛选值
- [ ] AC-2: 滚动到底部自动触发 `loadMore()`，列表追加记录
- [ ] AC-3: 分析区展示"分析基于当前筛选范围内的打卡记录"
- [ ] AC-4: 点击类型chip切换筛选，chip高亮、列表数据、`store.filter.punch_type` 三者一致
- [ ] AC-5: 通过其他路径修改 `store.filter.punch_type` (如URL参数恢复)，chip高亮自动同步
- [ ] AC-6: 返回按钮始终跳转至 `/profile` (从 LifePlan 进入亦然)
- [ ] AC-7: `npx vue-tsc --noEmit` 无新增错误；`onTypeFilter` 函数删除后无未使用变量警告

---

### 3.6 G6: Store 安全 (G10: riskFormStore 类型守卫)

**目标文件**: `src/stores/riskFormStore.ts`

**工时**: 0.3-0.5h

**前置依赖**: 无 (仅修改 riskFormStore.ts，与 G5/G8 无共享文件)

#### 3.6.1 loadFromStorage() 类型守卫

**修改位置**: `src/stores/riskFormStore.ts` `loadFromStorage()` 函数 (L45-70)

在 `loadFromStorage()` 的字段恢复循环中增加值类型校验:

```typescript
// 在文件顶部 (L5 附近) 新增常量定义
const NUMBER_FIELDS: ReadonlyArray<string> = ['age', 'height', 'weight', 'waist', 'systolic_bp']

const ENUM_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  diabetes_history: new Set(['healthy', 'prediabetes', 'diagnosed']),
  diabetes_type: new Set(['type1', 'type2', 'gestational', 'other']),
  gender: new Set(['male', 'female']),
  family_history: new Set(['yes', 'no']),
}

// 修改 loadFromStorage() L53-57:
// 修改前
const allowedKeys = ['diabetes_history', 'diabetes_type', 'age', 'gender', 'height', 'weight', 'waist', 'systolic_bp', 'family_history', 'pregnancy']
for (const key of allowedKeys) {
  if (key in parsed.formData) fd[key] = (parsed.formData as Record<string, unknown>)[key]
}

// 修改后
const allowedKeys = ['diabetes_history', 'diabetes_type', 'age', 'gender', 'height', 'weight', 'waist', 'systolic_bp', 'family_history', 'pregnancy']
for (const key of allowedKeys) {
  if (!(key in parsed.formData)) continue
  const value = (parsed.formData as Record<string, unknown>)[key]

  // 数字字段: 强制转换为 number，类型校验失败则静默丢弃
  if (NUMBER_FIELDS.includes(key)) {
    const num = Number(value)
    if (Number.isFinite(num)) {
      fd[key] = num
    }
    // 否则: 静默丢弃 (设为 undefined，不影响整体恢复)
    continue
  }

  // 枚举字段: 校验值是否在允许集合中
  if (key in ENUM_FIELDS) {
    if (typeof value === 'string' && ENUM_FIELDS[key].has(value)) {
      fd[key] = value
    }
    // 不在允许集合中 -> 静默丢弃
    continue
  }

  // 其他字段 (pregnancy 等): 直接赋值 (保持原有逻辑)
  fd[key] = value
}
```

**校验边界**:

| 场景 | 输入 | 行为 |
|------|------|------|
| 字符串年龄 | `age: "25"` | `Number("25") = 25` -> 通过，恢复为数字 `25` |
| 非法年龄 | `age: "abc"` | `Number("abc") = NaN`, `isFinite(NaN) = false` -> 丢弃 |
| 合法年龄 0 | `age: 0` | `Number.isFinite(0) = true` -> 恢复为 `0` (表单层 `age < 1` 后续拦截) |
| 非法枚举 | `gender: "invalid"` | `ENUM_FIELDS.gender.has("invalid") = false` -> 丢弃 |
| 合法枚举 | `gender: "male"` | `ENUM_FIELDS.gender.has("male") = true` -> 恢复 |
| pregnancy | `pregnancy: true` | 不在 NUMBER_FIELDS/ENUM_FIELDS -> 直接赋值 |

**设计原则**: 单个字段的类型污染不应阻止整体数据恢复。脏数据字段设为 `undefined` 而非抛出错误。

#### 验收标准

- [ ] AC-1: sessionStorage 中手动改 `age` 为字符串 `"25"`，刷新后 `formData.age` 转为数字 `25`
- [ ] AC-2: 将 `gender` 改为 `"invalid"`，刷新后 `formData.gender` 为 `undefined`
- [ ] AC-3: 正常填写表单后刷新，所有字段值正确恢复
- [ ] AC-4: sessionStorage 无 `risk_form_data` 键时，`formData` 保持默认值
- [ ] AC-5: `npx vue-tsc --noEmit` 无新增编译错误

---

### 3.7 G7: 类型清理 (G23 + G26)

**目标文件**: `src/types/api.ts` + `src/utils/enumLabels.ts`

**工时**: 0.6-1h

**前置依赖**: 建议 G9 (接口合并) 之后执行 — G9 合并后类型引用关系更清晰。

#### 3.7.1 G23: api.ts 死代码删除

**(a) 验证无外部引用** (需执行，不在设计文档中体现):

```bash
grep -r "ApiResponse\|PaginatedResponse" src/ --include="*.ts" --include="*.vue"
```

经设计阶段代码审查确认:
- `ApiResponse<T>`: 在 `api.ts` 中定义 (L2-6)，`useApi.ts` 响应拦截器使用 `AxiosResponse<ApiResponse<T>>` 类型 (需确认)
- `ApiError`: 需确认是否有外部引用
- `PaginatedResponse<T>`: 当前 API composable 均使用各自的内联 `PagedBody<T>` 类型，无引用
- `PaginationParams`: 被 `PunchListParams extends PaginationParams` 引用 (L281) — **不能删除**

**(b) 若确认无外部引用，删除**:

删除 `ApiResponse<T>` (L2-6) 和 `PaginatedResponse<T>` (L27-30) 定义。保留 `ApiError` (L8-13) 和 `PaginationInfo` (L20-25) 和 `PaginationParams` (L15-18) — 后者被 `PunchListParams` 继承。

**(c) 在文件顶部增加类型策略注释** (L1前):

```typescript
/**
 * API 类型定义
 *
 * 类型策略: API composable 采用内联类型定义每个接口的请求/响应结构，
 * 更好地表达每个端点的具体契约。不使用泛型包装器 (ApiResponse<T> 等)。
 */
```

#### 3.7.2 G26: enumLabel 映射表类型约束

**修改文件**: `src/utils/enumLabels.ts`

```typescript
// 修改前
const LABELS: Record<string, Record<string, string>> = {
  gender: { male: '男', female: '女' },
  // ...
}

// 修改后
const LABELS = {
  gender: {
    male: '男',
    female: '女',
  },
  family_history: {
    yes: '有',
    no: '无',
  },
  diabetes_history: {
    healthy: '健康',
    prediabetes: '糖尿病前期',
    diagnosed: '已确诊',
  },
  diabetes_type: {
    type1: '1型糖尿病',
    type2: '2型糖尿病',
    gestational: '妊娠期糖尿病',
    other: '其他特殊类型',
  },
  risk_level: {
    low: '低风险',
    medium: '中风险',
    high: '高风险',
  },
  plan_type: {
    diet: '饮食',
    exercise: '运动',
    other: '其他',
  },
  punch_type: {
    diet: '饮食',
    exercise: '运动',
  },
  completion_status: {
    completed: '已完成',
    uncompleted: '未完成',
  },
} as const satisfies Record<string, Record<string, string>>
```

**`as const satisfies` 效果**:
- `as const`: 深度只读，内层值类型收窄为字面量联合 (`'男' | '女'` 而非 `string`)
- `satisfies Record<string, Record<string, string>>`: 编译时检查结构兼容性
- 拼写错误 `LABELS.punch_type.die` -> TypeScript 编译错误 (属性 "die" 不存在)

**`enumLabel` 函数兼容性**:
```typescript
export function enumLabel(category: string, value: string): string {
  return LABELS[category]?.[value] ?? value
}
```
`LABELS[category]` 在 `as const` 后仍可索引 (`category: string` 对 `Record<string, ...>`)，返回类型为 `Record<string, string> | undefined`，`?.[value]` 后为 `string | undefined`，`?? value` 后为 `string` — 完全兼容。

**TypeScript 版本要求**: `as const` 需要 TS 3.4+，`satisfies` 需要 TS 4.9+。项目使用 TS 5.x，完全兼容。

#### 边界条件

- G23: 删除前必须全文搜索确认无外部引用。若 `ApiError` 有引用则保留
- G23: `PaginationParams` 被 `PunchListParams extends PaginationParams` 引用，不能删除
- G26: `as const` 后 `LABELS` 深度只读，但 `enumLabel` 仅读取不影响

#### 验收标准

- [ ] AC-1: `ApiResponse`/`PaginatedResponse` 删除后编译通过 (若存在引用则改为保留/替换)
- [ ] AC-2: 故意使用 `LABELS.punch_type.die` 产生 TS 编译错误 (`as const satisfies` 生效)
- [ ] AC-3: `enumLabel('gender', 'male')` 正常返回 "男"
- [ ] AC-4: `npx vue-tsc --noEmit` 无新增编译错误

---

### 3.8 G8: Store 一致性 (G18 + G19 + G20 + G21 + G22) — 可选

**目标文件**: `src/stores/homeStore.ts` + `src/stores/lifePlanStore.ts` + `src/views/Home.vue` + `src/views/LifePlan.vue`

**工时**: 2.7-5h

**前置依赖**: 建议 G5 之后执行 (G27 punchStore filter 变更完成后，三个 Store 修改区域更清晰)

**可推迟理由**: 5个子任务均属代码质量/风格改进，不涉及功能缺陷。若 v5 核心交付 (G1-G7) 工时紧张，本组推迟至 v6。

**Store 层依赖关系**: 本组 5 个子任务均修改 Store 文件。lifePlanStore.ts 被 G19/G20/G22 三个维度同时修改，强烈建议由同一开发者集中完成 (一站式重构)，避免多人并行修改同一文件导致的合并冲突。顺序: G18 -> G19 -> G20 -> G22 (先加保护机制，再做命名/接口重构，最后统一 retry 签名)。G21 修改 homeStore.ts，可独立并行。

#### 3.8.1 G18: 竞态保护扩展

**homeStore.ts**: 增加 `pageInstanceId` 快照保护 `fetchHomeData()`。

```typescript
// 在 useHomeStore 函数体内顶部新增
let pageInstanceId = 0

// fetchHomeData() L98-133: 在函数入口增加快照
async function fetchHomeData(): Promise<void> {
  const pageToken = ++pageInstanceId  // 入口递增

  const cache = readHomeCache()
  if (cache) {
    doctors.value = cache.doctors
    articles.value = cache.articles
    diabetesTypes.value = cache.diabetesTypes
    return  // 缓存命中不递增 pageInstanceId，不影响竞态保护
  }

  loading.value = true
  // ... clear errors ...

  const [docRes, artRes, typeRes] = await Promise.allSettled([...])

  // 三个请求完成后统一检查，过期则整体丢弃
  if (pageToken !== pageInstanceId) return

  // ... 回填数据 + writeHomeCache() + loading.value = false
}
```

**lifePlanStore.ts**: 为 `fetchCurrent()`、`generate()`、`adjust()` 增加 requestId 快照保护。

```typescript
// 在 useLifePlanStore 函数体内新增
const requestId = ref(0)

// fetchCurrent() L98-119: 增加快照
async function fetchCurrent(): Promise<void> {
  const cache = readPlanCache()
  if (cache) { ... return }
  const snapshot = ++requestId.value
  loading.value = true
  error.value = null
  try {
    const data = await getCurrentPlan()
    if (snapshot !== requestId.value) return
    currentPlan.value = data
    writePlanCache()
  } catch (e: unknown) {
    if (snapshot !== requestId.value) return
    error.value = e instanceof Error ? e : new Error('方案加载失败')
  } finally {
    if (snapshot === requestId.value) { loading.value = false }
  }
}

// generate() L127-154: 增加快照
async function generate(req: PlanGenerateRequest): Promise<boolean> {
  if (generating.value) return false
  generating.value = true
  const snapshot = ++requestId.value
  generateError.value = null
  isConflict.value = false
  isHistoryFallback.value = false
  try {
    const data = await generatePlan(req)
    if (snapshot !== requestId.value) return false
    currentPlan.value = { ...data, generated_at: new Date().toISOString() }
    completedMap.value = new Map()
    writePlanCache()
    return true
  } catch (e: unknown) {
    if (snapshot !== requestId.value) return false
    // ... 409/错误处理
    return false
  } finally {
    generating.value = false
  }
}

// adjust() L160-172: 增加快照 (同模式)
```

**punchStore.ts**: 已有 requestId 快照保护 (L52)，无需修改。

#### 3.8.2 G19: action 命名统一

**lifePlanStore.ts**:

| 当前名称 | 新名称 | 理由 |
|---------|--------|------|
| `generate(req)` | `createPlan(req)` | `create` 更精确表达 POST 创建语义 |
| `adjust(req)` | `updatePlan(req)` | `update` 为 CRUD 标准动词 |

```typescript
// 函数重命名
async function createPlan(req: PlanGenerateRequest): Promise<boolean> { ... }
async function updatePlan(req: PlanAdjustRequest): Promise<boolean> { ... }
```

**LifePlan.vue 调用点更新** (全文搜索 `store.generate` / `store.adjust`):

| 位置 | 当前 | 修改为 |
|------|------|--------|
| L214 | `await store.generate(buildGenerateRequest())` | `await store.createPlan(buildGenerateRequest())` |
| L236 | `await store.adjust({...})` | `await store.updatePlan({...})` |
| L434 | `{{ store.generating ? 'AI 生成中...' : '生成生活方案' }}` | `generating` ref 名不变 — 仅 action 函数名变 |
| L430 | `:disabled="store.generating \|\| !validateForm()"` | 不变 |

**lifePlanStore.ts return 块更新**:
```typescript
return {
  // ...
  createPlan,       // 原 generate
  updatePlan,       // 原 adjust
  // ...
}
```

`retryGenerate` 在 G22 中一并处理。

#### 3.8.3 G20: error 字段粒度统一

**lifePlanStore.ts**: 合并 `generateError` 和 `adjustError` 为 `mutationError`。

```typescript
// 修改前
const generateError = ref<Error | null>(null)
const adjustError = ref<Error | null>(null)

// 修改后
const mutationError = ref<Error | null>(null)
```

**所有 `generateError` 引用替换**:
- `generate()` 函数中: `generateError.value = null` -> `mutationError.value = null`
- `generate()` catch 中: `generateError.value = new Error(...)` -> `mutationError.value = new Error(...)`
- `adjust()` 函数中: `adjustError.value = null` -> `mutationError.value = null`
- `adjust()` catch 中: `adjustError.value = new Error(...)` -> `mutationError.value = new Error(...)`

**LifePlan.vue 模板适配**:
- L85: `const errorRef = computed(() => store.generateError ?? store.error)` -> `const errorRef = computed(() => store.mutationError ?? store.error)`
- L245: `getErrorMessage(store.adjustError, '调整失败，请稍后重试')` -> `getErrorMessage(store.mutationError, '调整失败，请稍后重试')`

**lifePlanStore.ts return 块更新**:
```typescript
return {
  mutationError,   // 替代 generateError + adjustError
  // error (fetchCurrent) 保持不变
}
```

**设计理由**: `generate` 和 `adjust` 同为 mutation 操作，共享同一 error ref 意味着同一时间仅展示最近一次 mutation 的错误，符合用户预期。

**homeStore / punchStore**: 当前已符合按资源拆分策略 (homeStore: doctorsError/articlesError/typesError; punchStore: error/analysisError)，保持不变。

#### 3.8.4 G21: loading 字段粒度对齐

**homeStore.ts**: 将单一 `loading` 拆分为三个独立 loading + 聚合 computed。

```typescript
// 修改前
const loading = ref<boolean>(false)

// 修改后
const doctorsLoading = ref(false)
const articlesLoading = ref(false)
const typesLoading = ref(false)

// 聚合 computed (首屏整体骨架屏用)
const loading = computed(() =>
  doctorsLoading.value || articlesLoading.value || typesLoading.value
)
```

**fetchHomeData()** 中在各 Promise.allSettled 分支中设置对应 loading:
```typescript
async function fetchHomeData(): Promise<void> {
  const pageToken = ++pageInstanceId
  // ...
  doctorsLoading.value = true
  articlesLoading.value = true
  typesLoading.value = true
  // ...

  const [docRes, artRes, typeRes] = await Promise.allSettled([...])

  if (pageToken !== pageInstanceId) return

  // 无论成功/失败，settled 后对应 loading 结束
  doctorsLoading.value = false
  articlesLoading.value = false
  typesLoading.value = false

  // ... 回填数据 ...
}
```

**retryXxx()** 中仅设置对应 loading:
```typescript
// fetchSingle() L165-193
async function fetchSingle(which: 'doctors' | 'articles' | 'types'): Promise<void> {
  if (which === 'doctors') {
    doctorsLoading.value = true
    doctorsError.value = null
    try { doctors.value = await getDoctors(...); writeHomeCache() }
    catch (e) { doctorsError.value = ... }
    finally { doctorsLoading.value = false }
    return
  }
  // articles / types 同理
}
```

**homeStore.ts return 块更新**:
```typescript
return {
  doctorsLoading,
  articlesLoading,
  typesLoading,
  loading,   // computed 聚合 — 首屏整体骨架屏
  // ... 其余不变
}
```

**Home.vue 模板适配**: L71-73 独立 loading 判定:
```typescript
// L71-73 修改前
const doctorsLoading = computed(() => homeStore.loading && doctors.value.length === 0 && !homeStore.doctorsError)

// 修改后 (使用 store 暴露的独立 loading)
const doctorsLoading = computed(() => homeStore.doctorsLoading && doctors.value.length === 0 && !homeStore.doctorsError)
const articlesLoading = computed(() => homeStore.articlesLoading && articles.value.length === 0 && !homeStore.articlesError)
const typesLoading = computed(() => homeStore.typesLoading && diabetesTypes.value.length === 0 && !homeStore.typesError)
```

**lifePlanStore / punchStore**: 当前粒度已合理 (lifePlanStore: loading + generating; punchStore: listLoading + listLoadingMore + analysisLoading)，保持不变。

#### 3.8.5 G22: retry 方法签名统一

采用**统一无参模式**: `retryXxx(): Promise<void>`。

**lifePlanStore.ts**:

```typescript
// 新增: 缓存最近一次请求参数
const lastCreateReq = ref<PlanGenerateRequest | null>(null)

// createPlan() (原 generate) 中缓存参数
async function createPlan(req: PlanGenerateRequest): Promise<boolean> {
  lastCreateReq.value = req  // 缓存参数
  // ... 原有逻辑
}

// 统一无参 retry
async function retryCreate(): Promise<void> {
  if (!lastCreateReq.value) return
  mutationError.value = null
  await createPlan(lastCreateReq.value)
}

// 类似地处理 retryUpdate (原 retryAdjust)
```

**LifePlan.vue 调用点更新**:
- 重试按钮 `@click="store.retryGenerate(someReq)"` -> `@click="store.retryCreate()"` (如存在)

**边界**: `lastCreateReq` 仅缓存最近一次 `createPlan` 调用的参数，不持久化 — 页面刷新后丢失，与 form 数据生命周期一致。

#### G8 边界条件

| 条件 | 处理 |
|------|------|
| G18 pageInstanceId | `let pageInstanceId = 0` 在 store 函数体内 (Pinia setup语法)，非模块顶层。store 实例不销毁，pageInstanceId 持续递增 |
| G19 重命名遗漏 | 全文搜索 `\.generate` / `\.adjust` (`grep -r "\.generate\|\.adjust" src/`)，确保无遗漏调用点 (注意排除 `PlanGenerateRequest` 类型名) |
| G20 error 合并 | `mutationError` 在 `createPlan` 开始时清空，失败时填充；`updatePlan` 同理。两者共享同一 error ref |
| G21 loading 拆分 | `loading` computed 自动聚合三个独立 loading — 首屏行为不变。重试场景 `retryDoctors` 仅设置 `doctorsLoading=true` |
| G22 lastCreateReq | 不持久化，页面刷新后丢失 |

#### G8 验收标准

- [ ] AC-1: 快速切换 Home 页面 -> 旧请求响应不污染新页面的 Store 状态
- [ ] AC-2: 快速重复点击"生成方案" — 仅最后一次请求的响应用于更新状态
- [ ] AC-3: `createPlan`/`updatePlan` 后 LifePlan.vue 所有调用点正常工作
- [ ] AC-4: 生成/调整失败时 `mutationError` 正确设置，错误提示正常展示
- [ ] AC-5: Home 页面三个区块可独立展示 loading (重试单个区块不影响其他区块)
- [ ] AC-6: 所有 `retry*` 方法为无参调用
- [ ] AC-7: `npx vue-tsc --noEmit` 无新增错误

---

## 4. 文件修改清单

| 文件 | G1 | G2 | G3 | G4 | G5 | G6 | G7 | G8 | 操作 | 净增行 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|------|:-----:|
| `docs/2_detailed_design_v3.md` | ++ | | | | | | | | 4处章节修改 | ~30 |
| `src/styles/animations.css` | | ++ | | | | | | | **新建** | ~20 |
| `src/main.ts` | | + | | | | | | | 1行import | +1 |
| `src/views/Home.vue` | | - | | + | | | | + | CSS删+接口import+注释+loading适配 | ~10 |
| `src/views/LifePlan.vue` | | - | + | | | | | + | CSS删+按钮文案+校验函数+action命名+error适配 | ~15 |
| `src/views/Punch.vue` | | - | | | ++ | | | | CSS删+scroll+提示+typeFilter+返回+filter路径 | ~25 |
| `src/stores/punchStore.ts` | | | | | + | | | | filter reactive->ref + setFilter重写 | ~5 |
| `src/stores/homeStore.ts` | | | | + | | | | ++ | 接口export + pageInstanceId + loading拆分 | ~25 |
| `src/stores/lifePlanStore.ts` | | | | | | | | ++ | requestId + 命名 + error合并 + retry签名 | ~30 |
| `src/stores/riskFormStore.ts` | | | | | | + | | | 类型守卫常量+循环改造 | ~20 |
| `src/types/api.ts` | | | | | | | + | | 死代码删除+注释 | ~-10 |
| `src/utils/enumLabels.ts` | | | | | | | + | | as const satisfies | ~2 |
| **合计** | ~30 | ~20 | ~15 | ~10 | ~30 | ~20 | ~-8 | ~55 | -- | **~172行净增** |

**文件修改协调说明**:

| 共享文件 | 修改组 | 区域 | 建议顺序 |
|---------|--------|------|---------|
| `Home.vue` | G2/G4/G8 | G2: style / G4: template+script / G8: script+template | G2 -> G4 -> G8 |
| `LifePlan.vue` | G2/G3/G8 | G2: style / G3: template+script / G8: script+template | G2 -> G3 -> G8 |
| `Punch.vue` | G2/G5 | G2: style / G5: template+script | G2 -> G5 |
| `homeStore.ts` | G4/G8 | G4: export关键字(1行) / G8: pageInstanceId+loading拆分 | G4 -> G8 (或同一开发者) |
| `lifePlanStore.ts` | G8 only | 单组4维度一站式重构 | G18 -> G19 -> G20 -> G22 |

---

## 5. 依赖图与执行顺序

### 5.1 硬依赖

```
G27 (punchStore filter ref) ──> G17 (typeFilter computed)
```

G27 完成后 `store.filter` 为 ref，G17 的 `computed` getter 中 `store.filter.punch_type` 才能正确访问。

### 5.2 建议依赖

```
G9 (接口合并) ──> G23 (api.ts 死代码删除)
G2 (全局CSS)  ──> G3/G4/G5 (三组件scoped清理后稳定)
G27           ──> G13/G15/G29 (避免filter访问路径回修)
```

### 5.3 推荐执行顺序

**单人串行**:
```
G1 (设计文档, ~2h)
  -> G2 (全局CSS, 1-2h)
  -> G7 (类型清理, 0.6-1h)
  -> G6 (Store安全, 0.3-0.5h)
  -> G3 (LifePlan修复, 1-2.5h)
  -> G4 (Home修复, 0.9-1.5h)
  -> G5 (Punch修复: G27 -> G13+G15+G17+G29, 1.7-3h)
  -> G8 (Store一致性, 可选, 2.7-5h)
```

**二人并行**:
```
开发者 A: G1 -> G2 -> G7 -> G6 -> G5 (关键路径, 5.6-9h)
开发者 B: G3 -> G4 (LifePlan+Home独立修复, 1.9-4h)
  -> 完成后协助 G5 或转入 G8
```

**三人并行**:
```
开发者 A: G1 -> G2 -> G7 -> G6 -> G5 (关键路径)
开发者 B: G3 -> G4 -> 完成后协助 G5/G8
开发者 C: G8 (Store一致性, 独立于A/B，但需注意: G8中 homeStore 修改与 G4 的 G9 有共享文件 homeStore.ts)
```

---

## 6. 风险与缓解

### 6.1 punchStore filter reactive->ref 模板引用路径

**风险**: Pinia store 返回的 `ref` 在 Vue 模板中的自动解包行为理论上有效，但未经实际验证。
**概率**: 中 | **影响**: 中
**缓解**: G27 完成后立即启动应用验证筛选功能 (日期选择 -> 日期筛选 -> 类型筛选)，确认 filter 值读取和写回正确后再继续 G13/G15/G17。经代码审查，`Punch.vue` 的 `<script setup>` 中无直接访问 `store.filter.xxx` 的代码，变更影响面仅限 `punchStore.ts` 内部。

### 6.2 G5 与 G2 的 Punch.vue 共享修改

**风险**: G2 删除 scoped `.press` 定义，G5 修改 template+script。不同区域 (style vs template+script)，但并行开发时 git 合并可能出现上下文重叠。
**概率**: 低 | **影响**: 低
**缓解**: G2 先于 G5 执行，或由同一开发者顺序完成。

### 6.3 G8 lifePlanStore.ts 4维度并发修改

**风险**: lifePlanStore.ts 被 G18 (requestId快照)、G19 (重命名)、G20 (合并error)、G22 (统一retry签名) 四个维度同时修改。符号重命名会影响其他维度的代码引用。
**概率**: 中 | **影响**: 中
**缓解**: G8 的 lifePlanStore.ts 修改由同一开发者在一次重构中一站式完成，顺序 G18 -> G19 -> G20 -> G22 (先加保护机制，再做命名/接口重构，最后统一 retry 签名)。

### 6.4 G14-phase2 切换时机不确定

**风险**: 若 G14 在 v5 执行期间从 Phase 1 (console.warn) 切换至 Phase 2 (Promise.reject)，可能引入新的错误提示 UX。
**概率**: 低 | **影响**: 低
**缓解**: v5 开始前明确 G14 当前阶段。若 v5 期间切换，完成后增加全页面冒烟验证 (Home/LifePlan/Punch 错误态 UI)。

### 6.5 G8 工时膨胀

**风险**: G8 (Store一致性) 预估 2.7-5h 可能膨胀，挤压 G1-G7 核心交付时间。
**概率**: 中 | **影响**: 中
**缓解**: v5 执行开始时就 G8 的纳入做出明确决策 (纳入 or 推迟至 v6)，避免执行途中犹豫。

---

## 7. 验证策略

### 7.1 编译验证

每任务组完成后执行:
```bash
npx vue-tsc --noEmit
```

确保无新增编译错误。特别关注:
- G23 (删除 api.ts 类型): 确认无外部引用导致的 "Cannot find name" 错误
- G9 (接口合并): 确认 `import type { DiabetesTypeView }` 无 "not exported" 错误
- G19 (重命名): 确认无 "not a function" 错误 (遗漏的调用点)

### 7.2 功能冒烟

| 页面 | 验证场景 | 关联任务组 |
|------|---------|:--------:|
| Home | 入场动画 (淡入+上滑)、糖尿病类型"全部"静态、搜索Toast | G2,G4 |
| Home | 接口合并后三区块正常加载 | G4 |
| LifePlan | 入场动画 (纯淡入)、空态按钮文案、校验拦截空输入 | G2,G3 |
| LifePlan | 按钮按下态 scale(0.96) | G2 |
| Punch | 入场动画 (淡入，此前不生效) | G2 |
| Punch | 日期筛选+类型筛选+loadMore+返回路径 | G5 |
| Punch | typeFilter双向绑定 (chip与store同步) | G5 |
| riskForm | sessionStorage脏数据恢复时类型校验生效 | G6 |

### 7.3 回归检查

- Home/LifePlan/Punch 三页面的 loading/error/empty 三态不变
- 所有路由导航不变 (G29 返回路径从 `router.back()` -> `router.push('/profile')` 可能改变 LifePlan->Punch 返回行为)
- CSS变量引用正常 (全局样式不依赖 `var(--*)`)
- `enumLabel()` 所有调用点正常返回中文映射

---

## 8. 横切关注点

### 8.1 CSS 全局样式文件位置

`src/styles/` 目录当前不存在 (仅有 `src/assets/variables.css`)。G2 新建 `src/styles/animations.css` 作为全局动画样式文件。此文件与 `variables.css` 分离 (变量 vs 动画)，职责清晰。

### 8.2 Pinia ref 解包行为

Pinia store 中的 `ref` 在 Vue 模板中自动解包 `.value`，这是 Pinia 的核心特性之一。G27 将 punchStore.filter 从 reactive 改为 ref 后，Punch.vue 模板中 `store.filter.startDate` 等访问方式保持不变。此行为需在 G27 完成后立即启动应用验证。

### 8.3 `as const satisfies` TypeScript 兼容性

`as const` 需要 TS 3.4+，`satisfies` 需要 TS 4.9+。项目使用 TS 5.x，完全兼容。`as const` 后 `LABELS` 深度只读，但 `enumLabel` 函数仅读取不写入，无影响。

### 8.4 `Number.isFinite()` vs `== null`

`Number.isFinite()` 对 `null`、`undefined`、`''`、`NaN` 均返回 `false`，比 `== null` 的宽松判等更安全。G11 的两个影响点:
- 输入框清空后 `v-model.number` 可能产生空字符串而非 `null`
- `Number.isFinite(0)` 返回 `true`，但 0 被后续 `age < 1` 拒绝

### 8.5 G14-phase2 切换状态 (v5 开始前确认)

| 阶段 | 状态 | 说明 |
|------|------|------|
| Phase 1 (当前) | `console.warn` 日志收集 | G14 响应拦截器使用 `console.warn` 记录 `success: false` |
| Phase 2 (待切换) | `Promise.reject` 错误抛出 | 将 `console.warn` 替换为 `Promise.reject(err)` |

v5 不直接依赖 G14 的当前阶段，但需在 v5 开始前确认状态以确保全页面错误态UI行为可预测。

---

*详细设计文档结束。实施时以本文档为技术基准，以 `task_v5.md` 的验收标准为质量门禁。*
