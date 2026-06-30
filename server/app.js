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
    // 允许无 origin 请求（如 Postman、curl）
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      cb(null, true);
    } else {
      console.warn('[CORS] 拒绝来源:', origin);
      cb(null, false);
    }
  },
}));
// TODO(G30): 添加 express-rate-limit 全局限流中间件
app.use(express.json());
app.use('/api', apiRoutes);
app.use('/static', express.static(path.join(__dirname, '..', 'static')));

app.use(errorHandler);

module.exports = app;
