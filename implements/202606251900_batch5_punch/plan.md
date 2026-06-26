# 批次 5 实现计划：打卡记录与依从性分析闭环

## 1. 概述

实现 3 个打卡相关 API 端点 + 1 个日期范围工具函数，完成方案打卡 → 打卡列表查询 → 依从性分析的闭环。

## 2. 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/utils/dateRange.js` | **新增** | 日期范围解析工具 |
| `server/utils/validators.js` | **修改** | 新增 `validatePunch` |
| `server/routes/punch.js` | **新增** | 打卡路由（3 个端点） |
| `server/routes/index.js` | **修改** | 挂载 `/punch` 路由 |

## 3. 数据模型回顾

### punch_in 表 (server/db/init.sql:110-120)

| 列 | 类型 | 约束 |
|----|------|------|
| id | INTEGER PK | AUTOINCREMENT |
| user_id | INTEGER NOT NULL | FK → users(id) ON DELETE CASCADE |
| plan_item_id | INTEGER DEFAULT NULL | FK → life_plans(id) ON DELETE SET NULL |
| punch_time | TEXT NOT NULL | DEFAULT datetime('now','localtime') |
| punch_type | TEXT NOT NULL | CHECK IN ('diet','exercise') |
| completion_status | TEXT NOT NULL | CHECK IN ('completed','uncompleted') |
| remarks | TEXT DEFAULT '' | - |

### 关键：plan_item_id 映射

- **API 契约层**字段名使用 `plan_id`（对齐设计文档 3.2.16-3.2.18）
- **数据库层**列名是 `plan_item_id`（FK → life_plans.id）
- 请求中 `plan_id` → 数据库 `plan_item_id` = 具体方案项的 `life_plans.id`
- 响应中返回 `plan_id`（透传 `plan_item_id` 值）

## 4. 工具层设计

### 4.1 server/utils/dateRange.js

```js
function parseDateRange(query) {}
// 输入：req.query (含可选的 startDate, endDate)
// 输出：{ startDate, endDate } 或抛出 AppError
// 规则：
//   - startDate / endDate 均为可选，格式 YYYY-MM-DD
//   - endDate 如果有值且为 YYYY-MM-DD，自动补 23:59:59 实现闭区间查询
//   - 如果只有 startDate，endDate 返回 null（表示无上界）
//   - 如果只有 endDate，startDate 返回 null（表示无下界）
// 返回示例：
//   - 无参数 → { startDate: null, endDate: null }
//   - startDate=2026-06-01 → { startDate: '2026-06-01', endDate: null }
//   - endDate=2026-06-30 → { startDate: null, endDate: '2026-06-30T23:59:59' }
//   - 两者都有 → { startDate: '2026-06-01', endDate: '2026-06-30T23:59:59' }
```

### 4.2 server/utils/validators.js (追加)

```js
function validatePunch(body) {}
// 校验规则：
//   - plan_id 必填，正整数
//   - punch_type 必填，只能为 'diet' | 'exercise'
//   - completion_status 必填，只能为 'completed' | 'uncompleted'
//   - remarks 可选，字符串
// 返回：null (通过) 或 错误描述字符串 (失败)
```

## 5. 路由设计

### 5.1 POST /api/punch (新增打卡)

**处理流程**：

1. `authMiddleware` → 从 JWT 解析 `req.user`
2. `validatePunch(req.body)` → 参数校验
3. 校验方案归属：查询 `life_plans` 确认 `id = plan_id AND user_id = req.user.id`
4. 校验通过 → 写入 `punch_in` 表
5. 查询刚插入的记录，返回 201

**请求体** (对齐设计文档 3.2.16)：
```json
{
  "plan_id": 1,
  "punch_type": "diet",
  "completion_status": "completed",
  "remarks": "今天早餐按方案执行，感觉不错"
}
```

**响应 201**：
```json
{
  "success": true,
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

**错误码**：
- `400 VALIDATION_ERROR` — 参数校验失败
- `401 AUTH_REQUIRED` — 未登录
- `403 FORBIDDEN` — 方案项不属于当前用户
- `404 NOT_FOUND` — 方案项不存在

### 5.2 GET /api/punch/list (打卡列表)

**处理流程**：

1. `authMiddleware` → `req.user`
2. `parsePagination(req.query)` → `{ page, pageSize, offset, limit }`
3. `parseDateRange(req.query)` → `{ startDate, endDate }`
4. 从 `req.query.punch_type` 提取类型筛选 (可选)
5. 动态拼接 SQL（WHERE user_id=? + 可选日期/类型过滤）
6. COUNT 查询获取 total
7. 数据查询 LEFT JOIN life_plans 取 plan_title
8. `buildPagination(page, pageSize, total)` → 分页结构
9. 返回 `{ success, data, pagination }`

**SQL 伪代码** (对齐设计文档 3.2.17)：
```sql
SELECT p.id, p.plan_item_id AS plan_id,
       l.title AS plan_title,
       p.punch_type, p.completion_status, p.remarks, p.punch_time
FROM punch_in p
LEFT JOIN life_plans l ON p.plan_item_id = l.id
WHERE p.user_id = ?
  [AND p.punch_time >= ?]   -- 有 startDate 时拼接
  [AND p.punch_time <= ?]   -- 有 endDate 时拼接
  [AND p.punch_type = ?]    -- 有 punch_type 时拼接
ORDER BY p.punch_time DESC
LIMIT ? OFFSET ?;
```

**响应 200** (对齐设计文档 3.2.17)：
```json
{
  "success": true,
  "data": [{ "id": 1, "plan_id": 1, "plan_title": "燕麦粥 + 水煮蛋", ... }],
  "pagination": { "page": 1, "pageSize": 20, "total": 15, "totalPages": 1 }
}
```

### 5.3 GET /api/punch/analysis (打卡分析)

**处理流程**：

1. `authMiddleware` → `req.user`
2. 本地 SQL 聚合统计（不强依赖 Dify）：
   - 饮食完成率 = diet_completed / diet_total
   - 运动完成率 = exercise_completed / exercise_total
   - 总打卡次数 = COUNT(*)
   - 近 7 天趋势：GROUP BY date(punch_time)，WHERE punch_time >= date('now','localtime','-7 days')
3. 根据完成率生成依从性评语和改进建议（本地规则引擎）

**SQL 聚合设计**：

a) 分类完成率：
```sql
SELECT punch_type,
       COUNT(CASE WHEN completion_status='completed' THEN 1 END) AS completed,
       COUNT(*) AS total
FROM punch_in WHERE user_id = ? GROUP BY punch_type;
```

b) 总打卡次数：
```sql
SELECT COUNT(*) AS total_punches FROM punch_in WHERE user_id = ?;
```

c) 近 7 天趋势：
```sql
SELECT date(punch_time) AS date, punch_type,
       COUNT(CASE WHEN completion_status='completed' THEN 1 END) AS completed_count
FROM punch_in
WHERE user_id = ? AND punch_time >= datetime('now','localtime','-7 days')
GROUP BY date(punch_time), punch_type
ORDER BY date(punch_time) ASC;
```

**响应 200** (对齐设计文档 3.2.18)：
```json
{
  "success": true,
  "data": {
    "diet_completion_rate": 0.75,
    "exercise_completion_rate": 0.60,
    "total_punches": 30,
    "last_7_days_trend": [
      {"date": "2026-06-17", "diet_completed": 3, "exercise_completed": 1},
      {"date": "2026-06-18", "diet_completed": 4, "exercise_completed": 2}
    ],
    "adherence_comment": "近7天饮食依从性较好(75%)，运动依从性有待提升(60%)。建议关注晚间运动时段的执行情况。",
    "improvement_suggestions": ["建议固定晚间运动时间", "周末可增加运动时长"]
  }
}
```

**依从性评语规则引擎**：

```
rate >= 0.8  → "依从性优秀，请继续保持！"
rate >= 0.6  → "依从性良好，还有提升空间。"
rate >= 0.4  → "依从性一般，建议加强执行力度。"
rate < 0.4   → "依从性偏低，请重视方案执行。"
无数据 → "暂无打卡数据，开始您的第一次打卡吧！"
```

**改进建议规则引擎**：

```
diet_rate < 0.6  → "建议在手机设置用餐提醒"
exercise_rate < 0.6 → "建议固定运动时间，养成习惯"
两者都 < 0.6 → 两条都加
都 >= 0.6 → "继续坚持，您做得很好！"
无数据 → ["从今天开始记录您的饮食和运动打卡吧！"]
```

## 6. 路由注册

在 `server/routes/index.js` 中将注释行改为实际注册：

```js
const punchRoutes = require('./punch');
router.use('/punch', punchRoutes);
```

同时删除相关注释块。

## 7. 边界情况与错误处理

| 场景 | HTTP 状态码 | 错误码 | 说明 |
|------|------------|--------|------|
| 未登录 | 401 | AUTH_REQUIRED | authMiddleware 拦截 |
| plan_id 缺失 | 422 | VALIDATION_ERROR | validatePunch 返回 |
| punch_type 非法值 | 422 | VALIDATION_ERROR | validatePunch 返回 |
| completion_status 非法值 | 422 | VALIDATION_ERROR | validatePunch 返回 |
| body 为空 | 422 | VALIDATION_ERROR | validatePunch 返回 |
| 方案项不存在 | 404 | NOT_FOUND | SELECT 无结果 |
| 方案项不属当前用户 | 403 | FORBIDDEN | user_id 不匹配 |
| 分页参数异常 | 使用默认值 | - | parsePagination 容错 |
| startDate > endDate | 422 | VALIDATION_ERROR | dateRange 工具校验 |
| 日期格式错误 | 422 | VALIDATION_ERROR | dateRange 工具校验 |
| 无打卡数据 (list) | 200 | - | data=[], total=0 |
| 无打卡数据 (analysis) | 200 | - | rate=0, 友好提示 |

## 8. 与现有代码的一致性

- **路由模式**：遵循 `plan.js` 的三段式结构（auth → validate → db → respond）
- **错误处理**：使用 `AppError` + `errorHandler` 中间件
- **响应格式**：使用 `success()` 工具函数
- **分页**：复用 `parsePagination()` + `buildPagination()`
- **DB 访问**：使用 `db.prepare().all/get/run` 的 better-sqlite3 同步 API
- **JWT**：`req.user` 来自 `authMiddleware`，结构为 `{ id, username, role }`
