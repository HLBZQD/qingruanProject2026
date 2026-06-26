# 批次 5 — 打卡功能 v1 代码清单

## 变更文件

| 文件 | 操作 | 行数 |
|------|------|------|
| `server/utils/dateRange.js` | 新增 | 28 行 |
| `server/utils/validators.js` | 追加 `validatePunch` + 导出 | +18 行 |
| `server/routes/punch.js` | 新增 | 231 行 |
| `server/routes/index.js` | 挂载路由 + 删除注释块 | -12 行 |

## 逐文件概要

### 1. `server/utils/dateRange.js`

- 导出 `parseDateRange(query)`，解析 `req.query` 中的 `startDate` / `endDate`
- 对每个参数使用 `/^\d{4}-\d{2}-\d{2}$/` 校验 YYYY-MM-DD 格式
- `endDate` 自动拼接 `T23:59:59` 实现闭区间
- 若 startDate > endDate，抛出 `AppError(422, 'VALIDATION_ERROR', ...)`
- 无结果时返回 `{ startDate: null, endDate: null }`

### 2. `server/utils/validators.js` 追加

- 新增 `validatePunch(body)` (行 136-153)
- 校验规则：`plan_id` 为正整数、`punch_type` ∈ {diet, exercise}、`completion_status` ∈ {completed, uncompleted}、`remarks` 若存在则为 string
- 追加到 `module.exports` 对象

### 3. `server/routes/punch.js` (3 端点)

| 端点 | 方法 | 路径 |
|------|------|------|
| 新增打卡 | POST | `/api/punch` |
| 打卡列表 | GET | `/api/punch/list` |
| 打卡分析 | GET | `/api/punch/analysis` |

**POST /:**
- `validatePunch` → 归属校验 (`SELECT life_plans WHERE id = plan_id AND is_active = 1`)
- 403 (FORBIDDEN) 拦截他人方案项打卡
- INSERT 写入 `punch_in`，`plan_item_id` = `req.body.plan_id` (API→DB 映射)
- 返回 201，含 `plan_item_id AS plan_id` 别名映射

**GET /list:**
- `parsePagination` + `parseDateRange` + `punch_type` 可选筛选
- 动态 SQL WHERE 片段拼接，参数化绑定
- LEFT JOIN `life_plans` 获取 `plan_title`
- 响应含 `data` + `pagination` 顶层字段

**GET /analysis:**
- 三合一聚合查询：
  - 全量分类型完成率 (Step 1)
  - 总打卡次数 (Step 2)
  - 近7天每日趋势，`datetime('now','localtime','-7 days')` (Step 3)
- JS 层 7 天日期数组手动拼接 YYYY-MM-DD（避免 UTC 偏移）
- 规则引擎：`rateToLabel` → `generateAdherenceComment` → `generateImprovementSuggestions`

### 4. `server/routes/index.js`

- 第 15 行：`router.use('/punch', require('./punch'));`
- 删除第 16-31 行已实现路由的注释块

## 设计遵从度

- 全部 `throw` 匹配设计文档指定的 `code` 和 `message`
- `plan_item_id` 映射：API 字段 `plan_id` ↔ DB 列 `plan_item_id`，INSERT / SELECT 别名正确
- 近7天 SQL 使用 `datetime('now','localtime','-7 days')` 对齐本地时区
- 无注释（符合要求）
- 所有 SQL 占位符参数化，无拼接用户输入
