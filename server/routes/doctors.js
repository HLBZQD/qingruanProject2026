const express = require('express');
const { getAdapter } = require('../db/database');
const { success, AppError } = require('../utils/response');
const { parsePagination, buildPagination } = require('../utils/pagination');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const { page, pageSize, offset, limit } = parsePagination(req.query);

    const countRows = await adapter.query('SELECT COUNT(*) AS total FROM doctor_information');
    const total = countRows[0].total;

    const rows = await adapter.query('SELECT id, name, department, title, description, avatar FROM doctor_information LIMIT ? OFFSET ?', [limit, offset]);
    const pagination = buildPagination(page, pageSize, total);
    res.status(200).json({ success: true, message: '查询成功', data: rows, pagination });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const row = await adapter.queryOne('SELECT id, name, department, title, description, avatar, created_at FROM doctor_information WHERE id = ?', [req.params.id]);
    if (!row) throw new AppError(404, 'NOT_FOUND', '医生不存在');
    success(res, row, '查询成功', 200);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
