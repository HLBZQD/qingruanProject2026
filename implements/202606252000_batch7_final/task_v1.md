# 批次 7 实现任务清单 v1

## 预处理

- [ ] 阅读本 task_v1.md 全文
- [ ] 确认工作目录：`/home/derpyIsTheBest/qingruanProject2026`
- [ ] 备份或 `git stash` 当前变更（可选）

---

## Task 1: 修正 DIFY_API_BASE 变量名

**文件**：`server/services/difyService.js`, `server/services/sseProxy.js`

### 1.1 difyService.js

- [ ] 第 85 行：`const baseUrl = process.env.DIFY_API_BASE_URL;` → `const baseUrl = process.env.DIFY_API_BASE;`

### 1.2 sseProxy.js

- [ ] 第 10 行：`const baseUrl = process.env.DIFY_API_BASE_URL;` → `const baseUrl = process.env.DIFY_API_BASE;`

### 验证

- [ ] `grep -rn "DIFY_API_BASE_URL" server/` 返回空（确保无遗漏）

---

## Task 2: 扩展 validators.js

**文件**：`server/utils/validators.js`

### 2.1 新增 `validateArticleGenerate(body)`

- [ ] 允许 `body` 为空对象 `{}`（返回推荐分类场景）：校验通过
- [ ] 若 `body.category` 存在：校验 `typeof body.category === 'string' && body.category.trim().length > 0`
- [ ] 返回 `null` 表示校验通过，否则返回错误描述字符串

### 2.2 导出

- [ ] 在 `module.exports` 中加入 `validateArticleGenerate`

---

## Task 3: 扩展 articles.js — POST /api/articles/generate

**文件**：`server/routes/articles.js`

### 3.1 引入依赖

- [ ] 引入 `callWorkflowBlocking` from `../services/difyService`
- [ ] 引入 `validateArticleGenerate` from `../utils/validators`
- [ ] 引入 `serializeTags` from `../utils/jsonFields`

### 3.2 幂等性保护

- [ ] 在文件顶部（`router` 之前或之后）声明 `const recentGenerates = new Map(); // userId -> timestamp`
- [ ] 在处理函数入口检查：同一 `user_id` 30 秒内重复请求返回 409

### 3.3 处理函数逻辑

- [ ] 路由：`router.post('/generate', authMiddleware, async (req, res, next) => { ... })`
- [ ] **注意**：由于 `/:id` 路由会匹配 `/generate`，必须把 `POST /generate` 放在 `GET /:id` **之前**

#### 3.3.1 校验

- [ ] 调用 `validateArticleGenerate(req.body)`
- [ ] 校验失败 → `throw new AppError(422, 'VALIDATION_ERROR', msg)`

#### 3.3.2 不传 category — 返回推荐分类

- [ ] 构造分类列表：
```js
const categories = [
  { label: '饮食指导', recommended: false, reason: '' },
  { label: '运动指南', recommended: false, reason: '' },
  { label: '生活习惯', recommended: false, reason: '' },
  { label: '糖尿病知识科普', recommended: false, reason: '' }
];
```
- [ ] 尝试从 `user_risk_info` 获取最新 BMI：
```sql
SELECT weight / ((height / 100.0) * (height / 100.0)) AS bmi
FROM user_risk_info WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
```
- [ ] 若 BMI > 24：推荐"饮食指导"（`recommended: true, reason: '基于您的BMI，饮食管理是血糖控制的关键'`）
- [ ] 若 BMI > 28：额外推荐"运动指南"
- [ ] 返回 `{ success: true, data: { stage: 'category_selection', categories } }`

#### 3.3.3 传入 category — 生成文章

- [ ] 构造 inputs：`{ category: req.body.category }`
- [ ] 调用 `callWorkflowBlocking(process.env.DIFY_ARTICLE_WORKFLOW_KEY, inputs)`
- [ ] **Mock 降级策略**（与 Dify 不可用区分）：
  - Dify 不可用时 `difyService` 返回 Mock 数据，在 articles.js 层检测是否为 Mock 并构建文章数据

- [ ] 解析 Dify 响应获取：`title`, `content`, `tags`, `summary`, `cover`（可选）
- [ ] 若响应无法解析 → 使用硬编码 Mock 文章：
```js
{
  title: `${category}——糖尿病管理指南`,
  content: `# ${category}\n\n这是关于"${category}"的AI生成文章（Mock模式）。\n\n> 以上内容由AI自动生成，仅供参考。`,
  tags: [category],
  summary: `本文围绕"${category}"展开介绍。`,
  cover: null
}
```

- [ ] `INSERT INTO articles (user_id, title, cover, author, content, category, tags, summary) VALUES (?, ?, ?, 'AI健康助手', ?, ?, ?, ?)`
- [ ] tags 用 `serializeTags()` 转换
- [ ] 获取 `lastInsertRowid`
- [ ] 返回：
```json
{
  "success": true,
  "data": {
    "id": <lastInsertRowid>,
    "title": "...",
    "cover": null,
    "author": "AI健康助手",
    "content": "...",
    "category": "...",
    "tags": [...],
    "summary": "...",
    "is_collected": false,
    "created_at": "<当前时间>"
  }
}
```

### 3.4 路由顺序确保

- [ ] 确认 `POST /generate` 路由在 `GET /:id` 之前声明，防止路径参数匹配

### 验证

- [ ] `POST /api/articles/generate` (body: `{}`) → 返回推荐分类 + `stage: "category_selection"`
- [ ] `POST /api/articles/generate` (body: `{"category": "饮食指导"}`) → 返回文章详情，DB 写入成功
- [ ] 查看 DB：`SELECT * FROM articles WHERE user_id IS NOT NULL` → 有新记录
- [ ] `GET /api/articles` → 不含上述记录（公共列表 `user_id IS NULL` 过滤生效）

---

## Task 4: 创建 upload.js — POST /api/upload/avatar

**文件**：`server/routes/upload.js`（**新建**）

### 4.1 依赖

- [ ] `npm ls multer` 或 `npm install multer` 确保 multer 已安装

### 4.2 文件结构

```js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/auth');
const { success, AppError } = require('../utils/response');
const { error: sendError } = require('../utils/response');

const router = express.Router();

// 确保上传目录存在
const uploadDir = path.join(__dirname, '..', '..', 'static', 'uploads', 'avatars');
fs.mkdirSync(uploadDir, { recursive: true });

// multer 配置
const storage = multer.diskStorage({ ... });
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: ... });

router.post('/avatar', authMiddleware, (req, res) => {
  upload.single('avatar')(req, res, (err) => { ... });
});

module.exports = router;
```

### 4.3 详细实现

#### 4.3.1 multer storage

- [ ] `destination`: `uploadDir`
- [ ] `filename`: `user_${req.user.id}_${Date.now()}${path.extname(file.originalname)}`

#### 4.3.2 multer fileFilter

- [ ] 仅允许 `image/jpeg`, `image/png`, `image/webp`
- [ ] 不通过时 `cb(new AppError(415, 'UNSUPPORTED_FILE_TYPE', '仅支持 JPEG/PNG/WebP 格式'))`

#### 4.3.3 错误处理

- [ ] `err instanceof multer.MulterError` 且 `err.code === 'LIMIT_FILE_SIZE'` → `sendError(res, 'FILE_TOO_LARGE', '文件大小不能超过 2MB', 413)`
- [ ] `err instanceof AppError` → `sendError(res, err.code, err.message, err.statusCode)`
- [ ] 其他 multer 错误 → `sendError(res, 'BAD_REQUEST', err.message, 400)`

#### 4.3.4 无文件处理

- [ ] `!req.file` → `sendError(res, 'VALIDATION_ERROR', '请选择要上传的头像文件', 422)`

#### 4.3.5 成功响应

- [ ] URL 计算：`/static/uploads/avatars/${req.file.filename}`
- [ ] 返回 `{ success: true, data: { url: "...", filename: "..." } }`

### 验证

- [ ] 上传 JPEG < 2MB → 200，返回 url，磁盘有文件
- [ ] 上传 PDF → 415
- [ ] 上传 > 2MB 图片 → 413
- [ ] 不传文件 → 422
- [ ] 不带 token → 401

---

## Task 5: 创建 admin.js — GET /api/admin/logs

**文件**：`server/routes/admin.js`（**新建**）

### 5.1 路由定义

- [ ] 引入依赖：`express`, `authMiddleware`, `adminMiddleware`, `{ db }`, `{ success, AppError }`, `{ parsePagination, buildPagination }`
- [ ] 路由：`router.get('/logs', authMiddleware, adminMiddleware, (req, res) => { ... })`

### 5.2 查询逻辑

- [ ] 总计数：
```sql
SELECT COUNT(*) AS total FROM admin_logs
```
- [ ] 分页查询：
```sql
SELECT al.id, al.operator_id, u.username AS operator_username,
       al.operation_type, al.operation_content, al.operation_result, al.operation_time
FROM admin_logs al
JOIN users u ON al.operator_id = u.id
ORDER BY al.operation_time DESC
LIMIT ? OFFSET ?
```
- [ ] 使用 `parsePagination(req.query)` 获取 `{ limit, offset, page, pageSize }`
- [ ] 使用 `buildPagination(page, pageSize, total)` 构建分页信息

### 5.3 响应

- [ ] `success(res, rows, '查询成功', 200)` 附加 pagination 对象

### 验证

- [ ] `GET /api/admin/logs` (不带 token) → 401
- [ ] `GET /api/admin/logs` (普通用户 token) → 403
- [ ] `GET /api/admin/logs` (admin token) → 200，分页日志含 `operator_username`
- [ ] 先执行 `POST /api/admin/execute` 后再次查询 → 日志可见新记录

---

## Task 6: 创建 admin.js — POST /api/admin/execute

**文件**：`server/routes/admin.js`（在同一文件中追加）

### 6.1 路由定义

- [ ] 路由：`router.post('/execute', authMiddleware, adminMiddleware, (req, res) => { ... })`

### 6.2 安全校验

- [ ] 校验 `req.body.sql` 必须为 string 且非空 → 否则 422

#### 6.2.1 SELECT 检查

- [ ] `const trimmed = req.body.sql.trim().toUpperCase();`
- [ ] `if (!trimmed.startsWith('SELECT'))` → 403 `FORBIDDEN` `仅允许执行 SELECT 查询`

#### 6.2.2 禁止关键词检查

```js
const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'REPLACE', 'EXEC', 'EXECUTE', 'ATTACH', 'DETACH'];
```
- [ ] 遍历 forbidden，若 `trimmed.includes(keyword)` → 403 `FORBIDDEN` `SQL 包含禁止操作: ${keyword}`

### 6.3 SQL 执行

- [ ] 用 try/catch 包裹 `db.prepare(req.body.sql).all()`
- [ ] SQL 语法错误 → 500 `INTERNAL_ERROR` `SQL 执行失败: ${err.message}`

### 6.4 日志记录

- [ ] 写入 admin_logs：
```sql
INSERT INTO admin_logs (operator_id, operation_type, operation_content, operation_result)
VALUES (?, 'SELECT', ?, '成功, 影响' || ? || '行')
```
- [ ] `operation_content` 为完整 SQL 语句
- [ ] 日志写入失败不应阻塞响应（`try/catch` 包裹，`console.error` 输出）

### 6.5 响应

```json
{
  "success": true,
  "data": {
    "rows": [...],
    "rowCount": <N>,
    "operation_type": "SELECT"
  }
}
```

### 验证

- [ ] `POST /api/admin/execute` (body: `{"sql": "SELECT 1"}`) → 200，返回 rows
- [ ] `POST /api/admin/execute` (body: `{"sql": "INSERT INTO users VALUES (1,'test','x','user',0,datetime(),datetime())"}`) → 403
- [ ] `POST /api/admin/execute` (body: `{"sql": "DROP TABLE users"}`) → 403
- [ ] `POST /api/admin/execute` (body: `{"sql": "SELECT * FROM users"}`) → 200，返回用户列表
- [ ] admin_logs 表可见新记录

---

## Task 7: 挂载新路由

**文件**：`server/routes/index.js`

### 7.1 新增挂载

- [ ] 在 `router.use('/assistant', ...)` 之后、404 兜底之前：
```js
router.use('/admin', require('./admin'));
router.use('/upload', require('./upload'));
```

**注意**：`/admin` 和 `/upload` 需要对应的路由文件已存在。

### 验证

- [ ] 启动服务器不报错
- [ ] `GET /api/health` 正常
- [ ] `GET /api/admin/logs` 可达（返回 401 也算"可达"）

---

## Task 8: 最终验收

### 8.1 全端点可达性

按顺序用 curl/Postman 验证：

- [ ] 1. `POST /api/auth/register` — 注册成功 → 201
- [ ] 2. `POST /api/auth/login` — 登录成功 → 200
- [ ] 3. `GET /api/user/profile` — 获取个人信息 → 200
- [ ] 4. `GET /api/doctors` — 医生列表分页 → 200
- [ ] 5. `GET /api/diabetes-types` — 糖尿病类型列表 → 200
- [ ] 6. `GET /api/articles` — 文章列表分页 → 200
- [ ] 7. `GET /api/articles/:id` — 文章详情 → 200
- [ ] 8. `POST /api/risk/predict` — 风险预测 → 200
- [ ] 9. `GET /api/risk/history` — 历史预测 → 200
- [ ] 10. `POST /api/plan/generate` — 方案生成 → 200
- [ ] 11. `GET /api/plan/current` — 当前方案 → 200
- [ ] 12. `POST /api/punch` — 打卡 → 201
- [ ] 13. `GET /api/punch/list` — 打卡列表 → 200
- [ ] 14. `GET /api/punch/analysis` — 打卡分析 → 200
- [ ] 15. `POST /api/chat/doctor/:id` — SSE 对话 → 200 (SSE)
- [ ] 16. `POST /api/assistant/chat` — AI 助手 SSE → 200 (SSE)
- [ ] 17. `POST /api/articles/generate` — **新增** 文章生成 → 200
- [ ] 18. `POST /api/upload/avatar` — **新增** 头像上传 → 200
- [ ] 19. `GET /api/admin/logs` — **新增** 管理日志 → 200

### 8.2 新增功能专项验证

- [ ] articles/generate 不传 category → 返回 `stage: "category_selection"`
- [ ] articles/generate 传 category → 返回文章详情 + DB 有 `user_id` 记录
- [ ] 公共文章列表不含用户生成文章
- [ ] upload/avatar 上传非图片 → 415
- [ ] upload/avatar 上传 > 2MB → 413（或 multer 自动拒绝）
- [ ] admin/logs（非 admin） → 403
- [ ] admin/logs（admin） → 200，含 operator_username
- [ ] admin/execute SELECT → 200，记录 admin_logs
- [ ] admin/execute INSERT → 403

### 8.3 错误格式统一验证

- [ ] 所有错误返回 `{ error: { code: "...", message: "..." } }`
- [ ] 覆盖错误码：400, 401, 403, 404, 409, 413, 415, 422, 500, 502, 504

### 8.4 DIFY_API_BASE 修正验证

- [ ] `grep -rn "DIFY_API_BASE_URL" server/` 返回空
- [ ] 若配置了真实 `DIFY_API_BASE` + `DIFY_ARTICLE_WORKFLOW_KEY`，articles/generate 应返回真实 AI 文章（非 Mock）

---

## 9. 完成标准

- [ ] 所有 19 个端点均可访问
- [ ] 新增 4 个端点（articles generate, upload avatar, admin logs, admin execute）功能正常
- [ ] DIFY_API_BASE 变量名已修正
- [ ] 错误响应格式统一
- [ ] 分页格式统一
- [ ] 公共文章列表不含用户生成文章
