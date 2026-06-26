# 批次 5 设计审查 v1.1 (design_review_v1_r1.md)

## 审查范围

- `detail_v1.md` 全部内容
- 对照：设计文档 3.2.16-3.2.18 节、task_v1.md、plan.md、现有代码 (pagination.js, response.js, auth.js, validators.js, errorHandler.js, plan.js, init.sql)

---

## 1. 端点覆盖检查

| 端点 | detail_v1.md 节 | 设计文档节 | 状态 |
|------|-----------------|------------|------|
| POST /api/punch | 6.1 | 3.2.16 | 通过 |
| GET /api/punch/list | 6.2 | 3.2.17 | 通过 |
| GET /api/punch/analysis | 6.3 | 3.2.18 | 通过 |

结论：3 个端点全部覆盖。

---

## 2. SQL 正确性检查

### 2.1 POST / - 方案归属校验

```sql
SELECT id, user_id FROM life_plans WHERE id = ? AND is_active = 1
```

- `life_plans.id` 是每条方案项的自增主键，`plan_id` (API 层) 映射到 `life_plans.id`，逻辑正确
- `is_active = 1` 确保只对当前激活方案打卡
- 对 `undefined` 行 → 404
- `user_id !== req.user.id` → 403
- **通过**

### 2.2 POST / - INSERT

```sql
INSERT INTO punch_in (user_id, plan_item_id, punch_type, completion_status, remarks)
VALUES (?, ?, ?, ?, ?)
```

- 参数 `[req.user.id, req.body.plan_id, req.body.punch_type, req.body.completion_status, req.body.remarks || '']`
- `punch_time` 未指定，依赖 DDL DEFAULT `datetime('now','localtime')`
- **通过**

### 2.3 POST / - 回读

```sql
SELECT id, plan_item_id AS plan_id, punch_type, completion_status, remarks, punch_time
FROM punch_in WHERE id = ?
```

- `plan_item_id AS plan_id` 别名映射，对齐 API 契约
- `success(res, row, '打卡成功', 201)` 状态码 201
- **通过**

### 2.4 GET /list - COUNT

```sql
SELECT COUNT(*) AS total FROM punch_in p
WHERE [whereClause]
```

- whereClause 与数据查询完全一致（共享 fragments + params）
- **通过**

### 2.5 GET /list - 数据查询

```sql
SELECT p.id, p.plan_item_id AS plan_id, l.title AS plan_title,
       p.punch_type, p.completion_status, p.remarks, p.punch_time
FROM punch_in p
LEFT JOIN life_plans l ON p.plan_item_id = l.id
WHERE [whereClause]
ORDER BY p.punch_time DESC
LIMIT ? OFFSET ?
```

- LEFT JOIN 使用 `p.plan_item_id = l.id`（正确，与 init.sql FK 定义一致）
- 注意：设计文档 3.2.17 SQL 注释中写的是 `p.plan_id = l.id`，这是**文档错误**。detail_v1.md 已正确使用 `plan_item_id` 并明确标注此差异。
- 别名 `AS plan_id` 对齐 API 契约
- 动态 WHERE 条件附加顺序：user_id → startDate → endDate → punchType，params 顺序匹配
- **通过**

### 2.6 GET /analysis - 分类完成率

```sql
SELECT punch_type,
       COUNT(CASE WHEN completion_status = 'completed' THEN 1 END) AS completed,
       COUNT(*) AS total
FROM punch_in WHERE user_id = ? GROUP BY punch_type
```

- SQLite COUNT(CASE) 语法正确
- GROUP BY punch_type 正确分组
- **通过**

### 2.7 GET /analysis - 总打卡次数

```sql
SELECT COUNT(*) AS total_punches FROM punch_in WHERE user_id = ?
```

- **通过**

### 2.8 GET /analysis - 近 7 天趋势

```sql
SELECT date(punch_time) AS date, punch_type,
       COUNT(CASE WHEN completion_status = 'completed' THEN 1 END) AS completed_count
FROM punch_in
WHERE user_id = ? AND punch_time >= datetime('now', 'localtime', '-7 days')
GROUP BY date(punch_time), punch_type
ORDER BY date ASC
```

- SQLite `date()` 函数提取 `YYYY-MM-DD` 部分
- `datetime('now','localtime','-7 days')` 计算 7 天前（含今天共 7 天）
- ORDER BY date ASC 升序
- **通过**

---

## 3. plan_item_id 映射检查

| 位置 | 操作 | 映射 |
|------|------|------|
| API 请求 | `req.body.plan_id` (API 契约) | → 写入 `plan_item_id` 列 |
| 归属校验 | `WHERE id = req.body.plan_id` | 查询 `life_plans.id` 行 |
| INSERT | `plan_item_id = req.body.plan_id` | 写入 DB 列 |
| SELECT 响应 | `plan_item_id AS plan_id` | 回读时别名映射 |
| LEFT JOIN | `p.plan_item_id = l.id` | JOIN 条件 |
| API 响应 | `plan_id` 字段 | 透传 plan_item_id 值 |

- 映射链路完整，请求→DB→响应全路径一致
- 与 task_v1.md 第 32-35 行 和 plan.md 第 30-35 行 一致
- **通过**

**审查注**：设计文档 3.2.17 SQL 注释中 `p.plan_id` 是遗留文档错误（实际列名为 `plan_item_id`）。detail_v1.md 第 3.2 节和第 6.2 节均明确标注此差异并已纠正。

---

## 4. 校验规则检查

### 4.1 parseDateRange

| 规则 | 实现 | 状态 |
|------|------|------|
| startDate/endDate 均为可选 | 不传 → null | 通过 |
| 格式 YYYY-MM-DD | 正则 `/^\d{4}-\d{2}-\d{2}$/` | 通过 |
| endDate 闭区间 | 追加 `T23:59:59` | 通过 |
| startDate > endDate → 422 | 比较前去除 T23:59:59 后缀 | 通过 |
| 错误 → AppError(422, 'VALIDATION_ERROR', msg) | 与现有 AppError 模式一致 | 通过 |

**字符串比较相容性审查**（重要）：
- 数据库 `punch_time` 格式为 `YYYY-MM-DD HH:MM:SS`（SQLite datetime 默认空格分隔）
- 过滤器 `endDate` 格式为 `YYYY-MM-DDTHH:MM:SS`（T 分隔）
- 字符串比较：`'2026-06-30 14:30:00'` vs `'2026-06-30T23:59:59'`，position 10 处空格(32) < T(84)，所以 `punch_time <= endDate` 正确包含当天所有记录
- **字符串比较正确，无需特殊处理**

### 4.2 validatePunch

| 规则 | 实现 | 状态 |
|------|------|------|
| body 非空 object | `!body \|\| typeof body !== 'object'` | 通过 |
| plan_id 正整数 | `Number.isInteger && > 0` | 通过 |
| punch_type 枚举 | `['diet', 'exercise'].includes()` | 通过 |
| completion_status 枚举 | `['completed', 'uncompleted'].includes()` | 通过 |
| remarks 可选 string | 仅存在时校验 typeof | 通过 |
| 返回 null 通过 / 字符串失败 | 与现有 validators.js 风格一致 | 通过 |

**审查注**：`!body.plan_id` 会拒绝 `plan_id: 0`（0 是 falsy），同时 `Number.isInteger(1.5) === false`，浮点数也被拒绝。逻辑正确。

---

## 5. API 响应格式检查

### 5.1 POST /api/punch (201)

detail_v1.md 预期响应：
```json
{
  "success": true,
  "message": "打卡成功",
  "data": {
    "id": 1, "plan_id": 1, "punch_type": "diet",
    "completion_status": "completed", "remarks": "...", "punch_time": "..."
  }
}
```

对照设计文档 3.2.16：字段一致，`punch_time` 格式 `YYYY-MM-DDTHH:MM:SS` (SQLite 输出) 与示例一致。
- **通过**

### 5.2 GET /api/punch/list (200)

detail_v1.md 使用 `res.json({ success: true, message, data, pagination })` 直接构造，因为 `success()` 不支持额外顶层字段。

对照设计文档 3.2.17：
```
顶层: success, data(list), pagination(page/pageSize/total/totalPages)
```
- `buildPagination(page, pageSize, total)` 返回 `{ page, pageSize, total, totalPages }` → 与设计文档一致
- `data` 中字段 `id, plan_id, plan_title, punch_type, completion_status, remarks, punch_time` → 与设计文档一致
- `plan_item_id` 通过别名映射为 `plan_id` → 与设计文档一致
- **通过**

### 5.3 GET /api/punch/analysis (200)

detail_v1.md 预期响应（通过 `success(res, analysisData, '查询成功')`）：
```json
{
  "success": true,
  "message": "查询成功",
  "data": {
    "diet_completion_rate": 0.75,
    "exercise_completion_rate": 0.60,
    "total_punches": 30,
    "last_7_days_trend": [...],
    "adherence_comment": "...",
    "improvement_suggestions": [...]
  }
}
```

对照设计文档 3.2.18：字段名、类型完全一致。
- `diet_completion_rate` / `exercise_completion_rate` 保留两位小数 (toFixed(2) 后 parseFloat)
- `total_punches` 为整数
- `last_7_days_trend` 数组元素含 `date`, `diet_completed`, `exercise_completed`
- `adherence_comment` 字符串
- `improvement_suggestions` 字符串数组
- **通过**

---

## 6. 依从性规则引擎检查

### 6.1 adherence_comment 生成逻辑

| 输入 | 期望输出片段 |
|------|-------------|
| diet=0.75, exercise=0.60, total>0 | "近7天饮食依从性良好(75%)，运动依从性良好(60%)。请继续保持！" |
| diet=0.85, exercise=0.30, total>0 | "近7天饮食依从性优秀(85%)，运动依从性偏低(30%)。建议关注运动时段的执行情况。" |
| total=0 | "暂无打卡数据，开始您的第一次打卡吧！" |

- 逻辑：totalPunches===0 → 无数据提示；否则按 rate 生成两段 + 组合建议句
- rateToLabel 分档: >=0.8 优秀, >=0.6 良好, >=0.4 一般, <0.4 偏低
- **通过**

### 6.2 improvement_suggestions 生成逻辑

| 输入 | 期望输出 |
|------|---------|
| diet=0.5, exercise=0.8 | ["建议在手机设置用餐提醒"] |
| diet=0.9, exercise=0.5 | ["建议固定运动时间，养成习惯"] |
| diet=0.3, exercise=0.2 | ["建议在手机设置用餐提醒", "建议固定运动时间，养成习惯"] |
| diet=0.8, exercise=0.7 | ["继续坚持，您做得很好！"] |
| total=0 | ["从今天开始记录您的饮食和运动打卡吧！"] |

- 逻辑：阈值 0.6，分别检查；两者都 >=0.6 → 鼓励语；两者都 <0.6 → 两条都加
- 与 plan.md 第 216-223 行一致
- **通过**

---

## 7. 边界情况与错误处理

| 场景 | detail_v1.md 处理 | 状态 |
|------|-------------------|------|
| 未登录 | authMiddleware → 401 AUTH_REQUIRED | 通过 |
| plan_id 缺失/非法 | validatePunch → 422 VALIDATION_ERROR | 通过 |
| punch_type 非法 | validatePunch → 422 VALIDATION_ERROR | 通过 |
| completion_status 非法 | validatePunch → 422 VALIDATION_ERROR | 通过 |
| 方案项不存在 | SELECT 无结果 → 404 NOT_FOUND | 通过 |
| 方案项不属于用户 | user_id 不匹配 → 403 FORBIDDEN | 通过 |
| startDate 格式错误 | parseDateRange → 422 | 通过 |
| startDate > endDate | parseDateRange → 422 | 通过 |
| 分页参数异常 | parsePagination 容错，默认 page=1, pageSize=20 | 通过 |
| 无打卡 (list) | data=[], total=0, totalPages=0 | 通过 |
| 无打卡 (analysis) | rate=0, 友好提示 | 通过 |
| punch_type 筛选值非法 | 静默忽略，不过滤 | 通过 |
| body 为空 | validatePunch → "请求体不能为空" | 通过 |
| remarks 缺失 | 写入时 `remark \|\| ''` 默认为空字符串 | 通过 |

---

## 8. 与现有代码一致性

### 8.1 路由模式
- plan.js: `auth → validate → db → respond` 结构
- punch.js: 复用相同模式
- 错误通过 `next(e)` 传递给 errorHandler
- **通过**

### 8.2 工具复用
- `parsePagination` + `buildPagination` (pagination.js:1-18)
- `success` + `AppError` (response.js:1-11)
- `authMiddleware` (auth.js:1-32)
- **通过**

### 8.3 校验函数风格
- validatePunch 返回 `null` (通过) / `string` (失败)，与现有 validators.js 完全一致
- 注册到 module.exports 末尾
- **通过**

### 8.4 DB 访问
- 使用 `db.prepare().get/run/all` (better-sqlite3 同步 API)
- 与 plan.js 一致
- `last_insert_rowid()` 获取自增 ID
- **通过**

### 8.5 路由注册
- `router.use('/punch', require('./punch'));` 插入 plan 路由后
- 同时删除已实现路由的注释块
- **通过**

---

## 9. 发现的问题与建议

### 9.1 修复项：7 天趋势 JS 日期生成（已修复）

- **问题**：task_v1.md 第 176 行使用 `d.toISOString().slice(0, 10)` 生成日期，此方法在 UTC+8 时区下，凌晨 0-8 点会返回前一天的日期（因为 `toISOString()` 输出 UTC 时间）
- **修复**：detail_v1.md 第 6.3 节 Step 4b 改为手动拼接 `YYYY-MM-DD`：
  ```js
  const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  ```
- **状态**：已修复

### 9.2 观察项：设计文档 3.2.17 SQL 中的列名不一致

- 设计文档 3.2.17 SQL 注释写 `p.plan_id`，实际数据库 DDL 列名为 `plan_item_id`
- detail_v1.md 已显式标注此差异并使用正确列名 + `AS plan_id` 别名
- **建议**：后续修订设计文档时同步修正 SQL 注释中的列名
- **等级**：观察项（不影响实现）

### 9.3 观察项：endDate T 分隔符与 punch_time 空格分隔符

- punch_time 是 SQLite 默认空格分隔格式 (`YYYY-MM-DD HH:MM:SS`)
- endDate 过滤器使用 T 分隔 (`YYYY-MM-DDTHH:MM:SS`)
- 经字符串比较相容性分析（见 4.1 节），`空格(32) < T(84)`，比较结果正确
- **无需修改**，但值得在注释中标注

---

## 10. 审查结论

| 检查项 | 结果 |
|--------|------|
| 端点覆盖 | 3/3 端点全部覆盖 |
| SQL 正确性 | 全部正确，plan_item_id 映射完整 |
| 校验规则 | 全部覆盖，与设计文档一致 |
| API 响应格式 | 全部与设计文档 3.2.16-3.2.18 一致 |
| 规则引擎 | 依从性评语 + 改进建议逻辑与 plan.md 一致 |
| 边界情况 | 11 种场景全部覆盖 |
| 现有代码一致 | 路由/工具/错误处理/DB 模式全部兼容 |
| 已知问题 | 1 项已修复（时区），2 项观察项（非阻塞） |

**判定：APPROVED**

审查人：Designer + Design Reviewer (self-review)
日期：2026-06-25
