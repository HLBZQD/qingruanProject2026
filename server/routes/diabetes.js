const express = require('express');
const { getAdapter } = require('../db/database');
const { success, AppError } = require('../utils/response');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const rows = await adapter.query('SELECT id, name, image, pathogenesis, manifestation, treatment FROM diabetes_types');
    success(res, rows, '查询成功', 200);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const row = await adapter.queryOne('SELECT id, name, image, pathogenesis, manifestation, treatment FROM diabetes_types WHERE id = ?', [req.params.id]);
    if (!row) throw new AppError(404, 'NOT_FOUND', '糖尿病类型不存在');
    success(res, row, '查询成功', 200);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
