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

// ========== 日志 ==========

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

    // 参数化工具分发
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

    // 原始 SQL 路径（兜底）
    if (!sql) {
      return error(res, 'BAD_REQUEST', '请求体必须包含 tool_name 或 sql 字段', 400);
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

    // 事务内执行
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
      let sql = `SELECT * FROM ${params.table}`;
      if (params.where) sql += ` WHERE ${params.where}`;
      if (params.order_by) sql += ` ORDER BY ${params.order_by}`;
      sql += ' LIMIT ? OFFSET ?';
      try {
        const rows = await adapter.query(sql, [params.limit || 20, params.offset || 0]);
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
      try {
        const info = await adapter.execute(`UPDATE ${params.table} SET ${setClause} WHERE ${params.where}`, args);
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
        const info = await adapter.execute(`DELETE FROM ${params.table} WHERE ${params.where}`, []);
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
