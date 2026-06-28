# 诊断质询报告（v5）

## 质询结果

CHALLENGED

## 逐维度审查

### 1. 证据充分性

**[通过]** S5b chatStore.ts 骨架验证——诊断 v5 经实际读取 `src/stores/chatStore.ts`（14行）确认 `conversations` 为 `ref([])` 空数组、`abortActiveConnection()` 为空函数体、无任何 SSE/EventSource 代码，证据链完整可追溯。

**[通过]** S5a Article 类型字段审计——诊断 v5 正确识别 `Article` 接口（api.ts:124-139）不含 `content`/`body` 字段，仅含 `summary`。经实际读取 api.ts 确认字段清单与诊断描述一致，降级方案的限制评估有据可查。

**[通过]** S1/S2 sessionStorage 缺失——经实际读取 `homeStore.ts:38-58` 和 `lifePlanStore.ts:42-53`，确认两处均无 sessionStorage 读写逻辑，诊断的代码证据引用准确。

**[通过]** S9 fetchAnalysis 竞态保护缺失——经实际读取 `punchStore.ts:125-135`，确认 `fetchAnalysis()` 无 `requestId` 快照机制，而 `fetchList()`（第59-83行）和 `loadMore()`（第92-118行）均已实现。诊断的描述与实际代码一致。

**[通过]** G14 success 字段检查缺失——经实际读取 `useHomeApi.ts`（38-72行）全部4个函数，均使用 `return res.data.data` 模式，无 `success` 字段检查。证据充分且可追溯。

**[问题-一般]** S5b-2 诊断对 Consultation.vue 的修复建议基于未验证假设。S5b-2 修复建议（第151行）列出"需修改文件: ... Consultation.vue — 医生卡片跳转逻辑（`router.push("/consultation/doctor/" + id)`）"，但诊断从未读取 `src/views/Consultation.vue` 验证其当前状态。经实际读取，Consultation.vue 是一个 **7 行占位页面**（模板仅含"医师咨询 — 待组员开发"的静态提示文字），不含任何医生卡片、医生列表、`v-for` 渲染或点击事件处理。诊断在未读取该文件的情况下，将修复范围描述为"添加跳转逻辑"，与实际需要的"构建完整的医生列表 UI（医生卡片展示 + 点击跳转 + 加载态/空态/错误态）"之间存在显著差距。修复者依据当前诊断建议操作时，会发现目标文件并非"有卡片缺跳转"，而是"完全没有卡片"，导致工作量误判。

**[问题-轻微]** S5b-1 技术可行性评估（第5节，第736-737行）的"可实现"判断基于前端 `src/types/sse.ts` 的类型定义推导 SSE 实现方案（EventSource 连接、断线重连、conversation_id 管理），但未区分"前端类型定义"与"后端协议契约"两个独立的信息来源。`sse.ts` 中定义的 `SSEMessageEvent`、`SSEMessageEndEvent`、`SSEErrorEvent` 等类型仅反映前端对 SSE 协议格式的期望，不构成后端已按此协议实现 SSE 端点的证据。诊断将"前端类型已定义"等同于"协议可行"，对技术可行性的信心建立在未验证的假设之上。

### 2. 逻辑完整性

**[通过]** S1→S2 缓存缺失的因果链完整——设计文档要求 → 实现遗漏 → 每次加载重复请求 API，逻辑清晰。

**[通过]** S5a→S6 依赖链明确——S5a（ArticleDetailView 路由缺失）作为 S6（文章跳转目标错误）的前置依赖，因果关系已建立并在优先级表中通过前置依赖列标注。

**[通过]** G18→S9 交叉引用已在 v5 建立——G18 修复建议末尾新增"与 S9 的关系"子项，明确了 S9 覆盖 punchStore 三个 action、G18 需补充 homeStore/lifePlanStore 四个 action 的边界。

**[通过]** 8.3(e) 交互 C（G7↔G14）经源代码验证修正——v5 已通过审查 Punch.vue:172-190 模板的 v-if/v-else-if 互斥链确认 G14 修复后不会将 null 传入 renderMarkdown，逻辑链已修正。

**[问题-一般]** 根因2（"路由拆分未跟进"）的描述不完整，遗漏了 Consultation.vue 的占位状态。根因2 描述为"设计文档v13修订时将 Consultation 拆分为 Consultation.vue + DoctorChatView.vue……但实现阶段未跟进创建这两个新增组件文件及对应的路由配置"。经实际读取 Consultation.vue（7行占位），该文件同样是路由拆分后未跟进的结果——设计文档期望 Consultation.vue 展示医生列表并提供跳转入口，但当前文件不包含任何医生数据展示逻辑。根因2 仅将"未跟进"限定为 DoctorChatView.vue 和 ArticleDetailView.vue 的创建，未将 Consultation.vue 的功能未实现纳入同一根因的分析范围。这导致因果链不完整：从"路由拆分"到"S5b 医生对话功能不可用"，中间缺少"Consultation.vue 作为入口页面的医生列表 UI 同样缺失"这一环。

**[问题-轻微]** S5b-1 修复建议（第143-146行）中"实现 EventSource 连接管理（`new EventSource(url)` + 断线重连指数退避）"直接给出具体实现方案，但未建立从"chatStore 骨架"到"需要 SSE 通信层"再到"SSE 通信层应使用 EventSource（而非 WebSocket 或轮询）"的完整推演链。诊断跳过了"为何选择 EventSource 而非其他实时通信方案"的技术选型推理步骤——虽然 `sse.ts` 的类型命名暗示了 SSE 方案，但类型文件的命名本身可能是前期假设，不应直接作为技术选型的唯一依据。

### 3. 覆盖完备性

**[通过]** todo.md 中全部 42 项问题（S1-S13, G1-G29）均已在诊断报告中逐项覆盖，无遗漏条目。

**[通过]** 任务描述（requirement.md）要求的5项诊断维度——逐项诊断、设计一致性检查、技术可行性评估、逻辑完整性分析、证据链建立——均已在报告中落实对应章节（第2节/第3节逐项诊断、第4节一致性汇总、第5节技术可行性、第6节逻辑完整性、各条目设计依据+代码证据）。

**[通过]** v4 审查反馈中7项问题（S5b chatStore 未验证、G18/S9 交叉引用缺失、P2 排序缺失、S5a 降级方案缺失、S8 BC 副作用、TS 编译检查缺失、汇总表统计不一致）在 v5 中均有对应修订并标注在修订说明中。

**[问题-轻微]** S5b 修复范围中 Consultation.vue 的工作量未被纳入8.2节优先级评估。S5b-2 的复杂度评估（"中高"）和优先级（P1）仅基于 DoctorChatView.vue 组件创建 + 路由注册的估量，未反映 Consultation.vue 从7行占位页面变为功能页面所需的工作。虽然医生列表 UI 的完整构建可能不完全属于 S5（路由缺失条目）的修复范畴，但 S5b-2 修复建议明确将 Consultation.vue 列为"需修改文件"，该文件的当前占位状态应在诊断范围评估中有所体现——至少应标注 Consultation.vue 的完整实现可能属于独立任务，而非仅"添加跳转逻辑"的子任务。

## 质询要点（CHALLENGED 时存在）

### 质询要点 1

- **问题**：S5b-2 诊断在未读取 Consultation.vue 的情况下，将修复范围描述为"添加医生卡片跳转逻辑"，但实际文件为7行占位页面，不含任何医生卡片。
- **原因**：修复者依据诊断打开 Consultation.vue 时，发现目标文件完全是占位状态，无法执行"修改跳转逻辑"的操作——需先构建整个医生列表 UI。工作量预期与实际状态之间的差距会破坏修复者对诊断报告整体可信度的判断。S5b 是 P0 优先级项目，其修复范围评估的准确性直接影响项目排期。
- **建议方向**：(1) 读取 `src/views/Consultation.vue` 完整内容，确认其占位状态；(2) 在 S5b 诊断中区分 Consultation.vue 的两种可能归属——若医生列表 UI 属于 S5b 修复范围，则需上调 S5b-2 的复杂度评估并新增 Consultation.vue 构建的子任务；若属于独立任务（如新 Todo 项），则需在 S5b-2 修复建议中将 Consultation.vue 从"需修改文件"中移除或标注为"独立前置任务"；(3) 同步更新根因2的描述，纳入 Consultation.vue 的未实现状态。

### 质询要点 2

- **问题**：根因2（路由拆分未跟进）仅描述组件文件和路由配置缺失，未覆盖 Consultation.vue 占位状态，因果链不完整。
- **原因**：根因2 旨在解释 S5（路由缺失）的深层原因——"设计文档拆分后，实现阶段未跟进"。但若根因分析本身也遗漏了拆分中的 Consultation.vue 列表页未实现，则根因的描述就是不完整的，无法完整回答"为什么医生对话功能不可用"——因为即使 DoctorChatView.vue 和路由就绪，用户仍需从 Consultation.vue 的医生列表进入，而该页面当前是占位状态。
- **建议方向**：在第7节根因2 的描述中补充：设计文档 v13 修订将 Consultation 拆分为 Consultation.vue（列表）+ DoctorChatView.vue（对话），实现阶段两个产物均未跟进——Consultation.vue 为占位页面，DoctorChatView.vue 未创建。在根因到问题映射表中，将 Consultation.vue 占位状态标注为根因2 的间接受影响项或新建补充说明。

