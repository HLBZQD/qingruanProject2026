const express = require('express');
const { db } = require('../db/database');
const { success, AppError } = require('../utils/response');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT id, name, image, pathogenesis, manifestation, treatment FROM diabetes_types').all();
  success(res, rows, '查询成功', 200);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT id, name, image, pathogenesis, manifestation, treatment FROM diabetes_types WHERE id = ?').get(req.params.id);
  if (!row) throw new AppError(404, 'NOT_FOUND', '糖尿病类型不存在');
  success(res, row, '查询成功', 200);
});

module.exports = router;
