# 计划审查报告（v2 r1）

## 审查结果
REJECTED

## 发现

### [一般] 缺失未知 agent_id 的错误处理规格

计划 R2 和 task_v2.md 均定义了 `POST /agent/:agent_id` 路由的流程为 "authMiddleware -> agent_id 查表 -> 校验 message 非空 -> 调用 proxyAgentSSE"，但均未指定当 `agent_id` 在 `AGENT_KEYS` 中不存在时的错误处理行为。

如果实现者忽略此分支，传递 `/api/dify/agent/nonexistent` 将导致 `apiKey` 为 `undefined`，进而向上游 Dify 发送 `Authorization: Bearer undefined` 请求，或更早地在 proxyAgentSSE 内部因 `apiKey` 为空而崩溃。无论哪种情况，调用方收到的错误信息都无法明确指示根因是无效的 agent_id。

计划应补充：agent_id 查表失败时返回 HTTP 400/404 及明确的错误消息（如 "未知的 Agent 标识"）。

### [一般] 缺失新模块的测试规格

R1 的计划明确包含测试规格（`test/backend/sseProxy.spec.js，47 passed / 0 failed`）。R2 产出约 100 行新代码（新建 `dify.js` 含 SSE 代理函数+路由+常量映射，修改 `assistant.js` 和 `index.js`），但计划中无任何测试相关描述。新模块涉及 SSE 流式代理、agent_id 查表、message 校验、mock 降级等多个分支，缺乏测试规格意味着后续验证环节缺少判定基准。

### [轻微] user 字段格式假设未标记为待验证

计划将 "Agent 类型 Dify 应用需要纯数字 user 值" 作为确定事实陈述，但 `requirement.md` 问题 B 明确标注 "{{user}} 透传假设未经 Dify 平台验证"。计划未提醒实现者或验证者此假设存在风险，若 Dify 平台实际行为与假设不符，需回退修改。

### [轻微] 计划全貌覆盖三轮但任务仅覆盖 R2

plan.md 包含 R1（PASSED）、R2（NEW）、R3（配置文档）三轮的概览与状态，但当前 task_v2.md 仅针对 R2。R1 标记为 PASSED 而 R3 悬而未决的状态可能让读者误解本次需一并处理 R3。

## 修改要求

1. **代理路由未匹配 agent_id 的错误处理**：在 plan.md R2 段落中补充错误分支——当 `AGENT_KEYS[agent_id]` 为 `undefined` 时，返回 HTTP 400 或 404，附带明确的错误消息指出 agent_id 无效。task_v2.md 的预期产出表中也应增加此错误处理逻辑的描述。

2. **补充测试规格**：在 plan.md 或 task_v2.md 中增加 R2 产出的测试策略描述，至少应覆盖：(a) 已知 agent_id 的正常 SSE 代理通路 (b) 未知 agent_id 的错误响应 (c) message 为空的校验错误 (d) Mock 降级模式。可以是单元测试文件路径或集成测试清单。

3. （建议）在计划中标注 user 格式假设为待 Dify 平台验证项，提醒验证环节关注。
