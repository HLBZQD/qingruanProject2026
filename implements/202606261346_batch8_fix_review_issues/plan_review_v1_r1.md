# 计划审查报告 v1 R1

## 审查结论
**REJECTED**

## 发现

#### [严重] Task 6 (S7) — 行级权限校验方案错误，应采用 AST 解析而非正则匹配
- 位置：`task_v1.md`: Task 6
- 描述：Task 6 描述 `validateRowLevelPermission(sql, operatorId)` 的实现步骤为"解析 SQL 的 WHERE 子句…检查是否强制包含 user_id = ? 约束"，暗示用正则匹配 SQL 文本。设计文档 7.3.4 节明确要求使用 `node-sql-parser` AST 解析方案："采用 AST 解析方案（非正则匹配），杜绝 SQL 注入与越权读写"。正则方案无法可靠处理子查询、别名、JOIN、嵌套条件等复杂形态。同时，设计文档定义了完整的表分类校验规则（用户私有表、公共只读表、审计日志表、禁止访问表），Task 未提及这些分类，仅模糊地说"强制包含 user_id 约束"，严重不完整。
- 建议：重写 Task 6，明确要求：(1) 引入 `node-sql-parser` 依赖；(2) 实现 AST-based `validateRowLevelPermission` 函数；(3) 按设计文档 7.3.4 节定义四类表的校验规则。

#### [严重] Task 5 (S6) — tool_name 映射表严重不完整，仅列出 4 个工具
- 位置：`task_v1.md`: Task 5
- 描述：Task 5 仅列出 4 个 `tool_name` 映射（`query_user_profile`、`query_risk_info`、`query_life_plans`、`query_punch_records`），并说"等（按设计文档 5.2.5/5.2.6 节完整定义）"将查表责任推给 Coder。但设计文档 7.3.3 节 `dispatchParameterizedQuery` 函数实际定义了 **13 个**工具：`query_user_profile`、`query_risk_history`、`query_punch_records`、`query_life_plans`、`query_health_advice`、`write_health_advice`、`update_user_profile`（以上 diabetes-assistant-agent）、`query_table`、`insert_record`、`update_record`、`delete_record`、`get_table_schema`（以上 admin-manager-agent），加上 `query_article_collections`。每个工具都有不同的角色校验逻辑，admin 用户的专用工具普通用户无权调用。Task 当前描述会导致 Coder 遗漏 9 个工具和关键的角色权限分支。
- 建议：在 Task 5 中完整枚举所有 13 个 tool_name、对应的 SQL 模板、参数绑定、角色校验逻辑。或拆分为 Task 5a（用户端工具）和 Task 5b（管理员端工具）。

#### [严重] Task 8 (S8) — 缺少加密端实现任务，解密无法独立验证
- 位置：`task_v1.md`: Task 8
- 描述：Task 8 实现步骤最后一条写"需同步实现加密端（管理接口写入 doctor_information.chat_token 时的加密逻辑）"，但整个 task_v1 没有任何任务负责加密端的实现。chat_token 的加密发生在 `doctor_information` 写入时（如管理接口创建/编辑医生），若加密端缺失，解密端无法正确验证。此问题在 plan.md 中也被标注为"风险：中等。需同步实现写入时的加密逻辑"，但未转化为具体任务。
- 建议：新增一个任务（如 Task 8b）实现 `encryptChatToken(plainToken)` 函数，并明确写入端（管理接口创建/编辑医生的路由处理器）在哪里调用该加密函数。或者明确标注此任务依赖管理端 CRUD 接口的实现（可能不在本批次范围），并说明当前批次仅实现解密端、加密端留待后续。

#### [严重] Task 3 (S9) — 事务顺序修正步骤不完整，plan_id 生成未同步后移
- 位置：`task_v1.md`: Task 3
- 描述：当前 plan.js:32-45 的事务中包含了两个操作：(a) deactivate 旧方案，(b) `SELECT MAX(plan_id)+1` 生成新 plan_id。Task 3 仅提及将 deactivate 后移，但未说明 plan_id 生成也必须后移至 Dify 调用成功之后。此外，`checkIdempotent()` 的放置存在歧义：实现步骤说"确保 checkIdempotent() 仅在最终成功路径上生效（或保留在入口处防止重复提交，但需评估失败后 30s 锁的影响）"，但验证步骤又说"checkIdempotent() 行为不变（30秒冷却仍生效）"——步骤与验证互相矛盾。若保留在入口处，Dify 调用失败后用户在 30s 内无法重试。
- 建议：(1) 明确 plan_id 生成逻辑与 deactivate 一起后移；(2) 明确 checkIdempotent 的最终位置（推荐后移至 Dify 成功后、事务内）；(3) 消除步骤与验证的矛盾。

#### [一般] Task 10 (S3) — 引用计数与执行顺序冲突，新代码引用遗漏风险
- 位置：`task_v1.md`: Task 10; `plan.md`: 第91行
- 描述：Task 10 的 43 处引用计数基于当前代码统计（经 grep 验证确实为 43 处）。但 plan.md 要求 Task 10 在所有其他任务后执行（"波及面广，避免与其他任务冲突"），而 Tasks C4-C8 在 admin.js、chat.js 等文件中新增代码时也会引用 `req.user.id`，导致最终引用数超过 43 处。Task 10 的验证步骤 `rg "req.user\.id\b"` 可捕获这些新增引用，但任务描述中的 43 处计数会误导执行者。更严重的是，Task 4 (difyAuth) 设置 `req.difyAuth = { userId: ... }`（camelCase），而计划说改 `req.user = { user_id, role }`（snake_case），两者命名风格不一致，可能导致代码可读性混乱。
- 建议：(1) 在 Task 10 说明中注明"实际引用数会随 P2 任务实现而增长"；(2) 统一 `difyAuth` 和 `user` 对象的字段命名风格。

#### [一般] Task 16 (G6) — 缺少对 Task 8 的形式依赖声明
- 位置：`task_v1.md`: Task 16
- 描述：Task 16 步骤提到修改 `chat.js` 会话列表时需调用 `callDifyGetConversations(row.chat_token, ...)`（"注意解密后的 token"），但 chat_token 解密由 Task 8 实现。Task 16 的"依赖"字段标注为"无（独立功能）"，但 chat.js 的 conversations 端点需要先完成 Task 8 的 `decryptChatToken` 函数。plan.md 的依赖图中 Task 16 列为独立，未体现与 Task 8 的隐性依赖。
- 建议：Task 16 依赖字段更新为"Task 8（chat_token 解密函数）"。

#### [轻微] 需求文档与任务清单的问题计数不一致
- 位置：`requirement.md`: 第3行 vs `task_v1.md`: 第3行
- 描述：requirement.md 标题宣称"18 个问题（9 严重 + 9 一般）"，但实际列出了 9 严重 (S1-S9) + 10 一般 (G1-G10) = 19 个问题，且漏列了 plan.js/risk.js API Key 命名不匹配这个 P0 运行时缺陷。plan.md 和 task_v1.md 正确识别了 19 个问题（10 严重 + 9 一般），将 API Key 不匹配作为独立严重问题处理。此差异不会导致功能遗漏（plan/task 已覆盖），但会造成审查追溯混乱。
- 建议：更新 requirement.md 的标题和计数以反映实际 19 个问题。或注明"问题 19（API Key 不匹配）由计划审查阶段发现并补充"。

#### [轻微] Task 11 (S2/G) — 实际为验证任务但列为"一般"修复
- 位置：`task_v1.md`: Task 11
- 描述：plan.md 步骤 B3 明确说"代码与 .env 已自洽，本任务实际仅需确认一致性"，即无需修改代码。但 task_v1.md 将其列为正式修复任务。经确认：`database.js` 使用 `DB_PATH`，`.env` 定义为 `DB_PATH`；`difyService.js`/`sseProxy.js` 使用 `DIFY_API_BASE`，`.env` 定义为 `DIFY_API_BASE`——代码与配置完全自洽。Task 11 应为验证任务（标注为 PASS/无需修复），而非有实现步骤的任务。
- 建议：将 Task 11 明确标记为"验证确认"任务，步骤改为确认一致性，无需修改代码。

#### [轻微] Task 18 (G8) — 日期格式统一应优先检查是否存在共用工具函数
- 位置：`task_v1.md`: Task 18
- 描述：Task 18 的方案 A 是直接修改 articles.js:133 的 strftime 格式，方案 B 是全库统一。但任务未要求先检查项目中是否已有日期格式化工具函数（如 `utils/` 下），无法判断创建 `nowISO()` 或 `nowStr()` 是否必要。
- 建议：在实现步骤开始前增加一步：检查 `server/utils/` 下是否存在日期格式化函数。

## 统计

| 严重 | 一般 | 轻微 |
|------|------|------|
| 4 | 2 | 3 |

**总计：9 个发现，其中严重问题 4 个。**
