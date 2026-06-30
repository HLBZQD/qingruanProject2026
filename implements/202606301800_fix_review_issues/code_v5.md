# 实现报告（v5）

## 概述

修复2个P1跨标签页认证同步缺陷（S10 + S11），涉及两个 Pinia Store 文件和一个审查追踪文件：
- `src/stores/authStore.ts` — BroadcastChannel 三缺陷修复：去重守卫 + REQUEST_AUTH 协议 + BC 监听初始化
- `src/stores/chatStore.ts` — SSE 401 分支添加 await toast + router.push('/login')
- `reviews/202606291800_full_review/todo.md` — S10/S11 标记完成，批次4状态更新

## 文件变更清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 修改 | src/stores/authStore.ts | getBcChannel() onmessage 添加去重守卫（token/role比对）和 REQUEST_AUTH 消息处理；syncFromStorage() 空 token 路径移除 clearAuth() 改为 REQUEST_AUTH 协议（临时 onmessage + 500ms 超时）；syncFromStorage() 有 token 路径末尾追加 getBcChannel() 初始化 BC 监听 |
| 修改 | src/stores/chatStore.ts | sendStreamRequest() 401 分支：Swal.default.fire() 前加 await 等待 toast 自动关闭（2.5s），isStreaming.value = false 后追加 router.push('/login') |
| 修改 | reviews/202606291800_full_review/todo.md | 批次4 S10/S11 标记为 [x] 已完成，状态改为 ✅ 完成，合计进度 9/50 |

## 编译验证

未执行编译验证（前端 TypeScript 项目，无 `cjpm build` 可用；代码修改为纯逻辑/时序修复，无新增语法或导入）。

## 设计偏差说明

无偏差。所有修改严格遵循 detail_v5.md 设计规格：
- S10-1 去重比较仅使用 token 和 role（不含 user/timestamp），与设计一致
- S10-3 REQUEST_AUTH 响应使用 `bcChannel!` 非空断言（而非 `?.`），与设计决策一致
- S10-3 临时 onmessage 中对非 AUTH_CHANGED 消息转发给 originalOnmessage（`typeof originalOnmessage === 'function'` 守卫），与设计一致
- S11 toast `await` 后 `router.push('/login')` 在 `isStreaming.value = false` 之后、`return` 之前，与设计时序表完全一致

## 修订说明（v5 r1）

| 审查意见 | 修改措施 |
|---------|---------|
| [一般] S10-3 — syncFromStorage 空路径中 clearAuth() 与 REQUEST_AUTH 的冲突未明确。原任务描述"发送 REQUEST_AUTH 消息"措辞模糊，未说明需移除 clearAuth()，可能导致实现者保留 clearAuth() 造成所有标签页被登出 | 已移除 clearAuth() 调用（第98-101行），替换为完整 REQUEST_AUTH 协议：临时 onmessage 监听器 + 500ms 超时回退 + REQUEST_AUTH 发送 + 收到 AUTH_CHANGED 回复后调用 setAuth()。行为契约覆盖"所有标签页均未登录时打开C"场景：发送REQUEST_AUTH→500ms超时→保持未登录 |
| [轻微] S10-3 — REQUEST_AUTH 消息格式未定义，可能导致实现者自行猜测 | 在 onmessage 处理器中新增 `else if (d?.type === 'REQUEST_AUTH')` 分支，当前标签页已登录时回复 `{ type: 'AUTH_CHANGED', token, role, user, timestamp }` 格式（与 setAuth() 广播格式完全一致），未登录时不回复 |
| [轻微] S11 — router.push 与 SweetAlert2 toast 时序未考虑。立即跳转会中断 2.5 秒 toast 显示 | `Swal.default.fire(...)` 前添加 `await`，确保 toast 自动关闭（2.5s timer）后再执行 `router.push('/login')`。行为契约新增 S11 时序表：6步操作及预估耗时已全部实现 |
