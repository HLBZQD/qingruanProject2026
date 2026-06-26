const { error } = require('../utils/response');

function adminMiddleware(req, res, next) {
  if (!req.user) {
    return error(res, 'AUTH_REQUIRED', '未登录或Token已过期', 401);
  }

  if (req.user.role !== 'admin') {
    return error(res, 'FORBIDDEN', '权限不足，仅管理员可操作', 403);
  }

  next();
}

module.exports = adminMiddleware;
