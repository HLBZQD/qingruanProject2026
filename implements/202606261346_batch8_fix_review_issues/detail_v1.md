# 批次 8 详细实现规格 v1

> 生成日期：2026-06-26
> 基于：task_v1.md、plan.md、requirement.md、2_detailed_design_v3.md

> **文件路径约定**：本规格中 `.env` / `.env.example` 均指项目根目录下的文件（`/home/derpyIsTheBest/qingruanProject2026/.env` / `.env.example`），而非 `server/` 子目录。

---

### Task 1: 修复 plan.js/risk.js Dify API Key 环境变量命名不匹配

**文件**：`server/routes/plan.js`、`server/routes/risk.js`
**修改类型**：修改

#### 当前状态

`plan.js:48,57,171,181`：
```js
process.env.DIFY_PLAN_WORKFLOW_API_KEY
```

`risk.js:54,72`：
```js
process.env.DIFY_RISK_WORKFLOW_API_KEY
```

`.env:6-7` 和 `.env.example:5-6`：
```
DIFY_PLAN_WORKFLOW_KEY=
DIFY_RISK_WORKFLOW_KEY=
```

#### 目标状态

`plan.js:48`：
```js
process.env.DIFY_PLAN_WORKFLOW_KEY,
```

`plan.js:57`：
```js
process.env.DIFY_PLAN_WORKFLOW_KEY,
```

`plan.js:171`：
```js
process.env.DIFY_PLAN_WORKFLOW_KEY,
```

`plan.js:181`：
```js
process.env.DIFY_PLAN_WORKFLOW_KEY,
```

`risk.js:54`：
```js
process.env.DIFY_RISK_WORKFLOW_KEY,
```

`risk.js:72`：
```js
process.env.DIFY_RISK_WORKFLOW_KEY,
```

#### 关键约束
- 仅改 `process.env.XXX` 变量名字面量，不改变逻辑
- `.env` 和 `.env.example` 中 `DIFY_PLAN_WORKFLOW_KEY` / `DIFY_RISK_WORKFLOW_KEY` 保持不变
- 必须在 Task 3 之前完成（否则 Task 3 的事务修复无法在 Dify 真实调用路径上验证）

---

### Task 2: database.js 添加 WAL 模式和 busy_timeout pragma

**文件**：`server/db/database.js`
**修改类型**：修改

#### 当前状态

`database.js:17-18`：
```js
  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
```

#### 目标状态

`database.js:17-19`（在第 18 行后插入 2 行）：
```js
  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
```

#### 关键约束
- 按设计文档 6.4 节 `getDatabase()` 工厂函数的 pragma 配置顺序：`foreign_keys` → `journal_mode` → `busy_timeout`
- 不破坏现有 `foreign_keys = ON` 行为
- WAL 模式会在数据库文件目录生成 `-wal` 和 `-shm` 辅助文件（预期行为）

---

### Task 3: plan.js 事务顺序修正（含 plan_id 生成与 checkIdempotent 同步调整）

**文件**：`server/routes/plan.js`
**修改类型**：修改

#### 当前状态

**POST /generate** `plan.js:23-100`：

```js
router.post('/generate', authMiddleware, async (req, res, next) => {
  try {
    // 第25-27行: checkIdempotent 在入口处
    if (!checkIdempotent(req.user.id)) {
      throw new AppError(409, 'CONFLICT', '请求过于频繁，请稍后再试');
    }

    const err = validatePlanGenerate(req.body);
    if (err) throw new AppError(422, 'VALIDATION_ERROR', err);

    // 第32-45行: 事务内先 deactivate + 生成 plan_id，再提交
    const planData = db.transaction(() => {
      db.prepare(`
        UPDATE life_plans SET is_active = 0, updated_at = datetime('now','localtime')
        WHERE user_id = ? AND is_active = 1
      `).run(req.user.id);

      const { maxId } = db.prepare(`
        SELECT COALESCE(MAX(plan_id), 0) + 1 AS maxId
        FROM life_plans WHERE user_id = ?
      `).get(req.user.id);
      const planId = maxId;

      return { planId };
    })();

    // 第47-53行: 再调用 Dify（事务已提交）
    const difyResponse = await callWorkflowBlocking(
      process.env.DIFY_PLAN_WORKFLOW_API_KEY,
      {
        health_info: req.body.health_info,
        preferences: req.body.preferences
      }
    );
    // ... 解析 Dify 输出 ...

    // 第62-78行: 写入新方案项
    db.transaction(() => { ... })();
    // ...
  }
});
```

**PUT /adjust** `plan.js:141-220`：

```js
router.put('/adjust', authMiddleware, async (req, res, next) => {
  try {
    const err = validatePlanAdjust(req.body);
    if (err) throw new AppError(422, 'VALIDATION_ERROR', err);

    // 第146-149行: 先 deactivate
    db.prepare(`
      UPDATE life_plans SET is_active = 0, updated_at = datetime('now','localtime')
      WHERE user_id = ? AND plan_id = ?
    `).run(req.user.id, req.body.plan_id);

    // 第165-168行: 生成新 plan_id
    const { maxId } = db.prepare(`
      SELECT COALESCE(MAX(plan_id), 0) + 1 AS maxId
      FROM life_plans WHERE user_id = ?
    `).get(req.user.id);

    // 第170-184行: 再调用 Dify（deactivate 已提交）
    const difyResponse = await callWorkflowBlocking(
      process.env.DIFY_PLAN_WORKFLOW_API_KEY,
      { ... }
    );
    // ...
  }
});
```

#### 目标状态

**POST /generate** `plan.js:23-100`：

```js
router.post('/generate', authMiddleware, async (req, res, next) => {
  try {
    const err = validatePlanGenerate(req.body);
    if (err) throw new AppError(422, 'VALIDATION_ERROR', err);

    // 先调用 Dify（事务未开始，旧方案未 deactivate）
    const difyResponse = await callWorkflowBlocking(
      process.env.DIFY_PLAN_WORKFLOW_KEY,
      {
        health_info: req.body.health_info,
        preferences: req.body.preferences
      }
    );

    const { items } = await parsePlanOutput(
      difyResponse.data.outputs.text,
      process.env.DIFY_PLAN_WORKFLOW_KEY,
      callWorkflowBlocking,
      { health_info: req.body.health_info, preferences: req.body.preferences }
    );

    // Dify 成功后才注册冷却锁
    if (!checkIdempotent(req.user.user_id)) {
      throw new AppError(409, 'CONFLICT', '请求过于频繁，请稍后再试');
    }

    // Dify 成功后，在事务内：deactivate 旧方案 + 生成新 plan_id + 写入新方案项
    const planData = db.transaction(() => {
      db.prepare(`
        UPDATE life_plans SET is_active = 0, updated_at = datetime('now','localtime')
        WHERE user_id = ? AND is_active = 1
      `).run(req.user.user_id);

      const { maxId } = db.prepare(`
        SELECT COALESCE(MAX(plan_id), 0) + 1 AS maxId
        FROM life_plans WHERE user_id = ?
      `).get(req.user.user_id);
      const planId = maxId;

      const insertStmt = db.prepare(`
        INSERT INTO life_plans (user_id, plan_id, plan_type, order_num, time_desc, title, content, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `);
      for (const item of items) {
        insertStmt.run(
          req.user.user_id,
          planId,
          item.plan_type,
          item.order_num,
          item.time_desc || '',
          item.title,
          item.content
        );
      }

      return { planId };
    })();

    const planRows = db.prepare(`
      SELECT id, plan_type, order_num, time_desc, title, content
      FROM life_plans
      WHERE user_id = ? AND plan_id = ? AND is_active = 1
      ORDER BY plan_type, order_num
    `).all(req.user.user_id, planData.planId);

    const dietPlans = planRows.filter(r => r.plan_type === 'diet');
    const exercisePlans = planRows.filter(r => r.plan_type === 'exercise');
    const otherPlans = planRows.filter(r => r.plan_type === 'other');

    success(res, {
      plan_id: planData.planId,
      diet_plans: dietPlans,
      exercise_plans: exercisePlans,
      other_plans: otherPlans || []
    }, '方案生成成功');
  } catch (e) {
    next(e);
  }
});
```

**PUT /adjust** `plan.js:141-220`：

```js
router.put('/adjust', authMiddleware, async (req, res, next) => {
  try {
    const err = validatePlanAdjust(req.body);
    if (err) throw new AppError(422, 'VALIDATION_ERROR', err);

    const latest = db.prepare(`
      SELECT age, gender, height, weight
      FROM user_risk_info WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(req.user.user_id);
    if (!latest) throw new AppError(422, 'VALIDATION_ERROR', '请先完成风险预测或提供健康信息');

    const healthInfo = {
      age: latest.age,
      gender: latest.gender,
      height: latest.height,
      weight: latest.weight
    };

    // 先调用 Dify
    const difyResponse = await callWorkflowBlocking(
      process.env.DIFY_PLAN_WORKFLOW_KEY,
      {
        health_info: healthInfo,
        preferences: {},
        feedback: req.body.feedback
      }
    );

    const { items } = await parsePlanOutput(
      difyResponse.data.outputs.text,
      process.env.DIFY_PLAN_WORKFLOW_KEY,
      callWorkflowBlocking,
      { health_info: healthInfo, preferences: {}, feedback: req.body.feedback }
    );

    // Dify 成功后，事务内：deactivate 旧方案 + 生成新 plan_id + 写入新方案
    const maxId = db.transaction(() => {
      db.prepare(`
        UPDATE life_plans SET is_active = 0, updated_at = datetime('now','localtime')
        WHERE user_id = ? AND plan_id = ?
      `).run(req.user.user_id, req.body.plan_id);

      const { maxId: nextId } = db.prepare(`
        SELECT COALESCE(MAX(plan_id), 0) + 1 AS maxId
        FROM life_plans WHERE user_id = ?
      `).get(req.user.user_id);

      const insertStmt = db.prepare(`
        INSERT INTO life_plans (user_id, plan_id, plan_type, order_num, time_desc, title, content, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `);
      for (const item of items) {
        insertStmt.run(
          req.user.user_id,
          nextId,
          item.plan_type,
          item.order_num,
          item.time_desc || '',
          item.title,
          item.content
        );
      }

      return nextId;
    })();

    const planRows = db.prepare(`
      SELECT id, plan_type, order_num, time_desc, title, content
      FROM life_plans
      WHERE user_id = ? AND plan_id = ? AND is_active = 1
      ORDER BY plan_type, order_num
    `).all(req.user.user_id, maxId);

    success(res, {
      plan_id: maxId,
      diet_plans: planRows.filter(r => r.plan_type === 'diet'),
      exercise_plans: planRows.filter(r => r.plan_type === 'exercise'),
      other_plans: planRows.filter(r => r.plan_type === 'other') || []
    }, '方案调整成功');
  } catch (e) {
    next(e);
  }
});
```

**checkIdempotent 保持原位置不变（第13-21行），仅调用时机变化**：不再在路由入口第25行调用，而是后移至 Dify 调用成功后、事务前。

#### 关键约束
- Dify 调用失败时，旧方案 `is_active` 仍为 `1`，`plan_id` 不变
- `checkIdempotent()` 仅在 Dify 成功后调用 → Dify 失败时用户可立即重试
- 成功生成后 30s 内重复请求返回 409 CONFLICT
- 涉及 `req.user.id` → `req.user.user_id` 的字段替换需与 Task 10 协同（此处使用 `user_id`）
- `GET /current` 端点（第102-139行）不受影响，保持不变

---

### Task 4: 新建 difyAuth.js 中间件

**文件**：`server/middleware/difyAuth.js`（新建）、`server/routes/admin.js`

**修改类型**：新建 + 修改

#### 当前状态

`admin.js:28`：
```js
router.post('/execute', authMiddleware, adminMiddleware, (req, res) => {
```

`server/middleware/difyAuth.js`：**不存在**

#### 目标状态

**新建** `server/middleware/difyAuth.js`（完整文件）：

```js
const crypto = require('crypto');

function difyAuthMiddleware(req, res, next) {
  const { api_key, user_id } = req.body;

  if (!api_key) {
    return next();
  }

  const expectedKey = process.env.DIFY_SERVICE_API_KEY;
  if (!expectedKey) {
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: '服务端DIFY_SERVICE_API_KEY未配置' }
    });
  }

  const apiKeyHash = crypto.createHash('sha256').update(api_key).digest();
  const expectedKeyHash = crypto.createHash('sha256').update(expectedKey).digest();

  let keyValid;
  try {
    keyValid = crypto.timingSafeEqual(apiKeyHash, expectedKeyHash);
  } catch (e) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: '无效API Key' }
    });
  }

  if (!keyValid) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: '无效API Key' }
    });
  }

  if (!user_id) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Dify回调缺少user_id参数' }
    });
  }

  req.difyAuth = { userId: user_id, mode: 'callback' };
  next();
}

module.exports = difyAuthMiddleware;
```

**修改** `admin.js:1-8`（增加引入）：

```js
const express = require('express');
const { db } = require('../db/database');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const difyAuthMiddleware = require('../middleware/difyAuth');
const { success, error, AppError } = require('../utils/response');
const { parsePagination, buildPagination } = require('../utils/pagination');
```

**修改** `admin.js:28`（中间件链）：

```js
router.post('/execute', authMiddleware, difyAuthMiddleware, (req, res) => {
```

注意：原 `adminMiddleware` 从 `/execute` 移除（`adminMiddleware` 仅用于 `/chat` 和 `/logs`），分级鉴权在路由处理器内部根据 `req.user.role` 实现。

#### 关键约束
- 中间件链顺序对齐设计文档 7.3.1 节（`optionalAuth, difyAuthMiddleware`）：
  ```js
  const optionalAuth = require('../middleware/optionalAuth');

  router.post('/execute', optionalAuth, difyAuthMiddleware, (req, res) => {
  ```
  - `optionalAuth` 检查 `Authorization` 头，有则注入 `req.user`（优先级高于 diffyAuth 的 `req.difyAuth`），无则放行
  - `difyAuthMiddleware` 检查 `req.body.api_key`，有则注入 `req.difyAuth` 并 `next()`，无则直接 `next()`
  - 路由处理器内两者均不存在的返回 401
- 双认证"或"关系：Dify Agent 回调不携带 Authorization 头，靠 `req.body.api_key` 通过 `difyAuthMiddleware` 认证；浏览器请求携带 JWT，靠 `optionalAuth` 认证

---

### Task 5: admin/execute 实现 tool_name 参数化工具分发（12 个工具完整实现）

**文件**：`server/routes/admin.js`
**修改类型**：修改（大幅扩展）

#### 当前状态

`admin.js:28-69`：仅处理 `sql` 字段，仅 SELECT，无 `tool_name` 分发。

#### 目标状态

将当前第 28-69 行的 `/execute` 路由处理器完整替换为以下实现（基于设计文档 7.3.3 节伪代码）：

```js
const express = require('express');
const { db } = require('../db/database');
const authMiddleware = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const adminMiddleware = require('../middleware/admin');
const difyAuthMiddleware = require('../middleware/difyAuth');
const { success, error, AppError } = require('../utils/response');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { encryptChatToken } = require('../utils/encryption');
const validateRowLevelPermission = require('../utils/validateRowLevelPermission');

const router = express.Router();

// === GET /logs 保持不变 (第10-26行) ===

// === POST /execute (替换第28-69行) ===
router.post('/execute', optionalAuth, difyAuthMiddleware, (req, res) => {
  const { sql, tool_name } = req.body;

  // --- 1. 确定操作者身份 ---
  let operatorId, operatorRole, authMode;

  if (req.difyAuth && req.difyAuth.mode === 'callback') {
    operatorId = req.difyAuth.userId;
    const userRow = db.prepare('SELECT role FROM users WHERE id = ?').get(operatorId);
    if (!userRow) {
      return error(res, 'FORBIDDEN', '操作者用户不存在', 403);
    }
    operatorRole = userRow.role;
    authMode = 'dify_callback';
  } else if (req.user) {
    operatorId = req.user.user_id;
    operatorRole = req.user.role;
    authMode = 'browser_direct';
  } else {
    return error(res, 'AUTH_REQUIRED', '未认证', 401);
  }

  // --- 2. tool_name 分发（按设计文档 7.3.3 节 dispatchParameterizedQuery 实现） ---
  if (tool_name) {
    const result = dispatchParameterizedQuery(db, tool_name, req.body, operatorId, operatorRole);
    if (result.error) {
      return error(res, result.error.code || 'FORBIDDEN', result.error.message, result.httpStatus || 403);
    }
    return res.status(200).json({
      success: true,
      data: { rows: result.rows, rowCount: result.rows.length, operation_type: result.operation_type || 'SELECT' }
    });
  }

  // --- 3. execute_SQL 兜底路径 ---
  if (!sql) {
    return error(res, 'BAD_REQUEST', '请求体必须包含 tool_name 或 sql 字段', 400);
  }

  // 防篡改拦截：禁止通过兜底路径修改 admin_logs
  if (/^\s*(INSERT|UPDATE|DELETE)\b.*?\badmin_logs\b/i.test(sql)) {
    insertAdminLog(operatorId, 'admin_text2sql_denied', sql, '试图修改审计日志被拒绝');
    return error(res, 'FORBIDDEN', '审计日志为系统生成，严禁任何角色篡改或删除', 403);
  }

  // 行级权限校验（非 admin 角色）
  if (operatorRole !== 'admin') {
    if (!validateRowLevelPermission(sql, operatorId)) {
      insertAdminLog(operatorId, 'user_text2sql_denied', sql, '行级权限拒绝');
      return error(res, 'FORBIDDEN', '仅允许操作本人数据', 403);
    }
  }

  // SQL 白名单校验
  if (!/^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i.test(sql)) {
    return error(res, 'FORBIDDEN', '仅允许SELECT/INSERT/UPDATE/DELETE操作，禁止DDL/DCL/TCL及其他语句类型', 403);
  }

  // 多语句检测
  if (sql.includes(';')) {
    const trimmedSql = sql.trim();
    if (trimmedSql.indexOf(';') !== trimmedSql.length - 1) {
      return error(res, 'FORBIDDEN', '禁止多语句执行', 403);
    }
  }

  // SQL 执行（事务包裹写操作 + admin_logs 原子记录）
  const sqlType = sql.trim().substring(0, 6).toUpperCase();
  let result;
  try {
    result = db.transaction(() => {
      const r = sqlType === 'SELECT' ? db.prepare(sql).all() : db.prepare(sql).run();
      if (sqlType !== 'SELECT') {
        insertAdminLog(operatorId,
          authMode === 'dify_callback' ? 'user_text2sql' : getOpType(sql),
          sql, '成功');
      }
      return r;
    })();
  } catch (err) {
    console.error('admin execute transaction failed:', err.message);
    return error(res, 'INTERNAL_ERROR', 'SQL 执行失败，事务已回滚', 500);
  }

  res.status(200).json({
    success: true,
    data: { rows: result, rowCount: Array.isArray(result) ? result.length : result.changes }
  });
});
```

**新增辅助函数**（追加到 `module.exports = router;` 之前的文件末尾）：

```js
function getOpType(sql) {
  const t = sql.trim().substring(0, 6).toUpperCase();
  if (t === 'SELECT') return 'SELECT';
  if (t === 'INSERT') return 'INSERT';
  if (t === 'UPDATE') return 'UPDATE';
  if (t === 'DELETE') return 'DELETE';
  return 'OTHER';
}

function insertAdminLog(operatorId, operationType, operationContent, operationResult) {
  try {
    db.prepare(`
      INSERT INTO admin_logs (operator_id, operation_type, operation_content, operation_result)
      VALUES (?, ?, ?, ?)
    `).run(operatorId, operationType, operationContent, operationResult);
  } catch (e) {
    console.error('[admin] insertAdminLog failed:', e.message);
  }
}

function dispatchParameterizedQuery(db, toolName, params, operatorId, operatorRole) {
  switch (toolName) {
    // === diabetes-assistant-agent 专用工具（7个）===

    case 'query_user_profile': {
      const targetId = operatorRole === 'admin' ? (params.user_id || operatorId) : operatorId;
      const rows = db.prepare(
        'SELECT id, username, role, avatar, created_at FROM users WHERE id = ?'
      ).all(targetId);
      return { rows };
    }

    case 'query_risk_history': {
      const targetUserId = operatorRole === 'admin' ? (params.user_id || operatorId) : operatorId;
      const rows = db.prepare(
        'SELECT id, user_id, age, gender, height, weight, family_history, diabetes_history, diabetes_type, result, created_at FROM user_risk_info WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
      ).all(targetUserId, params.limit || 10);
      return { rows };
    }

    case 'query_punch_records': {
      const targetUserId = operatorRole === 'admin' ? (params.user_id || operatorId) : operatorId;
      let sql = 'SELECT id, plan_item_id, punch_type, completion_status, remarks, punch_time FROM punch_in WHERE user_id = ?';
      const args = [targetUserId];
      if (params.start_date) { sql += ' AND punch_time >= ?'; args.push(params.start_date); }
      if (params.end_date) { sql += ' AND punch_time <= ?'; args.push(params.end_date); }
      if (params.punch_type) { sql += ' AND punch_type = ?'; args.push(params.punch_type); }
      sql += ' ORDER BY punch_time DESC LIMIT ?';
      args.push(params.limit || 30);
      const rows = db.prepare(sql).all(...args);
      return { rows };
    }

    case 'query_life_plans': {
      const targetUserId = operatorRole === 'admin' ? (params.user_id || operatorId) : operatorId;
      const rows = db.prepare(
        'SELECT id, plan_id, plan_type, order_num, time_desc, title, content, is_active, created_at FROM life_plans WHERE user_id = ? AND is_active = 1 ORDER BY plan_type, order_num'
      ).all(targetUserId);
      return { rows };
    }

    case 'query_health_advice': {
      const targetUserId = operatorRole === 'admin' ? (params.user_id || operatorId) : operatorId;
      const rows = db.prepare(
        'SELECT id, title, tags, content, created_at FROM life_advice WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
      ).all(targetUserId, params.limit || 10);
      return { rows };
    }

    case 'write_health_advice': {
      const targetUserId = operatorRole === 'admin' ? (params.user_id || operatorId) : operatorId;
      if (targetUserId !== operatorId && operatorRole !== 'admin') {
        return { error: { code: 'FORBIDDEN', message: '无权写入他人数据' }, httpStatus: 403 };
      }
      const tagsJson = JSON.stringify(params.tags || []);
      const info = db.prepare(
        'INSERT INTO life_advice (user_id, title, tags, content) VALUES (?, ?, ?, ?)'
      ).run(targetUserId, params.title, tagsJson, params.content);
      return { rows: [{ id: info.lastInsertRowid }], operation_type: 'INSERT' };
    }

    case 'update_user_profile': {
      const targetUserId = operatorRole === 'admin' ? (params.user_id || operatorId) : operatorId;
      if (targetUserId !== operatorId && operatorRole !== 'admin') {
        return { error: { code: 'FORBIDDEN', message: '无权修改他人资料' }, httpStatus: 403 };
      }
      const fields = params.fields || {};
      const keys = Object.keys(fields).filter(k => ['username', 'avatar', 'password_changed'].includes(k));
      if (keys.length === 0) return { rows: [] };
      const setClause = keys.map(k => `${k} = ?`).join(', ');
      const args = keys.map(k => fields[k]);
      args.push(targetUserId);
      const info = db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`).run(...args);
      return { rows: [{ changes: info.changes }], operation_type: 'UPDATE' };
    }

    // === admin-manager-agent 专用工具（5个，仅管理员可用）===

    case 'query_table': {
      if (operatorRole !== 'admin') {
        return { error: { code: 'FORBIDDEN', message: '仅管理员可执行此查询' }, httpStatus: 403 };
      }
      const validTables = ['users', 'doctor_information', 'articles', 'diabetes_types', 'article_collections', 'user_risk_info', 'life_plans', 'life_advice', 'punch_in', 'admin_logs'];
      if (!validTables.includes(params.table)) {
        return { error: { code: 'VALIDATION_ERROR', message: '无效表名' }, httpStatus: 400 };
      }
      let sql = `SELECT * FROM ${params.table}`;
      if (params.where) sql += ` WHERE ${params.where}`;
      if (params.order_by) sql += ` ORDER BY ${params.order_by}`;
      sql += ' LIMIT ? OFFSET ?';
      try {
        const rows = db.prepare(sql).all(params.limit || 20, params.offset || 0);
        return { rows };
      } catch (e) {
        return { error: { code: 'BAD_REQUEST', message: e.message }, httpStatus: 400 };
      }
    }

    case 'insert_record': {
      if (operatorRole !== 'admin') {
        return { error: { code: 'FORBIDDEN', message: '仅管理员可执行' }, httpStatus: 403 };
      }
      const validWriteTables = ['users', 'doctor_information', 'articles', 'diabetes_types', 'article_collections', 'user_risk_info', 'life_plans', 'life_advice', 'punch_in'];
      if (!validWriteTables.includes(params.table)) {
        return { error: { code: 'VALIDATION_ERROR', message: '无效表名或禁止修改审计日志' }, httpStatus: 400 };
      }
      const fields = { ...params.fields };
      const keys = Object.keys(fields);
      if (keys.length === 0) {
        return { error: { code: 'VALIDATION_ERROR', message: '缺少字段' }, httpStatus: 400 };
      }

      // chat_token 加密
      if (params.table === 'doctor_information' && fields.chat_token) {
        fields.chat_token = encryptChatToken(fields.chat_token);
      }

      const placeholders = keys.map(() => '?').join(', ');
      const args = keys.map(k => fields[k]);
      try {
        const info = db.prepare(`INSERT INTO ${params.table} (${keys.join(', ')}) VALUES (${placeholders})`).run(...args);
        return { rows: [{ id: info.lastInsertRowid }], operation_type: 'INSERT' };
      } catch (e) {
        return { error: { code: 'BAD_REQUEST', message: e.message }, httpStatus: 400 };
      }
    }

    case 'update_record': {
      if (operatorRole !== 'admin') {
        return { error: { code: 'FORBIDDEN', message: '仅管理员可执行' }, httpStatus: 403 };
      }
      const validWriteTables = ['users', 'doctor_information', 'articles', 'diabetes_types', 'article_collections', 'user_risk_info', 'life_plans', 'life_advice', 'punch_in'];
      if (!validWriteTables.includes(params.table)) {
        return { error: { code: 'VALIDATION_ERROR', message: '无效表名或禁止修改审计日志' }, httpStatus: 400 };
      }
      const fields = { ...params.fields };
      const keys = Object.keys(fields);
      if (keys.length === 0 || !params.where) {
        return { error: { code: 'VALIDATION_ERROR', message: '缺少字段或条件' }, httpStatus: 400 };
      }

      // chat_token 加密
      if (params.table === 'doctor_information' && fields.chat_token) {
        fields.chat_token = encryptChatToken(fields.chat_token);
      }

      const setClause = keys.map(k => `${k} = ?`).join(', ');
      const args = keys.map(k => fields[k]);
      try {
        const info = db.prepare(`UPDATE ${params.table} SET ${setClause} WHERE ${params.where}`).run(...args);
        return { rows: [{ changes: info.changes }], operation_type: 'UPDATE' };
      } catch (e) {
        return { error: { code: 'BAD_REQUEST', message: e.message }, httpStatus: 400 };
      }
    }

    case 'delete_record': {
      if (operatorRole !== 'admin') {
        return { error: { code: 'FORBIDDEN', message: '仅管理员可执行' }, httpStatus: 403 };
      }
      const validWriteTables = ['users', 'doctor_information', 'articles', 'diabetes_types', 'article_collections', 'user_risk_info', 'life_plans', 'life_advice', 'punch_in'];
      if (!validWriteTables.includes(params.table)) {
        return { error: { code: 'VALIDATION_ERROR', message: '无效表名或禁止修改审计日志' }, httpStatus: 400 };
      }
      if (!params.where) {
        return { error: { code: 'VALIDATION_ERROR', message: '缺少条件' }, httpStatus: 400 };
      }
      try {
        const info = db.prepare(`DELETE FROM ${params.table} WHERE ${params.where}`).run();
        return { rows: [{ changes: info.changes }], operation_type: 'DELETE' };
      } catch (e) {
        return { error: { code: 'BAD_REQUEST', message: e.message }, httpStatus: 400 };
      }
    }

    case 'get_table_schema': {
      if (operatorRole !== 'admin') {
        return { error: { code: 'FORBIDDEN', message: '仅管理员可执行' }, httpStatus: 403 };
      }
      try {
        const rows = db.prepare(`PRAGMA table_info(${params.table})`).all();
        return { rows };
      } catch (e) {
        return { error: { code: 'BAD_REQUEST', message: e.message }, httpStatus: 400 };
      }
    }

    default:
      return { error: { code: 'BAD_REQUEST', message: `未知的 tool_name: ${toolName}` }, httpStatus: 400 };
  }
}

// === POST /chat 新增（见 Task 7）===

// === 导出 ===
module.exports = router;
```

#### 关键约束
- 每个工具使用 `db.prepare(sql).all/bind/run(param)` 参数化绑定防 SQL 注入
- admin-manager-agent 的 5 个工具仅 `operatorRole === 'admin'` 可用，否则返回 403
- diabetes-assistant-agent 的 7 个工具：admin 可查指定 user_id，普通用户仅查本人
- `insert_record` / `update_record` 操作 `doctor_information` 表且含 `chat_token` 时需调用 `encryptChatToken()`（Task 8a）
- `tool_name` 不存在且 `sql` 存在 → 走 execute_SQL 兜底路径
- 未知 `tool_name` → 400 BAD_REQUEST
- 需要在 admin.js 头部新增引入：`const { encryptChatToken } = require('../utils/encryption');` 和 `const validateRowLevelPermission = require('../utils/validateRowLevelPermission');`

---

### Task 6: admin/execute 行级权限校验 — AST 解析方案（node-sql-parser）

**文件**：`server/utils/validateRowLevelPermission.js`（新建）、`server/routes/admin.js`

**修改类型**：新建 + 修改

#### 当前状态

`server/utils/validateRowLevelPermission.js`：**不存在**

#### 目标状态

**新建** `server/utils/validateRowLevelPermission.js`（完整文件）：

```js
const { Parser } = require('node-sql-parser');
const parser = new Parser();

const USER_SCOPED_TABLES = new Set([
  'user_risk_info', 'life_plans', 'life_advice',
  'punch_in', 'article_collections'
]);
const PUBLIC_READONLY_TABLES = new Set([
  'articles', 'doctor_information', 'diabetes_types'
]);
const AUDIT_LOG_TABLES = new Set(['admin_logs']);
const FORBIDDEN_TABLES = new Set(['users']);

function validateRowLevelPermission(sql, operatorId) {
  let ast;
  try {
    ast = parser.astify(sql, { database: 'sqlite' });
  } catch (e) {
    return false;
  }

  const stmt = Array.isArray(ast) ? ast[0] : ast;
  if (!stmt) return false;

  const tables = extractTableNames(stmt);

  if (tables.some(t => FORBIDDEN_TABLES.has(t.toLowerCase()))) {
    return false;
  }

  if (tables.some(t => PUBLIC_READONLY_TABLES.has(t.toLowerCase()))) {
    if (stmt.type && stmt.type !== 'select') return false;
  }

  if (tables.some(t => AUDIT_LOG_TABLES.has(t.toLowerCase()))) {
    if (stmt.type && stmt.type !== 'select') return false;
  }

  const userTables = tables.filter(t => USER_SCOPED_TABLES.has(t.toLowerCase()));
  if (userTables.length > 0) {
    const stmtType = stmt.type ? stmt.type.toLowerCase() : '';
    if (stmtType === 'select' || stmtType === 'update' || stmtType === 'delete') {
      if (!containsUserIdConstraint(stmt, operatorId, userTables)) {
        return false;
      }
    } else if (stmtType === 'insert') {
      if (!insertContainsUserId(stmt, operatorId)) {
        return false;
      }
    }
  }

  const unknownTables = tables.filter(t =>
    !FORBIDDEN_TABLES.has(t.toLowerCase()) &&
    !PUBLIC_READONLY_TABLES.has(t.toLowerCase()) &&
    !AUDIT_LOG_TABLES.has(t.toLowerCase()) &&
    !USER_SCOPED_TABLES.has(t.toLowerCase())
  );
  if (unknownTables.length > 0) {
    return false;
  }

  return true;
}

function extractTableNames(stmt) {
  const tables = new Set();

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (node.db && node.table) {
      tables.add(node.table);
    } else if (node.table) {
      tables.add(node.table);
    }

    if (node.from) walk(node.from);
    if (node.into) walk(node.into);
    if (node.join) walk(node.join);
    if (node.where) walk(node.where);
    if (node.columns) walk(node.columns);
    if (node.values) walk(node.values);
    if (node.set) walk(node.set);
    if (node.tableList) walk(node.tableList);

    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      if (typeof node[key] === 'object' && node[key] !== null) {
        walk(node[key]);
      }
    }
  }

  walk(stmt);
  return [...tables];
}

function containsUserIdConstraint(stmt, operatorId, userTables) {
  const userTableSet = new Set(userTables.map(t => t.toLowerCase()));
  let found = false;

  function walkWhere(node) {
    if (!node || typeof node !== 'object' || found) return;
    if (Array.isArray(node)) {
      node.forEach(walkWhere);
      return;
    }

    if (node.type === 'binary_expr' && node.operator === '=') {
      if (node.left && node.left.type === 'column_ref' && node.left.column === 'user_id') {
        if (node.right && node.right.type === 'number' && node.right.value === operatorId) {
          found = true;
          return;
        }
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      if (typeof node[key] === 'object' && node[key] !== null) {
        walkWhere(node[key]);
      }
    }
  }

  if (stmt.where) {
    walkWhere(stmt.where);
  }

  return found;
}

function insertContainsUserId(stmt, operatorId) {
  if (!stmt.columns || !stmt.values) return false;

  let colIndex = -1;
  const colList = Array.isArray(stmt.columns) ? stmt.columns : [];
  for (let i = 0; i < colList.length; i++) {
    const col = Array.isArray(colList[i]) ? colList[i][0] : colList[i];
    if (col && col.expr && col.expr.column === 'user_id') {
      colIndex = i;
      break;
    }
  }
  if (colIndex === -1) return false;

  const firstRow = Array.isArray(stmt.values[0]) ? stmt.values[0] : stmt.values;
  if (colIndex >= firstRow.length) return false;
  const val = firstRow[colIndex];
  if (val && val.type === 'number' && val.value === operatorId) return true;
  if (val && val.type === 'single_quote_string' && Number(val.value) === operatorId) return true;

  return false;
}

module.exports = validateRowLevelPermission;
```

**安装依赖**：
```bash
npm install node-sql-parser
```

**修改** `admin.js` 头部的引入（已完成于 Task 5）。

#### 关键约束
- AST 解析失败一律返回 `false`（fail-closed）
- `operatorId` 为后端数值，LLM 无法篡改
- admin 角色跳过校验（调用前判断 `operatorRole !== 'admin'`）
- 行级校验**仅**用于 `execute_SQL` 兜底路径，**不用于** `dispatchParameterizedQuery`（专用工具已内建权限约束）
- 需要在 `admin.js` 的 execute_SQL 兜底路径中调用（已在 Task 5 的目标代码中体现）

---

### Task 7: 新增 POST /api/admin/chat 端点

**文件**：`server/routes/admin.js`
**修改类型**：修改（新增路由）

#### 当前状态

`admin.js`：仅有 `GET /logs` 和 `POST /execute` 两个路由。

#### 目标状态

在 `admin.js` 中（`module.exports = router;` 之前）新增：

```js
router.post('/chat', authMiddleware, adminMiddleware, (req, res, next) => {
  try {
    const { message, conversation_id } = req.body || {};

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(422).json({
        error: { code: 'VALIDATION_ERROR', message: '消息不能为空' }
      });
    }

    proxyDifySSE({
      apiKey: process.env.DIFY_ADMIN_AGENT_KEY,
      query: message,
      conversationId: conversation_id,
      userId: req.user.user_id,
      res,
      req
    });
  } catch (e) {
    next(e);
  }
});
```

**修改** `admin.js` 头部引入，新增：

```js
const proxyDifySSE = require('../services/sseProxy');
```

#### 关键约束
- 使用 `authMiddleware` + `adminMiddleware`（确保 JWT 认证 + admin 角色）
- 参照 `assistant.js:9-30` 的 `proxyDifySSE` 实现模式
- 使用 `process.env.DIFY_ADMIN_AGENT_KEY` 作为 API Key

---

### Task 8a: chat_token AES-256-GCM 加密端实现

**文件**：`server/utils/encryption.js`（新建）、`server/routes/admin.js`

**修改类型**：新建 + 修改

#### 当前状态

`server/utils/encryption.js`：**不存在**

#### 目标状态

**新建** `server/utils/encryption.js`（完整文件）：

```js
const crypto = require('crypto');

let cachedSalt = null;

function getSalt() {
  if (cachedSalt) return cachedSalt;

  if (process.env.AES_SALT) {
    cachedSalt = Buffer.from(process.env.AES_SALT, 'hex');
    return cachedSalt;
  }

  cachedSalt = crypto.randomBytes(16);
  console.warn(
    '[encryption] AES_SALT 未设置，已自动生成 salt。请将以下值写入 .env 文件中的 AES_SALT= 环境变量以确保持久化：',
    cachedSalt.toString('hex')
  );
  return cachedSalt;
}

function deriveKey(salt) {
  const secret = process.env.JWT_SECRET || 'default_secret_change_me';
  return crypto.scryptSync(secret, salt, 32);
}

function encryptChatToken(plainToken) {
  const salt = getSalt();
  const key = deriveKey(salt);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('chat_token', 'utf-8'));

  let encrypted = cipher.update(plainToken, 'utf-8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  return iv.toString('base64') + ':' + authTag.toString('base64') + ':' + encrypted.toString('base64');
}

function decryptChatToken(encryptedToken) {
  const parts = encryptedToken.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }

  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const ciphertext = Buffer.from(parts[2], 'base64');

  const salt = getSalt();
  const key = deriveKey(salt);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from('chat_token', 'utf-8'));
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, undefined, 'utf-8');
  decrypted += decipher.final('utf-8');

  return decrypted;
}

module.exports = { encryptChatToken, decryptChatToken, deriveKey, getSalt };
```

**修改** `admin.js` 头部引入（已在 Task 5 中体现）：
```js
const { encryptChatToken } = require('../utils/encryption');
```

**修改** `.env`（第 8 行后追加）：
```
AES_SALT=
```

**修改** `.env.example`（第 8 行后追加）：
```
AES_SALT=
```

#### 关键约束
- 加密输出格式为 `base64:base64:base64`（iv:authTag:ciphertext）
- 使用 Node.js 内置 `crypto` 模块，无需额外依赖
- 相同明文每次加密输出不同（随机 IV 保证）
- `AES_SALT` 未设置时输出 warning 含生成的 salt hex 值

---

### Task 8b: chat_token 解密 + chat.js 集成

**文件**：`server/routes/chat.js`

**修改类型**：修改

#### 当前状态

`chat.js:19-27`：
```js
    const row = db.prepare('SELECT id, chat_token FROM doctor_information WHERE id = ?').get(req.params.id);
    if (!row) throw new AppError(404, 'NOT_FOUND', '医生不存在');
    if (!row.chat_token) throw new AppError(502, 'DIFY_ERROR', '医生未配置对话服务');

    proxyDifySSE({
      apiKey: row.chat_token,
      query: message,
      conversationId: conversation_id,
      userId: req.user.id,
      res,
      req
    });
```

#### 目标状态

`chat.js:1-5`（引入新增）：

```js
const express = require('express');
const { db } = require('../db/database');
const authMiddleware = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const proxyDifySSE = require('../services/sseProxy');
const { decryptChatToken } = require('../utils/encryption');
```

`chat.js:19-27`：

```js
    const row = db.prepare('SELECT id, chat_token FROM doctor_information WHERE id = ?').get(req.params.id);
    if (!row) throw new AppError(404, 'NOT_FOUND', '医生不存在');
    if (!row.chat_token) throw new AppError(502, 'DIFY_ERROR', '医生未配置对话服务');

    const decryptedToken = decryptChatToken(row.chat_token);

    proxyDifySSE({
      apiKey: decryptedToken,
      query: message,
      conversationId: conversation_id,
      userId: req.user.user_id,
      res,
      req
    });
```

#### 关键约束
- `decryptChatToken()` 已在 Task 8a 的 `encryption.js` 中实现
- 解密失败（密文格式错误或 authTag 不匹配）→ `decryptChatToken` 抛出异常 → 由全局错误处理器捕获返回 500

---

### Task 9: auth.js JWT 有效期对齐设计规范（24h）

**文件**：`server/routes/auth.js`、`.env`、`.env.example`

**修改类型**：修改

#### 当前状态

`auth.js:35`：
```js
    { expiresIn: '7d' }
```

`auth.js:74`：
```js
    { expiresIn: '7d' }
```

#### 目标状态

`auth.js:35`：
```js
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
```

`auth.js:74`：
```js
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
```

**修改** `.env`（第 8 行后追加）：
```
JWT_EXPIRES_IN=24h
```

**修改** `.env.example`（第 8 行后追加）：
```
JWT_EXPIRES_IN=24h
```

#### 关键约束
- 不设置 `JWT_EXPIRES_IN` 环境变量时默认使用 `24h`
- 现有所有 JWT Token 不受影响（新签发 Token 才按新有效期）

---

### Task 10: JWT Payload 字段名统一为 user_id

**文件**：11 个文件

**修改类型**：批量修改

#### 当前状态

`server/middleware/auth.js:28`：
```js
    req.user = { id: decoded.id, username: decoded.username, role: decoded.role };
```

`server/middleware/optionalAuth.js:14`：
```js
    req.user = { id: decoded.id, username: decoded.username, role: decoded.role };
```

所有路由文件中 43 处 `req.user.id` 引用。

#### 目标状态

**步骤 A**：修改中间件

`server/middleware/auth.js:28`：
```js
    req.user = { user_id: decoded.id, username: decoded.username, role: decoded.role };
```

`server/middleware/optionalAuth.js:14`：
```js
    req.user = { user_id: decoded.id, username: decoded.username, role: decoded.role };
```

**步骤 B**：批量替换 `req.user.id` → `req.user.user_id` 在以下文件中：

| 文件 | 当前引用数 | 修改方式 |
|------|-----------|---------|
| `server/routes/admin.js` | 1 处 (第60行) | 替换 `req.user.id` → `req.user.user_id` |
| `server/routes/articles.js` | 11 处 | 全部替换 |
| `server/routes/assistant.js` | 3 处 | 全部替换 |
| `server/routes/chat.js` | 1 处 | 替换（已在 Task 8b 中体现） |
| `server/routes/plan.js` | 11 处 | 全部替换（已在 Task 3 中体现） |
| `server/routes/punch.js` | 6 处 | 全部替换 |
| `server/routes/risk.js` | 3 处 | 全部替换 |
| `server/routes/upload.js` | 1 处 (第15行) | 替换 `req.user.id` → `req.user.user_id` |
| `server/routes/user.js` | 6 处 | 全部替换 |

**具体替换映射表**（**以下行号为修改前快照，执行时行号已随前置任务变化，请以 `rg "req\.user\.id\b" server/routes/` 搜索结果为准进行替换**）：

`admin.js:60`:
```js
    // 旧
    `).run(req.user.id, req.body.sql, rowCount);
    // 新
    `).run(req.user.user_id, req.body.sql, rowCount);
```

`articles.js` 中所有 11 处 `req.user.id` → `req.user.user_id`。

`assistant.js:23,38,42`:
```js
    // 第23行 旧: userId: req.user.id,
    // 第23行 新: userId: req.user.user_id,
    // 第38行 旧: ).all(req.user.id, limit, offset);
    // 第38行 新: ).all(req.user.user_id, limit, offset);
    // 第42行 旧: ).get(req.user.id);
    // 第42行 新: ).get(req.user.user_id);
```

`chat.js:27`（已在 Task 8b 中体现）：
```js
    // 旧: userId: req.user.id,
    // 新: userId: req.user.user_id,
```

`punch.js:23,30,55,114,118,128` — 全部 6 处替换。

`risk.js:112,146,164` — 全部 3 处替换。

`upload.js:15`:
```js
    // 旧
    cb(null, `user_${req.user.id}_${Date.now()}${ext}`);
    // 新
    cb(null, `user_${req.user.user_id}_${Date.now()}${ext}`);
```

`user.js:11,38,56,61,82,102` — 全部 6 处替换。

#### 关键约束
- `req.user.role` 保持不变（role 字段名不变）
- 替换范围：`server/routes/` 目录下所有 `.js` 文件
- 验证命令：`rg "req\.user\.id\b" server/routes/` 应无匹配
- `difyAuth` 中间件的 `req.difyAuth.userId`（camelCase）保持不变（独立认证上下文，非 req.user 子属性）
- 此任务应在 Task 3-5 之前完成（中间件先改为 `user_id`，后续新增代码方可直接使用 `req.user.user_id`；若在 Task 5 之后执行，则 admin.js 重写时引用的 `req.user.user_id` 在编码时不存在，`operatorId` 将为 `undefined`）

---

### Task 11: 环境变量名对齐检查（验证任务，无需修改代码）

**文件**：无需修改代码
**修改类型**：无

#### 当前状态（已验证通过）

| 代码文件 | 读取的变量 | .env 中变量 | 状态 |
|---------|-----------|------------|------|
| `database.js:10` | `DB_PATH` | `DB_PATH` | ✓ |
| `difyService.js:85` | `DIFY_API_BASE` | `DIFY_API_BASE` | ✓ |
| `sseProxy.js:10` | `DIFY_API_BASE` | `DIFY_API_BASE` | ✓ |

#### 关键约束
- 此为验证确认任务，无需修改任何代码
- 代码与 `.env`/`.env.example` 完全自洽

---

### Task 12: database.js 移除模块顶层副作用

**文件**：`server/db/database.js`、`server.js`

**修改类型**：修改

#### 当前状态

`database.js:33`：
```js
initDatabase();
```

`server.js:7`：
```js
initDatabase();
```

#### 目标状态

删除 `database.js:33`：
```js
// 此整行删除
```

`server.js:7` 保持不变：
```js
initDatabase();
```

#### 关键约束
- `server.js:7` 的显式调用保持不变
- 删除 `database.js:33` 的 `initDatabase()` 调用
- 启动服务器后数据库正常初始化（`server.js` 先 `require('./server/db/database')` 获取函数引用，再在第 7 行调用）

---

### Task 13: difyService.js Mock 模式检测改进

**文件**：`server/services/difyService.js`、`server/routes/plan.js`、`server/routes/risk.js`、`server/routes/articles.js`

**修改类型**：修改

#### 当前状态

`difyService.js:84-93`：
```js
async function callWorkflowBlocking(apiKey, inputs) {
  const baseUrl = process.env.DIFY_API_BASE;

  if (!baseUrl) {
    console.log('[difyService] Mock mode: returning mock data');
    if (inputs && (inputs.family_history !== undefined || inputs.diabetes_history !== undefined)) {
      return MOCK_RISK_DATA;
    }
    return MOCK_PLAN_DATA;
  }
  // ...
```

#### 目标状态

`difyService.js:84-93`：
```js
async function callWorkflowBlocking(apiKey, inputs, workflowType) {
  const baseUrl = process.env.DIFY_API_BASE;

  if (!baseUrl) {
    console.log('[difyService] Mock mode: returning mock data for', workflowType);
    if (workflowType === 'risk') return MOCK_RISK_DATA;
    if (workflowType === 'plan') return MOCK_PLAN_DATA;
    if (workflowType === 'article') return { data: { outputs: { text: '' } } };
    return MOCK_PLAN_DATA;
  }
  // ...
```

**修改** `plan.js` 的 Dify 调用行（已在 Task 3 中体现）：

第 48 行（现在 Task 3 重构后位置不同）：
```js
    const difyResponse = await callWorkflowBlocking(
      process.env.DIFY_PLAN_WORKFLOW_KEY,
      { health_info: ..., preferences: ... },
      'plan'
    );
```

**修改** `risk.js:53-56`：

`risk.js:53-56`：
```js
    const difyResponse = await callWorkflowBlocking(
      process.env.DIFY_RISK_WORKFLOW_KEY,
      difyInputs,
      'risk'
    );
```

**修改** `articles.js:102`：
```js
        const result = await callWorkflowBlocking(difyKey, { category }, 'article');
```

#### 关键约束
- 第三个参数 `workflowType` 为可选参数（为兼容旧调用，不传时降级为旧推断逻辑或默认返回 MOCK_PLAN_DATA）
- `articles.js` 当前自行处理 Mock（第98-99行：`if (!difyBase || !difyKey) { articleData = buildMockArticle(category); }`），升级后仍保留该降级逻辑，但 Dify 调用传入 `'article'` 类型
- 非 Mock 模式调用不受影响（第三个参数被忽略，只影响 Mock 分支）

---

### Task 14: validators.js 移除未使用的导入

**文件**：`server/utils/validators.js`

**修改类型**：修改

#### 当前状态

`validators.js:1`：
```js
const { error } = require('./response');
```

#### 目标状态

删除 `validators.js:1` 整行：
```js
// 此整行删除，后续行号前移 1
```

`validators.js:2`（原第3行）变为新第1行：
```js
function validateUsername(username) {
```

#### 关键约束
- `error` 从未在任何验证器函数中使用
- 服务器正常启动后所有验证器功能正常

---

### Task 15: planParser.js 放宽 JSON 正则顺序依赖

**文件**：`server/utils/planParser.js`

**修改类型**：修改

#### 当前状态

`planParser.js:63`：
```js
  const jsonPattern = /\{[^}]*"plan_type"\s*:\s*"(diet|exercise|other)"\s*,\s*"order_num"\s*:\s*(\d+)\s*,\s*"time_desc"\s*:\s*"([^"]*)"\s*,\s*"title"\s*:\s*"([^"]*)"\s*,\s*"content"\s*:\s*"([^"]*)"\s*\}/gi;
```

`planParser.js:75-86`：`labelPattern`（中文标签正则降级）

#### 目标状态

替换 `planParser.js:60-89` 的 `parsePlanOutputRegex` 函数：

```js
function parsePlanOutputRegex(text) {
  const items = [];

  const objPattern = /\{[^}]*\}/g;
  let objMatch;
  while ((objMatch = objPattern.exec(text)) !== null) {
    const objStr = objMatch[0];
    const planType = extractField(objStr, /"plan_type"\s*:\s*"(diet|exercise|other)"/);
    const orderNum = extractField(objStr, /"order_num"\s*:\s*(\d+)/);
    const timeDesc = extractField(objStr, /"time_desc"\s*:\s*"([^"]*)"/);
    const title = extractField(objStr, /"title"\s*:\s*"([^"]*)"/);
    const content = extractField(objStr, /"content"\s*:\s*"([^"]*)"/);

    if (planType && orderNum !== null && title) {
      items.push({
        plan_type: planType,
        order_num: Number(orderNum),
        time_desc: timeDesc || '',
        title: title,
        content: content || ''
      });
    }
  }

  return items.length > 0 ? items : null;
}

function extractField(text, regex) {
  const m = text.match(regex);
  return m ? m[1] : null;
}
```

删除原第 75-86 行的 `labelPattern` 中文标签正则块。

#### 关键约束
- 字段顺序随机的 JSON（如 `{"content":"xxx","title":"yyy","plan_type":"diet",...}`）→ 成功解析
- 字段缺失的 JSON 对象 → 跳过该对象
- 完全无法解析的文本 → 进入 LLM 二次调用降级（第34-55行逻辑不变）
- 不影响第7-26行的 JSON 优先解析路径

---

### Task 16: 对话历史会话列表实现

**文件**：`server/routes/chat.js`、`server/routes/assistant.js`、`server/services/difyService.js`

**修改类型**：修改

#### 当前状态

`chat.js:36-38`：
```js
router.get('/doctor/:id/conversations', authMiddleware, (_req, res) => {
  res.json({ success: true, message: '查询成功', data: [] });
});
```

`assistant.js:63-64`：
```js
router.get('/conversations', authMiddleware, (_req, res) => {
  res.json({ success: true, message: '查询成功', data: [] });
});
```

#### 目标状态

**新增** `difyService.js`（追加入 `module.exports` 之前）：

```js
async function callDifyGetConversations(apiKey, userId) {
  const baseUrl = process.env.DIFY_API_BASE;

  if (!baseUrl) {
    console.log('[difyService] Mock mode: returning empty conversations');
    return [];
  }

  const url = baseUrl.replace(/\/$/, '') + '/conversations?user=user-' + userId;

  try {
    const { status, body } = await httpRequest(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (status >= 200 && status < 300 && body && body.data) {
      return body.data.map(item => ({
        conversation_id: item.id,
        name: item.name || '',
        created_at: item.created_at ? new Date(item.created_at * 1000).toISOString() : ''
      }));
    }
  } catch (e) {
    console.error('[difyService] getConversations failed:', e.message);
  }

  return [];
}
```

**修改** `difyService.js` 的 `module.exports`（第134行）：
```js
module.exports = { callWorkflowBlocking, callDifyGetConversations };
```

**修改** `chat.js:36-38`：

```js
router.get('/doctor/:id/conversations', authMiddleware, async (req, res, next) => {
  try {
    const row = db.prepare('SELECT id, chat_token FROM doctor_information WHERE id = ?').get(req.params.id);
    if (!row) throw new AppError(404, 'NOT_FOUND', '医生不存在');
    if (!row.chat_token) throw new AppError(502, 'DIFY_ERROR', '医生未配置对话服务');

    const decryptedToken = decryptChatToken(row.chat_token);
    const conversations = await callDifyGetConversations(decryptedToken, req.user.user_id);

    res.json({ success: true, message: '查询成功', data: conversations });
  } catch (e) {
    next(e);
  }
});
```

**修改** `chat.js` 头部引入，新增：
```js
const { callDifyGetConversations } = require('../services/difyService');
```

**修改** `assistant.js:63-64`：

```js
router.get('/conversations', authMiddleware, async (req, res, next) => {
  try {
    const conversations = await callDifyGetConversations(
      process.env.DIFY_ASSISTANT_APP_KEY,
      req.user.user_id
    );
    res.json({ success: true, message: '查询成功', data: conversations });
  } catch (e) {
    next(e);
  }
});
```

**修改** `assistant.js` 头部引入，新增：
```js
const { callDifyGetConversations } = require('../services/difyService');
```

#### 关键约束
- `chat.js` 的 conversations 端点需先用 `decryptChatToken()` 解密 `chat_token`
- Dify 未配置时返回空数组 `[]`（降级处理，不报错）
- `callDifyGetConversations` 内部 try-catch 包裹，异常时返回空数组

---

### Task 17: admin.js SQL 关键字检查改进 — 改为统一白名单模式

**文件**：`server/routes/admin.js`

**修改类型**：修改（已在 Task 5 中覆盖）

#### 当前状态

`admin.js:33-46`：
```js
  const trimmed = req.body.sql.trim().toUpperCase();
  if (!trimmed.startsWith('SELECT')) {
    return error(res, 'FORBIDDEN', '仅允许执行 SELECT 查询', 403);
  }

  const forbidden = [
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE',
    'TRUNCATE', 'REPLACE', 'EXEC', 'EXECUTE', 'ATTACH', 'DETACH'
  ];
  for (const keyword of forbidden) {
    if (new RegExp('\\b' + keyword + '\\b', 'i').test(trimmed)) {
      return error(res, 'FORBIDDEN', `SQL 包含禁止操作: ${keyword}`, 403);
    }
  }
```

#### 目标状态

已在 Task 5 的目标代码中体现，核心修改：

1. 移除 `.toUpperCase()` 预处理
2. 将 `startsWith('SELECT')` + 黑名单循环替换为单一正则白名单：
   ```js
   if (!/^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i.test(sql)) {
     return error(res, 'FORBIDDEN', '仅允许SELECT/INSERT/UPDATE/DELETE操作，禁止DDL/DCL/TCL及其他语句类型', 403);
   }
   ```
3. 保留多语句检测
4. 删除 `forbidden` 数组和循环

#### 关键约束
- 合法列名如 `insert_count`、`update_time` 不再被误判
- `DROP TABLE users` → 被拒绝
- `select * from users`（小写）→ 通过

---

### Task 18: articles.js 统一日期格式

**文件**：`server/routes/articles.js`

**修改类型**：修改

#### 当前状态

`articles.js:133`：
```sql
strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')
```

DDL `init.sql` 各处使用：
```sql
datetime('now', 'localtime')
```
（输出格式为 `YYYY-MM-DD HH:MM:SS` 空格分隔）

#### 目标状态

采用**方案 A**（推荐），将 `articles.js:133` 改为与 DDL 一致的格式：

```sql
datetime('now', 'localtime')
```

即 `articles.js:133`：
```js
      VALUES (?, ?, ?, 'AI健康助手', ?, ?, ?, ?, datetime('now', 'localtime'))
```

#### 关键约束
- `datetime('now', 'localtime')` 输出空格分隔格式 `YYYY-MM-DD HH:MM:SS`，与其他表 DDL 默认值一致
- 仅改 `articles.js:133` 一处，不影响 `init.sql` 中的 DDL
- 前端日期解析需验证（空格分隔格式仍是有效 ISO8601 时间表示的变体）

---

### Task 19: upload.js 目录创建移入函数内部

**文件**：`server/routes/upload.js`

**修改类型**：修改

#### 当前状态

`upload.js:8-9`：
```js
const uploadDir = path.join(__dirname, '..', '..', 'static', 'uploads', 'avatars');
fs.mkdirSync(uploadDir, { recursive: true });
```

#### 目标状态

采用方案 B：将创建逻辑移入 `ensureUploadDir()` 函数，在 `server.js` 启动流程中显式调用。

`upload.js:8-9` 替换为：

```js
const uploadDir = path.join(__dirname, '..', '..', 'static', 'uploads', 'avatars');

function ensureUploadDir() {
  try {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
  } catch (e) {
    console.warn('[upload] 创建上传目录失败:', e.message);
  }
}
```

**修改** `upload.js` 的 `module.exports`（第56行），采用方案二（将 `ensureUploadDir` 挂载到 router 对象上导出，确保 `routes/index.js:19` 的 `require('./upload')` 仍返回 Express Router 实例）：
```js
router.ensureUploadDir = ensureUploadDir;
module.exports = router;
```

> 注意：不得使用 `module.exports = { router, ensureUploadDir }`（方案一），否则 `routes/index.js:19` 中 `router.use('/upload', require('./upload'))` 将收到 `{ router, ensureUploadDir }` 对象而非 Express Router 实例，导致服务器启动时 Express 抛出异常。

**修改** `server.js`（在第 7 行 `initDatabase()` 之前增加目录创建调用）：
```js
const uploadRoutes = require('./server/routes/upload');
initDatabase();
if (uploadRoutes.ensureUploadDir) {
  uploadRoutes.ensureUploadDir();
}
```

#### 关键约束
- 模块顶层不再有 `fs.mkdirSync` 同步 I/O 副作用
- 目录不存在且无写权限时，模块正常加载，`require('./routes/upload')` 不抛异常
- 目录创建失败时仅 `console.warn`，不影响服务器启动
- 上传请求到来时目录若不存在仍会失败 → 由 `multer` 的 diskStorage 回调抛出，返回 500

---

## 附录 A：文件修改矩阵

| 文件 | 涉及任务 | 操作类型 |
|------|---------|---------|
| `server/db/database.js` | Task 2, Task 12 | 添加 pragma + 删除自动调用 |
| `server/middleware/auth.js` | Task 10 | 字段名 id → user_id |
| `server/middleware/optionalAuth.js` | Task 10 | 字段名 id → user_id |
| `server/middleware/difyAuth.js` | Task 4 | **新建** |
| `server/utils/encryption.js` | Task 8a, Task 8b | **新建** |
| `server/utils/validateRowLevelPermission.js` | Task 6 | **新建** |
| `server/routes/admin.js` | Task 4, Task 5, Task 7, Task 8a, Task 10, Task 17 | 挂载中间件 + tool_name 分发 + chat 端点 + chat_token 加密 + 字段替换 + 统一白名单 |
| `server/routes/auth.js` | Task 9 | expiresIn 硬编码 → 环境变量 |
| `server/routes/plan.js` | Task 1, Task 3, Task 10, Task 13 | 命名修正 + 事务重构 + 字段替换 + 参数追加 |
| `server/routes/risk.js` | Task 1, Task 10, Task 13 | 命名修正 + 字段替换 + 参数追加 |
| `server/routes/chat.js` | Task 8b, Task 10, Task 16 | 解密 + 字段替换 + 会话列表 |
| `server/routes/assistant.js` | Task 10, Task 16 | 字段替换 + 会话列表 |
| `server/routes/articles.js` | Task 10, Task 13, Task 18 | 字段替换 + 参数追加 + 日期格式 |
| `server/routes/upload.js` | Task 10, Task 19 | 字段替换 + mkdirSync 重构 |
| `server/routes/user.js` | Task 10 | 字段替换 |
| `server/routes/punch.js` | Task 10 | 字段替换 |
| `server/services/difyService.js` | Task 13, Task 16 | workflowType 参数 + Conversations API |
| `server/utils/validators.js` | Task 14 | 删除未使用导入 |
| `server/utils/planParser.js` | Task 15 | 正则改为逐字段提取 |
| `.env` | Task 4, Task 7, Task 8a, Task 9 | 新增 AES_SALT, DIFY_SERVICE_API_KEY, DIFY_ADMIN_AGENT_KEY, JWT_EXPIRES_IN |
| `.env.example` | Task 4, Task 7, Task 8a, Task 9 | 同上 |

## 附录 B：推荐执行顺序

```
第1批 P0（顺序）：
  Task 1 → Task 2 → Task 3

第2批 P1（可并行）：
  Task 9 → Task 11

第3批 P2（按依赖序）：
  Task 10 → Task 4 → Task 6 → Task 8a → Task 8b → Task 5 → Task 7 → Task 12 → Task 19 → Task 16

第4批 P3（任意顺序）：
  Task 14 → Task 13 → Task 15 → Task 17（已在 Task 5 中覆盖） → Task 18
```

---

## 修订说明 R2

> 修订日期：2026-06-26
> 基于审查报告：`design_review_v1_r1.md`（1 严重 + 6 一般）

### R2-S1：Task 19 upload.js 导出方案选定

**问题**：原规格给出两种 `module.exports` 方案但未选定，若 Coder 选用方案一（`module.exports = { router, ensureUploadDir }`），`routes/index.js:19` 的 `require('./upload')` 将收到对象而非 Router 实例，服务器启动时 Express 抛出异常。

**修订**：
- 删除方案一，明确采用方案二（`router.ensureUploadDir = ensureUploadDir; module.exports = router`）
- 在方案二旁添加注释说明禁止使用方案一的理由
- `server.js` 调用代码统一为 `uploadRoutes.ensureUploadDir()` 调用方式

### R2-G1：Task 4 中间件链顺序对齐设计文档

**问题**：原规格最终中间件链为 `difyAuthMiddleware, optionalAuth`，与设计文档 7.3.1 节/7.3.3 节指定的 `optionalAuth, difyAuthMiddleware` 顺序不一致。

**修订**：
- Task 4 关键约束中最终方案改为 `router.post('/execute', optionalAuth, difyAuthMiddleware, ...)`
- Task 5 目标代码中 handler 声明同步修改

### R2-G2：Task 6 insertContainsUserId 死代码移除

**问题**：`insertContainsUserId` 函数中第 989-991 行存在死代码块（声明 `cols`/`vals` 后进入无效 for 循环，`colEntry` 未被使用，随后重新声明 `colIndex` 和 `colList`）。

**修订**：删除死代码块（`const cols = ...`、`const vals = ...` 及无效 for 循环），仅保留从 `let colIndex = -1;` 开始的正确实现。

### R2-G3：Task 10 "最后执行"约束与附录 B 顺序修正

**问题**：Task 10 关键约束写"最后执行"，但附录 B 将 Task 10 放在第 2 批（Task 3-5 之前），描述矛盾。若 Coder 严格按"最后执行"理解，则 Task 5（admin.js 重写）中 `req.user.user_id` 在编码时不存在。

**修订**：
- Task 10 关键约束改为"此任务应在 Task 3-5 之前完成（中间件先改为 `user_id`，后续新增代码方可直接使用）"
- 附录 B 将 Task 10 从第 2 批移至第 3 批最前（Task 4 之前）

### R2-G4：.env / .env.example 文件路径明确化

**问题**：全文中所有 `.env` 引用均未给出完整路径。实际文件位于项目根目录而非 `server/` 子目录。

**修订**：在文档头部新增"文件路径约定"提示，明确 `.env` / `.env.example` 指项目根目录。

### R2-G5：Task 10 行号映射表时效性标注

**问题**：行号映射表基于未修改代码，按附录 B 执行顺序 Task 10 之前已完成大量修改，行号已变化。

**修订**：在映射表上方新增醒目标注："以下行号为修改前快照，执行时行号已随前置任务变化，请以 `rg "req\.user\.id\b" server/routes/` 搜索结果为准进行替换"。

### R2-G6：Task 4 中间件链推理过程精简

**问题**：原规格对 `/execute` 中间件链描述了三次迭代（`authMiddleware, difyAuthMiddleware` → `difyAuthMiddleware, authMiddleware` → `difyAuthMiddleware, optionalAuth`），Coder 可能在中间步骤就开始编码。

**修订**：删除三次迭代的冗长推理过程，直接给出最终方案（对齐设计文档的 `optionalAuth, difyAuthMiddleware`），三个步骤的执行语义压缩为两段注释。
