const express = require('express');
const { db } = require('../db/database');
const { success, AppError } = require('../utils/response');
const { parsePagination, buildPagination } = require('../utils/pagination');

const router = express.Router();

router.get('/', (req, res) => {
  const { page, pageSize, offset, limit } = parsePagination(req.query);
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM doctor_information').get();
  const rows = db.prepare('SELECT id, name, department, title, description, avatar FROM doctor_information LIMIT ? OFFSET ?').all(limit, offset);
  const pagination = buildPagination(page, pageSize, total);
  res.status(200).json({ success: true, message: '查询成功', data: rows, pagination });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT id, name, department, title, description, avatar, created_at FROM doctor_information WHERE id = ?').get(req.params.id);
  if (!row) throw new AppError(404, 'NOT_FOUND', '医生不存在');
  success(res, row, '查询成功', 200);
});

module.exports = router;
