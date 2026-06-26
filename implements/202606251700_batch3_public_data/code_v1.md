# 批次 3 代码清单 v1

## 新建文件

1. `server/utils/pagination.js` — `parsePagination(query)` 和 `buildPagination(page, pageSize, total)`
2. `server/utils/jsonFields.js` — `parseTags(tagsText)` 和 `serializeTags(tagsArray)`
3. `server/middleware/optionalAuth.js` — JWT 可选认证中间件，成功设 `req.user`，失败不拦截
4. `server/routes/doctors.js` — `GET /` (分页列表), `GET /:id` (详情)
5. `server/routes/diabetes.js` — `GET /` (全量列表), `GET /:id` (详情)
6. `server/routes/articles.js` — `GET /collections`, `GET /`, `GET /:id`, `POST /:id/collect`, `DELETE /:id/collect`

## 修改文件

7. `server/routes/index.js` — 挂载 `/doctors`, `/articles`, `/diabetes-types` 路由，移除对应注释行
