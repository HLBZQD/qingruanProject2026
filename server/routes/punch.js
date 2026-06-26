const express = require('express');
const { db } = require('../db/database');
const { success, AppError } = require('../utils/response');
const { validatePunch } = require('../utils/validators');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { parseDateRange } = require('../utils/dateRange');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.post('/', authMiddleware, (req, res, next) => {
  try {
    const err = validatePunch(req.body);
    if (err) throw new AppError(422, 'VALIDATION_ERROR', err);

    const planRow = db.prepare(`
      SELECT id, user_id FROM life_plans WHERE id = ? AND is_active = 1
    `).get(req.body.plan_id);

    if (!planRow) {
      throw new AppError(404, 'NOT_FOUND', '方案项不存在');
    }
    if (planRow.user_id !== req.user.user_id) {
      throw new AppError(403, 'FORBIDDEN', '无权对此方案项打卡');
    }

    db.prepare(`
      INSERT INTO punch_in (user_id, plan_item_id, punch_type, completion_status, remarks)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.user.user_id, req.body.plan_id, req.body.punch_type, req.body.completion_status, req.body.remarks || '');

    const punchId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
    const row = db.prepare(`
      SELECT id, plan_item_id AS plan_id, punch_type, completion_status, remarks, punch_time
      FROM punch_in WHERE id = ?
    `).get(punchId);

    success(res, row, '打卡成功', 201);
  } catch (e) {
    next(e);
  }
});

router.get('/list', authMiddleware, (req, res, next) => {
  try {
    const { page, pageSize, offset, limit } = parsePagination(req.query);
    const { startDate, endDate } = parseDateRange(req.query);

    let punchType = null;
    if (req.query.punch_type && ['diet', 'exercise'].includes(req.query.punch_type)) {
      punchType = req.query.punch_type;
    }

    const whereFragments = ['p.user_id = ?'];
    const params = [req.user.user_id];

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

    const { total } = db.prepare(`
      SELECT COUNT(*) AS total FROM punch_in p
      WHERE ${whereClause}
    `).get(...params);

    const rows = db.prepare(`
      SELECT p.id,
             p.plan_item_id AS plan_id,
             l.title AS plan_title,
             p.punch_type,
             p.completion_status,
             p.remarks,
             p.punch_time
      FROM punch_in p
      LEFT JOIN life_plans l ON p.plan_item_id = l.id
      WHERE ${whereClause}
      ORDER BY p.punch_time DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const pagination = buildPagination(page, pageSize, total);

    res.json({
      success: true,
      message: '查询成功',
      data: rows,
      pagination
    });
  } catch (e) {
    next(e);
  }
});

router.get('/analysis', authMiddleware, (req, res, next) => {
  try {
    const typeRows = db.prepare(`
      SELECT punch_type,
             COUNT(CASE WHEN completion_status = 'completed' THEN 1 END) AS completed,
             COUNT(*) AS total
      FROM punch_in
      WHERE user_id = ?
      GROUP BY punch_type
    `).all(req.user.user_id);

    const { total_punches: totalPunches } = db.prepare(`
      SELECT COUNT(*) AS total_punches FROM punch_in WHERE user_id = ?
    `).get(req.user.user_id);

    const trendRows = db.prepare(`
      SELECT date(punch_time) AS date,
             punch_type,
             COUNT(CASE WHEN completion_status = 'completed' THEN 1 END) AS completed_count
      FROM punch_in
      WHERE user_id = ? AND punch_time >= datetime('now', 'localtime', '-7 days')
      GROUP BY date(punch_time), punch_type
      ORDER BY date ASC
    `).all(req.user.user_id);

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

    const adherenceComment = generateAdherenceComment(dietRate, exerciseRate, totalPunches);
    const improvementSuggestions = generateImprovementSuggestions(dietRate, exerciseRate, totalPunches);

    const analysisData = {
      diet_completion_rate: dietRate,
      exercise_completion_rate: exerciseRate,
      total_punches: totalPunches,
      last_7_days_trend: last7DaysTrend,
      adherence_comment: adherenceComment,
      improvement_suggestions: improvementSuggestions
    };

    success(res, analysisData, '查询成功');
  } catch (e) {
    next(e);
  }
});

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

module.exports = router;
