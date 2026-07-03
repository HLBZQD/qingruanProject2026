const express = require('express');
const bcrypt = require('bcryptjs');
const { getAdapter } = require('../db/database');
const sql = require('../db/sql');
const { success, error, AppError } = require('../utils/response');
const { validateUsername, validatePassword, validateProfile } = require('../utils/validators');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

function calcStreakDays(dates) {
  if (!Array.isArray(dates) || dates.length === 0) return 0;
  const set = new Set(dates);
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function yesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  let cursor = todayStr();
  if (!set.has(cursor)) {
    cursor = yesterdayStr();
    if (!set.has(cursor)) return 0;
  }
  let streak = 0;
  const d = new Date();
  if (!set.has(todayStr())) d.setDate(d.getDate() - 1);
  while (set.has(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

router.get('/profile', authMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const user = await adapter.queryOne('SELECT id, username, avatar, role, created_at FROM users WHERE id = ?', [req.user.user_id]);
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', '用户不存在');
    }

    const riskRow = await adapter.queryOne(
      `SELECT ${sql.jsonFieldAs('result', 'risk_score', 'INTEGER')} AS risk_score FROM user_risk_info WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
      [req.user.user_id]
    );
    const healthScore = riskRow && riskRow.risk_score != null ? riskRow.risk_score : null;

    const punchRows = await adapter.query(
      'SELECT DISTINCT substr(punch_time, 1, 10) AS punch_date FROM punch_in WHERE user_id = ? ORDER BY punch_date DESC',
      [req.user.user_id]
    );
    const streakDays = calcStreakDays(punchRows.map(r => r.punch_date));

    return success(res, {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      role: user.role,
      created_at: user.created_at,
      risk_score: healthScore,
      streak_days: streakDays
    }, '查询成功', 200);
  } catch (e) {
    next(e);
  }
});

router.put('/profile', authMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();

    if (!req.body || typeof req.body !== 'object') {
      throw new AppError(400, 'BAD_REQUEST', '请求体格式错误');
    }

    const { username, avatar } = req.body;

    const validationError = validateProfile(username, avatar);
    if (validationError) {
      return error(res, 'VALIDATION_ERROR', validationError, 422);
    }

    if (typeof username === 'string' && username.trim()) {
      const existing = await adapter.queryOne('SELECT id FROM users WHERE username = ? AND id != ?', [username.trim(), req.user.user_id]);
      if (existing) {
        return error(res, 'CONFLICT', '用户名已存在', 409);
      }
    }

    const updates = [];
    const params = [];

    if (typeof username === 'string' && username.trim()) {
      updates.push('username = ?');
      params.push(username.trim());
    }
    if (typeof avatar === 'string' && avatar.trim()) {
      updates.push('avatar = ?');
      params.push(avatar.trim());
    }
    updates.push(`updated_at = ${sql.now()}`);
    params.push(req.user.user_id);

    const updateSql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    await adapter.execute(updateSql, params);

    const updatedUser = await adapter.queryOne('SELECT id, username, avatar FROM users WHERE id = ?', [req.user.user_id]);

    return success(res, {
      id: updatedUser.id,
      username: updatedUser.username,
      avatar: updatedUser.avatar
    }, '修改成功', 200);
  } catch (e) {
    next(e);
  }
});

router.put('/password', authMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();

    if (!req.body || typeof req.body !== 'object') {
      throw new AppError(400, 'BAD_REQUEST', '请求体格式错误');
    }

    const { old_password, new_password } = req.body;

    const pwError = validatePassword(new_password);
    if (pwError) {
      return error(res, 'VALIDATION_ERROR', pwError, 422);
    }

    const user = await adapter.queryOne('SELECT id, password, role, password_changed FROM users WHERE id = ?', [req.user.user_id]);
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', '用户不存在');
    }

    const skipOldPassword = !old_password && user.role === 'admin' && user.password_changed === 0;

    if (!skipOldPassword) {
      if (!old_password) {
        return error(res, 'VALIDATION_ERROR', '当前密码不能为空', 422);
      }
      const isMatch = bcrypt.compareSync(old_password, user.password);
      if (!isMatch) {
        return error(res, 'AUTH_INVALID', '当前密码错误', 401);
      }
    }

    const hashedPassword = bcrypt.hashSync(new_password, 10);

    await adapter.execute(
      `UPDATE users SET password = ?, password_changed = 1, updated_at = ${sql.now()} WHERE id = ?`,
      [hashedPassword, req.user.user_id]
    );

    return success(res, null, '密码修改成功', 200);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
