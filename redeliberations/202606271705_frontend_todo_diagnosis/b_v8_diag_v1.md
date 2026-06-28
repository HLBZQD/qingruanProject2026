# 质量审查报告 — 诊断报告（v15）可操作性审查

> **审查对象**: `a_v8_diag_v3.md`（诊断报告 v15）
> **审查视角**: 可操作性、修复副作用、优先级合理性
> **审查轮次**: 第 8 次迭代
> **审查日期**: 2026-06-27

---

## 审查发现

### 问题 1（严重 — 可操作性/副作用）：S8 sessionStorage 迁移遗漏 App.vue 跨标签页同步代码，修复后产生非预期登录跳转

- **所在位置**:
  - 诊断报告 S8 修复建议（第235-289行）——"联动修改"段落仅提及 `src/router/index.ts`，未提及 `src/App.vue`
  - 诊断报告 8.3(e) 交互风险表 B 行（S8↔S1/S2）——未覆盖 S8↔App.vue
  - 诊断报告 S8 修复建议"与其他修复的交互"段落（第288行）——仅覆盖 S8↔S1/S2 清理联动
- **问题描述**: `src/App.vue:27-39` 包含 `window.addEventListener('storage', handleStorageChange)` 跨标签页同步监听器，其 `handleStorageChange` 函数（第30-31行）直接读取 `localStorage.getItem('token')` 和 `localStorage.getItem('role')`。S8 修复将 token/role/user 从 localStorage 迁移至 sessionStorage 后，此监听器产生两种缺陷：
  1. **功能断裂**：`storage` 事件仅对 localStorage 变更触发，sessionStorage 变更不触发此事件。迁移后该监听器无法感知跨标签页认证状态变更，原有跨标签页同步功能完全失效。诊断报告虽然提供了 BroadcastChannel 替代方案（在 authStore.ts 内部），但未说明 App.vue 中旧监听器需要同步移除或迁移至 BroadcastChannel。
  2. **副作用——非预期登录跳转**：迁移后 `localStorage.getItem('token')` 始终返回 `null`（token 已迁至 sessionStorage）。`handleStorageChange` 函数执行 `!newToken` 为真 → 调用 `authStore.clearAuth()` → `router.push('/login')`。这意味着**任何** localStorage 变更（如 `must_change_password` 在 `login()` 中写入、`disclaimer_accepted` 在路由守卫中写入）在另一标签页触发 `storage` 事件时，都会导致当前标签页被强制跳转到登录页。此副作用导致用户正常浏览中频繁遭遇非预期登出。
- **严重程度**: 严重。修复 S8 后引入新的用户可感知的功能退化（非预期登录跳转），且诊断报告未识别此风险。
- **证据引用**:
  - `src/App.vue:27-39` — `handleStorageChange` 函数读取 `localStorage.getItem('token')`，迁移后始终为 null
  - `src/App.vue:32-34` — `!newToken` 分支无条件执行 `clearAuth()` + `router.push('/login')`
  - `src/main.ts:14` — `authStore.syncFromStorage()` 在应用启动时调用，App.vue 的 `storage` 事件监听器是平行的跨标签页同步路径
  - 诊断报告 S8"联动修改"段落（第253行）——仅覆盖 `router/index.ts:79` 的 `disclaimer_accepted` 保持 localStorage，未覆盖 `App.vue`
- **改进建议**:
  1. 在 S8 修复建议的"联动修改"段落中增加对 `src/App.vue` 的处理说明：`handleStorageChange` 监听器（第27-39行）需要移除或替换为 BroadcastChannel 监听逻辑——因为 `storage` 事件对 sessionStorage 变更不触发，该监听器在迁移后为死代码且产生非预期跳转副作用。
  2. 在 8.3(e) 交互风险表中增加交互 F 行（S8↔App.vue）：标注 App.vue `storage` 事件监听器在迁移后始终触发登录跳转的风险，以及 BroadcastChannel 替代方案的协同方式。
  3. 在 S8 修复建议的 BroadcastChannel 实现中，明确说明 BC 监听器应替代（而非与）App.vue 中现有的 `window.addEventListener('storage', ...)` 监听器——两者并存会导致认证状态变更被双重处理。

---

### 问题 2（一般 — 副作用）：App.vue `storage` 事件监听器在 S8 迁移后成为全量 localStorage 变更的登录跳转触发器

- **所在位置**: 诊断报告 8.3(b) 副作用评估（第1078-1085行）——当前仅评估了 token 失效后的缓存残留风险
- **问题描述**: 问题 1 的深化分析。`handleStorageChange` 函数检查 `e.key === 'token' || e.key === 'role' || e.key === 'user'` 时触发。迁移后这些键不再存在于 localStorage 中，因此 `storage` 事件不会因 token 变更而触发。**但** (a) `must_change_password` 和 `disclaimer_accepted` 仍保留在 localStorage 中——当 `must_change_password` 在另一标签页被修改时，`e.key === 'token'` 条件不满足，`handleStorageChange` 不会执行，实际影响面比问题 1 描述的"任何 localStorage 变更"更窄；(b) `e.key` 检查的三键（token/role/user）迁移后不再触发 `storage` 事件，因此 `handleStorageChange` 成为**完全不会执行**的死代码函数。这意味着 S8 迁移后原有的跨标签页同步机制（localStorage storage 事件）静默失效，若 BroadcastChannel 增强未被实施，跨标签页认证同步将完全丧失。
- **严重程度**: 一般。死代码本身不产生运行时错误，但会误导后续维护者（认为跨标签页同步仍在工作），且与问题 1 构成联合风险。
- **证据引用**: `src/App.vue:28-39` — 完整的 `handleStorageChange` 函数及其事件绑定逻辑
- **改进建议**:
  1. 在 S8 修复建议中增加说明：迁移完成后，建议在 `src/App.vue` 中移除 `handleStorageChange` 函数及其 `addEventListener`/`removeEventListener` 绑定（或将其替换为 BroadcastChannel 对应逻辑），并在代码注释中标注迁移原因。
  2. 在 8.3(b) 副作用评估中增加一节"App.vue storage 监听器死代码化"风险说明。

---

### 问题 3（一般 — 可操作性）：S5b-1 AbortController + fetch 集成的具体代码模式缺失，修复者需自行推断实现

- **所在位置**: 诊断报告 S5b-1 修复建议"关键逻辑"（第156-163行）——第(e)条描述 `abortActiveConnection()` 但未提供代码级集成模式
- **问题描述**: S5b-1 修复建议用文字描述了 AbortController 的使用方式（"fetch 调用时传入 signal"、"abortActiveConnection() 通过 controller.abort() 取消"），但未提供具体的代码实现模式。对比 G18（`pageInstanceId` 变量声明位置和完整代码示例，第617-629行），S5b-1 的 AbortController 集成缺少以下关键信息：
  - AbortController 实例在 chatStore 中的声明位置和形式（`let` 变量 / `ref` 包装）
  - 每次新 SSE 连接前如何创建新的 AbortController 实例并替换旧实例
  - `fetch` 调用中 `signal: controller.signal` 的具体传参位置
  - catch 块中如何区分 `AbortError`（主动取消）与网络错误（需重连）
  - `useApi.ts:45-48` 中的 `createCancelToken()` 工具函数是否可复用

  S5b-1 被评估为"高复杂度、20-28h"的核心任务，修复者需要的是一个可直接照搬的实现模式而非概念描述。当前修复建议在此处的可操作性低于同级复杂度的 G18 修复建议（后者提供了完整代码示例）。
- **严重程度**: 一般。不影响修复可行性（修复者仍可通过查阅 MDN/设计文档自行补全），但增加了实现阶段的理解和试错成本。
- **证据引用**:
  - 诊断报告 S5b-1 第(e)条（第160行）——"调用 `AbortController.abort()` 关闭当前 fetch 流"
  - 诊断报告 G18 代码示例（第617-629行）——对比 G18 的 `pageInstanceId` 完整声明位置和代码模式
  - `src/composables/useApi.ts:45-48` — `createCancelToken()` 已导出但未被 S5b-1 引用
- **改进建议**:
  1. 在 S5b-1 修复建议中增加"AbortController + fetch 集成模式"代码示例，覆盖：`let abortController: AbortController | null = null` 在 Store 函数体内的声明位置、`sendMessage` 中创建新 AbortController 并赋值 `abortController`、`fetch(url, { signal: abortController.signal })` 的传参、catch 块中 `e.name === 'AbortError'` 的区分逻辑、`abortActiveConnection()` 的完整实现（含 `abortController.abort()` + `abortController = null`）。
  2. 引用 `useApi.ts` 中的 `createCancelToken()` 作为可复用模式或说明为何需要独立实现。

---

### 问题 4（轻微 — 可操作性/一致性）：版本标识三处不一致，与历史迭代反馈（第6轮）同类问题再次出现

- **所在位置**:
  - 主标题第1行："# 前端代码审查问题诊断报告 **v13**"
  - 元数据第7行："> **版本**: **v15**"
  - 文件修订说明标题："修订说明（v15）"（第1390行）
- **问题描述**: 主标题标注版本 v13，元数据标注版本 v15。此同类问题在第6轮迭代反馈中（问题1："版本号在文件名、主标题、元数据三处不一致"）已被指出，v10 修订声称已修正（"主标题从'v7'修正为'v10'"）。但 v13→v15 的后续修订中，主标题更新停滞在 v13、内容版本推进至 v15，版本号不一致再次出现。虽然主标题与元数据的 2 个版本号差距不影响诊断内容的正确性，但会对报告接收方产生困惑——以哪个版本号为准来引用报告。
- **严重程度**: 轻微（格式性问题，不影响诊断实质内容）
- **改进建议**:
  1. 将主标题版本号从 v13 更新为 v15，与元数据版本号一致。
  2. 在修订流程中建立版本号三处同步更新的检查项（主标题、元数据、修订说明章节号），防止后续修订中再次漂移。

---

### 问题 5（轻微 — 可操作性/副作用）：main.ts 注释在 S8 迁移后过时，诊断报告未提示更新

- **所在位置**: 诊断报告 S8 修复建议"联动修改"段落（第253行）——未提及 `src/main.ts`
- **问题描述**: `src/main.ts:11` 包含注释 "// 自动从 localStorage 恢复登录态"。S8 迁移后 `syncFromStorage()` 内部已切换为从 sessionStorage 读取，但此注释仍指向 localStorage。注释与实际行为不一致可能误导后续开发者在排查登录态恢复问题时查看错误的存储介质。此问题不影响运行时行为（`syncFromStorage()` 内部已正确切换存储源），但属于维护性债务。
- **严重程度**: 轻微（注释过时，不影响功能）
- **证据引用**: `src/main.ts:11-14` — 注释与实际代码行为不一致
- **改进建议**: 在 S8 修复建议"联动修改"段落中增加提示：`src/main.ts:11` 注释 "自动从 localStorage 恢复登录态" 建议同步更新为 "自动从 sessionStorage 恢复登录态"。

---

## 优先级合理性评估

经逐项核对 8.2 节优先级表（第972-1023行）的 P0-P4 分层及依赖关系，未发现显著优先级排序问题：

- P0 层（S5a、S5b-1）为功能完全缺失项，排序合理。
- P1 层（S5b-2、S6、S1+S2 批处理、S3+S7 批处理、S9）及 S9 上调至 P1 作为 S3+S7 前置的裁决正确。
- P2 层（G14、S4+S11、S8）内部排序（G14→S4+S11→S8）合理——G14 影响面最广先执行，S8 建议在 S1+S2 完成后执行以共享 sessionStorage 清理机制。
- P3/P4 层排序正确。8.2.1 节并行化策略（三人并行，关键路径 20-28h）的工期估算和 S5b-1↔G14 软依赖提示已在 v11 中修正。

**待改进**: 如问题 1/2 所述，S8 修复后 App.vue 旧监听器的问题未被识别为 S8 的副作用或前置依赖。建议在 S8 的"前置依赖"列或说明列中增加提示——App.vue 旧监听器需在 S8 完成后同步移除/替换。

---

## 整体质量评价

诊断报告（v15）在可操作性维度整体质量较高。42 个诊断条目均有修复建议、边界条件和验证方法，S 级和 G14 等高风险条目获得逐函数修改清单和副作用分析的完整覆盖。8.2.1 节并行化策略和增量交付里程碑为团队提供了可操作的排期决策依据。

本次审查发现的主要质量缺口集中在 S8（sessionStorage 迁移）对 App.vue 跨标签页同步代码的遗漏处理——这是报告经过 15 轮修订后仍然存在的可操作性盲区。修复者在按当前报告实施 S8 后，若不同时处理 App.vue 中的旧存储事件监听器，将引入非预期登录跳转的新缺陷。建议在 S8 修复建议中补充对 `src/App.vue:27-39` 的处理指引。

---

*审查报告结束。*
