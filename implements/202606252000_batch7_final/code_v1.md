# Code v1 — 批次7 实现文档

## 变更文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/services/difyService.js:85` | 修改 | `DIFY_API_BASE_URL` → `DIFY_API_BASE` |
| `server/services/sseProxy.js:10` | 修改 | `DIFY_API_BASE_URL` → `DIFY_API_BASE` |
| `server/utils/validators.js:168-178` | 新增 | `validateArticleGenerate` 函数 |
| `server/utils/validators.js:190` | 修改 | 导出 `validateArticleGenerate` |
| `server/routes/articles.js:3` | 修改 | 导入中加入 `error` |
| `server/routes/articles.js:5` | 修改 | 导入中加入 `serializeTags` |
| `server/routes/articles.js:8-9` | 新增 | 导入 `callWorkflowBlocking`, `validateArticleGenerate` |
| `server/routes/articles.js:13-18` | 新增 | `recentGenerates` Map + `DEFAULT_CATEGORIES` 常量 |
| `server/routes/articles.js:21-29` | 新增 | `buildMockArticle` 函数 |
| `server/routes/articles.js:60-156` | 新增 | `POST /generate` 路由 |
| `server/routes/upload.js` | 新建 | multer 头像上传 |
| `server/routes/admin.js` | 新建 | logs + execute 路由 |
| `server/routes/index.js:18-19` | 新增 | 挂载 `/admin`, `/upload` |

## 关键设计决策

1. **POST /generate 路由位置**: 在 `GET /:id` 之前，防止 `/generate` 被匹配为 `:id`
2. **幂等性**: 30秒内同一用户重复请求返回 409
3. **BMI 空结果**: `riskRow ? riskRow.bmi : null`，无记录时所有分类 recommended=false
4. **execute SQL 黑名单**: `\b` 单词边界正则，只匹配完整关键字
5. **multer fileFilter**: `AppError` 实例传播，`instanceof AppError` 检查有效
6. **created_at 格式**: `strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')` ISO8601 T 分隔
7. **DIFy Mock**: articles generate 有独立 Mock，不依赖 difyService 内部 Mock

## 验证结果

```
upload.js OK
admin.js OK
articles.js OK
index.js OK
validators.js OK
validateArticleGenerate exported: true
difyService.js OK
sseProxy.js OK
DIFY_API_BASE_URL 残留: 0
```
