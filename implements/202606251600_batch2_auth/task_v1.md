# Task v1: 统一响应工具模块 — server/utils/response.js

## 任务目标
创建 `server/utils/response.js`，提供统一成功/错误响应辅助函数。所有后续路由模块和中间件均依赖此模块来规范 API 响应格式，确保整个后端接口输出风格一致。

## 涉及文件

| 文件 | 操作 | 职责说明 |
|------|------|---------|
| `server/utils/response.js` | 新建 | 提供 `success()` / `error()` 两个统一响应函数，覆盖所有 API 场景 |

## 响应格式规约

### 成功响应格式
```json
{
  "success": true,
  "message": "操作成功",
  "data": { ... }
}
```

### 错误响应格式
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "人类可读的错误描述"
  }
}
```

## 函数设计规格

### `success(res, data, message, statusCode)`
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `res` | Express Response | 是 | — | Express 响应对象 |
| `data` | any | 否 | `null` | 响应数据体，注册/登录时传 `{ token, role, user }`，查询时传结果对象/数组 |
| `message` | string | 否 | `'操作成功'` | 人类可读成功消息，注册时为 `'注册成功'`，登出时为 `'已登出'` |
| `statusCode` | number | 否 | `200` | HTTP 状态码，注册用 `201`，普通操作用 `200` |

**行为**: 调用 `res.status(statusCode).json({ success: true, message, data })`

### `error(res, code, message, statusCode)`
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `res` | Express Response | 是 | — | Express 响应对象 |
| `code` | string | 是 | — | 错误码枚举值，如 `'VALIDATION_ERROR'`、`'AUTH_INVALID'`、`'CONFLICT'` 等 |
| `message` | string | 是 | — | 人类可读错误描述 |
| `statusCode` | number | 否 | `400` | HTTP 状态码，对应 3.4 节错误码表 |

**行为**: 调用 `res.status(statusCode).json({ error: { code, message } })`

### 额外导出
- `AppError` — 从 `server/middleware/errorHandler.js` 导入并 re-export，供路由处理器通过 `throw new AppError(409, 'CONFLICT', '用户名已存在')` 方式抛出业务异常

## 错误码参考表（与详细设计 3.4 节对齐）

| HTTP 状态码 | 错误码 | 触发场景（本批次涉及的） |
|-------------|--------|--------------------------|
| 400 | BAD_REQUEST | 请求体格式错误 |
| 401 | AUTH_REQUIRED | 未携带 token 或 token 无效/过期 |
| 401 | AUTH_INVALID | 登录用户名或密码错误 |
| 403 | FORBIDDEN | 非管理员访问管理员接口 |
| 404 | NOT_FOUND | 用户不存在 |
| 409 | CONFLICT | 注册时用户名已存在 |
| 422 | VALIDATION_ERROR | 用户名/密码不符合规则、字段类型错误 |
| 500 | INTERNAL_ERROR | 数据库操作异常等未捕获错误 |

## 文件依赖关系
- 依赖 `server/middleware/errorHandler.js`（仅引用 `AppError` 类，不引用 `errorHandler` 函数）
- 被依赖方：本批次所有其他模块（validators.js、middleware/auth.js、middleware/admin.js、routes/auth.js、routes/user.js）

## 注意事项
1. 本模块是纯工具函数，不涉及数据库操作
2. 默认 HTTP 状态码选型：`error()` 默认为 400（因为 `errorHandler` 中间件已捕获 500 兜底错误），调用方应根据具体错误场景传入正确状态码
3. `message` 参数必须传递人类可读的中文描述，前端可直接展示
4. `data` 参数类型不做约束，接收 `null`、`object`、`array` 等任意 JSON 可序列化值
5. `AppError` 的 re-export 是为了统一导入入口——路由文件只需 `require('../utils/response')` 即可同时获得响应函数和异常类
