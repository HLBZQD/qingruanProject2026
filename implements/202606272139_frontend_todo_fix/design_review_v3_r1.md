# 第3轮详细设计审查报告 v3-r1

> **审查对象**: `detail_v3.md` (2529行) -- 7组任务 G1-G7 详细设计
> **审查依据**: `task_v3.md` (1315行), `docs/2_detailed_design_v3.md` (3.3/3.7/3.8.7/4.1.3/4.3节), `a_v8_diag_v3.md` (S5b-1/S5b-2)
> **审查日期**: 2026-06-27
> **审查人**: Design Reviewer
> **重点审查维度**: SSE架构决策、AbortController生命周期、conversation_id双存持久化、4个架构决策、模块间接口契约、设计可编码性

---

## 0. 审查范围与输入确认

| 输入文件 | 路径 | 使用范围 |
|---------|------|---------|
| 详细设计 v3 | `detail_v3.md` (2529行) | 主要审查对象 -- G1-G7 完整代码结构 |
| 任务文件 v3 | `task_v3.md` (1315行) | 交叉验证 -- 接口一致性、代码差异 |
| 设计文档基线 | `docs/2_detailed_design_v3.md` 3.3/3.7/3.8.7/4.1.3/4.3节 | 设计源头验证 |
| 诊断报告 | `a_v8_diag_v3.md` S5b-1/S5b-2 | 修复需求覆盖度验证 |
| 计划审查 | `plan_review_v3_r2.md` | 前置审查结论参考 |
| 实际代码 | `src/stores/chatStore.ts` (13行), `src/views/Consultation.vue` (6行), `src/router/index.ts` (135行), `src/types/sse.ts` (30行) | 现状验证 |

---

## 1. 审查维度一: SSE 架构决策 (fetch+ReadableStream vs EventSource)

### 1.1 决策分析

detail_v3.md AD-1 节明确采用 `fetch + ReadableStream` 而非 `EventSource`，对比表如下：

| 维度 | EventSource | fetch+ReadableStream (采用) | 评估 |
|------|------------|------------------------------|:--:|
| HTTP 方法 | 仅 GET | POST | **决定性** -- 后端为 `POST /api/chat/doctor/:id` |
| 自定义 Header | 不支持 | 支持 Authorization | **决定性** -- 需JWT Bearer token |
| 请求体 | 不支持 | 支持 JSON body | **决定性** -- 需传 `{message, conversation_id}` |
| 取消机制 | close() | AbortController.signal | 采用方案更精确 |
| 错误处理 | onerror (信息有限) | response.status/ok | 采用方案更丰富 |

### 1.2 验证

- 设计文档 3.2.11 节明确定义 `POST /api/chat/doctor/:id` 端点。
- 设计文档 3.3 节规定前端"在 fetch 的 ReadableStream 中按 `\n\n` 分隔事件块"。
- `EventSource` 规范 (WHATWG) 确实仅支持 GET 方法，不支持自定义请求头。

**判定: PASS -- SSE 架构决策正确。**

### 1.3 实现一致性

detail_v3.md G1.3.1 中 `sendChatMessage` 使用原生 `fetch` 返回 `Response` (body: ReadableStream)，与设计文档 4.4.2 节 `useSSE.ts streamRequest` 模式对齐。G2.3.3 中 `sendMessage` 正确地从 `response.body.getReader()` 获取 reader 进行流消费。

**判定: PASS -- 实现与架构决策一致。**

---

## 2. 审查维度二: AbortController 生命周期管理

### 2.1 生命周期追踪

AbortController 在以下路径中被管理:

| 生命周期阶段 | 代码位置 | 操作 |
|------------|---------|------|
| 创建 | `sendMessage()` G2.3.3 | `new AbortController()` |
| 注册 | `registerAbortController()` G2.3.2 | abort旧 → 赋值新 |
| 传递 | `sendChatMessage()` G1.3.1 | `signal: controller.signal` → fetch |
| 主动中止 | `abortActiveConnection()` G2.3.2 | `activeAbortController.value.abort()` + 置null |
| 被动中止 | `sendMessage()` catch | 捕获 AbortError → 静默返回 |
| 清理 | `sendMessage()` finally G2.3.3 | `activeAbortController.value = null` |
| 组件卸载 | `onUnmounted` G6.4 | `chatStore.abortActiveConnection()` |
| 路由切换 | `goBack()` G6.4 / `watch(route.params.id)` | `chatStore.abortActiveConnection()` |
| 医生切换 | `switchDoctor()` G4.5.1 | `abortActiveConnection()` |
| 登出清理 | `clearAllConversations()` G4.6 | `abortActiveConnection()` |

### 2.2 触发路径完整度

| 触发场景 | 中止入口 | 存在？ |
|---------|---------|:-----:|
| 用户点击返回按钮 | `goBack()` | YES |
| 浏览器后退 | `onUnmounted` | YES |
| 路由参数变化 (同组件复用) | `watch(route.params.id)` | YES |
| 发送新消息 (中断旧SSE) | `registerAbortController` | YES |
| 切换医生 | `switchDoctor()` | YES |
| 登出 | `clearAllConversations()` | YES |
| 直接关闭标签页 | (浏览器自动) | N/A |

所有需要的触发路径均已覆盖。注意 `goBack()` 和 `onUnmounted` 都会调用 `abortActiveConnection()`——后者在 `activeAbortController` 已为 null 时是安全的幂等操作。

### 2.3 发现: TOCTOU 竞争条件 (F1)

**严重程度: MEDIUM (影响功能正确性，但不阻塞编码——可在编码阶段修复)**

在 `sendMessage()` 的 finally 块中:

```typescript
} finally {
  isStreaming.value = false
  activeAbortController.value = null   // 无条件置null
}
```

**场景复现**:
1. 旧 `sendMessage()` 正在 `readSSEStream()` 中读取。
2. 新 `sendMessage()` 被调用:
   a. `registerAbortController(newController)` → abort 旧 controller，设置 `activeAbortController = newController`
   b. `isStreaming = true`
3. 旧 `sendMessage()` 的 reader.read() 抛出 AbortError → catch 返回 → finally 执行:
   - `isStreaming.value = false` (错误: 新连接正在流式传输!)
   - `activeAbortController.value = null` (错误: 覆盖了新连接的 controller!)

**影响**: 新发送的消息SSE流仍在进行，但 `isStreaming` 被错误设为 false (发送按钮提前恢复)，且 `abortActiveConnection()` 无法中止新连接 (`activeAbortController` 已被清空)，导致：
- 用户可能在新SSE未完成时再次发送消息
- 组件卸载时新连接无法被取消（除非 reader 自然结束）

**根因**: `finally` 块假设在它执行时，`activeAbortController` 仍指向当前 `sendMessage()` 创建的 controller。当旧连接被新连接的 `registerAbortController` 中断时，此假设不成立。

**推荐修复** (在编码阶段):
```typescript
} finally {
  // 仅在当前 controller 仍为活跃 controller 时才重置
  if (activeAbortController.value === controller) {
    activeAbortController.value = null
    isStreaming.value = false
  }
}
```

同理，`sendMessageWithRetry()` 中的 `isStreaming.value = false` (重试前) 存在类似问题但影响较小——因为重试路径中 finally 已经执行过，`isStreaming` 可能已是 false。冗余但无害。

### 2.4 判定

**判定: PASS WITH NOTE -- AbortController 生命周期管理总体完备，7条触发路径全覆盖。发现一处 TOCTOU 竞争条件 (F1)，建议编码阶段修复。**

---

## 3. 审查维度三: conversation_id 双存持久化

### 3.1 策略分析

detail_v3.md AD-3 节定义双层策略:

| 层级 | 存储 | 读写方式 |
|------|------|---------|
| 内存 (Map) | `doctorConversations: ref<Map<number, string>>` | 优先读取，`getDoctorConversation()` 首选 |
| localStorage | `qrzl_conv_{doctorId}` | 跨页面刷新后备，`getDoctorConversation()` 回退 |

### 3.2 正确性验证

**写入路径** (G4.3.2 `setDoctorConversation`):
```typescript
function setDoctorConversation(doctorId: number, id: string): void {
  doctorConversations.value.set(doctorId, id)        // 写内存
  try {
    localStorage.setItem(`qrzl_conv_${doctorId}`, id) // 写localStorage
  } catch { /* QuotaExceededError 静默丢弃 */ }
}
```

**读取路径** (G4.3.2 `getDoctorConversation`):
```typescript
function getDoctorConversation(doctorId: number): string | null {
  if (doctorConversations.value.has(doctorId)) {
    return doctorConversations.value.get(doctorId)!  // 1. 内存命中
  }
  try {
    const stored = localStorage.getItem(`qrzl_conv_${doctorId}`)
    if (stored) {
      doctorConversations.value.set(doctorId, stored) // 2. 恢复到内存
      return stored
    }
  } catch { /* 静默降级 */ }
  return null  // 3. 首次对话
}
```

**清除路径** (G4.3.2 `clearDoctorConversation`):
```typescript
function clearDoctorConversation(doctorId: number): void {
  doctorConversations.value.delete(doctorId)
  try { localStorage.removeItem(`qrzl_conv_${doctorId}`) } catch {}
}
```

### 3.3 设计文档一致性

设计文档 3.7 节 (line 2504) 描述 chatStore 通过 `pinia-plugin-persistedstate` 持久化 `doctorConversations` Map。但如 AD-3 所指出的，JSON.stringify 会将 Map 转为 `{}`。detail_v3.md 的双层策略正确地绕过了此限制——不依赖 pinia-plugin-persistedstate 的 Map 序列化，而是使用显式的 localStorage 键。

**注意**: 设计文档和 detail_v3 在持久化机制上存在表面矛盾（pinia-plugin-persistedstate vs 显式 localStorage），但 detail_v3 的方案是更可靠的实现选择。此差异是有意设计改进，不是错误。

### 3.4 边界条件覆盖

| 场景 | 处理 | 正确？ |
|------|------|:---:|
| 首次对话 (无 conversation_id) | `getDoctorConversation` 返回 null → `sendMessage` 不传 conversation_id | YES |
| 页面刷新后恢复 | localStorage 回退读取 → 恢复到 Map | YES |
| localStorage QuotaExceededError | try-catch 静默 → 内存 Map 仍可用 | YES |
| localStorage 被清除 (浏览器隐私模式等) | 返回 null → 降级为首次对话 | YES |
| 多标签页操作同一医生 | 各标签页独立 Map；localStorage 后者覆盖前者 (文档标注为已知限制) | ACCEPTED |
| conversation_id 格式异常 (非预期字符串) | 直接存储/读取，不做格式校验——异常值被当作新 conversation_id 传给后端，后端自行校验 | ACCEPTED |

### 3.5 判定

**判定: PASS -- conversation_id 双层持久化策略正确，读写路径完整，边界条件充分覆盖。**

---

## 4. 审查维度四: 4 个架构决策 (AD-1~4)

### AD-1: fetch + ReadableStream 而非 EventSource

**决策**: 正确 (详见维度一)。后端 POST + JWT header + JSON body 三个硬性需求排除了 EventSource。

### AD-2: chatStore 集中管理 SSE 连接 (而非 useSSE.ts composable)

**决策**: 合理。关键理由:
- "同时活跃连接数上限为 1" 约束需要全局单例 `activeAbortController`——composable 作用域无法跨组件感知。
- `registerAbortController` 的 auto-abort 逻辑需要跨组件感知旧的 AbortController。
- `clearAllConversations` 需要同时 abort 和清理——Store 的全局作用域天然适合。

**折中合理性**: `useSSE.ts` 的 `streamRequest` 核心逻辑（fetch + ReadableStream + `\n\n` 分隔 + `data:` 前缀 + JSON.parse）内联到 chatStore 的 `readSSEStream()` 中，避免了 chatStore 与 composable 之间的接口重复抽象。虽然增加了 chatStore 的职责范围（~250行），但避免了"thin wrapper over fetch"的二次抽象。可接受。

### AD-3: conversation_id 双层持久化

**决策**: 正确 (详见维度三)。Map 为主、localStorage 为后备的策略正确规避了 pinia-plugin-persistedstate 的 Map 序列化问题。

### AD-4: 简化版重连策略

**决策**: 合理。v3 简化交付使用固定间隔 3 次重试 (2s/4s/8s)，指数退避推迟至 v4。理由充分:
- 指数退避调试复杂度高（网络抖动 vs 服务端宕机需不同策略）。
- v3 优先保证基本重连可用后，再在真实网络环境验证升级。

**与 task_v3.md 的不一致**: task_v3.md G4 节的代码示例使用的是指数退避（`Math.min(initialDelay * Math.pow(backoffMultiplier, attempt), maxDelay)`），与 v3 简化策略矛盾。detail_v3.md 正确使用固定 `delays: [2000, 4000, 8000]` 数组。**以 detail_v3.md 为准**。

### 判定

**判定: PASS -- 4 个 AD 均合理且有充分理由支撑。AD-4 在 detail_v3.md 与 task_v3.md 之间存在代码不一致（详见发现 F2），以 detail_v3.md 为准。**

---

## 5. 审查维度五: 模块间接口契约

### 5.1 接口契约清单

| 生产者 | 接口 | 消费者 | 契约清晰度 |
|--------|------|--------|:--------:|
| `useChatApi.sendChatMessage()` | `(params: {doctorId, message, token, conversationId?, signal?}) => Promise<Response>` | `chatStore.sendMessage()` | 清晰——G1.3.2 含签名+参数语义表 |
| `useChatApi.getDoctorInfo()` | `(id: number) => Promise<Doctor>` | `DoctorChatView.loadDoctor()` | 清晰 |
| `chatStore.conversations` | `ref<ChatMessage[]>` | `DoctorChatView` 模板 `v-for` | 清晰——G6.5 含渲染映射表 |
| `chatStore.isStreaming` | `ref<boolean>` | `DoctorChatView` 发送按钮 + 输入动画 | 清晰 |
| `chatStore.sendMessageWithRetry()` | `(doctorId, text, token) => Promise<void>` | `DoctorChatView.handleSend()` | 清晰——G6.6 含完整接口契约表 |
| `chatStore.abortActiveConnection()` | `() => void` | `DoctorChatView.goBack()` + `onUnmounted()` + `watch()` | 清晰 |
| `chatStore.clearDoctorConversation()` | `(doctorId) => void` | `DoctorChatView.clearChat()` | 清晰 |
| `chatStore.switchDoctor()` | `(doctorId) => void` | `DoctorChatView.loadDoctor()` | 清晰 |
| `getDoctors()` (useHomeApi) | `() => Promise<Doctor[]>` | `Consultation.fetchDoctors()` | 清晰——已于v1验证 |
| `/consultation/doctor/:id` 路由 | Vue Router 路由参数 `id: string` | `DoctorChatView.loadDoctor()` + `router.push()` from Consultation | 清晰——G7.3 含完整路由注册 |
| `chatStore.clearAllConversations()` | `() => void` | `authStore.clearAuth()` (S8后续轮次) | 清晰——G4.6 含完整清理逻辑 |

### 5.2 类型一致性

经验证:
- `sendChatMessage` 在 detail_v3.md G1.3.1 中签名包含 `token: string` 和 `signal?: AbortSignal`，在 G2.3.3 调用处正确传入了所有参数。
- `chatStore` 的 return 块 (G4.7) 暴露了所有 DoctorChatView.vue G6.6 接口契约表中引用的属性和方法。
- `SSEEvent` 联合类型 (`src/types/sse.ts`) 覆盖 `message`, `message_end`, `error` 三种核心事件。`dispatchSSEEvent` 的 switch-case 使用 discriminated union 进行类型收窄。
- `ChatMessage` 类型 (含 `id`, `role`, `content`, `timestamp`) 与模板渲染所需字段一致。

### 5.3 发现: SSEEvent 类型不完整 (F3)

**严重程度: LOW (不影响运行时正确性)**

`src/types/sse.ts` 中 `SSEEvent` 联合类型仅含 `SSEMessageEvent | SSEMessageEndEvent | SSEErrorEvent`，不含 `workflow_started`, `workflow_finished`, `agent_message`, `agent_thought`。设计文档 3.3 节列出了所有这些事件类型。

detail_v3.md 的 `dispatchSSEEvent` switch 语句处理了这些额外事件 (静默忽略)，但类型上 `SSEEvent` 不包含它们。当前代码通过 `JSON.parse(dataLine) as SSEEvent` 类型断言绕过类型检查，`default` 分支处理未知类型。运行时行为正确，但类型系统无法验证 switch 对所有已知事件类型的覆盖完整性。

建议: 在 `SSEEvent` 联合类型中补充:
```typescript
export type SSEEvent = SSEMessageEvent | SSEMessageEndEvent | SSEErrorEvent
  | { event: 'workflow_started'; workflow_run_id: string }
  | { event: 'workflow_finished'; workflow_run_id: string }
  | { event: 'agent_message'; answer: string; conversation_id: string }
  | { event: 'agent_thought'; thought: string; tool?: string }
```

### 5.4 判定

**判定: PASS -- 模块间接口契约清晰完整，11 条契约均有明确的签名、消费者和文档引用。发现 SSEEvent 类型不完整 (F3)，建议补充。**

---

## 6. 审查维度六: 设计可直接编码

### 6.1 代码完整度评估

| 文件 | detail_v3.md 提供内容 | 完整度 |
|------|---------------------|:----:|
| `useChatApi.ts` | 完整代码 (~50行，含类型注解、JSDoc、参数语义表) | 100% |
| `chatStore.ts` (G2) | 完整代码 (~60行，含状态声明、registerAbortController、sendMessage、readSSEStream框架) | 100% |
| `chatStore.ts` (G3) | 完整代码 (~70行，含parseSSEBuffer算法、dispatchSSEEvent switch、chunk边界处理图) | 100% |
| `chatStore.ts` (G4) | 完整代码 (~70行，含conversation_id双层存储、sendMessageWithRetry、switchDoctor、clearAllConversations) | 100% |
| `Consultation.vue` | 完整代码 (~150行，含script+template+style、状态机图) | 100% |
| `DoctorChatView.vue` | 完整代码 (~250行，含script+template+style、状态机图、接口契约表) | 100% |
| `router/index.ts` | 完整路由配置 (~8行) | 100% |

### 6.2 编码就绪度

每一项设计包含:
- 完整的 TypeScript/Vue 代码片段 (非伪代码)
- 文件路径和行范围估算
- 操作类型标注 (新建/修改/重写)
- 数据流图 (ASCII)
- 边界条件表 (每任务组独立)
- 验收标准清单 (每条可操作)

**开发者可直接将设计中的代码复制到对应文件中，调整 import 路径后即可编译**——设计已达到"转录即编码"的粒度。

### 6.3 执行顺序与依赖管理

串行链 G1→G2→G3→G4 的设计考虑了代码在同一文件中逐步推进的合并安全性——设计建议同一开发者顺序执行，避免了多人同时修改 `chatStore.ts` 的合并冲突风险。

G2 在 `readSSEStream` 循环中引用 G3 的 `parseSSEBuffer` 和 `dispatchSSEEvent`，并提供临时空实现 (返回空事件列表/空函数体)，使 G2 可独立编译验证。这种"占位→填充"的增量设计是良好的实践。

### 6.4 task_v3.md 与 detail_v3.md 差异 (F2)

**严重程度: MEDIUM (detail_v3.md 是正确的权威版本，task_v3.md 含过时代码)**

| 差异项 | task_v3.md | detail_v3.md (权威) |
|--------|-----------|-------------------|
| `sendChatMessage` 签名 | 缺 `token` 和 `signal` 参数 | 含完整 `token` + `signal` |
| 重连策略 | 指数退避代码 (`Math.pow`) | 固定间隔数组 `delays: [2000,4000,8000]` |
| `renderContent` markdown | 无 try-catch + 无空内容检查 | 含 try-catch + `if(!content) return ''` + `typeof html !== 'string'` 检查 |
| `formatTime` | 无 `isNaN` 检查 | 含 `isNaN(d.getTime())` 保护 |
| `sendMessageWithRetry` 重试前 | 无 `isStreaming = false` | 含 `isStreaming.value = false` |
| `handleSend` token检查 | 无 token 为空检查 | 含 `if (!token)` 分支 + Toast |

**建议**: 编码时以 detail_v3.md 为权威参考。task_v3.md 的任务分解和验收标准仍有效，但代码示例应以 detail_v3.md 为准。

### 6.5 判定

**判定: PASS -- 设计可直接编码。全部 7 个文件 (新建3 + 修改2 + 重写2) 的代码完整度均为 100%，开发者可转录即编码。task_v3.md 与 detail_v3.md 存在 6 处代码差异 (F2)，以 detail_v3.md 为准。**

---

## 7. 发现汇总

| 编号 | 严重程度 | 类别 | 描述 | 位置 | 建议 |
|:---:|:------:|------|------|------|------|
| F1 | MEDIUM | 并发正确性 | AbortController TOCTOU 竞争：`sendMessage()` finally 块可能清除新连接的 controller | detail_v3.md G2.3.3 finally块 | 编码阶段修复：添加 `if (activeAbortController.value === controller)` 守卫 |
| F2 | MEDIUM | 文档一致性 | detail_v3.md 与 task_v3.md 6处代码差异 (sendChatMessage签名/重连策略/renderContent/formatTime/重试前isStreaming/token检查) | 两文档对应节 | 编码以 detail_v3.md 为准；建议更新 task_v3.md 代码示例 |
| F3 | LOW | 类型完整度 | `SSEEvent` 类型不含 workflow_started/finished/agent_message/agent_thought 四种事件 | src/types/sse.ts | 建议补充剩余事件类型定义 |
| F4 | LOW | 声明完整性 | `assistantConversationId` 和 `adminConversationId` 在 G4.7 exports 中引用但 G4.3 状态声明节未展示 | detail_v3.md G4.3.2 | 补充声明或增加注释说明来自骨架代码 |
| F5 | LOW | 文档一致性 | `is_online` 字段状态描述前后不一：诊断报告称"已含有"，detail_v3 称"不含" | 诊断报告 line 176 / detail_v3 G1.4 | 模板代码使用 `v-if="...is_online !== false"` 双阴性保护，字段存在与否均安全 |

---

## 8. 诊断报告覆盖度

S5b-1 9 项子任务 + S5b-2 3 项子任务在 detail_v3.md 中的覆盖:

| 诊断子任务 | 对应任务组 | 覆盖情况 |
|-----------|:--------:|:------:|
| S5b-1(a): useChatApi.ts 创建 | G1 | 完整——含 sendChatMessage + getDoctorInfo |
| S5b-1(b): fetch+ReadableStream 连接管理 | G2 | 完整——含 AbortController + reader 管道 |
| S5b-1(c): SSE 事件解析 | G3 | 完整——含 parseSSEBuffer + dispatchSSEEvent |
| S5b-1(d): conversation_id 管理 | G4 | 完整——含双层存储 + 读写清除 |
| S5b-1(e): 断线重连 | G4 | 完整——含 sendMessageWithRetry (简化版) |
| S5b-1(f): abortActiveConnection | G2 | 完整——含 registerAbortController |
| S5b-1(g): 多医生会话路由 | G4 | 完整——含 switchDoctor + doctorConversations Map |
| S5b-1(h): 消息流式渲染 | G3 | 完整——含 conversations ref + Vue 响应式 |
| S5b-1(i): fabOpen 状态 | G4 | 完整——含 toggleFab (v4 推迟) |
| S5b-2(a): Consultation.vue 重写 | G5 | 完整——含三态 UI + 卡片 + 跳转 |
| S5b-2(b): DoctorChatView.vue 创建 | G6 | 完整——含 header + 消息气泡 + 输入框 |
| S5b-2(c): 路由注册 | G7 | 完整——含路由守卫行为说明 + 端到端测试 |

**判定: 12/12 诊断子任务全覆盖，无遗漏。**

---

## 9. 替代方案与补充建议

### 9.1 非阻塞建议

| 编号 | 建议 | 优先级 | 说明 |
|:--:|------|:----:|------|
| S1 | `sendChatMessage` 的 `signal` 参数已在 G1 阶段包含——确认编码时不需要 G3 回修 | LOW | detail_v3.md 已在 G1 含 signal；task_v3.md 需G3回修。以 detail_v3.md 为准 |
| S2 | `readSSEStream` 中 `reader.releaseLock()` 调用时机：仅当 reader 未被关闭时调用 | LOW | 当前设计在 finally 中无条件调用 `releaseLock()`。若 reader 已被 abort 自动释放，`releaseLock()` 会抛出 `TypeError`——建议加 try-catch 或检查 `reader.locked` 属性 |
| S3 | `switchDoctor` 中 `conversations.value = []` 而非 `conversations.value.length = 0`——统一风格 | LOW | DoctorChatView.vue `clearChat` 和 `watch` 中也使用 `chatStore.conversations.length = 0`，建议统一为 `= []` |
| S4 | `clearAllConversations` 中 localStorage 清理使用 `[...doctorConversations.value.keys()]` 遍历——当前仅清理 Map 中已知的 key，若历史上存在残留的 `qrzl_conv_*` 键不会被清理 | LOW | 可在 v4 中改进为遍历所有 localStorage 键并匹配 `qrzl_conv_` 前缀 |

---

## 10. 审查结论

### 判定: **APPROVED** (with 5 findings, 1 actionable before coding)

### 批准依据

1. **SSE 架构决策正确**: `fetch + ReadableStream` 是满足 POST + JWT + JSON body 三个硬性需求的唯一可行方案。
2. **AbortController 生命周期管理总体完备**: 7 条触发路径全覆盖。发现一处 TOCTOU 竞争条件 (F1)，可在编码阶段修复——不阻塞设计审批。
3. **conversation_id 双层持久化正确**: Map 为主、localStorage 为后备，正确规避了 pinia-plugin-persistedstate 的 Map 序列化问题。
4. **4 个架构决策合理**: AD-1~4 均有充分理由支撑，简化策略对齐 v3 时间约束。
5. **模块间接口契约清晰**: 11 条契约签名明确，类型一致，消费者清晰标注。
6. **设计可直接编码**: 全部 7 个文件代码完整度 100%，开发者可转录即编码。task_v3.md 与 detail_v3.md 的代码差异 (F2) 以 detail_v3.md 为准。

### 编码前必须处理

| 优先级 | 编号 | 事项 |
|:----:|:---:|------|
| BEFORE CODE | F1 | 在 `sendMessage()` finally 块中添加 `if (activeAbortController.value === controller)` 守卫，防止 TOCTOU 竞争 |
| BEFORE CODE | F2 | 确认以 detail_v3.md 代码为准（sendChatMessage 含 token+signal、固定间隔重连、renderContent 含 try-catch、handleSend 含 token 检查） |

### 批准条件

无。此设计可直接进入编码执行阶段。F1 和 F2 均可由开发者在编码时自然处理——F1 是已有代码的正确性增强，F2 是文档一致性的确认。

---

*设计审查报告结束 (v3-r1)。设计 APPROVED，可进入编码执行阶段。*
