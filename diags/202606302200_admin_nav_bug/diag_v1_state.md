# 诊断报告：管理员点击"智能管理"无法跳转到 /admin

## 问题现象

管理员账号在"我的"（Profile）页面可以看到"智能管理"功能入口，但点击该入口后无法正常跳转到 `/admin` 智能管理页面。

## 诊断范围

状态管理与路由层。

---

## 1. 根因定位

### 根因 #1（主要嫌疑）：`loadProfile()` 无条件覆盖 `authStore.role`，与路由守卫形成状态竞争

**位置：**
- `src/views/Profile.vue` 第 64-73 行 — `loadProfile()` 调用 `authStore.setAuth(storedToken, res.data.data.role, {...})`
- `src/stores/authStore.ts` 第 87-101 行 — `setAuth()` 无条件写入 `role.value = newRole`
- `src/router/index.ts` 第 114 行 — 路由守卫检查 `authStore.role !== 'admin'`

**因果链：**

```
登录 API 返回 role='admin'
  → authStore.setAuth(token, 'admin', user)  // role='admin' 存入 sessionStorage
  → 导航到 Profile
  → onMounted 触发 loadProfile()
  → api.get('/user/profile') 返回 { role: ??? }
  → authStore.setAuth(storedToken, res.data.data.role, ...)  // role 被无条件覆盖！
  → authStore.isAdmin 基于被覆盖后的 role 计算
  → 菜单项"智能管理"的可见性由 isAdmin 控制
  → 点击后路由守卫检查 authStore.role !== 'admin'
```

**核心矛盾：** 两个 API 端点（`/auth/login` 与 `/user/profile`）各自返回 `role`，`/user/profile` 的返回值后发生、无条件覆盖前者在 sessionStorage 和 Pinia store 中的值。没有任何校验确保两次返回值一致。

**触发条件（以下任一成立即可触发）：**
- `/user/profile` 端点返回的 `role` 为 `null`、`undefined`、空字符串或 `'user'`（而非 `'admin'`），导致 `role` 被覆盖为非法值或非管理员值
- `/user/profile` 端点未返回 `role` 字段（`res.data.data.role` 为 `undefined`），`setAuth` 的 `newRole` 参数类型标注为 `'user' | 'admin'`，但 TypeScript 在运行时不校验，`role.value` 被赋值为 `undefined`，`isAdmin` 变为 `false`

**对用户可见行为的影响（取决于覆盖发生的时间点）：**
- 若 `/user/profile` 在用户点击"智能管理"前返回且 role 被错误覆盖：菜单项"智能管理"会因为 `isAdmin` 变为 `false` 而从 DOM 中消失（响应式），用户看到菜单项闪现后消失
- 若用户恰好在 `loadProfile()` 进行中点击（骨架屏期间本不可交互，但如果 API 极快返回且用户快速点击）：角色已被覆盖，守卫跳转至 `/home`（静默重定向）
- 若 `/user/profile` 返回 401：触发 axios 拦截器静默清除认证并跳转到登录页（见根因 #3）

---

### 根因 #2：`isTokenExpired` 对缺少 `exp` 声明的 JWT 一律判定为过期——守卫在 token 检查阶段即拦截

**位置：**
- `src/composables/useAuth.ts` 第 70-77 行 — `isTokenExpired()` 函数
- `src/router/index.ts` 第 108-111 行 — 路由守卫调用点

**代码证据：**

```typescript
// useAuth.ts:70-77
export function isTokenExpired(token: string): boolean {
  const payload = parseToken(token)
  if (!payload || typeof payload.exp !== 'number') {
    // 无 exp 视为过期，避免无过期时间的 token 长期有效
    return true
  }
  return Math.floor(Date.now() / 1000) >= payload.exp
}
```

```typescript
// router/index.ts:108-111
if (!authStore.token || isTokenExpired(authStore.token)) {
    authStore.clearAuth()  // 清除 role、token、user、sessionStorage、localStorage
    const redirect = encodeURIComponent(to.fullPath)
    return next({ path: '/login', query: { redirect } })
}
```

**触发条件：**
- 后端签发的 JWT 中 `payload.exp` 字段缺失（`exp` 在 RFC 7519 中为可选声明）或为非数字类型
- Token 确实已过期（`Date.now() / 1000 >= exp`）

**因果链：**
```
JWT 缺少 exp → isTokenExpired() → true
  → 守卫: authStore.clearAuth()
  → role 被清为 null, token 被清为 null
  → 所有 sessionStorage 中的认证数据被清除
  → 广播 null-token AUTH_CHANGED 到其他标签页（连锁登出）
  → 跳转到 /login?redirect=%2Fadmin
  → 用户看到的是登录页，而非管理页
```

**为什么用户在 Profile 页面时没有触发：** 如果 JWT 完全没有 `exp`，导航到 `/profile` 时守卫也会拦截。用户能到达 Profile 页面说明导航时 token 通过了检查。但这不排除 token 在 Profile 页面停留期间真正过期，或 `parseToken` 对同一 token 在不同时刻返回不同结果（极端情况：base64 解码边界 bug）。

---

### 根因 #3（辅助嫌疑）：401 响应拦截器在任何 API 调用期间静默清除认证并跳转登录——发生在路由守卫之外

**位置：** `src/composables/useApi.ts` 第 40-48 行

**代码证据：**

```typescript
api.interceptors.response.use(
  (res) => { /* ... */ },
  (err) => {
    if (err.response?.status === 401) {
      const authStore = useAuthStore()
      authStore.clearAuth()  // 清除 role、token、user
      const redirect = encodeURIComponent(window.location.pathname + window.location.search)
      showInfo('登录已过期，请重新登录')
      router.push('/login?redirect=' + redirect)
    }
    return Promise.reject(err)
  },
)
```

**机制：** 该拦截器在路由守卫体系外独立运作。任何时候有 API 调用返回 401（包括 Profile 页面的 `loadProfile()` 中的 `/user/profile` 调用），即触发：
1. `authStore.clearAuth()` — 清除所有认证状态（含 `role`）
2. `router.push('/login?...')` — 跳转登录页
3. BroadcastChannel 广播 null-token 到其他标签页

**在 Profile 页面上的具体影响：**
```
用户在 Profile 页面
  → loadProfile() 调用 api.get('/user/profile')
  → 服务器返回 401
  → 拦截器立即 clearAuth() + router.push('/login')
  → 用户被静默跳转到登录页
  → loadProfile() 的 catch 分支随后执行（设置 profileError=true），
     但用户已不在 Profile 页面
```

此机制同样存在于 `chatStore.ts` 第 303-319 行（`sendStreamRequest` 中处理 SSE 返回 401），但该路径仅在用户已到达 Admin 页面并发送消息后触发，不直接解释"点击入口后无法跳转"的问题。

---

### 根因 #4：`mustChangePassword` 的 localStorage 持久化导致管理员被重定向到改密页面

**位置：**
- `src/stores/authStore.ts` 第 70 行 — `mustChangePassword` 从 `localStorage` 初始化
- `src/stores/authStore.ts` 第 188-191 行 — 登录时条件性设置
- `src/router/index.ts` 第 118-121 行 — 守卫拦截

**代码证据：**

```typescript
// authStore.ts:70
const mustChangePassword = ref(localStorage.getItem('must_change_password') === 'true')

// authStore.ts:188-191（login 函数内）
if (data.must_change_password) {
  mustChangePassword.value = true
  localStorage.setItem('must_change_password', 'true')
}

// router/index.ts:118-121
if (authStore.mustChangePassword && to.path !== '/change-password') {
  return next({ path: '/change-password', replace: true })
}
```

**机制：** `mustChangePassword` 使用 `localStorage`（非 `sessionStorage`），跨标签页和会话持久化。如果管理员的 `mustChangePassword` 标志为 `true`：
1. 导航到 `/profile` 时已被拦截并跳转 `/change-password` — 但守卫检查顺序中，`mustChangePassword` 在第 118 行，在 token 检查（第 108 行）和 admin 角色检查（第 114 行）之后。如果管理员用户能到达 Profile 页面，说明该标志此时为 `false`
2. 在 Profile 页面停留期间，该标志不会自发改变（没有定时器或后台轮询修改它）
3. 因此该根因不能单独解释本问题，但它是守卫链中的静默重定向点之一

---

### 根因 #5：`syncFromStorage()` 的 BroadcastChannel 竞态窗口

**位置：** `src/stores/authStore.ts` 第 103-154 行

**机制：** 当 sessionStorage 中缺少 token 或 role 时，`syncFromStorage()` 进入 REQUEST_AUTH 协议：
1. 保存永久 `onmessage` 处理器（第 121 行）
2. 安装 500ms 超时临时 `onmessage` 处理器（第 126-143 行）
3. 发送 `REQUEST_AUTH` 广播（第 144 行）

**竞态：** 临时处理器（第 126-143 行）缺少永久处理器中的去重守卫（第 28 行）：
```typescript
// 永久处理器有去重：
if (d.token === token.value && d.role === role.value) { return }

// 临时处理器无去重 —— 可能重复调用 setAuth()
```

**但在本问题中的实际影响有限：** 用户能看到"智能管理"说明 sessionStorage 中存在有效的 role='admin'。`syncFromStorage()` 会走第 148-153 行的快速路径（`storedToken && storedRole` 均存在），不会进入 BC 协议。该根因仅在 sessionStorage 数据丢失时相关。

---

## 2. 导航守卫完整放行/拦截矩阵

以 `/admin` 路由（`{ requiresAuth: true, requiresAdmin: true }`）为目标，守卫检查顺序：

| 检查步骤 | 代码位置 | 拦截条件 | 失败后果 |
|---------|---------|---------|---------|
| 1. 公开路由跳过 | router/index.ts:104 | `to.meta.requiresAuth === false` | 直接放行（/admin 不适用） |
| 2. Token 有效性 | router/index.ts:108 | `!token \|\| isTokenExpired(token)` | `clearAuth()` + 跳转 `/login` |
| 3. Admin 角色 | router/index.ts:114 | `role !== 'admin'` | 跳转 `/home`（静默） |
| 4. 强制改密 | router/index.ts:118 | `mustChangePassword && to.path !== '/change-password'` | 跳转 `/change-password`（静默） |
| 5. 免责声明 | router/index.ts:123 | `requiresDisclaimer && !hasAcceptedDisclaimer()` | 弹窗或拒绝后回退 |

对于 `/admin` 路由，`requiresDisclaimer` 未设置，步骤 5 跳过。

---

## 3. `authStore.role` 在导航时的确切值 —— 数据流追踪

### role 的所有写入点

| 写入点 | 位置 | 触发时机 | 写入值来源 |
|-------|------|---------|-----------|
| 初始化 | authStore.ts:58 | Store 创建（`useAuthStore()` 首次调用） | `sessionStorage.getItem('role')` |
| `setAuth()` | authStore.ts:89 | 登录成功 / loadProfile 成功 / BC 同步 | 参数 `newRole` |
| `fetchProfile()` | authStore.ts:206 | 主动刷新资料（暂无调用点） | API `/user/profile` 响应 |
| `syncFromStorage()` | authStore.ts:149 | 应用启动（main.ts） | `sessionStorage.getItem('role')` |
| `clearAuth()` | authStore.ts:158 | 登出 / token 过期 / 401 拦截 | 设为 `null` |
| BC onmessage | authStore.ts:32 | 其他标签页广播 AUTH_CHANGED | 消息 `d.role` |

### 从"用户看到智能管理"到"点击"之间的 role 时间线

```
T0: app 启动
    main.ts → syncFromStorage()
    → sessionStorage 有 token + role='admin'
    → role.value = 'admin', isAdmin = true

T1: 导航到 /profile
    守卫: token 检查通过, role 检查跳过, mustChangePassword 检查通过
    → Profile 组件挂载

T2: onMounted → loadProfile() 启动
    profileLoading = true → 骨架屏

T3: api.get('/user/profile') 返回
    → authStore.setAuth(storedToken, res.data.data.role, {...})
    → role.value = res.data.data.role   ← 关键覆盖点！
    → sessionStorage.setItem('role', res.data.data.role)
    → BC 广播 AUTH_CHANGED

T4: profileLoading = false
    → 菜单渲染，isAdmin 取决于 T3 覆盖后的 role

T5: 用户点击"智能管理"
    → router.push('/admin')
    → 守卫: authStore.role 此时等于 T3 覆盖后的值
```

**核心问题：** T3 步骤中 `res.data.data.role` 的值决定了 T5 时刻守卫的行为。如果 `/user/profile` 的返回值与 `/auth/login` 的返回值不一致，`role` 在用户无感知的情况下被改变。

---

## 4. 静默重定向的识别

存在以下静默重定向（无用户提示的跳转）：

1. **`/home` 重定向**（router/index.ts:115）— 当 `authStore.role !== 'admin'` 时，`return next('/home')` 不带任何 toast 或提示
2. **`/change-password` 重定向**（router/index.ts:120）— 当 `mustChangePassword === true` 时，跳转到改密页，`replace: true` 使后退按钮不回到原页面
3. **`/login` 重定向**（router/index.ts:111）— token 过期时跳转登录，query 中携带 redirect 参数；同时 `clearAuth()` 副作用包括 BroadcastChannel 广播致其他标签页登出

其中 #1 和 #2 对用户完全静默。管理员点击"智能管理"后若角色被覆盖为 `'user'`，将被静默重定向到 `/home`——这是本问题最可能的表现形式。

---

## 5. 影响范围

| 影响项 | 范围 |
|-------|------|
| 受影响的用户 | 所有角色为 `admin` 的用户，在访问 Profile 页面后 |
| 受影响的入口 | Profile 页面的"智能管理"菜单项（line 262） |
| 受影响的组件 | `Profile.vue`（loadProfile）、`authStore.ts`（setAuth/role）、`router/index.ts`（守卫）、`useApi.ts`（401 拦截器） |
| 连锁影响 | `clearAuth()` 通过 BroadcastChannel 广播 `AUTH_CHANGED(token: null)` 导致同一 origin 下所有已登录标签页同时登出 |
| 持久化影响 | `mustChangePassword` 使用 localStorage 而非 sessionStorage，跨会话存活，可能阻塞管理员多次登录后的导航 |

---

## 6. 证据摘要

| # | 发现 | 严重程度 | 确定性 |
|---|------|---------|--------|
| 1 | `loadProfile()` 无条件以 `/user/profile` 返回值覆盖 `authStore.role`，与 `/auth/login` 返回值无一致性校验 | 高 | 代码确认 |
| 2 | `isTokenExpired()` 将无 `exp` 字段的 JWT 视为过期，若后端 JWT 不含 `exp` 则所有认证路由不可达 | 高 | 代码确认 |
| 3 | 401 响应拦截器在路由守卫体系外独立清除认证状态并跳转登录，可在 Profile 页面 `loadProfile()` 调用期间触发 | 高 | 代码确认 |
| 4 | `requiresAdmin` 守卫失败时静默重定向到 `/home`，无任何用户提示 | 中 | 代码确认 |
| 5 | `mustChangePassword` 使用 localStorage 持久化，跨会话存活；守卫拦截时静默跳转 | 中 | 代码确认 |
| 6 | `syncFromStorage()` BC 临时 onmessage 处理器缺少去重守卫，500ms 窗口内可能重复处理 | 低 | 代码确认 |
| 7 | `setAuth()` TypeScript 类型标注 `newRole: 'user' \| 'admin'` 在运行时无校验，`undefined`/`null` 可穿透 | 中 | 代码确认 |

---

## 7. 推荐的调试验证步骤（供修复者参考）

以下步骤不构成修复方案，仅用于在修复前确认根因：

1. 在 `src/stores/authStore.ts` 的 `setAuth()` 函数（第 88-89 行）添加 `console.log`，记录 `newRole` 参数的实际值，确认 `/user/profile` 返回的 role 是否与登录时一致
2. 在浏览器 DevTools Application > Session Storage 中观察 `role` 键的值在 Profile 页面加载前后的变化
3. 在 `src/router/index.ts` 第 108 行前添加断点，确认导航到 `/admin` 时 `authStore.token` 和 `isTokenExpired(authStore.token)` 的实际返回值
4. 在 `src/router/index.ts` 第 114 行前添加断点，确认 `authStore.role` 在守卫执行时的确切值
5. 检查后端 `/user/profile` API 的响应体中 `role` 字段是否存在且值与 `/auth/login` 一致
6. 解码当前使用的 JWT token（jwt.io 或 `parseToken()`），确认 `exp` 字段是否存在及是否在未来
