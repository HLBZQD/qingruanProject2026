# 批次 3 计划审查报告 v1r1

## 审查清单

### 1. 需求覆盖度

| 需求项 | 需求来源 | plan.md 覆盖 | task_v1.md 覆盖 | 状态 |
|--------|----------|-------------|-----------------|------|
| GET /api/doctors 分页列表，不含 chat_token | requirement.md L18 | 4 节 | T4 | OK |
| GET /api/doctors/:id 详情，不存在 404 | requirement.md L19 | 4 节 | T4 | OK |
| GET /api/diabetes-types 列表 | requirement.md L22 | 5 节 | T5 | OK |
| GET /api/diabetes-types/:id 详情 (name,image,pathogenesis,manifestation,treatment) | requirement.md L23 | 5 节 | T5 | OK |
| GET /api/articles 分页 + category 筛选 + user_id IS NULL | requirement.md L26 | 6 节 | T6 | OK |
| tags TEXT→string[], summary, views, created_at | requirement.md L27 | 6 节 | T6 | OK |
| GET /api/articles/:id 含 content, tags, summary, is_collected | requirement.md L30 | 6 节 | T6 | OK |
| POST /api/articles/:id/collect 防重复 | requirement.md L33 | 6 节 | T6 | OK |
| DELETE /api/articles/:id/collect 只能取消自己的 | requirement.md L34 | 6 节 | T6 | OK |
| GET /api/articles/collections 分页 | requirement.md L35 | 6 节 | T6 | OK |
| pagination.js (page=1, pageSize=20, max=100, totalPages=ceil) | requirement.md L38 | 1 节 | T1 | OK |
| jsonFields.js (tags 解析/序列化) | requirement.md L39 | 2 节 | T2 | OK |

**覆盖结论**: 全部需求项均已覆盖。

### 2. API 响应格式对齐设计文档

| API | 设计文档节 | 响应字段对比 | 结果 |
|-----|-----------|-------------|------|
| GET /api/doctors | 3.2.9 | id, name, department, title, description, avatar + pagination | OK |
| GET /api/doctors/:id | 3.2.10 | id, name, department, title, description, avatar, created_at | OK |
| GET /api/articles | 3.2.19 | id, title, cover, author, category, tags, summary, views, created_at + pagination | OK |
| GET /api/articles/:id | 3.2.20 | +content, +is_collected | OK |
| POST /api/articles/:id/collect | 3.2.22 | success + message | OK |
| DELETE /api/articles/:id/collect | 3.2.22 | success + message | OK |
| GET /api/articles/collections | 3.2.23 | 与 GET /api/articles 结构一致 + collect_id | OK |
| GET /api/diabetes-types | 3.2.24 | id, name, image, pathogenesis, manifestation, treatment | OK |
| GET /api/diabetes-types/:id | 3.2.24 | 同上 | OK |

**对齐结论**: 所有 API 响应格式与设计文档一致。

### 3. 代码规范对齐

| 检查项 | 结果 |
|--------|------|
| 使用 `better-sqlite3` (`db.prepare(...).get/all/run`) | OK |
| 使用 `success(res, data, message, statusCode)` | OK |
| 使用 `error(res, code, message, statusCode)` | OK |
| 使用 `throw new AppError(statusCode, code, message)` | OK |
| 使用 `authMiddleware` 强制登录 | OK |
| 遵循 `express.Router()` 模式 | OK |
| 使用 `req.user.id` 获取当前用户 | OK |

### 4. 潜在问题分析

#### 问题 1: GET /api/articles 路由顺序 ⚠️ 已解决
`GET /collections` 与 `GET /:id` 冲突（`collections` 会被捕获为 `:id`）。
**解决方案**: T6 明确将 `/collections` 定义在 `/:id` 之前。

#### 问题 2: diabetes-types 列表是否需要分页? ✅ 无问题
设计文档 3.2.24 响应体示例不含 pagination。糖尿病类型目前只有 4 条记录（种子数据），且设计文档列表响应直接返回数组。plan.md 已明确不需要分页。

#### 问题 3: 收藏列表是否只返回公共文章? ✅ 已确认
设计文档 3.2.23 说明 "与 GET /api/articles 结构一致"。本批次 articles 列表限定 `user_id IS NULL`（公共文章），收藏列表 JOIN articles 时也只会返回公共文章（因为用户只收藏已存在的文章，而本批次只有公共文章出现在列表里）。task_v1.md T6.2 已 JOIN articles，数据一致性由外键约束保证。

#### 问题 4: optionalAuth 是否需要新增中间件? ✅ 合理
现有中间件 `auth.js` 在无 token 时返回 401，不符合 `is_collected` 的"未登录返回 false"语义。需要可选认证中间件。plan.md 已新增 `server/middleware/optionalAuth.js`。

#### 问题 5: 收藏不存在的文章是否应返回 404? ✅ 已覆盖
task_v1.md T6.5 在插入收藏前会验证文章存在 → 不存在返回 404。

#### 问题 6: 取消不存在的收藏是否应返回 404? ✅ 已覆盖
task_v1.md T6.6 在删除前检查收藏记录存在 → 不存在返回 404。

#### 问题 7: 重复收藏的错误码应该是什么? ⚠️ 需确认
设计文档未明确指定重复收藏的错误码。plan.md 返回 `success(res, null, '文章已收藏', 200)`，即成功状态（幂等处理）。这是合理的实现方式——返回 200 + 提示消息而非 409 冲突，因为重复收藏的最终结果仍是"已收藏状态"。这与需求文档"防重复收藏"一致。

### 5. 遗漏检查

| 检查项 | 结果 |
|--------|------|
| articles 列表排序 | task_v1 T6.1 已加 `ORDER BY created_at DESC` |
| articles 列表的 category 参数可选 | task_v1 T6.1 仅在有 `req.query.category` 时添加条件 |
| tags 解析异常处理 | plan.md jsonFields.parseTags 有 try-catch 兜底 `[]` |
| 分页边界值 | plan.md pagination: page 正整数, pageSize max 100 |
| 路由注册 | T7 在 routes/index.js 中取消注释并挂载 |
| 404 路由 | 已在 routes/index.js 末尾全局处理 |

### 6. 最终结论

**所有需求项已覆盖，API 响应结构与设计文档一致，代码风格与现有项目一致，无遗漏问题。**

```
审查结论: APPROVED
```
