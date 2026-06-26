# 批次 5 详细设计 v1 — 打卡记录与依从性分析闭环

## 1. 概述

本批次实现 3 个打卡 API 端点 + 1 个日期范围工具函数 + 1 个校验函数追加，完成方案打卡 → 打卡列表查询 → 依从性分析的闭环。

## 2. 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/utils/dateRange.js` | 新增 | 日期范围解析工具 |
| `server/utils/validators.js` | 修改 | 新增 `validatePunch` |
| `server/routes/punch.js` | 新增 | 打卡路由 (3 端点) |
| `server/routes/index.js` | 修改 | 挂载 `/punch` 路由 |

## 3. 数据模型

### 3.1 punch_in 表 (server/db/init.sql:110-120)

| 列 | 类型 | 约束 |
|----|------|------|
| id | INTEGER PK | AUTOINCREMENT |
| user_id | INTEGER NOT NULL | FK → users(id) ON DELETE CASCADE |
| plan_item_id | INTEGER DEFAULT NULL | FK → life_plans(id) ON DELETE SET NULL |
| punch_time | TEXT NOT NULL | DEFAULT datetime('now','localtime') |
| punch_type | TEXT NOT NULL | CHECK IN ('diet','exercise') |
| completion_status | TEXT NOT NULL | CHECK IN ('completed','uncompleted') |
| remarks | TEXT DEFAULT '' | |

### 3.2 关键：plan_item_id 映射

- **API 契约层**字段名使用 `plan_id`（对齐设计文档 3.2.16-3.2.18）
- **数据库层**列名是 `plan_item_id`（FK → life_plans.id）
- **请求解析**：`req.body.plan_id` → 校验方案归属时查 `life_plans WHERE id = ?`，写入时 `INSERT ... plan_item_id = ?`
- **SQL 查询**：`SELECT p.plan_item_id AS plan_id` 别名映射
- **设计文档 3.2.17 SQL 注释中的 `p.plan_id` 为文档遗留错误**，实际列名为 `plan_item_id`

---

## 4. server/utils/dateRange.js

### 4.1 函数签名

```js
const { AppError } = require('../middleware/errorHandler');

function parseDateRange(query) {}
// query: req.query (含可选的 startDate, endDate)
// 返回: { startDate: string|null, endDate: string|null }
// 异常: throw new AppError(422, 'VALIDATION_ERROR', msg)
```

### 4.2 处理逻辑（伪代码）

```
function parseDateRange(query):
    startDate = null
    endDate = null

    if query.startDate 存在:
        if not /^\d{4}-\d{2}-\d{2}$/.test(query.startDate):
            throw AppError(422, 'VALIDATION_ERROR', '日期格式必须为 YYYY-MM-DD')
        startDate = query.startDate

    if query.endDate 存在:
        if not /^\d{4}-\d{2}-\d{2}$/.test(query.endDate):
            throw AppError(422, 'VALIDATION_ERROR', '日期格式必须为 YYYY-MM-DD')
        endDate = query.endDate + 'T23:59:59'   // 闭区间

    if startDate 且 endDate 且 startDate > endDate.replace('T23:59:59', ''):
        throw AppError(422, 'VALIDATION_ERROR', '开始日期不能晚于结束日期')

    return { startDate, endDate }
```

### 4.3 验收用例

| 输入 | 输出 | 说明 |
|------|------|------|
| `parseDateRange({})` | `{ startDate: null, endDate: null }` | 无参数 |
| `parseDateRange({ startDate: '2026-06-01' })` | `{ startDate: '2026-06-01', endDate: null }` | 仅起始 |
| `parseDateRange({ endDate: '2026-06-30' })` | `{ startDate: null, endDate: '2026-06-30T23:59:59' }` | 仅结束 |
| `parseDateRange({ startDate: '2026-06-01', endDate: '2026-06-15' })` | 两者均有效 | 完整区间 |
| `parseDateRange({ startDate: 'bad' })` | 抛出 AppError(422) | 格式错误 |
| `parseDateRange({ startDate: '2026-06-15', endDate: '2026-06-01' })` | 抛出 AppError(422) | 起始>结束 |

### 4.4 导出

```js
module.exports = { parseDateRange };
```

---

## 5. server/utils/validators.js (追加 validatePunch)

### 5.1 函数签名

```js
function validatePunch(body) {}
// body: req.body
// 返回: null (通过) 或 错误描述字符串 (失败)
```

### 5.2 校验规则

```
function validatePunch(body):
    if not body or typeof body !== 'object':
        return '请求体不能为空'

    if not body.plan_id or not (Number.isInteger(body.plan_id) and body.plan_id > 0):
        return 'plan_id 必须为正整数'

    if not body.punch_type or not ['diet', 'exercise'].includes(body.punch_type):
        return 'punch_type 必须为 diet 或 exercise'

    if not body.completion_status or not ['completed', 'uncompleted'].includes(body.completion_status):
        return 'completion_status 必须为 completed 或 uncompleted'

    if body.remarks !== undefined and typeof body.remarks !== 'string':
        return 'remarks 必须为字符串'

    return null
```

### 5.3 验收用例

| 输入 | 输出 | 说明 |
|------|------|------|
| `validatePunch({})` | `'plan_id 必须为正整数'` | 空对象 |
| `validatePunch({ plan_id: 1, punch_type: 'diet', completion_status: 'completed' })` | `null` | 最小合法 |
| `validatePunch({ plan_id: 1, punch_type: 'diet', completion_status: 'completed', remarks: 'hello' })` | `null` | 含备注 |
| `validatePunch({ plan_id: -1, punch_type: 'diet', completion_status: 'completed' })` | 错误描述 | plan_id 负数 |
| `validatePunch({ plan_id: 1, punch_type: 'other', completion_status: 'completed' })` | 错误描述 | 非法类型 |
| `validatePunch({ plan_id: 1, punch_type: 'diet', completion_status: 'partial' })` | 错误描述 | 非法状态 |

### 5.4 注册到 module.exports

在 `server/utils/validators.js` 第 149 行 `module.exports` 对象中追加：

```js
validatePunch
```

---

## 6. server/routes/punch.js

### 6.0 框架搭建

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

模式遵循 plan.js：`auth → validate → db → respond`，错误通过 `next(e)` 传递给 errorHandler。

---

### 6.1 POST /api/punch — 新增打卡 (对齐设计文档 3.2.16)

#### 路由

```js
router.post('/', authMiddleware, (req, res, next) => {
  try {
    // ... 处理逻辑 ...
  } catch (e) {
    next(e);
  }
});
```

#### 处理步骤

**Step 1: 参数校验**

```js
const err = validatePunch(req.body);
if (err) throw new AppError(422, 'VALIDATION_ERROR', err);
```

**Step 2: 校验方案项归属**

SQL:
```sql
SELECT id, user_id FROM life_plans WHERE id = ? AND is_active = 1
```

参数: `[req.body.plan_id]`

逻辑:
- `row === undefined` → `throw new AppError(404, 'NOT_FOUND', '方案项不存在')`
- `row.user_id !== req.user.id` → `throw new AppError(403, 'FORBIDDEN', '无权对此方案项打卡')`

> 注意：此处用 `plan_id` (API 层) 查询 `life_plans.id`，因为 `life_plans.id` 是每条方案项的自增主键，与 API 中传入的 `plan_id` 对应。

**Step 3: 写入 punch_in**

```sql
INSERT INTO punch_in (user_id, plan_item_id, punch_type, completion_status, remarks)
VALUES (?, ?, ?, ?, ?)
```

参数: `[req.user.id, req.body.plan_id, req.body.punch_type, req.body.completion_status, req.body.remarks || '']`

**Step 4: 查询刚插入的记录**

```js
const punchId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
const row = db.prepare(`
  SELECT id, plan_item_id AS plan_id, punch_type, completion_status, remarks, punch_time
  FROM punch_in WHERE id = ?
`).get(punchId);
```

> 使用 SQL 别名 `plan_item_id AS plan_id` 将数据库列名映射为 API 契约名。

**Step 5: 响应**

```js
success(res, row, '打卡成功', 201);
```

预期响应 (201):
```json
{
  "success": true,
  "message": "打卡成功",
  "data": {
    "id": 1,
    "plan_id": 1,
    "punch_type": "diet",
    "completion_status": "completed",
    "remarks": "今天早餐按方案执行，感觉不错",
    "punch_time": "2026-06-23T07:30:00"
  }
}
```

#### 错误码一览

| 场景 | HTTP | code | message |
|------|------|------|---------|
| 参数非法 | 422 | VALIDATION_ERROR | validatePunch 返回值 |
| 未登录 | 401 | AUTH_REQUIRED | authMiddleware 拦截 |
| 方案项不存在 | 404 | NOT_FOUND | 方案项不存在 |
| 方案项不属当前用户 | 403 | FORBIDDEN | 无权对此方案项打卡 |

---

### 6.2 GET /api/punch/list — 打卡列表 (对齐设计文档 3.2.17)

#### 路由

```js
router.get('/list', authMiddleware, (req, res, next) => {
  try {
    // ... 处理逻辑 ...
  } catch (e) {
    next(e);
  }
});
```

#### 处理步骤

**Step 1: 分页参数**

```js
const { page, pageSize, offset, limit } = parsePagination(req.query);
```

**Step 2: 日期范围**

```js
const { startDate, endDate } = parseDateRange(req.query);
```

**Step 3: 类型筛选**

```js
let punchType = null;
if (req.query.punch_type && ['diet', 'exercise'].includes(req.query.punch_type)) {
  punchType = req.query.punch_type;
}
// 非法值静默忽略，不作为过滤条件
```

**Step 4: 动态构建 SQL WHERE**

使用 fragments + params 数组模式：

```js
const whereFragments = ['p.user_id = ?'];
const params = [req.user.id];

if (startDate) {
  whereFragments.push('AND p.punch_time >= ?');
  params.push(startDate);
}
if (endDate) {
  whereFragments.push('AND p.punch_time <= ?');
  params.push(endDate);
}
if (punchType) {
  whereFragments.push('AND p.punch_type = ?');
  params.push(punchType);
}

const whereClause = whereFragments.join(' ');
```

**Step 5: COUNT 查询**

```sql
SELECT COUNT(*) AS total FROM punch_in p
WHERE p.user_id = ?
  [AND p.punch_time >= ?]      -- 条件附加
  [AND p.punch_time <= ?]      -- 条件附加
  [AND p.punch_type = ?]       -- 条件附加
```

使用与数据查询完全相同的 WHERE + params（不含 LIMIT/OFFSET）。

**Step 6: 数据查询**

```sql
SELECT p.id,
       p.plan_item_id AS plan_id,
       l.title AS plan_title,
       p.punch_type,
       p.completion_status,
       p.remarks,
       p.punch_time
FROM punch_in p
LEFT JOIN life_plans l ON p.plan_item_id = l.id
WHERE [whereClause]
ORDER BY p.punch_time DESC
LIMIT ? OFFSET ?
```

params 末尾追加 `[limit, offset]`。

> 注：设计文档 3.2.17 SQL 中写的是 `p.plan_id`，实际列名为 `plan_item_id`。此处显式使用别名 `AS plan_id` 对齐 API 契约。

**Step 7: 分页信息**

```js
const pagination = buildPagination(page, pageSize, total);
```

**Step 8: 响应**

由于 `success()` 不支持额外顶层字段，列表端点使用 `res.json()` 直接构造：

```js
res.json({
  success: true,
  message: '查询成功',
  data: rows,
  pagination
});
```

预期响应 (200):
```json
{
  "success": true,
  "message": "查询成功",
  "data": [
    {
      "id": 1,
      "plan_id": 1,
      "plan_title": "燕麦粥 + 水煮蛋",
      "punch_type": "diet",
      "completion_status": "completed",
      "remarks": "今天早餐按方案执行",
      "punch_time": "2026-06-23T07:30:00"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 15,
    "totalPages": 1
  }
}
```

#### 边界情况

| 场景 | 行为 |
|------|------|
| 无打卡记录 | `data: []`, `pagination.total: 0`, `totalPages: 0` |
| 分页越界 | 返回空数组，total 正常 |
| punch_type 非法值 | 静默忽略，不过滤 |
| 无日期参数 | 返回全部记录（按分页） |

---

### 6.3 GET /api/punch/analysis — 打卡分析 (对齐设计文档 3.2.18)

#### 路由

```js
router.get('/analysis', authMiddleware, (req, res, next) => {
  try {
    // ... 处理逻辑 ...
  } catch (e) {
    next(e);
  }
});
```

#### 处理步骤

**Step 1: 分类完成率查询**

```sql
SELECT punch_type,
       COUNT(CASE WHEN completion_status = 'completed' THEN 1 END) AS completed,
       COUNT(*) AS total
FROM punch_in
WHERE user_id = ?
GROUP BY punch_type
```

参数: `[req.user.id]`

**Step 2: 总打卡次数查询**

```sql
SELECT COUNT(*) AS total_punches FROM punch_in WHERE user_id = ?
```

参数: `[req.user.id]`

**Step 3: 近 7 天趋势查询**

```sql
SELECT date(punch_time) AS date,
       punch_type,
       COUNT(CASE WHEN completion_status = 'completed' THEN 1 END) AS completed_count
FROM punch_in
WHERE user_id = ? AND punch_time >= datetime('now', 'localtime', '-7 days')
GROUP BY date(punch_time), punch_type
ORDER BY date ASC
```

参数: `[req.user.id]`

> SQLite `date()` 函数从 `punch_time` (格式 `YYYY-MM-DD HH:MM:SS`) 提取日期部分 `YYYY-MM-DD`。
> `datetime('now','localtime','-7 days')` 计算 7 天前的日期时间，包含今天 + 过去 6 天，共 7 天。

**Step 4: JS 层组装数据**

##### 4a. 计算完成率

从 Step 1 的 `typeRows` 中提取：

```js
const typeMap = {};
for (const row of typeRows) {
  typeMap[row.punch_type] = row;
}
const dietData = typeMap['diet'] || { completed: 0, total: 0 };
const exerciseData = typeMap['exercise'] || { completed: 0, total: 0 };

const dietRate = dietData.total > 0
  ? parseFloat((dietData.completed / dietData.total).toFixed(2))
  : 0;
const exerciseRate = exerciseData.total > 0
  ? parseFloat((exerciseData.completed / exerciseData.total).toFixed(2))
  : 0;
```

##### 4b. 组装 last_7_days_trend

```js
const trendMap = new Map();
for (let i = 6; i >= 0; i--) {
  const d = new Date();
  d.setDate(d.getDate() - i);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  trendMap.set(key, { date: key, diet_completed: 0, exercise_completed: 0 });
}

for (const row of trendRows) {
  const entry = trendMap.get(row.date);
  if (entry) {
    entry[`${row.punch_type}_completed`] = row.completed_count;
  }
}

const last7DaysTrend = [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date));
```

> 注意：采用手动拼接 YYYY-MM-DD 而非 `toISOString().slice(0,10)`，避免 UTC 时区偏移导致日期偏差（例如北京时间凌晨 0-8 点 `toISOString()` 会返回前一天）。此处的日期生成逻辑与 SQLite `date(punch_time)` 的本地时间语义保持一致。

##### 4c. 生成依从性评语 (adherence_comment)

规则（基于各类型完成率）:

```js
function rateToLabel(rate) {
  if (rate >= 0.8) return '优秀';
  if (rate >= 0.6) return '良好';
  if (rate >= 0.4) return '一般';
  return '偏低';
}

function generateAdherenceComment(dietRate, exerciseRate, totalPunches) {
  if (totalPunches === 0) {
    return '暂无打卡数据，开始您的第一次打卡吧！';
  }

  const dietPct = Math.round(dietRate * 100);
  const exercisePct = Math.round(exerciseRate * 100);

  const parts = [];
  parts.push(`近7天饮食依从性${rateToLabel(dietRate)}(${dietPct}%)`);
  parts.push(`运动依从性${rateToLabel(exerciseRate)}(${exercisePct}%)`);

  // 追加具体建议
  let extra = '';
  if (dietRate < 0.6 && exerciseRate < 0.6) {
    extra = '建议同时关注饮食和运动两方面的执行情况。';
  } else if (dietRate < 0.6) {
    extra = '建议关注饮食时段的执行情况。';
  } else if (exerciseRate < 0.6) {
    extra = '建议关注运动时段的执行情况。';
  } else {
    extra = '请继续保持！';
  }

  return parts.join('，') + '。' + extra;
}
```

##### 4d. 生成改进建议 (improvement_suggestions)

```js
function generateImprovementSuggestions(dietRate, exerciseRate, totalPunches) {
  if (totalPunches === 0) {
    return ['从今天开始记录您的饮食和运动打卡吧！'];
  }

  const suggestions = [];
  if (dietRate < 0.6) {
    suggestions.push('建议在手机设置用餐提醒');
  }
  if (exerciseRate < 0.6) {
    suggestions.push('建议固定运动时间，养成习惯');
  }

  if (suggestions.length === 0) {
    return ['继续坚持，您做得很好！'];
  }
  return suggestions;
}
```

**Step 5: 响应**

```js
const analysisData = {
  diet_completion_rate: dietRate,
  exercise_completion_rate: exerciseRate,
  total_punches: totalPunches,
  last_7_days_trend: last7DaysTrend,
  adherence_comment: adherenceComment,
  improvement_suggestions: improvementSuggestions
};

success(res, analysisData, '查询成功');
```

预期响应 (200):
```json
{
  "success": true,
  "message": "查询成功",
  "data": {
    "diet_completion_rate": 0.75,
    "exercise_completion_rate": 0.60,
    "total_punches": 30,
    "last_7_days_trend": [
      {"date": "2026-06-19", "diet_completed": 3, "exercise_completed": 1},
      {"date": "2026-06-20", "diet_completed": 4, "exercise_completed": 2}
    ],
    "adherence_comment": "近7天饮食依从性良好(75%)，运动依从性良好(60%)。请继续保持！",
    "improvement_suggestions": ["继续坚持，您做得很好！"]
  }
}
```

#### 边界情况

| 场景 | 行为 |
|------|------|
| 无任何打卡记录 | `rate = 0`, `total_punches = 0`, `trend` 为 7 天全 0, 评语提示开始打卡 |
| 仅饮食无运动记录 | exercise_rate = 0, 评语 + 建议反映差异 |
| 7 天内某天无打卡 | 该日 `diet_completed` 和 `exercise_completed` 均为 0 |
| 完成率恰好 0.6 | 落入 ">= 0.6" 档，标签为"良好" |

#### 规则引擎速查表

**依从性评语 (单类型):**

| 完成率 | 标签 |
|--------|------|
| >= 0.8 | 优秀 |
| >= 0.6 | 良好 |
| >= 0.4 | 一般 |
| < 0.4  | 偏低 |
| 无数据 | (全局无数据提示) |

**改进建议:**

| 条件 | 建议 |
|------|------|
| diet_rate < 0.6 | 建议在手机设置用餐提醒 |
| exercise_rate < 0.6 | 建议固定运动时间，养成习惯 |
| 两者都 < 0.6 | 两条都加 |
| 都 >= 0.6 | 继续坚持，您做得很好！ |
| 无数据 | 从今天开始记录您的饮食和运动打卡吧！ |

---

## 7. server/routes/index.js (路由注册)

在第 14 行 `router.use('/plan', require('./plan'));` 之后新增：

```js
router.use('/punch', require('./punch'));
```

同时删除第 16-31 行的注释块（已实现的路由注释）。

---

## 8. 完整错误码矩阵

| 端点 | 场景 | HTTP | code | 拦截点 |
|------|------|------|------|--------|
| 全部 | 未登录 | 401 | AUTH_REQUIRED | authMiddleware |
| POST / | body 为空/字段缺失/类型非法 | 422 | VALIDATION_ERROR | validatePunch |
| POST / | plan_id 对应 life_plans 行不存在 | 404 | NOT_FOUND | 归属校验 SELECT |
| POST / | plan_id 对应行属于其他用户 | 403 | FORBIDDEN | 归属校验 SELECT |
| GET /list | startDate 格式错误 | 422 | VALIDATION_ERROR | parseDateRange |
| GET /list | startDate > endDate | 422 | VALIDATION_ERROR | parseDateRange |
| GET /list | 无记录 | 200 | - | 正常返回空数组 |
| GET /analysis | 无记录 | 200 | - | rate=0, 友好提示 |

---

## 9. module.exports

```js
module.exports = router;
```
