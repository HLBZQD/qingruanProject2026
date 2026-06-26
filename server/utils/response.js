const { AppError } = require('../middleware/errorHandler');

function success(res, data = null, message = '操作成功', statusCode = 200) {
  res.status(statusCode).json({ success: true, message, data });
}

function error(res, code, message, statusCode = 400) {
  res.status(statusCode).json({ error: { code, message } });
}

module.exports = { success, error, AppError };
