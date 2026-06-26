# 批次 5 任务分解 v1

## Task 1: 创建 server/utils/dateRange.js

**前置**：无

**内容**：
1. 新建 `server/utils/dateRange.js`
2. 导出 `parseDateRange(query)` 函数
3. 功能：
   - 从 `req.query` 提取可选 `startDate`、`endDate`
   - 校验格式为 `YYYY-MM-DD`（正则 `/^\d{4}-\d{2}-\d{2}$/`）
   - `endDate` 若仅含日期 → 追加 `T23:59:59` 实现闭区间
   - `startDate` 保持原样（SQLite 的 datetime 比较从 00:00:00 开始自然符合预期）
   - 若 `startDate > endDate` → 抛出 `AppError(422, 'VALIDATION_ERROR', ...)`
   - 若某个参数未传 → 对应字段为 `null`
4. 返回 `{ startDate: string|null, endDate: string|null }`

**验收**：
- `parseDateRange({})` → `{ startDate: null, endDate: null }`
- `parseDateRange({ startDate: '2026-06-01' })` → `{ startDate: '2026-06-01', endDate: null }`
- `parseDateRange({ endDate: '2026-06-30' })` → `{ startDate: null, endDate: '2026-06-30T23:59:59' }`
- `parseDateRange({ startDate: '2026-06-01', endDate: '2026-06-15' })` → 两者都有且正确
- `parseDateRange({ startDate: 'bad' })` → 抛出 AppError
- `parseDateRange({ startDate: '2026-06-15', endDate: '2026-06-01' })` → 抛出 AppError

---

## Task 2: 追加 validatePunch 到 server/utils/validators.js

**前置**：无

**内容**：
1. 在 `server/utils/validators.js` 新增 `validatePunch(body)` 函数
2. 校验规则：
   - `body` 必须为 object 且非空
   - `plan_id` 必填，正整数 (`Number.isInteger && > 0`)
   - `punch_type` 必填，只能为 `'diet'` 或 `'exercise'`
   - `completion_status` 必填，只能为 `'completed'` 或 `'uncompleted'`
   - `remarks` 可选，若传递则必须为 string
3. 返回 `null` 通过 / 错误描述 `string` 失败
4. 在 `module.exports` 中导出

**验收**：
- `validatePunch({})` → 返回错误描述
- `validatePunch({ plan_id: 1, punch_type: 'diet', completion_status: 'completed' })` → `null`
- `validatePunch({ plan_id: -1, ... })` → 返回错误描述
- `validatePunch({ plan_id: 1, punch_type: 'other', ... })` → 返回错误描述
- `validatePunch({ plan_id: 1, punch_type: 'diet', completion_status: 'partial' })` → 返回错误描述

---

## Task 3: 创建 server/routes/punch.js

**前置**：Task 1, Task 2

### 3.1 框架搭建

```js
const express = require('express');
const { db } = require('../db/database');
const { success, AppError } = require('../utils/response');
const { validatePunch } = require('../utils/validators');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { parseDateRange } = require('../utils/dateRange');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
```

### 3.2 POST /api/punch

```
router.post('/', authMiddleware, (req, res, next) => { ... });
```

处理步骤：
1. `validatePunch(req.body)` → 不通过则 `throw new AppError(422, 'VALIDATION_ERROR', errMsg)`
2. 查方案项归属：
   ```sql
   SELECT id, user_id FROM life_plans WHERE id = ? AND is_active = 1
   ```
   - 无结果 → `throw new AppError(404, 'NOT_FOUND', '方案项不存在')`
   - `user_id !== req.user.id` → `throw new AppError(403, 'FORBIDDEN', '无权对此方案项打卡')`
3. 写入 punch_in：
   ```sql
   INSERT INTO punch_in (user_id, plan_item_id, punch_type, completion_status, remarks)
   VALUES (?, ?, ?, ?, ?)
   ```
4. 查询刚插入的记录（`lastInsertRowid`）→ 响应字段映射：`plan_item_id` → `plan_id`
5. `success(res, data, '打卡成功', 201)`

**注意**：`plan_item_id` 列在 DDL 层允许 NULL，但应用层已校验必填。

### 3.3 GET /api/punch/list

```js
router.get('/list', authMiddleware, (req, res, next) => { ... });
```

处理步骤：
1. `parsePagination(req.query)` → `{ page, pageSize, offset, limit }`
2. `parseDateRange(req.query)` → `{ startDate, endDate }`
3. 从 `req.query.punch_type` 取类型筛选（若值不为 `diet`/`exercise` → 忽略，不作为过滤条件）
4. 动态构建 SQL：
   - 基础 WHERE：`p.user_id = ?`
   - 条件追加（使用数组收集 fragments + params）：
     - `startDate` → `AND p.punch_time >= ?`，push startDate 到 params
     - `endDate` → `AND p.punch_time <= ?`，push endDate 到 params
     - `punch_type` → `AND p.punch_type = ?`，push punch_type 到 params
5. COUNT 查询 → `total`（复用相同过滤条件的 WHERE）
6. 数据查询 (LEFT JOIN life_plans)：
   ```sql
   SELECT p.id, p.plan_item_id AS plan_id,
          l.title AS plan_title,
          p.punch_type, p.completion_status, p.remarks, p.punch_time
   FROM punch_in p
   LEFT JOIN life_plans l ON p.plan_item_id = l.id
   WHERE ... ORDER BY p.punch_time DESC LIMIT ? OFFSET ?
   ```
7. `buildPagination(page, pageSize, total)` → pagination 对象
8. `success(res, data, '查询成功')` → 返回 `{ success, data, pagination }`

**注意**：`success()` 函数的 `data` 参数只接受单层 data；pagination 需要手动拼入响应或使用 `res.json()`。参考需求文档和设计文档，响应顶层含 `data` + `pagination`。需要调整响应方式：
```js
res.json({
  success: true,
  message: '查询成功',
  data: rows,
  pagination: buildPagination(page, pageSize, total)
});
```

### 3.4 GET /api/punch/analysis

```js
router.get('/analysis', authMiddleware, (req, res, next) => { ... });
```

处理步骤：

1. 查询分类完成率：
   ```sql
   SELECT punch_type,
          COUNT(CASE WHEN completion_status = 'completed' THEN 1 END) AS completed_count,
          COUNT(*) AS total_count
   FROM punch_in WHERE user_id = ? GROUP BY punch_type
   ```
2. 查询总打卡次数：
   ```sql
   SELECT COUNT(*) AS total FROM punch_in WHERE user_id = ?
   ```
3. 查询近 7 天趋势：
   ```sql
   SELECT date(punch_time) AS date, punch_type,
          COUNT(CASE WHEN completion_status = 'completed' THEN 1 END) AS completed_count
   FROM punch_in
   WHERE user_id = ? AND punch_time >= datetime('now', 'localtime', '-7 days')
   GROUP BY date(punch_time), punch_type
   ORDER BY date ASC
   ```
4. 在 JS 层组装数据：
   - 遍历分类结果，计算 `diet_completion_rate`、`exercise_completion_rate`（`completed/total`，保留两位小数，total 为 0 时 rate 为 0）
   - 组装 `last_7_days_trend`：按 date 分组，每个 date 含 `diet_completed`、`exercise_completed`
   - 生成依从性评语（见 plan.md 规则引擎）
   - 生成改进建议（见 plan.md 规则引擎）
5. `success(res, analysisData, '查询成功')` 返回

**7 天趋势组装逻辑**（JS 层）：
```js
const trendMap = new Map();
// 先生成最近 7 天的所有日期（含无打卡的日期），初始值 { diet_completed: 0, exercise_completed: 0 }
for (let i = 6; i >= 0; i--) {
  const d = new Date();
  d.setDate(d.getDate() - i);
  const key = d.toISOString().slice(0, 10);
  trendMap.set(key, { date: key, diet_completed: 0, exercise_completed: 0 });
}
// 用 SQL 查询结果覆盖有数据的日期
for (const row of trendRows) {
  const entry = trendMap.get(row.date);
  if (entry) entry[`${row.punch_type}_completed`] = row.completed_count;
}
const last7DaysTrend = [...trendMap.values()];
```

**module.exports = router;**

---

## Task 4: 注册路由到 server/routes/index.js

**前置**：Task 3

**内容**：
1. 在 `server/routes/index.js` 中：
   - 删除第 17-28 行的注释块（后续批次注释）
   - 在第 14 行（`router.use('/plan', require('./plan'));`）之后添加：
     ```js
     router.use('/punch', require('./punch'));
     ```

**验收**：`/api/punch`、`/api/punch/list`、`/api/punch/analysis` 均可路由到 punch.js

---

## Task 5: 验证

**前置**：Task 4

**内容**：
1. 启动服务器 `node server/app.js`
2. 用 curl/Postman 测试各端点：

```bash
# 1. 打卡
curl -X POST http://localhost:3000/api/punch \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"plan_id":1,"punch_type":"diet","completion_status":"completed","remarks":"测试"}'

# 2. 打卡列表
curl "http://localhost:3000/api/punch/list?page=1&pageSize=10" \
  -H "Authorization: Bearer <token>"

# 3. 打卡列表（含日期筛选）
curl "http://localhost:3000/api/punch/list?startDate=2026-06-01&endDate=2026-06-30&punch_type=diet" \
  -H "Authorization: Bearer <token>"

# 4. 打卡分析
curl "http://localhost:3000/api/punch/analysis" \
  -H "Authorization: Bearer <token>"

# 5. 校验失败 — 缺少 plan_id
curl -X POST http://localhost:3000/api/punch \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"punch_type":"diet","completion_status":"completed"}'

# 6. 校验失败 — 非法 punch_type
curl -X POST http://localhost:3000/api/punch \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"plan_id":1,"punch_type":"other","completion_status":"completed"}'

# 7. 方案归属错误 — plan_id 不属于当前用户
curl -X POST http://localhost:3000/api/punch \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"plan_id":99999,"punch_type":"diet","completion_status":"completed"}'
```

3. 验证点：
   - [ ] 打卡写入成功，返回 201 含 `id`、`punch_time`
   - [ ] 列表分页正确，支持日期和类型筛选
   - [ ] 分析返回完成率、趋势、评语、建议
   - [ ] 非法参数返回 422
   - [ ] 未登录返回 401
   - [ ] 越权打卡返回 403/404
   - [ ] 无数据场景不报错，返回空列表 / rate=0

---

## 依赖关系图

```
Task1 (dateRange.js) ──┐
                       ├──→ Task3 (punch.js) ──→ Task4 (index.js) ──→ Task5 (验证)
Task2 (validators.js) ─┘
```

Task1 和 Task2 可并行。
