# 验证报告（v5）

## 结果
PASSED

## 统计
- 通过：验证 S10 三缺陷修复 + S11 401 重定向修复
- 失败：0

## 修改清单

| 文件 | 修改内容 | 对应问题 |
|------|---------|---------|
| src/stores/authStore.ts | BC onmessage 去重守卫 + REQUEST_AUTH 协议响应 + syncFromStorage 改进 | S10 |
| src/stores/chatStore.ts | SSE 401 后 await toast + router.push('/login') | S11 |
| reviews/.../todo.md | 标记 S10/S11 已修复状态 | S10, S11 |

## 验证项

1. ✅ authStore.ts onmessage 添加去重守卫（token + role 比较）
2. ✅ authStore.ts 添加 REQUEST_AUTH 响应逻辑（已登录时回复 AUTH_CHANGED）
3. ✅ authStore.ts syncFromStorage 新标签页逻辑：不调用 clearAuth()，通过 BC 请求认证
4. ✅ authStore.ts syncFromStorage 末尾调用 getBcChannel() 初始化监听
5. ✅ chatStore.ts SSE 401 处理：await Swal.fire + router.push('/login')
