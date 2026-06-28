# 第2轮代码变更报告 v2

> **执行日期**: 2026-06-27
> **执行顺序**: G14 -> S6 -> S4+S11 -> S8
> **类型检查**: `vue-tsc --noEmit` 通过（0 errors）

---

## 变更总览

| 文件 | 任务 | 变更行数 | 操作类型 |
|------|:---:|:------:|---------|
| `src/composables/useApi.ts` | G14 | +16 / -1 | 响应拦截器增加 success:false 检查 |
| `src/views/Home.vue` | S6 | +3 / -3 | 文章点击跳转修正 |
| `src/views/LifePlan.vue` | S4+S11 | +38 / -3 | 跨模块数据读取 + query 参数消费 |
| `src/stores/authStore.ts` | S8 | +53 / -14 | localStorage->sessionStorage 迁移 + BC + 联动清理 |
| **合计** | | **+110 / -21** | |

---

## Task 1: G14 -- useApi.ts 响应拦截器 success:false 检查

**文件**: `src/composables/useApi.ts` (第19-38行)

**变更内容**: 在 `api.interceptors.response.use()` 的 success 回调中增加 `success: false` 检测逻辑。

**修改前**:
```typescript
api.interceptors.response.use(
  (res) => res,
  (err) => { /* 401 处理 */ return Promise.reject(err) }
)
```

**修改后**: success 回调展开，先检查 `res.data.success === false`：
- `console.warn` 记录日志（含 url/method/status/message）
- 构造 Error 对象，附加 `response: { data: { message } }` 属性
- `Promise.reject(err)` 确保调用方 catch 块捕获

**标注 A 处理**: Phase 1 同时实施 `console.warn` + `Promise.reject`（与设计文档 detail_v2.md 1.3 节一致）。若上线后合法空态被误拦截，回退方案为在拦截器中增加白名单逻辑（特定 API + 特定 message 组合不 reject），而非整体回退 G14。

**边界安全**:
- `res.data &&` 短路：res.data 为 null 时跳过检查
- `typeof res.data.success === 'boolean'`：旧版 API 无 success 字段时跳过
- 构造的 Error 兼容 `getErrorMessage()` 的 `err.response?.data?.message` 提取路径
- HTTP 409/401 走 axios error 分支，不受影响

---

## Task 2: S6 -- Home.vue 文章点击跳转修正

**文件**: `src/views/Home.vue` (第80-83行)

**变更内容**:
1. 参数名 `_id` -> `id`（移除下划线前缀，参数现已使用）
2. 旧注释移除（"文章详情页不在本任务"已过时，S5a 已完成）
3. `router.push('/news')` -> `router.push({ path: '/news/article/' + id })`
4. 新增防御性守卫 `if (!id) return`

**前置依赖**: S5a (ArticleDetailView.vue + `/news/article/:id` 路由) -- v1 已完成，确认有效。

---

## Task 3+4: S4+S11 -- LifePlan.vue 跨模块数据读取

**文件**: `src/views/LifePlan.vue` (多处)

**新增状态变量** (第93-123行):
- `riskResultHint` (reactive): 持有 result 派生的 riskLevel / riskScore / diabetesType
- `diabetesTypeHint` (computed): 从 `route.query.diabetesType` 读取
- `displayDiabetesType` (computed): 合并优先级 result > query
- `displayRiskLevel` (computed): 合并优先级 result > query
- `showPersonalizedHint` (computed): 控制提示条可见性

**修改 onMounted** (第329-339行): 在 `prefillFromRiskForm()` 之后读取 `riskForm.result`，填充 `riskResultHint`。

**修改模板提示条** (第365-371行): 原单一 `riskLevelHint` 展示替换为合并提示条，同时展示糖尿病类型和风险等级，复用 `enumLabel()` 映射中文。

**数据流**: riskForm.result (sessionStorage) > route.query 参数 > 不展示
- 直接访问 `/life-plan` 无数据时 `showPersonalizedHint` = false，提示条不渲染
- `matched_diabetes_type` 为空时回退到 query 参数

**标注 B 验证**: `riskForm.loadFromStorage()` 已在 `prefillFromRiskForm()` (第76行) 中调用，`isValidResult` 校验内置在 `loadFromStorage()` 中（riskFormStore.ts:62-66），不通过的 result 被置为 null。

---

## Task 5: S8 -- Token 从 localStorage 迁移至 sessionStorage

**文件**: `src/stores/authStore.ts` (全文)

### 5.1 新增 import (第5-6行)

```typescript
import { useHomeStore } from '@/stores/homeStore'
import { useLifePlanStore } from '@/stores/lifePlanStore'
```

用于 TypeScript 类型推导，实际 Store 实例在 `clearAuth()` 运行时通过 `useXxxStore()` 动态获取，避免模块顶层循环依赖。

### 5.2 BroadcastChannel 实现 (第14-37行)

- 懒初始化: `getBcChannel()` 首次调用时创建 `BroadcastChannel('qrzl_auth_sync')`
- `onmessage`: 收到 `AUTH_CHANGED` 消息时同步调用 `setAuth()` 或 `clearAuth()`
- 浏览器不支持时静默降级为 null

### 5.3 迁移清单 (16处 localStorage -> sessionStorage)

| 键 | 函数/位置 | 状态 |
|----|----------|:--:|
| token | ref 初始化 (12->39) | 已迁移 |
| role | ref 初始化 (13->40) | 已迁移 |
| user | ref 初始化 (17->44) | 已迁移 |
| token | setToken (32->59) | 已迁移 + BC |
| token | setAuth (39->73) | 已迁移 + BC |
| role | setAuth (40->74) | 已迁移 + BC |
| user | setAuth (41->75) | 已迁移 + BC |
| token | syncFromStorage (45->86) | 已迁移 |
| role | syncFromStorage (46->87) | 已迁移 |
| user | syncFromStorage (49->90) | 已迁移 |
| token | clearAuth (70->111) | 已迁移 |
| role | clearAuth (71->112) | 已迁移 |
| user | clearAuth (72->113) | 已迁移 |
| user | fetchProfile (100->155) | 已迁移 |
| role | fetchProfile (101->156) | 已迁移 |
| user | setProfile (108->163) | 已迁移 |

**保留在 localStorage 的 5 处** (must_change_password):
- ref 初始化 (25->52)
- syncFromStorage (62->103)
- clearAuth (73->114)
- login (83->138)
- clearMustChangePassword (113->168)

### 5.4 clearAuth 联动清理 (第116-119行)

```typescript
try { useHomeStore().clearHomeCache() } catch { /* Store 未初始化时静默 */ }
try { useLifePlanStore().clearPlanCache() } catch { /* Store 未初始化时静默 */ }
```

- 通过 `useXxxStore()` 动态获取实例，避免模块顶层 import 导致 Pinia 循环依赖
- try-catch 提供防御性保护

### 5.5 clearAuth BC 广播 (第122-128行)

登出时广播 `token: null`，通知其他标签页同步清除认证状态。

### 5.6 标注 C 确认

`clearMustChangePassword()` 中 `localStorage.removeItem('must_change_password')` 当前位于第168行（修改前第113行）。标注 C 指出的"第113行"偏差是修改前行号，修改后位置略有偏移，按函数名搜索即可定位，不影响编码。

---

## 验证结果

- `vue-tsc --noEmit`: 通过，0 errors
- `src/stores/authStore.ts`: `localStorage` 对 token/role/user 的引用已清零（`grep` 验证通过）
- `src/stores/authStore.ts`: `must_change_password` 的 5 处 `localStorage` 引用全部保留（`grep` 验证通过）

---

*代码变更报告结束。*
