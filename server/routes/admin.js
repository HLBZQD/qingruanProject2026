const express = require('express');
const { getAdapter } = require('../db/database');
const authMiddleware = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const adminMiddleware = require('../middleware/admin');
const difyAuthMiddleware = require('../middleware/difyAuth');
const { success, error, AppError } = require('../utils/response');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { encryptChatToken } = require('../utils/encryption');
const validateRowLevelPermission = require('../utils/validateRowLevelPermission');
const proxyDifySSE = require('../services/sseProxy');

const router = express.Router();

// ========== 操作日志 ==========

router.get('/logs', authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const { page, pageSize, offset, limit } = parsePagination(req.query);

    const countRows = await adapter.query('SELECT COUNT(*) AS total FROM admin_logs');
    const total = countRows[0].total;

    const rows = await adapter.query(
      `SELECT al.id, al.operator_id, u.username AS operator_username,
              al.operation_type, al.operation_content, al.operation_result, al.operation_time
       FROM admin_logs al
       JOIN users u ON al.operator_id = u.id
       ORDER BY al.operation_time DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const pagination = buildPagination(page, pageSize, total);
    res.status(200).json({ success: true, message: '查询成功', data: rows, pagination });
  } catch (e) {
    next(e);
  }
});

// ========== 执行 SQL ==========

// WHERE 子句白名单校验（仅允许 column = value AND column = value 模式）
function parseWhereClause(where) {
  if (!where || typeof where !== 'string') return false;
  const parts = where.split(/\s+AND\s+/i);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*['"][^'"]*['"]$/.test(trimmed) &&
        !/^[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*\d+$/.test(trimmed)) {
      return false;
    }
  }
  return true;
}

router.post('/execute', optionalAuth, difyAuthMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const { sql, tool_name } = req.body;

    let operatorId, operatorRole, authMode;

    if (req.difyAuth && req.difyAuth.mode === 'callback') {
      operatorId = req.difyAuth.userId;
      const userRow = await adapter.queryOne('SELECT role FROM users WHERE id = ?', [operatorId]);
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

    if (tool_name) {
      const result = await dispatchParameterizedQuery(adapter, tool_name, req.body, operatorId, operatorRole);
      if (result.error) {
        return error(res, result.error.code || 'FORBIDDEN', result.error.message, result.httpStatus || 403);
      }
      return res.status(200).json({
        success: true,
        data: { rows: result.rows, rowCount: result.rows.length, operation_type: result.operation_type || 'SELECT' }
      });
    }

    if (!sql) {
      return error(res, 'BAD_REQUEST', '请求体必须包含 tool_name 或 sql 字段', 400);
    }

    // KingbaseES 下禁用 sql 模式（迁移计划 §9.2 Phase 1 策略）
    if (process.env.DB_TYPE === 'kingbase') {
      return error(res, 'FORBIDDEN',
        'KingbaseES 下仅支持 tool_name 参数化查询，不支持 sql 模式。请使用 tool_name 参数。', 400);
    }

    if (/^\s*(INSERT|UPDATE|DELETE)\b.*?\badmin_logs\b/i.test(sql)) {
      await insertAdminLog(adapter, operatorId, 'admin_text2sql_denied', sql, '试图修改审计日志被拒绝');
      return error(res, 'FORBIDDEN', '审计日志为系统生成，严禁任何角色篡改或删除', 403);
    }

    if (operatorRole !== 'admin') {
      if (!validateRowLevelPermission(sql, operatorId)) {
        await insertAdminLog(adapter, operatorId, 'user_text2sql_denied', sql, '行级权限拒绝');
        return error(res, 'FORBIDDEN', '仅允许操作本人数据', 403);
      }
    }

    if (!/^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i.test(sql)) {
      return error(res, 'FORBIDDEN', '仅允许SELECT/INSERT/UPDATE/DELETE操作，禁止DDL/DCL/TCL及其他语句类型', 403);
    }

    if (sql.includes(';')) {
      const trimmedSql = sql.trim();
      if (trimmedSql.indexOf(';') !== trimmedSql.length - 1) {
        return error(res, 'FORBIDDEN', '禁止多语句执行', 403);
      }
    }

    const sqlType = sql.trim().substring(0, 6).toUpperCase();
    let result;
    result = await adapter.transaction(async (tx) => {
      const r = sqlType === 'SELECT'
        ? await tx.query(sql, [])
        : await tx.execute(sql, []);

      if (sqlType !== 'SELECT') {
        await tx.execute(
          'INSERT INTO admin_logs (operator_id, operation_type, operation_content, operation_result) VALUES (?, ?, ?, ?)',
          [operatorId, authMode === 'dify_callback' ? 'user_text2sql' : getOpType(sql), sql, '成功']
        );
      }
      return r;
    });

    res.status(200).json({
      success: true,
      data: { rows: result, rowCount: Array.isArray(result) ? result.length : result.changes }
    });
  } catch (e) {
    next(e);
  }
});

// ========== 管理对话 ==========

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

// ========== 辅助函数 ==========

function getOpType(sql) {
  const t = sql.trim().substring(0, 6).toUpperCase();
  if (t === 'SELECT') return 'SELECT';
  if (t === 'INSERT') return 'INSERT';
  if (t === 'UPDATE') return 'UPDATE';
  if (t === 'DELETE') return 'DELETE';
  return 'OTHER';
}

async function insertAdminLog(adapter, operatorId, operationType, operationContent, operationResult) {
  try {
    await adapter.execute(
      'INSERT INTO admin_logs (operator_id, operation_type, operation_content, operation_result) VALUES (?, ?, ?, ?)',
      [operatorId, operationType, operationContent, operationResult]
    );
  } catch (e) {
    console.error('[admin] insertAdminLog failed:', e.message);
  }
}

function splitByAnd(str) {
  const parts = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "'") {
      inQuotes = !inQuotes;
      current += ch;
    } else if (!inQuotes && str.substring(i, i + 5).toUpperCase() === ' AND ') {
      parts.push(current.trim());
      current = '';
      i += 4;
    } else {
      current += ch;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function parseWhereClause(whereStr) {
  if (!whereStr || typeof whereStr !== 'string' || whereStr.trim().length === 0) {
    return { conditions: [], isValid: false };
  }

  const trimmed = whereStr.trim();
  const parts = splitByAnd(trimmed);
  const conditions = [];

  for (const part of parts) {
    const trimmedPart = part.trim();
    // 仅允许: column_name = value
    // column_name: 字母/下划线开头，字母数字下划线组成
    // value: 单引号字符串或数字
    const match = trimmedPart.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
    if (!match) {
      return { conditions: [], isValid: false };
    }

    const column = match[1];
    const valueStr = match[2].trim();
    let value;

    // 字符串字面量 (单引号包裹)
    if (valueStr.startsWith("'") && valueStr.endsWith("'")) {
      value = valueStr.slice(1, -1);
      // 拒绝空字符串值（如 ''）
      if (value.length === 0) {
        return { conditions: [], isValid: false };
      }
    } else if (!isNaN(Number(valueStr)) && valueStr !== '') {
      // 数值字面量
      value = Number(valueStr);
    } else {
      // 不支持的格式（如函数调用、子查询、运算符等）
      return { conditions: [], isValid: false };
    }

    conditions.push({ column, value });
  }

  return { conditions, isValid: conditions.length > 0 };
}

async function dispatchParameterizedQuery(adapter, toolName, params, operatorId, operatorRole) {
  switch (toolName) {
    case 'query_user_profile': {
      const targetId = operatorRole === 'admin' ? (params.user_id || operatorId) : operatorId;
      const rows = await adapter.query(
        'SELECT id, username, role, avatar, created_at FROM users WHERE id = ?',
        [targetId]
      );
      return { rows };
    }

    case 'query_risk_history': {
      const targetUserId = operatorRole === 'admin' ? (params.user_id || operatorId) : operatorId;
      const rows = await adapter.query(
        'SELECT id, user_id, age, gender, height, weight, family_history, diabetes_history, diabetes_type, result, created_at FROM user_risk_info WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
        [targetUserId, params.limit || 10]
      );
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
      const rows = await adapter.query(sql, args);
      return { rows };
    }

    case 'query_life_plans': {
      const targetUserId = operatorRole === 'admin' ? (params.user_id || operatorId) : operatorId;
      const rows = await adapter.query(
        'SELECT id, plan_id, plan_type, order_num, time_desc, title, content, is_active, created_at FROM life_plans WHERE user_id = ? AND is_active = 1 ORDER BY plan_type, order_num',
        [targetUserId]
      );
      return { rows };
    }

    case 'query_health_advice': {
      const targetUserId = operatorRole === 'admin' ? (params.user_id || operatorId) : operatorId;
      const rows = await adapter.query(
        'SELECT id, title, tags, content, created_at FROM life_advice WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
        [targetUserId, params.limit || 10]
      );
      return { rows };
    }

    case 'write_health_advice': {
      const targetUserId = operatorRole === 'admin' ? (params.user_id || operatorId) : operatorId;
      if (targetUserId !== operatorId && operatorRole !== 'admin') {
        return { error: { code: 'FORBIDDEN', message: '无权写入他人数据' }, httpStatus: 403 };
      }
      const tagsJson = JSON.stringify(params.tags || []);
      const info = await adapter.execute(
        'INSERT INTO life_advice (user_id, title, tags, content) VALUES (?, ?, ?, ?)',
        [targetUserId, params.title, tagsJson, params.content]
      );
      return { rows: [{ id: info.lastInsertId }], operation_type: 'INSERT' };
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
      const info = await adapter.execute(`UPDATE users SET ${setClause} WHERE id = ?`, args);
      return { rows: [{ changes: info.changes }], operation_type: 'UPDATE' };
    }

    case 'query_table': {
      if (operatorRole !== 'admin') {
        return { error: { code: 'FORBIDDEN', message: '仅管理员可执行此查询' }, httpStatus: 403 };
      }
      const validTables = ['users', 'doctor_information', 'articles', 'diabetes_types', 'article_collections', 'user_risk_info', 'life_plans', 'life_advice', 'punch_in', 'admin_logs'];
      if (!validTables.includes(params.table)) {
        return { error: { code: 'VALIDATION_ERROR', message: '无效表名' }, httpStatus: 400 };
      }
      // WHERE 子句安全校验
      if (params.where && !parseWhereClause(params.where)) {
        return { error: { code: 'VALIDATION_ERROR', message: 'WHERE 子句格式不合法，仅支持 column = value AND column = value 模式' }, httpStatus: 400 };
      }
      // ORDER BY 安全校验：仅允许字母、数字、下划线、逗号、空格、点号
      if (params.order_by && !/^[a-zA-Z0-9_,.\s]+$/.test(params.order_by)) {
        return { error: { code: 'VALIDATION_ERROR', message: 'ORDER BY 子句格式不合法' }, httpStatus: 400 };
      }
      let sql = `SELECT * FROM ${params.table}`;
      const queryArgs = [];
      if (params.where) {
        const parsed = parseWhereClause(params.where);
        if (!parsed.isValid) {
          return { error: { code: 'VALIDATION_ERROR', message: 'WHERE 子句格式无效，仅允许 column = value AND column = value ... 模式' }, httpStatus: 400 };
        }
        const whereClauses = parsed.conditions.map(c => `${c.column} = ?`);
        sql += ` WHERE ${whereClauses.join(' AND ')}`;
        queryArgs.push(...parsed.conditions.map(c => c.value));
      }
      if (params.order_by) sql += ` ORDER BY ${params.order_by}`;
      sql += ' LIMIT ? OFFSET ?';
      queryArgs.push(params.limit || 20, params.offset || 0);
      try {
        const rows = await adapter.query(sql, queryArgs);
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

      if (params.table === 'doctor_information' && fields.chat_token) {
        fields.chat_token = encryptChatToken(fields.chat_token);
      }

      const placeholders = keys.map(() => '?').join(', ');
      const args = keys.map(k => fields[k]);
      try {
        const info = await adapter.execute(`INSERT INTO ${params.table} (${keys.join(', ')}) VALUES (${placeholders})`, args);
        return { rows: [{ id: info.lastInsertId }], operation_type: 'INSERT' };
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
      if (params.where && !parseWhereClause(params.where)) {
        return { error: { code: 'VALIDATION_ERROR', message: 'WHERE 子句格式不合法' }, httpStatus: 400 };
      }
      const fields = { ...params.fields };
      const keys = Object.keys(fields);
      if (keys.length === 0 || !params.where) {
        return { error: { code: 'VALIDATION_ERROR', message: '缺少字段或条件' }, httpStatus: 400 };
      }

      if (params.table === 'doctor_information' && fields.chat_token) {
        fields.chat_token = encryptChatToken(fields.chat_token);
      }

      const setClause = keys.map(k => `${k} = ?`).join(', ');
      const args = keys.map(k => fields[k]);

      const whereParsed = parseWhereClause(params.where);
      if (!whereParsed.isValid) {
        return { error: { code: 'VALIDATION_ERROR', message: 'WHERE 子句格式无效，仅允许 column = value AND column = value ... 模式' }, httpStatus: 400 };
      }
      const whereClauses = whereParsed.conditions.map(c => `${c.column} = ?`);
      args.push(...whereParsed.conditions.map(c => c.value));

      try {
        const info = await adapter.execute(`UPDATE ${params.table} SET ${setClause} WHERE ${whereClauses.join(' AND ')}`, args);
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
      const whereParsed = parseWhereClause(params.where);
      if (!whereParsed.isValid) {
        return { error: { code: 'VALIDATION_ERROR', message: 'WHERE 子句格式无效，仅允许 column = value AND column = value ... 模式' }, httpStatus: 400 };
      }
      const whereClauses = whereParsed.conditions.map(c => `${c.column} = ?`);
      const whereArgs = whereParsed.conditions.map(c => c.value);
      try {
        const info = await adapter.execute(`DELETE FROM ${params.table} WHERE ${whereClauses.join(' AND ')}`, whereArgs);
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
        const rows = await adapter.tableInfo(params.table);
        return { rows };
      } catch (e) {
        return { error: { code: 'BAD_REQUEST', message: e.message }, httpStatus: 400 };
      }
    }

    default:
      return { error: { code: 'BAD_REQUEST', message: `未知的 tool_name: ${toolName}` }, httpStatus: 400 };
  }
}

module.exports = router;
