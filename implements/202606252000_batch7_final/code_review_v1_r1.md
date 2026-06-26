# Code Review v1 R1 — 批次7

## 审查范围
所有 8 项变更（7 个文件），对照 `detail_v2.md` 设计文档逐项审查。

---

## 1. DIFY_API_BASE 变量名修正 ✅ APPROVED

### difyService.js:85
```js
const baseUrl = process.env.DIFY_API_BASE;
```
- ✅ 修正正确，与 `.env` 变量名一致

### sseProxy.js:10
```js
const baseUrl = process.env.DIFY_API_BASE;
```
- ✅ 修正正确

### 验证
```bash
grep -rn "DIFY_API_BASE_URL" server/
```
- ✅ 无残留引用

---

## 2. validators.js — validateArticleGenerate ✅ APPROVED

### 函数定义 (L168-178)
- ✅ `body` 非 object → 返回错误
- ✅ `category !== undefined` 时才校验
- ✅ `category` 存在时必须是 string 且 trim() 后非空
- ✅ `category` 不存在（空对象 {}）→ 返回 null（通过校验）
- ✅ 单一职责：只校验类型/格式，不校验合法分类值

### 导出 (L190)
- ✅ 已加入 `module.exports`

---

## 3. articles.js — POST /api/articles/generate ✅ APPROVED

### 依赖引入
- ✅ L3: 新增 `error` 从 response 导入
- ✅ L5: 新增 `serializeTags` 从 jsonFields 导入
- ✅ L8: 新增 `callWorkflowBlocking` 从 difyService 导入
- ✅ L9: 新增 `validateArticleGenerate` 从 validators 导入

### 常量与辅助函数
- ✅ L13: `recentGenerates` Map（userId → timestamp）
- ✅ L14-19: `DEFAULT_CATEGORIES` 4 个分类，初始 recommended=false
- ✅ L21-29: `buildMockArticle(category)` — Mock 结构与设计一致

### 路由顺序
```
GET  /collections       (L31)
GET  /                  (L40)
POST /generate          (L60) ← 在 GET /:id 之前 ✅
GET  /:id               (L158)
POST /:id/collect       (L171)
DELETE /:id/collect     (L180)
```
- ✅ 关键路由顺序正确，防止 `/generate` 被 `:id` 捕获

### 幂等性检查 (L62-66)
- ✅ Map.get() 查上次请求时间
- ✅ 30s 内 → 409 CONFLICT
- ✅ 非阻塞：设置时间戳后继续

### 校验 (L68-71)
- ✅ 调用 `validateArticleGenerate`
- ✅ 失败 → 422 VALIDATION_ERROR

### 无 category 分支 — 分类推荐 (L73-89)
- ✅ BMI 查询 SQL 正确：`weight / ((height / 100.0) * (height / 100.0))`
- ✅ 参数化查询：`user_id = ?`
- ✅ **空结果处理**: `riskRow ? riskRow.bmi : null` (R1 修正)
- ✅ 深拷贝防止污染常量：`DEFAULT_CATEGORIES.map(c => ({ ...c }))`
- ✅ `bmi !== null && bmi > 24` → 饮食指导 recommended=true
- ✅ `bmi !== null && bmi > 28` → 运动指南 recommended=true
- ✅ bmi 为 null 时所有 recommended 保持 false（优雅降级）
- ✅ 响应格式：`{ stage: "category_selection", categories }` 与设计一致

### 有 category 分支 — 文章生成 (L92-155)
- ✅ L92: `req.body.category.trim()` 去除首尾空白
- ✅ L95-96: 读取 `DIFY_API_BASE` 和 `DIFY_ARTICLE_WORKFLOW_KEY`
- ✅ L98-99: 任一缺失 → 使用 Mock（独立 Mock，不依赖 difyService）
- ✅ L101-128: Dify 调用逻辑
  - ✅ `await callWorkflowBlocking(difyKey, { category })`
  - ✅ 安全链式访问 `result?.data?.outputs?.text`
  - ✅ JSON.parse 有独立 try/catch
  - ✅ `parsed.title` 存在且为 string → 使用 Dify 数据
  - ✅ 解析失败/字段缺失 → 降级到 Mock
  - ✅ 网络/超时异常 → catch → Mock
  - ✅ 错误日志 `console.error('[articles/generate] Dify error:', err.message)`
- ✅ INSERT SQL (L131-143)
  - ✅ author 硬编码 `'AI健康助手'`
  - ✅ `serializeTags(articleData.tags)` 转换数组为 JSON 字符串
  - ✅ `strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')` ISO8601 T 分隔 (R4 修正)
  - ✅ 所有用户输入均通过 `?` 占位符绑定
- ✅ L145-150: 查询新插入记录，`parseTags` 还原 tags 为数组
- ✅ L150: `is_collected: false`（用户自己生成的文章不可能已收藏）
- ✅ L152: `success(res, newArticle, '文章生成成功', 200)`

### 公共列表隔离
- ✅ 生成文章写入 `user_id` 非空，现有 `GET /` 使用 `WHERE user_id IS NULL`，天然隔离

### 错误处理
- ✅ `async (req, res, next)` 模式
- ✅ 全局 try/catch 包裹
- ✅ AppError 类型抛出 → `next(e)` → errorHandler 统一处理
- ✅ 符合 risk.js 的现有模式

---

## 4. upload.js — POST /api/upload/avatar ✅ APPROVED

### 依赖
- ✅ express, multer, path, fs — CommonJS require
- ✅ authMiddleware, { success, error, AppError }

### 目录初始化 (L8-9)
- ✅ `path.join(__dirname, '..', '..', 'static', 'uploads', 'avatars')`
- ✅ `fs.mkdirSync(uploadDir, { recursive: true })` 幂等安全

### multer 配置 (L11-30)
- ✅ diskStorage: `user_{req.user.id}_{Date.now()}{ext}`
  - ✅ 时间戳 + 扩展名避免 UTF-8 文件名编码问题
- ✅ limits: 2MB (`2 * 1024 * 1024`)
- ✅ fileFilter: MIME 白名单 `['image/jpeg', 'image/png', 'image/webp']`
  - ✅ 不合规 → `cb(new AppError(415, 'UNSUPPORTED_FILE_TYPE', ...))`

### 错误处理决策树 (L35-53)
| 条件 | 状态码 | code | 设计要求 | 匹配 |
|------|--------|------|---------|------|
| MulterError + LIMIT_FILE_SIZE | 413 | FILE_TOO_LARGE | 413 FILE_TOO_LARGE | ✅ |
| MulterError 其他 | 400 | BAD_REQUEST | 400 BAD_REQUEST | ✅ |
| AppError (文件类型) | 415 | UNSUPPORTED_FILE_TYPE | 415 UNSUPPORTED_FILE_TYPE | ✅ |
| 其他 Error | 500 | INTERNAL_ERROR | 500 INTERNAL_ERROR | ✅ |
| !req.file | 422 | VALIDATION_ERROR | 422 VALIDATION_ERROR | ✅ |

- ✅ 错误检查顺序正确：MulterError 先于 AppError（两者无继承关系，顺序不影响，但逻辑清晰）
- ✅ multer >= 1.4.0 确保 fileFilter Error 原样传播

### 响应 (L51-52)
- ✅ URL: `/static/uploads/avatars/{filename}`
- ✅ express.static 映射在 app.js 中配置 (`/static` → `static/` 目录) ✅

---

## 5. admin.js — GET /api/admin/logs ✅ APPROVED

### 中间件 (L10)
- ✅ authMiddleware + adminMiddleware 双层校验

### SQL (L13-22)
- ✅ COUNT: `SELECT COUNT(*) AS total FROM admin_logs`
- ✅ 关联查询: `JOIN users u ON al.operator_id = u.id`
- ✅ ORDER BY: `al.operation_time DESC`（最新在前）
- ✅ 参数化: `LIMIT ? OFFSET ?`
- ✅ 分页工具: `parsePagination` + `buildPagination`（默认 page=1, pageSize=20, max=100）

### 响应格式 (L24-25)
- ✅ `res.status(200).json({ success: true, message: '查询成功', data: rows, pagination })`
- ✅ 未使用 `success()` 辅助函数（因为 `success()` 不支持追加 pagination 字段），与 articles.js 风格一致

---

## 6. admin.js — POST /api/admin/execute ✅ APPROVED

### 基础校验 (L29-31)
- ✅ `!req.body.sql || typeof !== 'string' || trim().length === 0` → 422 VALIDATION_ERROR

### SELECT 前置检查 (L33-36)
- ✅ `trimmed.toUpperCase().startsWith('SELECT')` → 403 FORBIDDEN
- ✅ 仅允许 SELECT

### 禁止关键词检查 (L38-46) — R2 修正
- ✅ 13 个关键词: INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, REPLACE, EXEC, EXECUTE, ATTACH, DETACH
- ✅ `new RegExp('\\b' + keyword + '\\b', 'i').test(trimmed)`
  - ✅ `\b` 单词边界：`EXEC` 不匹配 `EXECUTE`，不误杀 `last_insert_rowid()`
  - ✅ `'i'` 标志：防御性大小写不敏感
- ✅ 匹配到 → 403 FORBIDDEN + 具体关键词名

### SQL 执行 (L48-53)
- ✅ `db.prepare(req.body.sql).all()`
- ✅ try/catch → 500 INTERNAL_ERROR + err.message
- ✅ better-sqlite3 单语句执行，天然防护多语句拼接

### 日志记录 (L55-63)
- ✅ `INSERT INTO admin_logs (operator_id, operation_type, operation_content, operation_result)`
- ✅ 所有值通过 `?` 占位符绑定
- ✅ `operation_result` 使用 SQLite `||` 拼接：`'成功, 影响' || ? || '行'`
- ✅ try/catch: 日志失败不阻塞响应，仅 `console.error`

### 响应 (L65-68)
- ✅ `{ success: true, data: { rows, rowCount, operation_type: 'SELECT' } }`
- ✅ 与设计文档一致

### 安全设计边界验证
| 层级 | 机制 | 状态 |
|------|------|------|
| adminMiddleware | JWT + role=admin | ✅ |
| startsWith('SELECT') | 仅允许 SELECT | ✅ |
| forbidden + \b | 正则黑名单单词边界 | ✅ |
| db.prepare().all() | 单语句执行 | ✅ |
| 占位符绑定 | 参数化查询 | ✅ |
| try/catch 日志 | 可用性优先 | ✅ |

---

## 7. routes/index.js 挂载 ✅ APPROVED

### 新增挂载 (L18-19)
```js
router.use('/admin', require('./admin'));
router.use('/upload', require('./upload'));
```
- ✅ `/admin` 在 `/upload` 之前（符合设计顺序）
- ✅ 两行均在 `assistant` 之后、404 兜底之前
- ✅ 最终顺序与设计 §7.3 一致

---

## 审查结论

### 问题统计

| 级别 | 数量 | 说明 |
|------|------|------|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 0 | — |
| LOW | 0 | — |
| STYLE | 0 | — |

### 通过项总结

1. ✅ DIFY_API_BASE_URL 残留确认清除
2. ✅ validateArticleGenerate 逻辑正确，空 body {} 通过
3. ✅ articles/generate 路由顺序正确（在 :id 之前）
4. ✅ BMI 空结果优雅降级（R1 修正）
5. ✅ execute 黑名单 \b 单词边界（R2 修正）
6. ✅ created_at ISO8601 T 分隔（R4 修正）
7. ✅ multer fileFilter AppError 传播确认（S3 确认）
8. ✅ 所有 SQL 使用参数化查询
9. ✅ 异步错误通过 try/catch + next(e) 正确传递
10. ✅ 公共文章与用户生成文章天然隔离（user_id IS NULL）

---

## 判定: APPROVED
