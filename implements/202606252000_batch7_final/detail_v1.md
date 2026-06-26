# 批次 7 详细设计 v1

> 基于 `task_v1.md`、`plan.md`、设计文档 `2_detailed_design_v3.md` 第 3.2.21/3.2.29-3.2.31 节，以及现有代码分析编写。

---

## 1. DIFY_API_BASE 变量名修正

### 1.1 问题

`.env` 定义 `DIFY_API_BASE=http://182.92.74.224/v1`，但两个服务文件错误使用了 `DIFY_API_BASE_URL`，导致真实 Dify 服务永远不可用。

### 1.2 修改清单

| 文件 | 行号 | 当前代码 | 修正为 |
|------|------|---------|--------|
| `server/services/difyService.js` | 85 | `process.env.DIFY_API_BASE_URL` | `process.env.DIFY_API_BASE` |
| `server/services/sseProxy.js` | 10 | `process.env.DIFY_API_BASE_URL` | `process.env.DIFY_API_BASE` |

### 1.3 验证

```bash
grep -rn "DIFY_API_BASE_URL" server/
# 期望：空输出
```

### 1.4 影响范围

- **difyService.js**: 所有通过 `callWorkflowBlocking()` 调用 Dify 的端点（risk/predict, plan/generate, articles/generate）将恢复真实 Dify 连接
- **sseProxy.js**: 通过 `proxyDifySSE()` 流式代理的端点（chat/doctor/:id, assistant/chat）将恢复真实 Dify 连接
- **无影响**: `.env` 已使用正确变量名 `DIFY_API_BASE`，无需修改

---

## 2. validators.js 扩展 — validateArticleGenerate

### 2.1 文件

`server/utils/validators.js`

### 2.2 新增函数

```js
function validateArticleGenerate(body) {
  if (!body || typeof body !== 'object') {
    return '请求体不能为空';
  }
  if (body.category !== undefined) {
    if (typeof body.category !== 'string' || body.category.trim().length === 0) {
      return 'category 必须为非空字符串';
    }
  }
  return null;
}
```

### 2.3 设计说明

- `body` 为空对象 `{}` → 校验通过（返回推荐分类场景）
- `body.category` 为 string 且 trim 后非空 → 校验通过（生成文章场景）
- `body.category` 存在但类型不符/为空 → 返回错误描述字符串
- 不校验 category 是否为合法分类值（合法分类由后续业务逻辑判断，保持校验器单一职责）

### 2.4 导出

在 `module.exports` 中新增 `validateArticleGenerate`。

---

## 3. articles.js 扩展 — POST /api/articles/generate

### 3.1 文件

`server/routes/articles.js`

### 3.2 新增依赖

```js
const { callWorkflowBlocking } = require('../services/difyService');
const { validateArticleGenerate } = require('../utils/validators');
const { serializeTags } = require('../utils/jsonFields');
```

### 3.3 路由顺序（关键）

`POST /generate` 必须在 `GET /:id` **之前**声明，否则 Express 会将 `/generate` 路径匹配为 `:id = "generate"`。

**最终路由顺序**：
```
GET  /collections      (已有)
GET  /                  (已有)
POST /generate          (新增 ← 必须在 GET /:id 之前)
GET  /:id               (已有)
POST /:id/collect       (已有)
DELETE /:id/collect     (已有)
```

### 3.4 幂等性保护

在 `router` 声明之前（文件顶部常量区域）添加：

```js
const recentGenerates = new Map(); // userId -> timestamp
```

处理函数入口检查：

```js
const lastTime = recentGenerates.get(req.user.id);
if (lastTime && Date.now() - lastTime < 30000) {
  throw new AppError(409, 'CONFLICT', '请求过于频繁，请30秒后再试');
}
recentGenerates.set(req.user.id, Date.now());
```

### 3.5 分类推荐常量

```js
const DEFAULT_CATEGORIES = [
  { label: '饮食指导', recommended: false, reason: '' },
  { label: '运动指南', recommended: false, reason: '' },
  { label: '生活习惯', recommended: false, reason: '' },
  { label: '糖尿病知识科普', recommended: false, reason: '' }
];
```

### 3.6 处理函数完整逻辑

```
POST /generate
  │
  ├─ 幂等性检查 (30s)
  ├─ 校验 validateArticleGenerate(req.body)
  │
  ├─ 无 category ──────────────────────────────────────┐
  │   ├─ 查询 user_risk_info 最新 BMI:                  │
  │   │   SELECT weight/((height/100.0)*(height/100.0)) │
  │   │   AS bmi FROM user_risk_info                    │
  │   │   WHERE user_id=? ORDER BY created_at DESC      │
  │   │   LIMIT 1                                       │
  │   ├─ deep copy DEFAULT_CATEGORIES                    │
  │   ├─ BMI > 24 → 饮食指导 recommended=true            │
  │   │             reason="基于您的BMI，饮食管理是..."    │
  │   ├─ BMI > 28 → 运动指南 recommended=true            │
  │   │             reason="基于您的BMI，适量运动..."      │
  │   └─ 返回 { stage: "category_selection", categories } │
  │
  └─ 有 category ───────────────────────────────────────┐
      ├─ 构造 inputs: { category: req.body.category }    │
      ├─ 检查 DIFY_API_BASE + DIFY_ARTICLE_WORKFLOW_KEY │
      │   ├─ 任一缺失 → 使用 Mock                        │
      │   └─ 均存在 → try/catch callWorkflowBlocking    │
      │       ├─ 成功 → try JSON.parse                    │
      │       │   outputs.text → 提取 title/cover/content│
      │       │   /category/tags/summary                  │
      │       ├─ 解析成功 + title含内容 → 使用 Dify 数据   │
      │       ├─ 解析失败/数据不完整 → 使用 Mock           │
      │       └─ 抛出异常 → 使用 Mock                     │
      ├─ INSERT INTO articles (user_id, title, cover,    │
      │   author, content, category, tags, summary)       │
      │   VALUES (?, ?, ?, 'AI健康助手', ?, ?, ?, ?)      │
      │   tags 用 serializeTags() 转换                    │
      ├─ lastInsertRowid                                  │
      └─ 返回文章详情 (含 id, is_collected: false)        │
```

### 3.7 Mock 数据结构

```js
function buildMockArticle(category) {
  return {
    title: `${category}——糖尿病管理指南`,
    content: `# ${category}\n\n这是关于"${category}"的AI生成文章（Mock模式）。\n\n> 以上内容由AI自动生成，仅供参考。`,
    tags: [category],
    summary: `本文围绕"${category}"展开介绍。`,
    cover: null
  };
}
```

### 3.8 SQL 语句

```sql
-- 查询 BMI
SELECT weight / ((height / 100.0) * (height / 100.0)) AS bmi
FROM user_risk_info WHERE user_id = ? ORDER BY created_at DESC LIMIT 1

-- 插入文章
INSERT INTO articles (user_id, title, cover, author, content, category, tags, summary, created_at)
VALUES (?, ?, ?, 'AI健康助手', ?, ?, ?, ?, datetime('now', 'localtime'))
```

### 3.9 响应格式

**分类推荐阶段**：
```json
{
  "success": true,
  "data": {
    "stage": "category_selection",
    "categories": [
      {"label": "饮食指导", "recommended": true, "reason": "基于您的BMI为25.95，饮食管理是血糖控制的关键"},
      {"label": "运动指南", "recommended": false, "reason": ""},
      {"label": "生活习惯", "recommended": false, "reason": ""},
      {"label": "糖尿病知识科普", "recommended": false, "reason": ""}
    ]
  }
}
```

**文章生成阶段**：
```json
{
  "success": true,
  "data": {
    "id": 4,
    "title": "饮食指导——糖尿病管理指南",
    "cover": null,
    "author": "AI健康助手",
    "content": "# 饮食指导\n\n...",
    "category": "饮食指导",
    "tags": ["饮食指导"],
    "summary": "本文围绕饮食指导展开介绍。",
    "is_collected": false,
    "created_at": "2026-06-25T14:35:00"
  }
}
```

### 3.10 与公共列表隔离

现有 `GET /` 路由已有 `WHERE user_id IS NULL` 过滤（`articles.js:24`）。生成文章写入 `user_id` 非空后，天然不与公共列表混同，无需额外改动。

### 3.11 错误码

| 场景 | HTTP | code |
|------|------|------|
| 校验失败（category 为空字符串等） | 422 | VALIDATION_ERROR |
| 30秒内重复请求 | 409 | CONFLICT |
| Dify 服务连接失败 | 502 | DIFY_ERROR |
| Dify 超时 | 504 | AI_TIMEOUT |
| SQLite 写入失败 | 500 | INTERNAL_ERROR |

---

## 4. upload.js — POST /api/upload/avatar

### 4.1 文件

`server/routes/upload.js`（**新建**）

### 4.2 依赖

```js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/auth');
const { success, AppError } = require('../utils/response');
const { error } = require('../utils/response');
```

### 4.3 目录初始化

```js
const uploadDir = path.join(__dirname, '..', '..', 'static', 'uploads', 'avatars');
fs.mkdirSync(uploadDir, { recursive: true });
```

### 4.4 multer 配置

```js
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `user_${req.user.id}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(415, 'UNSUPPORTED_FILE_TYPE', '仅支持 JPEG/PNG/WebP 格式'));
    }
  }
});
```

### 4.5 路由处理函数

```js
router.post('/avatar', authMiddleware, (req, res) => {
  upload.single('avatar')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return error(res, 'FILE_TOO_LARGE', '文件大小不能超过 2MB', 413);
      }
      return error(res, 'BAD_REQUEST', err.message, 400);
    }
    if (err instanceof AppError) {
      return error(res, err.code, err.message, err.statusCode);
    }
    if (err) {
      return error(res, 'INTERNAL_ERROR', err.message, 500);
    }
    if (!req.file) {
      return error(res, 'VALIDATION_ERROR', '请选择要上传的头像文件', 422);
    }
    const url = `/static/uploads/avatars/${req.file.filename}`;
    success(res, { url, filename: req.file.filename }, '上传成功', 200);
  });
});
```

### 4.6 错误处理决策树

```
upload.single('avatar') err
  │
  ├─ err instanceof MulterError
  │   ├─ err.code === 'LIMIT_FILE_SIZE' → 413 FILE_TOO_LARGE
  │   └─ 其他 Multer 错误 → 400 BAD_REQUEST
  │
  ├─ err instanceof AppError (文件类型校验) → 415 UNSUPPORTED_FILE_TYPE
  │
  ├─ err 其他 → 500 INTERNAL_ERROR
  │
  └─ !req.file → 422 VALIDATION_ERROR
```

### 4.7 响应格式

```json
{
  "success": true,
  "message": "上传成功",
  "data": {
    "url": "/static/uploads/avatars/user_1_1719244800000.jpg",
    "filename": "user_1_1719244800000.jpg"
  }
}
```

**URL 说明**：`/static/` 前缀路径由 `app.js` 中 `express.static()` 映射到 `static/` 目录，前端可直接拼接 base URL 后访问头像图片。

---

## 5. admin.js — GET /api/admin/logs

### 5.1 文件

`server/routes/admin.js`（**新建**）

### 5.2 依赖

```js
const express = require('express');
const { db } = require('../db/database');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const { success, AppError } = require('../utils/response');
const { parsePagination, buildPagination } = require('../utils/pagination');
```

### 5.3 路由

```js
router.get('/logs', authMiddleware, adminMiddleware, (req, res) => {
  const { page, pageSize, offset, limit } = parsePagination(req.query);

  const { total } = db.prepare('SELECT COUNT(*) AS total FROM admin_logs').get();

  const rows = db.prepare(`
    SELECT al.id, al.operator_id, u.username AS operator_username,
           al.operation_type, al.operation_content, al.operation_result, al.operation_time
    FROM admin_logs al
    JOIN users u ON al.operator_id = u.id
    ORDER BY al.operation_time DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  const pagination = buildPagination(page, pageSize, total);
  success(res, rows, '查询成功', 200);
  res.json({ ...res.responseBody, pagination });  // 注意：success() 不返回 pagination，需手动挂载
});
```

### 5.4 响应格式

```json
{
  "success": true,
  "message": "查询成功",
  "data": [
    {
      "id": 1,
      "operator_id": 1,
      "operator_username": "admin",
      "operation_type": "INSERT",
      "operation_content": "INSERT INTO doctor_information ...",
      "operation_result": "成功, 影响1行",
      "operation_time": "2026-06-23T15:00:00"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 10,
    "totalPages": 1
  }
}
```

### 5.5 SQL 设计要点

- `JOIN users u ON al.operator_id = u.id` — 关联用户名
- `ORDER BY al.operation_time DESC` — 最新日志在前
- 分页参数使用 `parsePagination` / `buildPagination` 统一工具
- `operation_time` 列由 SQLite `datetime('now', 'localtime')` 生成，格式 `YYYY-MM-DD HH:MM:SS`

### 5.6 响应挂载 pagination 的处理

`success()` 函数签名 `(res, data, message, statusCode)` 在 `response.js:3` 中直接调用 `res.status().json()`，无法在调用后追加字段。需要以下二选一方案：

**方案A（推荐）**：构造完整对象后一次性 `res.json()`，不使用 `success()` 辅助函数：
```js
res.status(200).json({ success: true, message: '查询成功', data: rows, pagination });
```

**方案B**：使用 `success()` 后无法追加，需重构 `success()` 但保持向后兼容。

本设计采用**方案A**，与 `articles.js` 中 `res.status(200).json({ success: true, ... })` 风格一致。

---

## 6. admin.js — POST /api/admin/execute

### 6.1 路由

```js
router.post('/execute', authMiddleware, adminMiddleware, (req, res) => {
  // ...
});
```

### 6.2 安全校验（按顺序）

#### 6.2.1 基础校验

```js
if (!req.body.sql || typeof req.body.sql !== 'string' || req.body.sql.trim().length === 0) {
  return error(res, 'VALIDATION_ERROR', 'sql 参数不能为空', 422);
}
```

#### 6.2.2 SELECT 前置检查

```js
const trimmed = req.body.sql.trim().toUpperCase();
if (!trimmed.startsWith('SELECT')) {
  return error(res, 'FORBIDDEN', '仅允许执行 SELECT 查询', 403);
}
```

#### 6.2.3 危险关键词禁止

```js
const forbidden = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE',
  'TRUNCATE', 'REPLACE', 'EXEC', 'EXECUTE', 'ATTACH', 'DETACH'
];
for (const keyword of forbidden) {
  if (trimmed.toUpperCase().includes(keyword)) {
    return error(res, 'FORBIDDEN', `SQL 包含禁止操作: ${keyword}`, 403);
  }
}
```

**注意**：`toUpperCase()` 比较独立处理，因为 `trimmed` 已经全大写，但需要确保包含匹配也大小写不敏感。由于 `trimmed` 已在 6.2.2 中 `toUpperCase()`，此处直接 `trimmed.includes(keyword)` 即可。

### 6.3 SQL 执行

```js
let rows;
try {
  rows = db.prepare(req.body.sql).all();
} catch (err) {
  return error(res, 'INTERNAL_ERROR', `SQL 执行失败: ${err.message}`, 500);
}
```

使用 `db.prepare(sql).all()` 执行 SELECT，返回数组。`better-sqlite3` 不支持多语句，天然防护 SQL 注入中的语句拼接攻击。

### 6.4 日志记录

```js
const rowCount = rows.length;
try {
  db.prepare(`
    INSERT INTO admin_logs (operator_id, operation_type, operation_content, operation_result)
    VALUES (?, 'SELECT', ?, '成功, 影响' || ? || '行')
  `).run(req.user.id, req.body.sql, rowCount);
} catch (logErr) {
  console.error('[admin] 日志写入失败:', logErr.message);
  // 日志写入失败不阻塞响应
}
```

**SQL 设计说明**：使用 SQLite 内置 `||` 字符串拼接，所有用户输入通过 `?` 占位符绑定，杜绝 SQL 注入。

### 6.5 响应格式

```json
{
  "success": true,
  "data": {
    "rows": [...],
    "rowCount": 3,
    "operation_type": "SELECT"
  }
}
```

### 6.6 安全设计边界

| 层级 | 机制 | 防御目标 |
|------|------|---------|
| `adminMiddleware` | JWT + role=admin 校验 | 未授权访问 |
| `startsWith('SELECT')` | 仅允许 SELECT | DML/DDL 操作 |
| `forbidden` 关键词遍历 | 黑名单检查 | 子查询注入/EXEC 调用 |
| `db.prepare(sql).all()` | better-sqlite3 单语句执行 | 多语句拼接攻击 |
| 占位符绑定 (`?`) | 参数化查询 | SQL 注入（日志写入） |
| try/catch 日志写入 | 日志失败不阻塞 | 可用性优先 |

### 6.7 设计简化说明

设计文档 3.2.29 定义了完整的"双认证模式"（Dify Agent 回调 + 浏览器直连场景），包含 `tool_name` 参数化查询分发 + `execute_SQL` 兜底。本批次实现 `execute_SQL` 兜底路径**基础版**，仅支持浏览器直连场景（`Authorization: Bearer <JWT>` + `adminMiddleware`）。Dify Agent 回调场景留待后续批次实现。

---

## 7. routes/index.js 挂载

### 7.1 文件

`server/routes/index.js`

### 7.2 新增挂载行

在 `router.use('/assistant', ...)` 之后、404 兜底之前：

```js
router.use('/admin', require('./admin'));
router.use('/upload', require('./upload'));
```

### 7.3 最终挂载顺序

```
/health
/auth
/user
/doctors
/articles
/diabetes-types
/risk
/plan
/punch
/chat
/assistant
/admin     ← 新增
/upload    ← 新增
404 兜底
```

---

## 8. 文件变更清单

| 操作 | 文件 | 行号/位置 | 说明 |
|------|------|----------|------|
| 修改 | `server/services/difyService.js` | L85 | `DIFY_API_BASE_URL` → `DIFY_API_BASE` |
| 修改 | `server/services/sseProxy.js` | L10 | `DIFY_API_BASE_URL` → `DIFY_API_BASE` |
| 修改 | `server/utils/validators.js` | L167 前 | 新增 `validateArticleGenerate` + 导出 |
| 修改 | `server/routes/articles.js` | L2-L8 | 新增 3 个依赖引入 |
| 修改 | `server/routes/articles.js` | L9 附近 | 新增 `recentGenerates` Map |
| 修改 | `server/routes/articles.js` | L39 前 | 新增 `POST /generate` 路由（关键位置） |
| 新建 | `server/routes/upload.js` | 全文件 | multer 头像上传 |
| 新建 | `server/routes/admin.js` | 全文件 | logs + execute 路由 |
| 修改 | `server/routes/index.js` | L17 后 | 挂载 `/admin` + `/upload` |

---

## 9. 端到端数据流

### 9.1 articles/generate (category 模式)

```
Client                  Express                 SQLite              Dify
  │                        │                      │                   │
  │ POST /generate         │                      │                   │
  │ {category:"饮食指导"}   │                      │                   │
  │───────────────────────►│                      │                   │
  │                        │ 幂等检查(recentGenerates)                 │
  │                        │ validateArticleGenerate│                 │
  │                        │                      │                   │
  │                        │ callWorkflowBlocking──┼──────────────────►│
  │                        │                      │   POST /workflows/run
  │                        │                      │   {inputs:{category}}
  │                        │                      │◄──────────────────│
  │                        │                      │   {data:{outputs:...}}│
  │                        │                      │                   │
  │                        │ JSON.parse outputs.text                 │
  │                        │                      │                   │
  │                        │ INSERT articles (user_id→非空)─────────►│
  │                        │ lastInsertRowid◄───────────────────────│
  │                        │                      │                   │
  │ 200 {data:{id,title,...}}                     │                   │
  │◄───────────────────────│                      │                   │
```

### 9.2 upload/avatar

```
Client                  Express                 Disk
  │                        │                      │
  │ POST /avatar (multipart)                      │
  │───────────────────────►│                      │
  │                        │ multer parse         │
  │                        │ fileFilter(MIME)     │
  │                        │ size check(2MB)      │
  │                        │                      │
  │                        │ diskStorage.write────►│
  │                        │ static/uploads/avatars/
  │                        │◄─────────────────────│
  │                        │                      │
  │ 200 {url, filename}    │                      │
  │◄───────────────────────│                      │
```

### 9.3 admin/logs

```
Client                  Express                 SQLite
  │                        │                      │
  │ GET /logs?page=1       │                      │
  │───────────────────────►│                      │
  │                        │ authMiddleware       │
  │                        │ adminMiddleware      │
  │                        │                      │
  │                        │ SELECT COUNT(*)──────►│
  │                        │◄─────────────────────│
  │                        │                      │
  │                        │ SELECT ... JOIN──────►│
  │                        │◄─────────────────────│
  │                        │                      │
  │ 200 {data,[],pagination}                      │
  │◄───────────────────────│                      │
```

### 9.4 admin/execute

```
Client                  Express                 SQLite
  │                        │                      │
  │ POST /execute          │                      │
  │ {sql:"SELECT * FROM.."}│                      │
  │───────────────────────►│                      │
  │                        │ authMiddleware       │
  │                        │ adminMiddleware      │
  │                        │ SELECT 前置检查       │
  │                        │ 禁止关键词检查         │
  │                        │                      │
  │                        │ db.prepare(sql).all()─►│
  │                        │◄─────────────────────│
  │                        │                      │
  │                        │ INSERT admin_logs────►│
  │                        │◄─────────────────────│
  │                        │                      │
  │ 200 {rows,rowCount}    │                      │
  │◄───────────────────────│                      │
```

---

## 10. 兼容性与约束

| 约束项 | 说明 |
|--------|------|
| articles 公共列表隔离 | 已有 `WHERE user_id IS NULL`，无需改动 |
| 分页统一 | `parsePagination` + `buildPagination` (默认 page=1, pageSize=20, max=100) |
| 错误格式统一 | `{ error: { code, message } }` — `errorHandler.js` 全局兜底 + 路由内手动 `error()` 调用 |
| better-sqlite3 同步 API | 所有 DB 调用使用同步方式，错误通过 try/catch 或全局 errorHandler 处理 |
| multer 已安装 | 需确认 `npm ls multer`，若不存在则 `npm install multer` |
| Dify Mock 兜底 | articles generate 在 difyService Mock 之外有独立 Mock，保证无 Dify 也能走通流程 |
| UTF-8 文件名 | multer `file.originalname` 可能含中文，`Date.now()` 时间戳 + 扩展名策略避免编码问题 |
