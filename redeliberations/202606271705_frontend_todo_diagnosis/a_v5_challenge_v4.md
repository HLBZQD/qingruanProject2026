# 诊断质询报告（v4）

## 质询结果

CHALLENGED

## 逐维度审查

### 1. 证据充分性

**[通过]** S1/S2 的代码证据准确——经实际读取 `homeStore.ts`（150行）和 `lifePlanStore.ts`（158行），确认 `fetchHomeData()` 和 `fetchCurrent()`/`generate()`/`adjust()` 确实不含任何 sessionStorage 读写逻辑。引用的行号（homeStore.ts:38-58、lifePlanStore.ts:42-53/61-87/93-103）正确。

**[通过]** S5b-1 的代码验证结论准确——经实际读取 `chatStore.ts`（13行），确认 `conversations` 为 `ref([])`、`abortActiveConnection()` 为空函数体、文件内无任何 EventSource/SSE/WebSocket 代码、`src/types/sse.ts` 中定义的类型完全未被引用。

**[通过]** S9 的竞态保护遗漏判断准确——经实际读取 `punchStore.ts`（178行），确认 `fetchList()`（第63行）和 `loadMore()`（第97行）均实现了 `requestId` 快照保护，而 `fetchAnalysis()`（第125-135行）完全缺失此机制。`setFilter()`（第142-152行）确实仅调用 `fetchList()` 未调用 `fetchAnalysis()`。

**[通过]** G14 的 API 函数清单准确——经实际读取 `useHomeApi.ts`（73行）、`useLifePlanApi.ts`（63行）和 `usePunchApi.ts`（需另行确认），确认所列 10 个函数均使用 `return res.data.data` 模式、不检查 `success` 字段。`useApi.ts` 响应拦截器 success 分支确实仅为 `(res) => res`。

**[通过]** authStore 的 localStorage 操作点确认——经实际读取 `authStore.ts`（123行），确认 S8 修复建议中列出的初始化 ref 声明（行12/13/17）、`setToken()`（行30-33）、`setAuth()`（行35-42）、`syncFromStorage()`（行44-63）、`clearAuth()`（行65-74）、`login()`（行76-85）、`fetchProfile()`（行94-102）、`setProfile()`（行104-109）、`clearMustChangePassword()`（行111-114）各函数中的 localStorage 操作点均正确。

**[问题-一般]** S5a 降级方案可行性评估中未验证 `Article` 类型是否包含详情页所需的 `content`/`body` 字段。经实际读取 `src/types/api.ts:124-139`，`Article` 接口的字段为：`id, title, cover, author, category, tags, summary, views, created_at`——不含文章正文（`content`/`body`）字段。这意味着使用 `getArticles()` + 客户端 `find()` 筛选的降级方案只能提供文章元数据（标题、作者、摘要等），无法渲染文章正文内容。诊断报告称此为"可行的降级路径"，但未指出该路径下文章正文内容不可用的实质性限制，使 S5a 的技术可行性评估（复杂度标注为"低至中"）偏向乐观。

### 2. 逻辑完整性

**[通过]** 从问题现象到根因的因果链完整。6个根因均建立了从设计文档要求→代码缺失/偏差→问题现象的完整链条，根因到问题的映射表覆盖了全部42项问题。

**[通过]** S5b 拆分为 S5b-1 和 S5b-2 的逻辑严密——chatStore 骨架验证→S5b-1 为硬前置依赖→S5b-2 依赖 S5b-1 的 chatStore 接口。依赖链清晰且代码验证充分。

**[通过]** P2 优先级层内部排序的4段标注逻辑合理：S4+S11（同文件区域重叠）优先 → G14（影响面最广）次之 → G18（依赖 S9 模板）随后 → S8（建议 S1/S2 完成后执行）最后。S9 上调至 P1 以解除 S3/S7 隐式依赖的推理正确。

**[通过]** 8.3(e) 交互C（G7↔G14）的修正分析准确——经验证 Punch.vue 模板的 `v-if/v-else-if` 互斥链，确认 G14 修复后 `success:false` 触发 reject → Store catch 设置 error → 模板渲染错误降级 UI，Markdown 渲染分支不被进入。LifePlan.vue 路径经实际验证（viewMode 状态机：`'error'` 视图渲染错误态而非 `'display'` 视图），同样受保护——`safeContentHtml()` 仅在 `viewMode === 'display' && store.currentPlan` 时调用，G14 reject 后 `viewMode` 被设为 `'error'`，不会进入 display 分支。

### 3. 覆盖完备性

**[通过]** 任务描述（requirement.md）中的5项诊断要求均已覆盖：逐项诊断 todo.md 的42项问题、与详细设计文档的一致性检查（4.1-4.3节）、技术可行性评估（第5节）、逻辑完整性和内部一致性分析（第6节）、建立完整证据链（每条问题均引用了设计文档行号和代码文件行号）。

**[通过]** 原始 todo.md 中 13 个严重问题和 29 个一般问题全部有对应诊断条目，无遗漏。S5 拆分后形成 15 个 S 条目 + 29 个 G 条目 = 44 个编号条目，8.1 节影响面分级覆盖全部 44 项。

**[通过]** 历史迭代中反复出现的 G14 和 S8 相关问题链已在 v5 系列修订中趋于完备——G14 的 success 字段检查方案（方案B）与 getErrorMessage 兼容性已解决，S8 的 sessionStorage 迁移方案（含 localStorage 操作点清单、跨标签页同步可选方案、clearAuth 联动清理）已完整。

**[问题-轻微]** S8 BroadcastChannel 跨标签页同步代码示例中，`postMessage` 仅发送通知标志 `{ type: 'AUTH_CHANGED', timestamp }` 而不含实际 token 数据。由于 sessionStorage 按标签页隔离，接收方调用 `syncFromStorage()` 读取的是自身（为空的）sessionStorage，无法获取发送方标签页中的 token。若此方案要实际生效，消息体需携带 token/role/user 数据，或改用 localStorage 作为跨标签页桥接层。由于报告已明确标注此方案为"可选增强"且指出"不做跨标签页同步不会导致数据错误"，此问题不影响诊断结论的可信度，但代码示例的机制性缺陷可能误导尝试实现此可选增强的开发者。

**[问题-轻微]** S5a 修复建议中引用 `getDiabetesType(id)`（useHomeApi.ts:67-72）作为 `getArticle(id)` 的实现模板，但两者在参数编码上存在差异：`getDiabetesType(id)` 使用 `encodeURIComponent(id)` 对 number 类型参数编码（`/diabetes-types/${encodeURIComponent(id)}`），这在语义上不标准——number 类型的主键不需要 URI 编码。`getArticle(id)` 应使用 `String(id)` 或模板字符串直接拼接 `id`。此差异不影响诊断结论方向，但作为"实现模板"引用时可能传播不精确的编码实践。

## 质询要点（CHALLENGED 时存在）

- **问题**：S5a 降级方案（使用 `getArticles()` 全量拉取后客户端筛选）被认为"可行"，但 `Article` 类型（api.ts:124-139）不含文章正文 `content`/`body` 字段，仅含 `summary`（摘要）。降级路径下文章详情页无法渲染正文内容，只能展示元数据。

- **原因**：诊断报告对 S5a 的技术可行性评估（"复杂度低至中"）部分基于降级方案的存在。若降级方案实际上无法满足文章详情页的核心功能需求（渲染文章正文），则 S5a 的可行性评估偏乐观——在后端 `GET /api/articles/:id` 接口不存在的情况下，修复者实际上面临的复杂度高于报告所描述的"低至中"。

- **建议方向**：
  1. 读取 `src/types/api.ts` 中 `Article` 接口定义，确认缺失 `content` 字段
  2. 在 S5a 修复建议的降级方案中增加限制说明：降级路径下文章详情页仅能展示元数据（标题、作者、分类、摘要、阅读量），无法渲染文章正文；正文渲染需后端 `GET /api/articles/:id` 接口就绪后启用
  3. 在降级方案中补充：可在 `ArticleDetailView.vue` 中通过 `v-if="article.content"` 区分"有正文"和"仅元数据"两种渲染模式，待后端接口就绪后正文区域自动激活
  4. 重新评估 S5a 在后端 API 不可用时的实际交付能力——降级方案的最简可交付物（MVP）为"文章元数据详情页"而非"完整文章详情页"
