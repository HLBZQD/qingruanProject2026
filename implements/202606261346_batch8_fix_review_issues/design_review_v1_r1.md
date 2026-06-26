# 设计审查报告 v1 r1

> 审查对象：`detail_v1.md`（批次 8 详细实现规格 v1）
> 审查日期：2026-06-26
> 对照基准：`task_v1.md`、`requirement.md`、`2_detailed_design_v3.md`、`server/` 源码

---

## 审查结论：REJECTED

**严重问题 1 个，一般问题 6 个。**

---

## 严重问题

### S1：Task 19 upload.js 导出模式歧义 —— 可能导致路由挂载失败

**位置**：detail_v1.md 第 1856-1879 行（Task 19 目标状态）

**问题**：detail 给出两种 `module.exports` 方案但未选定最终方案：

- **方案一**：`module.exports = { router, ensureUploadDir }`
- **方案二**：`router.ensureUploadDir = ensureUploadDir; module.exports = router`

若 Coder 选择方案一，则 `server/routes/index.js:19` 中 `router.use('/upload', require('./upload'))` 将收到一个 `{ router, ensureUploadDir }` 对象而非 Express Router 实例，导致 `router.use()` 参数类型错误，**服务器启动时 Express 抛出异常，`/api/upload/avatar` 路由完全不可用**。

**修复建议**：删除方案一，明确采用方案二（`router.ensureUploadDir = ensureUploadDir; module.exports = router`），并删除 server.js 中对应的方案一兼容代码（`const { router: uploadRouter } = require(...)` 部分）。

---

## 一般问题

### G1：Task 4 difyAuth 中间件链顺序与设计文档不一致

**位置**：detail_v1.md 第 448-471 行

**问题**：detail 最终中间件链为 `difyAuthMiddleware, optionalAuth`，但设计文档 7.3.1 节（第 5688 行）和 7.3.3 节（第 5772 行）明确挂载顺序为 `optionalAuth, difyAuthMiddleware`。两种顺序均可正确工作，但与设计文档指定的顺序不同。若后续维护者参照设计文档而非 detail 来理解中间件执行序，可能产生误解。

**修复建议**：将中间件链顺序对齐设计文档：`router.post('/execute', optionalAuth, difyAuthMiddleware, (req, res) => { ... })`。

---

### G2：Task 6 validateRowLevelPermission.js 的 `insertContainsUserId` 函数包含死代码

**位置**：detail_v1.md 第 983-1011 行（目标代码 `insertContainsUserId` 函数）

**问题**：函数中第 990-991 行存在一段无效循环：
```js
for (let i = 0; i < Math.min(cols.length, 1); i++) {
  const colEntry = Array.isArray(cols) ? cols : [{ expr: cols }];
}
```
该循环声明的 `colEntry` 变量从未被使用，第 993 行之后重新声明 `colIndex`、`colList` 等变量从头开始逻辑。虽然函数整体仍能正确工作，但死代码影响可读性，Coder 可能误复制该段。

**修复建议**：删除第 989-991 行的死代码块（从 `const cols = ...` 的冗余声明到无效 for 循环），仅保留从 `let colIndex = -1;` 开始的正确实现。

---

### G3：Task 10 "最后执行" 约束与附录执行顺序存在描述矛盾

**位置**：detail_v1.md Task 10 关键约束（第 1389 行） vs 附录 B 推荐执行顺序（第 1918-1929 行）

**问题**：Task 10 关键约束写"此任务必须在所有其他任务完成后最后执行"，但附录 B 将 Task 10 放在第 2 批（P1），在第 3 批（Task 4-7）和第 4 批（Task 14-18）之前执行。按附录顺序，Task 10 完成后仍有 11 个任务待执行，不符合"所有其他任务完成后"的描述。

**影响**：若 Coder 严格遵守 Task 10 的"最后执行"约束（先做第 1、3、4 批，最后做第 2 批），则第 3 批中 Task 5（admin.js 重写）的 `req.user.user_id` 在编码时不存在（因中间件尚未完成字段重命名），导致 `operatorId` 为 `undefined`。按附录顺序执行则无此问题。

**修复建议**：将 Task 10 的关键约束修正为"此任务应在 Task 3-5 之前完成，确保新增代码可直接使用 `req.user.user_id`"。或将 Task 10 从第 2 批移至第 3 批最前（Task 4 之前），保持语义一致。

---

### G4：`.env` / `.env.example` 文件路径未明确

**位置**：detail_v1.md 中多处引用 `.env` 和 `.env.example`（如 Task 1、Task 8a、Task 9 等）

**问题**：detail 中所有对 `.env` 的引用均未给出完整路径。实际文件位于项目根目录 `/home/derpyIsTheBest/qingruanProject2026/.env`，而非 `server/.env`。detail 中 `.env:6-7` 的行号引用基于根目录文件是正确的，但缺少路径说明，Coder 可能误在 `server/` 子目录下创建新 `.env`。

**修复建议**：在首次引用时注明完整路径（如 `项目根目录下的 .env`），或统一使用 `{{项目根目录}}/.env` 占位符。

---

### G5：Task 10 行号映射表基于未修改代码 —— 执行时将失效

**位置**：detail_v1.md 第 1328-1382 行（Task 10 步骤 B 具体替换映射表）

**问题**：映射表给出了每个 `req.user.id` 引用的精确行号（如 `admin.js:60`、`articles.js` 11处），但这些行号基于当前未修改的源码。按附录 B 执行顺序，Task 10 之前 Task 1-9 已完成，其中 Task 1（plan.js/risk.js 修改）、Task 3（plan.js 大幅重构）、Task 4-7（admin.js 完全重写、chat.js/assistant.js 修改）等任务都会改变对应文件的行号，使得基于行号的替换指引失去参考意义。

**缓解**：detail 在 Task 10 验证步骤中已注明"验证时必须以 `rg "req\.user\.id\b" server/` 搜索结果为准"，此缓解措施有效。但行号表仍可能误导 Coder 做无效查找。

**修复建议**：保留行号表作为"修改前"快照参考，但在表上方显式标注"**以下行号为修改前快照，执行时行号已变化，请以 `rg "req\.user\.id\b"` 搜索结果为准进行替换**"。

---

### G6：Task 4 difyAuth 中间件链方案经历三次修正 —— 推理过程冗长

**位置**：detail_v1.md 第 448-471 行

**问题**：detail 对 `/execute` 中间件链描述了三次迭代：
1. `authMiddleware, difyAuthMiddleware`（第 451 行，最初方案）
2. `difyAuthMiddleware, authMiddleware`（第 462 行，发现 authMiddleware 会阻断 Dify 回调）
3. `difyAuthMiddleware, optionalAuth`（第 470 行，最终方案）

Coder 需要跟随这三步推理才能找到最终方案。若 Coder 中途阅读到步骤 1 或 2 就开始编码，会使用错误的中间件链。

**修复建议**：删除步骤 1 和 2 的废弃方案，直接给出最终方案（步骤 3）。若需保留设计决策说明，将其压缩为一段注释。

---

## 已验证通过项

| 序号 | 维度 | 核查项 | 结果 |
|------|------|--------|------|
| 1 | 一致性 | Task 1 API Key 变量名 `DIFY_PLAN_WORKFLOW_KEY` / `DIFY_RISK_WORKFLOW_KEY` 与 `.env` 一致 | ✓ |
| 2 | 一致性 | Task 5 `dispatchParameterizedQuery` 12 个工具实现与设计文档 7.3.3 节一致 | ✓ |
| 3 | 一致性 | Task 8a 加密方案（AES-256-GCM, scryptSync, salt）与设计文档 7.8 节一致 | ✓ |
| 4 | 一致性 | Task 9 JWT 有效期命名 `process.env.JWT_EXPIRES_IN \|\| '24h'` 符合设计文档 | ✓ |
| 5 | 完整性 | 19 个任务全部在 detail 中有对应章节，task_v1 与 detail_v1 一一映射 | ✓ |
| 6 | 完整性 | 新建文件（difyAuth.js、encryption.js、validateRowLevelPermission.js）均给出完整代码 | ✓ |
| 7 | 可行性 | `planParser.js` 新正则实现可直接编码（逐字段匹配逻辑明确） | ✓ |
| 8 | 可行性 | `difyService.js` workflowType 参数化对现有调用方兼容（不传时降级） | ✓ |
| 9 | 影响面 | Task 10 影响面清单覆盖了全部 11 个使用 `req.user.id` 的路由文件 | ✓ |
| 10 | 约束标注 | Task 2 database.js pragma 顺序（foreign_keys → journal_mode → busy_timeout）与设计文档 6.4 节一致 | ✓ |
| 11 | 约束标注 | Task 7 `/api/admin/chat` 使用 `authMiddleware + adminMiddleware`，与设计文档 3.1.10 节"是+admin"认证要求一致 | ✓ |
| 12 | 约束标注 | Task 3 plan.js 事务修正逻辑（Dify 成功后 deactivate → 生成 plan_id → INSERT）正确 | ✓ |

---

## 修复优先级

1. **立即修复**（S1）：选定 upload.js 导出方案二，删除方案一。
2. **建议修复**（G1-G6）：按本节建议逐项修正，其中 G3 对执行顺序有实际影响，建议优先处理。

---

## 统计

- 严重问题：1
- 一般问题：6
- 合格项：12
- 总核查项：19
