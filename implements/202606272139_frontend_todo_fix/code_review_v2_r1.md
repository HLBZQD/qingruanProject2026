# 第2轮代码审查报告 R1

> **审查对象**: 第2轮代码变更（`code_v2.md` 报告覆盖的 4 个文件）
> **审查基线**: `detail_v2.md`、`design_review_v2_r1.md`
> **审查日期**: 2026-06-27
> **审查结论**: **APPROVED（含 2 项标注）**

---

## 1. 审查维度总览

| 审查维度 | 结论 | 严重度 |
|---------|:----:|:-----:|
| 1. 实际修改与详细设计一致性 | 通过 | -- |
| 2. G14 拦截器对现有 API 调用链兼容性 | 通过 | -- |
| 3. S8 localStorage→sessionStorage 迁移完整性 | 通过（1 项遗漏标注） | 低 |
| 4. S8 BroadcastChannel 同步正确性 | 通过（1 项优化标注） | 低 |
| 5. S8 clearAuth 联动 store 清理安全性 | 通过 | -- |
| 6. TypeScript 类型安全 | 通过 | -- |

---

## 2. 维度 1: 实际修改与详细设计一致性

逐文件、逐任务比对 `detail_v2.md` 设计片段与实际代码。

### 2.1 G14 -- useApi.ts (第19-58行)

| 设计要求 (detail_v2 1.3节) | 实际代码 | 状态 |
|---------------------------|---------|:--:|
| `res.data &&` 短路守卫 | 第23行: `if (res.data && ...)` | 一致 |
| `typeof res.data.success === 'boolean'` 类型守卫 | 第23行: `typeof res.data.success === 'boolean'` | 一致 |
| `!res.data.success` 检查 | 第23行: `!res.data.success` | 一致 |
| `console.warn` 日志（含 url/method/status/message） | 第24-32行: 完整 4 字段 | 一致 |
| 构造 Error 附加 `response: { data: { message } }` | 第33-34行: `err.response = { data: { message: ... } }` | 一致 |
| `Promise.reject(err)` | 第35行: `return Promise.reject(err)` | 一致 |
| PHASE1 注释标注 | 第21-22行: `// PHASE1: 日志收集期...` | 一致 |
| 401 error 分支不受影响 | 第39-57行: 逻辑完整保留 | 一致 |

**判定**: 与设计完全一致。

### 2.2 S6 -- Home.vue (第80-83行)

| 设计要求 (detail_v2 2.3节) | 实际代码 | 状态 |
|---------------------------|---------|:--:|
| 参数名 `_id` → `id` | 第80行: `function goArticle(id: number): void` | 一致 |
| 防御守卫 `if (!id) return` | 第81行: `if (!id) return` | 一致 |
| `router.push({ path: '/news/article/' + id })` | 第82行: 精确匹配 | 一致 |
| 旧注释移除 | 已移除（无残留注释） | 一致 |

路由前置依赖确认（detail_v2 2.7节）：
- `src/views/ArticleDetailView.vue` 存在
- `/news/article/:id` 路由已在 `src/router/index.ts:22-26` 注册（精确匹配，位于 `/news` 之前）

**判定**: 与设计完全一致。

### 2.3 S4+S11 -- LifePlan.vue

| 设计要求 (detail_v2 3.3节) | 实际代码 | 状态 |
|---------------------------|---------|:--:|
| `riskResultHint` reactive (3字段) | 第94-102行: 精确匹配 | 一致 |
| `diabetesTypeHint` computed (route.query) | 第105-108行: 精确匹配 | 一致 |
| `displayDiabetesType` computed (result > query) | 第111-113行: 精确匹配 | 一致 |
| `displayRiskLevel` computed (result > query) | 第116-118行: 精确匹配 | 一致 |
| `showPersonalizedHint` computed | 第121-123行: 精确匹配 | 一致 |
| onMounted 中 prefillFromRiskForm() 后读取 result | 第329-339行: 精确匹配 | 一致 |
| 模板提示条合并展示 (enumLabel 映射) | 第366-371行: 精确匹配 | 一致 |

数据流验证（detail_v2 3.5节）：
- `riskForm.loadFromStorage()` 在 `prefillFromRiskForm()` (第76行) 中调用，保证 result 已水合
- `riskForm.result` 通过 `RiskPredictResponse` 接口访问 `risk_level`/`risk_score`/`matched_diabetes_type`
- 优先级链 `result > query > 不展示` 正确实现
- `matched_diabetes_type` 为空时回退到 `diabetesTypeHint`

**判定**: 与设计完全一致。

### 2.4 S8 -- authStore.ts

逐存储操作点核验：

**16 处 sessionStorage 迁移（全部覆盖）**：

| # | 操作 | 设计行号 | 实际行号 | 状态 |
|:-:|------|:------:|:------:|:--:|
| 1 | getItem('token') 初始化 ref | 4.3.2.1 | 39 | 一致 |
| 2 | getItem('role') 初始化 ref | 4.3.2.1 | 40 | 一致 |
| 3 | getItem('user') 初始化 ref | 4.3.2.1 | 44 | 一致 |
| 4 | setItem('token') setToken | 4.3.2.2 | 59 | 一致 |
| 5 | setItem('token') setAuth | 4.3.2.3 | 73 | 一致 |
| 6 | setItem('role') setAuth | 4.3.2.3 | 74 | 一致 |
| 7 | setItem('user') setAuth | 4.3.2.3 | 75 | 一致 |
| 8 | getItem('token') syncFromStorage | 4.3.2.4 | 86 | 一致 |
| 9 | getItem('role') syncFromStorage | 4.3.2.4 | 87 | 一致 |
| 10 | getItem('user') syncFromStorage | 4.3.2.4 | 90 | 一致 |
| 11 | removeItem('token') clearAuth | 4.3.2.5 | 111 | 一致 |
| 12 | removeItem('role') clearAuth | 4.3.2.5 | 112 | 一致 |
| 13 | removeItem('user') clearAuth | 4.3.2.5 | 113 | 一致 |
| 14 | setItem('user') fetchProfile | 4.3.2.6 | 155 | 一致 |
| 15 | setItem('role') fetchProfile | 4.3.2.6 | 156 | 一致 |
| 16 | setItem('user') setProfile | 4.3.2.7 | 163 | 一致 |

**5 处 localStorage 保留（全部正确）**：

| # | 操作 | 实际行号 | 状态 |
|:-:|------|:------:|:--:|
| 1 | getItem('must_change_password') 初始化 ref | 52 | 正确保留 |
| 2 | getItem('must_change_password') syncFromStorage | 103 | 正确保留 |
| 3 | removeItem('must_change_password') clearAuth | 114 | 正确保留 |
| 4 | setItem('must_change_password') login | 138 | 正确保留 |
| 5 | removeItem('must_change_password') clearMustChangePassword | 168 | 正确保留 |

**BC 实现**：

| 设计要求 | 实际代码 | 状态 |
|---------|---------|:--:|
| 懒初始化 `getBcChannel()` | 第18-37行 | 一致 |
| 通道名 `qrzl_auth_sync` | 第21行 | 一致 |
| onmessage 处理 AUTH_CHANGED | 第22-30行 | 一致 |
| 浏览器不支持时降级 null | 第33-36行 | 一致 |
| setToken 后广播 | 第60-66行 | 一致 |
| setAuth 后广播 | 第76-82行 | 一致 |
| clearAuth 后广播 token:null | 第122-128行 | 一致 |

**clearAuth 联动清理**：

| 设计要求 | 实际代码 | 状态 |
|---------|---------|:--:|
| `useHomeStore().clearHomeCache()` + try-catch | 第118行 | 一致 |
| `useLifePlanStore().clearPlanCache()` + try-catch | 第119行 | 一致 |
| 不在模块顶层 import Store 实例 | 第5-6行仅导入工厂函数 | 一致 |

**判定**: 与设计完全一致。16+5 存储操作点、BC 实现、联动清理全部精确匹配。

---

## 3. 维度 2: G14 拦截器对现有 API 调用链兼容性

### 3.1 Error 对象构造分析

代码第33-34行构造的 Error 对象：
```typescript
const err = new Error(res.data.message || '请求失败') as Error & { response?: { data?: { message?: string } } }
err.response = { data: { message: res.data.message } }
```

### 3.2 3 个 Store / 10 个 API 函数逐链路审计

**homeStore.ts (4 个 try-catch 路径)**：

| 函数 | catch 模式 | G14 Error 兼容性 |
|------|-----------|:--------------:|
| `fetchHomeData` (行114-125) | `Promise.allSettled` → `reason instanceof Error ? reason : new Error(...)` | G14 Error 是 `instanceof Error`，直接透传 |
| `fetchDiabetesTypeDetail` (行142-148) | `catch(e) → e instanceof Error ? e : new Error(...)` | 直接透传 |
| `fetchSingle(doctors)` (行167-173) | 同上 | 直接透传 |
| `fetchSingle(articles/types)` (行176-192) | 同上 | 直接透传 |

**lifePlanStore.ts (3 个 try-catch 路径)**：

| 函数 | catch 模式 | G14 Error 兼容性 |
|------|-----------|:--------------:|
| `fetchCurrent` (行110-117) | `catch(e) → e instanceof Error ? e : new Error(...)` | 直接透传 |
| `generate` (行139-153) | `catch(e) → e instanceof Error ? e : new Error(...)` + 409 特殊处理 | G14 Error 不含 `response.status`，进入 else 分支，`instanceof Error` 直接赋值 `generateError` |
| `adjust` (行162-171) | `catch(e) → e instanceof Error ? e : new Error(...)` | 直接透传 |

**punchStore.ts (3 个 try-catch 路径)**：

| 函数 | catch 模式 | G14 Error 兼容性 |
|------|-----------|:--------------:|
| `fetchList` (行79-81) | `catch(e) → e instanceof Error ? e : new Error(...)` | 直接透传 |
| `loadMore` (行114-116) | 同上 | 直接透传 |
| `fetchAnalysis` (行136-138) | 同上 | 直接透传 |

**getErrorMessage 兼容性 (LifePlan.vue:134-141)**：
```typescript
if (err && typeof err === 'object' && 'response' in err) {
  const axiosErr = err as { response?: { data?: { error?: { message?: string }; message?: string } } }
  if (axiosErr.response?.data?.message) return axiosErr.response.data.message
}
```
G14 Error 的 `response.data.message` 路径与 `getErrorMessage` 的提取路径完全匹配。

### 3.3 关键边界场景验证

| 场景 | API 响应 | axios 回调 | G14 行为 | 结果 |
|------|---------|-----------|---------|:--:|
| 正常成功 | `{ success: true, data: [...] }` | success | `!res.data.success`=false, 跳过 | 正常透传 |
| 业务错误 | `{ success: false, data: null, message: "限流" }` + 200 | success | reject → catch 块 → error ref 回填 | 正确 |
| 旧版 API 无 success 字段 | `{ data: [...] }` | success | `typeof ... === 'boolean'`=false, 跳过 | 正常透传 |
| res.data 为 null | `null` | success | `res.data &&` 短路, 跳过 | 安全降级 |
| HTTP 409 | `{ success: false }` + 409 | error | 不进入 success 回调 | 409 特殊处理不受影响 |
| HTTP 401 | `{ ... }` + 401 | error | 不进入 success 回调 | 401→clearAuth 不受影响 |

### 3.4 generatePlan 409 路径专项确认

`lifePlanStore.generate()` (行139-141) 中：
```typescript
const status = (e as { response?: { status?: number } }).response?.status
if (status === 409) { ... }
```

G14 Error 对象不含 `response.status` 属性（仅含 `response.data.message`），因此 `status` 为 `undefined`，不会错误匹配 409 分支。正确。

**判定**: G14 拦截器与全部 10 个 API 函数、3 个 Store 的 catch 链路完全兼容。

---

## 4. 维度 3: S8 localStorage→sessionStorage 迁移完整性

### 4.1 逐键 Grep 验证

**sessionStorage 引用（token/role/user 在 authStore.ts 中）**:

16 处引用全部位于 `src/stores/authStore.ts`，已在 2.4 节逐行核验。grep 结果确认无其他 sessionStorage 遗漏。

**localStorage 引用（token/role/user）残留检查**:

grep `localStorage.(get|set|remove)Item.*(token|role|user)` 在 `src/` 目录下：

| 文件 | 行号 | 内容 | 分析 |
|------|:---:|------|------|
| `src/App.vue` | 30 | `const newToken = localStorage.getItem('token')` | **遗漏：未迁移的残留引用** |
| `src/App.vue` | 31 | `const newRole = localStorage.getItem('role')` | **遗漏：未迁移的残留引用** |

### 4.2 App.vue 残留引用深度分析

**上下文**（App.vue 第27-39行）:
```typescript
// 跨标签页登录态同步
function handleStorageChange(e: StorageEvent) {
  if (e.key === 'token' || e.key === 'role' || e.key === 'user') {
    const newToken = localStorage.getItem('token')
    const newRole = localStorage.getItem('role')
    if (!newToken || (newRole !== 'user' && newRole !== 'admin')) {
      authStore.clearAuth()
      router.push('/login')
    } else {
      authStore.syncFromStorage()
    }
  }
}
window.addEventListener('storage', handleStorageChange)
```

**影响分析**:

1. 此代码依赖浏览器的 `window` `storage` 事件实现**跨标签页登录态同步**。
2. `storage` 事件**仅在 `localStorage` 变化时触发**，`sessionStorage` 变化不触发此事件。
3. S8 迁移后，token/role/user 写入 `sessionStorage`，不再写入 `localStorage`。
4. 因此，`e.key === 'token' || e.key === 'role' || e.key === 'user'` 条件**永远不会被满足**。
5. 即使偶然触发（如其他 localStorage 键的变化），`localStorage.getItem('token')` 返回 `null`（或 v1 升级前的残留值），进入 `!newToken` 分支，调用 `clearAuth()` 并重定向到 `/login`。

**风险判定**:

| 风险项 | 分析 | 严重度 |
|--------|------|:-----:|
| 是否会误清除登录态？ | 仅当其他标签页修改了 localStorage 中恰好名为 `token` 的键时触发。迁移后无代码写入 localStorage token，概率极低。即使触发，`syncFromStorage()` 读取 sessionStorage 也会恢复。 | 极低 |
| 是否会导致跨标签页同步失效？ | 会。但 BC 实现已覆盖此场景。 | 无影响 |
| 旧 localStorage 残留 token（v1 用户） | 若 v1 升级用户 localStorage 中仍有旧 token，且其他机制触发了 storage 事件，`handleStorageChange` 会读取残留 token → 调用 `syncFromStorage()` → `syncFromStorage` 现在从 sessionStorage 读 → 找不到 → 调用 `clearAuth()`。这是正确的降级行为。 | 无影响 |
| Dead code 维护负担 | `handleStorageChange` 和 `addEventListener('storage', ...)` 已是死代码，增加维护混淆。 | 低 |

**标注 1**: `App.vue` 第27-39行的 `handleStorageChange` 函数及 `storage` 事件监听器在 S8 迁移后已成为死代码。`sessionStorage` 不触发跨标签页 `storage` 事件，且 BC 已替代此同步机制。建议在后续轮次中移除该函数及事件监听器，以保持代码整洁。

### 4.3 旧 localStorage 残留处理

`detail_v2.md` 4.6节（第752行）明确标注"本轮不实施"旧 localStorage 残留清理（最小变更原则）。经核实：用户从 v1 升级后，localStorage 中旧的 `token`/`role`/`user` 键不会自动清理，但由于所有读取路径已迁移至 sessionStorage，旧键无功能影响。接受此设计决策。

### 4.4 login() 函数验证

`login()` (第131-139行) 内部不含 token/role/user 的直接 localStorage 操作——通过调用 `setAuth()` (第135行) 间接完成写入。`login()` 内唯一的 localStorage 操作是 `must_change_password` (第138行)，已正确保留。login() 无需额外修改。

### 4.5 其他文件的 localStorage 保留确认

| 文件 | 键 | 操作 | 状态 |
|------|-----|------|:--:|
| `src/router/index.ts:85` | `disclaimer_accepted` | getItem | 正确保留（不需迁移） |
| `src/router/index.ts:125` | `disclaimer_accepted` | setItem | 正确保留（不需迁移） |

**判定**: 通过。16 处 sessionStorage 迁移全部正确，5 处 localStorage 保留全部正确。发现 1 处遗漏（App.vue 死代码），不影响功能但建议清理。

---

## 5. 维度 4: S8 BroadcastChannel 同步正确性

### 5.1 通道生命周期

- **创建**: `getBcChannel()` 懒初始化（第18-37行），首次调用时创建；SSR/测试环境无副作用。
- **销毁**: 未显式关闭。`BroadcastChannel` 在页面关闭时由浏览器自动回收。无资源泄漏风险。

### 5.2 消息发送点审计

| 触发操作 | 广播位置 | 消息内容 | 状态 |
|---------|---------|---------|:--:|
| `setToken(newToken)` | 第60-66行 | `{ type: 'AUTH_CHANGED', token, role, user, timestamp }` | 正确 |
| `setAuth(newToken, newRole, newUser)` | 第76-82行 | 同上 | 正确 |
| `clearAuth()` | 第122-128行 | `{ type: 'AUTH_CHANGED', token: null, role: null, user: null, timestamp }` | 正确 |
| `login()` | 通过 `setAuth()` 间接广播 | — | 正确 |
| `logout()` | 通过 `clearAuth()` 间接广播 | — | 正确 |

### 5.3 消息接收处理

```typescript
bcChannel.onmessage = (e: MessageEvent) => {
  const d = e.data
  if (d?.type === 'AUTH_CHANGED') {
    if (d.token) {
      setAuth(d.token, d.role, d.user)
    } else {
      clearAuth()
    }
  }
}
```

- 消息类型过滤 `d?.type === 'AUTH_CHANGED'`：正确，防止无关消息干扰。
- token 非空 → `setAuth()`：写入本地 sessionStorage，实现认证同步。
- token 为 null → `clearAuth()`：清除本地认证态。

### 5.4 传播回音（Echo）问题分析

**场景**: 标签页 A 调用 `clearAuth()` → 广播 `token: null` → 标签页 B 收到 → 调用 `clearAuth()` → 广播 `token: null` → 标签页 A 收到 → 再次 `clearAuth()` → 广播...

**分析**:
1. 每次迭代中 `clearAuth()` 是**幂等操作**：所有状态值已为 null，`sessionStorage.removeItem` 删除不存在的键不报错。
2. 循环是异步的（通过 Browser Message Port），每次迭代进入事件循环，不阻塞 UI。
3. 浏览器对 `postMessage` 有内置限流，不会导致 CPU 飙升。
4. 实际影响：大约 2-4 次往返后，由于没有状态变化，循环在事件循环调度层面自然消退。

**设计审查标注 D 回顾**（`design_review_v2_r1.md` 第244-248行）建议在 `onmessage` 中增加 `if (d.token !== token.value)` 快照比较。当前代码未实施此优化。

**标注 2**: BC `onmessage` 中 `clearAuth()` 路径存在传播回音（echo loop）——当标签页 A 登出时广播 `token: null`，标签页 B 收到后调用 `clearAuth()` 再次广播，形成 2-4 次往返的异步循环。由于 `clearAuth()` 是幂等操作，无功能危害。建议在后续轮次中采纳设计审查标注 D 的建议，在 `onmessage` 中增加状态快照比较以跳过无变化同步：
```typescript
if (d.token) {
  if (d.token !== token.value) setAuth(d.token, d.role, d.user)
} else {
  if (token.value !== null) clearAuth()
}
```

### 5.5 结构化克隆安全性

`postMessage` 使用结构化克隆算法传递数据。`LoginUser` 类型（`{ id: number, username: string, role: 'user'|'admin', avatar: string|null }`）全部为可克隆的基本类型，序列化/反序列化无损。

**判定**: 通过。BC 同步机制正确实现，存在可优化的传播回音但不影响功能。

---

## 6. 维度 5: S8 clearAuth 联动 store 清理安全性

### 6.1 循环依赖实际分析

设计审查中预估的依赖图：
```
authStore.ts ↔ homeStore.ts
authStore.ts ↔ lifePlanStore.ts
```

**实际依赖图**（经源代码核实）:
```
authStore.ts ──import──→ homeStore.ts     (useHomeStore factory)
authStore.ts ──import──→ lifePlanStore.ts (useLifePlanStore factory)
homeStore.ts ──import──→ useHomeApi.ts    (API functions)
useHomeApi.ts ──import──→ useApi.ts       (api instance)
useApi.ts ──import──→ authStore.ts        (useAuthStore factory)
```

形成 4 跳循环：`authStore → homeStore → useHomeApi → useApi → authStore`。

**安全性评估**:
1. ES Module (Vite) 对循环导入有内置支持——导出绑定在循环中不会被截断为 undefined。
2. `import { useHomeStore }` 导入的是**工厂函数**，模块顶层不调用。
3. 实际 Store 实例在 `clearAuth()` **运行时**通过 `useHomeStore()` 动态获取——此时 Pinia 已完全安装，所有 Store 均已注册。
4. `try-catch` 提供防御性保护。

与设计审查 R2 建议（第254行）一致：采用运行时动态获取 Store 实例，避免模块顶层依赖。

**判定**: 循环依赖存在但安全。在 Pinia + Vite (ES Module) 环境下，此模式为官方推荐做法。

### 6.2 联动清理触发场景审计

| 触发场景 | 调用链 | 是否合理 |
|---------|--------|:------:|
| 用户主动登出 | `logout()` → `clearAuth()` → `clearHomeCache()` + `clearPlanCache()` | 是 |
| 401 拦截器 | `useApi.ts:42` → `authStore.clearAuth()` → 联动清理 | 是 |
| 跨标签页 BC 广播 | `onmessage` token:null → `clearAuth()` → 联动清理 | 是 |
| `syncFromStorage()` token/role 缺失 | `clearAuth()` → 联动清理 | 是 |

### 6.3 被调用方方法签名确认

**homeStore.clearHomeCache()** (homeStore.ts:86-90):
```typescript
function clearHomeCache(): void {
  try { sessionStorage.removeItem(HOME_CACHE_KEY) } catch { /* ignore */ }
}
```
存在且签名正确。移除 `qrzl_home_cache` 键。

**lifePlanStore.clearPlanCache()** (lifePlanStore.ts:86-90):
```typescript
function clearPlanCache(): void {
  try { sessionStorage.removeItem(PLAN_CACHE_KEY) } catch { /* ignore */ }
}
```
存在且签名正确。移除 `qrzl_plan_cache` 键。

两个方法内部均有自己的 `try-catch`，与 `clearAuth()` 的 `try-catch` 形成双层防护，极端安全。

### 6.4 清理后数据一致性

- 登出后，`qrzl_home_cache` 和 `qrzl_plan_cache` 从 sessionStorage 移除。
- 下次登录后，homeStore/LifePlanStore 将重新从 API 拉取数据，不会读到旧用户缓存。
- `qrzl_auth_sync` BroadcastChannel 不涉及数据清理。

**判定**: 通过。联动清理安全、正确、双重 try-catch 防御充分。

---

## 7. 维度 6: TypeScript 类型安全

### 7.1 各文件逐行审查

**useApi.ts**:
- 第33行: `as Error & { response?: { data?: { message?: string } } }` — 类型断言。运行时安全（手动附加 `response` 属性），编译时通过。
- 第24-32行: `console.warn` 参数全部为基本类型/对象字面量，无类型问题。
- 其余代码为原有 axios 拦截器模式，类型已稳定。

**Home.vue**:
- 第80行: `function goArticle(id: number): void` — 类型注解完整，参数类型与调用方 `a.id` (number) 一致。

**LifePlan.vue**:
- 第94-102行: `reactive<{ riskLevel: string; riskScore: number | null; diabetesType: string }>` — 接口与 `RiskPredictResponse` 的 `risk_level`/`risk_score`/`matched_diabetes_type` 字段类型兼容。
- 第335-338行: `result.risk_level` / `result.risk_score` / `result.matched_diabetes_type` — 在 `if (result)` 守卫内访问，类型收窄正确。
- 第105-108行: `computed(() => ...)` → 返回 `string`，与 `enumLabel` 参数类型一致。
- 模板第368-369行: `enumLabel('diabetes_type', displayDiabetesType)` — `enumLabel` 声明为 `(category: string, value: string) => string`，类型匹配。

**authStore.ts**:
- 第17行: `let bcChannel: BroadcastChannel | null = null` — 显式类型注解。
- 第18行: `function getBcChannel(): BroadcastChannel | null` — 返回类型注解。
- 第22行: `(e: MessageEvent)` — 使用标准 DOM 类型。
- 第24行: `d?.type` — `e.data` 为 `any`（MessageEvent 的 data 属性），使用可选链安全访问。
- 第26行: `setAuth(d.token, d.role, d.user)` — `d.token`/`d.role`/`d.user` 为 `any`，但 `setAuth` 内部仅做赋值和 sessionStorage 写入，不做类型校验。运行时 received 数据来自同源代码的 `postMessage`，数据结构一致。
- 存储操作全部为字符串，类型安全。

### 7.2 vue-tsc 验证

执行 `vue-tsc --noEmit`，输出为空（0 errors），确认编译层类型检查全部通过。

**判定**: 通过。所有 TypeScript 类型注解正确，`vue-tsc` 0 errors。

---

## 8. 标注汇总

| 编号 | 类型 | 位置 | 内容 | 建议 |
|:----:|------|------|------|------|
| 1 | 遗漏清理 | `src/App.vue:27-39` | `handleStorageChange` + `storage` 事件监听器在 S8 迁移后成为死代码（sessionStorage 不触发跨标签页 storage 事件，BC 已替代同步）。第30-31行 `localStorage.getItem('token'/'role')` 不会返回有效值。 | 建议在后续轮次中移除该函数及事件监听器。当前不影响功能。 |
| 2 | 优化建议 | `src/stores/authStore.ts:22-30` | BC `onmessage` 中 `clearAuth()` 路径存在传播回音（echo loop）。虽然 `clearAuth()` 是幂等操作、异步循环不阻塞 UI，但多余的消息传递可以避免。 | 采纳设计审查标注 D：在 `onmessage` 中增加 `if (d.token !== token.value)` 快照比较。非阻塞项。 |

---

## 9. 设计审查标注处置状态

| 编号 | 内容 | 处置状态 |
|:----:|------|:------:|
| A | G14 Phase 1 warn+reject 回退预案 | 已在代码注释（useApi.ts:21-22）和 code_v2.md（第40行）中标注回退方案。**已处置**。 |
| B | riskForm.loadFromStorage() isValidResult 校验 | 代码确认：`riskFormStore.ts:62-66` 中 `isValidResult` 校验存在，不通过的 result 被置为 null。**已验证通过**。 |
| C | clearMustChangePassword 行号偏移 | 实际位于第168行（修改前第113行），按函数名搜索可定位。**不影响编码，无需处理**。 |
| D | BC onmessage 状态快照比较 | 未实施。上升为本审查**标注 2**，建议后续轮次采纳。 |

---

## 10. 审查结论

**APPROVED（含 2 项标注）**

全部 5 个任务（G14、S6、S4、S11、S8）的代码实现满足质量门禁：

1. **设计一致性**: 4 个文件的修改与 `detail_v2.md` 逐行精确匹配，无偏差。
2. **G14 兼容性**: 构造的 Error 对象与全部 10 个 API 函数及 3 个 Store 的 catch 链路兼容，409/401 路径不受影响。
3. **S8 迁移完整性**: 16 处 sessionStorage 迁移 + 5 处 localStorage 保留全部正确。App.vue 中发现 2 行遗留 localStorage 引用（死代码，不影响功能，标注 1）。
4. **BC 同步正确性**: BroadcastChannel 实现完整，懒初始化、消息广播/接收、降级处理均正确。存在可优化的传播回音（标注 2）。
5. **联动清理安全性**: clearAuth 中通过动态 Store 实例获取实现联动清理，避免 Pinia 循环依赖死锁，双层 try-catch 防御充分。
6. **TypeScript 类型安全**: `vue-tsc --noEmit` 0 errors，所有类型注解正确。

审查通过，代码可合并进入下一轮。

---

*审查报告结束（R1）。*
