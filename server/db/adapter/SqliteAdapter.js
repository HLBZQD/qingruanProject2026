/**
 * SqliteAdapter — SQLite 数据库适配器
 *
 * 封装 better-sqlite3 为 Promise 风格 async API，
 * 实现 DatabaseAdapter 接口，与 KingbaseAdapter 保持相同调用契约。
 *
 * 关键设计：
 * - 所有查询方法声明为 async，使 better-sqlite3 的同步异常自动转为 rejected Promise
 * - transaction() 手动 BEGIN/COMMIT/ROLLBACK（因 fn 为 async，无法用 better-sqlite3 同步事务）
 * - this.db 属性暴露，供 Phase 0 双导出过渡
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class SqliteAdapter {
  /**
   * @param {{ dbPath: string }} options
   */
  constructor({ dbPath }) {
    const resolvedPath = path.resolve(dbPath);
    const dataDir = path.dirname(resolvedPath);

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    /** @type {import('better-sqlite3').Database} */
    this.db = new Database(resolvedPath);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
  }

  // ========== 数据库初始化 ==========

  async init() {
    const initSqlPath = path.join(__dirname, '..', 'init.sql');
    const seedSqlPath = path.join(__dirname, '..', 'seed.sql');

    // 执行 DDL（幂等：CREATE TABLE IF NOT EXISTS）
    const initSql = fs.readFileSync(initSqlPath, 'utf-8');
    this.db.exec(initSql);

    // 检查是否需要填充种子数据
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM users').get();
    if (row.count === 0) {
      let seedSql = fs.readFileSync(seedSqlPath, 'utf-8');

      // 运行时生成 admin123 的 bcrypt 哈希，替换占位符
      const bcrypt = require('bcryptjs');
      const hash = bcrypt.hashSync('admin123', 10);
      seedSql = seedSql.replace('$2a$10$PLACEHOLDER_BCRYPT_HASH_GOES_HERE', hash);

      this.db.exec(seedSql);
      console.log('[SqliteAdapter] 种子数据已初始化');
    }
  }

  // ========== 查询接口 ==========

  /**
   * 查询多行
   * @param {string} sql
   * @param {Array} [params=[]]
   * @returns {Promise<Array<object>>}
   */
  async query(sql, params = []) {
    return this.db.prepare(sql).all(...params);
  }

  /**
   * 查询单行
   * @param {string} sql
   * @param {Array} [params=[]]
   * @returns {Promise<object|null>}
   */
  async queryOne(sql, params = []) {
    const row = this.db.prepare(sql).get(...params);
    return row !== undefined ? row : null;
  }

  /**
   * 执行写操作
   * @param {string} sql
   * @param {Array} [params=[]]
   * @returns {Promise<{lastInsertId: number, changes: number}>}
   */
  async execute(sql, params = []) {
    const info = this.db.prepare(sql).run(...params);
    return {
      lastInsertId: Number(info.lastInsertRowid),
      changes: info.changes,
    };
  }

  // ========== 事务 ==========

  /**
   * 事务执行（手动 BEGIN/COMMIT/ROLLBACK）
   *
   * 不使用 better-sqlite3 的同步 db.transaction()，因为 fn 是 async 回调。
   * 改为手动管理事务边界，与 KingbaseAdapter 的事务实现模式一致。
   *
   * @param {Function} fn - async (txAdapter) => result
   * @returns {Promise<any>}
   */
  async transaction(fn) {
    // 构建事务内适配器（绑定到同一 db 实例）
    const txAdapter = {
      query: async (sql, params = []) => this.db.prepare(sql).all(...params),
      queryOne: async (sql, params = []) => {
        const row = this.db.prepare(sql).get(...params);
        return row !== undefined ? row : null;
      },
      execute: async (sql, params = []) => {
        const info = this.db.prepare(sql).run(...params);
        return { lastInsertId: Number(info.lastInsertRowid), changes: info.changes };
      },
    };

    this.db.prepare('BEGIN').run();
    try {
      const result = await fn(txAdapter);
      this.db.prepare('COMMIT').run();
      return result;
    } catch (err) {
      try {
        this.db.prepare('ROLLBACK').run();
      } catch (rollbackErr) {
        console.error('[SqliteAdapter] ROLLBACK 失败:', rollbackErr.message);
      }
      throw err;
    }
  }

  // ========== 元数据 ==========

  /**
   * 查询表结构（PRAGMA table_info 封装）
   * @param {string} tableName
   * @returns {Promise<Array<object>>}
   */
  async tableInfo(tableName) {
    return this.db.prepare(`PRAGMA table_info('${tableName}')`).all();
  }

  // ========== 健康检查 ==========

  async healthCheck() {
    try {
      this.db.prepare('SELECT 1').get();
      return this.db.open;
    } catch {
      return false;
    }
  }

  // ========== 关闭连接 ==========

  async close() {
    this.db.close();
  }
}

module.exports = { SqliteAdapter };
