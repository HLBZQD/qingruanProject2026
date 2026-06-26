# 设计审查报告 v1 r2

> 审查对象：`detail_v1.md`（批次 8 详细实现规格 v1，含 R2 修订）
> 审查日期：2026-06-26
> 对照基准：`design_review_v1_r1.md`、`task_v1.md`、`2_detailed_design_v3.md`、`server/` 源码

---

## 审查结论：APPROVED

**0 严重问题，1 一般问题。**

---

## 上一轮问题核查（R1 7 项已全部解决）

| 编号 | 问题 | 修订章节 | 状态 |
|------|------|---------|------|
| S1 | Task 19 upload.js 导出方案歧义 | R2-S1 | ✓ 已选定方案二，删除方案一，并附禁止使用方案一的注释说明 |
| G1 | Task 4 difyAuth 中间件链顺序与设计文档不一致 | R2-G1 | ✓ 改为 `optionalAuth, difyAuthMiddleware`，与设计文档 7.3.1 节一致 |
| G2 | Task 6 insertContainsUserId 死代码 | R2-G2 | ✓ 已删除 `const cols`/`vals` + 无效 for 循环死代码块 |
| G3 | Task 10 "最后执行" vs 附录 B 矛盾 | R2-G3 | ✓ 关键约束改为"在 Task 3-5 之前完成"；附录 B 将 Task 10 移至 P3 第 1 位 |
| G4 | .env/.env.example 路径未明确 | R2-G4 | ✓ 文档头部新增"文件路径约定"说明 |
| G5 | Task 10 行号映射表时效性 | R2-G5 | ✓ 映射表上方新增醒目标注"以 rg 搜索结果为准" |
| G6 | Task 4 中间件链推理冗长 | R2-G6 | ✓ 删除三次迭代的废弃方案，仅保留最终方案 + 两段注释 |

---

## 遗留/新发现问题

### G1：Task 10 约束 "应在 Task 3-5 之前完成" 与附录 B 执行顺序矛盾（Task 3 早于 Task 10）

**位置**：detail_v1.md Task 10 关键约束（第 1372-1376 行） vs 附录 B（第 1894-1908 行）

**问题**：Task 10 关键约束写"此任务应在 Task 3-5 之前完成"，但附录 B 将 Task 3 放在第 1 批（P0），Task 10 放在第 3 批（P2）。Task 3 的目标代码全部使用 `req.user.user_id`（共 10+ 处），按附录顺序执行时 Task 3 先完成编码但 `auth.js:28` / `optionalAuth.js:14` 仍为 `req.user = { id: ..., ... }`，导致 `req.user.user_id` 为 `undefined`，Task 3 无法独立验证。

R2-G3 修订虽将 Task 10 约束从"最后执行"修正为"在 Task 3-5 之前"，并将 Task 10 从 P1 移至 P2 最前，但 Task 3 仍在 P0（早于 P2），语义矛盾未完全消除。

**影响**：严格按附录顺序执行 → Task 3 编码正确但验证失败（user_id 未就绪）；将 Task 10 提前执行 → 无问题。Coder 需自行判断调序。

**修复建议**：将 Task 10 提至 P1（Task 9 之前），或修改 Task 10 约束为"在 Task 5 之前完成（Task 3 代码中 `req.user.user_id` 将在本任务后生效）"。附录 B 同步调整顺序。

---

## 已验证通过项

| 序号 | 维度 | 核查项 | 结果 |
|------|------|--------|------|
| 1 | 一致性 | Task 4 difyAuth 最终方案（`optionalAuth, difyAuthMiddleware`）与设计文档 7.3.1/7.3.3 完全对齐 | ✓ |
| 2 | 一致性 | Task 5 `dispatchParameterizedQuery` 12 个工具实现与设计文档 7.3.3 节逐个对照，一致 | ✓ |
| 3 | 一致性 | Task 8a 加密方案（AES-256-GCM, scryptSync, SHA-256 哈希 + timingSafeEqual）与设计文档 7.8 节一致 | ✓ |
| 4 | 一致性 | Task 9 JWT 有效期 `process.env.JWT_EXPIRES_IN \|\| '24h'` 与设计文档 7.1 节 `expiresIn:'24h'` 一致 | ✓ |
| 5 | 完整性 | 19 个任务全部在 detail 中有完整章节，R2 修订覆盖全部 7 项 R1 问题 | ✓ |
| 6 | 完整性 | 新建文件（difyAuth.js、encryption.js、validateRowLevelPermission.js）均给出零歧义的完整代码 | ✓ |
| 7 | 可行性 | Task 5 `insertAdminLog` 在事务内外均可正确工作（事务内自动参与事务，事务外独立提交） | ✓ |
| 8 | 可行性 | Task 5 `chat_token` 加密在 `insert_record`/`update_record` 的 `fields` clone 后执行，不污染原始参数 | ✓ |
| 9 | 一致性 | Task 18 articles.js 日期格式改为 `datetime('now','localtime')` 与 DDL 默认值一致 | ✓ |
| 10 | 一致性 | Task 19 `ensureUploadDir` 挂载到 `router` 对象导出，`routes/index.js:19` 的 `require('./upload')` 仍返回 Router 实例 | ✓ |
| 11 | 约束标注 | Task 5 目标代码中 `optionalAuth` 和 `authMiddleware` 分别用于 `/execute` 和 `/chat`/`/logs`，职责分工正确 | ✓ |
| 12 | 约束标注 | Task 13 workflowType 参数对 3 个调用方的 Mock 降级逻辑覆盖完整（plan/risk/article） | ✓ |

---

## 统计

- 严重问题：0
- 一般问题：1
- 合格项：12（上一轮 12 项持续有效）
- 上一轮已解决：7
- 总核查项：13
