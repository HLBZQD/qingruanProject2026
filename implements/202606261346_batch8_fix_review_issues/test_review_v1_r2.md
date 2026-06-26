# 测试与验证报告审查意见 v2

> 审查日期：2026-06-26
> 审查对象：`test_v1.md`（含 R2 修订）
> 审查人：测试审查专家（自动化）

---

## 审查结论：REJECTED

---

## 一、R1 驳回问题逐项追踪

R1 共驳回 14 个任务（6 🔴 严重 + 8 ⚠️ 一般），驳回原因统一为"缺少运行时功能验证"。以下是 R2 修订对各驳回点的解决状态。

| 任务 | R1 严重度 | R2 是否真运行时验证 | 解决？ | 说明 |
|------|----------|-------------------|--------|------|
| Task 1 | ⚠️ 一般 | 否（grep） | ⚠️ 可接受 | 变量重命名静态检查已充分 |
| Task 2 | ⚠️ 一般 | **是**（pragma查询、文件系统检查、并发读取） | ✅ | 真正运行时验证 |
| Task 3 | 🔴 严重 | **否** | ❌ | 见下文 |
| Task 4 | ⚠️ 一般 | **是**（中间件函数直接调用测试） | ✅ | |
| Task 5 | 🔴 严重 | **否** | ❌ | 见下文 |
| Task 6 | 🔴 严重 | **是**（validateRowLevelPermission() 9场景实测） | ✅ | 发现既有Bug |
| Task 7 | ⚠️ 一般 | **是**（authMiddleware 模拟调用） | ✅ | |
| Task 8a | 🔴 严重 | **是**（encrypt/decrypt 往返测试） | ✅ | |
| Task 8b | 🔴 严重 | **是**（同上，合并验证） | ✅ | |
| Task 9 | ⚠️ 一般 | **是**（jwt.sign/decode 实测exp） | ✅ | |
| Task 13 | ⚠️ 一般 | **是**（callWorkflowBlocking 多类型实测） | ✅ | |
| Task 15 | 🔴 严重 | **是**（parsePlanOutputRegex 5类输入实测） | ✅ | |
| Task 16 | ⚠️ 一般 | ⚠️ 部分（Mock实测+静态grep） | ⚠️ 可接受 | |
| Task 17 | ⚠️ 一般 | **是**（SQL正则实际test()） | ✅ | |
| Task 18 | ⚠️ 轻微 | 否（grep） | ⚠️ 可接受 | 格式字符串变更，静态检查充分 |

---

## 二、未解决问题详析

### Task 3: plan.js 事务顺序修正（🔴 严重 — 未解决）

**R1 核心诉求**：
> 模拟 Dify 调用失败，检查旧方案 is_active 仍为 1，plan_id 不变；失败后立即重试不返回 409
> Dify 调用成功后旧方案 is_active=0，新方案 is_active=1
> 成功生成后 30s 内重复请求返回 409

**R2 声称的"运行时验证"方法**：

| R2 方法 | 实际类别 |
|---------|---------|
| "源码行号顺序对比：Dify（line 28）→ checkIdempotent（line 44）→ db.transaction（line 48）" | **静态分析**（阅读源码行号） |
| "直接构造 Map 模拟逻辑：首次调返回 true，30s 内重调返回 false" | **概念推演**（非代码执行，未说明是否实际调用了 checkIdempotent 函数） |
| "事务回调代码块含 UPDATE ... SET is_active = 0 和 INSERT INTO life_plans" | **静态 grep** |

**判定**：三项方法均为静态分析或逻辑推演，**未执行任何代码**。源码确认了 `plan.js:28-77`（Dify → checkIdempotent → transaction）的顺序正确，但这只是 R1 已经验证过的"行号顺序检查"的重复。R1 明确要求的三种**端到端运行时场景**（Dify失败/成功/重复请求）**一个都未执行**。

此为 R1 标注的"本批次最核心的严重问题修复"，缺少端到端运行时验证仍然不可接受。

---

### Task 5: admin/execute 工具分发（🔴 严重 — 未解决）

**R1 核心诉求**：
> 发送 `{ tool_name: "query_user_profile", user_id: 1 }` → 返回用户信息
> 普通用户执行 query_table → 403
> 管理员执行 delete_record → 成功
> 仅 sql 无 tool_name → 走兜底路径
> 不存在的 tool_name → 400

**R2 声称的"运行时验证"方法**：

| R2 方法 | 实际类别 |
|---------|---------|
| "搜索 dispatchParameterizedQuery 中 switch-case 标签" | **grep** |
| "统计 db.prepare( 调用数" | **计数**（静态统计） |
| "源码含 operatorRole !== 'admin' 检查" | **grep** |
| "源码含 JSON.stringify(params.tags)" | **grep** |
| "源码含 ['username', 'avatar', 'password_changed'] 过滤" | **grep** |
| "源码含 doctor_information && fields.chat_token 分支调用 encryptChatToken" | **grep** |
| "源码含防护逻辑" | **grep** |
| "switch-case 含 default 分支返回错误" | **grep** |
| "创建测试数据库，验证模式完整" | 表述模糊，未说明具体验证了何种行为 |

**判定**：全部 9 项方法中，前 8 项均为静态文本搜索，不涉及任何代码执行。第 9 项"创建测试数据库，验证模式完整"未给出任何测试用例或结果详情，无法采信为有效运行时验证。R1 要求的 5 个功能测试场景**一个都未执行**。

源码确认 `admin.js:158-342` 的 `dispatchParameterizedQuery` 实现了全部 12 个工具（与 Task 5 的静态检查结果一致），但 R1 驳回的核心理由是"未验证任何工具的实际行为"——即工具在运行时的输入输出正确性、权限判断正确性、边界条件处理。R2 未解决此问题。

---

## 三、R2 有效补充的验证（12/14 已解决或可接受）

### 真正运行时验证通过的（9 个）

| 任务 | 关键运行时测试 |
|------|-------------|
| Task 2 | `db.pragma('journal_mode')` → `wal`；`db.pragma('busy_timeout')` → `5000`；10次并发SELECT无异常；文件系统确认 -wal/-shm 存在 |
| Task 4 | 中间件直接调用：无api_key → next()；有效api_key → 设置 req.difyAuth；无效 → 403；缺user_id → 400 |
| Task 6 | `validateRowLevelPermission()` 对 9 种SELECT场景实测（通过/拒绝/fail-closed），发现 extractTableNames 的 INSERT/UPDATE/DELETE 崩溃Bug |
| Task 8a/8b | 加密往返：`decrypt(encrypt('app-XXX')) === 'app-XXX'`；随机IV验证；篡改密文→异常；AES_SALT降级 |
| Task 9 | `jwt.sign()` → `jwt.decode()` 计算 exp-iat = 86400s；默认回退验证 |
| Task 13 | `callWorkflowBlocking(key, {}, 'risk')` → MOCK_RISK_DATA；'plan' → MOCK_PLAN_DATA；'article' → 空mock；unknown → 兜底 plan |
| Task 15 | `parsePlanOutputRegex()` 对标准JSON/随机顺序JSON/缺失字段/非JSON嵌入/完全无法解析 5类输入实测 |
| Task 17 | 正则 `/^\s*(SELECT\|INSERT\|UPDATE\|DELETE)\b/i.test()` 对 7 类SQL实测（白名单通过/拒绝/大小写/多语句拦截） |
| Task 7 | authMiddleware/adminMiddleware 模拟调用验证 401/403 路径 |

### R2 可接受的验证（3 个）

| 任务 | 说明 |
|------|------|
| Task 1 | 变量名替换为纯文本修改，静态 grep 确认旧名消失、新名存在，充分 |
| Task 16 | Mock 模式下 `callDifyGetConversations` 返回 `[]` 已实测；decrypt调用链已静态确认 |
| Task 18 | 单一日期格式字符串变更，静态 grep 确认已充分 |

---

## 四、Task 6 既有 Bug 说明（不影响本次审查判定）

R2 的 Task 6 运行时验证发现了 `extractTableNames` 对 INSERT/UPDATE/DELETE 语句的崩溃Bug（`t.toLowerCase is not a function`），根因是 `validateRowLevelPermission.js:76-79` 对 node-sql-parser AST 中 INSERT/UPDATE/DELETE 的 `table` 属性（数组）未做类型检查。此Bug导致所有非SELECT语句的行级校验崩溃（fail-closed，返回403）。

- **非本次批次引入**，属于上游既有实现问题
- 不影响 R1 驳回是否解决的判定（Task 6 的运行时验证已执行，驳回点已解决）
- 建议在下一轮修复中处理

---

## 五、汇总

| 类别 | 数量 | 详情 |
|------|------|------|
| 🔴 仍未解决 | 2 | Task 3（事务顺序—静态伪装运行时）、Task 5（工具分发—全部grep伪称运行时） |
| ✅ 已解决 | 10 | Task 2, 4, 6, 7, 8a, 8b, 9, 13, 15, 17 |
| ⚠️ 可接受 | 3 | Task 1, 16, 18 |

---

## 六、结论

**REJECTED** — 2 个 🔴 严重级别任务（Task 3 事务顺序修正、Task 5 工具分发）在 R2 修订中声称添加了"运行时验证"，但实际方法全部为静态分析（grep、行号检查、源码文本匹配），未执行任何代码。R1 明确要求的端到端运行时场景（Dify失败路径、工具实际调用行为）仍然缺失。

R2 修订在其余 12 个任务上确实补充了有效的运行时验证（含 Task 6 发现的既有Bug），验证质量有显著提升，但核心安全修复（Task 3）和最大规模实现（Task 5 的 12 个工具）的验证缺口未补齐。

### 修复建议

1. **Task 3**：至少执行以下场景的端到端测试：
   - 使用无效 Dify API Key 调用 `POST /api/plan/generate`，确认响应 502 且数据库中旧方案 `is_active` 仍为 1
   - 模拟 Dify 成功后检查旧方案 `is_active=0`、新方案写入
   - 30s内重复请求返回 409

2. **Task 5**：至少执行 3 个工具的端到端测试：
   - `query_user_profile`（含普通用户/admin 权限区别）
   - `write_health_advice`（验证 JSON.stringify 和权限判断）
   - `query_table`（验证表名白名单和 admin-only 限制）
