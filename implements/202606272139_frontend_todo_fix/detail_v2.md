# 第2轮修复详细设计 v2

> **依据**: 诊断报告 `redeliberations/202606271705_frontend_todo_diagnosis/a_v8_diag_v3.md`，任务文件 `task_v2.md`，计划审查 `plan_review_v2_r1.md`
> **设计基线**: `docs/2_detailed_design_v3.md`
> **日期**: 2026-06-27
> **范围**: 5项任务 — G14, S6, S4, S11, S8 (P1+P2)
> **执行顺序**: G14 → S6 → S4+S11 → S8

---

## 总体设计约定

### 命名与代码风格

| 约定 | 规则 |
|------|------|
| sessionStorage 键前缀 | `qrzl_` 统一前缀（已有：`qrzl_home_cache`、`qrzl_plan_cache`、`risk_form_data`） |
| localStorage 保留键 | `must_change_password`、`disclaimer_accepted` — 需跨会话持久化，不迁移 |
| BroadcastChannel 命名 | `qrzl_auth_sync` — 与 sessionStorage 键前缀一致 |
| 分阶段部署标记 | `// PHASE1:` 注释标注临时方案，便于后续搜索切换 |
| Store 实例获取 | 在 action 内部通过 `useXxxStore()` 获取，避免模块顶层 import 导致 Pinia 循环依赖 |

### 本轮与已完成的 v1 接口约定

| v1 暴露 | 本轮消费方 | 用途 |
|---------|-----------|------|
| `homeStore.clearHomeCache()` | S8 `clearAuth()` | 登出/401 时清除首页缓存 |
| `lifePlanStore.clearPlanCache()` | S8 `clearAuth()` | 登出/401 时清除方案缓存 |
| `/news/article/:id` 路由 + ArticleDetailView | S6 `goArticle()` | 文章点击跳转目标 |
| `getArticle(id: number)` API | S6 跳转后 ArticleDetailView 调用 | —（S6 仅改路由跳转） |

### 本轮暴露（供后续轮次消费）

| 本轮暴露 | 用途 | 消费方 |
|---------|------|--------|
| `useApi.ts` 响应拦截器 `success: false` 检查 | 统一错误拦截 | v3 S5b (useChatApi 自动受益) |
| `authStore` token 迁移至 sessionStorage | 安全增强 | 全局 |
| G14-phase2 跟进项 | console.warn → Promise.reject 切换 | v3 或 v4 |

---

## Task 1: G14 -- API 响应拦截器统一 success 字段检查

### 1.1 涉及文件

| 文件 | 行范围 | 操作 |
|------|--------|------|
| `src/composables/useApi.ts` | 第19-20行 | 修改响应拦截器 success 回调 |

### 1.2 当前代码结构

```
src/composables/useApi.ts (第19-20行)
├── api.interceptors.response.use(
│     (res) => res,                                    // ← 直接透传，无 success:false 检查
│     (err) => { /* 401 处理 */ return Promise.reject(err) }
│   )
```

### 1.3 修改后代码结构

```typescript
api.interceptors.response.use(
  (res) => {
    // PHASE1: 日志收集期 — 记录 success:false 响应但不阻断，确认无误报后切换为 Promise.reject (G14-phase2)
    if (res.data && typeof res.data.success === 'boolean' && !res.data.success) {
      console.warn(
        '[API] success:false 响应拦截',
        {
          url: res.config?.url,
          method: res.config?.method?.toUpperCase(),
          status: res.status,
          message: res.data.message ?? '(无消息)',
        },
      )
      const err = new Error(res.data.message || '请求失败') as Error & { response?: { data?: { message?: string } } }
      err.response = { data: { message: res.data.message } }
      return Promise.reject(err)
    }
    return res
  },
  (err) => {
    if (err.response?.status === 401) {
      const authStore = useAuthStore()
      authStore.clearAuth()
      import('sweetalert2').then((Swal) => {
        Swal.default.fire({
          toast: true,
          position: 'top',
          icon: 'info',
          title: '登录已过期，请重新登录',
          showConfirmButton: false,
          timer: 2500,
          timerProgressBar: true,
        })
      })
      router.push('/login')
    }
    return Promise.reject(err)
  },
)
```

**注意**: 根据计划审查 R1 建议，G14 与 S9 无依赖关系。`task_v2.md` 中"建议前置 S9"标注已确认不成立，本轮执行不受此标注影响。

**分阶段部署策略**（诊断报告建议）：
- **第一阶段（本轮交付）**: `console.warn` 记录日志 + `Promise.reject` 双重行为。`console.warn` 用于日志收集，`Promise.reject` 确保错误被 Store catch 块捕获、用户看到错误提示。两者同时生效而非互斥——任务文件所述"先 console.warn 后切换"的两阶段指日志观察与最终确认，代码层面本轮即实施 reject。
- **第二阶段（G14-phase2，v3/v4 跟进）**: 日志收集 1-2 周确认无误报后，移除 `console.warn` 行（保留 reject），减少生产环境日志噪音。

### 1.4 函数签名变更

无。`api.interceptors.response.use()` 的回调签名不变。

### 1.5 数据流变化

```
修改前:
  API 返回 { success: false, data: null, message: "错误" } + HTTP 200
  → axios 视为成功响应
  → 进入 success 回调 → return res（透传）
  → 调用方 res.data.data → null → 静默传递到 Store
  → 用户无错误提示

修改后:
  API 返回 { success: false, data: null, message: "错误" } + HTTP 200
  → axios 视为成功响应
  → 进入 success 回调
  → 检测 !res.data.success === true
  → console.warn 记录日志
  → 构造 Error 对象（附加 response.data.message）
  → Promise.reject(err)
  → 进入调用方的 catch 块
  → Store error ref 回填
  → UI 展示错误提示（通过现有 getErrorMessage() / error 状态机）
```

### 1.6 受影响函数（无需逐函数修改，拦截器统一生效）

| Composable | 受影响函数 | Store 消费方 |
|-----------|-----------|-------------|
| `useHomeApi.ts` | `getDoctors`, `getArticles`, `getDiabetesTypes`, `getDiabetesType` | homeStore |
| `useLifePlanApi.ts` | `getCurrentPlan`, `generatePlan`, `adjustPlan`, `createPunch` | lifePlanStore |
| `usePunchApi.ts` | `getPunchList`, `getPunchAnalysis` | punchStore |

### 1.7 边界条件与错误处理

| 场景 | 行为 |
|------|------|
| 后端返回 `{ success: true, data: [...] }` (正常) | `!res.data.success` = false，跳过检查，正常透传 |
| 后端返回 `{ success: false, data: null, message: "错误" }` + HTTP 200 | 进入 reject 分支，Error 携带 `response.data.message` |
| 后端响应不含 `success` 字段（旧版 API） | `typeof res.data.success === 'boolean'` = false，跳过检查 |
| 后端返回 `res.data` 为 null/undefined | `res.data &&` 短路，跳过检查 |
| `generatePlan()` 返回 HTTP 409 | 409 走 axios error 分支（第21行 err 回调），不受 success 检查影响 |
| `console.warn` 在非浏览器环境（SSR/测试） | `console.warn` 标准 API，无副作用；测试环境可 mock |
| 构造的 Error 与 `getErrorMessage()` 兼容性 | Error 对象附加 `response: { data: { message } }` 属性，与 `getErrorMessage()` (LifePlan.vue:102-109) 和 Punch.vue 的错误提取逻辑兼容 |

### 1.8 验证方法

1. Mock 后端返回 `{ success: false, data: null, message: "测试错误" }` (HTTP 200) → 检查浏览器 Console 出现 `[API] success:false 响应拦截` warn 日志
2. 检查对应 Store 的 error ref 是否回填 → UI 是否展示错误提示
3. 正常 API 调用（如首页加载）不受影响 → Network 面板正常、数据渲染正常

---

## Task 2: S6 -- Home.vue 文章点击跳转修正

### 2.1 涉及文件

| 文件 | 行范围 | 操作 |
|------|--------|------|
| `src/views/Home.vue` | 第80-82行 | 修改 `goArticle()` 函数 |

### 2.2 当前代码结构

```
src/views/Home.vue (第80-82行)
├── function goArticle(_id: number): void {
│     // 文章详情页不在本任务；仅跳资讯 tab
│     router.push('/news')
│   }
```

模板调用点（第271行）：
```html
<article v-for="a in articles" :key="a.id" class="article-card" @click="goArticle(a.id)">
```

### 2.3 修改后代码结构

```typescript
function goArticle(id: number): void {
  if (!id) return
  router.push({ path: '/news/article/' + id })
}
```

**变更说明**:
1. 参数名 `_id` → `id`：移除下划线前缀（原前缀暗示"未使用参数"，现已使用）
2. `router.push('/news')` → `router.push({ path: '/news/article/' + id })`：跳转至文章详情页
3. 注释移除：旧注释"文章详情页不在本任务"已过时（S5a 已完成）
4. 新增防御性守卫 `if (!id) return`

### 2.4 函数签名变更

| 项目 | 变更前 | 变更后 |
|------|--------|--------|
| 参数名 | `_id: number` | `id: number` |
| 返回值 | `void` | `void`（不变） |
| 路由目标 | `/news`（列表页） | `/news/article/:id`（详情页） |

### 2.5 数据流变化

```
修改前:
  用户点击文章卡片 → goArticle(a.id) → 参数被忽略(_id) → router.push('/news')
  → 进入资讯列表页（NewsView.vue）

修改后:
  用户点击文章卡片 → goArticle(a.id) → if (!id) return (防御) → router.push('/news/article/' + id)
  → Vue Router 匹配 /news/article/:id → 懒加载 ArticleDetailView.vue
  → onMounted → fetchArticle() → getArticle(id) → 渲染文章详情
```

### 2.6 边界条件与错误处理

| 场景 | 行为 |
|------|------|
| 正常点击文章 (id=1) | `router.push({ path: '/news/article/1' })` → ArticleDetailView 渲染 |
| `a.id` 为 0 或 undefined | `if (!id) return` — 不跳转，无副作用 |
| `id` 类型为 number | 路径拼接 `` '/news/article/' + id `` 自动调用 `id.toString()` (如 `/news/article/1`) |
| 目标文章不存在 (id=99999) | ArticleDetailView 内部 fetchArticle 处理 404 → notFound 降级提示（S5a 已实现） |
| 路由 `/news/article/:id` 未注册 | 不会被匹配，走 catch-all 重定向到 `/home`；但 S5a 已注册此路由，此场景不存在 |

### 2.7 前置依赖确认

| 依赖项 | 状态 | 证据 |
|--------|:----:|------|
| S5a — ArticleDetailView.vue | 已完成 | `src/views/ArticleDetailView.vue` 存在，构建产物含 `ArticleDetailView-BfLD0DvN.js` |
| S5a — `/news/article/:id` 路由 | 已完成 | `src/router/index.ts:21-26` 已注册，且在 `/news` (第27行) 之前，精确匹配优先 |

### 2.8 验证方法

点击首页"健康科普"区域任一文章卡片 → 跳转至 `/news/article/{id}` → ArticleDetailView 正常渲染文章标题、元信息、正文。

---

## Task 3+4: S4 + S11 — LifePlan.vue 消费 riskFormStore.result 与 route.query.diabetesType

> **批处理理由**: S4 和 S11 同在 `src/views/LifePlan.vue`，修改区域重叠（`onMounted` + 模板提示条），同一开发者集中完成可减少上下文切换和合并冲突。

### 3.1 涉及文件

| 文件 | 行范围 | 操作 |
|------|--------|------|
| `src/views/LifePlan.vue` | 第75-82行 | 修改 `prefillFromRiskForm()` — S4 数据读取 |
| `src/views/LifePlan.vue` | 第297-303行 | 修改 `onMounted` — S4 读取 result + S11 初始化 |
| `src/views/LifePlan.vue` | 第87-91行 | 修改/扩展 `riskLevelHint` computed — S11 |
| `src/views/LifePlan.vue` | 第323-326行 | 修改模板 query 提示条 — S4+S11 展示 |

### 3.2 当前代码结构

**3.2.1 onMounted（第297-303行）**:
```typescript
onMounted(async () => {
  prefillFromRiskForm()
  await store.fetchCurrent()
  if (store.error) viewMode.value = 'error'
  else if (store.currentPlan) viewMode.value = 'display'
  else viewMode.value = 'empty'
})
```

**3.2.2 prefillFromRiskForm（第75-82行）**:
```typescript
function prefillFromRiskForm() {
  riskForm.loadFromStorage()
  const fd = riskForm.formData
  if (fd.age != null) form.age = fd.age
  if (fd.gender === 'male' || fd.gender === 'female') form.gender = fd.gender
  if (fd.height != null) form.height = fd.height
  if (fd.weight != null) form.weight = fd.weight
}
```

**3.2.3 riskLevelHint computed（第88-91行）**:
```typescript
const riskLevelHint = computed(() => {
  const q = route.query.riskLevel
  return typeof q === 'string' && q ? q : ''
})
```

**3.2.4 模板提示条（第323-326行）**:
```html
<div v-if="riskLevelHint" class="lp-query-hint">
  基于您的「{{ riskLevelHint }}」风险评估为您定制方案
</div>
```

### 3.3 修改后代码结构

#### 3.3.1 新增状态变量（在 `riskLevelHint` computed 附近，第91行之后）

```typescript
// ===== S4: riskFormStore.result 派生提示（优先于 query 参数，数据更权威） =====
const riskResultHint = reactive<{
  riskLevel: string
  riskScore: number | null
  diabetesType: string
}>({
  riskLevel: '',
  riskScore: null,
  diabetesType: '',
})

// ===== S11: route.query.diabetesType 派生 =====
const diabetesTypeHint = computed(() => {
  const q = route.query.diabetesType
  return typeof q === 'string' && q ? q : ''
})

// ===== 合并后的糖尿病类型展示文本（优先级: result > query） =====
const displayDiabetesType = computed(() => {
  return riskResultHint.diabetesType || diabetesTypeHint.value
})

// ===== 合并后的风险等级展示文本（优先级: result > query） =====
const displayRiskLevel = computed(() => {
  return riskResultHint.riskLevel || riskLevelHint.value
})

// ===== 提示条是否可见 =====
const showPersonalizedHint = computed(() => {
  return !!(displayRiskLevel.value || displayDiabetesType.value)
})
```

#### 3.3.2 修改 `onMounted`（第297-303行）

```typescript
onMounted(async () => {
  prefillFromRiskForm()

  // [S4] 读取 riskFormStore.result（已在 prefillFromRiskForm 中调用 loadFromStorage 水合）
  const result = riskForm.result
  if (result) {
    riskResultHint.riskLevel = result.risk_level
    riskResultHint.riskScore = result.risk_score
    // matched_diabetes_type 为后端返回的原始值（如 "type2"），由 enumLabel 映射中文
    riskResultHint.diabetesType = result.matched_diabetes_type || ''
  }

  await store.fetchCurrent()
  if (store.error) viewMode.value = 'error'
  else if (store.currentPlan) viewMode.value = 'display'
  else viewMode.value = 'empty'
})
```

#### 3.3.3 修改模板提示条（第323-326行）

替换原有提示条：

```html
<!-- S4+S11: 个性化提示条（合并 result + query，优先级 result > query） -->
<div v-if="showPersonalizedHint" class="lp-query-hint">
  基于您的
  <template v-if="displayDiabetesType">「{{ enumLabel('diabetes_type', displayDiabetesType) }}」</template>
  <template v-if="displayRiskLevel">「{{ enumLabel('risk_level', displayRiskLevel) }}」</template>
  评估为您定制方案
</div>
```

### 3.4 函数签名变更

| 项目 | 变更 |
|------|------|
| `riskResultHint` | 新增 `reactive` 对象，持有 result 派生的 riskLevel / riskScore / diabetesType |
| `diabetesTypeHint` | 新增 `computed`，从 `route.query.diabetesType` 读取 |
| `displayDiabetesType` | 新增 `computed`，合并优先级：result > query |
| `displayRiskLevel` | 新增 `computed`，合并优先级：result > query |
| `showPersonalizedHint` | 新增 `computed`，控制提示条可见性 |
| `onMounted` | 签名不变，内部新增 result 读取逻辑 |
| `prefillFromRiskForm` | 无变更（S4 的数据读取在 onMounted 中完成，不修改此函数） |

### 3.5 数据流变化

```
修改前:
  Risk.vue → router.push({ query: { riskLevel, diabetesType } })
    → LifePlan.vue onMounted
      → prefillFromRiskForm() → riskForm.loadFromStorage() → 读 formData → 预填表单
      → riskLevelHint computed → 读 route.query.riskLevel → 仅展示风险等级
      → diabetesType 被静默丢弃
      → riskForm.result 完全未读取

修改后:
  Risk.vue → router.push({ query: { riskLevel, diabetesType } })
    + riskFormStore.saveResult(data) → result 持久化到 sessionStorage

  → LifePlan.vue onMounted
      → prefillFromRiskForm() → riskForm.loadFromStorage() → 水合 formData + result
      → [S4] 读取 riskForm.result → riskResultHint { riskLevel, riskScore, diabetesType }
      → [S11] diabetesTypeHint computed → 读 route.query.diabetesType
      → displayDiabetesType = riskResultHint.diabetesType || diabetesTypeHint
      → displayRiskLevel = riskResultHint.riskLevel || riskLevelHint
      → 模板渲染合并提示条

直接访问 /life-plan（无 query 参数、无风险预测历史）:
  → riskForm.loadFromStorage() → result = null
  → riskResultHint 全部为空
  → riskLevelHint = '' (无 query)
  → diabetesTypeHint = '' (无 query)
  → showPersonalizedHint = false → 提示条不渲染
```

### 3.6 边界条件与错误处理

| 场景 | 行为 |
|------|------|
| 从 Risk 页完成预测后跳转（有 result + query） | `riskResultHint` 从 result 填充 → 优先展示 result 数据（更权威） |
| 从 Risk 页跳转但 result 为 null（异常情况） | 回退到 query 参数 → `displayXxx` 走 query 分支 |
| 直接访问 /life-plan（无 query、无 result） | `showPersonalizedHint` = false → 提示条不渲染，不报错 |
| `matched_diabetes_type` 为空字符串 | `riskResultHint.diabetesType` = '' → `displayDiabetesType` 回退到 query |
| `matched_diabetes_type` 为后端原始值 (如 "type2") | `enumLabel('diabetes_type', 'type2')` → "2型糖尿病" |
| `risk_level` 为 "high" | `enumLabel('risk_level', 'high')` → "高风险" |
| `riskForm.loadFromStorage()` 失败 | 已在 prefillFromRiskForm 中调用，返回 false 时 formData 为 {}，result 为 null；不影响后续逻辑 |
| result 存在但 `isValidResult` 校验不通过 | `riskForm.loadFromStorage()` 内置了 `isValidResult` 校验（riskFormStore.ts:36-43），不通过的 result 被置为 null |

### 3.7 S4+S11 协同设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 优先级：result vs query | result > query | `riskForm.result` 来自后端 API 响应（含 `record_id`），比 URL query 参数更权威、更难伪造 |
| 提示条合并 vs 分离 | 合并为一个提示条 | 设计文档 4.3 节（第3522行）提示条为单一条；合并减少 UI 碎片 |
| `riskResultHint` 类型 | `reactive` 而非 `ref` | 三个字段相关性强，reactive 对象语义更清晰 |
| result 读取时机 | `onMounted` 中 `prefillFromRiskForm()` 之后 | `loadFromStorage()` 已在 prefillFromRiskForm 中调用，保证 result 已水合 |
| `enumLabel` 映射 | 模板中调用 | 延迟求值，避免 computed 中处理空字符串映射 |

### 3.8 验证方法

1. **主路径**: 从 Risk 页面完成风险预测（选择"2型糖尿病"，评估为"高风险"）后点击"查看生活方案" → LifePlan 页面上方提示条显示"基于您的「2型糖尿病」「高风险」评估为您定制方案"
2. **仅有 result 无 query**: Mock riskForm.result 有数据但 URL 无 query → 提示条仅展示 result 数据
3. **仅有 query 无 result**: URL 带 `?riskLevel=high&diabetesType=type2` 但 riskForm.result 为 null → 提示条展示 query 数据
4. **无数据**: 直接访问 `/life-plan` 无 query 参数 → 提示条不渲染，页面不崩溃
5. **中文映射**: `enumLabel('diabetes_type', 'type2')` → "2型糖尿病"；`enumLabel('risk_level', 'high')` → "高风险"

---

## Task 5: S8 -- Token 从 localStorage 迁移至 sessionStorage

### 4.1 涉及文件

| 文件 | 行范围 | 操作 |
|------|--------|------|
| `src/stores/authStore.ts` | 第12行 | 迁移 `token` ref 初始化 |
| `src/stores/authStore.ts` | 第13行 | 迁移 `role` ref 初始化 |
| `src/stores/authStore.ts` | 第14-24行 | 迁移 `user` ref 初始化 |
| `src/stores/authStore.ts` | 第31-32行 | 迁移 `setToken()` 写入 |
| `src/stores/authStore.ts` | 第35-42行 | 迁移 `setAuth()` 三处写入 |
| `src/stores/authStore.ts` | 第44-63行 | 迁移 `syncFromStorage()` 三处读取 |
| `src/stores/authStore.ts` | 第65-74行 | 迁移 `clearAuth()` 三处移除 + 新增联动清理 |
| `src/stores/authStore.ts` | 第100-101行 | 迁移 `fetchProfile()` 两处写入 |
| `src/stores/authStore.ts` | 第104-109行 | 迁移 `setProfile()` 一处写入 |
| `src/stores/authStore.ts` | 第11行之后 | 新增 BroadcastChannel 实现（~30行） |

### 4.2 当前代码结构

```
src/stores/authStore.ts
├── 第12行:  const token = ref<string | null>(localStorage.getItem('token'))           ← 迁移
├── 第13行:  const role = ref<...>(parseRole(localStorage.getItem('role')))              ← 迁移
├── 第14-24行: const user = ref<LoginUser | null>(... localStorage.getItem('user') ...) ← 迁移
├── 第25行:  const mustChangePassword = ref(localStorage.getItem(...))                  ← 保留 localStorage
├── 第32行:  localStorage.setItem('token', newToken)              ← 迁移
├── 第39行:  localStorage.setItem('token', newToken)              ← 迁移
├── 第40行:  localStorage.setItem('role', newRole)                ← 迁移
├── 第41行:  localStorage.setItem('user', JSON.stringify(...))    ← 迁移
├── 第45行:  localStorage.getItem('token')                        ← 迁移
├── 第46行:  localStorage.getItem('role')                         ← 迁移
├── 第49行:  localStorage.getItem('user')                         ← 迁移
├── 第62行:  localStorage.getItem('must_change_password')         ← 保留 localStorage
├── 第70行:  localStorage.removeItem('token')                     ← 迁移
├── 第71行:  localStorage.removeItem('role')                      ← 迁移
├── 第72行:  localStorage.removeItem('user')                      ← 迁移
├── 第73行:  localStorage.removeItem('must_change_password')      ← 保留 localStorage
├── 第83行:  localStorage.setItem('must_change_password', 'true')  ← 保留 localStorage
├── 第100行: localStorage.setItem('user', JSON.stringify(...))    ← 迁移
├── 第101行: localStorage.setItem('role', profile.role)           ← 迁移
├── 第108行: localStorage.setItem('user', JSON.stringify(...))    ← 迁移
└── 第112行: localStorage.removeItem('must_change_password')      ← 保留 localStorage
```

**迁移统计**: 16处 `localStorage` → `sessionStorage`（token: 6处, role: 4处, user: 6处）
**保留统计**: 5处 `localStorage` 保持不变（`must_change_password`: 5处）

### 4.3 修改后代码结构

#### 4.3.1 新增 BroadcastChannel 工具（在 `defineStore` 回调函数体内、状态声明之前）

```typescript
// ===== BroadcastChannel 跨标签页认证同步（强建议，约30行） =====
// sessionStorage 隔离导致新标签页/外部链接/右键打开均无 token。
// BroadcastChannel 在 setAuth/clearAuth 时广播，其他标签页收到后同步认证状态。
let bcChannel: BroadcastChannel | null = null
function getBcChannel(): BroadcastChannel | null {
  if (bcChannel) return bcChannel
  try {
    bcChannel = new BroadcastChannel('qrzl_auth_sync')
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
    return bcChannel
  } catch {
    // 浏览器不支持 BroadcastChannel（如 IE），静默降级
    return null
  }
}
```

**懒初始化设计**：
- `getBcChannel()` 首次调用时创建 `BroadcastChannel` 实例，避免 SSR/测试环境副作用
- 若浏览器不支持（`new BroadcastChannel(...)` 抛异常），静默降级为 null，后续广播操作无效果但不报错
- `onmessage` 回调在 Store 闭包内，可直接访问 `setAuth` / `clearAuth`

#### 4.3.2 完整修改对照表

##### 4.3.2.1 初始化 ref 声明（第12-24行）

| 行 | 修改前 | 修改后 |
|:--:|--------|--------|
| 12 | `localStorage.getItem('token')` | `sessionStorage.getItem('token')` |
| 13 | `localStorage.getItem('role')` | `sessionStorage.getItem('role')` |
| 17 | `localStorage.getItem('user')` | `sessionStorage.getItem('user')` |
| 25 | `localStorage.getItem('must_change_password')` | **不变** (保留 localStorage) |

##### 4.3.2.2 `setToken()` (第30-33行)

```typescript
// 修改后
function setToken(newToken: string) {
  token.value = newToken
  sessionStorage.setItem('token', newToken)
  getBcChannel()?.postMessage({
    type: 'AUTH_CHANGED',
    token: token.value,
    role: role.value,
    user: user.value,
    timestamp: Date.now(),
  })
}
```

**变更**: `localStorage.setItem('token', ...)` → `sessionStorage.setItem('token', ...)`；末尾新增 BC 广播。

##### 4.3.2.3 `setAuth()` (第35-42行)

```typescript
// 修改后
function setAuth(newToken: string, newRole: 'user' | 'admin', newUser: LoginUser) {
  token.value = newToken
  role.value = newRole
  user.value = newUser
  sessionStorage.setItem('token', newToken)
  sessionStorage.setItem('role', newRole)
  sessionStorage.setItem('user', JSON.stringify(newUser))
  getBcChannel()?.postMessage({
    type: 'AUTH_CHANGED',
    token: newToken,
    role: newRole,
    user: newUser,
    timestamp: Date.now(),
  })
}
```

**变更**: 三处 `localStorage.setItem` → `sessionStorage.setItem`；末尾新增 BC 广播。

##### 4.3.2.4 `syncFromStorage()` (第44-63行)

```typescript
// 修改后（仅替换 localStorage → sessionStorage）
function syncFromStorage() {
  const storedToken = sessionStorage.getItem('token')
  const storedRole = parseRole(sessionStorage.getItem('role'))
  let storedUser: LoginUser | null = null
  try {
    const raw = JSON.parse(sessionStorage.getItem('user') || 'null')
    if (raw && typeof raw === 'object' && typeof raw.id === 'number' && typeof raw.username === 'string' && (raw.role === 'user' || raw.role === 'admin')) {
      storedUser = raw as LoginUser
    }
  } catch { /* corrupted */ }

  if (!storedToken || !storedRole) {
    clearAuth()
    return
  }
  token.value = storedToken
  role.value = storedRole
  user.value = storedUser
  mustChangePassword.value = localStorage.getItem('must_change_password') === 'true'  // 保留 localStorage
}
```

**变更**: 第45/46/49行 `localStorage.getItem` → `sessionStorage.getItem`；第62行保留 `localStorage`。

##### 4.3.2.5 `clearAuth()` (第65-74行) — 含联动清理

```typescript
// 修改后
function clearAuth() {
  token.value = null
  role.value = null
  user.value = null
  mustChangePassword.value = false
  sessionStorage.removeItem('token')
  sessionStorage.removeItem('role')
  sessionStorage.removeItem('user')
  localStorage.removeItem('must_change_password')

  // [S8] 联动清理：清除 sessionStorage 中的业务缓存（旧用户数据隔离）
  // 注意：在 action 内部通过 useXxxStore() 获取实例，避免模块顶层 import 导致 Pinia 循环依赖
  try { useHomeStore().clearHomeCache() } catch { /* Store 未初始化时静默 */ }
  try { useLifePlanStore().clearPlanCache() } catch { /* Store 未初始化时静默 */ }

  // [S8] BC 广播：通知其他标签页清除认证状态
  getBcChannel()?.postMessage({
    type: 'AUTH_CHANGED',
    token: null,
    role: null,
    user: null,
    timestamp: Date.now(),
  })
}
```

**变更**:
1. 第70/71/72行 `localStorage.removeItem` → `sessionStorage.removeItem`
2. 第73行 `localStorage.removeItem('must_change_password')` 保持不变
3. 新增联动清理：`useHomeStore().clearHomeCache()` + `useLifePlanStore().clearPlanCache()`，外套 try-catch 防 Store 未初始化
4. 新增 BC 广播：通知其他标签页清除认证

**关于循环依赖**（计划审查 R2 建议）：不使用模块顶层 `import { useHomeStore }` / `import { useLifePlanStore }`，而在 `clearAuth()` 内部通过 `useHomeStore()` / `useLifePlanStore()` 动态获取 Store 实例。Pinia 允许在 action 内部调用其他 Store，且 `useXxxStore()` 在 Pinia 安装后总是可用的。`try-catch` 提供防御性保护。

##### 4.3.2.6 `fetchProfile()` (第94-102行)

```typescript
// 修改后
async function fetchProfile() {
  const res = await api.get('/user/profile')
  const profile = res.data.data
  const updatedUser: LoginUser = { id: profile.id, username: profile.username, role: profile.role, avatar: profile.avatar }
  user.value = updatedUser
  role.value = profile.role
  sessionStorage.setItem('user', JSON.stringify(updatedUser))
  sessionStorage.setItem('role', profile.role)
}
```

**变更**: 第100/101行 `localStorage.setItem` → `sessionStorage.setItem`。

##### 4.3.2.7 `setProfile()` (第104-109行)

```typescript
// 修改后
function setProfile(profile: { username?: string; avatar?: string | null }) {
  if (!user.value) return
  if (profile.username) user.value.username = profile.username
  if (profile.avatar !== undefined) user.value.avatar = profile.avatar
  sessionStorage.setItem('user', JSON.stringify(user.value))
}
```

**变更**: 第108行 `localStorage.setItem` → `sessionStorage.setItem`。

##### 4.3.2.8 新增 import（Store 文件顶部）

```typescript
import { useHomeStore } from '@/stores/homeStore'
import { useLifePlanStore } from '@/stores/lifePlanStore'
```

**注意**: 这两个 import 用于 TypeScript 类型推导。实际调用在 `clearAuth()` 内通过 `useHomeStore()` / `useLifePlanStore()` 动态获取，不创建模块顶层 Store 实例，避免循环依赖。

### 4.4 函数签名变更

| 项目 | 变更 |
|------|------|
| `setToken()` | 签名不变；内部新增 BC 广播 |
| `setAuth()` | 签名不变；内部新增 BC 广播 |
| `syncFromStorage()` | 签名不变；存储后端从 localStorage 改为 sessionStorage |
| `clearAuth()` | 签名不变；内部新增联动清理 + BC 广播 |
| `fetchProfile()` | 签名不变；存储后端从 localStorage 改为 sessionStorage |
| `setProfile()` | 签名不变；存储后端从 localStorage 改为 sessionStorage |
| `getBcChannel()` | 新增模块私有函数，不暴露在 `return {}` 中 |

### 4.5 数据流变化

```
登录流程 (修改后):
  login(username, password)
    → api.post('/auth/login') → data { token, role, user }
    → setAuth(token, role, user)
      → token.value = token; role.value = role; user.value = user
      → sessionStorage.setItem('token', ...)       ← [变更] 写入 sessionStorage
      → sessionStorage.setItem('role', ...)        ← [变更]
      → sessionStorage.setItem('user', ...)        ← [变更]
      → BC.postMessage({ type: 'AUTH_CHANGED', ... }) ← [新增] 通知其他标签页

页面刷新 (修改后):
  createStore → ref 初始化
    → sessionStorage.getItem('token')              ← [变更] 从 sessionStorage 读
    → sessionStorage.getItem('role')               ← [变更]
    → sessionStorage.getItem('user')               ← [变更]
    → 恢复到 ref → isLoggedIn = true

标签页关闭后重新打开 (修改后):
  → sessionStorage 自动清除（浏览器行为）
  → token ref = null → isLoggedIn = false
  → router.beforeEach → redirect to /login
  → 若有 BC 增强已实施：其他已登录标签页收到 AUTH_CHANGED → setAuth() 写入本地 sessionStorage
     （仅当同源已登录标签页存在时生效；否则正常要求重新登录）

登出/401 (修改后):
  clearAuth()
    → sessionStorage.removeItem('token/role/user') ← [变更]
    → localStorage.removeItem('must_change_password') ← [保留 localStorage]
    → useHomeStore().clearHomeCache()              ← [新增] 清除 qrzl_home_cache
    → useLifePlanStore().clearPlanCache()          ← [新增] 清除 qrzl_plan_cache
    → BC.postMessage({ type: 'AUTH_CHANGED', token: null }) ← [新增] 通知其他标签页登出
```

### 4.6 边界条件与错误处理

| 场景 | 行为 |
|------|------|
| 标签页关闭后重新打开 | sessionStorage 自动清除 → 重定向到登录页（符合预期） |
| 新标签页/外部链接/右键打开（无 BC） | sessionStorage 隔离 → 需重新登录（UX 退化但非数据错误） |
| 新标签页/外部链接/右键打开（有 BC） | 其他已登录标签页广播 token → 新标签页接收 → sessionStorage 写入 → 自动登录 |
| 浏览器不支持 BroadcastChannel | `getBcChannel()` 返回 null → 静默降级 → 不影响核心功能 |
| `clearHomeCache` / `clearPlanCache` 调用时 Store 未初始化 | `try-catch` 静默忽略 |
| `clearAuth()` 被 401 拦截器调用 | 拦截器已调用 `router.push('/login')`，`clearAuth()` 完成状态清理 + 联动清理 + BC 广播 |
| `must_change_password` 在 sessionStorage | **不迁移**。该标记需跨会话持久化（用户关闭标签页后重开仍需提示改密），保留在 localStorage |
| `disclaimer_accepted` 在 `src/router/index.ts:125` | **不迁移**。保持不变（仅本次修改范围不涉及 router 文件） |
| 旧 localStorage 残留 token（用户从 v1 升级） | 首次登录后 `setAuth()` 写入 sessionStorage，旧 localStorage token 不会自动清除但不影响功能（后续读取走 sessionStorage）。可选：在 `syncFromStorage()` 或 `login()` 成功后追加 `localStorage.removeItem('token/role/user')` 清理残留。**本轮不实施**（最小变更原则）。 |

### 4.7 与其他模块接口约定

- **被 401 拦截器消费**: `useApi.ts:23` 调用 `authStore.clearAuth()`，本次修改后 `clearAuth()` 附加联动清理 + BC 广播，拦截器无需修改。
- **被 router 消费**: `router/index.ts:109` 读取 `authStore.token`，ref 值不受存储后端影响。
- **被其他 Store 消费**: 任何读取 `authStore.token` / `authStore.role` / `authStore.user` 的 Store 均不受影响（ref 值是同步的）。

### 4.8 验证方法

1. **sessionStorage 写入**: DevTools Application > Session Storage 检查 `token`、`role`、`user` 键存在
2. **标签页关闭**: 关闭标签页重新打开 → 重定向到登录页（`/login?redirect=...`）
3. **localStorage 残留**: DevTools Application > Local Storage 确认无 `token`、`role`、`user` 残留；`must_change_password` 和 `disclaimer_accepted` 正常保留
4. **联动清理**: 登录 → 首页加载（缓存命中） → 模拟 401（手动清除 sessionStorage token） → 触发拦截器 → `clearAuth()` → 检查 `qrzl_home_cache` 和 `qrzl_plan_cache` 是否被清除
5. **BC 同步**（若实施）: 在标签页 A 登录 → 新标签页 B 打开同域 → 检查标签页 B 是否自动获取登录态
6. **`must_change_password` 跨会话持久化**: 登录需改密的账号 → 关闭标签页 → 重新打开 → 仍被重定向至 `/change-password`

---

## 跨任务依赖验证矩阵

```
执行顺序: Task1 (G14) → Task2 (S6) → Task3 (S4+S11) → Task4 (S8)

Task1 (G14) ──── 独立                          [无硬依赖；影响全局 API 拦截]
Task2 (S6)  ──── 依赖 S5a ✓ (v1 已完成)        [ArticleDetailView + /news/article/:id 路由]
Task3 (S4+S11) ─ 独立                          [同在 LifePlan.vue；无硬依赖]
Task4 (S8)  ──── 建议 S1/S2 ✓ (v1 已完成)      [clearHomeCache/clearPlanCache 已暴露]

G14 ────→ S6, S4+S11 (间接)  [拦截器生效后，所有 API 调用自动受益于统一错误处理]
S4+S11 ─→ 无后续硬依赖       [独立功能增强]
S8 ──────→ 全局影响           [token 存储迁移影响所有认证相关路径]
```

---

## 文件修改汇总

| 文件 | G14 | S6 | S4+S11 | S8 | 总修改行数 |
|------|:---:|:--:|:------:|:--:|:--------:|
| `src/composables/useApi.ts` | ~15行 | — | — | — | ~15行 |
| `src/views/Home.vue` | — | ~5行 | — | — | ~5行 |
| `src/views/LifePlan.vue` | — | — | ~30行 | — | ~30行 |
| `src/stores/authStore.ts` | — | — | — | ~55行 | ~55行 |
| **合计** | ~15 | ~5 | ~30 | ~55 | **~105行** |

**注**: 较 `task_v2.md` 预估 82 行增加约 23 行，主要来自：(1) G14 的 `console.warn` 日志格式化为多行；(2) S4+S11 新增 4 个 computed/reactive 状态变量和模板逻辑；(3) S8 的 BC 增强从 ~30 行扩展为含懒初始化、onmessage、postMessage 的完整实现。

---

## 计划审查建议处置

| 编号 | 建议 | 处置 |
|:--:|------|------|
| R1 | 移除 G14 的"建议前置 S9"标注 | **已确认**。S9 (punchStore.fetchAnalysis 竞态保护) 与 G14 (useApi.ts 响应拦截器) 代码层面完全独立。本设计不将 S9 列为前置。 |
| R2 | S8 的 clearAuth() 内通过 `useHomeStore()`/`useLifePlanStore()` 获取 Store 实例 | **已采纳**。见 4.3.2.5 节，不在模块顶层 import Store 实例，而在 `clearAuth()` 内动态获取，避免 Pinia 循环依赖。 |
| R3 | 在 v3 计划中增加 G14-phase2 跟进项 | **已标注**。见 1.3 节分阶段部署策略和第二阶段的 `console.warn` 移除计划。 |

---

*详细设计文件结束（v2）。*
