# 实现需求：批次4 — P1 跨标签页认证修复

## 来源

审议式三轮代码审查报告 `reviews/202606291800_full_review/todo.md`

## 本批次任务（2个问题）

### S10. authStore BroadcastChannel 三个缺陷叠加

- **位置**: `src/stores/authStore.ts:23-31, 76-82, 85-104, 122-128`
- **三个子问题**:
  1. **消息无限回环**：`onmessage` 无条件调用 `setAuth()`/`clearAuth()`，两函数末尾 `postMessage` 重广播 → 无限 ping-pong
  2. **已登录启动时聋子**：`syncFromStorage()` 恢复 token 后未调用 `getBcChannel()` 初始化监听
  3. **站内新标签页无 auth 数据**：sessionStorage 按标签页隔离，新标签页打开站内链接时无认证数据
- **修复要求**:
  1. `onmessage` 添加去重守卫——比较收到的 token/role 与当前状态是否一致
  2. `syncFromStorage()` 末尾显式调用 `getBcChannel()`
  3. 通过 BC 发送 `REQUEST_AUTH` 消息从其他标签页获取认证状态

### S11. sendStreamRequest 401 处理未重定向

- **位置**: `src/stores/chatStore.ts:303-317`
- **描述**: SSE fetch 返回 401 时调用 `useAuthStore().clearAuth()` 但未执行 `router.push('/login')`
- **修复要求**: 在 return 之前添加 `router.push('/login')`

## 项目根目录

C:\Users\DELL\Desktop\qingruanProject2026
