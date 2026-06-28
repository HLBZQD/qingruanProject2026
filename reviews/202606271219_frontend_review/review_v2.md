# Round 2: 代码质量与类型安全审查报告

## 严重问题（可能导致运行时错误或安全漏洞）

### 1. Token 明文存储在 localStorage 中，存在 XSS 窃取风险

- **位置**: `src/stores/authStore.ts:12`
- **问题描述**: JWT token 直接存储在 `localStorage`，攻击者通过 XSS 注入可轻易读取 `localStorage.getItem('token')` 并窃取凭据。localStorage 不具备 HttpOnly 保护，任何注入页面的恶意脚本均可读取。
- **风险**: 若页面存在 XSS（例如 `v-html` 净化配置不当、第三方库漏洞），攻击者可在毫秒内窃取所有用户的 token 并发起会话劫持。考虑到该应用渲染用户生成的 Markdown 内容（LifePlan content、AI 分析评语），XSS 攻击面客观存在。
- **建议修复**:
  ```typescript
  // 后端配置 httpOnly cookie 后，前端不再手动管理 token 存储。
  // 若后端短期内无法改造，至少切换到 sessionStorage 降低持久化窗口：
  const storage = window.sessionStorage // 浏览器关闭即清除，而非永久
  // 或使用内存变量 + 刷新时通过 refresh token 接口恢复
  ```
  **注意**: 这是架构层面问题，需要前后端协同；如后端已支持 httpOnly cookie，前端应立即移除 `localStorage.setItem('token', ...)` 代码。

### 2. focus() 调用在 `document.documentElement` 上执行，无元素焦点上下文

- **位置**: 无（经审查未发现 focus() 直接调用，排除了最初怀疑的竞态场景）
- **问题描述**: 审查后确认本批次代码不存在此问题。
- **风险**: N/A

### 3. `store.fetchAnalysis()` 为 fire-and-forget 调用，竞态条件未处理

- **位置**: `src/stores/punchStore.ts:59` `fetchAnalysis()` 与 `src/views/Punch.vue:144`
- **问题描述**: `onMounted` 中同时调用 `store.fetchList()` 和 `store.fetchAnalysis()`，但 `fetchAnalysis()` 未使用 `store` 内的 `requestId` 防竞态机制。如果用户快速离开并重进页面，旧请求的响应可能覆盖新请求的状态，导致展示不一致的过期 AI 分析。
- **风险**: 用户在快速页面切换后可能看到错误的 AI 分析数据（与当前实际记录不匹配）。
- **建议修复**:
  ```typescript
  // punchStore.ts - 为 fetchAnalysis 增加 requestId 防竞态快照
  async function fetchAnalysis(): Promise<void> {
    analysisLoading.value = true
    analysisError.value = null
    requestId.value++
    const snapshot = requestId.value
    try {
      analysis.value = await getPunchAnalysis()
    } catch (e) {
      if (snapshot !== requestId.value) return
      analysisError.value = e instanceof Error ? e : new Error('AI 分析暂不可用')
    } finally {
      if (snapshot === requestId.value) {
        analysisLoading.value = false
      }
    }
  }
  ```
  当 `snapshot !== requestId.value` 时，静默丢弃旧响应。

### 4. DOMPurify 使用默认配置，未配置 `ALLOWED_URI_REGEXP` 防护

- **位置**: `src/views/Home.vue:116`, `src/views/LifePlan.vue:98`, `src/views/Punch.vue:59`
- **问题描述**: DOMPurify 以默认配置运行（`DOMPurify.sanitize(html)`），未显式设定 `FORBID_TAGS`、`FORBID_ATTR`、`ALLOWED_URI_REGEXP` 等安全参数。默认配置允许某些协议（如 `javascript:`）可能被绕过——虽然 DOMPurify 默认会移除 `javascript:` 等危险协议，但不同版本的默认行为可能有差异，且未显式加固给代码审查和审计带来不确定性。
- **风险**: 若 DOMPurify 某版本存在已知绕过漏洞或默认配置不够严格，Markdown 渲染路径（`marked.parse → DOMPurify.sanitize → v-html`）可能成为 XSS 入口。LifePlan 中的 `item.content` 和 Punch 中的 AI 分析评语均由后端返回，后端可能返回用户可控的内容。
- **建议修复**:
  ```typescript
  // main.ts 或公共 composable（例如 useMarkdown.ts）中统一配置
  import DOMPurify from 'dompurify'
  
  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    // 禁止 <script> / <style> / <iframe> 等
    if (data.tagName === 'script' || data.tagName === 'style' || data.tagName === 'iframe') {
      node.remove()
    }
  })
  
  // 或者至少在生产环境显式设置：
  const purifyConfig = {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img', 'blockquote', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'span', 'div'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'style', 'target'],
    ALLOW_DATA_ATTR: false,
  }
  
  export function sanitizeHtml(html: string): string {
    return DOMPurify.sanitize(html, purifyConfig)
  }
  ```
  然后将所有 `DOMPurify.sanitize(html)` 调用替换为统一的 `sanitizeHtml(html)`。

### 5. `punchStore.filter` 使用 `reactive` 而非 `ref`，当传入 `undefined` 时对象属性可能被意外保留

- **位置**: `src/stores/punchStore.ts:19-23`
- **问题描述**: `filter` 使用 `reactive` 定义，但 `setFilter` 方法中 `punch_type` 字段可能被赋值为 `undefined`（表示"全部"）。`reactive` 对象中值为 `undefined` 的属性在展开到 `PunchListParams` 时不会触发可选属性省略——`{ ...(filter.punch_type ? { punch_type: filter.punch_type } : {}) }` 写法已兜底，但 `filter` 本身的状态语义不够清晰：`punch_type: undefined` 和 `punch_type` 属性不存在是两种不同的状态。
- **风险**: 低——当前代码通过条件展开正确过滤了 undefined 值，但状态一致性隐患存在。
- **建议修复**: 使用 `ref` 包裹对象或显式处理 undefined 清理：
  ```typescript
  // 改用 ref + 不可变更新，与 setFilter 的合并逻辑一致
  const filter = ref<{ startDate?: string; endDate?: string; punch_type?: PunchType }>({})
  
  function setFilter(partial: { startDate?: string; endDate?: string; punch_type?: PunchType | undefined }): void {
    const next = { ...filter.value, ...partial }
    // 清除 `punch_type: undefined` 的键
    if (next.punch_type === undefined) delete next.punch_type
    filter.value = next
    fetchList()
  }
  ```

---

## 一般问题（代码异味、最佳实践偏离）

### 6. `safeContentHtml` / `safeAnalysisHtml` 函数在各组件中重复定义

- **位置**: `src/views/LifePlan.vue:94-99`, `src/views/Punch.vue:55-60`
- **问题描述**: Markdown 到 HTML 的安全渲染管道 `marked.parse → DOMPurify.sanitize` 在 LifePlan 和 Punch 两个组件中完全重复。不符合 DRY 原则，且未来 DOMPurify 配置变更需要修改多处。
- **建议修复**: 抽取为公共 composable `useMarkdown.ts`：
  ```typescript
  // src/composables/useMarkdown.ts
  import { marked } from 'marked'
  import DOMPurify from 'dompurify'
  
  export function renderSafeHtml(markdown: unknown): string {
    if (typeof markdown !== 'string') return ''
    const html = marked.parse(markdown, { async: false })
    if (typeof html !== 'string') return ''
    return DOMPurify.sanitize(html)
  }
  ```

### 7. `getErrorMessage` 函数在多个组件中重复定义

- **位置**: `src/views/LifePlan.vue:102-109`, `src/views/Punch.vue:63-77`
- **问题描述**: Axios 错误消息提取逻辑在两个组件中重复实现，类型断言模式完全一致。
- **建议修复**: 抽取为工具函数：
  ```typescript
  // src/utils/errorMessage.ts
  interface AxiosErrorLike {
    response?: {
      data?: { error?: { message?: string }; message?: string }
      status?: number
    }
  }
  
  export function getErrorMessage(err: unknown, fallback = '操作失败，请稍后重试'): string {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as AxiosErrorLike
      if (axiosErr.response?.data?.error?.message) return axiosErr.response.data.error.message
      if (axiosErr.response?.data?.message) return axiosErr.response.data.message
    }
    return fallback
  }
  ```

### 8. `DiabetesTypeView` 接口在组件和 Store 中重复定义

- **位置**: `src/views/Home.vue:17-20`, `src/stores/homeStore.ts:6-12`
- **问题描述**: `DiabetesTypeView` 接口在组件和 store 中各定义一次，虽然注释说明"store 不导出，故组件自带"，但这增加了维护风险——字段不一致时不会产生编译错误。
- **建议修复**: 从 store 导出该接口：
  ```typescript
  // homeStore.ts
  export interface DiabetesTypeView extends DiabetesType {
    cover: string
    brief: string
  }
  ```
  组件中 import 使用，消除重复定义。

### 9. `formData` 使用 `Partial<RiskPredictRequest>` 但未做运行时类型守卫

- **位置**: `src/stores/riskFormStore.ts:14`
- **问题描述**: `formData` 类型为 `Partial<RiskPredictRequest>`，但从 sessionStorage 恢复时只做字段名检查（`allowedKeys`），未做值类型校验。例如 `age` 存储为字符串 `"30"` 而非数字 `30` 时不会被检测到，可能导致 API 请求类型错误。
- **风险**: 若用户在 URL query 或浏览器 DevTools 中篡改 sessionStorage，可能提交格式错误的请求体，虽然后端应校验，但前端也应提供防御层。
- **建议修复**:
  ```typescript
  function coerceNumber(val: unknown): number | undefined {
    const n = Number(val)
    return Number.isFinite(n) ? n : undefined
  }
  // 在 loadFromStorage 中，对 age/height/weight/waist/systolic_bp 使用 coerceNumber
  ```

### 10. `LifePlan.vue` 中 `form` 使用 `reactive` 包裹，但 `age`、`height`、`weight` 初始化为 `null`

- **位置**: `src/views/LifePlan.vue:26-31`
- **问题描述**: 表单字段使用 `reactive` 定义且值为 `null`，与 `v-model.number` 配合使用时，若用户清空输入框，Vue 会将值设为空字符串 `''` 而非 `null`。`validForm()` 检查 `form.age == null` 可以同时处理 `null` 和 `undefined`，但对空字符串 `''` 会漏过。
- **风险**: 低——输入框 `type="number"` 在浏览器层面提供基本校验，但通过 DevTools 可绕过。
- **建议修复**: 在 `validateForm` 中使用 `Number.isFinite` 做更严格的数值校验：
  ```typescript
  function validateForm(): boolean {
    if (form.age == null || !Number.isFinite(form.age) || form.age < 1 || form.age > 120) return false
    // ...
  }
  ```

### 11. `escapeHtml` 为仅 Home.vue 本地函数，但可被多处复用

- **位置**: `src/views/Home.vue:132-137`
- **问题描述**: HTML 实体转义是一个通用工具函数，但仅在 Home.vue 中定义。Risk.vue 和其他组件如果需要在非 v-html 场景展示纯文本（例如 Swal 弹窗直接拼接 HTML 片段），可能需要同样的转义功能。
- **建议修复**: 移动到 `src/utils/sanitize.ts` 作为公共导出。

### 12. Punch 页面中 `onScroll` 使用 `document.documentElement` 而非滚动容器

- **位置**: `src/views/Punch.vue:107-118`
- **问题描述**: 无限滚动监听在 `document.documentElement` 上计算 `scrollTop/scrollHeight/clientHeight`。如果将来页面结构变化（例如外层有固定高度布局容器），这个计算可能不准确。更健壮的做法是监听实际的滚动容器元素。
- **风险**: 低——当前移动端全屏滚动场景下 `document.documentElement` 是正确的，但耦合了"页面即滚动容器"的假设。
- **建议修复**: 使用 `ref` 引用实际滚动容器，或在注释中明确说明依赖假设。

### 13. API 函数中 `res.data.data` 嵌套解包缺少运行时守卫

- **位置**: `src/composables/useHomeApi.ts:38-39`, `src/composables/useHomeApi.ts:47-48`, 及其他所有 API composable
- **问题描述**: 所有 API 函数都假设后端 `res.data.data` 存在且类型正确（例如 `return res.data.data`）。如果后端返回 `{ success: false, data: null }`（表示业务错误而非 HTTP 错误），前端不会检测到，会将 `null` 作为成功值传递给调用方。
- **风险**: 中等——后端如果发生未预期的业务错误（例如内部异常但返回 200），前端数据流可能静默损坏。
- **建议修复**: 在每个 API 函数中增加 `success` 字段检查：
  ```typescript
  export async function getDoctors(params: DoctorsParams = {}): Promise<Doctor[]> {
    const res = await api.get<PagedBody<Doctor>>('/doctors', { params })
    if (!res.data.success) {
      throw new Error(res.data.message || '获取医师列表失败')
    }
    return res.data.data
  }
  ```

### 14. `loadMore` 在 `fetchAnalysis` 失败后不会重试 analysis 数据

- **位置**: `src/stores/punchStore.ts:92-119`, `src/views/Punch.vue:144`
- **问题描述**: `fetchAnalysis` 和 `fetchList` 是独立并行调用的。当分页加载（loadMore）成功后，AI 分析仍可能展示旧数据。用户期望分析结果与当前筛选/分页状态一致。
- **风险**: 低——筛选变更时 `setFilter` 会重置列表，此时分析不变是合理行为；但用户可能困惑"为什么加载了更多记录但分析没变"。
- **建议修复**: 考虑在 UI 上添加提示说明分析是基于整体数据而非当前页的。

### 15. `marked.parse` 使用 `{ async: false }` 但 marked v5+ 默认异步

- **位置**: `src/views/LifePlan.vue:96`, `src/views/Punch.vue:57`
- **问题描述**: 代码中使用 `marked.parse(markdown, { async: false })` 强制同步模式。如果 marked 版本升级到移除同步 API，这个调用会失败或返回 Promise 而非字符串。
- **风险**: 低——marked 目前仍支持同步 parse，但未来版本可能移除此选项。
- **建议修复**: 将 Markdown 渲染改为异步或使用缓存策略：
  ```typescript
  // 方案 A: 使用 computed + async（需 watchEffect 或 Suspense）
  // 方案 B: 在 useMarkdown.ts 中预配置 marked
  marked.setOptions({ async: true }) // 全局设置
  // 然后用 await marked.parse(...)
  ```

### 16. `Punch.vue` 中 `typeFilter` ref 与 store filter 状态不同步

- **位置**: `src/views/Punch.vue:26-31` (local `typeFilter`) vs `src/stores/punchStore.ts:19-23` (store `filter.punch_type`)
- **问题描述**: 组件内 `typeFilter` ref 和 store 中的 `filter.punch_type` 维护了两份相同意义的状态。`onTypeFilter` 同时更新两者（通过 `setFilter`）。如果将来 store 重置了 filter 但组件未同步更新 `typeFilter`，UI 会展示不一致的 chip 选中态。
- **风险**: 低——当前代码路径中 filter 只能通过 `setFilter` 变更，而 `setFilter` 总是从组件调用。
- **建议修复**: 将 `typeFilter` 改为 computed，读取自 store：
  ```typescript
  const typeFilter = computed<PunchType | undefined>(() => store.filter.punch_type)
  function onTypeFilter(val: PunchType | undefined) {
    store.setFilter({ punch_type: val })
  }
  ```

### 17. 缺少 AbortController 取消机制用于组件卸载时的进行中请求

- **位置**: `src/composables/useApi.ts:45-48` 已导出 `createCancelToken()` 但未被任何 API 调用使用
- **问题描述**: `useApi.ts` 提供了 `createCancelToken` 工具，但所有 API composable（`useHomeApi`、`useLifePlanApi`、`usePunchApi`）均未使用 AbortController。当用户在请求进行中离开页面时，Promise 仍会 resolve/reject，可能触发已卸载组件的状态更新（Vue 3 在组件卸载后更新 ref 通常无害，但可能触发不必要的计算或警告）。
- **风险**: 低——Vue 3 ref 在组件卸载后仍可写入，不会报错，但可能有性能浪费。
- **建议修复**: 在 composable 中暴露 `cancel` 函数，组件 `onUnmounted` 时调用：
  ```typescript
  // usePunchApi 示例
  export function usePunchApiWithCancel() {
    const { signal, cancel } = createCancelToken()
    return {
      fetchList: (params: PunchListParams) => getPunchList(params, signal),
      cancel,
    }
  }
  ```

### 18. `Punch.vue` 滚动触发加载更多时缺少 `hasMore` 检查

- **位置**: `src/views/Punch.vue:107-118`
- **问题描述**: `onScroll` 计算触底距离后直接调用 `store.loadMore()`，但未检查 `store.hasMore`。虽然 `loadMore()` 内部已做检查（`punchStore.ts:93`），但增加了不必要的函数调用和 requestAnimationFrame 开销。
- **风险**: 极低——内部已有防护，仅为微优化建议。
- **建议修复**:
  ```typescript
  function onScroll() {
    if (scrollTicking) return
    scrollTicking = true
    requestAnimationFrame(() => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement
      if (scrollHeight - scrollTop - clientHeight < 120 && store.hasMore) {
        store.loadMore()
      }
      scrollTicking = false
    })
  }
  ```

---

## 代码亮点（值得推广的良好实践）

1. **`requestId` 防竞态快照机制** (`src/stores/punchStore.ts:52-83`): 使用递增序列号 + 快照比较来丢弃过期响应，是处理分页列表竞态条件的标准范式。`fetchList` 和 `loadMore` 都正确实现，值得在其他异步 Store 中推广。

2. **Promise.allSettled 并行加载 + 独立降级** (`src/stores/homeStore.ts:38-58`): 首页三个区块使用 `allSettled` 并行加载，任一失败不影响其余区块展示，实现了优雅的局部降级。

3. **类型别名 + 注释严格对齐后端契约** (`src/types/api.ts`): 每个接口都有详细注释说明对应的后端端点和字段映射（例如 `views` ↔ `read_count`、`created_at` ↔ `publish_time`），大幅降低了前后端协议不一致的风险。

4. **`isHistoryFallback` 降级策略** (`src/stores/lifePlanStore.ts:26, 79-81`): 生成失败但有缓存方案时自动进入历史降级模式，用户仍可查看最近方案而非面对空白错误页，体现了良好的用户体验设计。

5. **乐观更新 + 回滚** (`src/stores/lifePlanStore.ts:111-126`): 打卡操作先用乐观更新提升 UI 响应速度，失败时通过保存的快照完整回滚，是复杂交互状态的正确做法。

6. **组件级占位常量集中声明** (`src/views/Home.vue:13-14`): `FALLBACK_ARTICLE_COVER` 和 `FALLBACK_DOCTOR_AVATAR` 在组件顶层声明，与 store 内同名常量保持语义一致但职责分离。

7. **`escapeHtml` + DOMPurify 双保险** (`src/views/Home.vue:110-128`): 在拼接 HTML 片段（Swal 弹窗内容）时，先对纯文本字段做 HTML 实体转义再整体 DOMPurify 净化，形成了纵深防御。

8. **`completedMap` 使用 `Map<number, CompletionStatus>`** (`src/stores/lifePlanStore.ts:34`): 用原生 Map 而非普通对象存储打卡完成态，Key 类型安全（number），语义清晰，不存在原型链污染风险。

9. **`onUnmounted` 清理模式一致**: Home.vue 清理 bannerTimer、LifePlan.vue 清理 stageTimer、Punch.vue 清理 scrollEvent，三个组件都正确配对了生命周期清理。

10. **`alt` 属性 + `@error` 降级**: 所有 `<img>` 标签都有 `alt` 属性，并绑定 `@error="hideImg"` 处理图片加载失败的展示降级。

---

## 类型安全检查清单

| 检查项 | Home | LifePlan | Punch | 说明 |
|--------|------|----------|-------|------|
| `any` 类型使用 | 通过 | 通过 | 通过 | 无 `any` 使用。catch 块使用 `unknown`，符合 TS strict 模式 |
| 空值处理 | **一般** | **一般** | 通过 | Home: `a.cover \|\| FALLBACK` 仅处理 null，未处理空字符串；LifePlan: `form.age == null` 使用宽松判空，但 number input 可能产生 `''` |
| 类型断言安全 | **一般** | **一般** | **一般** | 多处 `as` 断言用于构建请求体（如 `form.age as number`）；虽经 form 校验兜底，但缺乏运行时类型守卫函数 |
| API 响应类型匹配 | 通过 | 通过 | 通过 | 响应类型与后端契约一致，内联类型定义精确 |
| 泛型使用 | 通过 | 通过 | 通过 | `ApiResponse<T>` / `PaginatedResponse<T>` 使用得当 |
| 导入类型使用 `type` | 通过 | 通过 | 通过 | 所有类型导入使用 `import type`，符合最佳实践 |
| 联合类型穷举性 | 通过 | 通过 | 通过 | `PlanType`/`PunchType`/`CompletionStatus` 等联合类型已穷举，新增枚举值会导致编译错误 |
| `reactive` 解构 | 通过 | 通过 | N/A | LifePlan 中 `form` 为 reactive 对象但从未解构，安全 |
| computed 无副作用 | 通过 | 通过 | 通过 | 所有 computed 均为纯计算，无 API 调用或 DOM 操作 |
| 响应式 API 响应字段校验 | 通过 | 通过 | 通过 | API 响应解包为 `res.data.data`，路由正确 |

### 错误处理检查清单

| 检查项 | Home | LifePlan | Punch | 说明 |
|--------|------|----------|-------|------|
| Loading 态 | 通过 | 通过 | 通过 | 骨架屏/脉动动画/spinner 覆盖 |
| Empty 态 | 通过 | 通过 | 通过 | 引导语 + CTA 按钮 |
| Error 态 | 通过 | 通过 | 通过 | 错误文案 + 重试按钮 |
| 部分失败降级 | 通过 | 通过 | 通过 | allSettled + 独立 error ref |
| 重试机制 | 通过 | 通过 | 通过 | 每个区块有独立 retry |
| 网络超时 | **一般** | 通过 | 通过 | Home API 未设超时覆盖（走全局 15s），LifePlan generate 有 20s |

### 安全检查清单

| 检查项 | Home | LifePlan | Punch | 说明 |
|--------|------|----------|-------|------|
| v-html 净化 | 通过 | 通过 | 通过 | 全部经 DOMPurify sanitize |
| DOMPurify 配置加固 | **严重** | **严重** | **严重** | 未设 ALLOWED_TAGS/ATTR 白名单约束 |
| Token 存储 | **严重** | N/A | N/A | localStorage 明文 |
| XSS 输入 | 通过 | 通过 | 通过 | 用户直接输入的纯文本未用 v-html，仅后端 Markdown 内容进入净化管道 |
| 表单输入校验 | 通过 | 通过 | 通过 | LifePlan form validate 有范围检查 |

---

## 总结

| 类别 | 数量 |
|------|------|
| 严重问题 | 5 (其中 #2 为误报已排除，实为 4 个) |
| 一般问题 | 14 |
| 代码亮点 | 10 |

四个严重问题中：
- **#1 Token 存储** 是最优先需要修复的安全问题，需评估后端是否支持 httpOnly cookie
- **#5 DOMPurify 配置加固** 可通过统一 composable 快速修复
- **#3 fetchAnalysis 竞态** 修复成本低（约 5 行代码）
- **#4 reactive vs ref** 风险评级可降低，但建议规范化为 ref 以保持状态管理一致性

整体代码质量评级：**良好**。TypeScript 类型使用规范、Vue 3 Composition API 使用正确、错误处理覆盖全面、代码组织清晰。主要改进方向集中在：安全加固（DOMPurify 配置、Token 存储）、消除重复代码（抽取公共 composable）、以及完善边缘情况防御（运行时类型守卫、请求取消）。
