# 批次 3 任务分解 v1

## 任务依赖关系

```
T1 (pagination.js) ──────────────────────────┐
T2 (jsonFields.js) ──────────────────────────┤
T3 (optionalAuth.js) ────────────────────────┤
                                              ├── T4 (doctors.js) ──┐
                                              ├── T5 (diabetes.js) ─┤
                                              └── T6 (articles.js) ─┤
                                                                     ├── T7 (routes/index.js)
                                                                     └── T8 (验证测试)
```

## 任务列表

### T1: 创建 `server/utils/pagination.js`

**依赖**: 无

**内容**:
1. 导出 `parsePagination(query)`
   - 从 `query.page` 解析页码（默认 1，正整数）
   - 从 `query.pageSize` 解析每页条数（默认 20，最大 100）
   - 计算 `offset = (page - 1) * pageSize`
   - 返回 `{ page, pageSize, offset, limit }`
2. 导出 `buildPagination(page, pageSize, total)`
   - 计算 `totalPages = Math.ceil(total / pageSize)`
   - 返回 `{ page, pageSize, total, totalPages }`

### T2: 创建 `server/utils/jsonFields.js`

**依赖**: 无

**内容**:
1. 导出 `parseTags(tagsText)`
   - 对 `JSON.parse(tagsText)` 做 try-catch
   - 成功返回 `string[]`，失败返回 `[]`
2. 导出 `serializeTags(tagsArray)`
   - `JSON.stringify(tagsArray)`

### T3: 创建 `server/middleware/optionalAuth.js`

**依赖**: 无（参考已有 `server/middleware/auth.js`）

**内容**:
1. 从 `req.headers['authorization']` 提取 Bearer token
2. 若无 token 或格式错误，直接 `next()`（不阻断）
3. 使用 `jwt.verify` 验证 token
4. 成功则设置 `req.user = { id, username, role }` 并 `next()`
5. 失败也直接 `next()`（不返回错误）

### T4: 创建 `server/routes/doctors.js`

**依赖**: T1

**内容**:
1. `GET /` — 医生列表
   - 调用 `parsePagination(req.query)`
   - `SELECT id, name, department, title, description, avatar FROM doctor_information LIMIT ? OFFSET ?`
   - `SELECT COUNT(*) AS total FROM doctor_information`
   - 调用 `buildPagination`
   - `success(res, data, '查询成功', 200)` 且手动追加上 `pagination` 字段
2. `GET /:id` — 医生详情
   - `SELECT id, name, department, title, description, avatar, created_at FROM doctor_information WHERE id = ?`
   - 不存在 → `throw new AppError(404, 'NOT_FOUND', '医生不存在')`
   - `success(res, row, '查询成功', 200)`

### T5: 创建 `server/routes/diabetes.js`

**依赖**: 无

**内容**:
1. `GET /` — 类型列表
   - `SELECT id, name, image, pathogenesis, manifestation, treatment FROM diabetes_types`
   - `success(res, rows, '查询成功', 200)`
   - **注意**: 设计文档 3.2.24 响应不含 pagination，直接返回 data 数组
2. `GET /:id` — 类型详情
   - `SELECT id, name, image, pathogenesis, manifestation, treatment FROM diabetes_types WHERE id = ?`
   - 不存在 → `throw new AppError(404, 'NOT_FOUND', '糖尿病类型不存在')`
   - `success(res, row, '查询成功', 200)`

### T6: 创建 `server/routes/articles.js`

**依赖**: T1, T2, T3

**内容**:
1. **`GET /`** — 文章列表（注意：此路由在 `GET /collections` 和 `GET /:id` 之后定义即可，因 `/` 不冲突）
   - 调用 `parsePagination(req.query)`
   - 构建动态查询：基础 `WHERE user_id IS NULL`，若有 `req.query.category` 则追加 `AND category = ?`
   - `COUNT(*)` 查询总数
   - `SELECT id, title, cover, author, category, tags, summary, views, created_at FROM articles WHERE ... ORDER BY created_at DESC LIMIT ? OFFSET ?`
   - 对每行 `row.tags = parseTags(row.tags)`
   - `success` + 手动追加 `pagination`

2. **`GET /collections`** — 收藏列表（必须在 `GET /:id` 之前定义）
   - `authMiddleware`
   - 调用 `parsePagination(req.query)`
   - `SELECT COUNT(*) AS total FROM article_collections WHERE user_id = ?`
   - `SELECT articles.id, articles.title, articles.cover, articles.author, articles.category, articles.tags, articles.summary, articles.views, articles.created_at, ac.id AS collect_id FROM article_collections ac JOIN articles ON ac.article_id = articles.id WHERE ac.user_id = ? ORDER BY ac.created_at DESC LIMIT ? OFFSET ?`
   - 对每行 `row.tags = parseTags(row.tags)`
   - `success` + 手动追加 `pagination`

3. **`POST /collections`** — 注意：设计中没有此路径。检查设计文档确认。

   检查确认：设计文档只有 `POST /api/articles/:id/collect`，没有 `POST /api/articles/collections`。所以无需处理。

4. **`GET /:id`** — 文章详情
   - `optionalAuth`
   - `SELECT id, title, cover, author, content, category, tags, summary, views, created_at FROM articles WHERE id = ?`
   - 不存在 → `throw new AppError(404, 'NOT_FOUND', '文章不存在')`
   - `row.tags = parseTags(row.tags)`
   - 若 `req.user` 存在: `SELECT 1 FROM article_collections WHERE user_id = ? AND article_id = ?`
   - 否则 `is_collected = false`
   - `success(res, data, '查询成功', 200)`

5. **`POST /:id/collect`** — 收藏文章
   - `authMiddleware`
   - 验证文章存在 → 不存在 `throw new AppError(404, 'NOT_FOUND', '文章不存在')`
   - 检查重复: `SELECT id FROM article_collections WHERE user_id = ? AND article_id = ?`
   - 已存在 → `success(res, null, '文章已收藏', 200)`
   - 插入: `INSERT INTO article_collections (user_id, article_id) VALUES (?, ?)`
   - `success(res, null, '收藏成功', 200)`

6. **`DELETE /:id/collect`** — 取消收藏
   - `authMiddleware`
   - `SELECT id FROM article_collections WHERE user_id = ? AND article_id = ?`
   - 不存在 → `throw new AppError(404, 'NOT_FOUND', '未收藏该文章')`
   - `DELETE FROM article_collections WHERE user_id = ? AND article_id = ?`
   - `success(res, null, '已取消收藏', 200)`

**路由顺序微调**：由于 `collections` 会与 `:id` 冲突，Express 路由定义顺序必须为:
```
GET /collections
GET /
GET /:id
POST /:id/collect
DELETE /:id/collect
```

### T7: 修改 `server/routes/index.js`

**依赖**: T4, T5, T6

**内容**:
1. 取消注释已存在的路由挂载规划代码
2. 添加 `require` 和 `router.use` 语句:
   ```js
   const doctorsRoutes = require('./doctors');
   const articlesRoutes = require('./articles');
   const diabetesRoutes = require('./diabetes');

   router.use('/doctors', doctorsRoutes);
   router.use('/articles', articlesRoutes);
   router.use('/diabetes-types', diabetesRoutes);
   ```

### T8: 验证测试

**依赖**: T7

**验证项**:
1. `GET /api/doctors?page=1&pageSize=10` — 返回医生列表，不含 `chat_token`
2. `GET /api/doctors/1` — 返回单个医生，含 `created_at`
3. `GET /api/doctors/999` — 返回 404
4. `GET /api/diabetes-types` — 返回所有类型（name, image, pathogenesis, manifestation, treatment）
5. `GET /api/diabetes-types/1` — 返回单个类型
6. `GET /api/diabetes-types/999` — 返回 404
7. `GET /api/articles?page=1&pageSize=10` — 返回公共文章，`user_id IS NULL`，`tags` 为数组
8. `GET /api/articles?category=饮食指导` — 按分类筛选
9. `GET /api/articles/1` — 返回详情含 `content` + `is_collected: false`（未登录）
10. `GET /api/articles/999` — 返回 404
11. `POST /api/articles/1/collect`（未登录）— 返回 401
12. `POST /api/articles/1/collect`（已登录）— 收藏成功
13. `POST /api/articles/1/collect`（已登录，重复）— 返回 "文章已收藏"
14. `DELETE /api/articles/1/collect`（已登录）— 取消成功
15. `DELETE /api/articles/1/collect`（未收藏时再次取消）— 返回 404
16. `GET /api/articles/collections`（已登录）— 返回分页收藏列表，含 `collect_id`
17. `GET /api/articles/1`（已登录，已收藏）— `is_collected: true`
