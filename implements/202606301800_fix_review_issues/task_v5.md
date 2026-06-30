# 任务指令（v5）

## 动作
NEW

## 任务描述
修复2个P1跨标签页认证同步缺陷，合并为1个任务（两者紧密相关，均涉及认证状态同步）：

### S10 — authStore BroadcastChannel 三个缺陷叠加

**位置**: `src/stores/authStore.ts:23-31, 76-82, 85-104, 122-128`

**子问题1: 消息无限回环**（第24-31行）

`getBcChannel()` 中的 `onmessage` 收到 `AUTH_CHANGED` 消息后无条件调用 `setAuth()` 或 `clearAuth()`，而这两个函数末尾均调用 `getBcChannel()?.postMessage(...)` 重广播。导致两标签页间形成无限 ping-pong 循环。

修复：在 `onmessage` 中添加去重守卫——比较收到的 `d.token` / `d.role` 与当前 `token.value` / `role.value` 是否一致，一致则跳过。

**子问题2: 已登录启动时"聋子"**（第87-106行）

`syncFromStorage()` 从 sessionStorage 恢复 token 后未调用 `getBcChannel()` 初始化 BC 监听，导致该标签页收不到其他标签页的认证变更广播。

修复：在 `syncFromStorage()` 中 token 恢复成功的路径（第102-105行之后）显式调用 `getBcChannel()` 建立监听。注意：此调用仅针对"有 token"的路径；"无 token"的路径由子问题3处理，走 REQUEST_AUTH 流程。

**子问题3: 站内新标签页无 auth 数据**

sessionStorage 按标签页隔离，新标签页（Ctrl+点击链接、右键新窗口打开等）打开时 sessionStorage 为空，`syncFromStorage()` 找不到 token → 判定未登录。

修复（关键——必须移除原有 `clearAuth()` 调用）：

当前代码在 sessionStorage 为空时（第98-101行）调用 `clearAuth()`，该函数会广播 `AUTH_CHANGED`（token=null），导致其他已登录标签页收到广播后也执行 `clearAuth()`——即新标签页打开会登出所有标签页。修复步骤如下：

1. **移除**第98-101行的 `clearAuth()` 调用（含 `return` 语句），替换为以下逻辑：
   ```typescript
   if (!storedToken || !storedRole) {
     // 不调用 clearAuth()！改为请求其他标签页的认证数据
     const bc = getBcChannel()
     if (bc) {
       // 临时监听器：接收其他标签页回复的 AUTH_CHANGED
       const originalOnmessage = bc.onmessage
       const timeout = setTimeout(() => {
         // 超时无回复，恢复原有 onmessage，保持未登录状态
         bc.onmessage = originalOnmessage
       }, 500)
       bc.onmessage = (e: MessageEvent) => {
         const d = e.data
         if (d?.type === 'AUTH_CHANGED' && d.token) {
           clearTimeout(timeout)
           bc.onmessage = originalOnmessage
           setAuth(d.token, d.role, d.user)
         } else if (d?.type === 'AUTH_CHANGED' && !d.token) {
           // 其他标签页也未登录，保持未登录
           clearTimeout(timeout)
           bc.onmessage = originalOnmessage
         } else {
           // 其他类型消息，交给原有处理器
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

2. 在 `onmessage` 处理器（`getBcChannel()` 内部，第24-33行）中新增 `REQUEST_AUTH` 消息类型的处理：收到 `REQUEST_AUTH` 后，若当前标签页已登录（`token.value` 非空），则回复一条 `AUTH_CHANGED` 消息携带当前 token/role/user。

### S11 — sendStreamRequest 401 处理未重定向

**位置**: `src/stores/chatStore.ts:303-317`

SSE fetch 返回 401 时调用 `useAuthStore().clearAuth()` 清除认证状态，但未执行 `router.push('/login')` 跳转登录页。用户停留在当前页面但认证状态已清除，后续操作将静默失败。

修复：在 401 处理分支中，将 `router.push('/login')` 放在 SweetAlert2 toast 关闭之后执行，避免页面跳转中断 toast 显示：

```typescript
if (response.status === 401) {
  const { useAuthStore } = await import('@/stores/authStore')
  useAuthStore().clearAuth()
  const Swal = await import('sweetalert2')
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

关键改动：
- `Swal.default.fire(...)` 前加 `await`——等待 toast 关闭（2.5秒后自动关闭）后再执行跳转
- `router.push('/login')` 放在 `isStreaming.value = false` 之后、`return` 之前
- `router` 已在文件顶部第14行导入（`import { router } from '@/router'`），无需新增导入

## 选择理由

P1 批次剩余问题。S10 和 S11 紧密相关：
- 两者都涉及认证状态在不同上下文中的同步（S10 跨标签页，S11 跨会话过期）
- S11 的 `clearAuth()` 调用会触发 S10 的 BC 广播，两者存在执行耦合
- 同一文件组（authStore.ts + chatStore.ts，均为 Pinia store），修改上下文相邻
- 修复后可一起验证跨标签页 + 会话过期的完整认证流程

## 任务上下文

### 审查报告原文

来源：`reviews/202606291800_full_review/todo.md`，Round 2 代码质量审查。

### S10 详细要求

1. `onmessage` 去重守卫：
   ```
   收到 AUTH_CHANGED 时比较 d.token === token.value && d.role === role.value
   若完全一致 → return（跳过，防止回环）
   不一致 → 继续执行原有逻辑（设置或清除）
   ```

2. `syncFromStorage()` 添加 `getBcChannel()` 调用：
   - 在恢复 token 后调用 `getBcChannel()` 建立监听
   - 对于子问题3，当 sessionStorage 无 token 时，发送 `REQUEST_AUTH` 消息
   
3. BC 消息协议扩展：
   - 新增消息类型 `REQUEST_AUTH`：新标签页请求认证数据
     - 消息格式：`{ type: 'REQUEST_AUTH' }`
   - 收到 `REQUEST_AUTH` 的标签页，若已登录（`token.value` 非空），回复 `AUTH_CHANGED` 携带完整 token/role/user（与 `setAuth()` 广播的格式完全一致）：
     - 回复格式：`{ type: 'AUTH_CHANGED', token: string, role: 'user'|'admin', user: User, timestamp: number }`
   - 请求方收到 `AUTH_CHANGED` 回复后调用 `setAuth()` 完成认证同步，并恢复原有 onmessage 处理器

### S11 详细要求

在 `sendStreamRequest` 的 401 分支（第303-317行）中做两处修改：
1. `Swal.default.fire(...)` 前添加 `await`，等待 toast 自动关闭（2.5秒）后再执行后续逻辑
2. 在 `isStreaming.value = false` 之后、`return` 之前添加 `router.push('/login')`

修改后的 401 分支代码：
```typescript
if (response.status === 401) {
  const { useAuthStore } = await import('@/stores/authStore')
  useAuthStore().clearAuth()
  const Swal = await import('sweetalert2')
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

注意：`router` 实例已在文件顶部第14行导入（`import { router } from '@/router'`），无需新增导入。`await` 是新增的，保证 toast 完整显示后再跳转。

### 截至当前的修改后预期行为

- **S10-1**: 同一标签页内 AUTH_CHANGED→自身不会重复处理（去重守卫生效），消除无限回环
- **S10-2**: 已登录标签页刷新→`syncFromStorage()` 恢复 token 后初始化 BC 监听，可接收其他标签页的登出广播
- **S10-3**: 旧标签页登录后新标签页打开→新标签页 sessionStorage 为空→发送 REQUEST_AUTH→旧标签页回复 AUTH_CHANGED→新标签页自动获得认证。**不会**登出旧标签页（因为不调用 clearAuth()）
- **S10-3**: 所有标签页均未登录时打开新标签页→发送 REQUEST_AUTH→500ms 超时无回复→保持未登录状态（不广播任何消息）
- **S10**: 某标签页主动登出→BC广播 null-AUTH_CHANGED→其他标签页同步清除
- **S11**: SSE 返回 401→显示 toast"登录已过期"→等待 toast 自动关闭（2.5秒）→跳转登录页

## 已有代码上下文

### 已完成批次
- **v1 (R1)**: P0 功能性断裂修复（S7/S8/S9）—— ArticleDetailView 加载、DoctorChatView 导入、authStore 清理链。3/3 通过。
- **v2 (R2)**: P1 前端设计合规修复（S1/S2）—— App.vue 死代码清理、AiChatDialog 4项综合修复。13/13 测试通过。
- **v3 (R3)**: P1 后端安全缺陷修复（S5/S6）—— admin.js SQL注入修复、encryption.js 密钥校验。4/4 修改验证通过。

### S10 相关代码结构

`src/stores/authStore.ts`（182行）：
- Pinia Setup Store 模式（`defineStore('auth', () => { ... })`）
- 第15行：store 定义入口
- 第19-39行：`getBcChannel()` —— BroadcastChannel 懒初始化 + onmessage 监听器（问题所在）
- 第41-43行：`token` / `role` / `user` 三个 ref，初始值从 sessionStorage 读取
- 第59-69行：`setToken()` —— 设置 token + sessionStorage + BC 广播
- 第71-85行：`setAuth()` —— 设置完整认证 + sessionStorage + BC 广播
- 第87-106行：`syncFromStorage()` —— 从 sessionStorage 恢复认证状态（问题所在：未初始化 BC 监听）
- 第108-133行：`clearAuth()` —— 清除认证 + 业务 store 清理 + BC 广播

BC 消息格式：
```typescript
{ type: 'AUTH_CHANGED', token: string|null, role: string|null, user: User|null, timestamp: number }
```

### S11 相关代码结构

`src/stores/chatStore.ts`（751行）：
- 第14行：`import { router } from '@/router'` —— router 实例已可用
- 第289-333行：`sendStreamRequest()` —— 统一的 SSE 请求发送函数
- 第303-317行：401 处理分支（问题所在）
  - 动态 import `useAuthStore` 调用 `clearAuth()`
  - 弹 SweetAlert2 toast 提示"登录已过期"
  - 设置 `isStreaming.value = false`
  - **缺少 `router.push('/login')`**
- `sendStreamRequest` 被三个方法调用：`sendMessage()`（第356行）、`sendAssistantMessage()`（第464行）、`sendAdminMessage()`（第510行）

## 修订说明（v5 r1）
| 审查意见 | 修改措施 |
|---------|---------|
| [一般] S10-3 — syncFromStorage 空路径中 clearAuth() 与 REQUEST_AUTH 的冲突未明确。原任务描述"发送 REQUEST_AUTH 消息"措辞模糊，未说明需移除 clearAuth()，可能导致实现者保留 clearAuth() 造成所有标签页被登出 | 在 S10-3 修复描述中明确写为"移除 clearAuth() 调用"，提供完整的替代代码（含临时 onmessage 监听器、500ms 超时回退、REQUEST_AUTH 发送逻辑）。同时更新 S10-2 修复描述，区分"有 token"和"无 token"两条路径各自的 BC 初始化策略 |
| [轻微] S10-3 — REQUEST_AUTH 消息格式未定义，可能导致实现者自行猜测 | 在 BC 消息协议扩展中明确定义 REQUEST_AUTH 格式 `{ type: 'REQUEST_AUTH' }` 及回复格式（复用 AUTH_CHANGED 格式携带完整 token/role/user） |
| [轻微] S11 — router.push 与 SweetAlert2 toast 时序未考虑。立即跳转会中断 2.5 秒 toast 显示 | 将 `Swal.default.fire(...)` 前添加 `await`，确保 toast 自动关闭后再执行 `router.push('/login')`。同步更新 S11 详细要求部分的代码示例和预期行为描述 |
