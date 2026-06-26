# 设计审查报告 v1 r1

> 审查对象：`detail_v1.md`
> 审查依据：`task_v1.md`、`plan.md`、`2_detailed_design_v3.md` §3.2.21/3.2.29-3.2.31、现有代码
> 审查角色：Design Reviewer

---

## 审查结果：REJECTED

---

## 审查项清单

### ✅ 通过项

| # | 检查项 | 结果 |
|---|--------|------|
| 1 | DIFY_API_BASE 修正位置正确（difyService.js:85, sseProxy.js:10） | ✅ |
| 2 | validateArticleGenerate 逻辑正确，允许空 body，校验 category 类型 | ✅ |
| 3 | articles.js 路由顺序正确（POST /generate 在 GET /:id 之前） | ✅ |
| 4 | 幂等性保护 30s Map 去重与设计文档一致 | ✅ |
| 5 | 分类常量（4 类）与设计文档 5.2.3 一致 | ✅ |
| 6 | upload.js multer 配置（2MB/fileFilter/storage）与设计文档 3.2.31 一致 | ✅ |
| 7 | upload.js 错误处理决策树覆盖 413/415/422/500 | ✅ |
| 8 | admin/logs SQL 使用 JOIN users 获取 operator_username，与设计文档 3.2.30 一致 | ✅ |
| 9 | admin/execute 禁止关键词列表完整（包含 REPLACE/EXEC/EXECUTE/ATTACH/DETACH） | ✅ |
| 10 | admin/execute 日志写入使用 try/catch 包裹，不阻塞响应 | ✅ |
| 11 | admin/execute 日志 SQL 使用 || 拼接而非占位符注入，安全 | ✅ |
| 12 | routes/index.js 挂载位置正确（/assistant 之后/404 之前） | ✅ |
| 13 | articles 公共列表隔离依赖现有 WHERE user_id IS NULL，无需改动 | ✅ |
| 14 | 所有错误码与设计文档 3.4 节枚举一致 | ✅ |
| 15 | 所有端点认证链正确（authMiddleware + adminMiddleware） | ✅ |

### ❌ 不通过项（阻塞）

| # | 严重度 | 问题 | 位置 | 详细说明 |
|---|--------|------|------|---------|
| **R1** | 🔴 CRITICAL | BMI 查询未处理空结果，存在运行时崩溃风险 | detail_v1.md §3.6 | `db.prepare('SELECT ... AS bmi FROM user_risk_info WHERE user_id = ? ...').get(req.user.id)` 在用户无风险记录时返回 `undefined`，后续访问 `.bmi` 会抛出 `TypeError: Cannot read properties of undefined`，导致 500 错误而非优雅降级为全部 `recommended: false` |
| **R2** | 🔴 CRITICAL | admin/execute 黑名单存在大量误杀（false positive） | detail_v1.md §6.2.3 | 关键词子串匹配会将 `INSERT`/`UPDATE`/`DELETE` 等词在列名、表名、字符串字面量中误判为危险操作。典型误杀场景：`SELECT last_insert_rowid()`、`SELECT * FROM sqlite_master WHERE name LIKE '%insert%'`、`SELECT update_time FROM ...`。建议改为**正则单词边界匹配**或**保留 blacklist 但明确文档化已知限制** |
| **R3** | 🟡 HIGH | admin/logs 的 pagination 响应挂载方式不一致 | detail_v1.md §5.3 | 设计中使用原始 `res.status(200).json()` 而非 `success()` 辅助函数。虽然功能正确，但与 `articles.js:17` 的 `res.status(200).json({ success: true, message: '查询成功', data: rows, pagination })` 风格一致，**可以接受**。但建议统一明确说明为何不用 `success()`：因为 `success()` 签名不包含 `pagination` 参数，无法在不重构的前提下追加分页信息 |
| **R4** | 🟡 HIGH | Mock 文章 `created_at` 格式与 SQLite 存储格式不一致 | detail_v1.md §3.7 vs §3.9 | SQLite `datetime('now', 'localtime')` 输出格式为 `2026-06-25 14:35:00`（空格分隔），但设计文档 3.2.21 响应示例为 `2026-06-23T14:35:00`（T 分隔 ISO8601）。生成的 Mock 文章写入后读取将返回空格格式，与设计文档不一致。需在响应前统一做格式转换或在 INSERT 时使用 strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime') |

---

## 审查建议（非阻塞）

| # | 建议 | 位置 |
|---|------|------|
| S1 | admin/execute 中 `trimmed` 已 `toUpperCase()`，`for` 循环内再次 `trimmed.toUpperCase()` 冗余 | §6.2.3 |
| S2 | 可考虑将 `DEFAULT_CATEGORIES` 提取为模块级常量，便于前后端共享 | §3.5 |
| S3 | upload.js 中 `cb(new AppError(...))` 在 fileFilter 中抛出后，需要确认 multer 版本是否在 fileFilter rejection 时正确处理。若 multer 不自动传播 AppError，可能需要改为 `cb(new Error('UNSUPPORTED_FILE_TYPE'))` 然后在错误处理中映射 | §4.4 |
| S4 | articles generate 成功后，建议在响应中返回 `created_at` 使用 DB 写入时的时间一致（`strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')`），避免前端展示时间与 DB 存储时间不一致 | §3.9 |

---

## 修订要求

### 必须修订（阻塞合并）

1. **R1 修复**：在 §3.6 BMI 查询后添加空结果处理：
   ```js
   const riskRow = db.prepare(...).get(req.user.id);
   const bmi = riskRow ? riskRow.bmi : null;
   ```
   或者用可选链：`const bmi = db.prepare(...).get(req.user.id)?.bmi;`

2. **R2 修复（二选一）**：
   - **方案A**（推荐）：将黑名单匹配改为正则单词边界，即 `new RegExp('\\b' + keyword + '\\b', 'i').test(trimmed)`，只匹配完整 SQL 关键字，不匹配列名/字符串中的子串
   - **方案B**（保留现状+文档化）：在 detail_v1.md §6.6 安全设计边界表后追加"已知限制"小节，明确列出误杀场景及对策（例如前端提示用户重命名含敏感词的列别名）

3. **R4 修复**：在 INSERT 时使用 `strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')` 替代 `datetime('now', 'localtime')`，确保写入格式与设计文档 3.2.21 响应格式一致。同时 GET 读取后无需格式转换。

4. **S3 确认**：确认 multer fileFilter 中 `cb(new AppError(...))` 是否被 multer 正确传播到 `upload.single()` 的回调 err 参数中。若 multer 内部包装为普通 Error，需要在错误处理中检测 `err.message` 或使用自定义错误标识。

---

## 总体评价

`detail_v1.md` 覆盖了本批次全部 6 个模块的设计细节，路由结构、安全校验、数据流设计清晰。与 `task_v1.md`、`plan.md`、设计文档、现有代码的一致性良好。但 **R1（BMI 空结果崩溃）** 和 **R2（黑名单误杀）** 是功能性缺陷，必须在实现前修复。**R4（时间格式不一致）** 是契约兼容性问题，影响前端渲染和与设计文档的对齐。

修订后的版本预期可通过审查。

---

## 决定

**REJECTED** — 要求修订 R1、R2、R4、S3 后重新提交审查。
