# 计划审查报告 v1 r1

## 审查范围

- `plan.md` — 实现计划
- `task_v1.md` — 任务分解
- 对照：`requirement.md`、设计文档 3.2.16-3.2.18、现有代码 `server/routes/`、`server/utils/`、`server/db/`

---

## 审查维度 1：需求覆盖

| 需求项 | 来源 | 计划覆盖 | 状态 |
|--------|------|----------|------|
| POST /api/punch | req §1-8 | plan.md §5.1, task 3.2 | PASS |
| plan_id 必填校验 | req §2 | validatePunch, plan.md §4.2 | PASS |
| 方案项归属校验 | req §3 | plan.md §5.1 步骤3, SQL + user_id 比对 | PASS |
| punch_type ∈ {diet, exercise} | req §4 | validatePunch, CHECK 约束二次保障 | PASS |
| completion_status ∈ {completed, uncompleted} | req §5 | validatePunch | PASS |
| 写入 punch_in | req §6 | INSERT 语句, plan.md §5.1 步骤3 | PASS |
| GET /api/punch/list | req §7 | plan.md §5.2, task 3.3 | PASS |
| 分页参数 page/pageSize | req §8 | parsePagination 复用 | PASS |
| 日期筛选 startDate/endDate | req §8 | parseDateRange + 动态 SQL | PASS |
| punch_type 筛选 | req §8 | 动态 SQL 参数 | PASS |
| 仅返回当前用户数据 | req §9 | WHERE p.user_id = ? | PASS |
| LEFT JOIN life_plans 取 plan_title | req §10 | 正确使用 plan_item_id → life_plans.id | PASS |
| 统一分页结构 | req §11 | buildPagination + res.json | PASS |
| GET /api/punch/analysis | req §12 | plan.md §5.3, task 3.4 | PASS |
| 饮食完成率 | req §13 | SQL 聚合 diet | PASS |
| 运动完成率 | req §13 | SQL 聚合 exercise | PASS |
| 总打卡次数 | req §13 | COUNT(*) | PASS |
| 近 7 天趋势 | req §14 | GROUP BY date + JS 补全缺失日期 | PASS |
| 依从性评语 | req §14 | 规则引擎 (plan.md §5.3) | PASS |
| 改进建议 | req §14 | 规则引擎 | PASS |
| dateRange 工具 | requirement.md 文件列表 | plan.md §4.1, task 1 | PASS |

```
需求覆盖：18/18 (100%)
```

---

## 审查维度 2：DB 列名正确性

**发现 1**：设计文档 3.2.17 节 SQL 示例使用 `p.plan_id`，但 DB 实际列名为 `punch_in.plan_item_id`。

| 位置 | 文档 SQL | 计划采用了正确的列名 |
|------|---------|---------------------|
| 3.2.17 示例 | `LEFT JOIN life_plans l ON p.plan_id = l.id` | plan.md: `LEFT JOIN life_plans l ON p.plan_item_id = l.id` |

✅ plan.md 在 §5.2 SQL 伪代码中已修正为 `p.plan_item_id`，并在 §3 关键映射中明确说明了 API 层 `plan_id` ↔ DB 层 `plan_item_id` 的映射关系。

**发现 2**：`life_plans` 表同时有 `id` (AUTOINCREMENT PK) 和 `plan_id` (方案组 ID)，FK 引用的是 `life_plans.id`。

✅ plan.md §3 明确说明 `plan_item_id` FK → `life_plans(id)`，且在方案归属校验中使用 `WHERE id = ? AND user_id = ?`（查 life_plans.id）。

---

## 审查维度 3：与现有代码模式一致性

### 3.1 路由模式对比 (参照 plan.js)

| 特征 | plan.js | plan.md | 一致 |
|------|---------|---------|------|
| 导入方式 | `const { db } = require('../db/database')` | 同 | ✅ |
| 响应工具 | `const { success, AppError } = require('../utils/response')` | 同 | ✅ |
| 校验工具 | `const { validatePlanGenerate } = require('../utils/validators')` | `validatePunch` | ✅ |
| 认证 | `authMiddleware` | authMiddleware (3 个路由均使用) | ✅ |
| 错误传播 | `throw new AppError(...)` + `catch(next)` | 同模式 | ✅ |
| router 导出 | `module.exports = router` | 同 | ✅ |

### 3.2 响应格式对比

**发现问题**：`plan.js` 使用 `success(res, data, message)` 返回 `{ success, message, data }`。但 punch list 需要返回 `{ success, message, data, pagination }` — 这超出了 `success()` 函数的能力。

✅ task_v1.md 在 3.3 节已识别此问题，给出了明确解决方案：列表/Analysis 接口使用 `res.json()` 直接构造响应体而非 `success()`。

Suggestion (non-blocking)：可在 `response.js` 增加 `paginatedSuccess(res, data, pagination, message)` 工具函数，供后续批次复用。本次用 `res.json()` 亦可。

### 3.3 分页常量

plan.md §5.2 未显式写出 `pageSize` 上限为 100，但 `parsePagination` 已内置此限制（pagination.js 第 9 行：`if (pageSize > 100) pageSize = 100`）。

✅ 复用时自动生效。

---

## 审查维度 4：边界情况

| 场景 | plan.md 覆盖 | task_v1.md 覆盖 | 状态 |
|------|-------------|----------------|------|
| 空 body 请求 POST | §7 - 422 | task 3.2 步骤1 | ✅ |
| plan_id 为 0 / 负数 / 浮点数 | §7 - 422 | task 2 验收 | ✅ |
| punch_type='other' | §7 - 422 | task 2 验收 + task 5 测试6 | ✅ |
| completion_status='partial' | §7 - 422 | task 2 验收 | ✅ |
| 方案项不存在 | §7 - 404 | task 3.2 步骤2 | ✅ |
| 方案项属其他用户 | §7 - 403 | task 3.2 步骤2 | ✅ |
| plan_item_id=NULL (DDL 允许) | §5 注释 | plan.md §3 映射说明, task 3.2 注意 | ✅ |
| pagination 参数畸形 | §7 - 使用默认值 | parsePagination 容错 | ✅ |
| startDate > endDate | §7 - 422 | task 1 验收 | ✅ |
| 日期格式 "bad" | §7 - 422 | task 1 验收 | ✅ |
| punch_type 筛选值非法 | 忽略非 diet/exercise | task 3.3 步骤3 | ✅ |
| 无打卡数据 (list) | §7 - 200, empty | task 5 | ✅ |
| 无打卡数据 (analysis) | §7 - rate=0 | task 3.4 除以零保护 | ✅ |
| last_7_days_trend 缺日期 | JS 补全逻辑 | task 3.4 趋势组装 | ✅ |

**补充发现**：plan.md §7 列举了 13 个边界情况，task_v1.md 在对应 task 中均有验收标准。两者覆盖一致。

---

## 审查维度 5：SQL 安全性

| 检查项 | 实践 | 状态 |
|--------|------|------|
| 用户输入拼接 | 使用占位符 `?` + params 数组 | ✅ |
| 动态 WHERE 条件 | 条件语句硬编码，仅值通过占位符传入 | ✅ |
| punch_type 筛选 | 值校验后再拼接（已由 validatePunch 约束 enum）| ✅ |
| startDate/endDate | 正则校验 YYYY-MM-DD 后再拼接 | ✅ |

---

## 审查维度 6：设计文档对齐

### 3.2.16 POST /api/punch

| 设计文档字段 | plan.md | 差异 |
|-------------|---------|------|
| plan_id (number, required) | ✅ | - |
| punch_type ("diet"/"exercise") | ✅ | - |
| completion_status ("completed"/"uncompleted") | ✅ | - |
| remarks (string, optional) | ✅ | - |
| 响应 201 | ✅ | - |
| 响应含 id, plan_id, punch_type, completion_status, remarks, punch_time | ✅ | - |

### 3.2.17 GET /api/punch/list

| 设计文档字段 | plan.md | 差异 |
|-------------|---------|------|
| 查询参数 page, pageSize, startDate, endDate, punch_type | ✅ | - |
| 响应 data[] 含 id, plan_id, plan_title, punch_type, completion_status, remarks, punch_time | ✅ | - |
| pagination { page, pageSize, total, totalPages } | ✅ | - |

### 3.2.18 GET /api/punch/analysis

| 设计文档字段 | plan.md | 差异 |
|-------------|---------|------|
| diet_completion_rate: number | ✅ | - |
| exercise_completion_rate: number | ✅ | - |
| total_punches: number | ✅ | - |
| last_7_days_trend: 数组 | ✅ | - |
| adherence_comment: string | ✅ | - |
| improvement_suggestions: string[] | ✅ | - |

---

## 审查维度 7：任务拆解合理性

```
Task 1 (dateRange.js)  ── 独立，无依赖     ← 可并行
Task 2 (validators.js) ── 独立，无依赖     ← 可并行
Task 3 (punch.js)       ── 依赖 Task1+2
Task 4 (index.js)       ── 依赖 Task3
Task 5 (验证)            ── 依赖 Task4
```

- 依赖关系清晰，无循环依赖。
- Task1/2 可并行执行。
- 每个 Task 有明确输入、输出、验收标准。

---

## 审查维度 8：遗漏项检查

| 检查项 | 状态 |
|--------|------|
| `server/app.js` 是否已使用 routes/index.js？ | 需确认。若 app.js 已 `app.use('/api', require('./routes/index'))` 则无需额外修改。 |
| 需要在 plan.md 补充 app.js 检查步骤？ | 非必要，routes/index.js 的修改会自动生效（若 app.js 已正确挂载）。 |
| response.js 是否需要扩展 `paginatedSuccess()`？ | 可选优化，非阻塞。当前用 res.json() 可行。 |

---

## 审查裁决

```
需求覆盖：  18/18  ✅
DB 列名：   正确   ✅
模式一致：   符合   ✅
边界情况：   全覆盖 ✅
SQL 安全：   安全   ✅
设计对齐：   完全   ✅
任务拆解：   合理   ✅
```

### 最终判定：APPROVED

无阻塞性问题。以下为 2 条可选改进建议（非必须）：

1. **Suggestion**：`response.js` 增加 `paginatedSuccess(res, data, pagination, message)` 工具函数，供 `punch/list` 及后续分页接口复用（当前用 `res.json()` 亦可接受）。
2. **Suggestion**：`dateRange.js` 可额外导出 `getLast7Days()` 工具函数供 analysis 使用（当前 task 3.4 在 JS 层手动计算最近 7 天也可接受）。

---

## 审查记录

| 版本 | 日期 | 审查人 | 结果 |
|------|------|--------|------|
| v1 r1 | 2026-06-25 | Plan Reviewer | APPROVED |
