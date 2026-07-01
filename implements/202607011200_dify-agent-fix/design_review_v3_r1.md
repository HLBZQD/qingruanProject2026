# 设计审查报告（v3 r1）

## 审查结果
REJECTED

## 发现

### [严重] Workflow 类 Key 的消费者文件路径全部错误

设计为 `DIFY_RISK_WORKFLOW_KEY`、`DIFY_PLAN_WORKFLOW_KEY`、`DIFY_ARTICLE_WORKFLOW_KEY` 三个变量标注的消费者均为 `server/services/difyService.js → callWorkflowBlocking(...)`，但 `difyService.js` 中**从未引用任何一个环境变量**——`callWorkflowBlocking(apiKey, inputs, workflowType)` 的 `apiKey` 由调用方作为参数传入，函数定义文件不涉及环境变量读取。

**实际的 env var 使用位置：**
- `DIFY_RISK_WORKFLOW_KEY` → `server/routes/risk.js:59,78`
- `DIFY_PLAN_WORKFLOW_KEY` → `server/routes/plan.js:39,46,160,167`
- `DIFY_ARTICLE_WORKFLOW_KEY` → `server/routes/articles.js:119`

设计文件自身的"注释信息完整性校验清单"已将 `task_v3.md 5.1 节` 列为调用方文件的信息来源，而该节明确列出了 `server/routes/risk.js` 等路由文件。设计产出的注释内容与其自身引用的信息源矛盾，说明产生了幻觉或粗心错误。

**影响**：运维人员按注释指引到 `difyService.js` 查找环境变量引用时将一无所获，无法定位调用链路，注释的文档价值归零。

### [一般] DIFY_ADMIN_AGENT_KEY 的应用类型标注与任务规格和实际代码不一致

设计标注为"Agent 类型，Function Calling 模式"，但：
- `task_v3.md` 明确将其归类为"Chatbot/Chatflow 类型"（区别于 ASSISTANT 的 Agent 类型）
- 实际代码 `server/routes/admin.js:162-169` 调用的是 `proxyDifySSE()`（定义于 `server/services/sseProxy.js`），该函数发送 `/chat-messages` 请求时使用 `user-{id}` 格式且不处理 Function Calling 工具回调
- ASSISTANT 才走 `proxyAgentSSE()`（定义于 `server/routes/dify.js`），使用纯数字 `user` 格式，属于真正的 Agent 路径

**影响**：运维在 Dify 平台为 ADMIN 创建应用时，可能被误导选择 Agent 类型（带 Function Calling 配置），而实际代码走的是简单 Chatbot/Chatflow 通道。类型标注不准确会增加配置错误的概率。

## 修改要求

### 针对 [严重] — Workflow 消费者文件路径

**问题**：设计注释中 3 个 Workflow Key 的消费者指向了函数定义文件 `difyService.js`，而非实际读取环境变量的路由文件。

**为什么是问题**：`.env.example` 注释的核心价值是让运维快速定位"哪个功能用了这个 Key"。指向函数定义文件而非调用方文件，无法满足这一诉求。设计自己的完整性清单也引用了 `task_v3.md 5.1 节` 的正确来源却未落实。

**期望修正方向**：将消费者行改为实际的路由文件路径，与 `task_v3.md 5.1 节` 和 grep 验证结果一致：

| 环境变量 | 修正后的消费者 |
|---------|-------------|
| `DIFY_RISK_WORKFLOW_KEY` | `server/routes/risk.js → callWorkflowBlocking(process.env.DIFY_RISK_WORKFLOW_KEY, ..., 'risk')` |
| `DIFY_PLAN_WORKFLOW_KEY` | `server/routes/plan.js → callWorkflowBlocking(process.env.DIFY_PLAN_WORKFLOW_KEY, ..., 'plan')` |
| `DIFY_ARTICLE_WORKFLOW_KEY` | `server/routes/articles.js → callWorkflowBlocking(difyKey, ..., 'article')` |

注意：articles.js 中实际写法是先将 `process.env.DIFY_ARTICLE_WORKFLOW_KEY` 赋值给局部变量 `difyKey` 再传入，与 risk/plan 的直接传参略有差异，建议注释反映真实写法。

### 针对 [一般] — ADMIN 应用类型标注

**问题**：`DIFY_ADMIN_AGENT_KEY` 被标注为"Agent 类型，Function Calling 模式"，但实际代码路径为 `sseProxy.js` 的通用 Chatbot/Chatflow 通道。

**期望修正方向**：将 ADMIN 的应用类型标注改为"Chatbot/Chatflow 类型"以匹配任务规格（task_v3.md 中对其的分类）和实际代码行为，或至少删除"Function Calling 模式"这一不准确的描述。
