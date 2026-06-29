# 静态验证清单 / 契约验证报告（v2）

## 概述

- **任务**：D1 — 会话历史加载功能
- **设计依据**：`detail_v2.md`（行为契约的权威来源）
- **实现报告**：`code_v2.md`（编译验证已通过：`vue-tsc -b && vite build` 零错误）
- **验证方法**：静态交叉对照（设计契约 vs 源码实现），不运行运行时单元测试
- **项目约束**：Vue 3 + TypeScript + Pinia + Vite，无 vitest/jest，不引入新依赖

---

## 1. 行为契约逐条对照

### 1.1 类型定义

| # | 契约条目（detail_v2.md 行号） | 实现位置 | 状态 |
|---|------------------------------|----------|------|
| 1.1 | `ConversationHistoryItem` interface，含 `conversation_id: string`, `name: string`, `created_at: string`（L40-47） | `src/types/sse.ts:71-78` | **通过** — 三字段完全匹配，JSDoc 注释完整 |
| 1.2 | 类型为独立 interface，无继承/实现（L50） | `src/types/sse.ts:71` | **通过** — 独立 `export interface`，无 extends |
| 1.3 | 类型追加在 `ChatMessage` 之后、文件末尾之前（L23） | `src/types/sse.ts:71`（`ChatMessage` 在 L53-58 之后） | **通过** |

### 1.2 API 函数 — getDoctorConversationHistory

| # | 契约条目 | 实现位置 | 状态 |
|---|---------|----------|------|
| 2.1 | 函数签名 `(doctorId: number, token: string): Promise<ConversationHistoryItem[]>`（L74-77） | `src/composables/useChatApi.ts:135-138` | **通过** — 签名一字不差 |
| 2.2 | 请求方式：`fetch` + `GET /api/chat/doctor/${doctorId}/conversations`（L87-92） | `src/composables/useChatApi.ts:139` | **通过** — URL 模板插值一致 |
| 2.3 | 鉴权：`Authorization: Bearer ${token}` header（L90） | `src/composables/useChatApi.ts:141-143` | **通过** |
| 2.4 | 非 ok 响应抛 Error（含 HTTP status）（L94-96） | `src/composables/useChatApi.ts:146-148` | **通过** — `throw new Error(\`获取医生历史会话失败: HTTP ${res.status}\`)` |
| 2.5 | 成功返回 `(json.data as ConversationHistoryItem[]) \|\| []`（L100） | `src/composables/useChatApi.ts:152` | **通过** |
| 2.6 | 类型导入 `import type { ConversationHistoryItem } from '@/types/sse'`（L152-154） | `src/composables/useChatApi.ts:4` | **通过** |

### 1.3 API 函数 — getAssistantConversations

| # | 契约条目 | 实现位置 | 状态 |
|---|---------|----------|------|
| 3.1 | 函数签名 `(token: string): Promise<ConversationHistoryItem[]>`（L123-125） | `src/composables/useChatApi.ts:168-170` | **通过** |
| 3.2 | 请求方式：`fetch` + `GET /api/assistant/conversations`（L134-139） | `src/composables/useChatApi.ts:171` | **通过** |
| 3.3 | 鉴权：`Authorization: Bearer ${token}` header（L137） | `src/composables/useChatApi.ts:173-175` | **通过** |
| 3.4 | 非 ok 响应抛 Error（L141-143） | `src/composables/useChatApi.ts:178-180` | **通过** — `throw new Error(\`获取助手历史会话失败: HTTP ${res.status}\`)` |
| 3.5 | 成功返回 `(json.data as ConversationHistoryItem[]) \|\| []`（L146） | `src/composables/useChatApi.ts:183` | **通过** |

### 1.4 Store 扩展 — chatStore.ts

| # | 契约条目 | 实现位置 | 状态 |
|---|---------|----------|------|
| 4.1 | `conversationHistory = ref<ConversationHistoryItem[]>([])`（L164） | `src/stores/chatStore.ts:19` | **通过** |
| 4.2 | `historyLoading = ref(false)`（L167） | `src/stores/chatStore.ts:22` | **通过** |
| 4.3 | `historyError = ref('')`（L170） | `src/stores/chatStore.ts:25` | **通过** |
| 4.4 | 类型导入 `ConversationHistoryItem`（L176） | `src/stores/chatStore.ts:11` | **通过** — 已合并到现有 import |
| 4.5 | 合并 import：5 个函数从 useChatApi 导入（L182-190） | `src/stores/chatStore.ts:4-10` | **通过** — 5 函数合并在单条 import 语句中 |
| 4.6 | `loadDoctorConversationHistory(doctorId, token)`：loading=true → fetch → 写 result / catch 设 error → finally loading=false（L212-225） | `src/stores/chatStore.ts:751-764` | **通过** — 流程一字不差 |
| 4.7 | `loadAssistantConversationHistory(token)`：同上流程（L240-253） | `src/stores/chatStore.ts:775-787` | **通过** |
| 4.8 | `clearConversationHistory()`：清空 `conversationHistory` + `historyError`（L263-266） | `src/stores/chatStore.ts:794-797` | **通过** |
| 4.9 | return 导出追加 6 项（L273-283） | `src/stores/chatStore.ts:841-849` | **通过** — 注释分组标注 "state — 历史会话" / "actions — 历史会话" |
| 4.10 | 追加位置在 `navigate` 之后、`}` 之前（L285） | `src/stores/chatStore.ts:839,849` | **通过** — navigate 在 L838，新导出在 L841-848，闭合 `}` 在 L849 |

### 1.5 UI — DoctorChatView.vue

| # | 契约条目 | 实现位置 | 状态 |
|---|---------|----------|------|
| 5.1 | `showHistoryPanel = ref(false)`（L293） | `src/views/DoctorChatView.vue:28` | **通过** |
| 5.2 | `toggleHistoryList()`：toggle + 打开时 loadHistory / 关闭时 clearConversationHistory（L307-314） | `src/views/DoctorChatView.vue:143-150` | **通过** |
| 5.3 | `loadHistory()`：token 校验 → doctorId Number.isFinite 校验 → loadDoctorConversationHistory（L320-326） | `src/views/DoctorChatView.vue:156-162` | **通过** — 两个守卫均存在 |
| 5.4 | `selectHistorySession(item)`：setDoctorConversation → 清空 conversations → 关弹层 → clearConversationHistory（L335-342） | `src/views/DoctorChatView.vue:171-178` | **通过** |
| 5.5 | `formatHistoryTime(isoString)`：空串返回 '' → 无效日期返回原串 → 有效日期格式化为 `YYYY-MM-DD HH:mm`（L351-361） | `src/views/DoctorChatView.vue:187-197` | **通过** — 三路径均实现 |
| 5.6 | 类型导入 `ConversationHistoryItem`（L378-379） | `src/views/DoctorChatView.vue:9` | **通过** |
| 5.7 | 组件导入 `SkeletonLoader` / `ErrorRetry` / `EmptyState`（L380-383） | `src/views/DoctorChatView.vue:10-12` | **通过** |
| 5.8 | 未导入 `getDoctorConversationHistory`（简化方案，L376-377） | `src/views/DoctorChatView.vue` import 区 | **通过** — 仅 7 行 import，无 getDoctorConversationHistory，历史加载全部通过 chatStore 代理 |

### 1.6 Template 模板

| # | 契约条目 | 实现位置 | 状态 |
|---|---------|----------|------|
| 6.1 | Header 历史按钮：`class="btn-history"` + `@click="toggleHistoryList"` + `fa-history` 图标（L392-400） | `src/views/DoctorChatView.vue:238-245` | **通过** |
| 6.2 | 按钮位置：`.btn-back` → `.doctor-info-bar` → `.btn-history` → `.btn-delete`（L403） | `src/views/DoctorChatView.vue:224-253` | **通过** — 顺序正确 |
| 6.3 | 弹层 `v-if="showHistoryPanel"` + overlay `@click.self="toggleHistoryList"`（L410） | `src/views/DoctorChatView.vue:257` | **通过** |
| 6.4 | 加载态：`<SkeletonLoader type="list" :rows="3" />`（L421-425） | `src/views/DoctorChatView.vue:268-272` | **通过** — props 匹配 SkeletonLoader 定义（type: 'list', rows: 3） |
| 6.5 | 错误态：`<ErrorRetry :message="chatStore.historyError" @retry="loadHistory" />`（L428-432） | `src/views/DoctorChatView.vue:275-279` | **通过** — props/events 匹配 ErrorRetry 定义 |
| 6.6 | 空态：`<EmptyState icon="fa-history" title="暂无历史会话" description="..." />`（L435-440） | `src/views/DoctorChatView.vue:282-287` | **通过** — props 匹配 EmptyState 定义 |
| 6.7 | 列表：`v-for="item in chatStore.conversationHistory" :key="item.conversation_id"` + `@click="selectHistorySession(item)"`（L443-461） | `src/views/DoctorChatView.vue:290-308` | **通过** — key 为 conversation_id，名称显示 `item.name \|\| '未命名会话'` |

### 1.7 CSS 样式

| # | 契约条目 | 实现位置 | 状态 |
|---|---------|----------|------|
| 7.1 | `.btn-history` 样式（L473-490） | `src/views/DoctorChatView.vue:657-674` | **通过** — 含 hover 态 |
| 7.2 | `.history-panel-overlay` + `.history-panel`（L493-515） | `src/views/DoctorChatView.vue:677-699` | **通过** — 含 slideUp 动画 |
| 7.3 | `.history-panel-header` + `.btn-close-panel`（L518-543） | `src/views/DoctorChatView.vue:701-727` | **通过** |
| 7.4 | `.history-panel-body`（L546-549） | `src/views/DoctorChatView.vue:729-735` | **通过** |
| 7.5 | `.history-list` + `.history-item` 系列（L553-607） | `src/views/DoctorChatView.vue:737-791` | **通过** — 含 hover/active、ellipsis、颜色 |

---

## 2. 错误处理场景逐条验证

| # | 场景（detail_v2.md L611-622） | 实现覆盖 | 状态 |
|---|-----------------------------|----------|------|
| E1 | 网络错误（fetch 抛错）→ store catch 设 historyError → UI 显示 ErrorRetry | `useChatApi.ts:146-148` 抛错 → `chatStore.ts:759-760` catch → `DoctorChatView.vue:275-279` ErrorRetry | **通过** |
| E2 | HTTP 401 → fetch !res.ok 抛 Error → store 设 historyError → UI ErrorRetry（不触发 useApi 拦截器自动跳转） | `useChatApi.ts:146-148`（fetch 无拦截器） → `chatStore.ts:759-760` → `DoctorChatView.vue:275-279` | **通过** — fetch 不走 axios 拦截器，无自动跳转 |
| E3 | 后端返回空数组 → store 写 `[]` → UI 显示 EmptyState | `useChatApi.ts:152` 返回 `[]` → `chatStore.ts:758` 写入 → `DoctorChatView.vue:283` length===0 条件 | **通过** |
| E4 | 后端返回 success:false（200 响应）→ `json.data` 可能 undefined → `\|\| []` 降级为 `[]` | `useChatApi.ts:152` `(json.data as ...) \|\| []` | **通过** |
| E5 | doctorId 无效（NaN）→ `loadHistory()` 中 `Number.isFinite` 守卫提前 return | `DoctorChatView.vue:159-160` `if (!Number.isFinite(doctorId) \|\| doctorId <= 0) return` | **通过** |
| E6 | token 为空 → `loadHistory()` 中 `!token` 守卫提前 return | `DoctorChatView.vue:158` `if (!token) return` | **通过** |
| E7 | 用户快速点击"选择会话"→ 同步操作无竞态风险 | `DoctorChatView.vue:171-178` — 全部同步（set Map + 清空数组 + 关弹层） | **通过** |
| E8 | localStorage 写入失败 → setDoctorConversation 内部 try/catch 静默降级 | `chatStore.ts:149-153` try/catch 已存在（非新增） | **通过** — 已有逻辑 |

### 错误状态重置

| # | 场景 | 实现 | 状态 |
|---|------|------|------|
| R1 | 弹层关闭（关闭按钮/overlay 点击）→ `clearConversationHistory()` 清空 error + list | `DoctorChatView.vue:148` 关闭分支 → `chatStore.ts:794-797` | **通过** |
| R2 | 弹层打开 → `loadHistory()` 先重置 `historyLoading=true, historyError=''` | `chatStore.ts:755-756` | **通过** |

---

## 3. 状态变化规则验证

| # | 规则（detail_v2.md L641-652） | 实现 | 状态 |
|---|------------------------------|------|------|
| S1 | 弹层状态机：false → 点击按钮 → true → 加载完成 → 展示 → 选择/关闭 → false | `DoctorChatView.vue:143-150` toggleHistoryList + `:171-178` selectHistorySession | **通过** |
| S2 | 历史加载流程：IDLE → LOADING → SUCCESS / ERROR | `chatStore.ts:755-763` | **通过** |
| S3 | 会话恢复：setDoctorConversation → 清空 conversations → 关弹层 | `DoctorChatView.vue:173-177` | **通过** |
| S4a | 弹层打开/关闭不修改 conversations（仅选择会话时清空） | 对比 `toggleHistoryList`（L143-150 无 conversations 操作）与 `selectHistorySession`（L175 清空） | **通过** |
| S4b | 弹层打开/关闭不修改 isStreaming | `chatStore.ts` 历史相关代码无 isStreaming 写入 | **通过** |
| S4c | 弹层打开期间仍可与当前医生正常对话 | overlay 不阻止底层消息列表交互（`v-if` 仅渲染弹层 DOM，不影响消息列表） | **通过** |

---

## 4. 方法调用顺序验证

detail_v2.md L654-680 定义了完整调用链。逐段验证：

**打开弹层链**：
```
用户点击按钮 → toggleHistoryList() [DoctorChatView.vue:143]
  → showHistoryPanel = true [L144]
  → loadHistory() [L146]
    → token 校验 [L158]
    → doctorId 校验 [L159-160]
    → chatStore.loadDoctorConversationHistory(doctorId, token) [L161]
      → historyLoading = true [chatStore.ts:755]
      → historyError = '' [L756]
      → getDoctorConversationHistory(doctorId, token) [L758]
      → conversationHistory = result [L758]
      → historyLoading = false [L762]
```
**状态**：**通过** — 调用链与设计完全一致。

**选择会话链**：
```
用户点击会话项 → selectHistorySession(item) [DoctorChatView.vue:171]
  → chatStore.setDoctorConversation(doctorId, item.conversation_id) [L173]
  → chatStore.conversations.length = 0 [L175]
  → showHistoryPanel = false [L176]
  → chatStore.clearConversationHistory() [L177]
```
**状态**：**通过** — 调用顺序与设计完全一致。

**关闭弹层链**：
```
用户点击 overlay / 关闭按钮 → toggleHistoryList() [DoctorChatView.vue:143]
  → showHistoryPanel = false [L144]
  → chatStore.clearConversationHistory() [L148]
```
**状态**：**通过**。

---

## 5. 不变式检查

| # | 不变式（detail_v2.md L724-729） | 验证 | 状态 |
|---|-------------------------------|------|------|
| I1 | 现有对话功能不受影响 — 新增代码仅在 showHistoryPanel=true 时渲染 | 弹层由 `v-if="showHistoryPanel"` 控制，不影响消息列表/输入框/发送逻辑/SSE 流/清空功能 | **通过** |
| I2 | 现有 store 功能不受影响 — 新增 state/actions 为纯增量追加 | chatStore.ts 新增行 L19/L22/L25（state）+ L751-797（actions）+ L841-848（exports），未修改任何现有代码 | **通过** |
| I3 | 现有 useChatApi 函数不受影响 — 新增 2 个 fetch 函数为纯增量 | useChatApi.ts 新增 L135-184，未修改 sendChatMessage/getDoctorInfo 等 | **通过** |
| I4 | v1（B1 Login.vue）不受影响 — D1 涉及文件与 B1 修改的 Login.vue 无交集 | 变更清单：sse.ts / useChatApi.ts / chatStore.ts / DoctorChatView.vue。Login.vue 不在其中 | **通过** |
| I5 | conversations（ChatMessage[]）与 conversationHistory（ConversationHistoryItem[]）命名不冲突 | chatStore.ts L16 `conversations` vs L19 `conversationHistory`，类型不同，语义不同 | **通过** |

---

## 6. 类型检查覆盖情况

项目使用 `vue-tsc -b` 进行编译时类型检查（已通过，零错误）。以下新引入的类型定义/函数签名均被 vue-tsc 校验覆盖：

| 类型/签名 | 位置 | vue-tsc 覆盖说明 |
|----------|------|-----------------|
| `ConversationHistoryItem` interface | `src/types/sse.ts:71-78` | 被 useChatApi.ts、chatStore.ts、DoctorChatView.vue import，vue-tsc 会校验所有消费方的类型一致性 |
| `getDoctorConversationHistory(doctorId: number, token: string): Promise<ConversationHistoryItem[]>` | `src/composables/useChatApi.ts:135-138` | 函数签名 + 返回值泛型被 vue-tsc 校验；chatStore.ts:758 调用处校验实参类型 |
| `getAssistantConversations(token: string): Promise<ConversationHistoryItem[]>` | `src/composables/useChatApi.ts:168-170` | 同上，chatStore.ts:781 调用处校验 |
| `conversationHistory: Ref<ConversationHistoryItem[]>` | `src/stores/chatStore.ts:19` | store return 类型推断，被 DoctorChatView.vue `chatStore.conversationHistory` 消费时校验 |
| `historyLoading: Ref<boolean>` | `src/stores/chatStore.ts:22` | 同上，模板中 `chatStore.historyLoading` 使用 |
| `historyError: Ref<string>` | `src/stores/chatStore.ts:25` | 模板中 `chatStore.historyError` 传给 ErrorRetry `:message` prop（期望 string），vue-tsc 校验 |
| `loadDoctorConversationHistory(doctorId: number, token: string): Promise<void>` | `src/stores/chatStore.ts:751-753` | DoctorChatView.vue:161 调用处校验 |
| `loadAssistantConversationHistory(token: string): Promise<void>` | `src/stores/chatStore.ts:775-776` | （当前无调用方，但签名本身被 vue-tsc 校验无语法/类型错误） |
| `clearConversationHistory(): void` | `src/stores/chatStore.ts:794` | DoctorChatView.vue:148,177 调用处校验 |
| `selectHistorySession(item: ConversationHistoryItem): void` | `src/views/DoctorChatView.vue:171` | 模板中 `@click="selectHistorySession(item)"` 的 item 来自 `v-for`，类型由 `chatStore.conversationHistory` 推断为 `ConversationHistoryItem` |
| `formatHistoryTime(isoString: string): string` | `src/views/DoctorChatView.vue:187` | 模板中 `{{ formatHistoryTime(item.created_at) }}` 的实参类型 `string` 与形参一致 |
| SkeletonLoader props (`type`, `rows`) | `src/views/DoctorChatView.vue:269-271` | `type="list"` 字面量 vs 联合类型 `'card' \| 'list' \| ...`，`:rows="3"` number vs `rows?: number`，vue-tsc 校验 |
| ErrorRetry props (`message`) + event (`@retry`) | `src/views/DoctorChatView.vue:276-278` | `:message` 接收 `string`，`@retry` 回调签名 `()=>void`，vue-tsc 校验 |
| EmptyState props (`icon`, `title`, `description`) | `src/views/DoctorChatView.vue:283-286` | 三个 prop 类型均为 `string`，vue-tsc 校验 |
| chatStore import 合并（5 函数） | `src/stores/chatStore.ts:4-10` | vue-tsc 校验所有命名导出存在且类型匹配 |

**结论**：所有新引入的类型定义、函数签名、模板 props/events 均在 vue-tsc 编译范围内。`npm run build:client` 已通过（零错误），类型系统完整覆盖。

---

## 7. 需人工/冒烟验证的端到端场景

以下场景无法通过静态分析验证，需在浏览器中手动验证或由 E2E 测试覆盖。

### 7.1 正常路径

| 场景 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|
| H1 — 查看历史会话列表 | 已登录，已进入某医生对话页（`/consultation/chat/:id`），该医生有历史会话 | 1. 点击 header 右侧"历史会话"按钮（fa-history 图标）<br>2. 等待加载完成（骨架屏 → 列表） | 1. 弹层从底部滑入（slideUp 动画）<br>2. 加载中显示 SkeletonLoader（3 行 list）<br>3. 加载完成后显示历史会话列表，每项含 图标 + 名称 + 格式化时间 + 箭头 |
| H2 — 选择历史会话恢复 | 弹层已打开且显示会话列表 | 1. 点击某个会话项 | 1. 弹层关闭<br>2. 当前消息列表清空<br>3. 后续发送消息将携带该 conversation_id（通过 setDoctorConversation 写入 Map + localStorage） |
| H3 — 关闭弹层（关闭按钮） | 弹层已打开 | 1. 点击弹层右上角 × 按钮 | 弹层关闭，消息列表不变，可继续当前对话 |
| H4 — 关闭弹层（overlay） | 弹层已打开 | 1. 点击弹层外的半透明遮罩区域 | 弹层关闭，消息列表不变 |
| H5 — 再次打开弹层 | 弹层关闭后 | 1. 再次点击"历史会话"按钮 | 弹层重新打开，重新发起 fetch 请求加载历史列表 |

### 7.2 边界条件

| 场景 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|
| B1 — 医生无历史会话 | 某医生从未有过对话 | 1. 进入该医生对话页<br>2. 点击"历史会话"按钮 | 弹层显示 EmptyState（"暂无历史会话"/"当前医生没有历史对话记录"） |
| B2 — 会话名称为空 | 后端返回某会话 name 为 null/undefined/空串 | 1. 打开历史会话弹层 | 该会话项名称显示"未命名会话"（`item.name \|\| '未命名会话'`） |
| B3 — 时间字符串无效 | 后端返回 created_at 为无效 ISO 字符串 | 1. 打开历史会话弹层 | `formatHistoryTime` 返回原始字符串（降级显示），不崩溃 |
| B4 — 时间字符串为空 | 后端返回 created_at 为空串 | 1. 打开历史会话弹层 | `formatHistoryTime` 返回空字符串，不显示时间 |
| B5 — doctorId 为 NaN | 路由参数非数字（如 `/consultation/chat/abc`） | 1. 点击"历史会话"按钮 | `loadHistory()` 中 `Number.isFinite` 守卫提前 return，弹层打开但不发请求，显示空列表（触发 EmptyState） |
| B6 — token 为空 | 用户未登录或 token 已清除 | 1. 点击"历史会话"按钮 | `loadHistory()` 中 `!token` 守卫提前 return，行为同 B5 |
| B7 — 快速切换医生 | 在弹层打开状态下通过浏览器前进/后退切换医生 | 1. 打开弹层<br>2. 浏览器后退到医生列表<br>3. 前进回医生对话 | `watch(route.params.id)` 触发 `abortActiveConnection` + 清空消息 + `loadDoctor()`，弹层状态随组件卸载/重载自然关闭 |

### 7.3 错误路径

| 场景 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|
| E1 — 网络断开 | 已登录，进入医生对话页 | 1. 断开网络（DevTools Network → Offline）<br>2. 点击"历史会话"按钮 | 弹层显示 ErrorRetry（"获取医生历史会话失败: ..."），有"点击重试"按钮 |
| E2 — 网络恢复后重试 | E1 状态 | 1. 恢复网络<br>2. 点击 ErrorRetry 的"点击重试"按钮 | 重新调用 `loadHistory()` → 重新 fetch → 成功后显示列表 |
| E3 — 服务器返回 500 | 已登录，后端异常 | 1. 点击"历史会话"按钮 | fetch 返回 !ok → throw Error → 弹层显示 ErrorRetry |
| E4 — 服务器返回 401 | token 过期 | 1. 点击"历史会话"按钮 | fetch 返回 401 → throw Error → 弹层显示 ErrorRetry（fetch 不使用 axios 拦截器，不会自动跳转登录） |
| E5 — 关闭弹层后再打开 | E1/E3/E4 状态 | 1. 关闭弹层<br>2. 再次打开弹层 | `clearConversationHistory()` 清空错误状态 → 重新 `loadHistory()` → 重新发起请求 |

### 7.4 交互兼容性

| 场景 | 操作 | 预期 |
|------|------|------|
| X1 — 弹层打开时发送消息 | 1. 打开历史弹层<br>2. 在输入框输入消息并发送 | 消息正常发送，SSE 流正常接收。弹层与消息列表互不干扰 |
| X2 — 弹层打开时 SSE 正在流式输出 | 1. 发送一条长消息等待 AI 回复（isStreaming=true）<br>2. 打开历史弹层 | 弹层正常显示，SSE 流不受影响。isStreaming 状态不变 |
| X3 — 弹层打开时点击清空对话 | 1. 打开历史弹层<br>2. 点击清空对话按钮（垃圾桶图标） | 消息列表清空，弹层状态不变（仍打开状态）。两条逻辑独立 |
| X4 — 弹层打开时点击返回 | 1. 打开历史弹层<br>2. 点击返回按钮（←） | `goBack()` 触发 abort + router.push('/consultation')，组件卸载，弹层随之移除 |

---

## 8. 验证汇总

| 类别 | 条目数 | 通过 | 失败 | 需人工 |
|------|--------|------|------|--------|
| 类型定义 | 3 | 3 | 0 | 0 |
| API 函数 — getDoctorConversationHistory | 6 | 6 | 0 | 0 |
| API 函数 — getAssistantConversations | 5 | 5 | 0 | 0 |
| Store 扩展 | 10 | 10 | 0 | 0 |
| UI 逻辑 | 8 | 8 | 0 | 0 |
| Template 模板 | 7 | 7 | 0 | 0 |
| CSS 样式 | 5 | 5 | 0 | 0 |
| 错误处理 | 8 | 8 | 0 | 0 |
| 错误状态重置 | 2 | 2 | 0 | 0 |
| 状态变化规则 | 6 | 6 | 0 | 0 |
| 方法调用顺序 | 3 | 3 | 0 | 0 |
| 不变式 | 5 | 5 | 0 | 0 |
| 类型检查覆盖 | 15 | 15 | 0 | 0 |
| 端到端场景（需人工） | — | — | — | 18 |
| **合计（静态）** | **83** | **83** | **0** | — |

## 9. 设计偏差

实现报告（code_v2.md）声明"无偏差"。经逐条对照验证确认：所有接口签名、类型定义、行为契约、UI 结构、CSS 样式均严格按 detail_v2.md 实现，未发现偏差。
