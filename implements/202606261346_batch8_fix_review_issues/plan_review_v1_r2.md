# 计划审查报告 v1 R2

## 审查结论
**APPROVED**

## 审查概述

本报告针对 `plan.md` 和 `task_v1.md` 的修订版进行二次审查，逐一核验 R1 驳回的 9 个问题是否已解决，并从"19 个问题全覆盖、依赖合理、步骤可执行"三个维度进行综合评估。

---

## 1. R1 驳回问题逐项核验

### [严重] Task 6 (S7) — 行级权限校验方案错误 → **已解决**
- R1 要求：引入 `node-sql-parser`，实现 AST 方案，定义四类表校验规则
- 修订：plan.md 步骤 C3 和 task_v1.md Task 6 已完全重写。明确要求安装 `node-sql-parser`，实现 AST-based `validateRowLevelPermission`，定义了 `USER_SCOPED_TABLES`/`PUBLIC_READONLY_TABLES`/`AUDIT_LOG_TABLES`/`FORBIDDEN_TABLES` 四类表及其逐表校验规则。包含辅助函数 `extractTableNames`/`containsUserIdConstraint`/`insertContainsUserId` 的实现指引。验证步骤覆盖禁止表、无约束拒绝、JOIN 查询、admin 跳过、语法错误等场景。

### [严重] Task 5 (S6) — tool_name 映射表严重不完整 → **已解决**
- R1 要求：完整枚举所有 tool_name、SQL 模板、角色校验
- 修订：plan.md 步骤 C2 已扩展为 12 个工具的完整枚举：diabetes-assistant-agent 7 个（`query_user_profile`/`query_risk_history`/`query_punch_records`/`query_life_plans`/`query_health_advice`/`write_health_advice`/`update_user_profile`）和 admin-manager-agent 5 个（`query_table`/`insert_record`/`update_record`/`delete_record`/`get_table_schema`），含 SQL 模板和角色校验逻辑。task_v1.md Task 5 逐工具展开实现步骤。`query_article_collections` 标注为可选/后续补充，与设计文档 7.3.3 节一致。

### [严重] Task 8 (S8) — 缺少加密端实现 → **已解决**
- R1 要求：新增加密端任务
- 修订：已拆分为 Task 8a（C5a，加密端）和 Task 8b（C5b，解密端）。C5a 新建 `server/utils/encryption.js` 实现 `encryptChatToken()`，C5b 实现 `decryptChatToken()` 并集成到 `chat.js`。依赖图已反映 S8a→S8b、S8a→G6 的依赖关系。

### [严重] Task 3 (S9) — 事务修正不完整 → **已解决**
- R1 要求：(1) plan_id 同步后移，(2) checkIdempotent 位置明确，(3) 消除步骤与验证矛盾
- 修订：plan.md 步骤 A2 已明确：plan_id 生成与 deactivate 一并后移至 Dify 调用成功后；checkIdempotent() 后移至 Dify 成功→事务前（Dify 失败不注册冷却锁）；验证步骤已对齐。task_v1.md Task 3 已更新。

### [一般] Task 10 (S3) — 引用计数与执行顺序冲突 → **已解决**
- R1 要求：(1) 注明引用数会增长，(2) 统一命名风格
- 修订：(1) 已注明"当前代码库有 43 处引用，但随着 P2 任务实现引用数会增长，验证时以 `rg` 搜索结果为准"。(2) 已添加命名风格说明：`difyAuth` 使用 `userId`（camelCase）为其独立认证上下文字段，`user` 对象使用 `user_id`（snake_case），两者分属不同语义空间，不建议强行统一。

### [一般] Task 16 (G6) — 缺少依赖声明 → **已解决**
- R1 要求：Task 16 依赖字段更新
- 修订：plan.md 依赖图已添加 G6→S8a 的依赖边。task_v1.md Task 16 依赖字段已更新为"Task 8b（chat_token 解密函数）"。

### [轻微] 问题计数不一致 → **已接受**
- R1 建议更新 requirement.md 标题/计数
- 修订说明：确认为 requirement.md 的问题（非 plan.md/task_v1.md 修订范围），不影响计划实现。

### [轻微] Task 11 (S2) — 验证任务标记 → **已解决**
- R1 要求：明确标记为"验证确认"任务
- 修订：plan.md 步骤 B3 和 task_v1.md Task 11 已标注为"验证确认"任务，步骤改为确认一致性，无需修改代码。

### [轻微] Task 18 (G8) — 预检查缺失 → **已解决**
- R1 要求：增加预检查步骤
- 修订：plan.md 步骤 D5 和 task_v1.md Task 18 均已增加预检查步骤：先检查 `server/utils/` 下是否存在日期格式化工具函数。

---

## 2. 问题覆盖检查（19 个问题）

| 编号 | 问题摘要 | 对应任务 | 检查 |
|------|---------|---------|------|
| S1 | database.js WAL + busy_timeout | Task 2 | ✓ |
| S2 | 环境变量名统一 | Task 11（验证） | ✓ |
| S3 | JWT Payload 字段名修正 | Task 10 | ✓ |
| S4 | 新增 POST /api/admin/chat | Task 7 | ✓ |
| S5 | 新增 difyAuth.js | Task 4 | ✓ |
| S6 | tool_name 参数化工具分发 | Task 5 | ✓ |
| S7 | 行级权限校验（AST） | Task 6 | ✓ |
| S8 | chat_token AES-256-GCM 加解密 | Task 8a + 8b | ✓ |
| S9 | plan.js 事务顺序修正 | Task 3 | ✓ |
| 问题19 | API Key 命名不匹配 | Task 1 | ✓ |
| G1 | JWT 有效期 24h | Task 9 | ✓ |
| G2 | 模块顶层副作用 | Task 12 | ✓ |
| G3 | Mock 模式检测 | Task 13 | ✓ |
| G4 | 未使用导入 | Task 14 | ✓ |
| G5 | 正则顺序依赖 | Task 15 | ✓ |
| G6 | 对话历史会话列表 | Task 16 | ✓ |
| G7 | SQL 关键字检查 | Task 17 | ✓ |
| G8 | 日期格式统一 | Task 18 | ✓ |
| G9 | mkdirSync 移入函数 | Task 19 | ✓ |
| G10 | 路由挂载检查 | 已验证通过 | ✓ |

**结论：19 个问题全部覆盖，无遗漏。**

---

## 3. 依赖关系与执行顺序检查

### 3.1 关键依赖链

```
Task 1 (API Key) → Task 3 (事务)          ← P0 运行时修复必须先执行
Task 4 (difyAuth) → Task 5 (工具分发)
Task 4 (difyAuth) → Task 6 (行级权限)      ← difyAuth 认证上下文为前置条件
Task 8a (加密) → Task 8b (解密)            ← 密文格式定义先行
Task 8a (加密) → Task 16 (会话列表)        ← chat.js 需要解密函数
Task 8b (解密) → Task 16 (会话列表)        ← 显式依赖声明
```

### 3.2 批次编排合理性

| 阶段 | 内容 | 合理性 |
|------|------|--------|
| P0 | 运行时缺陷修复（Task 1→2→3） | ✓ 最高优先级，先修复再扩展 |
| P1 | 配置与约定统一（Task 9→10→11） | ✓ 约定先行，避免 P2 代码产生新不一致 |
| P2 | 架构改进（Task 4→5/6→8a→8b→7→12→16→19） | ✓ 按依赖序，独立任务可并行 |
| P3 | 代码质量（Task 13→14→15→17→18） | ✓ 低风险，最后批次清洁 |

### 3.3 顺序建议

执行顺序中 Task 10 置于最后是合理的——P2 阶段新增代码（Task 4-7）仍可使用当前约定 `req.user.id`，最后统一替换，配合 `rg` 全局扫描确保零残留。

---

## 4. 任务步骤可执行性检查

### 4.1 指令粒度

所有 20 个任务均有：具体的影响文件、明确的代码修改指令、可操作的验证步骤（含 curl/数据库查询/正则搜索等具体命令）。

### 4.2 验证有效性

| 验证方式 | 涉及任务 | 评估 |
|---------|---------|------|
| `rg` 全局搜索零残留 | Task 1, Task 10 | ✓ 覆盖遗漏风险 |
| 数据库状态检查（is_active, plan_id） | Task 3 | ✓ 事务正确性可观测 |
| curl + SSE 流验证 | Task 4, Task 5, Task 7 | ✓ 端到端可测 |
| 异常注入（无效 Key、语法错误） | Task 1, Task 3, Task 6 | ✓ 覆盖失败路径 |
| WAL 辅助文件检查 | Task 2 | ✓ 配置生效可证 |

---

## 5. 新发现（本次审查新增）

### 轻微问题

#### [轻微] Task 6 (C3) — admin_logs 表的 operator_id 约束弱于设计文档
- 位置：plan.md 步骤 C3 表分类、task_v1.md Task 6
- 描述：设计文档 7.3.4 节定义审计日志表的校验规则为"仅允许 SELECT 且 WHERE 必须显式包含 `operator_id = operatorId`"。计划中仅定义"仅允许 SELECT（禁止增删改）"，未包含 `operator_id = operatorId` 的 WHERE 约束。由于 admin 角色在调用前即跳过行级校验，此差异仅影响非 admin 用户通过 execute_SQL 兜底路径查询 admin_logs 的场景——该场景在正常使用中极少出现，且 admin_logs 禁止增删改的核心约束已保留。
- 建议：可保持当前实现。若严格对齐设计文档，可在 `validateRowLevelPermission` 的审计日志表校验分支中补充 `operator_id = operatorId` 的 WHERE 约束检查。

#### [轻微] Task 4 — 中间件执行顺序与设计文档略有差异
- 位置：plan.md 步骤 C1、task_v1.md Task 4
- 描述：计划将 admin/execute 中间件链设为 `difyAuthMiddleware, optionalAuth, handler`，设计文档 7.3.3 节为 `optionalAuth, difyAuthMiddleware, handler`。两种顺序均可实现双认证"或"逻辑——difyAuth 先检测 api_key 再放行给 optionalAuth 处理 JWT，与 design doc 的 optionalAuth 先尝试 JWT 再交给 difyAuth 检测 api_key，最终 handler 均通过检查两个上下文是否存在来区分认证路径，功能等价。
- 建议：可保持当前设计。若追求与设计文档完全一致，调整为 `optionalAuth, difyAuthMiddleware` 顺序。

---

## 6. 统计

| 严重 | 一般 | 轻微 |
|------|------|------|
| 0 | 0 | 2 |

**R1 驳回的 9 个问题（4 严重 + 2 一般 + 3 轻微）全部已解决。本次审查无新增严重或一般问题。**
