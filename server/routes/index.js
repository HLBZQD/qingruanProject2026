const express = require('express');
const { getAdapter } = require('../db/database');
const router = express.Router();

router.get('/health', async (_req, res, next) => {
  try {
    const adapter = getAdapter();
    const ok = adapter ? await adapter.healthCheck() : false;
    if (ok) {
      res.json({ success: true, message: '服务运行正常', database: 'connected' });
    } else {
      res.status(503).json({ success: false, message: '数据库连接异常', database: 'disconnected' });
    }
  } catch (e) {
    next(e);
  }
});

router.use('/auth', require('./auth'));
router.use('/user', require('./user'));
router.use('/doctors', require('./doctors'));
router.use('/articles', require('./articles'));
router.use('/diabetes-types', require('./diabetes'));
router.use('/risk', require('./risk'));
router.use('/plan', require('./plan'));
router.use('/punch', require('./punch'));
router.use('/chat', require('./chat'));
router.use('/dify', require('./dify'));
router.use('/assistant', require('./assistant'));
router.use('/admin', require('./admin'));
router.use('/upload', require('./upload'));

router.use((_req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: '请求的资源不存在'
    }
  });
});

module.exports = router;
