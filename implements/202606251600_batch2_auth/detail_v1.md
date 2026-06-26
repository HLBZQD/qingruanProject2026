# Detail v1: Batch 2 认证鉴权—详细技术设计

## 概述

本文档为 Batch 2（认证、鉴权与用户体系）提供精确到可直接编码的文件级规格。
每个目标文件均包含：导入依赖、导出清单、函数签名（参数类型、默认值、返回值）、SQL 语句、错误处理分支、JWT payload 结构。

---

## 文件创建顺序

按依赖图，严格顺序为：

```
(1) server/utils/response.js
      │
      ├──► (2) server/utils/validators.js
      │
      ├──► (3) server/middleware/auth.js
      │
      ├──► (4) server/middleware/admin.js
      │
      ├──► (5) server/routes/auth.js
      │
      ├──► (6) server/routes/user.js
      │
      └──► (7) server/routes/index.js（修改现有文件）
```

---

## 一、server/utils/response.js（任务 1）

### 目的
提供统一成功/错误响应函数，所有后续模块依赖此模块规范 API 响应格式。

### 导入
```js
const { AppError } = require('../middleware/errorHandler');
```

### 导出清单
```js
module.exports = { success, error, AppError };
```

### 函数详细规格

#### `success(res, data, message, statusCode)`

```
参数:
  res        : Express Response 对象（必填）
  data       : any（可选，默认 null）— 响应数据体
  message    : string（可选，默认 '操作成功'）— 成功消息
  statusCode : number（可选，默认 200）— HTTP 状态码

行为:
  res.status(statusCode).json({ success: true, message, data })

无返回值（直接写入 res）。
```

#### `error(res, code, message, statusCode)`

```
参数:
  res        : Express Response 对象（必填）
  code       : string（必填）— 错误码枚举值
  message    : string（必填）— 人类可读错误描述
  statusCode : number（可选，默认 400）— HTTP 状态码

行为:
  res.status(statusCode).json({ error: { code, message } })

无返回值（直接写入 res）。
```

### `AppError` re-export

直接 `module.exports` 中包含 `AppError` 类，路由文件只需 `require('../utils/response')` 即可同时获得响应函数和异常类。不在此模块中额外包装。

---

## 二、server/utils/validators.js（任务 2）

### 目的
提供注册/登录/资料修改的字段校验函数，校验失败时通过 `error()` 函数返回 422 响应。

### 导入
```js
const { error } = require('./response');
```

### 导出清单
```js
module.exports = { validateUsername, validatePassword, validateRegister, validateLogin, validateProfile };
```

### 函数详细规格

#### `validateUsername(username)`

```
参数: username : string（给定用户名）
返回值: string | null — 校验失败返回错误消息字符串，通过返回 null

校验规则:
  - 必填：若 !username 或 typeof username !== 'string' → '用户名不能为空'
  - 长度：去空白后长度必须 3-50 字符 → '用户名长度需在3-50个字符之间'
  - 字符白名单：仅允许字母、数字、下划线、汉字 → '用户名仅允许字母、数字、下划线和汉字'
    正则: /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/
```

#### `validatePassword(password)`

```
参数: password : string（给定密码）
返回值: string | null

校验规则:
  - 必填：若 !password 或 typeof password !== 'string' → '密码不能为空'
  - 长度：不少于 8 位 → '密码长度不少于8位'
  - 复杂度：必须同时包含字母和数字 → '密码需包含字母和数字'
    正则: /[a-zA-Z]/ 和 /[0-9]/ 必须同时匹配
```

#### `validateRegister(username, password)`

```
参数: username : string, password : string
返回值: string | null — 第一个校验失败的错误消息，全部通过返回 null

行为:
  1. 调用 validateUsername(username)，若失败返回该消息
  2. 调用 validatePassword(password)，若失败返回该消息
  3. 全部通过返回 null
```

#### `validateLogin(username, password)`

```
参数: username : string, password : string
返回值: string | null

校验规则:
  - !username → '用户名不能为空'
  - !password → '密码不能为空'
  - 均通过返回 null
```

#### `validateProfile(username, avatar)`

```
参数: username : string | undefined | null（可选，新用户名）
      avatar   : string | undefined | null（可选，头像路径）
返回值: string | null

校验规则:
  - 若 username 有值（非 undefined/null/空字符串），调用 validateUsername(username) 校验
  - avatar 不做格式校验（头像上传由 multer 在 upload 批次处理）
  - 若 username 和 avatar 均无有效值 → '至少需要修改一个字段'
  - 通过返回 null
```

---

## 三、server/middleware/auth.js（任务 3）

### 目的
从请求头 `Authorization: Bearer <token>` 提取并验证 JWT，成功后挂载 `req.user`。

### 导入
```js
const jwt = require('jsonwebtoken');
const { error } = require('../utils/response');
```

### 导出清单
```js
module.exports = authMiddleware;  // 单个 Express 中间件函数
```

### 中间件详细规格

```
函数签名: function authMiddleware(req, res, next)

流程:
  1. 读取 Authorization 头:
     const authHeader = req.headers['authorization'];
     若 !authHeader 或 !authHeader.startsWith('Bearer ') → 返回 error(res, 'AUTH_REQUIRED', '未登录或Token已过期', 401)

  2. 提取 token:
     const token = authHeader.split(' ')[1];
     若 !token → 返回 error(res, 'AUTH_REQUIRED', '未登录或Token已过期', 401)

  3. 验证 JWT:
     jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => { ... })
     - 若 err:
       - err.name === 'TokenExpiredError' → 'Token已过期'
       - err.name === 'JsonWebTokenError' → 'Token无效'
       - 其他 → 'Token验证失败'
       统一返回 error(res, 'AUTH_REQUIRED', message, 401)

     - 成功: decoded 含 { id, username, role }
       从 decoded 解构提取:
         req.user = { id: decoded.id, username: decoded.username, role: decoded.role }
       next()

JWT 验证选项: 不传额外 options，使用 jsonwebtoken 默认配置。
```

### JWT Payload 结构（签发时约定，auth.js 只消费不生产）

```json
{
  "id": 1,
  "username": "admin",
  "role": "admin",
  "iat": 1700000000,
  "exp": 1700604800
}
```

JWT 签发详情见下文 `routes/auth.js`。

---

## 四、server/middleware/admin.js（任务 4）

### 目的
检查 `req.user.role === 'admin'`，非管理员返回 403。

### 导入
```js
const { error } = require('../utils/response');
```

### 导出清单
```js
module.exports = adminMiddleware;  // 单个 Express 中间件函数
```

### 中间件详细规格

```
函数签名: function adminMiddleware(req, res, next)

前置条件: 必须在 auth.js 中间件之后使用（req.user 已由 auth.js 挂载）

流程:
  1. 若 !req.user → 返回 error(res, 'AUTH_REQUIRED', '未登录或Token已过期', 401)
     （防御性编程：若意外在 auth 中间件之前使用，返回明确错误）

  2. 若 req.user.role !== 'admin' → 返回 error(res, 'FORBIDDEN', '权限不足，仅管理员可操作', 403)

  3. 通过 → next()
```

---

## 五、server/routes/auth.js（任务 5）

### 目的
实现注册、登录、登出三个认证接口。

### 导入
```js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db/database');
const { success, error, AppError } = require('../utils/response');
const { validateRegister, validateLogin } = require('../utils/validators');
const authMiddleware = require('../middleware/auth');
```

### 导出清单
```js
const router = express.Router();  // 定义路由
module.exports = router;
```

### 路由定义

#### 5.1 `POST /api/auth/register`

> 注：路径在 router 内定义为 `/register`（因 `routes/index.js` 以 `/auth` 前缀挂载）

```
路由: POST /register
认证要求: 无（公开端点）

处理流程:
  1. 提取请求体: const { username, password } = req.body;

  2. 基本格式校验:
     若 !req.body || typeof req.body !== 'object' → throw new AppError(400, 'BAD_REQUEST', '请求体格式错误')

  3. 字段校验:
     const validationError = validateRegister(username, password);
     若 validationError → return error(res, 'VALIDATION_ERROR', validationError, 422)

  4. 用户名唯一性检查:
     SQL: SELECT id FROM users WHERE username = ?
     const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
     若 existing → return error(res, 'CONFLICT', '用户名已存在', 409)

  5. 密码哈希:
     const saltRounds = 10;
     const hashedPassword = bcrypt.hashSync(password, saltRounds);
     使用 hashSync（better-sqlite3 是同步的，bcrypt 同步调用保持一致性）

  6. 插入用户:
     SQL: INSERT INTO users (username, password) VALUES (?, ?)
     const result = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashedPassword);
     const userId = result.lastInsertRowid;

  7. 签发 JWT:
     payload = { id: userId, username: username, role: 'user' }
     options = { expiresIn: '7d' }
     const token = jwt.sign(payload, process.env.JWT_SECRET, options);

  8. 成功响应 (201):
     return success(res, {
       token: token,
       role: 'user',
       user: {
         id: userId,
         username: username,
         avatar: null
       }
     }, '注册成功', 201);
```

#### 5.2 `POST /api/auth/login`

```
路由: POST /login
认证要求: 无（公开端点）

处理流程:
  1. 提取请求体: const { username, password } = req.body;

  2. 基本格式校验:
     若 !req.body || typeof req.body !== 'object' → throw new AppError(400, 'BAD_REQUEST', '请求体格式错误')

  3. 字段校验:
     const validationError = validateLogin(username, password);
     若 validationError → return error(res, 'VALIDATION_ERROR', validationError, 422)

  4. 查询用户:
     SQL: SELECT id, username, password, role, password_changed, avatar FROM users WHERE username = ?
     const user = db.prepare('SELECT id, username, password, role, password_changed, avatar FROM users WHERE username = ?').get(username);
     若 !user → return error(res, 'AUTH_INVALID', '用户名或密码错误', 401)

  5. 密码比对:
     const isMatch = bcrypt.compareSync(password, user.password);
     若 !isMatch → return error(res, 'AUTH_INVALID', '用户名或密码错误', 401)

  6. 签发 JWT:
     payload = { id: user.id, username: user.username, role: user.role }
     options = { expiresIn: '7d' }
     const token = jwt.sign(payload, process.env.JWT_SECRET, options);

  7. 构建响应 data:
     const resData = {
       token: token,
       role: user.role,
       user: {
         id: user.id,
         username: user.username,
         avatar: user.avatar
       }
     };

  8. 管理员首次登录标记:
     若 user.role === 'admin' && user.password_changed === 0:
       resData.must_change_password = true;
     （普通用户或已改密管理员不附加此字段）

  9. 成功响应 (200):
     return success(res, resData, '登录成功', 200);
```

#### 5.3 `POST /api/auth/logout`

```
路由: POST /logout
认证要求: 是（通过 authMiddleware）

处理流程:
  1. 中间件 authMiddleware 已验证 JWT 并挂载 req.user
  2. JWT 无状态设计，后端不维护会话黑名单，直接返回成功
  3. 成功响应 (200):
     return success(res, null, '已登出', 200);
```

### 中间件挂载（在 router 内）

```js
router.post('/register', handler);
router.post('/login', handler);
router.post('/logout', authMiddleware, handler);
```

---

## 六、server/routes/user.js（任务 6）

### 目的
实现用户资料获取、修改、密码修改三个接口。

### 导入
```js
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db/database');
const { success, error, AppError } = require('../utils/response');
const { validateProfile } = require('../utils/validators');
const authMiddleware = require('../middleware/auth');
```

### 导出清单
```js
const router = express.Router();
module.exports = router;
```

> 所有路由均通过 `authMiddleware` 保护。

### 路由定义

#### 6.1 `GET /api/user/profile`

```
路由: GET /profile
认证要求: 是

处理流程:
  1. 从 req.user.id 取用户 ID

  2. 查询完整信息:
     SQL: SELECT id, username, avatar, role, created_at FROM users WHERE id = ?
     const user = db.prepare('SELECT id, username, avatar, role, created_at FROM users WHERE id = ?').get(req.user.id);
     若 !user → throw new AppError(404, 'NOT_FOUND', '用户不存在')

  3. 成功响应 (200):
     return success(res, {
       id: user.id,
       username: user.username,
       avatar: user.avatar,
       role: user.role,
       created_at: user.created_at
     }, '查询成功', 200);
```

#### 6.2 `PUT /api/user/profile`

```
路由: PUT /profile
认证要求: 是

处理流程:
  1. 提取请求体: const { username, avatar } = req.body;

  2. 基本格式校验:
     若 !req.body || typeof req.body !== 'object' → throw new AppError(400, 'BAD_REQUEST', '请求体格式错误')

  3. 字段校验:
     const validationError = validateProfile(username, avatar);
     若 validationError → return error(res, 'VALIDATION_ERROR', validationError, 422)

  4. 若提供了 username:
     a) 唯一性检查（排除自身）:
        SQL: SELECT id FROM users WHERE username = ? AND id != ?
        const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.user.id);
        若 existing → return error(res, 'CONFLICT', '用户名已存在', 409)

     b) 更新用户名:
        SQL: UPDATE users SET username = ?, updated_at = datetime('now','localtime') WHERE id = ?
        db.prepare('UPDATE users SET username = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(username, req.user.id);

  5. 若提供了 avatar:
     SQL: UPDATE users SET avatar = ?, updated_at = datetime('now','localtime') WHERE id = ?
     db.prepare('UPDATE users SET avatar = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(avatar, req.user.id);

  6. 若同时提供了 username 和 avatar，合并为一条 UPDATE:
     SQL:
       UPDATE users
       SET username = ?, avatar = ?, updated_at = datetime('now','localtime')
       WHERE id = ?
     注：建议实现时动态构建 SET 子句和参数数组，避免重复 UPDATE。

  实现建议（动态构建）:
     const updates = [];
     const params = [];
     if (typeof username === 'string' && username.trim()) {
       updates.push('username = ?');
       params.push(username.trim());
     }
     if (typeof avatar === 'string' && avatar.trim()) {
       updates.push('avatar = ?');
       params.push(avatar.trim());
     }
     updates.push("updated_at = datetime('now','localtime')");
     params.push(req.user.id);
     const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
     db.prepare(sql).run(...params);

  7. 重新查询更新后的用户信息:
     SQL: SELECT id, username, avatar FROM users WHERE id = ?
     const updatedUser = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(req.user.id);

  8. 成功响应 (200):
     return success(res, {
       id: updatedUser.id,
       username: updatedUser.username,
       avatar: updatedUser.avatar
     }, '修改成功', 200);
```

#### 6.3 `PUT /api/user/password`

```
路由: PUT /password
认证要求: 是

处理流程:
  1. 提取请求体: const { old_password, new_password } = req.body;

  2. 基本格式校验:
     若 !req.body || typeof req.body !== 'object' → throw new AppError(400, 'BAD_REQUEST', '请求体格式错误')

  3. new_password 校验（复用 validatePassword）:
     const { validatePassword } = require('../utils/validators');
     const pwError = validatePassword(new_password);
     若 pwError → return error(res, 'VALIDATION_ERROR', pwError, 422)

  4. 查询当前用户完整信息:
     SQL: SELECT id, password, role, password_changed FROM users WHERE id = ?
     const user = db.prepare('SELECT id, password, role, password_changed FROM users WHERE id = ?').get(req.user.id);
     若 !user → throw new AppError(404, 'NOT_FOUND', '用户不存在')

  5. 判断是否需要 old_password:
     - 若 user.role === 'admin' 且 user.password_changed === 0:
        管理员首次改密，允许跳过 old_password 校验。
        若提供了 old_password 可选用，不提供也可以。
        实际判断逻辑: 若 !old_password && user.role === 'admin' && user.password_changed === 0 → 跳过旧密码比对
     - 否则（普通用户 或 非首次改密的管理员）:
        必须提供 old_password:
          若 !old_password → return error(res, 'VALIDATION_ERROR', '当前密码不能为空', 422)
        比对:
          const isMatch = bcrypt.compareSync(old_password, user.password);
          若 !isMatch → return error(res, 'AUTH_INVALID', '当前密码错误', 401)

  6. 哈希新密码:
     const hashedPassword = bcrypt.hashSync(new_password, 10);

  7. 更新密码和标记:
     SQL:
       UPDATE users
       SET password = ?, password_changed = 1, updated_at = datetime('now','localtime')
       WHERE id = ?
     db.prepare("UPDATE users SET password = ?, password_changed = 1, updated_at = datetime('now','localtime') WHERE id = ?")
       .run(hashedPassword, req.user.id);
     注: password_changed 无条件设为 1（即使是普通用户，设置后也不影响其行为，因为普通用户无 mustChangePassword 语义）。

  8. 成功响应 (200):
     return success(res, null, '密码修改成功', 200);
```

---

## 七、server/routes/index.js（任务 7 — 修改现有文件）

### 目的
挂载 auth 和 user 路由模块。

### 需修改的位置

当前文件 `/home/derpyIsTheBest/qingruanProject2026/server/routes/index.js` 中，
在第 7 行（`router.get('/health', ...)` 之后，注释块之前）插入路由挂载：

```js
// 插入以下两行（替换对应的注释行）：
router.use('/auth', require('./auth'));
router.use('/user', require('./user'));
```

### 完整操作说明

1. 在文件顶部保持 `const express = require('express');` 和 `const router = express.Router();` 不变
2. 在 `router.get('/health', ...)` 之后插入：
   ```js
   router.use('/auth', require('./auth'));
   router.use('/user', require('./user'));
   ```
3. 删除注释块中对应的两行注释（`// const authRoutes = require('./auth');` 和 `// const userRoutes = require('./user');`，以及 `// router.use('/auth', authRoutes);` 和 `// router.use('/user', userRoutes);`）——或保留注释不删（删更干净）

### 修改后的完整内容

```js
const express = require('express');
const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, message: '服务运行正常' });
});

router.use('/auth', require('./auth'));
router.use('/user', require('./user'));

// 后续批次将在此挂载以下路由模块:
// const doctorsRoutes = require('./doctors');
// const chatRoutes = require('./chat');
// const riskRoutes = require('./risk');
// ...（其余注释保留）

router.use((_req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: '请求的资源不存在'
    }
  });
});

module.exports = router;
```

---

## 八、错误处理汇总

| 场景 | 位置 | HTTP 状态码 | 错误码 | 消息 |
|------|------|------------|--------|------|
| 请求体非有效 JSON | routes/auth.js, routes/user.js | 400 | BAD_REQUEST | 请求体格式错误（通过 `throw new AppError` → errorHandler 处理） |
| 用户名/密码格式不符合规则 | validators.js → routes/*.js | 422 | VALIDATION_ERROR | 校验函数返回的具体消息 |
| 注册时用户名已存在 | routes/auth.js | 409 | CONFLICT | 用户名已存在 |
| 修改资料时用户名被占用 | routes/user.js | 409 | CONFLICT | 用户名已存在 |
| 登录用户名或密码错误 | routes/auth.js | 401 | AUTH_INVALID | 用户名或密码错误 |
| 改密时旧密码错误 | routes/user.js | 401 | AUTH_INVALID | 当前密码错误 |
| 未携带 Token | middleware/auth.js | 401 | AUTH_REQUIRED | 未登录或 Token 已过期 |
| Token 无效/过期 | middleware/auth.js | 401 | AUTH_REQUIRED | Token 无效 / Token 已过期 / Token 验证失败 |
| 非管理员访问管理员接口 | middleware/admin.js | 403 | FORBIDDEN | 权限不足，仅管理员可操作 |
| 用户不存在 | routes/user.js | 404 | NOT_FOUND | 用户不存在 |
| 未捕获异常 | errorHandler.js | 500 | INTERNAL_ERROR | 服务端内部错误 |

---

## 九、SQL 语句汇总

| 序号 | 文件 | SQL | 说明 |
|------|------|-----|------|
| 1 | auth.js (register) | `SELECT id FROM users WHERE username = ?` | 唯一性检查 |
| 2 | auth.js (register) | `INSERT INTO users (username, password) VALUES (?, ?)` | 插入新用户 |
| 3 | auth.js (login) | `SELECT id, username, password, role, password_changed, avatar FROM users WHERE username = ?` | 登录查询 |
| 4 | user.js (profile GET) | `SELECT id, username, avatar, role, created_at FROM users WHERE id = ?` | 查询用户资料 |
| 5 | user.js (profile PUT) | `SELECT id FROM users WHERE username = ? AND id != ?` | 用户名唯一性检查（排除自身） |
| 6 | user.js (profile PUT) | `UPDATE users SET username = ?, updated_at = datetime('now','localtime') WHERE id = ?` | 更新用户名 |
| 7 | user.js (profile PUT) | `UPDATE users SET avatar = ?, updated_at = datetime('now','localtime') WHERE id = ?` | 更新头像 |
| 8 | user.js (profile PUT) | `UPDATE users SET username = ?, avatar = ?, updated_at = datetime('now','localtime') WHERE id = ?` | 同时更新用户名和头像（合并 UPDATE） |
| 9 | user.js (profile PUT 后) | `SELECT id, username, avatar FROM users WHERE id = ?` | 重新查询更新后信息 |
| 10 | user.js (password) | `SELECT id, password, role, password_changed FROM users WHERE id = ?` | 改密前查询 |
| 11 | user.js (password) | `UPDATE users SET password = ?, password_changed = 1, updated_at = datetime('now','localtime') WHERE id = ?` | 更新密码 |

---

## 十、JWT 规范

### 签发参数

| 参数 | 值 |
|------|-----|
| 密钥 | `process.env.JWT_SECRET`（从 `.env` 文件读取） |
| 算法 | HS256（jsonwebtoken 默认） |
| 过期时间 | `'7d'`（7 天） |
| Payload | `{ id: number, username: string, role: 'user' \| 'admin' }` |
| iss | 不设置（简化） |

### 验签

`auth.js` 中间件调用 `jwt.verify(token, process.env.JWT_SECRET, callback)`，不传额外 options。

### Token 传输

客户端在请求头中携带：`Authorization: Bearer <token>`

---

## 十一、中间件使用矩阵（本批次路由）

| 路由 | authMiddleware | adminMiddleware |
|------|:---:|:---:|
| POST /api/auth/register | — | — |
| POST /api/auth/login | — | — |
| POST /api/auth/logout | 是 | — |
| GET /api/user/profile | 是 | — |
| PUT /api/user/profile | 是 | — |
| PUT /api/user/password | 是 | — |

> `adminMiddleware` 本批次未直接使用（无管理员专属路由），但后续批次中 `admin.js` 路由将使用。

---

## 十二、异常处理策略

1. **可预期的业务错误**（参数校验失败、用户名已存在、登录失败等）：使用 `error()` 函数直接返回对应的 HTTP 状态码和错误码。
2. **不可预期的运行时错误**（数据库操作异常等）：使用 `throw new AppError(statusCode, code, message)` 抛出，由 `errorHandler` 中间件（已在 `app.js` 中注册）统一捕获处理。
3. `AppError` 从 `server/utils/response.js` 统一导入，路由文件中无需单独引用 `errorHandler.js`。

## 十三、bcrypt 使用规范

- **哈希**: `bcrypt.hashSync(password, 10)` — saltRounds 固定为 10
- **比对**: `bcrypt.compareSync(plainPassword, hashedPassword)` — 返回 boolean
- 与 `database.js` 种子脚本中使用的参数一致

## 十四、package.json 依赖确认

本批次需要的 npm 依赖（已安装，无需新增）：
- `bcryptjs` — 密码哈希
- `jsonwebtoken` — JWT 签发与验证
- `dotenv` — 加载 .env 中的 `JWT_SECRET`
- `better-sqlite3` — 数据库操作
- `express` — Web 框架
