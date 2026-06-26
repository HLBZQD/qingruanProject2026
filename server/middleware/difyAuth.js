const crypto = require('crypto');

function difyAuthMiddleware(req, res, next) {
  const { api_key, user_id } = req.body;

  if (!api_key) {
    return next();
  }

  const expectedKey = process.env.DIFY_SERVICE_API_KEY;
  if (!expectedKey) {
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: '服务端DIFY_SERVICE_API_KEY未配置' }
    });
  }

  const apiKeyHash = crypto.createHash('sha256').update(api_key).digest();
  const expectedKeyHash = crypto.createHash('sha256').update(expectedKey).digest();

  let keyValid;
  try {
    keyValid = crypto.timingSafeEqual(apiKeyHash, expectedKeyHash);
  } catch (e) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: '无效API Key' }
    });
  }

  if (!keyValid) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: '无效API Key' }
    });
  }

  if (!user_id) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Dify回调缺少user_id参数' }
    });
  }

  req.difyAuth = { userId: user_id, mode: 'callback' };
  next();
}

module.exports = difyAuthMiddleware;
