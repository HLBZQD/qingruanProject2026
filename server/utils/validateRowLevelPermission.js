const { Parser } = require('node-sql-parser');
const parser = new Parser();

const USER_SCOPED_TABLES = new Set([
  'user_risk_info', 'life_plans', 'life_advice',
  'punch_in', 'article_collections'
]);
const PUBLIC_READONLY_TABLES = new Set([
  'articles', 'doctor_information', 'diabetes_types'
]);
const AUDIT_LOG_TABLES = new Set(['admin_logs']);
const FORBIDDEN_TABLES = new Set(['users']);

function validateRowLevelPermission(sql, operatorId) {
  let ast;
  try {
    ast = parser.astify(sql, { database: 'sqlite' });
  } catch (e) {
    return false;
  }

  const stmt = Array.isArray(ast) ? ast[0] : ast;
  if (!stmt) return false;

  const tables = extractTableNames(stmt);

  if (tables.some(t => FORBIDDEN_TABLES.has(t.toLowerCase()))) {
    return false;
  }

  if (tables.some(t => PUBLIC_READONLY_TABLES.has(t.toLowerCase()))) {
    if (stmt.type && stmt.type !== 'select') return false;
  }

  if (tables.some(t => AUDIT_LOG_TABLES.has(t.toLowerCase()))) {
    if (stmt.type && stmt.type !== 'select') return false;
  }

  const userTables = tables.filter(t => USER_SCOPED_TABLES.has(t.toLowerCase()));
  if (userTables.length > 0) {
    const stmtType = stmt.type ? stmt.type.toLowerCase() : '';
    if (stmtType === 'select' || stmtType === 'update' || stmtType === 'delete') {
      if (!containsUserIdConstraint(stmt, operatorId, userTables)) {
        return false;
      }
    } else if (stmtType === 'insert') {
      if (!insertContainsUserId(stmt, operatorId)) {
        return false;
      }
    }
  }

  const unknownTables = tables.filter(t =>
    !FORBIDDEN_TABLES.has(t.toLowerCase()) &&
    !PUBLIC_READONLY_TABLES.has(t.toLowerCase()) &&
    !AUDIT_LOG_TABLES.has(t.toLowerCase()) &&
    !USER_SCOPED_TABLES.has(t.toLowerCase())
  );
  if (unknownTables.length > 0) {
    return false;
  }

  return true;
}

function extractTableNames(stmt) {
  const tables = new Set();

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (node.db && node.table) {
      tables.add(node.table);
    } else if (node.table) {
      tables.add(node.table);
    }

    if (node.from) walk(node.from);
    if (node.into) walk(node.into);
    if (node.join) walk(node.join);
    if (node.where) walk(node.where);
    if (node.columns) walk(node.columns);
    if (node.values) walk(node.values);
    if (node.set) walk(node.set);
    if (node.tableList) walk(node.tableList);

    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      if (typeof node[key] === 'object' && node[key] !== null) {
        walk(node[key]);
      }
    }
  }

  walk(stmt);
  return [...tables];
}

function containsUserIdConstraint(stmt, operatorId, userTables) {
  let found = false;

  function walkWhere(node) {
    if (!node || typeof node !== 'object' || found) return;
    if (Array.isArray(node)) {
      node.forEach(walkWhere);
      return;
    }

    if (node.type === 'binary_expr' && node.operator === '=') {
      if (node.left && node.left.type === 'column_ref' && node.left.column === 'user_id') {
        if (node.right && node.right.type === 'number' && node.right.value === operatorId) {
          found = true;
          return;
        }
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      if (typeof node[key] === 'object' && node[key] !== null) {
        walkWhere(node[key]);
      }
    }
  }

  if (stmt.where) {
    walkWhere(stmt.where);
  }

  return found;
}

function insertContainsUserId(stmt, operatorId) {
  if (!stmt.columns || !stmt.values) return false;

  let colIndex = -1;
  const colList = Array.isArray(stmt.columns) ? stmt.columns : [];
  for (let i = 0; i < colList.length; i++) {
    const col = Array.isArray(colList[i]) ? colList[i][0] : colList[i];
    if (col && col.expr && col.expr.column === 'user_id') {
      colIndex = i;
      break;
    }
  }
  if (colIndex === -1) return false;

  const firstRow = Array.isArray(stmt.values[0]) ? stmt.values[0] : stmt.values;
  if (colIndex >= firstRow.length) return false;
  const val = firstRow[colIndex];
  if (val && val.type === 'number' && val.value === operatorId) return true;
  if (val && val.type === 'single_quote_string' && Number(val.value) === operatorId) return true;

  return false;
}

module.exports = validateRowLevelPermission;
