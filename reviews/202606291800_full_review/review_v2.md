# Round 2: 代码质量与类型安全审查

## 审查范围

完整审查所有前端 TypeScript/Vue3 代码（`src/`，56个文件）和后端 Express 代码（`server/`，28个文件），覆盖类型安全、Vue3 最佳实践、错误处理、代码复用、安全性和后端质量六个维度。审查依据设计文档 `docs/2_detailed_design_v4.md` 第1章技术选型和质量标准。

---

## 严重问题

### R2-S1. App.vue: StorageEvent 监听器读写介质不一致（死代码）
- **位置**: `src/App.vue:32-42`
- **描述**: `handleStorageChange` 监听 `StorageEvent`，但内部使用 `localStorage.getItem('token')` 和 `localStorage.getItem('role')` 读取。v16 设计已将 token/role/user 迁移至 `sessionStorage` 存储并经 `BroadcastChannel` 实现跨标签页同步（见 `authStore.ts:17-37`）。`StorageEvent` 仅对 `localStorage` 变更触发，不会对 `sessionStorage` 变更触发，因此此 handler 在当前实现下永远不会收到有效事件——它是死代码。同时，它仍假设从 `localStorage` 恢复 token，与 authStore 的 `sessionStorage` 方案不一致。
- **建议修复**:
  1. 删除 `handleStorageChange`、`onMounted` 中的 `window.addEventListener('storage', ...)` 和 `onUnmounted` 中的 `removeEventListener`
  2. 或将其改为使用 `BroadcastChannel` 监听（如果 authStore 尚未覆盖所有同步场景）

### R2-S2. AiChatDialog.vue: Markdown 渲染绕过了统一的 sanitizeHtml 白名单加固（XSS 风险）
- **位置**: `src/components/AiChatDialog.vue:112-121`
- **描述**: `renderContent()` 函数使用 `DOMPurify.sanitize(html)` 调用 DOMPurify 的**默认配置**，而非项目统一的 `sanitizeHtml()`（定义于 `src/utils/sanitize.ts:50-106`）。`sanitizeHtml` 自定义了 ALLOWED_TAGS、ALLOWED_ATTR、ALLOWED_URI_REGEXP 白名单以及 FORBID_TAGS/FORBID_ATTR 黑名单双保险。使用默认 DOMPurify 配置意味着：
  - 允许的标签集更宽松（可能包括 `<style>`/`<form>` 等）
  - 无 URI 协议白名单（可能允许 `javascript:` 伪协议）
  - 无双保险禁止列表
  - catch 分支 `DOMPurify.sanitize(content)` 同样未经白名单加固

  其他使用 Markdown 的组件（DoctorChatView、Admin.vue 等）正确调用了 `renderMarkdown()` from `useMarkdown.ts`，该函数内部调用 `sanitizeHtml()`。AiChatDialog 是唯一绕过统一净化管道的组件。
- **建议修复**: 将 `renderContent` 改为使用 `renderMarkdown(content)` 导入自 `@/composables/useMarkdown`，与其他组件保持一致：

```typescript
import { renderMarkdown } from '@/composables/useMarkdown'

function renderContent(content: string): string {
  return renderMarkdown(content)
}
```

### R2-S3. AiChatDialog.vue: 免责声明逻辑完全复制 useUI.ts，导致维护分叉
- **位置**: `src/components/AiChatDialog.vue:21-47`
- **描述**: AiChatDialog 内联定义了 `hasAcceptedDisclaimer()`、`showDisclaimer()`、`ensureDisclaimer()` 三个函数，与 `useUI.ts` 中已导出的同名函数功能完全一致。这导致：
  1. 免責声明弹窗的 HTML 内容、样式在两处独立维护，修改一处可能遗漏另一处
  2. `localStorage` key `'disclaimer_accepted'` 硬编码在两处（虽然当前一致，但存在未来分叉风险）
  3. `showDisclaimer` 在 AiChatDialog 中直接动态 `import('sweetalert2')`，绕过了 `useUI.ts` 的懒加载单例模式（`getSwal()` 共享同一个 Promise）
- **建议修复**: 删除 AiChatDialog 中的 `hasAcceptedDisclaimer`、`showDisclaimer`、`ensureDisclaimer`，改为从 `@/composables/useUI` 导入并使用：

```typescript
import { hasAcceptedDisclaimer, showDisclaimer, setDisclaimerAccepted } from '@/composables/useUI'
```

### R2-S4. AiChatDialog.vue + DoctorChatView.vue: 模板/组件中直接操作 Store 内部状态
- **位置**: 
  - `src/components/AiChatDialog.vue:162`
  - `src/views/DoctorChatView.vue:96-97, 162, 192`
- **描述**: 清空对话的操作直接修改 `chatStore.conversations.length = 0`，这是直接修改 Pinia store 暴露的响应式数组的 length 属性。DoctorChatView 中有 3 处（`clearChat` 函数、切换医生、watch 回调），AiChatDialog 中有 1 处。虽然 Vue 响应式系统会追踪此修改，但这违反了 Pinia 最佳实践（状态应由 actions 修改），且绕过 DevTools action 追踪。`clearAssistantConversation()`/`clearDoctorConversation()` 仅清理 conversation_id，不清空消息列表；清空消息的行为应由 store 暴露的统一 action 封装。
- **建议修复**: 在 chatStore 中添加 `clearMessages()` action，各处统一调用：

```typescript
// chatStore.ts
function clearMessages(): void {
  conversations.value = []
}

// 各处替换:
chatStore.clearMessages()
```

### R2-S5. Login.vue: 使用 `any` 类型捕获错误
- **位置**: `src/views/Login.vue:42`
- **描述**: `catch (err: any)` 使用 `any` 类型，然后直接访问 `err?.response?.data?.error?.message`，绕过了 TypeScript 的类型检查。项目中已有 `getErrorMessage()` 工具函数（`src/utils/errorMessage.ts`）专门用于从 unknown 类型错误中提取用户可读消息。
- **建议修复**:

```typescript
import { getErrorMessage } from '@/utils/errorMessage'

// 替换 catch 块:
} catch (err: unknown) {
  errorMsg.value = getErrorMessage(err, '登录失败')
}
```

### R2-S6. encryption.js: JWT_SECRET 缺失时使用硬编码默认密钥
- **位置**: `server/utils/encryption.js:22`
- **描述**: `deriveKey()` 函数中，若 `process.env.JWT_SECRET` 未设置，回退到硬编码字符串 `'default_secret_change_me'`。虽然变量名暗示需要修改，但代码在运行时不会报错或警告，会静默使用可预测的密钥。如果部署时忘记设置 `JWT_SECRET`，聊天 token 的 AES-256-GCM 加密将使用可预测的派生密钥，失去加密保护意义。
- **建议修复**: 如果 `JWT_SECRET` 未设置，应抛出启动错误而非静默降级：

```javascript
const secret = process.env.JWT_SECRET
if (!secret) {
  throw new Error('[encryption] JWT_SECRET 未设置，无法派生加密密钥。请在 .env 中配置 JWT_SECRET。')
}
```

### R2-S7. DoctorChatView.vue: 使用 `as any` 绕过类型检查
- **位置**: `src/views/DoctorChatView.vue:27`
- **描述**: `(authStore.user as any)?.avatar` 使用 `as any` 强制类型断言。`User` 类型（`models.ts:11-16`）已明确定义 `avatar: string | null`，无需 `as any`。此断言隐藏了类型错误——如果 `user` 为 `null`（未登录状态），`?.avatar` 正确返回 `undefined`，但 `as any` 消解了 TypeScript 对此路径的保护。
- **建议修复**: 直接使用正确的类型：

```typescript
const userAvatar = computed(() => {
  return authStore.user?.avatar || '/default-avatar.png'
})
```

### R2-S8. sseProxy.js: Mock 模式返回硬编码 conversation_id，可能污染前端状态
- **位置**: `server/services/sseProxy.js:13-15`
- **描述**: 当 `DIFY_API_BASE` 未配置时，Mock 模式返回固定的 `conversation_id: 'mock-001'` 和 `message_id: 'mock-msg-001'`。前端的 `chatStore.handleSSEEvent` 在 `onMessageEnd` 中会将此 ID 保存到 `doctorConversations` Map 和 `localStorage`（`chatStore.ts:245-251`）。这意味着用户在 Mock 模式下多次对话会共享同一个假 conversation_id，当后续配置真实 Dify 服务时，可能导致不可预期的会话合并行为。
- **建议修复**: Mock 模式每次生成唯一的 conversation_id：

```javascript
const mockId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
```

---

## 一般问题

### R2-S9. NewsView.vue: 搜索高亮中的 XSS 风险（v-html 未净化文章标题）
- **位置**: `src/views/NewsView.vue:394`
- **描述**: 搜索结果渲染使用 `v-html="highlightKeyword(item.title, searchedKeyword)"`。`highlightKeyword` 函数（helpers.ts:190-195）先用 `escapeHtml()` 转义文本，再用正则替换关键词。但 `escapeHtml` 仅转义 5 种字符（`& < > " '`），且 `v-html` 会渲染最终 HTML。如果 API 返回的 `item.title` 包含恶意内容（如 `<img src=x onerror=...>`），虽经 `escapeHtml` 转义后变为无害实体，但在复杂场景下（Markdown 格式标题等）可能存在边缘情况绕过。此外，catch 分支若 `escapeHtml` 内部实现变更，本行不受保护。
- **建议修复**: 对 `highlightKeyword` 的输出额外增加一层 `sanitizeHtml()` 净化。`highlightKeyword` 中使用 `escapeHtml` 是正确的第一层防御，渲染前加一道 sanitizeHtml 符合纵深防御原则。

### R2-S10. Home.vue: fetchDiabetesTypeDetail 的 Promise rejection 未被捕获
- **位置**: `src/views/Home.vue:107-111`
- **描述**: `showDiabetesType` 是一个 async 函数，在模板中作为 `@click="showDiabetesType(t)"` 的事件处理器直接调用。Vue 模板事件处理器不自动捕获 async 函数的 rejection。如果 `homeStore.fetchDiabetesTypeDetail(t.id)` 抛出（网络错误、500 响应），该 rejection 会成为 "Uncaught (in promise)" 错误，用户不会看到任何错误提示。
- **建议修复**: 在 `showDiabetesType` 内部包裹 try-catch：

```typescript
async function showDiabetesType(t: DiabetesType): Promise<void> {
  try {
    const detail = await homeStore.fetchDiabetesTypeDetail(t.id)
    const data: DiabetesTypeDetail = detail ?? t
    openTypeSwal(data)
  } catch {
    // fetchDiabetesTypeDetail 内部已设置 detailError，此处仅防止 unhandled rejection
  }
}
```

### R2-S11. admin.js: SQL 注入 — params.where 直接拼接到 SQL 字符串
- **位置**: `server/routes/admin.js:241, 301, 320`
- **描述**: `dispatchParameterizedQuery` 函数在三个工具操作中将 `params.where`（来自用户请求体）直接拼接进 SQL 字符串，未使用参数化占位符：
  - Line 241: `if (params.where) sql += ' WHERE ${params.where}'`（query_table）
  - Line 301: `` db.prepare(`UPDATE ${params.table} SET ${setClause} WHERE ${params.where}`) ``（update_record）
  - Line 320: `` db.prepare(`DELETE FROM ${params.table} WHERE ${params.where}`) ``（delete_record）
  
  虽然 `params.table` 通过了白名单校验，但 `params.where` 是原始用户输入，可以直接注入任意 WHERE 条件（如 `1=1` 批量删除/更新所有行）。攻击者需要 admin 凭证才能访问此端点，但一旦认证通过，此注入点可用于大规模数据破坏。
- **建议修复**: 将 `params.where` 解析为结构化条件后用参数化占位符重建，或至少对 where 子句进行严格的语法校验（仅允许 `column = value AND ...` 模式）。

### R2-S12. admin.js: get_table_schema 工具未校验 params.table 白名单
- **位置**: `server/routes/admin.js:332`
- **描述**: `get_table_schema`（tool='get_table_schema'）执行 `PRAGMA table_info(${params.table})` 前未像其他工具操作（query_table/insert_record/update_record/delete_record）一样校验 `params.table` 是否在白名单内。虽然 PRAGMA 是只读操作且 SQLite 的 `table_info` 不会执行恶意代码，但未校验的表名传入 SQL 字符串是一种不安全的模式，与其他工具操作不一致。
- **建议修复**: 将 `params.table` 的白名单校验移至 `dispatchParameterizedQuery` 函数开头，覆盖所有工具操作（包括 `get_table_schema`）。

### R2-G1. useAuth.ts: JwtPayload 索引签名使用 `any`
- **位置**: `src/composables/useAuth.ts:26`
- **描述**: `[key: string]: any` 索引签名允许 JWT payload 中的未知字段为任意类型，降低了类型安全。虽然 JWT payload 确实可能包含未知字段，但使用 `any` 意味着访问 `payload.customField.something.nested` 时不会产生类型错误。
- **建议修复**: 将 `any` 改为 `unknown`：

```typescript
[key: string]: unknown;
```

### R2-G2. useMarkdown.ts: `as any` 绕过 marked.renderer 类型约束
- **位置**: `src/composables/useMarkdown.ts:42`
- **描述**: `marked.use({ renderer: _linkRenderer as any })` 使用 `as any` 绕过 marked 的 renderer 类型约束。虽然 marked 的 `Renderer` 类型可能与自定义对象不完全匹配，但 `as any` 消解了所有类型保护。
- **建议修复**: 使用 marked 提供的 `Renderer` 类型或局部接口定义：

```typescript
import type { Renderer } from 'marked'
const _linkRenderer: Partial<Renderer> = { ... }
marked.use({ renderer: _linkRenderer })
```

### R2-G3. helpers.ts: 泛型工具函数使用 `any` 降低类型推导质量
- **位置**: `src/utils/helpers.ts:58, 136`
- **描述**: `DebouncedFn<T extends (...args: any[]) => any>` 和 `ThrottledFn<T extends (...args: any[]) => any>` 使用 `any[]` 和 `any` 作为约束。虽然这是通用工具函数的常见模式，但在严格 TypeScript 项目中，使用 `any` 会丢失参数类型和返回值类型的精确推导。
- **建议修复**: 使用 `unknown[]` 和更精确的泛型约束：

```typescript
export type DebouncedFn<T extends (...args: any[]) => any> = {
  (...args: Parameters<T>): ReturnType<T> | undefined
  cancel(): void
  flush(): ReturnType<T> | undefined
}
```
（当前签名本身已使用 `Parameters<T>` 和 `ReturnType<T>` 获得精确推导，但 `any` 约束降低了调用方的类型检查。实际风险较低。）

### R2-G4. AiChatDialog.vue: formatTime 重复定义
- **位置**: `src/components/AiChatDialog.vue:105-110`
- **描述**: `formatTime` 函数使用 `toLocaleTimeString` 实现，与 `src/utils/helpers.ts:51-54` 中已导出的 `formatTime` 功能相似但实现不同（helpers 使用 `formatDate` 内部实现）。DoctorChatView.vue 也内联了另一个 `formatTime`（使用 `toLocaleTimeString`）。三处独立的 `formatTime` 实现增加了维护负担。
- **建议修复**: 统一使用 `helpers.ts` 中的 `formatTime`，或创建一个共享的 composable。

### R2-G5. 多组件中 "请先登录" Toast 的重复代码
- **位置**: 
  - `src/components/AiChatDialog.vue:87-97`
  - `src/views/DoctorChatView.vue:67-76`
  - `src/views/Admin.vue:52-55`
- **描述**: 三个组件中都有相同的模式：检查 `authStore.token`，若为空则动态 `import('sweetalert2')` 并显示 "请先登录" toast。动态 `import()` 每次都会创建新的模块请求（虽然浏览器会缓存），且 toast 的配置文本在三个地方独立维护。
- **建议修复**: 在 `useUI.ts` 中添加 `showLoginRequired()` 辅助函数，三处统一调用。

### R2-G6. useApi.ts 与 chatStore.ts 中 401 处理使用动态 import 可能引发竞态
- **位置**: `src/composables/useApi.ts:43-53` 和 `src/stores/chatStore.ts:303-317`
- **描述**: 两处 401 响应处理都使用 `import('sweetalert2').then(...)` 或 `await import('sweetalert2')` 来显示 toast。动态 import 在模块未预加载时可能有延迟，而 `router.push('/login')`（useApi.ts:54）已同步执行。Toast 可能在页面跳转后才弹出，或根本来不及显示。chatStore 中的 401 处理先 `await import('@/stores/authStore')` 再 `await import('sweetalert2')`，两次动态 import 增加了延迟。
- **建议修复**: 在 useApi.ts 模块顶层静态导入 SweetAlert2（它已在 package.json 中声明为依赖）：

```typescript
import Swal from 'sweetalert2'
// 替换 import('sweetalert2').then(...) 为直接调用 Swal.fire(...)
```

### R2-G7. risk.js: parseRiskOutputRegex 正则解析作为 JSON.parse 失败后的回退
- **位置**: `server/routes/risk.js:11-29`
- **描述**: `parseRiskOutputRegex` 使用正则表达式从非 JSON 纯文本中提取风险预测字段。虽然这是 Dify 输出格式不一致时的合理回退，但正则匹配是尽力而为的（best-effort），`risk_level_detail` 始终为空字符串，`suggestions` 始终为空数组，`bmi` 始终为 `undefined`。这意味着回退解析的结果比 JSON 解析的结果信息量少很多，且无任何日志记录表明走了回退路径。
- **建议修复**: 在回退解析时增加 `console.warn` 日志，便于排查 Dify 输出格式问题。

### R2-G8. sseProxy.js: upstream error handler 中日志不足
- **位置**: `server/services/sseProxy.js:89-97`
- **描述**: `upstreamReq.on('timeout', ...)` 和 `upstreamReq.on('error', ...)` 回调均未记录任何日志。当 Dify SSE 代理出现超时或连接错误时，运维人员无法通过服务端日志定位问题根因。
- **建议修复**: 增加 `console.error` 日志：

```javascript
upstreamReq.on('timeout', () => {
  console.error('[sseProxy] Upstream timeout for user', userId)
  // ...
})
upstreamReq.on('error', (err) => {
  console.error('[sseProxy] Upstream error:', err.message)
  // ...
})
```

### R2-G9. useUI.ts: loadingCounter 使用模块级 ref 在 SSR 场景下有潜在问题
- **位置**: `src/composables/useUI.ts:67`
- **描述**: `const loadingCounter = ref(0)` 定义在模块顶层，是模块单例。在当前 SPA 场景下工作正常，但如果未来迁移到 SSR（Server-Side Rendering），模块级状态会在请求间共享，导致不同用户的 loading 状态互相干扰。
- **建议修复**: 将 `loadingCounter` 移到 `useUI()` composable 函数内部作为局部状态，或使用 Pinia store 管理 loading 状态。（当前 SPA 场景下不是紧急问题，但值得在代码中标注为 SPA-only。）

### R2-G10. server/routes/plan.js: 幂等检查在 Dify 调用之后执行
- **位置**: `server/routes/plan.js:44`
- **描述**: `checkIdempotent(userId)` 在 `callWorkflowBlocking()` 调用**之后**才执行。这意味着即使用户在 30s 内重复提交，Dify API 请求已经发出、token 已消耗，仅数据库写入被阻止。幂等检查应该在 Dify 调用之前执行，以节省 API 调用成本。
- **建议修复**: 将 `checkIdempotent` 调用移到 `callWorkflowBlocking` 之前：

```javascript
if (!checkIdempotent(req.user.user_id)) {
  throw new AppError(409, 'CONFLICT', '请求过于频繁，请稍后再试')
}
const difyResponse = await callWorkflowBlocking(...)
```

### R2-G11. Consultation.vue: 4 处 `(doctor as any)` 类型断言绕过类型检查
- **位置**: `src/views/Consultation.vue:84, 88-90`
- **描述**: 模板中多处使用 `(doctor as any).is_online`、`(doctor as any).department`、`(doctor as any).title`、`(doctor as any).description`。`Doctor` 接口（`models.ts:36-43`）未定义 `is_online`、`department`、`title`、`description` 字段，这些字段存在于 `DoctorDetail` 接口中。`as any` 断言消解了 TypeScript 的类型保护，应修复类型定义而非绕过检查。
- **建议修复**: 将 Consultation.vue 中使用的 doctor 类型从 `Doctor` 改为 `DoctorDetail`（`DoctorDetail extends Doctor` 包含这些附加字段），或扩展 `Doctor` 接口为可选字段。

### R2-G12. NewsView.vue: sessionStorage 恢复时缺少运行时类型校验
- **位置**: `src/views/NewsView.vue:43-55`
- **描述**: `restoreState()` 从 sessionStorage 恢复 `page` 和 `category` 时，仅做 `state.page || 1` 假值回退，未校验 `typeof state.page === 'number'`。如果 sessionStorage 被篡改或损坏，可能传入字符串等非预期类型给 API 调用参数。
- **建议修复**: 增加显式类型校验：`typeof state.page === 'number' && state.page > 0 ? state.page : 1`

### R2-G13. upload.js: Multer filename 回调中未防御性检查 req.user
- **位置**: `server/routes/upload.js:23`
- **描述**: Multer `diskStorage.filename` 回调在模块加载时定义，运行时访问 `req.user.user_id`。当前 `authMiddleware` 在路由处理器之前执行，所以 `req.user` 保证存在。但若中间件链被重排或 `authMiddleware` 被移除，`req.user` 为 `undefined` 时访问 `.user_id` 会抛出 `TypeError`（Express 4 的 try-catch 不捕获 multer 内部回调中的同步异常）。
- **建议修复**: 在 filename 回调中增加防御性检查：

```javascript
filename: (req, file, cb) => {
  if (!req.user || !req.user.user_id) {
    return cb(new Error('User not authenticated'))
  }
  const ext = path.extname(file.originalname)
  cb(null, `user_${req.user.user_id}_${Date.now()}${ext}`)
}
```

### R2-G14. app.js: CORS 配置过于宽松且缺少全局限流
- **位置**: `server/app.js:9`
- **描述**: `app.use(cors())` 使用默认选项，允许所有来源（`Access-Control-Allow-Origin: *`）。对于处理认证和敏感健康数据的 API，生产环境中应限制已知前端来源。此外，全局缺少速率限制中间件（如 `express-rate-limit`），auth 和 admin 路由易受暴力破解和 DoS 攻击。
- **建议修复**: 配置 CORS origin 白名单；添加速率限制中间件，特别是对 `/api/auth/login`、`/api/auth/register` 和 `/api/admin/execute` 端点。

### R2-G15. 多条路由中未校验 :id 参数是否为合法整数
- **位置**: 
  - `server/routes/articles.js:159`
  - `server/routes/chat.js:21`
  - `server/routes/diabetes.js:13`
  - `server/routes/doctors.js:17`
- **描述**: 路由参数 `:id` 直接用于数据库查询（如 `WHERE id = ?`），未校验其是否为合法的数字格式。参数化查询防止了 SQL 注入，但非数字 ID（如 `"abc"`）传给 `better-sqlite3` 会导致查询返回 `undefined`（类型不匹配无法匹配任何整数行），后续的 404 处理依赖隐式类型转换。
- **建议修复**: 在路由处理器开头添加参数格式校验：

```javascript
if (!/^\d+$/.test(req.params.id)) {
  throw new AppError(400, 'BAD_REQUEST', '无效的ID格式')
}
```

---

## 审查统计

- **审查文件数**: 84（前端 src/ 56 个、后端 server/ 28 个）
- **严重问题**: 12
- **一般问题**: 15

## 审查结论

本轮审查覆盖了完整的 84 个源代码文件，重点关注 TypeScript 类型安全、Vue3 最佳实践、错误处理和安全防护。

**正面发现**：
- **类型系统整体规范**：types/api.ts 和 types/models.ts 的类型定义清晰完整，API composable 层有明确的内联响应类型，strict null checks 贯穿始终。
- **sessionStorage 持久化稳健**：authStore、riskFormStore、homeStore、lifePlanStore 均实现了带运行时校验的 sessionStorage 读写（类型守卫、TTL 过期、脏数据清理），有效防止了反序列化攻击。
- **DOMPurify 白名单加固完善**：`sanitize.ts` 中的 ALLOWED_TAGS/ALLOWED_ATTR/ALLOWED_URI_REGEXP/FORBID_TAGS/FORBID_ATTR 五层防御配置是教科书级别的 XSS 防护。
- **后端输入校验全面**：validators.js 覆盖了注册、登录、风险预测、方案生成、打卡、方案调整、文章生成等所有用户输入端点，使用参数化查询（better-sqlite3 prepared statements）防止 SQL 注入。
- **API 层竞态防护**：punchStore 的 `requestId` 快照机制和 lifePlanStore 的 `generating` 防双击锁是多异步场景下的优秀实践。

**需改进的核心问题**：
1. **AiChatDialog.vue 是问题最多的单个文件**——绕过统一的 XSS 净化管道（R2-S2）、免责声明逻辑完全重复（R2-S3）、模板中直接修改 Store 状态（R2-S4）、formatTime 重复定义（R2-G4）。该文件应优先重构。
2. **admin.js text-to-SQL 功能存在 SQL 注入风险**（R2-S11, R2-S12）——`params.where` 直接拼接到 SQL 字符串，`get_table_schema` 未校验表名白名单。这是本轮发现的最严重后端安全缺陷。
3. **App.vue 的 StorageEvent handler 是死代码**（R2-S1），v16 迁移到 sessionStorage + BroadcastChannel 后，此监听器不再有效。
4. **多处使用 `any`/`as any` 绕过类型系统**（R2-S5、R2-S7、R2-G1、R2-G2、R2-G3、R2-G11），虽然不直接导致运行时 bug，但削弱了 TypeScript 的保护价值。
5. **后端 `encryption.js` 的硬编码回退密钥**（R2-S6）和 `sseProxy.js` 的固定 Mock ID（R2-S8）是在生产环境中需要关注的配置/安全缺陷。
6. **NewsView.vue 搜索高亮存在 XSS 边缘风险**（R2-S9）和 Home.vue 的未捕获 Promise rejection（R2-S10）需要修复。

整体而言，代码质量在类型系统和安全防护方面表现出色（sessionStorage 校验、DOMPurify 白名单加固、validators 全覆盖），主要问题集中在 AiChatDialog.vue 的代码复用不足、admin.js text-to-SQL 的注入风险和个别类型安全缺口上。建议优先修复 12 个严重问题，特别是 R2-S11（SQL 注入）、R2-S2（XSS 风险）和 R2-S6（密钥安全）。
