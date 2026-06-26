const express = require('express');
const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, message: '服务运行正常' });
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
