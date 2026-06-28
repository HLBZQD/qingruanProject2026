# 第3轮规划审查报告 v3-r1

> **审查对象**: `plan.md` 第4.1节 v3行 + 诊断报告 `a_v8_diag_v3.md` S5b-1/S5b-2 详细规格
> **输入文件**: verify_v1.md, verify_v2.md, a_v8_diag_v3.md
> **审查日期**: 2026-06-27
> **审查人**: Plan Reviewer

---

## 0. 前置发现: task_v3.md 缺失

**`task_v3.md` 文件不存在于 `implements/202606272139_frontend_todo_fix/` 目录下。** v1 和 v2 均有对应的 `task_v1.md` (317行) 和 `task_v2.md` (298行) 详细任务文件，但 v3 仅有 `plan.md` 中的一行概要描述:

> | **v3** | P0+P1 | 2 | 36-52h | S5b-1 + S5b-2（最大单项投入，需独立轮次） |

本审查因此针对两个层次展开：(a) plan.md 中 v3 的概要规划是否合理；(b) 若需将 36-52h 的巨型轮次细化为可执行任务文件，应如何分解为 ~7 个任务组。

---

## 1. 审查维度一: 任务组分解合理性

### 1.1 当前 plan.md 的 v3 分解

plan.md 将 v3 定义为仅 2 个任务:

| 任务 | 内容 | 预估工时 |
|:----:|------|:------:|
| S5b-1 | 实现 chatStore SSE 核心 | 20-28h |
| S5b-2 | 实现 DoctorChatView.vue 组件 + 路由注册 + Consultation.vue 重写 | 16-24h |

### 1.2 诊断报告的实际工作量构成

诊断报告 S5b-1 修复建议（第149-170行）列举了以下独立工作项:

| 子项 | 内容 | 诊断预估 |
|------|------|:------:|
| (a) useChatApi.ts 创建 | `sendChatMessage()` + `getDoctorInfo()` API composable | 2-4h |
| (b) SSE 连接管理 | fetch + ReadableStream reader 管道 + AbortController | 核心 |
| (c) SSE 事件解析 | chunk→文本→`\n\n`分隔→去`data: `前缀→JSON.parse→event分发 | 核心 |
| (d) conversation_id 管理 | localStorage 按 doctorId 存储 + 首次/后续对话区分 | 核心 |
| (e) 断线重连 | 指数退避(1s→30s, 最大5次) + conversation_id 恢复 | 核心 |
| (f) abortActiveConnection | AbortController.abort() 实现 + 连接数上限1 | 核心 |
| (g) 多医生会话路由 | Map<number, string> 映射 + 切换医生时 abort 旧连接 | 核心 |
| (h) 消息流式渲染 | AI回复chunk增量追加到conversations数组 + ref驱动UI | 核心 |
| (i) fabOpen 状态管理 | Consultation悬浮按钮展开/收起 | 轻量 |

诊断报告 S5b-2 修复建议（第172-181行）列举了以下独立工作项:

| 子项 | 内容 | 诊断预估 |
|------|------|:------:|
| (a) Consultation.vue 重写 | 医生列表三态UI + 卡片渲染 + 在线标识 + 点击跳转 | 8-12h |
| (b) DoctorChatView.vue 创建 | 对话消息列表 + 输入框 + 流式渲染 + 医生信息头 | 8-12h |
| (c) 路由注册 | `/consultation/doctor/:id` + meta配置 | 轻量 |

### 1.3 评估: 2 任务分解过粗，建议分解为 7 个任务组

**判定: 当前 plan.md 的 2 任务分解粒度过粗，每个任务 16-28h 内部包含 5-9 个独立工作项，执行者难以在一个不可分割的 commit 中完成。** 对比 v1（6 任务/8-13h，平均 1.3-2.2h/任务）和 v2（5 任务/7-11h，平均 1.4-2.2h/任务），v3 的两个巨型任务（平均 18-26h/任务）跨越了约10倍的粒度差异。

建议的 7 组分解（自顶向下）:

| 组号 | 任务 | 内容 | 预估 | 所属 |
|:----:|------|------|:---:|:---:|
| **G1** | S5b-1a: useChatApi.ts 创建 | `sendChatMessage()` (fetch POST → Response) + `getDoctorInfo(id)` 两个 API 函数 | 2-4h | S5b-1 |
| **G2** | S5b-1b: chatStore 连接管理 | fetch+ReadableStream reader 管道 + AbortController 集成 + abortActiveConnection() 实现 + 连接数上限1 | 6-8h | S5b-1 |
| **G3** | S5b-1c: SSE 事件解析 + 流式渲染 | chunk→text解码→`\n\n`分隔事件块→去`data: `前缀→JSON.parse→event分发(message/message_end/error) + AI回复chunk增量追加到conversations + ref驱动UI更新 | 6-8h | S5b-1 |
| **G4** | S5b-1d: conversation_id 管理 + 断线重连 + 多医生路由 | localStorage按doctorId存储conversation_id + 首次/后续对话区分 + 指数退避重连(1s→30s, max5) + Map<number,string>多医生映射 + fabOpen状态 | 6-8h | S5b-1 |
| **G5** | S5b-2a: Consultation.vue 重写 | 医生列表三态UI(loading/empty/error) + 医生卡片(头像/姓名/职称/科室/简介/在线标识) + `@click` → `router.push("/consultation/doctor/" + id)` + `getDoctors()` API集成 | 8-12h | S5b-2 |
| **G6** | S5b-2b: DoctorChatView.vue 创建 | 医生信息头部(onMounted调用getDoctorInfo) + 对话消息列表(用户消息+AI回复流式渲染) + 输入框(sendMessage调用chatStore) + 三态处理(加载/错误/404) + 免责声明弹窗触发 | 6-8h | S5b-2 |
| **G7** | S5b-2c: 路由注册 + 集成验证 | `/consultation/doctor/:id`路由注册(requiresAuth+requiresDisclaimer) + Consultation→DoctorChatView完整用户路径端到端测试 + SSE连接→消息收发→断线重连冒烟测试 + vue-tsc + vite build | 2-4h | S5b-2 |

### 1.4 S5b-1 核心功能分解判断

S5b-1 是"实现 chatStore SSE 核心"，上述 G1-G4 分解正确覆盖了诊断报告列举的全部 9 项工作 (a)-(i):
- **G1 (useChatApi.ts)**: 对标诊断项 (a) — API composable 层，chatStore 的上游依赖
- **G2 (连接管理)**: 对标诊断项 (b)(f) — fetch+ReadableStream + AbortController + 连接上限
- **G3 (事件解析+流式渲染)**: 对标诊断项 (c)(h) — SSE协议解析 + UI流式更新
- **G4 (conversation_id+重连+多医生)**: 对标诊断项 (d)(e)(g)(i) — 会话持久化 + 健壮性

此分解将 20-28h 的单一巨型任务拆为 4 个 2-8h 的可管理单元，与 v1/v2 的任务粒度一致。

### 1.5 S5b-2 核心功能分解判断

S5b-2 是"DoctorChatView.vue 组件 + 路由注册 + Consultation.vue 重写"，上述 G5-G7 分解正确覆盖:
- **G5 (Consultation.vue)**: 诊断报告 v6 修正明确指出此文件为"7行占位页面"，需"完整构建医生列表UI"，工作量 8-12h。这是 S5b-2 的独立前置条件——用户需从 Consultation 页进入 DoctorChatView。
- **G6 (DoctorChatView.vue)**: 对话UI主体，依赖 chatStore (G1-G4完成的接口)。
- **G7 (路由+集成)**: 路由注册本身是轻量操作，但集成验证的端到端测试工作量不可忽略（完整用户路径：Consultation医生列表→点击卡片→DoctorChatView SSE对话→断网重连）。

---

## 2. 审查维度二: 依赖关系正确性

### 2.1 硬性依赖链

```
G1 (useChatApi.ts) ──→ G2+G3+G4 (chatStore 消费 useChatApi)
G1+G2+G3+G4 (chatStore完整) ──→ G6 (DoctorChatView 集成 chatStore)
G1+G2+G3+G4 (chatStore完整) ──→ G5 (Consultation.vue — 仅需 getDoctors，可独立)
G5 (Consultation入口页) ──→ G7 (完整用户路径)
G6 (DoctorChatView) ──→ G7 (路由注册+集成验证)
```

**关键依赖链**: `G1 → G2 → G3 → G4 → (G5 ∥ G6) → G7`

### 2.2 plan.md 中 v3 依赖标注审计

| 依赖链 | plan.md 标注 | 准确性 |
|--------|:----------:|:-----:|
| S5b-1 → S5b-2 | 标注 (3.1节) | **正确** — 硬性依赖，chatStore 必须先于组件 |
| G14 → S5b-1 | 标注 (3.2节) 为"建议"依赖 | **正确** — 诊断报告 8.2 节 S5b-1 行同样标注为"建议"。useChatApi.ts 自动受益于 G14 拦截器，但不阻塞功能实现 |
| G27 → G17 | 标注 (3.2节) | **v3 不涉及** — G27/G17 均为 P3/P4 层 Punch.vue 相关修复，v3 范围不包含它们。此依赖标注可保留但不影响 v3 执行 |

### 2.3 plan.md 遗漏的 v3 内部依赖

plan.md 3.1-3.2 节仅标注了跨轮次依赖，未涉及 v3 内部的任务间依赖。在上述 7 组分解中:

| 依赖 | 性质 | 说明 |
|------|:---:|------|
| G1 → G2/G3/G4 | **硬性** | chatStore 调用 useChatApi.ts 导出的函数，useChatApi 必须先完成 |
| G2 → G3 | **强建议** | 事件解析需要 ReadableStream reader 管道先就绪，但可在 G2 接口稳定后并行开发 |
| (G1-G4) → G5 | **软性** | Consultation.vue 仅需 `getDoctors()` (已存在于 useHomeApi.ts)，不依赖 chatStore。G5 可与 G1-G4 完全并行 |
| (G1-G4) → G6 | **硬性** | DoctorChatView 集成 chatStore，chatStore SSE 核心必须完成 |
| G5+G6 → G7 | **硬性** | 集成验证需要两个页面都就绪 |

**关键发现**: Consultation.vue (G5) 可独立于 chatStore 并行开发——它仅使用已存在的 `getDoctors()` API，不涉及 SSE 通信。这意味着在三人并行策略下，G5 可与 G1-G4 同时推进。

### 2.4 跨轮次依赖就绪状态

| 前置依赖 | 来自轮次 | 状态 | 对 v3 的影响 |
|---------|:------:|:----:|------------|
| G14 (success拦截器) → S5b-1 | v2 | **已完成** (verify_v2.md 确认 PASS) | useChatApi.ts 新建时自动受益于统一错误处理。若 G14 当前为 console.warn 阶段(未切换 reject)，useChatApi.ts 的错误处理行为与现有 10 个 API 函数一致，无回归风险 |
| S1/S2 (sessionStorage缓存) → S5b-2 | v1 | **已完成** (verify_v1.md 确认 PASS) | S5b-2 不直接依赖 S1/S2。仅 S8 (v2) 的联动清理依赖 S1/S2。v3 无此依赖需求 |
| S5a (ArticleDetailView) → v3 | v1 | **已完成** | 无交叉依赖。文章详情功能与医生对话功能完全独立 |

**结论**: 所有跨轮次硬性依赖已满足，v3 可以立即开始。

---

## 3. 审查维度三: 并行流可行性

### 3.1 plan.md 的并行策略

plan.md 5 节里程碑表将 M4 (P3代码质量) 标注为"第7-8天（可与M3并行）"，暗示 v3 (M3) 与 v4 (M4) 可以跨轮次并行。这是正确的——v3 修改 chatStore/Consultation/DoctorChatView，v4 修改 Punch.vue/punchStore/sanitize.ts，两组文件完全不重叠。

### 3.2 v3 内部并行可行性（基于 7 组分解）

| 并行组 | 任务 | 可并行？ | 说明 |
|:------:|------|:------:|------|
| **A 流** | G1 → G2 → G3 → G4 | 内部串行 | chatStore 各层有顺序依赖（API层→连接层→解析层→管理层） |
| **B 流** | G5 (Consultation.vue) | 与 A 流并行 | 不依赖 chatStore，仅使用已有的 `getDoctors()` |
| **C 流** | G6 (DoctorChatView.vue) | 依赖 A 流完成 | 需要 chatStore SSE 接口就绪 |
| **D 流** | G7 (路由+集成) | 依赖 B+C 流完成 | 需要两个页面都就绪 |

**三人并行方案**:

```
开发者1: G1 → G2 → G3 → G4 (20-28h, 关键路径)
开发者2: G5 (8-12h, 独立) → 完成后转入协助 G3/G4 或开始 G6 准备工作
开发者3: 等待 G1 完成(useChatApi.ts 接口稳定) → 开始 G6 的静态UI部分(header/input/layout) → G4 完成后集成 chatStore → G7
```

**关键路径分析**: 开发者1 的 G1→G2→G3→G4 链(20-28h) 仍为关键路径瓶颈。G5 (8-12h) 和 G6 的静态部分可在等待期间完成，但 chatStore SSE 核心仍然是不可压缩的串行工作量。

### 3.3 与 plan.md 三人并行策略的一致性

plan.md 4.3 节关键路径标注为 `S5b-1 (20-28h) → S5b-2 (16-24h)`，总工期 36-52h。在 7 组分解下:
- **最短工期** (三人并行): 20-28h (G1→G4链为关键路径，G5与G6的静态部分填充等待时间，G7约2-4h)
- **实际工期** (含集成调试): 约 28-36h

与 plan.md 的 20-28h 预算相比，**7 组分解后的并行预估 (28-36h) 更接近实际**——plan.md 的 20-28h 假设 S5b-1 内部无任何可并行子任务，且未考虑 G5 (Consultation.vue) 独立于 chatStore 可提前并行的事实。但 chatStore 的 20-28h 串行核心仍是不可逾越的瓶颈，两人并行相比三人并行不会显著缩短关键路径。

---

## 4. 审查维度四: 预估工作量合理性

### 4.1 plan.md 的 v3 预估

| 场景 | v3 预估 |
|------|:------:|
| 单人串行 | 36-52h |
| 三人并行 | 36-52h (关键路径 S5b-1) |

### 4.2 诊断报告的对照

| 子任务 | 诊断预估 | 备注 |
|--------|:------:|------|
| S5b-1 (chatStore SSE核心) | 20-28h | 含 useChatApi.ts 创建(2-4h) + fetch+ReadableStream管道 + 重连 + conversation_id管理 + 流式渲染 |
| S5b-2 (Consultation+DoctorChatView+路由) | 16-24h | 含 Consultation.vue 重写(8-12h) + DoctorChatView.vue(8-12h) |

诊断报告总计: 36-52h，与 plan.md 一致。

### 4.3 独立审查评估（基于 7 组分解）

| 组 | 内容 | plan.md 隐含 | 诊断报告 | 独立审查 | 偏差分析 |
|:--:|------|:----------:|:------:|:------:|---------|
| G1 | useChatApi.ts | 含在 S5b-1 中 | 2-4h | 2-4h | 一致。两个函数(sendChatMessage+getDoctorInfo)，纯 API 封装 |
| G2 | 连接管理 | 含在 S5b-1 中 | 核心(未单独计时) | 6-8h | fetch+ReadableStream reader管道+AbortController+连接上限，涉及异步流控制，调试耗时 |
| G3 | SSE解析+流式渲染 | 含在 S5b-1 中 | 核心(未单独计时) | 6-8h | chunk→text→SSE协议解析→JSON.parse→event分发→增量渲染。协议解析易出边界bug |
| G4 | conversation_id+重连+多医生 | 含在 S5b-1 中 | 核心(未单独计时) | 6-8h | localStorage管理+指数退避+Map路由。多场景组合调试耗时 |
| G5 | Consultation.vue | 含在 S5b-2 中 | 8-12h | 8-12h | 三态UI+卡片渲染+在线标识+跳转。组件完整构建 |
| G6 | DoctorChatView.vue | 含在 S5b-2 中 | 8-12h | 6-8h | 依赖 chatStore 接口。若 chatStore 接口设计清晰，UI层实现可加速 |
| G7 | 路由+集成验证 | 含在 S5b-2 中 | 轻量 | 2-4h | 路由注册(轻量) + 端到端测试(含SSE调试，不可忽略) |
| **合计** | | **36-52h** | **36-52h** | **36-52h** | 与诊断报告完全一致 |

### 4.4 与 v1/v2 实际工时的交叉验证

| 轮次 | plan.md 预估 | 实际 | 偏差 |
|:----:|:----------:|:---:|:---:|
| v1 (6任务) | 8-13h | 构建产物确认 PASS，实际工时未记录 | 无法比较 |
| v2 (5任务) | 7-11h | 构建产物确认 PASS，实际工时未记录 | 无法比较 |

由于前两轮未记录实际工时，无法用历史数据校准 v3 预估。**建议在 v3 执行过程中记录各任务组的实际工时，用于后续轮次预估校准。**

### 4.5 工时评估结论

plan.md 的 36-52h 预估与诊断报告一致，在 7 组分解下各子项估算也吻合。**预估合理，但属于乐观估算（假设开发者熟悉 fetch+ReadableStream SSE 模式且无重大调试障碍）。** SSE 管道调试（chunk边界处理、`\n\n`分隔、JSON解析异常）是已知的高耗时领域，建议增加 20% 缓冲（约 7-10h）作为风险储备。

---

## 5. 审查维度五: 可推迟的低优先级任务

### 5.1 v3 范围内的可推迟项

| 可推迟项 | 所在任务组 | 推迟影响 | 建议 |
|---------|:--------:|---------|------|
| **断线重连指数退避** | G4 | 降低网络异常场景的健壮性。用户断网后需手动刷新页面重连，而非自动恢复 | **不建议推迟** — 诊断报告第158行将其列为 chatStore 的关键逻辑(d)，是 SSE 长连接的必备健壮性。但可实现简化版(固定间隔重试3次)作为 v3 交付，指数退避增强版推迟至 v4 |
| **多医生会话路由** (Map<number,string>) | G4 | 用户切换医生时丢失对话上下文（每次需重新开始对话） | **可推迟至 v4** — 前提是 v3 仅交付单医生对话（首个 doctorId）。诊断报告第161行将其列为关键逻辑(f)，但 MVP 可降级。推迟后 G4 节省约 2h |
| **fabOpen 悬浮按钮状态** | G4 | Consultation 页悬浮按钮无展开/收起动画 | **可推迟至 v4** — 纯 UI 增强，不影响对话核心功能 |
| **Consultation.vue 完整三态** (loading/empty/error) | G5 | 医生列表无法展示加载/空/错误状态，用户可能看到空白页 | **不建议推迟** — 诊断报告第176行明确列出的边界条件(c)，是组件的基本质量要求 |
| **DoctorChatView.vue 免责声明弹窗** | G6 | 首次进入医生对话不弹出免责声明确认 | **可推迟** — 路由守卫 `requiresDisclaimer: true` 已可触发免责声明。组件内额外弹窗为双重确认，属增强项 |
| **G18 (AbortController 组件卸载清理)** | G2 | 组件卸载时 SSE 连接未主动关闭，可能持续消耗服务端资源 | **不建议推迟** — 诊断报告第168行将其列为边界条件，是资源管理的基本要求。但 G18 的独立修复（其他组件的 AbortController 清理）可推迟至 v4 |

### 5.2 降低风险的推荐策略

**方案A (风险最低，推荐):** 
- v3 交付完整 S5b-1 (G1-G4) + S5b-2 (G5-G7)，按 7 组分解执行
- 断线重连使用简化版（固定间隔3次重试），指数退避增强推迟至 v4
- 多医生路由推迟至 v4（v3 仅单医生对话）
- 工时从 36-52h 缩减至约 **28-40h**（节省约 8-12h）
- 风险降低: 减少 SSE 调试复杂度（多医生路由和指数退避是两个主要调试障碍源）

**方案B (完整交付，工期最长):**
- v3 交付全部 S5b-1 + S5b-2 完整功能
- 工时 36-52h，需增加 20% 缓冲至 **43-62h**
- 适用于后端医生对话 API 已完全就绪、团队有 SSE 开发经验的场景

### 5.3 跨轮次推迟建议

以下 P3/P4 层任务虽然在 v4/v5 范围，但与 v3 无依赖冲突，可考虑提前至 v3 并行窗口期（非关键路径开发者等待 chatStore 完成时）:

| 可提前任务 | 原始轮次 | 提前理由 |
|-----------|:------:|---------|
| G3 (Punch 环形图) | v4 | 纯前端 SVG 实现，无外部依赖，2-3h 可完成 |
| G6 (Punch 刷新按钮) | v4 | 纯前端 UI 新增，1h 可完成 |
| G7+G8+G12 (工具抽取) | v4 | 代码重构，无功能变更，2-3h 可完成 |
| G24+G25 (全局样式提取) | v4 | 纯 CSS 迁移，1-2h |

这些 P3/P4 项与 v3 的文件完全不重叠（v3 修改 chatStore/Consultation/DoctorChatView，P3/P4 修改 Punch.vue/punchStore/工具文件），在等待 chatStore 完成期间由非关键路径开发者消化，可缩短整体项目工期。

---

## 6. 与前两轮审查建议的跟踪

| v1 审查建议 | 状态 | 对 v3 的影响 |
|:--------|:--:|-----------|
| 建议3: Consultation.vue 拆分考虑 | **本次审查采纳** — 将 Consultation.vue 重写(G5)与 DoctorChatView.vue(G6)拆分为并行子任务 | 直接体现在 7 组分解中 |
| v2 审查建议 R2: Pinia Store 循环依赖 | **v3 必须关注** — chatStore 内部可能引用 authStore (获取 token 用于 Authorization header)。如果 authStore 也引用 chatStore，将形成循环依赖。建议在 useChatApi.ts 中通过参数传入 token 而非 chatStore 直接引用 authStore | 影响 G1 (useChatApi.ts) 的设计 |
| v2 审查建议 R3: G14-phase2 跟进 | **需在 v3 或 v4 中安排** — 当前 G14 为 console.warn 版本(第一阶段)，需在后续轮次切换为 Promise.reject | 不影响 v3 开始，但应在 v3 完成前确认是否切换 |

---

## 7. 风险矩阵

| 风险 | 概率 | 影响 | 缓解措施 |
|------|:---:|:---:|---------|
| task_v3.md 缺失导致执行者无具体指导 | **已发生** | 高 — 36-52h 工作无分解、无验收标准、无文件清单 | 立即创建 task_v3.md，采用本报告建议的 7 组分解 |
| chatStore SSE 管道调试超出预估 | 中高 | 高 — 关键路径延长，整体项目延期 | 增加 20% 缓冲；简化版重连先交付；安排最有 SSE 经验的开发者 |
| 后端 SSE API (`POST /api/chat/doctor/:id`) 未就绪 | 中 | 高 — chatStore 无法端到端测试 | v3 开始前用 curl 验证 API 可用性；若不可用，先实现 chatStore 骨架 + Mock SSE 服务器 |
| Consultation.vue 重写(8-12h)超估 | 低 | 中 | 医生列表 UI 有明确设计文档参考(4.1.3节)，可复用 Home.vue 的医生卡片样式 |
| useChatApi.ts 与 authStore 循环依赖 | 低 | 中 | G1 设计时 token 通过函数参数传入，避免 chatStore/useChatApi 直接 import authStore |

---

## 8. 审查结论

### 判定: **REJECTED** — 需补充 task_v3.md 后重新审查

### 拒绝理由

1. **task_v3.md 缺失**: v3 是全部 5 轮中工作量最大的轮次（36-52h，占总量 36-52%），但 plan.md 仅用一行概要描述。对比 v1 (317行任务文件, 6 任务) 和 v2 (298行任务文件, 5 任务)，v3 缺少可执行的任务分解文件。执行者面对"实现 chatStore SSE 核心 (20-28h)"一行描述无法开工。

2. **粒度过粗**: 两个 16-28h 的巨型任务不可作为一个 commit 管理。每个巨型任务内部包含 5-9 个独立工作项，需分解为 ~7 个 2-12h 的可管理任务组。

3. **无验收标准**: v1 和 v2 的每个任务都有 3-7 条可操作验收标准。v3 的 plan.md 描述不含任何验收标准，执行者无法判断"完成"的定义。

4. **并行策略未落地**: plan.md 识别了三人并行策略，但未在 v3 任务层面体现——未标注哪些子任务可并行、哪些必须串行。Consultation.vue (G5) 可完全独立于 chatStore 并行这一关键优化未被利用。

### 批准条件

以下三项全部满足后重新审查:

1. **创建 `task_v3.md`**: 采用本报告第 1.3 节建议的 7 组分解（或等效的 5-9 组分解），每组包含:
   - 问题编号和严重程度
   - 预估工时
   - 前置依赖（组内和跨轮次）
   - 涉及文件清单（含操作类型: 新建/修改）
   - 具体修改描述（参考诊断报告第149-181行的详细规格）
   - 3-5 条可操作验收标准
   - 并行执行建议（标注可与哪些组并行）

2. **补充验收标准**: 至少覆盖以下 5 条核心用户路径:
   - 从 Consultation 页点击医生卡片 → 进入 DoctorChatView → 发送消息 → 接收 SSE 流式回复
   - 断网场景 → 指数退避重连 → 对话上下文恢复（conversation_id 未丢失）
   - 切换医生 → 旧连接 abort → 新连接建立 → 独立 conversation_id
   - 组件卸载 → SSE 连接关闭（AbortController cleanup）
   - `vue-tsc --noEmit` + `vite build` 零错误

3. **标注可推迟项**: 在 task_v3.md 中明确标注哪些子任务是 MVP 必须交付、哪些可推迟至 v4（参考本报告第 5 节），并给出"完整交付"和"简化交付"两种工时预估。

### 补充建议（非阻塞）

| 编号 | 建议 | 来源 |
|:--:|------|------|
| S1 | useChatApi.ts 的 token 通过函数参数传入，避免 chatStore→authStore 循环依赖 | v2审查 R2 延续 |
| S2 | v3 开始前用 curl 验证 `POST /api/chat/doctor/:id` SSE 端点可用性，若不可用则先实现 Mock SSE 服务器 | 风险缓解 |
| S3 | 记录 v3 各任务组实际工时，用于 v4/v5 预估校准 | 过程改进 |
| S4 | G14-phase2 (console.warn→Promise.reject) 在 v3 完成前确认切换时机 | v2审查 R3 跟踪 |

---

*审查报告结束。待 task_v3.md 创建后重新提交审查。*
