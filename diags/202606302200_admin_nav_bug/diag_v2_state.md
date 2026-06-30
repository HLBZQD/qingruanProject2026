# 诊断报告（v2）：管理员点击"智能管理"无法跳转到 /admin

## 问题现象

管理员账号在"我的"（Profile）页面可以看到"智能管理"功能入口，但点击该入口后无法正常跳转到 `/admin` 智能管理页面。

## 诊断范围

状态管理与路由层。

---

## 1. 根因重新定位

v1 报告将根因 #1（`loadProfile()` 无条件覆盖 `authStore.role`）列为主要嫌疑。经代码级验证，该因果链与问题描述存在逻辑矛盾（详见第 2 节）。v2 调整为：**核心触发机制是 Token 过期（原根因 #2），无条件 role 覆盖（原根因 #1）是结构性漏洞——它决定了用户在失效前看到什么，但不是导致跳转失败的直接事件。**

### 1.1 核心触发机制：Token 过期导致守卫在 `/admin` 路由前拦截

**位置：**
- `src/composables/useAuth.ts` 第 70-77 行 — `isTokenExpired()` 函数
- `src/router/index.ts` 第 108-111 行 — 路由守卫 token 检查点

**因果链（自洽，无需未验证的后端假设）：**

```
T1: 用户导航到 /profile
    → 守卫: token 有效, role 检查跳过
    → Profile 组件挂载, onMounted → loadProfile()

T2: loadProfile() 执行
    → profileLoading = true → 骨架屏（无任何可点击按钮）
    → api.get('/user/profile') 返回 role='admin'（否则用户看不到按钮）
    → authStore.setAuth(storedToken, 'admin', ...) // role 同步写入
    → profileLoading = false → 真实内容渲染
    → menuItems 计算: isAdmin = true → "智能管理"按钮出现在 DOM 中
    → 用户看到按钮（符合问题描述前半段）

T3: 用户在 Profile 页面浏览（停留任意时长）
    → token 在此期间的某个时刻自然过期
    → 但没有任何机制主动检测过期并刷新 UI
    → isAdmin 仍为 true, 按钮仍在 DOM 中（符合问题描述前半段）

T4: 用户点击"智能管理"
    → router.push('/admin')
    → 守卫第 108 行: isTokenExpired(authStore.token) → true
    → authStore.clearAuth() // role 清为 null, token 清为 null
    → sessionStorage 清除, BC 广播 null-token
    → return next({ path: '/login', query: { redirect: '/admin' } })
    → 用户被重定向到登录页（符合问题描述后半段：无法跳转到 /admin）
```

**为什么用户能看到按钮但守卫不放行：** `isAdmin`（控制按钮渲染）与 `isTokenExpired(token)`（控制守卫拦截）检查的是两个不同维度的状态。`isAdmin` 由 `role` 决定——`loadProfile()` 返回 `role='admin'` 后它在整个会话中保持不变，直到显式调用 `clearAuth()` 或被覆盖。Token 过期时间由 JWT `exp` 字段决定，在 Profile 页面停留期间持续流逝。这两个状态之间存在**时间解耦**：按钮的可见性不会随 token 过期而更新。

**触发条件：**
- 后端的 JWT `exp` 过期时间短于用户在 Profile 页面的停留时间
- 或后端 JWT 不含 `exp` 字段（`isTokenExpired` 将其视为已过期——见下文 1.3.1）

**此因果链中唯一需要外部验证的假设：** `/user/profile` 返回 `role='admin'`（否则用户看不到按钮——与问题描述矛盾，排除）。该假设可由用户能够看到按钮的事实反证，比 v1 根因 #1 依赖的"`/user/profile` 返回非 admin role"假设更合理。

### 1.2 结构性漏洞：`loadProfile()` 无条件覆盖 `authStore.role`，使系统依赖 API 返回值一致性

**位置：**
- `src/views/Profile.vue` 第 64-73 行 — `loadProfile()` 调用 `authStore.setAuth(storedToken, res.data.data.role, {...})`
- `src/stores/authStore.ts` 第 87-101 行 — `setAuth()` 无条件写入 `role.value = newRole`

**机制分析：**

```
登录流程: api.post('/auth/login') → setAuth(data.token, data.role, data.user)
           role 来自 /auth/login 响应

Profile页: onMounted → loadProfile()
           → api.get('/user/profile') → setAuth(storedToken, res.data.data.role, ...)
           role 来自 /user/profile 响应（后发生，无条件覆盖前者）
```

两个不同的 API 端点各自返回 role，后者无条件覆盖前者。没有任何交叉校验确保两次返回值一致。

**为什么此漏洞不能单独解释本问题：** 结合第 2 节（逻辑矛盾分析）——`loadProfile()` 的 `setAuth()` 调用发生在 `profileLoading = false` **之前**（两者在同一同步执行块内）。当骨架屏消失、真实内容渲染时，`isAdmin` 已基于 `/user/profile` 返回的 role 计算完毕。不存在"按钮先以旧 role 渲染、再被新 role 覆盖"的时间窗口。

因此，`/user/profile` 返回什么 role，用户就看到什么状态的菜单：
- 返回 `'admin'` → 按钮可见 → 点击后能否跳转取决于 token 是否过期（1.1 节）
- 返回非 `'admin'` → 按钮不出现 → 用户根本不会点击——与问题描述矛盾

**`/user/profile` 返回 `'admin'` 是用户能看到按钮的必要条件。** 此漏洞的影响体现在：它使 `role` 值的最终裁决权完全交给 `/user/profile` 的一次性返回值。如果 `/user/profile` 因任何原因（后端逻辑变更、缓存不一致、多数据源竞态）返回了不一致的值，用户行为将不可预测，但此类场景已超出"导航失败"的诊断范围。

### 1.3 `parseRole()` 防御缺口：运行时校验在 `setAuth()` 中被遗漏

**位置：** `src/stores/authStore.ts` 第 10-13 行（定义）及各处调用/遗漏点

**代码证据：**

```typescript
// authStore.ts:10-13
function parseRole(raw: string | null): 'user' | 'admin' | null {
  if (raw === 'user' || raw === 'admin') return raw
  return null
}
```

`parseRole()` 是项目中**唯一**的 role 值运行时校验函数。其调用/遗漏矩阵：

| 位置 | 代码行 | 是否使用 `parseRole()` | 输入来源 |
|------|--------|----------------------|---------|
| Store 初始化 | authStore.ts:58 | **是** | `sessionStorage.getItem('role')` |
| `syncFromStorage()` | authStore.ts:105 | **是** | `sessionStorage.getItem('role')` |
| `syncFromStorage()` 赋值 | authStore.ts:149 | 间接（变量已解析） | 经 parseRole 处理后的 `storedRole` |
| `setAuth()` | authStore.ts:89 | **否** | `newRole` 参数（类型标注 `'user' \| 'admin'`，运行时无校验） |
| `fetchProfile()` | authStore.ts:206 | **否** | `profile.role`（API 响应，类型标注为 `'user' \| 'admin'`） |
| BC 临时 onmessage | authStore.ts:132 | **否** | `d.role`（来自其他标签页的 BroadcastChannel 消息） |
| BC 永久 onmessage | authStore.ts:32 | **否** | `d.role`（来自其他标签页的 BroadcastChannel 消息） |

**不对称模式的意义：** `parseRole()` 保护的是"从 sessionStorage 恢复"的路径——即信任边界在持久化层。但 `setAuth()`（来自 API 响应）、`fetchProfile()`（同样来自 API 响应）、BC 消息处理（来自其他标签页）这些同样跨越信任边界的路径完全绕过了此校验。

在本问题中，`parseRole()` 的遗漏**不是直接触发因素**（因为 `/user/profile` 必须返回 `'admin'` 用户才能看到按钮），但它是理解 `setAuth()` 设计意图的关键——要么是刻意信任后端返回值，要么是防御性校验的疏漏。

**额外发现：`fetchProfile()` 是死代码。** `authStore.ts` 第 201-209 行的 `fetchProfile()` 函数同样调用 `/user/profile` 并写入 `role`，但整个项目中**零调用点**。`Profile.vue` 选择直接调用 `setAuth()` 而非 `fetchProfile()`，两者对 role 的写入模式不同——`fetchProfile()` 不写 `token` 到 sessionStorage，不广播 BC 消息。这种不一致暗示 `fetchProfile()` 可能是早期设计残留，其存在说明了 role 同步逻辑经历过设计演进。

### 1.4 `isTokenExpired` 对无 `exp` 声明的 JWT 一律判定过期

**位置：** `src/composables/useAuth.ts` 第 70-77 行

**代码证据：**

```typescript
export function isTokenExpired(token: string): boolean {
  const payload = parseToken(token)
  if (!payload || typeof payload.exp !== 'number') {
    return true  // 无 exp → 视为过期
  }
  return Math.floor(Date.now() / 1000) >= payload.exp
}
```

**`exp` 在 RFC 7519 中为可选声明。** 该函数的防御策略是"宁可错杀不可放过"——这本身是合理的安全选择，但前提是后端签发的 JWT 必须包含 `exp`。如果后端 JWT 不含 `exp`，则**所有**需要认证的路由（包括 `/profile` 自身）都不可达——这与用户能到达 Profile 页面的事实矛盾，因此此场景在当前的 JWT 实现中不成立。

对于包含有效 `exp` 的 JWT，token 过期是 1.1 节触发机制的核心前提。

### 1.5 辅助路径：401 响应拦截器独立于守卫体系清除认证

**位置：** `src/composables/useApi.ts` 第 40-48 行

**机制：** 401 拦截器在路由守卫体系外运作。任何 API 调用返回 401 即触发 `clearAuth()` + `router.push('/login')` + Swal toast "登录已过期，请重新登录"。

**在本问题中的角色：**
- 如果 `/user/profile` 调用本身返回 401：`loadProfile()` 进入 catch 分支（`profileError = true`, error toast），同时拦截器 `clearAuth()` + 跳转登录。用户看到的是错误重试页面闪现后跳到登录页（取决于两者执行的时序）。此场景下用户看不到按钮（profileError 页面不含菜单），与问题描述矛盾。
- 如果在 Profile 页面停留期间有其他 API 调用返回 401：用户会被静默跳转到登录页，可能在点击"智能管理"之前就已经不在 Profile 页面了。此场景下用户看到了登录页 + "登录已过期" toast，而非从 Profile 点击按钮后跳转。

### 1.6 其他发现

**`mustChangePassword` 的 localStorage 持久化**（`authStore.ts` 第 70 行, `router/index.ts` 第 118-121 行）：守卫链中排在 token 检查（line 108）和 admin 角色检查（line 114）之后。若管理员能到达 Profile 页面，说明该标志此时为 `false`。在停留期间无机制改变该标志。因此不能解释本问题。

**`syncFromStorage()` BC 竞态**（`authStore.ts` 第 126-143 行）：临时 `onmessage` 处理器缺少去重守卫。但用户能看到"智能管理"说明 sessionStorage 中存在有效数据，`syncFromStorage()` 走快速路径（line 148-153），不进入 BC 协议。影响有限。

---

## 2. 逻辑矛盾分析：为什么原根因 #1 不能单独解释问题

### 2.1 问题描述的核心约束

问题描述同时断言了两个事实：
- **事实 A**：管理员在"我的"页面**可以看到**"智能管理"按钮
- **事实 B**：点击该按钮后**无法正常跳转**到 `/admin`

任何有效的因果链必须同时产生 A 和 B。

### 2.2 Vue 响应式更新的原子性

在 `loadProfile()` 中（`Profile.vue` 第 49-88 行）：

```
profileLoading = true          // 骨架屏渲染 ← 无按钮
↓ await api.get('/user/profile')
↓ authStore.setAuth(...)       // role 写入（触发响应式更新）
↓ profile.value = res.data.data // profile 写入
↓ finally: profileLoading = false // 真实内容渲染 ← 按钮出现
```

`setAuth()` 和 `profileLoading = false` 在同一个同步执行块中（`await` 之后），Vue 3 会在同一个 tick 中批量处理所有响应式更新。当真实内容渲染时，`isAdmin` **已经**反映了 `setAuth()` 写入的 role 值。不存在"先用旧 role 渲染，再切换到新 role"的中间态。

骨架屏期间（`profileLoading = true`），模板渲染的是第 291-305 行的骨架屏——其中菜单区域是 4 个静态 `<div class="skeleton-menu">` 占位块，**没有任何点击处理器**。用户在此期间完全无法与菜单交互。

### 2.3 排除原根因 #1 作为独立触发因素

| `/user/profile` 返回的 role | `profileLoading=false` 后的 `isAdmin` | 按钮是否可见 | 点击跳转结果 | 是否匹配问题描述 |
|---------------------------|--------------------------------------|------------|------------|--------------|
| `'admin'` | `true` | 可见（事实 A 满足） | 守卫 `role !== 'admin'` 为 `false`，继续到 token 检查 → **若 token 有效则通过**，若 token 过期则拦截（事实 B 满足） | 仅在 token 过期时匹配——但此时触发因素是 token 而非 role |
| 非 `'admin'`（`null`/`undefined`/`'user'`） | `false` | 不可见（`menuItems` 中不含"智能管理"——第 256 行 `if (authStore.isAdmin)` 不满足） | 无按钮可点击 | 与事实 A 矛盾 |

**结论：** 原根因 #1 的 role 覆盖机制不是导致"点击后无法跳转"的直接事件。直接事件是 token 过期（1.1 节）。Role 覆盖机制影响的是"用户看到什么"，而非"点击后发生什么"。

---

## 3. 根因交互分析

### 3.1 五条根因的角色划分

| 根因 | v2 角色 | 作用阶段 |
|------|---------|---------|
| Token 过期（原 #2） | **主要触发因素** | 用户点击 → 守卫拦截 |
| role 无条件覆盖（原 #1） | **结构性漏洞** | `loadProfile()` 执行时决定按钮可见性 |
| `parseRole()` 防御缺口（新增） | **防御层缺失** | 允许非法 role 值穿透写入 sessionStorage |
| 401 拦截器（原 #3） | **并行失效路径** | 任何 API 401 响应时独立清除认证 |
| `mustChangePassword`（原 #4） | **不相关**（自我排除） | — |
| BC 竞态（原 #5） | **不相关**（自我排除） | — |

### 3.2 主要交互路径

```
loadProfile() 返回 role='admin'
  │
  ├── role 无条件覆盖写入 sessionStorage ─── 结构性漏洞（原#1）
  │     └── parseRole() 未被调用 ─── 防御缺口
  │
  └── isAdmin = true → 按钮渲染 → 用户可见
        │
        │  [时间流逝 — token 可能在此过期]
        │  [UI 不感知 token 过期 — 无主动检测/轮询]
        │
        └── 用户点击 → router.push('/admin')
              │
              ├── 守卫 line 108: isTokenExpired → true ─── 主要触发（原#2）
              │     └── clearAuth() + redirect /login?redirect=%2Fadmin
              │
              └── 若 token 仍有效 → 守卫 line 114: role !== 'admin' → false → 通过
                    → 用户正常到达 /admin
```

**关键洞察：** isAdmin 控制的是 UI 层的"可见性"，`isTokenExpired` 控制的是守卫层的"可达性"。两者之间不存在联动机制——token 过期不会触发 isAdmin 更新。这是一个**跨层状态不一致**问题。

### 3.3 401 拦截器与主路径的竞态

401 拦截器可能在任何时刻独立触发：

```
用户在 Profile 页面
  │
  ├── [路径 A] 用户点击"智能管理"
  │     └── router.push('/admin') → 守卫检查 → 走 3.2 交互路径
  │
  └── [路径 B] 任意 API 调用返回 401（含 /user/profile 本身）
        └── 拦截器 clearAuth() + router.push('/login?...')
        └── 用户被强制跳转，无关是否点击过按钮
```

路径 A 和路径 B 互斥——如果路径 B 先触发，用户已不在 Profile 页面，无按钮可点击。诊断线索：路径 B 会伴随 Swal toast "登录已过期，请重新登录" 在登录页叠加显示。

---

## 4. 症状区分指南

通过用户实际看到的**目标页面**可以区分具体触发路径：

| 用户点击后看到的页面 | URL | 最可能的触发因素 | 排除的根因 |
|---------------------|-----|----------------|-----------|
| 登录页 | `/login?redirect=%2Fadmin` | Token 过期（1.1）或 401 拦截器（1.5） | role 覆盖（role 覆盖静默跳转 /home，不跳 /login） |
| 首页 | `/home` | role 被覆盖为非 admin（1.2）——但这与"用户能看到按钮"矛盾 | — |
| 改密页 | `/change-password` | `mustChangePassword` 被意外置 true（1.6） | Token 过期（守卫检查顺序：token 检查在 mustChangePassword 之前） |
| 管理员页面 | `/admin`（正常） | 问题未复现 | 所有已知根因 |

**附加症状线索：**

- 如果在 `/login` 页面上叠加显示 Swal error toast "登录已过期，请重新登录"：**401 拦截器路径**（`useApi.ts` 第 46 行 `showInfo` + 第 47 行 `router.push`）
- 如果在 `/login` 页面上叠加显示 Swal error toast "加载失败，请重试"：`/user/profile` 返回 401，拦截器跳转登录 + `loadProfile()` catch 分支的 error toast 同时触发
- 如果在其他标签页也同时被登出：`clearAuth()` 的 BC 广播副作用已触发

**注意：** 这些区分特征仅用于帮助修复者通过用户报告锁定触发路径，不构成诊断结论的一部分。确诊仍需调试验证（第 7 节）。

---

## 5. 导航守卫完整放行/拦截矩阵

以 `/admin` 路由（`{ requiresAuth: true, requiresAdmin: true }`）为目标，守卫检查顺序：

| 检查步骤 | 代码位置 | 拦截条件 | 失败后果 |
|---------|---------|---------|---------|
| 1. 公开路由跳过 | router/index.ts:104 | `to.meta.requiresAuth === false` | 直接放行（/admin 不适用） |
| 2. Token 有效性 | router/index.ts:108 | `!token \|\| isTokenExpired(token)` | `clearAuth()` + 跳转 `/login?redirect=...` |
| 3. Admin 角色 | router/index.ts:114 | `to.meta.requiresAdmin && role !== 'admin'` | 跳转 `/home`（静默，无 toast） |
| 4. 强制改密 | router/index.ts:118 | `mustChangePassword && to.path !== '/change-password'` | 跳转 `/change-password`（`replace: true`） |
| 5. 免责声明 | router/index.ts:123 | `requiresDisclaimer && !hasAcceptedDisclaimer()` | 弹窗或拒绝后回退 |

对于 `/admin` 路由，`requiresDisclaimer` 未设置，步骤 5 跳过。

**守卫检查顺序的重要性：** Token 检查（步骤 2）在 Admin 角色检查（步骤 3）之前。这意味着即使 role='admin'，只要 token 过期，用户会在步骤 2 被拦截，永远不会到达步骤 3。反之，如果 role 不是 'admin' 但 token 有效，用户将在步骤 3 被静默重定向到 `/home`。

---

## 6. `authStore.role` 数据流完整追踪

### 6.1 role 的所有写入点

| 写入点 | 位置 | 触发时机 | 写入值来源 | 是否经 `parseRole()` |
|-------|------|---------|-----------|---------------------|
| Store 初始化 | authStore.ts:58 | `useAuthStore()` 首次调用 | `sessionStorage.getItem('role')` | **是** |
| `setAuth()` | authStore.ts:89 | 登录/loadProfile/BC同步 | 参数 `newRole` | **否** |
| `fetchProfile()` | authStore.ts:206 | 主动刷新（零调用点——死代码） | `profile.role`（API响应） | **否** |
| `syncFromStorage()` | authStore.ts:149 | 应用启动（main.ts line 15） | 经 parseRole 的 `sessionStorage` 值 | **是**（间接） |
| `clearAuth()` | authStore.ts:158 | 登出/token过期/401拦截 | 设为 `null` | N/A |
| BC 永久 onmessage | authStore.ts:32 | 其他标签页广播 AUTH_CHANGED | 消息 `d.role` | **否** |
| BC 临时 onmessage | authStore.ts:132 | 新标签页请求认证数据 | 消息 `d.role` | **否** |

### 6.2 从"用户看到智能管理"到"点击"之间的 role 时间线

```
T0: app 启动
    main.ts → syncFromStorage()
    → sessionStorage 有 token + role（经 parseRole 校验）
    → role = 'admin', isAdmin = true

T1: 导航到 /profile
    守卫: token 通过, role 检查跳过, mustChangePassword 通过
    → Profile 组件挂载

T2: onMounted → loadProfile() 启动
    profileLoading = true → 骨架屏（无按钮）

T3: api.get('/user/profile') 返回
    → authStore.setAuth(storedToken, res.data.data.role, {...})
    → role.value = res.data.data.role   ← 关键写入点（无 parseRole 校验）
    → sessionStorage.setItem('role', res.data.data.role)
    → BC 广播 AUTH_CHANGED

T4: profileLoading = false
    → 真实内容渲染
    → menuItems 响应式计算: isAdmin 取决于 T3 写入的 role
    → 若 role='admin': "智能管理"按钮在 DOM 中
    → 若 role≠'admin': 无按钮

T5: 用户点击"智能管理"（仅当 T4 中按钮存在）
    → router.push('/admin')
    → 守卫: 先检查 token（line 108）→ 再检查 role（line 114）
    → token 若过期 → /login?redirect=%2Fadmin
    → role 若非 admin → /home（但用户能看到按钮说明 role='admin'）
```

**核心问题：** T3 到 T5 之间存在时间间隔。T3 写入的值决定了 T4 的 UI 状态（按钮可见性），但 T5 时刻的守卫检查使用**当时的** `authStore.token` 和 `authStore.role`。这两个状态在 T3-T5 之间可能因 token 自然过期而改变（影响 token 检查），但 role 在无外部事件时不会改变。

---

## 7. `fetchProfile()` 死代码分析

**位置：** `src/stores/authStore.ts` 第 201-209 行

```typescript
async function fetchProfile() {
  const res = await api.get('/user/profile')
  const profile = res.data.data
  const updatedUser: User = { id: profile.id, username: profile.username, role: profile.role, avatar: profile.avatar }
  user.value = updatedUser
  role.value = profile.role
  sessionStorage.setItem('user', JSON.stringify(updatedUser))
  sessionStorage.setItem('role', profile.role)
}
```

**状态：** 整个项目零调用点。`Profile.vue` 的 `loadProfile()` 绕过此函数，直接调用 `authStore.setAuth()`。

**与 `loadProfile()` 的差异：**

| 行为 | `fetchProfile()` | `loadProfile()` 中的 `setAuth()` |
|------|-----------------|--------------------------------|
| 写 `user` | 是 | 是 |
| 写 `role` | 是 | 是 |
| 写 `token` | **否** | 是（重复写 `storedToken`） |
| 写 `sessionStorage.token` | **否** | 是 |
| 广播 BC `AUTH_CHANGED` | **否** | 是（`setAuth` 副作用） |
| `parseRole()` 校验 | **否** | **否** |
| Profile 数据缓存 | **否**（无 `profile.value` 赋值） | 是（`profile.value = res.data.data`） |

**诊断意义：** `fetchProfile()` 调用 `/user/profile` 但只关心 `id/username/role/avatar` 四项，丢弃了 `created_at` 等其他字段。而 `loadProfile()` 需要完整的 `UserProfile`（含 `created_at`）用于渲染"注册天数"等 UI 元素。这解释了为什么 `Profile.vue` 不使用 `fetchProfile()`——功能不匹配。

但这也揭示了设计层面的问题：两个函数各自独立解析 `/user/profile` 的响应、各自以不同方式写入 role，彼此不知道对方的存在。`fetchProfile()` 作为死代码残留，暗示 role 同步逻辑经历过多次迭代但未清理。

---

## 8. 静默重定向的识别

存在以下静默重定向（无用户提示的跳转）：

1. **`/login?redirect=...` 重定向**（router/index.ts:111）— token 过期时跳转登录，query 中携带 redirect 参数。此重定向由 `clearAuth()` 配合——`clearAuth()` 的副作用包括 BC 广播 null-token 导致其他标签页连锁登出。
2. **`/home` 重定向**（router/index.ts:115）— 当 `authStore.role !== 'admin'` 时，`return next('/home')` 不带任何 toast 或提示。
3. **`/change-password` 重定向**（router/index.ts:120）— 当 `mustChangePassword === true` 时，跳转到改密页，`replace: true` 使后退按钮不回到原页面。

其中 #2 和 #3 对用户完全静默。#1 有明确的 URL 变化（登录页）可作为诊断线索。

在本问题的最可能场景（token 过期触发 #1）中，用户看到的是登录页（URL 含 `?redirect=%2Fadmin`），而非目标首页或管理页。

---

## 9. 影响范围

| 影响项 | 范围 |
|-------|------|
| 受影响的用户 | 所有角色为 `admin` 的用户，在 Profile 页面停留时间超过 JWT 剩余有效时间后 |
| 受影响的入口 | Profile 页面的"智能管理"菜单项（Profile.vue line 262） |
| 受影响的组件 | `Profile.vue`（loadProfile 的 setAuth 调用 + 无 token 过期感知）、`authStore.ts`（setAuth 无 parseRole 校验 + role 覆盖无一致性校验）、`router/index.ts`（守卫 token 检查）、`useApi.ts`（401 拦截器） |
| 连锁影响 | `clearAuth()` 通过 BC `AUTH_CHANGED(token: null)` 导致同 origin 下所有已登录标签页同时登出 |
| 持久化影响 | `mustChangePassword` 使用 localStorage 跨会话存活 |
| 类型系统 | `User.role` 和 `JwtPayload.role` 均为 `'user' \| 'admin'`，但 `setAuth()` 的 `newRole` 参数仅依赖 TypeScript 编译时标注，运行时无校验（`parseRole()` 被绕过） |
| 死代码 | `fetchProfile()` 零调用点，但与 `loadProfile()` 功能重叠，构成维护隐患 |

---

## 10. 证据摘要

| # | 发现 | 严重程度 | 确定性 |
|---|------|---------|--------|
| 1 | Token 过期是导致"点击后无法跳转"的最自洽触发机制——守卫 line 108 拦截 → `clearAuth()` → `/login?redirect=%2Fadmin`。此链不需要未验证的后端假设 | 高 | 代码确认（触发条件需验证 token 过期时间） |
| 2 | `isAdmin`（控制按钮渲染）与 `isTokenExpired(token)`（控制守卫放行）之间无联动机制——token 过期不更新 UI，导致用户看到按钮但无法跳转 | 高 | 代码确认 |
| 3 | `loadProfile()` 无条件以 `/user/profile` 返回值覆盖 `role`，两个 API 端点各返回 role 且无一致性校验。但此漏洞不能单独产生所述症状（见第 2 节分析），定位为结构性漏洞 | 高 | 代码确认（作为漏洞存在，非直接触发因素） |
| 4 | `parseRole()` 在 store 初始化和 `syncFromStorage()` 中被调用，但在 `setAuth()`、`fetchProfile()`、BC 消息处理中均被绕过——运行时校验存在不一致的调用模式 | 中 | 代码确认 |
| 5 | `fetchProfile()` 是死代码（零调用点），其存在暗示 role 同步逻辑的设计演进但未清理 | 低 | 代码确认 |
| 6 | 401 拦截器在守卫体系外独立清除认证，可与 token 过期形成并行失效路径 | 高 | 代码确认 |
| 7 | `requiresAdmin` 守卫失败时静默重定向到 `/home`，无任何用户提示 | 中 | 代码确认 |
| 8 | `setAuth()` 的 `newRole` 参数仅 TypeScript 编译时类型标注，运行时 `undefined`/`null`/非法字符串可穿透写入 | 中 | 代码确认 |
| 9 | `mustChangePassword` 使用 localStorage 跨会话持久化；守卫拦截时静默跳转 | 中 | 代码确认 |
| 10 | `syncFromStorage()` BC 临时 onmessage 处理器缺少去重守卫 | 低 | 代码确认 |

---

## 11. 推荐的调试验证步骤

以下步骤不构成修复方案，仅用于在修复前区分和确认触发路径：

1. **区分触发路径（优先级最高）：** 向用户确认点击"智能管理"后看到的实际页面和 URL——`/login?redirect=%2Fadmin` 指向 token 过期，`/home` 指向 role 被覆盖，`/change-password` 指向 mustChangePassword。这是成本最低、信息量最大的验证。

2. 在 `src/router/index.ts` 第 108 行前添加 `console.log`，记录 `authStore.token` 和 `isTokenExpired(authStore.token)` 的实际返回值，确认 token 在点击时刻是否过期。

3. 使用 `parseToken()` 或 jwt.io 解码当前使用的 JWT，确认 `exp` 字段的值及过期时间。计算 `exp - Date.now()/1000` 得到剩余有效时间，判断是否短于典型用户在 Profile 页面的停留时间。

4. 在浏览器 DevTools Network 面板中捕获 `/user/profile` 的实际响应体，确认 `data.role` 的值。此验证用于排除 `/user/profile` 返回非 `'admin'` role 的可能性（如果返回非 admin，用户本不应看到按钮，需排查更多因素）。

5. 在 `src/stores/authStore.ts` 的 `setAuth()` 函数（第 88-89 行）添加 `console.log`，记录 `newRole` 参数的实际值。

6. 在浏览器 DevTools Application > Session Storage 中观察 `role` 键的值在 Profile 页面加载前后的变化。

---

## 修订说明（v2）

| 质询意见 | 回应 |
|---------|------|
| **问题1：根因 #1 因果链与问题描述存在逻辑矛盾** — 质询指出 `loadProfile()` 期间骨架屏屏蔽交互，完成后 `isAdmin` 已基于覆盖后的 role 计算。若 role 被覆盖为非 admin，按钮消失；若 role 保持 admin，守卫通过。根因 #1 无法同时满足"用户看到按钮"和"点击后无法跳转"。 | **接受。** 经代码级验证确认：`setAuth()` 和 `profileLoading = false` 在同一同步执行块中，Vue 响应式批量更新使两者同时生效。不存在"先用旧 role 渲染按钮、再被新 role 覆盖"的时间窗口。v2 将原根因 #1 从"主要嫌疑"重新定位为"结构性漏洞"——它决定了 UI 层显示什么，但不是导致跳转失败的直接事件。新增第 2 节（逻辑矛盾分析）详细记录此分析过程及排除矩阵。 |
| **问题2：核心证据未验证** — 根因 #1 依赖 `/user/profile` 的 role 值，根因 #2 依赖 JWT 的 `exp` 字段，两者均未被实际验证。诊断结论在证据缺失下给出了确定性判断。 | **部分接受，调整确定性表述。** 关于后端 API 返回值：v2 的 1.1 节核心因果链不再依赖"`/user/profile` 返回非 admin role"的假设——该假设已被第 2 节的逻辑矛盾分析排除。v2 核心因果链依赖的假设仅为"用户能看到按钮（说明 role='admin'）"和"token 在停留期间过期"，前者由问题描述反证，后者仅需确认 JWT 过期时间。关于 JWT 结构：`isTokenExpired` 的行为（无 `exp` 则判定过期）已从代码确认属实。JWT 是否包含 `exp` 及过期时间的具体值是调试验证步骤而非诊断结论的前提——v2 不再将此作为确定性结论，第 11 节步骤 2/3 已明确建议验证。如果后端 JWT 不含 `exp` 字段，则该场景被用户能到达 Profile 页面的事实排除。 |
| **问题3：遗漏 `parseRole()` 函数分析** — `parseRole()` 是项目中唯一 role 运行时校验函数，在 store 初始化和 `syncFromStorage()` 中被调用但 `setAuth()` 中未被使用。 | **接受。** 新增 1.3 节（`parseRole()` 防御缺口），含完整调用/遗漏矩阵。同时新发现 `fetchProfile()` 是死代码（零调用点），同样绕过 `parseRole()`，暗示 role 同步逻辑的设计演进。新增第 7 节（`fetchProfile()` 死代码分析）记录此发现。`parseRole()` 的遗漏不是本问题的直接触发因素（因为用户能看到按钮说明 role='admin'，不需要 `parseRole()` 拦截），但它是理解 `setAuth()` 防御层设计意图的关键证据。 |
| **问题4：根因之间的交互关系未被分析** — 5 个根因平行列举但无交互分析。Token 过期和 role 覆盖可能协同作用。 | **接受。** 新增第 3 节（根因交互分析），将五条根因重新划分为"主要触发因素"、"结构性漏洞"、"防御层缺失"、"并行失效路径"、"不相关"五类角色。绘制了主要交互路径图（3.2 节），展示了 token 过期作为触发因素、role 覆盖决定 UI 状态、两者时间解耦的完整交互链。新增第 4 节（症状区分指南），通过用户实际看到的落地页面和附加症状来区分触发路径，供修复者在调试验证前进行低成本诊断。 |
| **`parseRole()` 在 store init 和 syncFromStorage 中的使用不对称** — 质询指出 `setAuth()` 中遗漏 `parseRole()` 但 store init 和 syncFromStorage 中有使用，这种不对称是重要的代码级证据。 | **接受。** 1.3 节详细记录了 7 个 role 写入点的 `parseRole()` 使用矩阵。分析指出 `parseRole()` 保护的是"从 sessionStorage 恢复"路径（信任边界在持久化层），而 `setAuth()` 等 API 响应路径和 BC 消息路径均绕过校验——这种不对称暗示要么是刻意信任后端/BC 数据，要么是防御性校验的疏漏。 |
| **根因 #2 应优先排查（token 过期）** — 质询建议优先排查"按钮渲染时 token 有效 → 用户点击 → token 过期 → 守卫拦截"的因果链，此链自洽且无需未验证的后端假设。 | **接受。** v2 将原根因 #2（token 过期）提升为 1.1 节"核心触发机制"，作为诊断的主要方向。其因果链完全自洽：唯一假设（token 在 Profile 页面停留期间过期）是时间流逝的自然结果，不需要对后端行为的任何特定假设。原根因 #1（role 覆盖）降级为 1.2 节"结构性漏洞"。 |
| **未通过用户报告的附加症状区分根因** — 质询指出不同根因导致用户看到不同页面（`/login` vs `/home` vs `/login`+Swal toast），应通过症状区分。 | **接受。** 新增第 4 节（症状区分指南），表格对比四种落地页面与触发因素的对应关系，以及 Swal error toast 作为 401 拦截器路径的附加线索。此区分方法不依赖代码断点或后端日志，仅需向用户确认观察到的行为和 URL。 |
| **未分析 `/user/profile` 返回 401 时 401拦截器 + loadProfile catch 的组合 UX** — 两者同时触发导致登录页叠加"加载失败"toast。 | **部分接受。** 1.5 节已记录此组合场景：拦截器跳转登录 + `loadProfile()` catch 分支的 error toast 同时触发。但指出此场景下用户看到的是 `profileError` 页面（不含菜单按钮），与问题描述的"用户能看到按钮"矛盾，因此此场景不是本问题的触发路径。 |
| **未分析 `UserProfile` 类型定义对诊断的影响** — `UserProfile extends User`，`User` 定义 `role: 'user' \| 'admin'`，若后端不返回 role 则是类型契约违背。 | **部分接受。** 此分析已被纳入影响范围表（第 9 节），增列"类型系统"影响项。但需指出：TypeScript 类型仅在编译时生效，运行时不校验——这正是根因 #3（`setAuth()` 无运行时校验）的核心。类型契约是否被违背取决于后端实现，属后端诊断范畴。 |
