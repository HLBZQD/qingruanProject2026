const jwt = require('jsonwebtoken');
const { error } = require('../utils/response');

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return error(res, 'AUTH_REQUIRED', '未登录或Token已过期', 401);
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return error(res, 'AUTH_REQUIRED', '未登录或Token已过期', 401);
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      let message;
      if (err.name === 'TokenExpiredError') {
        message = 'Token已过期';
      } else if (err.name === 'JsonWebTokenError') {
        message = 'Token无效';
      } else {
        message = 'Token验证失败';
      }
      return error(res, 'AUTH_REQUIRED', message, 401);
    }

    req.user = { user_id: decoded.id, username: decoded.username, role: decoded.role };
    next();
  });
}

module.exports = authMiddleware;
