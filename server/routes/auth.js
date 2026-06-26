const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db/database');
const { success, error, AppError } = require('../utils/response');
const { validateRegister, validateLogin } = require('../utils/validators');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.post('/register', (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    throw new AppError(400, 'BAD_REQUEST', '请求体格式错误');
  }

  const { username, password } = req.body;

  const validationError = validateRegister(username, password);
  if (validationError) {
    return error(res, 'VALIDATION_ERROR', validationError, 422);
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return error(res, 'CONFLICT', '用户名已存在', 409);
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashedPassword);
  const userId = result.lastInsertRowid;

  const token = jwt.sign(
    { id: userId, username: username, role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  return success(res, {
    token,
    role: 'user',
    user: {
      id: userId,
      username,
      avatar: null
    }
  }, '注册成功', 201);
});

router.post('/login', (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    throw new AppError(400, 'BAD_REQUEST', '请求体格式错误');
  }

  const { username, password } = req.body;

  const validationError = validateLogin(username, password);
  if (validationError) {
    return error(res, 'VALIDATION_ERROR', validationError, 422);
  }

  const user = db.prepare('SELECT id, username, password, role, password_changed, avatar FROM users WHERE username = ?').get(username);
  if (!user) {
    return error(res, 'AUTH_INVALID', '用户名或密码错误', 401);
  }

  const isMatch = bcrypt.compareSync(password, user.password);
  if (!isMatch) {
    return error(res, 'AUTH_INVALID', '用户名或密码错误', 401);
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  const resData = {
    token,
    role: user.role,
    user: {
      id: user.id,
      username: user.username,
      avatar: user.avatar
    }
  };

  if (user.role === 'admin' && user.password_changed === 0) {
    resData.must_change_password = true;
  }

  return success(res, resData, '登录成功', 200);
});

router.post('/logout', authMiddleware, (req, res) => {
  return success(res, null, '已登出', 200);
});

module.exports = router;
