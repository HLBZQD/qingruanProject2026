# 第3轮规划复审报告 v3-r2 (R1 阻塞项验证)

> **审查对象**: `task_v3.md` (1315行) -- R1 阻塞条件满足后的正式审查
> **审查依据**: plan_review_v3_r1.md (4条阻塞条件), a_v8_diag_v3.md (S5b-1/S5b-2详细规格), plan.md (v3行), task_v1.md/task_v2.md (粒度基准)
> **审查日期**: 2026-06-27
> **审查人**: Plan Reviewer

---

## 0. R1 阻塞条件 — 逐条关闭确认

R1 审查结论为 REJECTED，3条批准条件 + 1条隐含条件。逐条验证如下：

### 条件1: 创建 task_v3.md 采用 7 组分解

| R1 要求 | task_v3.md 现状 | 状态 |
|---------|----------------|:--:|
| 创建 `task_v3.md` 文件 | 已创建，1315行 | PASS |
| 7组分解（或等效5-9组） | G1-G7 共7组 | PASS |
| 每组含问题编号和严重程度 | G1=P0, G2=P0, G3=P0, G4=P0, G5=P1, G6=P1, G7=P1 | PASS |
| 每组含预估工时 | G1:2-4h, G2:6-8h, G3:6-8h, G4:6-8h, G5:8-12h, G6:6-8h, G7:2-4h | PASS |
| 每组含前置依赖 | 见各任务组"前置依赖"行 + 顶部依赖图（第15-28行） | PASS |
| 每组含文件清单（含操作类型） | 每任务组含文件表格（新建/修改/重写/参考） | PASS |
| 每组含具体修改描述 | 每组含详细代码片段 + 设计引用行号 | PASS |
| 每组含3-5条可操作验收标准 | G1:4, G2:5, G3:5, G4:6, G5:7, G6:6, G7:5 | PASS |
| 每组含并行执行建议 | G5标注"可与G1-G4完全并行"，依赖图显示独立并行B流 | PASS |

### 条件2: 补充5条核心用户路径验收标准

| R1 要求 | task_v3.md 对应位置 | 状态 |
|---------|-------------------|:--:|
| Consultation→DoctorChatView→SSE收发 | 第1193-1203行 (AC-1) | PASS |
| 断网→重连→对话上下文恢复 | 第1205-1213行 (AC-2) | PASS |
| 切换医生→abort旧连接→独立conversation_id | 第1215-1223行 (AC-3) | PASS |
| 组件卸载→SSE连接关闭 | 第1225-1232行 (AC-4) | PASS |
| vue-tsc + vite build 零错误 | 第1235-1244行 (AC-5) | PASS |

### 条件3: 标注可推迟项 + 完整/简化交付工时

| R1 要求 | task_v3.md 对应位置 | 状态 |
|---------|-------------------|:--:|
| 标注可推迟项清单 | 第1248-1260行（"可推迟项清单"表格，6项） | PASS |
| "完整交付"和"简化交付"工时 | 第1262-1264行：36-52h→28-40h，节省8-12h | PASS |

### 隐含条件4: 并行策略落地

| R1 要求 | task_v3.md 对应位置 | 状态 |
|---------|-------------------|:--:|
| G5(Consultation.vue)可与chatStore并行 | 第21行、第46行、第713-714行 | PASS |
| 三人并行执行顺序 | 第30-36行（含开发者1/2/3分工） | PASS |
| 依赖关系图 | 第15-28行（ASCII图：A串行链+B独立并行+C依赖A+D最终集成） | PASS |

**结论: 4条阻塞条件全部满足。**

---

## 1. 审查维度一: 粒度与 v1/v2 一致性

### 1.1 粒度度量对比

| 指标 | v1 | v2 | v3 | 判定 |
|------|:--:|:--:|:--:|:---:|
| 总行数 | 317 | 298 | **1315** | 更大（合理——总工时10x于v1/v2） |
| 任务/组数 | 6 | 5 | 7 | 可比 |
| 平均工时/任务 | 1.3-2.2h | 1.4-2.2h | 2.9-7.4h | 更大（合理——SSE核心不可再拆） |
| 每组含验收标准 | 3-5项 | 3-7项 | 4-7项 | 一致 |
| 每组含文件清单 | Y | Y | Y（表格化） | 超越 |
| 每组含边界条件 | N（v1无） | N（v2无） | Y（每任务组独立边界条件节） | 超越 |
| 含跨任务依赖图 | Y（简单箭头） | Y（简单箭头） | Y（ASCII图+三人并行方案） | 超越 |
| 含可推迟项策略 | N | N | Y（含简化/完整交付两种工时） | 超越 |
| 含风险提示 | N | N | Y（5条风险含概率/影响/缓解） | 超越 |
| 含跨轮次依赖就绪确认 | N | N | Y（3条依赖状态表） | 超越 |

### 1.2 粒度评估

task_v3.md 在结构完整性上不仅达到 v1/v2 标准，且超越两者——新增了边界条件独立节、可推迟项策略、风险矩阵、跨轮次依赖确认表等 v1/v2 缺失的维度。这体量增加是合理的：v3 占用总工时 36-52% (36-52h / 66-100h)，任务文件体量（1315行 / ~2000行估）与工时占比匹配。

**仅有一处粒度偏粗**: G5 (Consultation.vue重写，8-12h) 未像 G1-G4 那样把 chatStore 按 API→连接→解析→管理层拆分为 4个 2-8h 子组。但 G5 是单一 .vue 文件的完整重写（从7行占位到~120行功能页），内部分拆的边际收益低（模板/script/style 天然一体）。**可接受。**

**判定: PASS -- 粒度达标。**

---

## 2. 审查维度二: 依赖关系正确性

### 2.1 内部依赖链验证

```
G1 (useChatApi.ts) ──→ G2 (连接管理) ──→ G3 (SSE解析) ──→ G4 (conversation_id+重连)
G1-G4 (chatStore完整) ──→ G6 (DoctorChatView集成chatStore)
G5 (Consultation.vue) ←── 独立并行，不与任何G1-G7冲突
G5 + G6 ──→ G7 (路由注册+集成验证)
```

与代码实际状态交叉验证:

| 依赖声明 | 代码实况 | 准确性 |
|---------|---------|:-----:|
| chatStore.ts 当前13行骨架 → 需G1-G4重写 | 经实际读取 `src/stores/chatStore.ts`（13行）：`conversations: ref([])`, `abortActiveConnection()` 空函数体，`clearAllConversations()` 仅清空数组。确认。 | 正确 |
| Consultation.vue 当前6行占位 → 需G5重写 | 经实际读取 `src/views/Consultation.vue`（6行）：模板仅`<p>医师咨询 -- 待组员开发</p>`，无`<script setup>`，无`v-for`。确认。 | 正确 |
| router 无 `/consultation/doctor/:id` → 需G7注册 | 经实际读取 `src/router/index.ts`（135行）：routes 数组中无 DoctorChat 路由。确认。 | 正确 |
| G5 仅需 `getDoctors()`（已存在于 `useHomeApi.ts`） | `useHomeApi.ts` 的 `getDoctors()` 在 v1 已验证通过。 | 正确 |
| G14 (success拦截器) 已在 v2 完成 → useChatApi.ts 自动受益 | v2 验证报告确认 PASS。但需注意：`sendChatMessage` 使用原生 fetch（不走 axios 拦截器），401 处理需 chatStore 自行实现——task_v3.md G2 节已包含此处理。 | 正确 |

### 2.2 依赖标注审计

| 依赖 | task_v3.md 标注 | 准确？ |
|------|:-------------:|:----:|
| G1→G2→G3→G4 串行链 | "串行链 A" (第17行) | 正确——API层→连接层→解析层→管理层顺序依赖 |
| G5 与 G1-G4 完全并行 | "独立并行 B" (第20行) | 正确——Consultation.vue 不依赖 chatStore |
| G6 依赖 G1-G4 | "依赖 A 流" (第24行) | 正确——DoctorChatView 集成 chatStore |
| G7 依赖 G5+G6 | "最终集成" (第27行) | 正确——端到端测试需两页面就绪 |

### 2.3 跨组协调点验证

G2 的 `sendMessage()` 代码注释（第213行）标注了 G1 需追加 `signal` 参数；G3 的 3.4 节（第481-499行）给出了具体修订代码。这种"后置修订"在串行链 G1→G2→G3 中合理——同一开发者顺序执行时可自然在 G3 阶段回修 G1。

**判定: PASS -- 依赖关系正确无矛盾。**

---

## 3. 审查维度三: 验收标准可执行性

### 3.1 按任务组专项审计

#### G1 (useChatApi.ts) -- 4条

| 验收条目 | 验证方式 | 可执行？ |
|---------|---------|:------:|
| `sendChatMessage()` POST请求返回status 200 | curl / DevTools Network | Y |
| `getDoctorInfo()` 返回Doctor对象 | DevTools Console / Network | Y |
| conversationId传/不传时请求体差异 | DevTools Network Payload | Y |
| vue-tsc无新增错误 | CLI: `npx vue-tsc --noEmit` | Y |

#### G2 (连接管理) -- 5条

| 验收条目 | 验证方式 | 可执行？ |
|---------|---------|:------:|
| POST请求在Network面板可见 | DevTools Network | Y |
| 第二条消息abort第一条SSE | Network面板显示canceled | Y |
| 组件卸载时SSE取消 | Network面板 + console | Y |
| 401时Toast弹出 | 手动测试（过期token或mock） | Y |
| vue-tsc无新增错误 | CLI | Y |

**注意**: 第3条"组件卸载时SSE取消"依赖DoctorChatView.vue (G6) 的 `onUnmounted` 钩子。G2阶段DoctorChatView.vue尚未创建，此验收项需延迟至G6完成后验证。标注为**G2完成后可在G6集成测试中验证**，不影响G2独立交付。

#### G3 (SSE解析+流式渲染) -- 5条

| 验收条目 | 验证方式 | 可执行？ |
|---------|---------|:------:|
| AI回复逐字流式出现 | 目视验证 + DevTools检查conversations数组 | Y |
| message_end后conversation_id保存 | DevTools检查chatStore state / localStorage | Y |
| error事件出现红色错误气泡 | 需要后端返回error事件（或mock） | Y（需mock） |
| 断网后已接收文本保留 | DevTools Network Offline + 目视检查 | Y |
| vue-tsc无新增错误 | CLI | Y |

#### G4 (conversation_id+重连+多医生) -- 6条

| 验收条目 | 验证方式 | 可执行？ |
|---------|---------|:------:|
| 首次对话conversation_id保存至localStorage | DevTools Application > Local Storage | Y |
| 刷新后消息携带conversation_id | DevTools Network Payload | Y |
| 断网→重连提示→自动重连 | DevTools Network Offline→Online | Y |
| 全部重试失败→"[连接失败]" | DevTools Network Offline持续 + 重试 | Y |
| clearAllConversations清除localStorage | DevTools Application > Local Storage | Y |
| vue-tsc无新增错误 | CLI | Y |

#### G5 (Consultation.vue重写) -- 7条

| 验收条目 | 验证方式 | 可执行？ |
|---------|---------|:------:|
| 访问/consultation展示加载态 | 浏览器访问 + 目视 | Y |
| 医生列表卡片渲染 | 浏览器访问 + 目视 | Y |
| is_online字段存在时显示"在线"标识 | 浏览器访问 + 目视 | Y（条件性） |
| 点击"开始咨询"路由跳转 | DevTools Network + URL变化 | Y（需G7路由就绪） |
| API失败展示错误+重试按钮 | 断网或mock API失败 | Y |
| 空列表占位提示 | mock空数组返回 | Y |
| vue-tsc无新增错误 | CLI | Y |

**注意**: 第4条验收依赖G7路由注册。G5完成时 `/consultation/doctor/:id` 路由尚不存在（G7未执行），点击跳转会触发404。标注为**G5独立完成时可验证router.push调用，路由跳转目标验证延迟至G7**。

#### G6 (DoctorChatView.vue) -- 6条

| 验收条目 | 验证方式 | 可执行？ |
|---------|---------|:------:|
| 进入DoctorChatView→医生信息头部 | 浏览器访问 + 目视 | Y |
| 发送消息→用户右/AI流式左 | 浏览器操作 + 目视 | Y |
| 流式回复中发送按钮disabled | 目视 + DevTools检查isStreaming | Y |
| 返回按钮→SSE abort→回Consultation | Network面板 + URL变化 | Y |
| 无效医生ID→错误提示 | URL输入/consultation/doctor/99999 | Y |
| vue-tsc无新增错误 | CLI | Y |

#### G7 (路由+集成) -- 5条

| 验收条目 | 验证方式 | 可执行？ |
|---------|---------|:------:|
| 未登录→重定向/login | 浏览器无痕窗口 | Y |
| 免责声明弹窗→同意→进入 | 清除localStorage + 浏览器操作 | Y |
| 完整用户路径端到端 | 手动操作全链路 | Y |
| vue-tsc零错误 | CLI | Y |
| vite build零错误 | CLI: `npx vite build` | Y |

### 3.2 核心用户路径5条 (AC-1 ~ AC-5)

全部5条均有明确的前置条件、操作步骤、预期结果和验证工具。AC-2（断网重连）和AC-3（多医生切换）标注了"简化版（v3交付）"降级策略，避免阻塞 v3 交付。

### 3.3 可执行性审计结论

共 38 条验收标准（G1-G7: 4+5+5+6+7+6+5），其中:

- **36条** 可直接在当前代码库环境中执行（DevTools / CLI / 浏览器操作）。
- **2条** 需延迟验证：G2第3条（组件卸载→SSE取消，需G6就绪）；G5第4条（路由跳转，需G7就绪）。均已标注处理方式。

**判定: PASS -- 验收标准可执行。**

---

## 4. 审查维度四: G5 Consultation.vue 独立并行标注

### 4.1 标注完整性

| 标注位置 | 内容 | 明确性 |
|---------|------|:-----:|
| 第17-21行（执行顺序图） | `独立并行 B (不依赖 chatStore): [G5] Consultation.vue 重写 ←── 可与 G1-G4 完全并行` | 高 |
| 第32行（三人并行方案） | `开发者2 (独立并行): G5 (8-12h) → 完成后可协助 G3/G4` | 高 |
| 第46行（G1可并行声明） | `可并行: 与 G5 (Consultation.vue) 无依赖，可完全并行` | 高 |
| 第713行（G5前置依赖） | `前置依赖: 无（仅使用已存在的 getDoctors() API，不依赖 chatStore SSE）` | 高 |
| 第714行（G5并行策略） | `并行策略: 可与 G1-G4 完全并行（与 chatStore 开发无交叉）` | 高 |

### 4.2 独立性验证

G5 仅依赖 `getDoctors()` -- 该函数存在于 `useHomeApi.ts`，在 v1 已验证通过。G5 不读取 chatStore、不发起 SSE 连接、不依赖任何 G1-G4 的产物。

经实际读取:
- `src/views/Consultation.vue` (当前6行) -- 无 import，无 store 引用
- `getDoctors()` 位于 `useHomeApi.ts` -- 已存在于代码库且功能正常

**G5 的独立并行标注准确无误。**

### 4.3 与 R1 的对比

R1 审查明确指出"Consultation.vue (G5) 可完全独立于 chatStore 并行这一关键优化未被利用"。task_v3.md 将此发现完整落地——不仅在顶部依赖图和第5节标注，且在三人并行方案中明确为"开发者2的独立工作包"。

**判定: PASS -- G5 独立并行标注充分且准确。**

---

## 5. 审查维度五: 内容准确性交叉验证

### 5.1 与诊断报告一致性

| 诊断报告描述 | task_v3.md 对应 | 一致性 |
|-------------|---------------|:-----:|
| S5b-1(a): useChatApi.ts创建 (2-4h) | G1 (2-4h)，含sendChatMessage+getDoctorInfo | 一致 |
| S5b-1(b): fetch+ReadableStream连接管理 | G2 (6-8h)，含AbortController+reader管道 | 一致 |
| S5b-1(c): SSE事件解析 | G3 (6-8h)，含parseSSEBuffer+dispatchSSEEvent | 一致 |
| S5b-1(d): conversation_id管理 | G4 (6-8h)，含localStorage+Map路由 | 一致 |
| S5b-1(e): 断线重连(指数退避) | G4 含sendMessageWithRetry | 一致 |
| S5b-1(f): abortActiveConnection | G2 含registerAbortController+abortActiveConnection | 一致 |
| S5b-1(g): 多医生会话路由 | G4 含switchDoctor+doctorConversations Map | 一致 |
| S5b-1(h): 消息流式渲染 | G3 含conversations ref驱动UI | 一致 |
| S5b-1(i): fabOpen状态 | G4 含fabOpen+toggleFab | 一致 |
| S5b-2(a): Consultation.vue重写 (8-12h) | G5 (8-12h)，含三态UI+卡片+跳转 | 一致 |
| S5b-2(b): DoctorChatView.vue创建 (8-12h→6-8h) | G6 (6-8h) | 一致（task下调至6-8h，含理据） |
| S5b-2(c): 路由注册 | G7 (2-4h)，含meta配置+守卫行为说明 | 一致 |

**全部12项诊断报告子任务在task_v3.md中均有对应任务组覆盖，无遗漏。**

### 5.2 与代码实际状态一致性

| task_v3.md 描述 | 实际代码状态 | 一致性 |
|----------------|------------|:-----:|
| chatStore.ts "13行骨架" | 实际13行：ref([]) + 空abortActiveConnection + 仅清空数组的clearAllConversations | 一致 |
| Consultation.vue "7行占位" | 实际6行：模板仅`<p>医师咨询 -- 待组员开发</p>`，无script | 接近一致（6 vs 7行） |
| router 无 `/consultation/doctor/:id` | 实际routes数组中无此路由 | 一致 |
| router 已有 `/consultation` + `/news/article/:id` | 实际routes中两者均有 | 一致 |
| SSE方案为 fetch+ReadableStream（非EventSource） | 设计文档明确要求fetch+ReadableStream | 正确 |
| `getDoctors()` 已存在于 useHomeApi.ts | 在v1已验证 | 正确 |

### 5.3 发现的小问题

| 编号 | 问题 | 位置 | 严重程度 |
|:---:|------|------|:------:|
| M1 | `is_online` 字段状态前后不一致：诊断报告第176行称"`getDoctors()`当前已含有`is_online`字段"，task_v3.md G1.2节称"当前后端 Doctor 接口不含 is_online 字段"，G5边界条件称"当前 Doctor 接口不含此字段" | G1.2 第110行 + G5 第832行 | 极低——模板代码使用 `v-if="doctor.is_online !== false"` 双阴性保护，字段存在与否均不会报错 |
| M2 | Consultation.vue 行数描述：task_v3.md和诊断报告称"7行占位页面"，实际文件为6行（不含script标签） | 多处（第5行、第720行、第727行） | 极低——不影响功能理解 |
| M3 | G2验收标准第3条（组件卸载→SSE取消）在G2阶段无法独立验证——DoctorChatView.vue (G6) 的 `onUnmounted` 钩子尚未创建 | G2 第333行 | 低——已在审查维度三中标注延迟验证，无需阻塞G2交付 |

**以上3个问题均不构成阻塞条件。**

---

## 6. 风险矩阵复核

task_v3.md 第1283-1299行列出了5条风险，逐条复核：

| 风险 | task_v3.md 评估 | 独立复核 | 结论 |
|------|:-------------:|---------|:---:|
| 后端SSE API未就绪 | 概率:中, 影响:高, 缓解:curl预验证 | 合理——若后端未就绪，chatStore无法端到端测试。建议在实际执行G1前由开发者执行curl验证并报告结果 | 同意 |
| chatStore SSE管道调试复杂度 | 概率:中高, 影响:高, 缓解:最有经验开发者负责 | 合理——SSE chunk边界处理、`\n\n`分隔、JSON异常是已知高耗时领域 | 同意 |
| useChatApi与authStore循环依赖 | 概率:低, 影响:中, 缓解:token参数传入 | 合理——已在G1节标注两种实现方案（参数传入 vs 直接import），由开发者判断 | 同意 |
| Consultation.vue重写超估 | 概率:低, 影响:中, 缓解:复用Home.vue样式 | 合理——医生卡片UI有明确参考 | 同意 |
| vue-tsc新增错误 | 概率:中, 影响:低, 缓解:G7优先执行编译验证 | 合理——新建3文件+重写2文件，类型链可能引入新错误 | 同意 |

**建议追加第6条风险**: G2/G3/G4 均为 chatStore.ts 同一文件的追加修改，若三组由不同开发者执行（如G2由开发者1、G3由开发者2），将产生合并冲突。缓解措施：task_v3.md已设计G1→G2→G3→G4为同一开发者的串行链，符合此设计则风险不触发。

---

## 7. 替代方案与建议

### 7.1 非阻塞建议

| 编号 | 建议 | 优先级 | 来源 |
|:--:|------|:----:|------|
| S1 | G1 的 `sendChatMessage` 初始实现即包含 `signal` 参数（而非留到G3回修），减少跨组修订 | 低 | 本审查发现 |
| S2 | G2 验收标准第3条标注"延迟至G6验证"，避免G2开发者误以为该条必须在G2阶段通过 | 低 | 本审查发现 |
| S3 | 在 G1 开始前用 curl 验证 `POST /api/chat/doctor/:id` 端点可用性，将结果记录在 task_v3.md 或 plan.md 的风险跟踪区 | 中 | R1 S2延续 |
| S4 | G14-phase2 (console.warn→Promise.reject) 在 v3 完成前确认切换时机 | 低 | R1 S4延续 |
| S5 | 统一 `is_online` 字段的描述：建议与后端确认后更新 task_v3.md，避免G5开发者困惑 | 极低 | M1修复 |

### 7.2 简化交付方案评估

task_v3.md 第1248-1264行给出的简化方案：
- 断线重连：固定间隔3次(2s/4s/8s) → 指数退避推迟至v4，节省~2h
- 多医生路由：仅单医生对话 → 完整Map切换推迟至v4，节省~4h
- fabOpen：移除或留空 → 推迟至v4，节省~1h
- 总工时从36-52h降至28-40h，节省~8-12h

**评估**: 此简化方案在保证核心功能完整性（AC-1/AC-2/AC-4/AC-5全通过，AC-3部分通过）的前提下，显著降低关键路径风险。推荐在实际执行中采用。

---

## 8. 审查结论

### 判定: **APPROVED** -- 可进入执行阶段

### 批准依据

1. **R1 四条阻塞条件全部满足**: task_v3.md 已创建（1315行），采用7组分解（与v1/v2粒度一致），含38条可执行验收标准+5条核心路径标准，G5独立并行标注充分。

2. **粒度达标**: 7个任务组工时范围2-12h，与v1 (1.3-2.2h)和v2 (1.4-2.2h)相比偏大，但v3工作量10倍于前两轮，当前粒度是SSE核心逻辑不可再拆的合理结果。

3. **依赖关系正确**: 内部依赖链（G1→G2→G3→G4→G6→G7，G5独立并行）与代码实际状态一致，跨轮次依赖已就绪。

4. **验收标准可执行**: 38条中36条可立即在当前环境执行，2条需延迟验证（已标注）。

5. **诊断报告全覆盖**: S5b-1全部9项子任务和S5b-2全部3项子任务在7个任务组中均有对应。

### 执行前建议

1. **curl预验证**（风险缓解最高优先级）: 在G1开始前执行 `curl -X POST http://localhost:3000/api/chat/doctor/1 -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"message":"你好"}'` 确认端点可用性。若不可用，需先实现Mock SSE服务器。

2. **开发者分配**: G1-G4 串行链分配给同一开发者（避免chatStore.ts合并冲突）；G5 分配给第二开发者独立并行；G6 可由第三开发者在G1完成后（接口稳定）开始静态UI部分。

3. **工时记录**: 记录v3各任务组实际工时，用于v4/v5预估校准。

---

*复审报告结束。task_v3.md 获准执行。*
