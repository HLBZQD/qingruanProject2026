const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db/database');
const { success, error, AppError } = require('../utils/response');
const { validateUsername, validatePassword, validateProfile } = require('../utils/validators');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.get('/profile', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, avatar, role, created_at FROM users WHERE id = ?').get(req.user.user_id);
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
});

router.put('/profile', authMiddleware, (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    throw new AppError(400, 'BAD_REQUEST', '请求体格式错误');
  }

  const { username, avatar } = req.body;

  const validationError = validateProfile(username, avatar);
  if (validationError) {
    return error(res, 'VALIDATION_ERROR', validationError, 422);
  }

  if (typeof username === 'string' && username.trim()) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username.trim(), req.user.user_id);
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
  updates.push("updated_at = datetime('now','localtime')");
  params.push(req.user.user_id);

  const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...params);

  const updatedUser = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(req.user.user_id);

  return success(res, {
    id: updatedUser.id,
    username: updatedUser.username,
    avatar: updatedUser.avatar
  }, '修改成功', 200);
});

router.put('/password', authMiddleware, (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    throw new AppError(400, 'BAD_REQUEST', '请求体格式错误');
  }

  const { old_password, new_password } = req.body;

  const pwError = validatePassword(new_password);
  if (pwError) {
    return error(res, 'VALIDATION_ERROR', pwError, 422);
  }

  const user = db.prepare('SELECT id, password, role, password_changed FROM users WHERE id = ?').get(req.user.user_id);
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

  db.prepare("UPDATE users SET password = ?, password_changed = 1, updated_at = datetime('now','localtime') WHERE id = ?")
    .run(hashedPassword, req.user.user_id);

  return success(res, null, '密码修改成功', 200);
});

module.exports = router;
