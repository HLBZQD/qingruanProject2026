/**
 * KingbaseAdapter — KingbaseES 数据库适配器
 *
 * 基于 pg.Pool (node-postgres)，实现 DatabaseAdapter 接口。
 * 与 SqliteAdapter 保持相同调用契约，支持 Phase 1 双库并行验证。
 *
 * 关键设计：
 * - ? 占位符 → $N 占位符自动转换（状态机跳过字符串字面量）
 * - INSERT 自动追加 RETURNING id（node-sql-parser 检测）
 * - pg.types.setTypeParser 拦截 timestamp/jsonb 自动解析
 * - 时区验证（非 UTC 时仅警告不阻塞）
 * - pool.on('error') 防止进程崩溃
 */

const pg = require('pg');
const path = require('path');
const fs = require('fs');

// ========== pg 驱动类型解析器（模块级全局设置） ==========

pg.types.setTypeParser(1114, (val) => String(val));  // timestamp
pg.types.setTypeParser(1184, (val) => String(val));  // timestamptz
pg.types.setTypeParser(3802, (val) => String(val));  // jsonb
pg.types.setTypeParser(114, (val) => String(val));   // json

class KingbaseAdapter {
  /**
   * @param {object} options
   * @param {string} options.connectionString - DATABASE_URL
   * @param {number} [options.max=10]
   * @param {number} [options.min=2]
   * @param {number} [options.idleTimeoutMillis=30000]
   * @param {number} [options.connectionTimeoutMillis=5000]
   * @param {object|boolean} [options.ssl=false]
   */
  constructor(options = {}) {
    const poolConfig = {
      connectionString: options.connectionString,
      max: options.max || 10,
      min: options.min || 2,
      idleTimeoutMillis: options.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: options.connectionTimeoutMillis || 5000,
      ssl: options.ssl || false,
    };

    this.pool = new pg.Pool(poolConfig);

    // 连接池错误处理：防止空闲连接异常断开导致进程崩溃
    this.pool.on('error', (err, client) => {
      console.error('[KingbaseAdapter] 连接池空闲连接错误:', err.message);
      // pg.Pool 会自动创建新连接替换失效连接，不主动退出进程
    });
  }

  // ========== 占位符转换（? → $N） ==========

  /**
   * 将 SQL 中的 ? 占位符转换为 $1, $2, ... 格式
   * 使用状态机跳过单引号字符串字面量内的 ?
   *
   * @param {string} sql
   * @returns {string}
   */
  _convertPlaceholders(sql) {
    let result = '';
    let inString = false;
    let paramIndex = 1;

    for (let i = 0; i < sql.length; i++) {
      const ch = sql[i];
      const prev = i > 0 ? sql[i - 1] : '';

      if (ch === "'") {
        // 处理转义单引号 ''（连续两个单引号不翻转状态）
        if (inString && sql[i + 1] === "'") {
          result += "''";
          i++; // 跳过一个引号
          continue;
        }
        inString = !inString;
        result += ch;
      } else if (ch === '?' && !inString) {
        result += '$' + paramIndex;
        paramIndex++;
      } else {
        result += ch;
      }
    }

    return result;
  }

  // ========== INSERT RETURNING id 自动追加 ==========

  /**
   * 检测 SQL 是否为 INSERT 语句，若是且不含 RETURNING 则自动追加
   * 优先使用 node-sql-parser AST 解析，失败时回退到正则
   *
   * @param {string} sql
   * @returns {string}
   */
  _ensureReturningId(sql) {
    // 尝试 node-sql-parser
    try {
      const { Parser } = require('node-sql-parser');
      const parser = new Parser();
      const ast = parser.astify(sql, { database: 'PostgreSQL' });

      // astify 返回数组（多语句）或单个 AST 节点
      const statements = Array.isArray(ast) ? ast : [ast];
      const firstStmt = statements[0];

      if (firstStmt && firstStmt.type === 'insert' && !/RETURNING\s+/i.test(sql)) {
        return sql.trimEnd().replace(/;?\s*$/, '') + ' RETURNING id';
      }
    } catch {
      // node-sql-parser 解析失败，回退到正则
      console.warn('[KingbaseAdapter] node-sql-parser 解析 INSERT 失败，回退到正则。SQL: ' + sql.substring(0, 200));
      if (/^\s*INSERT\s+/i.test(sql) && !/RETURNING\s+/i.test(sql)) {
        return sql.trimEnd().replace(/;?\s*$/, '') + ' RETURNING id';
      }
    }

    return sql;
  }

  // ========== 数据库初始化 ==========

  async init() {
    const ddlPath = path.join(__dirname, '..', 'init_kingbase_ddl.sql');
    const seedPath = path.join(__dirname, '..', 'init_kingbase_seed.sql');

    // ---- DDL 阶段（事务外逐条执行，IF NOT EXISTS 保证幂等） ----
    const ddlSql = fs.readFileSync(ddlPath, 'utf-8');

    // 移除注释后按分号分割
    const cleaned = ddlSql
      .replace(/--[^\n]*/g, '')           // 单行注释
      .replace(/\/\*[\s\S]*?\*\//g, '');  // 多行注释

    const statements = [];
    let current = '';
    let inStr = false;

    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (ch === "'" && !inStr) {
        inStr = true;
        current += ch;
      } else if (ch === "'" && inStr) {
        if (cleaned[i + 1] === "'") {
          current += "''";
          i++;
        } else {
          inStr = false;
          current += ch;
        }
      } else if (ch === ';' && !inStr) {
        const trimmed = current.trim();
        if (trimmed) statements.push(trimmed);
        current = '';
      } else {
        current += ch;
      }
    }
    const last = current.trim();
    if (last) statements.push(last);

    // 逐条执行 DDL
    for (const stmt of statements) {
      try {
        await this.pool.query(stmt);
      } catch (err) {
        console.error('[KingbaseAdapter] DDL 执行失败，终止初始化:', err.message);
        console.error('[KingbaseAdapter] 失败的语句:', stmt.substring(0, 200));
        throw err;
      }
    }

    console.log('[KingbaseAdapter] DDL 初始化完成');

    // ---- 种子数据阶段（事务内执行） ----
    // 幂等检查：users 表非空则跳过
    const countResult = await this.pool.query('SELECT COUNT(*) AS count FROM users');
    if (parseInt(countResult.rows[0].count) > 0) {
      console.log('[KingbaseAdapter] 种子数据已存在，跳过初始化');
    } else {
      let seedSql = fs.readFileSync(seedPath, 'utf-8');

      // 运行时生成 admin123 的 bcrypt 哈希
      const bcrypt = require('bcryptjs');
      const hash = bcrypt.hashSync('admin123', 10);
      const replaced = seedSql.includes('__BCRYPT_HASH_PLACEHOLDER__');
      seedSql = seedSql.replace('__BCRYPT_HASH_PLACEHOLDER__', hash);
      if (!replaced) {
        console.warn('[KingbaseAdapter] 种子 SQL 中未找到 __BCRYPT_HASH_PLACEHOLDER__ 占位符，admin 密码可能未正确设置');
      }

      // 按分号分割种子 INSERT
      const seedStmts = seedSql
        .replace(/--[^\n]*/g, '')
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      // 事务内执行种子数据
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        for (const stmt of seedStmts) {
          await client.query(stmt);
        }
        await client.query('COMMIT');
        console.log('[KingbaseAdapter] 种子数据初始化完成');
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch (rbErr) {
          console.error('[KingbaseAdapter] ROLLBACK 失败:', rbErr.message);
        }
        throw err;
      } finally {
        client.release();
      }
    }

    // ---- 时区验证（不阻塞启动） ----
    try {
      const tzResult = await this.pool.query("SELECT current_setting('timezone') AS tz");
      const tz = tzResult.rows[0]?.tz || '';
      console.log(`[KingbaseAdapter] 服务器时区: ${tz}`);
      if (tz !== 'UTC' && tz !== 'Etc/UTC') {
        console.error(
          `[KingbaseAdapter] 警告：KingbaseES 服务器时区为 "${tz}"，非 UTC！` +
          'CURRENT_TIMESTAMP 将返回本地时间而非 UTC。请将 kingbase.conf 中 timezone 设置为 "UTC"。'
        );
      }
    } catch (err) {
      console.warn(`[KingbaseAdapter] 无法验证服务器时区: ${err.message}`);
    }
  }

  // ========== 查询接口 ==========

  async query(sql, params = []) {
    const converted = this._convertPlaceholders(sql);
    const result = await this.pool.query(converted, params);
    return result.rows;
  }

  async queryOne(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async execute(sql, params = []) {
    const sqlWithReturning = this._ensureReturningId(sql);
    const converted = this._convertPlaceholders(sqlWithReturning);
    const result = await this.pool.query(converted, params);

    // 提取 lastInsertId（来自 RETURNING id 或 SERIAL 序列）
    const lastInsertId = result.rows && result.rows.length > 0
      ? Number(result.rows[0].id)
      : 0;

    return {
      lastInsertId,
      changes: result.rowCount || 0,
    };
  }

  // ========== 事务 ==========

  async transaction(fn) {
    const client = await this.pool.connect();

    // 事务内适配器
    const clientAdapter = {
      query: async (sql, params = []) => {
        const converted = this._convertPlaceholders(sql);
        const r = await client.query(converted, params);
        return r.rows;
      },
      queryOne: async (sql, params = []) => {
        const rows = await clientAdapter.query(sql, params);
        return rows.length > 0 ? rows[0] : null;
      },
      execute: async (sql, params = []) => {
        const sqlWithReturning = this._ensureReturningId(sql);
        const converted = this._convertPlaceholders(sqlWithReturning);
        const r = await client.query(converted, params);
        return {
          lastInsertId: r.rows && r.rows.length > 0 ? Number(r.rows[0].id) : 0,
          changes: r.rowCount || 0,
        };
      },
    };

    try {
      await client.query('BEGIN');
      const result = await fn(clientAdapter);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('[KingbaseAdapter] ROLLBACK 失败:', rollbackErr.message);
      }
      throw err;
    } finally {
      client.release();
    }
  }

  // ========== 元数据 ==========

  async tableInfo(tableName) {
    const sql = `
      SELECT
        ordinal_position - 1 AS cid,
        column_name AS name,
        CASE
          WHEN udt_name = 'varchar' THEN 'VARCHAR(' || character_maximum_length || ')'
          WHEN udt_name = 'int4' THEN 'INTEGER'
          ELSE udt_name
        END AS type,
        CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull,
        column_default AS dflt_value,
        CASE WHEN column_name IN (
          SELECT kcu.column_name FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
          WHERE tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
        ) THEN 1 ELSE 0 END AS pk
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `;

    const result = await this.pool.query(sql, [tableName]);
    return result.rows;
  }

  // ========== 健康检查 ==========

  async healthCheck() {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  // ========== 关闭连接 ==========

  async close() {
    await this.pool.end();
    console.log('[KingbaseAdapter] 连接池已关闭');
  }
}

module.exports = { KingbaseAdapter };
