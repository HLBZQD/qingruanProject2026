# 批次 3 实现计划：公共业务数据接口

## 目标

完成前端首页、资讯页、医生咨询页所需的公共数据接口，使系统具备基础内容展示能力。

## 涉及文件

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `server/utils/pagination.js` | 统一分页工具 |
| 新建 | `server/utils/jsonFields.js` | tags JSON 解析/序列化 |
| 新建 | `server/routes/doctors.js` | 医生接口 |
| 新建 | `server/routes/diabetes.js` | 糖尿病类型接口 |
| 新建 | `server/routes/articles.js` | 文章接口 |
| 修改 | `server/routes/index.js` | 挂载新路由模块 |
| 新建 | `server/middleware/optionalAuth.js` | 可选认证中间件（用于 `is_collected` 判断） |

## 详细设计

### 1. `server/utils/pagination.js` — 统一分页工具

**函数签名**: `parsePagination(query)` → `{ page, pageSize, offset, limit }`

**规则**:
- `page` 默认 1，从 `query.page` 解析，必须为正整数
- `pageSize` 默认 20，从 `query.pageSize` 解析，最大值 100
- `offset = (page - 1) * pageSize`
- 返回对象包含 `page`, `pageSize`, `offset`, `limit` (= pageSize)

**补充分页信息**: `buildPagination(page, pageSize, total)` → `{ page, pageSize, total, totalPages }`
- `totalPages = Math.ceil(total / pageSize)`

### 2. `server/utils/jsonFields.js` — JSON 字段工具

**函数**:
- `parseTags(tagsText)` — 将 `TEXT` 字段 `JSON.parse` 为 `string[]`，异常时返回 `[]`
- `serializeTags(tagsArray)` — 将 `string[]` 序列化为 `JSON.stringify` 结果

### 3. `server/middleware/optionalAuth.js` — 可选认证中间件

**功能**: 尝试解析 JWT token，成功则设置 `req.user`，失败不阻断请求（`req.user` 保持 `undefined`）

**使用场景**: `GET /api/articles/:id` 需要判断 `is_collected` 但不强制登录

### 4. `server/routes/doctors.js` — 医生接口

#### `GET /api/doctors?page=1&pageSize=20`
- 使用 `parsePagination` 解析分页参数
- 查询 `doctor_information` 表，排除 `chat_token` 字段
- 使用 `buildPagination` 构建分页信息
- 返回: `{ success: true, data: [...], pagination: {...} }`
- 列表项字段: `id, name, department, title, description, avatar`

#### `GET /api/doctors/:id`
- 按 id 查询 `doctor_information`，排除 `chat_token`，增加 `created_at`
- 不存在时 `throw new AppError(404, 'NOT_FOUND', '医生不存在')`
- 返回: `{ success: true, data: {...} }`
- 详情字段: `id, name, department, title, description, avatar, created_at`

### 5. `server/routes/diabetes.js` — 糖尿病类型接口

#### `GET /api/diabetes-types`
- 查询 `diabetes_types` 表全部记录
- 返回: `{ success: true, data: [...], pagination: {...} }`
- 字段: `id, name, image, pathogenesis, manifestation, treatment`

**注意**: 设计文档 3.2.24 节响应体不包含 `pagination`，但考虑到后续可能扩展，添加分页兼容。实际上依据设计文档响应体，list 目前无 pagination。即直接返回数组。

#### `GET /api/diabetes-types/:id`
- 按 id 查询 `diabetes_types`
- 不存在时 `throw new AppError(404, 'NOT_FOUND', '糖尿病类型不存在')`
- 返回: `{ success: true, data: {...} }`

### 6. `server/routes/articles.js` — 文章接口

#### `GET /api/articles?page=1&pageSize=20&category=饮食指导`
- 使用 `parsePagination` 解析分页参数
- 强制 `WHERE user_id IS NULL`（仅公共文章）
- 可选 `category` 筛选
- 按 `created_at DESC` 排序
- `tags` 使用 `parseTags` 从 TEXT 转为 `string[]`
- 查询字段: `id, title, cover, author, category, tags, summary, views, created_at`
- 返回: `{ success: true, data: [...], pagination: {...} }`

#### `GET /api/articles/:id`
- 使用 `optionalAuth`（不强制登录）
- 按 id 查询 `articles`，不存在返回 404
- 查询字段: `id, title, cover, author, content, category, tags, summary, views, created_at`
- `tags` 使用 `parseTags` 解析
- `is_collected`: 若 `req.user` 存在，查询 `article_collections`；否则 `false`
- 返回: `{ success: true, data: {...} }`

#### `POST /api/articles/:id/collect`
- 使用 `authMiddleware`（强制登录）
- 验证文章存在（不存在返回 404）
- 检查重复收藏：`SELECT id FROM article_collections WHERE user_id = ? AND article_id = ?`
  - 已存在则返回 `{ success: true, message: '文章已收藏' }`
- 插入收藏记录
- 返回: `{ success: true, message: '收藏成功' }`

#### `DELETE /api/articles/:id/collect`
- 使用 `authMiddleware`（强制登录）
- 查询当前用户的收藏记录
- 不存在则 `throw new AppError(404, 'NOT_FOUND', '未收藏该文章')`
- 删除收藏记录
- 返回: `{ success: true, message: '已取消收藏' }`

#### `GET /api/articles/collections?page=1&pageSize=20`
- 使用 `authMiddleware`（强制登录）
- 路由必须在 `/:id` 之前定义，避免 `collections` 被捕获为 `:id`
- JOIN `article_collections` 与 `articles`
- 只查公共文章（`user_id IS NULL`）的收藏
- 查询字段同文章列表 + `collect_id`（article_collections.id）
- `tags` 使用 `parseTags` 解析
- 返回: `{ success: true, data: [...], pagination: {...} }`

### 7. `server/routes/index.js` — 路由挂载

在现有 `router.use('/user', require('./user'));` 之后添加:
```js
router.use('/doctors', require('./doctors'));
router.use('/diabetes-types', require('./diabetes'));
router.use('/articles', require('./articles'));
```

## 错误处理

遵循现有代码约定:
- 资源不存在: `throw new AppError(404, 'NOT_FOUND', '...')`
- 参数校验: `return error(res, 'VALIDATION_ERROR', '...', 422)`
- 认证: `return error(res, 'AUTH_REQUIRED', '...', 401)` (由 authMiddleware 处理)
- 数据库错误: 由 `errorHandler` 兜底

## 数据流图

```
请求 → Express Router
  ├── /api/doctors → doctors.js → doctor_information 表（不含 chat_token）
  ├── /api/diabetes-types → diabetes.js → diabetes_types 表
  └── /api/articles → articles.js
        ├── GET / → articles 表 (user_id IS NULL) + 分页
        ├── GET /:id → articles 表 + article_collections 联查 (optionalAuth)
        ├── POST /:id/collect → article_collections 插入 (auth)
        ├── DELETE /:id/collect → article_collections 删除 (auth)
        └── GET /collections → articles JOIN article_collections (auth)
```

## 前置依赖

- `server/db/database.js` — 已有 SQLite 初始化
- `server/db/init.sql` — 已含 `doctor_information`, `articles`, `diabetes_types`, `article_collections` 表
- `server/db/seed.sql` — 已有测试数据
- `server/utils/response.js` — `success`, `error`, `AppError` 已有
- `server/middleware/auth.js` — JWT 认证已有
- `server/middleware/errorHandler.js` — 全局错误处理已有
