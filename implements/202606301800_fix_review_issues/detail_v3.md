# 详细设计（v3）

## 概述

修复2个P1后端安全缺陷，消除SQL注入漏洞和硬编码加密密钥风险。两个修复位于不同文件、彼此独立：

1. **S5**: `server/routes/admin.js` — 修复 `dispatchParameterizedQuery` 中三个工具操作（`query_table`、`update_record`、`delete_record`）将用户提供的 `params.where` 直接拼接到 SQL 字符串的SQL注入漏洞。方案：新增私有辅助函数 `parseWhereClause()` 将 WHERE 子句解析为结构化条件，验证后使用 `?` 参数化占位符重建。
2. **S6**: `server/utils/encryption.js` — 修复 `deriveKey()` 中 `process.env.JWT_SECRET` 未设置时静默回退到硬编码字符串 `'default_secret_change_me'` 的问题。方案：模块顶层添加 JWT_SECRET 环境变量校验，服务启动时即抛出明确错误；同步加固 `deriveKey()` 移除硬编码回退逻辑。
3. **todo.md 更新**: 将 S5/S6 在 `reviews/202606291800_full_review/todo.md` 中标记为已完成（格式参照 v1/v2 先例）。

### 本轮范围边界

v3 仅覆盖 **P1 本迭代（S5/S6）**——两个后端安全缺陷。本轮设计不覆盖其余 45 个未修复问题。

## 文件规划

| 文件路径 | 操作 | 职责 |
|---------|------|------|
| server/routes/admin.js | 修改 | 新增 `parseWhereClause()` 私有函数；修改 `query_table`/`update_record`/`delete_record` 三处 WHERE 子句拼接为参数化占位符 |
| server/utils/encryption.js | 修改 | 模块顶层添加 JWT_SECRET 存在性校验；`deriveKey()` 移除硬编码默认密钥回退 |
| reviews/202606291800_full_review/todo.md | 修改 | 将 S5/S6 标记为已完成，添加实现批次和完成日期戳 |

## 类型定义

本任务使用 JavaScript（CommonJS），不涉及 TypeScript 类型定义。所有函数签名和参数类型用 JSDoc 注释描述。

### parseWhereClause（新增私有函数）

**形态**：普通函数（模块私有，不导出）
**文件**：`server/routes/admin.js`（在 `dispatchParameterizedQuery` 之前定义）
**职责**：将 Dify Agent Text2SQL 工具回调传入的 WHERE 子句字符串解析为结构化条件数组，仅允许 `column = value AND column = value ...` 模式

**公开接口**：无（模块私有）

**函数签名**：

```javascript
/**
 * 将 WHERE 子句字符串解析为结构化条件数组。
 * 仅允许: column = value AND column = value ... 模式
 *
 * @param {string} whereStr - 用户提供的 WHERE 子句字符串
 * @returns {{ conditions: Array<{column: string, value: (string|number)}>, isValid: boolean }}
 *   - conditions: 解析出的条件数组；isValid 为 false 时为空数组
 *   - isValid: 解析是否成功
 */
function parseWhereClause(whereStr)
```

**内部辅助 `splitByAnd(str)`**（模块私有）：

```javascript
/**
 * 按 AND 关键字分割 WHERE 子句，尊重单引号内的字面量。
 * 例: "name = 'ANDERSON' AND status = 'active'" → ["name = 'ANDERSON'", "status = 'active'"]
 *
 * @param {string} str
 * @returns {string[]}
 */
function splitByAnd(str)
```

**构造方式**：普通函数声明，在 `admin.js` 模块顶层定义（`dispatchParameterizedQuery` 之前），由 `dispatchParameterizedQuery` 内部调用。

**类型关系**：无继承/实现。纯工具函数，不依赖外部模块。

## 修改规格

### 修改1：admin.js — 新增 parseWhereClause 私有辅助函数

**文件**：`server/routes/admin.js`
**操作**：修改（在 `dispatchParameterizedQuery` 函数定义之前、`insertAdminLog` 函数定义之后插入新函数定义）

**现状**：
- `dispatchParameterizedQuery`（第158-342行）中 `query_table`（第241行）、`update_record`（第301行）、`delete_record`（第320行）将 `params.where` 直接拼接到 SQL 模板字符串
- 项目已有参数化查询模式（`?` 占位符 + `.all()`/`.run()` 传参），如 `query_user_profile`（第162-164行）、`write_health_advice`（第211-213行）、`insert_record`（第270-273行）
- better-sqlite3 支持 `.prepare(sql).all(arg1, arg2, ...)` 和 `.run(arg1, arg2, ...)` 参数绑定语法

**变更**：

在第157行末尾（`insertAdminLog` 函数闭合 `}` 之后、第158行 `function dispatchParameterizedQuery` 之前）插入以下两个函数定义：

```javascript
function splitByAnd(str) {
  const parts = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "'") {
      inQuotes = !inQuotes;
      current += ch;
    } else if (!inQuotes && str.substring(i, i + 5).toUpperCase() === ' AND ') {
      parts.push(current.trim());
      current = '';
      i += 4; // skip ' AND '
    } else {
      current += ch;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function parseWhereClause(whereStr) {
  if (!whereStr || typeof whereStr !== 'string' || whereStr.trim().length === 0) {
    return { conditions: [], isValid: false };
  }

  const trimmed = whereStr.trim();
  const parts = splitByAnd(trimmed);
  const conditions = [];

  for (const part of parts) {
    const trimmedPart = part.trim();
    // 仅允许: column_name = value
    // column_name: 字母/下划线开头，字母数字下划线组成
    // value: 单引号字符串或数字
    const match = trimmedPart.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
    if (!match) {
      return { conditions: [], isValid: false };
    }

    const column = match[1];
    const valueStr = match[2].trim();
    let value;

    // 字符串字面量 (单引号包裹)
    if (valueStr.startsWith("'") && valueStr.endsWith("'")) {
      value = valueStr.slice(1, -1);
      // 拒绝空字符串值（如 ''）
      if (value.length === 0) {
        return { conditions: [], isValid: false };
      }
    } else if (!isNaN(Number(valueStr)) && valueStr !== '') {
      // 数值字面量
      value = Number(valueStr);
    } else {
      // 不支持的格式（如函数调用、子查询、运算符等）
      return { conditions: [], isValid: false };
    }

    conditions.push({ column, value });
  }

  return { conditions, isValid: conditions.length > 0 };
}
```

**行为契约**：
- 前置：`whereStr` 为字符串或 falsy 值
- 后置：
  - 合法输入（如 `"username = 'admin' AND status = 'active'"`）→ `{ conditions: [{column:'username', value:'admin'}, {column:'status', value:'active'}], isValid: true }`
  - 数值条件（如 `"id = 1"`）→ `{ conditions: [{column:'id', value:1}], isValid: true }`
  - 单条件（如 `"role = 'user'"`）→ `{ conditions: [{column:'role', value:'user'}], isValid: true }`
  - 空字符串/falsy → `{ conditions: [], isValid: false }`
  - 不支持的操作符（如 `>`, `<`, `!=`, `LIKE`, `IN`）→ `{ conditions: [], isValid: false }`
  - 子查询/函数调用 → `{ conditions: [], isValid: false }`
  - 值中含 AND 字面量（如 `"name = 'ANDERSON'"`）→ 正确解析（`splitByAnd` 尊重引号边界）
- 防御深度：column 名严格匹配 `[a-zA-Z_][a-zA-Z0-9_]*`，拒绝含空格、连字符、SQL关键字的列名

### 修改2：admin.js — query_table WHERE 子句参数化

**文件**：`server/routes/admin.js`
**操作**：修改（替换第240-246行 `query_table` case 中的 WHERE 拼接和查询执行逻辑）

**现状**（第240-246行）：
```javascript
      let sql = `SELECT * FROM ${params.table}`;
      if (params.where) sql += ` WHERE ${params.where}`;
      if (params.order_by) sql += ` ORDER BY ${params.order_by}`;
      sql += ' LIMIT ? OFFSET ?';
      try {
        const rows = db.prepare(sql).all(params.limit || 20, params.offset || 0);
        return { rows };
```

**变更**：替换为：

```javascript
      let sql = `SELECT * FROM ${params.table}`;
      const queryArgs = [];
      if (params.where) {
        const parsed = parseWhereClause(params.where);
        if (!parsed.isValid) {
          return { error: { code: 'VALIDATION_ERROR', message: 'WHERE 子句格式无效，仅允许 column = value AND column = value ... 模式' }, httpStatus: 400 };
        }
        const whereClauses = parsed.conditions.map(c => `${c.column} = ?`);
        sql += ` WHERE ${whereClauses.join(' AND ')}`;
        queryArgs.push(...parsed.conditions.map(c => c.value));
      }
      if (params.order_by) sql += ` ORDER BY ${params.order_by}`;
      sql += ' LIMIT ? OFFSET ?';
      queryArgs.push(params.limit || 20, params.offset || 0);
      try {
        const rows = db.prepare(sql).all(...queryArgs);
        return { rows };
```

**行为契约**：
- 前置：`params.table` 已通过白名单校验（第237行）；`params.where` 可为空（可选条件）
- 后置：
  - `params.where` 为空/未传 → 行为不变（无条件查询，仅 LIMIT/OFFSET 参数化）
  - `params.where` 合法 → WHERE 条件通过 `?` 占位符绑定，杜绝 SQL 注入
  - `params.where` 非法 → 返回 `VALIDATION_ERROR`，400 状态码
- 与旧版差异：
  - 旧版：`db.prepare(...).all(params.limit || 20, params.offset || 0)` — WHERE 值直接拼接，LIMIT/OFFSET 参数化
  - 新版：`db.prepare(...).all(...whereArgs, params.limit || 20, params.offset || 0)` — 所有用户输入均参数化
  - 旧版 SQL 例：`SELECT * FROM users WHERE role = 'admin' LIMIT ? OFFSET ?`（role 值未参数化）
  - 新版 SQL 例：`SELECT * FROM users WHERE role = ? LIMIT ? OFFSET ?`（全部参数化）

### 修改3：admin.js — update_record WHERE 子句参数化

**文件**：`server/routes/admin.js`
**操作**：修改（替换第298-305行 `update_record` case 中的 WHERE 拼接和查询执行逻辑）

**现状**（第290-305行）：
```javascript
      if (keys.length === 0 || !params.where) {
        return { error: { code: 'VALIDATION_ERROR', message: '缺少字段或条件' }, httpStatus: 400 };
      }

      if (params.table === 'doctor_information' && fields.chat_token) {
        fields.chat_token = encryptChatToken(fields.chat_token);
      }

      const setClause = keys.map(k => `${k} = ?`).join(', ');
      const args = keys.map(k => fields[k]);
      try {
        const info = db.prepare(`UPDATE ${params.table} SET ${setClause} WHERE ${params.where}`).run(...args);
        return { rows: [{ changes: info.changes }], operation_type: 'UPDATE' };
```

**变更**：替换第298-305行为：

```javascript
      const setClause = keys.map(k => `${k} = ?`).join(', ');
      const args = keys.map(k => fields[k]);

      const whereParsed = parseWhereClause(params.where);
      if (!whereParsed.isValid) {
        return { error: { code: 'VALIDATION_ERROR', message: 'WHERE 子句格式无效，仅允许 column = value AND column = value ... 模式' }, httpStatus: 400 };
      }
      const whereClauses = whereParsed.conditions.map(c => `${c.column} = ?`);
      args.push(...whereParsed.conditions.map(c => c.value));

      try {
        const info = db.prepare(`UPDATE ${params.table} SET ${setClause} WHERE ${whereClauses.join(' AND ')}`).run(...args);
        return { rows: [{ changes: info.changes }], operation_type: 'UPDATE' };
```

> 注意：第290行的 `!params.where` 检查保留不变——`params.where` 对 UPDATE/DELETE 是必填字段。`parseWhereClause` 在 `params.where` 已确认存在后调用。`encryptChatToken` 调用（第294-296行）保留不变。

**行为契约**：
- 前置：`params.table` 已通过白名单校验（第285行）；`params.where` 已确认存在（第290行）；`params.fields` 非空（第290行）
- 后置：
  - `params.where` 合法 → SET 子句和 WHERE 子句均通过 `?` 占位符绑定，所有 args 按 SET values + WHERE values 顺序传入 `.run()`
  - `params.where` 非法 → 返回 `VALIDATION_ERROR`，400 状态码
- 与旧版差异：
  - 旧版：`UPDATE users SET username = ?, role = ? WHERE id = 1`（SET 参数化，WHERE 未经参数化）
  - 新版：`UPDATE users SET username = ?, role = ? WHERE id = ?`（全部参数化）
  - args 顺序：`[SET_values..., WHERE_values...]` → `.run(...args)`

### 修改4：admin.js — delete_record WHERE 子句参数化

**文件**：`server/routes/admin.js`
**操作**：修改（替换第316-324行 `delete_record` case 中的 WHERE 拼接和查询执行逻辑）

**现状**（第316-324行）：
```javascript
      if (!params.where) {
        return { error: { code: 'VALIDATION_ERROR', message: '缺少条件' }, httpStatus: 400 };
      }
      try {
        const info = db.prepare(`DELETE FROM ${params.table} WHERE ${params.where}`).run();
        return { rows: [{ changes: info.changes }], operation_type: 'DELETE' };
```

**变更**：替换为：

```javascript
      if (!params.where) {
        return { error: { code: 'VALIDATION_ERROR', message: '缺少条件' }, httpStatus: 400 };
      }
      const whereParsed = parseWhereClause(params.where);
      if (!whereParsed.isValid) {
        return { error: { code: 'VALIDATION_ERROR', message: 'WHERE 子句格式无效，仅允许 column = value AND column = value ... 模式' }, httpStatus: 400 };
      }
      const whereClauses = whereParsed.conditions.map(c => `${c.column} = ?`);
      const whereArgs = whereParsed.conditions.map(c => c.value);
      try {
        const info = db.prepare(`DELETE FROM ${params.table} WHERE ${whereClauses.join(' AND ')}`).run(...whereArgs);
        return { rows: [{ changes: info.changes }], operation_type: 'DELETE' };
```

**行为契约**：
- 前置：`params.table` 已通过白名单校验（第313行）；`params.where` 已确认存在（第316行）
- 后置：
  - `params.where` 合法 → DELETE 的 WHERE 条件通过 `?` 占位符绑定
  - `params.where` 非法 → 返回 `VALIDATION_ERROR`，400 状态码
- 与旧版差异：
  - 旧版：`DELETE FROM users WHERE id = 1`（id 值直接拼接）
  - 新版：`DELETE FROM users WHERE id = ?`（参数化绑定）

### 修改5：encryption.js — 模块顶层添加 JWT_SECRET 环境变量校验

**文件**：`server/utils/encryption.js`
**操作**：修改（在第63行 `module.exports` 之前插入启动校验；修改第22行 `deriveKey()` 移除硬编码回退）

**现状**（第21-24行 `deriveKey`）：
```javascript
function deriveKey(salt) {
  const secret = process.env.JWT_SECRET || 'default_secret_change_me';
  return crypto.scryptSync(secret, salt, 32);
}
```

模块加载时无任何 JWT_SECRET 存在性校验。若未设置环境变量，`deriveKey()` 静默使用可预测密钥。

**变更**：

1. **加固 `deriveKey()`（第22行）**：

   ```
   改前: const secret = process.env.JWT_SECRET || 'default_secret_change_me';
   改后: const secret = process.env.JWT_SECRET;
   ```

   即：删除 `|| 'default_secret_change_me'` 回退。`deriveKey()` 不再包含硬编码默认值。若 `process.env.JWT_SECRET` 为 `undefined`，则 `secret` 为 `undefined`，`crypto.scryptSync(undefined, salt, 32)` 将抛出 TypeError（防御深度：即使模块级校验被绕过，运行时也会立即失败而非静默使用可预测密钥）。

2. **模块顶层添加启动校验**（在第62行 `}` 闭合后、第63行 `module.exports` 之前插入）：

```javascript
// 启动时校验：JWT_SECRET 必须已设置，否则无法派生加密密钥
if (!process.env.JWT_SECRET) {
  throw new Error(
    '[encryption] JWT_SECRET 环境变量未设置，无法派生 AES-256-GCM 加密密钥。\n' +
    '请设置环境变量 JWT_SECRET 后重新启动服务。\n' +
    '示例: JWT_SECRET=<至少32字符的随机字符串> node server/index.js'
  );
}
```

> **设计决策：模块顶层 vs `deriveKey()` 内抛出**：模块顶层校验确保服务启动（`require('./utils/encryption')` 时）即失败，阻止服务在无密钥状态下运行。`deriveKey()` 内部加固（移除硬编码回退）为防御深度——若未来有人移除模块级校验，运行时仍会因 `crypto.scryptSync(undefined, ...)` 抛出 TypeError 立即失败。与 `getSalt()` 的自动生成 + 警告策略不同：salt 可安全自动生成（密钥派生需要确定性的 salt，警告用户持久化即可），但 JWT_SECRET 必须用户显式设定——自动生成的密钥会导致重启后所有已加密数据不可解密。

**行为契约**：
- 前置（模块加载时）：Node.js 执行 `require('./utils/encryption')` 或依赖此模块的 `require('../routes/admin')` / `require('../routes/chat')`
- 后置：
  - `JWT_SECRET` 已设置 → 模块正常加载，`deriveKey()` 使用该环境变量派生密钥
  - `JWT_SECRET` 未设置 → `throw new Error(...)`，模块加载失败，`require()` 调用处抛出异常，服务无法启动
- 与旧版差异：
  - 旧版：服务静默启动，加密操作使用 `'default_secret_change_me'` 派生密钥，加密保护形同虚设
  - 新版：服务拒绝在无 JWT_SECRET 时启动，运维人员必须显式配置密钥
  - 对已有正确配置（JWT_SECRET 已设置）的部署无影响
- 对 `getSalt()` 无影响：`getSalt()` 的自动生成 + 警告行为保持不变（salt 不同于 JWT_SECRET，自动生成是安全的）

### 修改6：todo.md — 将已修复问题标记为已完成

**文件**：`reviews/202606291800_full_review/todo.md`
**操作**：修改（在 S5 和 S6 条目末尾追加完成记录行）

**现状**：
- S5 条目（第50-55行）：从 `### S5. admin.js Text2SQL 功能存在 SQL 注入漏洞` 到第55行 `- **建议修复**: 将 params.where 解析为结构化条件后用参数化占位符重建...`
- S6 条目（第57-62行）：从 `### S6. encryption.js 使用硬编码默认加密密钥` 到第62行 `- **建议修复**: 若 JWT_SECRET 未设置，抛出启动错误...`
- v1 已建立格式先例：S7/S8/S9 条目末尾追加了 `- **已修复**: 2026-06-30, 批次 v1 (P0 ...), ...` 行
- v2 已延续此格式：S1/S2 条目末尾追加了 `- **已修复**: 2026-06-30, 批次 v2 (P1 ...), ...` 行

**变更**：

1. **S5 条目**：在第55行（`- **建议修复**: 将 params.where 解析为结构化条件...`）之后追加一行：

   ```markdown
   - **已修复**: 2026-06-30, 批次 v3 (P1 后端安全缺陷), 新增 parseWhereClause() 私有函数，query_table/update_record/delete_record 三处 WHERE 子句改为参数化 ? 占位符重建
   ```

2. **S6 条目**：在第62行（`- **建议修复**: 若 JWT_SECRET 未设置，抛出启动错误...`）之后追加一行：

   ```markdown
   - **已修复**: 2026-06-30, 批次 v3 (P1 后端安全缺陷), 模块顶层添加 JWT_SECRET 环境变量启动校验，deriveKey() 移除硬编码默认密钥回退
   ```

**行为契约**：
- 前置：S5/S6 的代码变更已实现并通过构建验证
- 后置：todo.md 成为可追踪的实现计划，S5/S6 清晰标注批次和日期；后续批次实现者可参考此格式继续标记

## 详细设计文档合规性交叉验证

依据审查依据 `docs/2_detailed_design_v4.md` 对本次设计的修改逐条验证：

| 设计条款 | 要求 | 本设计对应 | 状态 |
|---------|------|-----------|:--:|
| §7.8 敏感字段加密 — 密钥管理 | `JWT_SECRET` 和 `salt` 通过环境变量加载，不硬编码在源码中 | 修改5：模块顶层校验 + deriveKey() 移除硬编码回退，所有密钥从 env 读取 | 一致 |
| §7.8 密钥派生 | `crypto.scryptSync(JWT_SECRET, salt, 32)` 从 JWT_SECRET 派生 256 位密钥 | 修改5：`deriveKey()` 保留 `crypto.scryptSync` 调用，仅移除硬编码回退 | 一致 |
| §5.2.5/5.2.6 Text2SQL 工具参数化查询 | "由 Express 端点根据 tool_name 参数分发至对应的参数化查询处理器"；"SQL 模板固定，仅参数化填充" | 修改2-4：query_table/update_record/delete_record 三处 WHERE 条件改为 `?` 占位符参数化，与已有 `query_user_profile` 等工具的参数化模式一致 | 一致 |
| §7.3.3 admin.js 路由伪代码 | 参数化查询处理器使用预定义 SQL 模板 + 占位符绑定 | 修改2-4：保留 SQL 模板结构（`SELECT * FROM {table}`、`UPDATE {table} SET ...`、`DELETE FROM {table}`），仅 WHERE 条件从字符串拼接改为 `?` 占位符 | 一致 |
| 决策7 安全编码规范 | 杜绝 SQL 注入，所有用户输入参数化 | 修改1-4：新增 `parseWhereClause()` 白名单校验 + `?` 占位符重建，覆盖全部三个受影响工具操作 | 一致 |

> 验证结论：本设计的两项修改与详细设计文档 `docs/2_detailed_design_v4.md` 完全一致，无偏离。

## 错误处理

### S5 — SQL 注入修复

| 错误路径 | 处理方式 |
|---------|---------|
| `params.where` 为空字符串/falsy | `parseWhereClause()` 返回 `{ conditions: [], isValid: false }`，调用处返回 `VALIDATION_ERROR`（400） |
| `params.where` 包含不支持的运算符（`>`, `<`, `!=`, `LIKE`, `IN`） | `parseWhereClause()` 正则匹配失败 → `isValid: false`，调用处返回 `VALIDATION_ERROR`（400） |
| `params.where` 包含子查询/SQL 关键字 | `parseWhereClause()` 列名/值格式校验失败 → `isValid: false`，调用处返回 `VALIDATION_ERROR`（400） |
| 列名含非法字符（空格、连字符等） | `parseWhereClause()` 列名正则 `[a-zA-Z_][a-zA-Z0-9_]*` 不匹配 → `isValid: false`，调用处返回 `VALIDATION_ERROR`（400） |
| 值中含 `AND` 字面量（如 `name = 'ANDERSON'`） | `splitByAnd()` 状态机尊重单引号边界，正确识别 ANDERSON 为字面量而非逻辑运算符 |
| better-sqlite3 执行异常（参数类型不匹配等） | 已有 try-catch 包裹（第247-249行、第303-305行、第323-325行），返回 `BAD_REQUEST`（400）含错误消息 |
| `params.where` 对 query_table 为空（可选条件） | 不调用 `parseWhereClause()`，WHERE 子句不拼入 SQL，行为与旧版一致 |

### S6 — 加密密钥校验

| 错误路径 | 处理方式 |
|---------|---------|
| `JWT_SECRET` 未设置，服务启动 | 模块顶层 `throw new Error(...)` → `require()` 调用栈向上传播 → `app.js` 加载失败 → 进程退出（非零退出码） |
| `JWT_SECRET` 已设置但为空字符串 | `!process.env.JWT_SECRET` 对空字符串为 `true`（falsy）→ 模块顶层抛出 |
| 未来某人移除模块级校验，`deriveKey()` 被调用 | `crypto.scryptSync(undefined, salt, 32)` → Node.js 内部抛出 `TypeError [ERR_INVALID_ARG_TYPE]: The "password" argument must be ...` → 向上传播到 `encryptChatToken()`/`decryptChatToken()` 调用处 → 路由处理器 catch 或 Express 全局 errorHandler 捕获 |
| 既有部署 JWT_SECRET 已正确配置 | 模块正常加载，`deriveKey()` 行为不变（仅移除 `\|\| 'default_secret_change_me'` 回退，env 存在时不执行回退路径） |

## 行为契约

### S5 parseWhereClause 解析行为矩阵

| 输入 `params.where` | 解析结果 | 合法性 |
|--------------------|---------|:-----:|
| `"username = 'admin'"` | `[{column:'username', value:'admin'}]` | 合法 |
| `"id = 42"` | `[{column:'id', value:42}]` | 合法 |
| `"role = 'user' AND status = 'active'"` | `[{column:'role', value:'user'}, {column:'status', value:'active'}]` | 合法 |
| `"name = 'O''Brien'"` | `[{column:'name', value:"O''Brien"}]`（SQLite 单引号转义保留在值中） | 合法 |
| `"score = 3.14"` | `[{column:'score', value:3.14}]` | 合法 |
| `""`（空字符串） | `{conditions:[], isValid:false}` | 非法 |
| `"1=1"` | `{conditions:[], isValid:false}`（列名 `1` 不合法） | 非法 |
| `"id > 1"` | `{conditions:[], isValid:false}`（不支持 `>` 运算符） | 非法 |
| `"id = 1 OR 1=1"` | `{conditions:[], isValid:false}`（不支持 `OR`，仅 `AND`） | 非法 |
| `"id = 1; DROP TABLE users"` | `{conditions:[], isValid:false}`（分号后部分非 `column = value` 格式） | 非法 |
| `"name = 'ANDERSON'"` | `[{column:'name', value:'ANDERSON'}]` | 合法 |
| `"id = (SELECT id FROM users)"` | `{conditions:[], isValid:false}`（子查询不含单引号且非数值） | 非法 |

### S6 启动行为对比

| 场景 | 旧版行为 | 新版行为 |
|------|---------|---------|
| `JWT_SECRET` 已设置（生产环境） | `deriveKey()` 使用 JWT_SECRET 派生密钥 | **不变** |
| `JWT_SECRET` 未设置 | 服务静默启动，`deriveKey()` 回退到 `'default_secret_change_me'`，加密保护失效 | 服务拒绝启动，`throw new Error(...)` |
| `JWT_SECRET` 设置为空字符串 | 回退到 `'default_secret_change_me'` | 服务拒绝启动（空字符串为 falsy） |
| `JWT_SECRET` 设置后被轮换 | 需执行迁移脚本（§7.8 已定义） | **不变** |

## 依赖关系

### 已有类型/模块依赖

| 依赖项 | 使用方 | 用途 |
|--------|--------|------|
| `db` (better-sqlite3 Database 实例) | admin.js | `db.prepare(sql).all(...args)` / `.run(...args)` 参数化查询绑定 |
| `crypto` (Node.js 内置) | encryption.js | `crypto.scryptSync(secret, salt, 32)` 密钥派生 |
| `process.env.JWT_SECRET` | encryption.js | 模块顶层校验 + `deriveKey()` 密钥派生 |
| `todo.md` (reviews/202606291800_full_review/todo.md) | 本任务 | 将 S5/S6 标记为已完成，添加批次和日期 |

### 新增的模块内私有依赖

| 符号 | 定义位置 | 调用方 | 可见性 |
|------|---------|--------|:----:|
| `splitByAnd(str)` | admin.js 模块顶层 | `parseWhereClause()` | 模块私有 |
| `parseWhereClause(whereStr)` | admin.js 模块顶层 | `dispatchParameterizedQuery()` 内 query_table/update_record/delete_record 三个 case | 模块私有 |

### 暴露给后续任务的公开接口

本任务不引入新的公开接口。三个修改均为内部安全加固：

- **admin.js**: `dispatchParameterizedQuery()` 的函数签名不变（参数 `(db, toolName, params, operatorId, operatorRole)` 不变），返回值结构不变（`{ rows, error?, httpStatus?, operation_type? }`）。新增的 `splitByAnd()` 和 `parseWhereClause()` 为模块私有函数，不导出。对外部调用方（`/api/admin/execute` 路由处理器、Dify Agent 回调）完全透明。
- **encryption.js**: `module.exports` 不变（`{ encryptChatToken, decryptChatToken, deriveKey, getSalt }`），导出函数的签名不变。模块顶层校验为加载期副作用，不改变公开 API。`deriveKey()` 移除硬编码回退不改变其签名（签名仍为 `function deriveKey(salt)`，返回 `Buffer`）。
- **todo.md**: 提供可追踪的实现进度，后续批次实现者可参考标记格式。

### 删除的依赖

| 依赖项 | 原位置 | 原因 |
|--------|--------|------|
| 硬编码字符串 `'default_secret_change_me'` | encryption.js:22 | 移除硬编码默认密钥，改为启动校验 + `crypto.scryptSync` 对 `undefined` 的 TypeError（防御深度） |
