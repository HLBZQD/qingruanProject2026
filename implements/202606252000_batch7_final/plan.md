# 批次 7 实现计划

## 1. 现状分析

### 1.1 已有基础（前 6 批次成果）

| 模块 | 状态 | 说明 |
|------|------|------|
| `server/db/database.js` + `init.sql` + `seed.sql` | 已有 | SQLite 初始化，含 `admin_logs` 表（`operator_id`, `operation_type`, `operation_time`, `operation_content`, `operation_result`） |
| `server/app.js` | 已有 | Express 应用，`cors`, `express.json()`, `/static` 静态服务，`errorHandler` 全局兜底 |
| `server/routes/index.js` | 已有 | 挂载 auth/user/doctors/articles/diabetes/risk/plan/punch/chat/assistant，未挂载 admin 和 upload |
| `server/routes/articles.js` | 已有 | GET `/`（公共列表，`WHERE user_id IS NULL`）、GET `/:id`、POST `/:id/collect`、DELETE `/:id/collect`、GET `/collections`。**缺少** `POST /generate` |
| `server/routes/admin.js` | **不存在** | 需新建 |
| `server/routes/upload.js` | **不存在** | 需新建 |
| `server/middleware/auth.js` | 已有 | JWT 认证中间件 |
| `server/middleware/admin.js` | 已有 | 管理员角色校验，返回 `{ error: { code, message } }` |
| `server/middleware/errorHandler.js` | 已有 | `AppError` 类 + 全局错误处理，格式 `{ error: { code, message } }` |
| `server/utils/pagination.js` | 已有 | `parsePagination(page=1, pageSize=20, max=100)`, `buildPagination`（含 `totalPages = Math.ceil(total/pageSize)`） |
| `server/utils/response.js` | 已有 | `success()`, `error()`, 重新导出 `AppError` |
| `server/utils/validators.js` | 已有 | register/login/profile/risk/plan/punch 校验器。**缺少** articles generate 校验器 |
| `server/utils/jsonFields.js` | 已有 | `parseTags()` / `serializeTags()` |
| `server/services/difyService.js` | 已有 | `callWorkflowBlocking()`，Mock 兜底。**BUG**: 第 85 行用 `DIFY_API_BASE_URL`（应为 `DIFY_API_BASE`） |
| `server/services/sseProxy.js` | 已有 | `proxyDifySSE()`。**BUG**: 第 10 行用 `DIFY_API_BASE_URL`（应为 `DIFY_API_BASE`） |
| `server/middleware/optionalAuth.js` | 已有 | 可选认证中间件 |
| `.env` / `.env.example` | 已有 | 环境变量名 `DIFY_API_BASE`（正确） |

### 1.2 关键发现——DIFY_API_BASE 变量名不一致

- `.env` 定义 `DIFY_API_BASE=http://182.92.74.224/v1`
- `difyService.js:85` 读取 `process.env.DIFY_API_BASE_URL` — **错误**，会导致真实 Dify 服务永远不可用，所有 AI 接口落在 Mock 模式
- `sseProxy.js:10` 读取 `process.env.DIFY_API_BASE_URL` — **错误**，同上

### 1.3 已有分页与错误处理

`pagination.js` 和 `errorHandler.js` 已满足 7.3.5（统一错误格式 `{ error: { code, message } }`）和 7.3.6（统一分页 `page=1, pageSize=20, max=100, totalPages=Math.ceil`）要求。本批次无需修改这两个模块，只需在新建路由中正确使用它们。

### 1.4 公共文章列表隔离机制

`articles.js:24` 已有 `WHERE user_id IS NULL` 过滤，生成文章绑定 `user_id` 后天然隔离，无需额外改动。

---

## 2. 依赖关系图

```
DIFY_API_BASE 修正 (P0, 影响所有 AI 接口)
 │
 ├─► POST /api/articles/generate (difyService.js Mock/真实调用)
 │
 ├─► POST /api/upload/avatar (独立，无依赖)
 │
 ├─► GET /api/admin/logs (依赖 admin 中间件 + pagination)
 │
 ├─► POST /api/admin/execute (依赖 admin 中间件 + admin_logs 表)
 │
 └─► routes/index.js 挂载新路由 (依赖 admin.js, upload.js 创建完毕)
         │
         └─► 最终 19 端点验收
```

**执行顺序**：DIFY_API_BASE 修正 (5 min) → articles 扩展 (15 min) → upload 路由 (10 min) → admin 路由 (20 min) → index.js 挂载 (2 min) → 验收 (20 min)

---

## 3. 实现步骤

### Step 1: 修正 DIFY_API_BASE 变量名

**影响文件**：`server/services/difyService.js`, `server/services/sseProxy.js`

| 文件 | 行号 | 修改 |
|------|------|------|
| `difyService.js` | 85 | `process.env.DIFY_API_BASE_URL` → `process.env.DIFY_API_BASE` |
| `sseProxy.js` | 10 | `process.env.DIFY_API_BASE_URL` → `process.env.DIFY_API_BASE` |

**风险**：无。`.env` 已使用 `DIFY_API_BASE`，修正后 Dify 服务可正常连接。

### Step 2: 扩展 validators.js — articles generate 校验

**文件**：`server/utils/validators.js`

新增 `validateArticleGenerate(body)`:
- 允许空 body（返回推荐分类场景）
- 若传 `category`，校验为 string 类型且非空

### Step 3: 扩展 articles.js — POST /api/articles/generate

**文件**：`server/routes/articles.js`

**认证**：`authMiddleware`（需登录）

**两阶段逻辑**：
1. **不传 `category`** → 返回推荐分类列表：
   - 从 `user_risk_info` 获取用户最新 BMI（可选，取不到则用默认）
   - 返回固定分类集：饮食指导 / 运动指南 / 生活习惯 / 糖尿病知识科普
   - 基于 BMI 推荐：BMI > 24 推荐"饮食指导"，BMI > 28 额外加"运动指南"

2. **传入 `category`** → 调用 Dify 文章生成工作流：
   - 调用 `callWorkflowBlocking(DIFY_ARTICLE_WORKFLOW_KEY, inputs)`
   - Dify 未配置时走 Mock（difyService Mock 模式返回 `MOCK_PLAN_DATA`，需在 articles.js 层做 Mock 降级）
   - 生成成功后 `INSERT INTO articles (user_id, title, cover, author, content, category, tags, summary) VALUES (...)`
   - 返回文章详情结构（含 `id`, `is_collected: false` 等）

**幂等性保护**：同一 `user_id` 30 秒内不可重复生成（内存 Map 去重）

**关键 SQL**：
```sql
INSERT INTO articles (user_id, title, cover, author, content, category, tags, summary)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
```

**Mock 数据**：当 `DIFY_ARTICLE_WORKFLOW_KEY` 为空或 Dify 不可用时，返回预置 Mock 文章并写入 DB。

### Step 4: 创建 upload.js — POST /api/upload/avatar

**文件**：`server/routes/upload.js`（新建）

**认证**：`authMiddleware`

**技术栈**：`multer`（需在 `app.js` 或路由内使用）

**配置**：
```js
const upload = multer({
  storage: diskStorage({
    destination: path.join(__dirname, '..', '..', 'static', 'uploads', 'avatars'),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `user_${req.user.id}_${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new AppError(415, 'UNSUPPORTED_FILE_TYPE', '仅支持 JPEG/PNG/WebP 格式'));
  }
});
```

**错误处理**：
- multer 文件过大 → `MulterError('LIMIT_FILE_SIZE')` → 返回 413 `FILE_TOO_LARGE`
- 文件类型不符 → `AppError(415, ...)` → 返回 415 `UNSUPPORTED_FILE_TYPE`
- 未传文件 → 返回 422 `VALIDATION_ERROR`

**返回**：
```json
{ "success": true, "data": { "url": "/static/uploads/avatars/user_1_xxx.jpg", "filename": "user_1_xxx.jpg" } }
```

**确保目录存在**：启动时用 `fs.mkdirSync` 递归创建 `/static/uploads/avatars/`

### Step 5: 创建 admin.js — GET /api/admin/logs

**文件**：`server/routes/admin.js`（新建）

**认证链**：`authMiddleware` + `adminMiddleware`

**SQL**：
```sql
SELECT al.id, al.operator_id, u.username AS operator_username,
       al.operation_type, al.operation_content, al.operation_result, al.operation_time
FROM admin_logs al
JOIN users u ON al.operator_id = u.id
ORDER BY al.operation_time DESC
LIMIT ? OFFSET ?
```
```sql
SELECT COUNT(*) AS total FROM admin_logs
```

**分页**：使用 `parsePagination` / `buildPagination`

### Step 6: 创建 admin.js — POST /api/admin/execute (基础版)

**文件**：`server/routes/admin.js`（在同一文件中追加）

**认证链**：`authMiddleware` + `adminMiddleware`

**安全规则**：
1. 仅允许 `SELECT` 语句（大小写不敏感）
2. 禁止 `INSERT` / `UPDATE` / `DELETE` / `DROP` / `ALTER` / `CREATE` / `TRUNCATE`
3. SQL 必须以 `SELECT` 开头（去除前导空白后）

**校验逻辑**：
```js
const trimmed = req.body.sql.trim().toUpperCase();
const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE'];
if (!trimmed.startsWith('SELECT')) return error(403);
for (const keyword of forbidden) {
  if (trimmed.includes(keyword)) return error(403);
}
```

**执行**：
```js
const rows = db.prepare(req.body.sql).all();
```

**记录日志**：
```sql
INSERT INTO admin_logs (operator_id, operation_type, operation_content, operation_result)
VALUES (?, 'SELECT', ?, '成功, 影响' || ? || '行')
```

**返回**：
```json
{ "success": true, "data": { "rows": [...], "rowCount": N, "operation_type": "SELECT" } }
```

### Step 7: 挂载新路由到 index.js

**文件**：`server/routes/index.js`

新增两行：
```js
router.use('/admin', require('./admin'));
router.use('/upload', require('./upload'));
```

### Step 8: 最终验收（19 个端点）

按顺序逐端验证：

| # | 端点 | 验证要点 |
|---|------|---------|
| 1 | POST /api/auth/register | 注册成功返回 JWT |
| 2 | POST /api/auth/login | 登录成功返回 token+role+user |
| 3 | GET /api/user/profile | 获取当前用户信息 |
| 4 | GET /api/doctors | 医生列表分页 |
| 5 | GET /api/diabetes-types | 糖尿病类型列表 |
| 6 | GET /api/articles | 公共文章列表（不含用户生成） |
| 7 | GET /api/articles/:id | 文章详情 + is_collected |
| 8 | POST /api/risk/predict | 风险预测 + 落库 |
| 9 | GET /api/risk/history | 预测历史分页 |
| 10 | POST /api/plan/generate | 方案生成 |
| 11 | GET /api/plan/current | 当前活跃方案 |
| 12 | POST /api/punch | 打卡记录 |
| 13 | GET /api/punch/list | 打卡列表分页 |
| 14 | GET /api/punch/analysis | 打卡分析 |
| 15 | POST /api/chat/doctor/:id | SSE 对话 |
| 16 | POST /api/assistant/chat | AI 助手 SSE 对话 |
| 17 | **POST /api/articles/generate** | **本批次新增——生成私有文章** |
| 18 | **POST /api/upload/avatar** | **本批次新增——头像上传** |
| 19 | **GET /api/admin/logs** | **本批次新增——管理日志** |

**新增验收细项**：
- POST /api/articles/generate 不传 category → 返回 `stage: "category_selection"` + 分类列表
- POST /api/articles/generate 传 category → 返回文章详情，DB 中 `user_id` 非空
- GET /api/articles 不包含 user_id 非空的记录
- POST /api/upload/avatar 上传 JPEG → 返回 URL
- POST /api/upload/avatar 上传非图片 → 415
- POST /api/upload/avatar 上传 >2MB → 413
- GET /api/admin/logs（非 admin）→ 403
- GET /api/admin/logs（admin）→ 分页日志，含 operator_username
- POST /api/admin/execute INSERT → 403
- POST /api/admin/execute SELECT → 返回 rows，记录 admin_logs

---

## 4. 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `server/services/difyService.js:85` | `DIFY_API_BASE_URL` → `DIFY_API_BASE` |
| 修改 | `server/services/sseProxy.js:10` | `DIFY_API_BASE_URL` → `DIFY_API_BASE` |
| 修改 | `server/utils/validators.js` | 新增 `validateArticleGenerate` |
| 修改 | `server/routes/articles.js` | 新增 `POST /generate` 路由 |
| 新建 | `server/routes/upload.js` | `POST /upload/avatar` 路由 |
| 新建 | `server/routes/admin.js` | `GET /logs` + `POST /execute` 路由 |
| 修改 | `server/routes/index.js` | 挂载 `/admin`, `/upload` |

---

## 5. 风险与应对

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| Dify 服务未配置/不可用 | 中 | articles/generate 无真实 AI 内容 | 在 articles.js 层做 Mock 降级（独立于 difyService Mock），保证可走通流程 |
| multer 目录不存在 | 低 | 上传失败 | 在 upload.js 启动时 `fs.mkdirSync(recursive: true)` |
| SQLite admin_logs 表已有数据 | 无 | 无影响 | admin_logs 已在 init.sql 定义，seed 无此表数据 |
| `better-sqlite3` 执行动态 SQL 的 prepared statement 不支持多语句 | 低 | execute 端点可能抛异常 | 仅执行单条 SELECT，用 `db.prepare(sql).all()` |

---

## 6. 结论

本计划覆盖需求文档全部 6 个模块（articles 生成扩展、upload 路由、admin logs、admin execute、DIFY_API_BASE 修正、最终验收），依赖关系清晰，风险可控，**APPROVED**。
