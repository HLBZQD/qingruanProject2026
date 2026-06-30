/**
 * SQL 方言辅助模块
 *
 * 根据当前数据库类型（SQLite / KingbaseES）输出对应的 SQL 片段。
 * 初始化时机：database.js 的 initDatabase() 在实例化 adapter 后调用 sql.setDialect()。
 */

/** @type {'sqlite'|'kingbase'|null} */
let currentDialect = null;

/**
 * 设置当前数据库方言
 * @param {'sqlite'|'kingbase'} dialect
 */
function setDialect(dialect) {
  if (dialect !== 'sqlite' && dialect !== 'kingbase') {
    throw new Error(`sql.setDialect: 不支持的数据库类型 "${dialect}"，仅支持 "sqlite" 或 "kingbase"`);
  }
  currentDialect = dialect;
}

/**
 * 获取当前数据库方言
 * @returns {'sqlite'|'kingbase'}
 */
function getDialect() {
  if (!currentDialect) {
    throw new Error('sql 方言未初始化，请在 initDatabase() 中调用 sql.setDialect()');
  }
  return currentDialect;
}

/**
 * 当前时间戳表达式（统一输出 CURRENT_TIMESTAMP = UTC）
 * @returns {string}
 */
function now() {
  return 'CURRENT_TIMESTAMP';
}

/**
 * 当前日期字符串表达式
 * @returns {string}
 */
function dateExpr() {
  const dialect = getDialect();
  if (dialect === 'sqlite') return "date('now','localtime')";
  return 'CURRENT_DATE::text';
}

/**
 * JSON 字段提取（单层路径）
 * **安全警告：col/path 参数直接拼入 SQL 表达式，必须是硬编码字面量，不可来自用户输入。**
 * @param {string} col - 列名（硬编码）
 * @param {string} path - JSON 路径（硬编码，不含 $. 前缀）
 * @returns {string} SQL 表达式
 */
function jsonField(col, path) {
  const dialect = getDialect();
  if (dialect === 'sqlite') return `json_extract(${col}, '$.${path}')`;
  return `${col}::jsonb->>'${path}'`;
}

/**
 * 带类型转换的 JSON 字段提取
 * @param {string} col - 列名
 * @param {string} path - JSON 路径
 * @param {string} type - 目标 SQL 类型（如 'INTEGER'）
 * @returns {string} SQL 表达式
 */
function jsonFieldAs(col, path, type) {
  const dialect = getDialect();
  if (dialect === 'sqlite') return `CAST(json_extract(${col}, '$.${path}') AS ${type})`;
  return `(${col}::jsonb->>'${path}')::${type}`;
}

/**
 * 将 JS Date 对象格式化为与 CURRENT_TIMESTAMP 一致的参数字符串（UTC）
 * 用于日期范围查询的 WHERE 子句参数
 * @param {Date} jsDate
 * @returns {string} YYYY-MM-DD HH:MM:SS 格式
 */
function formatDateParam(jsDate) {
  const Y = jsDate.getUTCFullYear();
  const M = String(jsDate.getUTCMonth() + 1).padStart(2, '0');
  const D = String(jsDate.getUTCDate()).padStart(2, '0');
  const h = String(jsDate.getUTCHours()).padStart(2, '0');
  const m = String(jsDate.getUTCMinutes()).padStart(2, '0');
  const s = String(jsDate.getUTCSeconds()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

module.exports = { setDialect, getDialect, now, date: dateExpr, jsonField, jsonFieldAs, formatDateParam };
