/**
 * 数据库层入口
 *
 * Phase 0 双导出过渡模式：
 * - db: 旧接口（SqliteAdapter.db → better-sqlite3 Database 实例），供尚未改造的路由使用
 * - getAdapter(): 新接口，返回 DatabaseAdapter 实例，供已改造的路由使用
 * - initDatabase(): async 初始化函数
 *
 * Phase 0 完成后（全部路由改造完毕）：
 * - 移除 db 导出，仅保留 getAdapter() + initDatabase
 */

require('dotenv').config();
const { SqliteAdapter } = require('./adapter/SqliteAdapter');
const sql = require('./sql');

/**
 * @type {import('./adapter/SqliteAdapter').SqliteAdapter|null}
 */
let adapter = null;

/**
 * 初始化数据库（async）
 * 根据 DB_TYPE 环境变量选择适配器，执行 DDL + 种子数据
 */
async function initDatabase() {
  const dbType = process.env.DB_TYPE || 'sqlite';

  if (dbType === 'kingbase') {
    // KingbaseES 模式下检查必需环境变量
    const url = process.env.DATABASE_URL;
    if (!url) {
      console.error('[initDatabase] DB_TYPE=kingbase 但未配置 DATABASE_URL，应用无法启动');
      process.exit(1);
    }

    const { KingbaseAdapter } = require('./adapter/KingbaseAdapter');
    adapter = new KingbaseAdapter({
      connectionString: url,
      max: parseInt(process.env.DB_POOL_MAX) || 10,
      min: parseInt(process.env.DB_POOL_MIN) || 2,
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT) || 5000,
      ssl: process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : false,
    });
  } else {
    // SQLite 模式（默认）
    const dbPath = process.env.DB_PATH || './data/database.sqlite';
    adapter = new SqliteAdapter({ dbPath });
  }

  // 设置 SQL 方言
  sql.setDialect(dbType);

  // 执行初始化（DDL + 种子数据）
  try {
    await adapter.init();
    console.log(`[initDatabase] 数据库初始化完成 (${dbType})`);
  } catch (err) {
    console.error('[initDatabase] 数据库初始化失败:', err.message);
    process.exit(1);
  }

  // Phase 0 双导出：同时暴露旧 db 和新 getAdapter()
  if (dbType === 'sqlite') {
    module.exports.db = adapter.db;
  } else {
    // KingbaseES 模式：db 置为 null（旧路由无法工作，必须使用 adapter）
    module.exports.db = null;
  }

  return adapter;
}

/**
 * 获取当前适配器实例
 * @returns {import('./adapter/SqliteAdapter').SqliteAdapter|import('./adapter/KingbaseAdapter').KingbaseAdapter|null}
 */
function getAdapter() {
  return adapter;
}

module.exports = { getAdapter, initDatabase, db: null };
