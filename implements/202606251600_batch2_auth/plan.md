# Batch 2 实现计划：认证、鉴权与用户体系

## 概述
完成用户登录态基础能力，使后续业务接口可以基于 JWT 识别当前用户，并区分普通用户和管理员。第 1 批次已完成 Express 骨架和 SQLite 数据库，本批次在其上构建认证体系。

## 当前项目状态
- `server/` 已有 `app.js`、`db/`（database.js + init.sql + seed.sql）、`middleware/errorHandler.js`、`routes/index.js`
- `server/utils/` 和 `server/services/` 均为空目录
- `package.json` 已存在，`bcryptjs`、`jsonwebtoken`、`dotenv` 等依赖已安装
- `.env` 已配置 `JWT_SECRET`
- `users` 表已创建，admin 种子数据已就位

## 任务清单

### 1. 统一响应工具模块
- **目标**: 创建 `server/utils/response.js`，提供统一成功/错误响应辅助函数
- **涉及文件**: `server/utils/response.js`（新建）
- **依赖**: 无（本批次最先完成的基础工具）
- **内容要点**:
  - `success(res, data, message, statusCode)` — 统一成功响应
  - `error(res, code, message, statusCode)` — 统一错误响应（对齐 3.4 节错误码格式）
  - 导出 `AppError` 引用（从 `errorHandler.js` re-export，统一异常抛出入口）

### 2. 输入校验工具模块
- **目标**: 创建 `server/utils/validators.js`，提供注册/登录/资料修改的字段校验函数
- **涉及文件**: `server/utils/validators.js`（新建）
- **依赖**: 任务 1（需要 response 模块抛出 422 校验错误）
- **内容要点**:
  - `validateUsername(username)` — 3-50 字符校验
  - `validatePassword(password)` — 不少于 8 位，包含字母和数字
  - `validateRegister(username, password)` — 组合校验用户名和密码
  - `validateLogin(username, password)` — 登录字段非空校验
  - `validateProfile(username, avatar)` — 资料修改字段可选校验

### 3. JWT 鉴权中间件
- **目标**: 创建 `server/middleware/auth.js`，从请求头提取并验证 JWT，解析成功后挂载 `req.user`
- **涉及文件**: `server/middleware/auth.js`（新建）
- **依赖**: 任务 1（需要 response 模块返回 401 AUTH_REQUIRED）
- **内容要点**:
  - 读取 `Authorization: Bearer <token>` 头
  - 使用 `jsonwebtoken.verify()` 验证
  - 成功后写入 `req.user = { id, username, role }`
  - 解析失败返回 401 `AUTH_REQUIRED`
  - token 过期时返回 401 `AUTH_REQUIRED`

### 4. 管理员校验中间件
- **目标**: 创建 `server/middleware/admin.js`，检查当前用户是否为管理员
- **涉及文件**: `server/middleware/admin.js`（新建）
- **依赖**: 任务 3（需要在 auth 中间件之后使用）
- **内容要点**:
  - 检查 `req.user.role === 'admin'`
  - 非管理员返回 403 `FORBIDDEN`

### 5. 认证路由模块
- **目标**: 创建 `server/routes/auth.js`，实现注册、登录、登出接口
- **涉及文件**: `server/routes/auth.js`（新建）
- **依赖**: 任务 1、任务 2、任务 3、任务 4（需要 response、validators、auth/admin 中间件）
- **内容要点**:
  - `POST /api/auth/register` — 用户名/密码校验、唯一性检查、bcrypt 哈希、JWT 签发、返回 token/role/user（201）
  - `POST /api/auth/login` — 用户名/密码校验、bcrypt 比对、JWT 签发、管理员首次登录返回 `must_change_password`（200）
  - `POST /api/auth/logout` — JWT 无状态设计，直接返回成功（200）

### 6. 用户资料路由模块
- **目标**: 创建 `server/routes/user.js`，实现用户资料获取、修改、密码修改接口
- **涉及文件**: `server/routes/user.js`（新建）
- **依赖**: 任务 1、任务 3（需要 response、auth 中间件）
- **内容要点**:
  - `GET /api/user/profile` — 查询当前用户完整信息（id, username, avatar, role, created_at）
  - `PUT /api/user/profile` — 修改用户名和/或头像，校验用户名唯一性和合法性
  - `PUT /api/user/password` — 修改密码，校验 old_password 正确性（管理员首次可免 old_password），bcrypt 哈希新密码，管理员首次改密后更新 password_changed=1

### 7. 路由挂载更新
- **目标**: 更新 `server/routes/index.js`，挂载 auth 和 user 路由模块
- **涉及文件**: `server/routes/index.js`（修改现有文件）
- **依赖**: 任务 5、任务 6（依赖 auth.js 和 user.js 已创建）

## 文件创建顺序与依赖图

```
server/utils/response.js (任务1) ──────┬────────────────────────────┐
                                        │                            │
server/utils/validators.js (任务2)      │                            │
    │                                   ▼                            │
    │               server/middleware/auth.js (任务3) ────────────┐  │
    │                   │                                         │  │
    │                   ├──► server/middleware/admin.js (任务4)    │  │
    │                   │                                         │  │
    ├───────────────────┼──► server/routes/auth.js (任务5) ───┐   │  │
    │                   │                                      │   │  │
    └───────────────────┼──► server/routes/user.js (任务6) ─┐  │   │  │
                        │                                    │  │   │  │
                        │     server/routes/index.js (任务7) ◄┘  │   │  │
                        │     (挂载 auth, user 路由)              │   │  │
                        └────────────────────────────────────────┴───┘──┘
```

- 任务 1、2 可并行
- 任务 3、4 可并行（依赖任务 1）
- 任务 5、6 可并行（依赖任务 1、2、3）
- 任务 7 依赖任务 5、6

## 验收标准

1. 注册成功后能直接获得 token，响应结构与登录一致
2. 登录密码错误返回 401 `AUTH_INVALID`
3. 未携带 token 访问受保护接口返回 401 `AUTH_REQUIRED`
4. 携带有效 token 可访问 `/api/user/profile`
5. 非管理员访问管理员接口返回 403 `FORBIDDEN`
6. 管理员首次登录时能识别 `must_change_password: true`
7. 所有错误响应统一为 `{ error: { code, message } }` 格式
