# Code v1: Batch 2 认证鉴权—代码完成记录

## 新建文件

1. `server/utils/response.js` — 统一响应格式 {success,data,message} 和 {error:{code,message}}，re-export AppError
2. `server/utils/validators.js` — 输入校验（用户名、密码强度、必填字段检查）
3. `server/middleware/auth.js` — JWT 鉴权中间件
4. `server/middleware/admin.js` — 管理员角色校验中间件
5. `server/routes/auth.js` — 注册/登录/登出路由
6. `server/routes/user.js` — 用户资料/修改密码路由

## 修改文件

7. `server/routes/index.js` — 挂载 auth 和 user 路由模块
