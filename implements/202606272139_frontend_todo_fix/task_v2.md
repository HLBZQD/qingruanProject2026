# 前端待办修复 — 第2轮任务 v2

> **依据**: 诊断报告 `redeliberations/202606271705_frontend_todo_diagnosis/a_v8_diag_v3.md`
> **计划文件**: `plan.md` 第4.1节 v2行
> **上一轮**: v1 已完成 S9, S7, S3, S1, S2, S5a (6项)
> **日期**: 2026-06-27
> **范围**: 5项任务 — S6, G14, S4, S11, S8 (P1+P2)

---

## 执行顺序

```
Task1 (S6) ── 独立, 前置 S5a ✓ (v1已完成)
Task2 (G14) ─ 独立, 建议前置 S9 ✓ (v1已完成)
Task3 (S4) + Task4 (S11) ─ 批处理, 同在 LifePlan.vue
Task5 (S8) ─ 独立, 建议前置 S1/S2 ✓ (v1已完成)
```

**推荐顺序**: G14 → S6 → S4+S11 → S8
- G14 最先：影响全部 API 函数，统一错误拦截后其他 Task 自动受益。
- S6 次之：单行修改，快速验证 S5a 产出可用。
- S4+S11 批处理：同在 LifePlan.vue，同一开发者集中完成。
- S8 最后：依赖 S1/S2 暴露的 clearHomeCache/clearPlanCache，且涉及跨 Store 联动。

---

## Task 1: S6 — Home.vue 文章点击跳转修复

### 问题
`goArticle(_id)` 忽略参数，始终跳转 `/news` 列表页。设计文档 4.3 节明确要求跳转 `/news/article/:id`。

### 涉及文件

| 文件 | 行范围 | 操作 |
|------|--------|------|
| `src/views/Home.vue` | 第80-82行 | 修改 `goArticle()` 函数 |

### 修改内容
1. 移除 `_id` 前缀，参数名改为 `id`
2. `router.push('/news')` 改为 `router.push({ path: '/news/article/' + id })`
3. 增加防御：`if (!id) return`

### 前置依赖
S5a (ArticleDetailView.vue + `/news/article/:id` 路由) — v1 已完成。

### 边界条件
- `id` 类型为 `number`（Article 接口定义），路径拼接时自动调用 `toString()`
- 无 id 时不跳转

### 验证方法
点击首页推荐文章 → 跳转至 `/news/article/{id}` → ArticleDetailView 正常渲染。

---

## Task 2: G14 — API 响应拦截器统一 success 字段检查

### 问题
全部 10 个 API 函数直接解包 `res.data.data`，当后端返回 `{ success: false, data: null }` + HTTP 200 时，`null` 被静默传递到 Store，用户无错误提示。

### 涉及文件

| 文件 | 行范围 | 操作 |
|------|--------|------|
| `src/composables/useApi.ts` | 第19-41行（响应拦截器） | 在 success 分支增加 `success: false` 检查 |

### 修改内容
在 `api.interceptors.response.use()` 的 success 回调中增加：

```typescript
api.interceptors.response.use(
  (res) => {
    if (res.data && typeof res.data.success === 'boolean' && !res.data.success) {
      const err = new Error(res.data.message || '请求失败') as Error & { response?: { data?: { message?: string } } }
      err.response = { data: { message: res.data.message } }
      return Promise.reject(err)
    }
    return res
  },
  (err) => { /* 现有 401 处理 */ return Promise.reject(err) }
)
```

**分阶段部署**（诊断报告建议）：
- **第一阶段**：先用 `console.warn` 记录日志收集期 1-2 周，确认无误报
- **第二阶段**：切换为 `Promise.reject`

本轮建议采用分阶段策略：先实施 console.warn 日志收集版本，待确认无误报后切换为 reject。

### 受影响函数（无需逐函数修改，拦截器统一生效）
- useHomeApi: `getDoctors`, `getArticles`, `getDiabetesTypes`, `getDiabetesType`, `getArticle`
- useLifePlanApi: `getCurrentPlan`, `generatePlan`, `adjustPlan`, `createPunch`
- usePunchApi: `getPunchList`, `getPunchAnalysis`

### 边界条件
- 构造的 Error 对象附加 `response` 属性，与 `getErrorMessage()` 兼容
- `generatePlan()` 的 409 走 axios error 分支，不受影响
- 与后端确认 `success: false` 仅用于业务错误，不用于"暂无数据"

### 验证方法
Mock 后端返回 `{ success: false, data: null, message: "测试错误" }` (HTTP 200) → 检查 Store error 状态更新 → 检查 UI 错误提示展示 → 正常 API 调用不受影响。

---

## Task 3: S4 — LifePlan.vue 读取 riskFormStore.result

### 问题
LifePlan.vue `prefillFromRiskForm()` 仅读取 `riskForm.formData`，完全未消费 `riskForm.result`。设计文档 1.2/4.2/4.3 节三处明确要求读取 result。

### 涉及文件

| 文件 | 行范围 | 操作 |
|------|--------|------|
| `src/views/LifePlan.vue` | 第75-82行 | 修改 `prefillFromRiskForm()` 函数 |
| `src/views/LifePlan.vue` | 第297-303行 | 修改 `onMounted` 函数 |
| `src/views/LifePlan.vue` | 模板区 | 新增风险详情提示展示 |

### 修改内容
1. 在 `onMounted` 中 `prefillFromRiskForm()` 之后，读取 `riskForm.result`
2. 若 `result` 存在，新增 `riskResultHint` reactive 变量：
   ```typescript
   const riskResultHint = reactive({
     riskLevel: result.risk_level,
     riskScore: result.risk_score,
     diabetesType: result.matched_diabetes_type,
   })
   ```
3. 在模板现有 `riskLevelHint` 提示条下方，扩展展示风险详情（风险等级 + 匹配糖尿病类型）
4. `route.query.diabetesType` 如有值则优先覆盖 `result.matched_diabetes_type`（与 S11 协同）

### 边界条件
- `riskForm.result` 可能为 null（直接进入 LifePlan 未做过风险预测）→ 跳过展示，不报错
- `riskForm.loadFromStorage()` 已在 `prefillFromRiskForm()` 中调用，保证数据水合

### 验证方法
从 Risk 页面完成风险预测后跳转 LifePlan → 页面上方展示风险等级和匹配糖尿病类型提示 → 直接访问 /life-plan（无风险预测历史）→ 不报错、不展示个性化内容。

---

## Task 4: S11 — LifePlan.vue 消费 route.query.diabetesType

### 问题
Risk.vue 正确传递了 `route.query.diabetesType`，但 LifePlan.vue 仅消费 `riskLevel`，完全忽略 `diabetesType`。

### 涉及文件

| 文件 | 行范围 | 操作 |
|------|--------|------|
| `src/views/LifePlan.vue` | 第88-91行 | 扩展 `riskLevelHint` computed 或新增 `diabetesTypeHint` |

### 修改内容
1. 新增 `diabetesTypeHint` computed：
   ```typescript
   const diabetesTypeHint = computed(() => {
     const q = route.query.diabetesType
     return typeof q === 'string' && q ? q : ''
   })
   ```
2. 在模板 query 提示条中，同时展示 `riskLevelHint` 和 `diabetesTypeHint`（如"基于您的「2型糖尿病」「高风险」评估为您定制方案"）
3. 若 S4 已消费 `riskForm.result.matched_diabetes_type`，优先使用 result 数据（更权威）

### 边界条件
- 无 query 参数时不展示类型提示（不报错）
- `enumLabel('diabetes_type', diabetesTypeHint)` 映射中文显示

### 与 Task 3 (S4) 的协同
S4 和 S11 同在 LifePlan.vue 的 `onMounted` 和模板区域。建议同一开发者集中完成这两个 Task：
- S4 新增 `riskResultHint`（从 riskFormStore.result 读取）
- S11 新增 `diabetesTypeHint`（从 route.query 读取）
- 优先级：`riskForm.result.matched_diabetes_type` > `route.query.diabetesType`
- 模板中统一展示两者（合并为一个提示条或两个独立提示区）

### 验证方法
从 Risk 页面完成风险预测（选择"2型糖尿病"）后跳转 LifePlan → 提示条包含"2型糖尿病"文案 → 直接访问 /life-plan 无 query 参数 → 不崩溃、不展示类型信息。

---

## Task 5: S8 — Token 从 localStorage 迁移至 sessionStorage

### 问题
JWT Token 明文存储在 localStorage，存在 XSS 窃取风险。设计文档选择 localStorage，代码严格遵循，但安全风险客观存在。

### 涉及文件

| 文件 | 行范围 | 操作 |
|------|--------|------|
| `src/stores/authStore.ts` | 全文约21处 | 将 token/role/user 的 localStorage 操作迁移至 sessionStorage |
| `src/stores/authStore.ts` | `clearAuth()` 函数 | 增加联动清理 homeStore/lifePlanStore 缓存 |

### 修改内容

#### 5.1 核心迁移
将以下键从 `localStorage` 迁移至 `sessionStorage`（`getItem`/`setItem`/`removeItem` 调用格式相同，仅替换存储对象名）：
- `token` — 全部操作点
- `role` — 全部操作点
- `user` — 全部操作点

保留在 `localStorage` 的键：
- `must_change_password` — 需跨会话持久化
- `disclaimer_accepted` — 在 `src/router/index.ts:79` 中，保持不变

#### 5.2 具体操作点清单

| 函数/位置 | 迁移键 | 
|-----------|--------|
| 初始化 ref 声明 (token/role/user) | `token`, `role`, `user` |
| `setToken()` | `token` |
| `setAuth()` | `token`, `role`, `user` |
| `syncFromStorage()` | `token`, `role`, `user` |
| `clearAuth()` | `token`, `role`, `user` |
| `login()` | 通过 setAuth 间接迁移 |
| `fetchProfile()` | `role`, `user` |
| `setProfile()` | `user` |

#### 5.3 联动清理
在 `clearAuth()` 末尾增加：
```typescript
// 清理 sessionStorage 中的业务缓存（旧用户数据隔离）
homeStore.clearHomeCache()
lifePlanStore.clearPlanCache()
```
需在 authStore 顶部引入 homeStore 和 lifePlanStore 实例。

#### 5.4 跨标签页同步（强建议）
新增 BroadcastChannel 最小实现（约30行），避免 sessionStorage 隔离导致的 UX 退化：

```typescript
let channel: BroadcastChannel | null = null
function getChannel(): BroadcastChannel | null {
  if (channel) return channel
  try { channel = new BroadcastChannel('qrzl_auth_sync'); return channel } catch { return null }
}
const bc = getChannel()
if (bc) {
  bc.onmessage = (e: MessageEvent) => {
    if (e.data?.type === 'AUTH_CHANGED' && token.value) {
      setAuth(e.data.token, e.data.role, e.data.user)
    }
  }
}
// 在 setAuth() / clearAuth() 末尾广播：
getChannel()?.postMessage({
  type: 'AUTH_CHANGED',
  token: token.value,
  role: role.value,
  user: user.value,
  timestamp: Date.now(),
})
```

**标注**: BC 增强为强建议。若不实施，新标签页/外部链接/右键打开均需重新登录（UX 退化但非数据错误）。

### 边界条件
- 标签页关闭后 token 自动清除（sessionStorage 预期行为）
- BC 增强需懒初始化（避免 SSR/测试环境副作用）
- `clearAuth()` 联动清理 home/plan 缓存

### 验证方法
- DevTools Application > Session Storage 检查 token 键存在
- 关闭标签页重新打开 → 重定向到登录页
- DevTools Application > Local Storage 确认无 token 残留
- 登录 → 首页缓存命中 → 模拟 401（手动清除 sessionStorage token）→ 检查 `qrzl_home_cache` 和 `qrzl_plan_cache` 是否被联动清除

---

## 轮次依赖关系

```
v1 (已完成):
  S9, S7, S3, S1, S2, S5a
  
v2 (本轮):
  S6  ← 依赖 S5a ✓
  G14 ← 建议 S9 ✓
  S4  ← 无硬依赖
  S11 ← 无硬依赖
  S8  ← 建议 S1/S2 ✓ (暴露了 clearHomeCache/clearPlanCache)

v3 (后续):
  S5b-1, S5b-2 ← 依赖 G14 (建议, useChatApi 自动受益)
```

---

## 文件修改预估

| 文件 | S6 | G14 | S4 | S11 | S8 | 预估行数 |
|------|:--:|:---:|:--:|:---:|:--:|:------:|
| `src/views/Home.vue` | ~5行 | — | — | — | — | ~5行 |
| `src/composables/useApi.ts` | — | ~12行 | — | — | — | ~12行 |
| `src/views/LifePlan.vue` | — | — | ~15行 | ~10行 | — | ~25行 |
| `src/stores/authStore.ts` | — | — | — | — | ~40行 | ~40行 |
| **合计** | ~5 | ~12 | ~15 | ~10 | ~40 | **~82行** |

---

*任务文件结束。*
