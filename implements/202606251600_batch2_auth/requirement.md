# 批次 2 实现需求：认证、鉴权与用户体系

## 批次目标
完成用户登录态基础能力，使后续业务接口可以基于 JWT 识别当前用户，并区分普通用户和管理员。

## 涉及文件
```
server/routes/auth.js
server/routes/user.js
server/middleware/auth.js
server/middleware/admin.js
server/utils/validators.js
server/utils/response.js
```

## 实现内容

### JWT 鉴权中间件 (server/middleware/auth.js)
从请求头读取 `Authorization: Bearer <token>`，解析成功后写入 `req.user = { id, username, role }`。

### 管理员校验中间件 (server/middleware/admin.js)
检查 `req.user.role === 'admin'`，否则返回 403 FORBIDDEN。

### 注册接口 POST /api/auth/register
- 用户名 3-50 字符
- 密码不少于 8 位，包含字母和数字
- 用户名唯一
- 密码使用 bcrypt 哈希
- 注册成功直接返回 JWT、role、user（与登录响应结构一致）

### 登录接口 POST /api/auth/login
- 校验用户名和密码
- 返回 token、role、user
- 管理员首次登录时返回 must_change_password

### 登出接口 POST /api/auth/logout
- JWT 无状态设计，后端直接返回成功

### 用户资料接口
- GET /api/user/profile — 获取当前用户资料
- PUT /api/user/profile — 修改用户名、头像
- PUT /api/user/password — 修改密码（支持管理员首次强制改密）

### 工具模块
- server/utils/response.js — 统一成功/错误响应格式
- server/utils/validators.js — 输入校验函数

## 项目根目录
/home/derpyIsTheBest/qingruanProject2026

## 详细设计参考
/home/derpyIsTheBest/qingruanProject2026/docs/2_detailed_design_v3.md 第 3.2.1-3.2.6 节
/home/derpyIsTheBest/qingruanProject2026/docs/3_backend_implementation_batches_v2.md 第 2 批次章节
