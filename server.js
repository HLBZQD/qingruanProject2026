require('dotenv').config();
const { initDatabase, getAdapter } = require('./server/db/database');
const app = require('./server/app');

const PORT = process.env.PORT || 3000;

// 确保上传目录存在
const uploadRoutes = require('./server/routes/upload');
if (uploadRoutes.ensureUploadDir) {
  uploadRoutes.ensureUploadDir();
}

// async IIFE 启动：数据库初始化完成后才启动 HTTP 服务
(async () => {
  try {
    await initDatabase();

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('数据库初始化失败，应用无法启动:', err.message);
    process.exit(1);
  }
})();

// 优雅关闭处理
const gracefulShutdown = async (signal) => {
  console.log(`[Server] 收到 ${signal} 信号，开始优雅关闭...`);
  try {
    const adapter = getAdapter();
    if (adapter && adapter.close) {
      await adapter.close();
      console.log('[Server] 数据库连接池已关闭');
    }
    process.exit(0);
  } catch (err) {
    console.error('[Server] 优雅关闭失败:', err.message);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
