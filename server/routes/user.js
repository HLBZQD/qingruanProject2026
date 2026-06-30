const express = require('express');
const bcrypt = require('bcryptjs');
const { getAdapter } = require('../db/database');
const sql = require('../db/sql');
const { success, error, AppError } = require('../utils/response');
const { validateUsername, validatePassword, validateProfile } = require('../utils/validators');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.get('/profile', authMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const user = await adapter.queryOne('SELECT id, username, avatar, role, created_at FROM users WHERE id = ?', [req.user.user_id]);
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', '用户不存在');
    }

    return success(res, {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      role: user.role,
      created_at: user.created_at
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
