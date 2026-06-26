# 批次 3 详细技术规格 v1

## T1: `server/utils/pagination.js`

### 文件结构

```js
const { error } = require('./response');
// 无需 db 依赖
```

### 函数 1: `parsePagination(query)`

| 项目 | 规格 |
|------|------|
| **签名** | `parsePagination(query: object) => { page: number, pageSize: number, offset: number, limit: number }` |
| **输入** | `req.query` 对象 (Express query string 解析结果，所有值均为 `string` 或 `undefined`) |
| **输出** | `{ page, pageSize, offset, limit }` 四个整数属性 |
| **`page` 来源** | `query.page`，非空且 `Number(page)` 为正整数时使用，否则默认 `1` |
| **`pageSize` 来源** | `query.pageSize`，非空且 `Number(pageSize)` 为正整数时使用，否则默认 `20` |
| **`pageSize` 上限** | 若 `pageSize > 100`，强制截断为 `100` |
| **`offset` 计算** | `(page - 1) * pageSize` |
| **`limit` 计算** | 等于 `pageSize` |
| **校验失败** | 不抛异常。非法值（NaN、非正数）静默回退到默认值。使用 `isNaN` 判断 |

**伪代码逻辑**:
```
let page = 1, pageSize = 20
if query.page && Number(query.page) > 0 && !isNaN(Number(query.page)):
    page = Number(query.page)
if query.pageSize && Number(query.pageSize) > 0 && !isNaN(Number(query.pageSize)):
    pageSize = Number(query.pageSize)
if pageSize > 100: pageSize = 100
offset = (page - 1) * pageSize
return { page, pageSize, offset, limit: pageSize }
```

### 函数 2: `buildPagination(page, pageSize, total)`

| 项目 | 规格 |
|------|------|
| **签名** | `buildPagination(page: number, pageSize: number, total: number) => { page, pageSize, total, totalPages }` |
| **输入** | `page` (当前页码), `pageSize` (每页条数), `total` (总记录数) |
| **输出** | `{ page, pageSize, total, totalPages }` |
| **`totalPages` 计算** | `Math.ceil(total / pageSize)` |

### 导出

```js
module.exports = { parsePagination, buildPagination };
```

---

## T2: `server/utils/jsonFields.js`

### 文件结构

```js
// 无外部依赖
```

### 函数 1: `parseTags(tagsText)`

| 项目 | 规格 |
|------|------|
| **签名** | `parseTags(tagsText: string | null | undefined) => string[]` |
| **输入** | `articles.tags` TEXT 列值（SQLite 返回 string，或为 null/undefined） |
| **输出** | JavaScript `string[]` 数组 |
| **正常流程** | `JSON.parse(tagsText)` 得到数组，返回该数组 |
| **异常流程** | `try-catch` 包裹 `JSON.parse`，任何异常返回 `[]` |
| **空值处理** | 如果 `tagsText == null || tagsText === ''`，不进入 `JSON.parse`，直接返回 `[]` |

**伪代码逻辑**:
```
function parseTags(tagsText):
    if !tagsText: return []
    try:
        result = JSON.parse(tagsText)
        if Array.isArray(result): return result
        return []
    catch: return []
```

### 函数 2: `serializeTags(tagsArray)`

| 项目 | 规格 |
|------|------|
| **签名** | `serializeTags(tagsArray: string[]) => string` |
| **输入** | JavaScript `string[]` 数组 |
| **输出** | JSON 字符串，如 `'["tag1","tag2"]'` |
| **实现** | `JSON.stringify(tagsArray)` |

### 导出

```js
module.exports = { parseTags, serializeTags };
```

---

## T3: `server/middleware/optionalAuth.js`

### 文件结构

```js
const jwt = require('jsonwebtoken');
// 不引入 response (不发送错误响应)
```

### 函数: `optionalAuth(req, res, next)`

| 项目 | 规格 |
|------|------|
| **签名** | `optionalAuth(req, res, next)` — 标准 Express 中间件签名 |
| **行为** | 尝试从 `req.headers['authorization']` 提取并验证 Bearer JWT token |
| **无 token** | 若 `!authHeader || !authHeader.startsWith('Bearer ')` → 直接 `next()` (不阻断) |
| **有 token** | 提取 `authHeader.split(' ')[1]`，调用 `jwt.verify(token, process.env.JWT_SECRET)` |
| **验证成功** | 设置 `req.user = { id: decoded.id, username: decoded.username, role: decoded.role }`，然后 `next()` |
| **验证失败** | 任何 JWT 错误（过期、无效等）→ 直接 `next()`（不返回 401，不设置 `req.user`） |
| **与 auth.js 区别** | auth.js 在 token 缺失/过期/无效时均返回 401 错误；optionalAuth 全部 silent 通过 |

**伪代码逻辑**:
```
function optionalAuth(req, res, next):
    authHeader = req.headers['authorization']
    if !authHeader || !authHeader.startsWith('Bearer '): return next()
    token = authHeader.split(' ')[1]
    if !token: return next()
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) =>
        if err: return next()
        req.user = { id: decoded.id, username: decoded.username, role: decoded.role }
        next()
    )
```

### 导出

```js
module.exports = optionalAuth;
```

---

## T4: `server/routes/doctors.js`

### 文件结构

```js
const express = require('express');
const { db } = require('../db/database');
const { success, AppError } = require('../utils/response');
const { parsePagination, buildPagination } = require('../utils/pagination');

const router = express.Router();
```

### 端点 1: `GET /` — 医生列表

| 项目 | 规格 |
|------|------|
| **路由** | `router.get('/', (req, res) => {...})` |
| **参数** | query: `page`, `pageSize` |
| **分页** | `const { page, pageSize, offset, limit } = parsePagination(req.query)` |
| **总数查询** | `const { total } = db.prepare('SELECT COUNT(*) AS total FROM doctor_information').get()` |
| **数据查询** | `const rows = db.prepare('SELECT id, name, department, title, description, avatar FROM doctor_information LIMIT ? OFFSET ?').all(limit, offset)` |
| **chat_token 排除** | SELECT 列表中**不包含** `chat_token` 字段（安全要求） |
| **响应格式** | `success(res, rows, '查询成功', 200)` 但需要**手动在返回对象上追加 `pagination` 字段** |
| **实现方式** | 不使用 `success` 函数（因为需要额外字段），直接构造响应体 |

**实际响应代码**:
```js
const { total } = db.prepare('SELECT COUNT(*) AS total FROM doctor_information').get();
const rows = db.prepare('SELECT id, name, department, title, description, avatar FROM doctor_information LIMIT ? OFFSET ?').all(limit, offset);
const pagination = buildPagination(page, pageSize, total);
res.status(200).json({ success: true, message: '查询成功', data: rows, pagination });
```

**响应 JSON 结构**:
```json
{
  "success": true,
  "message": "查询成功",
  "data": [
    {
      "id": 1,
      "name": "张明远",
      "department": "内分泌科",
      "title": "主任医师",
      "description": "从事内分泌代谢疾病临床工作20年...",
      "avatar": "/static/images/doctors/doc1.jpg"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 3,
    "totalPages": 1
  }
}
```

### 端点 2: `GET /:id` — 医生详情

| 项目 | 规格 |
|------|------|
| **路由** | `router.get('/:id', (req, res) => {...})` |
| **参数** | `req.params.id` |
| **SQL** | `SELECT id, name, department, title, description, avatar, created_at FROM doctor_information WHERE id = ?` |
| **chat_token 排除** | SELECT 列表中**不包含** `chat_token` |
| **不存在** | `throw new AppError(404, 'NOT_FOUND', '医生不存在')` |
| **成功** | `success(res, row, '查询成功', 200)` |

**伪代码逻辑**:
```
GET /:id:
    row = db.prepare('SELECT id, name, department, title, description, avatar, created_at FROM doctor_information WHERE id = ?').get(req.params.id)
    if !row: throw new AppError(404, 'NOT_FOUND', '医生不存在')
    success(res, row, '查询成功', 200)
```

**响应 JSON 结构**:
```json
{
  "success": true,
  "message": "查询成功",
  "data": {
    "id": 1,
    "name": "张明远",
    "department": "内分泌科",
    "title": "主任医师",
    "description": "...",
    "avatar": "/static/...",
    "created_at": "2026-06-01T08:00:00"
  }
}
```

### 导出

```js
module.exports = router;
```

---

## T5: `server/routes/diabetes.js`

### 文件结构

```js
const express = require('express');
const { db } = require('../db/database');
const { success, AppError } = require('../utils/response');

const router = express.Router();
```

### 注意事项

- 路由挂载路径为 `/diabetes-types`（在 index.js 中配置 `router.use('/diabetes-types', diabetesRoutes)`）
- 路由文件内部定义 `GET /` 和 `GET /:id`，完整路径为 `/api/diabetes-types` 和 `/api/diabetes-types/:id`
- **列表接口不含分页**，直接返回全量 `data` 数组（按设计文档 3.2.24 响应结构）

### 端点 1: `GET /` — 糖尿病类型列表

| 项目 | 规格 |
|------|------|
| **路由** | `router.get('/', (req, res) => {...})` |
| **参数** | 无 |
| **SQL** | `SELECT id, name, image, pathogenesis, manifestation, treatment FROM diabetes_types` |
| **分页** | 无 pagination — 直接返回全部记录的数组 |
| **成功** | `success(res, rows, '查询成功', 200)` |

**响应 JSON 结构**:
```json
{
  "success": true,
  "message": "查询成功",
  "data": [
    {
      "id": 1,
      "name": "1型糖尿病",
      "image": "/static/images/diabetes/t1.jpg",
      "pathogenesis": "1型糖尿病是一种自身免疫性疾病...",
      "manifestation": "多发生于儿童和青少年...",
      "treatment": "需终身依赖胰岛素治疗..."
    }
  ]
}
```

### 端点 2: `GET /:id` — 糖尿病类型详情

| 项目 | 规格 |
|------|------|
| **路由** | `router.get('/:id', (req, res) => {...})` |
| **参数** | `req.params.id` |
| **SQL** | `SELECT id, name, image, pathogenesis, manifestation, treatment FROM diabetes_types WHERE id = ?` |
| **不存在** | `throw new AppError(404, 'NOT_FOUND', '糖尿病类型不存在')` |
| **成功** | `success(res, row, '查询成功', 200)` |

**响应 JSON 结构**:
```json
{
  "success": true,
  "message": "查询成功",
  "data": {
    "id": 1,
    "name": "1型糖尿病",
    "image": "/static/images/diabetes/t1.jpg",
    "pathogenesis": "...",
    "manifestation": "...",
    "treatment": "..."
  }
}
```

### 导出

```js
module.exports = router;
```

---

## T6: `server/routes/articles.js`

### 文件结构

```js
const express = require('express');
const { db } = require('../db/database');
const { success, AppError } = require('../utils/response');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { parseTags } = require('../utils/jsonFields');
const authMiddleware = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');

const router = express.Router();
```

### 路由顺序 (重要!)

```
1. GET  /collections      (authMiddleware - 必须在 :id 之前)
2. GET  /                 (无需认证 - 公共文章列表)
3. GET  /:id              (optionalAuth)
4. POST /:id/collect      (authMiddleware)
5. DELETE /:id/collect    (authMiddleware)
```

### 端点 1: `GET /collections` — 当前用户收藏列表

| 项目 | 规格 |
|------|------|
| **路由** | `router.get('/collections', authMiddleware, (req, res) => {...})` |
| **认证** | 必选 authMiddleware |
| **分页** | `parsePagination(req.query)` |
| **user_id 隔离** | 使用 `req.user.id` 作为 WHERE 条件，仅查当前登录用户的收藏 |
| **总数 SQL** | `SELECT COUNT(*) AS total FROM article_collections WHERE user_id = ?` |
| **数据 SQL** | `SELECT a.id, a.title, a.cover, a.author, a.category, a.tags, a.summary, a.views, a.created_at, ac.id AS collect_id FROM article_collections ac JOIN articles a ON ac.article_id = a.id WHERE ac.user_id = ? ORDER BY ac.created_at DESC LIMIT ? OFFSET ?` |
| **参数顺序** | `[req.user.id, limit, offset]` |
| **tags 处理** | 对每行 `row.tags = parseTags(row.tags)` |
| **响应** | `res.status(200).json({ success: true, message: '查询成功', data: rows, pagination })` |

**collect_id 字段**: 来自 `article_collections.id`，用于前端标识收藏记录 ID。

**注意事项**:
- JOIN 用 `articles` 表（`a` 别名）而非直接查 `articles`（可能含私有文章）。根据设计文档 plan.md，收藏列表 LIMIT 是[仅公共文章](deviation)还是不限制？检查 task_v1.md T6 第 2 项: 只用 `WHERE ac.user_id = ?`，没有额外的 `articles.user_id IS NULL` 限制，即收藏列表展示所有已收藏文章（不论公开/私有）。

### 端点 2: `GET /` — 公共文章列表

| 项目 | 规格 |
|------|------|
| **路由** | `router.get('/', (req, res) => {...})` |
| **认证** | 无（可选） |
| **分页** | `parsePagination(req.query)` |
| **user_id 隔离** | 强制 `WHERE user_id IS NULL`，仅返回系统/管理员发布的公共文章 |
| **category 筛选** | 可选。若 `req.query.category` 存在，追加以 `AND category = ?` |
| **动态 SQL 构建** | 使用数组拼接 WHERE 条件和参数 |
| **排序** | `ORDER BY created_at DESC` |
| **总数 SQL** | `SELECT COUNT(*) AS total FROM articles WHERE user_id IS NULL [AND category = ?]` |
| **数据 SQL** | `SELECT id, title, cover, author, category, tags, summary, views, created_at FROM articles WHERE user_id IS NULL [AND category = ?] ORDER BY created_at DESC LIMIT ? OFFSET ?` |
| **参数顺序** | `[category?, limit, offset]` |
| **tags 处理** | 对每行 `row.tags = parseTags(row.tags)` |
| **响应** | `res.status(200).json({ success: true, message: '查询成功', data: rows, pagination })` |

**动态 SQL 构建伪代码**:
```
params = []
countSQL = 'SELECT COUNT(*) AS total FROM articles WHERE user_id IS NULL'
dataSQL  = 'SELECT id, title, cover, author, category, tags, summary, views, created_at FROM articles WHERE user_id IS NULL'

if req.query.category:
    countSQL += ' AND category = ?'
    dataSQL  += ' AND category = ?'
    params.push(req.query.category)

// COUNT 查询用 params
total = db.prepare(countSQL).get(...params).total

// 数据查询加 limit, offset
dataSQL += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
rows = db.prepare(dataSQL).all(...params, limit, offset)
```

### 端点 3: `GET /:id` — 文章详情

| 项目 | 规格 |
|------|------|
| **路由** | `router.get('/:id', optionalAuth, (req, res) => {...})` |
| **认证** | 可选认证 (optionalAuth)，用于判断 `is_collected` |
| **SQL** | `SELECT id, title, cover, author, content, category, tags, summary, views, created_at FROM articles WHERE id = ?` |
| **不存在** | `throw new AppError(404, 'NOT_FOUND', '文章不存在')` |
| **tags 处理** | `row.tags = parseTags(row.tags)` |
| **is_collected 逻辑** | 见下表 |
| **成功** | `success(res, row, '查询成功', 200)` — 先用 `success` 构造响应，再在原 data 对象上设置 `is_collected`，然后返回 |

**is_collected 判断逻辑**:
```
if req.user:
    exists = db.prepare('SELECT 1 FROM article_collections WHERE user_id = ? AND article_id = ?').get(req.user.id, req.params.id)
    row.is_collected = !!exists
else:
    row.is_collected = false
```

**响应 JSON 结构**:
```json
{
  "success": true,
  "message": "查询成功",
  "data": {
    "id": 1,
    "title": "糖尿病患者的饮食指南",
    "cover": "https://example.com/cover.jpg",
    "author": "AI健康助手",
    "content": "# 糖尿病患者的饮食指南\n\n...",
    "category": "饮食指导",
    "tags": ["饮食", "血糖管理"],
    "summary": "本文从...",
    "views": 1201,
    "is_collected": true,
    "created_at": "2026-06-01T10:00:00"
  }
}
```

### 端点 4: `POST /:id/collect` — 收藏文章

| 项目 | 规格 |
|------|------|
| **路由** | `router.post('/:id/collect', authMiddleware, (req, res) => {...})` |
| **认证** | 必选 authMiddleware |
| **Step 1: 验证文章存在** | `SELECT id FROM articles WHERE id = ?` → 不存在则 `throw new AppError(404, 'NOT_FOUND', '文章不存在')` |
| **Step 2: 检查重复收藏** | `SELECT id FROM article_collections WHERE user_id = ? AND article_id = ?` [req.user.id, req.params.id] |
| **已收藏** | `success(res, null, '文章已收藏', 200)` — 注意: data 为 null |
| **Step 3: 插入收藏** | `INSERT INTO article_collections (user_id, article_id) VALUES (?, ?)` [req.user.id, req.params.id] |
| **成功** | `success(res, null, '收藏成功', 200)` |

**注意事项**:
- `article_collections` 有 `UNIQUE(user_id, article_id)` 约束，重复插入会抛 SQLite 约束错误，所以在 Step 2 做业务前置检查更友好。
- 不需要事务 — 两个独立查询足够。

### 端点 5: `DELETE /:id/collect` — 取消收藏

| 项目 | 规格 |
|------|------|
| **路由** | `router.delete('/:id/collect', authMiddleware, (req, res) => {...})` |
| **认证** | 必选 authMiddleware |
| **Step 1: 检查收藏记录** | `SELECT id FROM article_collections WHERE user_id = ? AND article_id = ?` [req.user.id, req.params.id] |
| **未收藏** | `throw new AppError(404, 'NOT_FOUND', '未收藏该文章')` |
| **Step 2: 删除** | `DELETE FROM article_collections WHERE user_id = ? AND article_id = ?` [req.user.id, req.params.id] |
| **成功** | `success(res, null, '已取消收藏', 200)` |

### 导出

```js
module.exports = router;
```

---

## T7: `server/routes/index.js` — 路由挂载

### 新增 require 语句 (在文件顶部已有 require 下方)

```js
const doctorsRoutes = require('./doctors');
const articlesRoutes = require('./articles');
const diabetesRoutes = require('./diabetes');
```

### 新增 router.use 语句 (在 `router.use('/user', require('./user'));` 之后)

```js
router.use('/doctors', doctorsRoutes);
router.use('/articles', articlesRoutes);
router.use('/diabetes-types', diabetesRoutes);
```

### 同步操作

1. **删除**注释块中对应的注释行（`// const doctorsRoutes = ...`, `// const articlesRoutes = ...`, `// const diabetesRoutes = ...` 及对应的 `// router.use(...)` 注释）
2. 保留尚未实现的模块注释行（chatRoutes, riskRoutes, planRoutes 等）

---

## 错误处理汇总

| 场景 | 错误码 | HTTP 状态码 | 消息 |
|------|--------|-------------|------|
| 医生不存在 | `NOT_FOUND` | 404 | 医生不存在 |
| 糖尿病类型不存在 | `NOT_FOUND` | 404 | 糖尿病类型不存在 |
| 文章不存在 | `NOT_FOUND` | 404 | 文章不存在 |
| 未收藏该文章 | `NOT_FOUND` | 404 | 未收藏该文章 |
| 未登录访问需认证接口 | `AUTH_REQUIRED` | 401 | (由 authMiddleware 自动处理) |
| 数据库/其他运行时错误 | (由 errorHandler 兜底) | 500 | (由 errorHandler 处理) |

---

## 响应格式约定

### success 响应 (有 data 无 pagination)
```json
{ "success": true, "message": "...", "data": {...} }
```

### success 响应 (有 data + pagination)
```json
{ "success": true, "message": "...", "data": [...], "pagination": { "page": 1, "pageSize": 20, "total": 3, "totalPages": 1 } }
```

### success 响应 (无 data，仅 message)
```json
{ "success": true, "message": "收藏成功", "data": null }
```

### 404 错误 (AppError)
```json
{ "error": { "code": "NOT_FOUND", "message": "文章不存在" } }
```
