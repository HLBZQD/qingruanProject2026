const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/auth');
const { success, error, AppError } = require('../utils/response');

const uploadDir = path.join(__dirname, '..', '..', 'static', 'uploads', 'avatars');

function ensureUploadDir() {
  try {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
  } catch (e) {
    console.warn('[upload] 创建上传目录失败:', e.message);
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // G29: 防御性检查，若中间件链被重排 req.user 为 undefined 时返回认证错误
    if (!req.user?.user_id) return cb(new Error('User not authenticated'));
    const ext = path.extname(file.originalname);
    cb(null, `user_${req.user.user_id}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(415, 'UNSUPPORTED_FILE_TYPE', '仅支持 JPEG/PNG/WebP 格式'));
    }
  }
});

const router = express.Router();

router.post('/avatar', authMiddleware, (req, res) => {
  upload.single('avatar')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return error(res, 'FILE_TOO_LARGE', '文件大小不能超过 2MB', 413);
      }
      return error(res, 'BAD_REQUEST', err.message, 400);
    }
    if (err instanceof AppError) {
      return error(res, err.code, err.message, err.statusCode);
    }
    if (err) {
      return error(res, 'INTERNAL_ERROR', err.message, 500);
    }
    if (!req.file) {
      return error(res, 'VALIDATION_ERROR', '请选择要上传的头像文件', 422);
    }
    const url = `/static/uploads/avatars/${req.file.filename}`;
    success(res, { url, filename: req.file.filename }, '上传成功', 200);
  });
});

router.ensureUploadDir = ensureUploadDir;
module.exports = router;
