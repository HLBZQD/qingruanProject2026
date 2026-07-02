const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/index');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// G30: CORS origin 白名单（生产环境应限制为实际域名）
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) {
      return cb(null, true);
    }
    if (ALLOWED_ORIGINS.includes(origin)) {
      return cb(null, true);
    }
    // 允许同主机任意端口（Docker bridge、本地开发等场景）
    try {
      const host = new URL(origin).hostname;
      if (host === 'localhost' || host === '127.0.0.1' || host === 'host.docker.internal' || host === '222.241.14.34') {
        return cb(null, true);
      }
    } catch {}
    console.warn('[CORS] 拒绝来源:', origin);
    cb(null, false);
  },
}));
// TODO(G30): 添加 express-rate-limit 全局限流中间件
app.use(express.json());
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    console.error('[JSON-PARSE-ERROR]', err.message.slice(0, 200));
  }
  next(err);
});
app.use('/api', apiRoutes);
app.use('/static', express.static(path.join(__dirname, '..', 'static')));

app.use(errorHandler);

module.exports = app;
