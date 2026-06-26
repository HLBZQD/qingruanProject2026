# Code Review v1 r1: Batch 2 认证鉴权

## 结论: APPROVED

---

## 逐文件审查

### 1. `server/utils/response.js` — PASS

- `success(res, data, message, statusCode)`: 默认值 `data=null`, `message='操作成功'`, `statusCode=200` ✓
- `error(res, code, message, statusCode)`: 默认 `statusCode=400` ✓
- 输出格式 `{success:true,message,data}` 和 `{error:{code,message}}` 均与设计一致 ✓
- `AppError` 正确 re-export 自 `../middleware/errorHandler` ✓

### 2. `server/utils/validators.js` — PASS

- `validateUsername`: 去空白后 3-50 字符，正则 `/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/` ✓
- `validatePassword`: 长度 ≥ 8，同时含字母和数字（双正则检查） ✓
- `validateRegister`: 依次调用两者 ✓
- `validateLogin`: 仅检查非空（设计如此） ✓
- `validateProfile`: 可选字段校验，都无值时返回提示 ✓
- **注意 (非阻塞)**: 第 1 行 `const { error } = require('./response')` 导入但未使用。不影响功能，仅生成 lint 警告。

### 3. `server/middleware/auth.js` — PASS

- 正确提取 `Authorization: Bearer <token>` ✓
- 无 header / 格式错误 → `error(res, 'AUTH_REQUIRED', …, 401)` ✓
- `jwt.verify(token, process.env.JWT_SECRET, callback)` ✓
- 正确区分 `TokenExpiredError` / `JsonWebTokenError` / 其他 ✓
- `req.user = { id, username, role }` 从 decoded 解构 ✓
- 成功后调用 `next()` ✓

### 4. `server/middleware/admin.js` — PASS

- 防御性 `!req.user` → 401 ✓
- `req.user.role !== 'admin'` → `error(res, 'FORBIDDEN', …, 403)` ✓
- 格式完全匹配设计 ✓

### 5. `server/routes/auth.js` — PASS

- **POST /register**:
  - body 校验 → `throw new AppError(400, 'BAD_REQUEST', ...)` ✓
  - `validateRegister` → 422 ✓
  - `SELECT id FROM users WHERE username = ?` 唯一性检查 (参数化) ✓
  - `bcrypt.hashSync(password, 10)` ✓
  - `INSERT INTO users (username, password) VALUES (?, ?)` 参数化 ✓
  - `result.lastInsertRowid` 正确 (better-sqlite3 属性名) ✓
  - JWT: payload `{id, username, role:'user'}`, `expiresIn:'7d'`, secret from `process.env.JWT_SECRET` ✓
  - 返回 201 + `success()` ✓

- **POST /login**:
  - 查询用户全字段，参数化 ✓
  - `bcrypt.compareSync` 密码比对 ✓
  - 不匹配 → `error(res, 'AUTH_INVALID', …, 401)` ✓
  - `must_change_password` = `role==='admin' && password_changed===0` ✓
  - 返回 200 ✓

- **POST /logout**:
  - authMiddleware 保护 ✓
  - 返回 `success(res, null, '已登出', 200)` ✓

- 所有 SQL 使用 `?` 占位符，无 SQL 注入风险 ✓
- 所有密码经 bcrypt ✓
- 同步调用链正确 (better-sqlite3 同步 + bcrypt hashSync/compareSync) ✓

### 6. `server/routes/user.js` — PASS

- **GET /profile**:
  - authMiddleware 保护 ✓
  - `SELECT id, username, avatar, role, created_at FROM users WHERE id = ?` ✓
  - 用户不存在 → `throw new AppError(404, 'NOT_FOUND', ...)` ✓

- **PUT /profile**:
  - authMiddleware 保护 ✓
  - `validateProfile` → 422 ✓
  - 用户名唯一性: `WHERE username = ? AND id != ?` 排除自身 ✓
  - 动态构建 SET 子句和参数数组 (合并 UPDATE) ✓
  - 所有占位符为 `?` ✓
  - 更新后重新查询并返回 ✓

- **PUT /password**:
  - authMiddleware 保护 ✓
  - `validatePassword(new_password)` → 422 ✓
  - `skipOldPassword` = `!old_password && role==='admin' && password_changed===0` ✓
  - 非跳过分支: 必须提供 old_password，bcrypt 比对 ✓
  - hashSync 新密码 ✓
  - UPDATE 同时设 `password_changed = 1` ✓

- **注意 (非阻塞)**: 第 5 行导入 `validateUsername` 但未直接使用（仅在 `validateProfile` 内部间接使用）。不影响功能。

### 7. `server/routes/index.js` — PASS

- 第 8-9 行正确挂载 auth/user 路由 ✓
- `router.use('/auth', require('./auth'))` ✓
- `router.use('/user', require('./user'))` ✓
- 位于 health 端点之后、注释块之前 ✓
- 404 兜底处理保留 ✓

---

## 检查项汇总

| 检查项 | 结果 |
|--------|------|
| SQL 注入防护 (所有参数用 `?` 占位符) | ✓ 全部通过 |
| 密码通过 bcrypt 处理 | ✓ hashSync / compareSync |
| JWT secret 从 env 读取 | ✓ `process.env.JWT_SECRET` |
| 错误返回格式 `{error:{code,message}}` | ✓ 所有 error() 调用 |
| 用户名唯一性约束 | ✓ DB UNIQUE + 查询前置检查 |
| 同步 API 使用正确 (better-sqlite3) | ✓ 全同步调用链 |
| require 路径正确 | ✓ 7/7 模块加载成功 |
| 与设计文档 API 契约一致 | ✓ 逐项比对通过 |

---

## 发现的非阻塞问题

| # | 文件:行号 | 问题 | 严重度 |
|---|-----------|------|--------|
| 1 | `validators.js:1` | `const { error } = require('./response')` 导入但未使用 | Minor |
| 2 | `user.js:5` | `validateUsername` 导入但未直接使用 | Minor |

以上问题均不影响功能正确性，仅为代码整洁度建议。可在后续清理。

---

## 审查时间

2026-06-25

## 审查签名

Reviewer: Code Reviewer (automated)
