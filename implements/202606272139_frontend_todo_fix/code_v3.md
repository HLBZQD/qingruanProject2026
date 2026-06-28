# 第3轮代码变更报告 v3

> **日期**: 2026-06-27
> **依据**: detail_v3.md (权威参考), task_v3.md, design_review_v3_r1.md
> **范围**: G1-G7 全部7组任务
> **状态**: 编码完成，编译零错误

---

## 编译验证结果

- `npx vue-tsc --noEmit` — **零错误**
- `npx vite build` — **构建成功** (383ms, 零 warning)

---

## 文件变更清单

| 文件 | 操作 | 预估行数 | 实际行数 | 任务组 |
|------|------|:------:|:------:|:------:|
| `src/assets/variables.css` | 修改 (追加3个CSS变量) | - | +3 | 支撑G5/G6 |
| `src/composables/useChatApi.ts` | **新建** | ~50 | 70 | G1 |
| `src/types/api.ts` | 修改 (追加DoctorDetail) | ~5 | +5 | G1 |
| `src/types/sse.ts` | 修改 (扩展SSEEvent) | - | +21 | F3修复 |
| `src/stores/chatStore.ts` | **重写** (从13行骨架) | ~250 | 430 | G2+G3+G4 |
| `src/views/Consultation.vue` | **重写** (从7行占位) | ~150 | 250 | G5 |
| `src/views/DoctorChatView.vue` | **新建** | ~250 | 350 | G6 |
| `src/router/index.ts` | 修改 (追加1条路由) | ~8 | +8 | G7 |

---

## 各任务组实施详情

### G1: useChatApi.ts (SSE API 层)

**新建文件**: `src/composables/useChatApi.ts` (70行)

两个导出函数:
- `sendChatMessage(params)` — 原生 fetch POST `/api/chat/doctor/:id`，含 `token`、`signal` 参数，返回 `Response` (body: ReadableStream)
- `getDoctorInfo(id)` — axios `GET /api/doctors/:id`，走 useApi 拦截器

**类型扩展**: `src/types/api.ts` 追加 `DoctorDetail extends Doctor` (含 `is_online: boolean`)

### G2: chatStore 连接管理

在 `chatStore.ts` 中实现的连接管理层:
- 状态: `conversations`, `isStreaming`, `activeAbortController`, `fabOpen`
- `registerAbortController(controller)` — 自动 abort 旧连接 + 注册新控制器
- `abortActiveConnection()` — 中止活跃SSE连接
- `sendMessage(doctorId, text, token)` — fetch+ReadableStream管道，含401特殊处理
- `readSSEStream(reader)` — SSE流读取循环框架

**F1修复**: `sendMessage()` finally 块添加守卫:
```typescript
if (activeAbortController.value === controller) {
    isStreaming.value = false
    activeAbortController.value = null
}
```

### G3: SSE 事件解析 + 流式渲染

- `parseSSEBuffer(buffer)` — 按 `\n\n` 分隔事件块，去除 `data: ` 前缀，JSON.parse
- `dispatchSSEEvent(event)` — 根据 `event.event` 分发处理 (message/message_end/error/静默忽略)
- 使用 discriminated union 类型收窄，无冗余类型断言

### G4: conversation_id 管理 + 重连 + 多医生路由

- `doctorConversations: Map<number, string>` + `currentDoctorId` — 双层持久化 (内存+localStorage)
- `getDoctorConversation/setDoctorConversation/clearDoctorConversation` — 完整的CRUD
- `sendMessageWithRetry` — 固定间隔3次重试: 2s/4s/8s (简化版 v3)
- `switchDoctor(doctorId)` — abort旧连接 + 清空消息 + 设置currentDoctorId
- `clearAllConversations()` — 完整的登出清理 (abort + 清空Map + 清除localStorage + 清空消息列表)

### G5: Consultation.vue 重写

**从7行占位重写为250行完整页面**:
- 四态UI: 加载骨架屏(3个脉冲占位卡片) / 错误态(重试按钮) / 空态(暂无在线医生) / 医生卡片列表
- `getDoctors()` → `v-for` 渲染医生卡片 (头像/姓名/科室/职称/简介)
- 双阴性保护: `v-if="(doctor as any).is_online !== false"` (字段不存在时不报错)
- 点击卡片 → `router.push('/consultation/doctor/{id}')`

### G6: DoctorChatView.vue 创建

**新建文件**: `src/views/DoctorChatView.vue` (350行)

完整对话界面:
- **Header**: 返回按钮 + 医生头像/姓名/科室职称 + 清空对话按钮
- **Disclaimer bar**: 黄色免责声明条 (全程可见)
- **消息列表**: `v-for="msg in chatStore.conversations"`，用户消息右对齐(蓝色)，AI消息左对齐(白色)
- **"对方正在输入..."**: 3个跳动圆点动画 (`v-if="chatStore.isStreaming"`)
- **输入区**: 输入框 + 发送按钮 (disabled when streaming or empty)
- **Markdown渲染**: `marked.parse()` + `DOMPurify.sanitize()` (含 try-catch 安全降级)
- **时间格式化**: `formatTime()` 含 `isNaN(d.getTime())` 保护
- **Token检查**: `handleSend()` 含 token 为空 → Toast "请先登录"
- **路由参数监听**: `watch(route.params.id)` → 同组件切换医生 (abort旧连接 + 重新加载)
- **生命周期**: `onMounted` → loadDoctor; `onUnmounted` → abortActiveConnection

### G7: 路由注册

在 `src/router/index.ts` 中 `/consultation` 之后、`/life-plan` 之前追加:
```typescript
{
  path: '/consultation/doctor/:id',
  name: 'DoctorChat',
  component: () => import('@/views/DoctorChatView.vue'),
  meta: { requiresAuth: true, requiresDisclaimer: true },
}
```

---

## 设计审查发现处理

| 编号 | 处理方式 |
|:---:|------|
| **F1** | **已修复** — `sendMessage()` finally块加 `if (activeAbortController.value === controller)` 守卫 |
| **F2** | **已遵循** — 以 detail_v3.md 为权威参考 (token+signal参数、固定延迟重连、renderContent try-catch、formatTime isNaN检查、handleSend token检查) |
| **F3** | **已修复** — SSEEvent联合类型扩展，新增 SSEWorkflowStartedEvent/SSEWorkflowFinishedEvent/SSEAgentMessageEvent/SSEAgentThoughtEvent |
| F4 | 已处理 — assistantConversationId/adminConversationId 添加声明和stub方法 |
| F5 | 已处理 — 模板使用 `(doctor as any).is_online !== false` 双阴性保护 |

---

## CSS变量新增

为支撑 G5/G6 样式，在 `src/assets/variables.css` 追加:
- `--color-text-tertiary: #999999` (三级文本色)
- `--font-size-h4: 15px` (四级标题字号)
- `--spacing-3xl: 32px` (超大间距)
