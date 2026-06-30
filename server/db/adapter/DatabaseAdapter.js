/**
 * DatabaseAdapter — 数据库适配器抽象接口
 *
 * 定义 SqliteAdapter 和 KingbaseAdapter 必须实现的统一接口。
 * 本文件仅作为接口契约参考（JSDoc @interface），不包含可执行逻辑。
 *
 * @interface
 */
class DatabaseAdapter {
  /**
   * 初始化数据库：执行 DDL 建表 + 种子数据初始化，幂等安全
   * @returns {Promise<void>}
   */
  async init() { throw new Error('Not implemented'); }

  /**
   * 查询多行数据
   * @param {string} sql - SQL 语句（? 占位符）
   * @param {Array} [params=[]] - 参数数组
   * @returns {Promise<Array<object>>} 结果行数组
   */
  async query(sql, params = []) { throw new Error('Not implemented'); }

  /**
   * 查询单行数据
   * @param {string} sql - SQL 语句（? 占位符）
   * @param {Array} [params=[]] - 参数数组
   * @returns {Promise<object|null>} 单行结果，无匹配时返回 null
   */
  async queryOne(sql, params = []) { throw new Error('Not implemented'); }

  /**
   * 执行写操作（INSERT/UPDATE/DELETE）
   * @param {string} sql - SQL 语句（? 占位符）
   * @param {Array} [params=[]] - 参数数组
   * @returns {Promise<{lastInsertId: number, changes: number}>}
   */
  async execute(sql, params = []) { throw new Error('Not implemented'); }

  /**
   * 事务执行
   * @param {Function} fn - async (txAdapter) => result
   *   txAdapter 提供 query()/queryOne()/execute()，绑定到事务连接
   * @returns {Promise<any>} fn 的返回值
   */
  async transaction(fn) { throw new Error('Not implemented'); }

  /**
   * 查询表结构信息（替代 SQLite PRAGMA table_info）
   * @param {string} tableName
   * @returns {Promise<Array<{cid: number, name: string, type: string, notnull: number, dflt_value: string|null, pk: number}>>}
   */
  async tableInfo(tableName) { throw new Error('Not implemented'); }

  /**
   * 健康检查
   * @returns {Promise<boolean>}
   */
  async healthCheck() { throw new Error('Not implemented'); }

  /**
   * 关闭数据库连接
   * @returns {Promise<void>}
   */
  async close() { throw new Error('Not implemented'); }
}

module.exports = DatabaseAdapter;
