const express = require('express');
const { getAdapter } = require('../db/database');
const sql = require('../db/sql');
const { success, error, AppError } = require('../utils/response');
const { validatePunch } = require('../utils/validators');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { parseDateRange } = require('../utils/dateRange');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();

    const validationError = validatePunch(req.body);
    if (validationError) {
      return error(res, 'VALIDATION_ERROR', validationError, 422);
    }

    const planItem = await adapter.queryOne(
      'SELECT id, user_id FROM life_plans WHERE id = ? AND is_active = 1',
      [req.body.plan_id]
    );
    if (!planItem) {
      return error(res, 'NOT_FOUND', '方案项不存在或已失效', 404);
    }
    if (planItem.user_id !== req.user.user_id) {
      return error(res, 'FORBIDDEN', '无权操作他人方案', 403);
    }

    const result = await adapter.execute(
      'INSERT INTO punch_in (user_id, plan_item_id, punch_type, completion_status, remarks) VALUES (?, ?, ?, ?, ?)',
      [req.user.user_id, req.body.plan_id, req.body.punch_type, req.body.completion_status, req.body.remarks || '']
    );

    const punch = await adapter.queryOne(
      'SELECT p.id, p.user_id, p.plan_item_id, p.punch_time, p.punch_type, p.completion_status, p.remarks, l.title AS plan_title FROM punch_in p LEFT JOIN life_plans l ON p.plan_item_id = l.id WHERE p.id = ?',
      [result.lastInsertId]
    );

    success(res, punch, '打卡成功', 201);
  } catch (e) {
    next(e);
  }
});

router.get('/list', authMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const { page, pageSize, offset, limit } = parsePagination(req.query);

    const whereFragments = ['p.user_id = ?'];
    const params = [req.user.user_id];

    if (req.query.start_date) {
      whereFragments.push('p.punch_time >= ?');
      params.push(req.query.start_date);
    }
    if (req.query.end_date) {
      whereFragments.push('p.punch_time <= ?');
      params.push(req.query.end_date);
    }
    if (req.query.punch_type) {
      whereFragments.push('p.punch_type = ?');
      params.push(req.query.punch_type);
    }

    const whereClause = whereFragments.join(' AND ');

    const countRows = await adapter.query(
      `SELECT COUNT(*) AS total FROM punch_in p WHERE ${whereClause}`,
      params
    );
    const total = countRows[0].total;

    const rows = await adapter.query(
      `SELECT p.id, p.plan_item_id, p.punch_type, p.completion_status, p.remarks, p.punch_time, l.title AS plan_title FROM punch_in p LEFT JOIN life_plans l ON p.plan_item_id = l.id WHERE ${whereClause} ORDER BY p.punch_time DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const pagination = buildPagination(page, pageSize, total);
    res.status(200).json({ success: true, message: '查询成功', data: rows, pagination });
  } catch (e) {
    next(e);
  }
});

router.get('/analysis', authMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();

    const typeStats = await adapter.query(
      `SELECT punch_type, COUNT(*) AS total, COUNT(CASE WHEN completion_status = 'completed' THEN 1 END) AS completed FROM punch_in WHERE user_id = ? GROUP BY punch_type`,
      [req.user.user_id]
    );

    const countRows = await adapter.query(
      'SELECT COUNT(*) AS total_punches FROM punch_in WHERE user_id = ?',
      [req.user.user_id]
    );
    const totalPunches = countRows[0].total_punches;

    // 近 7 天趋势（JS 计算日期参数替代 SQLite datetime 算术）
    const sevenDaysAgo = sql.formatDateParam(new Date(Date.now() - 7 * 86400000));

    const trendRows = await adapter.query(
      'SELECT date(punch_time) AS date, punch_type, COUNT(*) AS count FROM punch_in WHERE user_id = ? AND punch_time >= ? GROUP BY date(punch_time), punch_type ORDER BY date ASC',
      [req.user.user_id, sevenDaysAgo]
    );

    success(res, {
      total_punches: totalPunches,
      type_stats: typeStats,
      trend_7d: trendRows
    }, '查询成功', 200);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
