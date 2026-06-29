# 技术方案设计 v1：Dify 工作流多轮对话调整 / 前置需求澄清 / 工作流集成进 Agent

> 本方案针对再审议需求 `requirement.md` 的 Q1/Q2/Q3 三个技术问题，对 `docs/6_chatflow.md` 第 5 节工作流/Agent 方案的设计充分性进行复审，并产出可落地的修订决策。本方案停留于"决策层"（技术选型、方案决策、数据流方向、关键类型轮廓、修订影响范围），不涉及逐字段类型定义与逐方法签名实现。

---

## 0. 设计基线与裁决依据

本方案所有裁决基于以下已确认事实（来自被审议文档 `docs/6_chatflow.md`，引用章节为该文档章节）：

- **§3.2.14 `PUT /api/plan/adjust`** 已存在方案调整机制：请求体 `{plan_id, feedback}`，处理流程为"逻辑过期旧方案组 → 以 `feedback` 和原 `health_info` 作为输入调用 `life-plan-generator` 工作流 → 写入新方案组 → 返回新方案"。
- **§5.2.2 `life-plan-generator`** 输入变量仅声明 `health_info`(object) + `preferences`(object) 两个，**未声明 `feedback` 输入变量**；工作流以 blocking 模式调用，无 `conversation_id`、无对话上下文。
- **§3.6 映射表** 已存在 `feedback → inputs.feedback` 映射规则——与 §5.2.2 输入变量表**存在契约不一致**（映射表声明了 `feedback` 注入，但工作流未声明接收变量）。
- **§9.1.1** 给出了 Workflow / Chatflow / Agent 三类 Dify 应用的权威能力差异表，本方案以此为 Dify 平台能力边界的事实依据。
- **§9.3** 已对 `life-plan-generator` 是否转 Chatflow 做了分析并得出"保持 Workflow"结论，但其判定标尺是"提前终止/多轮补全/动态调整"三类提升，**未覆盖本轮 Q1 的"多轮对话式调整 UX"与 Q2 的"前置意图澄清"维度**，本方案不重复 §9 的论证，仅在其结论上叠加 Q1/Q2/Q3 维度的新裁决。
- **§5.2.5 `diabetes-assistant-agent`** 已具备"技能3 方案生成"——通过工具触发方案生成，走 `/api/dify/agent/:id` 端点，支持 `conversation_id` 对话上下文。
- **§5.5** 已确立"对 Dify 平台能力先验证再依赖"的工程纪律，本方案对新增依赖项沿用此纪律。

---

## 1. Q1 裁决：多轮对话式调整方案 —— 质疑**部分成立**

### 1.1 裁决结论

| 子问题 | 裁决 | 依据 |
|--------|------|------|
| "输错一项就得把其他所有重新填一遍" | **不成立** | §3.2.14 adjust 以 `feedback` + 原 `health_info` 为输入，用户无需重填健康信息 |
| "工作流肯定不支持多轮对话调整方案" | **成立** | §5.2.2 工作流 blocking 无状态、无 `conversation_id`，每次 adjust 是独立的一次性重新生成，非真多轮 |
| 现有 adjust 是否已是"多轮对话式"调整 | **不成立** | adjust 是"一次性重新生成整组方案"，无对话上下文、无逐项编辑、无跨轮意图累积 |

### 1.2 事实裁决细节

**1.2.1 "重新填一遍"担忧已被 §3.2.14 部分消解。** 用户提交 `PUT /api/plan/adjust` 仅需提供 `{plan_id, feedback}`，`health_info` 由后端从原方案组/用户档案复用（§3.2.14 处理流程第2步"以 `feedback` 和原 `health_info` 作为输入"）。用户**不需要重填** age/gender/height/weight 等结构化健康字段。落汤狗"输错一项就得把其他所有重新填一遍"的描述在结构化健康数据维度上不成立。

**1.2.2 "多轮对话式调整"在当前工作流架构下确实不支持。** §5.2.2 `life-plan-generator` 为 blocking workflow，无 `conversation_id`、无对话轮次状态。每次 `PUT /api/plan/adjust` 是一次**独立的、整组重新生成**的 blocking 调用：
- 用户连续两次"只改晚餐"的 adjust，是两次独立的工作流执行，第二次不感知第一次的 feedback。
- 工作流输出是**全新的 7 条方案项**（饮食 4 + 运动 3），写入新 `plan_id` 方案组，旧组 `is_active=0`。
- §9.3.2 提到"LLM 收到'只改晚餐，其他不变'的 feedback 时应保持其他项不变"——这是**软提示词约束，非结构化契约保证**。LLM 可能因重新生成而漂移其他项内容，用户无法预期"未提及的项真的没变"。

**1.2.3 存在契约不一致（需修订）。** §3.6 映射表声明 `feedback → inputs.feedback`，但 §5.2.2 工作流输入变量表仅声明 `health_info` + `preferences`，未声明 `feedback`。此外 §3.2.14 处理流程描述"以 `feedback` 和原 `health_info` 作为输入"——**未明确原 `preferences` 是否随调整复用**。这意味着：
- 若工作流未声明 `feedback` 变量，§3.6 的 `inputs.feedback` 注入会落空或被忽略。
- 若 `preferences` 未复用，调整时丢失了用户原始偏好（如"低盐低脂""膝关节旧伤"），新生成方案可能违背原偏好。

**1.2.4 结论。** Q1 质疑部分成立：工作流确实不支持真多轮对话式调整（这是 workflow 类型的能力上限，非设计缺陷），但"重新填一遍"已被 adjust 机制部分消解。真正待修订的是：(a) `feedback`/`preferences` 在调整链路的契约不一致与丢失风险；(b) "整组重新生成"与用户"只改一项"心智的信任差。

---

## 2. Q2 裁决：前置需求澄清节点 —— 质疑**部分成立，但应落地在前端而非 Dify 内部节点**

### 2.1 裁决结论

| 子问题 | 裁决 | 依据 |
|--------|------|------|
| 是否应增设"转格式并发送请求之前"的需求分析与意图确认 | **成立** | 自由文本 `preferences`/`feedback` 存在歧义与输错风险，生成/调整成本高（5-8s+ LLM 调用），前置确认收益明确 |
| 前置澄清应放在哪一层 | **前端为主，不引入 Dify 内部交互节点** | workflow 无中途交互能力（§9.1.1）；Express 层 LLM 预调用违背"工作流不自行查库、不叠加额外 LLM 成本"架构约束；前端确认弹窗成本最低、风险最小 |

### 2.2 分层方案选型

落汤狗原文提出"加一个前置工作流或者节点，在转格式向发送请求之前就做一遍需求分析与明确"。本方案对该前置环节的三种落位逐一裁决：

**方案 A：Dify 工作流内部交互节点（问题建议器/问答节点）** —— **不采用**。
- 依据：§9.1.1 明确 Workflow 不支持中途交互，只有 Chatflow 才支持交互节点。将 `life-plan-generator` 改为 Chatflow 以获得交互节点，§9.3 已论证不构成实质性提升且破坏结构化 JSON 输出契约与 `life_plans` 表方案组模型。前置澄清不足以成为转 Chatflow 的理由。

**方案 B：Express 代理层 LLM 预调用做意图解析** —— **不采用**。
- 依据：违背已确立架构约束"Express 代理层预查询数据注入 + Dify 工作流不自行查库"。在 Express 层叠加一次 LLM 意图澄清调用，会增加延迟（额外 3-5s）与 token 成本，且引入"Express 层 LLM 调用"这一新的非一致性能力点。架构上 Express 是数据映射与权限代理，不应承担 LLM 推理职责。

**方案 C：前端生成前/调整前确认弹窗（预览 + 确认）** —— **采用，作为 Q2 主解**。
- 依据：与 §4.3 NewsView.vue 已验证的"生成文章 → SweetAlert2 分类选择弹窗"交互模式一致，前端已有 SweetAlert2 依赖与交互范式。成本最低、零额外 LLM 调用、零架构突破。
- 设计决策：
  - **生成前确认**：LifePlan.vue 提交 `POST /api/plan/generate` 前，弹窗预览解析后的 `health_info`（从 riskFormStore 预填或手填）+ `preferences`（dietary/activity 自由文本），用户确认"信息无误，开始生成"后才发请求。此环节"提醒用户确认是否有输错的地方"。
  - **调整前确认**：LifePlan.vue 点击"调整方案"后，弹窗展示当前方案组概要（饮食4项/运动3项标题列表）+ 结构化反馈输入区（可勾选要调整的方案项 + 自由文本 feedback），用户确认后发 `PUT /api/plan/adjust`。此环节"识别用户真实意图"——通过让用户显式勾选待调整项，把"只改晚餐"的意图从纯自由文本升级为"结构化勾选 + 文本补充"，降低 LLM 误判。

**方案 D：AI 助手 Agent 对话式澄清（可选增强，非主解）** —— **保留为可选路径**。
- 依据：§5.2.5 `diabetes-assistant-agent` 已支持 `conversation_id` 多轮对话。用户若选择通过 AI 助手"帮我调整方案，晚餐碳水太多了"，Agent 可在对话中追问澄清意图（"您是说减少晚餐主食量，还是换成低 GI 食物？"），再触发方案调整。这是**真多轮对话式澄清**，但仅在用户主动选择 AI 助手路径时生效，不替代结构化页面路径。

### 2.3 结论

Q2 质疑成立，但前置澄清的落位应是**前端确认弹窗（方案 C）为主 + AI 助手 Agent 对话澄清（方案 D）为可选增强**，不应在 Dify 工作流内部加交互节点（方案 A），也不应在 Express 层加 LLM 预调用（方案 B）。这既回应了"提醒用户确认是否有输错的地方"的诉求，又不破坏现有架构。

---

## 3. Q3 裁决：工作流集成进 Agent —— 判断**不成立（作为解决 Q1/Q2 的手段）**

### 3.1 裁决结论

| 子问题 | 裁决 | 依据 |
|--------|------|------|
| "把工作流集成到一个 Agent 里应该就是干了这件事"（即集成可解决 Q1/Q2） | **不成立** | 集成会破坏结构化输出契约、方案组数据模型、打卡外键；且 Agent 已具备方案生成技能，无需"集成工作流" |
| 是否应将 `life-plan-generator` 整体并入 Agent | **不采用** | §9.3.3 已论证破坏 §3.2.13 分组响应、§2.5 plan_id 方案组、punch_in 外键、§4.1.4 结构化渲染 |
| Agent 是否已具备"触发工作流"的能力 | **已具备** | §5.2.5 技能3"方案生成"已通过工具触发方案生成，走 `/api/dify/agent/:id`，支持 `conversation_id` |

### 3.2 事实裁决细节

**3.2.1 "工作流集成进 Agent"在 Dify 平台的含义。** Dify 支持两种"集成"形态：(a) Agent 配置工具，工具回调触发外部工作流/HTTP 端点；(b) 工作流内嵌 Agent 节点。落汤狗所说"它把工作流集成到一个 Agent 里应该就是干了这件事"，指的是**通过 Agent 的工具调用能力编排工作流**，使 Agent 持有对话上下文、可多轮追问、可触发工作流执行。

**3.2.2 该集成不能作为解决 Q1/Q2 的手段，理由如下：**

- **现有架构已分离"结构化页面路径"与"对话式 Agent 路径"，这是正确的职责边界。** 结构化路径（LifePlan.vue → `POST /api/plan/generate` → blocking workflow → 结构化 JSON → 写 `life_plans` 表 → 前端分组渲染 + 打卡）服务于"用户明确知道要什么、要结构化方案、要打卡"的主场景。对话路径（AI 助手 Agent → 多轮澄清 → 工具触发）服务于"用户想边聊边生成/调整"的辅助场景。两条路径并存，各有适用场景。
- **将 `life-plan-generator` 整体并入 Agent 会破坏四项已确立契约/模型**（§9.3.3 已记录）：(1) §3.2.13 分组 JSON 响应契约（diet_plans/exercise_plans/other_plans）；(2) §2.5 `life_plans` 表 plan_id 方案组模型与 is_active 活跃标记；(3) punch_in.plan_item_id → life_plans.id 打卡外键关联；(4) §4.1.4 LifePlan.vue 结构化方案项渲染与打卡按钮。Agent 流式自然语言输出无法直接支撑这些。
- **Agent 已具备触发工作流的能力，无需"集成"。** §5.2.5 技能3"方案生成"已通过工具触发方案生成。集成不是"把工作流搬进 Agent"，而是"Agent 作为对话入口，按需触发已有的 blocking workflow"。当前架构已实现这一形态。

**3.2.3 唯一可取的"集成增强"。** 当前 §5.2.5 技能3 仅覆盖"生成方案"，**未覆盖"调整方案"**。若要让 AI 助手路径支持对话式多轮调整（Q1 的真多轮解 + Q2 的方案 D），需为 `diabetes-assistant-agent` 新增一个 `adjust_plan` 工具，回调触发 `PUT /api/plan/adjust`（或等价的 Express 端点）。这是"Agent 触发已有 adjust 机制"的工具补全，不是"工作流集成进 Agent"的架构重构。

### 3.3 结论

Q3 判断不成立。不应将工作流集成进 Agent 作为 Q1/Q2 的解法。现有"结构化页面路径 + 对话式 Agent 路径"双轨架构正确，且 Agent 已具备触发工作流的能力。唯一需要的增强是为 Agent 补一个 `adjust_plan` 工具，让对话路径也能发起方案调整——这是工具补全，非架构集成。

---

## 4. 可落地方案修订（决策层）

### 4.1 修订项总览

| 编号 | 修订项 | 类型 | 影响章节 | 优先级 |
|------|--------|------|---------|--------|
| R1 | 修复 `feedback`/`preferences` 在 adjust 链路的契约不一致与丢失 | 契约修订 | §5.2.2 / §3.2.14 / §3.6 | 高 |
| R2 | `life-plan-generator` 工作流提示词增加"保持未提及项不变"约束 + adjust 响应增加 `diff` 字段 | 契约+UX 修订 | §5.2.2 / §3.2.13 / §3.2.14 / §3.8 | 高 |
| R3 | LifePlan.vue 增加生成前确认弹窗 + 调整前结构化反馈弹窗 | 前端 UX 修订 | §4.1.4 / §4.3 | 高 |
| R4 | `diabetes-assistant-agent` 新增 `adjust_plan` 工具（可选增强） | Agent 工具补全 | §5.2.5 / §3.6 / §7.3.3 | 中 |
| R5 | §5.5 新增前置验证任务：Dify 工作流 `feedback` 输入变量接收验证 | 平台能力验证 | §5.5 | 高 |
| R6 | 不转 Chatflow、不集成工作流进 Agent（维持现状的显式确认） | 决策记录 | 本方案 §3 | — |

### 4.2 R1：修复 adjust 链路 `feedback`/`preferences` 契约

**决策：**
- **§5.2.2 `life-plan-generator` 输入变量表新增 `feedback` 变量**（type: string，选填，默认空串）。调整调用时注入 `inputs.feedback`，生成调用时 `feedback` 为空。工作流提示词据此判断"有 feedback → 调整模式，需在原方案基础上按 feedback 修改；无 feedback → 全新生成模式"。
- **§3.2.14 处理流程修订**：adjust 调用工作流时，输入为 `{health_info, preferences, feedback}` 三元组，其中 `health_info` 与 `preferences` 均从**原方案组对应的生成时入参**复用（需在 `life_plans` 表或关联处持久化生成时的 `preferences` 快照——见 R1 数据流决策），`feedback` 为本次调整文本。
- **§3.6 映射表确认**：`feedback → inputs.feedback` 已存在，补充说明"仅 adjust 路径注入，generate 路径不注入"。

**数据流决策（preferences 持久化）：**
- 当前 `life_plans` 表（§2.5）未存储生成时的 `preferences` 快照。adjust 需复用原 preferences，有两种决策路径：
  - **路径 P1（推荐）**：在 `life_plans` 表新增 `preferences_snapshot` 列（TEXT，JSON 字符串，DDL 修订），生成时写入，adjust 时读取复用。优点：精确复用原偏好，不依赖用户档案当前值（用户档案可能已变）。缺点：DDL 变更 + 数据迁移。
  - **路径 P2（备选）**：adjust 时从用户当前 `health_info`/偏好档案重新构造 preferences（若无独立偏好档案表，则需用户在调整弹窗中重新确认 preferences）。优点：无 DDL 变更。缺点：若用户档案已变，复用的 preferences 可能与原方案不一致。
- **本方案选 P1**：精确复用是"只改一项、其他不变"心智的契约基础，DDL 新增一列的成本可接受。

**前置验证项（R5 关联）**：Dify 工作流开始节点是否支持新增 string 类型 `feedback` 变量并正常接收注入——属常规能力，低风险，但按 §5.5 纪律列入前置验证。

### 4.3 R2：提示词"保持未提及项不变"约束 + adjust 响应 `diff` 字段

**决策：**
- **§5.2.2 系统提示词增加调整模式约束**：当 `feedback` 非空时，工作流进入调整模式，提示词约束"对于 feedback 未提及的方案项，必须保持与原方案一致（标题、内容、时间描述不变），仅修改 feedback 涉及的项；若 feedback 涉及偏好全局变化（如'改成低盐'），则应用于全部相关项"。这是把 §9.3.2 的"软提示词约束"升级为**显式提示词条款**，提升 LLM 遵守率。
- **§3.2.13/§3.2.14 响应体新增 `diff` 字段**：adjust 响应（仅 adjust，generate 不含）增加 `diff` 对象，描述本次调整相对原方案组的变化：
  - 类型轮廓：`diff: { changed_items: Array<{ plan_type, order_num, old_title, new_title, changed: boolean }>, unchanged_count: number, summary: string }`
  - 由 Express 端 `plan.js` 在写入新方案组后，对比旧方案组（已 is_active=0 但仍在表内）与新方案组的 `title`/`content` 生成（按 plan_type + order_num 对齐）。
  - 用途：前端展示"本次调整：修改了 2 项（晚餐、周末运动），其余 5 项保持不变"，建立用户对"只改一项"心智的信任，回应 Q1 的信任差。
- **§3.8 TypeScript 类型修订**：`AdjustResponse` 在 `PlanResponse` 基础上增加可选 `diff` 字段；`generate` 响应类型不含 `diff`。

**架构一致性**：`diff` 由 Express 端对比数据库内新旧方案组生成，**不引入额外 LLM 调用**，不破坏三层降级解析与行级权限约束。

### 4.4 R3：LifePlan.vue 前端确认弹窗

**决策（决策层，不涉及 DOM 细节）：**
- **生成前确认弹窗**：用户填写 health_info + preferences 后点击"生成方案"，弹出 SweetAlert2 确认框，预览解析后的 health_info（年龄/性别/身高/体重）+ preferences（饮食偏好/活动偏好）原文，按钮"确认生成 / 返回修改"。确认后才发 `POST /api/plan/generate`。此为 Q2 方案 C 的生成侧落地。
- **调整前结构化反馈弹窗**：用户点击"调整方案"，弹出 SweetAlert2 弹窗，内容包含：(a) 当前方案组概要（饮食4项+运动3项的标题列表，按 order_num 排序）；(b) 待调整项勾选区（checkbox 列出 7 个方案项，用户勾选要改的项）；(c) feedback 文本区（对勾选项的具体调整要求）。提交后前端将"勾选项 + feedback"组合为 feedback 文本（如"调整[晚餐]：减少碳水；调整[周末运动]：增加强度"）发送 `PUT /api/plan/adjust`。此为 Q2 方案 C 的调整侧落地，把纯自由文本 feedback 升级为"结构化勾选 + 文本补充"，降低 LLM 误判。
- **adjust 响应渲染**：收到含 `diff` 的响应后，前端先展示 diff 摘要（"修改了 N 项，M 项保持不变"）再渲染新方案，呼应 R2。

**影响章节**：§4.1.4 LifePlan.vue 组件树（新增弹窗结构）、§4.3 LifePlan.vue 流程图（Q[调整方案] 分支细化为"弹窗收集勾选+feedback → PUT /api/plan/adjust → 渲染 diff → 渲染新方案"）。

### 4.5 R4：`diabetes-assistant-agent` 新增 `adjust_plan` 工具（可选增强）

**决策：**
- **§5.2.5 工具表新增 `adjust_plan` 工具**：用途"基于用户对话式反馈调整当前活跃方案"，回调请求体模板 `{"tool_name":"adjust_plan","user_id":"{{user}}","feedback":"{{feedback}}","api_key":"..."}`，回调 URL 统一为 `POST /api/admin/execute`（与现有工具一致），Express 按 `tool_name=adjust_plan` 分发至 plan 路由的 adjust 处理逻辑（复用 §3.2.14 流程，从 user_id 推导当前活跃 plan_id）。
- **权限约束**：仅限调整当前 user_id 的本人活跃方案组，`validateRowLevelPermission` 强制 user_id 约束（与 query_life_plans 同级别）。
- **§5.2.5 系统提示词技能3 扩展**：技能3"方案生成"扩展为"方案生成与调整"，明确"当用户在对话中表达对当前方案的调整意图（如'晚餐碳水太多了''周末运动太轻松'）时，先在对话中澄清具体调整需求，确认后调用 adjust_plan 工具"。此为 Q1 真多轮解 + Q2 方案 D 的落地。
- **Agent 路径不返回 diff**：Agent 路径走对话流式输出，diff 由 Agent 在回复中自然语言转述（"已为您调整了晚餐和周末运动，其余 5 项保持不变"），不强制结构化 diff 字段（diff 是结构化页面路径的 UX 增强，对话路径用自然语言即可）。

**优先级说明**：R4 为"可选增强"——它为偏好对话式交互的用户提供真多轮调整能力，但不是 Q1/Q2 的主解（主解是 R1+R2+R3 的结构化路径修订）。若工期紧张，R4 可延后，不影响 R1+R2+R3 对 Q1/Q2 的回应。

### 4.6 R5：§5.5 新增前置验证任务

**决策：** 在 §5.5.1 前置验证需求表中新增一项验证任务，沿用 §5.5 既有的"验证目标/方法/标准/时机"四要素格式：

| 验证项 | 内容 |
|--------|------|
| **验证目标** | 确认 Dify 工作流 `life-plan-generator` 的开始节点支持新增 string 类型 `feedback` 输入变量，且 blocking 调用时 `inputs.feedback` 能被工作流正确接收并注入 LLM 节点上下文 |
| **验证方法** | 在 Dify 平台 `life-plan-generator` 工作流的开始节点新增 `feedback` 变量（string，选填），通过 `/api/dify/workflow/:id` 代理端点发送含 `inputs.feedback` 的测试请求，检查工作流日志中 LLM 节点是否收到 feedback 内容 |
| **验证标准** | (1) 工作流开始节点可成功添加 string 类型 `feedback` 变量；(2) blocking 调用响应中工作流正常执行未报变量缺失错误；(3) LLM 节点上下文含 feedback 值 |
| **验证时机** | R1 修订实施前，开发环境搭建阶段 |

**风险等级**：低（Dify 工作流开始节点支持任意数量输入变量是核心功能，非边缘能力），但按 §5.5 纪律仍显式列入验证。

### 4.7 R6：维持现状的显式决策记录

**决策：**
- **不将 `life-plan-generator` 转为 Chatflow**：§9.3 结论成立，Q1/Q2 不构成转 Chatflow 的实质性理由（前置澄清在前端解决，多轮调整在 Agent 路径解决，均无需 Chatflow 交互节点）。
- **不将工作流整体集成进 Agent**：§9.3.3 与本方案 §3.2 论证成立，集成破坏四项契约/模型。
- **维持"结构化页面路径 + 对话式 Agent 路径"双轨架构**：两条路径并存，结构化路径由 R1+R2+R3 修订增强，对话路径由 R4 修订补全。

---

## 5. 架构一致性自检

本方案所有修订对已确立架构约束的影响：

| 架构约束（已确立） | 本方案影响 | 说明 |
|-------------------|-----------|------|
| Express 代理层预查询数据注入 | 不突破 | R1-R5 均不改变 Express 预查询职责；R2 的 diff 由 Express 对比库内数据生成，非新增 LLM 调用 |
| Dify 工作流不自行查库 | 不突破 | R1 新增 `feedback` 输入变量仍由 Express 注入；工作流不查库 |
| 三层降级解析（JSON 优先 → 正则 → LLM 二次调用） | 不突破 | R1/R2 不改变解析策略；adjust 响应仍为结构化 JSON，沿用三层降级 |
| 行级权限约束（validateRowLevelPermission） | 不突破 | R4 `adjust_plan` 工具复用现有权限校验，user_id 强制为 operatorId |
| plan_id 方案组模型 + is_active 活跃标记 | 不突破（R1 扩展） | R1 路径 P1 新增 `preferences_snapshot` 列，不改变 plan_id/is_active 语义；adjust 仍是"旧组 is_active=0 + 新组 is_active=1"整体替换 |
| punch_in → life_plans 外键 | 不突破 | R1-R5 不改变打卡外键关联 |
| 前端结构化渲染（分组方案项 + 打卡按钮） | 不突破（R3 增强） | R3 在现有结构化渲染上叠加确认弹窗与 diff 展示，不改渲染骨架 |

**唯一显式突破**：R1 路径 P1 在 `life_plans` 表新增 `preferences_snapshot` 列（DDL 变更）。突破理由：精确复用原 preferences 是"只改一项、其他不变"心智的契约基础，无法通过现有字段推导。影响范围：§2.2 DDL、§2.5 数据字典、§2.1 ER 图需同步新增该列；历史已生成方案组的 `preferences_snapshot` 为 NULL，adjust 时降级为路径 P2（从用户档案/弹窗重新确认 preferences）。

---

## 6. 修订影响范围汇总

| 影响章节 | 修订内容 | 关联修订项 |
|---------|---------|-----------|
| §2.1 ER 图 | `life_plans` 实体新增 `preferences_snapshot` 字段 | R1 |
| §2.2 DDL | `life_plans` 表新增 `preferences_snapshot TEXT DEFAULT NULL` | R1 |
| §2.5 数据字典 | `life_plans` 表新增 `preferences_snapshot` 字段说明；历史数据 NULL 降级策略 | R1 |
| §3.2.13 | `PlanResponse` 类型说明（generate 响应不含 diff） | R2 |
| §3.2.14 | 处理流程修订为 `{health_info, preferences, feedback}` 三元组输入；响应新增 `diff` 字段；preferences 从 `preferences_snapshot` 复用 | R1, R2 |
| §3.6 映射表 | `feedback → inputs.feedback` 补充"仅 adjust 路径注入"说明 | R1 |
| §3.8 TypeScript 类型 | `AdjustResponse` 新增 `diff` 可选字段；`PlanResponse` 不含 diff | R2 |
| §4.1.4 LifePlan.vue | 新增生成前确认弹窗 + 调整前结构化反馈弹窗 + diff 摘要展示 | R3 |
| §4.3 LifePlan.vue 流程图 | Q[调整方案] 分支细化（弹窗收集勾选+feedback → adjust → 渲染 diff → 渲染新方案）；生成分支增加确认弹窗节点 | R3 |
| §5.2.2 life-plan-generator | 输入变量表新增 `feedback`(string, 选填)；系统提示词增加调整模式"保持未提及项不变"约束条款 | R1, R2 |
| §5.2.5 diabetes-assistant-agent | 工具表新增 `adjust_plan` 工具；技能3 扩展为"方案生成与调整" | R4 |
| §5.5.1 前置验证需求表 | 新增 `feedback` 输入变量接收验证任务 | R5 |
| §7.3.3 Express 端点分发 | `/api/admin/execute` 分发逻辑新增 `tool_name=adjust_plan` 路径，复用 plan 路由 adjust 处理 | R4 |

**不受影响章节**：§5.3 工作流节点编排（仍是线性/并行 DAG，不加交互节点）、§5.4 Agent 模式选择（仍 Function Calling）、§6.3.5 difyService.js 行为规格（callWorkflow blocking 模式不变）、§3.1 端点清单（不新增端点，R4 复用 `/api/admin/execute`）、§3.4 错误码枚举（不新增错误码）。

---

## 7. 待前置验证项汇总（按 §5.5 纪律）

| 编号 | 验证项 | 风险等级 | 阻塞修订 |
|------|--------|---------|---------|
| V1 | Dify 工作流开始节点支持新增 string 类型 `feedback` 变量并正常接收注入 | 低 | R1 |
| V2 | Dify 工作流 LLM 节点上下文能读取 `feedback` 变量值并据此区分生成/调整模式 | 低 | R1, R2 |
| V3 | R4 `adjust_plan` 工具回调能否复用 §5.5.1 已验证的 `{{user}}` 变量透传能力（与现有工具同机制，预期复用，但显式确认） | 低 | R4 |

> V1/V2 风险等级低（Dify 工作流输入变量是核心功能），V3 复用 §5.5.1 已验证机制。三者均按 §5.5 纪律在开发环境搭建阶段实测确认，不阻塞方案决策，仅阻塞对应修订项的实施。

---

## 8. 完成度自检

- **Q1 裁决**：已完成（§1，部分成立，引用 §3.2.14/§5.2.2/§3.6/§9.3）。
- **Q2 裁决**：已完成（§2，部分成立，分层选型含方案 A/B/C/D 决策与依据）。
- **Q3 裁决**：已完成（§3，判断不成立，引用 §5.2.5/§9.3.3）。
- **Dify 平台能力边界**：已区分 workflow/Chatflow/Agent 三类（§9.1.1 为据），新依赖项按 §5.5 纪律标注前置验证（§7）。
- **可落地修订**：已给出 R1-R6 六项修订决策（§4），含前置澄清节点落位（前端，§4.4）、life-plan-generator 是否改 Chatflow（不改，§4.7 R6）、adjust 机制 UX 改进（diff 字段 + 结构化反馈弹窗，§4.2-4.4）、对 3.2.13/3.2.14/3.1.5/4.x 的影响范围（§6）。
- **架构一致性**：已自检（§5），唯一突破（`preferences_snapshot` 列）已显式说明理由与影响。
- **决策明确、路径清晰、事实经过文档验证**：满足。
