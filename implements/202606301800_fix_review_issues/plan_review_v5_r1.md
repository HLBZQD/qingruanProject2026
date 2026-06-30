# 计划审查报告（v5 r1）

## 审查结果
REJECTED

## 发现

### [一般] S10-3 — syncFromStorage 空路径中 clearAuth() 与 REQUEST_AUTH 的冲突未明确

**问题**：当前 `syncFromStorage()` 在 sessionStorage 为空时（第98-101行）调用 `clearAuth()`，该函数会通过 BroadcastChannel 广播 `AUTH_CHANGED` 消息（token=null, role=null），导致其他已登录标签页收到广播后也执行 `clearAuth()`——即新标签页打开会导致所有标签页被登出。

任务指令中 S10-3 的修复要求写的是"当 sessionStorage 为空时，通过 BC 发送 `REQUEST_AUTH` 消息"，措辞上像是**追加**一个操作，而非**替换**原有的 `clearAuth()` 调用。如果实现者误解为在 `clearAuth()` 之后追加 `REQUEST_AUTH`（或之前），那么：

1. `clearAuth()` 仍会广播 null-token → 其他标签页被登出
2. 随后的 `REQUEST_AUTH` 得不到任何回复（所有标签页已被登出）
3. 新标签页仍然无认证数据

**为什么是问题**：这会导致实现结果与预期行为（"旧标签页登录后新标签页打开→BC同步→新标签页自动获得认证"）完全相反——新标签页不仅得不到认证，还会登出所有旧标签页。

**期望修正方向**：明确说明在 sessionStorage 为空的路径中，应当**移除** `clearAuth()` 调用，改为：初始化 BC 通道 → 发送 `REQUEST_AUTH` 消息 → 等待其他标签页回复（或在超时后保持未登录状态）。具体来说，`syncFromStorage()` 的空路径不应再执行任何会广播 null-auth 的操作。

### [轻微] S10-3 — REQUEST_AUTH 消息格式未定义

任务指令中新增了消息类型 `REQUEST_AUTH`，但未给出其消息格式（至少应包含 `{ type: 'REQUEST_AUTH' }`）。虽然可以推断，但补全此格式可避免实现者自行猜测导致与其他消息类型不一致。

### [轻微] S11 — router.push 与 SweetAlert2 toast 时序未考虑

任务要求在 401 分支 `return` 前添加 `router.push('/login')`。但该分支中 SweetAlert2 toast 设置了 `timer: 2500`（2.5秒自动关闭）。立即执行 `router.push('/login')` 会导致页面跳转，toast 可能被中断或用户看不到完整提示。此问题不影响正确性，但可考虑在 toast 关闭后再跳转，或接受 toast 随页面跳转消失的行为。

## 修改要求（仅 REJECTED 时）

### 针对 [一般] S10-3

**问题**：syncFromStorage() 空路径中 clearAuth() 与 REQUEST_AUTH 的冲突未明确。

**为什么是问题**：当前代码在 sessionStorage 为空时调用 clearAuth() 会广播 null-auth 导致其他标签页被登出。任务指令对 S10-3 的修复描述（"发送 REQUEST_AUTH 消息"）措辞模糊，未明确说明需要移除原有的 clearAuth() 调用。若实现者保留 clearAuth()，则修复结果与预期行为完全相悖。

**期望修正方向**：在任务指令 S10-3 修复描述中，明确写出：当 sessionStorage 为空时，**不再调用 clearAuth()**，而是改为调用 `getBcChannel()` 建立监听后发送 `REQUEST_AUTH` 消息。同步给出 REQUEST_AUTH 的消息格式定义（如 `{ type: 'REQUEST_AUTH' }`）。
