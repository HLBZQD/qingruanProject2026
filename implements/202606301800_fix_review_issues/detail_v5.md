# 详细设计（v5）

## 概述

修复2个P1跨标签页认证同步缺陷，合并为1个任务：

1. **S10**: `src/stores/authStore.ts` — 修复 BroadcastChannel 三个缺陷叠加：消息无限回环、已登录启动时"聋子"、站内新标签页无 auth 数据。方案：(a) `onmessage` 添加去重守卫；(b) `syncFromStorage()` 有 token 路径末尾显式调用 `getBcChannel()`；(c) `syncFromStorage()` 空 token 路径移除 `clearAuth()` 调用，改为发送 `REQUEST_AUTH` 消息从其他标签页获取认证状态。
2. **S11**: `src/stores/chatStore.ts` — 修复 `sendStreamRequest()` 401 分支未重定向问题。方案：`Swal.default.fire()` 前加 `await` 等待 toast 自动关闭（2.5s），之后执行 `router.push('/login')`。
3. **todo.md 更新**: 将 S10/S11 在 `reviews/202606291800_full_review/todo.md` 中标记为已完成。

### 本轮范围边界

v5 仅覆盖 **P1 本迭代（S10/S11）**——两个跨标签页认证同步缺陷。本轮设计不覆盖其余 41 个未修复问题。

## 文件规划

| 文件路径 | 操作 | 职责 |
|---------|------|------|
| src/stores/authStore.ts | 修改 | getBcChannel() onmessage 添加去重守卫 + REQUEST_AUTH 处理；syncFromStorage() 空路径改为 REQUEST_AUTH 机制、有 token 路径追加 getBcChannel() 调用 |
| src/stores/chatStore.ts | 修改 | sendStreamRequest() 401 分支添加 await toast + router.push('/login') |
| reviews/202606291800_full_review/todo.md | 修改 | 将 S10/S11 标记为已完成，更新批次4状态 |

## 类型定义

本任务修改的是现有 TypeScript 文件（Pinia Setup Store），不新增独立类型文件。BroadcastChannel 消息格式沿用现有动态对象模式（与 `setAuth()` / `clearAuth()` 中 `postMessage` 格式一致），新增一消息类型。

### BcMessage 消息协议（类型层面为匿名对象，此处文档化格式）

**形态**：匿名对象字面量（通过 `postMessage` 发送，`onmessage` 中通过 `e.data` 动态属性访问）
**文件**：`src/stores/authStore.ts`（store 闭包内部）

**消息类型1 — AUTH_CHANGED**（已有，无变更）：

```
{ type: 'AUTH_CHANGED', token: string | null, role: 'user' | 'admin' | null, user: User | null, timestamp: number }
```

- 发送方：`setAuth()`（第78-84行）、`setToken()`（第62-68行）、`clearAuth()`（第126-132行）、REQUEST_AUTH 响应方（新增）
- 接收方：`onmessage` 处理器（去重守卫后调用 `setAuth()` 或 `clearAuth()`）
- `token` 为 `null` 时表示登出广播

**消息类型2 — REQUEST_AUTH**（新增）：

```
{ type: 'REQUEST_AUTH' }
```

- 发送方：`syncFromStorage()` 空 token 路径（新标签页 sessionStorage 为空时）
- 接收方：其他标签页 `onmessage` 处理器。若当前标签页已登录（`token.value` 非空），回复一条 AUTH_CHANGED 消息携带完整 token/role/user；若未登录，不回复（请求方 500ms 超时后保持未登录状态）

**类型关系**：无继承/实现。消息通过 `BroadcastChannel.postMessage()` 的结构化克隆算法传输，匿名对象满足 `postMessage` 的 `any` 参数类型。

## 修改规格

### 修改1：authStore.ts — getBcChannel() onmessage 去重守卫 + REQUEST_AUTH 处理

**文件**：`src/stores/authStore.ts`
**操作**：修改（替换第24-33行 `onmessage` 回调函数体）

**现状**（第19-38行）：

```typescript
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
    return null
  }
}
```

**变更**：

替换 `onmessage` 回调体（第24-33行）为：

```typescript
bcChannel.onmessage = (e: MessageEvent) => {
  const d = e.data
  if (d?.type === 'AUTH_CHANGED') {
    // 去重守卫：避免同标签页内 setAuth/clearAuth → postMessage → onmessage → setAuth/clearAuth 无限回环
    if (d.token === token.value && d.role === role.value) {
      return
    }
    if (d.token) {
      setAuth(d.token, d.role, d.user)
    } else {
      clearAuth()
    }
  } else if (d?.type === 'REQUEST_AUTH') {
    // 新标签页请求认证数据：当前标签页已登录时回复 AUTH_CHANGED
    if (token.value) {
      bcChannel!.postMessage({
        type: 'AUTH_CHANGED',
        token: token.value,
        role: role.value,
        user: user.value,
        timestamp: Date.now(),
      })
    }
    // 未登录时不回复，请求方 500ms 超时后保持未登录状态
  }
}
```

**关键设计决策**：

1. **去重比较仅使用 token 和 role**（不含 user 和时间戳）。`user` 可能包含可变字段（如 avatar），同一认证会话内 `token` 和 `role` 不变即可判定重复。`timestamp` 每次广播都不同，不能作为去重依据。
2. **REQUEST_AUTH 响应使用 `bcChannel!` 非空断言**：此时已通过 `if (bcChannel) return bcChannel` 守卫，`bcChannel` 必然非 null。使用 `!` 而非 `?.` 避免静默失败——若 BC 已关闭则抛出便于调试。
3. **REQUEST_AUTH 不回复 null-token 消息**：避免未登录标签页之间的无意义广播。请求方自身有 500ms 超时回退（见修改2）。

### 修改2：authStore.ts — syncFromStorage() 空 token 路径改造

**文件**：`src/stores/authStore.ts`
**操作**：修改（替换第98-101行）

**现状**（第87-106行）：

```typescript
function syncFromStorage() {
  const storedToken = sessionStorage.getItem('token')
  const storedRole = parseRole(sessionStorage.getItem('role'))
  let storedUser: User | null = null
  try {
    const raw = JSON.parse(sessionStorage.getItem('user') || 'null')
    if (raw && typeof raw === 'object' && typeof raw.id === 'number' && typeof raw.username === 'string' && (raw.role === 'user' || raw.role === 'admin')) {
      storedUser = raw as User
    }
  } catch { /* corrupted */ }

  if (!storedToken || !storedRole) {
    clearAuth()
    return
  }
  token.value = storedToken
  role.value = storedRole
  user.value = storedUser
  mustChangePassword.value = localStorage.getItem('must_change_password') === 'true'
}
```

**变更**：

替换第98-101行（`if (!storedToken || !storedRole)` 分支）为：

```typescript
if (!storedToken || !storedRole) {
  // 不调用 clearAuth()！否则新标签页打开时 BC 广播 null-token AUTH_CHANGED，
  // 导致其他已登录标签页收到广播后也执行 clearAuth()——即新标签页登出所有标签页。
  // 替代方案：通过 BC 请求其他标签页的认证数据（REQUEST_AUTH 协议）
  const bc = getBcChannel()
  if (bc) {
    // 保存原有 onmessage 处理器，安装临时监听器等待 AUTH_CHANGED 回复
    const originalOnmessage = bc.onmessage
    const timeout = setTimeout(() => {
      // 500ms 超时无回复：恢复原有 onmessage，保持未登录状态
      bc.onmessage = originalOnmessage
    }, 500)
    bc.onmessage = (e: MessageEvent) => {
      const d = e.data
      if (d?.type === 'AUTH_CHANGED' && d.token) {
        // 其他标签页回复了认证数据 → 同步登录
        clearTimeout(timeout)
        bc.onmessage = originalOnmessage
        setAuth(d.token, d.role, d.user)
      } else if (d?.type === 'AUTH_CHANGED' && !d.token) {
        // 其他标签页也未登录 → 保持未登录
        clearTimeout(timeout)
        bc.onmessage = originalOnmessage
      } else {
        // 非 AUTH_CHANGED 消息（如 REQUEST_AUTH），交给原有处理器
        if (typeof originalOnmessage === 'function') {
          originalOnmessage.call(bc, e)
        }
      }
    }
    bc.postMessage({ type: 'REQUEST_AUTH' })
  }
  return
}
```

**关键设计决策**：

1. **移除 `clearAuth()` 调用是核心变更**。原代码中 `clearAuth()` 会广播 `AUTH_CHANGED`（token=null），导致其他已登录标签页收到广播后也执行 `clearAuth()`。这是 S10-3 的根本缺陷。
2. **超时 500ms**：同源标签页间的 BC 消息延迟通常在 1-5ms 内（同一浏览器进程内 postMessage 是同步的）。500ms 提供充足余量而不造成可感知的启动延迟。
3. **`originalOnmessage` 可能是 `null`**：当 `getBcChannel()` 首次创建 `bcChannel` 但 `onmessage` 尚未赋值时（理论上不会发生，因 `getBcChannel()` 内部同步赋值 `onmessage`；但防御性编码中检查 `typeof originalOnmessage === 'function'` 以覆盖 null/undefined 情况）。
4. **临时监听器内收到非 AUTH_CHANGED 消息时转发给原有处理器**：若在 500ms 窗口内收到 REQUEST_AUTH（极低概率），不应静默丢弃。调用 `originalOnmessage.call(bc, e)` 以保持 `this` 绑定。
5. **`setAuth()` 调用会触发 BC 广播**：临时监听器内调用 `setAuth()` → `getBcChannel()?.postMessage(...)` 广播 AUTH_CHANGED → 此时 `bcChannel` 已存在（我们在 `getBcChannel()` 调用后），`postMessage` 正常发送 → 但 `onmessage` 仍是临时处理器 → 临时处理器恢复 `originalOnmessage` 后才放行 → 其他标签页的永久处理器收到广播后经去重守卫生效。**注意**：自己发送的广播不会触发自己的 `onmessage`（BroadcastChannel 规范：`postMessage` 不发送给自身），因此不会进入临时处理器的 `AUTH_CHANGED` 分支。

### 修改3：authStore.ts — syncFromStorage() 有 token 路径追加 BC 监听初始化

**文件**：`src/stores/authStore.ts`
**操作**：修改（在第105行 `mustChangePassword.value = ...` 之后追加一行）

**现状**（第102-105行）：

```typescript
token.value = storedToken
role.value = storedRole
user.value = storedUser
mustChangePassword.value = localStorage.getItem('must_change_password') === 'true'
```

**变更**：在第105行之后追加一行：

```typescript
// 初始化 BC 监听，使本标签页可以接收其他标签页的认证变更广播
getBcChannel()
```

**关键设计决策**：

1. **仅在"有 token"路径调用 `getBcChannel()`**。"无 token"路径已在修改2中通过 `getBcChannel()` 发送 REQUEST_AUTH，BC 通道已初始化。
2. **`getBcChannel()` 是幂等的**：`if (bcChannel) return bcChannel` 守卫确保重复调用不创建新通道。
3. **调用位置在 `mustChangePassword.value` 之后**：确保所有状态恢复完毕后再建立监听，避免监听器触发时状态不一致。

### 修改4：chatStore.ts — sendStreamRequest() 401 分支时序修复

**文件**：`src/stores/chatStore.ts`
**操作**：修改（替换第303-317行 401 处理分支）

**现状**（第303-317行）：

```typescript
if (response.status === 401) {
  const { useAuthStore } = await import('@/stores/authStore')
  useAuthStore().clearAuth()
  const Swal = await import('sweetalert2')
  Swal.default.fire({
    toast: true,
    position: 'top',
    icon: 'info',
    title: '登录已过期，请重新登录',
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
  })
  isStreaming.value = false
  return
}
```

**变更**：替换为：

```typescript
if (response.status === 401) {
  const { useAuthStore } = await import('@/stores/authStore')
  useAuthStore().clearAuth()
  const Swal = await import('sweetalert2')
  // await 等待 toast 自动关闭（timer: 2500ms），避免页面跳转中断 toast 显示
  await Swal.default.fire({
    toast: true,
    position: 'top',
    icon: 'info',
    title: '登录已过期，请重新登录',
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
  })
  isStreaming.value = false
  router.push('/login')
  return
}
```

**关键设计决策**：

1. **`await Swal.default.fire(...)` 是关键变更**：不加 `await` 时，`router.push('/login')`（若存在）或 `return` 会立即执行，页面跳转/函数退出导致 toast DOM 被移除，用户看不到提示。`await` 阻塞直到 toast 自动关闭（2.5s timer）或用户手动关闭。
2. **`router.push('/login')` 在 `isStreaming.value = false` 之后执行**：先重置流式状态，再跳转。顺序敏感——若先跳转后重置，Vue 响应式系统在组件卸载时可能不触发状态更新。
3. **`router` 实例已在文件顶部第14行导入**（`import { router } from '@/router'`），无需新增导入语句。
4. **`clearAuth()` 先于 toast 执行**：`clearAuth()` 清除 token + BC 广播其他标签页。若先显示 toast 再 `clearAuth()`，用户可能在其他标签页仍看到登录态，造成状态不一致窗口。
5. **SweetAlert2 `fire()` 返回 Promise**：当 `timer` 设置时，Promise 在 toast 自动关闭后 resolve。当用户手动点击关闭时，Promise 也 resolve。无论哪种关闭方式，后续跳转都正常执行。
6. **保留动态 import**：`useAuthStore` 和 `sweetalert2` 使用动态 import 避免 Pinia 循环依赖和模块初始化顺序问题。本轮 S10/S11 仅关注 401 功能修复，不涉及 G11（静态导入 SweetAlert2）的范围。

## 错误处理

### BroadcastChannel 不可用降级

`getBcChannel()` 已有 `try/catch` 包裹，当浏览器不支持 BroadcastChannel 时返回 `null`。所有 BC 调用均通过 `?.` 可选链或 `if (bc)` 守卫，降级路径为：

- **S10-1 去重守卫**：无 BC → 无 onmessage → 无回环风险，天然安全
- **S10-2 已登录启动**：`getBcChannel()` 返回 null → 不建立监听 → 本标签页无法接收其他标签页的登出广播。降级影响：跨标签页登出不同步，但单标签页功能完整。
- **S10-3 新标签页**：`getBcChannel()` 返回 null → 跳过 REQUEST_AUTH → 保持未登录状态。降级影响：新标签页需手动登录。

### onmessage 异常处理

`onmessage` 回调中不添加 try-catch：`setAuth()` 和 `clearAuth()` 内部操作均为同步（ref 赋值 + sessionStorage 写入 + postMessage），不会抛出异常。若未来 `setAuth` 改为异步，调用方（onmessage）需同步添加错误处理。

### router.push 异常

`router.push('/login')` 可能因重复导航到当前路由而触发 `NavigationDuplicated` 错误（Vue Router 默认行为）。当前项目未配置全局导航错误处理，若用户已在 `/login` 页面时触发 401，`router.push('/login')` 将在 console 产生未捕获 Promise rejection。**本轮不处理此边缘情况**——用户已在登录页时不应有活跃 SSE 连接（登录页无 AI 对话功能）。

## 行为契约

### S10 跨标签页认证同步状态机

| 场景 | 前置条件 | 触发 | 行为 | 后置条件 |
|------|---------|------|------|---------|
| 标签页A登录 | A未登录 | `login()` → `setAuth()` | A BC广播 AUTH_CHANGED(token) | A已登录，BC消息发出 |
| 标签页B收到登录广播 | B已打开，BC监听中 | B onmessage收到A的AUTH_CHANGED | B去重守卫检查→token不同→`setAuth()` | B同步登录 |
| 标签页A登出 | A已登录 | `logout()` → `clearAuth()` | A BC广播 AUTH_CHANGED(null) | A已登出，BC消息发出 |
| 标签页B收到登出广播 | B已登录，BC监听中 | B onmessage收到A的null-AUTH_CHANGED | B去重守卫检查→token不同→`clearAuth()` | B同步登出 |
| 新标签页C打开 | C sessionStorage为空 | `syncFromStorage()` 空路径 | C发送REQUEST_AUTH，A回复AUTH_CHANGED(token) | C同步登录（500ms内） |
| 所有标签页均未登录时打开C | 所有标签页token=null | `syncFromStorage()` 空路径 | C发送REQUEST_AUTH，500ms超时无人回复 | C保持未登录 |
| A自身广播回环 | A setAuth/clearAuth后BC广播 | A onmessage收到自己的AUTH_CHANGED | 去重守卫(token===token) → return | 无变化，回环中断 |
| A/B间无限ping-pong | A收到B的AUTH_CHANGED→setAuth→广播 | B收到A的AUTH_CHANGED→setAuth→广播 | 经去重守卫后token相同，双方skip | ping-pong中断 |

### S11 SSE 401 处理时序

| 步骤 | 操作 | 耗时 | 说明 |
|------|------|------|------|
| 1 | `response.status === 401` 命中 | 0ms | fetch 返回 |
| 2 | `useAuthStore().clearAuth()` | <1ms | 同步清理 token/role/user + BC广播 |
| 3 | `import('sweetalert2')` | <50ms | 动态导入（首次）或模块缓存（后续） |
| 4 | `await Swal.default.fire(...)` | ~2500ms | toast 显示，await 阻塞直到自动关闭 |
| 5 | `isStreaming.value = false` | <1ms | 重置流式状态 |
| 6 | `router.push('/login')` | ~10ms | Vue Router 导航 |
| 7 | `return` | 0ms | 退出函数 |

**前置条件**：`isStreaming.value === true`（第298行设置）
**后置条件**：`isStreaming.value === false`、token=null、当前路由为 `/login`

## 依赖关系

### 被依赖的已有模块

| 依赖项 | 来源 | 用途 |
|--------|------|------|
| `token` / `role` / `user` (ref) | authStore 闭包内（第41-53行） | onmessage 去重比较、REQUEST_AUTH 响应数据源 |
| `setAuth()` | authStore 闭包内（第71-85行） | onmessage 收到 token 非空时同步认证 + BC 广播 |
| `clearAuth()` | authStore 闭包内（第108-133行） | onmessage 收到 null-token 时清除认证 |
| `getBcChannel()` | authStore 闭包内（第19-38行） | syncFromStorage 中建立 BC 监听 / 发送 REQUEST_AUTH |
| `BroadcastChannel` | 浏览器 Web API | 跨标签页消息通道 |
| `router` | `@/router`（chatStore.ts 第14行） | 401 后跳转 `/login` |
| `useAuthStore` | `@/stores/authStore`（chatStore.ts 动态 import） | 401 后调用 `clearAuth()` |
| `sweetalert2` | npm 包（chatStore.ts 动态 import） | 401 toast 提示 |

### 暴露给后续任务的接口

本轮仅修改现有函数的内部实现，不改变任何公开接口签名：

- `getBcChannel()` 签名不变：`() => BroadcastChannel | null`
- `syncFromStorage()` 签名不变：`() => void`
- `setAuth()` 签名不变：`(newToken: string, newRole: 'user' | 'admin', newUser: User) => void`
- `clearAuth()` 签名不变：`() => void`
- `sendStreamRequest()` 签名不变：`(mode: 'doctor' | 'assistant' | 'admin', fetchResponse: () => Promise<Response>) => Promise<void>`

### 与已完成批次的关联

- **v1 (R1) S9**：`clearAuth()` 中已补充 `chatStore.clearAllConversations()` + `riskFormStore.reset()`。S11 的 `clearAuth()` 调用将触发这些已添加的清理逻辑 + BC 广播 null-token → S10 onmessage 去重守卫处理。
- **v1 (R1) S8**：DoctorChatView.vue 已补充组件导入。401 发生后 `router.push('/login')` 跳转登录页，与 DoctorChatView 的 SSE 清理互不干扰。
- **v3 (R3) S5/S6**：后端安全修复。S11 的 401 分支不涉及后端变更。

## 修订说明（v5 r1）

| 审查意见 | 修改措施 |
|---------|---------|
| [一般] S10-3 — syncFromStorage 空路径中 clearAuth() 与 REQUEST_AUTH 的冲突未明确。原任务描述"发送 REQUEST_AUTH 消息"措辞模糊，未说明需移除 clearAuth()，可能导致实现者保留 clearAuth() 造成所有标签页被登出 | 在修改2中明确写为"移除 clearAuth() 调用"，提供完整替代代码（含临时 onmessage 监听器、500ms 超时回退、REQUEST_AUTH 发送逻辑）。行为契约表覆盖"所有标签页均未登录时打开C"场景：发送REQUEST_AUTH→500ms超时→保持未登录 |
| [轻微] S10-3 — REQUEST_AUTH 消息格式未定义，可能导致实现者自行猜测 | 在类型定义中新增 "消息类型2 — REQUEST_AUTH" 明确定义格式 `{ type: 'REQUEST_AUTH' }` 及回复格式（复用 AUTH_CHANGED 格式携带完整 token/role/user） |
| [轻微] S11 — router.push 与 SweetAlert2 toast 时序未考虑。立即跳转会中断 2.5 秒 toast 显示 | 在修改4中将 `Swal.default.fire(...)` 前添加 `await`，确保 toast 自动关闭后再执行 `router.push('/login')`。行为契约新增 S11 时序表：6步操作及预估耗时 |
